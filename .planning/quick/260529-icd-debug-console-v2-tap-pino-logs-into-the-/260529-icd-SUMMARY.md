---
quick_id: 260529-icd
phase: quick-260529-icd
plan: 01
subsystem: bridge
branch: develop
tags: [debug-console, observability, pino, logging, bridge]
requires:
  - "DebugEventBus + /debug routes (quick 260529-h5e)"
  - "DebugEvent 'log' direction (shared-protocol — pre-existing)"
provides:
  - "pino → DebugEventBus 'log' tap (in-process multistream)"
  - "DebugEventBus.size + byDirection() counts"
  - "enriched GET /debug/state (age_ms, uptime_sec, ts, debug.byDirection, cache counts)"
affects:
  - packages/bridge/src/server.ts
  - packages/bridge/src/debug/*
tech-stack:
  added: []
  patterns:
    - "pino.multistream (in-process) for the log tap — NOT a transport (workers can't reach the in-process bus)"
    - "Fastify 5 loggerInstance for a pre-built pino instance (logger option only accepts a config object)"
    - "single LOGGER_REDACT const shared by debug-ON and debug-OFF paths (byte-identical redaction)"
key-files:
  created:
    - packages/bridge/src/debug/bus-log-stream.ts
    - packages/bridge/src/debug/bus-log-stream.test.ts
  modified:
    - packages/bridge/src/server.ts
    - packages/bridge/src/server.test.ts
    - packages/bridge/src/debug/debug-event-bus.ts
    - packages/bridge/src/debug/debug-event-bus.test.ts
    - packages/bridge/src/debug/debug-routes.ts
    - packages/bridge/src/debug/debug-routes.test.ts
    - .changeset/quick-260529-icd.md
decisions:
  - "Fastify 5 requires loggerInstance (not logger) for a pre-built pino instance — discovered at GREEN; logger only accepts a plain config object."
  - "Build the Fastify log option into ONE typed variable then call Fastify() once, avoiding a union app type that broke all downstream app.register() calls under exactOptionalPropertyTypes."
  - "tokenCache hits/misses omitted from /debug/state (prom-client Counters, not cheaply readable as a single value) — documented in code."
metrics:
  duration: "~30 min"
  completed: "2026-05-29"
  tasks: 2
  tests_added: 17
  workspace_tests: "2798 → 2815"
---

# Quick Task 260529-icd: Debug Console V2 (pino log tap + /debug/state enrichment) Summary

Two additive, dev-gated bridge-only enhancements to the Debug Console: pino log lines now surface as `direction:'log'` `DebugEvent`s in `/debug/events` + `/debug/stream` + dashboard via an in-process pino multistream, and `GET /debug/state` is enriched with cheap counts/summaries (age_ms, uptime_sec, ts, debug.byDirection, cache counts) — all tokens still redacted, zero overhead when debug is OFF.

## What changed

### Task 1 — Tap pino logs into the DebugEventBus
- New `bus-log-stream.ts`: `levelLabel(level)` (pino 10..60 → trace..fatal, `lvl<N>` fallback) + `createBusLogStream(bus)` — a minimal `{ write(chunk) }` multistream sink that JSON-parses each already-redacted NDJSON pino line and `bus.push({ direction:'log', type:'log.<level>', sessionId: parsed.sessionId ?? null, seq:null, summary: parsed.msg ?? '', payload: parsed })`. Parse + push wrapped in try/catch — a malformed line never crashes logging.
- `server.ts`: `DebugEventBus` creation hoisted BEFORE `Fastify(...)`. `LOGGER_REDACT` extracted as a shared const. When `isDebugEnabled()`, the logger is a `pino` INSTANCE with `pino.multistream([{ stream: pino.destination(1) }, { level: EVF_DEBUG_LOG_LEVEL ?? 'info', stream: createBusLogStream(bus) }])` passed via Fastify 5's `loggerInstance`. When OFF, the original inline `logger` config object is preserved byte-identical. The SAME bus instance is shared by the logger tap, `registerDebugRoutes`, the inbound tap, and the `onEmit` hook.
- New optional env `EVF_DEBUG_LOG_LEVEL` (default `'info'`) documented in the server.ts env docblock; gates the bus stream's min level independent of stdout `LOG_LEVEL`.

### Task 2 — Enrich GET /debug/state
- `debug-event-bus.ts`: added O(1) `get size()` and `byDirection()` (O(n) over the bounded buffer, seeds all 5 directions at 0). JSDoc both.
- `debug-routes.ts` `/debug/state`: per-session `age_ms` (`Date.now()-createdAt`) + `lastSeq`; top-level `ts`, `uptime_sec` (`Math.floor(process.uptime())`), `debug:{ eventBufferSize, byDirection }`; caches replaced booleans with `{ spell:{populated,count}, entity:{populated,count} }` (each cache read once, never dumping entries). `replayBuffer:{size}` + `tokenCache:{size}` retained; tokenCache hits/misses intentionally omitted with code comment. All tokens stay redacted to `tokenHint`.

## TDD RED → GREEN

| Task | RED commit | GREEN commit | RED failure observed |
|------|-----------|--------------|----------------------|
| 1 | `2676fbf` test(bridge) | `1406957` feat(bridge) | bus-log-stream module not found; enabled-mode `app.log.warn` produced no `/debug/events` log event |
| 2 | `e5963b5` test(bridge) | `2c86d4c` feat(bridge) | 7 failing: DebugEventBus.size/byDirection absent; `/debug/state` missing age_ms/uptime_sec/ts/debug.byDirection/cache counts |

## Redaction confirmation
- bus-log-stream unit test: `logger.info({ token:'evf_live_…', bearer:'bearer-…' }, 'auth')` → serialized bus event contains neither secret (pino redact + bus structural W-4 scrub = double safety).
- server integration test: `app.log.info({ token: LEAK, bearer: LEAK }, 'auth-attempt')` with debug ON → `/debug/events?direction=log` response body does not contain the raw secret.
- `/debug/state` tests: raw session token (`supersecrettoken_abcdef123456`) never present; only `tokenHint` (≤9 chars incl. ellipsis).

## Gates (all green)
- `pnpm typecheck` → exit 0 (workspace-wide).
- `pnpm lint:ci` → 0 errors (292 pre-existing warnings unchanged).
- `pnpm --filter @evf/bridge test` → 377 passed.
- `pnpm test:coverage` → 2815 passed (baseline 2798 + 17 new); 91.76% lines / 80.78% branch — above the 80% gate.
- `pnpm changeset:status` → @evf/bridge bumped (patch changeset added).

## Invariants
- **CI Gate 8 (socketlib = 17):** unchanged — no `foundry-module` file touched, no new socketlib handler.
- **ADR-0011:** `grep -rn "activity.use(" packages/bridge/src | grep -v '^\s*\*'` → empty. Bridge-only changes, no Foundry calls.
- **Backward-compat:** when `isDebugEnabled()` is false, the Fastify logger is the byte-identical inline config object (single `LOGGER_REDACT` const shared by both paths); no `'log'` direction events emitted; `/debug/*` routes absent (404). All pre-existing bridge tests pass.
- **shared-protocol:** untouched — `'log'` already in `DebugEventSchema`.

## Deviations from Plan
- **[Rule 3 — Blocking] Fastify 5 `loggerInstance` vs `logger`.** The plan specified passing the pino INSTANCE to `Fastify({ logger })`, but Fastify 5 rejects an instance there ("logger options only accepts a configuration object") — it requires `loggerInstance` for a pre-built instance. Fixed by using `loggerInstance` on the debug-ON path; the debug-OFF path keeps `logger:{config}` byte-identical.
- **[Rule 3 — Blocking] Union `app` type.** A ternary returning two `Fastify(...)` calls produced a union `FastifyInstance` type that broke every downstream `app.register(...)` under `exactOptionalPropertyTypes`. Fixed by computing a single `Pick<FastifyServerOptions,'logger'|'loggerInstance'>` value, then calling `Fastify()` once.

## Self-Check: PASSED
