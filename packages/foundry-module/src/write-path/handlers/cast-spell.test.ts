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
    expect(activity.use).toHaveBeenCalledWith({ configure: false });
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
});
