---
phase: "07-foundry-module-write-path"
plan: "02"
subsystem: "foundry-module/write-path/handlers + foundry-module/pair/socketlib-handlers"
tags: ["write-path", "handlers", "activity-use", "token-update", "socketlib", "tdd"]
dependency_graph:
  requires:
    - "ToolId/ToolHandler/ToolResult/dispatchTool (07-01)"
    - "IdempotencyStore + writeAuditLog (07-01)"
    - "CastSpellInputSchema, WeaponAttackInputSchema, UseItemInputSchema, MoveTokenInputSchema (@evf/shared-protocol Phase 3)"
  provides:
    - "castSpellHandler ToolHandler<CastSpellInput> — activity.use({ configure: false }) for spell activities"
    - "weaponAttackHandler ToolHandler<WeaponAttackInput> — attack-type activity via contents.find(a => a.type === 'attack')"
    - "useItemHandler ToolHandler<UseItemInput> — first activity.use() on consumable/item"
    - "moveTokenHandler ToolHandler<MoveTokenInput> — tokenDoc.update({ x, y }) direct document write"
    - "handlers/index.ts — barrel registering all 4 into TOOL_REGISTRY at module load"
    - "FoundryActivity interface (type, use(config)) + FoundryItem.system.activities? + FoundryTokenDoc"
    - "FoundryScene.tokens widened to FoundryCollection<FoundryTokenDoc>"
    - "4 socketlib stubs replaced in-place (count stays 14) — dispatchTool adapter pattern"
    - "validateToolPayload input shape guard (T-07-02-01)"
    - "makeDispatchAdapter factory for thin socketlib→dispatchTool bridge"
  affects:
    - "packages/foundry-module/src/write-path/handlers/ (new directory + 5 files)"
    - "packages/foundry-module/src/types/foundry-globals.d.ts (FoundryActivity, FoundryTokenDoc, activities? field)"
    - "packages/foundry-module/src/pair/socketlib-handlers.ts (4 stubs replaced in-place)"
    - "packages/foundry-module/src/pair/socketlib-handlers.test.ts (extended)"
    - "packages/foundry-module/src/pair/socketlib-handlers-dispatch.test.ts (new)"
    - "packages/foundry-module/src/module.ts (side-effect import added)"
tech_stack:
  added: []
  patterns:
    - "ToolHandler<T> defensive lookup: actor → item → activity → use() → error normalisation"
    - "isNoGmError(): string-contains check for Pitfall 5 ('No connected GM')"
    - "extractChatCardId(): defensive result.id reader for activity.use() return value"
    - "makeDispatchAdapter(toolId): factory producing socketlib adapter functions"
    - "validateToolPayload(): input shape guard before dispatchTool — T-07-02-01 mitigation"
    - "Side-effect barrel import at module.ts load ensures TOOL_REGISTRY populated before hooks fire"
    - "Separate dispatch test file (socketlib-handlers-dispatch.test.ts) for top-level vi.mock compliance"
key_files:
  created:
    - "packages/foundry-module/src/write-path/handlers/cast-spell.ts"
    - "packages/foundry-module/src/write-path/handlers/cast-spell.test.ts"
    - "packages/foundry-module/src/write-path/handlers/weapon-attack.ts"
    - "packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts"
    - "packages/foundry-module/src/write-path/handlers/use-item.ts"
    - "packages/foundry-module/src/write-path/handlers/use-item.test.ts"
    - "packages/foundry-module/src/write-path/handlers/move-token.ts"
    - "packages/foundry-module/src/write-path/handlers/move-token.test.ts"
    - "packages/foundry-module/src/write-path/handlers/index.ts"
    - "packages/foundry-module/src/pair/socketlib-handlers-dispatch.test.ts"
  modified:
    - "packages/foundry-module/src/types/foundry-globals.d.ts (FoundryActivity + FoundryTokenDoc + system.activities? + widened FoundryScene.tokens)"
    - "packages/foundry-module/src/pair/socketlib-handlers.ts (4 stubs → dispatchTool adapters + validateToolPayload + makeDispatchAdapter)"
    - "packages/foundry-module/src/pair/socketlib-handlers.test.ts (extended with 17 new tests)"
    - "packages/foundry-module/src/module.ts (side-effect import of handlers/index.js)"
decisions:
  - "makeDispatchAdapter factory extracts the adapter pattern shared by 4 handlers (DRY, testable)"
  - "validateToolPayload checks args presence (not type) + idempotencyKey + bearer string types — matches T-07-02-01 without over-validating"
  - "Separate socketlib-handlers-dispatch.test.ts for top-level vi.mock — Vitest enforces vi.mock hoisting; mixed files cause warnings-will-become-errors"
  - "FoundryScene.tokens widened to FoundryCollection<FoundryTokenDoc> — .contents access preserved via Collection interface"
  - "moveTokenHandler does NOT check scene canvas dimensions — Foundry itself validates coordinates on update(); handler relies on Foundry enforcement (T-07-02-02)"
  - "weapon-attack uses .find(a => a.type === 'attack') not [0] — items may have multiple activity types (RESEARCH Pattern 2)"
  - "castSpellHandler uses spell_id (item ID) not spell_name — Foundry document IDs are canonical"
metrics:
  duration: "10 minutes"
  completed_date: "2026-05-16"
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 4
  tests_added: 49
  tests_baseline: 211
  tests_final: 260
---

# Phase 7 Plan 02: Wave 1 Handler Implementations Summary

**One-liner:** 4 ToolHandler implementations (cast-spell via activity.use, weapon-attack via attack-type activity, use-item via first activity, move-token via tokenDoc.update) with dispatchTool adapter pattern replacing 4 of 7 Phase 3 socketlib stubs in-place, handler count locked at 14.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 4 handler implementations + foundry-globals + barrel registration | `82133e0` | handlers/cast-spell.ts, weapon-attack.ts, use-item.ts, move-token.ts, index.ts, foundry-globals.d.ts |
| 2 | Replace 4 socketlib stubs in-place + wire module.ts boot import + count regression guard | `b3db518` | socketlib-handlers.ts, socketlib-handlers.test.ts, socketlib-handlers-dispatch.test.ts, module.ts |

## Deliverables

### 4 ToolHandler Implementations

**`cast-spell.ts`** — `ToolHandler<CastSpellInput>`:
- Resolves actor via `game.actors.get(args.actor_id)`
- Resolves spell item via `actor.items.contents.find(i => i.id === args.spell_id)`
- Resolves activity via `item.system.activities?.contents[0]`
- Calls `activity.use({ configure: false })`
- Error codes: `actor_not_found`, `item_not_found`, `no_activity`, `no_gm_connected`, `<dnd5e error>`

**`weapon-attack.ts`** — `ToolHandler<WeaponAttackInput>`:
- Same actor/item resolution path
- Locates attack-type activity: `item.system.activities?.contents.find(a => a.type === 'attack')`
- Error code: `no_attack_activity` (distinct from `no_activity` for plan-checker clarity)
- Single attack path only — Plan 07-04 adds multi-attack `count` extension

**`use-item.ts`** — `ToolHandler<UseItemInput>`:
- Same pattern as cast-spell but item type agnostic (consumables)
- Uses first activity regardless of type: `item.system.activities?.contents[0]`

**`move-token.ts`** — `ToolHandler<MoveTokenInput>`:
- Does NOT use `activity.use()` — direct document write
- Resolves scene: `game.scenes.active`
- Resolves token: `scene.tokens.get(args.token_id)` (uses widened FoundryCollection API)
- Calls `tokenDoc.update({ x: args.x, y: args.y })`
- Error codes: `no_active_scene`, `token_not_found`, `<update error>`

### foundry-globals.d.ts Extensions

- `FoundryActivity` interface: `type: string`, `use(config?: { configure?: boolean; consume?: { action?: boolean } }): Promise<unknown>`
- `FoundryItem.system.activities?: { contents: FoundryActivity[] }` (optional — non-activity items unaffected)
- `FoundryTokenDoc` interface: `id: string`, `update(changes: { x?, y?, [k]: unknown }): Promise<unknown>`
- `FoundryScene.tokens` widened from `{ contents: Array<{ id: string }> }` to `FoundryCollection<FoundryTokenDoc>` (`.contents` access preserved via Collection interface)

### socketlib-handlers.ts Stub Replacement

- `handleCastSpellStub` → `handleCastSpell = makeDispatchAdapter('cast-spell')`
- `handleWeaponAttackStub` → `handleWeaponAttack = makeDispatchAdapter('weapon-attack')`
- `handleUseItemStub` → `handleUseItem = makeDispatchAdapter('use-item')`
- `handleMoveTokenStub` → `handleMoveToken = makeDispatchAdapter('move-token')`
- `makeDispatchAdapter(toolId)`: validates input shape → calls dispatchTool → returns ToolResult
- `validateToolPayload(input)`: checks `args` present + `idempotencyKey: string` + `bearer: string`
- Registration call sites unchanged — `socketlib.registerComplexHandler` count = 14

### module.ts Boot Import

- Added: `import './write-path/handlers/index.js'` before Hooks.once('ready')
- Ensures TOOL_REGISTRY populated before any dispatchTool call can arrive

## Test Coverage

| File | Tests Added | Coverage Areas |
|------|-------------|----------------|
| `handlers/cast-spell.test.ts` | 7 | happy path, actor_not_found, item_not_found, no_activity, generic throw, no_gm_connected, argsSchema validation |
| `handlers/weapon-attack.test.ts` | 7 | happy path, actor_not_found, item_not_found, no_attack_activity (2 cases), generic throw, no_gm_connected, argsSchema |
| `handlers/use-item.test.ts` | 8 | happy path, actor_not_found, item_not_found, no_activity, generic throw, no_gm_connected, argsSchema (2 cases) |
| `handlers/move-token.test.ts` | 7 | happy path, no_active_scene, token_not_found, update rejects, no activity.use() called, argsSchema (2 cases) |
| `pair/socketlib-handlers.test.ts` (extended) | +17 | Pitfall 7 count guard, 4 handlers invalid_input coverage, 3 remaining stubs still phase-07-pending |
| `pair/socketlib-handlers-dispatch.test.ts` (new) | +4 | dispatchTool forwarding for each of 4 handlers with mocked dispatchTool |
| **Total new** | **50** | |

Baseline: 211 → Final: 260 (+49 tests; the handlers index.ts has no tests as it is a pure side-effect barrel)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock nested inside describe/it block**
- **Found during:** Task 2 — running socketlib-handlers.test.ts after adding the dispatchTool mock test
- **Issue:** Vitest emits a warning ("A vi.mock() call is not at the top level") that will become an error in a future version
- **Fix:** Moved the dispatchTool integration test into a separate file (`socketlib-handlers-dispatch.test.ts`) with the `vi.mock` at the true top level of the file. The original `socketlib-handlers.test.ts` retains all non-mock tests.
- **Files modified:** `pair/socketlib-handlers.test.ts` (removed nested mock), `pair/socketlib-handlers-dispatch.test.ts` (new file)
- **Commit:** `b3db518`

**2. [Rule 2 - Auto-add] makeDispatchAdapter factory pattern**
- **Found during:** Task 2 implementation
- **Issue:** Plan described 4 individual adapter functions; factoring into a `makeDispatchAdapter(toolId)` factory eliminates repetition and ensures all 4 adapters share identical validation logic (single point for T-07-02-01 mitigations)
- **Fix:** Implemented `makeDispatchAdapter` factory; each handler is `const handleXxx = makeDispatchAdapter('xxx')` — one function for all 4
- **Files modified:** `pair/socketlib-handlers.ts`
- **Commit:** `b3db518`

## Verification Results

- `pnpm --filter @evf/foundry-module test` — 260 tests pass (16 test files)
- `pnpm typecheck` — clean (no errors)
- `grep -c 'socketlib\.registerComplexHandler(' socketlib-handlers.ts` = 14 (Pitfall 7 satisfied)
- `grep -c 'dispatchTool' socketlib-handlers.ts` = 14 (≥4 requirement met)
- Gate 8: `! grep -rE 'activity\.use\(' g2-app bridge --include='*.ts'` → 0 hits (CLEAN)
- `grep -c 'registerToolHandler' handlers/index.ts` actual calls = 4 (barrel correct)
- `module.test.ts toHaveBeenCalledTimes(14)` — PASSES (regression guard intact)

## Hardware-Pending SC-07-01

**SC-07-01** (`human_needed` per ADR-0005 Branch A): Real `executeAsGM` round-trip — `cast-spell` produces a real chat card in a Foundry test world. This requires a live Foundry VTT instance with the `evenfoundryvtt` module loaded and a GM user connected.

Status: **DECLARED hardware-pending** — software tests mock the Foundry globals and dnd5e Activity API. Hardware validation deferred per Phase 0 §10.0 ADR-0005 Branch A policy.

## Forward References

- **Plan 07-03:** Adds `placeTemplate` handler (Wave 2) — replaces `evf.placeTemplate` stub
- **Plan 07-04:** Extends `weapon-attack` handler with multi-attack `count` param
- **Plan 07-05:** Renames `evf.setTargets` stub to `evf.dropConcentration` + adds `drop-concentration` handler

## Known Stubs

None in this plan's scope. The 3 remaining socketlib stubs (`evf.skillCheck`, `evf.placeTemplate`, `evf.setTargets`) are intentionally not replaced in Plan 07-02 — they are tracked for Plans 07-03/07-05.

## Threat Surface Scan

No new network endpoints introduced. No new auth paths. The 4 new handler files call `activity.use()` inside the Foundry module execution context (GM authority via socketlib.executeAsGM) — this is the intended trust boundary per ADR-0011. The `validateToolPayload` guard (T-07-02-01) prevents raw socket input from reaching `dispatchTool` without shape validation.

## Self-Check: PASSED

- All 10 created files confirmed on disk
- All 4 modified files confirmed on disk
- Commits `82133e0` (Task 1) and `b3db518` (Task 2) confirmed in git log
- 260 tests pass (baseline: 211, +49 new)
- TypeScript typecheck clean across workspace
- CI Gate 8 clean (0 activity.use() hits in g2-app/bridge)
- socketlib.registerComplexHandler count = 14 (grep verified)
- module.test.ts toHaveBeenCalledTimes(14) PASSES
