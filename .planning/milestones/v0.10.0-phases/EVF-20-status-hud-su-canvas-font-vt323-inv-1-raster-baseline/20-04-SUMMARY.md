---
phase: 20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
plan: "04"
subsystem: validation-harness/inv-suite
tags: [inv-1, raster, glyph, false-pass-guard, inv-suite, quality-gate]
dependency_graph:
  requires: [20-02]
  provides: [RINV-01-gate]
  affects: [inv-all, inv-suite.ts, inv-suite.test.ts]
tech_stack:
  added: []
  patterns:
    - checkInv5 FALSE-PASS guard pattern mirrored to checkInv1Raster
    - mergeInv1Results: compound INV-1 gate (both sub-suites must be green)
key_files:
  modified:
    - packages/validation-harness/src/inv-suite.ts
    - packages/validation-harness/src/__tests__/inv-suite.test.ts
decisions:
  - Keep InvId union unchanged (INV-1 covers both glyph and raster via compound detail)
  - glyph + raster run concurrently via Promise.all; merged before the outer Promise.all
  - FALSE-PASS guard on raster mirrors checkInv5 exactly: skipped (not red) for zero-test exit-0
  - mergeInv1Results: red wins; skipped beats green; both-green produces compound detail
metrics:
  duration: "~8 min"
  completed: "2026-06-06T08:18:00Z"
  tasks_completed: 1
  files_modified: 2
---

# Phase 20 Plan 04: INV-1 Glyph+Raster Gate with FALSE-PASS Guard — Summary

**One-liner:** Added `checkInv1Raster` + `mergeInv1Results` to wire the RINV-01 raster suite into the `inv:all` INV-1 gate alongside the existing glyph suite, with a FALSE-PASS guard mirroring `checkInv5`.

## What Was Built

### Task 1: checkInv1Raster + glyph/raster merge + IS-09 tests

**`packages/validation-harness/src/inv-suite.ts`**

- `checkInv1` renamed to `checkInv1Glyph`; detail string prefixed with `glyph suite:`.
- New `checkInv1Raster(repoRoot)`: runs `pnpm --filter @evf/g2-app test -- --run --testNamePattern RINV-01`; applies the FALSE-PASS guard (exit-0 + `/no test files found|no tests found|\b0 tests\b/i` → `skipped`, not green).
- New `mergeInv1Results(glyph, raster)`: red if either is red; skipped if either is skipped (but not red); green with compound detail `'glyph suite: pass; raster suite: pass'` only when both are green.
- `runInvSuite`: runs `checkInv1Glyph` + `checkInv1Raster` in parallel via `Promise.all`, merges via `mergeInv1Results`, then feeds the merged result into the outer `Promise.all` alongside INV-2..INV-5. Result count remains 5; `InvId` union unchanged.

**`packages/validation-harness/src/__tests__/inv-suite.test.ts`**

- Added `IS-09a`: both green → INV-1 green, detail contains both "glyph suite" and "raster suite".
- Added `IS-09b`: raster exit-1 → INV-1 red; `allGreen` false.
- Added `IS-09c`: glyph exit-1 → INV-1 red; `allGreen` false.
- Added `IS-09d`: raster exit-0 with "No test files found" → INV-1 not green (skipped); FALSE-PASS guard confirmed.

## Verification

```
pnpm --filter @evf/validation-harness exec tsc --noEmit   # exit 0
pnpm --filter @evf/validation-harness test -- --run inv-suite   # 27 tests pass
pnpm test -- --run   # 3179 tests pass (3175 pre-plan + 4 new IS-09 tests)
```

## Acceptance Criteria

- [x] `checkInv1Raster` and `checkInv1Glyph` both exist in `inv-suite.ts` (grep count ≥2: returns 7)
- [x] Merged INV-1 is red if either sub-suite is red (IS-09b, IS-09c)
- [x] FALSE-PASS guard present: zero-test exit-0 from raster → INV-1 not green (IS-09d)
- [x] INV-1 green detail references both "glyph suite" and "raster suite" (IS-09a)
- [x] `pnpm --filter @evf/validation-harness exec tsc --noEmit` exits 0
- [x] `pnpm --filter @evf/validation-harness test -- --run inv-suite` green (27/27)

## Deviations from Plan

None — plan executed exactly as written. The `InvId` union was kept unchanged per Open Question 3 resolution (compound detail on a single `INV-1` entry).

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. The FALSE-PASS guard mitigates T-20-GATE (exit-0 interpretation at the test-runner boundary).

## Self-Check

- `packages/validation-harness/src/inv-suite.ts` — modified (checkInv1Glyph + checkInv1Raster + mergeInv1Results + runInvSuite update)
- `packages/validation-harness/src/__tests__/inv-suite.test.ts` — modified (IS-09a/b/c/d added)
- Commit `20ed7cd` present in git log
