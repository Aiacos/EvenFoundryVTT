---
phase: 09-action-economy-edge-cases
plan: "01"
subsystem: telemetry
tags: [action-economy, combat, foundry-hooks, zod, websocket, tdd]

# Dependency graph
requires:
  - phase: 07-foundry-module-write-path
    provides: "audit-log.ts (flags.evf.audit) + weapon-attack attackId + dispatchTool"
  - phase: 08-manual-action-ux
    provides: "combat-movement-tracker.ts (hook pattern) + action-result-dispatcher.ts (dispatcher pattern)"
provides:
  - "ActionEconomyPayloadSchema + R1_ACTION_ECONOMY_TYPE in @evf/shared-protocol"
  - "combat-action-tracker.ts: createChatMessage + updateCombat hook subscribers in foundry-module"
  - "audit-log.ts attackId extension (T-09-04 repudiation fix)"
  - "action-economy-state.ts: synchronous per-actor cache in g2-app"
  - "action-economy-dispatcher.ts: double trust boundary WS dispatcher in g2-app"
affects:
  - 09-02 (action-economy-widget + preconditioner consumes getActionEconomyState + R1_ACTION_ECONOMY_TYPE)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN/REFACTOR per task (3 tasks, each with test commit + impl commit)"
    - "Hook subscriber: createChatMessage + updateCombat pair (no socketlib handler)"
    - "(actorId, attackId) composite key dedup for multi-attack chat-cards"
    - "T-08-02 SILENT drop pattern for cross-player recipient mismatch (no warn)"
    - "Module-scoped Map cache with getter/setter/clear API"

key-files:
  created:
    - packages/shared-protocol/src/payloads/action-economy.ts
    - packages/shared-protocol/src/payloads/action-economy.test.ts
    - packages/foundry-module/src/write-path/combat-action-tracker.ts
    - packages/foundry-module/src/write-path/combat-action-tracker.test.ts
    - packages/g2-app/src/panels/action-economy-state.ts
    - packages/g2-app/src/panels/action-economy-state.test.ts
    - packages/g2-app/src/panels/action-economy-dispatcher.ts
    - packages/g2-app/src/panels/action-economy-dispatcher.test.ts
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/write-path/audit-log.ts
    - packages/foundry-module/src/write-path/tool-registry.ts
    - packages/foundry-module/src/module.ts
    - packages/foundry-module/src/module.test.ts

key-decisions:
  - "use-item → Bonus Action slot (Phase 9 heuristic: all use-item calls treated as bonus-action per 09-CONTEXT Area 1)"
  - "attackId dedup by (actorId, attackId) composite key to scope multi-attack dedup per player (T-09-02)"
  - "round advance fires same reset as turn advance (CAT-07: round == new top of initiative = turn change)"
  - "recipientUserId resolution priority: audit.recipientUserId → msg.user → '<unknown>' sentinel (CAT-10)"
  - "audit-log attackId extension in dispatchTool (tool-registry.ts) not in weapon-attack handler (keeps handler unchanged)"
  - "14-socketlib-handler invariant preserved: registerCombatActionTracker is a Hooks subscriber, NOT a socketlib handler"

patterns-established:
  - "Hook subscriber pair: registerXxxTracker(emit) → Hooks.on('createChatMessage') + Hooks.on('updateCombat') returns unsubscribe closure"
  - "Biome organizeImports enforced by pnpm format after each task"

requirements-completed:
  - COMB-02

# Metrics
duration: 12min
completed: 2026-05-16
---

# Phase 9 Plan 01: ActionEconomyPayloadSchema + combat-action-tracker + action-economy-state + dispatcher Summary

**COMB-02 telemetry spine: strict action-economy schema, Foundry hook subscriber deriving per-turn Action/Bonus/Reaction counters from audit flags with (actorId,attackId) multi-attack dedup, and g2-app WS dispatcher maintaining a synchronous per-actor cache**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-16T21:38:38Z
- **Completed:** 2026-05-16T21:50:34Z
- **Tasks:** 3
- **Files modified:** 12 (4 created impl + 4 created test + 4 modified existing)

## Accomplishments

- `ActionEconomyPayloadSchema` (z.strictObject, 6 fields, all bounds enforced) + `R1_ACTION_ECONOMY_TYPE` exported from `@evf/shared-protocol`
- `combat-action-tracker.ts` in `@evf/foundry-module`: Hooks.on('createChatMessage') maps cast-spell/weapon-attack → Action slot, use-item → Bonus slot; Hooks.on('updateCombat') resets on turn/round advance; attackId dedup by (actorId, attackId) composite (T-09-02)
- `audit-log.ts` extended with optional `attackId` field; `tool-registry.ts` propagates `result.data.attackId` to AuditEntry when present (T-09-04 repudiation fix)
- `action-economy-state.ts` in `@evf/g2-app`: module-scoped Map with get/set/clear API; `action-economy-dispatcher.ts` applies double trust boundary + T-08-02 SILENT drop pattern
- 14-socketlib-handler invariant preserved (module.test.ts `registerComplexHandler` count still asserts 14)
- 34 new tests (AES-01..09 + AL-EXT-01..02 + CAT-01..10 + MOD-CAT-01 + T-09-02 + AES-CACHE-01..03 + AED-01..09 + extras) all green

## Task Commits

Each task was committed atomically per TDD RED/GREEN pattern:

1. **Task 1 RED (schema):** `(pre-existing)` — `action-economy.test.ts` already committed before executor started
2. **Task 1 GREEN (schema + audit extension):** `4e5fd9f` (feat: ActionEconomyPayloadSchema + audit-log attackId extension)
3. **Task 2 RED (combat-action-tracker tests):** `2f8060a` (test: add failing tests for combat-action-tracker)
4. **Task 2 GREEN (combat-action-tracker + module.ts):** `03c5d5f` (feat: combat-action-tracker hook subscriber + module.ts wiring)
5. **Task 3 RED (g2-app tests):** `2db925c` (test: add failing tests for action-economy-state + action-economy-dispatcher)
6. **Task 3 GREEN (g2-app impl):** `28ffa4d` (feat: action-economy-state cache + action-economy-dispatcher)

## Files Created/Modified

- `packages/shared-protocol/src/payloads/action-economy.ts` — ActionEconomyPayloadSchema + R1_ACTION_ECONOMY_TYPE
- `packages/shared-protocol/src/payloads/action-economy.test.ts` — AES-01..09 schema validation tests
- `packages/shared-protocol/src/index.ts` — Phase 9 re-exports added
- `packages/foundry-module/src/write-path/audit-log.ts` — AuditEntry.attackId optional field added
- `packages/foundry-module/src/write-path/tool-registry.ts` — dispatchTool propagates result.data.attackId to entry
- `packages/foundry-module/src/write-path/combat-action-tracker.ts` — hook subscriber (createChatMessage + updateCombat)
- `packages/foundry-module/src/write-path/combat-action-tracker.test.ts` — CAT-01..10 + T-09-02
- `packages/foundry-module/src/module.ts` — registerCombatActionTracker wired after registerMovementTracker
- `packages/foundry-module/src/module.test.ts` — MOD-CAT-01 test added
- `packages/g2-app/src/panels/action-economy-state.ts` — per-actor cache (getActionEconomyState / setActionEconomyState / clearActionEconomyState)
- `packages/g2-app/src/panels/action-economy-state.test.ts` — AES-CACHE-01..03
- `packages/g2-app/src/panels/action-economy-dispatcher.ts` — double trust boundary WS dispatcher
- `packages/g2-app/src/panels/action-economy-dispatcher.test.ts` — AED-01..09

## Decisions Made

- **use-item → Bonus Action heuristic:** All `use-item` tool calls treated as Bonus Action per Phase 9 CONTEXT Area 1 decision. Action slot reserved for cast-spell + weapon-attack.
- **attackId dedup composite key:** `(actorId, attackId)` scopes multi-attack dedup per actor — two players sharing an attackId (impossible with UUID v4 but structurally enforced) count independently.
- **round advance = turn advance:** `updateCombat` reset fires on `change.round !== undefined || change.turn !== undefined`. Round advance means new combatant at top of initiative = their turn starts.
- **audit-log attackId in dispatchTool, not weapon-attack handler:** Avoids changing weapon-attack.ts; dispatchTool is the authoritative boundary for all audit writes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed action-economy.test.ts spread type error**
- **Found during:** Task 1 (ActionEconomyPayloadSchema GREEN phase)
- **Issue:** `const VALID: Parameters<typeof ActionEconomyPayloadSchema.safeParse>[0]` produces a non-spreadable type with `z.strictObject` under TypeScript `exactOptionalPropertyTypes`
- **Fix:** Changed to `const VALID: ActionEconomyPayload` (use the inferred type directly)
- **Files modified:** `packages/shared-protocol/src/payloads/action-economy.test.ts`
- **Verification:** `pnpm typecheck` exit 0
- **Committed in:** `4e5fd9f` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed combat-action-tracker.test.ts `{ audit: undefined }` exact optional property error**
- **Found during:** Task 2 (combat-action-tracker GREEN phase — typecheck)
- **Issue:** `makeChatMsg({ audit: undefined })` violates `exactOptionalPropertyTypes` (undefined not assignable to optional MockAuditFlags)
- **Fix:** Changed to `makeChatMsg()` (omit the property entirely)
- **Files modified:** `packages/foundry-module/src/write-path/combat-action-tracker.test.ts`
- **Verification:** `pnpm typecheck` exit 0
- **Committed in:** `03c5d5f` (Task 2 commit, via `pnpm format`)

**3. [Rule 3 - Blocking] Auto-fixed Biome import ordering with `pnpm format`**
- **Found during:** Task 2 + Task 3 (lint:ci check)
- **Issue:** New import statements placed after block comments violated Biome `organizeImports`
- **Fix:** Ran `pnpm format` to auto-fix import ordering in module.ts and test files
- **Files modified:** `packages/foundry-module/src/module.ts`, `packages/foundry-module/src/module.test.ts`, `packages/g2-app/src/panels/action-economy-state.test.ts`, `packages/foundry-module/src/write-path/combat-action-tracker.test.ts`
- **Verification:** `pnpm lint:ci` exit 0
- **Committed in:** `03c5d5f` and `28ffa4d`

---

**Total deviations:** 3 auto-fixed (2 Rule 1 type bugs, 1 Rule 3 lint ordering)
**Impact on plan:** All fixes necessary for correctness and CI compliance. No scope changes.

## 14-socketlib-handler Invariant Confirmation

- `registerCombatActionTracker` uses `Hooks.on('createChatMessage')` + `Hooks.on('updateCombat')` — ZERO new socketlib handlers
- `module.test.ts` `registerComplexHandler` assertion: `toHaveBeenCalledTimes(14)` — still passing after Plan 09-01
- `MOD-CAT-01` test added to `module.test.ts` verifying: `createChatMessage` registration count ≥ 3 (hook-subscribers + action-result-watcher + combat-action-tracker) AND `registerComplexHandler` count = 14

## Known Stubs

None — all data flows are wired. The cache starts empty (null returns) until the first `r1.action.economy` envelope arrives from the bridge, which is correct behavior for session start.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced. The dispatcher and state are in-process only. The `r1.action.economy` envelope type is a new WS delta type — it flows through the existing bridge `bridgeDeltaEmitter` → `/internal/delta` POST path that is already guarded by bearer auth. No new trust surface.

## Next Phase Readiness

Plan 09-02 can immediately use:
- `getActionEconomyState(actorId)` from `@evf/g2-app/panels/action-economy-state` for ActionOptionsModal preconditioner
- `R1_ACTION_ECONOMY_TYPE` from `@evf/shared-protocol` for the new action economy widget in StatusHudRenderer footer
- `attachActionEconomyHandler(ws, currentUserId)` for boot-engine-core WS wiring

## Self-Check: PASSED

- `packages/shared-protocol/src/payloads/action-economy.ts` — FOUND
- `packages/foundry-module/src/write-path/combat-action-tracker.ts` — FOUND
- `packages/g2-app/src/panels/action-economy-dispatcher.ts` — FOUND
- `packages/g2-app/src/panels/action-economy-state.ts` — FOUND
- Commits `4e5fd9f`, `2f8060a`, `03c5d5f`, `2db925c`, `28ffa4d` — all verified in git log
- 1910 tests pass (was 1860 at baseline + 50 new)
- `pnpm typecheck` exit 0
- `pnpm lint:ci` exit 0

---
*Phase: 09-action-economy-edge-cases*
*Completed: 2026-05-16*
