/**
 * @evf/shared-render — ASCII grid model + INV-1 layout integrity snapshot matcher.
 *
 * Public API:
 * - `AsciiGrid` — character-precision rectangular grid (immutable)
 * - `matchAsciiFixture(grid, fixturePath)` — Vitest 4 expect.toMatchFileSnapshot wrapper
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants) + §7.14.4 ck 11-15
 * @see docs/architecture/0001-layered-ui-model.md
 */
export { AsciiGrid, type Cell } from './ascii-grid.js';
export { matchAsciiFixture } from './snapshot.js';
export const PACKAGE_NAME = '@evf/shared-render';
