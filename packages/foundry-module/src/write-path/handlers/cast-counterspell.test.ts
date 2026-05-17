/**
 * Unit tests for castCounterspellHandler — CCSP-01..06 (Plan 13-01, Task 2).
 *
 * Tests cover:
 * - CCSP-01: actor_not_found
 * - CCSP-02: spell_not_known
 * - CCSP-03: happy path via system.identifier='counterspell' at default slot 3
 * - CCSP-04: no_gm_connected error
 * - CCSP-05: generic dnd5e error passthrough
 * - CCSP-06: upcast slot forwarding (slot_level=5 → spell.slot='spell5')
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-counterspell.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-02)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActivity(opts: { throws?: Error | string; chatCardId?: string } = {}) {
  return {
    type: 'cast',
    use: vi.fn().mockImplementation(async () => {
      if (opts.throws !== undefined) {
        throw opts.throws instanceof Error ? opts.throws : new Error(opts.throws);
      }
      return { id: opts.chatCardId ?? 'cm-cs-1' };
    }),
  };
}

function makeCounterspellItem(
  opts: {
    identifier?: string;
    name?: string;
    activity?: ReturnType<typeof makeActivity> | null;
  } = {},
) {
  return {
    id: 'item-cs',
    name: opts.name ?? 'Counterspell',
    type: 'spell',
    system: {
      identifier: opts.identifier ?? 'counterspell',
      activities:
        opts.activity === null ? undefined : { contents: [opts.activity ?? makeActivity()] },
    },
  };
}

function makeActor(opts: { id?: string; items?: unknown[] } = {}) {
  return {
    id: opts.id ?? 'actor-wiz',
    name: 'Wizard',
    type: 'character',
    items: { contents: opts.items ?? [makeCounterspellItem()] },
  };
}

function makeGameGlobal(actor: ReturnType<typeof makeActor> | null = makeActor()) {
  return {
    actors: {
      get: vi.fn((id: string) => (actor?.id === id ? actor : undefined)),
    },
    scenes: { active: null },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    combat: null,
    user: { isGM: false, targets: new Set() },
    messages: { contents: [], get: vi.fn() },
    users: { contents: [] },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('castCounterspellHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  // CCSP-01: actor_not_found
  it('CCSP-01: returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    const result = await castCounterspellHandler.handle({
      actor_id: 'missing',
      slot_level: 3,
      target_caster_id: 'enemy',
    });
    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  // CCSP-02: spell_not_known
  it('CCSP-02: returns spell_not_known when actor has no Counterspell item', async () => {
    const actor = makeActor({ items: [] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    const result = await castCounterspellHandler.handle({
      actor_id: actor.id,
      slot_level: 3,
      target_caster_id: 'enemy',
    });
    expect(result).toEqual({ success: false, error: 'spell_not_known' });
  });

  // CCSP-03: happy path default slot 3
  it('CCSP-03: calls activity.use with spell.slot=spell3 (default)', async () => {
    const activity = makeActivity({ chatCardId: 'cm-cs-ok' });
    const item = makeCounterspellItem({ activity });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    const result = await castCounterspellHandler.handle({
      actor_id: actor.id,
      slot_level: 3,
      target_caster_id: 'enemy-actor',
    });
    expect(result).toEqual({
      success: true,
      data: { chatCardId: 'cm-cs-ok', target_caster_id: 'enemy-actor' },
    });
    expect(activity.use).toHaveBeenCalledWith({
      configure: false,
      spell: { slot: 'spell3' },
    });
  });

  // CCSP-04: no_gm_connected
  it('CCSP-04: returns no_gm_connected when activity.use throws GM error', async () => {
    const activity = makeActivity({ throws: new Error('No connected GM') });
    const actor = makeActor({ items: [makeCounterspellItem({ activity })] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    const result = await castCounterspellHandler.handle({
      actor_id: actor.id,
      slot_level: 3,
      target_caster_id: 'enemy',
    });
    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  // CCSP-05: generic error
  it('CCSP-05: returns stringified error on generic dnd5e error', async () => {
    const activity = makeActivity({ throws: new Error('unexpected error') });
    const actor = makeActor({ items: [makeCounterspellItem({ activity })] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    const result = await castCounterspellHandler.handle({
      actor_id: actor.id,
      slot_level: 3,
      target_caster_id: 'enemy',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('unexpected error');
  });

  // CCSP-06: upcast slot forwarding
  it('CCSP-06: forwards slot_level=5 as spell.slot=spell5 (upcast)', async () => {
    const activity = makeActivity();
    const item = makeCounterspellItem({ activity });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castCounterspellHandler } = await import('./cast-counterspell.js');
    await castCounterspellHandler.handle({
      actor_id: actor.id,
      slot_level: 5,
      target_caster_id: 'enemy',
    });
    expect(activity.use).toHaveBeenCalledWith({
      configure: false,
      spell: { slot: 'spell5' },
    });
  });
});
