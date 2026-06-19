/**
 * Tests for ResourceCache — RED phase (TDD Task 1 — Plan 11-03).
 *
 * ResourceCache is an in-memory store for the 4 MCP resource URIs:
 * actor://current, combat://current, scene://current, log://recent.
 *
 * Test case index:
 * 1. cache.set + cache.get round-trip → returns same value
 * 2. cache.get before any set → returns undefined
 * 3. cache.appendLog called 51 times → cache.get('log://recent') returns last 50 entries (FIFO eviction)
 * 4. cache.onUpdate('actor://current', cb) → cb called every time cache.set fires
 * 5. cache.onUpdate('log://recent', cb) → cb called every time cache.appendLog fires
 * 6. cache.clear() → all entries gone; subscribers preserved
 */

import type {
  CharacterSnapshot,
  CombatSnapshot,
  EventLogEntry,
  SceneViewport,
} from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { ResourceCache } from './resource-cache.js';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeSnapshot(hp: number): CharacterSnapshot {
  return {
    actorId: 'actor-1',
    name: 'Tester',
    hp,
    maxHp: 20,
    tempHp: 0,
    ac: 14,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: {
      str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    },
    skills: {
      acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
      dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    },
    class: 'Fighter',
    initiative: 2,
    speed: 30,
  };
}

function makeCombatSnapshot(): CombatSnapshot {
  return {
    combatId: 'combat-1',
    round: 1,
    turn: 0,
    currentCombatantId: 'combatant-1',
    combatants: [],
  };
}

function makeSceneViewport(): SceneViewport {
  return {
    sceneId: 'scene-1',
    sceneName: 'Test Scene',
    viewX: 0,
    viewY: 0,
    scale: 1.0,
    tokenIds: [],
  };
}

function makeLogEntry(seq: number): EventLogEntry {
  return {
    seq,
    ts: Date.now(),
    type: 'chat',
    actorId: null,
    content: `Entry ${seq}`,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResourceCache', () => {
  it('case 1: cache.set + cache.get round-trip → returns same value', () => {
    const cache = new ResourceCache();
    const snapshot = makeSnapshot(12);
    cache.set('actor://current', snapshot);
    const result = cache.get('actor://current');
    expect(result).toEqual(snapshot);
  });

  it('case 2: cache.get before any set → returns undefined', () => {
    const cache = new ResourceCache();
    expect(cache.get('actor://current')).toBeUndefined();
    expect(cache.get('combat://current')).toBeUndefined();
    expect(cache.get('scene://current')).toBeUndefined();
    expect(cache.get('log://recent')).toBeUndefined();
  });

  it('case 3: appendLog called 51 times → get log://recent returns last 50 entries (FIFO eviction)', () => {
    const cache = new ResourceCache();
    // Push 51 entries
    for (let i = 1; i <= 51; i++) {
      cache.appendLog(makeLogEntry(i));
    }
    const log = cache.get('log://recent');
    expect(log).toBeDefined();
    expect(log!.length).toBe(50);
    // First entry should be seq=2 (seq=1 evicted), last should be seq=51
    expect(log![0]!.seq).toBe(2);
    expect(log![49]!.seq).toBe(51);
  });

  it('case 4: cache.onUpdate actor://current → cb called every time cache.set fires', () => {
    const cache = new ResourceCache();
    const cb = vi.fn();
    cache.onUpdate('actor://current', cb);

    cache.set('actor://current', makeSnapshot(10));
    expect(cb).toHaveBeenCalledTimes(1);

    cache.set('actor://current', makeSnapshot(5));
    expect(cb).toHaveBeenCalledTimes(2);

    // Setting a different key should NOT trigger this callback
    cache.set('combat://current', makeCombatSnapshot());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('case 5: cache.onUpdate log://recent → cb called every time appendLog fires', () => {
    const cache = new ResourceCache();
    const cb = vi.fn();
    cache.onUpdate('log://recent', cb);

    cache.appendLog(makeLogEntry(1));
    expect(cb).toHaveBeenCalledTimes(1);

    cache.appendLog(makeLogEntry(2));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('case 6: cache.clear() → all entries gone; subscribers preserved', () => {
    const cache = new ResourceCache();
    const actorCb = vi.fn();
    cache.onUpdate('actor://current', actorCb);

    cache.set('actor://current', makeSnapshot(10));
    cache.set('combat://current', makeCombatSnapshot());
    cache.set('scene://current', makeSceneViewport());
    cache.appendLog(makeLogEntry(1));

    cache.clear();

    // All entries gone
    expect(cache.get('actor://current')).toBeUndefined();
    expect(cache.get('combat://current')).toBeUndefined();
    expect(cache.get('scene://current')).toBeUndefined();
    expect(cache.get('log://recent')).toBeUndefined();

    // Subscribers preserved — cb was called once before clear; now set again
    cache.set('actor://current', makeSnapshot(15));
    expect(actorCb).toHaveBeenCalledTimes(2); // 1 before clear + 1 after
  });

  it('case 7 (bonus): set/get for all 3 non-log resources works correctly', () => {
    const cache = new ResourceCache();
    const combat = makeCombatSnapshot();
    const scene = makeSceneViewport();

    cache.set('combat://current', combat);
    cache.set('scene://current', scene);

    expect(cache.get('combat://current')).toEqual(combat);
    expect(cache.get('scene://current')).toEqual(scene);
  });
});
