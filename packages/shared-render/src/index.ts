/**
 * @evf/shared-render — INV-1 layout primitives shared by the G2 HUD and its tests.
 *
 * Public API:
 * - `AsciiGrid` — character-precision grid (`pixmapGrid` serialises a `Pixmap` into one)
 * - `Pixmap` — 4-bit framebuffer with integer drawing primitives (G2 image zones)
 * - bitmap faces `LABEL_FONT` / `MEDIUM_FONT` / `LARGE_FONT` + `measure` / `fitText` /
 *   `drawText` — pixel-exact, width-budgeted text
 * - sheet icons (shield, heart, star, d20, boot, hourglass, skull, …)
 *
 * Test-only matchers (`matchAsciiFixture`, `matchPixelFixture`) import `vitest` and
 * `node:fs`, so they are exported ONLY from the `@evf/shared-render/testing` subpath —
 * this root barrel stays browser-safe (the g2-app bundle imports it).
 *
 * @see Specs.md §7.1a (Layout Integrity Invariants) + §7.14.4 ck 11-15
 * @see docs/design/g2-sheet-ux.html (G2 sheet HUD)
 */
export { AsciiGrid, type Cell } from './ascii-grid.js';
export {
  type Align,
  type BitmapFont,
  drawText,
  fitText,
  type Glyph,
  LABEL_FONT,
  LARGE_FONT,
  MEDIUM_FONT,
  measure,
  measureBold,
  missingGlyphs,
  normalize,
} from './pixel/font.js';
export { pixmapGrid } from './pixel/grid.js';
export {
  boot,
  d20,
  disc,
  type EconomyKind,
  economyMark,
  hammer,
  heart,
  hourglass,
  reticle,
  shield,
  skull,
  star,
  sword,
} from './pixel/icons.js';
export { clampLevel, cubic, MAX_LEVEL, Pixmap, type Point, quadratic } from './pixel/pixmap.js';
export const PACKAGE_NAME = '@evf/shared-render';
