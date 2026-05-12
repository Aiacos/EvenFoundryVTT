/**
 * Unit tests for auto-connect.ts.
 *
 * Tests the g2.wear event handler registration, session loading, and
 * handshake stub behaviors.
 *
 * `hub` global is mocked for eventBus and tier3-storage calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, defaultI18n, type WizardState, WizardStep } from './state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** In-memory kv store + event bus for Even Hub simulation. */
function createHubMock() {
  const kvStore = new Map<string, string>();
  const eventListeners = new Map<string, Array<() => void>>();

  const hubMock = {
    setItem: vi.fn(async (key: string, value: string) => {
      kvStore.set(key, value);
    }),
    getItem: vi.fn(async (key: string): Promise<string | null> => {
      return kvStore.get(key) ?? null;
    }),
    removeItem: vi.fn(async (key: string) => {
      kvStore.delete(key);
    }),
    eventBus: {
      on: vi.fn((event: string, fn: () => void) => {
        const existing = eventListeners.get(event) ?? [];
        existing.push(fn);
        eventListeners.set(event, existing);
      }),
      off: vi.fn((event: string, fn: () => void) => {
        const filtered = (eventListeners.get(event) ?? []).filter((h) => h !== fn);
        eventListeners.set(event, filtered);
      }),
    },
  };

  /** Fire all registered listeners for the given event. */
  function fire(event: string): void {
    const fns = eventListeners.get(event) ?? [];
    for (const fn of fns) {
      fn();
    }
  }

  return { hubMock, kvStore, fire };
}

function makeStore(
  partial: Partial<WizardState> = {},
): ReturnType<typeof createStore<WizardState>> {
  return createStore<WizardState>({
    step: WizardStep.STEP1,
    bridgeUrl: 'https://bridge.local:8910',
    token: '',
    characterId: '',
    profileId: '00000000-0000-4000-8000-000000000001',
    i18n: defaultI18n,
    error: null,
    ...partial,
  });
}

describe('auto-connect — initAutoConnect', () => {
  let hubCtx: ReturnType<typeof createHubMock>;

  beforeEach(() => {
    vi.resetModules();
    hubCtx = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubCtx.hubMock;
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('registers g2.wear listener on hub.eventBus', async () => {
    const { initAutoConnect } = await import('./auto-connect.js');
    const store = makeStore();

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');

    expect(hubCtx.hubMock.eventBus.on).toHaveBeenCalledWith('g2.wear', expect.any(Function));
  });

  it('is idempotent — calling twice deregisters previous listener', async () => {
    const { initAutoConnect } = await import('./auto-connect.js');
    const store = makeStore();

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');
    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');

    // off should have been called once (removing the first handler)
    expect(hubCtx.hubMock.eventBus.off).toHaveBeenCalledTimes(1);
    // on should have been called twice total
    expect(hubCtx.hubMock.eventBus.on).toHaveBeenCalledTimes(2);
  });

  it('g2.wear event with no session sets step to STEP1', async () => {
    const { initAutoConnect } = await import('./auto-connect.js');
    const store = makeStore({ step: WizardStep.COMPLETION });

    // Ensure no session in kv store (getItem returns null for any key)
    hubCtx.hubMock.getItem.mockResolvedValue(null);

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');

    // Fire the wear event
    hubCtx.fire('g2.wear');

    // Wait for the async handler to set store to STEP1
    await vi.waitFor(
      () => {
        if (store.get().step !== WizardStep.STEP1)
          throw new Error(`step still ${store.get().step}`);
      },
      { timeout: 2000 },
    );

    expect(store.get().step).toBe(WizardStep.STEP1);
    expect(store.get().error).toBeNull();
  });

  it('g2.wear event with session calls openHandshakeWebSocket stub (logs warn)', async () => {
    const { initAutoConnect } = await import('./auto-connect.js');
    const store = makeStore();

    // Store a valid session
    const session = {
      profileId: '00000000-0000-4000-8000-000000000001',
      bridgeUrl: 'https://bridge.local:8910',
      tokenObfuscated: null,
      characterId: 'char-1',
      savedAt: Date.now(),
    };
    const sessionKey = 'evf.session.00000000-0000-4000-8000-000000000001';
    hubCtx.kvStore.set(sessionKey, JSON.stringify(session));
    hubCtx.hubMock.getItem.mockImplementation(async (key: string) => {
      return hubCtx.kvStore.get(key) ?? null;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');
    hubCtx.fire('g2.wear');

    // The stub logs a warning — wait for it
    await vi.waitFor(
      () => {
        if (!warnSpy.mock.calls.some((c) => String(c[0]).includes('WS handshake stub')))
          throw new Error('warn not called yet');
      },
      { timeout: 2000 },
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WS handshake stub'));
  });
});

describe('auto-connect — cleanupAutoConnect', () => {
  let hubCtx: ReturnType<typeof createHubMock>;

  beforeEach(() => {
    vi.resetModules();
    hubCtx = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubCtx.hubMock;
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('deregisters the g2.wear listener', async () => {
    const { initAutoConnect, cleanupAutoConnect } = await import('./auto-connect.js');
    const store = makeStore();

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');
    cleanupAutoConnect();

    expect(hubCtx.hubMock.eventBus.off).toHaveBeenCalledWith('g2.wear', expect.any(Function));
  });

  it('is safe to call without a prior initAutoConnect', async () => {
    const { cleanupAutoConnect } = await import('./auto-connect.js');

    // Should not throw
    expect(() => cleanupAutoConnect()).not.toThrow();
  });

  it('is idempotent — calling twice is safe', async () => {
    const { initAutoConnect, cleanupAutoConnect } = await import('./auto-connect.js');
    const store = makeStore();

    initAutoConnect(store, '00000000-0000-4000-8000-000000000001');
    cleanupAutoConnect();
    expect(() => cleanupAutoConnect()).not.toThrow();
  });
});

describe('auto-connect — openHandshakeWebSocket', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as Record<string, unknown>).hub = {
      setItem: vi.fn(),
      getItem: vi.fn(async () => null),
      removeItem: vi.fn(),
      eventBus: { on: vi.fn(), off: vi.fn() },
    };
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('is a stub that logs a warning and returns without throwing', async () => {
    const { openHandshakeWebSocket } = await import('./auto-connect.js');
    const store = makeStore();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      openHandshakeWebSocket('https://bridge.local:8910', store),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WS handshake stub'));
  });

  it('stub does not modify store state', async () => {
    const { openHandshakeWebSocket } = await import('./auto-connect.js');
    const store = makeStore({ step: WizardStep.STEP3 });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await openHandshakeWebSocket('https://bridge.local:8910', store);

    expect(store.get().step).toBe(WizardStep.STEP3);
  });
});
