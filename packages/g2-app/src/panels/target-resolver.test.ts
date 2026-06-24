/**
 * Unit tests for target-resolver.ts (Plan 08-02, Task 1 — TR-01..07).
 *
 * Covers:
 *   - TR-01: empty combat + empty tokens → []
 *   - TR-02: non-null combat → filters by actorId !== callerActorId, hp > 0,
 *             orders active-turn first then initiative order
 *   - TR-03: null combat + scene tokens → filters non-self tokens, scene order
 *   - TR-04: both combat + tokens → deduped (combat first, then scene-only)
 *   - TR-05: rangeHint provided → all combatants included (broad Phase 8 heuristic)
 *   - TR-06: TargetCandidate shape — readonly fields, correct types
 *   - TR-07: describeTargetRow — IT/EN format, selected indicator, truncation
 *
 * @see .planning/phases/08-manual-action-ux/08-02-PLAN.md Task 1
 * @see packages/g2-app/src/panels/target-resolver.ts
 */

import type { CombatSnapshot } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import type { TargetCandidate } from './target-resolver.js';
import { describeTargetRow, resolveValidTargets } from './target-resolver.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CALLER_ACTOR_ID = 'actor-player-001';

/** Minimal valid combat snapshot with 3 combatants. */
function makeCombat(overrides: Partial<CombatSnapshot> = {}): CombatSnapshot {
  return {
    combatId: 'combat-001',
    round: 1,
    turn: 0,
    currentCombatantId: 'c-goblin-archer',
    combatants: [
      {
        id: 'c-goblin-archer',
        name: 'GOBLIN ARCHER',
        actorId: 'actor-goblin-archer',
        initiative: 18,
        hp: 5,
        maxHp: 15,
        isCurrentTurn: true,
      },
      {
        id: 'c-player',
        name: 'Erevan',
        actorId: CALLER_ACTOR_ID,
        initiative: 14,
        hp: 35,
        maxHp: 42,
        isCurrentTurn: false,
      },
      {
        id: 'c-goblin-brute',
        name: 'GOBLIN BRUTO',
        actorId: 'actor-goblin-brute',
        initiative: 10,
        hp: 11,
        maxHp: 15,
        isCurrentTurn: false,
      },
      {
        id: 'c-shadow-dog',
        name: 'CANE OMBRA',
        actorId: 'actor-shadow-dog',
        initiative: 6,
        hp: 18,
        maxHp: 22,
        isCurrentTurn: false,
      },
    ],
    ...overrides,
  };
}

const SCENE_TOKENS: ReadonlyArray<{ id: string; name: string; actorId: string | null }> = [
  { id: 'tok-scene-npc', name: 'NPC Villager', actorId: 'actor-npc-villager' },
  { id: 'tok-scene-self', name: 'Erevan', actorId: CALLER_ACTOR_ID },
];

// ─── TR-01 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-01: null combat + empty tokens', () => {
  it('TR-01: returns empty array when combat is null and tokens is undefined', () => {
    const result = resolveValidTargets(null, undefined, CALLER_ACTOR_ID);
    expect(result).toEqual([]);
  });

  it('TR-01b: returns empty array when combat is null and tokens is empty array', () => {
    const result = resolveValidTargets(null, [], CALLER_ACTOR_ID);
    expect(result).toEqual([]);
  });
});

// ─── TR-token-uuid ──────────────────────────────────────────────────────────────

describe('resolveValidTargets — candidate.tokenId carries the token UUID for MidiQOL', () => {
  it('uses combatant.tokenUuid when present (so cast/attack resolves onto the token)', () => {
    const combat = makeCombat({
      currentCombatantId: 'c-orc',
      combatants: [
        {
          id: 'c-orc',
          tokenUuid: 'Scene.ABC.Token.XYZ',
          name: 'ORC',
          actorId: 'actor-orc',
          initiative: 12,
          hp: 10,
          maxHp: 10,
          isCurrentTurn: true,
        },
      ],
    });
    const result = resolveValidTargets(combat, undefined, CALLER_ACTOR_ID);
    expect(result).toHaveLength(1);
    // NOT the combatant id 'c-orc' — the token UUID MidiQOL needs.
    expect(result[0]?.tokenId).toBe('Scene.ABC.Token.XYZ');
  });

  it('falls back to combatant.id when tokenUuid is absent (pre-tokenUuid module build)', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    // makeCombat fixtures have no tokenUuid → tokenId is the combatant id (degraded fallback).
    expect(result.every((c) => c.tokenId.startsWith('c-'))).toBe(true);
  });
});

// ─── TR-02 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-02: combat filtering + ordering', () => {
  it('TR-02a: excludes the caller (actorId === callerActorId)', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    const ids = result.map((c) => c.actorId);
    expect(ids).not.toContain(CALLER_ACTOR_ID);
  });

  it('TR-02b: excludes defeated combatants (hp <= 0)', () => {
    const combat = makeCombat({
      combatants: [
        {
          id: 'c-dead',
          name: 'DEAD GOBLIN',
          actorId: 'actor-dead',
          initiative: 20,
          hp: 0,
          maxHp: 10,
          isCurrentTurn: false,
        },
        {
          id: 'c-alive',
          name: 'ALIVE GOBLIN',
          actorId: 'actor-alive',
          initiative: 12,
          hp: 5,
          maxHp: 10,
          isCurrentTurn: false,
        },
      ],
    });
    const result = resolveValidTargets(combat, undefined, CALLER_ACTOR_ID);
    expect(result.map((c) => c.actorId)).not.toContain('actor-dead');
    expect(result.map((c) => c.actorId)).toContain('actor-alive');
  });

  it('TR-02c: excludes combatants with null actorId', () => {
    const combat = makeCombat({
      combatants: [
        {
          id: 'c-no-actor',
          name: 'ENTITY',
          actorId: null,
          initiative: 15,
          hp: 10,
          maxHp: 20,
          isCurrentTurn: false,
        },
      ],
    });
    const result = resolveValidTargets(combat, undefined, CALLER_ACTOR_ID);
    expect(result).toHaveLength(0);
  });

  it('TR-02d: active-turn combatant (currentCombatantId) is first in output', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    // GOBLIN ARCHER has initiative 18 and isActiveTurn
    expect(result[0]?.actorId).toBe('actor-goblin-archer');
    expect(result[0]?.isActiveTurn).toBe(true);
  });

  it('TR-02e: remaining combatants follow in descending initiative order', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    // After goblin-archer (active), goblin-brute (init=10), shadow-dog (init=6)
    expect(result[1]?.actorId).toBe('actor-goblin-brute');
    expect(result[2]?.actorId).toBe('actor-shadow-dog');
  });

  it('TR-02f: isActiveTurn is false for non-active combatants', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    for (const candidate of result.slice(1)) {
      expect(candidate.isActiveTurn).toBe(false);
    }
  });
});

// ─── TR-03 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-03: null combat + scene tokens', () => {
  it('TR-03a: returns scene tokens excluding self (actorId === callerActorId)', () => {
    const result = resolveValidTargets(null, SCENE_TOKENS, CALLER_ACTOR_ID);
    const ids = result.map((c) => c.actorId);
    expect(ids).not.toContain(CALLER_ACTOR_ID);
    expect(ids).toContain('actor-npc-villager');
  });

  it('TR-03b: excludes tokens with null actorId', () => {
    const tokens = [
      { id: 'tok-null', name: 'Phantom', actorId: null },
      { id: 'tok-real', name: 'Orc', actorId: 'actor-orc' },
    ] as const;
    const result = resolveValidTargets(null, tokens, CALLER_ACTOR_ID);
    expect(result.map((c) => c.actorId)).not.toContain(null);
    expect(result.map((c) => c.actorId)).toContain('actor-orc');
  });

  it('TR-03c: scene tokens preserve scene order', () => {
    const tokens = [
      { id: 'tok-b', name: 'BEE', actorId: 'actor-b' },
      { id: 'tok-a', name: 'AYE', actorId: 'actor-a' },
    ] as const;
    const result = resolveValidTargets(null, tokens, CALLER_ACTOR_ID);
    expect(result[0]?.actorId).toBe('actor-b');
    expect(result[1]?.actorId).toBe('actor-a');
  });
});

// ─── TR-04 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-04: combat + scene combined, deduped', () => {
  it('TR-04a: combat candidates appear before scene-only tokens', () => {
    const result = resolveValidTargets(makeCombat(), SCENE_TOKENS, CALLER_ACTOR_ID);
    // combat candidates: goblin-archer, goblin-brute, shadow-dog
    // scene-only: npc-villager (not in combat)
    const ids = result.map((c) => c.actorId);
    const combatIdx = ids.indexOf('actor-goblin-archer');
    const sceneIdx = ids.indexOf('actor-npc-villager');
    expect(combatIdx).toBeLessThan(sceneIdx);
  });

  it('TR-04b: scene tokens already in combat are not duplicated', () => {
    const tokensIncludingCombatant = [
      { id: 'tok-goblin', name: 'GOBLIN ARCHER token', actorId: 'actor-goblin-archer' },
      { id: 'tok-npc', name: 'NPC', actorId: 'actor-npc-villager' },
    ] as const;
    const result = resolveValidTargets(makeCombat(), tokensIncludingCombatant, CALLER_ACTOR_ID);
    const goblinArchers = result.filter((c) => c.actorId === 'actor-goblin-archer');
    expect(goblinArchers).toHaveLength(1);
  });
});

// ─── TR-05 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-05: rangeHint broad heuristic', () => {
  it('TR-05: providing rangeHint=30 does not filter out combatants (Phase 8 broad heuristic)', () => {
    const resultWithoutRange = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    const resultWithRange = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID, 30);
    // Same number of candidates — no extra filtering on range in Phase 8
    expect(resultWithRange).toHaveLength(resultWithoutRange.length);
  });
});

// ─── TR-06 ────────────────────────────────────────────────────────────────────

describe('resolveValidTargets — TR-06: TargetCandidate shape', () => {
  it('TR-06: TargetCandidate has all required readonly fields', () => {
    const result = resolveValidTargets(makeCombat(), undefined, CALLER_ACTOR_ID);
    const candidate = result[0];
    expect(candidate).toBeDefined();
    expect(typeof candidate?.tokenId).toBe('string');
    expect(typeof candidate?.actorId).toBe('string');
    expect(typeof candidate?.name).toBe('string');
    expect(candidate?.hp).not.toBeUndefined(); // may be null or number
    expect(candidate?.isActiveTurn).toBe(true);
    expect(typeof candidate?.sourceIdx).toBe('number');
  });
});

// ─── TR-07 ────────────────────────────────────────────────────────────────────

describe('describeTargetRow — TR-07: IT/EN format + selection indicator + truncation', () => {
  const candidate: TargetCandidate = {
    tokenId: 'c-goblin-archer',
    actorId: 'actor-goblin-archer',
    name: 'GOBLIN ARCHER',
    hp: 5,
    maxHp: 15,
    ac: 13,
    isActiveTurn: true,
    sourceIdx: 0,
  };

  it('TR-07a: IT locale uses "PF" for hp label and "CA" for ac label', () => {
    const row = describeTargetRow(candidate, 'it', 0, false, 66);
    expect(row).toContain('PF');
    expect(row).toContain('CA');
  });

  it('TR-07b: EN locale uses "HP" for hp label and "AC" for ac label', () => {
    const row = describeTargetRow(candidate, 'en', 0, false, 66);
    expect(row).toContain('HP');
    expect(row).toContain('AC');
  });

  it('TR-07c: selected row has "▶" prefix indicator', () => {
    const row = describeTargetRow(candidate, 'it', 0, true, 66);
    expect(row).toContain('▶');
  });

  it('TR-07d: non-selected row does not have "▶" indicator', () => {
    const row = describeTargetRow(candidate, 'it', 0, false, 66);
    expect(row).not.toContain('▶');
  });

  it('TR-07e: row fits within the specified width (code-point count)', () => {
    const row = describeTargetRow(candidate, 'it', 0, false, 66);
    expect([...row].length).toBeLessThanOrEqual(66);
  });

  it('TR-07f: very long name is truncated when row would exceed width', () => {
    const longNameCandidate: TargetCandidate = {
      ...candidate,
      name: 'A'.repeat(50),
    };
    const row = describeTargetRow(longNameCandidate, 'it', 0, false, 66);
    expect([...row].length).toBeLessThanOrEqual(66);
  });

  it('TR-07g: hp and maxHp rendered in the row content', () => {
    const row = describeTargetRow(candidate, 'it', 0, false, 66);
    expect(row).toContain('5');
    expect(row).toContain('15');
  });
});
