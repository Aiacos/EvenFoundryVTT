/**
 * Smoke test for Pitfall 8 (RESEARCH.md lines 463-470): validation-harness writer MUST
 * resolve `docs/perf/phase-0/` to the repo root regardless of cwd.
 *
 * Without this, post-fold-in evidence could silently land in
 * `packages/validation-harness/docs/perf/phase-0/` instead of the canonical repo-root
 * path that Phase 0 ADR-0005 / ADR-0006 cite as evidence locations.
 *
 * Strategy:
 *   1. Import the pure `computeRepoRoot(env, currentDir)` helper exposed by `output.ts`.
 *      This avoids Vitest module-cache gymnastics — the helper is deterministic on its
 *      inputs and exercises EXACTLY the same code path the module-level `REPO_ROOT`
 *      constant uses at module load.
 *   2. Assert default path (no env override) targets repo-root, NOT package-local.
 *   3. Assert EVF_REPO_ROOT env override is honored.
 *
 * @see .planning/phases/01-foundation/01-RESEARCH.md Pitfall 8 + Open Question 8
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeRepoRoot, OUTPUT_DIR } from '../src/lib/output.js';

describe('output.ts path resolution (Pitfall 8 mitigation)', () => {
  it('OUTPUT_DIR constant points to repo-root docs/perf/phase-0/ (NOT package-local)', () => {
    // Compute the expected repo-root by walking up from this test file:
    // packages/validation-harness/tests/ → packages/validation-harness/ → packages/ → repo-root
    const testFileDir = path.dirname(fileURLToPath(import.meta.url));
    const expectedRepoRoot = path.resolve(testFileDir, '..', '..', '..');
    const expectedOutputDir = path.join(expectedRepoRoot, 'docs', 'perf', 'phase-0');

    expect(OUTPUT_DIR).toBe(expectedOutputDir);
    expect(OUTPUT_DIR.endsWith(path.join('docs', 'perf', 'phase-0'))).toBe(true);
    // Critical anti-regression: must NOT point inside the package
    expect(OUTPUT_DIR).not.toContain(path.join('packages', 'validation-harness', 'docs'));
  });

  it('computeRepoRoot honors EVF_REPO_ROOT env override (CI / sandbox path)', () => {
    const customRoot = '/tmp/evf-test-root';
    const fakeDir = '/anywhere/it/is/called/from';
    const result = computeRepoRoot({ EVF_REPO_ROOT: customRoot }, fakeDir);
    expect(result).toBe(customRoot);
  });

  it('computeRepoRoot ignores empty EVF_REPO_ROOT (treats as unset)', () => {
    const fakeOutputTs = '/home/repo/packages/validation-harness/src/lib';
    const result = computeRepoRoot({ EVF_REPO_ROOT: '' }, fakeOutputTs);
    // 4 levels up from src/lib → repo root
    expect(result).toBe('/home/repo');
  });

  it('computeRepoRoot walks 4 levels up from src/lib by default', () => {
    const result = computeRepoRoot({}, '/some/where/packages/validation-harness/src/lib');
    expect(result).toBe('/some/where');
  });
});
