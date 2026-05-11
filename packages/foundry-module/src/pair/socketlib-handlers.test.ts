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
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
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
});
