/**
 * EVF Bridge — production entrypoint.
 *
 * Replaces the Phase 02 placeholder. Boots the Fastify server on PORT (default 8910).
 *
 * Startup guard (T-03-17, T-03-21):
 * In NODE_ENV=production, EVF_INTERNAL_SECRET must be set and non-empty.
 * Failing fast at boot is preferable to a running container that 503s every /readyz request,
 * which would cause Docker to restart-loop indefinitely.
 *
 * @see packages/bridge/src/server.ts — buildServer() factory
 * @see deploy/bridge.Dockerfile — multi-stage build that produces dist/index.js
 * @see Specs.md §5.2 (Bridge stack) + §11.5.3 (Docker Compose homelab)
 */
import { buildServer } from './server.js';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const PORT = Number(process.env.PORT ?? 8910);

// Startup guard: fail fast in production if the internal secret is missing.
// console.error is intentional here — pino is not yet constructed at this point.
if (NODE_ENV === 'production') {
  const secret = process.env.EVF_INTERNAL_SECRET;
  if (secret === undefined || secret.trim() === '') {
    console.error(
      'FATAL: EVF_INTERNAL_SECRET must be set and non-empty in production — refusing to start.',
    );
    process.exit(1);
  }
}

const app = await buildServer({});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  // pino is available at this point — use the structured logger for bind failures.
  app.log.error({ err }, 'bridge failed to bind');
  process.exit(1);
}
