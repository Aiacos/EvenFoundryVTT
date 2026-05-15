/**
 * Boot-engine step 9c locale override tests (BELO-* markers — Phase 5 Plan 06).
 *
 * Verifies that `_bootEngineCore` step 9c correctly reads the locale override
 * from Even Hub kv store and passes it to downstream constructors.
 *
 * Test strategy:
 *   - Use `bootEngineForTest` (DI entry point from Phase 4a) with mock factories.
 *   - Configure `getLocalStorage` to return a specific stored value.
 *   - Assert `handle.effectiveLocale` equals the expected locale (new field
 *     added to `BootEngineHandle` in this plan).
 *
 * The harness mirrors `scene-renderer-smoke.test.ts` (Phase 4a Plan 05 exemplar)
 * exactly: the 32-iteration microtask flush + handshake server reply + Worker
 * mock pattern.
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts step 9c
 * @see packages/g2-app/src/locale/locale-override.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-06-PLAN.md Task 1
 */
import { EventEmitter } from 'node:events';
import {
  type EvenAppBridge,
  ImageRawDataUpdateResult,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootEngineForTest, type TestingDependencies } from '../index.test-support.js';
import { createMockWorker } from './test-helpers/worker-mock.js';

// ─── Mock factory (mirrors scene-renderer-smoke.test.ts) ─────────────────────

function makeMockBridge(getLocalStorageImpl?: (key: string) => Promise<string>): EvenAppBridge {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(StartUpPageCreateResult.success),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(ImageRawDataUpdateResult.success),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn(getLocalStorageImpl ?? (async () => '')),
    onDeviceStatusChanged: vi.fn(),
  } as unknown as EvenAppBridge;
}

interface MockSocket extends EventEmitter {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: EventListener, opts?: AddEventListenerOptions) => void;
  removeEventListener: (event: string, handler: EventListener) => void;
  fireOpen: () => void;
  fireMessage: (data: string) => void;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.readyState = 0;
  emitter.send = vi.fn();
  emitter.close = vi.fn(() => {
    emitter.readyState = 3;
  });
  emitter.addEventListener = (event, handler, opts): void => {
    if (opts?.once === true) {
      emitter.once(event, (data: unknown) => {
        (handler as (ev: unknown) => void)({ data, type: event });
      });
    } else {
      emitter.on(event, (data: unknown) => {
        (handler as (ev: unknown) => void)({ data, type: event });
      });
    }
  };
  emitter.removeEventListener = (event, handler): void => {
    emitter.off(event, handler as (...args: unknown[]) => void);
  };
  emitter.fireOpen = (): void => {
    emitter.readyState = 1;
    emitter.emit('open');
  };
  emitter.fireMessage = (data: string): void => {
    emitter.emit('message', data);
  };
  return emitter;
}

function validHandshakeServerJSON(): string {
  return JSON.stringify({
    proto_chosen: 'evf-v1',
    server_caps: [...SERVER_CAPS_V1],
    server_locale: 'it',
    session_id: '11111111-1111-4111-8111-111111111111',
    replay_seq: 0,
  });
}

async function flushMicrotasks(iterations = 32): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

/**
 * Boot the engine with a specific stored locale override.
 *
 * @param optsLocale     The boot-time auto-detected locale passed as `opts.locale`.
 * @param storedOverride The value `getLocalStorage('view.locale.override')` returns.
 */
async function bootWithLocaleOverride(
  optsLocale: 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br',
  storedOverride: string,
) {
  const bridge = makeMockBridge(async (key: string) => {
    if (key === 'view.locale.override') return storedOverride;
    // view.map.mode → 'auto' (no map override)
    return '';
  });
  const ws = makeMockSocket();

  const deps: TestingDependencies = {
    bridgeFactory: async () => bridge,
    wsFactory: () => ws as unknown as WebSocket,
  };

  const bootPromise = bootEngineForTest(
    { bridgeUrl: 'ws://test/bridge', token: 'test-token', locale: optsLocale },
    deps,
  );

  // Flush microtasks until boot installs the 'open' listener on the mock socket.
  await flushMicrotasks(32);
  ws.fireOpen();

  // Flush again so capability handshake installs its message listener.
  await flushMicrotasks(32);
  ws.fireMessage(validHandshakeServerJSON());

  // Flush remaining awaits (step 9b/9c kv reads + layer construction).
  await flushMicrotasks(32);

  return bootPromise;
}

// ─── BELO-* tests ─────────────────────────────────────────────────────────────

describe('boot-engine step 9c locale override (BELO-*)', () => {
  const realWorker = (globalThis as { Worker?: unknown }).Worker;

  beforeEach(() => {
    const mockWorker = createMockWorker();
    const ProxyWorker = new Proxy(
      function ProxyWorker() {
        /* unused */
      } as unknown as new (
        url: URL | string,
        opts?: WorkerOptions,
      ) => Worker,
      {
        construct() {
          return mockWorker as unknown as object;
        },
      },
    );
    (globalThis as { Worker?: unknown }).Worker = ProxyWorker;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (realWorker !== undefined) {
      (globalThis as { Worker?: unknown }).Worker = realWorker;
    } else {
      delete (globalThis as { Worker?: unknown }).Worker;
    }
    vi.restoreAllMocks();
  });

  it('BELO-1: opts.locale="it" + override="auto" → effectiveLocale is "it"', async () => {
    const handle = await bootWithLocaleOverride('it', 'auto');
    expect(handle.effectiveLocale).toBe('it');
    handle.teardown();
  });

  it('BELO-2: opts.locale="it" + override="en" → effectiveLocale is "en"', async () => {
    const handle = await bootWithLocaleOverride('it', 'en');
    expect(handle.effectiveLocale).toBe('en');
    handle.teardown();
  });

  it('BELO-3: opts.locale="it" + override="de" → effectiveLocale is "de"', async () => {
    const handle = await bootWithLocaleOverride('it', 'de');
    expect(handle.effectiveLocale).toBe('de');
    handle.teardown();
  });

  it('BELO-4: opts.locale="it" + override="es" → effectiveLocale is "es" (best-effort widened)', async () => {
    const handle = await bootWithLocaleOverride('it', 'es');
    expect(handle.effectiveLocale).toBe('es');
    handle.teardown();
  });

  it('BELO-5: opts.locale="it" + override unset (empty string) → effectiveLocale is "it"', async () => {
    const handle = await bootWithLocaleOverride('it', '');
    expect(handle.effectiveLocale).toBe('it');
    handle.teardown();
  });

  it('BELO-6: opts.locale="it" + override invalid "xx" → effectiveLocale is "it" (load returns auto)', async () => {
    const handle = await bootWithLocaleOverride('it', 'xx');
    expect(handle.effectiveLocale).toBe('it');
    handle.teardown();
  });

  it('BELO-7: override="fr" → effectiveLocale is "fr" (propagates to StatusHudRenderer)', async () => {
    const handle = await bootWithLocaleOverride('it', 'fr');
    expect(handle.effectiveLocale).toBe('fr');
    handle.teardown();
  });

  it('BELO-8: override="pt-br" → effectiveLocale is "pt-br" (best-effort; per-key EN fallback)', async () => {
    const handle = await bootWithLocaleOverride('en', 'pt-br');
    expect(handle.effectiveLocale).toBe('pt-br');
    handle.teardown();
  });
});
