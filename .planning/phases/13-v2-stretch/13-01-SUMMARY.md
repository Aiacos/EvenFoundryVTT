---
phase: 13-v2-stretch
plan: "01"
subsystem: foundry-module/write-path
tags: [ACT-04, reaction-handlers, socketlib, tdd]
dependency_graph:
  requires: []
  provides: [cast-shield, cast-counterspell, opportunity-attack handlers, socketlib-17-invariant]
  affects: [socketlib-handlers.ts, tool-registry.ts, handlers/index.ts, shared-protocol/tools]
tech_stack:
  added: []
  patterns: [ToolHandler<T>, makeDispatchAdapter, defensive-spell-resolver, two-arg-activity-use]
key_files:
  created:
    - packages/shared-protocol/src/tools/cast-shield.ts
    - packages/shared-protocol/src/tools/cast-shield.test.ts
    - packages/shared-protocol/src/tools/cast-counterspell.ts
    - packages/shared-protocol/src/tools/cast-counterspell.test.ts
    - packages/shared-protocol/src/tools/opportunity-attack.ts
    - packages/shared-protocol/src/tools/opportunity-attack.test.ts
    - packages/foundry-module/src/write-path/handlers/cast-shield.ts
    - packages/foundry-module/src/write-path/handlers/cast-shield.test.ts
    - packages/foundry-module/src/write-path/handlers/cast-counterspell.ts
    - packages/foundry-module/src/write-path/handlers/cast-counterspell.test.ts
    - packages/foundry-module/src/write-path/handlers/opportunity-attack.ts
    - packages/foundry-module/src/write-path/handlers/opportunity-attack.test.ts
  modified:
    - packages/shared-protocol/src/tools/index.ts
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/write-path/handlers/index.ts
    - packages/foundry-module/src/write-path/tool-registry.ts
    - packages/foundry-module/src/write-path/tool-registry.test.ts
    - packages/foundry-module/src/pair/socketlib-handlers.ts
    - packages/foundry-module/src/pair/socketlib-handlers.test.ts
    - packages/foundry-module/src/module.test.ts
    - packages/foundry-module/src/__tests__/09-integration-smoke.test.ts
    - packages/g2-app/src/__tests__/09-integration-smoke.test.ts
decisions:
  - "D-13-01: Shield spell resolver prefers system.identifier='shield' then name match (shield/scudo); no upcast in MVP"
  - "D-13-02: Counterspell uses activity.use({spell:{slot:'spell${N}'}}) — upcast slots 3..9 supported; dnd5e resolves contested check"
  - "D-13-03: OpportunityAttack uses two-arg activity.use(usageCfg, {flags:{dnd5e:{opportunityAttack:true}}}); consume.action:false preserves Action slot"
  - "Phase 13 INVARIANT FLIP: socketlib registerComplexHandler count 14 → 17"
metrics:
  duration: "~35min"
  completed: "2026-05-17"
  tasks_completed: 3
  files_created: 12
  files_modified: 10
  tests_new: 33
  tests_total: 2323
---

# Phase 13 Plan 01: ACT-04 Reaction Handlers Summary

**One-liner:** Three ACT-04 reaction handlers (Shield/Counterspell/OA) with defensive spell resolvers + socketlib invariant flip 14→17.

## What Was Built

Plan 13-01 lands the foundry-module side of ACT-04: three new ToolHandler implementations that enable the player to fire reactions from the G2 glasses prompt (Plan 13-02 adds the UI).

### Schemas (3 new files)

- **CastShieldInputSchema**: `actor_id + activity_id? + slot_level (fixed 1)` — Shield is level-1 only, no upcast per D-13-01.
- **CastCounterspellInputSchema**: `actor_id + activity_id? + slot_level (3..9, default 3) + target_caster_id` — upcast supported; target_caster_id is audit-only.
- **OpportunityAttackInputSchema**: `actor_id + item_id + target_id` — explicit weapon required (no auto-pick for determinism per D-13-03).

All three use `z.strictObject()` per T-13-04a (extra-key rejection).

### Handlers (3 new files)

- **castShieldHandler**: Defensive resolver (identifier='shield' > name match 'shield'/'scudo'); calls `activity.use({configure:false, spell:{slot:'spell1'}})`.
- **castCounterspellHandler**: Resolver (identifier='counterspell' > 'counterspell'/'contromagia'); upcast via `spell.slot:'spell${slotLevel}'`; echoes `target_caster_id` in success data.
- **opportunityAttackHandler**: Resolves first attack-type activity; two-arg `activity.use({configure:false, consume:{action:false}}, {flags:{dnd5e:{opportunityAttack:true}}})`.

### 14 → 17 Invariant FLIP (grep evidence)

```
grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17
```

All assertion sites updated:
- `packages/foundry-module/src/pair/socketlib-handlers.test.ts` — 14→17 + 3 positive registration assertions
- `packages/foundry-module/src/module.test.ts` — all 5 occurrences updated 14→17
- `packages/foundry-module/src/__tests__/09-integration-smoke.test.ts` — grep gate updated
- `packages/g2-app/src/__tests__/09-integration-smoke.test.ts` — grep gate updated

### TOOL_HANDLER_IDS Extended

ToolId union now has 10 entries (was 7). New entries:
- `'cast-shield'` → `'evf.castShield'`
- `'cast-counterspell'` → `'evf.castCounterspell'`
- `'opportunity-attack'` → `'evf.opportunityAttack'`

### Barrel Exports

- `packages/shared-protocol/src/tools/index.ts` — 3 new exports
- `packages/shared-protocol/src/index.ts` — Phase 13 section added

## Tests

| Suite | Tests | Status |
|-------|-------|--------|
| SS-CSH-01..06 (shield schema) | 6 | PASS |
| SS-CCSP-01..06 (counterspell schema) | 7 | PASS |
| SS-OAT-01..06 (opportunity-attack schema) | 6 | PASS |
| CSH-01..06 (shield handler) | 6 | PASS |
| CCSP-01..06 (counterspell handler) | 6 | PASS |
| OAT-01..06 (opp-attack handler) | 6 | PASS |
| socketlib-handlers invariant | 4 | PASS |
| module.test invariant | 5 | PASS |
| Total workspace | 2323 | PASS |

## Deviations from Plan

**1. [Rule 1 - Bug] Tool-registry.test.ts count assertion**
- Found during Task 3: `tool-registry.test.ts` asserted 7 entries in TOOL_HANDLER_IDS; extended to 10.
- Fix: Updated both assertion message and count in the test file.

**2. [Rule 1 - Bug] TypeScript type errors in handlers**
- Found during typecheck: FoundryItem type doesn't accept direct cast to `Record<string,unknown>` due to index signature.
- Fix: Used `(item as unknown) as Record<string,unknown>` pattern; extracted typed system shape as local type alias.

None — plan executed within expected scope.

## Security (T-13-04)

All three handlers route through `dispatchTool` (bearer-bound cache key → handler lookup → argsSchema parse → audit log). CI Gate 8 (`activity.use(` absent from g2-app + bridge) confirmed green. No new auth surface.

## Commit

`ec38aa1` — feat(13-01): ACT-04 reaction handlers + socketlib 14→17 FLIP

## Self-Check: PASSED

- cast-shield.ts: FOUND
- cast-counterspell.ts: FOUND
- opportunity-attack.ts: FOUND
- socketlib-handlers.ts count=17: VERIFIED (grep -c output: 17)
- 2323 tests passing: VERIFIED
