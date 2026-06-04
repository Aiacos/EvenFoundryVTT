/**
 * Unit tests for CharacterListCache.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * Test IDs:
 *   - CLC-BASIC-01: get() before any set() returns null (cold cache)
 *   - CLC-BASIC-02: set() overwrites the previous snapshot (last-write-wins)
 *   - CLC-BASIC-03: clear() resets the cache to null
 *
 * @see ./character-list-cache.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import type { CharacterListSnapshot } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterListCache } from './character-list-cache.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSnapshot(name: string): CharacterListSnapshot {
  return {
    characters: [{ actorId: `actor-${name}`, name, level: 5 }],
    source: 'foundry-world',
    count: 1,
    generatedAt: 1000,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CharacterListCache', () => {
  let cache: CharacterListCache;

  beforeEach(() => {
    cache = new CharacterListCache();
  });

  it('CLC-BASIC-01: get() before any set() returns null (cold cache)', () => {
    expect(cache.get()).toBeNull();
  });

  it('CLC-BASIC-02: set() overwrites previous snapshot (last-write-wins)', () => {
    const first = makeSnapshot('Aragorn');
    const second = makeSnapshot('Legolas');
    cache.set(first);
    expect(cache.get()).toBe(first);
    cache.set(second);
    expect(cache.get()).toBe(second);
  });

  it('CLC-BASIC-03: clear() resets the cache to null', () => {
    cache.set(makeSnapshot('to-clear'));
    expect(cache.get()).not.toBeNull();
    cache.clear();
    expect(cache.get()).toBeNull();
  });

  it('characters accessible via .get()?.characters ?? []', () => {
    const snapshot = makeSnapshot('Gimli');
    cache.set(snapshot);
    expect(cache.get()?.characters ?? []).toHaveLength(1);
    cache.clear();
    expect(cache.get()?.characters ?? []).toHaveLength(0);
  });
});
