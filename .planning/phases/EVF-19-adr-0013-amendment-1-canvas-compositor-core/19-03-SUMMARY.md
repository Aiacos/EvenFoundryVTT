---
phase: 19-adr-0013-amendment-1-canvas-compositor-core
plan: "03"
subsystem: g2-app/engine
tags: [canvas-compositor, layer-types, container-registry, raster, RAST-01, RAST-02]
dependency_graph:
  requires: ["19-01", "19-02"]
  provides: ["canvas-compositor.ts", "CanvasLayer interface", "buildHudRasterPageSchema"]
  affects: ["layer-manager.ts (plan 19-04)", "packages/g2-app/src/hud/*"]
tech_stack:
  added: []
  patterns:
    - "CanvasCompositor: per-layer OffscreenCanvas → drawImage composite in ascending ZIndex order"
    - "dirty-skip: boolean flag per registered layer entry; cleared after composite(), set by markDirty()"
    - "_testSetMasterContext: escape hatch replacing null sentinel in test environments (happy-dom)"
    - "BASE_NAMES set: separates 11 base registry entries from HUD raster entries in buildBaseImageContainers/buildBaseTextContainers"
key_files:
  created:
    - packages/g2-app/src/engine/canvas-compositor.ts
    - packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts
    - packages/g2-app/src/engine/__tests__/layer-types-canvas.test.ts
  modified:
    - packages/g2-app/src/engine/layer-types.ts
    - packages/g2-app/src/engine/container-registry.ts
    - packages/g2-app/src/engine/__tests__/container-registry.test.ts
decisions:
  - "BASE_NAMES: adding HUD raster entries to shared CONTAINER_REGISTRY required a BASE_NAMES filter set to prevent hud-capture (kind:text, isEventCapture:1) bleeding into buildBaseTextContainers() and breaking REG-4"
  - "_testSetMasterContext null-sentinel: constructor attempts eager canvas acquisition, catches failure, leaves null; tests inject via escape hatch before composite(). This avoids the constructor throwing in happy-dom (document.createElement canvas getContext returns null)"
  - "CanvasCompositorLike.registerLayer takes (z, canvas, layer) — the canvas is the layer's own surface, not the master; matches RESEARCH Pattern 2 with OffscreenCanvas | HTMLCanvasElement parameter"
metrics:
  duration: "~9 minutes"
  completed: "2026-06-05T18:02:43Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 6
---

# Phase 19 Plan 03: CanvasCompositor + CanvasLayer + buildHudRasterPageSchema Summary

**One-liner:** Canvas compositor substrate (400×200 master, z-order dirty-skip) + CanvasLayer interface + 5-container HUD raster page schema (4 image tiles + 1 full-screen text capture).

## What Was Built

### Task 1: CanvasCompositor class + CanvasCompositorLike interface

**File:** `packages/g2-app/src/engine/canvas-compositor.ts`

`CanvasCompositor` owns a 400×200 master canvas acquired via the same environment fallback as `acquireCanvas2d` in `hud-canvas-renderer.ts` (OffscreenCanvas → document.createElement → null sentinel). It composites registered per-layer canvases in ascending ZIndex order via `drawImage`, implements dirty-skip (clean layers skip `paint()`), and returns a 320000-byte RGBA `Uint8ClampedArray` via `getImageData`.

`CanvasCompositorLike` interface is exported for LayerManager injection (plan 19-04 wires it).

Tests (CC-01..CC-05 + blank-buffer): 7/7 pass.

### Task 2: CanvasLayer interface + isCanvasLayer guard (additive to layer-types.ts)

**File:** `packages/g2-app/src/engine/layer-types.ts` (appended after OverlayPanel)

`CanvasLayer extends Layer` with `attachCanvas(canvas)`, `paint()`, `isDirty()`. JSDoc documents the `{image:0, text:0}` getContainerCount() contract (canvas layers use fixed-budget mode per ADR-0013 Amendment 1, locked decision #3).

`isCanvasLayer(layer): layer is CanvasLayer` runtime type guard checks all three methods are functions.

Tests (layer-types-canvas.test.ts): 5/5 pass — true for full stub, false for bare Layer and partial stubs.

No existing interfaces (Layer, OverlayPanel, LayerOp, ZIndex, LayerManagerError, Raster*) were modified.

### Task 3: buildHudRasterPageSchema() + HUD container registry entries

**File:** `packages/g2-app/src/engine/container-registry.ts`

Five new entries added to `CONTAINER_REGISTRY`:
- `hud-tile-0..3`: ids 0-3, 200×100 each, 2×2 layout, `isEventCapture:0`, `kind:'image'`
- `hud-capture`: id 4, 576×288 full-screen, `isEventCapture:1`, `kind:'text'`

`HUD_RASTER_CONTAINER_TOTAL = 5` and `buildHudRasterPageSchema()` exported.

`buildHudRasterPageSchema()` returns `{ containerTotalNum:5, imageObject: [4 tiles], textObject: [hud-capture] }`.

**Deviation fix:** `buildBaseImageContainers()` and `buildBaseTextContainers()` were updated to filter via `BASE_NAMES` set (11 base container names) to prevent `hud-capture` bleeding into `buildBaseTextContainers()` and breaking REG-4. `BASE_CONTAINER_TOTAL` now uses `BASE_NAMES.size` (= 11, unchanged). This was a Rule 2 auto-fix (missing isolation between the two container namespaces).

Tests (15/15 pass — 8 original REG-1..8 unchanged + 7 new HUD schema tests).

## Verification Results

```
corepack pnpm --filter @evf/g2-app exec vitest run src/engine
→ Test Files 23 passed (23) / Tests 250 passed (250)

corepack pnpm test (full workspace)
→ Test Files 232 passed (232) / Tests 3140 passed (3140)

corepack pnpm --filter @evf/g2-app exec tsc --noEmit
→ clean (no errors)
```

All 2668+ pre-existing tests continue to pass. Glyph path is byte-identical (BOOT_CONTAINER_TOTAL still 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing isolation] BASE_NAMES filter to isolate HUD raster entries from base builders**

- **Found during:** Task 3 GREEN phase
- **Issue:** Adding `hud-capture` (kind:'text', isEventCapture:1) to `CONTAINER_REGISTRY` caused it to appear in `buildBaseTextContainers()`, breaking REG-4 (asserts exactly 1 isEventCapture=1 text container = map-capture). `hud-tile-0..3` (kind:'image') would similarly contaminate `buildBaseImageContainers()`, doubling the base image count.
- **Fix:** Introduced `BASE_NAMES: ReadonlySet<string>` listing the 11 canonical base container names. Updated `buildBaseImageContainers()` and `buildBaseTextContainers()` to additionally filter `BASE_NAMES.has(name)`. `BASE_CONTAINER_TOTAL` now uses `BASE_NAMES.size` instead of `Object.keys(CONTAINER_REGISTRY).length`.
- **Files modified:** `container-registry.ts`
- **Commit:** `706cf13`

**2. [Rule 2 - Missing null guard] _testSetMasterContext null-sentinel pattern**

- **Found during:** Task 1 GREEN phase
- **Issue:** happy-dom's `document.createElement('canvas').getContext('2d')` returns null. The original constructor threw immediately in the test environment, preventing the `_testSetMasterContext` escape hatch from ever being called.
- **Fix:** Constructor wraps `_acquireMasterCtx()` in a try/catch; on failure `_masterCtx` is left null. `composite()` guards against null with a descriptive error message. Tests inject the mock context immediately after construction via `_testSetMasterContext()`.
- **Files modified:** `canvas-compositor.ts`
- **Commit:** `c2c9d67`

## Threat Flags

None — no new network endpoints, auth paths, or security-relevant surfaces introduced. `buildHudRasterPageSchema()` output is T-19-02 mitigated: the test asserting exactly one `isEventCapture=1` container guards against capture-conflict page schemas (Pitfall 5).

## Self-Check

- [x] `packages/g2-app/src/engine/canvas-compositor.ts` — created
- [x] `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` — created (7 tests)
- [x] `packages/g2-app/src/engine/__tests__/layer-types-canvas.test.ts` — created (5 tests)
- [x] `packages/g2-app/src/engine/layer-types.ts` — CanvasLayer + isCanvasLayer appended
- [x] `packages/g2-app/src/engine/container-registry.ts` — HUD entries + buildHudRasterPageSchema added
- [x] Commits: c2c9d67, 12152a0, 706cf13
- [x] All 3140 workspace tests pass
- [x] tsc --noEmit clean

## Self-Check: PASSED
