/**
 * Fastify server factory for the EVF bridge.
 *
 * Exported as a factory function (not started) for test isolation.
 * Tests call `buildServer()` and use `.inject()` for HTTP routes.
 *
 * Plugin registration order (matters for Fastify):
 * 1. pino logger with security redact list (T-02-01)
 * 2. @fastify/cors — origin whitelist from env (D-2.19)
 * 3. @fastify/rate-limit — 100 req/min per bearer token (falls back to IP)
 * 4. @fastify/websocket — WS support
 * 5. HTTP routes: /v1/health, /v1/i18n/:lang, /v1/tools
 * 6. Reader REST routes: /v1/character/:actorId, /v1/combat/current, /v1/scene/viewport,
 *    /v1/events, /v1/characters
 * 7. Internal route: POST /internal/delta (module → bridge delta push)
 * 8. WS route: /ws (handshake)
 *
 * @see Specs.md §5.2 (Bridge stack)
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.12
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { FoundryValidateFn } from './auth/token-cache.js';
import { TokenCache } from './auth/token-cache.js';
import type { FoundrySnapshotFn } from './routes/character.js';
import { registerCharacterRoute } from './routes/character.js';
import { registerCharactersListRoute } from './routes/characters-list.js';
import { registerCombatRoute } from './routes/combat.js';
import { registerEventsRoute } from './routes/events.js';
import { registerHealthRoute } from './routes/health.js';
import { registerI18nRoute } from './routes/i18n.js';
import { registerInternalDeltaRoute } from './routes/internal-delta.js';
import { registerSceneRoute } from './routes/scene.js';
import { registerToolsRoute } from './routes/tools.js';
import { DeltaEmitter } from './ws/delta-emitter.js';
import { handleHandshake } from './ws/handshake.js';
import { ReplayBuffer } from './ws/replay-buffer.js';
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
      // T-02-01: bearer tokens + internal secrets must NEVER appear in logs
      redact: [
        'token',
        'bearer',
        'headers.authorization',
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
  const tokenCache = new TokenCache(opts.foundryValidateFn);
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const deltaEmitter = new DeltaEmitter(replayBuffer, sessionStore);

  // Default no-op snapshot fn — production passes the real socketlib wrapper via opts
  const foundryFn: FoundrySnapshotFn =
    // biome-ignore lint/suspicious/noExplicitAny: FoundrySnapshotFn return type is any (socketlib untyped)
    opts.foundrySnapshotFn ?? (async (_h: string, ..._a: unknown[]): Promise<any> => null);

  // --- 5. HTTP routes ---
  await registerHealthRoute(app, tokenCache);
  await registerI18nRoute(app, opts.langDirOverride);
  await registerToolsRoute(app, tokenCache);

  // --- 6. Reader REST routes ---
  await registerCharacterRoute(app, tokenCache, foundryFn);
  await registerCombatRoute(app, tokenCache, foundryFn);
  await registerSceneRoute(app, tokenCache, foundryFn);
  await registerEventsRoute(app, tokenCache, foundryFn);
  await registerCharactersListRoute(app, tokenCache, foundryFn);

  // --- 7. Internal delta route (module → bridge push) ---
  await registerInternalDeltaRoute(app, deltaEmitter);

  // --- 8. WS handshake route ---
  app.get('/ws', { websocket: true }, (socket, req) => {
    // handleHandshake is async; errors are caught internally and close the socket
    // Cast app.log to pino Logger — Fastify's BaseLogger is a strict subset of pino's Logger
    void handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, app.log as Logger);
  });

  return app;
}
