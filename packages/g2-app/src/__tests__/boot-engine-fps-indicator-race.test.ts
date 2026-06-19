/**
 * Boot-engine FPS-indicator boot-race test (BEFR-01).
 *
 * Regression guard for the boot race in `_bootEngineCore`: the FPS-indicator
 * enable flag is read from the Even Hub kv store asynchronously, but the R1
 * over-scroll menu (and therefore its `[F] FPS` toggle) is wired during the same
 * boot window. If the user toggles `[F]` BEFORE the kv read resolves, the late
 * `.then` must NOT clobber the user's choice with the pre-toggle stored value.
 *
 * The fix introduces a `fpsUserToggled` guard: once the user has expressed an
 * explicit preference, the boot-time kv read short-circuits.
 *
 * Test strategy:
 *   - The mock `getLocalStorage` returns a *deferred* promise for the FPS key
 *     so the test controls exactly when the boot-time read resolves.
 *   - `CanvasStatusHudLayer.prototype.setFpsIndicatorEnabled` is spied to record
 *     every applied state.
 *   - The over-scroll dispatcher mock captures the `makeMenu` factory (arg 3) so
 *     the test can construct the real menu panel and drive its real `[F]` toggle
 *     via `onEvent` gestures — exercising the genuine `onFpsToggle` closure.
 *   - The kv read resolves AFTER the toggle; the test asserts the resolve did
 *     not re-enable the indicator.
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts (fpsUserToggled guard)
 * @see packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts (harness this mirrors)
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
import type { QuickActionMenuPanel } from '../panels/quick-action-menu-panel.js';
import { CanvasStatusHudLayer } from '../status-hud/canvas-status-hud-layer.js';
import { createMockWorker } from './test-helpers/worker-mock.js';

const FPS_INDICATOR_KV_KEY = 'evf.fps.indicator';

// ─── Capture the makeMenu factory from the over-scroll dispatcher ──────────────

interface OverscrollRecord {
  callArgs: unknown[][];
}
const overscrollRecord: OverscrollRecord = { callArgs: [] };

vi.mock('../panels/quick-action-overscroll-dispatcher.js', () => ({
  attachQuickActionOverscroll: (...args: unknown[]): (() => void) => {
    overscrollRecord.callArgs.push(args);
    return () => {};
  },
}));

// ─── Mock infrastructure (mirrors the R1-wiring harness) ───────────────────────

function makeMockBridge(getLocalStorageImpl: (key: string) => Promise<string>): EvenAppBridge {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(StartUpPageCreateResult.success),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(ImageRawDataUpdateResult.success),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn(getLocalStorageImpl),
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

/** Index of the `[F] FPS` item in the menu's MAIN_ITEMS (S,C,L,B,I,A,M,N,F,X). */
const FPS_ITEM_INDEX = 8;

/**
 * Drive the real menu panel to select the `[F] FPS` row via genuine gestures:
 * scroll down `FPS_ITEM_INDEX` times (activeIndex starts at 0), then tap.
 */
function selectFpsItem(menu: QuickActionMenuPanel): void {
  for (let i = 0; i < FPS_ITEM_INDEX; i++) {
    menu.onEvent({ kind: 'scroll', direction: 'down' });
  }
  menu.onEvent({ kind: 'tap' });
}

describe('boot-engine FPS-indicator boot race (BEFR-01)', () => {
  const realWorker = (globalThis as { Worker?: unknown }).Worker;

  beforeEach(() => {
    overscrollRecord.callArgs = [];
    const mockWorker = createMockWorker();
    const ProxyWorker = new Proxy(
      function ProxyWorker() {
        /* unused */
      } as unknown as new (
        url: URL | string,
        opts?: WorkerOptions,
      ) => Worker,
      { construct: () => mockWorker as unknown as object },
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

  it('BEFR-01: a [F] toggle during the boot window is not clobbered by the late kv read', async () => {
    // Record every setFpsIndicatorEnabled application (boot read + toggle).
    const fpsApplySpy = vi.spyOn(CanvasStatusHudLayer.prototype, 'setFpsIndicatorEnabled');

    // Deferred FPS-key read: resolve it manually AFTER the toggle to simulate the
    // race. The stored value is '' (first-run) which, pre-fix, would force the
    // indicator back ON and clobber the user's [F] OFF toggle.
    let resolveFpsRead!: (v: string) => void;
    const fpsReadPromise = new Promise<string>((res) => {
      resolveFpsRead = res;
    });

    const bridge = makeMockBridge((key: string) => {
      if (key === FPS_INDICATOR_KV_KEY) return fpsReadPromise;
      if (key === 'view.locale.override') return Promise.resolve('auto');
      return Promise.resolve('');
    });
    const ws = makeMockSocket();

    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };

    const bootPromise = bootEngineForTest(
      { bridgeUrl: 'ws://test/bridge', token: 'test-token', locale: 'it' },
      deps,
    );

    await flushMicrotasks(32);
    ws.fireOpen();
    await flushMicrotasks(32);
    ws.fireMessage(validHandshakeServerJSON());
    await flushMicrotasks(32);

    const handle = await bootPromise;

    // The FPS-key kv read has NOT resolved yet — the boot read is still pending.
    // Build the real menu via the captured factory and toggle [F] OFF (default ON).
    const makeMenu = overscrollRecord.callArgs[0]?.[3] as (() => QuickActionMenuPanel) | undefined;
    expect(typeof makeMenu).toBe('function');
    const menu = (makeMenu as () => QuickActionMenuPanel)();

    fpsApplySpy.mockClear(); // ignore any apply that happened during construction
    selectFpsItem(menu);
    await flushMicrotasks(8);

    // The toggle applied OFF (default ON → OFF) and persisted '0'.
    expect(fpsApplySpy).toHaveBeenCalledWith(false);
    expect(bridge.setLocalStorage).toHaveBeenCalledWith(FPS_INDICATOR_KV_KEY, '0');
    const appliesAfterToggle = fpsApplySpy.mock.calls.length;

    // Now the boot-time kv read finally resolves with the pre-toggle '' value.
    resolveFpsRead('');
    await flushMicrotasks(16);

    // GUARD: the late read must NOT have re-applied the indicator state — no
    // additional setFpsIndicatorEnabled calls after the toggle.
    expect(fpsApplySpy.mock.calls.length).toBe(appliesAfterToggle);
    // And specifically it must not have re-enabled (true) the indicator.
    const reEnabledAfterToggle = fpsApplySpy.mock.calls
      .slice(appliesAfterToggle)
      .some(([v]) => v === true);
    expect(reEnabledAfterToggle).toBe(false);

    handle.teardown();
  });

  it('BEFR-02: with no toggle, the boot-time kv read still applies the stored value', async () => {
    const fpsApplySpy = vi.spyOn(CanvasStatusHudLayer.prototype, 'setFpsIndicatorEnabled');

    // Stored '0' → indicator should be applied OFF by the boot read (no toggle).
    const bridge = makeMockBridge((key: string) => {
      if (key === FPS_INDICATOR_KV_KEY) return Promise.resolve('0');
      if (key === 'view.locale.override') return Promise.resolve('auto');
      return Promise.resolve('');
    });
    const ws = makeMockSocket();
    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };

    const bootPromise = bootEngineForTest(
      { bridgeUrl: 'ws://test/bridge', token: 'test-token', locale: 'it' },
      deps,
    );
    await flushMicrotasks(32);
    ws.fireOpen();
    await flushMicrotasks(32);
    ws.fireMessage(validHandshakeServerJSON());
    await flushMicrotasks(32);
    const handle = await bootPromise;

    // The boot read applied the stored OFF value.
    expect(fpsApplySpy).toHaveBeenCalledWith(false);

    handle.teardown();
  });
});
