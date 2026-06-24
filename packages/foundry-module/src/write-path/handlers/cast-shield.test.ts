/**
 * Unit tests for castShieldHandler — CSH-01..06 (Plan 13-01, Task 2).
 *
 * Tests cover:
 * - CSH-01: actor_not_found
 * - CSH-02: spell_not_known (no Shield item on actor)
 * - CSH-03: happy path via system.identifier='shield'
 * - CSH-04: no_gm_connected error
 * - CSH-05: generic dnd5e error passthrough
 * - CSH-06: resolver priority — identifier wins over name match
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-shield.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-01)
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
      return { id: opts.chatCardId ?? 'cm-shield-1' };
    }),
  };
}

function makeShieldItem(
  opts: {
    identifier?: string;
    name?: string;
    activity?: ReturnType<typeof makeActivity> | null;
  } = {},
) {
  return {
    id: 'item-shield',
    name: opts.name ?? 'Shield',
    type: 'spell',
    system: {
      identifier: opts.identifier ?? 'shield',
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
    items: { contents: opts.items ?? [makeShieldItem()] },
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

describe('castShieldHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  // CSH-01: actor_not_found
  it('CSH-01: returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: 'missing', slot_level: 1 });
    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  // CSH-02: spell_not_known
  it('CSH-02: returns spell_not_known when actor has no Shield item', async () => {
    const actor = makeActor({ items: [] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: actor.id, slot_level: 1 });
    expect(result).toEqual({ success: false, error: 'spell_not_known' });
  });

  // CSH-03: happy path via system.identifier='shield'
  it('CSH-03: calls activity.use with spell.slot=spell1 and returns chatCardId', async () => {
    const activity = makeActivity({ chatCardId: 'cm-42' });
    const item = makeShieldItem({ activity });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: actor.id, slot_level: 1 });
    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-42' } });
    // Regression (260621): slot override in usage arg, { configure: false } in dialog arg.
    expect(activity.use).toHaveBeenCalledWith({ spell: { slot: 'spell1' } }, { configure: false });
  });

  // CSH-04: no_gm_connected
  it('CSH-04: returns no_gm_connected when activity.use throws GM error', async () => {
    const activity = makeActivity({ throws: new Error('No connected GM') });
    const actor = makeActor({ items: [makeShieldItem({ activity })] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: actor.id, slot_level: 1 });
    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  // CSH-05: generic error passthrough
  it('CSH-05: returns stringified error on generic dnd5e error', async () => {
    const activity = makeActivity({ throws: new Error('some dnd5e error') });
    const actor = makeActor({ items: [makeShieldItem({ activity })] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: actor.id, slot_level: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('some dnd5e error');
    }
  });

  // CSH-06: resolver priority — identifier wins over name match
  it('CSH-06: identifier match takes priority over name match', async () => {
    const identifierActivity = makeActivity({ chatCardId: 'correct-one' });
    const nameActivity = makeActivity({ chatCardId: 'wrong-one' });
    // Item with identifier (should be selected first)
    const itemByIdentifier = makeShieldItem({
      identifier: 'shield',
      name: 'Scudo',
      activity: identifierActivity,
    });
    // Item with name only (no identifier match)
    const itemByName = {
      id: 'item-by-name',
      name: 'shield',
      type: 'spell',
      system: { identifier: 'some-other-spell', activities: { contents: [nameActivity] } },
    };
    const actor = makeActor({ items: [itemByName, itemByIdentifier] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { castShieldHandler } = await import('./cast-shield.js');
    const result = await castShieldHandler.handle({ actor_id: actor.id, slot_level: 1 });
    expect(result).toEqual({ success: true, data: { chatCardId: 'correct-one' } });
    expect(identifierActivity.use).toHaveBeenCalled();
    expect(nameActivity.use).not.toHaveBeenCalled();
  });
});
