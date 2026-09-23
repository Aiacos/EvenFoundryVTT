---
status: accepted
date: 2026-09-23
deciders: maintainer (UX rounds 1–2)
consulted: hub.evenrealities.com/docs/build/display, @evenrealities/pretext 0.1.4 measurements, evenhub-simulator 0.9.5
informed: g2-app, shared-render, foundry-module (map reader)
---

# ADR-0018: D&D-Sheet HUD on a Pure-TypeScript Pixel Renderer

## Status

**ACCEPTED** — 2026-09-23. Supersedes [ADR-0001](./0001-layered-ui-model.md) (layered
z-model), [ADR-0006](./0006-raster-pipeline-library-stack.md) (image-q / xxhash-wasm raster
stack), [ADR-0009](./0009-layer-manager-contract.md) (layer manager) and
[ADR-0010](./0010-panel-plugin-registry.md) (overlay panel registry). Replaces the map
section (point 6) of [ADR-0016](./0016-direct-foundry-streaming.md). Design spec:
[`docs/design/g2-sheet-ux.html`](../design/g2-sheet-ux.html).

## Context

- The first v0.12 layout (three equal columns of firmware text) worked on the simulator
  but did not read like a D&D character sheet (maintainer feedback, 2026-09-23).
- The firmware text font is proportional, has no size control, and **drops** the glyphs
  a sheet needs (`▮ ▯ ◉ ⚠ ✓ ✖ ⌖ ▓ ░` measure 0 px with `@evenrealities/pretext`). A
  192 px column holds ~18 characters × 11 lines.
- Image containers accept arbitrary 4-bit pixels: ≤ 4 per page, ≤ 288 × 144 each, one
  update at a time, ≥ 100 ms apart (SDK 0.0.14+). BLE throughput is ~10–30 KB/s.

## Decision

1. **Five fixed zones** on 576 × 288 (UX round 2): A portrait 144² · B header 288 × 144
   (AC shield, HP box + temp, INIT/SPD/PROF, action economy, conditions, turn chip) ·
   C square map 144² · D sheet 288 × 144 (Abilities · Saves & Skills, death saves at 0 HP)
   · E context panel = firmware text/list, the **only** input zone. A–D are images
   (4/4), E + full-screen capture are text (4/8). No `rebuildPageContainer` during play.
2. **Pure-TypeScript renderer** in `packages/shared-render/src/pixel/`: integer 4-bit
   framebuffer, primitives, three hand-drawn bitmap fonts (7 px caps, 10 px, 16 px digits)
   and a D&D icon set. Deterministic in the WebView and in Vitest → pixel-golden
   fixtures `sheet.<zone>.<screen>.<locale>.<variant>.txt` are the executable INV-1
   contract. `image-q` and `xxhash-wasm` are dropped; `upng-js` remains only as the
   4-bit PNG encoder.
3. **Brightness hierarchy**: HP, AC, turn and modifiers at level 15; text 11; labels
   7–9; frames 3–6; portrait and map art capped at mid-tones so they never out-shine
   the numbers.
4. **Zone sender**: per-zone hash, priority header > map > sheet > portrait, one image
   at a time ≥ 100 ms apart, map ≤ 1 fps.
5. **Map (zone C)**: the **original scene art** (background, tiles, token art) fetched
   same-origin by the phone, cropped around the player's token, block-downsampled
   (pixel size 1/2/3, default 2), Floyd–Steinberg dithered to 16 levels, darkened
   outside the token's sight radius (no reveal of unexplored areas), with crisp vector
   markers on top. Schematic walls/grid rendering is the fallback when art is missing.
6. **Portrait (zone A)**: actor image → token image → class emblem, ordered-dithered.
7. **Automatic sheet page**: Abilities by default, Saves & Skills on a GM roll request,
   death saves at 0 HP; manual override via the long-press menu.

## Consequences

- ➕ Reads like the paper sheet / D&D Beyond; symbols independent of firmware fonts.
- ➕ Pixel-exact golden tests; simulator loop (`sim:check`) verifies all screens.
- ➖ Four images to keep in budget; full-screen states need one page rebuild.
- ➖ Zone E keeps firmware limits (3 body lines); richer lists would cost an image.
- ➖ Map art quality depends on the scene images; a schematic fallback is kept.

## Confirmation

`packages/shared-render/src/pixel/**` tests, `packages/g2-app/src/hud/**` tests
(golden, context, zones, pacing), `pnpm --filter @evf/g2-app sim:check` PASS on
evenhub-simulator 0.9.5 (12/12 screens, 2026-09-23).
