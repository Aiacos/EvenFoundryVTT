/**
 * GET /readyz — Kubernetes-style readiness probe.
 *
 * Returns 200 if `EVF_INTERNAL_SECRET` is set and non-empty (bridge is "ready"
 * to accept internal delta pushes from the Foundry module). Returns 503 otherwise.
 *
 * No authentication required (k8s convention — readiness probes run without auth).
 *
 * ## Why EVF_INTERNAL_SECRET?
 *
 * The bridge is not meaningfully "ready" unless the internal secret is configured
 * — without it, POST /internal/delta rejects every call with 401, making the
 * bridge unable to receive Foundry state updates. This is the minimum viable
 * readiness signal for Plan 03-05 Docker Compose `healthcheck:`.
 *
 * ## Threat model note (T-03-12)
 *
 * Returning `reason: 'EVF_INTERNAL_SECRET_missing'` reveals that the bridge
 * expects this env var. This is acceptable: the var NAME is not a secret; only
 * its VALUE is. k8s readiness probes are unauthenticated by design.
 *
 * ## Response shapes
 *
 * - 200: `{ status: 'ready' }` — bridge is ready to serve.
 * - 503: `{ status: 'not_ready', reason: 'EVF_INTERNAL_SECRET_missing' }` — bridge
 *   is running but not yet configured.
 *
 * @see packages/bridge/src/routes/healthz.ts (liveness probe — simpler)
 * @see packages/bridge/src/routes/health.ts (wizard endpoint — bearer-auth required)
 * @see Specs.md §5.2 (Bridge readiness requirement)
 */

import type { FastifyInstance } from 'fastify';

/**
 * Register the GET /readyz readiness probe route.
 *
 * @param app - Fastify instance to register the route on.
 */
export async function registerReadyzRoute(app: FastifyInstance): Promise<void> {
  app.get('/readyz', async (_req, reply) => {
    const secret = process.env.EVF_INTERNAL_SECRET;
    if (secret === undefined || secret.trim() === '') {
      return reply.status(503).send({
        status: 'not_ready',
        reason: 'EVF_INTERNAL_SECRET_missing',
      });
    }
    return reply.status(200).send({ status: 'ready' });
  });
}
