#!/usr/bin/env node
/**
 * Asserts every runtime path referenced by a Foundry module.json (esmodules, styles,
 * language files) exists under the given directory — and every chunk the esmodules import
 * relatively (tsup code-splits `dist/`: the lazy crypto fallback and a shared runtime
 * chunk), recursively. Used by the release workflow on the assembled release tree so a
 * forgotten asset folder or chunk fails the release instead of shipping a silently broken
 * module (P9 — one gate per escaped bug class).
 *
 * Usage: node scripts/check-module-assets.mjs <module-dir>
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

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
/** Relative static / dynamic imports of an ES module (`from"./x.js"`, `import("./x.js")`). */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;
const seen = new Set();
const pending = (manifest.esmodules ?? []).map((p) => join(dir, p));
while (pending.length > 0) {
  const file = pending.pop();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    const target = join(dirname(file), m[1]);
    refs.push(relative(dir, target));
    pending.push(target);
  }
}
const missing = [...new Set(refs)].filter((p) => !existsSync(join(dir, p)));
if (missing.length > 0) {
  console.error(`::error::module.json references missing files: ${missing.join(', ')}`);
  process.exit(1);
}
// biome-ignore lint/suspicious/noConsole: intentional CI script output
console.log(`module.json references OK (${refs.length})`);
