---
phase: 21-character-sheet-su-canvas-dati-main-tab
plan: 02
subsystem: ui
tags: [image-q, floyd-steinberg, dither, raster, canvas, g2-app]

# Dependency graph
requires:
  - phase: 04a-g2-engine-raster-status-hud
    provides: raster-worker.ts with inline buildGreyscalePalette + ditherTile (source of extraction)
provides:
  - exported buildGreyscalePalette() — 16-step phosphor-green greyscale palette
  - exported ditherTile(rgba, w, h, pal) — size-parameterized Floyd-Steinberg dithering via image-q
  - raster-worker.ts now delegates both helpers to dither-utils.ts (zero behavior change)
affects: [21-04, portrait-pipeline, canvas-character-sheet-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Size-parameterized dither helper: ditherTile takes explicit w/h so portrait (100×60) and map tiles (200×100) share one algorithm"
    - "ReturnType<typeof buildGreyscalePalette> for singleton type avoids re-importing image-q just for the type annotation"
    - "Use ImageQ.utils.Palette.getPointContainer().toUint8Array() (public API) to inspect palette entries in tests — .pointArray is private/internal"

key-files:
  created:
    - packages/g2-app/src/raster/dither-utils.ts
    - packages/g2-app/src/raster/dither-utils.test.ts
  modified:
    - packages/g2-app/src/raster/raster-worker.ts

key-decisions:
  - "Use ReturnType<typeof buildGreyscalePalette> for palette singleton type in raster-worker rather than re-importing image-q namespace"
  - "Tests verify palette values via getPointContainer().toUint8Array() (public image-q API) not .pointArray (private field)"

patterns-established:
  - "Shared dither util pattern: pure deterministic functions exported from dither-utils.ts, consumed by both raster-worker and portrait pipeline"

requirements-completed: [RSHEET-03]

# Metrics
duration: 6min
completed: 2026-06-07
---

# Phase 21 Plan 02: Dither-Utils Extraction Summary

**Floyd-Steinberg dithering extracted from raster-worker.ts into size-parameterized exported dither-utils.ts, enabling portrait pipeline (Plan 21-04) to reuse the exact same greyscale algorithm without duplication.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-07T19:19:38Z
- **Completed:** 2026-06-07T19:25:35Z
- **Tasks:** 2 (TDD Task 1 + refactor Task 2)
- **Files modified:** 3

## Accomplishments

- Created `dither-utils.ts` exporting `buildGreyscalePalette()` and `ditherTile(rgba, w, h, pal)` with full TSDoc per INV-4
- `ditherTile` is now size-parameterized (takes explicit `w`/`h`) — works for 200×100 map tiles AND 100×60 portrait tiles
- `raster-worker.ts` imports from `./dither-utils.js`, removes inline definitions; call site passes `TILE_W, TILE_H` explicitly
- All 1525 g2-app tests pass identically; raster pipeline output bytes unchanged (zero behavior change)

## Task Commits

1. **Task 1 RED — failing tests** - `b355d06` (test)
2. **Task 1 GREEN — create dither-utils.ts** - `d22ecaf` (feat)
3. **Task 2 — refactor raster-worker.ts** - `86bc1e4` (refactor)

## Files Created/Modified

- `packages/g2-app/src/raster/dither-utils.ts` — New module: exported `buildGreyscalePalette()` + `ditherTile(rgba, w, h, pal)`
- `packages/g2-app/src/raster/dither-utils.test.ts` — 6 tests: DITHER-PAL-01/02, DITHER-TILE-01/02/03/04
- `packages/g2-app/src/raster/raster-worker.ts` — Removed inline definitions, added import from `./dither-utils.js`, updated call site

## Decisions Made

- `ReturnType<typeof buildGreyscalePalette>` used for palette singleton type to avoid re-importing `image-q` namespace just for the type annotation
- Test DITHER-PAL-01/02 use `pal.getPointContainer().toUint8Array()` (public `ImageQ.utils.Palette` API) — `.pointArray` is a private field and throws at runtime in the test environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test used non-existent ImageQ.utils.Palette.pointArray (private field)**
- **Found during:** Task 1 GREEN phase (first test run after creating dither-utils.ts)
- **Issue:** Test DITHER-PAL-01/02 called `pal.pointArray` which is `undefined` at runtime — the field is `_pointArray` (private); the public API is `getPointContainer().toUint8Array()` returning a 64-byte flat array
- **Fix:** Rewrote DITHER-PAL-01/02 to use `pal.getPointContainer().toUint8Array()` — verified via Node.js prototype inspection of the real image-q CJS bundle
- **Files modified:** `packages/g2-app/src/raster/dither-utils.test.ts`
- **Verification:** All 6 DITHER-* tests pass; palette values 0,16,...,240 with alpha 255 confirmed
- **Committed in:** `d22ecaf` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test against private API)
**Impact on plan:** Fix corrected the test to use the real public API. No scope creep.

## Issues Encountered

None beyond the auto-fixed test API issue above.

## User Setup Required

None — pure internal refactor, no external service configuration required.

## Next Phase Readiness

- `ditherTile` + `buildGreyscalePalette` ready for Plan 21-04 portrait pipeline
- `raster-worker.ts` zero behavior change confirmed by 1525 passing tests
- `dither-utils.ts` is the canonical dither source for all future canvas rendering in g2-app

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. Pure internal utility extraction — no new trust boundaries introduced.

## Known Stubs

None — this plan produces utility functions only, no UI rendering stubs.

## Self-Check

- [x] `packages/g2-app/src/raster/dither-utils.ts` — created
- [x] `packages/g2-app/src/raster/dither-utils.test.ts` — created
- [x] `packages/g2-app/src/raster/raster-worker.ts` — modified (imports from dither-utils)
- [x] Commits `b355d06`, `d22ecaf`, `86bc1e4` exist in git log
- [x] All 1525 g2-app tests pass
- [x] typecheck exits 0

---
*Phase: 21-character-sheet-su-canvas-dati-main-tab*
*Completed: 2026-06-07*
