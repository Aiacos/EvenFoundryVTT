/**
 * PortraitCache — LRU + TTL cache for rendered 4-bit portrait PNGs (Plan 13-03 — STRETCH-06).
 *
 * Cache policy:
 * - Key: SHA-256 hex of the resolved absolute portrait URL (64 chars).
 * - LRU eviction: when size exceeds `maxEntries`, the least-recently-accessed
 *   entry is evicted. Access order is tracked by deleting + re-inserting on
 *   each `get` call (JavaScript Map preserves insertion order; tail = MRU).
 * - TTL expiry: `get` returns null when `Date.now() - entry.cachedAt > ttlMs`.
 *   Expired entries are lazily deleted on access (no background sweep).
 * - Max entries: 32 for a single-tenant homelab with 4-6 players (D-13-06).
 * - TTL: 1 hour = 60 × 60 × 1000 ms (configured by the caller).
 *
 * ## T-13-03 threat mitigation
 *
 * Cache key is SHA-256(resolved-absolute-URL). Actor ownership is re-checked by
 * the route handler on every request — a cache hit still validates the bearer-actor
 * mapping via `foundrySnapshotFn` before returning bytes. The cache is not a
 * bypass for authorization.
 *
 * @see packages/bridge/src/routes/portrait.ts (consumer)
 * @see packages/bridge/src/portrait/portrait-renderer.ts (producer)
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 2 (T-13-03)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single cached portrait entry. */
export interface PortraitCacheEntry {
  /** Rendered 4-bit indexed-palette PNG bytes. */
  pngBytes: Uint8Array;
  /** SHA-256 hex of the resolved absolute portrait URL. */
  urlHash: string;
  /** Unix milliseconds timestamp of when this entry was stored. */
  cachedAt: number;
}

/** Constructor options for {@link PortraitCache}. */
export interface PortraitCacheOpts {
  /** Maximum number of entries before LRU eviction. */
  maxEntries: number;
  /** Time-to-live in milliseconds; expired entries return null on access. */
  ttlMs: number;
}

// ─── SHA-256 hex validation ───────────────────────────────────────────────────

const URL_HASH_RE = /^[0-9a-f]{64}$/;

// ─── PortraitCache ────────────────────────────────────────────────────────────

/**
 * LRU + TTL cache for rendered portrait PNGs.
 *
 * Backed by a `Map<urlHash, PortraitCacheEntry>` — JS Map preserves insertion
 * order, enabling O(1) LRU via delete + re-insert on access.
 */
export class PortraitCache {
  private readonly _map = new Map<string, PortraitCacheEntry>();
  private readonly _maxEntries: number;
  private readonly _ttlMs: number;

  constructor(opts: PortraitCacheOpts) {
    this._maxEntries = opts.maxEntries;
    this._ttlMs = opts.ttlMs;
  }

  /**
   * Retrieve a cached entry by URL hash.
   *
   * Returns `null` if the entry is absent or TTL-expired.
   * Moves the accessed entry to the MRU position (tail of the Map).
   *
   * @param urlHash — SHA-256 hex of the resolved portrait URL (64 chars).
   */
  get(urlHash: string): PortraitCacheEntry | null {
    const entry = this._map.get(urlHash);
    if (entry === undefined) return null;

    // TTL check — lazy expiry on access
    if (Date.now() - entry.cachedAt > this._ttlMs) {
      this._map.delete(urlHash);
      return null;
    }

    // LRU update — move to MRU position (tail) by delete + re-insert
    this._map.delete(urlHash);
    this._map.set(urlHash, entry);
    return entry;
  }

  /**
   * Store an entry in the cache, evicting the LRU entry if at capacity.
   *
   * @param urlHash — SHA-256 hex of the resolved portrait URL (must be 64 hex chars).
   * @param entry   — Portrait cache entry to store.
   * @throws {Error} if urlHash does not match `[0-9a-f]{64}`.
   */
  set(urlHash: string, entry: PortraitCacheEntry): void {
    if (!URL_HASH_RE.test(urlHash)) {
      throw new Error(`[portrait-cache] invalid urlHash: must be 64 lowercase hex chars`);
    }

    // If already present, remove first so re-insert places it at MRU tail
    if (this._map.has(urlHash)) {
      this._map.delete(urlHash);
    }

    // LRU eviction if at capacity
    if (this._map.size >= this._maxEntries) {
      const lruKey = this._map.keys().next().value;
      if (lruKey !== undefined) {
        this._map.delete(lruKey);
      }
    }

    this._map.set(urlHash, entry);
  }

  /**
   * Current number of entries (including potentially TTL-expired ones not yet lazily evicted).
   */
  size(): number {
    return this._map.size;
  }

  /** Clear all entries from the cache. */
  clear(): void {
    this._map.clear();
  }
}
