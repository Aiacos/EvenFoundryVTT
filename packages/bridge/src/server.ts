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
 * 11. Dev-only debug routes: /debug/* (Quick Task 260529-h5e) — registered ONLY when
 *     isDebugEnabled() (existence gate). Behind EVF_INTERNAL_SECRET (timing-safe).
 *     @see ./debug/agent-routes.ts (agent control channel — Quick Task 260604-cwa)
 *
 * Environment variables (debug backdoor — Quick Task 260529-h5e):
 *   - EVF_DEBUG='true'            — enable the /debug/* observability + command backend.
 *   - EVF_DEBUG_ALLOW_PROD='true' — REQUIRED double opt-in to enable debug in
 *                                    NODE_ENV=production (default prod = OFF regardless).
 *   - EVF_INTERNAL_SECRET         — reused as the debug auth secret (same as /internal/delta).
 *   - EVF_DEBUG_LOG_LEVEL         — (Quick Task 260529-icd) min pino level forwarded into
 *                                    the DebugEventBus 'log' tap (default 'info'). Independent
 *                                    of stdout LOG_LEVEL; only consulted when EVF_DEBUG is on.
 *
 * @see Specs.md §5.2 (Bridge stack)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.12
 */

// Quick Task 260517-k2g — entity-pack vocabulary route + cache + handler (parallel additive
// pipeline to spell-pack). The /internal/delta onDelta callback multiplexes BOTH handlers
// so r1.spells.available and r1.entities.available envelopes are routed to their caches.
// Quick Task 260604-eyf — bearer-registry + character-list push caches + handlers.
// BearerRegistryCache feeds internalValidateFn; CharacterListCache feeds internalSnapshotFn.
// Both multiplexed in the same /internal/delta onDelta callback (no new socketlib handler).
// Quick Task 260605-dog — character-snapshot cache + handler. CharacterSnapshotCache feeds
// internalSnapshotFn for evf.getCharacterSnapshot; populated by handleCharacterSnapshotEnvelope
// via the same /internal/delta fan-out. Closes the actor_not_found gap (GET /v1/character/:id).
import { SPELL_KEYTERMS } from '@evf/shared-protocol';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import pino, { type Logger } from 'pino';
import type { Registry } from 'prom-client';
import { DEV_NO_AUTH_SENTINEL, isDevNoAuth } from './auth/is-dev-no-auth.js';
import type { FoundryValidateFn } from './auth/token-cache.js';
import { TokenCache } from './auth/token-cache.js';
import { BearerRegistryCache } from './cache/bearer-registry-cache.js';
import { CharacterListCache } from './cache/character-list-cache.js';
import { CharacterSnapshotCache } from './cache/character-snapshot-cache.js';
import { EntityPackCache } from './cache/entity-pack-cache.js';
import { SpellPackCache } from './cache/spell-pack-cache.js';
import { AgentRegistry } from './debug/agent-registry.js';
import { registerAgentRoutes } from './debug/agent-routes.js';
import { createBusLogStream } from './debug/bus-log-stream.js';
import { DebugEventBus } from './debug/debug-event-bus.js';
import { registerDebugRoutes } from './debug/debug-routes.js';
import { makeInboundTap } from './debug/inbound-tap.js';
import { isDebugEnabled } from './debug/is-debug-enabled.js';
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
import { handleBearerRegistryEnvelope } from './ws/bearer-registry-handler.js';
import { handleCharacterListEnvelope } from './ws/character-list-handler.js';
import { handleCharacterSnapshotEnvelope } from './ws/character-snapshot-handler.js';
import { DeltaEmitter } from './ws/delta-emitter.js';
import { handleEntityPackEnvelope } from './ws/entity-pack-handler.js';
import { handleHandshake } from './ws/handshake.js';
import { pushInitialCharacterDelta } from './ws/initial-snapshot.js';
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
  /**
   * Inject a custom BearerRegistryCache for test isolation (Quick Task 260604-eyf).
   *
   * In production: a fresh `BearerRegistryCache` is created per `buildServer()` call.
   * The cache feeds the internal `foundryValidateFn` — token lookup without socketlib.
   * In tests: pass a pre-populated cache to assert `GET /v1/health` validation paths.
   *
   * `opts.foundryValidateFn` still overrides the internal validate fn when provided
   * (existing tests inject their own fn and must not be affected).
   *
   * @see cache/bearer-registry-cache.ts
   * @see ws/bearer-registry-handler.ts
   */
  bearerRegistryCache?: BearerRegistryCache;
  /**
   * Inject a custom CharacterListCache for test isolation (Quick Task 260604-eyf).
   *
   * In production: a fresh `CharacterListCache` is created per `buildServer()` call.
   * The cache feeds the internal `foundrySnapshotFn` for `GET /v1/characters`.
   * In tests: pass a pre-populated cache to assert characters are served from cache.
   *
   * `opts.foundrySnapshotFn` still overrides the internal snapshot fn when provided
   * (existing tests inject their own fn and must not be affected).
   *
   * @see cache/character-list-cache.ts
   * @see ws/character-list-handler.ts
   */
  characterListCache?: CharacterListCache;
  /**
   * Inject a custom CharacterSnapshotCache for test isolation (Quick Task 260605-dog).
   *
   * In production: a fresh `CharacterSnapshotCache` is created per `buildServer()` call.
   * Populated by `handleCharacterSnapshotEnvelope` via the `/internal/delta` push channel;
   * read back by `internalSnapshotFn` for `evf.getCharacterSnapshot` (backing
   * `GET /v1/character/:actorId` and the d0v on-connect initial push).
   *
   * @see cache/character-snapshot-cache.ts
   * @see ws/character-snapshot-handler.ts
   */
  characterSnapshotCache?: CharacterSnapshotCache;
}

/**
 * Build and return a configured Fastify instance.
 *
 * Does NOT start the server — caller must call `.listen()`.
 * Tests use `.inject()` directly.
 */
// Single source of truth for the pino redact list (T-02-01 / T-03-07 / T-12-02).
// Both the debug-OFF inline-config path and the debug-ON pino-instance path share
// this EXACT array so redaction is byte-identical regardless of debug mode — bearer
// tokens, internal secrets, idempotency keys, and Deepgram API keys never reach logs.
// The 4 Deepgram/apiKey paths cover top-level + nested (`*.`) log call shapes.
const LOGGER_REDACT = [
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
] as const;

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  // --- Debug bus (hoisted, Quick Task 260529-icd) ---
  // The DebugEventBus is dependency-free (a bounded ring buffer), so it is created
  // here — BEFORE Fastify — so the pino multistream log tap can reference the SAME
  // instance that registerDebugRoutes + the inbound/outbound taps use later.
  // W-2: capture the debug-enabled boolean ONCE; the WS loop must not re-read env.
  const debugEnabled = isDebugEnabled();
  const debugBus = debugEnabled ? new DebugEventBus() : undefined;

  const logLevel = process.env.LOG_LEVEL ?? 'info';
  // Build the Fastify logging option ONCE (single Fastify() call below) so `app` has
  // a single, uniform type. Two mutually-exclusive shapes:
  //   - Debug ON  → a pre-built pino INSTANCE via `loggerInstance` (Fastify 5 requires
  //                 `loggerInstance` for an instance; `logger` only accepts a config
  //                 object). The instance owns an in-process multistream: leg 1 = stdout
  //                 (fd 1, preserving normal logging), leg 2 = the DebugEventBus sink
  //                 gated by EVF_DEBUG_LOG_LEVEL (default 'info'). A multistream — NOT a
  //                 transport — is REQUIRED: a transport runs in a worker thread that
  //                 cannot reach the in-process bus. Redaction (LOGGER_REDACT) is applied
  //                 by the instance, byte-identical to the OFF path.
  //   - Debug OFF → the EXACT original inline `logger` config object (byte-identical).
  // T-02-01: bearer tokens + internal secrets must NEVER appear in logs.
  // T-03-07: idempotency-key must also be redacted.
  // T-12-02 (Plan 12-03): Deepgram API key must never appear in logs.
  const fastifyLogOpts: Pick<FastifyServerOptions, 'logger' | 'loggerInstance'> =
    debugEnabled && debugBus !== undefined
      ? {
          loggerInstance: pino(
            { level: logLevel, redact: [...LOGGER_REDACT] },
            pino.multistream([
              { stream: pino.destination(1) },
              {
                level: process.env.EVF_DEBUG_LOG_LEVEL ?? 'info',
                stream: createBusLogStream(debugBus) as unknown as pino.DestinationStream,
              },
            ]),
          ),
        }
      : { logger: { level: logLevel, redact: [...LOGGER_REDACT] } };
  const app = Fastify(fastifyLogOpts);

  // --- 1. CORS ---
  // EVF_PLUGIN_HOST_URL must be set in production (Specs.md §3.3 — no wildcard origins).
  // Dev fallback is 'http://localhost:5173' (Vite default). Never use `true` (allow-all).
  // TODO (#42): enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint.
  const pluginHostUrl = process.env.EVF_PLUGIN_HOST_URL ?? 'http://localhost:5173';
  // DEV-ONLY: when the bearer-auth bypass is active (EVF_DEV_NO_AUTH, never prod),
  // reflect any origin so a local Vite dev server / EvenHub simulator (whose origin
  // varies) can reach the bridge. Production keeps the strict single-origin whitelist.
  await app.register(cors, {
    origin: isDevNoAuth() ? true : pluginHostUrl,
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

  // --- 4 (debug). Dev-only observability taps (Quick Task 260529-h5e) ---
  // `debugEnabled` + `debugBus` are hoisted above (before Fastify) so the pino
  // multistream log tap (Quick Task 260529-icd) shares the SAME bus instance used
  // here for the WS inbound tap and the DeltaEmitter onEmit hook. When disabled, the
  // inbound tap is a no-op and the onEmit hook is never set — zero overhead.
  // makeInboundTap(false, …) returns a no-op fn ignoring the bus; only the enabled
  // branch ever touches it, so the placeholder bus when disabled is never used.
  const debugInboundTap = makeInboundTap(
    debugEnabled,
    debugBus ?? (undefined as unknown as DebugEventBus),
  );
  if (debugEnabled && debugBus !== undefined) {
    // outbound observability: set the additive onEmit hook ONLY in debug mode.
    deltaEmitter.onEmit = (type, payload, seq) => {
      debugBus.push({
        ts: Date.now(),
        direction: 'outbound',
        sessionId: null,
        type,
        seq,
        summary: type,
        payload,
      });
    };
  }

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

  // --- 4b-pre. Push caches (Quick Task 260604-eyf + Quick Task 260605-dog) ---
  // BearerRegistryCache: populated by handleBearerRegistryEnvelope (step 8).
  //   Feeds internalValidateFn below — token validation without socketlib roundtrip.
  // CharacterListCache: populated by handleCharacterListEnvelope (step 8).
  //   Feeds internalSnapshotFn below — /v1/characters served from cache.
  // CharacterSnapshotCache: populated by handleCharacterSnapshotEnvelope (step 8). (Quick Task 260605-dog)
  //   Feeds internalSnapshotFn for evf.getCharacterSnapshot — GET /v1/character/:actorId.
  //
  // Declared HERE (before TokenCache) so internalValidateFn below can close over them.
  // opts.bearerRegistryCache / opts.characterListCache / opts.characterSnapshotCache inject
  // pre-populated caches in tests.
  const bearerRegistryCache = opts.bearerRegistryCache ?? new BearerRegistryCache();
  const characterListCache = opts.characterListCache ?? new CharacterListCache();
  // Quick Task 260605-dog: per-actor snapshot cache; closed over by internalSnapshotFn below.
  const characterSnapshotCache = opts.characterSnapshotCache ?? new CharacterSnapshotCache();

  // Internal foundryValidateFn built from BearerRegistryCache (Quick Task 260604-eyf).
  //
  // Four-way result (T-RFP-03):
  //   - cache === null (never pushed)   → foundry_unreachable  (503)
  //   - token absent in pushed registry → unknown_token        (401)
  //   - token present but expired       → expired              (401)
  //   - token present + not expired     → valid                (200)
  //
  // opts.foundryValidateFn still overrides when provided — existing tests inject their
  // own fn and continue to work unchanged (backward-compatible).
  const internalValidateFn: FoundryValidateFn = async (token: string) => {
    const snapshot = bearerRegistryCache.get();
    if (snapshot === null) {
      // Module never connected — distinguish from bad token (T-RFP-03).
      return { valid: false, reason: 'foundry_unreachable' };
    }
    const entry = snapshot.bearers.find((b) => b.token === token);
    if (entry === undefined) {
      return { valid: false, reason: 'unknown_token' };
    }
    if (entry.expiresAt <= Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    return {
      valid: true,
      entry: { alias: entry.alias, expiresAt: entry.expiresAt, worldId: entry.worldId },
    };
  };

  // --- 4b. Token cache (with metrics hooks) ---
  // opts.foundryValidateFn overrides the internal cache-backed validate fn when provided.
  // Production buildServer({}) uses internalValidateFn (from BearerRegistryCache).
  // Tests inject their own foundryValidateFn to remain unaffected.
  const tokenCache = new TokenCache(opts.foundryValidateFn ?? internalValidateFn, {
    onHit: () => metrics.tokenCacheHitsTotal.inc(),
    onMiss: () => metrics.tokenCacheMissesTotal.inc(),
  });

  // Internal foundrySnapshotFn built from push caches (Quick Task 260604-eyf + 260605-dog).
  // Serves GET /v1/characters from CharacterListCache ('evf.listCharacters').
  // Serves GET /v1/character/:actorId from CharacterSnapshotCache ('evf.getCharacterSnapshot').
  // opts.foundrySnapshotFn overrides when provided (existing tests unchanged).
  //
  const internalSnapshotFn: FoundrySnapshotFn = async (
    handler: string,
    ...args: unknown[]
    // biome-ignore lint/suspicious/noExplicitAny: FoundrySnapshotFn return type is any (socketlib untyped)
  ): Promise<any> => {
    if (handler === 'evf.listCharacters') {
      return characterListCache.get()?.characters ?? [];
    }
    // Quick Task 260605-dog: serve cached snapshot for getCharacterSnapshot.
    // args[0] === actorId (see routes/character.ts line 52 + initial-snapshot.ts line 97).
    if (handler === 'evf.getCharacterSnapshot') {
      const actorId = args[0];
      return typeof actorId === 'string' ? (characterSnapshotCache.get(actorId) ?? null) : null;
    }
    return null;
  };

  // Default snapshot fn: opts.foundrySnapshotFn overrides when provided.
  // Production buildServer({}) uses internalSnapshotFn (from CharacterListCache).
  const foundryFn: FoundrySnapshotFn = opts.foundrySnapshotFn ?? internalSnapshotFn;

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
    // DEV-ONLY: inject a sentinel bearer for token-less requests so routes that
    // reject a missing Authorization header BEFORE calling TokenCache.validate
    // (e.g. /v1/health, /v1/characters) proceed; validate() then resolves it to a
    // synthetic dev session. Never active in prod (EVF_DEV_NO_AUTH + NODE_ENV gate).
    if (isDevNoAuth() && !request.headers.authorization?.startsWith('Bearer ')) {
      request.headers.authorization = `Bearer ${DEV_NO_AUTH_SENTINEL}`;
    }
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
  // onDelta hook: multiplexed dispatch — five envelope handlers, each returning false when
  // the type does not match. Order is irrelevant; all are safe to call unconditionally.
  //   - bearer-registry (r1.bearers.available)      → BearerRegistryCache → internalValidateFn
  //   - character-list (r1.characters.available)    → CharacterListCache  → evf.listCharacters
  //   - character-snapshot (character.delta)        → CharacterSnapshotCache → evf.getCharacterSnapshot (dog)
  //   - spell-pack (r1.spells.available)            → SpellPackCache      → /v1/spells/available
  //   - entity-pack (r1.entities.available)         → EntityPackCache     → /v1/entities/available
  await registerInternalDeltaRoute(app, deltaEmitter, (type, payload) => {
    handleBearerRegistryEnvelope(type, payload, bearerRegistryCache);
    handleCharacterListEnvelope(type, payload, characterListCache);
    handleCharacterSnapshotEnvelope(type, payload, characterSnapshotCache);
    handleSpellPackEnvelope(type, payload, spellCache);
    handleEntityPackEnvelope(type, payload, entityCache);
  });

  // --- 8 (debug). Dev-only debug routes (Quick Task 260529-h5e) ---
  // Registered ONLY behind isDebugEnabled() (existence gate — layer 1). When OFF,
  // the routes are literally absent → genuine 404 (NOT 403). Auth (layer 2) and
  // redaction (layer 3) live inside registerDebugRoutes / DebugEventBus.
  // ADR-0011: /debug/dispatch-tool reuses the SAME wsDispatchFn (declared below at
  // step 9). A late-bound ref lets us register here while the const is defined below;
  // dispatch only fires at request time, by which point the ref is populated.
  const debugDispatchRef: { fn: DispatchToolFn } = {
    fn: async () => ({ success: false, error: 'dispatch-fn-not-wired' }),
  };
  if (debugEnabled && debugBus !== undefined) {
    // Seed known tokens so the bus can structurally scrub them from summaries/payloads.
    debugBus.setKnownTokens(sessionStore.listSessions().map((s) => s.token));
    await registerDebugRoutes(app, {
      debugBus,
      sessionStore,
      deltaEmitter,
      replayBuffer,
      tokenCache,
      spellCache,
      entityCache,
      metricsAccessors: { connectionCount: () => deltaEmitter.connectionCount },
      // Lazily forward to the production dispatch fn declared at step 9.
      dispatchToolFn: (payload, bearer) => debugDispatchRef.fn(payload, bearer),
    });
    // Quick Task 260604-cwa: agent control channel routes.
    // WS /debug/agent + GET /debug/agents + POST /debug/cmd + GET /debug/logs.
    // Registered inside the SAME `if (debugEnabled && debugBus !== undefined)` block
    // so they are genuinely absent (404) when debug is off.
    const agentRegistry = new AgentRegistry();
    await registerAgentRoutes(app, { debugBus, agentRegistry });
  }

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

  // Late-bind the debug dispatch ref to the SAME production dispatch fn (ADR-0011).
  // /debug/dispatch-tool therefore routes identically to the WS tool.invoke path.
  debugDispatchRef.fn = wsDispatchFn;

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

        // On-connect initial push (Quick Task 260605-d0v): proactively send
        // character.delta for the first roster actor so the glasses HUD renders
        // real character data immediately on connect, without waiting for the
        // next Foundry-triggered delta.
        //
        // Fire-and-forget; error-safe. The session token is read from the store
        // (sessionStore.getSession returns undefined when the session was deleted
        // between handshake and this point — the empty-token fallback results
        // in the foundryFn returning null, which is a graceful no-op per IS-05).
        //
        // Quick Task 260605-dog: internalSnapshotFn now serves a cached snapshot
        // for 'evf.getCharacterSnapshot' when the module has pushed a character.delta
        // for the roster actor. It remains a graceful no-op while the cache is cold
        // (returns null → IS-05 path) until the first /internal/delta push arrives.
        const session = sessionStore.getSession(sessionId);
        // FLV-CHAR-SELECT: conditionally include selectedActorId so the initial push
        // serves the player's chosen PC instead of always roster[0]. Conditional spread
        // is required by exactOptionalPropertyTypes (cannot pass undefined explicitly).
        const initialPushArgs = {
          sessionId,
          token: session?.token ?? '',
          deltaEmitter,
          characterListCache,
          foundryFn,
          logger,
          ...(session?.selectedActorId !== undefined
            ? { selectedActorId: session.selectedActorId }
            : {}),
        };
        void pushInitialCharacterDelta(initialPushArgs).catch((err) => {
          logger.error({ err }, 'initial character.delta push failed');
        });

        // Message router: each handler is responsible for its own envelope type.
        // handleResume processes 'client_resume'; handleToolInvoke processes 'tool.invoke'.
        // Both no-op on unrecognised input — ordering does not matter.
        socket.on('message', (rawData) => {
          // W-2: inbound debug tap — a no-op fn when debug is disabled (zero work
          // per message: no JSON parse, no bus.push). debugEnabled was captured once
          // at buildServer time; this branch is the only per-message debug cost.
          if (debugEnabled) {
            debugInboundTap(sessionId, rawData);
          }
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
  //
  // # WR-03 — guard behind adapter.isEnabled()
  //
  // When DEEPGRAM_API_KEY is unset the Deepgram adapter is in disabled mode
  // and refreshKeyterm() is a logger.info call with no user-visible effect.
  // Instantiating KeytermRefresher in that state still subscribes to every
  // entityCache.onChange — i.e., every Foundry updateCompendium burst writes
  // a meaningless `keyterm.refreshed` info line for a feature that isn't
  // running. Skip instantiation entirely when the adapter is disabled so
  // ops dashboards reflect reality.
  let _keytermRefresher: KeytermRefresher | null = null;
  if (deepgramStt.isEnabled()) {
    _keytermRefresher = new KeytermRefresher({
      cache: entityCache,
      adapter: deepgramStt,
      logger: app.log as Logger,
    });
  }

  // --- 11. Graceful-shutdown hook (WR-04) ---
  //
  // Fastify's onClose hook fires from `app.close()` — production Docker
  // SIGTERM does not currently call this (the bridge exits abruptly), but
  // every test calls `app.close()` in afterEach. Wire the refresher's
  // dispose() so subscribers + pending debounce timers are torn down per
  // test instance. Previously, 67 buildServer() invocations each leaked
  // a KeytermRefresher subscription that was only freed once GC also
  // collected the Fastify app reference. With the hook the cleanup is
  // deterministic; the refresher dispose() is idempotent so calling
  // app.close() multiple times is safe.
  //
  // The hook also serves as the integration point for the future
  // graceful-shutdown PR (track via TODO in issue tracker): once SIGTERM
  // handling is added, it just needs to call `app.close()` and the
  // refresher tear-down is already wired.
  app.addHook('onClose', async () => {
    if (_keytermRefresher !== null) {
      _keytermRefresher.dispose();
      _keytermRefresher = null;
    }
  });

  return app;
}
