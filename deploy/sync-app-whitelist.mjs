#!/usr/bin/env node
/**
 * Fill `packages/g2-app/app.json` → permissions[0].whitelist from `deploy/.env`.
 *
 * Closes the manual half of DIST-EHUB-01: the Even Hub WebView enforces the network
 * whitelist at runtime, and it must list the origin-complete (no-wildcard) HTTPS origins
 * of your deployed bridge + plugin host. This script derives them from EVF_BRIDGE_HOST +
 * EVF_PLUGIN_HOST in deploy/.env so the manifest matches your Caddy deployment.
 *
 * Usage:
 *   node deploy/sync-app-whitelist.mjs            # uses deploy/.env
 *   EVF_BRIDGE_HOST=... EVF_PLUGIN_HOST=... node deploy/sync-app-whitelist.mjs   # or env
 *
 * Then repackage:  pnpm --filter @evf/g2-app pack:ehpk
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const envPath = join(here, '.env');
const appJsonPath = join(repoRoot, 'packages', 'g2-app', 'app.json');

/** Minimal .env parser (KEY=VALUE lines; ignores comments/blank). */
function readEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv(envPath), ...process.env };
const bridgeHost = env.EVF_BRIDGE_HOST;
const pluginHost = env.EVF_PLUGIN_HOST;

if (!bridgeHost || !pluginHost || /example\.com$/.test(bridgeHost) || /example\.com$/.test(pluginHost)) {
  console.error(
    'EVF_BRIDGE_HOST / EVF_PLUGIN_HOST missing or still the example placeholder.\n' +
      'Set them to your real hostnames in deploy/.env (e.g. evf-bridge.yourdomain.net) and re-run.',
  );
  process.exit(1);
}

const whitelist = [`https://${bridgeHost}`, `https://${pluginHost}`];
const app = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const net = app.permissions?.find((p) => p.name === 'network');
if (!net) {
  console.error('app.json has no "network" permission entry to update.');
  process.exit(1);
}
net.whitelist = whitelist;
writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);
console.log('app.json whitelist set to:\n  ' + whitelist.join('\n  '));
