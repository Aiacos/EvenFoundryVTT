/**
 * Write-path per-actor authorization tests — ADR-0014 Amendment 1.
 *
 * Proves the Foundry-side authoritative gate in `makeDispatchAdapter`
 * (socketlib-handlers.ts): a `tool.invoke` whose acting `args.actor_id` is NOT
 * owned by the bearer's bound user is rejected with `not_authorized` BEFORE
 * `dispatchTool` runs; an owned actor passes; tools without an acting actor
 * (move-token) are unaffected; an invalid bearer fails closed.
 *
 * Mocks `dispatchTool` so we can assert it is (or is not) invoked, and stubs
 * `game.users` / `game.actors` / `testUserPermission` so `authorizedActorIdsForUser`
 * computes a real owned set. The bearer registry is exercised through the real
 * `validateBearer` against a stubbed Foundry settings store seeded with one entry.
 *
 * vi.mock must be top-level (Vitest hoist). Kept separate from the existing
 * socketlib-handlers-dispatch.test.ts so the dispatchTool mock here (which lets
 * us observe call/no-call) does not affect that suite.
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (makeDispatchAdapter gate)
 * @see packages/foundry-module/src/pair/actor-authorization.ts (authorizedActorIdsForUser)
 * @see docs/architecture/0014-bearer-actor-authorization.md (Amendment 1)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Top-level vi.mock — observe whether dispatchTool runs (it must NOT on deny).
vi.mock('../write-path/tool-registry.js', () => ({
  dispatchTool: vi.fn().mockResolvedValue({ success: true, data: { dispatched: true } }),
  TOOL_REGISTRY: {},
  TOOL_HANDLER_IDS: {
    'cast-spell': 'evf.castSpell',
    'weapon-attack': 'evf.weaponAttack',
    'use-item': 'evf.useItem',
    'move-token': 'evf.moveToken',
    'drop-concentration': 'evf.dropConcentration',
    'place-template': 'evf.placeTemplate',
  },
  registerToolHandler: vi.fn(),
  moduleIdempotencyStore: { get: vi.fn(), set: vi.fn() },
  extractActorId: vi.fn(() => null),
}));

// Audit-log + idempotency are real dependencies of the gate; stub their
// Foundry-touching side effects to no-ops so the gate's audit-on-deny path is
// exercised without a real settings store.
vi.mock('../write-path/audit-log.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../write-path/idempotency-cache.js', () => ({
  hashBearer: vi.fn().mockResolvedValue('deadbeefcafef00d'),
}));

// Stub the bearer registry so validateBearer maps a token → bound user.
vi.mock('./bearer-registry.js', () => ({
  validateBearer: vi.fn(),
  revokeBearer: vi.fn().mockResolvedValue(undefined),
}));

// ─── Foundry global stubs ─────────────────────────────────────────────────────

class ApplicationStub {
  get title(): string {
    return '';
  }
}

class ApplicationV2Stub {
  render(_options?: unknown): this {
    return this;
  }
  async close(_options?: unknown): Promise<void> {}
  async _prepareContext(_options?: unknown): Promise<Record<string, unknown>> {
    return {};
  }
  static DEFAULT_OPTIONS = { id: '', window: { title: '' }, position: { width: 400 } };
  static PARTS = {};
}

type HandlerFn = (...args: unknown[]) => unknown;

function makeSocketlibMock() {
  const handlers = new Map<string, HandlerFn>();
  const socket = {
    register: vi.fn((name: string, fn: HandlerFn) => {
      handlers.set(name, fn);
    }),
    executeAsGM: vi.fn(),
    callHandler(name: string, ...args: unknown[]): unknown {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`No handler: ${name}`);
      return handler(...args);
    },
  };
  return { registerModule: vi.fn(() => socket), socket };
}

/**
 * Builds a game mock where `user-owner` OWNs `actor-owned` and nothing else.
 * `authorizedActorIdsForUser('user-owner')` therefore returns `['actor-owned']`.
 */
function makeGameMock() {
  const ownerUser = { id: 'user-owner' };
  const actors = [
    { id: 'actor-owned', testUserPermission: (u: { id: string }) => u.id === 'user-owner' },
    { id: 'actor-foreign', testUserPermission: () => false },
  ];
  return {
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'en', localize: vi.fn((k: string) => k) },
    actors: {
      get: vi.fn((id: string) => actors.find((a) => a.id === id)),
      contents: actors,
    },
    users: { get: vi.fn((id: string) => (id === 'user-owner' ? ownerUser : undefined)) },
    user: { isGM: false, targets: new Set() },
    combat: null,
    scenes: { active: null },
    messages: { get: vi.fn(), contents: [] },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('write-path per-actor authorization (ADR-0014 Amendment 1)', () => {
  let socketlibMock: ReturnType<typeof makeSocketlibMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });
    vi.stubGlobal('game', makeGameMock());
    socketlibMock = makeSocketlibMock();
    vi.stubGlobal('socketlib', socketlibMock);
  });

  it('rejects a write whose acting actor_id is NOT owned — not_authorized, dispatchTool NOT called', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    // Bearer is valid + bound to user-owner (who owns ONLY actor-owned).
    vi.mocked(validateBearer).mockReturnValue({
      valid: true,
      entry: { userId: 'user-owner' },
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    const result = await socketlibMock.socket.callHandler('evf.castSpell', {
      args: { actor_id: 'actor-foreign', spell_id: 'spell-1', slot_level: 0, targets: [] },
      idempotencyKey: 'key-1',
      bearer: 'token-abc',
    });

    expect(result).toEqual({ success: false, error: 'not_authorized' });
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('allows a write whose acting actor_id IS owned — dispatchTool called', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    vi.mocked(validateBearer).mockReturnValue({
      valid: true,
      entry: { userId: 'user-owner' },
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    const payload = {
      args: { actor_id: 'actor-owned', spell_id: 'spell-1', slot_level: 0, targets: [] },
      idempotencyKey: 'key-2',
      bearer: 'token-abc',
    };
    const result = await socketlibMock.socket.callHandler('evf.castSpell', payload);

    expect(dispatchTool).toHaveBeenCalledWith('cast-spell', payload);
    expect(result).toEqual({ success: true, data: { dispatched: true } });
  });

  it('does NOT restrict TARGETS — owned acting actor, foreign targets, still dispatches', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    vi.mocked(validateBearer).mockReturnValue({
      valid: true,
      entry: { userId: 'user-owner' },
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    // Acting actor is owned; targets point at a foreign actor's token (a monster).
    const payload = {
      args: {
        actor_id: 'actor-owned',
        item_id: 'sword-1',
        targets: ['actor-foreign', 'monster-token-9'],
        advantage: 'normal',
      },
      idempotencyKey: 'key-3',
      bearer: 'token-abc',
    };
    const result = await socketlibMock.socket.callHandler('evf.weaponAttack', payload);

    expect(dispatchTool).toHaveBeenCalledWith('weapon-attack', payload);
    expect(result).toEqual({ success: true, data: { dispatched: true } });
  });

  it('tools without an acting actor_id (move-token) are unaffected — dispatchTool called', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    vi.mocked(validateBearer).mockReturnValue({
      valid: true,
      entry: { userId: 'user-owner' },
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    const payload = {
      args: { token_id: 'tok-1', x: 100, y: 200 },
      idempotencyKey: 'key-4',
      bearer: 'token-abc',
    };
    const result = await socketlibMock.socket.callHandler('evf.moveToken', payload);

    expect(dispatchTool).toHaveBeenCalledWith('move-token', payload);
    expect(result).toEqual({ success: true, data: { dispatched: true } });
  });

  it('fails closed on an invalid bearer — not_authorized, dispatchTool NOT called', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    vi.mocked(validateBearer).mockReturnValue({
      valid: false,
      reason: 'unknown_token',
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    const result = await socketlibMock.socket.callHandler('evf.castSpell', {
      args: { actor_id: 'actor-owned', spell_id: 'spell-1', slot_level: 0, targets: [] },
      idempotencyKey: 'key-5',
      bearer: 'bad-token',
    });

    expect(result).toEqual({ success: false, error: 'not_authorized' });
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('writes a denied-write audit entry on rejection (best-effort observability)', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { validateBearer } = await import('./bearer-registry.js');
    const { writeAuditLog } = await import('../write-path/audit-log.js');
    vi.mocked(validateBearer).mockReturnValue({
      valid: true,
      entry: { userId: 'user-owner' },
    } as ReturnType<typeof validateBearer>);

    registerSocketlibHandlers();

    await socketlibMock.socket.callHandler('evf.castSpell', {
      args: { actor_id: 'actor-foreign', spell_id: 'spell-1', slot_level: 0, targets: [] },
      idempotencyKey: 'key-6',
      bearer: 'token-abc',
    });

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(writeAuditLog).mock.calls[0]?.[0];
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      tool: 'cast-spell',
      actorId: 'actor-foreign',
      result: { success: false, error: 'not_authorized' },
    });
    // T-02-01: the raw bearer must never appear — only the hashed prefix.
    expect(entry?.bearer_id).toBe('deadbeef');
  });
});
