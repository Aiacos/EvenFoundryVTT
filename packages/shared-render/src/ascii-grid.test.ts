/**
 * Unit tests for AsciiGrid — the character-precision grid model behind INV-1
 * layout-integrity fixtures (Specs.md §7.14.4 ck 11-15).
 *
 * Covers the constructor + fromString error paths (the invariants the INV-1
 * harness relies on) and the round-trip serialization contract.
 */
import { describe, expect, it } from 'vitest';
import { AsciiGrid } from './ascii-grid.js';

describe('AsciiGrid — constructor invariants', () => {
  it('throws on zero rows', () => {
    expect(() => new AsciiGrid([])).toThrow(/zero rows not allowed/);
  });

  it('throws on a ragged (non-rectangular) grid', () => {
    expect(() => new AsciiGrid([['a', 'b'], ['c']])).toThrow(/row 1 has 1 cells, expected 2/);
  });

  it('accepts a rectangular grid and records width/height', () => {
    const grid = new AsciiGrid([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
  });

  it('at() returns the cell in-bounds and undefined out-of-bounds', () => {
    const grid = new AsciiGrid([['a', 'b']]);
    expect(grid.at(0, 0)).toBe('a');
    expect(grid.at(1, 0)).toBe('b');
    expect(grid.at(2, 0)).toBeUndefined();
    expect(grid.at(0, 1)).toBeUndefined();
  });
});

describe('AsciiGrid.fromString', () => {
  it('parses LF-joined rows', () => {
    const grid = AsciiGrid.fromString('abc\ndef');
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(grid.at(2, 1)).toBe('f');
  });

  it('trims a single trailing newline (file-ends-with-\\n)', () => {
    const grid = AsciiGrid.fromString('abc\ndef\n');
    expect(grid.height).toBe(2);
  });

  it('normalizes CRLF to LF', () => {
    const grid = AsciiGrid.fromString('abc\r\ndef\r\n');
    expect(grid.height).toBe(2);
    expect(grid.width).toBe(3);
  });

  it('throws on a ragged multi-line string', () => {
    expect(() => AsciiGrid.fromString('abc\nde')).toThrow(/row 1 has 2 cells, expected 3/);
  });

  it('round-trips toString() (no trailing newline on output)', () => {
    const text = 'abc\ndef';
    const grid = AsciiGrid.fromString(text);
    expect(grid.toString()).toBe(text);
  });

  it('round-trips a trailing-newline source to its trimmed form', () => {
    const grid = AsciiGrid.fromString('abc\ndef\n');
    expect(grid.toString()).toBe('abc\ndef');
  });
});
