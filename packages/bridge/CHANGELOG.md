# @evf/bridge

## 0.1.1

### Patch Changes

- 36aea7f: Retire the `long-press` R1 gesture (ADR-0012; GEST-01 / EXIT-01 / LIFE-01).

  Canonical Even Realities docs (`guides/input-events`, INV-2 re-verified 2026-05-31)
  confirm the complete hardware gesture set is **press / double-press / swipe-up /
  swipe-down only** — there is no long-press / duration-based input.

  - **GEST-01** — `long-press` removed from the wire enum (`R1GesturePayloadSchema`), the
    bridge gesture surface, the internal `R1Gesture` union, all 12 panels, the status-HUD
    hint chip (token `long=` → `qa=`, field `longPressLabel` → `quickActionLabel`), i18n
    keys, and tests. The Quick-Action menu now opens via **over-scroll** (swipe-up at the
    focused layer's top boundary) — new `Layer.isAtTopBoundary()` + the renamed
    `quick-action-overscroll-dispatcher`. Per-panel context actions remapped:
    `inventory`/`spellbook` Action Options → `tap`; `template-placement` cancel → `double-tap`.
  - **EXIT-01 / LIFE-03** — new `root-exit-dispatcher`: a `double-tap` on the bare map root
    calls `bridge.shutDownPageContainer(1)` (Mode 1 graceful exit dialog), satisfying the
    Even Hub app-submission requirement.
  - **LIFE-01** — INV-2 verification of the SDK lifecycle surface (`OsEventTypeList` 4/5/6 +
    `shutDownPageContainer`) documented in ADR-0012.

  `Specs.md` §3.2/§7.13a/§7.14.x + ASCII mockups (INV-1), `README.md`, and the showcase were
  updated atomically (INV-3).

- Updated dependencies [36aea7f]
  - @evf/shared-protocol@0.2.0

## 0.1.0

### Minor Changes

- 0eaa5aa: Phase 2 Plan 04: Fastify bridge server with WS handshake, capability negotiation, 60s replay buffer, bearer token cache, and HTTP routes (/v1/health, /v1/i18n/:lang, /v1/tools stub). First real Zod schemas in shared-protocol (EnvelopeSchema, HandshakeClientSchema, HandshakeServerSchema).
- 7f5d0d1: Phase 2 Plan 05: Reader API + Foundry hooks + delta emitter

  - **@evf/shared-protocol**: Add Zod `strictObject` payload schemas for `CharacterSnapshot`, `CombatSnapshot`, `SceneViewport`, `EventLogEntry`, and `EventLogResponse`; re-export all from package index
  - **@evf/foundry-module**: Add `RingBuffer<T>` (200-entry, oldest-evict), character/combat/scene/event-log readers, `registerHookSubscribers()` for 5 Foundry hooks (updateActor, updateCombat, canvasReady, controlToken, createChatMessage, targetToken), `bridgeDeltaEmitter` fire-and-forget POST to bridge `/internal/delta`, extended socketlib GM handlers for all 5 snapshot reads
  - **@evf/bridge**: Add REST routes `GET /v1/character/:actorId`, `GET /v1/combat/current`, `GET /v1/scene/viewport`, `GET /v1/events`, `GET /v1/characters`; `POST /internal/delta` (EVF_INTERNAL_SECRET auth); `DeltaEmitter` WS fanout with capability routing and replay buffer integration

- a05f35e: Phase 03 Plan 01 — Bridge handshake wiring + WS resume protocol

  **Critical fix:** Phase 02 shipped a latent bug where `handleHandshake` returned
  `void` and the production code in `server.ts` never wired
  `deltaEmitter.registerSession`. Every delta emitted via `/internal/delta` was
  silently dropped in production because the emitter's `connections` map was
  always empty. Tests passed because they injected directly into the map.

  This change:

  - Promotes `handleHandshake` return type to `Promise<string | null>` so callers
    can wire the registration step.
  - In `server.ts`, every accepted handshake now calls
    `deltaEmitter.registerSession(sessionId, socket)` and registers a
    `socket.on('close', ...)` handler that unregisters from the emitter, deletes
    the session, and clears the replay buffer.
  - Adds `socket.on('message', ...)` that routes to the new resume handler
    (`@evf/bridge/ws/resume.ts`).

  **WS resume protocol (ADR-0002):**

  - `@evf/shared-protocol` exports `ClientResumeSchema`, `ResumeReplaySchema`,
    `ResumeFullSnapshotSchema`. ResumeReplay uses a leaner `count: N` header
    followed by N envelope frames (separate sends) instead of bundling all
    deltas inline — smaller individual frames, simpler client decoding.
  - `@evf/bridge/ws/replay-buffer.ts` adds `hasGap(sessionId, fromSeq)`. Returns
    true when buffered entries with seq > fromSeq are non-contiguous. Used to
    short-circuit replay attempts that would silently hide a gap.
  - `@evf/bridge/ws/resume.ts` implements the decision matrix: gap → full_snapshot
    with `reason: 'buffer_gap'`; empty → full_snapshot with `reason:
'buffer_expired'`; contiguous → header + envelope frames.

  No public API of `@evf/bridge` is removed. All existing endpoints continue to
  work identically. The signature change to `handleHandshake` is internal (only
  `server.ts` calls it).

- 40d3a52: Quick Task 260529-h5e — Debug Console (Waves 1-4: shared-protocol schemas + bridge backend + CRT dashboard + g2-app display-op mirror)

  Dev-only, gated observability + command system for the bridge.

  **@evf/shared-protocol (Wave 1):**

  - Add lean debug-console schemas under `src/debug/debug-events.ts`: `DebugEventSchema`,
    `DisplayOpPayloadSchema` (+ `R1_DEBUG_DISPLAYOP_TYPE`), `DebugInjectBodySchema`,
    `DebugDispatchBodySchema` (optional UUID `idempotencyKey`), `DebugGestureBodySchema`
    (reuses the canonical 5 R1 gesture kinds). All re-exported from the package barrel.

  **@evf/bridge (Wave 2):**

  - `isDebugEnabled()` existence gate (prod-safe double opt-in via `EVF_DEBUG` +
    `EVF_DEBUG_ALLOW_PROD`); when off, `/debug/*` routes are never registered (genuine 404).
  - `DebugEventBus` bounded ring buffer (push/query/subscribe/clear) with STRUCTURAL token
    redaction (scrubs known session tokens + token-shaped fields in summaries and nested payloads).
  - `registerDebugRoutes()` — 7 secret-gated endpoints (`/debug/state|events|inject|dispatch-tool|
simulate-gesture|displayop` + WS `/debug/stream`). `requireSecret` mirrors the timing-safe
    `secretsEqual` from `internal-delta.ts`. `/debug/dispatch-tool` routes through the SAME injected
    `dispatchToolFn` (ADR-0011 — no `activity.use` in the bridge; socketlib handler count unchanged)
    and generates a FRESH uuid per call when `idempotencyKey` is omitted.
  - Additive `DeltaEmitter.onEmit?` hook (default undefined = zero overhead) + gated WS inbound tap
    (`makeInboundTap`, no work per message when disabled). `SessionStore.listSessions()` added for
    the redacted snapshot.

  **@evf/bridge (Wave 3):**

  - Single-file phosphor-green CRT debug console dashboard, inlined as a TS string constant
    (`dashboard.ts`) so it survives the tsup bundle with no runtime asset resolution. Served at
    `GET /debug/console` (+ `/debug` alias), secret-gated: 200 `text/html` when enabled+authed,
    401 on bad secret, 404 when debug disabled. Live WS `/debug/stream` feed with direction/type/
    session filters, `/debug/state` poll panel, and inject/dispatch-tool/simulate-gesture forms.

  **@evf/g2-app (Wave 4):**

  - `DebugMirror` (`src/engine/debug-mirror.ts`) copies the PerfProbe zero-overhead pattern:
    `record()` is a hard no-op when disabled (no allocations, sink never called); when enabled it
    stamps `ts` and POSTs a `DisplayOpPayload` to the bridge `/debug/displayop` sink.
  - `LayerManager` gains an optional injected `debugMirror?` (default undefined ⇒ byte-identical to
    prior behavior — all existing tests pass unchanged). When present it records `mount`/`destroy`
    ops during a bundle and a `rebuild` (z-stack summary + container count) after `_flushPage()`.
  - Boot wiring (`boot-engine-core.ts`) constructs the mirror enabled ONLY under `?debug=true`
    (parallel to the perf-probe `?probe=true` opt-in); default off. The mirror POSTs to a debug HTTP
    endpoint — it never calls `activity.use` and adds no socketlib handler (ADR-0011; Gate 8 = 17).
    The live "what the glasses show" feed is hardware-deferred; software tests mock the POST sink.

### Patch Changes

- 23cbd44: Add RFC draft-ietf-httpapi-idempotency-key-header-04 idempotency middleware (Plan 03-02).

  - `IdempotencyStore`: in-memory 60s TTL Map with 10,000-entry LRU cap (ADR-0002, T-03-06).
  - `registerIdempotencyHooks`: Fastify `preHandler`+`onSend` pair; same key+same body → replay; same key+different body → 422; `/internal/*` excluded.
  - `FastifyRequest` augmented with `idempotencyKey`, `idempotencyBodyHash`, `evfStartTime` (reserved for Plan 03-03 metrics).
  - `Idempotency-Key` header added to pino redact list (T-03-07).
  - 10 unit + integration tests (all branches including TTL eviction, LRU overflow, exclusion rules).

- 99d1d0b: Add Prometheus metrics infrastructure and ops endpoints (Plan 03-03).

  - `prom-client@15.1.3` installed (direct — no `fastify-metrics` fork)
  - `createMetricsRegistry()` factory: fresh Registry per call (Pitfall 2 — T-03-10 verified)
  - 7 EVF metrics: HTTP duration histogram, WS sessions gauge, replay buffer gauge,
    idempotency store gauge, dedup counter, token cache hit/miss counters
  - GET /healthz liveness probe (always 200, no auth)
  - GET /readyz readiness probe (503 if EVF_INTERNAL_SECRET missing, no auth)
  - GET /metrics Prometheus scrape endpoint (no auth, plain text exposition)
  - Label cardinality budget enforced (method/route/status_code only — T-03-09)
  - TokenCache metricsHooks constructor arg for hit/miss instrumentation
  - Idempotency onDedup callback wired to evf_idempotency_dedup_total counter
  - WS session gauge increments on registerSession, decrements on close
  - Existing GET /v1/health (bearer-auth wizard endpoint) unchanged

- 6959c54: Implement ADR-0003 Tool Registry: 7 Zod-typed tools in @evf/shared-protocol (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets), GET /v1/tools returns full entries with Zod 4 native .toJSONSchema(), POST /v1/tools/:name dispatches via stub returning phase-07-pending (write path lands in Phase 07 per D-15). Foundry-module socketlib-handlers gains 7 stub registrations for Phase 07 wiring.
- 0908423: Production-ready bridge service: multi-stage node:24-alpine Dockerfile, Docker Compose orchestration (prod + dev overlay), real index.ts entrypoint with fail-fast startup guard for EVF_INTERNAL_SECRET in production. Replaces Phase 02 index.ts placeholder.
- 4d49f90: Fix 3 G2 SDK-conformance findings: portrait image-tile target (CRITICAL), audio-stream WS bearer auth for WKWebView (IMPORTANT), and R1 wire-kind provenance comment (INV-2).

  **B1 — CRITICAL (g2-app):** Portrait override in `map-base-layer.ts` was targeting `'map-capture'` (the TEXT capture container) with a non-existent `index` field hidden behind an `as unknown as` cast. Fixed to use a typed `ImageRawDataUpdate({ containerName: 'map-tile-${slot}', imageData: bytes })` targeting the correct IMAGE tile container, and check `ImageRawDataUpdateResult.isSuccess(result)` with a `console.warn` on failure. INV-4 cast removed.

  **B2 — IMPORTANT production bug (g2-app + bridge):** Browser/WKWebView WebSocket ignores the `headers` option — the bearer was silently dropped in production, causing close 1008 on every audio-stream WS upgrade. Fixed both sides: `audio-capture.ts` appends `?token=<encoded>` to the WS URL (with the Authorization header retained for the Node-ws test path); `audio-stream-route.ts` reads `?token=` as a header fallback, routing both through the same `tokenCache.validate` gate. Token is never logged. New test ASR-09 asserts query-param auth succeeds without an Authorization header.

  **B3 — INV-2 doc drift (g2-app):** `r1-event-source.ts` comment incorrectly attributed wire kinds to "flat string enums from the Even Hub SDK". Corrected to state they are the bridge's server-side-normalized strings mapped from `OsEventTypeList` + `EventSourceType.TOUCH_EVENT_FROM_RING`. Comment-only change.

- a3d8406: Internal/CI quality work — no external behavior change. Extract `bearerEquals` to a tested `foundry-mcp/src/security/bearer-equals.ts` helper (behavior-preserving import-swap), add real branch-coverage tests for `foundry-mcp` (bridge-client, logger) and `bridge` routes (scene/character/combat), and exclude un-instrumentable boot/worker files (`g2-app raster-worker.ts`, `foundry-mcp` boot `http.ts`/`index.ts`) from coverage. Also fixes `changeset:status` to compare against `origin/main` (CI runners have no local `main` ref).
- 08cd2e2: Quick Task 260529-icd — Debug Console V2 (two additive, dev-gated bridge enhancements).

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

- Updated dependencies [498c01f]
- Updated dependencies [0eaa5aa]
- Updated dependencies [7f5d0d1]
- Updated dependencies [a05f35e]
- Updated dependencies [6959c54]
- Updated dependencies [40d3a52]
- Updated dependencies [c80d16f]
  - @evf/shared-protocol@0.1.0
