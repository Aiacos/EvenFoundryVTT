/**
 * Unit tests for handleCharacterSnapshotEnvelope.
 *
 * Quick Task 260605-dog — bridge caches the latest character.delta per actorId.
 *
 * Test IDs:
 *   - CSH-01: valid character.delta with a full CharacterSnapshot → returns true + cache written
 *   - CSH-02: wrong type → returns false + cache untouched
 *   - CSH-03: type matches but payload fails schema → returns true (handled) + NO cache write
 *
 * @see ./character-snapshot-handler.ts
 * @see .planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-PLAN.md
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterSnapshotCache } from '../cache/character-snapshot-cache.js';
import { handleCharacterSnapshotEnvelope } from './character-snapshot-handler.js';

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
  class: 'Fighter',
  initiative: 2,
  speed: 25,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleCharacterSnapshotEnvelope', () => {
  let cache: CharacterSnapshotCache;

  beforeEach(() => {
    cache = new CharacterSnapshotCache();
  });

  it('CSH-01: valid character.delta → returns true AND cache written', () => {
    const result = handleCharacterSnapshotEnvelope('character.delta', VALID_SNAPSHOT, cache);
    expect(result).toBe(true);
    expect(cache.get(VALID_SNAPSHOT.actorId)).toEqual(VALID_SNAPSHOT);
  });

  it('CSH-02: wrong type → returns false AND cache untouched', () => {
    const result = handleCharacterSnapshotEnvelope('r1.spells.available', VALID_SNAPSHOT, cache);
    expect(result).toBe(false);
    // Cache stays cold — nothing written
    expect(cache.get(VALID_SNAPSHOT.actorId)).toBeNull();
  });

  it('CSH-03: type matches but payload fails schema → returns true AND no cache write', () => {
    // Invalid payload: only actorId present, missing all required fields
    const result = handleCharacterSnapshotEnvelope('character.delta', { actorId: 'x' }, cache);
    expect(result).toBe(true); // handled (type matched) but body rejected
    // Cache stays cold — invalid body is never written (T-dog-01)
    expect(cache.get('x')).toBeNull();
  });
});
