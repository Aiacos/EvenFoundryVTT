/**
 * Shared secret-gate helpers for the dev-only `/debug/*` routes.
 *
 * Quick Task 260604-cwa: extracted to avoid a third copy of secretsEqual.
 * Consumed by both `debug-routes.ts` and `agent-routes.ts`.
 *
 * # Security surface
 *
 * T-cwa-02 / T-h5e-02: All debug routes require a correct `EVF_INTERNAL_SECRET`
 * checked via constant-time comparison ({@link secretsEqual}).
 *
 * ## Why `?secret=` on the WS upgrade is acceptable (NOT an oversight)
 *
 * {@link checkWsSecret} accepts the secret via a `?secret=` query parameter in
 * addition to the `Authorization` header. This is a DELIBERATE, narrowly-scoped
 * concession, not a leak:
 *
 *  1. **It is unavoidable for browsers.** The WHATWG `WebSocket` constructor exposes
 *     no API to set request headers on the upgrade handshake, so a browser-based
 *     debug client physically cannot send `Authorization` on a WS upgrade. The query
 *     param is the only channel available. Non-browser clients (wscat, tests) still
 *     use the header path.
 *  2. **The entire debug surface is double-gated upstream.** These routes are
 *     registered ONLY when `isDebugEnabled()` is true AND (in production) the explicit
 *     `EVF_DEBUG_ALLOW_PROD` double opt-in is set (see ../debug/is-debug-enabled.ts and
 *     the `if (debugEnabled && debugBus !== undefined)` block in server.ts). When debug
 *     is off the routes are genuinely ABSENT (404), so there is no `?secret=` endpoint
 *     to attack in a normal/production deployment.
 *  3. **The secret still must match** (constant-time) regardless of the channel it
 *     arrived on — the query param relaxes only WHERE the secret is read from, never
 *     WHETHER it is required.
 *
 * The residual risk of a secret in a URL (proxy/access-log capture) is bounded to a
 * non-prod, explicitly-enabled debug session on a homelab LAN, and `EVF_INTERNAL_SECRET`
 * is redacted from this service's own pino logs (T-02-01). Do NOT "fix" this by removing
 * the query-param path — it would make the browser debug client unusable for no
 * production security gain.
 *
 * @see ../debug/is-debug-enabled.ts (existence + non-prod gate — layer 1)
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
 * (browsers cannot set Authorization headers on WS upgrade — see the file-level
 * "Why `?secret=` is acceptable" note) OR the `Authorization` header (for non-browser
 * clients like `wscat`). The secret is still required and constant-time-compared
 * either way; this only relaxes WHERE it is read from. The whole debug route surface
 * is gated behind isDebugEnabled() (+ EVF_DEBUG_ALLOW_PROD in prod), so this query
 * param does not exist on a normal/production deployment.
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
