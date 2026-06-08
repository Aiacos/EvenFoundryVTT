---
phase: 20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
plan: "01"
subsystem: g2-app/engine
tags: [canvas, font-loading, layer-types, layer-manager, vt323, rfont-01, q1-resolution]
dependency_graph:
  requires: [Phase 19 canvas compositor substrate (CanvasLayer interface, CanvasCompositor, LayerManager)]
  provides: [ensureVt323Loaded() async font loader, CanvasLayer.attachCanvas Promise<void> interface, per-layer canvas lifecycle in LayerManager.bundle()]
  affects: [packages/g2-app/src/engine/layer-types.ts, packages/g2-app/src/engine/layer-manager.ts, packages/g2-app/src/status-hud/vt323-font-loader.ts]
tech_stack:
  added: ["@fontsource/vt323@^5.2.7 (prod dep in g2-app)"]
  patterns: [FontFace + self.fonts.add() try/catch fallback, async CanvasLayer.attachCanvas contract, per-layer OffscreenCanvas lifecycle in LayerManager]
key_files:
  created:
    - packages/g2-app/src/status-hud/vt323-font-loader.ts
    - packages/g2-app/src/status-hud/__tests__/vt323-font-loader.test.ts
  modified:
    - packages/g2-app/src/engine/layer-types.ts
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/package.json
    - pnpm-lock.yaml
decisions:
  - "Vite ?url import for WOFF2 — build-time-fixed URL, never user-controlled (T-20-FONT mitigate RFONT-01)"
  - "try/catch catches both FontFace API unavailability and self.fonts undefined in happy-dom/iOS 16 Worker"
  - "attachCanvas widened to Promise<void> in interface (Q1 resolution per 20-RESEARCH.md Open Questions)"
  - "LayerManager.bundle() STEP 2.5 creates per-layer canvas + awaits attachCanvas before STEP 3 invariants"
  - "_createLayerCanvas() static helper: OffscreenCanvas → document.createElement fallback → test stub"
  - "destroyedCanvasZIndices tracks canvas cleanup on destroy ops (deregisterLayer + _layerCanvases.delete)"
metrics:
  duration: "~15 min"
  completed: "2026-06-06"
  tasks: 3
  files: 6
---

# Phase 20 Plan 01: VT323 Font Loader + async attachCanvas — Summary

Installed `@fontsource/vt323`, implemented `ensureVt323Loaded()` with a tested monospace fallback (RFONT-01), and widened `CanvasLayer.attachCanvas` to `Promise<void>` with full call-site wiring in `LayerManager.bundle()` (Q1 resolution).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| T1 | Package legitimacy checkpoint | (pre-approved) | — |
| T2 | Install @fontsource/vt323 + ensureVt323Loaded() | `2cad8e0` | package.json, pnpm-lock.yaml, vt323-font-loader.ts, vt323-font-loader.test.ts |
| T3 | Widen attachCanvas to Promise<void> + wire call sites | `ed0ff65` | layer-types.ts, layer-manager.ts |

## What Was Built

### Task 2: VT323 Font Loader (RFONT-01)

`packages/g2-app/src/status-hud/vt323-font-loader.ts` exports `ensureVt323Loaded(): Promise<string>`:

- Imports the WOFF2 via Vite `?url` suffix — URL is resolved at bundle time (T-20-FONT mitigation)
- `try` block: constructs `FontFace('VT323', ...)`, `await face.load()`, `self.fonts.add(face)`, returns `'16px VT323'`
- `catch` block: any error (self.fonts undefined, FontFace unavailable, load failure) returns `'16px monospace'`
- Never throws, never rejects

Tests in `__tests__/vt323-font-loader.test.ts`:
- SC1: `globalThis.fonts = undefined` in `beforeEach`; `ensureVt323Loaded()` resolves `'16px monospace'` (happy-dom naturally lacks FontFaceSet)
- 3 assertions: exact string equality, `.resolves.toBe(...)` variant, regex `/^16px /`

### Task 3: async attachCanvas Interface + LayerManager Wiring (Q1 Resolution)

`layer-types.ts` — `CanvasLayer.attachCanvas` signature changed from `void` → `Promise<void>`. Updated TSDoc documents the async contract: font load + chrome pre-bake must complete before first `composite()`/`paint()`. Added `@see ADR-0013 Amendment 1 §Q1` reference.

`layer-manager.ts` — Added:
- `import { type CanvasLayer, isCanvasLayer, ... }` from layer-types.ts
- `_layerCanvases: Map<ZIndex, OffscreenCanvas | HTMLCanvasElement>` field
- `bundle()` STEP 2.5: collects `mountedCanvasLayers` and `destroyedCanvasZIndices` during STEP 2 loop; then for each mounted CanvasLayer: creates canvas via `_createLayerCanvas()`, `await layer.attachCanvas(canvas)`, `compositor?.registerLayer(z, canvas, layer)`; for destroyed: `compositor?.deregisterLayer(z)`, `_layerCanvases.delete(z)`
- `_createLayerCanvas()` static helper: `OffscreenCanvas` → `document.createElement('canvas')` → minimal test stub

## Verification Results

```
pnpm --filter @evf/g2-app exec tsc --noEmit  → Exit 0
npx vitest --run --project g2-app            → 104 test files, 1500 tests PASSED
```

Baseline was 103 files / 1497 tests. Task 2 added 3 new tests. Task 3 added 0 new tests (interface change only — existing 1500 pass unchanged, confirming zero regressions). The `layer-types-canvas.test.ts` stub uses `attachCanvas: vi.fn()` which TypeScript accepts because vi.fn() returns `any` — no explicit type annotation conflict.

## Deviations from Plan

**None** — plan executed exactly as written.

Task 1 (checkpoint:human-verify) was pre-approved by the orchestrator per the `<checkpoint_resolution>` directive: `@fontsource/vt323@5.2.7` had slopcheck `[OK]` verdict in RESEARCH.md (official fontsource org, ~5.5yr publish history, no postinstall script). Treated as APPROVED, install proceeded in Task 2 without pausing.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced. T-20-FONT (font URL injection) and T-20-SC (supply chain) are both mitigated as planned.

## Known Stubs

None — `ensureVt323Loaded()` is fully wired and tested. `CanvasLayer.attachCanvas()` interface is complete with awaited call sites. No placeholder values or TODO stubs remain in the files produced by this plan.

## Self-Check: PASSED

- `packages/g2-app/src/status-hud/vt323-font-loader.ts` — FOUND
- `packages/g2-app/src/status-hud/__tests__/vt323-font-loader.test.ts` — FOUND
- `packages/g2-app/src/engine/layer-types.ts` (contains `Promise<void>`) — FOUND
- `packages/g2-app/src/engine/layer-manager.ts` (contains `await layer.attachCanvas`) — FOUND
- Commit `2cad8e0` — FOUND (`feat(20-01): install @fontsource/vt323...`)
- Commit `ed0ff65` — FOUND (`feat(20-01): widen CanvasLayer.attachCanvas...`)
