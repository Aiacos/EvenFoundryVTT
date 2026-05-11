/**
 * Fastify server factory for the EVF bridge.
 *
 * Exported as a factory function (not started) for test isolation.
 * Tests call `buildServer()` and use `.inject()` for HTTP routes.
 *
 * Plugin registration order (matters for Fastify):
 * 1. pino logger with security redact list (T-02-01)
 * 2. @fastify/cors — origin whitelist from env (D-2.19)
 * 3. @fastify/rate-limit — 100 req/min per IP
 * 4. @fastify/websocket — WS support
 * 5. HTTP routes: /v1/health, /v1/i18n/:lang, /v1/tools
 * 6. WS route: / (handshake)
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
import { registerHealthRoute } from './routes/health.js';
import { registerI18nRoute } from './routes/i18n.js';
import { registerToolsRoute } from './routes/tools.js';
import { handleHandshake } from './ws/handshake.js';
import { ReplayBuffer } from './ws/replay-buffer.js';
import { SessionStore } from './ws/session-store.js';

export interface BuildServerOptions {
  /** Inject a custom Foundry validation function (for testing). */
  foundryValidateFn?: FoundryValidateFn;
  /** Override lang directory path (for testing i18n routes). */
  langDirOverride?: string;
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
      // T-02-01: bearer tokens must NEVER appear in logs
      redact: ['token', 'bearer', 'headers.authorization', '*.token', '*.bearer'],
    },
  });

  // --- 1. CORS ---
  // TODO (#42): pin EVF_PLUGIN_HOST_URL in production — wildcard only for dev
  const pluginHostUrl = process.env.EVF_PLUGIN_HOST_URL;
  await app.register(cors, {
    origin: pluginHostUrl ?? true,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  // --- 2. Rate limit ---
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // --- 3. WebSocket support ---
  await app.register(fastifyWebsocket);

  // --- 4. Shared services (singletons per server instance) ---
  const tokenCache = new TokenCache(opts.foundryValidateFn);
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();

  // --- 5. HTTP routes ---
  await registerHealthRoute(app, tokenCache);
  await registerI18nRoute(app, opts.langDirOverride);
  await registerToolsRoute(app, tokenCache);

  // --- 6. WS handshake route ---
  app.get('/ws', { websocket: true }, (socket, req) => {
    // handleHandshake is async; errors are caught internally and close the socket
    // Cast app.log to pino Logger — Fastify's BaseLogger is a strict subset of pino's Logger
    void handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, app.log as Logger);
  });

  return app;
}
