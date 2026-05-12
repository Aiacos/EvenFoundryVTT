/**
 * GET /healthz — Kubernetes-style liveness probe.
 *
 * Always returns 200 if the process is alive and reachable. No authentication
 * required (k8s convention — probes run before any auth is available).
 *
 * Unlike `GET /v1/health` (Phase 02 wizard endpoint, bearer-auth required), this
 * route is designed for infra tooling (Docker Compose `healthcheck:`, k8s
 * `livenessProbe`, Prometheus scrape target health).
 *
 * Response shape: `{ status: 'ok', uptime_sec: number }`
 * - `uptime_sec`: seconds since the route file was first loaded (module-level
 *   timestamp captures the process-start approximation for this service).
 *
 * @see docs/architecture/0003-tool-registry-pattern.md
 * @see Specs.md §5.2 (Bridge healthcheck requirement)
 */

import type { FastifyInstance } from 'fastify';

/** Timestamp captured at module load — used for uptime_sec computation. */
const START_TIME = Date.now();

/**
 * Register the GET /healthz liveness probe route.
 *
 * @param app - Fastify instance to register the route on.
 */
export async function registerHealthzRoute(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime_sec: Math.floor((Date.now() - START_TIME) / 1000),
    });
  });
}
