/**
 * Token validation cache — 5-minute in-memory TTL over socketlib roundtrip.
 *
 * Bridge consults Foundry's bearer registry via `socketlib.executeAsGM("evf.validateToken", token)`
 * on every cache miss. Cache hit avoids hot-loop roundtrips (D-2.12).
 *
 * Security notes (T-02-01, T-02-05):
 * - Token values are NEVER logged. Only the first 6 chars are used as a correlation hint.
 * - Cache keys are token values; all cache.keys() iteration is internal-only.
 * - 5-minute TTL is intentional: allows prompt revoke propagation within ~5 min.
 * - `invalidateToken` provides an explicit eviction path for Plan 05 "Refresh now".
 */

import { isDevNoAuth } from './is-dev-no-auth.js';

/** Result type returned by Foundry-side `evf.validateToken` socketlib handler. */
export interface ValidateTokenResult {
  valid: boolean;
  entry?: {
    alias: string;
    expiresAt: number;
    worldId: string;
  };
  reason?: 'unknown_token' | 'revoked' | 'expired' | 'foundry_unreachable';
}

/** Async function that performs the actual Foundry-side token lookup (injected for testability). */
export type FoundryValidateFn = (token: string) => Promise<ValidateTokenResult>;

interface CacheEntry {
  result: ValidateTokenResult;
  cachedAt: number;
}

/** Cache TTL: 5 minutes in milliseconds (D-2.12). */
const TTL_MS = 5 * 60 * 1_000;

/**
 * Optional observability hooks for `TokenCache`.
 *
 * Plan 03-03 wires these to Prometheus counters in `server.ts`.
 * Omitting them (or passing `{}`) leaves the cache behaviour unchanged.
 */
export interface TokenCacheMetricsHooks {
  /** Called on every cache hit (token found in cache within TTL). */
  onHit?: () => void;
  /** Called on every cache miss (cold cache or TTL expired — Foundry roundtrip needed). */
  onMiss?: () => void;
}

/**
 * In-memory bearer token validation cache.
 *
 * Production: inject the real socketlib roundtrip function.
 * Tests: inject a mock `FoundryValidateFn` — no mocking library required.
 *
 * @example
 * ```ts
 * const cache = new TokenCache(async (token) => {
 *   return await socketlib.executeAsGM('evf.validateToken', token);
 * }, { onHit: () => hitsCounter.inc(), onMiss: () => missesCounter.inc() });
 * const result = await cache.validate(token);
 * ```
 */
export class TokenCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly foundryValidateFn: FoundryValidateFn;
  private readonly metricsHooks: TokenCacheMetricsHooks;

  constructor(foundryValidateFn?: FoundryValidateFn, metricsHooks: TokenCacheMetricsHooks = {}) {
    // Default stub: always returns foundry_unreachable.
    // Production code passes the real socketlib fn via server.ts.
    this.foundryValidateFn =
      foundryValidateFn ??
      (async (_token: string): Promise<ValidateTokenResult> => ({
        valid: false,
        reason: 'foundry_unreachable',
      }));
    this.metricsHooks = metricsHooks;
  }

  /**
   * Validate a bearer token.
   *
   * Returns cached result if within TTL; calls Foundry on cache miss.
   * Negative results (invalid/expired) are also cached to avoid hammering Foundry
   * with invalid tokens — they will evict on TTL (5 min) or explicit invalidation.
   *
   * Fires `metricsHooks.onHit` on a cache hit and `metricsHooks.onMiss` on a miss.
   */
  async validate(token: string): Promise<ValidateTokenResult> {
    // DEV-ONLY: when the bearer-auth bypass is active (EVF_DEV_NO_AUTH, never prod),
    // every token validates to a synthetic 24h dev session. Checked first so the
    // bridge is reachable without Foundry or a real pairing token.
    if (isDevNoAuth()) {
      return {
        valid: true,
        entry: {
          alias: 'dev-no-auth',
          expiresAt: Date.now() + 24 * 60 * 60 * 1_000,
          worldId: process.env.EVF_DEV_WORLD ?? 'dev',
        },
      };
    }

    const cached = this.cache.get(token);
    if (cached !== undefined && Date.now() - cached.cachedAt < TTL_MS) {
      this.metricsHooks.onHit?.();
      return cached.result;
    }

    this.metricsHooks.onMiss?.();
    const result = await this.foundryValidateFn(token);
    this.cache.set(token, { result, cachedAt: Date.now() });
    return result;
  }

  /**
   * Explicitly evict a token from the cache.
   *
   * Used by Plan 05 "Refresh now" bridge endpoint — after issuing a new token,
   * the old token must be immediately invalid from the bridge's perspective.
   */
  invalidateToken(token: string): void {
    this.cache.delete(token);
  }

  /** Visible for testing: current cache size. */
  get size(): number {
    return this.cache.size;
  }
}
