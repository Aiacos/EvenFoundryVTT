/**
 * Integration test: socketlib handler → dispatchTool forwarding (Plan 07-02).
 *
 * Tests that the 4 replaced socketlib handlers correctly forward their payloads
 * to dispatchTool with the right ToolId and return the ToolResult.
 *
 * vi.mock must be at top-level (Vitest requirement). Separated from the main
 * socketlib-handlers.test.ts to avoid the mock affecting unrelated tests.
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts
 * @see packages/foundry-module/src/write-path/tool-registry.ts (dispatchTool)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 2
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Top-level vi.mock — hoisted by Vitest before any imports or test code.
vi.mock('../write-path/tool-registry.js', () => ({
  dispatchTool: vi.fn().mockResolvedValue({ success: true, data: { chatCardId: 'cm-mock' } }),
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
    callHandler(handlerId: string, ...args: unknown[]): unknown {
      const handler = handlers.get(handlerId);
      if (!handler) throw new Error(`No handler: ${handlerId}`);
      return handler(...args);
    },
    _handlers: handlers,
  };
}

function makeGameMock() {
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
    actors: { get: vi.fn(() => undefined), contents: [] as unknown[] },
    combat: null,
    scenes: { active: null },
    user: { isGM: false, targets: new Set() },
    users: { get: vi.fn(() => undefined) },
    messages: { get: vi.fn(() => undefined), contents: [] },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('socketlib handlers → dispatchTool forwarding (Plan 07-02)', () => {
  let socketlibMock: ReturnType<typeof makeSocketlibMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: { api: { ApplicationV2: ApplicationV2Stub } },
    });
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });
    vi.stubGlobal('game', makeGameMock());
    socketlibMock = makeSocketlibMock();
    vi.stubGlobal('socketlib', socketlibMock);
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });
  });

  it('evf.castSpell forwards correct toolId + payload to dispatchTool', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    registerSocketlibHandlers();

    const payload = {
      args: { actor_id: 'actor-1', spell_id: 'spell-1', slot_level: 3, targets: [] },
      idempotencyKey: 'idem-key-1',
      bearer: 'token-abc',
    };

    const result = await socketlibMock.callHandler('evf.castSpell', payload);

    expect(dispatchTool).toHaveBeenCalledWith('cast-spell', {
      args: payload.args,
      idempotencyKey: payload.idempotencyKey,
      bearer: payload.bearer,
    });
    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-mock' } });
  });

  it('evf.weaponAttack forwards correct toolId + payload to dispatchTool', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    registerSocketlibHandlers();

    const payload = {
      args: { actor_id: 'actor-1', item_id: 'sword-1', targets: [], advantage: 'normal' },
      idempotencyKey: 'idem-key-2',
      bearer: 'token-xyz',
    };

    const result = await socketlibMock.callHandler('evf.weaponAttack', payload);

    expect(dispatchTool).toHaveBeenCalledWith('weapon-attack', {
      args: payload.args,
      idempotencyKey: payload.idempotencyKey,
      bearer: payload.bearer,
    });
    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-mock' } });
  });

  it('evf.useItem forwards correct toolId + payload to dispatchTool', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    registerSocketlibHandlers();

    const payload = {
      args: { actor_id: 'actor-1', item_id: 'potion-1', targets: [] },
      idempotencyKey: 'idem-key-3',
      bearer: 'token-abc',
    };

    const result = await socketlibMock.callHandler('evf.useItem', payload);

    expect(dispatchTool).toHaveBeenCalledWith('use-item', {
      args: payload.args,
      idempotencyKey: payload.idempotencyKey,
      bearer: payload.bearer,
    });
    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-mock' } });
  });

  it('evf.moveToken forwards correct toolId + payload to dispatchTool', async () => {
    const { registerSocketlibHandlers } = await import('./socketlib-handlers.js');
    const { dispatchTool } = await import('../write-path/tool-registry.js');
    registerSocketlibHandlers();

    const payload = {
      args: { token_id: 'tok-1', x: 100, y: 200 },
      idempotencyKey: 'idem-key-4',
      bearer: 'token-abc',
    };

    const result = await socketlibMock.callHandler('evf.moveToken', payload);

    expect(dispatchTool).toHaveBeenCalledWith('move-token', {
      args: payload.args,
      idempotencyKey: payload.idempotencyKey,
      bearer: payload.bearer,
    });
    expect(result).toEqual({ success: true, data: { chatCardId: 'cm-mock' } });
  });
});
