/**
 * character-list-cache — in-memory singleton for the player character roster.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * Stores the latest `CharacterListSnapshot` pushed by the Foundry module
 * via the `r1.characters.available` envelope (received at POST /internal/delta,
 * processed by `character-list-handler.ts`).
 *
 * ## Design
 *
 * - Last-write-wins: every push from the module replaces the cached snapshot.
 * - Cold-cache: `get()` returns `null` when no push has been received yet.
 *   The REST route returns `[]` characters when the cache is cold — same as
 *   when the Foundry world has no player characters.
 * - Module-level singleton: one `CharacterListCache` instance per bridge server.
 *   Injected into `buildServer()` via `BuildServerOptions.characterListCache`.
 *
 * ## Security (T-RFP-01)
 *
 * Cache writes are gated by `CharacterListSnapshotSchema.safeParse` in
 * `character-list-handler.ts` BEFORE calling `set()`. The cache itself stores
 * pre-validated objects — no additional validation needed at read time.
 *
 * Character list payloads are pushed over the **EVF_INTERNAL_SECRET-gated
 * /internal/delta channel** (homelab trust model). Content is never logged
 * at the handler boundary.
 *
 * @see packages/bridge/src/ws/character-list-handler.ts (writer)
 * @see packages/bridge/src/routes/characters-list.ts (reader)
 * @see packages/shared-protocol/src/payloads/character-list.ts (schema)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import type { CharacterListSnapshot } from '@evf/shared-protocol';

/**
 * In-memory cache for the latest character-list snapshot.
 *
 * A single instance is created in `buildServer()` and shared between
 * `handleCharacterListEnvelope` and the internal `foundrySnapshotFn`.
 */
export class CharacterListCache {
  /** The latest validated snapshot, or null when cache is cold (no push yet). */
  private _snapshot: CharacterListSnapshot | null = null;

  /**
   * Store a new snapshot (last-write-wins).
   *
   * Called by `character-list-handler.ts` after schema validation.
   * Replaces any previously cached snapshot atomically.
   *
   * @param snapshot - Validated `CharacterListSnapshot` from the Foundry module.
   */
  set(snapshot: CharacterListSnapshot): void {
    this._snapshot = snapshot;
  }

  /**
   * Retrieve the cached snapshot.
   *
   * Returns `null` when the cache is cold (no push received yet).
   * Callers should use `cache.get()?.characters ?? []` as a safe default.
   *
   * @returns The latest `CharacterListSnapshot`, or `null` when cold.
   */
  get(): CharacterListSnapshot | null {
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
