/**
 * INV-1 layout integrity matcher. Wraps Vitest 4's `expect.toMatchFileSnapshot()` with
 * char-precision serialization per Specs.md §7.14.4 ck 11.
 *
 * Source: vitest.dev/api/expect (toMatchFileSnapshot verified built-in 2026-05-11).
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { expect } from 'vitest';
import type { AsciiGrid } from './ascii-grid.js';

/**
 * Resolve `fixturePath` exactly the way Vitest's `toMatchFileSnapshot()` does:
 * an absolute path is used verbatim; a RELATIVE path is resolved against the
 * directory of the **currently-running test file** (NOT `process.cwd()`, which
 * is the repo root under the workspace runner). This is the load-bearing detail
 * the existence guard below depends on — most INV-1 callers pass a path relative
 * to their own test file (e.g. `'../../../shared-render/src/fixtures/foo.txt'`).
 */
function resolveFixturePath(fixturePath: string): string {
  if (isAbsolute(fixturePath)) {
    return fixturePath;
  }
  const testPath = expect.getState().testPath;
  // testPath is the absolute path of the running test file; resolve siblingly.
  // If it is somehow unavailable, fall back to cwd-relative (Vitest's own
  // default base), keeping behaviour identical to toMatchFileSnapshot.
  const base = testPath !== undefined ? dirname(testPath) : process.cwd();
  return resolve(base, fixturePath);
}

/**
 * Assert that `grid` matches the fixture at `fixturePath`.
 *
 * `fixturePath` may be absolute, or relative to the calling test file (the same
 * convention `toMatchFileSnapshot()` uses).
 *
 * **Anti-self-heal guard (INV-1).** Vitest's `toMatchFileSnapshot()` AUTO-GENERATES
 * (and passes) the golden file when it is absent. For a layout-integrity harness
 * that means a deleted or renamed INV-1 golden would silently pass locally and
 * only fail in CI (`CI=true` disables snapshot writes). The one invariant this
 * matcher protects must not be able to self-heal, so we assert the fixture file
 * EXISTS before delegating — a missing golden fails loudly with a clear message
 * everywhere, not just under CI. The path is resolved the SAME way Vitest does
 * (see {@link resolveFixturePath}) so absolute and test-relative callers both work.
 *
 * Phase 1 minimal otherwise: delegates the diff to toMatchFileSnapshot (Open
 * Question 6). Phase 4a will expand to column-precision diff reporting
 * (RESEARCH §Pattern 3 — YAGNI per INV-4 until a real failing test demands it).
 *
 * @throws Error when the resolved fixture does not exist (INV-1 golden missing/renamed).
 */
export async function matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void> {
  const resolved = resolveFixturePath(fixturePath);
  if (!existsSync(resolved)) {
    throw new Error(
      `[INV-1] matchAsciiFixture: golden fixture missing at "${resolved}" ` +
        `(from "${fixturePath}"). A deleted/renamed INV-1 golden must FAIL, not ` +
        'silently regenerate. Restore the fixture, or if this is an intentional ' +
        'new golden create it explicitly (e.g. via the fixture-generation path) ' +
        'before asserting.',
    );
  }
  const serialized = `${grid.toString()}\n`;
  // Pass the ORIGINAL path to toMatchFileSnapshot so its own resolution (and any
  // snapshot-write path) is unchanged — we only added an existence pre-check.
  await expect(serialized).toMatchFileSnapshot(fixturePath);
}
