/**
 * GET /v1/tools — ADR-0003 tool registry discovery endpoint.
 *
 * Returns an empty array in Phase 2. Phase 7 populates write tools
 * (cast_spell, weapon_attack, use_item, skill_check, etc.).
 *
 * Requires a valid bearer token.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see Specs.md §5.3 (Tool Registry definition)
 */
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';

/** ADR-0003: Tool registry discovery endpoint.
 *  Returns empty array in Phase 2; Phase 7 populates write tools. */
export async function registerToolsRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
): Promise<void> {
  app.get('/v1/tools', async (request, reply) => {
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

    // ADR-0003 stub: empty array until Phase 7 fills write tools.
    return reply.status(200).send({ tools: [] });
  });
}
