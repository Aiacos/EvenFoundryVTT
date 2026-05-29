---
'@evf/bridge': patch
---

Quick Task 260529-icd — Debug Console V2 (two additive, dev-gated bridge enhancements).

**1. Tap pino logs into the DebugEventBus (`direction: 'log'`):**

- New `src/debug/bus-log-stream.ts`: an in-process pino multistream sink whose
  `write()` JSON-parses each already-redacted NDJSON line and pushes a
  `direction: 'log'` `DebugEvent` (`type: 'log.<level>'`, `summary = msg`,
  `sessionId`, full parsed payload). `levelLabel()` maps pino 10..60 →
  trace..fatal (`lvl<N>` fallback). A defensive try/catch guarantees a malformed
  line never crashes logging.
- `server.ts`: the `DebugEventBus` is now created BEFORE `Fastify(...)`. When
  `isDebugEnabled()`, the logger is a `pino` INSTANCE driven by
  `pino.multistream([stdout, busSink])` (a multistream, NOT a transport — a
  transport runs in a worker thread that cannot reach the in-process bus) passed
  via `loggerInstance`. When OFF, the original inline logger config object is
  preserved byte-identical. The redact list is extracted to a single
  `LOGGER_REDACT` const so both paths redact identically. New optional env
  `EVF_DEBUG_LOG_LEVEL` (default `'info'`) gates the bus stream's min level
  independently of stdout `LOG_LEVEL`.

**2. Enrich `GET /debug/state`:**

- `DebugEventBus` gains an O(1) `size` getter and a `byDirection()` summary
  (counts per `inbound|outbound|tool|log|display`, all seeded at 0).
- `/debug/state` now returns per-session `age_ms` (`Date.now() - createdAt`)
  alongside `lastSeq`; top-level `ts`, `uptime_sec` (`process.uptime()`), and
  `debug: { eventBufferSize, byDirection }`; caches as
  `{ populated, count }` summaries (each cache read once, never dumping entries).
  All tokens stay redacted to `tokenHint`. tokenCache hits/misses are
  intentionally omitted (prom-client Counters, not cheaply readable).

No `@evf/shared-protocol` change — `'log'` already exists in `DebugEventSchema`.
ADR-0011 unaffected (bridge-only, no `activity.use`); CI Gate 8 socketlib count
unchanged (no new handler).
