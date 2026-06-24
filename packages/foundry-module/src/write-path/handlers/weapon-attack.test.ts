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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    // FIX-B/C: rollAttack spy so the MidiQOL-absent branch can be asserted to
    // NEVER call it (no double-roll hazard — research §2). Default no-op resolve.
    rollAttack: vi.fn().mockResolvedValue({}),
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

function makeGameGlobal(
  actor: ReturnType<typeof makeActor> | null = makeActor(),
  opts: { midiActive?: boolean; targets?: Set<unknown> } = {},
) {
  const midiActive = opts.midiActive ?? false;
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
    user: { isGM: false, targets: opts.targets ?? new Set() },
    messages: { contents: [], get: vi.fn() },
    // FIX-B/C: capability detection surface. midi-qol module reports `active`
    // per the `midiActive` flag (default false → all existing cases stay vanilla).
    modules: {
      get: vi.fn((id: string) => (id === 'midi-qol' ? { active: midiActive } : undefined)),
    },
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
    // Regression (260621): consume in usage arg, { configure: false } in dialog arg.
    expect(activity.use).toHaveBeenCalledWith({ consume: { action: true } }, { configure: false });
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
    expect(activity.use).toHaveBeenNthCalledWith(
      1,
      { consume: { action: true } },
      { configure: false },
    );
    // Second call: consume.action = false (Extra Attack — no double action cost)
    expect(activity.use).toHaveBeenNthCalledWith(
      2,
      { consume: { action: false } },
      { configure: false },
    );
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

  // ── FIX-B / FIX-C: capability-split advantage + targets (260529-eer) ─────────

  describe('MidiQOL present — completeActivityUse forwarding', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('M1: advantage + targets → completeActivityUse(activity, {midiOptions:{targetUuids, advantage:true, disadvantage:false}}); activity.use NOT called', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-midi-1' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: true }));
      const completeActivityUse = vi.fn().mockResolvedValue({ id: 'cm-midi-1' });
      vi.stubGlobal('MidiQOL', { completeActivityUse });

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      const result = await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: ['tok-a', 'tok-b'],
        advantage: 'advantage',
      });

      expect(result.success).toBe(true);
      expect(completeActivityUse).toHaveBeenCalledTimes(1);
      const [firstArg, secondArg] = completeActivityUse.mock.calls[0] as [
        unknown,
        { midiOptions: Record<string, unknown> },
      ];
      expect(firstArg).toBe(activity);
      expect(secondArg.midiOptions).toEqual({
        targetUuids: ['tok-a', 'tok-b'],
        advantage: true,
        disadvantage: false,
      });
      expect(activity.use).not.toHaveBeenCalled();
    });

    it('M2: advantage=disadvantage → midiOptions.advantage=false, disadvantage=true', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-midi-2' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: true }));
      const completeActivityUse = vi.fn().mockResolvedValue({ id: 'cm-midi-2' });
      vi.stubGlobal('MidiQOL', { completeActivityUse });

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: [],
        advantage: 'disadvantage',
      });

      const [, secondArg] = completeActivityUse.mock.calls[0] as [
        unknown,
        { midiOptions: Record<string, unknown> },
      ];
      expect(secondArg.midiOptions).toEqual({
        targetUuids: [],
        advantage: false,
        disadvantage: true,
      });
      expect(activity.use).not.toHaveBeenCalled();
    });

    it('M3: count=2 → completeActivityUse called twice, each carrying correct midiOptions (INV-2 fields only)', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-midi-3' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: true }));
      const completeActivityUse = vi.fn().mockResolvedValue({ id: 'cm-midi-3' });
      vi.stubGlobal('MidiQOL', { completeActivityUse });

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      const result = await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: ['tok-a'],
        advantage: 'advantage',
        count: 2,
      });

      expect(result.success).toBe(true);
      expect(completeActivityUse).toHaveBeenCalledTimes(2);
      // Assert ONLY the INV-2-verified midiOptions fields (not the unverified
      // per-iteration consume.action economy — research §5, hardware-deferred).
      for (const call of completeActivityUse.mock.calls) {
        const second = call[1] as { midiOptions: Record<string, unknown> };
        expect(second.midiOptions).toEqual({
          targetUuids: ['tok-a'],
          advantage: true,
          disadvantage: false,
        });
      }
      expect(activity.use).not.toHaveBeenCalled();
    });
  });

  describe('MidiQOL absent — vanilla behavior preserved (no roll, no hook)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('V1: advantage requested but MidiQOL absent → activity.use exactly once with consume.action:true; single console.warn; rollAttack NEVER called; no preRollAttackV2 hook', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-v1' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: false }));
      // Prove the `typeof MidiQOL !== 'undefined'` guard holds when undefined.
      vi.stubGlobal('MidiQOL', undefined);
      const hooksOn = vi.fn();
      vi.stubGlobal('Hooks', { on: hooksOn, once: vi.fn() });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      const result = await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: [],
        advantage: 'advantage',
      });

      expect(result.success).toBe(true);
      // Vanilla call EXACTLY as today (single call, consume.action:true).
      expect(activity.use).toHaveBeenCalledTimes(1);
      expect(activity.use).toHaveBeenCalledWith(
        { consume: { action: true } },
        { configure: false },
      );
      // CRITICAL: no double-roll — rollAttack must NEVER be invoked.
      expect(activity.rollAttack).not.toHaveBeenCalled();
      // No preRollAttackV2 hook registered in the vanilla branch.
      expect(hooksOn).not.toHaveBeenCalledWith('dnd5e.preRollAttackV2', expect.anything());
      // Exactly one honest warn mentioning advantage + MidiQOL.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0]?.[0]);
      expect(msg).toMatch(/advantage/i);
      expect(msg).toMatch(/midi-?qol/i);

      warnSpy.mockRestore();
    });

    it('V2: targets requested but MidiQOL absent → single console.warn (targets+MidiQOL); activity.use as today; rollAttack NEVER called; game.user.targets NEVER mutated', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-v2' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      const userTargets = new Set();
      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: false, targets: userTargets }));
      vi.stubGlobal('MidiQOL', undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      const result = await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: ['tok-a'],
        advantage: 'normal',
      });

      expect(result.success).toBe(true);
      expect(activity.use).toHaveBeenCalledTimes(1);
      expect(activity.use).toHaveBeenCalledWith(
        { consume: { action: true } },
        { configure: false },
      );
      expect(activity.rollAttack).not.toHaveBeenCalled();
      // game.user.targets must NEVER be mutated (v13 per-user pitfall).
      expect(userTargets.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0]?.[0]);
      expect(msg).toMatch(/target/i);
      expect(msg).toMatch(/midi-?qol/i);

      warnSpy.mockRestore();
    });

    it('B1 (backward-compat): advantage=normal + targets=[] → activity.use with consume.action:true, NO rollAttack, NO warn, NO completeActivityUse', async () => {
      const activity = makeAttackActivity({ chatCardId: 'cm-b1' });
      const item = makeWeaponItem({ id: 'sword-1', activities: [activity] });
      const actor = makeActor({ id: 'actor-a', item });

      vi.stubGlobal('game', makeGameGlobal(actor, { midiActive: false }));
      vi.stubGlobal('MidiQOL', undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { weaponAttackHandler } = await import('./weapon-attack.js');

      const result = await weaponAttackHandler.handle({
        actor_id: 'actor-a',
        item_id: 'sword-1',
        targets: [],
        advantage: 'normal',
      });

      expect(result.success).toBe(true);
      expect(activity.use).toHaveBeenCalledTimes(1);
      expect(activity.use).toHaveBeenCalledWith(
        { consume: { action: true } },
        { configure: false },
      );
      expect(activity.rollAttack).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
