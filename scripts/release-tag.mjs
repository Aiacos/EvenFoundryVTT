/**
 * release-tag.mjs — Idempotent tag creation + Foundry module release dispatch
 *
 * GITHUB_TOKEN recursive-trigger rationale:
 * ==========================================
 * A tag pushed using the default GITHUB_TOKEN does NOT trigger `on: push: tags`
 * in foundry-module-release.yml. GitHub suppresses workflow runs triggered by
 * the default token to prevent accidental recursive loops. We work around this
 * by explicitly calling `gh workflow run` (workflow_dispatch), which DOES fire
 * with the default token because it is treated as a user-initiated action, not
 * a recursive event. No additional PAT secret is required.
 *
 * Usage: node scripts/release-tag.mjs
 * Called by: pnpm run release:tag (from changesets/action@v1 publish step)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Read the canonical version from foundry-module package.json
const pkgPath = resolve(repoRoot, 'packages/foundry-module/package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

if (!version) {
  console.error('ERROR: Could not read version from packages/foundry-module/package.json');
  process.exit(1);
}

const tag = `v${version}`;
// biome-ignore lint/suspicious/noConsole: intentional release-script progress output
console.log(`Release tag: ${tag}`);

// Configure git bot identity for the tag in CI
execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], {
  stdio: 'inherit',
});
execFileSync(
  'git',
  ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'],
  { stdio: 'inherit' },
);

// Idempotency check: skip if the tag already exists
let tagExists = false;
try {
  execFileSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    stdio: 'pipe',
  });
  tagExists = true;
} catch {
  // non-zero exit means tag does not exist — proceed
}

if (tagExists) {
  // biome-ignore lint/suspicious/noConsole: intentional release-script progress output
  console.log(`Tag ${tag} already exists — skipping tag creation and dispatch.`);
  process.exit(0);
}

// Create and push the tag
// biome-ignore lint/suspicious/noConsole: intentional release-script progress output
console.log(`Creating tag ${tag}...`);
execFileSync('git', ['tag', tag], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });
// biome-ignore lint/suspicious/noConsole: intentional release-script progress output
console.log(`Tag ${tag} pushed.`);

// Dispatch foundry-module-release.yml via workflow_dispatch
// (workflow_dispatch fires with the default token; on:push:tags does not — see header rationale)
// biome-ignore lint/suspicious/noConsole: intentional release-script progress output
console.log(`Dispatching foundry-module-release.yml for ${tag}...`);
execFileSync('gh', ['workflow', 'run', 'foundry-module-release.yml', '-f', `tag=${tag}`], {
  stdio: 'inherit',
});
// biome-ignore lint/suspicious/noConsole: intentional release-script progress output
console.log(`Dispatch complete.`);
