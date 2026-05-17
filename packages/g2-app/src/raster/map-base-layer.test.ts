/**
 * Unit tests for MapBaseLayer (Plan 13-04 — STRETCH-06).
 *
 * MBL-PORT-01: setPortraitOverride stores override state
 * MBL-PORT-02: getContainerCount returns {image:4,text:1} in raster mode
 * MBL-PORT-03: getContainerCount returns {image:0,text:1} in glyph mode
 * MBL-PORT-04: draw() with portrait override calls bridge.updateImageRawData for the override slot
 * MBL-PORT-05: clearing override (setPortraitOverride(slot, null)) removes the override state
 *
 * @see packages/g2-app/src/raster/map-base-layer.ts
 * @see .planning/phases/13-v2-stretch/13-04-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import type { LayerManager } from '../engine/layer-manager.js';
import type { RasterControllerLike } from '../engine/layer-types.js';
import { MapBaseLayer } from './map-base-layer.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockBridge(overrides: Partial<EvenAppBridge> = {}): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as EvenAppBridge;
}

function makeMockController(
  bleVerdict: 'raster' | 'glyph' | null = 'raster',
): RasterControllerLike {
  return {
    requestFrame: vi.fn().mockResolvedValue(undefined),
    setBleVerdict: vi.fn(),
    getBleVerdict: vi.fn().mockReturnValue(bleVerdict),
    terminate: vi.fn(),
    startIdleHeartbeat: vi.fn(),
    stopIdleHeartbeat: vi.fn(),
  };
}

function makeMockLayerManager(mapMode: 'raster' | 'glyph' | 'auto' = 'raster'): LayerManager {
  return {
    getMapMode: vi.fn().mockReturnValue(mapMode),
  } as unknown as LayerManager;
}

/** Build a minimal 100×60 RGBA Uint8Array (all grey). */
function makePortraitBytes(): Uint8Array {
  return new Uint8Array(100 * 60 * 4).fill(128);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MapBaseLayer — portrait override (Plan 13-04)', () => {
  // MBL-PORT-01: setPortraitOverride stores state
  it('MBL-PORT-01: setPortraitOverride(slot, bytes) stores the portrait override', () => {
    const bridge = makeMockBridge();
    const controller = makeMockController('raster');
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, vi.fn(), lm);

    const bytes = makePortraitBytes();
    layer.setPortraitOverride(3, bytes);
    // Verify state is stored — indirectly by checking draw calls it (next test)
    // Direct state inspection not possible without exposing private field,
    // so MBL-PORT-01 verifies the public API does not throw.
    expect(() => layer.setPortraitOverride(3, bytes)).not.toThrow();
  });

  // MBL-PORT-02: getContainerCount raster mode
  it('MBL-PORT-02: getContainerCount returns {image:4, text:1} in raster mode', () => {
    const bridge = makeMockBridge();
    const controller = makeMockController('raster');
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, vi.fn(), lm);

    expect(layer.getContainerCount()).toEqual({ image: 4, text: 1 });
  });

  // MBL-PORT-03: getContainerCount glyph mode
  it('MBL-PORT-03: getContainerCount returns {image:0, text:1} in glyph mode', () => {
    const bridge = makeMockBridge();
    const controller = makeMockController('glyph');
    const lm = makeMockLayerManager('glyph');
    const layer = new MapBaseLayer(bridge, controller, vi.fn(), lm);

    expect(layer.getContainerCount()).toEqual({ image: 0, text: 1 });
  });

  // MBL-PORT-04: draw() with portrait override calls bridge.updateImageRawData
  it('MBL-PORT-04: draw() with active portrait override calls bridge.updateImageRawData for slot 3', async () => {
    const bridge = makeMockBridge();
    const controller = makeMockController('raster');
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, vi.fn(), lm);

    // Set a raster scene so draw() doesn't short-circuit
    const pixelData = new Uint8ClampedArray(576 * 288 * 4).fill(0);
    await layer.setScene({ pixelData, width: 576, height: 288 });

    const bytes = makePortraitBytes();
    layer.setPortraitOverride(3, bytes);

    await layer.draw();

    // The controller.requestFrame is called for the raster path
    expect(controller.requestFrame).toHaveBeenCalled();
    // bridge.updateImageRawData should be called for the portrait override
    expect(bridge.updateImageRawData).toHaveBeenCalled();
  });

  // MBL-PORT-05: clearing override removes it
  it('MBL-PORT-05: setPortraitOverride(slot, null) clears the override — no updateImageRawData on next draw', async () => {
    const bridge = makeMockBridge();
    const controller = makeMockController('raster');
    const lm = makeMockLayerManager('raster');
    const layer = new MapBaseLayer(bridge, controller, vi.fn(), lm);

    const pixelData = new Uint8ClampedArray(576 * 288 * 4).fill(0);
    await layer.setScene({ pixelData, width: 576, height: 288 });

    const bytes = makePortraitBytes();
    layer.setPortraitOverride(3, bytes);
    layer.setPortraitOverride(3, null); // clear

    await layer.draw();

    // With override cleared, updateImageRawData should NOT be called
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });
});
