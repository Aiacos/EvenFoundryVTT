/**
 * Unit tests for log-reader (Phase 5 Plan 05-05 — LR-* discriminators).
 *
 * Covers:
 *   - LR-EMPTY:      empty game.messages → []
 *   - LR-MAP-ATTACK: attack roll flag → kind 'attack' + result
 *   - LR-MAP-DAMAGE: damage roll flag → kind 'damage'
 *   - LR-MAP-SPELL:  spell use flag → kind 'spell'
 *   - LR-MAP-FEAT:   feat use flag → kind 'feature'
 *   - LR-MAP-SAVE:   save roll flag → kind 'roll'
 *   - LR-MAP-CHAT:   unknown flag → kind 'chat' (defensive fallback)
 *   - LR-COUNT:      maxCount=N limits the returned array
 *   - LR-ACTOR-NAME: speaker.alias used for actorName
 *   - LR-MISSING-ID: message without id is skipped
 *
 * **Assumption A4 note:** Flag paths `flags.dnd5e.roll.type` and
 * `flags.dnd5e.use.type` are assumed from dnd5e 5.x conventions. This test
 * verifies the reader's defensive handling of these paths.
 *
 * @see packages/foundry-module/src/readers/log-reader.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md §Task 2
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Assumption A4
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogEventTail } from '../log-reader.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMessage(
  overrides: {
    id?: string;
    timestamp?: number;
    alias?: string;
    dnd5eRollType?: string;
    dnd5eUseType?: string;
    rollTotal?: number;
  } = {},
) {
  const flags: Record<string, unknown> = {};
  if (overrides.dnd5eRollType !== undefined) {
    flags.dnd5e = { roll: { type: overrides.dnd5eRollType } };
  } else if (overrides.dnd5eUseType !== undefined) {
    flags.dnd5e = { use: { type: overrides.dnd5eUseType } };
  }

  return {
    id: overrides.id ?? 'msg-1',
    timestamp: overrides.timestamp ?? Date.now(),
    speaker: { alias: overrides.alias ?? 'Thorin' },
    flags,
    rolls: overrides.rollTotal !== undefined ? [{ total: overrides.rollTotal }] : [],
  };
}

function stubGameMessages(messages: unknown[]) {
  vi.stubGlobal('game', {
    messages: {
      contents: messages,
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getLogEventTail', () => {
  it('LR-EMPTY: no game global → returns []', () => {
    // game is not defined in this test env by default
    const result = getLogEventTail();
    expect(result).toEqual([]);
  });

  it('LR-EMPTY-MESSAGES: empty game.messages.contents → []', () => {
    stubGameMessages([]);
    const result = getLogEventTail();
    expect(result).toEqual([]);
  });

  it('LR-MAP-ATTACK: dnd5e.roll.type=attack → kind "attack"', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'attack', rollTotal: 23 })]);
    const result = getLogEventTail();
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('attack');
  });

  it('LR-MAP-ATTACK-RESULT: attack roll includes result with hit kind and value', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'attack', rollTotal: 23 })]);
    const result = getLogEventTail();
    expect(result[0]?.result?.kind).toBe('hit');
    expect(result[0]?.result?.value).toBe(23);
  });

  it('LR-MAP-DAMAGE: dnd5e.roll.type=damage → kind "damage"', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'damage', rollTotal: 12 })]);
    const result = getLogEventTail();
    expect(result[0]?.kind).toBe('damage');
  });

  it('LR-MAP-SPELL: dnd5e.use.type=spell → kind "spell"', () => {
    stubGameMessages([makeMessage({ dnd5eUseType: 'spell' })]);
    const result = getLogEventTail();
    expect(result[0]?.kind).toBe('spell');
    expect(result[0]?.result).toBeUndefined();
  });

  it('LR-MAP-FEAT: dnd5e.use.type=feat → kind "feature"', () => {
    stubGameMessages([makeMessage({ dnd5eUseType: 'feat' })]);
    const result = getLogEventTail();
    expect(result[0]?.kind).toBe('feature');
  });

  it('LR-MAP-SAVE: dnd5e.roll.type=save → kind "roll"', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'save', rollTotal: 17 })]);
    const result = getLogEventTail();
    expect(result[0]?.kind).toBe('roll');
  });

  it('LR-MAP-CHAT: no dnd5e flags → kind "chat" (defensive fallback)', () => {
    stubGameMessages([
      makeMessage({ id: 'msg-chat' }), // no dnd5e flags in makeMessage default
    ]);
    const result = getLogEventTail();
    expect(result[0]?.kind).toBe('chat');
  });

  it('LR-COUNT: maxCount=2 limits the returned array', () => {
    const messages = Array.from({ length: 10 }, (_, i) => makeMessage({ id: `msg-${i}` }));
    stubGameMessages(messages);
    const result = getLogEventTail(2);
    expect(result).toHaveLength(2);
  });

  it('LR-ACTOR-NAME: speaker.alias used for actorName', () => {
    stubGameMessages([makeMessage({ alias: 'Goblin Arciere' })]);
    const result = getLogEventTail();
    expect(result[0]?.actorName).toBe('Goblin Arciere');
  });

  it('LR-MISSING-ID: message without id is skipped', () => {
    stubGameMessages([
      {
        id: undefined as unknown as string,
        timestamp: Date.now(),
        speaker: { alias: 'X' },
        flags: {},
        rolls: [],
      },
      makeMessage({ id: 'msg-valid' }),
    ]);
    const result = getLogEventTail();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('msg-valid');
  });

  it('LR-MISSING-ALIAS: missing speaker.alias → empty actorName', () => {
    stubGameMessages([{ id: 'msg-1', timestamp: Date.now(), flags: {}, rolls: [] }]);
    const result = getLogEventTail();
    expect(result[0]?.actorName).toBe('');
  });

  // ── WR-05 regression: description template ────────────────────────────────

  it('WR-05-ATTACK-DESCRIPTION: attack kind + actorName → "actorName — attack" (not "attack roll")', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'attack', alias: 'Thorin', rollTotal: 23 })]);
    const result = getLogEventTail();
    expect(result[0]?.description).toBe('Thorin — attack');
    expect(result[0]?.description).not.toContain('attack roll');
  });

  it('WR-05-SPELL-DESCRIPTION: spell kind + actorName → actorName only (no "roll" suffix)', () => {
    stubGameMessages([makeMessage({ dnd5eUseType: 'spell', alias: 'Lyra' })]);
    const result = getLogEventTail();
    // Must not produce "spell roll" — actor name alone is sufficient
    expect(result[0]?.description).toBe('Lyra');
    expect(result[0]?.description).not.toContain('roll');
  });

  it('WR-05-FEATURE-DESCRIPTION: feature kind + actorName → actorName only (no "roll" suffix)', () => {
    stubGameMessages([makeMessage({ dnd5eUseType: 'feat', alias: 'Aragorn' })]);
    const result = getLogEventTail();
    expect(result[0]?.description).toBe('Aragorn');
    expect(result[0]?.description).not.toContain('roll');
  });

  it('WR-05-DAMAGE-DESCRIPTION: damage kind + actorName → "actorName — damage" (roll suffix correct)', () => {
    stubGameMessages([makeMessage({ dnd5eRollType: 'damage', alias: 'Gimli', rollTotal: 12 })]);
    const result = getLogEventTail();
    expect(result[0]?.description).toBe('Gimli — damage');
  });

  it('WR-05-CHAT-DESCRIPTION: chat kind + actorName → actorName only', () => {
    stubGameMessages([makeMessage({ alias: 'DM' })]);
    const result = getLogEventTail();
    expect(result[0]?.description).toBe('DM');
    expect(result[0]?.description).not.toContain('roll');
  });

  it('WR-05-NO-ACTOR-DESCRIPTION: no actor → falls back to kind string', () => {
    stubGameMessages([{ id: 'msg-1', timestamp: Date.now(), flags: {}, rolls: [] }]);
    const result = getLogEventTail();
    // No actorName → description is just the kind
    expect(result[0]?.description).toBe('chat');
  });
});
