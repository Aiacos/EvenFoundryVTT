import { describe, expect, it } from 'vitest';
import { segmentsCross, sightMask } from './sight.js';

const P = (x: number, y: number) => ({ x, y });

describe('segmentsCross', () => {
  it('detects a wall cutting the sight line', () => {
    expect(segmentsCross(P(0, 0), P(4, 0), P(2, -1), P(2, 1))).toBe(true);
    expect(segmentsCross(P(0, 0), P(4, 0), P(5, -1), P(5, 1))).toBe(false); // beyond the target
    expect(segmentsCross(P(0, 0), P(4, 0), P(2, 1), P(2, 3))).toBe(false); // passes by
  });

  it('blocks a line through the joint of two walls, not one ending on the wall', () => {
    // The sight line passes exactly through the wall endpoint (2, 0).
    expect(segmentsCross(P(0, -1), P(4, 1), P(2, 0), P(2, 3))).toBe(true);
    // Target sits on the wall line itself: visible (the wall is seen).
    expect(segmentsCross(P(0, 0), P(2, 0), P(2, -1), P(2, 1))).toBe(false);
  });
});

describe('sightMask', () => {
  const grid = { x0: 0.5, y0: 0.5, step: 1, cols: 7, rows: 1 };
  const eye = P(0.5, 0.5);

  it('limits to the radius', () => {
    expect(Array.from(sightMask(grid, eye, 3, []))).toEqual([1, 1, 1, 1, 0, 0, 0]);
  });

  it('hides what is behind a wall, not behind an open door', () => {
    const wall = { c: [2, 0, 2, 1] as [number, number, number, number] };
    expect(Array.from(sightMask(grid, eye, 10, [wall]))).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(Array.from(sightMask(grid, eye, 10, [{ ...wall, open: true }]))).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('ignores walls outside the sight square', () => {
    const far = { c: [20, 0, 20, 1] as [number, number, number, number] };
    expect(Array.from(sightMask(grid, eye, 3, [far]))).toEqual([1, 1, 1, 1, 0, 0, 0]);
  });
});
