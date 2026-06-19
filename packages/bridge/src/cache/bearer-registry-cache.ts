/**
 * bearer-registry-cache — in-memory singleton for the bearer token registry.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * Stores the latest `BearerRegistrySnapshot` pushed by the Foundry module
 * via the `r1.bearers.available` envelope (received at POST /internal/delta,
 * processed by `bearer-registry-handler.ts`).
 *
 * ## Design
 *
 * - Last-write-wins: every push from the module replaces the cached snapshot.
 * - Cold-cache: `get()` returns `null` when no push has been received yet.
 *   A null cache maps to `foundry_unreachable` in `internalValidateFn` — the
 *   module has never connected, distinguishable from `unknown_token` (T-RFP-03).
 * - Module-level singleton: one `BearerRegistryCache` instance per bridge server.
 *   Injected into `buildServer()` via `BuildServerOptions.bearerRegistryCache`.
 *
 * ## Security (T-RFP-01 / T-RFP-02)
 *
 * Cache writes are gated by `BearerRegistrySnapshotSchema.safeParse` in
 * `bearer-registry-handler.ts` BEFORE calling `set()`. The cache itself stores
 * pre-validated objects — no additional validation needed at read time.
 *
 * Bearer tokens are pushed over the **EVF_INTERNAL_SECRET-gated /internal/delta
 * channel** (homelab trust model). Tokens are stored in-memory only and NEVER
 * logged — the handler does not log payload contents.
 *
 * @see packages/bridge/src/ws/bearer-registry-handler.ts (writer)
 * @see packages/bridge/src/server.ts (consumer — internalValidateFn)
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (schema)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import type { BearerRegistrySnapshot } from '@evf/shared-protocol';

/**
 * In-memory cache for the latest bearer-registry snapshot.
 *
 * A single instance is created in `buildServer()` and shared between
 * `handleBearerRegistryEnvelope` and the internal `foundryValidateFn`.
 */
export class BearerRegistryCache {
  /**
   * The latest validated snapshot, or null when cache is cold (no push yet).
   *
   * @security Tokens are never logged; only used for constant-time lookup.
   */
  private _snapshot: BearerRegistrySnapshot | null = null;

  /**
   * Store a new snapshot (last-write-wins).
   *
   * Called by `bearer-registry-handler.ts` after schema validation.
   * Replaces any previously cached snapshot atomically.
   *
   * @param snapshot - Validated `BearerRegistrySnapshot` from the Foundry module.
   */
  set(snapshot: BearerRegistrySnapshot): void {
    this._snapshot = snapshot;
  }

  /**
   * Retrieve the cached snapshot.
   *
   * Returns `null` when the cache is cold (no push received yet).
   * A null cache means the Foundry module has never connected — callers
   * should return `foundry_unreachable` in this case (T-RFP-03).
   *
   * @returns The latest `BearerRegistrySnapshot`, or `null` when cold.
   */
  get(): BearerRegistrySnapshot | null {
    return this._snapshot;
  }

  /**
   * Clear the cache (used in tests for isolation).
   *
   * Resets to the cold-cache state (`get()` returns `null` after clearing).
   */
  clear(): void {
    this._snapshot = null;
  }
}
