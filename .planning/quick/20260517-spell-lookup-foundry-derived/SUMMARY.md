---
task: 20260517-spell-lookup-foundry-derived
subsystem: voice / spell-lookup
tags: [spell-lookup, foundry-derived, dynamic-vocabulary, bridge-cache, mcp-consumer, fuzzy-match]
dependency_graph:
  requires: [Phase 4b (bridge + foundry-module baseline), Phase 11 (foundry-mcp baseline)]
  provides: [dynamic-spell-vocabulary, bridge-spell-cache, GET /v1/spells/available]
  affects: [foundry-mcp voice tool, bridge /internal/delta fan-out, foundry-module emit path]
tech_stack:
  added: [SpellPackCache (bridge), DeltaInterceptFn hook, GET /v1/spells/available route]
  patterns: [push-based cache, TTL eviction, Levenshtein fuzzy match, Zod schema guard (T-SP-02)]
key_files:
  created:
    - packages/shared-protocol/src/payloads/spell-pack.ts
    - packages/shared-protocol/src/payloads/spell-pack.test.ts
    - packages/foundry-module/src/readers/spell-pack-reader.ts
    - packages/foundry-module/src/readers/__tests__/spell-pack-reader.test.ts
    - packages/bridge/src/cache/spell-pack-cache.ts
    - packages/bridge/src/ws/spell-pack-handler.ts
    - packages/bridge/src/routes/spells.ts
    - packages/foundry-mcp/src/voice/spell-lookup-foundry.ts
    - packages/foundry-mcp/src/voice/__tests__/spell-lookup-foundry.test.ts
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/src/module.ts
    - packages/bridge/src/routes/internal-delta.ts
    - packages/bridge/src/server.ts
decisions:
  - Push-based emit via existing /internal/delta channel preserves Phase 13 socketlib invariant (count stays 17)
  - onDelta intercept hook added to registerInternalDeltaRoute as typed multiplexer before fan-out
  - SPELL_LOOKUP 70-entry table promoted to offline fallback, not deleted
  - 5-min TTL (SPELL_CACHE_TTL_MS=300000) in foundry-mcp module-level cache with stale-on-failure soft-fail
  - T-SP-02: AvailableSpellsPayloadSchema.safeParse before every cache write
  - De-duplication by compendium _id first-pack-wins
metrics:
  duration_minutes: 71
  completed: 2026-05-17
  tasks: 3
  commits: 3
  tests_added: 53
  total_tests_after: 2476
---

# Quick Task 20260517: Spell Lookup — Foundry-Derived Dynamic Vocabulary

**One-liner:** Push-based Foundry compendium -> bridge SpellPackCache -> foundry-mcp 5-min TTL dynamic resolver with Levenshtein fuzzy match and SPELL_LOOKUP offline fallback.

## What Was Built

### Task 1 — shared-protocol schema + foundry-module reader + module wiring (fbaac3c)

SpellPackEntrySchema + AvailableSpellsPayloadSchema + R1_SPELLS_AVAILABLE_TYPE in shared-protocol.
readAvailableSpells(): iterates game.packs, filters dnd5e Item packs, maps + de-duplicates by _id, localizes via game.i18n.localize.
registerSpellPackReader(emit): emits immediately on init, registers updateCompendium hook with 500ms debounce.
Module wired in Hooks.once('init').

### Task 2 — bridge cache + REST route + WS handler (dc8586b)

SpellPackCache (last-write-wins, cold returns null).
handleSpellPackEnvelope: Zod-validates before write; returns true on type-match even for invalid body (T-SP-02 cache-poisoning guard).
GET /v1/spells/available: bearer-auth, cold-cache sentinel source='empty'.
DeltaInterceptFn hook on registerInternalDeltaRoute — onDelta? called before fan-out.

### Task 3 — foundry-mcp dynamic resolver + static fallback (856991b)

fetchAvailableSpells(bridgeUrl, bearer): GET /v1/spells/available, Zod-validates, builds DynamicEntry[], 5-min TTL.
lookupSpellIdFromBridge(transcript, bridgeUrl?, bearer?): dynamic -> staticLookup fallback.
lookupInDynamic: exact EN -> exact locale -> substring EN -> substring locale -> Levenshtein <=2 -> no-match.
staticLookup: mirrors spell-lookup.ts resolution on SPELL_LOOKUP (offline fallback, not deleted).

## Done Criteria

| Criterion | Result |
|-----------|--------|
| socketlib registerComplexHandler count = 17 | PASS |
| SPELL_LOOKUP offline fallback preserved | PASS |
| fireball via dynamic path (exact EN + IT) | PASS |
| fireball via static fallback when bridge unreachable | PASS |
| Italian fuzzy match with typo (palla di fuocoo) | PASS (distance=1) |
| T-SP-02 invalid payload not cached | PASS (bridge + mcp) |
| 5-min TTL eviction re-fetches | PASS |
| pnpm typecheck | PASS |
| pnpm lint:ci (my files) | PASS |
| pnpm test 2476/2476 | PASS (+53 new) |

## Deviations

None — plan executed exactly as written. The DeltaInterceptFn hook is the minimal implementation of the plan's constraint "emission uses the existing WS path (NOT socketlib)".

## Known Stubs

None. Cold-cache sentinel (source='empty') is intentional spec behavior.

## Self-Check: PASSED

All 9 new files exist on disk. Commits fbaac3c, dc8586b, 856991b all in git log.
