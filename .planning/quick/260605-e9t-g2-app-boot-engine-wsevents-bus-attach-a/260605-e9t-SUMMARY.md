---
phase: quick-260605-e9t
plan: "01"
subsystem: g2-app/WS event bus
tags: [tdd, ws-bus, boot-engine, last-value-replay, timing-fix]
dependency_graph:
  requires: [260605-d0v, 260605-dog]
  provides: [E9T-BUS-01]
  affects: [packages/g2-app/src/internal/boot-engine-core.ts]
tech_stack:
  added: []
  patterns: [persistent-listener, last-value-replay, late-bind-dependency]
key_files:
  created:
    - packages/g2-app/src/__tests__/boot-engine-ws-event-bus.test.ts
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
decisions:
  - createWsEventBus exported (was private) to allow direct unit testing
  - SeqTracker moved to step 5a (pre-handshake) since it has no dependencies
  - PerfProbe late-bound via setPerfProbe() — avoids creating bus before handshake.session_id
  - globalHandler never removed — unsubscribe only removes per-channel fn from Set
  - lastByChannel uses Map<string, unknown> keyed by envelope.type (bounded small set)
metrics:
  duration: "~7 min"
  completed: "2026-06-05T08:25:00Z"
  tasks_completed: 3
  files_changed: 2
---

# Phase quick-260605-e9t Plan 01: WS Event Bus Persistent Listener + Last-Value Replay Summary

Persistent-listener + last-value-replay WS event bus replacing the per-subscribe handler pattern, closing the on-connect `character.delta` timing gap so the HUD renders real character data on first connect.

## What Was Built

The `createWsEventBus` function in `boot-engine-core.ts` was refactored from a per-subscribe
`addEventListener` pattern (which permanently dropped the bridge's on-connect `character.delta`)
to a persistent-listener design with per-channel last-value caching and synchronous replay on
subscribe. The bus is now created at boot step 5a (right after `awaitWsOpen`, before
`performCapabilityHandshake`) so its global handler is live when the on-connect push arrives
during boot steps 6-11.

Key changes:
- ONE `globalHandler` attached at bus creation (`ws.addEventListener('message', globalHandler)`)
  for the bus lifetime — never removed.
- `lastByChannel: Map<string, unknown>` caches the last payload per channel (keyed by envelope `type`).
- `subscribe(channel, fn)` replays the cached last value synchronously BEFORE registering `fn`
  for future envelopes.
- `unsubscribe()` deletes only `fn` from the per-channel `Set`; never touches `globalHandler`.
- `setPerfProbe(p)` late-binds the `PerfProbe` instance after `handshake.session_id` is available
  at step 10, enabling the `result_envelope` station mark.
- `SeqTracker` moved from step 10 to step 5a (no dependencies; needed early for bus construction).
- `StatusHudLayer` receives the same `wsEventBus` instance (not a new `createWsEventBus` call).
- Phase 10 D-Area1 `seqTracker.observe()` + `perfProbe.mark('result_envelope', …)` hot-path
  logic preserved verbatim — moved into `globalHandler`, not rewritten.
- Function exported (was `function`, now `export function`) to allow direct unit testing.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for persistent bus | `145d9bb` | `src/__tests__/boot-engine-ws-event-bus.test.ts` |
| 2 (GREEN) | Refactor createWsEventBus | `e9a34e4` | `src/internal/boot-engine-core.ts` |
| 3 (GATE) | Full g2-app gate | `0ca5dc5` | `src/__tests__/boot-engine-ws-event-bus.test.ts` (fix) |

## Test Coverage

7 new unit tests (a-g) covering all must-have truths:

- **(a) REPLAY-BEFORE-SUBSCRIBE** — on-connect push arrives before subscribe(); replayed.
- **(b) FORWARD-AFTER-SUBSCRIBE** — messages after subscribe() forwarded normally.
- **(c) PER-CHANNEL** — subscribing to `character.delta` does not replay `r1.movement.budget`.
- **(d) LAST-VALUE-ONLY** — only the last payload per channel is replayed.
- **(e) SEQ + PERF HOOKS** — `seqTracker.observe()` + `perfProbe.mark()` fire regardless of subscribers.
- **(f) UNSUBSCRIBE-SCOPED** — unsubscribe removes only the target fn; other subscribers + global listener live.
- **(g) ORDERING (the bug)** — the timing race: pre-subscribe message captured and replayed.

## Verification Gates

| Gate | Result |
|------|--------|
| New bus tests (7/7) | PASS |
| Reconnect-rewire suite (Phase 10 regression) | PASS |
| Perf-probe suite (Phase 10 regression) | PASS |
| Full @evf/g2-app vitest (1429 tests) | PASS (was 1422, +7) |
| @evf/g2-app typecheck | PASS (exit 0) |
| biome ci on changed files | PASS (exit 0) |
| workspace lint:ci | Pre-existing failures in deploy/ + bridge/ (unrelated) — not introduced by this plan |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] noUnusedLocals error on `bus` variable in test (e)**
- **Found during:** Task 3 (typecheck)
- **Issue:** `const bus = createWsEventBus(...)` in test (e) was flagged by TypeScript strict
  `noUnusedLocals` since the bus return value is never used (the test only needs the side-effect
  of attaching the global listener, not to call `subscribe()`).
- **Fix:** Renamed to `const _bus` + added `void _bus` comment clarifying the intentional pattern.
- **Files modified:** `src/__tests__/boot-engine-ws-event-bus.test.ts`
- **Commit:** `0ca5dc5`

## Known Stubs

None — all wired, no placeholder data paths.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes were introduced.
The `lastByChannel` Map is keyed by the bounded set of known envelope types (`character.delta`,
`r1.movement.budget`, `r1.action.economy`, `r1.action.result`, plus control frames). T-e9t-01
(JSON.parse in try/catch) and T-e9t-02 (bounded Map growth) dispositions unchanged from plan.

## Self-Check: PASSED

- `packages/g2-app/src/__tests__/boot-engine-ws-event-bus.test.ts` — FOUND
- `packages/g2-app/src/internal/boot-engine-core.ts` — FOUND
- Commit `145d9bb` — FOUND (test RED)
- Commit `e9a34e4` — FOUND (feat GREEN)
- Commit `0ca5dc5` — FOUND (gate fix)
