import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchTool, moduleIdempotencyStore, TOOL_IDS } from '../tool-registry.js';
import { endTurnHandler } from './end-turn.js';
import './index.js';

function combat(extra: Record<string, unknown> = {}) {
  const c = {
    id: 'c1',
    round: 2,
    turn: 0,
    started: true,
    combatant: { actorId: 'thorin' },
    combatants: { contents: [] },
    nextTurn: vi.fn(async () => {
      c.turn = 1;
      return c;
    }),
    ...extra,
  };
  return c;
}

function install(c: unknown): void {
  vi.stubGlobal('game', {
    combat: c,
    user: { id: 'gm1', isGM: true },
    users: { contents: [{ id: 'gm1', isGM: true }] },
  });
  vi.stubGlobal('ChatMessage', { create: vi.fn(async () => ({})) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  moduleIdempotencyStore.clear();
});

describe('endTurnHandler', () => {
  it('ET-01 advances the turn when the current combatant is the actor', async () => {
    const c = combat();
    install(c);
    const r = await endTurnHandler.handle({ actor_id: 'thorin' });
    expect(c.nextTurn).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ success: true, data: { combatId: 'c1', round: 2, turn: 1 } });
  });

  it('ET-02 refuses when it is somebody else’s turn (no nextTurn call)', async () => {
    const c = combat({ combatant: { actorId: 'goblin' } });
    install(c);
    expect(await endTurnHandler.handle({ actor_id: 'thorin' })).toEqual({
      success: false,
      error: 'not_your_turn',
    });
    install(combat({ combatant: null }));
    expect((await endTurnHandler.handle({ actor_id: 'thorin' })).success).toBe(false);
    expect(c.nextTurn).not.toHaveBeenCalled();
  });

  it('ET-03 no combat / not started', async () => {
    install(null);
    expect(await endTurnHandler.handle({ actor_id: 'thorin' })).toEqual({
      success: false,
      error: 'no_combat',
    });
    install(combat({ started: false }));
    expect(await endTurnHandler.handle({ actor_id: 'thorin' })).toEqual({
      success: false,
      error: 'combat_not_started',
    });
  });

  it('ET-04 nextTurn failures are normalised', async () => {
    install(
      combat({
        nextTurn: vi.fn(async () => {
          throw new Error('No connected GM');
        }),
      }),
    );
    expect(await endTurnHandler.handle({ actor_id: 'thorin' })).toEqual({
      success: false,
      error: 'no_gm_connected',
    });
    install(
      combat({
        nextTurn: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    );
    expect(await endTurnHandler.handle({ actor_id: 'thorin' })).toEqual({
      success: false,
      error: 'boom',
    });
  });

  it('ET-05 is registered and reachable only through dispatchTool (ADR-0011)', async () => {
    expect(TOOL_IDS).toContain('end-turn');
    const c = combat();
    install(c);
    const r = await dispatchTool('end-turn', {
      args: { actor_id: 'thorin' },
      idempotencyKey: 'k1',
      bearer: 'g2:u',
    });
    expect(r.success).toBe(true);
    const bad = await dispatchTool('end-turn', {
      args: { actor_id: 'thorin', extra: 1 },
      idempotencyKey: 'k2',
      bearer: 'g2:u',
    });
    expect(bad.success).toBe(false);
    expect(c.nextTurn).toHaveBeenCalledTimes(1);
  });
});
