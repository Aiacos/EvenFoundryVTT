/**
 * PNG encoding of a zone for `updateImageRawData`: lossless 4-bit indexed PNG via
 * `upng-js` (ADR-0006 raster stack). The Even Hub host accepts encoded images and
 * converts them to grey-4; level `l` is written as grey `l × 17`.
 *
 * Losslessness: `UPNG.encode(…, 0)` builds an exact palette from the pixels, always
 * reserving entry 0 for transparent black. Level 0 is therefore written as `0,0,0,0`
 * (off, like every unlit pixel on the display), so a zone uses at most 16 palette entries
 * and gets depth 4. The quantizing path (`cnum = 16`) is not used: it merges levels.
 */
import type { Pixmap } from '@evf/shared-render';
import * as UPNG from 'upng-js';

/**
 * @param pix - Zone pixmap (levels 0–15).
 * @returns PNG bytes (≤ 16 palette entries → ≤ 4-bit depth), pixel-exact.
 */
export function encodePng(pix: Pixmap): Uint8Array {
  const rgba = new Uint8Array(pix.data.length * 4);
  for (let i = 0; i < pix.data.length; i++) {
    const level = pix.data[i] ?? 0;
    if (level === 0) continue; // transparent black: palette entry 0
    const v = level * 17;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], pix.width, pix.height, 0));
}
