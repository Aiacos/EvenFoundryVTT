/**
 * GET /v1/entities/available — Available entity vocabulary route.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to /v1/spells/available).
 *
 * Returns the cached `AvailableEntitiesPayload` populated by the Foundry module's
 * `entity-pack-reader.ts` via the `r1.entities.available` envelope push path.
 *
 * Auth: Bearer token (same as Phase 7 tool endpoints — validated via TokenCache).
 * Only authenticated foundry-mcp clients should access this endpoint.
 *
 * Responses:
 * - 200 + `AvailableEntitiesPayload` JSON — cache warm (Foundry module has pushed vocab)
 * - 200 + `{ entries: [], source: 'empty', count: 0, generatedAt: 0 }` — cache cold
 * - 401 `invalid_token` — token missing or invalid
 * - 503 `foundry_unreachable` — Foundry side cannot validate the token right now
 *
 * ## Cold cache
 *
 * When the bridge starts before the Foundry module has pushed its first vocabulary
 * envelope, the cache is cold. The route returns a valid `AvailableEntitiesPayload`
 * with `source: 'empty'` and `count: 0` (not a 204 or 404) so foundry-mcp can
 * detect "no data yet" and return `null` to the caller (entity-pack has NO
 * offline static fallback, unlike spell-pack).
 *
 * @see packages/bridge/src/cache/entity-pack-cache.ts (EntityPackCache)
 * @see packages/bridge/src/ws/entity-pack-handler.ts (cache writer)
 * @see packages/foundry-mcp/src/voice/entity-lookup-foundry.ts (consumer)
 * @see packages/bridge/src/routes/spells.ts (sibling pipeline)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 2
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { EntityPackCache } from '../cache/entity-pack-cache.js';

/** Cold-cache sentinel response returned when no push has been received yet. */
const COLD_CACHE_RESPONSE: AvailableEntitiesPayload = {
  entries: [],
  source: 'empty',
  count: 0,
  generatedAt: 0,
};

/**
 * Register the GET /v1/entities/available route.
 *
 * @param app         - Fastify instance
 * @param tokenCache  - Shared token validation cache
 * @param entityCache - EntityPackCache singleton (populated by entity-pack-handler.ts)
 */
export async function registerEntitiesRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  entityCache: EntityPackCache,
): Promise<void> {
  app.get('/v1/entities/available', async (request, reply) => {
    // --- Auth (same pattern as Phase 7 tool endpoints + /v1/spells/available) ---
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }
    const token = authHeader.slice('Bearer '.length);
    const validation = await tokenCache.validate(token);
    if (!validation.valid) {
      if (validation.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    // --- Return cached payload (or cold-cache sentinel) ---
    const payload = entityCache.get() ?? COLD_CACHE_RESPONSE;
    return reply.status(200).send(payload);
  });
}
