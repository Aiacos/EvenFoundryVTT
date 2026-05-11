/**
 * POST /internal/delta — Foundry-module → bridge delta push route.
 *
 * Receives a delta from the Foundry module's `bridgeDeltaEmitter` and fans it
 * out to all subscribed WS sessions with matching capabilities.
 *
 * Auth: `EVF_INTERNAL_SECRET` shared secret (NOT a bearer token).
 * The Foundry module reads this secret from bearer registry settings at pair time.
 * This is a server-to-server internal channel — never exposed to clients.
 *
 * Security:
 * - T-02-01: internal secret is redacted from pino logs (redact config in server.ts)
 * - TODO (#43): restrict /internal/delta to Docker internal network in production
 *
 * Body: `{ type: string, payload: unknown }` validated against DeltaEnvelopeSchema.
 *
 * Responses:
 * - 200 `{ ok: true }`     — delta accepted and fanned out
 * - 401 `unauthorized`     — missing or incorrect EVF_INTERNAL_SECRET
 * - 400 `invalid_body`     — body failed Zod validation
 *
 * @see packages/bridge/src/ws/delta-emitter.ts (DeltaEmitter.emitDelta)
 * @see packages/shared-protocol/src/envelope.ts (DeltaEnvelopeSchema)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DeltaEmitter } from '../ws/delta-emitter.js';

/** Schema for the POST /internal/delta request body. */
const InternalDeltaBodySchema = z.object({
  /** Delta type discriminant — e.g. "character.delta", "combat.turn" */
  type: z.string().min(1),
  /** Arbitrary serialisable delta payload — validated by capability-specific handlers. */
  payload: z.unknown(),
});

/**
 * Register the POST /internal/delta route.
 *
 * @param app          - Fastify instance
 * @param deltaEmitter  - Shared DeltaEmitter instance (created in server.ts)
 */
export async function registerInternalDeltaRoute(
  app: FastifyInstance,
  deltaEmitter: DeltaEmitter,
): Promise<void> {
  app.post('/internal/delta', async (request, reply) => {
    // --- Auth: EVF_INTERNAL_SECRET header check ---
    const internalSecret = process.env.EVF_INTERNAL_SECRET;
    const authHeader = request.headers.authorization;

    // Accept "Bearer <secret>" or raw "<secret>" for simplicity
    const providedSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;

    if (
      internalSecret === undefined ||
      internalSecret === '' ||
      providedSecret !== internalSecret
    ) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    // --- Validate body ---
    const parsed = InternalDeltaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }

    const { type, payload } = parsed.data;

    // --- Fan out to all subscribed WS sessions ---
    deltaEmitter.emitDelta(type, payload);

    return reply.status(200).send({ ok: true });
  });
}
