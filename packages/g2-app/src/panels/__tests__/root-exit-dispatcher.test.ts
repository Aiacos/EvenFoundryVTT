/**
 * Unit tests for `attachRootExit` dispatcher (ROOT-* markers).
 *
 * Verifies ADR-0012 D-4: double-tap while the bare root map (no overlay open)
 * calls `bridge.shutDownPageContainer(1)`. Both canvas mode (z=0 MapCanvasLayer,
 * id='map-canvas') and glyph mode (z=0 MapBaseLayer, id='map-base') must trigger
 * the exit.
 *
 * Rule 1 auto-fix (260610-d42 Task 3): `attachRootExit` was previously gated on
 * `top.id === 'map-base'`; canvas mode installs MapCanvasLayer ('map-canvas') at z=0
 * and `getTopLayer()` returns `null` when no overlay is open. The fix changes the
 * guard to fire exit when `top === null` (no overlay open) rather than requiring
 * a specific id.
 *
 * Tests:
 *   ROOT-1a  double-tap, no overlay (top=null) → shutDownPageContainer(1) called
 *   ROOT-1b  double-tap, glyph root (top.id='map-base') → shutDownPageContainer(1) called
 *   ROOT-2   double-tap, overlay open (top.id='some-overlay') → exit NOT fired
 *   ROOT-3   tap / scroll gestures → exit NOT fired
 *   ROOT-4   unsubscribe → subsequent double-tap does NOT call shutDown
 *   ROOT-5   shutDownPageContainer rejection is swallowed (no unhandled-rejection)
 *
 * @see packages/g2-app/src/panels/root-exit-dispatcher.ts
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-4)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer, R1Gesture } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { attachRootExit } from '../root-exit-dispatcher.js';

// ─── Shared gestures ──────────────────────────────────────────────────────────

const DOUBLE_TAP: R1Gesture = { kind: 'double-tap' };
const TAP: R1Gesture = { kind: 'tap' };
const SCROLL_UP: R1Gesture = { kind: 'scroll', direction: 'up' };
const SCROLL_DOWN: R1Gesture = { kind: 'scroll', direction: 'down' };

// ─── Mock factories ───────────────────────────────────────────────────────────

/** Build a minimal Layer with a given id. */
function makeLayer(id: string): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as Layer;
}

/**
 * Build a minimal LayerManager mock where getTopLayer returns the given value.
 */
function makeLayerManagerMock(topLayer: Layer | null): {
  getTopLayer: () => Layer | null;
} {
  return {
    getTopLayer: vi.fn().mockReturnValue(topLayer),
  };
}

/** Build a bridge mock with a spied shutDownPageContainer. */
function makeBridgeMock(result: Promise<boolean> = Promise.resolve(true)) {
  return {
    shutDownPageContainer: vi.fn().mockReturnValue(result),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachRootExit — ROOT-* dispatcher tests (260610-d42 Task 3)', () => {
  let bus: PanelGestureBus;

  beforeEach(() => {
    bus = new PanelGestureBus();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ROOT-1a: double-tap with no overlay (getTopLayer=null) → shutDownPageContainer(1) called', async () => {
    // Canvas mode: no overlay open, getTopLayer() returns null → fire exit.
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(DOUBLE_TAP);
    await Promise.resolve(); // flush microtasks for the fire-and-forget

    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(1);
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1);
  });

  it('ROOT-1b: double-tap in glyph mode with no overlay (getTopLayer=null) → shutDownPageContainer(1) called', async () => {
    // Glyph mode with no overlay: getTopLayer() returns null (map-base is NOT an
    // OverlayPanel → LayerManager.getTopLayer() skips it and returns null).
    // Root-exit must fire in this case too.
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(DOUBLE_TAP);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(1);
    expect(bridge.shutDownPageContainer).toHaveBeenCalledWith(1);
  });

  it('ROOT-2: double-tap with overlay open (top.id=some-overlay) → exit NOT fired', async () => {
    // An overlay is open — its own onEvent handles double-tap. Root-exit must not fire.
    const layerManager = makeLayerManagerMock(makeLayer('quick-action-menu'));
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(DOUBLE_TAP);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it('ROOT-3: tap gesture → exit NOT fired', async () => {
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(TAP);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it('ROOT-3: scroll up gesture → exit NOT fired', async () => {
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(SCROLL_UP);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it('ROOT-3: scroll down gesture → exit NOT fired', async () => {
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    attachRootExit(bus, layerManager, bridge);

    bus.publish(SCROLL_DOWN);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it('ROOT-4: unsubscribe → subsequent double-tap does NOT call shutDown', async () => {
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock();
    const unsubscribe = attachRootExit(bus, layerManager, bridge);

    unsubscribe();
    bus.publish(DOUBLE_TAP);
    await Promise.resolve();

    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  });

  it('ROOT-5: shutDownPageContainer rejection is swallowed — no unhandled rejection', async () => {
    const layerManager = makeLayerManagerMock(null);
    const bridge = makeBridgeMock(Promise.reject(new Error('SDK failure')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    attachRootExit(bus, layerManager, bridge);

    bus.publish(DOUBLE_TAP);
    await Promise.resolve();
    await Promise.resolve(); // two microtask yields to settle the rejection handler

    // Bridge was called
    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(1);
    // Rejection is caught and logged — no unhandled promise rejection
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[root-exit-dispatcher]'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
