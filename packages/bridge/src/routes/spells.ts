/**
 * GET /v1/spells/available — Available spell vocabulary route.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 2).
 *
 * Returns the cached `AvailableSpellsPayload` populated by the Foundry module's
 * `spell-pack-reader.ts` via the `r1.spells.available` envelope push path.
 *
 * Auth: Bearer token (same as Phase 7 tool endpoints — validated via TokenCache).
 * Only authenticated foundry-mcp clients should access this endpoint.
 *
 * Responses:
 * - 200 + `AvailableSpellsPayload` JSON — cache warm (Foundry module has pushed vocab)
 * - 200 + `{ entries: [], source: 'empty', count: 0, generatedAt: 0 }` — cache cold
 * - 401 `invalid_token` — token missing or invalid
 *
 * ## Cold cache
 *
 * When the bridge starts before the Foundry module has pushed its first vocabulary
 * envelope, the cache is cold. The route returns a valid `AvailableSpellsPayload`
 * with `source: 'empty'` and `count: 0` (not a 204 or 404) so foundry-mcp can
 * detect "no data yet" and fall back to the static SPELL_LOOKUP table.
 *
 * @see packages/bridge/src/cache/spell-pack-cache.ts (SpellPackCache)
 * @see packages/bridge/src/ws/spell-pack-handler.ts (cache writer)
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts (consumer)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 2
 */

import type { AvailableSpellsPayload } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { SpellPackCache } from '../cache/spell-pack-cache.js';

/** Cold-cache sentinel response returned when no push has been received yet. */
const COLD_CACHE_RESPONSE: AvailableSpellsPayload = {
  entries: [],
  source: 'empty',
  count: 0,
  generatedAt: 0,
};

/**
 * Register the GET /v1/spells/available route.
 *
 * @param app        - Fastify instance
 * @param tokenCache - Shared token validation cache
 * @param spellCache - SpellPackCache singleton (populated by spell-pack-handler.ts)
 */
export async function registerSpellsRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  spellCache: SpellPackCache,
): Promise<void> {
  app.get('/v1/spells/available', async (request, reply) => {
    // --- Auth (same pattern as Phase 7 tool endpoints) ---
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
    const payload = spellCache.get() ?? COLD_CACHE_RESPONSE;
    return reply.status(200).send(payload);
  });
}
