/**
 * GET /v1/characters — Player character list route.
 *
 * Returns all player character actors from the Foundry world, used by the
 * pairing wizard Step 3 (character selection on the G2 app).
 *
 * Auth: Bearer token (validated via TokenCache).
 *
 * Query params:
 * - `world` (string, optional) — world ID filter (for multi-world environments)
 *
 * Responses:
 * - 200 + `{ characters: Array<{ actorId, name, level }> }` — character list
 * - 401 `invalid_token`                                       — token missing or invalid
 * - 503 `foundry_unreachable`                                 — Foundry not reachable
 *
 * @see packages/foundry-module/src/readers/character-reader.ts (listPlayerCharacters)
 * @see 02-CONTEXT.md D-2.14 wizard Step 3
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isActorAuthorized } from '../auth/actor-authorization.js';
import { isDevNoAuth } from '../auth/is-dev-no-auth.js';
import type { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';

/** Schema for a single character list entry. */
const CharacterListEntrySchema = z.object({
  actorId: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(1).max(20),
});

/** DEV-ONLY mock roster served when {@link isDevNoAuth} is active and no world is connected. */
const DEV_MOCK_CHARACTERS = [
  { actorId: 'dev-pc-1', name: 'Aelar Brightwood (DEV)', level: 5 },
  { actorId: 'dev-pc-2', name: 'Lyra Stormborn (DEV)', level: 3 },
] as const;

/** Schema for the full character list response. */
const CharacterListResponseSchema = z.object({
  characters: z.array(CharacterListEntrySchema),
});

/**
 * Register the GET /v1/characters route.
 *
 * @param app        - Fastify instance
 * @param tokenCache  - Shared token validation cache
 * @param foundryFn  - Injected socketlib call for testability
 */
export async function registerCharactersListRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  foundryFn: FoundrySnapshotFn,
): Promise<void> {
  app.get<{ Querystring: { world?: string } }>('/v1/characters', async (request, reply) => {
    // --- Auth ---
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

    // --- Fetch character list via socketlib GM handler ---
    const worldId = request.query.world ?? '';
    let result: unknown;
    try {
      result = await foundryFn('evf.listCharacters', worldId, token);
    } catch {
      result = null;
    }

    // DEV-ONLY: with the auth bypass active there is usually no Foundry behind the
    // bridge, so the list is empty. Serve a small mock roster so the wizard's Step 3
    // is exercisable end-to-end without a live world. Never reached in prod.
    if (isDevNoAuth() && (!Array.isArray(result) || result.length === 0)) {
      result = DEV_MOCK_CHARACTERS;
    }

    // --- Validate shape ---
    const parsed = CharacterListResponseSchema.safeParse({ characters: result ?? [] });
    if (!parsed.success) {
      app.log.warn({ error: parsed.error.message }, 'Character list schema mismatch');
      return reply.status(200).send({ characters: [] });
    }

    // --- Per-actor read authorization (ADR-0014 §4) ---
    // Scope the roster to the bearer's authorized (owned) set so a device only
    // ever sees its paired user's characters. Fail-closed: absent/empty set →
    // empty roster. (isActorAuthorized bypasses under the dev-no-auth gate so
    // the DEV mock roster still surfaces end-to-end.)
    const scoped = parsed.data.characters.filter((c) =>
      isActorAuthorized(validation.authorizedActorIds, c.actorId),
    );

    return reply.status(200).send({ characters: scoped });
  });
}
