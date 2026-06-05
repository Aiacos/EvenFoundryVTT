---
phase: 19-adr-0013-amendment-1-canvas-compositor-core
plan: "02"
subsystem: g2-app/hud
tags: [geometry, inv-2, rinv-02, hud-raster, tile-geometry]
dependency_graph:
  requires: [RAST-05, ADR-0013-Amendment-1]
  provides: [RINV-02]
  affects: [19-03-PLAN, 19-04-PLAN]
tech_stack:
  added: []
  patterns: [geometry-constants-migration, tdd-fixture-correction]
key_files:
  created: []
  modified:
    - packages/g2-app/src/hud/hud-raster-frame.ts
    - packages/g2-app/src/hud/hud-raster-frame.test.ts
    - packages/g2-app/src/hud/hud-poc-page.test.ts
decisions:
  - "HUD_TILE_GEOMETRY corrected to 200×100 tiles / 400×200 raster region (INV-2 verified 2026-06-05)"
  - "buildHudTiles now validates rgba.length === 400*200*4 = 320000 (was 576*288*4 = 663552)"
  - "On-screen placement of the 400×200 region in 576×288 is parameterized (Phase 20 decision)"
  - "Test fixture updates are deliberate corrections (not regressions) per ADR-0013 Amendment 1"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-05"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 19 Plan 02: HUD_TILE_GEOMETRY 288×144 → 200×100 (RINV-02) Summary

**One-liner:** HUD raster frame constants corrected to INV-2-verified 200×100/400×200 geometry; buildHudTiles validates 320000-byte buffers; all 24 HUD geometry tests pass.

## What Was Built

### Task 1: hud-raster-frame.ts geometry migration

Constants in `packages/g2-app/src/hud/hud-raster-frame.ts` corrected from the PoC/simulator-only values to the INV-2-verified hardware geometry:

| Constant | Before | After | Source |
|----------|--------|-------|--------|
| `FRAME_W` | 576 | **400** | INV-2 2026-06-05 |
| `FRAME_H` | 288 | **200** | INV-2 2026-06-05 |
| `TILE_W` | 288 | **200** | max per `hub.evenrealities.com/docs/guides/display` |
| `TILE_H` | 144 | **100** | max per `hub.evenrealities.com/docs/guides/display` |

`buildHudTiles` error message updated: `expected 576*288*4` → `expected 400*200*4 = 320000`.

`HUD_TILE_GEOMETRY` auto-inherits the correct offsets from constants:
- tile-0: (0,0) 200×100
- tile-1: (200,0) 200×100
- tile-2: (0,100) 200×100
- tile-3: (200,100) 200×100

All JSDoc updated: file header, `HudTileGeometryEntry`, `HUD_TILE_GEOMETRY` ASCII diagram, `ditherTile`, `splitIntoTiles`, `buildHudTiles`. The `x`/`y` fields in `HudTileGeometryEntry` are explicitly documented as offsets **relative to the 400×200 raster-region origin** (not absolute screen coordinates). On-screen placement of the 400×200 region within 576×288 is parameterized — Phase 20 decision.

No zero remaining `576`/`288`/`144` literals in live code paths. All remaining occurrences are in comments explaining the historical context of the correction.

### Task 2: Test fixture updates

Both test files updated to assert the 200×100/400×200 geometry:

- `hud-raster-frame.test.ts`: FRAME_W/H=400/200, TILE_W/H=200/100; tile position assertions updated; error message regex `expected 400*200*4`; sub-region comment updated.
- `hud-poc-page.test.ts`: HUD_POC_CONTAINERS width/height 200/100 for all 4 entries; xPosition/yPosition offsets corrected.

These are **deliberate fixture corrections** (per RINV-02 + ADR-0013 Amendment 1), not regressions.

## Test Results

```
Test Files  2 passed (hud-raster-frame.test.ts + hud-poc-page.test.ts)
Tests  24 passed (24)
```

No collateral regressions: `src/hud` + `src/engine` suite = 260 tests, all green.

TypeScript: `tsc --noEmit` exits 0 (no type errors).

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Migrate hud-raster-frame.ts geometry 288×144 → 200×100 | `8d324c3` |
| 2 | Update HUD geometry test assertions 288×144 → 200×100 | `6ba04cf` |

## Deviations from Plan

None — plan executed exactly as written. The test updates in Task 2 match the acceptance criteria exactly.

## Known Stubs

None. The on-screen placement of the 400×200 region within 576×288 is intentionally parameterized (not a stub) — this is a Phase 20 decision per ADR-0013 Amendment 1.

## Threat Flags

None. Internal rendering-geometry constants + tests; no network, auth, or input parsing surface.

## Self-Check: PASSED

- `grep -c "const TILE_W = 200" packages/g2-app/src/hud/hud-raster-frame.ts` → 1 ✓
- `grep "const TILE_H = 100"` → found ✓
- `grep "const FRAME_W = 400"` → found ✓
- `grep "const FRAME_H = 200"` → found ✓
- `grep -vE '^\s*\*|^\s*//' packages/g2-app/src/hud/hud-raster-frame.ts | grep -cE '\b(288|144)\b'` → 0 ✓
- Vitest: 24/24 tests pass (hud-raster-frame.test.ts + hud-poc-page.test.ts) ✓
- Vitest: 260/260 tests pass (hud + engine suite, no collateral regressions) ✓
- tsc --noEmit: exit 0 ✓
- Commits `8d324c3` and `6ba04cf` exist ✓
- JSDoc cites `hub.evenrealities.com/docs/guides/display` ✓
