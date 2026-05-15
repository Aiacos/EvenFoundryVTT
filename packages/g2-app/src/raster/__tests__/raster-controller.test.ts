/**
 * Unit tests for RasterController (Phase 4a Plan 03 Task 3).
 *
 * Covers (per 04A-03-PLAN.md `<behavior>` block):
 *   - RC-1: constructs a Worker via `new URL('./raster-worker.ts', import.meta.url)`
 *   - RC-2: requestFrame promise resolves with the worker postMessage response
 *   - RC-3: 200 ms debounce — two requests within the window emit ONE worker postMessage
 *   - RC-4: changedTiles dispatch via bridge.updateImageRawData with `map-tile-N` containers
 *   - RC-5: 3 consecutive non-success results within 5 s → BLE verdict flipped to 'glyph'
 *   - RC-6: startIdleHeartbeat fires requestFrame at ~3333 ms intervals (fake timers)
 *   - RC-7: terminate() calls worker.terminate() and clears pending Map
 *   - RC-8: unknown frameId in worker response is dropped with console.warn (no throw)
 *   - RC-9 (B-4): class signature satisfies RasterControllerLike — TS compile-only check
 *
 * The real raster-worker.ts is not booted under happy-dom (no DOM-level
 * OffscreenCanvas + no WASM compilation in CI). The mockWorker stand-in
 * intercepts the Worker constructor via a tiny `WorkerFactory` injected via
 * the constructor — this avoids monkey-patching `globalThis.Worker`.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 3
 * @see packages/g2-app/src/__tests__/test-helpers/worker-mock.ts
 */
import {
  type EvenAppBridge,
  type ImageRawDataUpdate,
  ImageRawDataUpdateResult,
} from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWorker, type MockWorker } from '../../__tests__/test-helpers/worker-mock.js';
import type { RasterControllerLike, RasterResponse } from '../../engine/layer-types.js';
import { RasterController } from '../raster-controller.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeMockBridge() {
  const updateImageRawData = vi
    .fn<EvenAppBridge['updateImageRawData']>()
    .mockResolvedValue(ImageRawDataUpdateResult.success);
  const bridge = {
    updateImageRawData,
  } as unknown as EvenAppBridge;
  return { bridge, updateImageRawData };
}

const ZERO_PIXELS = new Uint8ClampedArray(400 * 200 * 4);

describe('RasterController — Worker singleton + debounce + heartbeat + failure-mode', () => {
  let worker: MockWorker;
  let workerFactory: () => MockWorker;
  let factoryCalled: number;

  beforeEach(() => {
    vi.useFakeTimers();
    worker = createMockWorker();
    factoryCalled = 0;
    workerFactory = () => {
      factoryCalled++;
      return worker;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('RC-1: constructor spawns a single Worker via the injected factory', () => {
    const { bridge } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    expect(factoryCalled).toBe(1);
    expect(controller).toBeInstanceOf(RasterController);
  });

  it('RC-2: requestFrame returns a Promise that resolves with the worker response', async () => {
    const { bridge } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    const promise = controller.requestFrame(ZERO_PIXELS, 400, 200);
    // Flush the 200 ms debounce window.
    await vi.advanceTimersByTimeAsync(200);
    // Read the message the controller sent into the worker.
    const sent = worker._sentMessages();
    expect(sent.length).toBe(1);
    const frameId = (sent[0] as { frameId: number }).frameId;
    // Synchronously dispatch the worker → main-thread response.
    const response: RasterResponse = { frameId, changedTiles: [] };
    worker._dispatchMessage(response);
    await expect(promise).resolves.toEqual(response);
  });

  it('RC-3: two requestFrame calls within 200 ms → only ONE postMessage to the worker', async () => {
    const { bridge } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    void controller.requestFrame(ZERO_PIXELS, 400, 200);
    await vi.advanceTimersByTimeAsync(100);
    void controller.requestFrame(ZERO_PIXELS, 400, 200);
    await vi.advanceTimersByTimeAsync(200);
    expect(worker._sentMessages().length).toBe(1);
  });

  it('RC-4: changedTiles → bridge.updateImageRawData with containerName "map-tile-N"', async () => {
    const { bridge, updateImageRawData } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    const promise = controller.requestFrame(ZERO_PIXELS, 400, 200);
    await vi.advanceTimersByTimeAsync(200);
    const frameId = (worker._sentMessages()[0] as { frameId: number }).frameId;
    const png = new Uint8Array([0xaa, 0xbb, 0xcc]);
    worker._dispatchMessage({
      frameId,
      changedTiles: [{ index: 0, pngBytes: png, subTileCount: 1 }],
    } as RasterResponse);
    await promise;
    // Allow the post-dispatch microtask queue to drain.
    await vi.runOnlyPendingTimersAsync();
    expect(updateImageRawData).toHaveBeenCalledTimes(1);
    const arg = updateImageRawData.mock.calls[0]?.[0] as ImageRawDataUpdate;
    expect(arg.containerName).toBe('map-tile-0');
  });

  it('RC-5: 3 consecutive failures → BLE verdict flipped to "glyph"', async () => {
    const { bridge, updateImageRawData } = makeMockBridge();
    updateImageRawData.mockResolvedValue(ImageRawDataUpdateResult.sendFailed);
    const controller = new RasterController(bridge, { workerFactory });
    const png = new Uint8Array([0xaa]);
    for (let i = 0; i < 3; i++) {
      const promise = controller.requestFrame(ZERO_PIXELS, 400, 200);
      await vi.advanceTimersByTimeAsync(200);
      const frameId = (worker._sentMessages()[i] as { frameId: number }).frameId;
      worker._dispatchMessage({
        frameId,
        changedTiles: [{ index: 0, pngBytes: png, subTileCount: 1 }],
      } as RasterResponse);
      await promise;
      await vi.runOnlyPendingTimersAsync();
    }
    expect(controller.getBleVerdict()).toBe('glyph');
  });

  it('RC-6: startIdleHeartbeat triggers requestFrame at the configured interval', async () => {
    const { bridge } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    const sceneSource = () => ZERO_PIXELS;
    controller.startIdleHeartbeat(sceneSource);
    // 0.3 fps idle heartbeat ⇒ ~3333 ms tick (Specs §7.4b.6.1 Layer 6).
    await vi.advanceTimersByTimeAsync(3333);
    // After the heartbeat fires, the debounce delays the postMessage 200 ms.
    await vi.advanceTimersByTimeAsync(200);
    expect(worker._sentMessages().length).toBeGreaterThanOrEqual(1);
    controller.stopIdleHeartbeat();
  });

  it('RC-7: terminate() calls worker.terminate()', () => {
    const { bridge } = makeMockBridge();
    const terminateSpy = vi.spyOn(worker, 'terminate');
    const controller = new RasterController(bridge, { workerFactory });
    controller.terminate();
    expect(terminateSpy).toHaveBeenCalledTimes(1);
  });

  it('RC-8: unknown frameId in worker response is dropped with console.warn', async () => {
    const { bridge } = makeMockBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
    const controller = new RasterController(bridge, { workerFactory });
    expect(() => {
      worker._dispatchMessage({
        frameId: 99_999,
        changedTiles: [],
      } as RasterResponse);
    }).not.toThrow();
    expect(warn).toHaveBeenCalled();
    controller.terminate();
  });

  it('RC-9 (B-4 type-level contract): RasterController satisfies RasterControllerLike', () => {
    const { bridge } = makeMockBridge();
    const controller = new RasterController(bridge, { workerFactory });
    // Single-line structural assertion; the assignment compiles iff the
    // class signature matches the Plan 01 forward contract.
    const probe: RasterControllerLike = controller;
    expect(probe).toBe(controller);
  });
});
