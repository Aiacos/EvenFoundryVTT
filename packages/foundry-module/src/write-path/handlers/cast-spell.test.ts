/**
 * Unit tests for castSpellHandler (Plan 07-02, Task 1).
 *
 * Tests cover:
 * - Happy path: actor + item + activity found → activity.use() called → success result
 * - Missing actor → { success: false, error: 'actor_not_found' }
 * - Missing item → { success: false, error: 'item_not_found' }
 * - Missing activity → { success: false, error: 'no_activity' }
 * - activity.use() throws generic error → { success: false, error: <message> }
 * - activity.use() throws with no-GM signal → { success: false, error: 'no_gm_connected' }
 *
 * Pattern: vi.stubGlobal('game', ...) — same pattern as module.test.ts (canonical).
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActivity(opts: { throws?: Error | string; chatCardId?: string } = {}) {
  return {
    type: 'spell',
    use: vi.fn().mockImplementation(async () => {
      if (opts.throws !== undefined) {
        throw opts.throws instanceof Error ? opts.throws : new Error(opts.throws);
      }
      return { id: opts.chatCardId ?? 'cm-1' };
    }),
  };
}

function makeItem(opts: { id?: string; activity?: ReturnType<typeof makeActivity> | null } = {}) {
  return {
    id: opts.id ?? 'item-1',
    name: 'Fireball',
    type: 'spell',
    system: {
      activities:
        opts.activity === null ? undefined : { contents: [opts.activity ?? makeActivity()] },
    },
  };
}

function makeActor(opts: { id?: string; item?: ReturnType<typeof makeItem> | null } = {}) {
  const item = opts.item !== null ? (opts.item ?? makeItem()) : null;
  return {
    id: opts.id ?? 'actor-1',
    name: 'Gandalf',
    type: 'character',
    items: item !== null ? { contents: [item] } : { contents: [] },
  };
}

function makeGameGlobal(actor: ReturnType<typeof makeActor> | null = makeActor()) {
  return {
    actors: {
      get: vi.fn((id: string) => (actor?.id === id ? actor : undefined)),
    },
    scenes: { active: null },
    users: { contents: [] },
    settings: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    combat: null,
    user: { isGM: false, targets: new Set() },
    messages: { contents: [], get: vi.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('castSpellHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success with chatCardId on happy path', async () => {
    const activity = makeActivity({ chatCardId: 'cm-42' });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
      slot_level: 3,
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-42' } });
    // Plan 09-04: slot_level=3 → spell.slot override included (CS-SLOT-02)
    expect(activity.use).toHaveBeenCalledWith({
      configure: false,
      spell: { slot: 'spell3' },
    });
  });

  it('returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'unknown-actor',
      spell_id: 'spell-1',
      slot_level: 1,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('returns item_not_found when item is missing from actor', async () => {
    const actor = makeActor({ id: 'actor-a', item: null });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'no-such-spell',
      slot_level: 1,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'item_not_found' });
  });

  it('returns no_activity when item has no activities', async () => {
    const item = makeItem({ id: 'spell-1', activity: null });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
      slot_level: 2,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'no_activity' });
  });

  it('returns error string when activity.use() throws a generic error', async () => {
    const activity = makeActivity({ throws: new Error('dnd5e internal error') });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
      slot_level: 1,
      targets: [],
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('dnd5e internal error');
  });

  it('returns no_gm_connected when activity.use() throws a no-GM signal (Pitfall 5)', async () => {
    const activity = makeActivity({ throws: new Error('No connected GM') });
    const item = makeItem({ id: 'spell-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-1',
      slot_level: 1,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  it('argsSchema validates correct input', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { castSpellHandler } = await import('./cast-spell.js');

    const parsed = castSpellHandler.argsSchema.safeParse({
      actor_id: 'actor-1',
      spell_id: 'spell-1',
      slot_level: 3,
      targets: ['tok-1'],
    });
    expect(parsed.success).toBe(true);
  });

  it('argsSchema rejects missing actor_id', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { castSpellHandler } = await import('./cast-spell.js');

    const parsed = castSpellHandler.argsSchema.safeParse({
      spell_id: 'spell-1',
      slot_level: 1,
      targets: [],
    });
    expect(parsed.success).toBe(false);
  });

  // ─── Plan 09-03: Concentration conflict integration tests ─────────────────

  /**
   * CS-CONC-01: concentration spell + active concentration → typed error, no activity.use.
   */
  it('CS-CONC-01: returns concentration-required when actor has active concentration and spell requires it', async () => {
    const activity = makeActivity({ chatCardId: 'cm-1' });
    // Spell with concentration = true AND system.components.concentration set
    const item = {
      id: 'spell-bless',
      name: 'Bless',
      type: 'spell',
      system: {
        components: { concentration: true },
        activities: { contents: [activity] },
      },
    };
    const actor = {
      id: 'actor-a',
      name: 'Gandalf',
      type: 'character',
      items: { contents: [item] },
      effects: {
        contents: [
          {
            id: 'eff-hold-person',
            name: 'Hold Person',
            statuses: new Set(['concentrating']),
            flags: { dnd5e: { item: { name: 'Hold Person' } } },
          },
        ],
      },
    };

    vi.stubGlobal('game', {
      actors: { get: vi.fn((id: string) => (actor.id === id ? actor : undefined)) },
      scenes: { active: null },
      users: { contents: [] },
      settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
      i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
      combat: null,
      user: { isGM: false, targets: new Set() },
      messages: { contents: [], get: vi.fn() },
    });

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-a',
      spell_id: 'spell-bless',
      slot_level: 1,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'concentration-required' });
    // activity.use must NOT have been called
    expect(activity.use).not.toHaveBeenCalled();
  });

  /**
   * CS-CONC-02: concentration conflict → emitter called with CONC_CONFLICT_TYPE + actorId populated.
   */
  it('CS-CONC-02: calls setConcConflictEmitter callback with CONC_CONFLICT_TYPE and actorId populated', async () => {
    const activity = makeActivity({ chatCardId: 'cm-1' });
    const item = {
      id: 'spell-bless',
      name: 'Bless',
      type: 'spell',
      system: {
        components: { concentration: true },
        activities: { contents: [activity] },
      },
    };
    const actor = {
      id: 'actor-b',
      name: 'Wizard',
      type: 'character',
      items: { contents: [item] },
      effects: {
        contents: [
          {
            id: 'eff-haste',
            name: 'Haste',
            statuses: new Set(['concentrating']),
            flags: { dnd5e: { item: { name: 'Haste' } } },
          },
        ],
      },
    };

    vi.stubGlobal('game', {
      actors: { get: vi.fn((id: string) => (actor.id === id ? actor : undefined)) },
      scenes: { active: null },
      users: { contents: [] },
      settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
      i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
      combat: null,
      user: { isGM: false, targets: new Set() },
      messages: { contents: [], get: vi.fn() },
    });

    const { castSpellHandler, setConcConflictEmitter } = await import('./cast-spell.js');

    const emitterSpy = vi.fn();
    setConcConflictEmitter(emitterSpy);

    await castSpellHandler.handle({
      actor_id: 'actor-b',
      spell_id: 'spell-bless',
      slot_level: 1,
      targets: [],
    });

    expect(emitterSpy).toHaveBeenCalledOnce();
    const [type, payload] = emitterSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(type).toBe('conc.conflict');
    expect(payload.actorId).toBe('actor-b');
    expect(payload.currentConcentrationName).toBe('Haste');
    expect(payload.newSpellName).toBe('Bless');

    // Reset emitter
    setConcConflictEmitter(null);
  });

  /**
   * CS-CONC-03: no concentration conflict (cantrip / non-conc spell / first conc) → activity.use called.
   */
  it('CS-CONC-03: no conflict when spell does not require concentration → activity.use called normally', async () => {
    const activity = makeActivity({ chatCardId: 'cm-3' });
    // Cantrip — no concentration component
    const item = {
      id: 'spell-firebolt',
      name: 'Fire Bolt',
      type: 'spell',
      system: {
        components: { concentration: false },
        activities: { contents: [activity] },
      },
    };
    const actor = {
      id: 'actor-c',
      name: 'Wizard',
      type: 'character',
      items: { contents: [item] },
      effects: {
        contents: [
          {
            id: 'eff-hold-person',
            name: 'Hold Person',
            statuses: new Set(['concentrating']),
            flags: {},
          },
        ],
      },
    };

    vi.stubGlobal('game', {
      actors: { get: vi.fn((id: string) => (actor.id === id ? actor : undefined)) },
      scenes: { active: null },
      users: { contents: [] },
      settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
      i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
      combat: null,
      user: { isGM: false, targets: new Set() },
      messages: { contents: [], get: vi.fn() },
    });

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-c',
      spell_id: 'spell-firebolt',
      slot_level: 0,
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-3' } });
    expect(activity.use).toHaveBeenCalledOnce();
  });

  // ─── Plan 09-04: slot_level forwarding tests (CS-SLOT-01..04) ───────────────

  /**
   * CS-SLOT-01: cantrip path (slot_level=0) → activity.use called WITHOUT spell.slot override.
   */
  it('CS-SLOT-01: slot_level=0 (cantrip) → activity.use called without spell.slot', async () => {
    const activity = makeActivity({ chatCardId: 'cm-cantrip' });
    const item = makeItem({ id: 'spell-firebolt', activity });
    const actor = makeActor({ id: 'actor-cantrip', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-cantrip',
      spell_id: 'spell-firebolt',
      slot_level: 0,
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-cantrip' } });
    // No spell.slot override for cantrips
    expect(activity.use).toHaveBeenCalledWith({ configure: false });
  });

  /**
   * CS-SLOT-02: slot_level=3 → activity.use called with spell.slot: 'spell3'.
   */
  it('CS-SLOT-02: slot_level=3 → activity.use called with spell.slot: spell3', async () => {
    const activity = makeActivity({ chatCardId: 'cm-3rd' });
    const item = makeItem({ id: 'spell-fireball', activity });
    const actor = makeActor({ id: 'actor-slot3', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-slot3',
      spell_id: 'spell-fireball',
      slot_level: 3,
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-3rd' } });
    expect(activity.use).toHaveBeenCalledWith({
      configure: false,
      spell: { slot: 'spell3' },
    });
  });

  /**
   * CS-SLOT-03: slot_level=5 → activity.use called with spell.slot: 'spell5' (upcast).
   */
  it('CS-SLOT-03: slot_level=5 → activity.use called with spell.slot: spell5', async () => {
    const activity = makeActivity({ chatCardId: 'cm-5th' });
    const item = makeItem({ id: 'spell-fireball', activity });
    const actor = makeActor({ id: 'actor-slot5', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-slot5',
      spell_id: 'spell-fireball',
      slot_level: 5,
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-5th' } });
    expect(activity.use).toHaveBeenCalledWith({
      configure: false,
      spell: { slot: 'spell5' },
    });
  });

  /**
   * CS-SLOT-04: concentration check (Plan 09-03) fires BEFORE slot expansion —
   * slot_level is irrelevant when blocked by concentration conflict.
   */
  it('CS-SLOT-04: concentration check fires before slot expansion — slot_level irrelevant when blocked', async () => {
    const activity = makeActivity({ chatCardId: 'cm-slot4-blocked' });
    const item = {
      id: 'spell-bless-slot4',
      name: 'Bless',
      type: 'spell',
      system: {
        components: { concentration: true },
        activities: { contents: [activity] },
      },
    };
    const actor = {
      id: 'actor-conc-slot',
      name: 'Cleric',
      type: 'character',
      items: { contents: [item] },
      effects: {
        contents: [
          {
            id: 'eff-existing',
            name: 'Bless',
            statuses: new Set(['concentrating']),
            flags: { dnd5e: { item: { name: 'Bless' } } },
          },
        ],
      },
    };

    vi.stubGlobal('game', {
      actors: { get: vi.fn((id: string) => (actor.id === id ? actor : undefined)) },
      scenes: { active: null },
      users: { contents: [] },
      settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
      i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
      combat: null,
      user: { isGM: false, targets: new Set() },
      messages: { contents: [], get: vi.fn() },
    });

    const { castSpellHandler } = await import('./cast-spell.js');

    const result = await castSpellHandler.handle({
      actor_id: 'actor-conc-slot',
      spell_id: 'spell-bless-slot4',
      slot_level: 4, // upcast attempt — irrelevant, blocked by concentration
      targets: [],
    });

    // Concentration check fires first; activity.use never called regardless of slot_level
    expect(result).toEqual({ success: false, error: 'concentration-required' });
    expect(activity.use).not.toHaveBeenCalled();
  });

  /**
   * CS-CONC-04: emitter throws → still returns typed error (fire-and-forget).
   */
  it('CS-CONC-04: still returns concentration-required even when emitter throws', async () => {
    const activity = makeActivity({ chatCardId: 'cm-4' });
    const item = {
      id: 'spell-haste',
      name: 'Haste',
      type: 'spell',
      system: {
        components: { concentration: true },
        activities: { contents: [activity] },
      },
    };
    const actor = {
      id: 'actor-d',
      name: 'Cleric',
      type: 'character',
      items: { contents: [item] },
      effects: {
        contents: [
          {
            id: 'eff-bless',
            name: 'Bless',
            statuses: ['concentrating'],
            flags: {},
          },
        ],
      },
    };

    vi.stubGlobal('game', {
      actors: { get: vi.fn((id: string) => (actor.id === id ? actor : undefined)) },
      scenes: { active: null },
      users: { contents: [] },
      settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
      i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
      combat: null,
      user: { isGM: false, targets: new Set() },
      messages: { contents: [], get: vi.fn() },
    });

    const { castSpellHandler, setConcConflictEmitter } = await import('./cast-spell.js');

    // Emitter that throws — should not propagate
    setConcConflictEmitter(() => {
      throw new Error('emitter failed');
    });

    const result = await castSpellHandler.handle({
      actor_id: 'actor-d',
      spell_id: 'spell-haste',
      slot_level: 3,
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'concentration-required' });
    expect(activity.use).not.toHaveBeenCalled();

    // Reset emitter
    setConcConflictEmitter(null);
  });
});
