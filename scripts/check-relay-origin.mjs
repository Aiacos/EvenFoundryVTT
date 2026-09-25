#!/usr/bin/env node
/**
 * CI gate (ADR-0019): the glasses app talks only to the relay, and the relay it was built
 * for is the one the Even Hub package may reach.
 *
 * 1. `DEFAULT_RELAY_URL` (packages/shared-protocol/src/direct/relay.ts) is whitelisted in
 *    packages/g2-app/app.json as both `https://<host>` and `wss://<host>` (Even Hub
 *    whitelists are origin-complete, no wildcards — hub.evenrealities.com/docs/build/networking).
 * 2. The `camera` permission is declared (in-app «Scansiona QR»).
 * 3. With `--bundle <dir>`: the built app contains no Foundry login / socket.io code
 *    (research F1: the phone never reaches Foundry).
 *
 * Usage: node scripts/check-relay-origin.mjs [--bundle packages/g2-app/dist]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exitCode = 1;
};

const relaySource = readFileSync('packages/shared-protocol/src/direct/relay.ts', 'utf8');
const match = relaySource.match(/DEFAULT_RELAY_URL = '(wss:\/\/[^']+)'/);
if (match === null) {
  fail('DEFAULT_RELAY_URL not found in packages/shared-protocol/src/direct/relay.ts');
} else {
  const host = new URL(match[1].replace(/^wss:/, 'https:')).host;
  const app = JSON.parse(readFileSync('packages/g2-app/app.json', 'utf8'));
  const permissions = app.permissions ?? [];
  const whitelist = permissions.find((p) => p.name === 'network')?.whitelist ?? [];
  for (const origin of [`https://${host}`, `wss://${host}`]) {
    if (!whitelist.includes(origin)) {
      fail(`packages/g2-app/app.json network whitelist lacks ${origin} (DEFAULT_RELAY_URL)`);
    }
  }
  const extra = whitelist.filter((o) => !o.endsWith(`//${host}`));
  if (extra.length > 0) fail(`unexpected whitelisted origins: ${extra.join(', ')}`);
  if (!permissions.some((p) => p.name === 'camera')) {
    fail('packages/g2-app/app.json must declare the camera permission (QR scan)');
  }
  console.log(`relay origin ${host}: whitelisted (https + wss), camera declared`);
}

const bundleAt = process.argv.indexOf('--bundle');
if (bundleAt !== -1) {
  const dir = process.argv[bundleAt + 1];
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|html)$/.test(name)) files.push(path);
    }
  };
  walk(dir);
  const forbidden = [/socket\.io/, /\/join['"`]/, /engine\.io/];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const re of forbidden) {
      if (re.test(text)) fail(`${file} contains ${re} — the phone must not talk to Foundry`);
    }
  }
  console.log(`bundle ${dir}: ${files.length} files, no Foundry login / socket.io code`);
}
