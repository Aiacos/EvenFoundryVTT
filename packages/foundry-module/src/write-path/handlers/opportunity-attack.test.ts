/**
 * Unit tests for opportunityAttackHandler — OAT-01..06 (Plan 13-01, Task 2).
 *
 * Tests cover:
 * - OAT-01: actor_not_found
 * - OAT-02: item_not_found
 * - OAT-03: no_attack_activity
 * - OAT-04: happy path — activity.use called with consume.action=false + opportunityAttack flag
 * - OAT-05: no_gm_connected
 * - OAT-06: generic error passthrough
 *
 * @see packages/foundry-module/src/write-path/handlers/opportunity-attack.ts
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-03)
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
      return { id: opts.chatCardId ?? 'cm-oat-1' };
    }),
  };
}

function makeWeaponItem(
  opts: { id?: string; activities?: Array<{ type: string; use?: ReturnType<typeof vi.fn> }> } = {},
) {
  const activities = opts.activities ?? [makeAttackActivity()];
  return {
    id: opts.id ?? 'item-longsword',
    name: 'Longsword',
    type: 'weapon',
    system: {
      activities: { contents: activities },
    },
  };
}

function makeActor(opts: { id?: string; items?: unknown[] } = {}) {
  const item = makeWeaponItem();
  return {
    id: opts.id ?? 'actor-fighter',
    name: 'Fighter',
    type: 'character',
    items: { contents: opts.items ?? [item] },
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

describe('opportunityAttackHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  // OAT-01: actor_not_found
  it('OAT-01: returns actor_not_found when actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: 'missing',
      item_id: 'item-longsword',
      target_id: 'token-goblin',
    });
    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  // OAT-02: item_not_found
  it('OAT-02: returns item_not_found when item_id does not match', async () => {
    const actor = makeActor({ items: [makeWeaponItem({ id: 'item-sword' })] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: actor.id,
      item_id: 'item-not-here',
      target_id: 'token-goblin',
    });
    expect(result).toEqual({ success: false, error: 'item_not_found' });
  });

  // OAT-03: no_attack_activity
  it('OAT-03: returns no_attack_activity when item has no attack-type activity', async () => {
    const item = makeWeaponItem({
      activities: [{ type: 'utility', use: vi.fn() }],
    });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: actor.id,
      item_id: item.id,
      target_id: 'token-goblin',
    });
    expect(result).toEqual({ success: false, error: 'no_attack_activity' });
  });

  // OAT-04: happy path — two-arg activity.use with opportunity attack flag
  it('OAT-04: calls activity.use with consume.action=false and opportunityAttack flag', async () => {
    const activity = makeAttackActivity({ chatCardId: 'cm-oat-ok' });
    const item = makeWeaponItem({ activities: [activity] });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: actor.id,
      item_id: item.id,
      target_id: 'token-fleeing',
    });
    expect(result).toEqual({
      success: true,
      data: { chatCardId: 'cm-oat-ok', target_id: 'token-fleeing' },
    });
    // Regression (260621): consume in usage arg, { configure: false } in dialog arg,
    // opportunityAttack chat flag in the message (3rd) arg — dnd5e 5.x use(usage, dialog, message).
    expect(activity.use).toHaveBeenCalledWith(
      { consume: { action: false } },
      { configure: false },
      { flags: { dnd5e: { opportunityAttack: true } } },
    );
  });

  // OAT-05: no_gm_connected
  it('OAT-05: returns no_gm_connected when activity.use throws GM error', async () => {
    const activity = makeAttackActivity({ throws: new Error('No connected GM') });
    const item = makeWeaponItem({ activities: [activity] });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: actor.id,
      item_id: item.id,
      target_id: 'token-goblin',
    });
    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });

  // OAT-06: generic error
  it('OAT-06: returns stringified error on generic dnd5e error', async () => {
    const activity = makeAttackActivity({ throws: new Error('some fight error') });
    const item = makeWeaponItem({ activities: [activity] });
    const actor = makeActor({ items: [item] });
    vi.stubGlobal('game', makeGameGlobal(actor));
    const { opportunityAttackHandler } = await import('./opportunity-attack.js');
    const result = await opportunityAttackHandler.handle({
      actor_id: actor.id,
      item_id: item.id,
      target_id: 'token-goblin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('some fight error');
  });
});
