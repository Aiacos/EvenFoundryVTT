import { describe, expect, it } from 'vitest';
import { blockAverage, ditherFS, MAP_TONE, toneLevel, upscaleNearest } from './pixelate.js';

describe('blockAverage', () => {
  it('averages every block, partial edge blocks over their own pixels', () => {
    // 3 × 3, block 2 → 2 × 2 blocks: [0,1,3,4] [2,5] [6,7] [8].
    const src = [0, 10, 20, 30, 40, 50, 60, 70, 80];
    expect(Array.from(blockAverage(src, 3, 3, 2))).toEqual([20, 35, 65, 80]);
  });

  it('is the identity for block 1', () => {
    const src = [5, 6, 7, 8];
    expect(Array.from(blockAverage(src, 2, 2, 1))).toEqual(src);
  });
});

describe('upscaleNearest', () => {
  it('repeats each block over block × block pixels', () => {
    expect(Array.from(upscaleNearest([1, 2, 3, 4], 2, 2, 4, 2))).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });

  it('anchors blocks with the shift (scene-pixel alignment)', () => {
    // Shift 1: pixel 0 is the second pixel of block 0.
    expect(Array.from(upscaleNearest([1, 2, 3], 3, 2, 4, 1, 1))).toEqual([1, 2, 2, 3]);
  });
});

describe('toneLevel', () => {
  it('maps black to the lift and white to the max, monotonically', () => {
    expect(toneLevel(0)).toBeCloseTo(MAP_TONE.lift);
    expect(toneLevel(255)).toBeCloseTo(MAP_TONE.max);
    let prev = -1;
    for (let l = 0; l <= 255; l += 5) {
      const v = toneLevel(l);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('keeps map mid-tones well under the HUD numbers (15) and dims with darkness', () => {
    expect(MAP_TONE.max).toBeLessThanOrEqual(11);
    expect(toneLevel(128)).toBeLessThan(7);
    expect(toneLevel(200, MAP_TONE, 0.4)).toBeCloseTo(toneLevel(200) * 0.4);
  });
});

describe('ditherFS', () => {
  it('passes exact levels through untouched', () => {
    expect(Array.from(ditherFS([0, 3, 7, 10], 2, 2, 10))).toEqual([0, 3, 7, 10]);
  });

  it('diffuses error serpentine (hand-computed 2 × 2 at 0.5)', () => {
    // Row 0 left→right: 0.5→1 (e −0.5), 0.28125→0; row 1 right→left: 0.5566→1, 0.046→0.
    expect(Array.from(ditherFS([0.5, 0.5, 0.5, 0.5], 2, 2, 1))).toEqual([1, 0, 0, 1]);
  });

  it('preserves the mean tone of a flat area', () => {
    const w = 32;
    const out = ditherFS(new Array(w * w).fill(4.3), w, w, 10);
    const mean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(mean).toBeCloseTo(4.3, 1);
    expect(new Set(out)).toEqual(new Set([4, 5]));
  });

  it('clamps to 0 … max', () => {
    expect(Array.from(ditherFS([-3, 20], 2, 1, 10))).toEqual([0, 10]);
  });

  it('masked cells stay 0 and neither receive nor spread error', () => {
    const values = [0.5, 0.5, 0.5, 0.5];
    const out = ditherFS(values, 4, 1, 1, [1, 0, 1, 0]);
    expect(out[1]).toBe(0);
    expect(out[3]).toBe(0);
    // Cell 2 did not receive cell 0's error through the masked cell 1.
    expect(out[2]).toBe(1);
  });
});
