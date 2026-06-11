---
phase: quick-260611-clr
plan: "01"
subsystem: g2-app
tags: [hud, raster, dither, menu, persistence, quick-task]
dependency_graph:
  requires: []
  provides: [dither-mode-toggle, getDitherMode-driver-opt]
  affects: [hud-raster-frame, hud-tile-worker, hud-tile-worker-client, hud-delta-driver, quick-action-menu-panel, boot-engine-core]
tech_stack:
  added: []
  patterns: [kv-store-persistence-helper, live-read-driver-callback]
key_files:
  created:
    - packages/g2-app/src/hud/dither-mode.ts
    - packages/g2-app/src/hud/dither-mode.test.ts
    - .changeset/dither-toggle-menu-item.md
  modified:
    - packages/g2-app/src/hud/hud-raster-frame.ts
    - packages/g2-app/src/hud/hud-tile.worker.ts
    - packages/g2-app/src/hud/hud-tile-worker-client.ts
    - packages/g2-app/src/engine/hud-delta-driver.ts
    - packages/g2-app/src/panels/quick-action-menu-panel.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts
    - packages/g2-app/src/hud/hud-raster-frame.test.ts
    - packages/g2-app/src/engine/hud-delta-driver.test.ts
    - packages/shared-render/src/fixtures/quick-action.base.it.txt
    - packages/shared-render/src/fixtures/quick-action.combat-suspended.it.txt
    - packages/shared-render/src/fixtures/quick-action.base.de.txt
decisions:
  - "[D] Dither inserted between [F] FPS (index 8) and [X] Close (now index 10) — [N] stays at index 7, so double-tap-back activeIndex=7 is unchanged"
  - "dither=false uses direct Math.round quantization (no Bayer offset) — crisper output, better DEFLATE compression on flat regions"
  - "getDitherMode live-read callback in HudDeltaDriver so toggle takes effect on very next cycle without driver reconstruction"
metrics:
  duration: "~20 min"
  completed: "2026-06-11"
  tasks_completed: 3
  files_changed: 14
---

# Quick Task 260611-CLR Summary

On-glasses Bayer-4×4 dither toggle via `[D] Dither` Quick Action menu item, persisted to Even Hub kv store (`view.hud.dither`), honored by both Worker and sync tile-build paths.

## What Was Built

### Task 1: Dither flag through both tile-build paths (TDD)

- `buildHudTiles(rgba, dither=true)`: new optional second param. `dither=true` → Bayer 4×4 (unchanged); `dither=false` → direct nearest-of-16-level quantization (no checkerboard on flat regions).
- `ditherTile` in both `hud-raster-frame.ts` and `hud-tile.worker.ts` updated identically.
- `HudTileWorkerClient.buildTiles(rgba, dither?)`: dither flag posted to Worker message.
- `HudDeltaDriverOpts.getDitherMode?: () => boolean`: live-read callback, resolved at cycle time; `buildTilesAsync` updated to `(rgba, dither) => Promise<HudTile[]>`.
- `_buildTiles` resolves `dither = opts.getDitherMode?.() ?? true` and passes to both paths.

### Task 2: Dither-mode persistence helper + on-glasses toggle wiring (TDD)

- `packages/g2-app/src/hud/dither-mode.ts` created (mirrors `locale-override.ts`):
  - `DITHER_MODE_KV_KEY = 'view.hud.dither'`
  - `loadDitherMode(bridge)`: `'' / unknown → true`; `'0' → false`; throws → true + warn
  - `persistDitherMode(bridge, on)`: writes `'1'/'0'`, swallows errors
- `MAIN_ITEMS` in `quick-action-menu-panel.ts`: `[D] Dither` inserted at index 9 (between [F] FPS and [X] Close).
- `QuickActionMenuCallbacks.onDitherToggle?` added; `case 'dither-toggle'` dispatch wired.
- `i18n-budgets.ts`: `quick_item_dither` key (IT/EN/DE = "Dither", fits LABEL_BUDGET 22).
- `boot-engine-core.ts`:
  - Import: `loadDitherMode`, `persistDitherMode`
  - `let ditherOn = true; void loadDitherMode(bridge).then(...)` boot read-back
  - `getDitherMode: () => ditherOn` into `HudDeltaDriver` opts
  - `onDitherToggle`: flips `ditherOn`, calls `void persistDitherMode(bridge, ditherOn)`, `hudDeltaDriver.requestCycle()`

### Task 3: Full gate

- All 115 test files / 1673 tests pass.
- `tsc --noEmit` exits 0.
- `biome ci src` exits 0.
- `.changeset/dither-toggle-menu-item.md` added (patch for `@evf/g2-app`).

## Commits

| Hash | Message |
|------|---------|
| `20ed7a1` | `test(g2-app): add failing tests for dither flag (CLR-01..04, DL-DITHER)` |
| `013fae9` | `feat(g2-app): thread dither flag through sync+Worker tile-build paths and delta driver` |
| `76732f7` | `test(g2-app): add failing tests for dither-mode persistence helper (DM-01..09)` |
| `86e2c12` | `feat(g2-app): add dither-mode persistence helper + [D] Dither menu item + boot wiring` |
| `381858e` | `chore(g2-app): add changeset patch for on-glasses dither toggle menu item` |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - the dither flag is fully wired end-to-end.

## Threat Flags

None - this change adds no new network endpoints or auth paths.

## Self-Check: PASSED

- `packages/g2-app/src/hud/dither-mode.ts` — EXISTS
- `packages/g2-app/src/panels/quick-action-menu-panel.ts` [D] item — EXISTS (confirmed by fixture tests)
- All 5 commits — VERIFIED in git log above
- Tests 1673/1673 — PASSED
- tsc — CLEAN
- biome ci — EXIT 0
