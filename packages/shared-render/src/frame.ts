/**
 * Column frame composer for INV-1 layout snapshots of the G2 thirds layout
 * (docs/design/g2-thirds-layout.md): N side-by-side columns of fixed character
 * width, framed with box-drawing borders. Column boundaries (`│`, `┬`, `┴`) sit at
 * the same character index on every row by construction; {@link columnBoundaries}
 * extracts them so tests can assert they are identical across all states.
 *
 * Characters stand in for the proportional firmware font: pixel budgets are
 * enforced by the renderer (pretext measurement); this grid checks structure
 * (which region holds which line, column boundaries, line counts).
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants)
 */
import { AsciiGrid } from './ascii-grid.js';

/** Line marker rendered as a horizontal rule across its column (section divider). */
export const RULE = '\u0000rule';

/**
 * Frames `columns` side by side.
 *
 * @param columns - Lines per column; shorter columns are padded with blank rows.
 * @param width - Character width of every column (content area).
 * @returns The framed grid.
 * @throws Error when a line is longer than `width` characters or no column is given.
 */
export function frameColumns(
  columns: ReadonlyArray<ReadonlyArray<string>>,
  width: number,
): AsciiGrid {
  if (columns.length === 0) throw new Error('frameColumns: at least one column required');
  const height = Math.max(...columns.map((c) => c.length));
  const cell = (line: string | undefined, ci: number, ri: number): string => {
    if (line === RULE) return '─'.repeat(width);
    const chars = [...(line ?? '')];
    if (chars.length > width) {
      throw new Error(
        `frameColumns: column ${ci} row ${ri} has ${chars.length} chars (max ${width})`,
      );
    }
    return chars.join('') + ' '.repeat(width - chars.length);
  };
  const border = (l: string, m: string, r: string): string =>
    l + columns.map(() => '─'.repeat(width)).join(m) + r;
  const rows = [border('┌', '┬', '┐')];
  for (let r = 0; r < height; r++) {
    rows.push(`│${columns.map((c, ci) => cell(c[r], ci, r)).join('│')}│`);
  }
  rows.push(border('└', '┴', '┘'));
  return AsciiGrid.fromString(rows.join('\n'));
}

/**
 * Character indices of the column boundaries on every row (`│┬┴┌┐└┘` positions).
 *
 * @returns One index list per row.
 */
export function columnBoundaries(grid: AsciiGrid): number[][] {
  return grid.cells.map((row) => row.flatMap((ch, i) => ('│┬┴┌┐└┘'.includes(ch) ? [i] : [])));
}
