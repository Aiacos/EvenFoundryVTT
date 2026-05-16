/**
 * Unit tests for dropConcentrationHandler (Plan 07-05 — CONC-01).
 *
 * Covers:
 * - Happy path: resolves actor + effect + calls effect.delete() → success
 * - Missing actor → actor_not_found error code
 * - Missing effect → effect_not_found error code
 * - delete throws generic error → error string in result
 * - delete throws "No connected GM" → normalized to no_gm_connected
 * - argsSchema rejects empty actor_id / effect_id
 *
 * @see packages/foundry-module/src/write-path/handlers/drop-concentration.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mocks ─────────────────────────────────────────────────────

function makeEffectMock(id: string, deleteFn?: () => Promise<unknown>) {
  return {
    id,
    name: 'Concentrazione',
    flags: { dnd5e: { concentrating: true } },
    delete: vi.fn(deleteFn ?? (() => Promise.resolve({ id }))),
  };
}

function makeActorMock(actorId: string, effectIds: string[] = ['eff-conc-1']) {
  const effects = effectIds.map((eid) => makeEffectMock(eid));
  return {
    id: actorId,
    name: 'Gandalf',
    type: 'character',
    effects: {
      contents: effects,
    },
  };
}

function makeGameMock(actors: Record<string, ReturnType<typeof makeActorMock>>) {
  return {
    actors: {
      get: vi.fn((actorId: string) => actors[actorId] ?? undefined),
    },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'en', localize: vi.fn() },
    combat: null,
    user: { isGM: true, targets: new Set() },
    users: { get: vi.fn() },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dropConcentrationHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('happy path: resolves actor + effect and calls effect.delete() → returns success', async () => {
    const actorMock = makeActorMock('actor-1', ['eff-conc-1']);
    const gameMock = makeGameMock({ 'actor-1': actorMock });
    vi.stubGlobal('game', gameMock);

    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const result = await dropConcentrationHandler.handle({
      actor_id: 'actor-1',
      effect_id: 'eff-conc-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { effectId: string }).effectId).toBe('eff-conc-1');
    }
    expect(actorMock.effects.contents[0]?.delete).toHaveBeenCalledTimes(1);
  });

  it('returns actor_not_found when actor is not in game.actors', async () => {
    const gameMock = makeGameMock({});
    vi.stubGlobal('game', gameMock);

    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const result = await dropConcentrationHandler.handle({
      actor_id: 'unknown-actor',
      effect_id: 'eff-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('actor_not_found');
    }
  });

  it('returns effect_not_found when effectId is not on the actor', async () => {
    const actorMock = makeActorMock('actor-1', ['eff-conc-1']);
    const gameMock = makeGameMock({ 'actor-1': actorMock });
    vi.stubGlobal('game', gameMock);

    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const result = await dropConcentrationHandler.handle({
      actor_id: 'actor-1',
      effect_id: 'nonexistent-effect',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('effect_not_found');
    }
  });

  it('normalizes "No connected GM" throw to no_gm_connected error code', async () => {
    const effects = [makeEffectMock('eff-1', () => Promise.reject(new Error('No connected GM')))];
    const actorMock = {
      id: 'actor-1',
      name: 'Gandalf',
      type: 'character',
      effects: { contents: effects },
    };
    const gameMock = makeGameMock({ 'actor-1': actorMock as ReturnType<typeof makeActorMock> });
    vi.stubGlobal('game', gameMock);

    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const result = await dropConcentrationHandler.handle({
      actor_id: 'actor-1',
      effect_id: 'eff-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('no_gm_connected');
    }
  });

  it('returns error string on generic delete throw', async () => {
    const effects = [
      makeEffectMock('eff-1', () => Promise.reject(new Error('Foundry permission denied'))),
    ];
    const actorMock = {
      id: 'actor-1',
      name: 'Gandalf',
      type: 'character',
      effects: { contents: effects },
    };
    const gameMock = makeGameMock({ 'actor-1': actorMock as ReturnType<typeof makeActorMock> });
    vi.stubGlobal('game', gameMock);

    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const result = await dropConcentrationHandler.handle({
      actor_id: 'actor-1',
      effect_id: 'eff-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Foundry permission denied');
    }
  });

  it('argsSchema rejects empty actor_id', async () => {
    vi.stubGlobal('game', makeGameMock({}));
    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const parseResult = dropConcentrationHandler.argsSchema.safeParse({
      actor_id: '',
      effect_id: 'eff-1',
    });
    expect(parseResult.success).toBe(false);
  });

  it('argsSchema rejects empty effect_id', async () => {
    vi.stubGlobal('game', makeGameMock({}));
    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const parseResult = dropConcentrationHandler.argsSchema.safeParse({
      actor_id: 'actor-1',
      effect_id: '',
    });
    expect(parseResult.success).toBe(false);
  });

  it('argsSchema accepts valid inputs', async () => {
    vi.stubGlobal('game', makeGameMock({}));
    const { dropConcentrationHandler } = await import('./drop-concentration.js');

    const parseResult = dropConcentrationHandler.argsSchema.safeParse({
      actor_id: 'actor-1',
      effect_id: 'eff-1',
    });
    expect(parseResult.success).toBe(true);
  });
});
