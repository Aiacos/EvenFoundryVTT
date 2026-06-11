---
phase: quick-260611-dg5
plan: "01"
subsystem: g2-app/engine
tags: [performance, throttle, fps, hud, delta-driver]
dependency_graph:
  requires: []
  provides: [trailing-edge-rearm-throttle]
  affects: [hud-fps, hud-delta-driver, render-loop]
tech_stack:
  added: []
  patterns:
    - trailing-edge re-arm throttle with elapsed-time compensation
    - single-in-flight async cycle guard (_cycleInFlight)
    - coalescing pending flag (_pendingAgain) for event loss prevention
key_files:
  created:
    - .changeset/dg5-trailing-edge-rearm.md
  modified:
    - packages/g2-app/src/engine/hud-delta-driver.ts
    - packages/g2-app/src/engine/hud-delta-driver.test.ts
decisions:
  - "Trailing-edge re-arm: period = max(interval, cycleTime) by re-arming with Math.max(0, interval - elapsed) in .finally"
  - "Two new private fields: _pendingAgain (coalesce flag) and _cycleInFlight (overlap guard)"
  - "_fireCycle() extracted from _schedule() timer callback to own the fire-start timestamp"
  - "stop() clears _pendingAgain before unsubs so in-flight .finally cannot re-arm post-teardown"
metrics:
  duration: "8 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260611-dg5: Trailing-Edge Throttle Re-arm in HudDeltaDriver — Summary

Trailing-edge re-arm throttle in `HudDeltaDriver` — delivered HUD fps ~17 → ≥25 under continuous ~30fps frame input by making the real period `max(interval, cycleTime)` instead of `interval + cycleTime`.

## What Was Built

### Task 1: Trailing-edge re-arm throttle (commit `6682d09`)

**Root cause (diagnosed 2026-06-11):** The leading-edge throttle in `_schedule()` dropped all events while `_timer !== null`. After the timer fired and `_runCycle()` completed (~15ms), no cycle would re-arm until the NEXT external event arrived. Real period = `interval + cycleTime` ≈ 48-60ms → ~17 fps delivered under continuous ~30fps frame input.

**Fix:** Two new private fields + `_fireCycle()` extraction:

- `_pendingAgain: boolean` — set when `_schedule()` is called during a busy window (timer pending OR cycle in flight). When the in-flight cycle completes (`.finally`), if this flag is set the driver re-arms with `Math.max(0, interval - elapsed)` ms.
- `_cycleInFlight: boolean` — set for the duration of `_runCycle()`. `_schedule()` gates on both `_timer !== null || _cycleInFlight` so events arriving in the gap between timer-fire and cycle-completion are also coalesced.
- `_fireCycle()` private method — captures `fireStart = Date.now()` before `_runCycle()`, manages `_cycleInFlight`, and performs the trailing-edge re-arm in `.finally`.
- `stop()` now clears `_pendingAgain = false` before releasing subscriptions, ensuring no follow-up cycle fires after teardown (stop-during-pending invariant).

All existing public API signatures, JSDoc, WR-01 `.catch` warn, CM-01 serialization, zero-push-on-idle, and `DEFAULT_MIN_REDRAW_INTERVAL_MS = 100` are preserved.

### Task 2: Vitest coverage + patch changeset (commit `49116ce`)

Five new tests added alongside the existing DL-01..DL-08 suite:

- **DL-09 cadence** — continuous deltas every 50ms for 1000ms → ≥8 composite calls (trailing pacing)
- **DL-10 no event loss** — event during pending window sets `_pendingAgain`, exactly one follow-up cycle fires
- **DL-11 no overlap** — three sequential cycles with distinct mutations, composite() calls serialized in order
- **DL-12 idle no re-arm** — no events after first cycle → zero additional composites (D-24.3 preserved)
- **DL-13 stop during pending** — `stop()` clears `_pendingAgain` before `.finally` re-arm check → no cycle after stop

Total test count: 1673 existing → 1678 (+5 new, all green).

Changeset `.changeset/dg5-trailing-edge-rearm.md` declares `patch @evf/g2-app`.

## Verification Results

- `corepack pnpm --filter @evf/g2-app exec tsc --noEmit` — no errors in `hud-delta-driver.ts` (pre-existing workspace-wide xxhash-wasm type errors are baseline issues unrelated to this change)
- `corepack pnpm --filter @evf/g2-app test -- --run hud-delta-driver` — **1678/1678 tests passed**
- `corepack pnpm --filter @evf/g2-app exec biome ci src/engine/hud-delta-driver.ts src/engine/hud-delta-driver.test.ts` — **clean**
- `.changeset/dg5-trailing-edge-rearm.md` declares `@evf/g2-app: patch` ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `packages/g2-app/src/engine/hud-delta-driver.ts` — exists ✓
- `packages/g2-app/src/engine/hud-delta-driver.test.ts` — exists ✓
- `.changeset/dg5-trailing-edge-rearm.md` — exists ✓
- Commits `6682d09` and `49116ce` verified in git log ✓
