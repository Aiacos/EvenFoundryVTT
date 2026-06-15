/**
 * Unit tests for socketlib-handlers — registerSocketlibHandlers.
 *
 * Mocks the `socketlib` global (real registerModule/register API — 260604-lg4)
 * and the bearer-registry functions to verify:
 * - Handler registration occurs at call time via socket.register
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
  constructor(_options?: unknown) {}
  element: HTMLElement =
    globalThis.document?.createElement?.('div') ??
    ({ querySelector: () => null, querySelectorAll: () => [] } as unknown as HTMLElement);
  render(_options?: unknown): this {
    return this;
  }
  async close(_options?: unknown): Promise<void> {}
  async _prepareContext(_options?: unknown): Promise<Record<string, unknown>> {
    return {};
  }
  _onRender(_context?: unknown, _options?: unknown): void {}
  static DEFAULT_OPTIONS = { id: '', window: { title: '' }, position: { width: 400 } };
  static PARTS = {};
}

const makeHooksMock = () => ({
  once: vi.fn(),
  on: vi.fn(),
});

/**
 * Builds a minimal Foundry actor mock with a `testUserPermission` that returns
 * true only for users in `ownerIds` (ADR-0014 ownership model).
 */
function makeActorMock(id: string, name: string, ownerIds: string[]) {
  return {
    id,
    name,
    type: 'character',
    // Minimal dnd5e system shape so getCharacterSnapshot can build a snapshot
    // for an OWNED actor (the ownership re-check must not block reads).
    system: {
      attributes: {
        hp: { value: 10, max: 10, temp: 0 },
        ac: { value: 12 },
        exhaustion: 0,
        death: { success: 0, failure: 0 },
        init: { total: 0 },
        movement: { walk: 30 },
      },
      details: { level: 1 },
      abilities: undefined,
      skills: undefined,
      spells: {},
    },
    img: '',
    statuses: new Set<string>(),
    items: { contents: [] },
    testUserPermission: vi.fn((user: { id: string }, _perm: string) => ownerIds.includes(user.id)),
  };
}

const makeGameMock = (
  opts: {
    actors?: ReturnType<typeof makeActorMock>[];
    users?: Array<{ id: string; name: string; isGM: boolean }>;
  } = {},
) => {
  const store = new Map<string, unknown>();
  const actorList = opts.actors ?? [];
  const userList = opts.users ?? [];
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
      get: vi.fn((actorId: string) => actorList.find((a) => a.id === actorId)),
      contents: actorList,
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
      get: vi.fn((userId: string) => userList.find((u) => u.id === userId)),
      contents: userList,
    },
  };
};

// ─── Socketlib mock (real registerModule/register API — 260604-lg4) ───────────

type HandlerFn = (...args: unknown[]) => unknown;

/**
 * Builds a socketlib mock matching the REAL farling42/foundryvtt-socketlib API:
 * `registerModule(moduleId)` returns a module-scoped socket whose `register(name,
 * fn)` (a vi spy) stores handlers, and whose `executeAsGM` / `callHandler` helpers
 * invoke a registered handler by name. The `register` spy is the one asserted for
 * the 17-handler invariant.
 */
function makeSocketlibMock() {
  const handlers = new Map<string, HandlerFn>();
  const socket = {
    register: vi.fn((name: string, fn: HandlerFn) => {
      handlers.set(name, fn);
    }),
    executeAsGM: vi.fn(async (name: string, ...args: unknown[]) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`No handler: ${name}`);
      return handler(...args);
    }),
    /** Test helper: directly call a registered handler */
    callHandler(name: string, ...args: unknown[]): unknown {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`No handler: ${name}`);
      return handler(...args);
    },
    _handlers: handlers,
  };
  return {
    registerModule: vi.fn(() => socket),
    /** The module-scoped socket (exposed so tests can assert register + call handlers). */
    socket,
    /** Convenience pass-through to the socket's register spy. */
    register: socket.register,
    /** Convenience pass-through to the socket's callHandler helper. */
    callHandler(name: string, ...args: unknown[]): unknown {
      return socket.callHandler(name, ...args);
    },
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('registerSocketlibHandlers', () => {
  let socketlibMock: ReturnType<typeof makeSocketlibMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
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
    expect(socketlibMock.registerModule).toHaveBeenCalledWith('evenfoundryvtt');
    expect(socketlibMock.register).toHaveBeenCalledWith('evf.validateToken', expect.any(Function));
  });

  it('registers evf.revokeToken handler', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.register).toHaveBeenCalledWith('evf.revokeToken', expect.any(Function));
  });

  describe('evf.validateToken handler', () => {
    it('returns { valid: true } for a valid token', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();

      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
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

      const entry = await generateBearer('Device', 'https://bridge.local:8910', 'world', 'user-1');
      const result = await socketlibMock.callHandler('evf.revokeToken', entry.token);
      expect(result).toEqual({ success: true });

      // Verify the bearer was actually revoked
      const validation = validateBearer(entry.token);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('revoked');
    });

    it('returns { success: true } for unknown token (no-op, no throw)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.revokeToken', 'unknown-token');
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false } for non-string input (T-02-04 guard)', async () => {
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      registerSocketlibHandlers();

      const result = await socketlibMock.callHandler('evf.revokeToken', { evil: 'object' });
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
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
      // game.actors.get returns undefined (default mock)
      const result = socketlibMock.callHandler('evf.getCharacterSnapshot', 'actor-1', entry.token);
      expect(result).toBeNull();
    });

    // ── ADR-0014: per-actor ownership re-check (defence in depth) ──────────────

    it('returns null when the bound user does NOT own the requested actorId (ADR-0014)', async () => {
      // user-bob is bound to the bearer but only owns actor-bob; requesting
      // actor-alice (owned by user-alice) must be denied.
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [
            makeActorMock('actor-alice', 'Alice', ['user-alice']),
            makeActorMock('actor-bob', 'Bob', ['user-bob']),
          ],
          users: [
            { id: 'user-alice', name: 'Alice', isGM: false },
            { id: 'user-bob', name: 'Bob', isGM: false },
          ],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Bob G2',
        'https://bridge.local:8910',
        'world',
        'user-bob',
      );

      const denied = socketlibMock.callHandler(
        'evf.getCharacterSnapshot',
        'actor-alice',
        entry.token,
      );
      expect(denied).toBeNull();
    });

    it('returns a snapshot when the bound user OWNs the requested actorId (ADR-0014)', async () => {
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [makeActorMock('actor-bob', 'Bob', ['user-bob'])],
          users: [{ id: 'user-bob', name: 'Bob', isGM: false }],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Bob G2',
        'https://bridge.local:8910',
        'world',
        'user-bob',
      );

      const allowed = socketlibMock.callHandler(
        'evf.getCharacterSnapshot',
        'actor-bob',
        entry.token,
      );
      // Owned + exists → a snapshot object (not null).
      expect(allowed).not.toBeNull();
      expect(allowed).toMatchObject({ actorId: 'actor-bob' });
    });
  });

  // ── ADR-0014: evf.validateToken returns userId + authorizedActorIds ──────────

  describe('evf.validateToken handler (ADR-0014 authorization)', () => {
    it('returns entry.userId + authorizedActorIds for a valid bearer', async () => {
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [
            makeActorMock('actor-bob', 'Bob', ['user-bob']),
            makeActorMock('actor-bob2', 'Bob Alt', ['user-bob']),
            makeActorMock('actor-alice', 'Alice', ['user-alice']),
          ],
          users: [
            { id: 'user-bob', name: 'Bob', isGM: false },
            { id: 'user-alice', name: 'Alice', isGM: false },
          ],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Bob G2',
        'https://bridge.local:8910',
        'world',
        'user-bob',
      );

      const result = socketlibMock.callHandler('evf.validateToken', entry.token) as {
        valid: boolean;
        entry?: { userId: string };
        authorizedActorIds?: string[];
      };
      expect(result.valid).toBe(true);
      expect(result.entry).toEqual({ userId: 'user-bob' });
      // Only the two actors user-bob OWNs, never actor-alice.
      expect(result.authorizedActorIds?.sort()).toEqual(['actor-bob', 'actor-bob2']);
    });

    it('NEVER includes the bearer token value in the result (T-02-01)', async () => {
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [makeActorMock('actor-bob', 'Bob', ['user-bob'])],
          users: [{ id: 'user-bob', name: 'Bob', isGM: false }],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Bob G2',
        'https://bridge.local:8910',
        'world',
        'user-bob',
      );

      const result = socketlibMock.callHandler('evf.validateToken', entry.token);
      expect(JSON.stringify(result)).not.toContain(entry.token);
    });

    it('fail-closed: empty authorizedActorIds when the bound user no longer exists (ADR-0014 §5)', async () => {
      // Bearer bound to user-ghost, but game.users.get returns undefined for it.
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [makeActorMock('actor-bob', 'Bob', ['user-bob'])],
          users: [{ id: 'user-bob', name: 'Bob', isGM: false }],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Ghost G2',
        'https://bridge.local:8910',
        'world',
        'user-ghost',
      );

      const result = socketlibMock.callHandler('evf.validateToken', entry.token) as {
        valid: boolean;
        entry?: { userId: string };
        authorizedActorIds?: string[];
      };
      expect(result.valid).toBe(true);
      expect(result.entry).toEqual({ userId: 'user-ghost' });
      expect(result.authorizedActorIds).toEqual([]);
    });
  });

  // ── ADR-0014: evf.listCharacters scopes the roster to the bound user ─────────

  describe('evf.listCharacters handler (ADR-0014 roster scoping)', () => {
    it('returns only the bound user OWNed characters', async () => {
      vi.stubGlobal(
        'game',
        makeGameMock({
          actors: [
            makeActorMock('actor-bob', 'Bob', ['user-bob']),
            makeActorMock('actor-alice', 'Alice', ['user-alice']),
          ],
          users: [
            { id: 'user-bob', name: 'Bob', isGM: false },
            { id: 'user-alice', name: 'Alice', isGM: false },
          ],
        }),
      );
      const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
      const { generateBearer } = await import('./bearer-registry.js');
      registerSocketlibHandlers();
      const entry = await generateBearer(
        'Bob G2',
        'https://bridge.local:8910',
        'world',
        'user-bob',
      );

      const roster = socketlibMock.callHandler(
        'evf.listCharacters',
        'world',
        entry.token,
      ) as Array<{ actorId: string }>;
      expect(roster.map((c) => c.actorId)).toEqual(['actor-bob']);
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
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
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
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
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
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
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
      const entry = await generateBearer('Test', 'https://bridge.local:8910', 'world', 'user-1');
      // Handler signature is (_worldId, token); pass 'world-1' as worldId, token second
      expect(() =>
        socketlibMock.callHandler('evf.listCharacters', 'world-1', entry.token),
      ).not.toThrow();
      const result = socketlibMock.callHandler('evf.listCharacters', 'world-1', entry.token);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── Phase 13 Plan 13-01: registerComplexHandler count FLIP 14 → 17 ────────────
  //
  // PHASE 13 INVARIANT: total registerComplexHandler count = 17.
  // Plan 07-02 replaced 4 stub function bodies in-place — NO new registrations.
  // Plan 07-03 replaced 2 more stubs in-place AND renamed evf.skillCheck →
  // evf.confirmTemplatePlacement (still in-place, count was 14).
  // Plan 13-01 ADDS 3 new reaction handlers: castShield + castCounterspell + opportunityAttack.
  // Phase 13 INVARIANT FLIP: count = 17. Future phases must NOT change this count
  // unless explicitly adding new socketlib handlers with a plan amendment.

  it('registers exactly 17 handlers total (Phase 13 invariant FLIP — 14 → 17)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    // registerModule is called exactly once; the socket's register spy is called 17×.
    expect(socketlibMock.registerModule).toHaveBeenCalledTimes(1);
    expect(socketlibMock.register).toHaveBeenCalledTimes(17);
  });

  // Positive assertions for the 3 new ACT-04 handlers
  it('registers evf.castShield with a dispatch adapter', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.register).toHaveBeenCalledWith('evf.castShield', expect.any(Function));
  });

  it('registers evf.castCounterspell with a dispatch adapter', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.register).toHaveBeenCalledWith(
      'evf.castCounterspell',
      expect.any(Function),
    );
  });

  it('registers evf.opportunityAttack with a dispatch adapter', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    registerSocketlibHandlers();
    expect(socketlibMock.register).toHaveBeenCalledWith(
      'evf.opportunityAttack',
      expect.any(Function),
    );
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
