---
"@evf/g2-app": minor
"@evf/shared-render": minor
---

ADR-0018 D&D-sheet HUD «Scheda da tavolo G2». The glasses render a pixel HUD built with
`@evf/shared-render` (bitmap fonts, icons, 16-level pixmaps, INV-1 pixel golden
fixtures): portrait, header (HP / AC / turn / action economy / conditions), a pixelated
scene map, the sheet page, and a native-text context zone driven by R1 gestures
(ADR-0012 gesture model: tap opens actions, double-tap at root exits).

`@evf/shared-render` gains the pixel renderer (`Pixmap`, fonts, icons,
`matchPixelFixture`); the INV-1 fixture matchers move to a test-only `./testing` subpath so
the browser bundle never pulls `node:fs` / `vitest`.
