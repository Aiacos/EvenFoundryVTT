/**
 * GET /v1/health — bridge health endpoint.
 *
 * Requires a valid bearer token. Returns bridge status, protocol version,
 * and uptime in seconds.
 *
 * Error responses:
 * - 401 `invalid_token`   — token missing, malformed, or Foundry says invalid
 * - 503 `foundry_unreachable` — Foundry bridge is down and token cannot be validated
 *
 * @see Specs.md §5.2 (Bridge stack)
 */
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';

const START_TIME = Date.now();

/**
 * Register the GET /v1/health route on the given Fastify instance.
 *
 * @param app - Fastify instance
 * @param tokenCache - shared TokenCache instance (injected from server.ts)
 */
export async function registerHealthRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
): Promise<void> {
  app.get('/v1/health', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }

    const token = authHeader.slice('Bearer '.length);

    const result = await tokenCache.validate(token);

    if (!result.valid) {
      if (result.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    return reply.status(200).send({
      status: 'ok',
      proto: 'evf-v1',
      uptime_sec: Math.floor((Date.now() - START_TIME) / 1000),
    });
  });
}
