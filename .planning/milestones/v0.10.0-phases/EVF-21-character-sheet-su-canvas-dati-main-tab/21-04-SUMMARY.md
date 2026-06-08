---
phase: 21-character-sheet-su-canvas-dati-main-tab
plan: 04
subsystem: ui
tags: [canvas, character-sheet, portrait, dither, raster, OffscreenCanvas, upng-js, image-q, floyd-steinberg]

# Dependency graph
requires:
  - phase: 21
    plan: 02
    provides: dither-utils.ts (buildGreyscalePalette + ditherTile — portrait pipeline reuses them)
  - phase: 21
    plan: 03
    provides: CanvasCharacterSheetPanel (class + _portraitSlot field + onMount/onUnmount lifecycle)
  - phase: 04a
    provides: MapBaseLayer.setPortraitOverride(slot, bytes|null) — slot-3 portrait infra
provides:
  - CanvasCharacterSheetPanel._fetchPortraitAsync() — async-once portrait fetch+dither+encode pipeline
  - Portrait pushed to MapBaseLayer slot 3 via setPortraitOverride(3, Uint8Array)
affects: [future-canvas-panels, portrait-display, raster-pipeline-reuse]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget portrait pipeline: void this._fetchPortraitAsync() from onMount — never blocks LayerManager.bundle"
    - "Async-once guard: _portraitFetched boolean set on first fetch, reset on onUnmount so re-mount re-fetches"
    - "Silent failure: entire _fetchPortraitAsync body wrapped in try/catch — portrait failure never propagates"
    - "OffscreenCanvas constructor mock: must use function() syntax (not arrow) for vi.fn() to work as constructor with new"
    - "UPNG.encode([buf.buffer], W, H, 16) — 4-bit indexed PNG for 16-step greyscale G2 palette"

key-files:
  created: []
  modified:
    - packages/g2-app/src/panels/canvas-character-sheet-panel.ts
    - packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts

key-decisions:
  - "Portrait dimensions: W=100 H=60 — matches Phase 13 portrait-state precedent (fits slot 3 200×100 container per G2 hard limits)"
  - "Async-once guard resets on onUnmount (not on URL change): re-mounting the panel always re-fetches, but a single mount cycle fetches at most once"
  - "No new package installs (threat T-21-SC accept): upng-js + image-q already in g2-app deps"
  - "OffscreenCanvas constructor mock corrected to function() syntax (Vitest warning — auto-fix Rule 1)"

requirements-completed: [RSHEET-03]

# Metrics
duration: 5min
completed: 2026-06-07
---

# Phase 21 Plan 04: Portrait Pipeline Summary

**`_fetchPortraitAsync` async-once pipeline: fetch → createImageBitmap 100×60 → dither via reused dither-utils → UPNG.encode 4-bit PNG → MapBaseLayer slot-3 setPortraitOverride; fire-and-forget non-blocking, silent on failure.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-07T19:47:27Z
- **Completed:** 2026-06-07T19:52:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

### Task 1: _fetchPortraitAsync + fire-and-forget wiring

- Added private `_fetchPortraitAsync(): Promise<void>` to `CanvasCharacterSheetPanel`
- Pipeline: `fetch(url)` → bail if `!response.ok` → `response.blob()` → `createImageBitmap(blob, {resizeWidth:100,resizeHeight:60})` → 100×60 OffscreenCanvas scratch → `getImageData` → `buildGreyscalePalette()` + `ditherTile(rgba, W, H, pal)` (from `dither-utils.ts`) → `UPNG.encode([dithered.buffer], 100, 60, 16)` → `setPortraitOverride(3, pngBytes)` on slot 3
- Async-once guard: `_portraitFetched` boolean set before fetch, reset in `onUnmount` — no duplicate fetches per mount cycle, re-mount re-fetches
- Fire-and-forget: `void this._fetchPortraitAsync()` in `onMount` after gesture subscribe — `onMount` never blocks on network
- Silent failure: entire body wrapped in `try/catch` — portrait errors never propagate (T-21-03c mitigate)
- `onUnmount` JSDoc updated to document `_portraitFetched` reset
- `_portraitFetched` field added with full TSDoc

## Task Commits

1. **Task 1 RED — failing RCSP-PORTRAIT tests** - `af16ca5` (test)
2. **Task 1 GREEN — _fetchPortraitAsync implementation** - `452b3a3` (feat)

## Files Created/Modified

- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — Added `_fetchPortraitAsync`, `_portraitFetched` field, updated `onMount`/`onUnmount` (+77 lines)
- `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — Added RCSP-PORTRAIT-* 5 tests (+263 lines test, auto-formatted by Biome)

## Decisions Made

- Portrait dimensions `W=100 H=60` — consistent with Phase 13 portrait-state precedent; fits within slot 3's 200×100 container limit per G2 hardware limits (memory note: STACK.md)
- Async-once guard resets on `onUnmount`, not on URL change — re-mounting always re-fetches; avoids stale portrait after PC switch
- No new packages installed — `upng-js` and `image-q` already in `packages/g2-app` (threat T-21-SC: accept)
- `UPNG.encode([dithered.buffer as ArrayBuffer], W, H, 16)` — 16 = 4-bit indexed mode, matches G2 4-bit greyscale palette

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome import ordering violation in canvas-character-sheet-panel.ts**
- **Found during:** Task 1 GREEN (lint:ci check after implementation)
- **Issue:** `import * as UPNG from 'upng-js'` placed before `@evf/shared-protocol` — Biome `organizeImports` requires alphabetical order within external packages
- **Fix:** `pnpm biome check --write` auto-sorted imports
- **Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
- **Verification:** `pnpm biome ci` exits 0 for this file
- **Committed in:** `452b3a3` (GREEN commit)

**2. [Rule 1 - Bug] OffscreenCanvas constructor mock used arrow function instead of function() syntax**
- **Found during:** Task 1 GREEN (RCSP-PORTRAIT-OK test still failing after implementation)
- **Issue:** `vi.fn().mockImplementation(() => ({...}))` does not work as a constructor for `new OffscreenCanvas()` — Vitest issues warning; the instance's `getContext` was never set on `this`
- **Fix:** Changed to `vi.fn(function(this: ...) { this.getContext = ... })` syntax — `function` body binds `this` correctly when called with `new`
- **Files modified:** `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts`
- **Verification:** RCSP-PORTRAIT-OK passes
- **Committed in:** `452b3a3` (GREEN commit)

**3. [Rule 1 - Bug] RCSP-PORTRAIT-ONCE expectation did not account for onUnmount null-clear call**
- **Found during:** Task 1 GREEN (RCSP-PORTRAIT-ONCE failing with callCount=3 > expected ≤2)
- **Issue:** The test expected `setPortraitOverride` called ≤2 times across mount→unmount→mount, but `onUnmount` also calls `setPortraitOverride(3, null)` to clear slot 3 → total is 3 calls (2 with bytes + 1 null)
- **Fix:** Updated test to expect exactly 3 calls: 2 non-null (one per mount) + 1 null (from unmount); verified all calls target slot 3
- **Files modified:** `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts`
- **Verification:** RCSP-PORTRAIT-ONCE passes
- **Committed in:** `452b3a3` (GREEN commit)

---

**Total deviations:** 3 auto-fixed (Rule 1 — Biome import sort, OffscreenCanvas mock, test expectation)
**Impact on plan:** All fixes necessary for lint compliance and correct test behavior. No scope change.

## TDD Gate Compliance

| Gate | Commit | Verified |
|------|--------|---------|
| RED (test) | `af16ca5` | RCSP-PORTRAIT-OK fails before implementation |
| GREEN (feat) | `452b3a3` | All RCSP-PORTRAIT-* pass (1549/1549 total) |

## Issues Encountered

None beyond the 3 auto-fixed deviations above.

## User Setup Required

None — pure internal portrait pipeline, no external service configuration required.

## Next Phase Readiness

- `CanvasCharacterSheetPanel` complete: paint*Tab + gesture + portrait pipeline all wired
- Portrait rendered as 100×60 4-bit PNG on slot 3 whenever `snapshot.portrait.url` is available
- `_locale` field still has `void this._locale` placeholder — Plan 21-05 (if any) can wire locale-aware rendering
- All 1549 g2-app tests pass; `pnpm typecheck` + `pnpm lint:ci` (plan files) clean

## Threat Surface Scan

Portrait URL fetch path (T-21-03): Even Hub whitelists outbound domains; portrait served from already-whitelisted bridge endpoint; no user-controlled URL injection path. No new trust boundaries widened vs plan threat model.

## Known Stubs

None — `_fetchPortraitAsync` is fully wired. Portrait renders to slot 3 when `snapshot.portrait.url` is present; silent skip when absent. No placeholder behavior in the portrait pipeline.

## Self-Check

- [x] `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — modified (_fetchPortraitAsync + _portraitFetched + onMount/onUnmount updates)
- [x] `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — modified (RCSP-PORTRAIT-* tests added)
- [x] Commits `af16ca5` (RED) and `452b3a3` (GREEN) exist in git log
- [x] All 1549 g2-app tests pass (`pnpm --filter @evf/g2-app test -- --run`)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm biome ci` exits 0 for plan files
- [x] `panel-gesture-bus.ts` UNCHANGED (SC2 locked decision)
- [x] `socketlib-handlers.ts` handler count = 17 UNCHANGED

---
*Phase: 21-character-sheet-su-canvas-dati-main-tab*
*Completed: 2026-06-07*
