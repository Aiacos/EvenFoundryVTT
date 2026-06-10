/**
 * Unit tests for `attachNavPanelClose` dispatcher (NAVCD-* markers).
 *
 * Verifies ADR-0012 D-3: double-tap while a nav panel is the top z=2 layer calls
 * `panelRouter.popOverlay(layerManager)`. Panels that self-manage double-tap
 * (declare `handlesDoubleTap: true`) are skipped. When no z=2 panel is mounted
 * the dispatcher is a no-op.
 *
 * Tests:
 *   NAVCD-01  double-tap, z=2 nav panel (no handlesDoubleTap) → popOverlay called
 *   NAVCD-02  double-tap, z=2 panel with handlesDoubleTap=true → popOverlay NOT called
 *   NAVCD-03  double-tap, nothing at z=2 → popOverlay NOT called
 *   NAVCD-04  tap / scroll gestures → popOverlay NOT called
 *   NAVCD-05  unsubscribe → subsequent double-tap does NOT call popOverlay
 *   NAVCD-06  popOverlay rejection is swallowed (no unhandled-rejection propagation)
 *   NAVCD-07  double-tap, z=2 nav panel, getTopLayer returns null → popOverlay NOT called
 *
 * @see packages/g2-app/src/panels/nav-panel-close-dispatcher.ts
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-3)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer, OverlayPanel, R1Gesture } from '../../engine/layer-types.js';
import { ZIndex } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { attachNavPanelClose } from '../nav-panel-close-dispatcher.js';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

/**
 * Minimal mock OverlayPanel. When `handlesDoubleTap` is true the panel declares
 * it self-manages double-tap and the dispatcher must skip it.
 */
function makeMockPanel(id: string, handlesDoubleTap?: true): OverlayPanel {
  const panel: Record<string, unknown> = {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    getContainerCount: vi.fn().mockReturnValue({ image: 0, text: 1 }),
  };
  if (handlesDoubleTap) {
    panel.handlesDoubleTap = true as const;
  }
  return panel as unknown as OverlayPanel;
}

/**
 * Minimal LayerManager mock with configurable z=2 and getTopLayer returns.
 */
function makeLayerManagerMock(
  z2Layer: Layer | undefined,
  topLayer: Layer | null,
): {
  getLayer: (z: ZIndex) => Layer | undefined;
  getTopLayer: () => Layer | null;
} {
  return {
    getLayer: vi
      .fn()
      .mockImplementation((z: ZIndex) => (z === ZIndex.Z2_OVERLAY ? z2Layer : undefined)),
    getTopLayer: vi.fn().mockReturnValue(topLayer),
  };
}

/**
 * Minimal PanelRouter mock with a spied `popOverlay`.
 */
function makePanelRouterMock(popOverlayResult: Promise<void> = Promise.resolve()) {
  return {
    popOverlay: vi.fn().mockReturnValue(popOverlayResult),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOUBLE_TAP: R1Gesture = { kind: 'double-tap' };
const TAP: R1Gesture = { kind: 'tap' };
const SCROLL_UP: R1Gesture = { kind: 'scroll', direction: 'up' };
const SCROLL_DOWN: R1Gesture = { kind: 'scroll', direction: 'down' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachNavPanelClose', () => {
  let bus: PanelGestureBus;
  let unsubscribe: () => void;

  beforeEach(() => {
    bus = new PanelGestureBus();
  });

  afterEach(() => {
    unsubscribe?.();
    vi.restoreAllMocks();
  });

  it('NAVCD-01 — double-tap on nav panel (no handlesDoubleTap) calls popOverlay', async () => {
    const navPanel = makeMockPanel('character-sheet');
    const lm = makeLayerManagerMock(navPanel, navPanel);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);
    await Promise.resolve(); // flush microtask for void promise

    expect(router.popOverlay).toHaveBeenCalledOnce();
    expect(router.popOverlay).toHaveBeenCalledWith(lm);
  });

  it('NAVCD-02 — double-tap on panel with handlesDoubleTap=true skips popOverlay', () => {
    const modal = makeMockPanel('quick-action-menu', true);
    const lm = makeLayerManagerMock(modal, modal);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });

  it('NAVCD-03 — double-tap when nothing at z=2 does not call popOverlay', () => {
    const lm = makeLayerManagerMock(undefined, null);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });

  it('NAVCD-04 — tap and scroll gestures do not call popOverlay', () => {
    const navPanel = makeMockPanel('combat-tracker');
    const lm = makeLayerManagerMock(navPanel, navPanel);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(TAP);
    bus.publish(SCROLL_UP);
    bus.publish(SCROLL_DOWN);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });

  it('NAVCD-05 — unsubscribe stops the dispatcher from firing', () => {
    const navPanel = makeMockPanel('spellbook');
    const lm = makeLayerManagerMock(navPanel, navPanel);
    const router = makePanelRouterMock();

    const unsub = attachNavPanelClose(bus, router, lm as never);
    unsubscribe = () => {}; // already called below
    unsub();
    bus.publish(DOUBLE_TAP);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });

  it('NAVCD-06 — popOverlay rejection is swallowed without unhandled-rejection', async () => {
    const navPanel = makeMockPanel('inventory');
    const lm = makeLayerManagerMock(navPanel, navPanel);
    const rejection = Promise.reject(new Error('simulated popOverlay failure'));
    const router = makePanelRouterMock(rejection);

    unsubscribe = attachNavPanelClose(bus, router, lm as never);

    // Should not throw — rejection is caught by the dispatcher.
    expect(() => bus.publish(DOUBLE_TAP)).not.toThrow();

    // Suppress the unhandled-rejection warning in the test output by awaiting.
    await rejection.catch(() => {
      /* expected */
    });
  });

  it('NAVCD-07 — getTopLayer returns null when z=2 has a layer → popOverlay NOT called', () => {
    // Edge case: z=2 layer exists but getTopLayer returns null (should not happen
    // in practice, but the dispatcher must be defensive).
    const navPanel = makeMockPanel('log');
    const lm = makeLayerManagerMock(navPanel, null);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });

  it('NAVCD-01b — canvas nav panel (canvas-character-sheet) also closes via popOverlay', async () => {
    const canvasPanel = makeMockPanel('canvas-character-sheet');
    const lm = makeLayerManagerMock(canvasPanel, canvasPanel);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);
    await Promise.resolve();

    expect(router.popOverlay).toHaveBeenCalledOnce();
  });

  it('NAVCD-02b — conc-drop-modal (handlesDoubleTap=true) is not closed by dispatcher', () => {
    const modal = makeMockPanel('conc-drop-modal', true);
    const lm = makeLayerManagerMock(modal, modal);
    const router = makePanelRouterMock();

    unsubscribe = attachNavPanelClose(bus, router, lm as never);
    bus.publish(DOUBLE_TAP);

    expect(router.popOverlay).not.toHaveBeenCalled();
  });
});
