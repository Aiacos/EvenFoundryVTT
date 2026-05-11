/**
 * Unit tests for AsciiGrid (D-1.11 character-precision grid model).
 * Drives RED → GREEN cycle for ascii-grid.ts implementation.
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants)
 * @see Specs.md §7.14.4 ck 11-15 (INV-1 verification checklist)
 */
import { describe, expect, it } from 'vitest';
import { AsciiGrid } from '../src/ascii-grid.js';

describe('AsciiGrid construction', () => {
  it('accepts a valid 2×2 grid', () => {
    const grid = new AsciiGrid([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
  });

  it('rejects zero-row construction', () => {
    expect(() => new AsciiGrid([])).toThrow('AsciiGrid: zero rows not allowed');
  });

  it('rejects uneven row widths', () => {
    expect(() => new AsciiGrid([['a', 'b'], ['c']])).toThrow(
      'AsciiGrid: row 1 has 1 cells, expected 2',
    );
  });

  it('rejects undefined first row (defensive — TS-strict catches at compile, runtime asserts too)', () => {
    // TS won't allow this directly; using cast for the runtime assertion path.
    expect(() => new AsciiGrid([undefined as unknown as string[]])).toThrow();
  });
});

describe('AsciiGrid.fromString', () => {
  it('parses LF-joined string', () => {
    const grid = AsciiGrid.fromString('ab\ncd');
    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
    expect(grid.at(0, 0)).toBe('a');
    expect(grid.at(1, 1)).toBe('d');
  });

  it('strips trailing newline (file ends with LF)', () => {
    const grid = AsciiGrid.fromString('ab\ncd\n');
    expect(grid.height).toBe(2);
  });

  it('normalizes CRLF to LF (Pitfall 6 mitigation)', () => {
    const grid = AsciiGrid.fromString('ab\r\ncd');
    expect(grid.height).toBe(2);
    expect(grid.width).toBe(2);
  });
});

describe('AsciiGrid.toString', () => {
  it('serializes with LF, no trailing newline', () => {
    const grid = new AsciiGrid([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(grid.toString()).toBe('ab\ncd');
  });

  it('round-trips fromString → toString preserving content (LF-normalized)', () => {
    const input = '┌──┐\n│hp│\n└──┘';
    const grid = AsciiGrid.fromString(input);
    expect(grid.toString()).toBe(input);
  });
});

describe('AsciiGrid.at — noUncheckedIndexedAccess compliance', () => {
  const grid = new AsciiGrid([
    ['a', 'b'],
    ['c', 'd'],
  ]);

  it('returns cell at valid coordinates', () => {
    expect(grid.at(0, 0)).toBe('a');
    expect(grid.at(1, 1)).toBe('d');
  });

  it('returns undefined for out-of-bounds coordinates', () => {
    expect(grid.at(99, 0)).toBeUndefined();
    expect(grid.at(0, 99)).toBeUndefined();
    expect(grid.at(-1, 0)).toBeUndefined();
  });
});
