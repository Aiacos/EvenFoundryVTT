/**
 * Unit tests for IdempotencyStore + hashBearer + buildCacheKey.
 *
 * RED phase (TDD): tests written before implementation per Plan 07-01 Task 2.
 *
 * Covers:
 * - Cache miss returns undefined
 * - Cache hit within TTL returns entry
 * - Lazy eviction after 61s (vi.useFakeTimers)
 * - FIFO eviction at 1001st insert
 * - clear() empties the store
 * - hashBearer returns 16-char hex string
 * - buildCacheKey produces expected format
 * - Cross-bearer isolation (T-07-02 regression test)
 *
 * @see packages/foundry-module/src/write-path/idempotency-cache.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCacheKey,
  hashBearer,
  IdempotencyStore,
  MODULE_IDEMPOTENCY_MAX,
  MODULE_IDEMPOTENCY_TTL_MS,
} from './idempotency-cache.js';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('module constants', () => {
  it('MODULE_IDEMPOTENCY_TTL_MS is 60_000 ms', () => {
    expect(MODULE_IDEMPOTENCY_TTL_MS).toBe(60_000);
  });

  it('MODULE_IDEMPOTENCY_MAX is 1000', () => {
    expect(MODULE_IDEMPOTENCY_MAX).toBe(1_000);
  });
});

// ─── hashBearer ───────────────────────────────────────────────────────────────

describe('hashBearer', () => {
  it('returns a 16-character hex string', async () => {
    const hash = await hashBearer('test-bearer-token');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same token always produces same hash (deterministic)', async () => {
    const token = 'my-secret-bearer';
    const h1 = await hashBearer(token);
    const h2 = await hashBearer(token);
    expect(h1).toBe(h2);
  });

  it('different tokens produce different hashes', async () => {
    const h1 = await hashBearer('bearer-alpha');
    const h2 = await hashBearer('bearer-beta');
    expect(h1).not.toBe(h2);
  });

  it('is exactly 16 chars (not truncated to fewer, not longer)', async () => {
    const hashes = await Promise.all([
      hashBearer('tok1'),
      hashBearer('tok2'),
      hashBearer(''),
      hashBearer('a'.repeat(200)),
    ]);
    for (const h of hashes) {
      expect(h).toHaveLength(16);
    }
  });
});

// ─── buildCacheKey ────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('returns bearerHash:idempotencyKey format', () => {
    const key = buildCacheKey('abcd1234abcd5678', '00000000-0000-4000-8000-000000000001');
    expect(key).toBe('abcd1234abcd5678:00000000-0000-4000-8000-000000000001');
  });

  it('two different bearers produce different cache keys for the same idempotencyKey', async () => {
    const hash1 = await hashBearer('bearer-one');
    const hash2 = await hashBearer('bearer-two');
    const iKey = '00000000-0000-4000-8000-000000000099';
    expect(buildCacheKey(hash1, iKey)).not.toBe(buildCacheKey(hash2, iKey));
  });
});

// ─── IdempotencyStore ─────────────────────────────────────────────────────────

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Cache miss ──────────────────────────────────────────────────────────────

  it('get() returns undefined for unknown key (cache miss)', () => {
    expect(store.get('unknown-key')).toBeUndefined();
  });

  // ── Cache hit ───────────────────────────────────────────────────────────────

  it('get() returns entry for key within TTL (cache hit)', () => {
    const result = { success: true as const, data: { rolled: true } };
    store.set('key1', { result, cachedAt: Date.now() });

    // Advance only 30s — within 60s TTL
    vi.advanceTimersByTime(30_000);

    const entry = store.get('key1');
    expect(entry).toBeDefined();
    expect(entry?.result).toEqual(result);
  });

  // ── Lazy TTL eviction ───────────────────────────────────────────────────────

  it('get() returns undefined for expired entry (lazy eviction after 61s)', () => {
    const result = { success: true as const, data: 'cached' };
    store.set('key2', { result, cachedAt: Date.now() });

    // Advance past 60s TTL
    vi.advanceTimersByTime(61_000);

    expect(store.get('key2')).toBeUndefined();
  });

  it('expired entry is removed from store after lazy eviction', () => {
    const result = { success: false as const, error: 'failed' };
    store.set('expired-key', { result, cachedAt: Date.now() });

    expect(store.size).toBe(1);
    vi.advanceTimersByTime(61_000);
    store.get('expired-key'); // trigger lazy eviction
    expect(store.size).toBe(0);
  });

  // ── size ────────────────────────────────────────────────────────────────────

  it('size reflects current entry count', () => {
    expect(store.size).toBe(0);
    store.set('k1', { result: { success: true, data: null }, cachedAt: Date.now() });
    expect(store.size).toBe(1);
    store.set('k2', { result: { success: true, data: null }, cachedAt: Date.now() });
    expect(store.size).toBe(2);
  });

  // ── FIFO eviction at MAX ────────────────────────────────────────────────────

  it('FIFO eviction removes oldest entry when MAX_ENTRIES exceeded', () => {
    // Fill store to exactly MAX_ENTRIES
    for (let i = 0; i < MODULE_IDEMPOTENCY_MAX; i++) {
      store.set(`key-${i}`, { result: { success: true, data: i }, cachedAt: Date.now() });
    }
    expect(store.size).toBe(MODULE_IDEMPOTENCY_MAX);

    // Insert one more — should evict the oldest (key-0)
    store.set('key-overflow', {
      result: { success: true, data: 'overflow' },
      cachedAt: Date.now(),
    });

    // Store should still be at MAX_ENTRIES
    expect(store.size).toBe(MODULE_IDEMPOTENCY_MAX);

    // Oldest entry (key-0) should be evicted
    expect(store.get('key-0')).toBeUndefined();

    // New entry should be present
    const overflow = store.get('key-overflow');
    expect(overflow).toBeDefined();
    expect(overflow?.result).toEqual({ success: true, data: 'overflow' });
  });

  it('re-inserting an existing key does NOT trigger FIFO eviction', () => {
    for (let i = 0; i < MODULE_IDEMPOTENCY_MAX; i++) {
      store.set(`key-${i}`, { result: { success: true, data: i }, cachedAt: Date.now() });
    }
    // Re-insert key-0 (already exists — should update, not add)
    store.set('key-0', { result: { success: true, data: 'updated' }, cachedAt: Date.now() });
    // Size should still be MAX (not MAX+1)
    expect(store.size).toBe(MODULE_IDEMPOTENCY_MAX);
  });

  // ── clear() ─────────────────────────────────────────────────────────────────

  it('clear() empties the store', () => {
    store.set('k1', { result: { success: true, data: null }, cachedAt: Date.now() });
    store.set('k2', { result: { success: true, data: null }, cachedAt: Date.now() });
    expect(store.size).toBe(2);
    store.clear();
    expect(store.size).toBe(0);
    expect(store.get('k1')).toBeUndefined();
  });

  // ── T-07-02 cross-bearer isolation ─────────────────────────────────────────

  it('T-07-02: same idempotencyKey + different bearer produces different cache key → no replay', async () => {
    const iKey = '00000000-0000-4000-8000-000000000001';

    const bearerA = 'bearer-alpha-secret';
    const bearerB = 'bearer-beta-secret';

    const hashA = await hashBearer(bearerA);
    const hashB = await hashBearer(bearerB);

    const cacheKeyA = buildCacheKey(hashA, iKey);
    const cacheKeyB = buildCacheKey(hashB, iKey);

    // Keys must be different for different bearers
    expect(cacheKeyA).not.toBe(cacheKeyB);

    // Store result for bearer A
    const resultA = { success: true as const, data: 'cast-by-A' };
    store.set(cacheKeyA, { result: resultA, cachedAt: Date.now() });

    // Bearer B with the same idempotency key should NOT get bearer A's result
    const entryForB = store.get(cacheKeyB);
    expect(entryForB).toBeUndefined();

    // Bearer A's entry should still be retrievable
    const entryForA = store.get(cacheKeyA);
    expect(entryForA?.result).toEqual(resultA);
  });
});
