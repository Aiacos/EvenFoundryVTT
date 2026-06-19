/**
 * Tool reverse-channel internal routes — Phase 8 write channel.
 *
 * The GM-side Foundry module polls these to execute g2-app `tool.invoke` writes the
 * bridge cannot dispatch directly (no socketlib from the bridge). Mirrors the
 * `/internal/stream-request` poll pattern (auth + rate-limit exemption):
 *
 *   - `GET  /internal/tool-requests` → `{ requests: drainPending() }` — the module
 *     drains all pending invocations (each `{ requestId, payload, bearer }`) and
 *     dispatches them in GM context via the authoritative write path.
 *   - `POST /internal/tool-result`   body `{ requestId, result }` → resolves the
 *     awaiting bridge-side `tool.invoke` Promise. 200 `{ ok: true }` when a resolver
 *     was found; 404 `{ error: 'unknown_request' }` otherwise (already-timed-out or
 *     duplicate).
 *
 * Auth: the SAME `EVF_INTERNAL_SECRET` bearer the other `/internal/*` routes use
 * (server-to-server, never client-facing). Rate-limit EXEMPT (`rateLimit: false`)
 * like `/internal/delta` + `/internal/stream-request` — the module polls these on a
 * ~1s cadence, so a per-minute limiter would throttle the channel as collateral.
 *
 * @see packages/bridge/src/ws/tool-invocation-queue.ts (ToolInvocationQueue)
 * @see packages/bridge/src/routes/internal-delta.ts (auth + rateLimit:false pattern)
 * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts (the GM-side poller)
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ToolInvocationQueue } from '../ws/tool-invocation-queue.js';
import type { ToolInvokeResult } from '../ws/tool-invoke.js';

/**
 * Constant-time secret comparison (mirrors internal-delta.ts `secretsEqual`).
 *
 * `timingSafeEqual` requires equal-length Buffers; a length mismatch returns false
 * before the byte loop — acceptable, since length itself is not secret.
 */
function secretsEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Verify the request carries the configured `EVF_INTERNAL_SECRET` bearer.
 *
 * Accepts `Authorization: Bearer <secret>` or a raw `<secret>` header value (same
 * lenient parse as `/internal/delta` + `/internal/stream-request`).
 *
 * @param authHeader - The raw `Authorization` header value (may be undefined).
 * @returns `true` when the secret is configured and matches; `false` otherwise.
 */
function isInternalSecretValid(authHeader: string | undefined): boolean {
  const internalSecret = process.env.EVF_INTERNAL_SECRET;
  const provided = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : authHeader;
  return (
    internalSecret !== undefined &&
    internalSecret !== '' &&
    provided !== undefined &&
    secretsEqual(provided, internalSecret)
  );
}

/** Schema for the POST /internal/tool-result body. */
const ToolResultBodySchema = z.object({
  /** The queue request id echoed from GET /internal/tool-requests. */
  requestId: z.string().min(1),
  /** The GM-side ToolResult ({ success, data?, error? }). */
  result: z
    .object({
      success: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    })
    .strict(),
});

/**
 * Register the two tool reverse-channel internal routes.
 *
 * @param app   - Fastify instance.
 * @param queue - The shared {@link ToolInvocationQueue} (also fed by the WS dispatch fn).
 */
export async function registerToolChannelRoutes(
  app: FastifyInstance,
  queue: ToolInvocationQueue,
): Promise<void> {
  // GET /internal/tool-requests — the module drains all pending invocations to dispatch.
  app.get('/internal/tool-requests', { config: { rateLimit: false } }, async (request, reply) => {
    if (!isInternalSecretValid(request.headers.authorization)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    return reply.status(200).send({ requests: queue.drainPending() });
  });

  // POST /internal/tool-result — the module returns a dispatched invocation's result.
  app.post('/internal/tool-result', { config: { rateLimit: false } }, async (request, reply) => {
    if (!isInternalSecretValid(request.headers.authorization)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    const parsed = ToolResultBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }
    const { requestId, result } = parsed.data;
    const settled = queue.resolveResult(requestId, result as ToolInvokeResult);
    if (!settled) {
      // No awaiting resolver — the request already timed out or this is a duplicate POST.
      return reply.status(404).send({ error: 'unknown_request' });
    }
    return reply.status(200).send({ ok: true });
  });
}
