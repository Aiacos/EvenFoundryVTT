# Implementation Plan — Feature 002 Hybrid native+raster rendering

**Branch**: `feat/layered-native-render` | **Spec**: [spec.md](./spec.md)

Slices are ordered so each lands green (lint + typecheck + test) and is independently committable.
Live simulator verification gates the slices that change on-glasses rendering.

## Slice 1 — Hybrid container schema (DONE, commit 3cbb81a)

`buildHybridPageSchema()` + `HYBRID_CONTAINER_TOTAL` + registry entries (`hybrid-map-tile-0..3`,
`hybrid-status-hud`, `hybrid-map-capture`) + 8 tests. Honors image-over-text z-order (no visible
text/image overlap), exactly one capture, budget held. Base/glyph schemas byte-identical.

## Slice 2 — `'hybrid'` render mode in LayerManager

- Extend `renderMode` union → `'canvas' | 'glyph' | 'hybrid'` (add `HudRenderMode` type alias;
  update field, `setRenderMode`, `getRenderMode`, JSDoc).
- `_flushPage()`: select `buildHybridPageSchema()` when `renderMode === 'hybrid'` (single
  `rebuildPageContainer`, ADR-0001 Amendment 1 preserved).
- `_assertContainerBudget()`: hybrid uses the per-layer sum path with a 4-image/8-text cap, but the
  map layer is canvas-fed — classify the map layer as image-count 4, text 0; native chrome/status
  layers as text. Decide: reuse the glyph per-layer sum, or assert against the fixed hybrid budget.
- Tests: schema-selection test (`renderMode='hybrid'` → 8-container schema, exactly one capture);
  budget assertion test.
- Default NOT flipped yet (keep `'canvas'`/`'glyph'` boot behavior) — additive, no prod impact.

## Slice 3 — Map render path for hybrid (raster region 400×200)

- The CanvasCompositor already outputs 400×200 → 4×(200×100) tiles, matching the hybrid map region.
- In hybrid mode the compositor holds ONLY the map layer (z=0); the status HUD (z=1) and overlays
  (z=2) are NOT composited — they render natively.
- `_compositeAndPush()` / `HudDeltaDriver`: push the 4 map tiles to `hybrid-map-tile-0..3` container
  ids (verify `buildHudTiles`/`pushHudTiles` container targeting; parameterize tile→container).
- The map delta loop runs independently of native text updates.
- Tests: tile→container id mapping; map-only compositor membership.
- **Sim-gated**: verify map renders in the left 400×200 region.

## Slice 4 — Native chrome + status HUD in hybrid

- Mount `StatusHudLayer` (native, z=1) writing the `hybrid-status-hud` container (id 6, right column
  176px). Design a compact 27px-grid status card (~15 chars × ~8 rows): name/level · HP bar · AC/SPD ·
  slots · conditions (subset of §7.4 8-row sheet, width-budgeted for 176px).
- Header (id 4) + footer (id 5) chrome via the existing hud-chrome/native path.
- Width-budget every line (`@evenrealities/pretext` `getTextWidth`) + INV-1 snapshot fixtures
  (IT/EN) for the new compact card.
- **Sim-gated**: verify native text updates without full-screen rasterisation; measure refresh.

## Slice 5 — Native overlay panels in hybrid

- Route z=2 overlay open to the NATIVE overlay panels (`CharacterSheetPanel`, `CombatTrackerPanel`,
  `InventoryPanel`, `SpellbookPanel`, target-picker) instead of the canvas panels when in hybrid.
- Overlay occupies the map region (suspend map capture per ADR-0001 state machine); status HUD stays.
- 27px-density rework of overlay layouts (the deferred "overlay 27px density rework" from Specs §7.4)
  — width-budgeted, INV-1 fixtures per tab/panel.
- **Sim-gated**: open each panel, verify legibility + capture routing.

## Slice 6 — Flip boot default to `'hybrid'`

- `boot-engine-core.ts` / `layer-manager.ts:802`: default `renderMode = 'hybrid'`; BLE verdict
  `'glyph'` and persisted override still reachable; `'canvas'` kept as selectable/fallback.
- Quick Action `[M] Map ctrl` cycles map raster/glyph within hybrid.
- Update `pv-doctor` to drive/observe hybrid boot.
- Regression: existing canvas/glyph tests green; coverage ≥80%.

## Slice 7 — Docs coherence (INV-3, same-commit discipline)

- `Specs.md`: §7.2 substrate note (hybrid is now default; canvas = fallback), new §7.x hybrid layout
  + container table + ASCII mockup, changelog entry + version bump, INV-2 re-verify line.
- `README.md`: badge version + render-substrate bullet.
- `docs/showcase/index.html`: version + HUD section note (hybrid default; dense raster is fallback).
- ADR: amend ADR-0013 (or new ADR-0016) recording the hybrid substrate decision + image-over-text
  constraint that forces the 400×200 map cap.

## Risks / open questions

- 176px status column ≈ 15 chars at the LVGL grid — confirm the compact card is legible in the sim;
  if too narrow, reconsider map width (e.g. 360px map → 216px status) — re-derive tile geometry.
- `buildHudTiles`/`pushHudTiles` may hardcode `hud-tile` container ids — needs parameterization.
- Capture handoff between `hybrid-map-capture` and overlay capture must keep exactly-one-capture at
  every bundle boundary (ADR-0001 invariant) — covered by existing LayerManager assertions.
