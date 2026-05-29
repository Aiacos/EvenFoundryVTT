/**
 * isDebugEnabled() — the EXISTENCE GATE for every /debug/* route.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * # Production-safe semantics (READ THIS)
 *
 * The debug endpoints are a privileged dev backdoor: they can inject envelopes,
 * dispatch real Foundry writes, and simulate gestures. They MUST be impossible to
 * reach in production by default. This helper is layer 1 of the plan's three-layer
 * security model — when it returns `false` the routes are NOT registered at all, so
 * every path returns Fastify's default 404 (route literally absent), not a 403.
 *
 * Rule:
 *   - `EVF_DEBUG === 'true'` (exact match) is the base requirement.
 *   - In `NODE_ENV === 'production'` it ADDITIONALLY requires
 *     `EVF_DEBUG_ALLOW_PROD === 'true'` (explicit DOUBLE opt-in). So even if
 *     `EVF_DEBUG` leaks `'true'` into a prod container, debug stays OFF unless an
 *     operator also sets the prod-allow flag on purpose.
 *
 * Evaluated lazily (per call) so tests can flip env between cases; in production it
 * is read once at `buildServer()` time before route registration.
 *
 * @returns `true` only when debug routes should be registered.
 */
export function isDebugEnabled(): boolean {
  if (process.env.EVF_DEBUG !== 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return process.env.EVF_DEBUG_ALLOW_PROD === 'true';
  }
  return true;
}
