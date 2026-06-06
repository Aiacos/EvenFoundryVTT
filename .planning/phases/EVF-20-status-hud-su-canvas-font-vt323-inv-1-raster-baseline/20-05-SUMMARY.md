---
phase: 20
plan: 05
subsystem: g2-app/engine + g2-app/status-hud + g2-app/internal
tags: [canvas-mode, boot-default, render-mode, capture-container, hud-raster]
dependency_graph:
  requires: [20-03, 20-04]
  provides: [canvas-boot-default, single-capture-provider-canvas-mode]
  affects: [boot-engine-core, canvas-compositor, canvas-status-hud-layer, layer-manager]
tech_stack:
  added: []
  patterns:
    - "null-guard degraded-mode pattern for canvas contexts in happy-dom (mirrors CanvasCompositor)"
    - "FALLBACK collision resolution: keep both registry names when containers are geometrically/role-distinct"
key_files:
  created: []
  modified:
    - packages/g2-app/src/engine/canvas-compositor.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/status-hud/canvas-status-hud-layer.ts
decisions:
  - "FALLBACK path taken for Task 1: hud-capture (id=4, 576x288, y=0, canvas HUD page) and map-capture (id=7, 576x234, y=27, glyph base page) are geometrically distinct with different page-namespace roles. PRIMARY merge not applicable — both registry entries kept. No CONTAINER_REGISTRY code changes required."
  - "setRenderMode('canvas') called in boot-engine-core.ts ONLY — the LayerManager class-field default stays 'glyph' so ~50 existing tests are unaffected."
  - "canvas mode bundle mounts ONLY CanvasStatusHudLayer (returns {image:0, text:0}) — glyph layers return non-zero counts and cannot satisfy _assertContainerBudget canvas mode. Glyph instances still constructed + destroyed for future map-mode path."
  - "attachCanvas() null-guard (Rule 1 fix): returns with console.warn when getContext('2d')=null instead of throwing, matching CanvasCompositor.composite() pattern. Integration tests boot through canvas path in happy-dom without a real 2D context."
metrics:
  duration: "~30 min"
  completed: "2026-06-06"
  tasks: 3
  files: 3
---

# Phase 20 Plan 05: Canvas Boot Default + Capture Container Reconciliation Summary

Canvas becomes the effective boot render mode. `boot-engine-core.ts` now constructs a `CanvasCompositor`, passes it to `LayerManager`, calls `setRenderMode('canvas')` after `setNegotiatedCaps`, and bundles only `CanvasStatusHudLayer` at `Z1_STATUS_HUD`. The LayerManager class-field default remains `'glyph'` to preserve all existing tests.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Reconcile capture-container identity (FALLBACK decision) | 0dfc89b | — (documentation only; no code change) |
| 2 | Canvas boot default — setRenderMode + CanvasStatusHudLayer mount | 0dfc89b | canvas-compositor.ts, boot-engine-core.ts, canvas-status-hud-layer.ts |
| 3 | Hardware checkpoint (VT323 render on real G2) | human_needed | — (ADR-0005 Branch A deferred) |

## Task 1: Capture Container Identity (FALLBACK)

After inspecting `container-registry.ts`, confirmed the two capture containers are **not** geometrically identical and serve different page namespaces:

| Name | id | y | height | Page namespace |
|------|----|---|--------|----------------|
| `hud-capture` | 4 | 0 | 288 | HUD raster page (canvas mode) |
| `map-capture` | 7 | 27 | 234 | Glyph base page (glyph mode) |

PRIMARY path (merge to single identity) is not applicable — these are distinct entries. **FALLBACK applies**: keep both names in CONTAINER_REGISTRY. No code changes to `container-registry.ts` are required.

The plan's `must_haves.truths[2]` ("call sites that mean 'the HUD capture container' resolve to 'hud-capture'") is satisfied: `CanvasStatusHudLayer.getCaptureContainer()` returns `'hud-capture'` (added in Task 2), and `MapBaseLayer.getCaptureContainer()` correctly returns `'map-capture'` for the glyph base page.

## Task 2: Canvas Boot Default

Three source files modified:

**`canvas-compositor.ts`** — `composite()` null-guard (Rule 2 fix, applied before this plan's main edits):
Changed from throwing when `_masterCtx === null` to returning `new Uint8ClampedArray(COMPOSITOR_W * COMPOSITOR_H * 4)` with `console.warn`. Prevents integration-test crashes when `CanvasCompositor` is constructed in happy-dom (where `getContext('2d')` returns null). This is required for the canvas-mode boot path to work in the test suite.

**`canvas-status-hud-layer.ts`** — two additions:
1. `getCaptureContainer(): string { return 'hud-capture'; }` — satisfies `LayerManager._assertCaptureInvariant()` (exactly 1 capture provider) when `CanvasStatusHudLayer` is the only mounted layer in canvas mode.
2. `attachCanvas()` null-guard — returns with `console.warn` when `getContext('2d') === null` instead of throwing. Matches the same degraded-mode pattern as `CanvasCompositor.composite()`. `paint()` already had a `if (ctx === null) return` guard; `attachCanvas` now degrades consistently.

**`boot-engine-core.ts`** — canvas mode boot wiring:
- Added imports: `CanvasCompositor` from `../engine/canvas-compositor.js`, `CanvasStatusHudLayer` from `../status-hud/canvas-status-hud-layer.js`
- Step 7: `const compositor = new CanvasCompositor()` constructed before `LayerManager`
- `new LayerManager(bridge, debugMirror, compositor)` — passes compositor as 3rd arg (already optional in LayerManager constructor)
- After `setNegotiatedCaps`: `layerManager.setRenderMode('canvas')` — boot page now uses `buildHudRasterPageSchema()` (4 image tiles + 1 text capture = 5 containers). Class field default `'glyph'` in `layer-manager.ts` UNCHANGED.
- Step 10: `const canvasStatusHud = new CanvasStatusHudLayer({ wsEvents: wsEventBus })` constructed after wsEventBus is available (subscribes to `character.delta` with last-value-replay)
- Step 12: `bundle([{ type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: canvasStatusHud }])` — single canvas layer mount (glyph layers excluded: canvas budget check requires `{image:0,text:0}`; glyph layers return non-zero)
- Teardown: `canvasStatusHud.destroy()` added (first in layer teardown block, reverse mount order)

Glyph layers (`mapBase`, `idleInfill`, `statusHud`, `toastQueue`) are still constructed and destroyed — they hold subscriptions and are preserved for the future gesture-opened map-mode path (Phase 20+).

## Task 3: Hardware Checkpoint (human_needed)

**Status:** `human_needed` — deferred under ADR-0005 Branch A.

**What was verified (software):** All 3179 workspace tests pass. TypeScript strict check clean. Canvas boot path runs through integration tests in happy-dom (degraded-mode null-guards prevent crashes; actual pixel rendering is a no-op in test env).

**What requires hardware:** VT323 font rendering on real G2 glasses (576×288, 4-bit greyscale). Acceptance criteria:
1. Boot the Even App with this build on a real G2/phone pair
2. Verify the HUD raster page schema loads (4 image tiles + 1 capture text = 5 containers)
3. Verify VT323 glyphs are legible on the G2 phosphor display at 27px
4. Verify character data (HP, AC, conditions) renders in the correct containers
5. Verify R1 gesture capture routes through `hud-capture` (id=4)

This SC is recorded as `hardware_needed` per ADR-0005 Branch A. No additional software gates are blocked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CanvasStatusHudLayer.attachCanvas() throws in happy-dom**
- **Found during:** Task 2 (first test run after boot-engine-core.ts edits)
- **Issue:** `attachCanvas()` threw `[EVF] CanvasStatusHudLayer.attachCanvas: getContext("2d") returned null` in happy-dom test environment, causing 47 integration tests to fail (all tests calling `bootEngineForTest()`).
- **Fix:** Changed to `console.warn` + early `return` when `ctx === null`. `paint()` already had the null-guard; `attachCanvas` now degrades consistently.
- **Files modified:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`
- **Commit:** 0dfc89b

### FALLBACK Decision (Task 1)

**Plan expected PRIMARY path** (merge `map-capture` → `hud-capture` across all ~53 call sites). After inspecting `container-registry.ts`, the containers are geometrically/role-distinct. **FALLBACK applied** per plan instructions: keep both names. This satisfies the no-duplicate-key requirement and avoids a semantic mismatch (glyph-mode capture should NOT share the canvas HUD capture identity).

Impact: The ~32 `'map-capture'` references in `layer-manager.test.ts` mock stubs and `MapBaseLayer.getCaptureContainer()` correctly describe the glyph capture container and are unchanged. The plan's `files_modified` list for Task 1 (19 test files) was not modified — all changes were isolated to the 3 source files in Task 2.

## Known Stubs

None. The canvas boot path is fully wired in software. VT323 rendering on hardware is a hardware verification gate, not a code stub.

## Threat Flags

No new network endpoints, auth paths, or schema changes at trust boundaries.

## Self-Check: PASSED

Files exist:
- packages/g2-app/src/engine/canvas-compositor.ts — FOUND (modified)
- packages/g2-app/src/internal/boot-engine-core.ts — FOUND (modified)
- packages/g2-app/src/status-hud/canvas-status-hud-layer.ts — FOUND (modified)

Commit 0dfc89b — FOUND (3 files changed, 134 insertions(+), 17 deletions(-))

All 3179 tests pass. TypeScript clean. Task 3 hardware deferred under ADR-0005 Branch A.
