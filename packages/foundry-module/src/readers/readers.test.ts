/**
 * Reader unit tests — character, combat, scene, event-log, hook-subscribers.
 *
 * Uses vi.stubGlobal to mock Foundry globals (game, canvas, Hooks).
 * No real Foundry runtime or HTTP calls.
 *
 * NOTE (M-2): Mock shapes are derived from the dnd5e 5.x interfaces documented in
 * foundry-globals.d.ts and the 02-05-PLAN.md interfaces block. If fvtt-types is
 * adopted in a future phase, these mocks should be reconciled against the generated types.
 * TODO (#44): validate mock shapes against fvtt-types when package stabilises.
 *
 * @see packages/foundry-module/src/readers/character-reader.ts
 * @see packages/foundry-module/src/readers/combat-reader.ts
 * @see packages/foundry-module/src/readers/scene-reader.ts
 * @see packages/foundry-module/src/readers/event-log-reader.ts
 * @see packages/foundry-module/src/readers/hook-subscribers.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mock helpers ──────────────────────────────────────────────

function makeActor(
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    hp: { value: number; max: number; temp: number; tempmax: number };
    acValue: number;
    level: number;
    statuses: Set<string>;
    exhaustion: number;
    // Phase 4b: death-saves field. `undefined` exercises the
    // nullish-coalesce defensive default in character-reader.ts (CR-DS-3).
    // To omit it entirely, pass `death: undefined` explicitly.
    death: { success: number; failure: number } | undefined;
  }> = {},
) {
  const death =
    'death' in overrides
      ? overrides.death
      : ({ success: 0, failure: 0 } as { success: number; failure: number });
  return {
    id: overrides.id ?? 'actor-1',
    name: overrides.name ?? 'Aragorn',
    type: overrides.type ?? 'character',
    system: {
      attributes: {
        hp: overrides.hp ?? { value: 42, max: 50, temp: 5, tempmax: 0 },
        ac: { value: overrides.acValue ?? 18 },
        exhaustion: overrides.exhaustion ?? 0,
        death,
      },
      details: {
        level: overrides.level ?? 5,
      },
    },
    statuses: overrides.statuses ?? new Set<string>(),
  };
}

function makeGameMock(
  actors: ReturnType<typeof makeActor>[] = [],
  combat: unknown = null,
  activeScene: unknown = null,
) {
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  return {
    actors: {
      get: (id: string) => actorMap.get(id),
      contents: actors,
    },
    combat,
    scenes: {
      active: activeScene,
    },
    user: {
      id: 'user-1',
      targets: new Set<unknown>(),
    },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: (k: string) => k },
  };
}

// ─── Character reader tests ────────────────────────────────────────────────────

describe('getCharacterSnapshot', () => {
  let getCharacterSnapshot: typeof import('./character-reader.js').getCharacterSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./character-reader.js');
    getCharacterSnapshot = mod.getCharacterSnapshot;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when actor not found', () => {
    vi.stubGlobal('game', makeGameMock([]));
    expect(getCharacterSnapshot('missing-id')).toBeNull();
  });

  it('returns null when actor type is not "character"', () => {
    const npc = makeActor({ id: 'npc-1', type: 'npc' });
    vi.stubGlobal('game', makeGameMock([npc]));
    expect(getCharacterSnapshot('npc-1')).toBeNull();
  });

  it('returns correct CharacterSnapshot for a PC actor', () => {
    const actor = makeActor({
      id: 'hero-1',
      name: 'Legolas',
      hp: { value: 30, max: 40, temp: 0, tempmax: 0 },
      acValue: 15,
      level: 7,
      statuses: new Set(['poisoned']),
      exhaustion: 1,
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('hero-1');
    expect(snap).not.toBeNull();
    expect(snap?.actorId).toBe('hero-1');
    expect(snap?.name).toBe('Legolas');
    expect(snap?.hp).toBe(30);
    expect(snap?.maxHp).toBe(40);
    expect(snap?.tempHp).toBe(0);
    expect(snap?.ac).toBe(15);
    expect(snap?.level).toBe(7);
    expect(snap?.conditions).toEqual(['poisoned']);
    expect(snap?.exhaustion).toBe(1);
  });

  it('includes multiple conditions from statuses Set', () => {
    const actor = makeActor({
      statuses: new Set(['poisoned', 'prone', 'blinded']),
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('actor-1');
    expect(snap?.conditions).toHaveLength(3);
    expect(snap?.conditions).toContain('poisoned');
    expect(snap?.conditions).toContain('prone');
    expect(snap?.conditions).toContain('blinded');
  });

  it('returns empty conditions array when statuses is empty', () => {
    const actor = makeActor({ statuses: new Set() });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('actor-1');
    expect(snap?.conditions).toEqual([]);
  });

  // ── Phase 4b: death-saves extension (CR-DS-1..CR-DS-5) ─────────────────────

  it('CR-DS-1: emits death={success:0,failure:0} for an idle actor', () => {
    const actor = makeActor({ id: 'pc-1', death: { success: 0, failure: 0 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-1');
    expect(snap?.death).toEqual({ success: 0, failure: 0 });
  });

  it('CR-DS-2: emits death.failure=2 when actor.system.attributes.death.failure=2', () => {
    const actor = makeActor({ id: 'pc-2', death: { success: 1, failure: 2 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-2');
    expect(snap?.death.success).toBe(1);
    expect(snap?.death.failure).toBe(2);
  });

  it('CR-DS-3: defaults death to {success:0,failure:0} when actor.system.attributes.death is undefined', () => {
    // Fresh dnd5e actors may have attributes.death undefined until the first
    // death save is rolled — the reader's nullish-coalesce defends.
    const actor = makeActor({ id: 'pc-3', death: undefined });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-3');
    expect(snap?.death).toEqual({ success: 0, failure: 0 });
  });

  it('CR-DS-4: returned snapshot satisfies CharacterSnapshotSchema (round-trip)', async () => {
    const actor = makeActor({ id: 'pc-4', death: { success: 2, failure: 1 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-4');
    expect(snap).not.toBeNull();
    // Round-trip through the canonical schema — proves no missing or extra
    // fields and that the death values flow through unmodified.
    const { CharacterSnapshotSchema } = await import('@evf/shared-protocol');
    const result = CharacterSnapshotSchema.safeParse(snap);
    expect(result.success).toBe(true);
  });

  it('CR-DS-5: existing HP/AC/level fields preserved after death-field addition (regression-safe)', () => {
    const actor = makeActor({
      id: 'pc-5',
      hp: { value: 21, max: 30, temp: 4, tempmax: 0 },
      acValue: 19,
      level: 6,
      death: { success: 0, failure: 0 },
    });
    vi.stubGlobal('game', makeGameMock([actor]));

    const snap = getCharacterSnapshot('pc-5');
    expect(snap?.hp).toBe(21);
    expect(snap?.maxHp).toBe(30);
    expect(snap?.tempHp).toBe(4);
    expect(snap?.ac).toBe(19);
    expect(snap?.level).toBe(6);
  });
});

// ─── Combat reader tests ───────────────────────────────────────────────────────

describe('getCombatSnapshot', () => {
  let getCombatSnapshot: typeof import('./combat-reader.js').getCombatSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./combat-reader.js');
    getCombatSnapshot = mod.getCombatSnapshot;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when game.combat is null', () => {
    vi.stubGlobal('game', makeGameMock([], null));
    expect(getCombatSnapshot()).toBeNull();
  });

  it('returns correct CombatSnapshot when combat is active', () => {
    const actor = makeActor({ id: 'actor-1', hp: { value: 20, max: 30, temp: 0, tempmax: 0 } });
    const combatant1 = {
      id: 'cbt-1',
      name: 'Frodo',
      actorId: 'actor-1',
      actor,
      initiative: 15,
    };
    const combatant2 = {
      id: 'cbt-2',
      name: 'Sauron',
      actorId: null,
      actor: null,
      initiative: 20,
    };
    const combat = {
      id: 'combat-1',
      round: 2,
      turn: 0,
      combatant: combatant1,
      combatants: { contents: [combatant1, combatant2] },
    };

    vi.stubGlobal('game', makeGameMock([actor], combat));

    const snap = getCombatSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.combatId).toBe('combat-1');
    expect(snap?.round).toBe(2);
    expect(snap?.turn).toBe(0);
    expect(snap?.currentCombatantId).toBe('cbt-1');
    expect(snap?.combatants).toHaveLength(2);

    const frodo = snap?.combatants.find((c) => c.id === 'cbt-1');
    expect(frodo?.isCurrentTurn).toBe(true);
    expect(frodo?.hp).toBe(20);
    expect(frodo?.maxHp).toBe(30);
    expect(frodo?.initiative).toBe(15);

    const sauron = snap?.combatants.find((c) => c.id === 'cbt-2');
    expect(sauron?.isCurrentTurn).toBe(false);
    expect(sauron?.hp).toBeNull();
    expect(sauron?.actorId).toBeNull();
  });

  it('sets currentCombatantId to null when combat.combatant is null', () => {
    const combat = {
      id: 'combat-2',
      round: 0,
      turn: 0,
      combatant: null,
      combatants: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], combat));

    const snap = getCombatSnapshot();
    expect(snap?.currentCombatantId).toBeNull();
  });
});

// ─── Scene reader tests ────────────────────────────────────────────────────────

describe('getSceneViewport', () => {
  let getSceneViewport: typeof import('./scene-reader.js').getSceneViewport;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./scene-reader.js');
    getSceneViewport = mod.getSceneViewport;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns zero-state when no active scene', () => {
    vi.stubGlobal('game', makeGameMock([], null, null));
    vi.stubGlobal('canvas', null);

    const vp = getSceneViewport();
    expect(vp.sceneId).toBe('');
    expect(vp.viewX).toBe(0);
    expect(vp.viewY).toBe(0);
    expect(vp.scale).toBe(1.0);
    expect(vp.tokenIds).toEqual([]);
  });

  it('returns correct sceneId and token list', () => {
    const scene = {
      id: 'scene-abc',
      name: 'Dungeon',
      tokens: { contents: [{ id: 'token-1' }, { id: 'token-2' }] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', {
      stage: { pivot: { x: 100, y: 200 }, scale: { x: 1.5 } },
    });

    const vp = getSceneViewport();
    expect(vp.sceneId).toBe('scene-abc');
    expect(vp.sceneName).toBe('Dungeon');
    expect(vp.viewX).toBe(100);
    expect(vp.viewY).toBe(200);
    expect(vp.scale).toBe(1.5);
    expect(vp.tokenIds).toEqual(['token-1', 'token-2']);
  });

  it('defaults to scale=1.0 when canvas is null', () => {
    const scene = {
      id: 'scene-1',
      name: 'Test',
      tokens: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', null);

    const vp = getSceneViewport();
    expect(vp.scale).toBe(1.0);
  });
});

// ─── Hook subscribers tests ────────────────────────────────────────────────────

describe('registerHookSubscribers', () => {
  let registerHookSubscribers: typeof import('./hook-subscribers.js').registerHookSubscribers;
  let _resetEventSeq: () => void;

  // Capture registered hook callbacks for manual invocation in tests
  const hookCallbacks = new Map<string, Array<(...args: unknown[]) => void>>();
  const registeredIds: Map<number, string> = new Map();
  let hookIdCounter = 0;

  function makeHooksMock() {
    return {
      once: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        if (!hookCallbacks.has(event)) {
          hookCallbacks.set(event, []);
        }
        // biome-ignore lint/style/noNonNullAssertion: just set it above
        hookCallbacks.get(event)!.push(fn);
        const id = ++hookIdCounter;
        registeredIds.set(id, event);
        return id;
      }),
      off: vi.fn((id: number) => {
        registeredIds.delete(id);
      }),
    };
  }

  function fireHook(event: string, ...args: unknown[]): void {
    const callbacks = hookCallbacks.get(event) ?? [];
    for (const cb of callbacks) {
      cb(...args);
    }
  }

  beforeEach(async () => {
    vi.resetModules();
    hookCallbacks.clear();
    registeredIds.clear();
    hookIdCounter = 0;

    const mod = await import('./hook-subscribers.js');
    registerHookSubscribers = mod.registerHookSubscribers;
    _resetEventSeq = mod._resetEventSeq;

    vi.stubGlobal('Hooks', makeHooksMock());
    vi.stubGlobal('game', makeGameMock([]));
    vi.stubGlobal('canvas', null);
    _resetEventSeq();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers hooks and returns a cleanup function', () => {
    const emitFn = vi.fn();
    const cleanup = registerHookSubscribers(emitFn);
    expect(typeof cleanup).toBe('function');
    // Should have registered multiple hooks
    expect((Hooks as ReturnType<typeof makeHooksMock>).on).toHaveBeenCalled();
  });

  it('cleanup calls Hooks.off for all registered hooks', () => {
    const emitFn = vi.fn();
    const cleanup = registerHookSubscribers(emitFn);
    cleanup();
    expect((Hooks as ReturnType<typeof makeHooksMock>).off).toHaveBeenCalled();
  });

  it('updateActor emits character.delta when HP changes', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1', hp: { value: 10, max: 20, temp: 0, tempmax: 0 } });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    const changes = { system: { attributes: { hp: { value: 10 } } } };
    fireHook('updateActor', actor, changes);

    expect(emitFn).toHaveBeenCalledWith(
      'character.delta',
      expect.objectContaining({
        actorId: 'a1',
        hp: 10,
      }),
    );
  });

  it('updateActor does NOT emit when unrelated fields change', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1' });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    // Unrelated change — only flags changed
    const changes = { flags: { 'some-module': { key: 'value' } } };
    fireHook('updateActor', actor, changes);

    expect(emitFn).not.toHaveBeenCalled();
  });

  it('updateActor emits when statuses change', () => {
    const emitFn = vi.fn();
    const actor = makeActor({ id: 'a1', statuses: new Set(['poisoned']) });
    vi.stubGlobal('game', makeGameMock([actor]));

    registerHookSubscribers(emitFn);

    const changes = { statuses: new Set(['poisoned', 'prone']) };
    fireHook('updateActor', actor, changes);

    expect(emitFn).toHaveBeenCalledWith('character.delta', expect.anything());
  });

  it('createChatMessage pushes to ring buffer and emits event.log.delta', () => {
    const emitFn = vi.fn();
    registerHookSubscribers(emitFn);

    const message = {
      content: 'You hit the goblin!',
      flavor: '',
      speaker: { actor: 'actor-1', scene: 'scene-1', token: 'token-1', alias: 'Aragorn' },
    };
    fireHook('createChatMessage', message);

    expect(emitFn).toHaveBeenCalledWith(
      'event.log.delta',
      expect.objectContaining({
        seq: 1,
        type: 'chat',
        actorId: 'actor-1',
        content: 'You hit the goblin!',
      }),
    );
  });

  it('targetToken emits combat.targets with user targets', () => {
    const emitFn = vi.fn();
    registerHookSubscribers(emitFn);

    const mockToken: {
      id: string;
      name: string;
      document: { actorId: string };
    } = {
      id: 'token-5',
      name: 'Orc Chief',
      document: { actorId: 'actor-orc' },
    };

    const mockUser = {
      id: 'user-gm',
      targets: new Set([mockToken]),
    };

    fireHook('targetToken', mockUser, mockToken, true);

    expect(emitFn).toHaveBeenCalledWith(
      'combat.targets',
      expect.objectContaining({
        userId: 'user-gm',
        targets: expect.arrayContaining([
          expect.objectContaining({ tokenId: 'token-5', actorId: 'actor-orc', name: 'Orc Chief' }),
        ]),
      }),
    );
  });

  it('canvasReady emits scene.viewport', () => {
    const emitFn = vi.fn();
    const scene = {
      id: 'scene-1',
      name: 'Forest',
      tokens: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], null, scene));
    vi.stubGlobal('canvas', { stage: { pivot: { x: 0, y: 0 }, scale: { x: 1 } } });

    registerHookSubscribers(emitFn);
    fireHook('canvasReady', {});

    expect(emitFn).toHaveBeenCalledWith(
      'scene.viewport',
      expect.objectContaining({
        sceneId: 'scene-1',
      }),
    );
  });

  it('combatStart emits combat.state', () => {
    const emitFn = vi.fn();
    const combat = {
      id: 'combat-new',
      round: 1,
      turn: 0,
      combatant: null,
      combatants: { contents: [] },
    };
    vi.stubGlobal('game', makeGameMock([], combat));

    registerHookSubscribers(emitFn);
    fireHook('combatStart', combat);

    expect(emitFn).toHaveBeenCalledWith(
      'combat.state',
      expect.objectContaining({
        combatId: 'combat-new',
      }),
    );
  });
});
