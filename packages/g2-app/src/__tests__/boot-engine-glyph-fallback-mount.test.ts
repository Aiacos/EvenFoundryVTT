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
   * CR-01a (canvas default): renderMode is 'canvas'. The canvas-mode bundle mounts:
   *   - z=0 (Z0_MAP): MapCanvasLayer (id='map-canvas') — full-screen Foundry map.
   *   - z=1 (Z1_STATUS_HUD): CanvasStatusHudLayer (id='canvas-status-hud').
   *
   * Glyph layers (map-base, idle-infill) are NOT mounted in canvas mode.
   *
   * Rule 1 auto-fix 2026-06-10: quick-task 260610-d42 Task 2 wires MapCanvasLayer
   * at Z0_MAP in the canvas-mode bundle — updated expectation accordingly.
   */
  it('CR-01a: canvas-verdict boot mounts CanvasStatusHudLayer at z=1 AND MapCanvasLayer at z=0', async () => {
    const { handle } = await bootWith(); // no persisted override → canvas default

    expect(handle.layerManager.getRenderMode()).toBe('canvas');

    const z1 = handle.layerManager.getLayer(ZIndex.Z1_STATUS_HUD);
    expect(z1?.id).toBe('canvas-status-hud');
    // The canvas capture provider 'hud-capture' is in the canvas schema → count 1.
    expect(handle.layerManager.getCaptureContainerCount()).toBe(1);

    // MapCanvasLayer is mounted at z=0 (canvas-mode Task 2 — 260610-d42).
    const z0 = handle.layerManager.getLayer(ZIndex.Z0_MAP);
    expect(z0?.id).toBe('map-canvas');

    // Glyph-only layers are NOT mounted in canvas mode.
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

  /**
   * CR-01d (bridge wired into CanvasStatusHudLayer — gap-fix 260610-d42):
   *
   * Regression guard: `boot-engine-core` MUST pass `bridge` to `CanvasStatusHudLayer`
   * so the native `hud-status` text container (id=5) is updated on each
   * `character.delta`. Before the gap-fix, the construction was:
   *
   *   new CanvasStatusHudLayer({ wsEvents: wsEventBus })   ← missing `bridge`
   *
   * This meant `this._bridge === undefined` in production, so
   * `bridge.textContainerUpgrade` was never called and the hud-status native
   * container showed nothing despite the canvas raster working fine in tests
   * (tests inject bridge explicitly).
   *
   * Strategy: boot in canvas mode (default), fire a valid `character.delta` WS
   * message, await microtasks for the fire-and-forget textContainerUpgrade promise,
   * then assert `bridge.textContainerUpgrade` was called at least once.
   */
  it('CR-01d: canvas-mode CanvasStatusHudLayer receives bridge — character.delta triggers textContainerUpgrade', async () => {
    const { handle, bridge, ws } = await bootWith(); // canvas mode (default)

    expect(handle.layerManager.getRenderMode()).toBe('canvas');

    const textContainerUpgrade = bridge.textContainerUpgrade as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = textContainerUpgrade.mock.calls.length;

    // Fire a valid character.delta WS envelope so CanvasStatusHudLayer._onDelta fires.
    const snapshotEvent = JSON.stringify({
      type: 'character.delta',
      payload: {
        actorId: 'pc-test',
        name: 'Thorin',
        hp: 45,
        maxHp: 52,
        tempHp: 0,
        ac: 18,
        level: 7,
        conditions: [],
        exhaustion: 0,
        death: { success: 0, failure: 0 },
        world: { modernRules: false },
        inventory: [],
        spells: { slots: [], spells: [] },
        abilities: {
          str: { value: 16, mod: 3, save: 3, proficient: false, dc: 13 },
          dex: { value: 12, mod: 1, save: 1, proficient: false, dc: 11 },
          con: { value: 14, mod: 2, save: 2, proficient: false, dc: 12 },
          int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
          cha: { value: 8, mod: -1, save: -1, proficient: false, dc: 9 },
        },
        skills: {
          acr: { total: 1, ability: 'dex', proficient: 0, passive: 11 },
          ani: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
          arc: { total: 0, ability: 'int', proficient: 0, passive: 10 },
          ath: { total: 3, ability: 'str', proficient: 0, passive: 13 },
          dec: { total: -1, ability: 'cha', proficient: 0, passive: 9 },
          his: { total: 0, ability: 'int', proficient: 0, passive: 10 },
          ins: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
          itm: { total: -1, ability: 'cha', proficient: 0, passive: 9 },
          inv: { total: 0, ability: 'int', proficient: 0, passive: 10 },
          med: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
          nat: { total: 0, ability: 'int', proficient: 0, passive: 10 },
          prc: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
          prf: { total: -1, ability: 'cha', proficient: 0, passive: 9 },
          per: { total: -1, ability: 'cha', proficient: 0, passive: 9 },
          rel: { total: 0, ability: 'int', proficient: 0, passive: 10 },
          slt: { total: 1, ability: 'dex', proficient: 0, passive: 11 },
          ste: { total: 1, ability: 'dex', proficient: 0, passive: 11 },
          sur: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
        },
        class: 'Fighter',
        initiative: 2,
        speed: 30,
      },
    });
    ws.fireMessage(snapshotEvent);

    // Flush microtasks so the fire-and-forget textContainerUpgrade promise resolves.
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }

    // Bridge MUST have been called at least once after the delta (gap-fix assertion).
    expect(textContainerUpgrade.mock.calls.length).toBeGreaterThan(callsBefore);

    handle.teardown();
  });
});
