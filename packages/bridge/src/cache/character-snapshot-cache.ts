/**
 * character-snapshot-cache — in-memory per-actor store for character snapshots.
 *
 * Quick Task 260605-dog — bridge caches the latest character.delta per actorId.
 *
 * Stores the latest `CharacterSnapshot` pushed by the Foundry module via the
 * `character.delta` envelope (received at POST /internal/delta, processed by
 * `character-snapshot-handler.ts`).
 *
 * ## Design
 *
 * - Keyed by `actorId`: a private `Map<string, CharacterSnapshot>` stores one
 *   snapshot per actor. Unlike the singleton-payload `SpellPackCache` and
 *   `EntityPackCache`, this cache supports multiple actors simultaneously
 *   (one per PC in the Foundry world).
 * - Last-write-wins: `set()` always replaces the previous value for the same
 *   `actorId` via `Map.set`. No merge, no TTL, no bounded eviction.
 * - Cold/miss: `get(actorId)` returns `null` when no push has been received
 *   for that actor yet. The REST route handles null → 404 `actor_not_found`.
 * - Module-level singleton: one `CharacterSnapshotCache` instance per bridge
 *   server, injected via `BuildServerOptions.characterSnapshotCache` for test
 *   isolation.
 *
 * ## Security (T-dog-01)
 *
 * Cache writes are gated by `CharacterSnapshotSchema.safeParse` in
 * `character-snapshot-handler.ts` BEFORE calling `set()`. The cache itself
 * stores pre-validated objects — no additional validation needed at read time.
 *
 * @see packages/bridge/src/ws/character-snapshot-handler.ts (writer)
 * @see packages/bridge/src/routes/character.ts (reader via internalSnapshotFn)
 * @see packages/bridge/src/cache/spell-pack-cache.ts (sibling singleton cache)
 * @see .planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-PLAN.md Task 1
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';

/**
 * In-memory per-actor cache for the latest character snapshot.
 *
 * A single instance is created in `buildServer()` and shared between
 * `internalSnapshotFn` (GET /v1/character/:actorId) and
 * `handleCharacterSnapshotEnvelope` (POST /internal/delta fan-out).
 */
export class CharacterSnapshotCache {
  /** Map from actorId to the latest validated snapshot. */
  private readonly _byActor: Map<string, CharacterSnapshot> = new Map();

  /**
   * Store a new snapshot (last-write-wins, keyed by `snapshot.actorId`).
   *
   * Called by `character-snapshot-handler.ts` after schema validation.
   * Replaces any previously cached snapshot for the same actor atomically.
   *
   * @param snapshot - Validated `CharacterSnapshot` from the Foundry module.
   */
  set(snapshot: CharacterSnapshot): void {
    this._byActor.set(snapshot.actorId, snapshot);
  }

  /**
   * Retrieve the cached snapshot for a given actor.
   *
   * @param actorId - The Foundry actor UUID to look up.
   * @returns The latest cached `CharacterSnapshot`, or `null` when cold/miss.
   */
  get(actorId: string): CharacterSnapshot | null {
    return this._byActor.get(actorId) ?? null;
  }

  /**
   * Clear the entire cache (used in tests for isolation).
   *
   * After `clear()`, every `get()` call returns `null` until new snapshots
   * are pushed via `set()`.
   */
  clear(): void {
    this._byActor.clear();
  }
}
