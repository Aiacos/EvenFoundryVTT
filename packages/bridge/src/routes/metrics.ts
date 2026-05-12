/**
 * GET /metrics — Prometheus exposition endpoint.
 *
 * Returns all registered EVF metrics + Node.js default metrics in the
 * Prometheus text exposition format (version 0.0.4).
 *
 * No authentication required — standard Prometheus scrape convention.
 * **IMPORTANT**: In production, Docker Compose network policy (Plan 03-05)
 * MUST restrict bridge port 8910 to the internal scrape network. The
 * public-facing nginx/Caddy MUST NOT proxy /metrics (T-03-11).
 *
 * Content-Type: `registry.contentType` — resolves to
 * `'text/plain; version=0.0.4; charset=utf-8'` for prom-client v15.
 *
 * @see packages/bridge/src/metrics/registry.ts (metric definitions)
 * @see T-03-11 (production network policy requirement)
 * @see Specs.md §5.2 (Prometheus metrics endpoint)
 */

import type { FastifyInstance } from 'fastify';
import type { Registry } from 'prom-client';

/**
 * Register the GET /metrics Prometheus scrape endpoint.
 *
 * @param app      - Fastify instance to register the route on.
 * @param registry - The prom-client Registry to expose (per-server instance).
 */
export async function registerMetricsRoute(
  app: FastifyInstance,
  registry: Registry,
): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    const text = await registry.metrics();
    return reply.status(200).header('Content-Type', registry.contentType).send(text);
  });
}
