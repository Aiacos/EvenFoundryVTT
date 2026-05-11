/**
 * GET /v1/events — Event log cursor-pagination route.
 *
 * Returns ring-buffer entries with `seq > since`, up to `limit` (max 200).
 * Designed for REST-side event log catch-up when the WS connection is lost
 * beyond the 60s replay buffer window.
 *
 * Auth: Bearer token (validated via TokenCache).
 *
 * Query params:
 * - `since`  (number, default 0)   — cursor; returns entries with seq > since
 * - `limit`  (number, default 200) — max entries per page; capped at 200
 *
 * Responses:
 * - 200 + `{ entries: EventLogEntry[], cursor: number }` — entries since cursor
 * - 401 `invalid_token`                                  — token missing or invalid
 * - 503 `foundry_unreachable`                            — Foundry not reachable
 *
 * @see packages/foundry-module/src/readers/event-log-reader.ts (ring buffer, 200 cap)
 * @see packages/shared-protocol/src/payloads/event.ts (EventLogEntry)
 */

import { EventLogResponseSchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';

/** Maximum entries returned per request — mirrors the ring buffer capacity. */
const MAX_LIMIT = 200;

/**
 * Register the GET /v1/events route.
 *
 * @param app        - Fastify instance
 * @param tokenCache  - Shared token validation cache
 * @param foundryFn  - Injected socketlib call for testability
 */
export async function registerEventsRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  foundryFn: FoundrySnapshotFn,
): Promise<void> {
  app.get<{ Querystring: { since?: string; limit?: string } }>(
    '/v1/events',
    async (request, reply) => {
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

      // --- Parse query params ---
      const since = Math.max(0, Number(request.query.since ?? 0));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(request.query.limit ?? MAX_LIMIT)));

      // --- Fetch entries via socketlib GM handler ---
      const result = await foundryFn('evf.getEventLog', since, limit, token);

      // --- Validate shape ---
      const parsed = EventLogResponseSchema.safeParse(result);
      if (!parsed.success) {
        app.log.warn({ error: parsed.error.message }, 'Event log response schema mismatch');
        return reply.status(200).send({ entries: [], cursor: since });
      }

      return reply.status(200).send(parsed.data);
    },
  );
}
