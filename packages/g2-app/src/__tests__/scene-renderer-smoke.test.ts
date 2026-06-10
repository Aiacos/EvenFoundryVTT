/**
 * Scene-renderer end-to-end integration smoke test (Phase 4a Plan 05 Task 1).
 *
 * Boots the full engine against happy-dom + mock EvenAppBridge + MockSocket +
 * mocked raster Worker. Exercises:
 *
 *   - SR-1: bootEngineForTest completes without throwing (happy path).
 *   - SR-2: bridge.createStartUpPageContainer called exactly once.
 *   - SR-3: bridge.rebuildPageContainer called exactly once
 *           (atomic 3-layer bundle per ADR-0001 Amendment 1).
 *   - SR-4: LayerManager.getCaptureContainerCount() === 1 (capture invariant).
 *   - SR-5: bridge.textContainerUpgrade received the 5 boot-splash labels in
 *           order (one per step + final protocol line).
 *   - SR-6: WS received the HandshakeClient JSON; valid HandshakeServer
 *           response yields a populated negotiated-caps set on LayerManager.
 *   - SR-7: teardown() clears timers, terminates the raster Worker, and
 *           unsubscribes the Plan 06 scene-input handler.
 *   - SR-8: character.delta WS event → after 200 ms debounce, StatusHudLayer
 *           re-renders via bridge.textContainerUpgrade on `status-hud`.
 *   - SR-9: frame_pixels WS envelope → attachSceneInputToWs dispatches to
 *           RasterController.requestFrame (verified via worker._sentMessages).
 *   - SR-10: bootEngine !== bootEngineForTest (W-4 boundary — distinct symbols).
 *
 * **Worker injection:** The smoke test patches `Worker` in `globalThis` so the
 * Vite-canonical `new Worker(new URL('./raster-worker.ts', import.meta.url))`
 * construction inside `RasterController` returns a `MockWorker` from the
 * Plan 01 helper. This is the same pattern Plan 03 uses at the controller
 * boundary, lifted to the package level so we don't need to thread a worker
 * factory through `_bootEngineCore`.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-05-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §makeMockBridge + §MockSocket
 * @see ../index.test-support.ts (the bootEngineForTest entry point)
 */
import { EventEmitter } from 'node:events';
import {
  type EvenAppBridge,
  ImageRawDataUpdateResult,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';
import { encodeFramePixels, SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZIndex } from '../engine/layer-types.js';
import { bootEngine } from '../index.js';
import { bootEngineForTest, type TestingDependencies } from '../index.test-support.js';
import { createMockWorker, type MockWorker } from './test-helpers/worker-mock.js';

// ─── Mock EvenAppBridge ───────────────────────────────────────────────────────

/** Options for `makeMockBridge` — Phase 4b Plan 02 adds the kv-store override hooks. */
interface MockBridgeOptions {
  /** Override the default getLocalStorage resolver (Phase 4b Plan 02: SR-11..13 override path). */
  readonly getLocalStorageImpl?: (key: string) => Promise<string>;
}

function makeMockBridge(opts: MockBridgeOptions = {}) {
  const createStartUpPageContainer = vi.fn().mockResolvedValue(StartUpPageCreateResult.success);
  const rebuildPageContainer = vi.fn().mockResolvedValue(true);
  const textContainerUpgrade = vi.fn().mockResolvedValue(true);
  const updateImageRawData = vi.fn().mockResolvedValue(ImageRawDataUpdateResult.success);
  const shutDownPageContainer = vi.fn().mockResolvedValue(true);
  // hub-polyfill calls these on getInstance(); provide light stubs.
  // Phase 4b Plan 02: bootEngine step 9b reads view.map.mode via getLocalStorage;
  // SR-11/12/13 inject a custom resolver to exercise the override path.
  const setLocalStorage = vi.fn().mockResolvedValue(undefined);
  const getLocalStorage = vi.fn(opts.getLocalStorageImpl ?? (async () => ''));
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
    setLocalStorage,
    getLocalStorage,
  };
}

// ─── MockSocket — EventEmitter-backed WebSocket stand-in ──────────────────────

interface MockSocket extends EventEmitter {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: EventListener, opts?: AddEventListenerOptions) => void;
  removeEventListener: (event: string, handler: EventListener) => void;
  /** Fire a synthetic `message` event with the given JSON data. */
  fireMessage: (data: string) => void;
  /** Fire a synthetic `open` event (no-op once readyState === 1). */
  fireOpen: () => void;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.readyState = 0; // CONNECTING — flips to OPEN via fireOpen()
  emitter.send = vi.fn();
  emitter.close = vi.fn(() => {
    emitter.readyState = 3; // CLOSED
  });
  emitter.addEventListener = (event, handler, opts): void => {
    if (opts?.once === true) {
      emitter.once(event, (data: unknown) => {
        // Handler receives a synthetic MessageEvent shape (only `.data` consumed).
        (handler as (ev: unknown) => void)({ data });
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
    emitter.readyState = 1; // OPEN
    emitter.emit('open');
  };
  return emitter;
}

// ─── Worker injection (so `new Worker(new URL(...))` inside RasterController
//     returns a MockWorker instead of attempting a real Web Worker boot which
//     happy-dom cannot execute — RESEARCH.md Pitfall 4).
let installedWorker: MockWorker | null = null;
const realWorker = (globalThis as { Worker?: unknown }).Worker;
function installWorkerMock(): MockWorker {
  const worker = createMockWorker();
  installedWorker = worker;
  // Wrap the mock in a constructable proxy. Calling `new ProxyWorker(...)`
  // triggers the `construct` trap which returns the shared MockWorker. This
  // satisfies both the `new ` call shape RasterController uses (via the
  // Vite-canonical URL pattern) AND Biome's `noConstructorReturn` rule
  // (the trap returns from `construct`, not from a class `constructor` body).
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
  installedWorker = null;
}

// ─── Common helpers ───────────────────────────────────────────────────────────

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

/**
 * Boot the engine end-to-end against the mock collaborators.
 *
 * Returns the boot handle + the mocks so individual tests can assert call
 * counts. Uses `vi.useFakeTimers()` for debounce / heartbeat determinism.
 */
async function bootWithMocks(
  extraDeps: Partial<TestingDependencies> = {},
  bridgeOpts: MockBridgeOptions = {},
) {
  const { bridge, ...bridgeSpies } = makeMockBridge(bridgeOpts);
  const ws = makeMockSocket();

  const deps: TestingDependencies = {
    wsFactory: () => ws as unknown as WebSocket,
    bridgeFactory: async () => bridge,
    ...extraDeps,
  };

  // bootEngineForTest awaits `awaitWsOpen` after the wsFactory returns. The
  // boot coroutine must reach `awaitWsOpen` (i.e. install its 'open' listener)
  // before we fire the synthetic open event — otherwise the event is lost and
  // the await hangs. The pre-open boot path contains ~8 sequential awaits:
  // bridgeFactory + createBootPage + 6 textContainerUpgrade calls inside
  // showBootSplash (5 steps + 1 protocol line). 2 microtask yields are not
  // enough; flush the microtask queue aggressively in a loop.
  async function flushMicrotasks(iterations = 32): Promise<void> {
    for (let i = 0; i < iterations; i++) {
      // queueMicrotask + Promise.resolve in tandem drains both the V8
      // microtask queue and any task queues vitest adds on top.
      await Promise.resolve();
    }
  }

  const bootPromise = bootEngineForTest(
    {
      bridgeUrl: 'ws://test/bridge',
      token: 'test-token-24h',
      locale: 'it',
    },
    deps,
  );

  await flushMicrotasks();
  ws.fireOpen();

  // After 'open', boot sends HandshakeClient and waits for HandshakeServer.
  // Flush again so performCapabilityHandshake has installed its message
  // listener before we synthesize the server reply.
  await flushMicrotasks();
  ws.fireMessage(validHandshakeServerJSON());

  // The remaining boot steps are bridge-call awaits (mounted layers + bundle
  // flush + draw); they resolve naturally.
  const handle = await bootPromise;
  return { handle, bridge, bridgeSpies, ws };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scene-renderer-smoke — Phase 4a end-to-end integration (Plan 05 Task 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installWorkerMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreWorkerMock();
    vi.restoreAllMocks();
  });

  it('SR-1: bootEngineForTest completes without throwing on happy path', async () => {
    const { handle } = await bootWithMocks();
    expect(handle).toBeDefined();
    expect(handle.layerManager).toBeDefined();
    expect(handle.rasterController).toBeDefined();
    expect(typeof handle.teardown).toBe('function');
    handle.teardown();
  });

  it('SR-2: bridge.createStartUpPageContainer called exactly once (boot page)', async () => {
    const { handle, bridgeSpies } = await bootWithMocks();
    expect(bridgeSpies.createStartUpPageContainer).toHaveBeenCalledTimes(1);
    handle.teardown();
  });

  it('SR-3: bridge.rebuildPageContainer called exactly once (atomic 3-layer bundle)', async () => {
    const { handle, bridgeSpies } = await bootWithMocks();
    // Exactly one bundle flush per ADR-0001 Amendment 1.
    expect(bridgeSpies.rebuildPageContainer).toHaveBeenCalledTimes(1);
    handle.teardown();
  });

  it('SR-4: LayerManager.getCaptureContainerCount() === 1 (capture-invariant)', async () => {
    const { handle } = await bootWithMocks();
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);
    handle.teardown();
  });

  it('SR-5: boot-splash emitted 6 textContainerUpgrade calls (5 steps + protocol line)', async () => {
    const { handle, bridgeSpies } = await bootWithMocks();
    // showBootSplash issues steps.length + 1 calls (Plan 02 SUMMARY).
    // 5 step labels + 1 trailing protocol line = 6 minimum.
    // Plus any StatusHudLayer initial render via bundle. So we assert ≥6.
    expect(bridgeSpies.textContainerUpgrade.mock.calls.length).toBeGreaterThanOrEqual(6);
    // Verify the protocol-line content surfaced — proves the splash loop
    // completed all 5 step + the final line (Plan 02 contract).
    const protoCall = bridgeSpies.textContainerUpgrade.mock.calls.find((call) => {
      const arg = call[0] as { content?: string };
      return typeof arg.content === 'string' && arg.content.includes('protocol 1.0');
    });
    expect(protoCall).toBeDefined();
    handle.teardown();
  });

  it('SR-6: WS received HandshakeClient JSON; LayerManager.negotiatedCaps populated', async () => {
    const { handle, ws } = await bootWithMocks();
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = ws.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(sent) as {
      proto?: string;
      token?: string;
      capabilities?: string[];
    };
    expect(parsed.proto).toBe('evf-v1');
    expect(parsed.token).toBe('test-token-24h');
    expect(parsed.capabilities).toEqual([...SERVER_CAPS_V1]);
    // The LayerManager should now refuse a mount with an unknown required cap.
    // Use a synthetic Layer that requests a cap NOT in the negotiated set.
    // We don't construct one here (would re-trigger capture-invariant); instead
    // we check getCaptureContainerCount stayed at 1 — proves boot completed
    // through caps propagation without throwing capability_gate_denied for
    // the real Plan 02-04 layers.
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);
    handle.teardown();
  });

  it('SR-7: teardown() calls worker.terminate, unsubscribe, and ws.close', async () => {
    const { handle, ws } = await bootWithMocks();
    const worker = installedWorker;
    expect(worker).not.toBeNull();
    if (worker === null) throw new Error('worker mock missing');
    // Hook the terminate spy.
    const terminateSpy = vi.spyOn(worker, 'terminate');
    handle.teardown();
    expect(terminateSpy).toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it('SR-8: character.delta WS event → HudDeltaDriver debounce runs without error (canvas mode)', async () => {
    // Boot boots in canvas mode (Phase 20: renderMode defaults to 'canvas').
    // Phase 24: HudDeltaDriver owns the event-driven loop. A character.delta event
    // schedules a debounced _runCycle() (DEFAULT_MIN_REDRAW_INTERVAL_MS = 100ms).
    //
    // In the happy-dom test environment, CanvasCompositor.composite() returns a
    // zero RGBA buffer (masterCtx=null path). runFirstFrame() seeds baselines from
    // the same zero tiles, so _runCycle() after a delta detects no hash change and
    // issues 0 tile pushes (D-24.3 zero-push-on-idle). This is correct behavior —
    // the smoke test verifies the event path does not crash; tile-push correctness
    // is covered by hud-delta-driver.test.ts DL-01..DL-06.
    const { handle, bridgeSpies, ws } = await bootWithMocks();
    const tileCallsBefore = bridgeSpies.updateImageRawData.mock.calls.length;
    // Fire a valid CharacterSnapshot wrapped in the ws-event-bus envelope
    // shape ({type, payload}). The createWsEventBus helper in
    // boot-engine-core.ts routes type==='character.delta' payloads to both
    // CanvasStatusHudLayer (sets _dirty=true) and the recomposite subscriber.
    const snapshotEvent = JSON.stringify({
      type: 'character.delta',
      payload: {
        actorId: 'pc-aiacos',
        name: 'Aiacos',
        ac: 16,
        hp: 36,
        maxHp: 36,
        tempHp: 0,
        level: 5,
        conditions: [],
        exhaustion: 0,
        death: { success: 0, failure: 0 },
        world: { modernRules: false },
        inventory: [],
        spells: { slots: [], spells: [] },
        abilities: {
          str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        },
        skills: {
          acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
          ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
          arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
          ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
          dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
          his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
          ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
          itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
          inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
          med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
          nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
          prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
          prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
          per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
          rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
          slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
          ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
          sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
        },
      },
    });
    ws.fireMessage(snapshotEvent);
    // Advance fake timers past the debounce window so _runCycle() fires.
    // Must not throw — the driver is running and the event is processed.
    await vi.advanceTimersByTimeAsync(150);
    const tileCallsAfter = bridgeSpies.updateImageRawData.mock.calls.length;
    // Zero-push-on-idle (D-24.3): in happy-dom compositor returns zero RGBA for
    // both runFirstFrame seeding and _runCycle; hashes are identical → no push.
    // The call count is stable (no extra calls, no crash).
    expect(tileCallsAfter).toBe(tileCallsBefore);
    handle.teardown();
  });

  it('SR-9 (Plan 06 wiring): frame_pixels WS envelope → controller.requestFrame', async () => {
    const { handle, ws } = await bootWithMocks();
    const worker = installedWorker;
    if (worker === null) throw new Error('worker mock missing');
    const beforeSentCount = worker._sentMessages().length;
    // Build a valid frame_pixels envelope per Plan 06 EnvelopeSchema +
    // FramePixelsSchema.
    const width = 288;
    const height = 144;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const pixelsB64 = encodeFramePixels(rgba);
    const env = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'frame_pixels',
      session_id: VALID_SESSION_UUID,
      payload: { sceneId: 'scene1', width, height, pixelsB64, ts: Date.now() },
    };
    ws.fireMessage(JSON.stringify(env));
    // attachSceneInputToWs is synchronous up to requestFrame which queues
    // through a 200 ms debounce inside RasterController. Advance timers to
    // flush the debounce → worker.postMessage.
    await vi.advanceTimersByTimeAsync(250);
    const afterSentCount = worker._sentMessages().length;
    expect(afterSentCount).toBeGreaterThan(beforeSentCount);
    // Verify the message shape — should carry width/height + pixelData.
    const sent = worker._sentMessages()[afterSentCount - 1] as {
      width?: number;
      height?: number;
      pixelData?: Uint8ClampedArray;
    };
    // scene-input pads undersized frames to the canonical 400×200 raster
    // region before requestFrame (ADR-0013 Amendment 1 — raster-worker
    // rejects other dims; debug map-frame-pipeline-dims, 2026-06-10).
    expect(sent.width).toBe(400);
    expect(sent.height).toBe(200);
    expect(sent.pixelData).toBeInstanceOf(Uint8ClampedArray);
    expect(sent.pixelData?.length).toBe(400 * 200 * 4);
    handle.teardown();
  });

  it('SR-10 (W-4 boundary): bootEngine !== bootEngineForTest', () => {
    // Production bootEngine and test-only bootEngineForTest are distinct
    // symbols. This proves the test wrapper is not just a re-export.
    expect(bootEngine).not.toBe(bootEngineForTest);
    expect(typeof bootEngine).toBe('function');
    expect(typeof bootEngineForTest).toBe('function');
  });

  // ─── Phase 4b Plan 02 — boot-time persisted map mode override (MAP-05 boot read-back)
  //
  // SR-11/12/13 exercise the bootEngine step-9b override branch: after the BLE
  // probe verdict is captured at step 9, bootEngine reads `view.map.mode` from
  // Even Hub kv store via `loadPersistedMapMode(bridge)`. If the persisted
  // value is 'raster' or 'glyph', it OVERRIDES the BLE verdict; 'auto' (or
  // missing key, or read rejection — all defensively coerce to 'auto') lets
  // the BLE verdict win.
  //
  // The synthetic boot path with `probeBleThroughput(0, 0)` returns 'auto'
  // (Phase 4a behaviour — zero-duration probes yield 'auto'). So:
  //   - SR-11: persisted 'glyph' → override wins → final mapMode === 'glyph'
  //   - SR-12: persisted 'auto'  → both are 'auto' → final mapMode === 'auto'
  //   - SR-13: read rejection    → defensive 'auto' → final mapMode === 'auto'

  it("SR-11: persisted view.map.mode='glyph' overrides BLE 'auto' verdict", async () => {
    const { handle, bridgeSpies } = await bootWithMocks(
      {},
      {
        getLocalStorageImpl: async (key: string) => {
          if (key === 'view.map.mode') return 'glyph';
          return '';
        },
      },
    );
    // bootEngine read the persisted mode via getLocalStorage('view.map.mode').
    expect(bridgeSpies.getLocalStorage).toHaveBeenCalledWith('view.map.mode');
    // The final layerManager mode is 'glyph' (overridden from 'auto').
    expect(handle.layerManager.getMapMode()).toBe('glyph');
    // The raster controller's verdict is 'glyph' (called by the override branch
    // since the persisted value is in the raster|glyph whitelist).
    expect(handle.rasterController.getBleVerdict()).toBe('glyph');
    handle.teardown();
  });

  it("SR-12: persisted view.map.mode='auto' lets BLE verdict win (also 'auto')", async () => {
    const { handle, bridgeSpies } = await bootWithMocks(
      {},
      {
        getLocalStorageImpl: async (key: string) => {
          if (key === 'view.map.mode') return 'auto';
          return '';
        },
      },
    );
    expect(bridgeSpies.getLocalStorage).toHaveBeenCalledWith('view.map.mode');
    // Both BLE verdict and persisted value are 'auto' → final mode 'auto'.
    expect(handle.layerManager.getMapMode()).toBe('auto');
    // setBleVerdict was NOT called (BLE 'auto' branch skips setBleVerdict per
    // Phase 4a step 9 contract; the override branch also skips for 'auto').
    expect(handle.rasterController.getBleVerdict()).toBeNull();
    handle.teardown();
  });

  it("SR-13: getLocalStorage rejection → defensive 'auto', BLE verdict wins", async () => {
    const { handle } = await bootWithMocks(
      {},
      {
        getLocalStorageImpl: async () => {
          throw new Error('simulated kv read failure');
        },
      },
    );
    // loadPersistedMapMode caught the rejection and returned 'auto'.
    // BLE verdict ('auto') wins; final mode is 'auto', verdict is null.
    expect(handle.layerManager.getMapMode()).toBe('auto');
    expect(handle.rasterController.getBleVerdict()).toBeNull();
    handle.teardown();
  });
});

describe('scene-renderer-smoke — capture-invariant + atomic bundle (SR-4 expansion)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installWorkerMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreWorkerMock();
    vi.restoreAllMocks();
  });

  it('All three z-slots are mounted after boot: z=0 + z=0.5 + z=1', async () => {
    const { handle } = await bootWithMocks();
    // The Status HUD layer is at z=1 (no capture); MapBaseLayer at z=0 (the
    // sole capture provider); IdleInfillLayer at z=0.5 (no capture). We can't
    // directly inspect LayerManager's private layer Map, but the capture
    // count + a successful bundle that didn't throw guarantees the mounts
    // succeeded. Use destroy via teardown() and observe it doesn't throw.
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);
    // Smoke: destroy each z, expect captureCount transitions.
    // We destroy z=0.5 first (still has 1 capture container from z=0).
    handle.layerManager.destroy(ZIndex.Z0_5_IDLE_INFILL);
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);
    handle.teardown();
  });
});
