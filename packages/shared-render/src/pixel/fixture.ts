/**
 * Golden-fixture matcher for pixel zones (TEST-ONLY: imports the Vitest snapshot
 * matcher; exported from `@evf/shared-render/testing`, never the root barrel).
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants)
 */
import { matchAsciiFixture } from '../snapshot.js';
import { pixmapGrid } from './grid.js';
import type { Pixmap } from './pixmap.js';

/** Asserts `pix` matches the hex fixture at `fixturePath` (created on first run). */
export async function matchPixelFixture(pix: Pixmap, fixturePath: string): Promise<void> {
  await matchAsciiFixture(pixmapGrid(pix), fixturePath);
}
