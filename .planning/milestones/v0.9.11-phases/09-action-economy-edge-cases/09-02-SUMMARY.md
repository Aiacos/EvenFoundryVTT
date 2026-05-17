---
phase: 09-action-economy-edge-cases
plan: "02"
subsystem: g2-app/status-hud + g2-app/panels + g2-app/boot-engine
tags: [tdd, action-economy, status-hud, inv-1, preconditioner, boot-wiring]
dependency_graph:
  requires: ["09-01"]
  provides: ["09-03"]
  affects:
    - packages/g2-app/src/status-hud/status-hud-renderer.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
    - packages/g2-app/src/panels/action-options-modal.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN per task (3 cycles)
    - INV-1 snapshot via toMatchFileSnapshot auto-generation
    - Zod literal-cast pattern (as 0|1) for schema-validated numerics
    - Fail-open preconditioner (null cache → allow; server validates)
    - Reverse-attach teardown ordering
key_files:
  created:
    - packages/shared-render/src/fixtures/status-hud.econ-widget-fresh-turn.it.txt
    - packages/shared-render/src/fixtures/status-hud.econ-widget-action-used.it.txt
    - packages/shared-render/src/fixtures/status-hud.econ-widget-multi-attack.it.txt
    - packages/shared-render/src/fixtures/status-hud.econ-widget-en.txt
  modified:
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/i18n-budgets.test.ts
    - packages/g2-app/src/status-hud/status-hud-renderer.ts
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
    - packages/g2-app/src/panels/action-options-modal.ts
    - packages/g2-app/src/panels/action-options-modal.test.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts
decisions:
  - "Reused act_label + bns_label keys (Phase 4a); only 4 new i18n keys added (204→208) — econ.reaction.short, econ.multiattack.template, error.action.already-used-action, error.action.already-used-bonus"
  - "Zod .min(0).max(1) infers number; cast to literal 0|1 at callsite — schema is the authoritative guard, cast only bridges TS gap"
  - "Preconditioner fail-open: null ActionEconomyState cache → allow action (server validates); multi-attack bypass: multiAttackInProgress=true → skip slot check"
  - "toMatchFileSnapshot auto-creates fixture files on first run — no manual fixture writing; INV-1 compliance verified by subsequent test runs diffing against them"
  - "Teardown reverse-attach order: unsubActionEconomy (attached last) → clearActionEconomyState → then prior unsubs"
metrics:
  duration: "~2h (cross-session)"
  completed: "2026-05-16"
  tasks_completed: 3
  files_modified: 9
  files_created: 4
  tests_added: 22
  test_suite_total: 1938
---

# Phase 9 Plan 02: Action Economy Widget + Preconditioner Summary

**One-liner:** Action economy HUD widget (Az./Bns/R glyph row with multi-attack variant) with client-side slot preconditioner in ActionOptionsModal wired through boot-engine-core.

## Tasks Completed

| Task | Name | Commit (RED) | Commit (GREEN) |
|------|------|-------------|----------------|
| 1 | StatusHudRenderer economy widget + 4 i18n keys + INV-1 fixtures | 5199a06 | 0a62a1e |
| 2 | StatusHudLayer economy subscription + ActionOptionsModal preconditioner | 0c74840 | 5d11d4a |
| 3 | boot-engine-core wiring + BERW-13..16 | 0745b9e | 6960e93 |

## What Was Built

### Task 1 — Economy widget in StatusHudRenderer

Added `ActionEconomyWidgetState` interface (exported) and `setActionEconomy()` with structural equality transition guard (mirrors `setMovementBudget` pattern). Row 19 priority: conditions overflow > economy widget > movement chip > blank. The `_buildEconomyChip()` method renders:

- Normal turn: `Az. ░ Bns ░ R░` + optional ` Mov X/Y` suffix (24-char inner cell)
- Action used: `Az. ▓ Bns ░ R░` + optional ` Mov X/Y` suffix
- Multi-attack: `Az. ▓ [Atk N/M]` + optional ` Mov X/Y` suffix

Four INV-1 snapshot fixtures auto-generated via `toMatchFileSnapshot`: fresh turn (IT), action used (IT), multi-attack (IT), English locale.

Four new i18n keys added to `i18n-budgets.ts` (total 208): `econ.reaction.short`, `econ.multiattack.template`, `error.action.already-used-action`, `error.action.already-used-bonus`.

### Task 2 — StatusHudLayer + ActionOptionsModal

`StatusHudLayer` now subscribes to `R1_ACTION_ECONOMY_TYPE` channel. `_onActionEconomy()` runs `ActionEconomyPayloadSchema.safeParse` (double trust boundary) then calls `renderer.setActionEconomy()` with literal-cast values and schedules a debounced re-render. Teardown unsubscribes via `this.unsubscribeEconomy()`.

`ActionOptionsModal` gains an optional `toastQueue` 8th constructor param. On `tap` + `!requiresTarget`, if `toastQueue !== null` and `getActionEconomyState(actorId)` returns a non-null state with `multiAttackInProgress=false`, the slot (action for spells, bonus for items) is checked. If `used >= 1`, an error toast is enqueued and the modal closes without emitting. Fail-open: null cache → action proceeds.

### Task 3 — boot-engine-core wiring

`attachActionEconomyHandler(ws, currentUserId)` called after `attachActionResultHandler` in boot step 11e+. `clearActionEconomyState()` called in teardown (reverse-attach order). Both `ActionOptionsModal` factory closures (spellbook + inventory) now receive `toastQueue` as 8th arg. BERW-13..16 verify: attach called once, teardown reverse-order, correct args, toastQueue available.

## TDD Gate Compliance

- Task 1: RED `5199a06` → GREEN `0a62a1e` ✓
- Task 2: RED `0c74840` → GREEN `5d11d4a` ✓
- Task 3: RED `0745b9e` → GREEN `6960e93` ✓

All RED commits verified to fail before GREEN implementation; all GREEN commits bring suite to 1938 passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod literal-union type narrowing — status-hud-layer.ts**
- **Found during:** Task 3 GREEN (pnpm typecheck)
- **Issue:** `ActionEconomyPayloadSchema` uses `z.number().min(0).max(1)` which infers `number` not `0 | 1`; `setActionEconomy()` requires `0 | 1` literal union — TS2322 at lines 299-301
- **Fix:** Cast `parsed.data.actionsUsed as 0 | 1` (and bonusActions, reactions). Schema runtime validation is the authoritative guard; cast only bridges the type inference gap.
- **Files modified:** `packages/g2-app/src/status-hud/status-hud-layer.ts`
- **Commit:** 6960e93

**2. [Rule 1 - Bug] MockToastQueue vi.fn generic type — action-options-modal.test.ts**
- **Found during:** Task 3 GREEN (pnpm typecheck)
- **Issue:** `MockToastQueue.enqueue: ReturnType<typeof vi.fn>` infers `() => unknown`, not assignable to `(toast: Toast) => void` — TS2345 at line 130
- **Fix:** Added explicit `Toast` import + typed `vi.fn<(toast: Toast) => void>()` in `makeToastQueue()` and `MockToastQueue` type definition
- **Files modified:** `packages/g2-app/src/panels/action-options-modal.test.ts`
- **Commit:** 6960e93

**3. [Rule 1 - Bug] SHL-7 unsubscribe count regression**
- **Found during:** Task 2 RED (test run after adding economy subscription)
- **Issue:** `status-hud-layer.test.ts:SHL-7` expected `unsubscribe.toHaveBeenCalledTimes(2)` but economy adds a 3rd channel subscription → assertion fail
- **Fix:** Updated expectation to `toHaveBeenCalledTimes(3)` with comment explaining the 3 channels
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`
- **Commit:** 0c74840

**4. [Rule 1 - Bug] IB-ALL-1 + IB-P5-COUNT assertion count 204 → 208**
- **Found during:** Task 1 RED (test run after adding 4 new i18n keys)
- **Issue:** `i18n-budgets.test.ts` budget total was hardcoded at 204; adding 4 keys to `i18n-budgets.ts` caused the assertion to fail
- **Fix:** Updated both assertions to 208 with descriptions mentioning "4 Phase 9 Plan 02 keys"
- **Files modified:** `packages/g2-app/src/status-hud/i18n-budgets.test.ts`
- **Commit:** 5199a06

## Known Stubs

None. All widget data flows from `setActionEconomy()` → `_buildEconomyChip()` → `_buildGrid()` → rendered HUD. i18n keys wired to `getLabel()`. Fixtures reflect real render output.

## Self-Check: PASSED

- Fixture files: all 4 FOUND
- Commits: 5199a06, 0a62a1e, 0c74840, 5d11d4a, 0745b9e, 6960e93 all present in git log
- 1938 tests pass; typecheck clean
