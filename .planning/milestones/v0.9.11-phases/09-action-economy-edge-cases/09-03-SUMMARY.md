---
phase: 09-action-economy-edge-cases
plan: "03"
subsystem: g2-app/panels + foundry-module/write-path
tags: [concentration, retry-cache, cast-spell, tdd, conc-conflict, boot-wiring]
dependency_graph:
  requires: ["09-02"]
  provides: ["COMB-02-partial", "concentration-detect", "retry-cache", "conc-modal-retry"]
  affects:
    - packages/foundry-module/src/write-path/handlers/cast-spell.ts
    - packages/foundry-module/src/write-path/concentration-detector.ts
    - packages/g2-app/src/panels/conc-retry-cache.ts
    - packages/g2-app/src/panels/concentration-drop-modal.ts
    - packages/g2-app/src/panels/conc-conflict-dispatcher.ts
    - packages/g2-app/src/panels/action-result-dispatcher.ts
    - packages/g2-app/src/panels/action-options-modal.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/shared-protocol/src/payloads/action-result.ts
tech_stack:
  added:
    - conc-retry-cache.ts (single-attempt buffer with 30s TTL, two-level index)
    - concentration-detector.ts (pure function, fail-open, dnd5e 5.3.3 API)
  patterns:
    - setConcConflictEmitter injection (mirrors setMultiAttackProgressEmitter)
    - Two-level cache index: primary by idempotencyKey + secondary latestConfirmedKey pointer
    - T-09-02 spoofing mitigation: unconfirmed entries cannot be consumed
    - T-09-03 race prevention: consumeLatestConfirmed deletes entry on consume
    - T-09-04 TTL: 30s lazy eviction + clearRetryCache() on boot teardown
key_files:
  created:
    - packages/foundry-module/src/write-path/concentration-detector.ts
    - packages/foundry-module/src/write-path/concentration-detector.test.ts
    - packages/g2-app/src/panels/conc-retry-cache.ts
    - packages/g2-app/src/panels/conc-retry-cache.test.ts
  modified:
    - packages/foundry-module/src/write-path/handlers/cast-spell.ts
    - packages/foundry-module/src/write-path/handlers/cast-spell.test.ts
    - packages/foundry-module/src/write-path/action-result-watcher.ts
    - packages/foundry-module/src/write-path/action-result-watcher.test.ts
    - packages/foundry-module/src/module.ts
    - packages/shared-protocol/src/payloads/action-result.ts
    - packages/g2-app/src/panels/action-result-dispatcher.ts
    - packages/g2-app/src/panels/action-result-dispatcher.test.ts
    - packages/g2-app/src/panels/action-options-modal.ts
    - packages/g2-app/src/panels/action-options-modal.test.ts
    - packages/g2-app/src/panels/concentration-drop-modal.ts
    - packages/g2-app/src/panels/concentration-drop-modal.test.ts
    - packages/g2-app/src/panels/conc-conflict-dispatcher.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts
decisions:
  - "Used Array.from(effect.statuses ?? []) to normalize dnd5e statuses field (can be Set or Array depending on data layer version)"
  - "setConcConflictEmitter injection pattern: avoids circular dependency between cast-spell handler and module.ts bridgeDeltaEmitter"
  - "Two-level cache index (primary by idempotencyKey + secondary latestConfirmedKey) because modal does not know original idempotencyKey"
  - "consumeLatestConfirmed() deletes on access (T-09-03 race prevention — single-attempt guarantee)"
  - "Fail-open concentration detection (T-09-01): throws → returns null → cast proceeds normally"
  - "toastQueue declaration moved before step 11d in boot-engine-core so conc-conflict dispatcher can receive it"
  - "Removed es/fr/pt-br fields from error.action.concentration-cancelled i18n entry (WidthBudgetRow only allows it/en/de/max)"
metrics:
  duration: "~16 minutes"
  completed: "2026-05-16"
  tasks_completed: 3
  files_changed: 18
---

# Phase 9 Plan 03: Concentration Drop Wiring + Cast-Spell Concentration Check + Retry Flow Summary

**One-liner:** End-to-end concentration-drop flow with dnd5e 5.3.3 status-effect detection, single-attempt retry cache, and [Y]/[N] modal outcomes.

## What Was Built

Plan 09-03 closes the concentration conflict UX loop: when a player attempts to cast a concentration spell while already concentrating, the cast-spell handler detects the conflict, the dispatcher mounts the modal (Phase 4b), and the player resolves it with [Y] (drop + retry) or [N] (cancel + toast).

### Task 1: concentration-detector + cast-spell handler extension (RED→GREEN)

**`concentration-detector.ts`** — Pure function `detectActiveConcentration(actor, spellItem)`:
- Checks `spellItem.system.components.concentration` first (bail-out if not a conc spell)
- Iterates `actor.effects.contents`, normalizes `effect.statuses` via `Array.from()` (handles both `Set<string>` and `string[]`)
- Fallback chain: `effect.flags.dnd5e.item.name → effect.name → '<unknown>'`
- T-09-01 fail-open: any exception → `console.warn` + `return null` → cast proceeds
- Tests CD-01..06 (9 tests)

**`cast-spell.ts` extension:**
- `setConcConflictEmitter` injection pattern (mirrors `setMultiAttackProgressEmitter`)
- Step 3.5 between activity-resolve and `activity.use()`: calls `detectActiveConcentration`; on conflict → emits `conc.conflict` envelope via injected emitter + returns `{ success: false, error: 'concentration-required' }`
- Tests CS-CONC-01..04

**`ActionErrorKind` enum:** added `'concentration-required'` between `'wrong-turn'` and `'gm-rejected'`

**`action-result-watcher.ts`:** added `mapErrorToKind` branch for `'concentration-required'` before the `'gm-rejected'` catch-all. Test ARW-CONC-01.

**`module.ts`:** wires `setConcConflictEmitter` with `bridgeDeltaEmitter` in `Hooks.once('ready')`.

### Task 2: conc-retry-cache + ActionOptionsModal caching + dispatcher routing (RED→GREEN)

**`conc-retry-cache.ts`** — Single-attempt buffer:
- Primary index: `Map<idempotencyKey, CacheEntry>` (for `markRetryConfirmed`)
- Secondary index: `latestConfirmedKey: string | null` (for `consumeLatestConfirmed` — modal doesn't know the key)
- States: `unconfirmed → confirmed → consumed` (T-09-02 spoofing: unconfirmed entries cannot be consumed)
- T-09-03: `consumeLatestConfirmed()` deletes entry on access (race prevention)
- T-09-04: 30s TTL with lazy `evictExpired()` on every consume + `clearRetryCache()` on boot teardown
- Tests CRC-01..06 + edge cases (8 tests, including `vi.useFakeTimers()` for TTL)

**`action-options-modal.ts`:** extracts `idempotencyKey` before envelope construction, calls `cacheRetryEnvelope(idempotencyKey, envelope, 'unconfirmed')` BEFORE `ws.send`. Tests AOM-RETRY-01..02.

**`action-result-dispatcher.ts`:** when `payload.errorKind === 'concentration-required'` → calls `markRetryConfirmed(payload.idempotencyKey)` + silent return (no toast — modal is the UX surface). Tests ARD-CONC-01..02.

**`i18n-budgets.ts`:** added `'error.action.concentration-cancelled'` key (IT/EN/DE, max 38 chars). Count: 208 → 209.

### Task 3: ConcentrationDropModalPanel retry flow + boot wiring (RED→GREEN)

**`concentration-drop-modal.ts`:**
- Optional `toastQueue?: { enqueue: (toast: Toast) => void } | null` constructor parameter
- [Y] tap: after dual-emit, calls `consumeLatestConfirmed()` + conditional `ws.send(JSON.stringify(retry))` (T-09-03 ordering: dual-emit first, retry last)
- [N] double-tap: enqueues `error.action.concentration-cancelled` error toast before `onCloseCb()`
- Tests CDM-RETRY-01..03, CDM-CANCEL-01..03 + no-op case (15 tests, all green)

**`conc-conflict-dispatcher.ts`:** accepts optional `toastQueue` as 6th parameter, forwards to modal constructor.

**`boot-engine-core.ts`:**
- Moved `toastQueue = new ToastQueueLayer(...)` declaration from step 11e to before step 11d so the conc-conflict dispatcher can receive it
- Passes `toastQueue` as 6th arg to `attachConcConflictHandler`
- Adds `clearRetryCache()` in teardown after `clearActionEconomyState()` (T-09-04)
- Import: `import { clearRetryCache } from '../panels/conc-retry-cache.js'`

**`boot-engine-r1-wiring.test.ts`:**
- BERW-17: verifies `attachConcConflictHandler` receives `toastQueue` as 6th arg (same instance as step 11e)
- BERW-18: verifies teardown does not throw (structural; `clearRetryCache` co-located with `clearActionEconomyState`)
- Total BERW tests: 18

## Test Results

- **Workspace total:** 1973 tests / 122 test files — all passing
- **Typecheck:** clean (`pnpm typecheck` exits 0)
- **Type fixes applied:** `concentration-detector.test.ts` CD-05b `undefined as unknown as string`; `action-options-modal.test.ts` AOM-RETRY-01 ws mock cast to `MockWs`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 RED+GREEN | `61270a9` | concentration-detector + cast-spell handler extension + ActionErrorKind enum |
| Task 2 RED+GREEN | `62b2534` | conc-retry-cache + ActionOptionsModal envelope caching + dispatcher routing |
| Task 3 RED+GREEN | `6eca40b` | ConcentrationDropModalPanel retry flow + boot wiring |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing field] WidthBudgetRow incompatibility with i18n entry**
- **Found during:** Task 2 — adding `error.action.concentration-cancelled` to `i18n-budgets.ts`
- **Issue:** Plan specified `es`, `fr`, `pt-br` fields, but `WidthBudgetRow` interface only allows `it`, `en`, `de`, `max`. TypeScript strict mode rejected the extra fields.
- **Fix:** Removed `es`, `fr`, `pt-br` from the entry. Best-effort locales fall back to EN at render time via `getLabel()` (I18N-05).
- **Files modified:** `packages/g2-app/src/status-hud/i18n-budgets.ts`

**2. [Rule 1 - Type fix] concentration-detector.test.ts CD-05b name: undefined**
- **Found during:** Task 3 typecheck pass
- **Issue:** `name: undefined` in test mock caused `TS2322: Type 'undefined' is not assignable to type 'string'`
- **Fix:** Added `as unknown as string` cast with comment explaining deliberate undefined test
- **Files modified:** `packages/foundry-module/src/write-path/concentration-detector.test.ts`

**3. [Rule 1 - Type fix] action-options-modal.test.ts AOM-RETRY-01 ws mock type mismatch**
- **Found during:** Task 3 typecheck pass
- **Issue:** Inline `{ send: vi.fn() }` cast as `ActionOptionsWebSocket & { send: ReturnType<typeof vi.fn> }` didn't satisfy `MockWs` (which requires `vi.fn<(data: string) => void>`)
- **Fix:** Replaced with explicit `vi.fn((_data: string) => { ... }) as unknown as ReturnType<...>` cast typed as `MockWs`
- **Files modified:** `packages/g2-app/src/panels/action-options-modal.test.ts`

**4. [Rule 2 - Boot wiring] toastQueue declaration moved before step 11d**
- **Found during:** Task 3 — needed to pass `toastQueue` to `attachConcConflictHandler`, but it was declared after in step 11e
- **Fix:** Moved `toastQueue = new ToastQueueLayer({ bridge })` declaration to just before step 11d. Both steps now reference the same instance. Updated comment explaining the move.
- **Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts`

## Known Stubs

None. All connection points are wired:
- `setConcConflictEmitter` injected from `module.ts` with real `bridgeDeltaEmitter`
- `consumeLatestConfirmed()` in modal [Y] path is the live cache, not a stub
- `clearRetryCache()` in boot teardown is the live function

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. All new surfaces are:
- `conc-retry-cache.ts`: module-scoped in-memory `Map` — no external I/O
- `concentration-detector.ts`: pure function, read-only access to Foundry actor data

No threat flags added.

## Self-Check: PASSED

- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/foundry-module/src/write-path/concentration-detector.ts` — EXISTS
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/g2-app/src/panels/conc-retry-cache.ts` — EXISTS
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/packages/g2-app/src/panels/concentration-drop-modal.ts` — EXISTS (toastQueue + retry logic)
- Commit `61270a9` — EXISTS (Task 1)
- Commit `62b2534` — EXISTS (Task 2)
- Commit `6eca40b` — EXISTS (Task 3)
- `pnpm test` → 1973/1973 passed
- `pnpm typecheck` → clean
