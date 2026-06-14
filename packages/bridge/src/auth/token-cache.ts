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

/**
 * Result type returned by Foundry-side `evf.validateToken` socketlib handler.
 *
 * ADR-0014: a **valid** result additionally carries the bearer's Foundry-user
 * binding (`entry.userId`) and the live owned-actor set (`authorizedActorIds`)
 * the bridge enforces on every read path (REST + WS). Both are populated by the
 * authorization authority (Foundry) at validate time and cached here under the
 * same 5-minute TTL as the rest of the result.
 *
 * `authorizedActorIds` may legitimately be **empty** — a user that owns no
 * actors, or a fail-closed legacy bearer — which authorizes nothing. Callers
 * MUST treat absence/empty as "authorizes no actors", never "authorizes all".
 *
 * @see docs/architecture/0014-bearer-actor-authorization.md §4
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (BearerAuthorization)
 */
export interface ValidateTokenResult {
  valid: boolean;
  entry?: {
    alias: string;
    expiresAt: number;
    worldId: string;
    /**
     * Foundry `User` id this bearer is bound to (ADR-0014). Present on every
     * valid result; the authorized actor set is derived live from this user's
     * Foundry ownership.
     */
    userId: string;
  };
  /**
   * Live set of actor ids the bound user OWNs (ADR-0014), computed by Foundry at
   * validation time. Present on every valid result; may be empty (authorizes no
   * actors). Cached alongside the result under the same TTL. The bridge enforces
   * set-membership on every read path — `actorId ∉ authorizedActorIds` → 404
   * (REST) / close 4400 (WS handshake) / filtered-out (roster).
   */
  authorizedActorIds?: string[];
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
          // DEV-ONLY: synthetic user binding for the bypass session. Enforcement
          // points additionally short-circuit on isDevNoAuth() (never prod), so
          // the empty-by-default authorized set here never blocks the dev flow.
          userId: 'dev-no-auth',
        },
        // Authorize the DEV mock roster ids so the wizard / HUD are exercisable
        // end-to-end without a live Foundry world. Enforcement also bypasses on
        // isDevNoAuth() for any other actorId. Never reached in production.
        authorizedActorIds: ['dev-pc-1', 'dev-pc-2'],
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
