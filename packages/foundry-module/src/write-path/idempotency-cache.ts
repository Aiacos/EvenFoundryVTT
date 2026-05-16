/**
 * Module-side idempotency cache for the EVF write path.
 *
 * Hand-rolled `Map<string, ModuleIdempotencyEntry>` with:
 * - 60s TTL (lazy eviction on read)
 * - 1000-entry FIFO eviction on overflow (T-07-05 DoS mitigation)
 * - Bearer-bound cache keys (T-07-02 replay mitigation)
 *
 * Key construction:
 * ```
 * cacheKey = SHA256(bearer).slice(0, 16) + ':' + idempotencyKey
 * ```
 *
 * Using SHA-256 of the bearer token (not the raw token) ensures:
 * 1. The raw bearer never appears in cache key strings (T-02-01 token leakage prevention).
 * 2. Different bearers produce different key prefixes — a replay attempt with a
 *    different bearer token cannot hit the cache entry from another session (T-07-02).
 *
 * # Why not an npm LRU library?
 *
 * `lru-cache` has CJS/ESM shim issues in Foundry's browser WebView context.
 * A hand-rolled 30-line Map implementation matches the bridge's proven pattern
 * (`packages/bridge/src/middleware/idempotency.ts`) and adds zero dependencies.
 *
 * # Single-tenant sizing (vs bridge)
 *
 * The bridge uses `MAX_ENTRIES = 10_000` (multi-bearer scenarios). The module
 * runs inside Foundry for a single paired session — `MAX_ENTRIES = 1_000`
 * is generous for all 6 tool types over any 60s window.
 *
 * @see packages/bridge/src/middleware/idempotency.ts (pattern reference)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 2
 */
import type { ToolResult } from './tool-registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** TTL for module idempotency cache entries — 60 seconds (matches bridge ADR-0002). */
export const MODULE_IDEMPOTENCY_TTL_MS = 60_000;

/** Maximum number of entries in the store — T-07-05 DoS mitigation. */
export const MODULE_IDEMPOTENCY_MAX = 1_000;

// ─── Entry type ───────────────────────────────────────────────────────────────

/**
 * A cached tool result entry.
 *
 * `result` is the ToolResult returned by `handler.handle()`.
 * `cachedAt` is `Date.now()` at insertion time — used for TTL eviction on read.
 */
export interface ModuleIdempotencyEntry {
  /** The tool result to replay on a cache hit. */
  result: ToolResult;
  /** Unix timestamp (ms) when the entry was stored. */
  cachedAt: number;
}

// ─── IdempotencyStore class ───────────────────────────────────────────────────

/**
 * In-memory idempotency store for the Foundry module write path.
 *
 * Mirrors the bridge's `IdempotencyStore` pattern with module-specific sizing.
 * Cache keys are bearer-bound (see `buildCacheKey`) to prevent cross-bearer replay.
 *
 * @example
 * ```ts
 * const store = new IdempotencyStore();
 * const key = buildCacheKey(await hashBearer(bearer), idempotencyKey);
 * const cached = store.get(key);
 * if (cached) return cached.result;  // cache hit
 * const result = await handler.handle(args);
 * store.set(key, { result, cachedAt: Date.now() });
 * ```
 */
export class IdempotencyStore {
  private readonly store = new Map<string, ModuleIdempotencyEntry>();

  /**
   * Retrieve a cached entry by key.
   *
   * Returns `undefined` if the key is unknown or the entry has expired (lazy TTL eviction).
   * Expired entries are deleted from the store on access — O(1) amortized cleanup.
   */
  get(key: string): ModuleIdempotencyEntry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (Date.now() - entry.cachedAt > MODULE_IDEMPOTENCY_TTL_MS) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Store a tool result for the given cache key.
   *
   * `cachedAt` is set to `Date.now()` at insertion time.
   * If the store has reached `MODULE_IDEMPOTENCY_MAX`, the oldest entry (Map insertion
   * order = FIFO) is evicted before inserting the new one (T-07-05).
   */
  set(key: string, entry: ModuleIdempotencyEntry): void {
    // Evict oldest on overflow (FIFO using Map insertion order). Only evict if
    // key is not already present (re-insert is an update, not a new entry).
    if (this.store.size >= MODULE_IDEMPOTENCY_MAX && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, entry);
  }

  /**
   * Current number of entries.
   *
   * Note: may include expired entries not yet lazily evicted. Reflects raw Map size.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries.
   *
   * Used in tests for isolation. Not called in production code.
   */
  clear(): void {
    this.store.clear();
  }
}

// ─── hashBearer ──────────────────────────────────────────────────────────────

/**
 * Computes SHA-256 of the bearer token and returns the first 16 hex characters.
 *
 * Used to construct bearer-bound cache keys (T-07-02 cross-bearer replay mitigation).
 * Truncation to 16 chars is sufficient for key uniqueness while keeping keys compact.
 *
 * Uses Web Crypto `crypto.subtle.digest('SHA-256')` — available in both:
 * - Foundry's Chromium-based browser context (GM client)
 * - Vitest Node.js test environment (Node 24+ supports `crypto.subtle`)
 *
 * The raw bearer token is NEVER stored, logged, or returned — only its hash prefix.
 * This satisfies T-02-01 (no bearer leakage in logs or cache keys).
 *
 * @param bearer - Raw bearer token string
 * @returns 16-character lowercase hex prefix of SHA-256(bearer)
 *
 * @example
 * ```ts
 * const hash = await hashBearer('eyJhbGciOiJIUzI1NiJ9...');
 * // => '7f3d4e2a1b8c9f05' (example — actual hash depends on token)
 * ```
 */
export async function hashBearer(bearer: string): Promise<string> {
  const encoded = new TextEncoder().encode(bearer);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

// ─── buildCacheKey ────────────────────────────────────────────────────────────

/**
 * Constructs a bearer-bound idempotency cache key.
 *
 * Format: `${bearerHash}:${idempotencyKey}`
 *
 * The colon separator makes the key human-parseable in debug logs. The
 * `bearerHash` prefix (16 hex chars from `hashBearer`) ensures that the same
 * `idempotencyKey` value from a different bearer token produces a different
 * cache key — preventing cross-bearer replay (T-07-02).
 *
 * @param bearerHash - 16-char hex string from `hashBearer()`
 * @param idempotencyKey - UUID v4 from the tool invocation envelope
 * @returns Cache key in format `${bearerHash}:${idempotencyKey}`
 *
 * @example
 * ```ts
 * const key = buildCacheKey('7f3d4e2a1b8c9f05', '550e8400-0000-4000-8000-000000000001');
 * // => '7f3d4e2a1b8c9f05:550e8400-0000-4000-8000-000000000001'
 * ```
 */
export function buildCacheKey(bearerHash: string, idempotencyKey: string): string {
  return `${bearerHash}:${idempotencyKey}`;
}
