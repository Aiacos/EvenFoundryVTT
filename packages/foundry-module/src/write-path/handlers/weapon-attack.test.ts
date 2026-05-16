/**
 * Unit tests for weaponAttackHandler (Plan 07-02, Task 1).
 *
 * Tests cover:
 * - Happy path: actor + weapon item + attack activity found → activity.use() called
 * - Missing actor → { success: false, error: 'actor_not_found' }
 * - Missing item → { success: false, error: 'item_not_found' }
 * - No attack activity on item → { success: false, error: 'no_attack_activity' }
 * - activity.use() throws generic error → { success: false, error: <message> }
 * - activity.use() throws with no-GM signal → { success: false, error: 'no_gm_connected' }
 *
 * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAttackActivity(opts: { throws?: Error | string; chatCardId?: string } = {}) {
  return {
    type: 'attack',
    use: vi.fn().mockImplementation(async () => {
      if (opts.throws !== undefined) {
        throw opts.throws instanceof Error ? opts.throws : new Error(opts.throws);
      }
      return { id: opts.chatCardId ?? 'cm-attack-1' };
    }),
  };
}

function makeWeaponItem(opts: {
  id?: string;
  activities?: Array<{ type: string; use: ReturnType<typeof vi.fn> }>;
  noActivities?: boolean;
} = {}) {
  return {
    id: opts.id ?? 'weapon-1',
    name: 'Shortsword',
    type: 'weapon',
    system: {
      activities: opts.noActivities
        ? undefined
        : { contents: opts.activities ?? [makeAttackActivity()] },
    },
  };
}

function makeActor(opts: {
  id?: string;
  item?: ReturnType<typeof makeWeaponItem> | null;
} = {}) {
  const item = opts.item !== null ? (opts.item ?? makeWeaponItem()) : null;
  return {
    id: opts.id ?? 'actor-1',
    name: 'Aragorn',
    type: 'character',
    items: item !== null
      ? { contents: [item] }
      : { contents: [] },
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

describe('weaponAttackHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success with chatCardId on happy path', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-5' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-atk-5' } });
    expect(activity.use).toHaveBeenCalledWith({ configure: false });
  });

  it('returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'unknown',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('returns item_not_found when weapon item is missing', async () => {
    const actor = makeActor({ id: 'actor-a', item: null });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'no-such-weapon',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'item_not_found' });
  });

  it('returns no_attack_activity when item has no attack-type activity', async () => {
    // Item has activities but none with type === 'attack'
    const nonAttackActivity = { type: 'spell', use: vi.fn() };
    const item = makeWeaponItem({ id: 'sword-1', activities: [nonAttackActivity] });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'no_attack_activity' });
  });

  it('returns no_attack_activity when item has no activities at all', async () => {
    const item = makeWeaponItem({ id: 'sword-1', noActivities: true });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'no_attack_activity' });
  });

  it('returns error string when activity.use() throws', async () => {
    const activity = makeAttackActivity({ throws: new Error('roll failed') });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('roll failed');
  });

  it('returns no_gm_connected on GM-offline signal (Pitfall 5)', async () => {
    const activity = makeAttackActivity({ throws: 'No connected GM' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  it('argsSchema validates correct input', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const parsed = weaponAttackHandler.argsSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'weapon-1',
      targets: [],
      advantage: 'advantage',
    });
    expect(parsed.success).toBe(true);
  });
});
