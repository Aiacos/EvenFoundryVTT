/**
 * Unit tests for PortraitCache (Plan 13-03 — STRETCH-06).
 *
 * PC-01: empty cache returns null on get
 * PC-02: set+get round-trips correctly
 * PC-03: LRU eviction at capacity (oldest entry removed)
 * PC-04: TTL expiry — stale entry returns null
 * PC-05: clear() empties the cache
 * PC-06: size() is accurate after set and eviction
 * PC-07: sequential calls produce deterministic results
 * PC-08: invalid urlHash at set() boundary throws
 *
 * @see packages/bridge/src/portrait/portrait-cache.ts
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 2
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortraitCache } from './portrait-cache.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

const PNG_A = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
const PNG_B = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
const PNG_C = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
const PNG_D = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

function makeEntry(pngBytes: Uint8Array, urlHash: string, cachedAt = Date.now()) {
  return { pngBytes, urlHash, cachedAt };
}

describe('PortraitCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // PC-01: empty cache returns null
  it('PC-01: empty cache returns null on get', () => {
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: 60_000 });
    expect(cache.get(HASH_A)).toBeNull();
  });

  // PC-02: set+get round-trips correctly
  it('PC-02: set+get returns stored entry', () => {
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: 60_000 });
    const entry = makeEntry(PNG_A, HASH_A);
    cache.set(HASH_A, entry);

    const result = cache.get(HASH_A);
    expect(result).not.toBeNull();
    expect(result?.urlHash).toBe(HASH_A);
    expect(result?.pngBytes).toBe(PNG_A);
  });

  // PC-03: LRU eviction at capacity (maxEntries=2)
  it('PC-03: LRU eviction removes least-recently-accessed entry at capacity', () => {
    const cache = new PortraitCache({ maxEntries: 2, ttlMs: 60_000 });
    cache.set(HASH_A, makeEntry(PNG_A, HASH_A));
    cache.set(HASH_B, makeEntry(PNG_B, HASH_B));
    // Access HASH_A to make it MRU; HASH_B becomes LRU
    cache.get(HASH_A);
    // Insert HASH_C → HASH_B (LRU) should be evicted
    cache.set(HASH_C, makeEntry(PNG_C, HASH_C));

    expect(cache.get(HASH_A)).not.toBeNull(); // MRU — still present
    expect(cache.get(HASH_C)).not.toBeNull(); // just inserted
    expect(cache.get(HASH_B)).toBeNull(); // LRU — evicted
  });

  // PC-04: TTL expiry returns null on stale access
  it('PC-04: TTL expiry — stale entry returns null after ttlMs elapsed', () => {
    const TTL = 3_600_000; // 1h
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: TTL });
    cache.set(HASH_A, makeEntry(PNG_A, HASH_A, Date.now()));

    // Advance past TTL
    vi.advanceTimersByTime(TTL + 1);

    expect(cache.get(HASH_A)).toBeNull();
    // Lazy eviction: entry removed from map
    expect(cache.size()).toBe(0);
  });

  // PC-05: clear() empties the cache
  it('PC-05: clear() removes all entries', () => {
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: 60_000 });
    cache.set(HASH_A, makeEntry(PNG_A, HASH_A));
    cache.set(HASH_B, makeEntry(PNG_B, HASH_B));
    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get(HASH_A)).toBeNull();
  });

  // PC-06: size() is accurate
  it('PC-06: size() tracks insertions and evictions correctly', () => {
    const cache = new PortraitCache({ maxEntries: 2, ttlMs: 60_000 });
    expect(cache.size()).toBe(0);

    cache.set(HASH_A, makeEntry(PNG_A, HASH_A));
    expect(cache.size()).toBe(1);

    cache.set(HASH_B, makeEntry(PNG_B, HASH_B));
    expect(cache.size()).toBe(2);

    // At capacity; HASH_C insert evicts LRU (HASH_A accessed last, HASH_A became MRU via set-order)
    // Actually: HASH_A was inserted first, so it's LRU; HASH_B second → HASH_A evicted
    cache.set(HASH_C, makeEntry(PNG_C, HASH_C));
    expect(cache.size()).toBe(2); // still 2 (one evicted)
  });

  // PC-07: sequential calls deterministic
  it('PC-07: multiple sets and gets produce deterministic LRU order', () => {
    const cache = new PortraitCache({ maxEntries: 3, ttlMs: 60_000 });
    cache.set(HASH_A, makeEntry(PNG_A, HASH_A)); // insertion order: A
    cache.set(HASH_B, makeEntry(PNG_B, HASH_B)); // order: A, B
    cache.set(HASH_C, makeEntry(PNG_C, HASH_C)); // order: A, B, C
    cache.get(HASH_A); // A accessed → order: B, C, A
    cache.get(HASH_B); // B accessed → order: C, A, B

    // Insert D at capacity → C (LRU) evicted
    cache.set(HASH_D, makeEntry(PNG_D, HASH_D));

    expect(cache.get(HASH_C)).toBeNull(); // evicted
    expect(cache.get(HASH_A)).not.toBeNull();
    expect(cache.get(HASH_B)).not.toBeNull();
    expect(cache.get(HASH_D)).not.toBeNull();
  });

  // PC-08: invalid urlHash throws at set boundary
  it('PC-08: set() with non-hex urlHash throws', () => {
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: 60_000 });
    expect(() => {
      cache.set('not-a-valid-hash', makeEntry(PNG_A, 'not-a-valid-hash'));
    }).toThrow();
  });

  it('PC-08b: set() with wrong-length urlHash throws', () => {
    const cache = new PortraitCache({ maxEntries: 4, ttlMs: 60_000 });
    const shortHash = 'a'.repeat(32); // only 32 hex chars
    expect(() => {
      cache.set(shortHash, makeEntry(PNG_A, shortHash));
    }).toThrow();
  });
});
