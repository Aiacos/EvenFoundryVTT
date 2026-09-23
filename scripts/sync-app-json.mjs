#!/usr/bin/env node
/**
 * Keeps `packages/g2-app/app.json` `version` in lockstep with the g2-app package version
 * (Even Hub packaging rule, remote 1fb33ce: a local `.ehpk` whose manifest version differs
 * from the package is rejected). Runs right after `changeset version` (root script
 * `version-packages`, used by release.yml), so the Version Packages PR bumps both.
 *
 *   node scripts/sync-app-json.mjs          # write
 *   node scripts/sync-app-json.mjs --check  # exit 1 when out of sync
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = join(root, 'packages/g2-app/app.json');
const pkg = JSON.parse(readFileSync(join(root, 'packages/g2-app/package.json'), 'utf8'));
const raw = readFileSync(appPath, 'utf8');
const app = JSON.parse(raw);

if (app.version === pkg.version) {
  // biome-ignore lint/suspicious/noConsole: intentional CI script output
  console.log(`app.json version ${app.version} = package version`);
} else if (process.argv.includes('--check')) {
  console.error(`app.json version ${app.version} ≠ g2-app package version ${pkg.version}`);
  process.exit(1);
} else {
  writeFileSync(appPath, raw.replace(/("version":\s*")[^"]*(")/, `$1${pkg.version}$2`));
  // biome-ignore lint/suspicious/noConsole: intentional CI script output
  console.log(`app.json version ${app.version} → ${pkg.version}`);
}
