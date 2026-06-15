/**
 * INV-1 layout integrity matcher. Wraps Vitest 4's `expect.toMatchFileSnapshot()` with
 * char-precision serialization per Specs.md §7.14.4 ck 11.
 *
 * Source: vitest.dev/api/expect (toMatchFileSnapshot verified built-in 2026-05-11).
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */
import { existsSync } from 'node:fs';
import { expect } from 'vitest';
import type { AsciiGrid } from './ascii-grid.js';

/**
 * Assert that `grid` matches the fixture at `fixturePath`.
 *
 * `fixturePath` MUST be an absolute path (callers resolve it against their own
 * fixture dir, e.g. `resolve(fixtureDir(), 'sheet.main.it.txt')`).
 *
 * **Anti-self-heal guard (INV-1).** Vitest's `toMatchFileSnapshot()` AUTO-GENERATES
 * (and passes) the golden file when it is absent. For a layout-integrity harness
 * that means a deleted or renamed INV-1 golden would silently pass locally and
 * only fail in CI (`CI=true` disables snapshot writes). The one invariant this
 * matcher protects must not be able to self-heal, so we assert the fixture file
 * EXISTS before delegating — a missing golden fails loudly with a clear message
 * everywhere, not just under CI.
 *
 * Phase 1 minimal otherwise: delegates the diff to toMatchFileSnapshot (Open
 * Question 6). Phase 4a will expand to column-precision diff reporting
 * (RESEARCH §Pattern 3 — YAGNI per INV-4 until a real failing test demands it).
 *
 * @throws Error when `fixturePath` does not exist (INV-1 golden missing/renamed).
 */
export async function matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void> {
  if (!existsSync(fixturePath)) {
    throw new Error(
      `[INV-1] matchAsciiFixture: golden fixture missing at "${fixturePath}". ` +
        'A deleted/renamed INV-1 golden must FAIL, not silently regenerate. ' +
        'Restore the fixture, or if this is an intentional new golden create it ' +
        'explicitly (e.g. via the fixture-generation path) before asserting.',
    );
  }
  const serialized = `${grid.toString()}\n`;
  await expect(serialized).toMatchFileSnapshot(fixturePath);
}
