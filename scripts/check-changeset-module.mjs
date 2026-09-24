#!/usr/bin/env node
/**
 * Release-coverage gate for pending changesets.
 *
 * Releases are tagged from `@evf/foundry-module`'s version (scripts/release-tag.mjs), and
 * the module zip ships the packages below (the g2 app is built into `g2/`, the shared
 * packages are bundled into both). A changeset that bumps one of them WITHOUT bumping
 * `@evf/foundry-module` would never produce a new Foundry / The Forge release, so the
 * change would silently never reach users. This check fails in that case.
 *
 * Usage: node scripts/check-changeset-module.mjs [.changeset dir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULE = '@evf/foundry-module';
const SHIPPED_IN_MODULE = ['@evf/g2-app', '@evf/shared-protocol', '@evf/shared-render'];

const dir = process.argv[2] ?? '.changeset';
const bumped = new Set();
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.md') || file === 'README.md') continue;
  const text = readFileSync(join(dir, file), 'utf8');
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  for (const [, name] of front.matchAll(/^["']?(@[^"':\s]+)["']?\s*:/gm)) bumped.add(name);
}

const shipped = SHIPPED_IN_MODULE.filter((p) => bumped.has(p));
if (shipped.length > 0 && !bumped.has(MODULE)) {
  console.error(
    `::error::Pending changesets bump ${shipped.join(', ')} but not ${MODULE}. ` +
      `These packages ship inside the Foundry module zip and releases are tagged from ` +
      `${MODULE}'s version — add "${MODULE}": patch (or higher) to a changeset.`,
  );
  process.exit(1);
}
// biome-ignore lint/suspicious/noConsole: intentional CI script output
console.log(
  shipped.length > 0
    ? `changesets OK: ${shipped.join(', ')} ship with a ${MODULE} bump`
    : 'changesets OK: no module-shipped package bumped without the module',
);
