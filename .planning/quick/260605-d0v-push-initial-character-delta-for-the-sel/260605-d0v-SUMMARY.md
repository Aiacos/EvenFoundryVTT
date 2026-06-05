---
phase: quick-260605-d0v
plan: 01
subsystem: bridge/ws
tags: [initial-delta, ws, character-snapshot, on-connect-push]
dependency_graph:
  requires:
    - quick-260604-eyf (CharacterListCache push path)
    - quick-260604-qm0 (g2-app engine boots in sim)
  provides:
    - WS connect → character.delta proactive push
  affects:
    - packages/bridge/src/ws/delta-emitter.ts
    - packages/bridge/src/ws/initial-snapshot.ts
    - packages/bridge/src/server.ts
tech_stack:
  added: []
  patterns:
    - "Targeted single-session WS push (sendInitialToSession) as counterpart to fan-out emitDelta"
    - "Fire-and-forget async on-connect hook in Fastify WS handler"
    - "CharacterSnapshotSchema.safeParse guard before send (mirrors routes/character.ts)"
key_files:
  created:
    - packages/bridge/src/ws/initial-snapshot.ts
    - packages/bridge/src/ws/initial-snapshot.test.ts
  modified:
    - packages/bridge/src/ws/delta-emitter.ts
    - packages/bridge/src/ws/delta-emitter.test.ts
    - packages/bridge/src/server.ts
    - packages/bridge/src/server.test.ts
decisions:
  - "sendInitialToSession allocates seq AFTER capability gate (mirrors emitDelta ordering)"
  - "fire-and-forget void + .catch(logger.error) — WS handler stays synchronous"
  - "Session token read from sessionStore.getSession(sessionId)?.token (empty fallback → IS-05 graceful no-op)"
  - "internalSnapshotFn returns null for evf.getCharacterSnapshot in prod — safe no-op until module wires a real source"
metrics:
  duration: "~8 min"
  completed: "2026-06-05"
  tasks_completed: 3
  files_modified: 6
---

# Quick Task 260605-d0v: Push Initial Character Delta on WS Connect — Summary

**One-liner:** Proactive `character.delta` push on WS connect using `CharacterListCache` roster + `foundryFn` snapshot fetch via new `sendInitialToSession` + `pushInitialCharacterDelta`.

## What Was Built

### Task 1 — `sendInitialToSession` on `DeltaEmitter` (`7be5260`)

New public method on `DeltaEmitter` — targeted single-session analogue of `emitDelta`:
- Capability gate via `DELTA_CAP_MAP` (reused, not duplicated) — sessions without `read_char` receive nothing; `globalSeq` does NOT increment.
- Seq allocated AFTER cap check.
- Envelope pushed to `ReplayBuffer`; `sessionStore.updateLastSeq` called.
- Send errors remove the stale connection without propagating.
- Unknown sessionId → no-op, no throw.
- `onEmit` debug hook called for parity with `emitDelta`.

6 new DE-INIT tests; all 27 delta-emitter tests pass.

### Task 2 — `pushInitialCharacterDelta` in `initial-snapshot.ts` (`2a95017`)

New file exporting `async function pushInitialCharacterDelta(args)`:
1. `roster = characterListCache.get()` — cold/empty → debug log, return.
2. `actorId = roster.characters[0].actorId`.
3. `snapshot = await foundryFn('evf.getCharacterSnapshot', actorId, token)` — throw → caught, return.
4. `snapshot == null` → return.
5. `CharacterSnapshotSchema.safeParse(snapshot)` — mismatch → return (schema-drift guard, T-d0v-02).
6. `deltaEmitter.sendInitialToSession(sessionId, 'character.delta', parsed.data)`.

7 IS-01..07 tests all pass. Cold/empty/null/schema-fail/throw all produce graceful no-ops.

### Task 3 — Wiring in `server.ts` + integration tests (`9a8bbf8`)

- `server.ts`: added `import { pushInitialCharacterDelta }` and a `void pushInitialCharacterDelta(...).catch(logger.error)` call immediately after `deltaEmitter.registerSession(sessionId, socket)` and `metrics.wsSessionsActive.inc()`.
- `server.test.ts`: two real WS integration tests (listen on port 0, real WebSocket client):
  - `D0V-INT-01`: populated `CharacterListCache` + injected `foundrySnapshotFn` → `character.delta` received with `payload.actorId === 'actor-thorin'`.
  - `D0V-INT-02`: cold `CharacterListCache` → handshake response only, no `character.delta` within 150ms.
- Sim smoke procedure documented as a comment block (manual step, not automated gate).

## Verification Gates

| Gate | Result |
|------|--------|
| `vitest run delta-emitter.test.ts initial-snapshot.test.ts server.test.ts` | 95 tests pass |
| `pnpm --filter @evf/bridge typecheck` | Clean (exit 0) |
| `pnpm lint:ci` | Exit 0 (no errors; 316 pre-existing warnings unchanged) |
| `pnpm test` (workspace) | 3051 tests pass |
| CI Gate 8 socketlib `registerComplexHandler` count | 17 (unchanged — no new handlers) |
| No new package dependencies | Confirmed (reuses zod/pino/ws pinned in workspace) |

## Deviations from Plan

**1. [Rule 1 - Bug] Timeout in initial D0V-INT-01 test implementation**
- **Found during:** Task 3 first run
- **Issue:** The initial test pattern used `ws.once('message', ...)` after `completeHandshake()` — a race condition since `character.delta` could arrive before the second listener was registered.
- **Fix:** Rewrote to use `ws.on('message', ...)` collecting all messages and a deadline timer; resolves as soon as `character.delta` is found in the collected set.
- **Files modified:** `packages/bridge/src/server.test.ts`
- **Commit:** `9a8bbf8`

**2. [Rule 3 - Blocking] `CharacterListEntrySchema` missing `class/hp/maxHp` fields**
- **Found during:** Task 2 test authoring
- **Issue:** The test `makePopulatedCache` helper initially included `class`, `hp`, `maxHp` fields not present in `CharacterListEntrySchema` (which only has `actorId`, `name`, `level`).
- **Fix:** Adjusted the cache seed payload to only use the three schema-valid fields.
- **Files modified:** `packages/bridge/src/ws/initial-snapshot.test.ts`
- **Commit:** Part of `2a95017`

**3. [Rule 1 - Bug] `server.test.ts` format error (Biome pre-commit hook)**
- **Found during:** Task 3 commit
- **Issue:** Biome pre-commit hook reformatted `delta-emitter.test.ts` at commit time; `server.test.ts` introduced a formatting diff.
- **Fix:** Applied `biome format --write packages/bridge/src/server.test.ts`.
- **Files modified:** `packages/bridge/src/server.test.ts`

## Security Surface (T-d0v-01..03)

All three threat-register mitigations implemented:
- **T-d0v-01**: `sendInitialToSession` applies `DELTA_CAP_MAP` gate — `read_char`-less sessions receive nothing.
- **T-d0v-02**: `CharacterSnapshotSchema.safeParse` guards schema drift before any send.
- **T-d0v-03**: `foundryFn` throw is caught, one bounded fetch per connection, no retry loop.

## Known Stubs

None — `pushInitialCharacterDelta` is a full implementation. The `internalSnapshotFn` in `server.ts` returns `null` for `evf.getCharacterSnapshot` (no live source in production until the Foundry module pushes snapshots), which is a documented graceful no-op, not a stub.

## Self-Check

### Commits exist:
- `7be5260` — Task 1 ✓
- `2a95017` — Task 2 ✓
- `9a8bbf8` — Task 3 ✓

### Key files exist:
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/ws/initial-snapshot.ts` ✓
- `/home/aiacos/workspace/EvenFoundryVTT/packages/bridge/src/ws/initial-snapshot.test.ts` ✓

## Self-Check: PASSED
