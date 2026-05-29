---
phase: quick-260529-icd
plan: 01
type: execute
wave: 1
depends_on: []
quick_id: 260529-icd
branch: develop
files_modified:
  - packages/bridge/src/server.ts
  - packages/bridge/src/debug/debug-event-bus.ts
  - packages/bridge/src/debug/bus-log-stream.ts
  - packages/bridge/src/debug/bus-log-stream.test.ts
  - packages/bridge/src/debug/debug-routes.ts
  - packages/bridge/src/debug/debug-routes.test.ts
  - packages/bridge/src/server.test.ts
  - .changeset/(generated)
autonomous: true
requirements: [DEBUG-CONSOLE-V2]
must_haves:
  truths:
    - "When debug enabled, a pino log line surfaces as a 'log' direction DebugEvent in /debug/events + /debug/stream + dashboard"
    - "A logged secret (bearer/token) never appears in the resulting bus event"
    - "When debug disabled, logger writes stdout only, no bus log events, behavior byte-identical to current"
    - "GET /debug/state returns enriched fields (age_ms, uptime_sec, debug.byDirection, cache counts) with all tokens redacted"
  artifacts:
    - path: "packages/bridge/src/debug/bus-log-stream.ts"
      provides: "Writable bridging redacted pino NDJSON lines into the DebugEventBus as 'log' events"
    - path: "packages/bridge/src/debug/debug-event-bus.ts"
      provides: "size getter + byDirection counts summary"
  key_links:
    - from: "pino multistream (server.ts)"
      to: "debugBus.push direction:'log'"
      via: "busLogStream.write"
      pattern: "direction:.?'log'"
    - from: "server.ts buildServer"
      to: "DebugEventBus instance"
      via: "bus created BEFORE Fastify({logger}) so multistream can reference it"
      pattern: "new DebugEventBus"
---

<objective>
Two additive, dev-gated enhancements to the Debug Console (built in quick 260529-h5e):

1. Tap the bridge pino logger into the DebugEventBus as `direction:'log'` events (in-process pino multistream — NOT a transport, which runs in a worker thread and cannot reach the in-process bus).
2. Enrich `GET /debug/state` with cheap counts/summaries (age_ms, uptime_sec, per-session lastSeq, cache counts, debug.byDirection) keeping all tokens redacted.

Purpose: log lines become visible in the debug stream/dashboard; state snapshot becomes diagnostically useful — without touching prod behavior.
Output: bridge-only changes, gated by `isDebugEnabled()`; when OFF the logger is the current inline config (byte-identical) and `/debug/state` is absent.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- VERIFIED from codebase — executor uses these directly, no exploration needed. -->

server.ts:174-198 — current inline logger config (the OFF-path baseline; must stay byte-identical):
  Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info', redact: [ 'apiKey','bearer','deepgramKey','EVF_INTERNAL_SECRET','headers.authorization','headers.idempotency-key','token','*.apiKey','*.bearer','*.deepgramKey','*.token' ] } })

server.ts:236-257 — debug wiring exists today:
  const debugEnabled = isDebugEnabled();
  const debugBus = debugEnabled ? new DebugEventBus() : undefined;   // ← created AFTER Fastify({logger}); MUST move BEFORE for the log tap
  deltaEmitter.onEmit = (type,payload,seq) => debugBus.push({ ts, direction:'outbound', sessionId:null, type, seq, summary:type, payload });

server.ts:380-395 — registerDebugRoutes call passes the SAME debugBus + sessionStore/deltaEmitter/replayBuffer/tokenCache/spellCache/entityCache/metricsAccessors/dispatchToolFn.

debug-event-bus.ts — DebugEventBus.push(partial: Omit<DebugEvent,'id'>) returns redacted event; structural token redaction on push (W-4); has subscribe/query/clear/subscriberCount. NO size getter, NO byDirection counts yet (add them).

DebugEvent shape (shared-protocol/src/debug/debug-events.ts:40-46): { id, ts, direction: 'inbound'|'outbound'|'tool'|'log'|'display', sessionId, type, seq, summary, payload }. 'log' ALREADY in the enum → NO shared-protocol schema change.

debug-routes.ts:154-175 — current GET /debug/state handler (the enrichment target). Per-session map already redacts token → tokenHint (≤8 chars). tokenHint() helper at :114-117.

Session (session-store.ts:15-27): { sessionId, locale, caps, lastSeq, createdAt:number, token }. createdAt is epoch ms.
SessionStore: listSessions(), get size().
ReplayBuffer: size(): number, lastSeq(sessionId): number. NO per-session bufferedCount getter exposed → do NOT add new methods; use size() + per-session replayBuffer.lastSeq(s.sessionId) only.
TokenCache: get size(): number. (hits/misses live as prom-client Counters → NOT cheaply readable as a single value; OMIT + note.)
SpellPackCache.get(): AvailableSpellsPayload | null; payload has `.count` and `.entries`.
EntityPackCache.get(): AvailableEntitiesPayload | null; payload has `.count` and `.entries`.
metricsAccessors.connectionCount(): number.

pino numeric levels → labels: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tap pino logs into the DebugEventBus ('log' direction)</name>
  <files>packages/bridge/src/debug/bus-log-stream.ts, packages/bridge/src/debug/bus-log-stream.test.ts, packages/bridge/src/server.ts, packages/bridge/src/server.test.ts</files>
  <behavior>
    - Enabled: `logger.warn({ foo: 1 }, 'hello')` → a DebugEvent with direction 'log', type 'log.warn', summary 'hello', payload.foo === 1.
    - levelLabel mapping: 10→trace, 20→debug, 30→info, 40→warn, 50→error, 60→fatal; unknown numeric → 'log.lvl<N>'.
    - sessionId: parsed.sessionId ?? null; seq: null.
    - Redaction: `logger.info({ token: '<32-char-secret>', bearer: '<secret>' }, 'auth')` → the raw secret string never appears anywhere in the produced bus event (pino redact + bus structural redact = double safety).
    - Malformed/non-JSON line passed to busLogStream.write → no throw, no event (defensive try/catch swallows).
    - EVF_DEBUG_LOG_LEVEL (default 'info') sets the bus stream's MIN level independent of stdout LOG_LEVEL; a line below that level is not forwarded.
    - Disabled (isDebugEnabled() false): no bus log events; logger still logs to stdout; buildServer behavior unchanged (existing server tests stay green).
  </behavior>
  <action>
    Create `bus-log-stream.ts` exporting (a) `levelLabel(level: number): string` (the numeric→label map above, default `lvl<N>`), and (b) `createBusLogStream(bus: DebugEventBus): { write(chunk: string | Buffer): void }` — a minimal object-with-write sink (pino multistream accepts an object exposing `write`). On each chunk: coerce to string, `JSON.parse`, then `bus.push({ ts: Date.now(), direction: 'log', type: 'log.' + levelLabel(parsed.level), sessionId: parsed.sessionId ?? null, seq: null, summary: parsed.msg ?? '', payload: parsed })`. Wrap parse+push in try/catch — a malformed line MUST never crash logging. JSDoc the public surface (INV-4).

    In `server.ts`: MOVE the `debugBus` creation (currently at :237) to BEFORE the `Fastify(...)` call at :175 — the bus is dependency-free (ring buffer), so create `const debugEnabled = isDebugEnabled();` and `const debugBus = debugEnabled ? new DebugEventBus() : undefined;` at the top of buildServer. Then branch the logger construction:
      - debug OFF: `Fastify({ logger: { level, redact: [...] } })` — the EXACT current inline config object, byte-identical (do not refactor the redact array shape).
      - debug ON: build the logger INSTANCE explicitly with `pino` + `pino.multistream`: `const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: [...same list...] }, pino.multistream([{ stream: pino.destination(1) }, { level: process.env.EVF_DEBUG_LOG_LEVEL ?? 'info', stream: createBusLogStream(debugBus) }])); ` then `Fastify({ logger })`. Pass the SAME `debugBus` instance to the later `registerDebugRoutes` call (do NOT create a second bus). Remove the now-duplicate `debugBus` declaration at :237; keep the `onEmit` hook and `makeInboundTap` wiring referencing the hoisted bus.

    Import `pino` directly (it is a transitive dep via Fastify's logger; add as explicit `@evf/bridge` dependency if not already present — verify `pino` in packages/bridge/package.json, add at the CLAUDE.md-pinned 10.3.1 if missing). The redact list must be defined ONCE and reused by both branches (extract a `const LOGGER_REDACT = [...]` const so OFF/ON share identical paths — this keeps the OFF object byte-equivalent and avoids drift).

    Tests in `bus-log-stream.test.ts`: unit-test levelLabel + createBusLogStream by pushing into a real DebugEventBus and asserting the produced event shape, redaction, malformed-line safety, and min-level filtering (drive a real `pino` instance with the multistream and assert via the bus). In `server.test.ts`: add an enabled-mode test (set EVF flags, call `app.log.warn(...)`, GET /debug/events, assert a 'log.warn' event) and a disabled-mode regression assertion (no 'log' events; existing tests already cover stdout-only).
  </action>
  <verify>
    <automated>pnpm --filter @evf/bridge test -- src/debug/bus-log-stream.test.ts src/server.test.ts --run</automated>
  </verify>
  <done>Enabled: pino log → 'log.&lt;level&gt;' DebugEvent with correct summary/payload/sessionId; logged secret absent from event; malformed line no-crash; EVF_DEBUG_LOG_LEVEL gates min level. Disabled: byte-identical inline logger config, no bus log tap. RED commit then GREEN commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enrich GET /debug/state</name>
  <files>packages/bridge/src/debug/debug-event-bus.ts, packages/bridge/src/debug/debug-routes.ts, packages/bridge/src/debug/debug-routes.test.ts</files>
  <behavior>
    - debug-event-bus: `size` getter returns buffer length; `byDirection()` returns `{ inbound, outbound, tool, log, display }` integer counts summed over the buffer.
    - /debug/state per-session: each session object includes `age_ms` (number, = Date.now()-createdAt) and `lastSeq` (existing); token still redacted to tokenHint (no raw token anywhere in response).
    - /debug/state top-level: `uptime_sec` (= Math.floor(process.uptime())), `ts` (Date.now()), `debug: { eventBufferSize, byDirection }`.
    - /debug/state caches: `{ spell: { populated, count }, entity: { populated, count } }` where populated = get() !== null and count = payload?.count ?? 0 (NO full entries dumped).
    - /debug/state replayBuffer: `{ size }` total + per-session lastSeq surfaced via existing session.lastSeq (do NOT add a ReplayBuffer.bufferedCount method).
    - tokenCache: keep `{ size }`; OMIT hits/misses (prom-client Counters not cheaply readable as single values) — note in code comment.
  </behavior>
  <action>
    In `debug-event-bus.ts`: add `get size(): number { return this.buffer.length; }` and `byDirection(): Record<DebugEvent['direction'], number>` that reduces the buffer into the 5 direction counts (seed all 5 keys at 0). JSDoc both (INV-4). No DebugEvent schema change — 'log' is already in the enum.

    In `debug-routes.ts` GET /debug/state handler (:154-175): extend the existing redacted `sessions.map` to add `age_ms: Date.now() - s.createdAt` (keep tokenHint, lastSeq, createdAt, locale, caps). Replace `caches: { spell: bool, entity: bool }` with `{ spell: { populated: spellCache.get() !== null, count: spellCache.get()?.count ?? 0 }, entity: { populated: entityCache.get() !== null, count: entityCache.get()?.count ?? 0 } }` (call get() once into a local to avoid double reads). Add top-level `uptime_sec: Math.floor(process.uptime())`, `ts: Date.now()`, and `debug: { eventBufferSize: debugBus.size, byDirection: debugBus.byDirection() }`. Keep `replayBuffer: { size: replayBuffer.size() }`, `deltaEmitter`, `tokenCache: { size }`, `metrics`. Add a one-line comment that token-cache hits/misses are intentionally omitted (Counter, not cheaply readable). Keep the response small (counts/summaries only — never dump cache entries or payloads).
  </action>
  <verify>
    <automated>pnpm --filter @evf/bridge test -- src/debug/debug-routes.test.ts src/debug/debug-event-bus.test.ts --run</automated>
  </verify>
  <done>/debug/state returns age_ms per session, uptime_sec, ts, debug.byDirection reflecting pushed events, cache counts reflecting populated caches; no raw token anywhere; DebugEventBus.size + byDirection tested. RED then GREEN.</done>
</task>

</tasks>

<verification>
Full gate run (all must pass — baseline 2798 tests, expect delta = new bus-log-stream + state-enrichment tests):

```bash
pnpm typecheck
pnpm lint:ci
pnpm --filter @evf/bridge test --run
pnpm test:coverage   # workspace gate ≥80%
pnpm changeset:status
```

- CI Gate 8 (socketlib registerComplexHandler count = 17): UNTOUCHED — no new socketlib handler added. Verify no change:
  `grep -rc "registerComplexHandler" packages/foundry-module/src` (must be unchanged).
- ADR-0011: no `activity.use(` introduced (bridge-only, no Foundry calls):
  `grep -rn "activity.use(" packages/bridge/src | grep -v '^\s*\*'` (must be empty / doc-comment-only).
- Backward-compat: when `isDebugEnabled()` is false, the Fastify logger config is the byte-identical inline object — existing server.test.ts logger/redaction tests stay green; no 'log' direction events emitted.
- Changeset: patch bump for `@evf/bridge` ONLY (no shared-protocol change — 'log' direction pre-exists in DebugEventSchema). If DebugEvent schema is somehow touched, add @evf/shared-protocol patch too (it should NOT be).
</verification>

<success_criteria>
- Enhancement 1: enabled → pino lines appear as 'log.&lt;level&gt;' DebugEvents in /debug/events, /debug/stream, dashboard; secret never leaks; EVF_DEBUG_LOG_LEVEL gates min level; disabled → byte-identical inline logger, zero overhead.
- Enhancement 2: /debug/state enriched (age_ms, uptime_sec, ts, debug.byDirection, cache counts) with all tokens redacted; response stays small/fast.
- All gates green; Gate 8 = 17; ADR-0011 clean; INV-4 clean with JSDoc on new public surface; atomic Conventional Commits (TDD RED→GREEN per task); single @evf/bridge patch changeset.
</success_criteria>

<output>
Create `.planning/quick/260529-icd-debug-console-v2-tap-pino-logs-into-the-/260529-icd-SUMMARY.md` when done.
</output>
