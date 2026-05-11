/**
 * GET /v1/combat/current — Combat snapshot route.
 *
 * Returns the current combat state (round, turn, combatants) from Foundry,
 * proxied via socketlib GM-side handler.
 *
 * Auth: Bearer token (validated via TokenCache).
 *
 * Responses:
 * - 200 + CombatSnapshot JSON  — active combat found
 * - 204 No Content             — no active combat
 * - 401 `invalid_token`        — token missing or invalid
 * - 503 `foundry_unreachable`  — Foundry not reachable
 *
 * @see packages/foundry-module/src/readers/combat-reader.ts
 * @see packages/shared-protocol/src/payloads/combat.ts
 */

import { CombatSnapshotSchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';

/**
 * Register the GET /v1/combat/current route.
 *
 * @param app        - Fastify instance
 * @param tokenCache  - Shared token validation cache
 * @param foundryFn  - Injected socketlib call for testability
 */
export async function registerCombatRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  foundryFn: FoundrySnapshotFn,
): Promise<void> {
  app.get('/v1/combat/current', async (request, reply) => {
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
    const snapshot = await foundryFn('evf.getCombatSnapshot', token);

    if (snapshot === null || snapshot === undefined) {
      // No active combat — 204 is the correct response (no body)
      return reply.status(204).send();
    }

    // --- Validate shape ---
    const parsed = CombatSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      app.log.warn({ error: parsed.error.message }, 'Combat snapshot schema mismatch');
      return reply.status(204).send();
    }

    return reply.status(200).send(parsed.data);
  });
}
