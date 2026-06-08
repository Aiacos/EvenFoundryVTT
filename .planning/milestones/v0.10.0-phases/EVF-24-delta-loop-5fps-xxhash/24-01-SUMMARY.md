---
phase: 24-delta-loop-5fps-xxhash
plan: "01"
subsystem: g2-app/engine
tags: [tdd, delta-loop, xxhash, debounce, ble-optimization]
dependency_graph:
  requires: []
  provides:
    - HudDeltaDriver class (engine/hud-delta-driver.ts)
    - DEFAULT_MIN_REDRAW_INTERVAL_MS = 100 exported const
    - HudDeltaDriverOpts interface
  affects:
    - packages/g2-app/src/engine/hud-delta-driver.ts (NEW)
    - packages/g2-app/src/engine/hud-delta-driver.test.ts (NEW)
tech_stack:
  added: []
  patterns:
    - xxhash-wasm h32Raw lazy-singleton init (mirrors raster-worker.ts)
    - setTimeout debounce collapse (clear-and-reschedule)
    - Multi-channel WS subscribe (character.delta + combat.turn + combat.state)
    - Serialized pushHudTiles for...of + await (CM-01, no Promise.all)
    - TDD RED/GREEN with vi.useFakeTimers() + vi.mock('xxhash-wasm')
key_files:
  created:
    - packages/g2-app/src/engine/hud-delta-driver.ts
    - packages/g2-app/src/engine/hud-delta-driver.test.ts
  modified: []
decisions:
  - "D-24.1 confirmed: DEFAULT_MIN_REDRAW_INTERVAL_MS = 100 (overrides ROADMAP literal 200)"
  - "Open Q1 resolved: combat channels are combat.turn + combat.state (not combat.delta)"
  - "Open Q2 resolved: first-frame push lives entirely in HudDeltaDriver.runFirstFrame()"
  - "Hash target: tile.bytes (PNG Uint8Array) — deterministic for identical RGBA input (D-24.5)"
metrics:
  duration_minutes: 6
  completed_date: "2026-06-08"
  tasks_completed: 2
  files_changed: 2
---

# Phase 24 Plan 01: HudDeltaDriver (debounced per-tile xxhash delta loop) Summary

**One-liner:** HudDeltaDriver standalone class with xxhash-wasm h32Raw per-tile delta detection, configurable 100ms debounce, multi-channel WS subscribe, and zero-push-on-idle semantics.

## What Was Built

Two new files under `packages/g2-app/src/engine/`:

**`hud-delta-driver.ts`** — exports:
- `DEFAULT_MIN_REDRAW_INTERVAL_MS = 100` (D-24.1; overrides ROADMAP literal 200)
- `HudDeltaDriverOpts` interface (compositor, bridge, wsEvents, minRedrawIntervalMs?)
- `HudDeltaDriver` class with:
  - `async start()` — WASM init once + subscribe to 3 channels
  - `async runFirstFrame()` — push all 4 tiles unconditionally, seed hash baselines
  - `stop()` — cancel pending debounce timer, release all subscriptions
  - `_schedule()` — clear-and-reschedule debounce (collapse near-simultaneous events)
  - `_runCycle()` — composite → buildHudTiles → per-tile h32Raw → push only changed tiles

**`hud-delta-driver.test.ts`** — 8 tests (DL-01..DL-06 + first-frame + default-interval):
- DL-01: 1-of-4 tiles changed → exactly 1 updateImageRawData (containerID=0)
- DL-02: 0 tiles changed → 0 pushes (zero-push-on-idle, D-24.3)
- DL-03: 3 rapid deltas within window → 1 composite() call (debounce collapse)
- DL-04: configurable interval — 49ms advance does NOT fire; 50ms does
- DL-05: static-chrome determinism — identical compositor output → 0 pushes second cycle
- DL-06: stop() cancels pending timer + releases all 3 channel unsubs
- first-frame: runFirstFrame() pushes 4 tiles; subsequent identical cycle → 0 pushes
- default-interval: DEFAULT_MIN_REDRAW_INTERVAL_MS === 100

## TDD Gate Compliance

RED gate: commit `c41bd2f` — test file fails to import `./hud-delta-driver.js` (file did not exist).
GREEN gate: commit `66c4d87` — all 8 DL tests pass; tsc --noEmit exit 0; biome clean.

## Deviations from Plan

**1. [Rule 3 - Auto-fix] Biome import sort order**
- Found during: Task 2 (implementation)
- Issue: Biome `organizeImports` flagged import order in `hud-delta-driver.ts`
- Fix: Reordered imports to Biome canonical order (external packages first, then relative)
- Files modified: `packages/g2-app/src/engine/hud-delta-driver.ts`
- Commit: `66c4d87` (included in same commit)

## Resolved Open Questions

- **Open Q1** (combat channel names): `combat.turn` + `combat.state` are the real channel strings (verified in `canvas-combat-tracker-panel.ts` COMBAT_TURN_DELTA_TYPE/COMBAT_STATE_DELTA_TYPE and bridge delta-emitter.ts DELTA_CAP_MAP). `combat.delta` does NOT exist.
- **Open Q2** (first-frame ownership): `HudDeltaDriver.runFirstFrame()` owns the first push, completely replacing `LayerManager._compositeAndPush()`. This is wired in Plan 24-02.

## Known Stubs

None. The driver is standalone and fully functional; wiring into LayerManager is Plan 24-02 scope.

## Threat Flags

None. HudDeltaDriver processes no user input — it reads compositor RGBA and writes to bridge. The debounce (D-24.1) naturally mitigates DoS from rapid delta events (malformed payloads → at most 1 render cycle per 100ms window).

## Self-Check

Checking created files exist:
- `packages/g2-app/src/engine/hud-delta-driver.ts` — FOUND
- `packages/g2-app/src/engine/hud-delta-driver.test.ts` — FOUND

Checking commits exist:
- `c41bd2f` — RED test commit — FOUND
- `66c4d87` — GREEN implementation commit — FOUND

## Self-Check: PASSED
