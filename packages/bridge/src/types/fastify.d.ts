/**
 * Module augmentation for FastifyRequest — EVF-specific fields.
 *
 * Uses explicit `T | undefined` unions, NOT `?: T`, because
 * `exactOptionalPropertyTypes: true` in tsconfig.base.json rejects assigning
 * `undefined` to `?: T` fields (Pitfall 9 — Phase 03 RESEARCH).
 *
 * This single `.d.ts` file is the canonical augmentation point for the bridge
 * package. Adding new fields here avoids cross-plan merge conflicts.
 *
 * @see packages/bridge/src/middleware/idempotency.ts (sets idempotencyKey + idempotencyBodyHash)
 * @see Plan 03-03 (will set evfStartTime for HTTP-duration histogram)
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The raw `Idempotency-Key` header value for this request.
     *
     * Set by the idempotency preHandler when:
     * - request.method === 'POST'
     * - header is present and non-empty
     * - URL does not start with `/internal/`
     * - No existing cache entry for this key (i.e. NEW key path only).
     *
     * Remains `undefined` for:
     * - Non-POST requests
     * - Requests without an `Idempotency-Key` header
     * - Internal routes (`/internal/*`)
     * - Replay hits (preHandler short-circuits; onSend guard checks this)
     *
     * @see middleware/idempotency.ts
     */
    idempotencyKey: string | undefined;

    /**
     * SHA-256 hex digest of `JSON.stringify(request.body ?? null)`.
     *
     * Computed once in the preHandler and reused in the onSend hook
     * to avoid double-hashing. Undefined in all the same cases as
     * `idempotencyKey`.
     *
     * @see middleware/idempotency.ts
     */
    idempotencyBodyHash: string | undefined;

    /**
     * Unix timestamp (ms) captured at the start of request processing.
     *
     * Reserved for Plan 03-03 HTTP-duration histogram hook. Declared here
     * to keep all augmentations in a single file and prevent merge conflicts
     * when 03-03 lands in parallel.
     *
     * @see Plan 03-03 (metrics + Prometheus histograms)
     */
    evfStartTime: number | undefined;
  }
}
