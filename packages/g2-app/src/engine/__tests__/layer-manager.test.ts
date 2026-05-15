/**
 * Unit tests for LayerManager (Phase 4a Plan 02 Task 1).
 *
 * Covers (per 04A-02-PLAN.md `<behavior>` block):
 *   - Capture-container invariant at 0 / 1 / 2 mounted capture providers
 *   - destroy() that removes the sole capture provider → throws
 *   - Capability-gate denial when requiredCaps not in negotiated SERVER_CAPS_V1
 *   - Capability-gate pass after setNegotiatedCaps()
 *   - bundle([destroy, mount]) issues exactly one bridge.rebuildPageContainer call
 *   - bundle() applies ops in order; intermediate invariant-violation is tolerated
 *   - setMapMode / getMapMode round-trip without bridge I/O
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §layer-manager.test.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 1
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManager } from '../layer-manager.js';
import { type Layer, LayerManagerError, type LayerOp, ZIndex } from '../layer-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Minimal EvenAppBridge surface the LayerManager touches. */
function makeMockBridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0 /* StartUpPageCreateResult.success */),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
  };
}

/** Build a Layer with an optional capture-container provider. */
function makeMockLayer(id: string, captureContainer?: string): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...(captureContainer !== undefined ? { getCaptureContainer: () => captureContainer } : {}),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Capture-container invariant
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — capture-container invariant', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  it('Test 1: after mount(Z0_MAP, captureLayer) → captureContainerCount === 1', () => {
    const mapLayer = makeMockLayer('map', 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    expect(lm.getCaptureContainerCount()).toBe(1);
  });

  it('Test 2: after mount z=0 (capture) + z=1 (no capture) → count stays at 1, no throw', () => {
    const mapLayer = makeMockLayer('map', 'map-capture');
    const hudLayer = makeMockLayer('hud'); // no capture
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    expect(() => lm.mount(ZIndex.Z1_STATUS_HUD, hudLayer)).not.toThrow();
    expect(lm.getCaptureContainerCount()).toBe(1);
  });

  it('Test 3: mount a no-capture layer when no other capture exists → throws (found 0)', () => {
    const noCaptureLayer = makeMockLayer('hud-only');
    try {
      lm.mount(ZIndex.Z1_STATUS_HUD, noCaptureLayer);
      throw new Error('expected mount to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LayerManagerError);
      expect((e as LayerManagerError).code).toBe('capture_invariant_violated');
      expect((e as LayerManagerError).message).toContain('found 0');
    }
  });

  it('Test 4: mount two capture-providing layers → throws (found 2)', () => {
    const layerA = makeMockLayer('a', 'cap-a');
    const layerB = makeMockLayer('b', 'cap-b');
    lm.mount(ZIndex.Z0_MAP, layerA);
    try {
      lm.mount(ZIndex.Z1_STATUS_HUD, layerB);
      throw new Error('expected mount to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LayerManagerError);
      expect((e as LayerManagerError).code).toBe('capture_invariant_violated');
      expect((e as LayerManagerError).message).toContain('found 2');
    }
  });

  it('Test 5: destroy(Z0_MAP) when it is the sole capture provider → throws (found 0)', () => {
    const mapLayer = makeMockLayer('map', 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    try {
      lm.destroy(ZIndex.Z0_MAP);
      throw new Error('expected destroy to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LayerManagerError);
      expect((e as LayerManagerError).code).toBe('capture_invariant_violated');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gate
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — capability gating', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  it('Test 6: mount with requiredCaps=[read_char] when caps empty → throws capability_gate_denied', () => {
    const layer = makeMockLayer('char-sheet', 'char-capture');
    try {
      lm.mount(ZIndex.Z2_OVERLAY, layer, ['read_char']);
      throw new Error('expected mount to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(LayerManagerError);
      expect((e as LayerManagerError).code).toBe('capability_gate_denied');
    }
  });

  it('Test 7: setNegotiatedCaps then mount with required cap → succeeds', () => {
    const layer = makeMockLayer('char-sheet', 'char-capture');
    const caps: ReadonlySet<ServerCap> = new Set(['read_char', 'read_scene']);
    lm.setNegotiatedCaps(caps);
    expect(() => lm.mount(ZIndex.Z2_OVERLAY, layer, ['read_char'])).not.toThrow();
    expect(lm.getCaptureContainerCount()).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// bundle() atomic flush
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — bundle() atomic semantics', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  it('Test 8: bundle([destroy z=0.5, mount z=2 (capture)]) → rebuildPageContainer called exactly once', async () => {
    // Pre-arrange: z=0 holds capture, z=0.5 mounted (no capture)
    const mapLayer = makeMockLayer('map', 'map-capture');
    const idleInfill = makeMockLayer('idle-infill');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idleInfill);

    // The mount in the bundle replaces z=0 capture with z=2 capture (still exactly 1)
    // by demolishing z=0.5 then mounting an overlay layer that holds capture itself.
    const overlay = makeMockLayer('overlay', 'overlay-capture');
    // Destroy z=0 so the overlay carries capture solo after the bundle.
    const ops: LayerOp[] = [
      { type: 'destroy', z: ZIndex.Z0_5_IDLE_INFILL },
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: overlay },
    ];
    await lm.bundle(ops);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    expect(lm.getCaptureContainerCount()).toBe(1);
  });

  it('Test 9: bundle applies ops in order; transient invariant violation tolerated when final state is valid', async () => {
    // Start: z=0 holds capture.
    const mapLayer = makeMockLayer('map', 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    // Bundle order: destroy z=0 (transient state: 0 capture) THEN mount z=2 with capture.
    // Final state has exactly one capture — the bundle must NOT throw on the intermediate state.
    const overlay = makeMockLayer('overlay', 'overlay-capture');
    const ops: LayerOp[] = [
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: overlay },
    ];
    await expect(lm.bundle(ops)).resolves.not.toThrow();
    expect(lm.getCaptureContainerCount()).toBe(1);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setMapMode / getMapMode
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — setMapMode round-trip', () => {
  it('Test 10: setMapMode updates state without bridge I/O; getMapMode returns the value', () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);

    expect(lm.getMapMode()).toBe('auto');
    lm.setMapMode('raster');
    expect(lm.getMapMode()).toBe('raster');
    lm.setMapMode('glyph');
    expect(lm.getMapMode()).toBe('glyph');
    lm.setMapMode('auto');
    expect(lm.getMapMode()).toBe('auto');

    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    expect(bridge.createStartUpPageContainer).not.toHaveBeenCalled();
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
  });
});
