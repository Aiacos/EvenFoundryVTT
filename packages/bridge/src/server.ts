/**
 * Fastify server factory for the EVF bridge.
 *
 * Exported as a factory function (not started) for test isolation.
 * Tests call `buildServer()` and use `.inject()` for HTTP routes.
 *
 * Plugin registration order (matters for Fastify):
 * 1. pino logger with security redact list (T-02-01 + T-03-07)
 * 2. @fastify/cors — origin whitelist from env (D-2.19)
 * 3. @fastify/rate-limit — 100 req/min per bearer token (falls back to IP)
 * 4. @fastify/websocket — WS support
 * 4a. Idempotency middleware — preHandler+onSend hooks (ADR-0002, Plan 03-02)
 * 4b. HTTP duration hooks — onRequest + onResponse for Prometheus histogram (Plan 03-03)
 * 5. Ops routes (no auth): /healthz, /readyz, /metrics
 * 6. HTTP routes: /v1/health, /v1/i18n/:lang, /v1/tools
 * 7. Reader REST routes: /v1/character/:actorId, /v1/combat/current, /v1/scene/viewport,
 *    /v1/events, /v1/characters
 * 7a. Portrait proxy route: GET /v1/portrait/:actorId (Plan 13-03 — STRETCH-06)
 * 8. Internal route: POST /internal/delta (module → bridge delta push)
 * 9. WS route: /ws (handshake)
 * 10. Voice audio stream route: /v1/audio/stream (Phase 12 Deepgram STT)
 *
 * @see Specs.md §5.2 (Bridge stack)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.12
 */

// Quick Task 260517-k2g — entity-pack vocabulary route + cache + handler (parallel additive
// pipeline to spell-pack). The /internal/delta onDelta callback multiplexes BOTH handlers
// so r1.spells.available and r1.entities.available envelopes are routed to their caches.
import { SPELL_KEYTERMS } from '@evf/shared-protocol';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { Registry } from 'prom-client';
import type { FoundryValidateFn } from './auth/token-cache.js';
import { TokenCache } from './auth/token-cache.js';
import { EntityPackCache } from './cache/entity-pack-cache.js';
import { SpellPackCache } from './cache/spell-pack-cache.js';
import { createMetricsRegistry } from './metrics/registry.js';
import { IdempotencyStore, registerIdempotencyHooks } from './middleware/idempotency.js';
import { PortraitCache } from './portrait/portrait-cache.js';
import { createPortraitRenderer } from './portrait/portrait-renderer.js';
import type { FoundrySnapshotFn } from './routes/character.js';
import { registerCharacterRoute } from './routes/character.js';
import { registerCharactersListRoute } from './routes/characters-list.js';
import { registerCombatRoute } from './routes/combat.js';
import { registerEntitiesRoute } from './routes/entities.js';
import { registerEventsRoute } from './routes/events.js';
import { registerHealthRoute } from './routes/health.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { registerI18nRoute } from './routes/i18n.js';
import { registerInternalDeltaRoute } from './routes/internal-delta.js';
import { registerMetricsRoute } from './routes/metrics.js';
import { registerPortraitRoute } from './routes/portrait.js';
import { registerReadyzRoute } from './routes/readyz.js';
import { registerSceneRoute } from './routes/scene.js';
import { registerSpellsRoute } from './routes/spells.js';
import { registerToolsRoute } from './routes/tools.js';
import type { ToolHandler } from './routes/tools-dispatch.js';
import { registerAudioStreamRoute } from './voice/audio-stream-route.js';
import { createDeepgramStt } from './voice/deepgram-stt.js';
// Phase 15 Plan 02 — Deepgram Keyterm Prompting (VOICE-06): bridge feeds the merger
// output (SPELL_KEYTERMS ∪ EntityPackCache snapshot) as Deepgram session keyterms.
import { buildKeytermList } from './voice/keyterm-merger.js';
import { KeytermRefresher } from './voice/keyterm-refresher.js';
import { DeltaEmitter } from './ws/delta-emitter.js';
import { handleEntityPackEnvelope } from './ws/entity-pack-handler.js';
import { handleHandshake } from './ws/handshake.js';
import { ReplayBuffer } from './ws/replay-buffer.js';
import { handleResume } from './ws/resume.js';
import { SessionStore } from './ws/session-store.js';
import { handleSpellPackEnvelope } from './ws/spell-pack-handler.js';
import { type DispatchToolFn, handleToolInvoke } from './ws/tool-invoke.js';

export interface BuildServerOptions {
  /** Inject a custom Foundry validation function (for testing). */
  foundryValidateFn?: FoundryValidateFn;
  /** Override lang directory path (for testing i18n routes). */
  langDirOverride?: string;
  /**
   * Inject a custom Foundry snapshot function for reader route testing.
   *
   * In production: real socketlib executeAsGM wrapper.
   * In tests: mock returning fixture data directly.
   */
  foundrySnapshotFn?: FoundrySnapshotFn;
  /**
   * Inject a custom IdempotencyStore for test isolation.
   *
   * In production: a fresh `IdempotencyStore` is created per `buildServer()` call.
   * In tests: pass an existing store to observe its state after requests.
   *
   * @see middleware/idempotency.ts
   */
  idempotencyStore?: IdempotencyStore;
  /**
   * Inject a custom prom-client Registry for test isolation (Pitfall 2 — T-03-10).
   *
   * In production: `createMetricsRegistry()` creates a fresh Registry per call.
   * In tests: pass an existing Registry to inspect metric values after requests,
   *   or rely on the default fresh Registry to avoid cross-test global collisions.
   *
   * @see metrics/registry.ts
   */
  metricsRegistry?: Registry;
  /**
   * Inject per-tool dispatch handler overrides for test isolation (Plan 03-04).
   *
   * In production: pass `undefined` — `TOOL_DISPATCH_TABLE` defaults apply.
   * In tests: override individual `ToolName` entries with `vi.fn()` spies to
   *   assert dispatch call counts and verify idempotency dedup (test 9 in tools.test.ts).
   *
   * @see routes/tools-dispatch.ts
   */
  toolDispatchOverride?: Partial<Record<import('@evf/shared-protocol').ToolName, ToolHandler>>;
  /**
   * Inject a custom WS tool dispatch function for test isolation (CR-01).
   *
   * In production: pass `undefined` — the default no-op stub is used (Phase 7 stub;
   * real socketlib wiring lands in Phase 8 once the foundry-module socket is plumbed).
   * In tests: pass a `vi.fn()` spy to assert `tool.invoke` envelopes are routed
   * to this function with the correct payload and bearer.
   *
   * @see ws/tool-invoke.ts (handleToolInvoke consumer)
   */
  wsDispatchToolFn?: DispatchToolFn;
  /**
   * Inject a custom SpellPackCache for test isolation (Quick Task 20260517).
   *
   * In production: a fresh `SpellPackCache` is created per `buildServer()` call.
   * In tests: pass an existing cache to pre-populate it or observe its state
   * after spell-pack envelope processing.
   *
   * @see cache/spell-pack-cache.ts
   * @see routes/spells.ts
   */
  spellCache?: SpellPackCache;
  /**
   * Inject a custom EntityPackCache for test isolation (Quick Task 260517-k2g).
   *
   * In production: a fresh `EntityPackCache` is created per `buildServer()` call.
   * In tests: pass an existing cache to pre-populate it or observe its state
   * after entity-pack envelope processing.
   *
   * Parallel additive to `spellCache` — both caches are populated by the same
   * `/internal/delta` push channel via multiplexed handlers.
   *
   * @see cache/entity-pack-cache.ts
   * @see routes/entities.ts
   */
  entityCache?: EntityPackCache;
}

/**
 * Build and return a configured Fastify instance.
 *
 * Does NOT start the server — caller must call `.listen()`.
 * Tests use `.inject()` directly.
 */
export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // T-02-01: bearer tokens + internal secrets must NEVER appear in logs.
      // T-03-07: idempotency-key must also be redacted to prevent accidental
      //   logging of client-supplied intent identifiers.
      // T-12-02 (Plan 12-03): Deepgram API key must never appear in logs.
      //   4 field paths cover the expected log call shapes: deepgramKey, apiKey,
      //   *.deepgramKey (nested objects), *.apiKey (nested objects).
      redact: [
        'apiKey',
        'bearer',
        'deepgramKey',
        'EVF_INTERNAL_SECRET',
        'headers.authorization',
        'headers.idempotency-key',
        'token',
        '*.apiKey',
        '*.bearer',
        '*.deepgramKey',
        '*.token',
      ],
    },
  });

  // --- 1. CORS ---
  // EVF_PLUGIN_HOST_URL must be set in production (Specs.md §3.3 — no wildcard origins).
  // Dev fallback is 'http://localhost:5173' (Vite default). Never use `true` (allow-all).
  // TODO (#42): enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint.
  const pluginHostUrl = process.env.EVF_PLUGIN_HOST_URL ?? 'http://localhost:5173';
  await app.register(cors, {
    origin: pluginHostUrl,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
  });

  // --- 2. Rate limit ---
  // Per-token limiting: key on the bearer token from Authorization header so that
  // a compromised token can be rate-limited independently from others on the same LAN IP.
  // Falls back to IP if no Authorization header is present (e.g. /v1/health).
  // TODO (#44): lower max to 60 req/min once Phase 3 action endpoints land.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers.authorization?.slice(7) ?? req.ip ?? 'unknown',
  });

  // --- 3. WebSocket support ---
  await app.register(fastifyWebsocket);

  // --- 4. Shared services (singletons per server instance) ---
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const deltaEmitter = new DeltaEmitter(replayBuffer, sessionStore);
  // Use injected store for test isolation; production creates a fresh instance.
  const idempotencyStore = opts.idempotencyStore ?? new IdempotencyStore();

  // --- 4a. Metrics registry (per-server-instance, Pitfall 2 — T-03-10) ---
  // Create AFTER idempotencyStore and replayBuffer so the accessors can
  // capture live sizes. Fresh Registry per call — no global Registry collision.
  const metrics = createMetricsRegistry(
    {
      replayBufferSize: () => replayBuffer.size(),
      idempotencyStoreSize: () => idempotencyStore.size,
    },
    opts.metricsRegistry,
  );

  // --- 4b. Token cache (with metrics hooks) ---
  const tokenCache = new TokenCache(opts.foundryValidateFn, {
    onHit: () => metrics.tokenCacheHitsTotal.inc(),
    onMiss: () => metrics.tokenCacheMissesTotal.inc(),
  });

  // Default no-op snapshot fn — production passes the real socketlib wrapper via opts
  const foundryFn: FoundrySnapshotFn =
    // biome-ignore lint/suspicious/noExplicitAny: FoundrySnapshotFn return type is any (socketlib untyped)
    opts.foundrySnapshotFn ?? (async (_h: string, ..._a: unknown[]): Promise<any> => null);

  // --- 4c. Idempotency middleware ---
  // Must be registered BEFORE route registration so the preHandler+onSend hooks
  // intercept all POST requests. Pass onDedup to increment the dedup counter (Plan 03-03).
  await registerIdempotencyHooks(app, idempotencyStore, {
    onDedup: () => metrics.idempotencyDedupTotal.inc(),
  });

  // --- 4d. HTTP duration histogram hooks (T-03-09 label allowlist) ---
  // onRequest: capture start timestamp on the request object.
  // onResponse: compute duration, observe with bounded labels only (method, route pattern, status_code).
  app.addHook('onRequest', async (request) => {
    request.evfStartTime = Date.now();
  });
  app.addHook('onResponse', async (request, reply) => {
    if (request.evfStartTime === undefined) return;
    const duration = (Date.now() - request.evfStartTime) / 1000;
    // Use Fastify route URL pattern (e.g. /v1/tools/:name), NOT the resolved URL.
    // This keeps cardinality bounded to the number of registered routes — T-03-09.
    const route = request.routeOptions?.url ?? 'unknown';
    metrics.httpRequestDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      duration,
    );
  });

  // --- 5. Ops routes (no auth — k8s probe + Prometheus scrape convention) ---
  // Registered BEFORE bearer-auth routes so probes are reachable even if a later
  // route registration fails (Fastify registers in declaration order).
  await registerHealthzRoute(app);
  await registerReadyzRoute(app);
  await registerMetricsRoute(app, metrics.registry);

  // --- 6. HTTP routes ---
  await registerHealthRoute(app, tokenCache);
  await registerI18nRoute(app, opts.langDirOverride);
  await registerToolsRoute(app, tokenCache, opts.toolDispatchOverride);

  // --- 7. Reader REST routes ---
  await registerCharacterRoute(app, tokenCache, foundryFn);
  await registerCombatRoute(app, tokenCache, foundryFn);
  await registerSceneRoute(app, tokenCache, foundryFn);
  await registerEventsRoute(app, tokenCache, foundryFn);
  await registerCharactersListRoute(app, tokenCache, foundryFn);

  // --- 7a. Portrait proxy route (Plan 13-03 — STRETCH-06) ---
  // GET /v1/portrait/:actorId — fetches, dithers (Floyd-Steinberg 16-step greyscale),
  // and caches a 100×60 4-bit PNG for the player's actor portrait.
  // T-13-02: URL validation + SSRF deny-list + allowedHosts enforcement.
  // T-13-03: SHA-256(resolvedURL) as cache key; actor ownership checked via foundrySnapshotFn.
  // D-13-07: emits r1.portrait.ready WS push via deltaEmitter on cache miss.
  const portraitCache = new PortraitCache({ maxEntries: 32, ttlMs: 60 * 60 * 1000 });
  const portraitRenderer = createPortraitRenderer({ logger: app.log as Logger });
  const portraitAllowedHosts = process.env['EVF_FOUNDRY_ORIGIN_HOST']
    ? [process.env['EVF_FOUNDRY_ORIGIN_HOST']]
    : [];
  await registerPortraitRoute({
    app,
    tokenCache,
    foundrySnapshotFn: foundryFn,
    portraitCache,
    portraitRenderer,
    allowedHosts: portraitAllowedHosts,
    deltaEmitter,
  });

  // --- 7b. Spell vocabulary route (Quick Task 20260517) ---
  // GET /v1/spells/available — returns cached AvailableSpellsPayload or cold-cache sentinel.
  // Cache is populated by handleSpellPackEnvelope (wired to /internal/delta onDelta hook below).
  // Bearer auth same pattern as Phase 7 tool endpoints.
  const spellCache = opts.spellCache ?? new SpellPackCache();
  await registerSpellsRoute(app, tokenCache, spellCache);

  // --- 7c. Entity vocabulary route (Quick Task 260517-k2g) ---
  // GET /v1/entities/available — returns cached AvailableEntitiesPayload or cold-cache sentinel.
  // Parallel additive to /v1/spells/available; covers non-spell Items + Actors (npc/vehicle).
  // Cache is populated by handleEntityPackEnvelope (wired to /internal/delta onDelta hook below).
  // Bearer auth same pattern as Phase 7 tool endpoints + /v1/spells/available.
  const entityCache = opts.entityCache ?? new EntityPackCache();
  await registerEntitiesRoute(app, tokenCache, entityCache);

  // --- 8. Internal delta route (module → bridge push) ---
  // onDelta hook: multiplexed dispatch — intercept r1.spells.available AND r1.entities.available
  // envelopes to update their respective caches BEFORE fan-out. Each handler returns false when
  // its type does not match, so calling both in sequence is safe and order-independent.
  await registerInternalDeltaRoute(app, deltaEmitter, (type, payload) => {
    handleSpellPackEnvelope(type, payload, spellCache);
    handleEntityPackEnvelope(type, payload, entityCache);
  });

  // --- 9. WS handshake route ---
  // Wires handshake → registerSession → message-loop → close-cleanup. This is
  // the production wiring that closes the Phase 02 latent gap where deltaEmitter
  // never received any session registrations (#03-01 RESEARCH §1).
  // metrics.wsSessionsActive is instrumented inline: inc on registerSession, dec on close.

  // CR-01: WS tool.invoke dispatch function.
  // Production default: Phase 7 stub returning 'phase-07-pending' until the Foundry
  // socketlib socket is plumbed in Phase 8. Tests inject a vi.fn() spy via wsDispatchToolFn.
  const wsDispatchFn: DispatchToolFn =
    opts.wsDispatchToolFn ??
    (async (_payload, _bearer) => ({
      success: false,
      error: 'phase-07-stub: real socketlib wiring pending Phase 8',
    }));

  app.get('/ws', { websocket: true }, (socket, req) => {
    const logger = app.log as Logger;
    // handleHandshake is async and returns sessionId | null. Errors are caught
    // internally and close the socket — we just await for the resolved sessionId.
    handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, logger)
      .then((sessionId) => {
        if (sessionId === null) {
          // Handshake rejected; handleHandshake already closed the socket.
          return;
        }
        // T-03-01 wiring: every accepted handshake must register with the emitter
        // so deltas from /internal/delta reach this client. Phase 02's tests
        // injected this Map directly — production never wired it, so live deltas
        // were silently dropped.
        deltaEmitter.registerSession(sessionId, socket);
        // Instrument: increment WS sessions gauge on successful registration.
        metrics.wsSessionsActive.inc();

        // Message router: each handler is responsible for its own envelope type.
        // handleResume processes 'client_resume'; handleToolInvoke processes 'tool.invoke'.
        // Both no-op on unrecognised input — ordering does not matter.
        socket.on('message', (rawData) => {
          handleResume(socket, sessionId, replayBuffer, rawData, logger);
          void handleToolInvoke(socket, sessionId, sessionStore, wsDispatchFn, rawData, logger);
        });

        // Close cleanup: undo every per-session registration so the bridge frees
        // resources promptly. Each unregister/delete is idempotent.
        socket.on('close', () => {
          deltaEmitter.unregisterSession(sessionId);
          sessionStore.deleteSession(sessionId);
          replayBuffer.clearSession(sessionId);
          // Instrument: decrement WS sessions gauge when the connection closes.
          metrics.wsSessionsActive.dec();
        });
      })
      .catch((err) => {
        // handleHandshake catches its own errors, so this should never fire.
        // Defensive log to surface any unhandled rejection during development.
        logger.error({ err }, 'WS handshake: unexpected promise rejection');
      });
  });

  // --- 10. Voice audio stream route (Phase 12 Plan 12-03 + Phase 15 Plan 15-02) ---
  // Mounts /v1/audio/stream — bearer-validated WS endpoint that pipes G2 PCM
  // frames to Deepgram Nova-3 Multilingual and fans VoiceTranscript envelopes
  // via the existing DeltaEmitter. Soft-fail: if DEEPGRAM_API_KEY is not set,
  // the adapter is disabled and the route closes incoming WS with 1011.
  //
  // urlOverride: EVF_DEEPGRAM_URL_OVERRIDE is injected so integration tests can
  // point the adapter at a local mock Deepgram server without hitting api.deepgram.com.
  //
  // # VOICE-06 / VOICE-07 / VOICE-08 wiring (Phase 15 Plan 15-02)
  //
  // keytermProvider is a closure capturing the entityCache reference from step 7c
  // above (Quick Task 260517-k2g). It calls buildKeytermList(SPELL_KEYTERMS, snapshot)
  // lazily on every Deepgram connect() — the merger returns the deduped union of
  // 70 SRD spells (static, IT+EN) plus the dynamic entity-pack snapshot (items /
  // weapons / armor / NPCs / monsters, name + nameLocalized), capped at 100.
  //
  // VOICE-06: keyterm= URL param wired (deepgram-stt.ts URL builder).
  // VOICE-07: static spells ∪ dynamic entity-pack (merger).
  // VOICE-08: both IT and EN locales in a single Nova-3 Multilingual session
  //           (existing language=multi URL param unchanged).
  //
  // # CONTEXT D-09 — invariant preserved
  //
  // NO new socketlib handler is registered. The entityCache is fed by the existing
  // /internal/delta multiplex handler at step 8 above (handleEntityPackEnvelope).
  // CI Gate 8 — socketlib registerComplexHandler count = 17 — is unaffected.
  //
  // # Hot-update freshness model
  //
  // The keyterm callback is invoked lazily on each connect() — there is NO caching
  // at the adapter layer. The entityCache itself is the cache. Plan 15-02 covers
  // connect-time freshness; mid-session refresh is plan 15-03's KeytermRefresher
  // (instantiated at step 10b below).
  //
  // # Phase 15 Plan 04 — richer return shape (CONTEXT D-05)
  //
  // The provider returns the `{ keyterms, entityCachePresent }` object form so
  // the adapter can drive the one-shot empty-cache warning (D-05). When the
  // Foundry module has not yet pushed an entity-pack (`entityCache.get()` is
  // `null`), `entityCachePresent: false` triggers a single logger.warn with
  // `event: 'keyterm.empty-entity-cache'` per empty-streak. Subsequent connects
  // with the cache still empty do NOT re-emit. The flag resets after the cache
  // transitions to present, so a later return to empty fires the warn again.
  const deepgramSttOpts: Parameters<typeof createDeepgramStt>[0] = {
    apiKey: process.env['DEEPGRAM_API_KEY'],
    logger: app.log as Logger,
    keytermProvider: () => {
      const snapshot = entityCache.get();
      return {
        keyterms: buildKeytermList(SPELL_KEYTERMS, snapshot),
        entityCachePresent: snapshot !== null,
      };
    },
  };
  const deepgramUrlOverride = process.env['EVF_DEEPGRAM_URL_OVERRIDE'];
  if (deepgramUrlOverride !== undefined) {
    deepgramSttOpts.urlOverride = deepgramUrlOverride;
  }
  const deepgramStt = createDeepgramStt(deepgramSttOpts);
  await registerAudioStreamRoute({
    app,
    deltaEmitter,
    deepgramStt,
    tokenCache,
    logger: app.log as Logger,
  });

  // --- 10b. Phase 15 Plan 03 — VOICE-09 hot-update wiring ---
  //
  // KeytermRefresher subscribes to entityCache.onChange (Task 1 API) and
  // debounces multi-event bursts (DEBOUNCE_MS=250, CONTEXT D-07) before
  // invoking deepgramStt.refreshKeyterm() (Task 2 invalidation signal) under
  // a drain-then-restart mutex. The refresh path uses the EXISTING
  // /internal/delta multiplex via handleEntityPackEnvelope at step 8 above —
  // NO new socketlib handler is registered. CI Gate 8 — socketlib
  // registerComplexHandler count = 17 — is unaffected by this plan.
  //
  // The Deepgram WS protocol does NOT support mid-stream keyterm hot-swap;
  // refreshKeyterm() is an INVALIDATION SIGNAL, and the next connect() picks
  // up the fresh keyterm list via the lazy keytermProvider contract
  // (deepgram-stt.ts DGKT-05). VOICE-09's "≤ 5 minutes" SLA is naturally
  // satisfied because Deepgram sessions are short-lived (per-utterance
  // reconnects); a fresh connection within 5 minutes is the norm.
  //
  // The local reference is preserved so that future graceful-shutdown hooks
  // can call _keytermRefresher.dispose(). For now the bridge does not exit
  // gracefully — Docker SIGTERM is the only teardown path — so dispose()
  // is exercised only by Vitest tests.
  const _keytermRefresher = new KeytermRefresher({
    cache: entityCache,
    adapter: deepgramStt,
    logger: app.log as Logger,
  });
  void _keytermRefresher;

  return app;
}
