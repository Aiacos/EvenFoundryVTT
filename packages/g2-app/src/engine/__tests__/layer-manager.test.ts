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
 * Phase 19 Plan 04 additions:
 *   - setRenderMode / getRenderMode round-trip (default 'glyph')
 *   - canvas mode _flushPage: containerTotalNum:5 + _compositeAndPush invoked
 *   - CM-01: updateImageRawData called 4 times sequentially in canvas mode
 *   - null-compositor canvas mode: _compositeAndPush returns without throwing
 *   - _assertContainerBudget canvas-mode fixed-budget branch
 *
 * Phase 25 Plan 02 additions (D-25.3 / RPROMO-02):
 *   - LMT-ATOMIC-01: canvas→glyph atomic switch via setRenderMode('glyph')+bundle([])
 *     yields exactly ONE rebuildPageContainer with the 3-container glyph schema and
 *     ZERO mixed-schema intermediate frame (success criterion #3).
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §layer-manager.test.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 1
 * @see .planning/phases/EVF-19-adr-0013-amendment-1-canvas-compositor-core/19-04-PLAN.md
 * @see .planning/phases/EVF-25-promozione-raster-a-default-boot-fallback-glyph/25-02-PLAN.md Task 1
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasCompositorLike } from '../canvas-compositor.js';
import { BOOT_CONTAINER_TOTAL } from '../container-registry.js';
import type { DebugMirror } from '../debug-mirror.js';
import { HudDeltaDriver } from '../hud-delta-driver.js';
import { LayerManager } from '../layer-manager.js';
import {
  type Layer,
  LayerManagerError,
  type LayerOp,
  type OverlayPanel,
  type R1Gesture,
  ZIndex,
} from '../layer-types.js';

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

  it('Test 8b: _flushPage rebuilds the default STATUS-VIEW schema (3 text, 0 image, no isEventCapture=1) — not the full 11-container schema (j0t-05 flush fix)', async () => {
    // j0t-05 flush fix: _flushPage must use the status-view schema (same as buildBootPageSchema),
    // NOT the full 11-container registry. The full schema re-declares map-capture (id7, same
    // rect as status-hud id6) and z05-* (ids 8-10), causing "Text" ghosting/overlap on the glasses.
    const mapLayer = makeMockLayer('map', 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    await lm.bundle([]);

    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
    // Default status-view: 3 text (header id4, footer id5, status-hud id6), 0 image.
    expect(arg?.containerTotalNum).toBe(3);
    expect(arg?.imageObject?.length).toBe(0);
    expect(arg?.textObject?.length).toBe(3);
    // NO isEventCapture=1 in the status-view schema (map-capture id7 excluded).
    const captures = (arg?.textObject ?? []).filter(
      (t: { isEventCapture?: number }) => t.isEventCapture === 1,
    );
    expect(captures).toHaveLength(0);
    // The 3 containers are header(4), footer(5), status-hud(6) in id order.
    const texts = arg?.textObject ?? [];
    expect(texts[0]?.containerName).toBe('header');
    expect(texts[0]?.containerID).toBe(4);
    expect(texts[1]?.containerName).toBe('footer');
    expect(texts[1]?.containerID).toBe(5);
    expect(texts[2]?.containerName).toBe('status-hud');
    expect(texts[2]?.containerID).toBe(6);
    // Every text container has the numeric containerID + geometry.
    for (const t of texts) {
      expect(typeof t.containerID).toBe('number');
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
    }
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

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4b — Layer-types contract surface (LT-1..LT-5)
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 4b layer-types contract surface', () => {
  it('LT-1: ZIndex.Z1_5_TOAST is exactly 1.5', () => {
    expect(Number.isFinite(ZIndex.Z1_5_TOAST)).toBe(true);
    expect(ZIndex.Z1_5_TOAST).toBe(1.5);
  });

  it('LT-2: ZIndex value ordering Z0_MAP < Z0_5 < Z1 < Z1_5 < Z2 (numeric monotonicity)', () => {
    expect(ZIndex.Z0_MAP).toBeLessThan(ZIndex.Z0_5_IDLE_INFILL);
    expect(ZIndex.Z0_5_IDLE_INFILL).toBeLessThan(ZIndex.Z1_STATUS_HUD);
    expect(ZIndex.Z1_STATUS_HUD).toBeLessThan(ZIndex.Z1_5_TOAST);
    expect(ZIndex.Z1_5_TOAST).toBeLessThan(ZIndex.Z2_OVERLAY);
  });

  it('LT-3: LayerManagerErrorCode union includes panel_mount_budget_exceeded', () => {
    const err = new LayerManagerError('panel_mount_budget_exceeded', 'msg');
    expect(err.code).toBe('panel_mount_budget_exceeded');
    expect(err).toBeInstanceOf(LayerManagerError);
  });

  it('LT-4: R1Gesture exhaustive switch — type-narrows by `kind` discriminator', () => {
    function getKind(g: R1Gesture): string {
      switch (g.kind) {
        case 'tap':
          return 'tap';
        case 'scroll':
          return `scroll:${g.direction}`;
        case 'double-tap':
          return 'double-tap';
      }
    }
    expect(getKind({ kind: 'tap' })).toBe('tap');
    expect(getKind({ kind: 'scroll', direction: 'up' })).toBe('scroll:up');
    expect(getKind({ kind: 'scroll', direction: 'down' })).toBe('scroll:down');
    expect(getKind({ kind: 'double-tap' })).toBe('double-tap');
  });

  it('LT-5: Layer.getContainerCount is optional — both with and without satisfy the interface', () => {
    const withCount: Layer = {
      id: 'with-count',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 1 }),
    };
    const withoutCount: Layer = {
      id: 'no-count',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    expect(withCount.getContainerCount?.()).toEqual({ image: 0, text: 1 });
    expect(withoutCount.getContainerCount).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4b — differential demolish + container budget + OverlayPanel lifecycle
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a Layer with explicit container count + optional capture provider.
 *
 * Phase 4b tests use this helper exclusively so every layer reports its
 * footprint and `_assertContainerBudget` is exercised against realistic
 * payloads.
 */
function makeCountedLayer(
  id: string,
  count: { image: number; text: number },
  captureContainer?: string,
): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getContainerCount: () => count,
    ...(captureContainer !== undefined ? { getCaptureContainer: () => captureContainer } : {}),
  };
}

/**
 * Build an OverlayPanel stub satisfying isOverlayPanel.
 *
 * `captureContainer` is REQUIRED (not defaulted) — JS defaults trigger on
 * `undefined`, which would silently turn no-capture panels into capture
 * providers and corrupt the capture-invariant accounting.
 */
function makeOverlayPanelStub(
  id: string,
  count: { image: number; text: number },
  captureContainer: string | undefined,
): OverlayPanel {
  const base: OverlayPanel = {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    getContainerCount: () => count,
  };
  if (captureContainer !== undefined) {
    return { ...base, getCaptureContainer: () => captureContainer };
  }
  return base;
}

describe('Phase 4b differential demolish + container budget + OverlayPanel lifecycle', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  // ─── LMT-DD-01..06: differential demolish rule ────────────────────────────

  it('LMT-DD-01: bundle mount z=2 with z=0.5 mounted → z=0.5 auto-destroyed', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    // Destroy z=0 so the panel can carry capture solo via the test setup; the
    // differential demolish rule auto-removes z=0.5.
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      {
        type: 'mount',
        z: ZIndex.Z2_OVERLAY,
        layer: makeOverlayPanelStub('overlay', { image: 0, text: 3 }, 'overlay-capture'),
      },
    ]);

    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBeDefined();
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();
    expect((idle.destroy as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(0);
    // Reference idle to avoid unused-variable warnings; the assertion above proves the differential demolish ran.
    expect(panel.id).toBe('overlay');
  });

  it('LMT-DD-02: destroy z=2 restores the suspended z=0.5 instance (same reference)', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, 'overlay-capture');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel },
    ]);
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();

    // Bring back the map (capture provider) + destroy the overlay → z=0.5 must
    // re-mount, same reference.
    const mapLayer2 = makeCountedLayer('map2', { image: 4, text: 1 }, 'map-capture');
    await lm.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer2 },
      { type: 'destroy', z: ZIndex.Z2_OVERLAY },
    ]);
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBe(idle);
  });

  it('LMT-DD-03: mount + destroy z=2 with NO z=0.5 ever mounted is a clean no-op for the differential rule', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBe(panel);
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();

    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBeUndefined();
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();
  });

  it('LMT-DD-04: z=1.5 toast is NOT demolished on z=2 mount (carve-out)', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const toast = makeCountedLayer('toast', { image: 0, text: 1 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z1_5_TOAST, toast);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);

    // Toast must STILL be mounted as the same instance.
    expect(lm.getLayer(ZIndex.Z1_5_TOAST)).toBe(toast);

    // Destroying the overlay must NOT touch the toast either.
    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    expect(lm.getLayer(ZIndex.Z1_5_TOAST)).toBe(toast);
  });

  it('LMT-DD-05: differential demolish + explicit mount of z=2 → exactly ONE rebuildPageContainer call per bundle', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);

    bridge.rebuildPageContainer.mockClear();
    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  });

  it('LMT-DD-06: idle-infill instance round-trips intact through a mount + destroy of z=2', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);

    const restored = lm.getLayer(ZIndex.Z0_5_IDLE_INFILL);
    expect(restored).toBe(idle);
    expect(restored?.id).toBe('idle-infill');
  });

  /**
   * LMT-DD-07 — race-coverage assertions for the z=0.5 → z=2 differential demolish
   * transition (UI-SPEC §6.4 State D Mid-mount transition + §8.1 Atomicity guarantee +
   * Specs.md §11.5.8.6 failure-mode mitigation).
   *
   * Locks the INFILL-03 atomicity contract: a single `bundle()` invocation that
   * simultaneously demolishes z=0 + mounts z=2 (while z=0.5 is currently mounted)
   * MUST produce EXACTLY ONE `bridge.rebuildPageContainer` call — no transient frame
   * in which both z=0.5 AND z=2 are visible can leak through the bridge boundary.
   *
   * Split into four sibling `it` blocks (Phase 14 review WR-04) so a failing
   * assertion pinpoints WHICH contract broke without cascading masking:
   *
   *   - LMT-DD-07a: single-bundle atomicity (one flush per bundle).
   *   - LMT-DD-07b: no-transient-state post-condition exclusivity.
   *   - LMT-DD-07c: `_suspendedZ05` reference-equality round-trip on inverse bundle.
   *   - LMT-DD-07d: toast carve-out under overlay-mount race (fresh lm/bridge).
   *
   * Each sub-test is self-contained via the surrounding `beforeEach` (fresh `bridge`
   * + `lm`), so flush counts are absolute (not cumulative) — replaces the prior
   * fragile `toBe(2)` cross-assertion sum.
   */
  it('LMT-DD-07a: atomicity — bundle(destroy z=0, mount z=2) with z=0.5 mounted triggers EXACTLY ONE bridge flush', async () => {
    // Pre-arrange: z=0 holds capture, z=0.5 mounted.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);
    bridge.rebuildPageContainer.mockClear();
    expect(bridge.rebuildPageContainer.mock.calls.length).toBe(0);

    // The differential-demolish rule (layer-manager.ts:191-224) MUST also
    // implicitly destroy z=0.5 before the bridge flush — i.e. the effective op
    // list becomes [destroy z=0.5, destroy z=0, mount z=2] AND collapses into
    // a SINGLE `rebuildPageContainer` call.
    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, 'overlay-capture');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel },
    ]);

    // Absolute count (this `lm` started with 0 flushes after mockClear).
    expect(bridge.rebuildPageContainer.mock.calls.length).toBe(1);
  });

  it('LMT-DD-07b: no transient state — post-condition exposes z=2 exclusively (z=0.5 undefined, panel mounted, capture invariant intact)', async () => {
    // Pre-arrange identical to 07a.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBe(idle);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, 'overlay-capture');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel },
    ]);

    // The bundle is atomic from the caller's perspective: no awaitable intermediate
    // state exposes both z=0.5 AND z=2 simultaneously.
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBe(panel);
    // Capture invariant satisfied (panel carries 'overlay-capture').
    expect(lm.getCaptureContainerCount()).toBe(1);
  });

  it('LMT-DD-07c: _suspendedZ05 round-trip — inverse bundle restores the ORIGINAL idle instance via reference equality, with exactly one flush per bundle', async () => {
    // Pre-arrange + forward bundle (same as 07a) to suspend z=0.5.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z0_5_IDLE_INFILL, idle);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, 'overlay-capture');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel },
    ]);
    // Reset spy so the second bundle's flush count is asserted in isolation —
    // no cumulative magic-number trap (Phase 14 review WR-04).
    bridge.rebuildPageContainer.mockClear();

    // Inverse bundle: re-mount map (capture provider) + destroy the overlay in
    // a single bundle; the differential-restore rule (layer-manager.ts:207-220)
    // must re-mount the ORIGINAL `idle` instance (reference-equality round-trip).
    const map2 = makeCountedLayer('map2', { image: 4, text: 1 }, 'map-capture');
    await lm.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: map2 },
      { type: 'destroy', z: ZIndex.Z2_OVERLAY },
    ]);

    // Reference equality — a silent instance-swap would fail this (T-14-02-01).
    expect(lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBe(idle);
    // Inverse bundle = exactly one flush (no spurious extras post-mockClear).
    expect(bridge.rebuildPageContainer.mock.calls.length).toBe(1);
  });

  it('LMT-DD-07d: toast carve-out under race — toast at z=1.5 SURVIVES the overlay-mount bundle alongside z=0.5 demolish, single flush', async () => {
    // Fresh LayerManager + bridge scoped to this assertion (UI-SPEC §6.4 row 1
    // carve-out, re-affirming LMT-DD-04 under the race window).
    const bridge2 = makeMockBridge();
    const lm2 = new LayerManager(bridge2 as unknown as EvenAppBridge);
    const map = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    const toast = makeCountedLayer('toast', { image: 0, text: 1 });
    lm2.mount(ZIndex.Z0_MAP, map);
    lm2.mount(ZIndex.Z0_5_IDLE_INFILL, idle);
    lm2.mount(ZIndex.Z1_5_TOAST, toast);
    expect(bridge2.rebuildPageContainer.mock.calls.length).toBe(0);

    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);
    await lm2.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);

    // Toast still mounted (carve-out holds under the race-window bundle).
    expect(lm2.getLayer(ZIndex.Z1_5_TOAST)).toBe(toast);
    // z=0.5 demolished (differential rule fired).
    expect(lm2.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBeUndefined();
    // z=2 mounted as the same panel reference.
    expect(lm2.getLayer(ZIndex.Z2_OVERLAY)).toBe(panel);
    // Exactly one flush — toast carve-out does NOT cost an extra bridge call.
    expect(bridge2.rebuildPageContainer.mock.calls.length).toBe(1);
  });

  // ─── LMT-OP-01..04: OverlayPanel lifecycle ─────────────────────────────────

  it('LMT-OP-01: onMount() called exactly once after layers.set, before bridge flush', async () => {
    // Keep z=0 map as capture provider throughout — panel itself does NOT
    // capture (no `getCaptureContainer`), so the invariant holds with map mounted.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    const callOrder: string[] = [];
    bridge.rebuildPageContainer.mockImplementation(async () => {
      callOrder.push('rebuildPageContainer');
      return true;
    });

    const onMount = vi.fn().mockImplementation(async () => {
      callOrder.push('onMount');
      expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBeDefined();
      expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    });
    const panel: OverlayPanel = {
      id: 'panel-1',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      onMount,
      onUnmount: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 3 }),
    };

    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['onMount', 'rebuildPageContainer']);
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBe(panel);
  });

  it('LMT-OP-02: onUnmount() called before bridge flush on destroy', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    const onUnmount = vi.fn().mockResolvedValue(undefined);
    const panel: OverlayPanel = {
      id: 'panel-2',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      onMount: vi.fn().mockResolvedValue(undefined),
      onUnmount,
      onEvent: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 3 }),
    };

    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
    bridge.rebuildPageContainer.mockClear();

    const callOrder: string[] = [];
    onUnmount.mockImplementation(async () => {
      callOrder.push('onUnmount');
      expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    });
    bridge.rebuildPageContainer.mockImplementation(async () => {
      callOrder.push('rebuildPageContainer');
      return true;
    });

    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['onUnmount', 'rebuildPageContainer']);
  });

  it('LMT-OP-03: a plain Layer (no panel hooks) receives no lifecycle calls', async () => {
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    const plain = makeCountedLayer('plain-overlay', { image: 0, text: 3 }, 'overlay-capture');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z0_MAP },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: plain },
    ]);
    // No lifecycle methods exist on `plain`, so this is just a smoke check that
    // the bundle completed without throwing — the isOverlayPanel guard
    // short-circuited the lifecycle invocation.
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBe(plain);
  });

  it('LMT-OP-04: onMount() rejection aborts bundle; bridge flush NEVER runs', async () => {
    // Keep z=0 map as capture provider; the panel does NOT capture, so the
    // invariant passes and we reach the onMount() lifecycle hook where the
    // rejection happens.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);

    const onMount = vi.fn().mockRejectedValue(new Error('mount kaboom'));
    const panel: OverlayPanel = {
      id: 'panel-bad',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      onMount,
      onUnmount: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 3 }),
    };

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]),
    ).rejects.toThrow('mount kaboom');
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    // Caller responsibility: layer remains in map; caller must destroy + retry.
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)).toBe(panel);
  });

  // ─── LMT-CB-01..03: container budget assertion ─────────────────────────────

  it('LMT-CB-01: bundle succeeds at the SDK cap; throws panel_mount_budget_exceeded above the cap', async () => {
    // Closed state: map (4i+1t) + status (1t) + toast (1t) + idle (3t) = 4i + 6t (cap is 4/8).
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const status = makeCountedLayer('status', { image: 0, text: 1 });
    const toast = makeCountedLayer('toast', { image: 0, text: 1 });
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    await lm.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer },
      { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: status },
      { type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toast },
      { type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idle },
    ]);

    // Open state via differential demolish: panel (5t) replaces idle (3t).
    // Sum: 4i + 1+1+1+5 = 4i + 8t == cap → succeeds.
    const panelAtCap = makeOverlayPanelStub('overlay-cap', { image: 0, text: 5 }, undefined);
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panelAtCap }]),
    ).resolves.not.toThrow();

    // Destroy panel → idle restored. State back to closed: 4i + 6t.
    await lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);

    // Now mount a panel that overflows the cap. Differential demolish removes
    // idle (3t), then adds overflow (6t). Sum: 4i + 1+1+1+6 = 4i + 9t > 8 cap.
    const callsBefore = bridge.rebuildPageContainer.mock.calls.length;
    const overflow = makeOverlayPanelStub('overflow', { image: 0, text: 6 }, undefined);
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: overflow }]),
    ).rejects.toMatchObject({ code: 'panel_mount_budget_exceeded' });
    // The throw came BEFORE the bridge flush.
    expect(bridge.rebuildPageContainer.mock.calls.length).toBe(callsBefore);
  });

  it('LMT-CB-02: differential demolish subtracts z=0.5 from cumulative count so over-budget closed becomes in-budget open', async () => {
    // Closed state: 4i + 1t (map) + 3t (idle) + 1t (status) + 1t (toast) = 4i + 6t = 10 (cap 12)
    // Open state (z=2 mounted, z=0.5 demolished): 4i + 1t + 1t + 1t + 3t = 4i + 6t = 10 — same cap.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    const idle = makeCountedLayer('idle-infill', { image: 0, text: 3 });
    const status = makeCountedLayer('status', { image: 0, text: 1 });
    const toast = makeCountedLayer('toast', { image: 0, text: 1 });
    const panel = makeOverlayPanelStub('overlay', { image: 0, text: 3 }, undefined);

    await lm.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer },
      { type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idle },
      { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: status },
      { type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toast },
    ]);

    // Without differential demolish, adding panel would push text count to 9.
    // The differential rule removes idle (3t) atomically, keeping text at 6.
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]),
    ).resolves.not.toThrow();
  });

  it('LMT-CB-03: _assertContainerBudget runs AFTER _assertCaptureInvariant (capture violation throws first)', async () => {
    // Set up: z=0 holds capture; introduce a SECOND capture layer to violate
    // the invariant; container counts are well under the cap. The capture
    // violation MUST be the throw the caller sees.
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    const dupCapture = makeCountedLayer('dup-capture', { image: 0, text: 1 }, 'dup-capture');

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: dupCapture }]),
    ).rejects.toMatchObject({ code: 'capture_invariant_violated' });
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// LayerManager.getTopLayer (LMT-TOP-01..04)
// Phase 6 Plan 01 Task 2 — top-of-stack routing accessor for INV-5 enforcement
// ──────────────────────────────────────────────────────────────────────────────

/** Helper: create an OverlayPanel stub for getTopLayer tests. */
function makeTopLayerOverlayPanel(id: string): OverlayPanel {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getCaptureContainer: () => `${id}-capture`,
    getContainerCount: () => ({ image: 0, text: 1 }),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
  };
}

/** Helper: create a plain non-overlay Layer for getTopLayer tests. */
function makeTopLayerPlainLayer(id: string): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getCaptureContainer: () => `${id}-capture`,
    getContainerCount: () => ({ image: 0, text: 1 }),
  };
}

/** Helper: non-capture plain layer (HUD, toast etc.). */
function makeTopLayerNonCaptureLayer(id: string): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getContainerCount: () => ({ image: 0, text: 1 }),
  };
}

describe('LayerManager.getTopLayer (LMT-TOP-01..04)', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  it('LMT-TOP-01: returns null when no OverlayPanel is mounted (empty stack or non-overlay layers only)', () => {
    // Empty stack — no layers at all
    expect(lm.getTopLayer()).toBeNull();

    // Add only non-overlay layers (map + status HUD)
    const mapLayer = makeTopLayerPlainLayer('map');
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    // Status HUD and other non-overlay layers do NOT satisfy isOverlayPanel
    const hudLayer = makeTopLayerNonCaptureLayer('hud');
    // Capture invariant: z=0 already has a capture provider, so z=1 is non-capture
    // mount without checking invariant by using _private_no_cap layer:
    (lm as unknown as { layers: Map<ZIndex, Layer> }).layers.set(ZIndex.Z1_STATUS_HUD, hudLayer);
    expect(lm.getTopLayer()).toBeNull();
  });

  it('LMT-TOP-02: with a single OverlayPanel mounted at z=2, getTopLayer() returns that panel', () => {
    // Prime the map layer (capture provider) via internal set (no invariant check needed for this test)
    const mapLayer = makeTopLayerPlainLayer('map');
    (lm as unknown as { layers: Map<ZIndex, Layer> }).layers.set(ZIndex.Z0_MAP, mapLayer);

    const panel = makeTopLayerOverlayPanel('overlay-panel');
    // Mount panel directly (bypass bundle lifecycle for unit test simplicity)
    (lm as unknown as { layers: Map<ZIndex, Layer> }).layers.set(ZIndex.Z2_OVERLAY, panel);

    const top = lm.getTopLayer();
    expect(top).not.toBeNull();
    expect(top?.id).toBe('overlay-panel');
  });

  it('LMT-TOP-03: insertion-order regression guard — mount z=2 FIRST, then z=1 StatusHudLayer; getTopLayer() still returns z=2 panel (sort-by-z, not insertion order)', () => {
    // RESEARCH Pitfall 2: Map iteration is insertion-order, NOT numeric-order.
    // If getTopLayer() used Map iteration without sorting, inserting z=2 FIRST
    // would yield z=2 on the first iteration — but that would be coincidentally
    // correct. This test inserts z=2 FIRST so a naive Map.entries() scan would
    // accidentally "work" — the real test is that inserting z=1 FIRST ALSO works.
    const panel = makeTopLayerOverlayPanel('panel-z2');
    const nonCapHud = makeTopLayerNonCaptureLayer('hud-z1');

    // Insert z=2 first (insertion order: z=2, then z=1)
    const layers = (lm as unknown as { layers: Map<ZIndex, Layer> }).layers;
    layers.set(ZIndex.Z2_OVERLAY, panel);
    layers.set(ZIndex.Z1_STATUS_HUD, nonCapHud);
    // Also set a map capture layer at z=0
    layers.set(ZIndex.Z0_MAP, makeTopLayerPlainLayer('map'));

    // getTopLayer must still return z=2 panel
    expect(lm.getTopLayer()?.id).toBe('panel-z2');

    // Now the more challenging case: clear and insert z=1 FIRST, then z=2
    layers.clear();
    layers.set(ZIndex.Z1_STATUS_HUD, nonCapHud);
    layers.set(ZIndex.Z2_OVERLAY, panel);
    layers.set(ZIndex.Z0_MAP, makeTopLayerPlainLayer('map'));

    expect(lm.getTopLayer()?.id).toBe('panel-z2');
  });

  it('LMT-TOP-04: non-OverlayPanel layers at any z are skipped — only layers with onMount+onUnmount+onEvent qualify', () => {
    // Only non-overlay layers (plain map + status)
    const mapLayer = makeTopLayerPlainLayer('map');
    const hudLayer = makeTopLayerNonCaptureLayer('hud');
    const toastLayer = makeTopLayerNonCaptureLayer('toast');

    const layers = (lm as unknown as { layers: Map<ZIndex, Layer> }).layers;
    layers.set(ZIndex.Z0_MAP, mapLayer);
    layers.set(ZIndex.Z1_STATUS_HUD, hudLayer);
    layers.set(ZIndex.Z1_5_TOAST, toastLayer);

    // None of these have onMount/onUnmount/onEvent
    expect(lm.getTopLayer()).toBeNull();

    // Add an OverlayPanel at z=2 — now it should be returned
    const panel = makeTopLayerOverlayPanel('real-panel');
    layers.set(ZIndex.Z2_OVERLAY, panel);
    expect(lm.getTopLayer()?.id).toBe('real-panel');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Debug mirror DI (Quick Task 260529-h5e Wave 4)
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — debug mirror DI (backward-compat + injected)', () => {
  it('mirror undefined (default) → bundle still flushes exactly one rebuildPageContainer (byte-identical)', async () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    const mapLayer = makeMockLayer('map', 'map-capture');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer }]);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  });

  it('injected mirror → records op:rebuild with containerCount once after _flushPage', async () => {
    const bridge = makeMockBridge();
    const record = vi.fn();
    const lm = new LayerManager(
      bridge as unknown as EvenAppBridge,
      { record } as unknown as DebugMirror,
    );
    const mapLayer = makeMockLayer('map', 'map-capture');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer }]);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    const rebuildCalls = record.mock.calls.filter((c) => (c[0] as { op: string }).op === 'rebuild');
    expect(rebuildCalls).toHaveLength(1);
    expect((rebuildCalls[0]?.[0] as { containerCount?: number }).containerCount).toBeTypeOf(
      'number',
    );
  });

  it('injected mirror → records mount and destroy ops from bundle', async () => {
    const bridge = makeMockBridge();
    const record = vi.fn();
    const lm = new LayerManager(
      bridge as unknown as EvenAppBridge,
      { record } as unknown as DebugMirror,
    );
    const mapLayer = makeMockLayer('map', 'map-capture');
    const hudLayer = makeMockLayer('hud');
    // mount map (capture) + hud (non-capture)
    await lm.bundle([
      { type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer },
      { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: hudLayer },
    ]);
    // destroy hud (map remains as sole capture)
    await lm.bundle([{ type: 'destroy', z: ZIndex.Z1_STATUS_HUD }]);
    const ops = record.mock.calls.map((c) => (c[0] as { op: string }).op);
    expect(ops).toContain('mount');
    expect(ops).toContain('destroy');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 19 Plan 04 — renderMode + canvas-mode _flushPage + _compositeAndPush
// (RAST-04, RAST-01)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal CanvasCompositorLike stub for testing _compositeAndPush.
 *
 * Returns a blank 400×200×4 RGBA buffer (320000 bytes, all zeros).
 */
function makeFakeCompositor(): CanvasCompositorLike & {
  composite: ReturnType<typeof vi.fn>;
} {
  const blankRgba = new Uint8ClampedArray(400 * 200 * 4); // 320000 zeros
  return {
    composite: vi.fn().mockReturnValue(blankRgba),
    registerLayer: vi.fn(),
    deregisterLayer: vi.fn(),
    markDirty: vi.fn(),
  };
}

describe('LayerManager — renderMode (Phase 19 Plan 04, RAST-04)', () => {
  it('LMT-RM-01: getRenderMode() defaults to glyph', () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    expect(lm.getRenderMode()).toBe('glyph');
  });

  it('LMT-RM-02: setRenderMode/getRenderMode round-trip without bridge I/O', () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);

    lm.setRenderMode('canvas');
    expect(lm.getRenderMode()).toBe('canvas');
    lm.setRenderMode('glyph');
    expect(lm.getRenderMode()).toBe('glyph');

    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });

  it('LMT-RM-03: 2-arg constructor (no compositor) still compiles and defaults to glyph', () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    expect(lm.getRenderMode()).toBe('glyph');
    // bridge should not be touched by construction
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
  });
});

describe('LayerManager — canvas-mode _flushPage (RAST-04)', () => {
  it('LMT-CF-01: canvas mode _flushPage calls rebuildPageContainer with containerTotalNum:5', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    // Mount a capture-providing layer to satisfy capture invariant.
    // In canvas mode, the capture layer must declare {image:0, text:0} per ADR-0013.
    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
    expect(arg?.containerTotalNum).toBe(5);
  });

  it('LMT-CF-02: canvas mode _flushPage schema has 4 image containers + 1 text capture', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    const arg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
    expect(arg?.imageObject?.length).toBe(4);
    expect(arg?.textObject?.length).toBe(1);
    // The text container must have isEventCapture:1
    const captureContainers = (arg?.textObject ?? []).filter(
      (t: { isEventCapture?: number }) => t.isEventCapture === 1,
    );
    expect(captureContainers).toHaveLength(1);
  });

  it('LMT-CF-03: canvas mode _flushPage calls _compositeAndPush (compositor.composite invoked)', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    // compositor.composite() must have been called once
    expect(compositor.composite).toHaveBeenCalledTimes(1);
  });

  it('LMT-CV-REPLACE-01: replace bundle (destroy z2 + mount z2) keeps the NEW canvas layer registered — deregister precedes register', async () => {
    // Regression for debug canvas-sheet-overlay-wont-open (2026-06-09):
    // pushOverlay's atomic suspend path issues [{destroy z2}, {mount z2}] in ONE
    // bundle. STEP 2.5 used to register the new layer FIRST and deregister the
    // destroyed z afterwards — wiping the just-registered replacement from the
    // compositor (invisible menu over a suspended panel).
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    const makeCanvasOverlay = (id: string) => ({
      id,
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 0 }),
      onMount: vi.fn().mockResolvedValue(undefined),
      onUnmount: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(),
      attachCanvas: vi.fn().mockResolvedValue(undefined),
      paint: vi.fn(),
      isDirty: vi.fn().mockReturnValue(true),
    });

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    const first = makeCanvasOverlay('first-overlay');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: first as unknown as Layer }]);

    const replacement = makeCanvasOverlay('replacement-overlay');
    await lm.bundle([
      { type: 'destroy', z: ZIndex.Z2_OVERLAY },
      { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: replacement as unknown as Layer },
    ]);

    // The replacement must be the LAST compositor action on z2 — i.e. the final
    // registerLayer call for z2 happens AFTER the final deregisterLayer for z2.
    const registerMock = compositor.registerLayer as ReturnType<typeof vi.fn>;
    const deregisterMock = compositor.deregisterLayer as ReturnType<typeof vi.fn>;
    const lastRegisterOrder = Math.max(
      ...registerMock.mock.invocationCallOrder.filter(
        (_: number, i: number) => registerMock.mock.calls[i]?.[0] === ZIndex.Z2_OVERLAY,
      ),
    );
    const deregisterOrders = deregisterMock.mock.invocationCallOrder.filter(
      (_: number, i: number) => deregisterMock.mock.calls[i]?.[0] === ZIndex.Z2_OVERLAY,
    );
    expect(deregisterOrders.length).toBeGreaterThan(0);
    expect(Math.max(...deregisterOrders)).toBeLessThan(lastRegisterOrder);

    // And the last z2 registration carries the replacement layer instance.
    const z2Registrations = registerMock.mock.calls.filter(
      (c: unknown[]) => c[0] === ZIndex.Z2_OVERLAY,
    );
    expect(z2Registrations.at(-1)?.[2]).toBe(replacement);
  });

  it('LMT-CF-04: glyph mode _flushPage is byte-identical to before (containerTotalNum:3, no compositor call) — j0t-05 preserved', async () => {
    // This is the same as existing Test 8b, re-asserted here for glyph coexistence
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const mapLayer = makeMockLayer('map', 'map-capture');
    // glyph mode is the default; do NOT call setRenderMode
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer }]);

    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
    expect(arg?.containerTotalNum).toBe(3);
    expect(arg?.imageObject?.length).toBe(0);
    expect(arg?.textObject?.length).toBe(3);
    // NO isEventCapture:1 in glyph status-view schema
    const captures = (arg?.textObject ?? []).filter(
      (t: { isEventCapture?: number }) => t.isEventCapture === 1,
    );
    expect(captures).toHaveLength(0);
    // compositor.composite must NOT have been called in glyph mode
    expect(compositor.composite).not.toHaveBeenCalled();
  });
});

describe('LayerManager — CM-01 serialized updateImageRawData (RAST-01)', () => {
  it('CM-01: canvas mode _compositeAndPush calls bridge.updateImageRawData exactly 4 times sequentially', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    // Track call order to verify sequential execution
    const callOrder: string[] = [];
    bridge.updateImageRawData.mockImplementation(async (payload: { containerName?: string }) => {
      callOrder.push(`update:${payload.containerName ?? 'unknown'}`);
      return 'success';
    });

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    // Must be called exactly 4 times (4 HUD tiles)
    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);
    // All calls recorded in sequence (not concurrent - Promise.all would interleave differently)
    expect(callOrder).toHaveLength(4);
    expect(callOrder[0]).toMatch(/^update:/);
    expect(callOrder[1]).toMatch(/^update:/);
    expect(callOrder[2]).toMatch(/^update:/);
    expect(callOrder[3]).toMatch(/^update:/);
  });
});

describe('LayerManager — null-compositor guard (Pitfall 2)', () => {
  it('LMT-NC-01: canvas mode with null compositor (no 3rd arg) does not throw when _compositeAndPush runs', async () => {
    // Construct without compositor (2-arg call) then set canvas mode
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    // Must not throw even though compositor is null
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]),
    ).resolves.not.toThrow();

    // rebuildPageContainer still called once (schema built even without compositor)
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    // updateImageRawData NOT called (compositor null → _compositeAndPush returns early)
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 19 Plan 04 — _assertContainerBudget canvas-mode fixed-budget branch
// (RAST-03)
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — _assertContainerBudget canvas-mode (RAST-03)', () => {
  it('LMT-CB-CV-01: canvas mode — layer with {image:0,text:0} does NOT throw', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    lm.setRenderMode('canvas');

    const canvasLayer: Layer = {
      id: 'canvas-layer',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    // Must not throw — {image:0,text:0} is the correct canvas-layer declaration
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: canvasLayer }]),
    ).resolves.not.toThrow();
  });

  it('LMT-CB-CV-02: canvas mode — layer with {image:1,text:0} throws panel_mount_budget_exceeded', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    lm.setRenderMode('canvas');

    const misclassifiedLayer: Layer = {
      id: 'misclassified',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 1, text: 0 }), // non-zero = mis-classified glyph layer
    };

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: misclassifiedLayer }]),
    ).rejects.toMatchObject({ code: 'panel_mount_budget_exceeded' });
  });

  it('LMT-CB-CV-03: canvas mode — layer with {image:0,text:1} throws panel_mount_budget_exceeded', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    lm.setRenderMode('canvas');

    const misclassifiedLayer: Layer = {
      id: 'misclassified-text',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 1 }), // non-zero = mis-classified
    };

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: misclassifiedLayer }]),
    ).rejects.toMatchObject({ code: 'panel_mount_budget_exceeded' });
  });

  it('LMT-CB-CV-04: glyph mode budget behavior unchanged (existing LMT-CB-01 pattern)', async () => {
    // Verify the glyph mode per-layer sum behavior is byte-identical
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    // glyph is default — no setRenderMode call needed

    // A map layer with {image:4, text:1} is OK in glyph mode
    const mapLayer = makeCountedLayer('map', { image: 4, text: 1 }, 'map-capture');
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: mapLayer }]),
    ).resolves.not.toThrow();

    // Now add a layer that overflows the text budget
    const overflowLayer = makeCountedLayer('overflow', { image: 0, text: 8 }); // 1+8 = 9 > 8 cap
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: overflowLayer }]),
    ).rejects.toMatchObject({ code: 'panel_mount_budget_exceeded' });
  });

  it('LMT-CB-CV-05: canvas-mode capture-ordering preserved — capture violation throws first (LMT-CB-03 canvas analog)', async () => {
    // Even in canvas mode, _assertCaptureInvariant runs BEFORE _assertContainerBudget
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    lm.setRenderMode('canvas');

    // Mount a valid capture layer first
    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);
    bridge.rebuildPageContainer.mockClear();

    // Now mount a SECOND capture layer — capture violation must throw before budget check
    const dupCapture: Layer = {
      id: 'dup-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture-dup',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: dupCapture }]),
    ).rejects.toMatchObject({ code: 'capture_invariant_violated' });
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 24 Plan 02 — HudDeltaDriver injection (DL-07)
// Verifies that:
//   (a) canvas-mode bundle calls driver.runFirstFrame + driver.start (driver path)
//   (b) driverless construction (no driver arg) still works via _compositeAndPush fallback
//   (c) disposeSubscriptions() calls driver.stop()
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a `HudDeltaDriver` test double.
 *
 * Uses `vi.spyOn` on the real class prototype so TypeScript accepts the driver
 * as `HudDeltaDriver` without requiring a full xxhash-wasm WASM environment.
 * The spy methods resolve immediately (no WASM init, no bridge calls).
 */
function makeMockDriver() {
  const driver = Object.create(HudDeltaDriver.prototype) as HudDeltaDriver;
  vi.spyOn(driver, 'runFirstFrame').mockResolvedValue(undefined);
  vi.spyOn(driver, 'start').mockResolvedValue(undefined);
  vi.spyOn(driver, 'stop').mockReturnValue(undefined);
  return driver;
}

describe('LayerManager — HudDeltaDriver injection (DL-07, Phase 24)', () => {
  it('DL-07-a: canvas-mode bundle calls driver.start() then driver.runFirstFrame() on flush (CR-02 order)', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const driver = makeMockDriver();

    // 4th constructor arg is the driver (Phase 24 signature).
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor, driver);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    // Driver's first-frame push and loop start must have been called.
    expect(driver.runFirstFrame).toHaveBeenCalledTimes(1);
    expect(driver.start).toHaveBeenCalledTimes(1);

    // CR-02: start() must be awaited BEFORE runFirstFrame() (subscribe first,
    // then seed hashes) so inbound deltas during the first push are not dropped.
    const startOrder = (driver.start as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    const runOrder = (driver.runFirstFrame as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    expect(startOrder[0]).toBeLessThan(runOrder[0] ?? Infinity);
  });

  it('DL-07-b: driver path — compositor.composite NOT called directly by LayerManager (driver owns it)', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const driver = makeMockDriver();

    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor, driver);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

    // LayerManager must NOT call compositor.composite() when driver is present —
    // the driver is the sole compositor owner in canvas mode (D-24 invariant).
    expect(compositor.composite).not.toHaveBeenCalled();
    // updateImageRawData is also NOT called directly by LayerManager.
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });

  it('DL-07-c: disposeSubscriptions() calls driver.stop()', async () => {
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const driver = makeMockDriver();

    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor, driver);

    lm.disposeSubscriptions();

    expect(driver.stop).toHaveBeenCalledTimes(1);
  });

  it('DL-07-d: driverless construction (no driver arg) still works — _compositeAndPush fallback', async () => {
    // 3-arg construction path: no driver injected. Canvas mode falls back to
    // _compositeAndPush() so existing schema-select tests remain valid.
    const bridge = makeMockBridge();
    const compositor = makeFakeCompositor();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

    const captureLayer: Layer = {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };

    lm.setRenderMode('canvas');
    // Must not throw — driverless path uses _compositeAndPush() which is still present.
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]),
    ).resolves.not.toThrow();

    // rebuildPageContainer called once (schema rebuilt).
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    // compositor.composite() called once via _compositeAndPush fallback.
    expect(compositor.composite).toHaveBeenCalledTimes(1);
  });

  it('DL-07-e: disposeSubscriptions() is a no-op when no driver was injected', () => {
    const bridge = makeMockBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    // Must not throw — no driver present, disposeSubscriptions is a no-op.
    expect(() => lm.disposeSubscriptions()).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 25 Plan 02 — canvas→glyph atomic switch (LMT-ATOMIC-01)
// D-25.3 / RPROMO-02 — success criterion #3
//
// Verifies that setRenderMode('glyph') + bundle([]) atomically produces exactly
// ONE rebuildPageContainer call with the 3-container glyph schema and ZERO
// mixed-schema intermediate frame after a canvas-mode boot.
//
// This is the regression guard for the glyph-fallback switch wired by Task 2
// in boot-engine-core.ts.
// ──────────────────────────────────────────────────────────────────────────────

describe('LayerManager — canvas→glyph atomic switch (LMT-ATOMIC-01, Phase 25 D-25.3)', () => {
  it(
    'LMT-ATOMIC-01: setRenderMode(glyph)+bundle([]) after canvas boot yields exactly ONE ' +
      'rebuildPageContainer with 3-container glyph schema and zero mixed-schema intermediate frame',
    async () => {
      // Arrange: boot in canvas mode (mirrors LMT-CF-01 setup)
      const bridge = makeMockBridge();
      const compositor = makeFakeCompositor();
      // 3-arg construction: no driver → driverless _compositeAndPush fallback path.
      const lm = new LayerManager(bridge as unknown as EvenAppBridge, undefined, compositor);

      const captureLayer: Layer = {
        id: 'canvas-capture',
        draw: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getCaptureContainer: () => 'hud-capture',
        getContainerCount: () => ({ image: 0, text: 0 }),
      };

      // Boot canvas mode: mount capture-providing layer so the capture invariant is satisfied.
      lm.setRenderMode('canvas');
      await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: captureLayer }]);

      // Reset spy call history — the canvas-boot rebuildPageContainer is not part of
      // the atomicity assertion (we are only counting calls AFTER the glyph switch).
      bridge.rebuildPageContainer.mockClear();
      bridge.updateImageRawData.mockClear();

      // Act: atomic canvas→glyph switch — setRenderMode then bundle with no ops.
      lm.setRenderMode('glyph');
      await lm.bundle([]); // empty ops = schema switch only, no mount/destroy changes

      // Assert 1 — atomicity: exactly ONE rebuildPageContainer call after the switch.
      // Any value > 1 would indicate a mixed-schema intermediate frame (Pitfall 3 / D-25.3).
      expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);

      // Assert 2 — glyph schema shape (D-25.4 byte-identical to pre-v0.10.0 glyph schema):
      //   containerTotalNum = BOOT_CONTAINER_TOTAL (3)
      //   textObject.length = 3  (header id4 + footer id5 + status-hud id6)
      //   imageObject.length = 0 (no image tiles in glyph mode)
      const schemaArg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
      expect(schemaArg?.containerTotalNum).toBe(BOOT_CONTAINER_TOTAL);
      expect(schemaArg?.textObject?.length).toBe(3);
      expect(schemaArg?.imageObject?.length).toBe(0);

      // Assert 3 — zero mixed-schema frame: updateImageRawData must NOT have been called
      // during the glyph bundle (glyph mode pushes no image tiles — no raster bleed).
      expect(bridge.updateImageRawData).not.toHaveBeenCalled();
    },
  );
});
