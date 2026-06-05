/**
 * Unit tests for CharacterSnapshotCache.
 *
 * Quick Task 260605-dog — bridge caches the latest character.delta per actorId.
 *
 * Test IDs:
 *   - CSC-BASIC-01: get() before any set() returns null (cold/miss for unknown id)
 *   - CSC-BASIC-02: set() then get(actorId) returns the stored snapshot
 *   - CSC-BASIC-03: second set() for the same actorId overwrites (last-write-wins)
 *   - CSC-BASIC-04: two different actorIds stored independently
 *   - CSC-BASIC-05: clear() empties the cache — get() returns null afterward
 *
 * @see ./character-snapshot-cache.ts
 * @see .planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-PLAN.md
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterSnapshotCache } from './character-snapshot-cache.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Full mock CharacterSnapshot satisfying CharacterSnapshotSchema.
 * Copied from routes/character.test.ts lines 101-143 (all required fields).
 */
const VALID_SNAPSHOT: CharacterSnapshot = {
  actorId: 'actor-thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 0,
  ac: 16,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 16, mod: 3, save: 3, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 14, mod: 2, save: 2, proficient: false, dc: 10 },
    int: { value: 8, mod: -1, save: -1, proficient: false, dc: 10 },
    wis: { value: 12, mod: 1, save: 1, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    arc: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ath: { total: 3, ability: 'str' as const, proficient: 0 as const, passive: 13 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ins: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    med: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    nat: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    prc: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
  },
};

const VALID_SNAPSHOT_B: CharacterSnapshot = {
  ...VALID_SNAPSHOT,
  actorId: 'actor-legolas',
  name: 'Legolas',
  hp: 55,
  maxHp: 70,
  level: 6,
};

const VALID_SNAPSHOT_UPDATED: CharacterSnapshot = {
  ...VALID_SNAPSHOT,
  hp: 30, // updated HP for overwrite test
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CharacterSnapshotCache', () => {
  let cache: CharacterSnapshotCache;

  beforeEach(() => {
    cache = new CharacterSnapshotCache();
  });

  it('CSC-BASIC-01: get() before any set() returns null (cold/miss)', () => {
    expect(cache.get('unknown-actor')).toBeNull();
  });

  it('CSC-BASIC-02: set() then get(actorId) returns the stored snapshot', () => {
    cache.set(VALID_SNAPSHOT);
    expect(cache.get(VALID_SNAPSHOT.actorId)).toEqual(VALID_SNAPSHOT);
  });

  it('CSC-BASIC-03: second set() for the same actorId overwrites (last-write-wins)', () => {
    cache.set(VALID_SNAPSHOT);
    cache.set(VALID_SNAPSHOT_UPDATED);
    const result = cache.get(VALID_SNAPSHOT.actorId);
    expect(result).toEqual(VALID_SNAPSHOT_UPDATED);
    expect(result?.hp).toBe(30);
  });

  it('CSC-BASIC-04: two different actorIds are stored independently', () => {
    cache.set(VALID_SNAPSHOT);
    cache.set(VALID_SNAPSHOT_B);
    expect(cache.get(VALID_SNAPSHOT.actorId)).toEqual(VALID_SNAPSHOT);
    expect(cache.get(VALID_SNAPSHOT_B.actorId)).toEqual(VALID_SNAPSHOT_B);
  });

  it('CSC-BASIC-05: clear() empties the cache — get() returns null afterward', () => {
    cache.set(VALID_SNAPSHOT);
    expect(cache.get(VALID_SNAPSHOT.actorId)).not.toBeNull();
    cache.clear();
    expect(cache.get(VALID_SNAPSHOT.actorId)).toBeNull();
  });
});
