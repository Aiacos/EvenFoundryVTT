# Feature 002 — Hybrid native+raster rendering (fast HUD, raster map region)

**Branch**: `feat/layered-native-render` | **Date**: 2026-06-26 | **Supersedes default of**: v0.10.0 Canvas Compositor Raster Substrate (kept as fallback)

## Problem

The v0.10.0 milestone made the **CanvasCompositor raster substrate** the default render path: the
status HUD (z=1) and overlay panels (z=2) are painted onto an `OffscreenCanvas` and pushed to the G2
as 4 PNG sub-tiles every delta cycle. It works, but **every visible change re-composites and
re-rasterises the screen region and re-encodes PNG tiles**, so the refresh is visibly slow on real
glasses. Native G2 text containers update almost instantly (`textContainerUpgrade`), but cannot
reproduce the dense 96×24 mockups (LVGL font is a fixed ~27px → ~10 rows × ~50 chars; dense layouts
read "too big" on hardware).

## Decision (user, 2026-06-26)

Adopt a **hybrid** substrate as the default:

- **Chrome (header/footer), persistent status HUD (z=1) and overlay panels (z=2) render as native
  text/list containers** — fast `textContainerUpgrade`, no per-frame rasterisation.
- **The map renders as a raster region (4 image containers, max 400×200 px)** beside the native
  status text — only the map region is rasterised, and only when the map content changes, never the
  whole HUD every frame.

Accepted constraint: the G2 renders **image containers on top of text containers** (type-based
z-order, probe-verified 2026-06-14, `container-registry.ts:118`). Therefore the map image-tiles and
the native text containers must occupy **non-overlapping rectangles**; the full-screen 576×288 look
of the marketing showcase is not physically reproducible — the map is capped at 400×200 and the
native HUD fills the remainder.

The canvas raster substrate (v0.10.0) is **retained as a selectable/fallback mode**, not deleted
(INV-4: it stays live and tested, used for the BLE-degraded full-screen path and as `renderMode='canvas'`).

## Goals

1. A third `renderMode` — `'hybrid'` — selecting a container schema of **4 map image-tiles +
   native header/status-hud/footer + a map-capture text container**, all within the G2 budget
   (≤4 image, ≤8 text) and with **zero image/text rectangle overlap**.
2. Boot defaults to `'hybrid'` (was `'canvas'` at `layer-manager.ts:802`); `'canvas'` and `'glyph'`
   remain reachable (BLE verdict / persisted override / Quick Action `[M]`).
3. The persistent status HUD + overlay panels render through the **native text path**
   (`StatusHudLayer`, native overlay panels) — not the canvas layers — when in hybrid mode.
4. The map region streams through the existing worker-backed `RasterController` (400×200, tile
   delta-hash), decoupled from the HUD's text updates.
5. INV-1 holds: new native layouts are width-budgeted and snapshot-tested for IT/EN; the existing
   glyph (~60 fixtures) and raster (PNG hash) suites stay green and byte-identical.
6. INV-3: `Specs.md` (§7.2 substrate note + new §7.x hybrid layout), `README.md`, and
   `docs/showcase/index.html` are updated in lockstep when the default flips.

## Non-goals

- Deleting the canvas compositor or its panels (kept as fallback/selectable).
- Reproducing the dense 96×24 showcase layout natively (physically impossible at 27px).
- Voice / V2 / MCP — untouched.
- Changing the bridge or foundry-module protocol (map frames + character deltas already flow).

## Container schema — hybrid (proposed, to validate in simulator)

Physical screen 576×288. Image tiles max 200×100, 4 available. The host paints images over text, so
text lives strictly outside the image rect.

| Container    | kind  | x   | y   | w   | h   | capture | notes                                        |
|--------------|-------|-----|-----|-----|-----|---------|----------------------------------------------|
| header       | text  | 0   | 0   | 576 | 27  | 0       | scene · round/turn · R1 battery (1 row)      |
| map-tile 0-3 | image | 0   | 27  | 200×100 ×4 (2×2 = 400×200) at x∈{0,200}, y∈{27,127} | 0 | raster map region (left), y=27..227 |
| status-hud   | text  | 400 | 27  | 176 | 200 | 0       | native right column: name/HP/AC/slots/cond   |
| footer       | text  | 0   | 261 | 576 | 27  | 0       | R1 hint + nav chips (1 row)                   |
| map-capture  | text  | 0   | 27  | 400 | 200 | 1       | invisible under image tiles; routes gestures |

Budget: 4 image + 4 text = within ≤4 image / ≤8 text. Exactly one `isEventCapture=1` (map-capture).
No image/text rect overlaps (status-hud x≥400; map x<400; header/footer outside y 27..227).
Geometry is provisional — the 176px / 27px-grid status column must be measured with
`@evenrealities/pretext` and iterated in the simulator before the layout is locked.

## Acceptance

- Boot lands in hybrid mode; status HUD + overlays are native text (verified: no PNG tile push for a
  HP/condition change — only `textContainerUpgrade`); only map changes push image tiles.
- Map pan/ping gestures captured by `map-capture`; overlay open/close swaps capture per ADR-0001.
- INV-1 glyph + raster suites unchanged; new hybrid layout has its own width-budget + snapshot tests.
- `pnpm lint:ci && pnpm typecheck && pnpm test` green; coverage ≥80% held.
- Live sim verification: HUD text update latency visibly < previous full-canvas path.

## References

- Spec §7.2 (layered model + substrate note), §7.3 (canvas allocation), §7.4 (27px default view),
  §7.4b (raster pipeline), §3.1 (image container limits).
- `container-registry.ts` (image-over-text z-order, schema builders), `layer-manager.ts`
  (renderMode selection), `raster/map-base-layer.ts` + `raster/raster-controller.ts` (worker map),
  `status-hud/status-hud-layer.ts` (native status), native overlay panels under `panels/`.
- ADR-0001 (layered UI), ADR-0013 (HUD raster rendering) — hybrid is an amendment direction.
