---
"@evf/g2-app": minor
---

Showcase raster HUD — new DEFAULT render substrate (v0.11.0):

- The entire glanceable HUD is now rendered as one 400×200 4-bit raster image
  (4 image tiles × 200×100, the hardware cap), centred on the 576×288 screen,
  faithful to `docs/showcase/index.html`: double-ruled D&D frame + corner
  brackets, header (scene · round/turn · battery), framed map region, right-hand
  D&D status card (♥ HP bar, ⛨ AC, movement SPEED shown with a BOOT icon — not
  swords, ▓░ spell-slot pips, ▶ conditions), footer with canonical R1 hints.
  Uses the VT323 pixel font + phosphor-green palette.
- `canvas` / `hybrid` / `glyph` remain selectable fallbacks (kv `view.hud.render`);
  BLE-degrade to `glyph` is preserved.
- z=2 overlays (Quick-Action menu, character sheet, combat tracker, spellbook,
  inventory, target-picker, item-use modal) work in showcase mode via one generic
  mechanism: existing canvas panels composite at 576×288 and are uniformly
  downscaled 0.6944× (identical 2:1 aspect) into the 400×200 region.
- Real round/turn from `combat.turn`/`combat.state`; real battery from device
  status. Movement-speed icon is now a vector boot in the canvas paths.
- perf: the HUD delta loop hashes SOURCE tiles pre-encode so unchanged tiles are
  never re-dithered/encoded (idle → zero encode).

Fallback compact hybrid native status card (Feature 002 slice 4) also landed for
the `hybrid` mode. No new upstream/hardware claims — INV-2 unchanged.
