/**
 * Unit tests for useItemHandler (Plan 07-02, Task 1).
 *
 * Tests cover:
 * - Happy path: actor + item + activity found → activity.use() called → success result
 * - Missing actor → { success: false, error: 'actor_not_found' }
 * - Missing item → { success: false, error: 'item_not_found' }
 * - Missing activity → { success: false, error: 'no_activity' }
 * - activity.use() throws generic error → { success: false, error: <message> }
 * - activity.use() throws with no-GM signal → { success: false, error: 'no_gm_connected' }
 *
 * @see packages/foundry-module/src/write-path/handlers/use-item.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActivity(opts: { throws?: Error | string; chatCardId?: string } = {}) {
  return {
    type: 'consumable',
    use: vi.fn().mockImplementation(async () => {
      if (opts.throws !== undefined) {
        throw opts.throws instanceof Error ? opts.throws : new Error(opts.throws);
      }
      return { id: opts.chatCardId ?? 'cm-use-1' };
    }),
  };
}

function makeItem(opts: { id?: string; activity?: ReturnType<typeof makeActivity> | null } = {}) {
  return {
    id: opts.id ?? 'item-1',
    name: 'Healing Potion',
    type: 'consumable',
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
    name: 'Bilbo',
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

describe('useItemHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success with chatCardId on happy path', async () => {
    const activity = makeActivity({ chatCardId: 'cm-use-7' });
    const item = makeItem({ id: 'potion-1', activity });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'actor-a',
      item_id: 'potion-1',
      targets: [],
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-use-7' } });
    // Regression (260621): configure-false MUST be the SECOND (dialog) arg of dnd5e 5.x
    // `use(usage, dialog, message)` — in the usage arg it left the usage dialog enabled,
    // hanging every activity use until the bridge's 10s foundry_timeout.
    expect(activity.use).toHaveBeenCalledWith({}, { configure: false });
  });

  it('returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'unknown',
      item_id: 'potion-1',
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('returns item_not_found when item is missing', async () => {
    const actor = makeActor({ id: 'actor-a', item: null });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'actor-a',
      item_id: 'no-such-potion',
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'item_not_found' });
  });

  it('returns no_activity when item has no activities', async () => {
    const item = makeItem({ id: 'potion-1', activity: null });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'actor-a',
      item_id: 'potion-1',
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'no_activity' });
  });

  it('returns error string when activity.use() throws', async () => {
    const activity = makeActivity({ throws: new Error('item exhausted') });
    const item = makeItem({ id: 'potion-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'actor-a',
      item_id: 'potion-1',
      targets: [],
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('item exhausted');
  });

  it('returns no_gm_connected on GM-offline signal (Pitfall 5)', async () => {
    const activity = makeActivity({ throws: 'no_gm_connected' });
    const item = makeItem({ id: 'potion-1', activity });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { useItemHandler } = await import('./use-item.js');

    const result = await useItemHandler.handle({
      actor_id: 'actor-a',
      item_id: 'potion-1',
      targets: [],
    });

    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  it('argsSchema validates correct input', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { useItemHandler } = await import('./use-item.js');

    const parsed = useItemHandler.argsSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'potion-1',
      targets: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('argsSchema rejects empty actor_id', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { useItemHandler } = await import('./use-item.js');

    const parsed = useItemHandler.argsSchema.safeParse({
      actor_id: '',
      item_id: 'potion-1',
      targets: [],
    });
    expect(parsed.success).toBe(false);
  });
});
