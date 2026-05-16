/**
 * Unit tests for socketlib-handlers — registerSocketlibHandlers.
 *
 * Mocks the `socketlib` global and the bearer-registry functions to verify:
 * - Handler registration occurs at call time
 * - evf.validateToken returns correct result shapes
 * - evf.revokeToken calls revokeBearer exactly once
 * - Handlers validate input types before processing (T-02-04 guard)
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts
 * @see 02-02-PLAN.md Task 2 (socketlib-handlers.ts)
 * @see 02-CONTEXT.md D-2.12 (executeAsGM validateToken handler)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global stubs ─────────────────────────────────────────────────────

class ApplicationStub {
  get title(): string {
    return '';
  }
}

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

const makeHooksMock = () => ({
  once: vi.fn(),
  on: vi.fn(),
});

const makeGameMock = () => {
  const store = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn((moduleId: string, key: string) => store.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
        store.set(`${moduleId}.${key}`, value);
      }),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    actors: {
      get: vi.fn((_actorId: string) => undefined),
      contents: [] as unknown[],
    },
    combat: null,
    scenes: {
      active: null,
    },
    user: {
      isGM: false,
      targets: new Set(),
    },
    users: {
      get: vi.fn((_userId: string) => undefined),
    },
  };
};

// ─── Socketlib mock ───────────────────────────────────────────────────────────

type HandlerFn = (...args: unknown[]) => unknown;

function makeSocketlibMock() {
  const handlers = new Map<string, HandlerFn>();
  return {
    registerComplexHandler: vi.fn((_moduleId: string, handlerId: string, handler: HandlerFn) => {
      handlers.set(handlerId, handler);
    }),
    executeAsGM: vi.fn(async (_moduleId: string, handlerId: string, ...args: unknown[]) => {
      const handler = handlers.get(handlerId);
      if (!handler) throw new Error(`No handler: ${handlerId}`);
      return handler(...args);
    }),
    /** Test helper: directly call a registered handler */
    callHandler(handlerId: string, ...args: unknown[]): unknown {
      const handler = handlers.get(handlerId);
      if (!handler) throw new Error(`No handler: ${handlerId}`);
      return handler(...args);
    },
    _handlers: handlers,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('registerSocketlibHandlers', () => {
  let socketlibMock: ReturnType<typeof makeSocketlibMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
    });
    vi.stubGlobal('Hooks', makeHooksMock());
    vi.stubGlobal('game', makeGameMock());
    socketlibMock = makeSocketlibMock();
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 7) % 256;
        return arr;
      },
    });
  });

  it('registers evf.validateToken handler', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.registerComplexHandler).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'evf.validateToken',
      expect.any(Function),
    );
  });

  it('registers evf.revokeToken handler', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.registerComplexHandler).toHaveBeenCalledWith(
      'evenfoundryvtt',
      'evf.revokeToken',
      expect.any(Function),
    );
  });

  describe('evf.validateToken handler', () => {
    it('returns { valid: true } for a valid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();

      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      const result = socketlibMock.callHandler('evf.validateToken', entry.token);
      expect(result).toMatchObject({ valid: true });
    });

    it('returns { valid: false, reason: "unknown_token" } for unregistered token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = socketlibMock.callHandler('evf.validateToken', 'not-a-real-token');
      expect(result).toMatchObject({ valid: false, reason: 'unknown_token' });
    });

    it('returns { valid: false } for non-string input (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = socketlibMock.callHandler('evf.validateToken', 12345);
      expect(result).toMatchObject({ valid: false, reason: 'invalid_input' });
    });

    it('returns { valid: false } for null input (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = socketlibMock.callHandler('evf.validateToken', null);
      expect(result).toMatchObject({ valid: false, reason: 'invalid_input' });
    });
  });

  describe('evf.revokeToken handler', () => {
    it('calls revokeBearer and returns { success: true }', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer, validateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();

      const entry = await generateBearer('Device', 'https://bridge.local:8910', 'world');
      const result = socketlibMock.callHandler('evf.revokeToken', entry.token);
      expect(result).toEqual({ success: true });

      // Verify the bearer was actually revoked
      const validation = validateBearer(entry.token);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('revoked');
    });

    it('returns { success: true } for unknown token (no-op, no throw)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = socketlibMock.callHandler('evf.revokeToken', 'unknown-token');
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false } for non-string input (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = socketlibMock.callHandler('evf.revokeToken', { evil: 'object' });
      expect(result).toMatchObject({ success: false, reason: 'invalid_input' });
    });
  });

  // ─── Plan 05 snapshot handler guards (T-02-04) ───────────────────────────────

  describe('evf.getCharacterSnapshot handler', () => {
    it('returns null for non-string actorId (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getCharacterSnapshot', 123, 'some-token');
      expect(result).toBeNull();
    });

    it('returns null for non-string token (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getCharacterSnapshot', 'actor-1', null);
      expect(result).toBeNull();
    });

    it('returns null for invalid bearer token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getCharacterSnapshot', 'actor-1', 'bad-token');
      expect(result).toBeNull();
    });

    it('returns null for valid token but actor not found', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      // game.actors.get returns undefined (default mock)
      const result = socketlibMock.callHandler('evf.getCharacterSnapshot', 'actor-1', entry.token);
      expect(result).toBeNull();
    });
  });

  describe('evf.getCombatSnapshot handler', () => {
    it('returns null for non-string token (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getCombatSnapshot', 42);
      expect(result).toBeNull();
    });

    it('returns null for invalid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getCombatSnapshot', 'bad-token');
      expect(result).toBeNull();
    });

    it('returns null for valid token when no combat active', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      // game.combat is null (default mock)
      const result = socketlibMock.callHandler('evf.getCombatSnapshot', entry.token);
      expect(result).toBeNull();
    });
  });

  describe('evf.getSceneViewport handler', () => {
    it('returns null for non-string token (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getSceneViewport', null);
      expect(result).toBeNull();
    });

    it('returns null for invalid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getSceneViewport', 'bad-token');
      expect(result).toBeNull();
    });

    it('returns scene viewport for valid token (no active scene → zero state)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      // game.scenes.active is null → returns zero-state SceneViewport
      const result = socketlibMock.callHandler('evf.getSceneViewport', entry.token);
      expect(result).not.toBeNull();
      expect(result).toMatchObject({ sceneId: '', tokenIds: [] });
    });
  });

  describe('evf.getEventLog handler', () => {
    it('returns empty array for non-string token (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getEventLog', null, 0, 200);
      expect(result).toEqual([]);
    });

    it('returns empty array for invalid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.getEventLog', 'bad-token', 0, 200);
      expect(result).toEqual([]);
    });

    it('returns event log entries for valid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      // eventLogBuffer is empty by default; signature is (since, limit, token)
      const result = socketlibMock.callHandler('evf.getEventLog', 0, 200, entry.token);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('evf.listCharacters handler', () => {
    it('returns empty array for non-string token (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.listCharacters', 123);
      expect(result).toEqual([]);
    });

    it('returns empty array for invalid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();
      const result = socketlibMock.callHandler('evf.listCharacters', 'bad-token');
      expect(result).toEqual([]);
    });

    it('returns actor list for valid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world');
      // Handler signature is (_worldId, token); pass 'world-1' as worldId, token second
      expect(() =>
        socketlibMock.callHandler('evf.listCharacters', 'world-1', entry.token),
      ).not.toThrow();
      const result = socketlibMock.callHandler('evf.listCharacters', 'world-1', entry.token);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── Plan 07-02 + 07-03: registerComplexHandler count regression guard (Pitfall 7) ──
  //
  // REGRESSION GUARD: total registerComplexHandler count must stay exactly 14.
  // Plan 07-02 replaces 4 stub function bodies in-place — NO new registrations.
  // Plan 07-03 replaces 2 more stubs in-place AND renames evf.skillCheck →
  // evf.confirmTemplatePlacement (still in-place, count stays 14).
  // If this test fails, a new handler was accidentally registered.

  it('registers exactly 14 handlers total (Pitfall 7 regression guard)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.registerComplexHandler).toHaveBeenCalledTimes(14);
  });

  // ─── Plan 07-02: 4 replaced socketlib stubs — dispatchTool adapter tests ──────
  //
  // Each of the 4 replaced handlers must:
  // (a) return { success: false, error: 'invalid_input' } on malformed payload
  // (b) call dispatchTool with the correct toolId + payload (mocked)
  // (c) return the ToolResult from dispatchTool

  describe('evf.castSpell handler (Plan 07-02 replacement)', () => {
    it('returns invalid_input for malformed payload (missing args)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.castSpell', {
        bearer: 'tok',
        idempotencyKey: 'key',
      });
      // malformed: no 'args' field
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    it('returns invalid_input for non-object payload', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.castSpell', 'not-an-object');
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    it('returns invalid_input when bearer is missing', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.castSpell', {
        args: { actor_id: 'a', spell_id: 's', slot_level: 1, targets: [] },
        idempotencyKey: 'key-1',
        // missing bearer
      });
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    // Note: the dispatchTool integration test (asserting correct toolId forwarding
    // and ToolResult pass-through) lives in socketlib-handlers-dispatch.test.ts —
    // that file can use top-level vi.mock for tool-registry without affecting these tests.
  });

  describe('evf.weaponAttack handler (Plan 07-02 replacement)', () => {
    it('returns invalid_input for malformed payload', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.weaponAttack', null);
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    it('returns invalid_input when idempotencyKey is missing', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.weaponAttack', {
        args: { actor_id: 'a', item_id: 'i', targets: [], advantage: 'normal' },
        bearer: 'tok',
        // missing idempotencyKey
      });
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });
  });

  describe('evf.useItem handler (Plan 07-02 replacement)', () => {
    it('returns invalid_input for malformed payload', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.useItem', undefined);
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    it('returns invalid_input when bearer is not a string', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.useItem', {
        args: { actor_id: 'a', item_id: 'i', targets: [] },
        idempotencyKey: 'key-1',
        bearer: 42, // wrong type
      });
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });
  });

  describe('evf.moveToken handler (Plan 07-02 replacement)', () => {
    it('returns invalid_input for malformed payload', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.moveToken', 'not-an-object');
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });

    it('returns invalid_input when args is missing', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.moveToken', {
        idempotencyKey: 'key-1',
        bearer: 'tok',
        // missing args
      });
      expect(result).toEqual({ success: false, error: 'invalid_input' });
    });
  });

  // ─── Plan 07-03 + 07-05: verify replaced stubs ───────────────────────────────
  //
  // Plan 07-03 (Wave 2): evf.skillCheck renamed → evf.confirmTemplatePlacement
  // (real handler), evf.placeTemplate replaced with real handler.
  // Plan 07-05 (Wave 3): evf.setTargets renamed → evf.dropConcentration (real handler).

  it('evf.skillCheck is NOT registered (slot renamed to evf.confirmTemplatePlacement)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // callHandler throws if the handler id is not registered
    expect(() => socketlibMock.callHandler('evf.skillCheck', {})).toThrow();
  });

  it('evf.confirmTemplatePlacement is registered and returns invalid_input on empty payload', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // Empty payload fails validation — confirmTemplatePlacementHandler requires placementId + coords
    const result = await (socketlibMock.callHandler(
      'evf.confirmTemplatePlacement',
      {},
    ) as Promise<unknown>);
    expect(result).toMatchObject({ success: false, error: 'invalid_input' });
  });

  it('evf.placeTemplate is registered and returns invalid_input on empty payload', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // Empty payload fails validation — placeTemplateHandler requires actorId + itemId
    const result = await (socketlibMock.callHandler('evf.placeTemplate', {}) as Promise<unknown>);
    expect(result).toMatchObject({ success: false, error: 'invalid_input' });
  });

  it('evf.setTargets is NOT registered (slot renamed to evf.dropConcentration in Plan 07-05)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // callHandler throws if the handler id is not registered
    expect(() => socketlibMock.callHandler('evf.setTargets', {})).toThrow();
  });

  it('evf.dropConcentration is registered and returns invalid_input on empty payload (Plan 07-05)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // Empty payload fails validation — dropConcentrationHandler requires actor_id + effect_id
    const result = await (socketlibMock.callHandler(
      'evf.dropConcentration',
      {},
    ) as Promise<unknown>);
    expect(result).toMatchObject({ success: false, error: 'invalid_input' });
  });
});
