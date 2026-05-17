/**
 * spell-pack-cache — in-memory singleton for available spell vocabulary.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 2).
 *
 * Stores the latest `AvailableSpellsPayload` pushed by the Foundry module
 * via the `r1.spells.available` envelope (received at POST /internal/delta,
 * processed by `spell-pack-handler.ts`).
 *
 * ## Design
 *
 * - Last-write-wins: every push from the module replaces the cached payload.
 * - Cold-cache: `get()` returns `null` when no push has been received yet.
 *   The REST route handles null → returns `{ entries: [], source: 'empty', count: 0 }`.
 * - Module-level singleton: one `SpellPackCache` instance per bridge server.
 *   Injected into the REST route and WS handler via function parameters
 *   (same pattern as `IdempotencyStore` and `PortraitCache`).
 *
 * ## Security (T-SP-02)
 *
 * Cache writes are gated by `AvailableSpellsPayloadSchema.safeParse` in
 * `spell-pack-handler.ts` BEFORE calling `set()`. The cache itself stores
 * pre-validated objects — no additional validation needed at read time.
 *
 * @see packages/bridge/src/ws/spell-pack-handler.ts (writer)
 * @see packages/bridge/src/routes/spells.ts (reader)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 2
 */

import type { AvailableSpellsPayload } from '@evf/shared-protocol';

/**
 * In-memory cache for the latest available-spells vocabulary payload.
 *
 * A single instance is created in `buildServer()` and shared between
 * `registerSpellsRoute` and `handleSpellPackEnvelope`.
 */
export class SpellPackCache {
  /** The latest validated payload, or null when cache is cold (no push yet). */
  private _payload: AvailableSpellsPayload | null = null;

  /**
   * Store a new payload (last-write-wins).
   *
   * Called by `spell-pack-handler.ts` after schema validation.
   * Replaces any previously cached payload atomically.
   *
   * @param payload - Validated `AvailableSpellsPayload` from the Foundry module.
   */
  set(payload: AvailableSpellsPayload): void {
    this._payload = payload;
  }

  /**
   * Retrieve the cached payload.
   *
   * @returns The latest cached `AvailableSpellsPayload`, or `null` when cold.
   */
  get(): AvailableSpellsPayload | null {
    return this._payload;
  }

  /**
   * Clear the cache (used in tests for isolation).
   */
  clear(): void {
    this._payload = null;
  }
}
