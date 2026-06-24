/**
 * Phase 7 Write-Path Integration Smoke Harness — ISM-W7-01..ISM-W7-08
 *
 * End-to-end integration tests proving the full write-path stack across all
 * Wave 1-3 handlers + bearer rotation envelope emission.
 *
 * Each ISM-W7-NN test exercises ONE complete round-trip through `dispatchTool`
 * using REAL handlers (from `handlers/index.ts` side-effect import) with
 * mocked Foundry globals (game, Hooks, canvas, ChatMessage, dnd5e namespace).
 *
 * Pattern modelled on Phase 4b's `04b-integration-smoke.test.ts` and
 * Phase 6's `06-cross-overlay-reachability.test.ts`.
 *
 * # Single-workflow-origin discipline (ADR-0011)
 * All write mutations go through `dispatchTool`. No handler is invoked directly.
 *
 * # Test discriminators
 * Each test is prefixed with its ISM-W7-NN code so failures are immediately
 * traceable to the correct integration scenario.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (dispatchTool)
 * @see packages/foundry-module/src/write-path/handlers/index.ts (TOOL_REGISTRY population)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see .planning/phases/07-foundry-module-write-path/07-06-PLAN.md Task 2
 */
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global stubs ────────────────────────────────────────────────────

/**
 * Minimal ApplicationV2 stub — required because PairModal extends it at module load.
 */
class ApplicationV2Stub {
  render(_force?: boolean): this {
    return this;
  }
  async close(): Promise<void> {}
  async getData(): Promise<Record<string, unknown>> {
    return {};
  }
  _activateListeners(_html: HTMLElement): void {}
  static get defaultOptions() {
    return { id: '', title: '', template: '', width: 400, height: 'auto', resizable: false };
  }
}

class ApplicationStub {
  get title(): string {
    return '';
  }
}

// ─── Mock factory helpers ─────────────────────────────────────────────────────

/**
 * Creates a stub actor with a spell item + activity that mocks activity.use().
 */
function makeSpellActor(
  actorId: string,
  itemId: string,
  activityUseMock: ReturnType<typeof vi.fn>,
) {
  return {
    id: actorId,
    name: 'Test Wizard',
    type: 'character',
    items: {
      contents: [
        {
          id: itemId,
          name: 'Fireball',
          type: 'spell',
          system: {
            activities: {
              contents: [
                {
                  type: 'spell',
                  use: activityUseMock,
                },
              ],
            },
          },
        },
      ],
    },
    effects: { contents: [] },
  };
}

/**
 * Creates a stub actor with a weapon item + attack-type activity.
 */
function makeWeaponActor(actorId: string, itemId: string, attackUseMock: ReturnType<typeof vi.fn>) {
  return {
    id: actorId,
    name: 'Test Fighter',
    type: 'character',
    items: {
      contents: [
        {
          id: itemId,
          name: 'Longsword',
          type: 'weapon',
          system: {
            activities: {
              contents: [
                {
                  type: 'attack',
                  use: attackUseMock,
                },
              ],
            },
          },
        },
      ],
    },
    effects: { contents: [] },
  };
}

/**
 * Creates a stub actor with a generic item + activity (for use-item).
 */
function makeItemActor(actorId: string, itemId: string, activityUseMock: ReturnType<typeof vi.fn>) {
  return {
    id: actorId,
    name: 'Test Character',
    type: 'character',
    items: {
      contents: [
        {
          id: itemId,
          name: 'Healing Potion',
          type: 'consumable',
          system: {
            activities: {
              contents: [
                {
                  type: 'utility',
                  use: activityUseMock,
                },
              ],
            },
          },
        },
      ],
    },
    effects: { contents: [] },
  };
}

/**
 * Creates a stub game singleton with mock actors + users + scenes.
 */
function makeGameMock(actors: Record<string, unknown> = {}) {
  const actorsMap = new Map<string, unknown>(Object.entries(actors));
  return {
    settings: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    actors: {
      get: vi.fn((id: string) => actorsMap.get(id)),
    },
    users: {
      contents: [{ id: 'gm-user-1', isGM: true }],
    },
    user: {
      id: 'player-user-1',
      isGM: false,
      character: { id: 'player-actor-1' },
    },
    scenes: {
      active: null as unknown,
    },
    combat: null,
    i18n: {
      lang: 'en',
      localize: vi.fn((k: string) => k),
    },
  };
}

/**
 * Creates a UUID counter for deterministic idempotency keys in tests.
 */
function makeUUID(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Phase 7 Write-Path Integration Smoke (ISM-W7)', () => {
  let chatCreateMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    // Stub Foundry globals
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('Hooks', {
      once: vi.fn(),
      on: vi.fn((_event: string, _handler: unknown) => {
        // Return a numeric hook ID for Hooks.off
        return 1;
      }),
      off: vi.fn(),
    });
    // Use Node.js webcrypto so crypto.subtle.digest works in test environment
    let uuidCounter = 1;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => makeUUID(uuidCounter++)),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 7) % 256;
        return arr;
      }),
      subtle: webcrypto.subtle,
    });

    // ChatMessage mock — used by writeAuditLog
    chatCreateMock = vi.fn(() => Promise.resolve({ id: 'audit-msg-1' }));
    vi.stubGlobal('ChatMessage', { create: chatCreateMock });

    // dnd5e namespace mock (place-template uses dnd5e.canvas.AbilityTemplate.fromActivity)
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: {
          fromActivity: vi.fn(() => []),
        },
      },
    });

    // canvas stub (move-token + place-template use canvas.scene)
    vi.stubGlobal('canvas', {
      scene: {
        id: 'scene-1',
        tokens: { get: vi.fn() },
        createEmbeddedDocuments: vi.fn(() => Promise.resolve([{ id: 'template-doc-1' }])),
      },
    });

    // Reset IdempotencyStore between tests
    const { moduleIdempotencyStore } = await import('../write-path/tool-registry.js');
    moduleIdempotencyStore.clear();

    // Clear placement contexts
    const { clearPlacementContexts } = await import('../write-path/handlers/place-template.js');
    clearPlacementContexts();

    // Reset multi-attack progress emitter
    const { setMultiAttackProgressEmitter } = await import(
      '../write-path/handlers/weapon-attack.js'
    );
    setMultiAttackProgressEmitter(null);
  });

  // ── ISM-W7-01: cast-spell happy path ─────────────────────────────────────

  it('ISM-W7-01: cast-spell produces chatCardId + audit log with whisper: gmIds', async () => {
    const activityUseMock = vi.fn().mockResolvedValue({ id: 'cm-fireball-1' });
    const actor = makeSpellActor('actor-1', 'spell-fireball', activityUseMock);
    const gameMock = makeGameMock({ 'actor-1': actor });
    vi.stubGlobal('game', gameMock);

    // Side-effect: populates TOOL_REGISTRY
    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const result = await dispatchTool('cast-spell', {
      args: {
        actor_id: 'actor-1',
        spell_id: 'spell-fireball',
        targets: [],
        slot_level: 3,
      },
      idempotencyKey: makeUUID(1),
      bearer: 'bearer-token-1',
    });

    // Verify result shape
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { chatCardId: string | null }).chatCardId).toBe('cm-fireball-1');
    }

    // Verify activity.use called once with { configure: false } in the dialog (2nd) arg
    // (dnd5e 5.x use(usage, dialog, message) — regression 260621).
    expect(activityUseMock).toHaveBeenCalledOnce();
    expect(activityUseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ configure: false }),
    );

    // Verify audit log written (ChatMessage.create called with whisper: gmIds)
    await vi.waitFor(() => chatCreateMock.mock.calls.length > 0, { timeout: 1000 });
    expect(chatCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whisper: expect.arrayContaining(['gm-user-1']),
      }),
    );
  });

  // ── ISM-W7-02: weapon-attack multi-attack count=2 ─────────────────────────

  it('ISM-W7-02: weapon-attack count=2 calls activity.use twice + emits 2 progress envelopes', async () => {
    const attackUseMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 'cm-attack-1' })
      .mockResolvedValueOnce({ id: 'cm-attack-2' });

    const actor = makeWeaponActor('actor-2', 'item-longsword', attackUseMock);
    const gameMock = makeGameMock({ 'actor-2': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { setMultiAttackProgressEmitter } = await import(
      '../write-path/handlers/weapon-attack.js'
    );
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    // Inject a spy progress emitter
    const progressEmitSpy = vi.fn();
    setMultiAttackProgressEmitter(progressEmitSpy);

    const result = await dispatchTool('weapon-attack', {
      args: {
        actor_id: 'actor-2',
        item_id: 'item-longsword',
        targets: [],
        advantage: 'normal',
        count: 2,
      },
      idempotencyKey: makeUUID(2),
      bearer: 'bearer-token-2',
    });

    expect(result.success).toBe(true);

    // activity.use called twice
    expect(attackUseMock).toHaveBeenCalledTimes(2);
    // First call: consume.action = true (action economy deducted once) — usage arg [0];
    // configure:false is the dialog arg [1] (dnd5e 5.x use(usage, dialog, message)).
    expect(attackUseMock.mock.calls[0]?.[0]).toMatchObject({ consume: { action: true } });
    expect(attackUseMock.mock.calls[0]?.[1]).toMatchObject({ configure: false });
    // Second call: consume.action = false (Extra Attack)
    expect(attackUseMock.mock.calls[1]?.[0]).toMatchObject({ consume: { action: false } });
    expect(attackUseMock.mock.calls[1]?.[1]).toMatchObject({ configure: false });

    // Progress envelope emitted twice: current=1/total=2, then current=2/total=2
    expect(progressEmitSpy).toHaveBeenCalledTimes(2);
    expect(progressEmitSpy.mock.calls[0]?.[0]).toMatchObject({ current: 1, total: 2 });
    expect(progressEmitSpy.mock.calls[1]?.[0]).toMatchObject({ current: 2, total: 2 });
  });

  // ── ISM-W7-03: use-item ────────────────────────────────────────────────────

  it('ISM-W7-03: use-item resolves actor + item + activity and calls activity.use once', async () => {
    const activityUseMock = vi.fn().mockResolvedValue({ id: 'cm-potion-1' });
    const actor = makeItemActor('actor-3', 'item-potion', activityUseMock);
    const gameMock = makeGameMock({ 'actor-3': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const result = await dispatchTool('use-item', {
      args: {
        actor_id: 'actor-3',
        item_id: 'item-potion',
        targets: [],
      },
      idempotencyKey: makeUUID(3),
      bearer: 'bearer-token-3',
    });

    expect(result.success).toBe(true);
    expect(activityUseMock).toHaveBeenCalledOnce();
  });

  // ── ISM-W7-04: move-token ─────────────────────────────────────────────────

  it('ISM-W7-04: move-token calls tokenDoc.update({ x, y }) and returns success', async () => {
    const tokenUpdateMock = vi.fn().mockResolvedValue(undefined);
    const tokenDoc = { id: 'token-hero', update: tokenUpdateMock };

    const gameMock = makeGameMock();
    gameMock.scenes.active = {
      id: 'scene-1',
      tokens: { get: vi.fn().mockReturnValue(tokenDoc) },
    } as unknown;
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const result = await dispatchTool('move-token', {
      args: {
        token_id: 'token-hero',
        x: 300,
        y: 450,
      },
      idempotencyKey: makeUUID(4),
      bearer: 'bearer-token-4',
    });

    expect(result.success).toBe(true);
    expect(tokenUpdateMock).toHaveBeenCalledWith({ x: 300, y: 450 });
  });

  // ── ISM-W7-05: place-template request ─────────────────────────────────────

  it('ISM-W7-05: place-template returns placementId + total=3 for Magic Missile (3 templates)', async () => {
    // Stub dnd5e.canvas.AbilityTemplate.fromActivity returning 3 templates (Magic Missile)
    const mockTemplates = [
      { document: { toObject: () => ({ type: 'circle', distance: 5, x: 0, y: 0 }) } },
      { document: { toObject: () => ({ type: 'circle', distance: 5, x: 0, y: 0 }) } },
      { document: { toObject: () => ({ type: 'circle', distance: 5, x: 0, y: 0 }) } },
    ];

    const fromActivityMock = vi.fn().mockReturnValue(mockTemplates);
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: { fromActivity: fromActivityMock },
      },
    });

    const activityUseMock = vi.fn();
    const actor = makeSpellActor('actor-5', 'spell-missile', activityUseMock);
    const gameMock = makeGameMock({ 'actor-5': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const result = await dispatchTool('place-template', {
      args: {
        actor_id: 'actor-5',
        spell_id: 'spell-missile',
      },
      idempotencyKey: makeUUID(5),
      bearer: 'bearer-token-5',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as {
        placementId: string;
        total: number;
        templates: unknown[];
      };
      expect(typeof data.placementId).toBe('string');
      expect(data.total).toBe(3);
      expect(data.templates.length).toBe(3);
    }
    expect(fromActivityMock).toHaveBeenCalledOnce();
    // activity.use() must NOT be called — place-template doesn't use activities
    expect(activityUseMock).not.toHaveBeenCalled();
  });

  // ── ISM-W7-06: confirm-template-placement commits via createEmbeddedDocuments ──

  it('ISM-W7-06: confirm-template-placement calls createEmbeddedDocuments with x/y and returns success', async () => {
    // First, place templates to mint a placementId
    const mockTemplate = {
      document: { toObject: () => ({ type: 'circle', distance: 10, x: 0, y: 0, user: '' }) },
    };
    vi.stubGlobal('dnd5e', {
      canvas: {
        AbilityTemplate: { fromActivity: vi.fn().mockReturnValue([mockTemplate]) },
      },
    });

    const createEmbeddedDocsMock = vi.fn().mockResolvedValue([{ id: 'template-doc-xyz' }]);
    vi.stubGlobal('canvas', {
      scene: {
        id: 'scene-1',
        tokens: { get: vi.fn() },
        createEmbeddedDocuments: createEmbeddedDocsMock,
      },
    });

    const actorId = 'actor-6';
    const itemId = 'spell-cone-of-cold';
    const actor = makeSpellActor(actorId, itemId, vi.fn());
    const gameMock = makeGameMock({ [actorId]: actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    // Step A: place-template to get placementId
    const placeResult = await dispatchTool('place-template', {
      args: { actor_id: actorId, spell_id: itemId },
      idempotencyKey: makeUUID(61),
      bearer: 'bearer-token-6',
    });
    expect(placeResult.success).toBe(true);
    const placementId = (placeResult as { success: true; data: { placementId: string } }).data
      .placementId;

    // Step B: confirm placement at x=500, y=300 via templateIndex=0
    const confirmResult = await dispatchTool('confirm-template-placement', {
      args: { placementId, templateIndex: 0, x: 500, y: 300 },
      idempotencyKey: makeUUID(62),
      bearer: 'bearer-token-6',
    });

    expect(confirmResult.success).toBe(true);
    expect(createEmbeddedDocsMock).toHaveBeenCalledOnce();
    const [docType, docs] = createEmbeddedDocsMock.mock.calls[0] as [
      string,
      Array<{ x: number; y: number }>,
    ];
    expect(docType).toBe('MeasuredTemplate');
    expect(docs[0]).toMatchObject({ x: 500, y: 300 });
  });

  // ── ISM-W7-07: reaction-watcher hook fan-out ──────────────────────────────

  it('ISM-W7-07: dnd5e.preUseActivity hook fires → reaction.available envelope + returns void (not false)', async () => {
    const emitSpy = vi.fn();

    // Build a Hooks mock that captures on() handlers
    const hookHandlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
    const hooksMock = {
      once: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
        const existing = hookHandlers.get(event) ?? [];
        existing.push(handler);
        hookHandlers.set(event, existing);
        return existing.length;
      }),
      off: vi.fn(),
      call(event: string, ...args: unknown[]): unknown {
        const handlers = hookHandlers.get(event) ?? [];
        let result: unknown;
        for (const h of handlers) {
          result = h(...args);
        }
        return result;
      },
    };
    vi.stubGlobal('Hooks', hooksMock);

    const gameMock = makeGameMock();
    // Player character is player-actor-1; NPC has a different ID
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('../write-path/reaction-watcher.js');
    registerReactionWatcher(emitSpy);

    // Simulate an NPC attack activity
    const npcActivity = {
      type: 'attack',
      actor: { id: 'npc-goblin-1', name: 'Goblin Chief' },
      item: { type: 'weapon' },
    };

    // Fire the hook — return value from handler should be void (not false)
    const returnValue = hooksMock.call('dnd5e.preUseActivity', npcActivity);
    expect(returnValue).toBeUndefined(); // NEVER return false (Pitfall 1)

    // Emit should be called with shield reaction payload
    expect(emitSpy).toHaveBeenCalledOnce();
    const [payload] = emitSpy.mock.calls[0] as [
      { kind: string; sourceName: string; expiresAt: number },
    ];
    expect(payload.kind).toBe('shield');
    expect(payload.sourceName).toBe('Goblin Chief');
    expect(typeof payload.expiresAt).toBe('number');
  });

  // ── ISM-W7-08: drop-concentration → effect.delete called ─────────────────

  it('ISM-W7-08: drop-concentration calls effect.delete() and returns success', async () => {
    const effectDeleteMock = vi.fn().mockResolvedValue(undefined);
    const actor = {
      id: 'actor-8',
      name: 'Test Cleric',
      type: 'character',
      items: { contents: [] },
      effects: {
        contents: [{ id: 'effect-conc-1', delete: effectDeleteMock }],
      },
    };
    const gameMock = makeGameMock({ 'actor-8': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const result = await dispatchTool('drop-concentration', {
      args: {
        actor_id: 'actor-8',
        effect_id: 'effect-conc-1',
      },
      idempotencyKey: makeUUID(8),
      bearer: 'bearer-token-8',
    });

    expect(result.success).toBe(true);
    expect(effectDeleteMock).toHaveBeenCalledOnce();
  });

  // ── Idempotency regression: same key same bearer → cache hit ─────────────

  it('IDEMPOTENCY-01: same idempotencyKey + same bearer returns cached result without re-execution', async () => {
    const activityUseMock = vi.fn().mockResolvedValue({ id: 'cm-cached' });
    const actor = makeSpellActor('actor-i1', 'spell-bolt', activityUseMock);
    const gameMock = makeGameMock({ 'actor-i1': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const payload = {
      args: { actor_id: 'actor-i1', spell_id: 'spell-bolt', targets: [], slot_level: 1 },
      idempotencyKey: makeUUID(901),
      bearer: 'bearer-idempotency-1',
    };

    // First invocation
    const r1 = await dispatchTool('cast-spell', payload);
    // Second invocation — same key + bearer → cache hit
    const r2 = await dispatchTool('cast-spell', payload);

    // activity.use called ONCE (cache hit on 2nd call)
    expect(activityUseMock).toHaveBeenCalledOnce();
    // Both calls return the same result
    expect(r1).toEqual(r2);
  });

  // ── Idempotency regression: different bearer → different cache bucket ──────

  it('IDEMPOTENCY-02: same idempotencyKey + different bearer → separate cache entries (re-execution)', async () => {
    const activityUseMock = vi.fn().mockResolvedValue({ id: 'cm-bearer-test' });
    const actor = makeSpellActor('actor-i2', 'spell-ray', activityUseMock);
    const gameMock = makeGameMock({ 'actor-i2': actor });
    vi.stubGlobal('game', gameMock);

    await import('../write-path/handlers/index.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');

    const baseArgs = {
      args: { actor_id: 'actor-i2', spell_id: 'spell-ray', targets: [], slot_level: 1 },
      idempotencyKey: makeUUID(902),
    };

    // Two calls with SAME key but DIFFERENT bearers → different cache buckets
    await dispatchTool('cast-spell', { ...baseArgs, bearer: 'bearer-A' });
    await dispatchTool('cast-spell', { ...baseArgs, bearer: 'bearer-B' });

    // activity.use called TWICE (different bearer → different cache key per T-03-05)
    expect(activityUseMock).toHaveBeenCalledTimes(2);
  });
});
