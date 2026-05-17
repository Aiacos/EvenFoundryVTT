/**
 * entity-pack-cache — in-memory singleton for available entity vocabulary.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-pack-cache).
 *
 * Stores the latest `AvailableEntitiesPayload` pushed by the Foundry module
 * via the `r1.entities.available` envelope (received at POST /internal/delta,
 * processed by `entity-pack-handler.ts`).
 *
 * ## Design
 *
 * - Last-write-wins: every push from the module replaces the cached payload.
 * - Cold-cache: `get()` returns `null` when no push has been received yet.
 *   The REST route handles null → returns `{ entries: [], source: 'empty',
 *   count: 0, generatedAt: 0 }` cold-cache sentinel.
 * - Module-level singleton: one `EntityPackCache` instance per bridge server.
 *   Injected into the REST route and WS handler via `BuildServerOptions`
 *   (same pattern as `SpellPackCache`, `IdempotencyStore`, `PortraitCache`).
 *
 * ## Security (T-EP-02)
 *
 * Cache writes are gated by `AvailableEntitiesPayloadSchema.safeParse` in
 * `entity-pack-handler.ts` BEFORE calling `set()`. The cache itself stores
 * pre-validated objects — no additional validation needed at read time.
 *
 * @see packages/bridge/src/ws/entity-pack-handler.ts (writer)
 * @see packages/bridge/src/routes/entities.ts (reader)
 * @see packages/bridge/src/cache/spell-pack-cache.ts (sibling pipeline)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 2
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';

/**
 * In-memory cache for the latest available-entities vocabulary payload.
 *
 * A single instance is created in `buildServer()` and shared between
 * `registerEntitiesRoute` and `handleEntityPackEnvelope`.
 */
export class EntityPackCache {
  /** The latest validated payload, or null when cache is cold (no push yet). */
  private _payload: AvailableEntitiesPayload | null = null;

  /**
   * Store a new payload (last-write-wins).
   *
   * Called by `entity-pack-handler.ts` after schema validation.
   * Replaces any previously cached payload atomically.
   *
   * @param payload - Validated `AvailableEntitiesPayload` from the Foundry module.
   */
  set(payload: AvailableEntitiesPayload): void {
    this._payload = payload;
  }

  /**
   * Retrieve the cached payload.
   *
   * @returns The latest cached `AvailableEntitiesPayload`, or `null` when cold.
   */
  get(): AvailableEntitiesPayload | null {
    return this._payload;
  }

  /**
   * Clear the cache (used in tests for isolation).
   */
  clear(): void {
    this._payload = null;
  }
}
