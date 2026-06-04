/**
 * Shared secret-gate helpers for the dev-only `/debug/*` routes.
 *
 * Quick Task 260604-cwa: extracted to avoid a third copy of secretsEqual.
 * Consumed by both `debug-routes.ts` and `agent-routes.ts`.
 *
 * # Security surface
 *
 * T-cwa-02 / T-h5e-02: All debug routes require a correct `EVF_INTERNAL_SECRET`
 * checked via constant-time comparison. The WS endpoints accept `?secret=` query
 * param because browsers/WebSocket clients cannot set custom headers at upgrade time.
 *
 * @see ./debug-routes.ts (consumer — HTTP + WS stream)
 * @see ./agent-routes.ts (consumer — /debug/agent WS + HTTP agent routes)
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Constant-time secret comparison.
 *
 * Returns `false` (not error) when strings differ in length — `timingSafeEqual`
 * throws on length mismatch, so we catch and return false.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns `true` only when `a === b` in constant time.
 */
export function secretsEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Extract a candidate secret from an `Authorization: Bearer <s>` header value,
 * or return the raw string when no `Bearer ` prefix is present.
 *
 * @param authHeader - Raw `Authorization` header value (may be undefined).
 * @returns The extracted secret, or `undefined` when the header is absent.
 */
export function secretFromAuthHeader(authHeader: string | undefined): string | undefined {
  if (authHeader === undefined) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
}

/**
 * HTTP secret gate. Sends a 401 and returns `false` when the `EVF_INTERNAL_SECRET`
 * is missing, empty, or does not match the request's `Authorization` header.
 *
 * @param request - Fastify request.
 * @param reply   - Fastify reply (used to send 401).
 * @returns `true` when the secret matches; `false` after sending 401.
 */
export function requireSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.EVF_INTERNAL_SECRET;
  const provided = secretFromAuthHeader(request.headers.authorization);
  if (
    expected === undefined ||
    expected === '' ||
    provided === undefined ||
    !secretsEqual(provided, expected)
  ) {
    void reply.status(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * Check the `EVF_INTERNAL_SECRET` against a candidate value from a WS request.
 *
 * For WebSocket upgrade requests, the secret is accepted via `?secret=` query param
 * (browsers cannot set Authorization headers on WS upgrade) OR the `Authorization`
 * header (for non-browser clients like `wscat`).
 *
 * @param reqUrl  - Raw request URL string.
 * @param authHdr - Raw `Authorization` header value (may be undefined).
 * @returns `true` when the secret matches; `false` otherwise.
 */
export function checkWsSecret(reqUrl: string | undefined, authHdr: string | undefined): boolean {
  const url = new URL(reqUrl ?? '/debug/agent', 'http://localhost');
  const querySecret = url.searchParams.get('secret') ?? undefined;
  const headerSecret = secretFromAuthHeader(authHdr);
  const provided = querySecret ?? headerSecret;
  const expected = process.env.EVF_INTERNAL_SECRET;
  return (
    expected !== undefined &&
    expected !== '' &&
    provided !== undefined &&
    secretsEqual(provided, expected)
  );
}
