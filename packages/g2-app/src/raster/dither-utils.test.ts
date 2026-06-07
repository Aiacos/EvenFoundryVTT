/**
 * Unit tests for dither-utils.ts — exported buildGreyscalePalette + ditherTile.
 *
 * Behavior coverage:
 *   - buildGreyscalePalette returns a 16-entry palette with values 0,16,...,240
 *   - ditherTile on flat mid-grey 8×8 returns Uint8ClampedArray of length w*h*4
 *   - ditherTile output is deterministic (same input → same bytes twice)
 *   - ditherTile works for non-200×100 size (100×60) — proves parameterization
 */
import { describe, expect, it } from 'vitest';
import { buildGreyscalePalette, ditherTile } from './dither-utils.js';

/** Generate a flat mid-grey RGBA buffer (all pixels = {128, 128, 128, 255}). */
function flatGreyRgba(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = 128;
    buf[i * 4 + 1] = 128;
    buf[i * 4 + 2] = 128;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

describe('buildGreyscalePalette', () => {
  it('DITHER-PAL-01: returns a 16-entry palette', () => {
    const pal = buildGreyscalePalette();
    // ImageQ.utils.Palette exposes .pointArray (array of points)
    expect(pal.pointArray).toHaveLength(16);
  });

  it('DITHER-PAL-02: palette values are 0, 16, 32, ..., 240 with alpha 255', () => {
    const pal = buildGreyscalePalette();
    for (let i = 0; i < 16; i++) {
      const pt = pal.pointArray[i];
      expect(pt).toBeDefined();
      const coords = pt?.coordinates;
      expect(coords).toBeDefined();
      // RGBA components: r = g = b = i*16, a = 255
      const expectedV = i * 16;
      expect(coords?.[0]).toBe(expectedV); // R
      expect(coords?.[1]).toBe(expectedV); // G
      expect(coords?.[2]).toBe(expectedV); // B
      expect(coords?.[3]).toBe(255); // A
    }
  });
});

describe('ditherTile', () => {
  it('DITHER-TILE-01: returns Uint8ClampedArray of length w*h*4 for 8×8 input', () => {
    const w = 8;
    const h = 8;
    const pal = buildGreyscalePalette();
    const rgba = flatGreyRgba(w, h);
    const result = ditherTile(rgba, w, h, pal);
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result).toHaveLength(w * h * 4);
  });

  it('DITHER-TILE-02: output is deterministic — identical input produces identical bytes', () => {
    const w = 16;
    const h = 16;
    const pal = buildGreyscalePalette();
    const rgba = flatGreyRgba(w, h);
    const result1 = ditherTile(new Uint8ClampedArray(rgba), w, h, pal);
    const result2 = ditherTile(new Uint8ClampedArray(rgba), w, h, pal);
    expect(result1).toEqual(result2);
  });

  it('DITHER-TILE-03: works for 100×60 (portrait-size) — proves w/h parameterization', () => {
    const w = 100;
    const h = 60;
    const pal = buildGreyscalePalette();
    const rgba = flatGreyRgba(w, h);
    const result = ditherTile(rgba, w, h, pal);
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result).toHaveLength(w * h * 4);
  });

  it('DITHER-TILE-04: works for 200×100 (canonical map-tile size)', () => {
    const w = 200;
    const h = 100;
    const pal = buildGreyscalePalette();
    const rgba = flatGreyRgba(w, h);
    const result = ditherTile(rgba, w, h, pal);
    expect(result).toBeInstanceOf(Uint8ClampedArray);
    expect(result).toHaveLength(w * h * 4);
  });
});
