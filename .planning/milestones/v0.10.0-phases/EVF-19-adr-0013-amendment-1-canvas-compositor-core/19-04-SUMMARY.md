---
phase: EVF-19-adr-0013-amendment-1-canvas-compositor-core
plan: "04"
subsystem: g2-app/engine
tags: [renderMode, canvas-compositor, layer-manager, raster-pipeline, RAST-01, RAST-03, RAST-04]
dependency_graph:
  requires: [19-01, 19-02, 19-03]
  provides:
    - LayerManager.renderMode (canvas|glyph) with setRenderMode/getRenderMode
    - LayerManager._flushPage() mode-aware schema selector (j0t-05 TODO resolved)
    - LayerManager._compositeAndPush() serialized 4-tile push (RAST-01)
    - LayerManager._assertContainerBudget() canvas fixed-budget branch (RAST-03)
  affects:
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - packages/g2-app/src/hud/hud-poc-page.ts
tech_stack:
  added: []
  patterns:
    - mode-aware _flushPage selector (renderMode field + schema switch)
    - optional compositor injection via 3rd constructor param (backward compat)
    - serialized for...of + await tile push (CM-01 anti-concurrent)
    - canvas fixed-budget branch (per ADR-0013 Amendment 1 locked decision #3)
key_files:
  created: []
  modified:
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - packages/g2-app/src/hud/hud-poc-page.ts
decisions:
  - "renderMode defaults 'glyph' — all existing call sites (boot-engine-core.ts, tests) compile unchanged"
  - "Compositor injected via optional 3rd constructor param (undefined → null); Pitfall 2 null-guard in _compositeAndPush"
  - "_assertContainerBudget canvas branch: {image:0,text:0} passes; non-zero throws panel_mount_budget_exceeded"
  - "TODO(j0t-05) removed (INV-4: all TODOs must have issue link or ADR cite)"
metrics:
  duration: ~10min
  completed: "2026-06-05"
  tasks_completed: 3
  files_changed: 3
---

# Phase 19 Plan 04: LayerManager renderMode + _flushPage selector + _compositeAndPush + canvas budget — Summary

## One-Liner

LayerManager wired with `renderMode:'canvas'|'glyph'`, a mode-aware `_flushPage()` (resolving `TODO(j0t-05)`), serialized `_compositeAndPush()` via `CanvasCompositorLike`, and a fixed-budget canvas branch in `_assertContainerBudget()`.

## What Was Built

### Task 1: LayerManager renderMode + mode-aware _flushPage + _compositeAndPush (TDD, RAST-04 + RAST-01)

**Files modified:**
- `packages/g2-app/src/engine/layer-manager.ts` — core implementation
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — new tests (12 added)
- `packages/g2-app/src/hud/hud-poc-page.ts` — JSDoc promotion (no functional change)

**Implementation:**

`LayerManager` gains:
- `private renderMode: 'canvas' | 'glyph' = 'glyph'` field (default preserves byte-identical glyph behavior)
- `private readonly compositor: CanvasCompositorLike | null` field
- Optional 3rd constructor param `compositor?: CanvasCompositorLike` (backward compat with all existing 2-arg call sites)
- `setRenderMode(mode)` / `getRenderMode()` public methods

`_flushPage()` now selects the page schema based on `renderMode`:
- `'glyph'`: `buildStatusViewTextContainers()` → `containerTotalNum:3` (byte-identical, j0t-05 preserved)
- `'canvas'`: `buildHudRasterPageSchema()` → `containerTotalNum:5` + calls `_compositeAndPush()`

`_compositeAndPush()`:
- Null-guard: `if (this.compositor === null) return;` (Pitfall 2 — no crash when no compositor provided)
- `compositor.composite()` → `buildHudTiles(rgba)` → `pushHudTiles(bridge, tiles)` (serialized `for...of + await`)
- CM-01 satisfied: no `Promise.all` — sequential 4-tile push per SDK constraint

**Tests added (12 new, all passing):**
- `LMT-RM-01..03`: getRenderMode defaults 'glyph'; setRenderMode/getRenderMode round-trip; 2-arg constructor backward compat
- `LMT-CF-01..04`: canvas mode containerTotalNum:5; 4 image + 1 capture text; compositor.composite called; glyph mode byte-identical (no compositor call)
- `CM-01`: updateImageRawData called exactly 4 times sequentially in canvas mode
- `LMT-NC-01`: null-compositor canvas mode — no throw, rebuildPageContainer called, updateImageRawData NOT called

### Task 2: _assertContainerBudget() canvas-mode fixed-budget branch (TDD, RAST-03)

Implemented as part of Task 1 (the canvas branch is in the same `_assertContainerBudget()` method):

Canvas branch (`if (this.renderMode === 'canvas') { ... return; }`):
- Iterates all layers; calls `getContainerCount?.() ?? {image:0,text:1}`
- Throws `panel_mount_budget_exceeded` if any layer declares `image > 0 || text > 0`
- Returns early — does NOT fall through to the per-layer sum (which would false-fire on `MapBaseLayer.{image:4,text:1}`)

Glyph branch: byte-identical to pre-Phase-19 behavior (`img > 4 || txt > 8` → throw).

**Tests added (5 new):**
- `LMT-CB-CV-01`: canvas mode {image:0,text:0} → no throw
- `LMT-CB-CV-02`: canvas mode {image:1,text:0} → throws `panel_mount_budget_exceeded`
- `LMT-CB-CV-03`: canvas mode {image:0,text:1} → throws `panel_mount_budget_exceeded`
- `LMT-CB-CV-04`: glyph mode budget behavior unchanged (overflow still throws)
- `LMT-CB-CV-05`: canvas mode capture-ordering — capture violation throws first (LMT-CB-03 preserved)

### Task 3: Full-suite regression gate

**Results:**
- `corepack pnpm test`: **3154 tests passed** (232 test files) — exit 0
- `corepack pnpm typecheck`: exit 0
- `corepack pnpm lint:ci`: exit 0 (warnings only, no errors)
- CI Gate 8 socketlib handler count: **17** (no socketlib files changed in Phase 19)
- INV-1 glyph fixtures: unchanged (glyph path byte-identical, Test 8b passes unchanged)

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 + 2 | `3d1d794` | `feat(g2-app): renderMode + canvas _flushPage selector + _compositeAndPush (19-04 T1)` |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written. The only note: Task 2's `_assertContainerBudget` canvas branch was implemented atomically together with Task 1 since they are in the same method and the same file. Both TDD RED phases were written together (12 tests for Tasks 1+2) then GREEN phase implemented both in one commit. This is within the spirit of the plan — the `<done>` criteria for both tasks are fully satisfied.

### TODO(j0t-05) Removal (INV-4 compliance)

The `TODO(j0t-05)` comment in `_flushPage()` was removed as required by the acceptance criteria (`grep -c "TODO(j0t-05)"` = 0). The TODO was resolved by this implementation. A `@see docs/architecture/0013-hud-raster-rendering.md Amendment 1` reference replaces it.

## Glyph Byte-Identity Confirmation

Test 8b (`_flushPage rebuilds the default STATUS-VIEW schema (3 text, 0 image, no isEventCapture=1)`) passes unchanged:
- `containerTotalNum === 3`
- `imageObject.length === 0`
- `textObject.length === 3` (header, footer, status-hud in id order)
- No `isEventCapture:1` in glyph schema

The new `LMT-CF-04` test re-asserts glyph coexistence: glyph mode with a compositor injected still uses `containerTotalNum:3` and never calls `compositor.composite()`.

## Known Stubs

None. This plan is pure infrastructure wiring — no UI rendering, no data stubs. The compositor in Phase 19 returns blank RGBA (no canvas layers registered), producing blank-but-valid 4-bit PNG tiles. This is intentional and documented.

## Threat Flags

No new security-relevant surface introduced. `_compositeAndPush()` calls existing SDK methods (`bridge.updateImageRawData`) already inside the trust boundary. The null-compositor guard (T-19-05) and serialized push (T-19-04) mitigations are implemented as required by the threat model.

## Self-Check

**Files exist:**
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/engine/layer-manager.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/hud/hud-poc-page.ts` — FOUND

**Commit exists:**
- `3d1d794` — FOUND (verified via `git log --oneline`)

**Acceptance criteria:**
- `grep -c "renderMode" layer-manager.ts` ≥ 1: YES (7 occurrences)
- `grep -c "TODO(j0t-05)" layer-manager.ts` = 0: YES
- Test 8b (glyph containerTotalNum:3): PASSES UNCHANGED
- New canvas-mode test containerTotalNum:5 + _compositeAndPush: PASSES
- CM-01 updateImageRawData called 4×: PASSES
- Null-compositor test no throw: PASSES
- `new LayerManager(bridge, debugMirror)` (2-arg) still compiles: YES (no existing call site changed)
- `tsc --noEmit` clean: YES
- Full suite ≥3140 tests: YES (3154)
- Lint exit 0: YES
- Socketlib count 17: YES

## Self-Check: PASSED
