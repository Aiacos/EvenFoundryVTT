/**
 * Unit tests for skillCheckHandler (Phase 8 write channel — ACT-01).
 *
 * Tests cover:
 * - Happy path: actor found → rollSkill({ skill, advantage, disadvantage }) called → success
 * - advantage / disadvantage enum → correct boolean pair (never both true)
 * - Missing actor → { success: false, error: 'actor_not_found' }
 * - rollSkill throws generic error → { success: false, error: <message> }
 * - rollSkill throws no-GM signal → { success: false, error: 'no_gm_connected' }
 *
 * @see packages/foundry-module/src/write-path/handlers/skill-check.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActor(opts: { id?: string; throws?: Error | string; rollReturn?: unknown } = {}) {
  return {
    id: opts.id ?? 'actor-1',
    name: 'Bilbo',
    type: 'character',
    rollSkill: vi.fn().mockImplementation(async () => {
      if (opts.throws !== undefined) {
        throw opts.throws instanceof Error ? opts.throws : new Error(opts.throws);
      }
      return opts.rollReturn ?? [{ total: 17 }];
    }),
  };
}

function makeGameGlobal(actor: ReturnType<typeof makeActor> | null = makeActor()) {
  return {
    actors: { get: vi.fn((id: string) => (actor?.id === id ? actor : undefined)) },
    scenes: { active: null },
    users: { contents: [] },
    settings: { get: vi.fn(() => undefined), set: vi.fn(), register: vi.fn() },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    user: { isGM: true, targets: new Set() },
    messages: { contents: [], get: vi.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('skillCheckHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rolls a normal skill check on the happy path', async () => {
    const actor = makeActor({ id: 'actor-a', rollReturn: [{ total: 12 }] });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { skillCheckHandler } = await import('./skill-check.js');
    const result = await skillCheckHandler.handle({
      actor_id: 'actor-a',
      skill: 'prc',
      advantage: 'normal',
    });

    expect(result.success).toBe(true);
    expect(actor.rollSkill).toHaveBeenCalledWith(
      {
        skill: 'prc',
        advantage: false,
        disadvantage: false,
      },
      { configure: false },
    );
  });

  it('maps advantage → { advantage: true, disadvantage: false }', async () => {
    const actor = makeActor({ id: 'actor-a' });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { skillCheckHandler } = await import('./skill-check.js');
    await skillCheckHandler.handle({ actor_id: 'actor-a', skill: 'ste', advantage: 'advantage' });

    expect(actor.rollSkill).toHaveBeenCalledWith(
      {
        skill: 'ste',
        advantage: true,
        disadvantage: false,
      },
      { configure: false },
    );
  });

  it('maps disadvantage → { advantage: false, disadvantage: true }', async () => {
    const actor = makeActor({ id: 'actor-a' });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { skillCheckHandler } = await import('./skill-check.js');
    await skillCheckHandler.handle({
      actor_id: 'actor-a',
      skill: 'ath',
      advantage: 'disadvantage',
    });

    expect(actor.rollSkill).toHaveBeenCalledWith(
      {
        skill: 'ath',
        advantage: false,
        disadvantage: true,
      },
      { configure: false },
    );
  });

  it('returns actor_not_found when the actor is missing', async () => {
    vi.stubGlobal('game', makeGameGlobal(null));

    const { skillCheckHandler } = await import('./skill-check.js');
    const result = await skillCheckHandler.handle({
      actor_id: 'unknown',
      skill: 'prc',
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('normalises a generic rollSkill error to { success: false, error: <message> }', async () => {
    const actor = makeActor({ id: 'actor-a', throws: new Error('boom') });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { skillCheckHandler } = await import('./skill-check.js');
    const result = await skillCheckHandler.handle({
      actor_id: 'actor-a',
      skill: 'prc',
      advantage: 'normal',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('boom');
    }
  });

  it('normalises a no-GM error to no_gm_connected', async () => {
    const actor = makeActor({ id: 'actor-a', throws: new Error('No connected GM') });
    vi.stubGlobal('game', makeGameGlobal(actor));

    const { skillCheckHandler } = await import('./skill-check.js');
    const result = await skillCheckHandler.handle({
      actor_id: 'actor-a',
      skill: 'prc',
      advantage: 'normal',
    });

    expect(result).toEqual({ success: false, error: 'no_gm_connected' });
  });
});
