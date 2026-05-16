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

function makeWeaponItem(
  opts: {
    id?: string;
    activities?: Array<{ type: string; use: ReturnType<typeof vi.fn> }>;
    noActivities?: boolean;
  } = {},
) {
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

function makeActor(opts: { id?: string; item?: ReturnType<typeof makeWeaponItem> | null } = {}) {
  const item = opts.item !== null ? (opts.item ?? makeWeaponItem()) : null;
  return {
    id: opts.id ?? 'actor-1',
    name: 'Aragorn',
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

describe('weaponAttackHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success with attackId + attacks array on happy path (Plan 07-04 shape)', async () => {
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

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as {
        attackId: string;
        attacks: Array<{ attackIndex: number; chatCardId: string | null }>;
      };
      expect(typeof data.attackId).toBe('string');
      expect(data.attacks).toHaveLength(1);
      expect(data.attacks[0]?.chatCardId).toBe('cm-atk-5');
      expect(data.attacks[0]?.attackIndex).toBe(1);
    }
    // Plan 07-04: first (and only) iteration uses consume.action: true
    expect(activity.use).toHaveBeenCalledWith({ configure: false, consume: { action: true } });
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

  // ── Plan 07-04: Path B multi-attack loop (MULTI-01) ──────────────────────────

  it('WA-MULTI-1: count: 1 (default) calls activity.use exactly once (backward-compat)', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-1' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 1,
    });

    expect(result.success).toBe(true);
    expect(activity.use).toHaveBeenCalledTimes(1);
  });

  it('WA-MULTI-2: count: 2 calls activity.use twice with correct consume.action flags', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-multi' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 2,
    });

    expect(result.success).toBe(true);
    expect(activity.use).toHaveBeenCalledTimes(2);
    // First call: consume.action = true (action economy deducted once)
    expect(activity.use).toHaveBeenNthCalledWith(1, {
      configure: false,
      consume: { action: true },
    });
    // Second call: consume.action = false (Extra Attack — no double action cost)
    expect(activity.use).toHaveBeenNthCalledWith(2, {
      configure: false,
      consume: { action: false },
    });
  });

  it('WA-MULTI-3: count: 3 calls activity.use three times', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-3' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 3,
    });

    expect(result.success).toBe(true);
    expect(activity.use).toHaveBeenCalledTimes(3);
  });

  it('WA-MULTI-4: attackId is stable across all iterations (same UUID per invocation)', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-stable' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler } = await import('./weapon-attack.js');

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 2,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as {
        attackId: string;
        attacks: Array<{ attackIndex: number; chatCardId: string | null }>;
      };
      expect(typeof data.attackId).toBe('string');
      expect(data.attackId.length).toBeGreaterThan(0);
      // Two attacks recorded under same attackId
      expect(data.attacks).toHaveLength(2);
      expect(data.attacks[0]?.attackIndex).toBe(1);
      expect(data.attacks[1]?.attackIndex).toBe(2);
    }
  });

  it('WA-MULTI-5: progress emitter is called once per iteration with correct fields', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-atk-progress' });
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    // Spy on progress emitter injection
    const { weaponAttackHandler, setMultiAttackProgressEmitter } = await import(
      './weapon-attack.js'
    );

    const progressCalls: unknown[] = [];
    setMultiAttackProgressEmitter((payload) => {
      progressCalls.push(payload);
    });

    await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 2,
    });

    expect(progressCalls).toHaveLength(2);
    const first = progressCalls[0] as {
      current: number;
      total: number;
      attackId: string;
      actorId: string;
    };
    const second = progressCalls[1] as {
      current: number;
      total: number;
      attackId: string;
      actorId: string;
    };

    expect(first.current).toBe(1);
    expect(first.total).toBe(2);
    expect(first.actorId).toBe('actor-a');
    expect(second.current).toBe(2);
    expect(second.total).toBe(2);
    // attackId is stable across iterations
    expect(first.attackId).toBe(second.attackId);

    // Clean up injected emitter
    setMultiAttackProgressEmitter(null);
  });

  it('WA-MULTI-6: activity.use throws on iteration 2 → returns failure; emitter NOT called for i=2', async () => {
    let callCount = 0;
    const activity = {
      type: 'attack',
      use: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('attack-failed-on-second');
        }
        return { id: `cm-atk-${callCount}` };
      }),
    };
    const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
    const actor = makeActor({ id: 'actor-a', item });

    vi.stubGlobal('game', makeGameGlobal(actor));

    const { weaponAttackHandler, setMultiAttackProgressEmitter } = await import(
      './weapon-attack.js'
    );

    const progressCalls: unknown[] = [];
    setMultiAttackProgressEmitter((payload) => {
      progressCalls.push(payload);
    });

    const result = await weaponAttackHandler.handle({
      actor_id: 'actor-a',
      item_id: 'sword-1',
      targets: [],
      advantage: 'normal',
      count: 3,
    });

    // Handler should fail on iteration 2
    expect(result.success).toBe(false);
    // Emitter called only once (for successful i=0)
    expect(progressCalls).toHaveLength(1);

    setMultiAttackProgressEmitter(null);
  });
});
