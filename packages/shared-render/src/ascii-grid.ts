/**
 * Character-precision grid model for INV-1 layout integrity testing.
 * Source: Specs.md §7.14.4 ck 11-15 + §7.1a Layout Integrity Invariants.
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */

/** Character cell (string of length 1 by convention; ASCII-only enforced by serializer). */
export type Cell = string;

/** Rectangular character grid, immutable. Serializes to LF-joined string for fixtures. */
export class AsciiGrid {
  /** Cell rows; each row has exactly `width` cells. */
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
  readonly width: number;
  readonly height: number;

  constructor(cells: ReadonlyArray<ReadonlyArray<Cell>>) {
    this.height = cells.length;
    if (this.height === 0) throw new Error('AsciiGrid: zero rows not allowed');
    const firstRow = cells[0];
    if (firstRow === undefined) throw new Error('AsciiGrid: undefined first row');
    this.width = firstRow.length;
    for (const [i, row] of cells.entries()) {
      if (row === undefined) {
        throw new Error(`AsciiGrid: row ${i} is undefined`);
      }
      if (row.length !== this.width) {
        throw new Error(`AsciiGrid: row ${i} has ${row.length} cells, expected ${this.width}`);
      }
    }
    this.cells = cells;
  }

  /** Build from LF-joined string; trims trailing blank line if file ends with \n. */
  static fromString(text: string): AsciiGrid {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const rows = lines.map((line) => [...line]);
    return new AsciiGrid(rows);
  }

  /** Serialize to LF-joined string; NO trailing newline (caller adds if needed). */
  toString(): string {
    return this.cells.map((row) => row.join('')).join('\n');
  }

  /** Get cell at (col, row). Returns undefined for out-of-bounds per INV-4 noUncheckedIndexedAccess. */
  at(col: number, row: number): Cell | undefined {
    return this.cells[row]?.[col];
  }
}
