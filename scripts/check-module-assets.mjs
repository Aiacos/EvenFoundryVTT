#!/usr/bin/env node
/**
 * Asserts every runtime path referenced by a Foundry module.json (esmodules, styles,
 * language files) exists under the given directory. Used by the release workflow on
 * the assembled release tree so a forgotten asset folder fails the release instead of
 * shipping a silently broken module (P9 — one gate per escaped bug class).
 *
 * Usage: node scripts/check-module-assets.mjs <module-dir>
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: check-module-assets.mjs <module-dir>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8'));
const refs = [
  ...(manifest.esmodules ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map((l) => l.path),
];
const missing = refs.filter((p) => !existsSync(join(dir, p)));
if (missing.length > 0) {
  console.error(`::error::module.json references missing files: ${missing.join(', ')}`);
  process.exit(1);
}
// biome-ignore lint/suspicious/noConsole: intentional CI script output
console.log(`module.json references OK (${refs.length})`);
