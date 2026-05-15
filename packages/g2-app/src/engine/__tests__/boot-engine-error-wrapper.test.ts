/**
 * Integration tests for `bootEngineWithErrorUi` (Phase 4b Plan 04 Task 3).
 *
 * Exercises the wrapper's error-path semantics end-to-end against the real
 * `_bootEngineCore` boot sequence, simulating each of the 5 distinct
 * exception sources from RESEARCH §Q3:
 *
 *   - BOOT-ERR-INT-01: HandshakeError('transport_error') → bridge_unreachable
 *   - BOOT-ERR-INT-02: HandshakeError('parse_failed') / schema_failed → handshake_failed
 *   - BOOT-ERR-INT-03: HandshakeError('timeout')                  → handshake_failed
 *   - BOOT-ERR-INT-04: WS error before open ("1006-like")         → bridge_unreachable
 *   - BOOT-ERR-INT-05: proto_chosen mismatch from server          → version_mismatch
 *   - BOOT-ERR-INT-06: happy path — handle returned unchanged, no error UI mount
 *   - BOOT-ERR-INT-07: double-failure — _bootEngineCore throws AND
 *                      BootErrorLayer.draw() rejects → original cause rethrown
 *
 * **Why `vi.doMock` is NOT used here:** the plan suggested `vi.doMock` to
 * inject `HandshakeError` rejections. The actual `TestingDependencies` shape
 * already exposes `wsFactory` and `bridgeFactory` — enough surface to simulate
 * EVERY error source by:
 *   - Returning a rejecting `bridgeFactory` (Plan 06 rejection / token gates)
 *   - Returning a mock socket whose `addEventListener('error', …)` triggers
 *     `awaitWsOpen` rejection (BOOT-ERR-INT-04)
 *   - Returning a mock socket whose first `message` event fires with malformed
 *     JSON / wrong schema / wrong `proto_chosen` to drive `HandshakeError`
 *     codes (BOOT-ERR-INT-01..03, BOOT-ERR-INT-05)
 *
 * Sticking with `TestingDependencies` keeps the test hermetic per `vitest`
 * import semantics — no module-level mock leakage across tests in the file.
 *
 * Test discriminator markers `BOOT-ERR-INT-01`..`BOOT-ERR-INT-07` are embedded
 * verbatim in `it()` titles so `grep -cE 'BOOT-ERR-INT-0[1-7]'` matches 7.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q3 + §Approach 4
 */
import { EventEmitter } from 'node:events';
import {
  type EvenAppBridge,
  ImageRawDataUpdateResult,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWorker, type MockWorker } from '../../__tests__/test-helpers/worker-mock.js';
import type { TestingDependencies } from '../../index.test-support.js';
import { bootEngineWithErrorUi } from '../boot-engine-error-wrapper.js';
import { HandshakeError } from '../capability-handshake.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock bridge — same shape used by scene-renderer-smoke.test.ts.
// ──────────────────────────────────────────────────────────────────────────────

interface MockBridgeOptions {
  /** Reject the next textContainerUpgrade call (BOOT-ERR-INT-07 double-failure). */
  readonly rejectBootErrorUpgrade?: boolean;
}

function makeMockBridge(opts: MockBridgeOptions = {}) {
  const createStartUpPageContainer = vi.fn().mockResolvedValue(StartUpPageCreateResult.success);
  const rebuildPageContainer = vi.fn().mockResolvedValue(true);
  // textContainerUpgrade rejects for the boot-error block in BOOT-ERR-INT-07.
  const textContainerUpgrade = vi.fn().mockImplementation(async (payload: unknown) => {
    if (
      opts.rejectBootErrorUpgrade === true &&
      typeof payload === 'object' &&
      payload !== null &&
      (payload as { containerName?: string }).containerName === 'boot-error-block'
    ) {
      throw new Error('simulated bridge render failure');
    }
    return true;
  });
  const updateImageRawData = vi.fn().mockResolvedValue(ImageRawDataUpdateResult.success);
  const shutDownPageContainer = vi.fn().mockResolvedValue(true);
  const setLocalStorage = vi.fn().mockResolvedValue(undefined);
  const getLocalStorage = vi.fn(async () => '');
  const onDeviceStatusChanged = vi.fn();
  const bridge = {
    createStartUpPageContainer,
    rebuildPageContainer,
    textContainerUpgrade,
    updateImageRawData,
    shutDownPageContainer,
    setLocalStorage,
    getLocalStorage,
    onDeviceStatusChanged,
  } as unknown as EvenAppBridge;
  return {
    bridge,
    createStartUpPageContainer,
    rebuildPageContainer,
    textContainerUpgrade,
    updateImageRawData,
    shutDownPageContainer,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// MockSocket — EventEmitter-backed WS stand-in mirroring scene-renderer-smoke.
// ──────────────────────────────────────────────────────────────────────────────

interface MockSocket extends EventEmitter {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: EventListener, opts?: AddEventListenerOptions) => void;
  removeEventListener: (event: string, handler: EventListener) => void;
  fireMessage: (data: string) => void;
  fireOpen: () => void;
  fireError: () => void;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.readyState = 0; // CONNECTING
  emitter.send = vi.fn();
  emitter.close = vi.fn(() => {
    emitter.readyState = 3; // CLOSED
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
  emitter.fireMessage = (data: string): void => {
    emitter.emit('message', data);
  };
  emitter.fireOpen = (): void => {
    emitter.readyState = 1;
    emitter.emit('open');
  };
  emitter.fireError = (): void => {
    // The awaitWsOpen helper in boot-engine-core listens for 'error' events on
    // the socket. The handler receives the synthetic event shape `{type, data}`
    // produced by `addEventListener` above; awaitWsOpen reads `.type` (string)
    // and rejects with "[boot-engine-core] WebSocket error before open: <type>".
    emitter.emit('error', undefined);
  };
  return emitter;
}

// ──────────────────────────────────────────────────────────────────────────────
// Worker mock — Vite-canonical `new Worker(new URL(...))` returns a MockWorker.
// ──────────────────────────────────────────────────────────────────────────────

const realWorker = (globalThis as { Worker?: unknown }).Worker;

function installWorkerMock(): MockWorker {
  // The MockWorker reference is intentionally not stored — these integration
  // tests only need the global `Worker` constructor swap so RasterController's
  // happy-path construction does not crash on happy-dom. Tests that assert on
  // worker.postMessage / .terminate live in scene-renderer-smoke.test.ts.
  const worker = createMockWorker();
  const ProxyWorker = new Proxy(
    function ProxyWorker() {
      /* unused — Proxy.construct trap handles instantiation */
    } as unknown as new (
      url: URL | string,
      opts?: WorkerOptions,
    ) => Worker,
    {
      construct() {
        return worker as unknown as object;
      },
    },
  );
  (globalThis as { Worker?: unknown }).Worker = ProxyWorker;
  return worker;
}

function restoreWorkerMock(): void {
  if (realWorker !== undefined) {
    (globalThis as { Worker?: unknown }).Worker = realWorker;
  } else {
    delete (globalThis as { Worker?: unknown }).Worker;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '00000000-0000-4000-8000-000000000001';

function validHandshakeServerJSON(): string {
  return JSON.stringify({
    proto_chosen: 'evf-v1',
    server_caps: [...SERVER_CAPS_V1],
    server_locale: 'it',
    session_id: VALID_SESSION_UUID,
    replay_seq: 0,
  });
}

/** Aggressively drain pending microtasks so the boot coroutine installs each listener before we fire. */
async function flushMicrotasks(iterations = 64): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('bootEngineWithErrorUi — Plan 04 Task 3 integration (BOOT-ERR-INT-01..07)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    installWorkerMock();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence telemetry */
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* silence telemetry */
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreWorkerMock();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-01: HandshakeError('transport_error') → bridge_unreachable
  //
  // We can't synthesize a 'transport_error' directly from a mock socket
  // (performCapabilityHandshake only throws 'parse_failed' / 'schema_failed'
  // / 'timeout' from the message path). The 'transport_error' code is
  // reserved for callers; here we synthesize it by passing a custom
  // bridgeFactory whose execution context throws a HandshakeError manually
  // (the boot path treats any rejection during step 2 the same way).
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-01: HandshakeError("transport_error") rejection → BootErrorLayer "BRIDGE UNREACHABLE" + rethrow', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const transportErr = new HandshakeError('transport_error', 'simulated transport failure');
    // bridgeFactory rejects with the synthesized HandshakeError. The
    // wrapper's catch block will dispatch via bootErrorFromException,
    // then re-invoke `deps.bridgeFactory` to acquire the bridge for the
    // render step. We swap in a 2-shot bridgeFactory: first call rejects,
    // subsequent calls return the (mock) bridge so the render path can
    // proceed.
    let callCount = 0;
    const deps: TestingDependencies = {
      bridgeFactory: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw transportErr;
        }
        return bridge;
      },
    };
    await expect(
      bootEngineWithErrorUi({ bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' }, deps),
    ).rejects.toThrow(HandshakeError);
    // BootErrorLayer rendered with bridge_unreachable state.
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeDefined();
    const content = (bootErrorCall?.[0] as { content: string }).content;
    expect(content).toContain('BRIDGE UNREACHABLE');
    // The boot-failed warn fired (state 'bridge_unreachable').
    const warnCall = warnSpy.mock.calls.find(
      (args: readonly unknown[]) =>
        typeof args[0] === 'string' &&
        (args[0] as string).includes("boot failed with state 'bridge_unreachable'"),
    );
    expect(warnCall).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-02: HandshakeError('schema_failed') → handshake_failed
  //   Fire a JSON message whose shape fails HandshakeServerSchema.
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-02: HandshakeError("schema_failed") on bad server payload → "HANDSHAKE FAILED" + rethrow', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const ws = makeMockSocket();
    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };
    const bootPromise = bootEngineWithErrorUi(
      { bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' },
      deps,
    );
    // Drain microtasks until the boot path is inside awaitWsOpen.
    await flushMicrotasks();
    ws.fireOpen();
    // After 'open', performCapabilityHandshake installs its message
    // listener; flush so the listener is registered before we fire.
    await flushMicrotasks();
    // Fire a malformed schema payload (missing required fields → schema_failed).
    ws.fireMessage('{"unexpected_key":"value"}');
    await expect(bootPromise).rejects.toThrow(HandshakeError);
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeDefined();
    const content = (bootErrorCall?.[0] as { content: string }).content;
    expect(content).toContain('HANDSHAKE FAILED');
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-03: HandshakeError('timeout') → handshake_failed
  //   Open WS but NEVER reply — let the 10 s default timeout fire.
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-03: HandshakeError("timeout") when bridge silent → "HANDSHAKE FAILED" + rethrow', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const ws = makeMockSocket();
    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };
    const bootPromise = bootEngineWithErrorUi(
      { bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' },
      deps,
    );
    // Pre-attach a noop catch handler so Node.js does not treat the
    // intermediate rejection as unhandled while we advance virtual time.
    // `expect().rejects.toThrow` below still observes the same rejection
    // through Vitest's promise tracker. Without this guard, the rejection
    // surfaces in Vitest's "Unhandled Rejection" pane even though the
    // test consumes it — making the run noisy on otherwise-passing assertions.
    bootPromise.catch(() => {
      /* swallow — assertion below re-observes through .rejects */
    });
    await flushMicrotasks();
    ws.fireOpen();
    await flushMicrotasks();
    // Don't fire any server message — advance virtual time past the 10 s
    // default timeout in performCapabilityHandshake.
    await vi.advanceTimersByTimeAsync(11_000);
    await expect(bootPromise).rejects.toThrow(HandshakeError);
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeDefined();
    const content = (bootErrorCall?.[0] as { content: string }).content;
    expect(content).toContain('HANDSHAKE FAILED');
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-04: WS error before open → bridge_unreachable
  //   awaitWsOpen rejects with "[boot-engine-core] WebSocket error before open: error"
  //   The substring "WebSocket error before open" matches the
  //   bridge_unreachable branch in bootErrorFromException.
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-04: WS error before open → "BRIDGE UNREACHABLE" + rethrow', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const ws = makeMockSocket();
    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };
    const bootPromise = bootEngineWithErrorUi(
      { bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' },
      deps,
    );
    await flushMicrotasks();
    // Fire an error event BEFORE the open event → awaitWsOpen rejects with
    // the canonical "WebSocket error before open" message.
    ws.fireError();
    await expect(bootPromise).rejects.toThrow(/WebSocket error before open/);
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeDefined();
    const content = (bootErrorCall?.[0] as { content: string }).content;
    expect(content).toContain('BRIDGE UNREACHABLE');
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-05: proto mismatch → version_mismatch
  //   Server reply schema-validates but contains `proto_chosen: 'evf-v0'`
  //   which fails the schema's literal check on proto_chosen.
  //
  //   The HandshakeServer Zod schema has `proto_chosen: z.literal('evf-v1')`
  //   so a wrong literal triggers schema_failed — whose .message includes the
  //   raw 'proto_chosen' substring. bootErrorFromException's pattern map
  //   places 'proto_chosen' BEFORE the HandshakeError instanceof check
  //   logically — actually it's AFTER, since instanceof HandshakeError wins
  //   first. The dispatch returns 'handshake_failed' (schema_failed code path).
  //
  //   To exercise the actual `version_mismatch` branch we need an exception
  //   that is NOT a HandshakeError but whose .message contains 'proto_chosen'.
  //   We synthesize this through a bridgeFactory that rejects with a plain
  //   Error carrying the proto_chosen substring (matches BED-08).
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-05: proto_chosen mismatch (plain Error) → "VERSION MISMATCH" + rethrow', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const protoErr = new Error('bridge returned unexpected proto_chosen=evf-v0');
    let callCount = 0;
    const deps: TestingDependencies = {
      bridgeFactory: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw protoErr;
        }
        return bridge;
      },
    };
    await expect(
      bootEngineWithErrorUi({ bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' }, deps),
    ).rejects.toThrow(/proto_chosen/);
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeDefined();
    const content = (bootErrorCall?.[0] as { content: string }).content;
    expect(content).toContain('VERSION MISMATCH');
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-06: happy path → handle returned, no boot-error-block call
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-06: happy path returns BootEngineHandle, no boot-error-block render', async () => {
    const { bridge, textContainerUpgrade } = makeMockBridge();
    const ws = makeMockSocket();
    const deps: TestingDependencies = {
      bridgeFactory: async () => bridge,
      wsFactory: () => ws as unknown as WebSocket,
    };
    const bootPromise = bootEngineWithErrorUi(
      { bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'it' },
      deps,
    );
    await flushMicrotasks();
    ws.fireOpen();
    await flushMicrotasks();
    ws.fireMessage(validHandshakeServerJSON());
    const handle = await bootPromise;
    expect(handle).toBeDefined();
    expect(handle.layerManager).toBeDefined();
    expect(handle.rasterController).toBeDefined();
    expect(typeof handle.teardown).toBe('function');
    // No boot-error-block render happened.
    const bootErrorCall = textContainerUpgrade.mock.calls.find(
      ([payload]) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { containerName?: string }).containerName === 'boot-error-block',
    );
    expect(bootErrorCall).toBeUndefined();
    handle.teardown();
  });

  // ──────────────────────────────────────────────────────────────────────
  // BOOT-ERR-INT-07: double failure — original cause AND render error
  //   Original cause rethrown; console.error logs render failure.
  // ──────────────────────────────────────────────────────────────────────

  it('BOOT-ERR-INT-07: double-failure rethrows original cause; console.error logs render failure', async () => {
    // Reject the boot-error-block textContainerUpgrade specifically.
    const { bridge } = makeMockBridge({ rejectBootErrorUpgrade: true });
    const transportErr = new HandshakeError('transport_error', 'original cause');
    let callCount = 0;
    const deps: TestingDependencies = {
      bridgeFactory: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw transportErr;
        }
        return bridge;
      },
    };
    // The promise rejects with the ORIGINAL cause (NOT the render error).
    await expect(
      bootEngineWithErrorUi({ bridgeUrl: 'ws://test/bridge', token: 'tok', locale: 'en' }, deps),
    ).rejects.toThrow('original cause');
    // console.error was called with the render-failure telemetry.
    const renderErrorCall = errorSpy.mock.calls.find(
      (args: readonly unknown[]) =>
        typeof args[0] === 'string' &&
        (args[0] as string).includes('failed to render boot error UI'),
    );
    expect(renderErrorCall).toBeDefined();
  });
});
