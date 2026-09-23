# @evf/shared-render

INV-1 layout primitives for the G2 sheet HUD: character grids, a 4-bit framebuffer,
hand-authored bitmap faces and the pixel golden-fixture matcher (Vitest 4).

## Pattern (INV-1)

- `Pixmap` — 4-bit grey framebuffer (levels 0–15) with integer, deterministic
  primitives: rects, rounded rects, Bresenham lines (solid / dashed), circles, ellipses,
  polygons, Bézier sampling, clip stack, blit / crop / dim, FNV-1a hash
- Bitmap faces `LABEL_FONT` (7 px caps), `MEDIUM_FONT` (10 px caps + digits),
  `LARGE_FONT` (16 px digits, `+ - /`) with composed Italian accents; `measure`,
  `fitText` (truncation with `…`), `drawText` (left / centre / right, pixel bold),
  `missingGlyphs` for coverage tests
- Sheet icons: shield (CA), heart (PF), star (inspiration), d20, boot, hourglass, skull,
  hammer, sword, action-economy marks, map reticle
- `AsciiGrid` + `matchAsciiFixture(grid, path)` — character-precision grid wrapped around
  Vitest's `expect.toMatchFileSnapshot()`; `matchPixelFixture(pixmap, path)` stores a
  zone as one hex digit per pixel, one line per row

Everything is pure TypeScript without DOM/canvas, so the renderer produces byte-identical
pixels in the Even App WebView and in Node/Vitest.

## Fixtures

`src/fixtures/sheet.<zone>.<screen>.<locale>.<variant>.txt` — zones `header`, `sheet`,
`map`, `portrait` and `full` (full-screen S10/S11) of screens S1–S12 of
`docs/design/g2-sheet-ux.html`, rendered by
`packages/g2-app/src/hud/__tests__/golden.test.ts` (IT design content for every zone, EN
and `max` content for header + sheet). The same test asserts that zone frames never move
across states × locales × content.

## See also

- `Specs.md` §7.1a
- `docs/design/g2-sheet-ux.html`
