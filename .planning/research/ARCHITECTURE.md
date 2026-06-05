# Architecture Research — v0.10.0 Raster UI Substrate (Canvas Compositor)

**Domain:** AR glasses HUD — canvas compositor integration with LayerManager/panels/raster pipeline
**Researched:** 2026-06-05
**Confidence:** HIGH (sourced entirely from verified codebase: ADR-0001, ADR-0009, ADR-0013, layer-manager.ts, layer-types.ts, hud-canvas-renderer.ts, hud-raster-frame.ts, hud-poc-page.ts, boot-hud-raster-poc.ts, hud-live-render.ts, map-base-layer.ts, status-hud-layer.ts, PROJECT.md, TODO-hud-raster.md)

---

## System Overview

### Current substrate (pre-v0.10.0)

```
LayerManager
  z=0   MapBaseLayer        -> 4 x image containers (map-tile-0..3) via RasterController Worker
  z=0.5 IdleInfillLayer     -> 3 x text containers (combat-log, separator, stats strip)
  z=1   StatusHudLayer      -> 1 x text container  (status-hud, 27px fixed SDK font)
  z=1.5 ToastQueueLayer     -> 1 x text container
  z=2   CharacterSheetPanel -> 1 x text container  (overlay-block, 27px font)
           or CombatTrackerPanel

SDK page (default status-view): 3 text containers.
SDK page (map mode, Phase 20): 4 image + 7 text = 11 containers.
```

### Target substrate (v0.10.0)

```
LayerManager + CanvasCompositor
  z=0   MapBaseLayer        -> INACTIVE at boot; preserved in stack for Phase 20 gesture toggle
  z=0.5 IdleInfillLayer     -> INACTIVE at boot; preserved similarly
  z=1   CanvasStatusHudLayer-> paints onto its own 576x288 OffscreenCanvas
  z=2   CanvasCharSheetPanel-> paints onto its own 576x288 OffscreenCanvas
           or CanvasCombatPanel

CanvasCompositor: drawImage each layer's bitmap in z-order -> master canvas -> RGBA
  -> buildHudTiles(rgba)  [existing hud-raster-frame.ts, UNCHANGED]
  -> pushHudTiles(bridge) [existing hud-poc-page.ts, UNCHANGED]

SDK page (raster HUD mode): 4 image containers (hud-tile-0..3) + 1 capture text (hud-capture).
Total: 5 containers, all declared at page creation (fixed schema).
```

---

## Compositor Model Decision

### Option A: Shared ctx (LayerManager passes a single CanvasRenderingContext2D to each layer)

Each layer receives `(ctx, clipRect)` and paints directly onto the master canvas.

**Advantages:** single pixel buffer, no per-layer allocation, dirty-region clipping is trivial.

**Disadvantages:** no built-in per-layer caching. Static layers (z=1 status HUD) cannot pre-bake unless LayerManager snapshot-caches ctx state — that pushes render logic into LayerManager which already has a dense invariant surface (capture, budget, bundle atomicity). Clip-region management also lands in LayerManager.

### Option B: Per-layer OffscreenCanvas (compositor via drawImage) — RECOMMENDED

Each layer owns an `OffscreenCanvas`; the compositor calls `ctx.drawImage(layer.getCanvas(), 0, 0)` in z-order.

**Advantages:**
- Static/dynamic split is first-class: status HUD bakes once to `ImageBitmap`; only dirty layers repaint before the next composite.
- Each layer is independently testable (render to its own offscreen canvas, assert pixels).
- Matches the existing `hud-canvas-renderer.ts` pattern (`acquireCanvas2d` already creates its own canvas) — minimal refactor.
- LayerManager remains an orchestrator, not a renderer. Single-responsibility stays clean.

**Disadvantages:** N+1 OffscreenCanvas allocations (one per mounted layer + master). With 2-3 active layers this is 3-4 total — negligible in a phone WebView.

**Chosen: Option B.** The static/dynamic split is the dominant performance concern for the 5fps target. The HUD chrome (borders, labels, separators) is static between sessions; only HP/slots/conditions change. Option B makes per-layer caching zero-cost by re-using `ImageBitmap` from the last paint for clean layers. This mirrors how the existing `MapBaseLayer` + `RasterController` work today — the map layer already owns its offscreen frame state.

---

## Architecture: CanvasCompositor Component

### New: `CanvasCompositor` (`packages/g2-app/src/engine/canvas-compositor.ts`)

Owns the single master 576x288 `OffscreenCanvas`. Not part of LayerManager — injected into it.

```typescript
export interface CanvasCompositor {
  /** Register a layer's canvas in z-order. Called by LayerManager during bundle(). */
  registerLayer(z: ZIndex, canvas: OffscreenCanvas): void;
  /** Deregister on layer destroy. */
  deregisterLayer(z: ZIndex): void;
  /** Composite all registered layers in ascending z-order and return 576*288 RGBA. */
  composite(): Uint8ClampedArray;
  /** Mark a specific layer dirty so composite() repaints it before blitting. */
  markDirty(z: ZIndex): void;
}
```

### New: `CanvasLayer` sub-interface (additive extension to `layer-types.ts`)

Canvas-aware layers implement this in addition to the base `Layer` interface:

```typescript
export interface CanvasLayer extends Layer {
  /** Assign the OffscreenCanvas this layer draws on (called at mount). */
  attachCanvas(canvas: OffscreenCanvas): void;
  /** Repaint the layer's OffscreenCanvas from current cached state. */
  paint(): void;
  /** True when the layer has un-flushed state changes since the last paint(). */
  isDirty(): boolean;
}
```

`draw()` on the base `Layer` interface becomes the trigger: LayerManager calls `layer.draw()` which internally calls `paint()` on the layer's own canvas, marks the compositor dirty for that z-index, then schedules a composite+push cycle.

### Static/dynamic cache model

Each `CanvasLayer`:
- On `paint()`: draws to its `OffscreenCanvas`, creates `ImageBitmap` from it, stores as `this._cachedBitmap`, clears dirty flag.
- On `composite()` for a CLEAN layer: `ctx.drawImage(layer.getCachedBitmap(), 0, 0)` — GPU blit, no repaint.
- On `composite()` for a DIRTY layer: call `layer.paint()` first, then blit.

Static layers (full chrome, no data) cost one `drawImage` per composite — essentially free.

---

## Capture-Invariant + Container Budget Re-mapping

### Problem

The 4 HUD image containers do NOT support `isEventCapture: 1` — image containers are render-only. The existing system routes R1 input through a text container (`map-capture`, id=7). The PoC page (`hud-poc-page.ts`) has NO text containers and therefore no capture container — INV-5 violation.

### Solution: 5th zero-size capture text container

Add a zero-dimension text container `'hud-capture'` as the 5th container in the HUD page schema:

```
Page schema (raster HUD mode):
  containerTotalNum: 5
  imageObject: [hud-tile-0, hud-tile-1, hud-tile-2, hud-tile-3]   (ids 0-3)
  textObject:  [hud-capture]                     (id 4, isEventCapture:1, positioned off-screen or 0x0)
```

Container budget: 4 image (≤4 cap) + 1 text (≤8 cap) = budget passes.
INV-5: exactly 1 capture container — maintained.

The capture container is never visible and never holds content; its sole purpose is SDK input routing.

### getCaptureContainer / getContainerCount in canvas mode

`MapBaseLayer.getCaptureContainer()` continues to return `'hud-capture'` (renamed from `'map-capture'`). The LayerManager capture-invariant assertion logic is unchanged — it counts how many mounted layers claim a capture container (must be exactly 1). `MapBaseLayer` remains the capture-provider since it is always mounted even when not painted.

`getContainerCount()` for canvas-mode layers returns `{ image: 0, text: 0 }` because canvas layers do NOT allocate individual SDK containers — the whole page uses the fixed 5-container schema declared at page creation.

**LayerManager budget assertion change:** In canvas mode the budget is FIXED at page creation; `_assertContainerBudget()` switches to a fixed-budget check rather than a per-layer sum. Per-layer `getContainerCount()` is retained for the glyph fallback path (glyph mode reintroduces text containers per layer).

---

## Glyph Fallback Coexistence (ADR-0005 Branch A)

### LayerManager `renderMode: 'canvas' | 'glyph'`

Add `renderMode` to `LayerManager` (analogous to existing `mapMode`):

- **`'canvas'` (default):** all mounted layers are `CanvasLayer`; compositor runs; SDK page = 5-container HUD schema.
- **`'glyph'` (BLE degraded):** canvas compositor suspended; each layer reverts to its text-container rendering path; `_flushPage()` rebuilds the text-only status-view schema (3 text containers). `CanvasCompositor.deactivate()` is called; master canvas released.

The render-mode switch is triggered by `RasterController.setBleVerdict('glyph')` — the same signal that today switches `MapBaseLayer` from raster to glyph. In glyph mode:
- `StatusHudLayer` uses its existing `bridge.textContainerUpgrade` path — **zero changes needed**.
- `CharacterSheetPanel` uses its existing `bridge.textContainerUpgrade` path — **zero changes needed**.
- `CanvasCompositor` is idle.

Glyph fallback requires NO changes to existing layer implementations. Each layer already has both paths (canvas path is new; text path is existing). `LayerManager._flushPage()` already has a TODO comment noting it needs a mode-dependent schema selector. This is now implemented for the canvas/glyph split.

### Mode-switch atomicity

A `setRenderMode('glyph')` call is wrapped in a `bundle([])` (empty ops, schema-only flush) so the page schema rebuild is atomic: no intermediate frame with a half-canvas, half-text state. The existing single-flush guarantee (ADR-0001 Amendment 1) applies.

---

## `_flushPage()` Mode-Dependent Schema

```typescript
private async _flushPage(): Promise<void> {
  const schema = this.renderMode === 'canvas'
    ? buildHudRasterPageSchema()    // 4 image + 1 capture text = 5 containers
    : buildStatusViewTextSchema();  // existing: 3 text containers (glyph fallback)
  const payload = new RebuildPageContainer({ ...schema });
  await this.bridge.rebuildPageContainer(payload);
  if (this.renderMode === 'canvas') {
    await this._compositeAndPush();
  }
}

private async _compositeAndPush(): Promise<void> {
  const rgba = this.compositor.composite();
  const tiles = buildHudTiles(rgba);       // existing hud-raster-frame.ts, UNCHANGED
  await pushHudTiles(this.bridge, tiles);  // existing hud-poc-page.ts, UNCHANGED
}
```

---

## Component Inventory: NEW vs MODIFIED

### NEW components

| Component | Location | Description |
|-----------|----------|-------------|
| `CanvasCompositor` | `src/engine/canvas-compositor.ts` | Owns master 576x288 OffscreenCanvas; composites layers in z-order via `drawImage`; returns RGBA for tile pipeline. Injected into LayerManager. |
| `CanvasLayer` interface | `src/engine/layer-types.ts` (extend) | Additive extension of `Layer`: `attachCanvas()`, `paint()`, `isDirty()`. No changes to existing `Layer`, `OverlayPanel`, `LayerOp`. |
| `buildHudRasterPageSchema()` | `src/engine/container-registry.ts` (or new file) | Produces the production 5-container page schema (4 image HUD tiles + 1 capture text). Replaces PoC `buildHudPocPageSchema()` for production path. |
| `CanvasStatusHudLayer` | `src/status-hud/canvas-status-hud-layer.ts` | StatusHudLayer refactored to paint onto its own OffscreenCanvas. Reuses `renderHudFrame()` content logic. Adds `paint()` + `isDirty()`. Keeps `StatusHudLayer` as glyph fallback. |
| `CanvasCharacterSheetPanel` | `src/panels/canvas-character-sheet-panel.ts` | CharacterSheetPanel refactored to canvas output (6 tabs). Reuses `character-sheet-tab-renderers.ts` content but calls new `paint*Tab()` canvas variants. |
| `CanvasCombatTrackerPanel` | `src/panels/canvas-combat-tracker-panel.ts` | CombatTrackerPanel refactored to canvas output. Reuses combat-tracker render logic via new `paintCombatTracker()` variant. |
| `paint*Tab()` canvas variants | `src/panels/character-sheet-tab-renderers.ts` (additive) | Dual-output pattern: existing `render*Tab() -> string` stays for glyph fallback; new `paint*Tab(ctx, bounds)` draws to canvas. Six variants: Main, Skills, Inventory, Spells, Feats, Bio. |

### MODIFIED existing components

| Component | Change | Scope |
|-----------|--------|-------|
| `LayerManager` (`layer-manager.ts`) | Add `renderMode: 'canvas' \| 'glyph'`; inject `CanvasCompositor`; update `_flushPage()` with schema selector + `_compositeAndPush()`; update `_assertContainerBudget()` for canvas fixed-budget mode. | Medium. Capture-invariant logic unchanged. |
| `layer-types.ts` | Add `CanvasLayer` interface (additive). No changes to `Layer`, `OverlayPanel`, `LayerOp`, `ZIndex`, error types. | Small, additive only. |
| `hud-poc-page.ts` | Rename `buildHudPocPageSchema()` -> `buildHudRasterPageSchema()`; add 5th capture text container; remove PoC-only guard. PoC variant retained as-is for `?hud=raster` dev path. | Small. |
| `MapBaseLayer` (`map-base-layer.ts`) | Rename `'map-capture'` -> `'hud-capture'` in `getCaptureContainer()`; update `getContainerCount()` to return `{ image: 0, text: 0 }` in canvas mode (schema is fixed at page creation, not per-layer). | Small. |
| `CharacterSnapshotSchema` (`shared-protocol`) | Add `feats: FeatEntry[]` and `biography: string` fields (Phase E). Zod schema extension + reader in `foundry-module`. | Medium. |
| `container-registry.ts` | Add `'hud-capture'` to registry; `buildHudRasterPageSchema()` helper. | Small. |
| `boot-engine-core.ts` | Wire `CanvasCompositor` injection into `LayerManager`; switch default boot page from 3-text status-view to 5-container HUD schema; remove `?hud=raster` gate (canvas HUD is now the default). | Medium. |

### UNCHANGED — reuse as-is

| Component | Notes |
|-----------|-------|
| `hud-raster-frame.ts` (`buildHudTiles`) | Already implements 576x288 -> 4 tiles (288x144). No changes needed. |
| `hud-poc-page.ts` (`pushHudTiles`) | Already implements tile push via `updateImageRawData`. Promoted to production (rename only). |
| `hud-canvas-renderer.ts` (`renderHudFrame`) | Canvas draw logic already implemented. Consumed by `CanvasStatusHudLayer.paint()`. |
| `hud-live-render.ts` | `RasterHudRenderDeps` interface already accepts injected stages. New canvas layers wire new deps; no changes to this module. |
| `character-sheet-tab-renderers.ts` (string renderers) | Existing `render*Tab() -> string` renderers stay for glyph fallback. Dual-output pattern adds `paint*Tab()` alongside without touching the existing ones. |
| `RasterController` + raster worker | Map-only raster pipeline. Not involved in HUD compositor. The HUD compositor uses the synchronous `buildHudTiles` path (runs on main thread, not Worker). |
| `StatusHudLayer` (text path) | Kept intact as glyph fallback. `CanvasStatusHudLayer` is a separate class. |
| `CharacterSheetPanel` (text path) | Kept intact as glyph fallback. `CanvasCharacterSheetPanel` is a separate class. |
| `CombatTrackerPanel` (text path) | Kept intact as glyph fallback. |
| `PanelGestureBus` / `r1-event-source` | Gesture routing operates on `LayerManager.getTopLayer()` — rendering substrate is irrelevant. No changes. |
| `panel-router.ts`, `overlay-panel.ts` | Panel lifecycle hooks (`onMount`, `onUnmount`, `onEvent`) are substrate-agnostic. No changes. |

---

## Data Flow

### Normal (canvas mode, data-change-triggered re-render)

```
WS character.delta
    |
    v
CanvasStatusHudLayer._onDelta(raw)
  -> safeParse -> cache snapshot -> markDirty() -> _scheduleDebouncedComposite()
        |
        v (200ms debounce, same as existing StatusHudLayer)
LayerManager._compositeAndPush()
        |
        +-- for each mounted dirty CanvasLayer (ascending z):
        |     layer.paint()              <- layer repaints its OffscreenCanvas
        |     (clean layers: skip paint, use cached ImageBitmap)
        +-- compositor.composite()       <- drawImage each layer's bitmap in z-order
        |     -> Uint8ClampedArray 576*288*4
        +-- buildHudTiles(rgba)          <- hud-raster-frame.ts (UNCHANGED)
        |     -> 4 x HudTile (288x144 dithered 4-bit PNG)
        +-- pushHudTiles(bridge, tiles)  <- hud-poc-page.ts (UNCHANGED)
```

### Overlay open/close (bundle() with canvas compositor)

```
LayerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: canvasSheetPanel }])
    |
    +-- STEP 1-5: existing ops (differential demolish, invariants, lifecycle hooks)
    |     panel.onMount() called -> CanvasCharSheetPanel.attachCanvas(fresh OC)
    |                            -> panel.paint() initial state
    +-- STEP 6: _flushPage()
    |     -> rebuildPageContainer (schema unchanged in canvas mode: still 5 containers)
    |     -> _compositeAndPush()   <- full composite with z=2 now painted
```

The z=0.5 idle-infill differential demolish rule (ADR-0009 Amendment 1) is UNCHANGED: mounting z=2 stashes and destroys z=0.5 in the same bundle. Since z=0.5 is currently inactive at boot, this has no effect during the default view — the rule activates only when/if the map mode is later enabled with idle-infill.

### Glyph fallback (BLE degraded)

```
RasterController.setBleVerdict('glyph')
    |
    v
LayerManager.setRenderMode('glyph')
LayerManager.bundle([]) // empty bundle, just triggers _flushPage()
    |
    v
_flushPage() -> buildStatusViewTextSchema() [3 text containers]
             -> rebuildPageContainer
             // no _compositeAndPush in glyph mode
    |
    v
StatusHudLayer._renderNow() -> bridge.textContainerUpgrade (existing text path)
CharacterSheetPanel.draw()  -> bridge.textContainerUpgrade (existing text path)
// Glyph path: UNCHANGED from today
```

---

## Dependency-Correct Build Order (Phases)

### Phase A: Canvas Compositor Core

**Goal:** Infrastructure only — no visible UI change yet. All existing tests must still pass.

New:
- `CanvasCompositor` (`canvas-compositor.ts`)
- `CanvasLayer` interface extension in `layer-types.ts`
- `buildHudRasterPageSchema()` in `container-registry.ts`

Modified:
- `LayerManager`: add `renderMode`, `CanvasCompositor` injection, mode-aware `_flushPage()`, `_compositeAndPush()`, fixed-budget assertion for canvas mode.

Tests: `canvas-compositor.test.ts` (composite z-order, dirty/clean layer skip, deactivate). `layer-manager.test.ts` additions (renderMode switch, canvas budget assertions, _compositeAndPush called after _flushPage in canvas mode).

Dependencies: none (builds on existing stable base).

### Phase B: Status HUD on Canvas (z=1 raster)

**Goal:** `CanvasStatusHudLayer` is the default z=1 layer in canvas mode. The character status sheet renders with custom font + density — this is the core ADR-0013 goal.

New:
- `CanvasStatusHudLayer` (`canvas-status-hud-layer.ts`)

Modified:
- `boot-engine-core.ts`: in canvas mode, mount `CanvasStatusHudLayer`; `StatusHudLayer` stays for glyph mode.
- `MapBaseLayer`: rename `'map-capture'` -> `'hud-capture'`.

Tests: `canvas-status-hud-layer.test.ts` — mock compositor, assert `paint()` on delta, `isDirty()` clears after composite.

INV-1 raster baseline: snapshot the composited 576x288 RGBA (or tile hashes) for fixture snapshots (loading state, active state, death-saves state). These replace text-fixture INV-1 assertions for the HUD.

Dependencies: Phase A (CanvasCompositor + CanvasLayer interface).

### Phase C: Character Sheet Panel on Canvas (z=2 overlay)

**Goal:** `CanvasCharacterSheetPanel` — 6 tabs rendered on canvas, replacing text output for the overlay. Portrait: in canvas mode, painted directly onto the layer's canvas within the sheet's region (no tile-override slot needed).

New:
- `CanvasCharacterSheetPanel` (`canvas-character-sheet-panel.ts`)
- `paint*Tab(ctx, bounds)` variants in `character-sheet-tab-renderers.ts` (additive, dual-output)

Dependencies: Phase A, Phase B (pattern established).

### Phase D: Combat Tracker on Canvas (z=2 overlay)

**Goal:** `CanvasCombatTrackerPanel` — 5-row initiative window on canvas.

New:
- `CanvasCombatTrackerPanel` (`canvas-combat-tracker-panel.ts`)
- `paintCombatTracker(ctx, snapshot)` canvas variant (additive)

Dependencies: Phase A, Phase C (pattern established).

### Phase E: Feats + Biography Schema + Reader Extension

**Goal:** `CharacterSnapshotSchema` gains `feats: FeatEntry[]` + `biography: string`. `extractFeats()` + `extractBiography()` readers added in `foundry-module`. `CanvasCharacterSheetPanel` Feats/Bio tabs wire real data (replacing hardcoded fixtures).

Modified:
- `packages/shared-protocol/src/character-snapshot.ts` (schema extension)
- `packages/foundry-module/src/readers/character-reader.ts` (new extractors)
- `canvas-character-sheet-panel.ts` (wire real data into Feats + Bio tab paint methods)

Dependencies: Phase C (panel must exist to consume new fields).

### Phase F: INV-1 Raster Contract

**Goal:** Replace text-fixture INV-1 assertions for the HUD with deterministic canvas-output hash checks. New `matchRasterFixture` snapshot matcher in `packages/shared-render/`. Fixture snapshots: loading state, active-with-data state, death-saves state, overlay-open state.

Existing text fixtures for the glyph fallback path remain intact (they validate the glyph path).

Dependencies: Phases B and C (raster output must be stable).

### Phase G: INV-3 Doc Coherence

**Goal:** `Specs.md §7` (raster-HUD layout, compositor section), `README.md`, `docs/showcase/index.html` — all in one atomic commit per INV-3.

Dependencies: Phase F (raster contract finalized — docs cite stable behavior).

---

## ADR Requirement

**ADR-0013 Amendment 1** is the correct vehicle. ADR-0013 already establishes the raster HUD direction; this amendment documents:

1. Compositor model: Option B (per-layer OffscreenCanvas, `drawImage` composition) chosen with rationale.
2. Capture-container re-mapping: 5th zero-size text container `hud-capture` (id=4) satisfies INV-5.
3. Container budget re-mapping: in canvas mode, budget is declared fixed at page creation; `getContainerCount()` returns `{image:0, text:0}` for canvas layers; `_assertContainerBudget()` uses fixed-budget mode.
4. Glyph fallback: `renderMode: 'canvas' | 'glyph'` on `LayerManager`; glyph path is unchanged; mode switch is atomic via `bundle([])`.
5. `_flushPage()` schema selector: `buildHudRasterPageSchema()` (5 containers) vs `buildStatusViewTextSchema()` (3 containers).

A new ADR would duplicate ADR-0013 context. An amendment is the correct form (the original layered-z-model premise is unchanged; only the rendering substrate changes).

---

## Integration Points

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `CanvasLayer` implementations <-> `CanvasCompositor` | `registerLayer()` / `markDirty()` / `composite()` | Compositor is injected; no singleton lookup. |
| `CanvasCompositor` <-> `buildHudTiles` / `pushHudTiles` | RGBA buffer passthrough | These two functions are unchanged; compositor output is their input. |
| `LayerManager` <-> `CanvasCompositor` | Injection at construction | `LayerManager._compositeAndPush()` calls `compositor.composite()` then the tile pipeline. |
| `CanvasStatusHudLayer` <-> `renderHudFrame` | Direct function call | `renderHudFrame()` content logic is reused; output target changed from new canvas to layer's OC. |
| Canvas panels <-> `paint*Tab()` variants | Direct function calls | Dual-output: canvas panels call `paint*Tab(ctx, bounds)`, glyph panels call `render*Tab()`. |
| Glyph fallback layers | `bridge.textContainerUpgrade` (existing) | Unchanged path; activated when `renderMode === 'glyph'`. |

---

## Sources

All sources verified from codebase (no web search needed — this is codebase integration architecture, not ecosystem research):

- `packages/g2-app/src/engine/layer-manager.ts` — LayerManager implementation, bundle() mechanics, _flushPage() TODO comment
- `packages/g2-app/src/engine/layer-types.ts` — Layer interface, ZIndex, LayerOp, RasterControllerLike, ContainerCount
- `packages/g2-app/src/raster/map-base-layer.ts` — existing raster layer, getCaptureContainer, getContainerCount, portrait-override
- `packages/g2-app/src/hud/hud-canvas-renderer.ts` — renderHudFrame, acquireCanvas2d, existing canvas draw logic
- `packages/g2-app/src/hud/hud-raster-frame.ts` — buildHudTiles, HUD_TILE_GEOMETRY, splitIntoTiles
- `packages/g2-app/src/hud/hud-poc-page.ts` — buildHudPocPageSchema, createHudPocPage, pushHudTiles
- `packages/g2-app/src/hud/hud-live-render.ts` — RasterHudRenderDeps, renderRasterHudFrame, makeSnapshotRenderHandler
- `packages/g2-app/src/hud/boot-hud-raster-poc.ts` — PoC boot sequence, isolated raster path
- `packages/g2-app/src/status-hud/status-hud-layer.ts` — existing text-path StatusHudLayer, debounce, heartbeat, wsEvents
- `packages/g2-app/src/panels/character-sheet-panel.ts` — existing text-path CharacterSheetPanel, Strategy A container
- `packages/g2-app/src/panels/combat-tracker-panel.ts` — existing text-path CombatTrackerPanel, Strategy A container
- `docs/architecture/0001-layered-ui-model.md` — ADR-0001 + Amendments (z-stack, capture-invariant, Amendment 2 canvas substrate)
- `docs/architecture/0013-hud-raster-rendering.md` — ADR-0013 (raster HUD direction, scope, consequences)
- `.planning/PROJECT.md` — v0.10.0 milestone context, constraints, locked decisions
- `.planning/TODO-hud-raster.md` — next steps anchor (live re-render, delta loop, promote off flag, generalize pipeline)

---

*Architecture research for: v0.10.0 Raster UI Substrate — canvas compositor integration*
*Researched: 2026-06-05*
