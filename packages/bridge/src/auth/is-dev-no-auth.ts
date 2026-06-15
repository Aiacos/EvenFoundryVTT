/**
 * isDevNoAuth() — DEV-ONLY bearer-auth bypass gate.
 *
 * Companion to {@link ../debug/is-debug-enabled.ts}. When this returns `true`,
 * the bridge accepts requests WITHOUT a valid bearer token: `TokenCache.validate`
 * short-circuits to a synthetic `dev-no-auth` session, an `onRequest` hook injects
 * a sentinel `Authorization` header when one is absent, and CORS reflects any origin
 * so a local Vite dev server / EvenHub simulator can reach the bridge.
 *
 * # Production-safe semantics (READ THIS)
 *
 * Disabling auth is a privileged dev convenience that removes the only thing standing
 * between an unauthenticated caller and real Foundry reads/writes. It MUST be
 * impossible to enable in production by accident.
 *
 * Rule (identical to {@link isDebugEnabled}):
 *   - `EVF_DEV_NO_AUTH === 'true'` (exact match) is the base requirement.
 *   - In `NODE_ENV === 'production'` it ADDITIONALLY requires
 *     `EVF_DEBUG_ALLOW_PROD === 'true'` (explicit DOUBLE opt-in). So even if
 *     `EVF_DEV_NO_AUTH` leaks `'true'` into a prod container, auth stays ON unless an
 *     operator also sets the prod-allow flag on purpose.
 *
 * Evaluated lazily (per call) so tests can flip env between cases.
 *
 * @returns `true` only when the bearer-auth bypass should be active.
 */
export function isDevNoAuth(): boolean {
  if (process.env.EVF_DEV_NO_AUTH !== 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return process.env.EVF_DEBUG_ALLOW_PROD === 'true';
  }
  return true;
}

/** Sentinel bearer injected for token-less requests when {@link isDevNoAuth} is active. */
export const DEV_NO_AUTH_SENTINEL = 'dev-no-auth';
