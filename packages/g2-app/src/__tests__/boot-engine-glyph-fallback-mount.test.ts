/**
 * Boot-engine glyph-fallback mount tests (Phase 25 CR-01 regression).
 *
 * Verifies that boot step 12 mounts the CORRECT HUD layer set for the effective
 * render mode (the defect fixed by CR-01 in 25-REVIEW.md):
 *
 *   - Canvas mode (default): mount ONLY `CanvasStatusHudLayer` at z=1 — its
 *     `getCaptureContainer()` returns `'hud-capture'`, which IS declared in the
 *     canvas HUD raster page schema (`buildHudRasterPageSchema`).
 *   - Glyph fallback (`effectiveVerdict === 'glyph'` via persisted `view.map.mode`):
 *     mount the GLYPH layer set — `MapBaseLayer` (z=0, provides the `map-capture`
 *     capture provider), `IdleInfillLayer` (z=0.5), `StatusHudLayer` (z=1, the
 *     id=6 text HUD renderer). `CanvasStatusHudLayer` MUST NOT be mounted — its
 *     `'hud-capture'` provider is a phantom in the glyph status-view schema
 *     (header/footer/status-hud), which silently broke the event-capture contract.
 *
 * D-25.3 contract: glyph fallback must be byte-identical to pre-v0.10.0, i.e. the
 * pre-Phase-20 mounted layer set (mapBase + idleInfill + statusHud).
 *
 * Test strategy mirrors the BERW harness (`boot-engine-r1-wiring.test.ts`) but does
 * NOT mock the dispatcher modules — the real LayerManager mount path runs so the
 * z-stack can be inspected via `layerManager.getLayer(z)` + `getRenderMode()`.
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts step 12 (render-mode-gated mount)
 * @see .planning/phases/EVF-25-promozione-raster-a-default-boot-fallback-glyph/25-REVIEW.md (CR-01)
 * @see packages/g2-app/src/engine/layer-manager.ts (getRenderMode, getLayer, _assertCaptureInvariant)
 */
import { EventEmitter } from 'node:events';
import {
  type EvenAppBridge,
  ImageRawDataUpdateResult,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZIndex } from '../engine/layer-types.js';
import { bootEngineForTest, type TestingDependencies } from '../index.test-support.js';
import { createMockWorker } from './test-helpers/worker-mock.js';

// ─── Mock infrastructure (mirrors BERW harness) ───────────────────────────────

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
 * Boot the engine with an optional persisted `view.map.mode` override.
 *
 * Passing `storedMapMode: 'glyph'` forces `effectiveVerdict === 'glyph'` at boot
 * step 9b/9d (the persisted override OVERRIDES the BLE verdict), exercising the
 * glyph-fallback mount branch added by CR-01.
 */
async function bootWith(opts?: { storedMapMode?: string }) {
  const bridge = makeMockBridge(async (key: string) => {
    if (key === 'view.map.mode') return opts?.storedMapMode ?? 'auto';
    if (key === 'view.locale.override') return 'auto';
    return '';
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
  return { handle, bridge, ws };
}

describe('boot-engine glyph-fallback mount (Phase 25 CR-01)', () => {
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

  /**
   * CR-01a (canvas default): renderMode is 'canvas' and ONLY CanvasStatusHudLayer
   * is mounted at z=1. The glyph layers (map-base, idle-infill) are NOT mounted.
   */
  it('CR-01a: canvas-verdict boot mounts ONLY CanvasStatusHudLayer at z=1', async () => {
    const { handle } = await bootWith(); // no persisted override → canvas default

    expect(handle.layerManager.getRenderMode()).toBe('canvas');

    const z1 = handle.layerManager.getLayer(ZIndex.Z1_STATUS_HUD);
    expect(z1?.id).toBe('canvas-status-hud');
    // The canvas capture provider 'hud-capture' is in the canvas schema → count 1.
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);
    // Glyph layers are constructed but NOT mounted in canvas mode.
    expect(handle.layerManager.getLayer(ZIndex.Z0_MAP)).toBeUndefined();
    expect(handle.layerManager.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();

    handle.teardown();
  });

  /**
   * CR-01b (glyph fallback): persisted `view.map.mode='glyph'` flips renderMode to
   * 'glyph'. Step 12 must mount the GLYPH layer set (map-base z=0, idle-infill
   * z=0.5, status-hud z=1) and NOT canvas-status-hud. This is the byte-identical
   * pre-v0.10.0 mounted composition (D-25.3).
   */
  it('CR-01b: glyph-verdict boot mounts the glyph layer set (map-base + idle-infill + status-hud), NOT canvas-status-hud', async () => {
    const { handle } = await bootWith({ storedMapMode: 'glyph' });

    expect(handle.layerManager.getRenderMode()).toBe('glyph');

    // z=1 is the glyph StatusHudLayer (id=6 text renderer), NOT canvas-status-hud.
    const z1 = handle.layerManager.getLayer(ZIndex.Z1_STATUS_HUD);
    expect(z1?.id).toBe('status-hud');
    expect(z1?.id).not.toBe('canvas-status-hud');

    // z=0 is the glyph MapBaseLayer — provides the 'map-capture' capture provider.
    const z0 = handle.layerManager.getLayer(ZIndex.Z0_MAP);
    expect(z0?.id).toBe('map-base');
    expect(z0?.getCaptureContainer?.()).toBe('map-capture');

    // z=0.5 is the IdleInfillLayer.
    const z05 = handle.layerManager.getLayer(ZIndex.Z0_5_IDLE_INFILL);
    expect(z05?.id).toBe('idle-infill');

    // Exactly ONE capture provider (map-base), satisfying the INV-5 invariant —
    // and it is NOT the phantom 'hud-capture' from canvas-status-hud.
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);

    handle.teardown();
  });

  /**
   * CR-01c (glyph fallback flush): the single boot bundle flush in glyph mode
   * emits the 3-container status-view schema (header id4 + footer id5 +
   * status-hud id6, no isEventCapture=1) — never the canvas HUD raster schema.
   */
  it('CR-01c: glyph-verdict boot flushes the 3-container status-view schema', async () => {
    const { handle, bridge } = await bootWith({ storedMapMode: 'glyph' });

    const rebuild = bridge.rebuildPageContainer as unknown as ReturnType<typeof vi.fn>;
    // Find the flush emitted by the step-12 bundle (the last rebuild call).
    const lastCall = rebuild.mock.calls.at(-1)?.[0] as
      | { containerTotalNum?: number; imageObject?: unknown[]; textObject?: unknown[] }
      | undefined;
    expect(lastCall?.containerTotalNum).toBe(3);
    expect(lastCall?.imageObject?.length).toBe(0);
    expect(lastCall?.textObject?.length).toBe(3);

    handle.teardown();
  });
});
