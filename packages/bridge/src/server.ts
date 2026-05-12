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
 * 8. Internal route: POST /internal/delta (module → bridge delta push)
 * 9. WS route: /ws (handshake)
 *
 * @see Specs.md §5.2 (Bridge stack)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.12
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { Registry } from 'prom-client';
import type { FoundryValidateFn } from './auth/token-cache.js';
import { TokenCache } from './auth/token-cache.js';
import { createMetricsRegistry } from './metrics/registry.js';
import { IdempotencyStore, registerIdempotencyHooks } from './middleware/idempotency.js';
import type { FoundrySnapshotFn } from './routes/character.js';
import { registerCharacterRoute } from './routes/character.js';
import { registerCharactersListRoute } from './routes/characters-list.js';
import { registerCombatRoute } from './routes/combat.js';
import { registerEventsRoute } from './routes/events.js';
import { registerHealthRoute } from './routes/health.js';
import { registerHealthzRoute } from './routes/healthz.js';
import { registerI18nRoute } from './routes/i18n.js';
import { registerInternalDeltaRoute } from './routes/internal-delta.js';
import { registerMetricsRoute } from './routes/metrics.js';
import { registerReadyzRoute } from './routes/readyz.js';
import { registerSceneRoute } from './routes/scene.js';
import { registerToolsRoute } from './routes/tools.js';
import type { ToolHandler } from './routes/tools-dispatch.js';
import { DeltaEmitter } from './ws/delta-emitter.js';
import { handleHandshake } from './ws/handshake.js';
import { ReplayBuffer } from './ws/replay-buffer.js';
import { handleResume } from './ws/resume.js';
import { SessionStore } from './ws/session-store.js';

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
      redact: [
        'token',
        'bearer',
        'headers.authorization',
        'headers.idempotency-key',
        '*.token',
        '*.bearer',
        'EVF_INTERNAL_SECRET',
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

  // --- 8. Internal delta route (module → bridge push) ---
  await registerInternalDeltaRoute(app, deltaEmitter);

  // --- 9. WS handshake route ---
  // Wires handshake → registerSession → message-loop → close-cleanup. This is
  // the production wiring that closes the Phase 02 latent gap where deltaEmitter
  // never received any session registrations (#03-01 RESEARCH §1).
  // metrics.wsSessionsActive is instrumented inline: inc on registerSession, dec on close.
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

        // Resume listener: only client_resume messages are recognised at this
        // protocol level. Other future message types route through their own
        // handlers (Phase 04+). handleResume itself is no-op on unrecognised input.
        socket.on('message', (rawData) => {
          handleResume(socket, sessionId, replayBuffer, rawData, logger);
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

  return app;
}
