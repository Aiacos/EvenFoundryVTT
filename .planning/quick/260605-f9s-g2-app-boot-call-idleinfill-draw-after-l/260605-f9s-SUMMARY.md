---
phase: quick-260605-f9s
plan: "01"
subsystem: g2-app
tags: [boot-sequence, raster-idle, idle-infill, map-capture, inv-1, tdd]
dependency_graph:
  requires: [260605-etr, 260604-qm0]
  provides: [F9S-Z05, F9S-MAPCAP]
  affects: [boot-engine-core, map-base-layer, idle-infill-layer]
tech_stack:
  added: []
  patterns:
    - "finalizeIdleRender() extracted helper — post-bundle idle render with per-call rejection guard (T-etr-03)"
    - "MapBaseLayer.draw() mode-before-null pattern — resolve operative mode first, then branch on scene presence"
key_files:
  created:
    - packages/g2-app/src/__tests__/boot-engine-idle-render.test.ts
  modified:
    - packages/g2-app/src/raster/map-base-layer.ts
    - packages/g2-app/src/raster/map-base-layer.test.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
decisions:
  - "finalizeIdleRender extracted as exported pure helper to enable unit testing without mocking the full boot infrastructure (option (a) from the plan)"
  - "MBL-IDLE no-frame raster path: write empty string to map-capture, return (no requestFrame) — matches INV-1 fixture row 5-18"
  - "MBL-IDLE no-frame glyph path: true no-op — glyph map-capture is owned by renderGlyphScene on scene arrival"
metrics:
  duration: "~4 min"
  completed: "2026-06-05"
  tasks: 2
  files: 4
---

# Phase quick-260605-f9s Plan 01: Boot idle render — idleInfill.draw() post-bundle + map-capture blank Summary

**One-liner:** Post-bundle idle render: `finalizeIdleRender(idleInfill, mapBase)` calls `idleInfill.draw()` then `mapBase.draw()` at step 13; raster no-frame path blanks `map-capture` so SDK "Text" default is never shown.

## What Was Built

Two boot-time render defects that left the EvenHub SDK default literal `"Text"` visible on the glasses in raster-idle are fixed:

**FIX 1 — z=0.5 strips (ids 8-10): `idleInfill.draw()` never called post-bundle**

`boot-engine-core.ts` step 13 previously called only `await mapBase.draw()`. The step-12a comment incorrectly claimed idle infill "self-redraws via its own draw()". In fact, no code ever called `idleInfill.draw()` post-bundle, so the z05 strips (combat-log/label/stats) kept the SDK default `"Text"` at every boot.

Fix: extracted `finalizeIdleRender(idleInfill, mapBase): Promise<void>` — an exported pure helper that awaits `idleInfill.draw()` first (try/catch), then `mapBase.draw()` (try/catch). Step 13 now calls `finalizeIdleRender` in place of the bare `await mapBase.draw()`. The step-12a comment was corrected to accurately state that idle infill is explicitly drawn at step 13.

**FIX 2 — map-capture (id7) shows SDK `"Text"` in raster-idle**

`MapBaseLayer.draw()` previously had an unconditional early `return` when `currentScene === null`. In raster mode the visible map area is the image tile grid (`map-tile-0..3`); `map-capture` (the text capture container, id7) must be blank — the image tiles sit on top of it. Without the blank write, the SDK leaves `map-capture` at its boot-time default `"Text"`.

Fix: mode resolution (`resolveAutoMode`) is now done BEFORE the null-scene check. When mode is `'raster'` and no scene exists, a `textContainerUpgrade` for `map-capture` with `content: ''` is issued. When mode is `'glyph'` and no scene exists, the method is a true no-op (glyph map-capture is owned by `renderGlyphScene` when a scene arrives). Scene-present paths are unchanged. `TextContainerUpgrade` import was added to `map-base-layer.ts`.

## Tests Added

| File | Tests | Purpose |
|------|-------|---------|
| `map-base-layer.test.ts` | MBL-IDLE-01, MBL-IDLE-02, MBL-IDLE-03 | Raster no-frame blanks map-capture; glyph no-frame no-ops; scene-present path unchanged |
| `boot-engine-idle-render.test.ts` | F9S-BOOT-01, F9S-BOOT-02, F9S-BOOT-03 | Both draws called; idleInfill before mapBase; rejection resilience |

All 5 pre-existing `MBL-PORT-*` tests continue to pass.

## Verification Results

```
corepack pnpm --filter @evf/g2-app exec vitest run  → 1448 passed, 0 failed (96 files)
corepack pnpm --filter @evf/g2-app typecheck        → clean (0 errors)
corepack pnpm lint:ci                               → exit 0 (0 errors in task files)
```

**INV-1 gate:** Zero fixture drift. No fixture file was edited. The changes implement content already specified in `glyph-scene.raster-idle-it.txt` (z05 rows 19-21 with real idle content; map area rows 5-18 as image tiles over a blank capture container).

**INV-3 gate:** No Specs.md / README / showcase change. This is an implements-existing-fixture task.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `13c59fc` | feat | blank map-capture in raster no-frame path (Task 1 TDD RED+GREEN) |
| `3b3d4a6` | feat | call idleInfill.draw() post-bundle at boot (Task 2 TDD RED+GREEN) |

## Deviations from Plan

None — plan executed exactly as written. The `finalizeIdleRender` helper extraction was the plan's recommended approach (option (a)).

Pre-existing biome warning in `deploy/sync-app-whitelist.mjs` (useTemplate) was present before this task and is outside scope.

## Known Stubs

None — both fixes wire real behavior. The z05 combat-log content remains the Phase 4a placeholder (`'⚔ —'`) per `idle-infill-layer.ts` design (Plan 06 wires `combat.recentEvents[0]`), which is intentional and pre-existing.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `packages/g2-app/src/raster/map-base-layer.ts` — FOUND
- `packages/g2-app/src/raster/map-base-layer.test.ts` — FOUND
- `packages/g2-app/src/internal/boot-engine-core.ts` — FOUND
- `packages/g2-app/src/__tests__/boot-engine-idle-render.test.ts` — FOUND
- commit `13c59fc` — FOUND
- commit `3b3d4a6` — FOUND
