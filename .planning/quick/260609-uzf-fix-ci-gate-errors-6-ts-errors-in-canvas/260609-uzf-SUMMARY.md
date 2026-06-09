---
phase: quick-260609-uzf
plan: "01"
subsystem: g2-app/status-hud
tags: [ci-fix, typescript, noUncheckedIndexedAccess, biome-format]
dependency_graph:
  requires: []
  provides: [CI-GATE-FIX]
  affects: [packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts]
tech_stack:
  added: []
  patterns: [non-null assertion ! for noUncheckedIndexedAccess mock.calls access]
key_files:
  created: []
  modified:
    - packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts
decisions:
  - "Used non-null assertion (!) idiom for noUncheckedIndexedAccess fixes, matching the established sibling-test pattern (slot-picker-panel.test.ts:234)"
metrics:
  duration: "~5 min"
  completed: "2026-06-09"
  tasks_completed: 2
  files_changed: 1
---

# Quick Task 260609-uzf: Fix CI Gate Errors — 6 TS Errors in Canvas Status-HUD Test

## One-liner

Applied non-null assertions (`!`) to 6 `noUncheckedIndexedAccess` violations in `canvas-status-hud-layer.test.ts` and formatted `packages/bridge/_seed.ts` to restore green CI gates.

## What Was Done

### Task 1: Fix 6 TS errors in canvas-status-hud-layer.test.ts

Fixed all 6 reported TypeScript errors under `noUncheckedIndexedAccess` using the `!` non-null assertion idiom — the established pattern from `slot-picker-panel.test.ts:234`.

**Edits applied:**

- Lines 408-410 (first `[pfCall, caCall, lvCall]` destructuring block, 50px test): `pfCall!`, `caCall!`, `lvCall!`
- Lines 436-438 (second `[pfCall, caCall, lvCall]` destructuring block, 75px test): `pfCall!`, `caCall!`, `lvCall!`
- Lines 455-457 (indexed access in "field text content" test): `calls[0]![0]`, `calls[1]![0]`, `calls[2]![0]`
- Lines 471-472 (indexed access in "null snapshot" test): `calls[0]![0]`, `calls[0]![1]`

No test logic, assertion values, or fixtures were changed. The `!` assertions are sound because `calls.length === 3` (or `=== 1`) is asserted by `expect()` immediately before each block.

### Task 2: Format _seed.ts and commit

Ran `pnpm exec biome check --write packages/bridge/_seed.ts` to apply Biome formatting. The file was formatted (1 fix applied) and remains untracked (`??` in git status). It was NOT staged or committed.

## Verification Results

- `pnpm typecheck`: exits 0, zero references to `canvas-status-hud-layer.test.ts`
- `pnpm lint:ci`: exits 0 (327 warnings — pre-existing noConsole warnings; no format errors)
- Test file: 23/23 tests pass
- Commit `25cf04f` contains exactly 1 file: `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts`
- `packages/bridge/_seed.ts`: formatted, still `??` (untracked)
- Branch: `feat/hud-raster-rendering` (unchanged)
- Unrelated dirty files (engine/*, boot-engine-core.ts, quick-action-menu-panel.ts, STATE.md): untouched

## Commits

| Hash | Message |
|------|---------|
| `25cf04f` | fix(g2-app): type-safe mock-call access in canvas status-hud test (noUncheckedIndexedAccess) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — test-only change, no new surface area.

## Self-Check: PASSED

- File `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts`: FOUND (committed)
- Commit `25cf04f`: FOUND in git log
- `pnpm typecheck`: CLEAN (0 errors in target file)
- `pnpm lint:ci`: exits 0
- 23 tests: PASS
- Branch: `feat/hud-raster-rendering` (unchanged)
