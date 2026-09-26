#!/usr/bin/env node
/**
 * CI gate for CLAUDE.md P12 / constitution XII: the living tracking files stay simple.
 *
 * For TODO.md, SECURITY.md and CHANGELOG.md (repo root):
 * - the file exists;
 * - every `##` heading starts with an icon of the P11 map (read from CLAUDE.md);
 * - in TODO.md and CHANGELOG.md every list item is a checkbox (`- [ ]` / `- [x]`);
 * - every checkbox item carries a reference: a Markdown link, a code path in backticks, or an
 *   ADR / `§` / `#NN` / `Tnnn` mention (on the item line or its indented continuation).
 *
 * Usage: node scripts/check-tracking-files.mjs [repo root]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? '.';
const FILES = ['TODO.md', 'SECURITY.md', 'CHANGELOG.md'];
const CHECKBOX_ONLY = new Set(['TODO.md', 'CHANGELOG.md']);
const REFERENCE = /\]\(|`[^`]*[/.][^`]*`|ADR-\d{4}|§\s?\d|#\d+|\bT\d{3}\b/;

let failures = 0;
const fail = (file, line, message) => {
  console.error(`::error file=${file},line=${line}::${message}`);
  failures++;
};

// Icons of the canonical map: the second and fourth cells of each row of the P11 table.
const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const table = claude.slice(claude.indexOf('### P11'), claude.indexOf('### P12'));
const icons = new Set();
for (const row of table.split('\n').filter((l) => l.startsWith('|'))) {
  const cells = row.split('|').map((c) => c.trim());
  for (const cell of [cells[2], cells[4]]) if (cell && !/^[-\w\s/()]*$/.test(cell)) icons.add(cell);
}

for (const file of FILES) {
  const path = join(root, file);
  if (!existsSync(path)) {
    fail(file, 1, `${file} is missing (CLAUDE.md P12)`);
    continue;
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((text, i) => {
    const n = i + 1;
    if (text.startsWith('## ')) {
      const heading = text.slice(3);
      if (![...icons].some((icon) => heading.startsWith(icon))) {
        fail(file, n, `heading "${heading}" must start with a P11 icon`);
      }
      return;
    }
    const item = /^- (.*)$/.exec(text);
    if (item === null) return;
    const checkbox = /^\[( |x)\] /.test(item[1]);
    if (CHECKBOX_ONLY.has(file) && !checkbox) fail(file, n, 'list items must be checkboxes');
    if (!checkbox) return;
    let block = text;
    for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) block += lines[j];
    if (!REFERENCE.test(block))
      fail(file, n, 'checkbox item needs a reference (link, path, ADR, §, #PR, Tnnn)');
  });
}

if (failures > 0) process.exit(1);
console.log(`tracking files OK (${FILES.join(', ')})`);
