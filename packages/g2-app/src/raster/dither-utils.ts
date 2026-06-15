/**
 * Shared dither utilities — Floyd-Steinberg 16-step greyscale pipeline.
 *
 * Extracted from `raster-worker.ts` (Plan 21-02) so the portrait pipeline
 * (Plan 21-04) can reuse the exact same dithering algorithm without
 * duplicating it. The worker was the authoritative source; this module is
 * the new canonical export.
 *
 * Both functions are pure and deterministic: identical input always
 * produces identical output (no WASM or global state involved).
 *
 * @see packages/g2-app/src/raster/raster-worker.ts — original source of both bodies
 * @see .planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-02-PLAN.md
 */
import * as ImageQ from 'image-q';

/**
 * Build the canonical 16-step phosphor-green greyscale palette (0..240).
 *
 * Produces 16 RGBA points where R = G = B = i*16, A = 255, for i = 0..15.
 * This yields values 0, 16, 32, ..., 240 — the 16-step Even Realities G2
 * 4-bit greyscale display range per Specs §3.1 + ADR-0006.
 *
 * @returns A 16-entry {@link ImageQ.utils.Palette} ready for Floyd-Steinberg dithering.
 */
export function buildGreyscalePalette(): ImageQ.utils.Palette {
  const pal = new ImageQ.utils.Palette();
  for (let i = 0; i < 16; i++) {
    const v = i * 16; // 0, 16, 32, ..., 240
    pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255));
  }
  return pal;
}

/**
 * Quantize an RGBA tile against the greyscale palette using Floyd-Steinberg dithering.
 *
 * Wraps `ImageQ.applyPaletteSync` with the canonical EVF settings:
 * - `imageQuantization: 'floyd-steinberg'`
 * - `colorDistanceFormula: 'euclidean-bt709'`
 *
 * The function is size-parameterized so it works for both the 200×100 map
 * tiles (used by `raster-worker.ts`) and the 100×60 portrait tiles (Plan 21-04).
 *
 * @param rgba - Source RGBA pixel data as `Uint8ClampedArray` (width × height × 4 bytes).
 * @param w    - Tile width in pixels.
 * @param h    - Tile height in pixels.
 * @param pal  - 16-step greyscale palette; typically from {@link buildGreyscalePalette}.
 * @returns    - Dithered RGBA output as `Uint8ClampedArray` of the same length (w × h × 4).
 */
export function ditherTile(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  pal: ImageQ.utils.Palette,
): Uint8ClampedArray {
  const inContainer = ImageQ.utils.PointContainer.fromUint8Array(rgba, w, h);
  const outContainer = ImageQ.applyPaletteSync(inContainer, pal, {
    imageQuantization: 'floyd-steinberg',
    colorDistanceFormula: 'euclidean-bt709',
  });
  return new Uint8ClampedArray(outContainer.toUint8Array());
}
