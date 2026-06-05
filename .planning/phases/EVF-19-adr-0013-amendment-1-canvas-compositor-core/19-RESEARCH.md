# Phase 19: ADR-0013 Amendment 1 + Canvas Compositor Core — Research

**Researched:** 2026-06-05
**Domain:** Canvas compositor substrate — `CanvasCompositor`, `CanvasLayer`, schema-selector in `LayerManager._flushPage()`, `buildHudRasterPageSchema()`, geometry correction 288×144 → 200×100
**Confidence:** HIGH — sourced entirely from verified codebase + locked architectural decisions in CONTEXT.md/REQUIREMENTS.md/ARCHITECTURE.md/SUMMARY.md

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All architectural decisions for this phase are locked upstream (`.planning/research/SUMMARY.md` + INV-2 correction 2026-06-05 + ADR-0013). Treat as immutable constraints:

1. **Geometry (INV-2, verified 2026-06-05 `hub.evenrealities.com/docs/guides/display`):** image containers max 4 per page, each 20–200px wide × 20–100px tall. Raster surface = **400×200 (4 tiles 200×100)**. NOT 576×288. `HUD_TILE_GEOMETRY` = 200×100. Placement in 576×288 = parameterized (default deferred to Phase 20).
2. **Compositor model:** Option B — per-layer `OffscreenCanvas`, composited via `drawImage` in z-order on a master 400×200 canvas. `CanvasCompositor` owns the master, injected into `LayerManager`.
3. **Capture-invariant in canvas mode:** 5th container = full-screen text container `'hud-capture'` with `isEventCapture:1`. NOT zero-size (undocumented); the canonical EvenHub first-app example uses a full-screen text container as the capture target.
4. **Budget mode canvas:** fixed 5-container budget (4 image-tile + 1 text capture). `CanvasLayer.getContainerCount()` returns `{image:0, text:0}`; `_assertContainerBudget()` uses fixed-budget check in canvas mode.
5. **Serialized push:** `updateImageRawData` does NOT allow concurrent sends. `_compositeAndPush()` awaits each tile sequentially.
6. **Schema is fixed:** panel change (Phase 21+) = `updateImageRawData` on existing tiles, NOT `rebuildPageContainer`.
7. **`renderMode: 'canvas' | 'glyph'`** on `LayerManager`; `_flushPage()` selects `buildHudRasterPageSchema()` (canvas) or existing 3-text schema (glyph). Glyph path = byte-identical to today.
8. **ADR-0013 Amendment 1 MUST be written before any implementation merge.**
9. **Hardware SC:** 400×200 region + capture-container on real G2 = `human_needed` under ADR-0005 Branch A.

### Claude's Discretion

None in this phase — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Visible content rendering on canvas (status HUD, font VT323, chrome pre-baked) → Phase 20
- Definitive on-screen placement of the 400×200 region in 576×288 → Phase 20
- `raster-worker` generalization (map + HUD shared worker) → v2 (RGEN-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RAST-01 | `LayerManager` composites layers on single 400×200 canvas; 4 tiles 200×100; `updateImageRawData` serialized | `CanvasCompositor` implementation + `_compositeAndPush()` serialized push in `LayerManager` |
| RAST-02 | Capture-invariant (INV-5) preserved in canvas mode via dedicated text container `hud-capture` with `isEventCapture:1` | 5th container in `buildHudRasterPageSchema()` |
| RAST-03 | Budget audit works in canvas mode at fixed 5-container budget; no false `capture_invariant_violated` | `_assertContainerBudget()` canvas-mode branch; `CanvasLayer.getContainerCount()={image:0,text:0}` |
| RAST-04 | Glyph/text path coexists unchanged; `renderMode` flag selects schema; glyph mode byte-identical | `_flushPage()` selector; glyph branch calls existing `buildStatusViewTextContainers()` |
| RAST-05 | ADR-0013 Amendment 1 ratified before implementation | ADR format verified from existing ADR-0001; 5 locked decision points documented |
| RINV-02 | Tile geometry corrected to 200×100/400×200; hardware SC under ADR-0005 Branch A | `HUD_TILE_GEOMETRY` migration; `hud-raster-frame.ts` constants update |
</phase_requirements>

---

## Summary

Phase 19 is a **pure infrastructure phase** with no visible UI change. The goal is to lay the wiring substrate that every subsequent canvas-rendering phase (20+) will build on:

1. Write and ratify **ADR-0013 Amendment 1** documenting the five locked decisions as the architectural contract.
2. Implement **`CanvasCompositor`** — a new class owning a master 400×200 `OffscreenCanvas`, compositing per-layer bitmaps in z-order, and delivering RGBA to the existing `buildHudTiles`/`pushHudTiles` pipeline.
3. Add **`CanvasLayer` interface** to `layer-types.ts` (additive, no changes to existing `Layer`).
4. Add **`buildHudRasterPageSchema()`** to `container-registry.ts` — the 5-container fixed page schema (4 image hud-tile-0..3 at 200×100, 1 text `hud-capture` full-screen with `isEventCapture:1`).
5. Extend **`LayerManager`** with `renderMode: 'canvas' | 'glyph'`, a mode-aware `_flushPage()`, `_compositeAndPush()`, and a fixed-budget canvas assertion branch.
6. Migrate **`HUD_TILE_GEOMETRY`** from 288×144 (PoC only, simulator-only confirmed) to the INV-2-verified **200×100**, parameterizing on-screen placement for Phase 20.

The glyph path must remain **byte-identical** throughout. All 2668+ existing tests must continue to pass.

**Primary recommendation:** Implement in this order — ADR first, then geometry constants, then `CanvasCompositor` + `CanvasLayer`, then `buildHudRasterPageSchema()`, then `LayerManager` modifications. Each step is independently committable and testable.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Master 400×200 canvas ownership | `CanvasCompositor` (new, `src/engine/canvas-compositor.ts`) | — | Single owner per Option B; LayerManager stays orchestrator only |
| Per-layer offscreen canvas + paint | `CanvasLayer` implementations (Phase 20+) | `CanvasCompositor.registerLayer()` | Layer owns its own surface; compositor assembles |
| Schema-page selection (canvas vs glyph) | `LayerManager._flushPage()` | `buildHudRasterPageSchema()` / `buildStatusViewTextContainers()` | `_flushPage()` is the single bridge flush point per ADR-0001 Amendment 1 |
| 5-container page schema build | `buildHudRasterPageSchema()` in `container-registry.ts` | `CONTAINER_REGISTRY` entries | Registry is the single source of container geometry truth |
| Serialized tile push | `LayerManager._compositeAndPush()` | `pushHudTiles` (existing) | SDK constraint: no concurrent `updateImageRawData` |
| Capture-invariant in canvas mode | `hud-capture` text container (5th in schema) | `MapBaseLayer.getCaptureContainer()` remains provider | INV-5 unchanged; container type changes from image-adjacent to text |
| Budget assertion in canvas mode | `LayerManager._assertContainerBudget()` — fixed-budget branch | `CanvasLayer.getContainerCount() = {image:0, text:0}` | Canvas layers don't allocate individual containers |
| Glyph fallback (byte-identical) | `LayerManager` glyph branch in `_flushPage()` | Existing `buildStatusViewTextContainers()` | ADR-0005 Branch A — zero changes to glyph path |
| Tile geometry constants | `hud-raster-frame.ts` | `hud-poc-page.ts` (updated HUD_POC_CONTAINERS) | INV-2 correction: 288×144 → 200×100 |

---

## Standard Stack

No new packages in this phase. All tooling is already installed.

| Component | Version | Notes |
|-----------|---------|-------|
| TypeScript strict | 5.8.3 (pinned) | `noUnusedLocals`, `noUnusedParameters` per INV-4 |
| Vitest 4 | 4.1.5 | Existing workspace test runner |
| `@evenrealities/even_hub_sdk` | 0.0.10 | Already installed; `RebuildPageContainer`, `TextContainerProperty`, `ImageContainerProperty` |
| `image-q` 4.0.0 | already installed | Used in `hud-raster-frame.ts` for dither (preserved unchanged) |
| `upng-js` 2.1.0 | already installed | Used in `hud-raster-frame.ts` for PNG encode (preserved unchanged) |

**No new `npm install` required for Phase 19.**

---

## Package Legitimacy Audit

No new packages installed in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
LayerManager.bundle(ops)
      |
      v [STEP 3 invariants]
_assertCaptureInvariant()  <- unchanged; MapBaseLayer still returns 'hud-capture'
_assertContainerBudget()   <- NEW: if renderMode==='canvas' → fixed check (5 containers);
                              if renderMode==='glyph' → existing per-layer sum
      |
      v [STEP 6]
_flushPage()
  renderMode === 'canvas'                  renderMode === 'glyph'
       |                                          |
buildHudRasterPageSchema()          buildStatusViewTextContainers()
  containerTotalNum: 5              (3 text containers, unchanged)
  imageObject: [hud-tile-0..3]
  textObject:  [hud-capture]
       |
bridge.rebuildPageContainer(payload)
       |
  [canvas mode only]
_compositeAndPush()
       |
CanvasCompositor.composite()  <-- NEW: drawImage each layer's OffscreenCanvas in z-order
       |
buildHudTiles(rgba)            <-- UNCHANGED (hud-raster-frame.ts)
  400×200 RGBA → 4 × 200×100 dithered 4-bit PNG
       |
pushHudTiles(bridge, tiles)    <-- UNCHANGED (hud-poc-page.ts)
  for tile of tiles: await bridge.updateImageRawData(...)  // SERIALIZED
```

### Recommended Project Structure

```
packages/g2-app/src/
├── engine/
│   ├── canvas-compositor.ts     ← NEW (Phase 19)
│   ├── layer-types.ts           ← MODIFIED: add CanvasLayer interface
│   ├── layer-manager.ts         ← MODIFIED: renderMode + _flushPage selector + _compositeAndPush
│   └── container-registry.ts   ← MODIFIED: add buildHudRasterPageSchema() + hud-capture entry
├── hud/
│   ├── hud-raster-frame.ts      ← MODIFIED: TILE_W=200, TILE_H=100, FRAME_W=400, FRAME_H=200
│   └── hud-poc-page.ts          ← MODIFIED: HUD_POC_CONTAINERS derived sizes update
docs/
└── architecture/
    └── 0013-hud-raster-rendering.md  ← MODIFIED: append Amendment 1
```

### Pattern 1: ADR-0013 Amendment 1 — What It Must Contain

The ADR file lives at `docs/architecture/0013-hud-raster-rendering.md`. The existing format (from ADR-0001) uses a `## Amendments` section appended to the original ADR, with a heading like `### Amendment 1 — <title> (<date>, Specs v<N>)`. Study `docs/architecture/0001-layered-ui-model.md ##Amendments` for the exact template.

Amendment 1 must document these **five locked decision points** (verbatim from CONTEXT.md success criterion #1):

1. **Compositor model (Option B):** per-layer `OffscreenCanvas`, `drawImage` composition in z-order on master 400×200 canvas. Rationale: static/dynamic layer split is first-class; each layer is independently testable; `LayerManager` stays orchestrator-only.
2. **Capture-container re-mapping:** 5th container `'hud-capture'` is a **text container** with `isEventCapture:1` at full-screen size (not a zero-size container — undocumented). INV-5 is preserved; gesture routing unchanged. Cite: EvenHub first-app example uses text container as capture target.
3. **Container budget fixed mode:** in canvas mode, budget is FIXED at page creation (5 containers: 4 image + 1 capture text). `CanvasLayer.getContainerCount()` returns `{image:0, text:0}` (canvas layers don't allocate per-container). `_assertContainerBudget()` bypasses per-layer sum in canvas mode.
4. **Glyph fallback coexistence:** `LayerManager.renderMode: 'canvas' | 'glyph'`; glyph path is byte-identical to today (BLE-degraded ADR-0005 Branch A). Mode switch is atomic via `bundle([])`.
5. **`_flushPage()` schema selector:** `buildHudRasterPageSchema()` (5 containers) selected when `renderMode === 'canvas'`; `buildStatusViewTextContainers()` (3 containers) selected when `renderMode === 'glyph'`.

Also cite: INV-2 verification date (2026-06-05), source `hub.evenrealities.com/docs/guides/display`, geometry 400×200/200×100. Reference memory `g2-image-container-hard-limits`. Note the `human_needed` SC under ADR-0005 Branch A for hardware validation of the 400×200 region.

**Format template from ADR-0001 §Amendments:**
```markdown
## Amendments

### Amendment 1 — Canvas compositor substrate (2026-06-05, Specs v0.10.0)

**Status:** ACCEPTED — extends the raster HUD direction; does not overturn it.

**Trigger:** ...

**Decision:** ...

**Five locked decisions:**
1. ...
2. ...
...

**Consistency check vs original decision:**
- ✓ ...
- ⚠ ...

**INV-2 status:** ...
**Hardware SC:** ...
```

### Pattern 2: `CanvasCompositor` — File and Public API

**File:** `packages/g2-app/src/engine/canvas-compositor.ts`

**Owns:** a master 400×200 `OffscreenCanvas` (or `document.createElement('canvas')` fallback — same pattern as `acquireCanvas2d` in `hud-canvas-renderer.ts`).

**Public API:**

```typescript
// Source: ARCHITECTURE.md §Architecture: CanvasCompositor Component + CONTEXT.md

export interface CanvasCompositorLike {
  /** Register a layer's offscreen canvas in z-order. Called at bundle mount time. */
  registerLayer(z: ZIndex, canvas: OffscreenCanvas | HTMLCanvasElement): void;
  /** Deregister on layer destroy. */
  deregisterLayer(z: ZIndex): void;
  /** Mark a layer dirty so composite() repaints it on next call. */
  markDirty(z: ZIndex): void;
  /**
   * Composite all registered layers in ascending z-order via drawImage.
   * Returns 400*200*4 RGBA Uint8ClampedArray.
   * Clean layers are blitted from their last paint (dirty-skip optimization).
   */
  composite(): Uint8ClampedArray;
}

export class CanvasCompositor implements CanvasCompositorLike { ... }
```

**Key implementation notes:**
- The master canvas is 400×200 (FRAME_W × FRAME_H after the geometry migration).
- `composite()` iterates registered layers in ascending z-order (sorted by ZIndex value). For each layer: if `isDirty` flag is set, call `layer.paint()` first (Phase 20 provides real paint implementations; in Phase 19, no canvas layers are registered so `composite()` just returns a blank 400×200 RGBA buffer).
- `dirty-skip`: layers with no state change since last paint are skipped (their cached `OffscreenCanvas` is `drawImage`'d directly). This is the core perf win per ARCHITECTURE.md §Static/dynamic cache model.
- After iterating all layers, call `masterCtx.getImageData(0, 0, 400, 200)` to extract RGBA.
- `deactivate()` / `activate()` for glyph-mode suspension is optional in Phase 19 (no canvas layers are actually registered yet; the compositor simply returns blank RGBA if called).

**What is testable in happy-dom:**
- **Z-order ordering** — register layers at z=0, z=1, z=2 with spies on their `paint()` methods; assert `paint()` is called in ascending z order via `vi.fn()` call order.
- **Dirty-skip** — register a layer, call `composite()` once (layer is painted), call `composite()` again without `markDirty()`: assert `paint()` is called only ONCE total.
- **Serialization order** — `composite()` must complete before `pushHudTiles` is called; use spies.
- **Return shape** — `composite()` returns `Uint8ClampedArray` of length `400 * 200 * 4`.
- **Registration/deregistration** — `registerLayer` + `deregisterLayer` do not throw; registered layers appear in the composite.

**What is NOT testable in happy-dom:**
- Actual pixel draw (`ctx.drawImage`, `ctx.fillRect`, etc.) — `OffscreenCanvas` is not available in happy-dom. The compositor's canvas-acquisition must follow the same `acquireCanvas2d` fallback pattern as `hud-canvas-renderer.ts`: `if (typeof OffscreenCanvas !== 'undefined') { new OffscreenCanvas(w,h) } else if (typeof document !== 'undefined') { document.createElement('canvas') } else { throw ... }`. Tests can mock the canvas or test the logic-only code paths.

### Pattern 3: `CanvasLayer` Interface — Additive Extension to `layer-types.ts`

**File to modify:** `packages/g2-app/src/engine/layer-types.ts`

Append after the `OverlayPanel` interface definition. **No changes to existing `Layer`, `OverlayPanel`, `LayerOp`, `ZIndex`, `LayerManagerError`, or any of the `Raster*` types.**

```typescript
// Source: ARCHITECTURE.md §New: CanvasLayer sub-interface

/**
 * Canvas-rendering layer — extends Layer with per-layer OffscreenCanvas ownership.
 *
 * Implementations (CanvasStatusHudLayer, CanvasCharacterSheetPanel, etc. — Phase 20+)
 * own their own OffscreenCanvas; CanvasCompositor assembles them in z-order.
 *
 * getContainerCount() MUST return {image:0, text:0} for canvas layers — the 5-container
 * page schema is declared at page creation (fixed budget mode); canvas layers do NOT
 * allocate individual SDK containers (ADR-0013 Amendment 1, locked decision #3).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1
 * @see packages/g2-app/src/engine/canvas-compositor.ts (compositor counterpart)
 */
export interface CanvasLayer extends Layer {
  /**
   * Assign the OffscreenCanvas (or HTMLCanvasElement fallback) this layer paints on.
   * Called by LayerManager during bundle() after layer is registered.
   */
  attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): void;
  /**
   * Repaint the layer's canvas from current cached state.
   * CanvasCompositor calls this before blitting a dirty layer.
   */
  paint(): void;
  /**
   * True when the layer has un-flushed state changes since the last paint().
   * CanvasCompositor skips paint() for clean layers (dirty-skip optimization).
   */
  isDirty(): boolean;
}

/**
 * Runtime type guard — true when layer implements CanvasLayer.
 */
export function isCanvasLayer(layer: Layer): layer is CanvasLayer {
  return (
    typeof (layer as CanvasLayer).attachCanvas === 'function' &&
    typeof (layer as CanvasLayer).paint === 'function' &&
    typeof (layer as CanvasLayer).isDirty === 'function'
  );
}
```

**Important design note:** `getContainerCount()` on a `CanvasLayer` MUST return `{image:0, text:0}`. This is the signal to `_assertContainerBudget()` that the canvas-mode fixed budget applies. In Phase 19, no `CanvasLayer` implementations are added yet — the interface is only defined here. Phase 20 provides the first implementation.

### Pattern 4: `buildHudRasterPageSchema()` — Location and Shape

**File to modify:** `packages/g2-app/src/engine/container-registry.ts`

Add new entries to `CONTAINER_REGISTRY` for the HUD raster containers (`hud-tile-0..3` and `hud-capture`), and a new builder function. **Important:** the existing `map-tile-0..3` entries remain untouched — they are for the map raster path, not the HUD raster path. The HUD tiles use the SAME geometry (200×100, 2×2) but different container names and IDs.

**ID assignment decision:** The current registry has 4 image IDs (0-3 = map-tile-0..3) and 7 text IDs (4-10 = header/footer/status-hud/map-capture/z05-*). The HUD raster page schema is a **SEPARATE page** declared via `rebuildPageContainer` — not the same page as the default status-view. The IDs start at 0 within that page's namespace (the host assigns IDs in declaration order per the qm0 debug probe). Therefore `hud-tile-0..3` get IDs 0-3 and `hud-capture` gets ID 4 within the HUD raster page.

**Critically:** `buildHudRasterPageSchema()` does NOT put `hud-tile-*` into `CONTAINER_REGISTRY` if that registry is for the default base-page only. Given that the HUD raster page is a different page schema (activated by `rebuildPageContainer` from `_flushPage`), the cleanest approach is:
- Add `hud-tile-0..3` and `hud-capture` to `CONTAINER_REGISTRY` (so `resolveContainerId` works for them), OR
- Keep `buildHudRasterPageSchema()` self-contained with its own geometry literals (like `hud-poc-page.ts` does for the PoC path).

**Recommendation (per CONTEXT.md "Integration Points — `_flushPage()` is the innesto"):** Add the HUD raster containers to `CONTAINER_REGISTRY` so they participate in the single registry authority. This is consistent with the registry's stated purpose ("single source of truth"). The new entries:

```typescript
// In CONTAINER_REGISTRY:
'hud-tile-0': { id: 0, xPosition: 0,   yPosition: 0,   width: 200, height: 100, isEventCapture: 0, kind: 'image' },
'hud-tile-1': { id: 1, xPosition: 200, yPosition: 0,   width: 200, height: 100, isEventCapture: 0, kind: 'image' },
'hud-tile-2': { id: 2, xPosition: 0,   yPosition: 100, width: 200, height: 100, isEventCapture: 0, kind: 'image' },
'hud-tile-3': { id: 3, xPosition: 200, yPosition: 100, width: 200, height: 100, isEventCapture: 0, kind: 'image' },
// hud-capture: full-screen text container, isEventCapture=1, id=4 in HUD raster page
// xPosition/yPosition/width/height: full 576×288 (same as map-capture, which is the canonical capture-pattern)
'hud-capture': { id: 4, xPosition: 0, yPosition: 0, width: 576, height: 288, isEventCapture: 1, kind: 'text' },
```

**Note on `hud-capture` placement:** The CONTEXT.md decision says "full-screen text container with `isEventCapture:1` behind the 4 image tiles." The EvenHub first-app example uses a text container at full screen dimensions as the capture target. Use x=0, y=0, width=576, height=288 (full screen, behind image tiles which appear on top in z-order per the page schema). The final on-screen positioning is a Phase 20 decision; for Phase 19, full-screen is the safe default.

**The `buildHudRasterPageSchema()` function:**

```typescript
// Source: ARCHITECTURE.md §_flushPage() Mode-Dependent Schema + CONTEXT.md

export const HUD_RASTER_CONTAINER_TOTAL = 5; // 4 image + 1 text

/**
 * Build the production HUD raster page schema: 4 image tiles (hud-tile-0..3)
 * at 200×100 each + 1 full-screen text capture container (hud-capture).
 *
 * containerTotalNum: 5 — fixed budget, canvas mode (ADR-0013 Amendment 1).
 * This schema is selected by LayerManager._flushPage() when renderMode === 'canvas'.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (5-container schema)
 * @see packages/g2-app/src/engine/layer-manager.ts (_flushPage consumer)
 */
export function buildHudRasterPageSchema(): {
  containerTotalNum: number;
  imageObject: ImageContainerProperty[];
  textObject: TextContainerProperty[];
} { ... }
```

### Pattern 5: `LayerManager` Modifications

**File to modify:** `packages/g2-app/src/engine/layer-manager.ts`

**Current `_flushPage()` body (lines 466-477):**
```typescript
private async _flushPage(): Promise<void> {
  const payload = new RebuildPageContainer({
    containerTotalNum: BOOT_CONTAINER_TOTAL,
    textObject: buildStatusViewTextContainers(),
    imageObject: [],
  });
  await this.bridge.rebuildPageContainer(payload);
}
```
There is a `TODO(j0t-05)` comment at lines 456-461 that explicitly anticipates this exact change: *"when map mode is gesture-opened (Phase 20), this flush will need a different schema depending on which mode is active. At that point extract a `_buildCurrentPageSchema()` helper that selects between the status-view schema (3 containers) and the map-mode schema (11 containers)."*

**New `renderMode` field (add after `mapMode`):**
```typescript
/** Canvas vs glyph rendering mode (ADR-0013 Amendment 1). Default 'glyph' until canvas infrastructure lands. */
private renderMode: 'canvas' | 'glyph' = 'glyph';

/** CanvasCompositor — injected at construction when renderMode='canvas'. Null in glyph mode. */
private readonly compositor: CanvasCompositorLike | null;
```

**Constructor change:**
```typescript
constructor(
  private readonly bridge: EvenAppBridge,
  private readonly debugMirror?: DebugMirror,
  compositor?: CanvasCompositorLike, // optional injection; null = glyph-only mode
) {
  this.compositor = compositor ?? null;
}
```

**New `setRenderMode()` + `getRenderMode()`:**
```typescript
setRenderMode(mode: 'canvas' | 'glyph'): void {
  this.renderMode = mode;
}
getRenderMode(): 'canvas' | 'glyph' {
  return this.renderMode;
}
```

**Updated `_flushPage()` — the schema selector:**
```typescript
private async _flushPage(): Promise<void> {
  const schema = this.renderMode === 'canvas'
    ? buildHudRasterPageSchema()   // 4 image tiles + 1 capture text = 5 containers
    : {                             // existing glyph status-view schema (byte-identical)
        containerTotalNum: BOOT_CONTAINER_TOTAL,
        textObject: buildStatusViewTextContainers(),
        imageObject: [] as never[],
      };
  const payload = new RebuildPageContainer(schema);
  await this.bridge.rebuildPageContainer(payload);
  if (this.renderMode === 'canvas') {
    await this._compositeAndPush();
  }
}
```

**New `_compositeAndPush()` — serialized tile push:**
```typescript
private async _compositeAndPush(): Promise<void> {
  if (this.compositor === null) return;
  const rgba = this.compositor.composite(); // 400*200*4 RGBA
  const tiles = buildHudTiles(rgba);        // 4 × HudTile (hud-raster-frame.ts, UNCHANGED)
  await pushHudTiles(this.bridge, tiles);   // serialized (hud-poc-page.ts, UNCHANGED)
}
```

**Updated `_assertContainerBudget()` — canvas fixed-budget branch:**
```typescript
private _assertContainerBudget(): void {
  if (this.renderMode === 'canvas') {
    // Canvas mode: fixed 5-container budget declared at page creation.
    // CanvasLayer.getContainerCount() returns {image:0, text:0} — per-layer sum
    // is always 0; the real budget is enforced by the fixed schema, not per-layer.
    // No overflow possible; assert always passes. Still verify no rogue layer
    // declares non-zero image/text (would indicate a mis-classified glyph layer).
    for (const layer of this.layers.values()) {
      const cnt = layer.getContainerCount?.() ?? { image: 0, text: 1 };
      if (cnt.image > 0 || cnt.text > 0) {
        throw new LayerManagerError(
          'panel_mount_budget_exceeded',
          `canvas mode: layer ${layer.id} declared non-zero container count ${JSON.stringify(cnt)}; canvas layers must return {image:0, text:0}`,
        );
      }
    }
    return;
  }
  // Glyph mode: existing per-layer sum (UNCHANGED)
  let img = 0;
  let txt = 0;
  for (const layer of this.layers.values()) {
    const cnt = layer.getContainerCount?.() ?? { image: 0, text: 1 };
    img += cnt.image;
    txt += cnt.text;
  }
  if (img > 4 || txt > 8) {
    throw new LayerManagerError(
      'panel_mount_budget_exceeded',
      `container budget exceeded: ${img} image (max 4) + ${txt} text (max 8); see ADR-0009 Amendment 1`,
    );
  }
}
```

**Required new imports for `layer-manager.ts`:**
```typescript
import {
  BOOT_CONTAINER_TOTAL,
  buildHudRasterPageSchema,   // new
  HUD_RASTER_CONTAINER_TOTAL, // new constant
  buildStatusViewTextContainers,
} from './container-registry.js';
import type { CanvasCompositorLike } from './canvas-compositor.js'; // new
import { buildHudTiles } from '../hud/hud-raster-frame.js';         // new
import { pushHudTiles } from '../hud/hud-poc-page.js';               // new
```

### Pattern 6: `HUD_TILE_GEOMETRY` Migration (288×144 → 200×100)

**File to modify:** `packages/g2-app/src/hud/hud-raster-frame.ts`

**Current constants (lines 40-48):**
```typescript
const FRAME_W = 576;
const FRAME_H = 288;
const TILE_W = 288;   // ← MUST CHANGE to 200
const TILE_H = 144;   // ← MUST CHANGE to 100
const TILES_PER_FRAME = 4;
```

**After migration:**
```typescript
/** Raster surface width (4 tiles × 100px each = 400px). INV-2 verified 2026-06-05. */
const FRAME_W = 400;
/** Raster surface height (2 tiles × 100px each = 200px). INV-2 verified 2026-06-05. */
const FRAME_H = 200;
/** Tile width — max per Even Realities image container spec (hub.evenrealities.com/docs/guides/display). */
const TILE_W = 200;
/** Tile height — max per Even Realities image container spec. */
const TILE_H = 100;
const TILES_PER_FRAME = 4;
```

**`HUD_TILE_GEOMETRY` array (lines 111-130):** All `width`/`height` references update to 200×100; `x` positions update to use TILE_W (200); `y` positions update to use TILE_H (100). The diagram in the JSDoc comment also updates.

**`buildHudTiles` validation (line 229):** The expected length check changes from `576*288*4` to `400*200*4`.

**`splitIntoTiles` (lines 185-201):** Already parameterized via `FRAME_W/FRAME_H/TILE_W/TILE_H` — no changes needed if the constants are updated.

**`ditherTile` (line 168):** The `ImageQ.utils.PointContainer.fromUint8Array(rgba, TILE_W, TILE_H)` call uses the constants; auto-updated.

**Placement parameterization:** `HUD_TILE_GEOMETRY.xPosition/yPosition` currently embeds on-screen position as tile-relative (left/right split). For Phase 19, the tile placement within the 576×288 screen is parameterized but not yet decided — the tiles' own internal geometry (200×100) is correct; the on-screen offset (where the 400×200 region appears in 576×288) is a Phase 20 decision. For Phase 19, the `HudTileGeometryEntry` interface gains an **optional** note about on-screen offset being TBD, but the actual `xPosition/yPosition` values stay as-is (0,0 / 200,0 / 0,100 / 200,100) relative to the raster region origin. `hud-poc-page.ts` passes these through to `ImageContainerProperty`.

**`hud-poc-page.ts` update:** `HUD_POC_CONTAINERS` is derived from `HUD_TILE_GEOMETRY.map(...)` (line 89), so it auto-inherits the 200×100 geometry. The test at `hud-poc-page.test.ts` currently asserts `width: 288, height: 144` — these tests MUST be updated to `width: 200, height: 200` (wait — `width: 200, height: 100`). This is a deliberate test update, not a regression.

### Pattern 7: Serialized `pushHudTiles` — Already Correct

**File:** `packages/g2-app/src/hud/hud-poc-page.ts`

The existing `pushHudTiles` implementation (lines 197-215) already uses `for...of` with `await bridge.updateImageRawData(payload)` per tile — this is sequential (serialized). The PoC push is already correct. No functional change needed.

The only change: the function is promoted from "PoC-only" to "production path" by being called from `LayerManager._compositeAndPush()`. The JSDoc should be updated to remove the "PoC" qualifier.

### Anti-Patterns to Avoid

- **Concurrent tile push:** Do NOT use `Promise.all([tile0Push, tile1Push, tile2Push, tile3Push])`. The SDK rejects concurrent `updateImageRawData` calls. The existing `for...of` loop is correct.
- **Building `CanvasCompositor` as a singleton:** Inject it into `LayerManager` via constructor parameter. No module-level singleton lookup. Matches the existing `bridge` injection pattern.
- **Calling `_assertContainerBudget()` before `_assertCaptureInvariant()`:** ADR-0009 Amendment 1 and the existing test `LMT-CB-03` pin this ordering. Capture assertion runs first.
- **Adding `hud-tile-*` to the default status-view schema:** The 5-container HUD schema is ONLY activated in canvas mode by `_flushPage()`. The default status-view 3-container schema (`buildStatusViewTextContainers()`) must remain unchanged.
- **Deleting glyph-mode containers from registry:** `map-capture`, `z05-*`, `header`, `footer`, `status-hud` must remain in `CONTAINER_REGISTRY` — the glyph path uses them.
- **Passing `new RebuildPageContainer(buildHudRasterPageSchema())` before adding `hud-capture` to registry:** The `resolveContainerId('hud-capture')` call in the builder would return `undefined` without the registry entry. Add registry entry first.
- **Using `document.createElement('canvas')` in `CanvasCompositor` without the OffscreenCanvas fallback:** Follow the exact pattern from `acquireCanvas2d` in `hud-canvas-renderer.ts` (lines 126-154).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Composite z-order via drawImage | Custom pixel compositing loop | Native `OffscreenCanvas.getContext('2d').drawImage()` | GPU blit; already proven in `hud-canvas-renderer.ts` |
| Dirty tracking | Complex change-detection tree | Simple `boolean _dirty` flag per layer + `markDirty(z)` on the compositor | Sufficient for 2-3 canvas layers; no retained-mode scene graph needed |
| Layer ordering guarantee | Explicit sorted array maintenance | `[...Map.entries()].sort(([a],[b]) => a-b)` (same pattern as `getTopLayer()` in `layer-manager.ts` line 408) | Map iteration is insertion-order, not z-order; RESEARCH Pitfall 2 already documented this |
| 4-bit PNG encode | Custom PNG encoder | `UPNG.encode` in `buildHudTiles` (already exists, UNCHANGED) | Proven, tested pipeline |
| Dither greyscale palette | Custom dithering | `image-q` + `buildGreyscalePalette` in `hud-raster-frame.ts` (UNCHANGED) | Same reason |

---

## Common Pitfalls

### Pitfall 1: `_assertContainerBudget()` false-fires in canvas mode

**What goes wrong:** If `_assertContainerBudget()` is NOT updated for canvas mode, it sums `getContainerCount()` across all layers. `MapBaseLayer.getContainerCount()` returns `{image:4, text:1}` in raster mode — which exactly hits the 4-image cap and would falsely trigger `panel_mount_budget_exceeded` when any other layer is mounted with `{image:0, text:0}`. But more importantly: in canvas mode the per-layer sum is meaningless (the containers are fixed at page creation).

**Why it happens:** The budget assertion was designed for glyph mode where each layer owns individual containers. Canvas mode has a fixed schema.

**How to avoid:** Add the `renderMode === 'canvas'` branch to `_assertContainerBudget()` (Pattern 5 above). The canvas branch checks that each layer returns `{image:0, text:0}` — validating adherence to the contract, not summing toward a cap.

**Warning signs:** Tests that mount layers in canvas mode throw `panel_mount_budget_exceeded`.

### Pitfall 2: `_flushPage()` called in canvas mode with no compositor

**What goes wrong:** If `LayerManager` is constructed without a `CanvasCompositorLike` but `renderMode` is set to `'canvas'`, `_compositeAndPush()` would try to call `this.compositor.composite()` on null.

**Why it happens:** Optional compositor injection + unconditional renderMode setter.

**How to avoid:** Guard `_compositeAndPush()` with `if (this.compositor === null) return;`. Also, `setRenderMode('canvas')` could throw if `this.compositor === null`. Decide which contract to enforce. Recommendation: null-guard in `_compositeAndPush()` is sufficient; the Phase 19 default `renderMode = 'glyph'` ensures canvas mode is never triggered accidentally.

**Warning signs:** `TypeError: Cannot read properties of null (reading 'composite')` at runtime.

### Pitfall 3: `buildHudTiles` buffer size mismatch after geometry migration

**What goes wrong:** `buildHudTiles` validates `rgba.length === FRAME_W * FRAME_H * 4`. Before migration: `576*288*4 = 663552`. After: `400*200*4 = 320000`. If `CanvasCompositor.composite()` returns a 663552-byte buffer (old geometry), `buildHudTiles` throws.

**Why it happens:** `hud-canvas-renderer.ts` still uses `const FRAME_W = 576` and creates a 576×288 canvas. Phase 19 does NOT change `renderHudFrame()` (that's Phase 20). But `CanvasCompositor.composite()` must return the NEW 400×200 RGBA.

**How to avoid:** `CanvasCompositor` creates the master canvas at 400×200. `composite()` returns `getImageData(0, 0, 400, 200).data` → length 320000. `buildHudTiles` validation must use the new constants. The old `renderHudFrame()` (576×288) is NOT called in Phase 19's canvas path — in Phase 19, no canvas layers are registered, so `composite()` just returns a blank 400×200 buffer.

**Warning signs:** `buildHudTiles: rgba buffer has wrong length N; expected 400*200*4 = 320000`.

### Pitfall 4: Test updates not propagating to geometry assertions

**What goes wrong:** `hud-poc-page.test.ts` asserts `width: 288, height: 144` for `HUD_POC_CONTAINERS`. After migrating `HUD_TILE_GEOMETRY` to 200×100, these tests fail.

**Why it happens:** `HUD_POC_CONTAINERS` is derived from `HUD_TILE_GEOMETRY` — the geometry change is correct, but the test fixtures must be updated.

**How to avoid:** When updating `HUD_TILE_GEOMETRY`, immediately update all test assertions that reference tile sizes. Run `pnpm test` to catch all affected assertions. The test changes are intentional (geometry correction), not regressions.

**Warning signs:** `hud-poc-page.test.ts` fails with `Expected: 288 / Received: 200`.

### Pitfall 5: `hud-capture` ID collision with `map-capture` in the same page

**What goes wrong:** Both `map-capture` (id=7) and `hud-capture` (id=4) could be declared in the same page schema if not careful. The glyph-mode 3-container schema (`header/footer/status-hud`) does NOT include `map-capture` (as discovered in the j0t-05 debug session). The canvas-mode 5-container schema must NOT include `map-capture`.

**Why it happens:** The registry has both entries; a careless "include all" loop would add both.

**How to avoid:** `buildHudRasterPageSchema()` is a dedicated function that only includes `hud-tile-0..3` and `hud-capture`. It does NOT call `buildBaseImageContainers()` (which returns `map-tile-0..3`). The function is explicit about its container set.

**Warning signs:** G2 host rejects the page schema with a capture-conflict error; two containers with `isEventCapture=1` in the same page.

### Pitfall 6: Layer z-order iteration relies on Map insertion order

**What goes wrong:** `CanvasCompositor.composite()` iterates layers from z=0 (bottom) to z=2 (top). If layers were registered out of z-order (common in tests and in the differential-demolish logic), the composite order would be wrong.

**Why it happens:** `Map` iteration is insertion-order, not numeric z-order (RESEARCH Pitfall 2, documented in `layer-manager.ts` line 406 comment + `getTopLayer()` fix).

**How to avoid:** In `CanvasCompositor.composite()`, sort registered layers by ZIndex value before iterating: `[...this.layers.entries()].sort(([a], [b]) => a - b)`. Exact same pattern as `LayerManager.getTopLayer()`.

---

## Code Examples

### `_flushPage()` — Mode-Dependent Schema Selector

```typescript
// Source: ARCHITECTURE.md §_flushPage() Mode-Dependent Schema (verified against layer-manager.ts)
private async _flushPage(): Promise<void> {
  const schema = this.renderMode === 'canvas'
    ? buildHudRasterPageSchema()
    : {
        containerTotalNum: BOOT_CONTAINER_TOTAL,
        textObject: buildStatusViewTextContainers(),
        imageObject: [] as never[],
      };
  const payload = new RebuildPageContainer(schema);
  await this.bridge.rebuildPageContainer(payload);
  if (this.renderMode === 'canvas') {
    await this._compositeAndPush();
  }
}
```

### `buildHudRasterPageSchema()` — 5-Container Schema

```typescript
// Source: ARCHITECTURE.md §Component Inventory + CONTEXT.md locked decision #2
// Container IDs: images 0-3 first, then text id=4 (hud-capture)
export function buildHudRasterPageSchema() {
  const hudTileNames = ['hud-tile-0', 'hud-tile-1', 'hud-tile-2', 'hud-tile-3'];
  const imageObject = hudTileNames.map((name) => {
    const e = CONTAINER_REGISTRY[name]!;
    return new ImageContainerProperty({
      containerID: e.id,
      containerName: name,
      xPosition: e.xPosition,
      yPosition: e.yPosition,
      width: e.width,
      height: e.height,
    });
  });
  const captureEntry = CONTAINER_REGISTRY['hud-capture']!;
  const textObject = [
    new TextContainerProperty({
      containerID: captureEntry.id,
      containerName: 'hud-capture',
      xPosition: captureEntry.xPosition,
      yPosition: captureEntry.yPosition,
      width: captureEntry.width,
      height: captureEntry.height,
      isEventCapture: 1,
    }),
  ];
  return { containerTotalNum: HUD_RASTER_CONTAINER_TOTAL, imageObject, textObject };
}
```

### `CanvasCompositor.composite()` — Z-Order Sort

```typescript
// Source: ARCHITECTURE.md §Architecture: CanvasCompositor Component + layer-manager.ts getTopLayer() pattern
composite(): Uint8ClampedArray {
  const masterCtx = this._masterCtx;
  // Sort ascending z-order (same pattern as LayerManager.getTopLayer())
  const sorted = [...this._layers.entries()].sort(([a], [b]) => a - b);
  for (const [z, entry] of sorted) {
    if (entry.isDirty) {
      entry.layer.paint(); // Layer repaints its own OffscreenCanvas
      entry.isDirty = false;
    }
    masterCtx.drawImage(entry.canvas, 0, 0);
  }
  const imageData = masterCtx.getImageData(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  return new Uint8ClampedArray(imageData.data.buffer.slice(0));
}
```

### `HUD_TILE_GEOMETRY` — Updated Constants

```typescript
// Source: REQUIREMENTS.md ⚠ INV-2 Geometry Correction banner + hud-raster-frame.ts (current shape)
// BEFORE (PoC only, simulator-only confirmed):
const FRAME_W = 576; const FRAME_H = 288; const TILE_W = 288; const TILE_H = 144;
// AFTER (INV-2 verified 2026-06-05, hub.evenrealities.com/docs/guides/display):
const FRAME_W = 400; const FRAME_H = 200; const TILE_W = 200; const TILE_H = 100;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 576×288 / 288×144 tile geometry (PoC) | 400×200 / 200×100 (INV-2 verified) | 2026-06-05 | `buildHudTiles` validation length, all geometry constants, test fixtures |
| 4-container PoC page (no capture container) | 5-container fixed page (4 image + 1 text capture) | Phase 19 | INV-5 satisfied in canvas mode |
| Per-layer container budget sum | Fixed-budget canvas mode + per-layer sum glyph mode | Phase 19 | No false `panel_mount_budget_exceeded` in canvas mode |
| Single `_flushPage()` schema (3-text status-view) | `renderMode`-selected schema | Phase 19 | Canvas mode gets raster schema; glyph stays byte-identical |
| `pushHudTiles` called from PoC boot path only | `pushHudTiles` called from `LayerManager._compositeAndPush()` | Phase 19 | Production path promoted |

**Deprecated/outdated:**
- `createHudPocPage()` in `hud-poc-page.ts`: The PoC used `createStartUpPageContainer`; production uses `rebuildPageContainer` from `_flushPage()`. The PoC boot path (`boot-hud-raster-poc.ts`) stays as a `?hud=raster` dev path in Phase 19 — not deleted. `createHudPocPage` is retained for the PoC path.
- `buildHudPocPageSchema()`: Remains as-is for the PoC path. `buildHudRasterPageSchema()` is the production variant (5 containers, not 4).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `hud-capture` text container at full-screen size (576×288) behind image tiles satisfies INV-5 on real G2 hardware | Pattern 4 / RAST-02 | Capture routing might fail on hardware; `human_needed` SC under ADR-0005 Branch A already accounts for this |
| A2 | On-screen placement of `hud-tile-0..3` at (0,0)/(200,0)/(0,100)/(200,100) is acceptable as Phase 19 default; Phase 20 will reposition to the final on-screen location | Pattern 6 | Visual positioning may be wrong until Phase 20; no functionality risk since Phase 19 pushes blank/empty tiles |
| A3 | The `CanvasCompositor` constructor can use the same `acquireCanvas2d`-style fallback for the master 400×200 canvas | Pattern 2 | If `OffscreenCanvas` + `document.createElement('canvas')` both unavailable in test environment, compositor tests need mocking |

---

## Open Questions

1. **`CanvasCompositor` default renderMode**
   - What we know: `renderMode` defaults to `'glyph'` per this design. Canvas mode is never active in Phase 19 (no canvas layers registered). The compositor is a stub.
   - What's unclear: Should `setRenderMode('canvas')` be callable in Phase 19 tests to validate the schema switch, even though `composite()` returns a blank buffer?
   - Recommendation: Yes — validate the schema-select logic in tests by calling `setRenderMode('canvas')` and asserting `rebuildPageContainer` was called with `containerTotalNum:5`. The blank RGBA from `composite()` is acceptable for Phase 19.

2. **`hud-capture` geometry on real hardware**
   - What we know: Full-screen text container (576×288) is the canonical pattern from EvenHub first-app docs. `map-capture` uses x=0, y=27, width=576, height=234 (not full-screen due to the j0t-05 redesign). `hud-capture` should be the full 576×288 since the HUD raster page replaces the entire screen.
   - What's unclear: Whether the host requires the capture container to have zero overlap with image containers, or whether it's fine for it to be behind them.
   - Recommendation: Use full-screen 576×288 for `hud-capture`. The G2 host renders containers in declaration order; image tiles declared first will visually appear on top of the text container.

3. **`LayerManager` constructor signature change — backward compat**
   - What we know: Adding `compositor?: CanvasCompositorLike` as a 3rd optional parameter to the constructor. The existing production call sites (e.g., `boot-engine-core.ts`) must be updated to pass the compositor. Test call sites (layer-manager.test.ts) continue working without the compositor (glyph mode default).
   - Recommendation: Optional 3rd parameter with `undefined` default. All existing test `new LayerManager(bridge, debugMirror)` calls continue to compile. Boot path passes the real compositor.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@evenrealities/even_hub_sdk` | `RebuildPageContainer`, `TextContainerProperty`, `ImageContainerProperty` | ✓ (already installed) | 0.0.10 | — |
| `OffscreenCanvas` (platform API) | `CanvasCompositor` master canvas | ✓ (WKWebView Safari 16.2+) | platform | `document.createElement('canvas')` (same as `acquireCanvas2d`) |
| `image-q` | `hud-raster-frame.ts` (unchanged) | ✓ | 4.0.0 | — |
| `upng-js` | `hud-raster-frame.ts` (unchanged) | ✓ | 2.1.0 | — |

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (workspace root) |
| Quick run command | `pnpm test --reporter=verbose 2>&1 \| grep -E "(PASS\|FAIL\|✓\|✗)"` |
| Full suite command | `pnpm test` |
| Coverage command | `pnpm test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RAST-01 | `CanvasCompositor.composite()` returns 400×200×4 RGBA; tiles pushed to bridge serialized | unit | `pnpm test --project @evf/g2-app` | ❌ Wave 0: `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` |
| RAST-01 | `LayerManager._compositeAndPush()` calls `buildHudTiles` then `pushHudTiles` in order | unit | same | ❌ additions to `layer-manager.test.ts` |
| RAST-01 | `buildHudTiles` validates `rgba.length === 400*200*4` | unit | `pnpm test --project @evf/g2-app` | ✅ `hud-raster-frame.test.ts` (update geometry assertion) |
| RAST-02 | `buildHudRasterPageSchema()` returns `containerTotalNum:5`, `textObject` has 1 entry with `isEventCapture:1` named `'hud-capture'` | unit | same | ❌ Wave 0: `packages/g2-app/src/engine/__tests__/container-registry.test.ts` (additive) |
| RAST-03 | `_assertContainerBudget()` in canvas mode: layer with `{image:0,text:0}` does NOT throw; layer with `{image:1,text:0}` throws | unit | same | ❌ additions to `layer-manager.test.ts` |
| RAST-03 | `_assertContainerBudget()` in glyph mode: existing behavior byte-identical | unit | same | ✅ existing `layer-manager.test.ts` tests continue to pass |
| RAST-04 | `_flushPage()` in glyph mode calls `rebuildPageContainer` with `containerTotalNum:3`; no `_compositeAndPush` | unit | same | ✅ existing layer-manager tests pin this behavior |
| RAST-04 | `_flushPage()` in canvas mode calls `rebuildPageContainer` with `containerTotalNum:5` then `_compositeAndPush` | unit | same | ❌ new test in `layer-manager.test.ts` |
| RAST-05 | ADR-0013 Amendment 1 text exists in `docs/architecture/0013-hud-raster-rendering.md` | doc check | `grep -c "Amendment 1" docs/architecture/0013-hud-raster-rendering.md` (≥1) | ❌ Wave 0 |
| RINV-02 | `HUD_TILE_GEOMETRY[*].width === 200` and `.height === 100` | unit | `pnpm test --project @evf/g2-app` | ✅ `hud-poc-page.test.ts` (update assertions to 200×100) |
| RINV-02 | `HUD_POC_CONTAINERS[1].xPosition === 200` (tile 1 right-column offset correct after resize) | unit | same | ✅ update existing test |

**Compositor-specific testable behaviors (all in happy-dom):**

| Behavior | Test ID | What to Assert |
|----------|---------|----------------|
| Z-order: layers composited in ascending z-order | CC-01 | Register z=2 first, z=0 second; call `composite()`; assert z=0 `paint()` called before z=2 via `vi.fn()` call order |
| Dirty-skip: clean layer `paint()` not called twice | CC-02 | Register 1 layer; call `composite()` (layer painted); call `composite()` again; assert `paint()` call count = 1 |
| Dirty propagation: `markDirty(z)` causes repaint | CC-03 | Call `composite()` (layer clean); call `markDirty(z)`; call `composite()` again; assert `paint()` count = 2 |
| Return shape: `composite()` returns Uint8ClampedArray length 400\*200\*4 | CC-04 | `expect(compositor.composite()).toHaveLength(320000)` — requires mock canvas or patching `acquireCanvas2d` |
| Deregister: deregistered layer not composited | CC-05 | Register + deregister; call `composite()`; assert `paint()` never called |
| Serial push: `pushHudTiles` tiles pushed one-by-one | CM-01 | Spy on `bridge.updateImageRawData`; assert called 4 times in sequence (not concurrently) |

**Tests that are `manual_only` (hardware SC):**

| SC | Behavior | Reason |
|----|----------|--------|
| RINV-02-HW | 400×200 region renders correctly on real G2 (not simulator) | No hardware available; `human_needed` under ADR-0005 Branch A |
| RAST-02-HW | `hud-capture` text container routes R1 gestures on real G2 | No hardware available; same reason |

### Sampling Rate

- **Per task commit:** `pnpm test --project @evf/g2-app` (g2-app tests only, ~15s)
- **Per wave merge:** `pnpm test` (full workspace)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` — covers RAST-01 + CC-01..05
- [ ] Additions to `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — covers RAST-03/04 canvas-mode branches + CM-01
- [ ] Additions to `packages/g2-app/src/engine/__tests__/container-registry.test.ts` — covers RAST-02 (`buildHudRasterPageSchema` schema shape)
- [ ] Updates to `packages/g2-app/src/hud/hud-poc-page.test.ts` — update geometry assertions 288×144 → 200×100 (RINV-02)
- [ ] Updates to `packages/g2-app/src/hud/hud-raster-frame.test.ts` — update validation length assertion + HUD_TILE_GEOMETRY geometry assertions (RINV-02 + RAST-01)

---

## Security Domain

This phase introduces no authentication surfaces, input parsing, network endpoints, or cryptographic operations. `security_enforcement` applies to the overall project, but Phase 19 changes are internal rendering infrastructure with no security-relevant surface (no user input paths, no network calls, no secret handling). The only external call is `bridge.updateImageRawData` and `bridge.rebuildPageContainer`, which are existing SDK calls already in the trust boundary.

Not applicable — internal rendering substrate only.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 19 |
|-----------|-------------------|
| INV-1: every ASCII mockup / runtime layout must align character-perfect | Phase 19 has no visible UI change; glyph path byte-identical; INV-1 fixtures must not break |
| INV-2: every technical claim cites canonical upstream source | `HUD_TILE_GEOMETRY` migration cites `hub.evenrealities.com/docs/guides/display` + INV-2 2026-06-05 |
| INV-3: Specs.md + README + showcase update in same commit for cross-cutting changes | Phase 19 is infrastructure-only; no Specs.md version bump required (Phase 26 = INV-3 doc coherence) |
| INV-4: zero dead/unreachable code; `// TODO` requires `(#issue)` or `(ADR-NNNN)` | Remove the `TODO(j0t-05)` comment from `_flushPage()` when the selector is implemented; replace with ADR cite |
| CI Gate 8: socketlib handler count = 17 | Phase 19 is render-only, no socketlib changes; count preserved |
| Biome 2.4.15 lint passes | All new/modified files pass `pnpm lint:ci` |
| TypeScript strict + noUnusedLocals/noUnusedParameters | All new types and functions must be referenced; no stubs left unused |
| Conventional Commits + commitlint | Commit messages follow `feat(g2-app):` / `docs(architecture):` convention |
| `pnpm test:coverage` ≥ 80% | New classes (`CanvasCompositor`) must have test coverage above threshold |
| ADR-0013 Amendment 1 before implementation merge | The amendment is success criterion #1; it is a task prerequisite, not a deliverable after |

---

## Sources

### Primary (HIGH confidence — codebase verified)

- `packages/g2-app/src/engine/layer-manager.ts` — `_flushPage()` body (lines 466-477), `_assertContainerBudget()` (lines 363-377), `bundle()` flow (lines 204-298), `TODO(j0t-05)` comment (lines 456-461)
- `packages/g2-app/src/engine/layer-types.ts` — `Layer` interface, `ZIndex` enum, `OverlayPanel`, `LayerOp`, `LayerManagerError`
- `packages/g2-app/src/engine/container-registry.ts` — `CONTAINER_REGISTRY`, `buildStatusViewTextContainers()`, `BOOT_CONTAINER_TOTAL=3`, existing geometry (200×100 for map-tiles, 27px for text)
- `packages/g2-app/src/hud/hud-raster-frame.ts` — `HUD_TILE_GEOMETRY` (TILE_W=288, TILE_H=144), `buildHudTiles()`, `splitIntoTiles()`, `ditherTile()`
- `packages/g2-app/src/hud/hud-poc-page.ts` — `buildHudPocPageSchema()`, `HUD_POC_CONTAINERS`, `pushHudTiles()` (already serialized via `for...of` + `await`)
- `packages/g2-app/src/hud/hud-canvas-renderer.ts` — `acquireCanvas2d()` fallback pattern (lines 126-154), `renderHudFrame()` RGBA extraction pattern
- `packages/g2-app/src/raster/map-base-layer.ts` — `getCaptureContainer()` returns `'map-capture'`, `getContainerCount()` mode-aware pattern
- `docs/architecture/0001-layered-ui-model.md` — Amendment format template, INV-5 capture-invariant, z-stack model
- `docs/architecture/0013-hud-raster-rendering.md` — Original ADR to amend; current scope/decision/consequences
- `.planning/phases/EVF-19-adr-0013-amendment-1-canvas-compositor-core/19-CONTEXT.md` — All locked decisions
- `.planning/REQUIREMENTS.md` — RAST-01..05, RINV-02 + INV-2 geometry correction banner
- `.planning/research/ARCHITECTURE.md` — Component inventory, build order, data flow diagrams, Option B rationale
- `.planning/research/SUMMARY.md` — INV-2 geometry correction, pitfall catalogue, phase ordering rationale

### Secondary (MEDIUM confidence — architectural documents)

- `hub.evenrealities.com/docs/guides/display` — G2 image container size limits: max 4 per page, each 20–200px × 20–100px (cited in REQUIREMENTS.md INV-2 banner; not fetched in this session as the correction was already applied upstream)

---

## Metadata

**Confidence breakdown:**
- ADR Amendment 1 content: HIGH — all 5 locked decision points are verbatim from CONTEXT.md + ARCHITECTURE.md
- `CanvasCompositor` API: HIGH — sourced from ARCHITECTURE.md + verified against existing `acquireCanvas2d` pattern
- `CanvasLayer` interface: HIGH — additive extension, no existing interface changes
- `buildHudRasterPageSchema()` shape: HIGH — 5-container schema per locked decision; registry pattern is established
- `LayerManager` modifications: HIGH — `_flushPage()` body is directly in the codebase; `TODO(j0t-05)` anticipates exactly this change
- `HUD_TILE_GEOMETRY` migration: HIGH — INV-2 correction is locked and upstream-verified; constants are directly in source
- Test strategy: HIGH — models after existing `layer-manager.test.ts`, `hud-poc-page.test.ts` patterns

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable infrastructure domain; the geometry correction is locked by INV-2 verification)
