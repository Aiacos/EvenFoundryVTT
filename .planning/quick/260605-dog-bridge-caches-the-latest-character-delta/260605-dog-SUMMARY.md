---
phase: quick-260605-dog
plan: "01"
subsystem: bridge
tags: [cache, websocket, character-snapshot, internal-delta, dog-fix]
dependency_graph:
  requires: [260605-d0v]
  provides: [CharacterSnapshotCache, handleCharacterSnapshotEnvelope]
  affects: [server.ts/internalSnapshotFn, /v1/character/:actorId, /ws initial push]
tech_stack:
  added: []
  patterns: [push-based cache, multiplexed envelope dispatch, injectable test cache]
key_files:
  created:
    - packages/bridge/src/cache/character-snapshot-cache.ts
    - packages/bridge/src/ws/character-snapshot-handler.ts
    - packages/bridge/src/cache/character-snapshot-cache.test.ts
    - packages/bridge/src/ws/character-snapshot-handler.test.ts
    - packages/bridge/src/server.character-snapshot.test.ts
  modified:
    - packages/bridge/src/server.ts
decisions:
  - CharacterSnapshotCache uses Map<actorId, CharacterSnapshot> (per-actor keying, unlike singleton SpellPackCache/EntityPackCache)
  - args renamed from _args in internalSnapshotFn (now used for evf.getCharacterSnapshot actorId lookup)
  - biome-ignore comment relocated to Promise<any> return type line (parameter is now unknown[], not any)
metrics:
  duration_minutes: 6
  completed_date: "2026-06-05"
  tasks_completed: 3
  files_changed: 6
---

# Quick Task 260605-dog: CharacterSnapshotCache + server.ts wiring Summary

**One-liner:** Bridge now caches `character.delta` per `actorId` via `CharacterSnapshotCache`, closing the `actor_not_found` gap in `GET /v1/character/:actorId` and enabling the d0v on-connect initial push in production.

## What Was Built

### Task 1 — CharacterSnapshotCache + handleCharacterSnapshotEnvelope (TDD)

**RED** (`ce2777a`): 8 failing tests for both artifacts (cache: CSC-BASIC-01..05; handler: CSH-01..03).

**GREEN** (`c78f54d`): Implementation matching the spell-pack/entity-pack pipeline pattern exactly.

- `CharacterSnapshotCache` (`packages/bridge/src/cache/character-snapshot-cache.ts`): `Map<string, CharacterSnapshot>` keyed by `actorId`. Public API: `set(snapshot)` (last-write-wins), `get(actorId): CharacterSnapshot | null` (cold → null), `clear()` (test isolation). No TTL, no eviction — matches sibling caches. Full TSDoc.
- `handleCharacterSnapshotEnvelope` (`packages/bridge/src/ws/character-snapshot-handler.ts`): signature `(type, payload, cache): boolean`. Returns `false` on type mismatch (order-independent multiplexing); validates with `CharacterSnapshotSchema.safeParse` before `cache.set` (T-dog-01 cache poisoning mitigation); returns `true` on invalid body (handled, body rejected).

### Task 2 — server.ts wiring (`70dd136`, `f24e137`)

Three additive edits to `server.ts` (bridge-only, no foundry-module changes):

1. **Imports**: `CharacterSnapshotCache` + `handleCharacterSnapshotEnvelope`.
2. **`BuildServerOptions`**: new `characterSnapshotCache?: CharacterSnapshotCache` field with TSDoc.
3. **Cache instantiation**: `const characterSnapshotCache = opts.characterSnapshotCache ?? new CharacterSnapshotCache();` before `internalSnapshotFn`.
4. **`internalSnapshotFn`**: renamed `_args` → `args` (now used); added `evf.getCharacterSnapshot` branch: `args[0]` (actorId) → `characterSnapshotCache.get(actorId) ?? null`.
5. **`/internal/delta` fan-out**: `handleCharacterSnapshotEnvelope(type, payload, characterSnapshotCache)` added as 5th handler.
6. **Stale comment fix**: d0v no-op comment updated to reflect that the cache now serves snapshots when the module has pushed a `character.delta`.
7. **biome-ignore fix**: relocated suppression comment to `Promise<any>` return type line (parameter `...args: unknown[]` no longer uses `any`).

### Task 3 — Integration tests (`900cd0c`)

`server.character-snapshot.test.ts` against `buildServer({})` (prod path):

- **DOG-INT-01**: POST `character.delta` → GET `/v1/character/actor-thorin` returns **200** with full snapshot (previously `actor_not_found`). Passes.
- **DOG-INT-01b**: Cold cache → GET still returns **404** `actor_not_found`. Passes.
- **DOG-INT-02**: POST `r1.characters.available` + POST `character.delta` → WS connect → client receives `character.delta` envelope with `payload` deep-equal to `VALID_SNAPSHOT`. Passes.

## Verification

Full bridge test suite: **462/462** passed (no regressions).

```
corepack pnpm --filter @evf/bridge exec vitest run    # 462/462
corepack pnpm --filter @evf/bridge exec tsc --noEmit  # exit 0
corepack pnpm --filter @evf/bridge exec biome ci src  # 0 errors (61 pre-existing warnings)
```

Invariant checks:
- `git diff --name-only` across all task commits: only `packages/bridge/**` (no foundry-module touched).
- socketlib `registerComplexHandler` count **unchanged** (grep confirms no foundry-module files modified).
- No new entries in any `package.json` dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] biome-ignore comment misplacement after `_args` → `args` rename**

- **Found during:** Task 2
- **Issue:** Renaming `_args` to `args` (required now it's used) made the `biome-ignore lint/suspicious/noExplicitAny` comment on the parameter line stale (`args: unknown[]` doesn't need suppression). Biome then also reported the `Promise<any>` return type on line 430 as having a suppression comment (on the function declaration line 425) that no longer matched.
- **Fix:** Moved the biome-ignore comment to the `): Promise<any> => {` line where `any` is actually present. Removed the stale parameter comment.
- **Files modified:** `packages/bridge/src/server.ts`
- **Commit:** `f24e137`

## Known Stubs

None — all wiring is live. `internalSnapshotFn` now returns real cached data from `CharacterSnapshotCache` for `evf.getCharacterSnapshot` when the module has pushed a `character.delta`. The graceful no-op path (null return when cache is cold) is by design (IS-05) — not a stub.

## Threat Flags

No new threat surface introduced. The cache write is gated by `CharacterSnapshotSchema.safeParse` (T-dog-01 ✓). The REST route enforces bearer auth unchanged (T-dog-02 accept ✓). No new dependencies.

## Self-Check: PASSED

Created files:
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/cache/character-snapshot-cache.ts` ✓
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/ws/character-snapshot-handler.ts` ✓
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/cache/character-snapshot-cache.test.ts` ✓
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/ws/character-snapshot-handler.test.ts` ✓
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/server.character-snapshot.test.ts` ✓

Commits verified:
- `ce2777a` test(bridge): add failing tests (dog-01 RED) ✓
- `c78f54d` feat(bridge): implement CharacterSnapshotCache + handler (dog-01 GREEN) ✓
- `70dd136` feat(bridge): wire into server.ts (dog-02) ✓
- `f24e137` fix(bridge): biome-ignore placement fix (dog-02 follow-up) ✓
- `900cd0c` feat(bridge): integration tests (dog-03) ✓
