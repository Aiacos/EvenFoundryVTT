/**
 * Unit tests for the column frame composer (INV-1 thirds-layout snapshots).
 */
import { describe, expect, it } from 'vitest';
import { columnBoundaries, frameColumns, RULE } from '../src/frame.js';

describe('frameColumns', () => {
  it('frames columns side by side with fixed boundaries', () => {
    const grid = frameColumns([['ab', RULE], ['c'], ['dé', 'f', 'g']], 3);
    expect(grid.toString()).toBe(
      ['┌───┬───┬───┐', '│ab │c  │dé │', '│───│   │f  │', '│   │   │g  │', '└───┴───┴───┘'].join(
        '\n',
      ),
    );
    const b = columnBoundaries(grid);
    expect(new Set(b.map((r) => r.join(','))).size).toBe(1);
    expect(b[0]).toEqual([0, 4, 8, 12]);
  });

  it('rejects lines wider than the column', () => {
    expect(() => frameColumns([['abcd']], 3)).toThrow('column 0 row 0 has 4 chars (max 3)');
  });

  it('rejects an empty column list', () => {
    expect(() => frameColumns([], 3)).toThrow('at least one column');
  });
});
