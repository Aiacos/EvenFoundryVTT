#!/usr/bin/env node
/**
 * Validates links inside a GitHub-wiki source folder (docs/wiki/):
 *   - wiki-style page links `[text](Page-Name)` / `[text](Page-Name#anchor)` must match
 *     an existing `Page-Name.md` in the folder;
 *   - relative repo links (`../...`) and images must resolve on disk;
 *   - every page except the special ones (_Sidebar, _Footer) must be reachable from
 *     Home or _Sidebar (no orphan pages).
 * External links (http/https/mailto) are not fetched.
 *
 * Usage: node scripts/check-wiki-links.mjs <wiki-dir>
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error('usage: check-wiki-links.mjs <wiki-dir>');
  process.exit(2);
}

const pages = readdirSync(dir).filter((f) => f.endsWith('.md'));
const names = new Set(pages.map((f) => f.slice(0, -3)));
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const errors = [];
const linkedFrom = new Map(); // page -> set of pages it links to

for (const file of pages) {
  const page = file.slice(0, -3);
  const text = readFileSync(join(dir, file), 'utf8');
  const targets = new Set();
  for (const [, raw] of text.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const target = raw.split('#')[0];
    if (target === '') continue;
    if (target.startsWith('../') || target.startsWith('./') || target.includes('/')) {
      const onDisk = resolve(dirname(join(dir, file)), target);
      if (!existsSync(onDisk)) errors.push(`${file}: missing file ${raw}`);
      continue;
    }
    if (!names.has(target)) errors.push(`${file}: unknown wiki page ${raw}`);
    else targets.add(target);
  }
  linkedFrom.set(page, targets);
}

// Reachability from Home + _Sidebar.
const seen = new Set();
const queue = ['Home', '_Sidebar'].filter((p) => names.has(p));
if (!names.has('Home')) errors.push('Home.md is missing');
while (queue.length > 0) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  seen.add(p);
  for (const t of linkedFrom.get(p) ?? []) queue.push(t);
}
for (const p of names) {
  if (!p.startsWith('_') && !seen.has(p))
    errors.push(`${p}.md is not reachable from Home/_Sidebar`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
// biome-ignore lint/suspicious/noConsole: intentional CI script output
console.log(`wiki links OK (${pages.length} pages)`);
