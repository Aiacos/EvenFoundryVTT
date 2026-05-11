/**
 * GET /v1/character/:actorId — Character snapshot route.
 *
 * Returns the current HP, AC, conditions, level, and other reader fields
 * for a Foundry actor, proxied via socketlib GM-side handler.
 *
 * Auth: Bearer token (validated via TokenCache).
 *
 * Responses:
 * - 200 + CharacterSnapshot JSON — actor found and is a PC
 * - 401 `invalid_token`          — token missing or invalid
 * - 404 `actor_not_found`        — actorId unknown or not a PC
 * - 503 `foundry_unreachable`    — Foundry not reachable
 *
 * @see packages/foundry-module/src/readers/character-reader.ts
 * @see packages/shared-protocol/src/payloads/character.ts
 */

import { CharacterSnapshotSchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';

/**
 * Register the GET /v1/character/:actorId route.
 *
 * @param app       - Fastify instance
 * @param tokenCache - Shared token validation cache
 * @param foundryFn - Injected socketlib call for testability (production: real executeAsGM)
 */
export async function registerCharacterRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  foundryFn: FoundrySnapshotFn,
): Promise<void> {
  app.get<{ Params: { actorId: string } }>('/v1/character/:actorId', async (request, reply) => {
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

    // --- Fetch snapshot via socketlib GM handler ---
    const { actorId } = request.params;
    const snapshot = await foundryFn('evf.getCharacterSnapshot', actorId, token);

    if (snapshot === null || snapshot === undefined) {
      return reply.status(404).send({ error: 'actor_not_found' });
    }

    // --- Validate shape before sending (Zod guards schema drift) ---
    const parsed = CharacterSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      // Log schema drift but respond as 404 — actor data is malformed/incomplete
      app.log.warn({ actorId, error: parsed.error.message }, 'Character snapshot schema mismatch');
      return reply.status(404).send({ error: 'actor_not_found' });
    }

    return reply.status(200).send(parsed.data);
  });
}

/**
 * Injected function type for Foundry socketlib calls.
 *
 * In production: wraps `socketlib.executeAsGM(handler, ...args)`.
 * In tests: returns mock data directly.
 *
 * @param handler - socketlib handler name (e.g. "evf.getCharacterSnapshot")
 * @param args    - handler arguments (actorId + token for snapshot reads)
 */
// biome-ignore lint/suspicious/noExplicitAny: socketlib returns untyped data
export type FoundrySnapshotFn = (handler: string, ...args: unknown[]) => Promise<any>;
