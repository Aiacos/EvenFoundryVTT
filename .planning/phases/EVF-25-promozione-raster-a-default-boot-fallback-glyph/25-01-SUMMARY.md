---
phase: 25-promozione-raster-a-default-boot-fallback-glyph
plan: "01"
subsystem: g2-app/hud
tags: [extraction, tdd, behavior-preserving, cm-01, inv-4]
dependency_graph:
  requires: []
  provides: [hud/push-hud-tiles.ts]
  affects: [engine/layer-manager.ts, engine/hud-delta-driver.ts, hud/boot-hud-raster-poc.ts, hud/hud-poc-page.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, behavior-preserving-extract]
key_files:
  created:
    - packages/g2-app/src/hud/push-hud-tiles.ts
    - packages/g2-app/src/hud/push-hud-tiles.test.ts
  modified:
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/hud-delta-driver.ts
    - packages/g2-app/src/hud/hud-raster-frame.ts
    - packages/g2-app/src/hud/hud-poc-page.ts
    - packages/g2-app/src/hud/hud-poc-page.test.ts
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
decisions:
  - "pushHudTiles extracted to standalone production module; warn prefix updated from [EVF] hud-poc: to [EVF] push-hud-tiles: per INV-4 (no PoC labels in production modules)"
  - "hud-poc-page.test.ts re-pointed to import pushHudTiles from push-hud-tiles.js (keeps existing test coverage alive until Plan 03 deletes the PoC file)"
metrics:
  duration: "~6 min"
  completed: "2026-06-08"
  tasks_completed: 2
  files_changed: 6
requirements: [RPROMO-02]
---

# Phase 25 Plan 01: Extract pushHudTiles to production module (25-01) Summary

**One-liner:** Behavior-preserving TDD extraction of `pushHudTiles` from `hud-poc-page.ts` into a standalone `hud/push-hud-tiles.ts` with 5 isolated tests; all 3 importers re-pointed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing test for push-hud-tiles | `887946a` | push-hud-tiles.test.ts |
| 1 (GREEN) | Create push-hud-tiles.ts production module | `a06bbb2` | push-hud-tiles.ts, push-hud-tiles.test.ts |
| 2 | Re-point importers + fix stale @see tags | `27fab2c` | layer-manager.ts, hud-delta-driver.ts, boot-hud-raster-poc.ts, hud-poc-page.ts, hud-poc-page.test.ts, hud-raster-frame.ts |

## What Was Built

### `hud/push-hud-tiles.ts` (NEW — production module)

Standalone module exporting `pushHudTiles(bridge, tiles): Promise<void>` — the CM-01 serialized tile-push path. The `for...of` + `await` loop is load-bearing (Even Hub SDK rejects concurrent `updateImageRawData` calls). Fail-soft: warns on non-success, never throws. Warn prefix updated from `[EVF] hud-poc:` to `[EVF] push-hud-tiles:` per INV-4.

### `hud/push-hud-tiles.test.ts` (NEW — isolated coverage)

5 tests: empty-array no-call, 2-tile success call count, call shape assertions (containerID/containerName/imageData per tile), warn-on-non-success (resolves, no throw), CM-01 serial order preserved. These tests ensure coverage survives when Plan 03 deletes `hud-poc-page.test.ts`.

### Re-pointed importers

- `engine/layer-manager.ts` line 39: `hud-poc-page.js` → `push-hud-tiles.js`
- `engine/hud-delta-driver.ts` line 34: `hud-poc-page.js` → `push-hud-tiles.js`
- `hud/boot-hud-raster-poc.ts` line 66: split into separate imports — `createHudPocPage` from `hud-poc-page.js`, `pushHudTiles` from `push-hud-tiles.js`
- `hud/hud-poc-page.test.ts` line 18: `pushHudTiles` import re-pointed to `push-hud-tiles.js`

### Stale @see tags fixed

- `engine/hud-delta-driver.ts` module JSDoc: `hud-poc-page.ts (pushHudTiles CM-01)` → `push-hud-tiles.ts`
- `engine/layer-manager.ts` `_compositeAndPush` JSDoc: `hud-poc-page.ts#pushHudTiles` → `push-hud-tiles.ts#pushHudTiles`
- `hud/hud-raster-frame.ts` `buildHudTiles` JSDoc: `hud-poc-page.ts (consumer — pushHudTiles)` → `push-hud-tiles.ts (consumer — pushHudTiles)`

### `hud-poc-page.ts` trimmed (NOT deleted)

- `pushHudTiles` function removed
- `ImageRawDataUpdate`, `ImageRawDataUpdateResult` imports removed (now unused)
- `HudTile` type import removed (now unused)
- Module-level JSDoc updated to reflect the extraction
- File remains in place — Plan 03 deletes it

## Deviations from Plan

None — plan executed exactly as written. One minor correction: `hud-poc-page.test.ts` import also needed updating (not listed in Task 2 `<files>` but implied by the typecheck requirement — Rule 3 auto-fix, blocked compile).

## Verification

- `corepack pnpm --filter @evf/g2-app test` — 1599/1599 green (111 test files)
- `corepack pnpm exec tsc --noEmit` — 0 errors
- `grep -rn "from '../hud/hud-poc-page" packages/g2-app/src/engine/` — 0 results
- `hud-poc-page.ts` still exists (Plan 03 deletes it)
- `grep -c "export async function pushHudTiles" packages/g2-app/src/hud/hud-poc-page.ts` → 0

## Known Stubs

None — no placeholder or stub content introduced.

## Threat Flags

None — this is a pure code-move with no new network endpoints, auth paths, file access patterns, or schema changes.

## TDD Gate Compliance

- RED gate: commit `887946a` `test(g2-app): add failing tests for push-hud-tiles (RED 25-01)`
- GREEN gate: commit `a06bbb2` `feat(g2-app): extract pushHudTiles to production module push-hud-tiles.ts (GREEN 25-01)`
- No REFACTOR step needed (code moved verbatim, only warn prefix updated per INV-4)

## Self-Check: PASSED

- `packages/g2-app/src/hud/push-hud-tiles.ts` — FOUND
- `packages/g2-app/src/hud/push-hud-tiles.test.ts` — FOUND
- Commit `887946a` — FOUND (RED)
- Commit `a06bbb2` — FOUND (GREEN)
- Commit `27fab2c` — FOUND (Task 2)
