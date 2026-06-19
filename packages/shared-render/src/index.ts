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
// NOTE: `matchAsciiFixture` (snapshot.js) statically imports `node:fs` and is
// TEST-ONLY (node env). Importing THIS root barrel from BROWSER code (e.g. the
// g2-app bundle) drags node:fs into the build and throws at boot. Browser code
// must import AsciiGrid from the `@evf/shared-render/ascii-grid` subpath instead.
export { matchAsciiFixture } from './snapshot.js';
export const PACKAGE_NAME = '@evf/shared-render';
