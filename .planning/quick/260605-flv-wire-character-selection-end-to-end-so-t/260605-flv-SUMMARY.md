---
phase: quick-260605-flv
plan: "01"
subsystem: character-selection
tags: [character-selection, handshake, bridge, g2-app, actor-targeting, flv-char-select]
dependency_graph:
  requires: [260605-dog, 260605-d0v, 260605-e9t]
  provides: [FLV-CHAR-SELECT end-to-end wire]
  affects: [packages/shared-protocol/src/handshake.ts, packages/bridge/src/ws/, packages/g2-app/src/]
tech_stack:
  added: []
  patterns: [conditional-spread for exactOptionalPropertyTypes, three-present AND-guard for targeting]
key_files:
  created:
    - packages/shared-protocol/src/handshake.test.ts
    - packages/bridge/src/ws/session-store.test.ts
    - packages/bridge/src/ws/handshake-actor.test.ts
    - packages/bridge/src/ws/initial-snapshot-actor.test.ts
    - packages/bridge/src/ws/delta-emitter-actor.test.ts
    - packages/g2-app/src/engine/__tests__/capability-handshake-actor.test.ts
    - packages/g2-app/src/__tests__/launch-actor.test.ts
  modified:
    - packages/shared-protocol/src/handshake.ts
    - packages/bridge/src/ws/session-store.ts
    - packages/bridge/src/ws/handshake.ts
    - packages/bridge/src/ws/initial-snapshot.ts
    - packages/bridge/src/ws/delta-emitter.ts
    - packages/bridge/src/server.ts
    - packages/g2-app/src/engine/capability-handshake.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/internal/launch.ts
decisions:
  - selectedActorId uses conditional spread (not explicit undefined) to satisfy exactOptionalPropertyTypes
  - delta-emitter targeting uses three-present AND-guard to preserve broadcast back-compat
  - launch.ts readUrlSearch seam mirrors existing LaunchDeps injection style
  - No foundry-module changes; socketlib count stays 17
metrics:
  duration: "20 min"
  completed: "2026-06-05"
  tasks: 3
  files: 16
---

# Phase quick-260605-flv Plan 01: Wire Character Selection End-to-End Summary

**One-liner:** Optional `actorId` handshake field + per-session `selectedActorId` gate wired from
g2-app `?actor=` URL param through the WS handshake to bridge session store, initial-snapshot push,
and `emitDelta` character.delta targeting — the player's chosen PC now renders on the glasses HUD.

## Commits

| Hash | Message |
|------|---------|
| `0223cc2` | feat: actorId on HandshakeClientSchema + selectedActorId on Session (Task 1) |
| `d91e227` | feat: bridge initial-snapshot + per-session character.delta targeting (Task 2) |
| `e7b455b` | fix: remove unused beforeEach import in IS actor test |
| `250b177` | feat: g2-app threads characterId to handshake actorId (Task 3) |
| `dfcaa43` | fix: exactOptionalPropertyTypes spread for selectedActorId in server.ts |

## What Was Built

### Task 1: shared-protocol + bridge session plumbing

- **HandshakeClientSchema** (`shared-protocol/src/handshake.ts`): added
  `actorId: z.string().min(1).optional()` with JSDoc. Empty string fails (`min(1)`); omitting
  the field entirely is back-compat for existing clients.
- **Session interface** (`bridge/src/ws/session-store.ts`): added `readonly selectedActorId?: string`
  with TSDoc explaining FLV-CHAR-SELECT semantics.
- **SessionStore.createSession** (`bridge/src/ws/session-store.ts`): added optional 4th param
  `selectedActorId?: string`; uses conditional spread to satisfy `exactOptionalPropertyTypes`.
- **handleHandshake** (`bridge/src/ws/handshake.ts`): threads `client.actorId` to both
  `createSession` call sites (first-connect + reconnect-not-found). Reconnect-found path leaves
  the existing session untouched (preserves prior pin).
- **Tests**: FLV-HS-01..03 (schema), FLV-SS-01..02 (session store), FLV-HS-FC/RNF/RF (handshake)

### Task 2: bridge initial-snapshot + emitDelta targeting

- **pushInitialCharacterDelta** (`bridge/src/ws/initial-snapshot.ts`): added optional
  `selectedActorId?: string` to `PushInitialCharacterDeltaArgs`. When set, fetches the pinned
  actor directly (skips the roster-empty guard); falls back to `roster[0]` when unset.
- **DeltaEmitter.emitDelta** (`bridge/src/ws/delta-emitter.ts`): added per-loop three-present
  AND-guard: fires ONLY when `type === 'character.delta'` AND `session.selectedActorId !== undefined`
  AND `payload.actorId` is a string. All three must be present to filter; if any is absent → current
  broadcast behavior preserved (back-compat). This prevents cross-player character leakage (T-flv-01).
- **server.ts**: passes `session?.selectedActorId` (via conditional spread) to
  `pushInitialCharacterDelta`.
- **Tests**: IS-SEL-01..04 (initial-snapshot actor), FLV-DE-01..05 (delta-emitter targeting)

### Task 3: g2-app threads characterId → handshake actorId

- **performCapabilityHandshake** (`g2-app/src/engine/capability-handshake.ts`): added trailing
  optional `actorId?: string` param; conditionally spread into `clientMsg` (exactOptionalPropertyTypes
  pattern mirrors the existing `session_id` spread).
- **BootEngineOpts** (`g2-app/src/internal/boot-engine-core.ts`): added `readonly characterId?: string`
  with TSDoc; threaded to BOTH `performCapabilityHandshake` calls (initial + reconnect).
- **launchApp** (`g2-app/src/internal/launch.ts`): added `readUrlSearch?: () => string` to
  `LaunchDeps` (testing seam, defaults to `() => window.location.search`); resolves
  `?actor=<id>` URL param in the no-auth dev branch and passes as `characterId` to `bootEngine`
  (conditional spread to keep `characterId` absent when unset).
- **Tests**: CH-ACT-01..02 (capability-handshake), LAUNCH-ACT-01..02 (launch actor)

## Verification Results

```
corepack pnpm test         → 3109/3109 passed (227 test files)
corepack pnpm typecheck    → 0 errors
corepack pnpm lint:ci      → 0 errors (313 pre-existing warnings)
```

## Deviations from Plan

**1. [Rule 1 - Bug] exactOptionalPropertyTypes in server.ts**
- **Found during:** Task 2 (typecheck gate)
- **Issue:** `session?.selectedActorId` evaluates to `string | undefined`; passing it directly
  to an `optional` field under `exactOptionalPropertyTypes` causes TS2379.
- **Fix:** Extracted `initialPushArgs` object with conditional spread so `selectedActorId` is
  only present when non-undefined.
- **Files modified:** `packages/bridge/src/server.ts`
- **Commit:** `dfcaa43`

**2. [Rule 2 - Cleanup] Unused `beforeEach` import in initial-snapshot-actor.test.ts**
- **Found during:** Task 2 commit (biome lint)
- **Fix:** Removed the unused `beforeEach` import.
- **Commit:** `e7b455b`

## Known Stubs

None. All implemented paths are fully wired with real logic (no placeholder returns or `TODO`).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| No new threat surface | — | actorId is a selector only; bearer + caps still validated upstream. A session can only receive snapshots from the dog cache (cache-bound); actorId cannot widen access (T-flv-02 accepted per threat model). |

## Self-Check: PASSED

- packages/shared-protocol/src/handshake.ts ✓ contains `actorId`
- packages/bridge/src/ws/session-store.ts ✓ contains `selectedActorId`
- packages/bridge/src/ws/delta-emitter.ts ✓ contains `selectedActorId`
- packages/g2-app/src/internal/boot-engine-core.ts ✓ contains `characterId`
- All 5 task commits present in git log (verified above)
- 3109/3109 tests pass
- typecheck: 0 errors
- lint:ci: 0 errors
