---
phase: "08"
plan: "01"
subsystem: "action-result-pipeline"
tags: [tdd, schema, watcher, dispatcher, toast, security]
dependency_graph:
  requires:
    - "07-06 (bearer-rotation — bridgeDeltaEmitter available)"
    - "04b-05 (ToastQueueLayer — toast enqueue API)"
    - "shared-protocol/payloads (existing barrel)"
  provides:
    - "ActionResultPayloadSchema + R1_ACTION_RESULT_TYPE (barrel-exported)"
    - "action-result-watcher (foundry-module createChatMessage subscriber)"
    - "action-result-dispatcher (g2-app WS consumer, double trust boundary)"
    - "5 error.action.* i18n keys (i18n-budgets.ts)"
  affects:
    - "packages/shared-protocol/src/index.ts"
    - "packages/foundry-module/src/module.ts"
    - "packages/g2-app/src/status-hud/i18n-budgets.ts"
tech_stack:
  added: []
  patterns:
    - "double-trust-boundary (EnvelopeSchema outer + ActionResultPayloadSchema inner)"
    - "createChatMessage hook subscriber (flags.evf.audit duck-type narrowing)"
    - "T-08-02 silent recipient filter (no console.warn on drop)"
key_files:
  created:
    - "packages/shared-protocol/src/payloads/action-result.ts"
    - "packages/shared-protocol/src/payloads/action-result.test.ts"
    - "packages/foundry-module/src/write-path/action-result-watcher.ts"
    - "packages/foundry-module/src/write-path/action-result-watcher.test.ts"
    - "packages/g2-app/src/panels/action-result-dispatcher.ts"
    - "packages/g2-app/src/panels/action-result-dispatcher.test.ts"
  modified:
    - "packages/shared-protocol/src/index.ts"
    - "packages/g2-app/src/status-hud/i18n-budgets.ts"
    - "packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts"
    - "packages/foundry-module/src/module.ts"
    - "packages/foundry-module/src/module.test.ts"
decisions:
  - "recipientUserId REQUIRED (not optional) — absence treated as schema version skew, not broadcast-to-all (T-08-02)"
  - "Silent drop on recipient mismatch — no console.warn prevents cross-player activity signaling to attacker"
  - "z.strictObject on ActionResultPayloadSchema — rejects extra fields for T-08-01 field-smuggling defense"
  - "createChatMessage hook fires AFTER ChatMessage document creation (final chat card state including MidiQOL damage)"
  - "Local string literal union types in action-result-watcher.ts (not Zod enum imports) to avoid barrel dependency cycle"
  - "14-socketlib-handler invariant preserved — no new handlers in Plan 08-01"
metrics:
  duration: "~90 minutes (across 2 sessions)"
  completed: "2026-05-16T15:29:04Z"
  tasks_completed: 3
  files_changed: 11
---

# Phase 08 Plan 01: Manual Action UX — Wave 0 Foundation Summary

**One-liner:** ActionResultPayload schema + createChatMessage watcher + WS dispatcher with T-08-02 silent recipient filter for typed D&D action result toasts on G2 AR glasses.

## What Was Built

Wave 0 foundation landing four concerns atomically:

**Task 1 — Schema + i18n (RED → GREEN):**
- `ActionResultPayloadSchema` (`z.strictObject`, 8 fields, T-08-01 strict)
- `ActionOutcome` enum (6 values: hit/miss/save_success/save_fail/damage_dealt/no_roll)
- `ActionErrorKind` enum (5 values mapping to error.action.* i18n keys)
- `R1_ACTION_RESULT_TYPE = 'r1.action.result'`
- Barrel export block in `shared-protocol/src/index.ts`
- 5 `error.action.*` keys added to `i18n-budgets.ts` (max=28 budget each, IT/EN/DE)
- 12 ART-* tests

**Task 2 — Foundry-module watcher (RED → GREEN):**
- `registerActionResultWatcher(emit)` subscribing `Hooks.on('createChatMessage', ...)`
- Duck-type narrowing on `msg.flags?.evf?.audit` before trusting audit shape
- `extractD20`, `extractDamage`, `mapErrorToKind`, `inferOutcome`, `resolveRecipientUserId` helpers
- NEVER returns false (void TypeScript return type — must not cancel chat message creation)
- Wired in `module.ts` `Hooks.once('ready')` after `scheduleBearerRotation`
- 10 ARW-* tests + 2 module.ts assertion tests (T-08-MOD-01, T-08-MOD-02)

**Task 3 — G2-app dispatcher (RED → GREEN):**
- `attachActionResultHandler(ws, toastQueue, locale, currentUserId)` with double trust boundary
- T-08-02: silent drop on `recipientUserId !== currentUserId` (no console.warn)
- `formatActionMessage(payload, locale)` → IT/EN/DE toast strings (≤38 chars)
- `formatSeverity(status)` → 'error' for status='error', 'info' otherwise
- Deterministic toast id: `"action-result-<idempotencyKey>"`
- 13 ARD-* tests (including ARD-06 verifying silent T-08-02 drop)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | c24afca | feat(08-01): ActionResultPayloadSchema + 5 error i18n keys (ACT-01 Wave 0 Task 1) |
| 2    | f6e73b5 | feat(08-01): action-result-watcher (createChatMessage hook) + module.ts wiring (ACT-01 Task 2) |
| 3    | 8be724c | feat(08-01): action-result-dispatcher + ARD-01..13 tests (ACT-01 Green) |

## Verification

- All 1680 tests pass (109 test files) — up from 1649 before Plan 08-01
- `pnpm typecheck` — clean
- `pnpm exec biome ci` — clean on all new/modified files
- CI Gate 8: zero `activity.use(` references in g2-app/bridge
- 14-socketlib-handler invariant: `registerComplexHandler` called exactly 14 times (T-08-MOD-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ART-12 barrel import path in test file**
- **Found during:** Task 1 GREEN verification
- **Issue:** Test imported `'../../index.js'` from `src/payloads/` directory; correct path is `'../index.js'`
- **Fix:** Corrected relative import path in action-result.test.ts
- **Files modified:** `packages/shared-protocol/src/payloads/action-result.test.ts`
- **Commit:** c24afca

**2. [Rule 1 - Bug] Fixed i18n-budgets.test.ts key count assertions**
- **Found during:** Task 1 GREEN verification
- **Issue:** Tests IB-ALL-1 and IB-P5-COUNT asserted `toBe(180)` but adding 5 Phase 8 keys makes it 185
- **Fix:** Updated both assertions to `toBe(185)`
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
- **Commit:** c24afca

**3. [Rule 1 - Bug] Fixed Biome noUselessSwitchCase in action-result-watcher.ts**
- **Found during:** Task 2 biome check
- **Issue:** `inferOutcome` used a switch statement with redundant fallthrough cases
- **Fix:** Converted to if-else logic
- **Files modified:** `packages/foundry-module/src/write-path/action-result-watcher.ts`
- **Commit:** f6e73b5

**4. [Rule 1 - Bug] Fixed Biome noUselessUndefinedInitialization in action-result-watcher.ts**
- **Found during:** Task 2 biome check
- **Issue:** `let errorKind: ActionErrorKindValue | undefined = undefined` — biome rejects explicit `= undefined` initialization
- **Fix:** Removed `= undefined` initializer
- **Files modified:** `packages/foundry-module/src/write-path/action-result-watcher.ts`
- **Commit:** f6e73b5

**5. [Rule 1 - Bug] Local type aliases instead of Zod enum barrel imports in watcher**
- **Found during:** Task 2 TypeScript check
- **Issue:** Attempted `typeof ActionErrorKind._type` (wrong Zod 4 API); barrel export of `ActionErrorKindValue`/`ActionOutcomeValue` type aliases required adding them to shared-protocol index which created barrel coupling
- **Fix:** Defined local string literal union types `ActionOutcomeValue`/`ActionErrorKindValue` in `action-result-watcher.ts` directly
- **Files modified:** `packages/foundry-module/src/write-path/action-result-watcher.ts`
- **Commit:** f6e73b5

**6. [Rule 1 - Bug] T-08-MOD-01 createChatMessage count assertion corrected**
- **Found during:** Task 2 test execution
- **Issue:** Test expected 1 `createChatMessage` registration but `hook-subscribers.ts` (Phase 5) also registers one → actual count ≥ 2
- **Fix:** Updated assertion to `toBeGreaterThanOrEqual(2)`
- **Files modified:** `packages/foundry-module/src/module.test.ts`
- **Commit:** f6e73b5

**7. [Rule 1 - Bug] TypeScript TS18048 on OUTCOME_LABELS index access in dispatcher**
- **Found during:** Task 3 typecheck
- **Issue:** `Record<string, ...>` index access returns `T | undefined` in strict mode; `?? OUTCOME_LABELS.no_roll` still had undefined path
- **Fix:** Introduced typed `OutcomeLabelRow` interface, `OUTCOME_FALLBACK` constant, explicit type annotation on lookup result
- **Files modified:** `packages/g2-app/src/panels/action-result-dispatcher.ts`
- **Commit:** 8be724c

**8. [Rule 1 - Bug] TypeScript TS2345 on vi.fn mock type in dispatcher test**
- **Found during:** Task 3 typecheck
- **Issue:** `{ enqueue: vi.fn<(toast: Toast) => void>() }` creates `Mock<Procedure | Constructable>` which doesn't satisfy `ActionResultToastQueue` interface
- **Fix:** Used `as unknown as ActionResultToastQueue & { enqueue: ReturnType<typeof vi.fn> }` cast pattern (same as reaction-toast-dispatcher.test.ts)
- **Files modified:** `packages/g2-app/src/panels/action-result-dispatcher.test.ts`
- **Commit:** 8be724c

**9. [Rule 1 - Bug] Biome organizeImports on both new dispatcher files**
- **Found during:** Task 3 biome ci check
- **Issue:** Import order not sorted per biome organizeImports rule
- **Fix:** `biome check --write` auto-fixed both files
- **Files modified:** `packages/g2-app/src/panels/action-result-dispatcher.ts`, `packages/g2-app/src/panels/action-result-dispatcher.test.ts`
- **Commit:** 8be724c

## Known Stubs

None — all three components are fully wired: schema exports in barrel, watcher registered in `module.ts`, dispatcher ready to be called from `g2-app` session initialization (Phase 08-02+ will wire the `currentUserId` from bearer registration).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's `<threat_model>` covers (T-08-01, T-08-02, T-08-02-02). The `action-result-dispatcher` correctly enforces both mitigations.

## Self-Check: PASSED

All committed files exist and all 3 task commits are present in git log.
