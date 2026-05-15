/**
 * Unit tests for MapBaseLayer (Phase 4a Plan 03 Task 2).
 *
 * Covers (per 04A-03-PLAN.md `<behavior>` block):
 *   - MBL-1: id === 'map-base'
 *   - MBL-2: getCaptureContainer() === 'map-capture'
 *   - MBL-3: layerManager.getMapMode() === 'raster' → draw() invokes
 *           rasterController.requestFrame and NOT glyph render
 *   - MBL-4: layerManager.getMapMode() === 'glyph' → draw() invokes glyph
 *           render and NOT rasterController.requestFrame
 *   - MBL-5: getMapMode() === 'auto' + controller.getBleVerdict() === 'glyph'
 *           → draw() routes to glyph render
 *   - MBL-6: destroy() invokes rasterController.terminate() (no leaks)
 *   - MBL-7: B-4 verification — map-base-layer.ts imports RasterControllerLike
 *           type-only from layer-types.ts; the test exercises this contract
 *           via a vi.fn() mock controller that satisfies RasterControllerLike
 *           without depending on the concrete RasterController class
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-4
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerManager } from '../../engine/layer-manager.js';
import type { RasterControllerLike, RasterResponse } from '../../engine/layer-types.js';
import type { GlyphSceneInput } from '../glyph-renderer.js';
import { type GlyphRenderer, MapBaseLayer } from '../map-base-layer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────────────────────────────────────

function makeMockBridge(): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
  } as unknown as EvenAppBridge;
}

interface MockController extends RasterControllerLike {
  requestFrame: ReturnType<typeof vi.fn<RasterControllerLike['requestFrame']>>;
  setBleVerdict: ReturnType<typeof vi.fn<RasterControllerLike['setBleVerdict']>>;
  startIdleHeartbeat: ReturnType<typeof vi.fn<RasterControllerLike['startIdleHeartbeat']>>;
  stopIdleHeartbeat: ReturnType<typeof vi.fn<RasterControllerLike['stopIdleHeartbeat']>>;
  terminate: ReturnType<typeof vi.fn<RasterControllerLike['terminate']>>;
}

/** A RasterControllerLike mock — does NOT depend on the concrete class. */
function makeMockController(opts?: { verdict?: 'raster' | 'glyph' | null }): MockController {
  const verdict = opts?.verdict ?? null;
  const response: RasterResponse = { frameId: 0, changedTiles: [] };
  return {
    requestFrame: vi.fn<RasterControllerLike['requestFrame']>().mockResolvedValue(response),
    setBleVerdict: vi.fn<RasterControllerLike['setBleVerdict']>(),
    getBleVerdict: () => verdict,
    startIdleHeartbeat: vi.fn<RasterControllerLike['startIdleHeartbeat']>(),
    stopIdleHeartbeat: vi.fn<RasterControllerLike['stopIdleHeartbeat']>(),
    terminate: vi.fn<RasterControllerLike['terminate']>(),
  };
}

function makeMockLayerManager(mode: 'auto' | 'raster' | 'glyph'): LayerManager {
  return {
    getMapMode: () => mode,
    setMapMode: vi.fn(),
  } as unknown as LayerManager;
}

const SAMPLE_GLYPH_SCENE: GlyphSceneInput = {
  tokens: [{ kind: 'pc', x: 5, y: 5 }],
  width: 66,
  height: 21,
};

const SAMPLE_RASTER_FRAME = {
  pixelData: new Uint8ClampedArray(400 * 200 * 4),
  width: 400,
  height: 200,
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('MapBaseLayer — Layer interface + mode-routed draw', () => {
  let bridge: EvenAppBridge;
  let controller: MockController;
  let renderer: ReturnType<typeof vi.fn<GlyphRenderer>>;

  beforeEach(() => {
    bridge = makeMockBridge();
    controller = makeMockController();
    renderer = vi.fn<GlyphRenderer>().mockResolvedValue(undefined);
  });

  it('MBL-1: id === "map-base"', () => {
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    expect(layer.id).toBe('map-base');
  });

  it('MBL-2: getCaptureContainer() returns "map-capture"', () => {
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    expect(layer.getCaptureContainer?.()).toBe('map-capture');
  });

  it('MBL-3: mode="raster" → draw() calls controller.requestFrame, NOT glyph renderer', async () => {
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    await layer.setScene(SAMPLE_RASTER_FRAME);
    await layer.draw();
    expect(controller.requestFrame).toHaveBeenCalledTimes(1);
    expect(renderer).not.toHaveBeenCalled();
  });

  it('MBL-4: mode="glyph" → draw() calls glyph renderer, NOT controller.requestFrame', async () => {
    const lm = makeMockLayerManager('glyph');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    await layer.setScene(SAMPLE_GLYPH_SCENE);
    await layer.draw();
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(controller.requestFrame).not.toHaveBeenCalled();
  });

  it('MBL-5: mode="auto" + verdict="glyph" → draw() routes to glyph renderer', async () => {
    const lm = makeMockLayerManager('auto');
    controller = makeMockController({ verdict: 'glyph' });
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    await layer.setScene(SAMPLE_GLYPH_SCENE);
    await layer.draw();
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(controller.requestFrame).not.toHaveBeenCalled();
  });

  it('MBL-5 (raster default): mode="auto" + verdict=null → draw() routes to raster', async () => {
    const lm = makeMockLayerManager('auto');
    controller = makeMockController({ verdict: null });
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    await layer.setScene(SAMPLE_RASTER_FRAME);
    await layer.draw();
    expect(controller.requestFrame).toHaveBeenCalledTimes(1);
    expect(renderer).not.toHaveBeenCalled();
  });

  it('MBL-6: destroy() calls controller.terminate() (no leaks)', () => {
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    layer.destroy();
    expect(controller.terminate).toHaveBeenCalledTimes(1);
  });

  it('MBL-7 (B-4): class accepts a RasterControllerLike mock without importing the concrete RasterController', () => {
    // The mock is `RasterControllerLike` only — no extends or instanceof check
    // against a concrete class. If MapBaseLayer source ever imports the
    // concrete RasterController, this test still compiles (it's structural),
    // but the grep gate in <verify> blocks the merge.
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, renderer, lm);
    expect(layer).toBeInstanceOf(MapBaseLayer);
    // Type-level assertion (compile-time only): controller is assignable to
    // the public RasterControllerLike contract.
    const _typeProbe: RasterControllerLike = controller;
    expect(_typeProbe).toBe(controller);
  });
});
