/**
 * INV-1 layout integrity matcher. Wraps Vitest 4's `expect.toMatchFileSnapshot()` with
 * char-precision serialization per Specs.md §7.14.4 ck 11.
 *
 * Source: vitest.dev/api/expect (toMatchFileSnapshot verified built-in 2026-05-11).
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */
import { expect } from 'vitest';
import type { AsciiGrid } from './ascii-grid.js';

/**
 * Assert that `grid` matches the fixture at `fixturePath`.
 * On first run, Vitest creates the fixture; on subsequent runs, diff fails on mismatch.
 *
 * Phase 1 minimal: delegates entirely to toMatchFileSnapshot's diff (Open Question 6).
 * Phase 4a will expand to column-precision diff reporting (RESEARCH §Pattern 3 +
 * Open Question 6 — YAGNI per INV-4 until a real failing test demands it).
 */
export async function matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void> {
  const serialized = `${grid.toString()}\n`;
  await expect(serialized).toMatchFileSnapshot(fixturePath);
}
