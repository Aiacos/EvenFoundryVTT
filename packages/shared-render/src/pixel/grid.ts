/**
 * Hex-grid serialisation of a {@link Pixmap}: one hex digit (`0`–`f`) per pixel, one
 * line per row — readable in a diff and stable across platforms (the renderer is
 * integer-only). Browser-safe (no test-runner imports).
 */
import { AsciiGrid } from '../ascii-grid.js';
import type { Pixmap } from './pixmap.js';

/** Hex grid of `pix` (row-major, one character per pixel). */
export function pixmapGrid(pix: Pixmap): AsciiGrid {
  return new AsciiGrid(pix.toHexRows().map((row) => [...row]));
}
