/**
 * Golden-fixture bridge for pixel zones: a {@link Pixmap} serialised as one hex digit
 * (`0`–`f`) per pixel, one line per row — readable in a diff and stable across
 * platforms (the renderer is integer-only).
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants)
 */
import { AsciiGrid } from '../ascii-grid.js';
import { matchAsciiFixture } from '../snapshot.js';
import type { Pixmap } from './pixmap.js';

/** Hex grid of `pix` (row-major, one character per pixel). */
export function pixmapGrid(pix: Pixmap): AsciiGrid {
  return new AsciiGrid(pix.toHexRows().map((row) => [...row]));
}

/** Asserts `pix` matches the hex fixture at `fixturePath` (created on first run). */
export async function matchPixelFixture(pix: Pixmap, fixturePath: string): Promise<void> {
  await matchAsciiFixture(pixmapGrid(pix), fixturePath);
}
