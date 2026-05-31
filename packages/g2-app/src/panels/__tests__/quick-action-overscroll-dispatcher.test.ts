/**
 * Unit tests for `attachQuickActionOverscroll` dispatcher (QALPD-* markers).
 *
 * Verifies INV-5 architectural enforcement: the dispatcher is a router-level bus
 * subscriber (NOT a panel) that triggers `pushOverlay` on an OVER-SCROLL — a swipe-up
 * (`{ kind: 'scroll', direction: 'up' }`) while the top layer is already at its top
 * boundary (`layer.isAtTopBoundary?.() ?? true`) and is not the QuickActionMenuPanel
 * itself. Replaces the retired long-press invocation (ADR-0012 D-2).
 *
 * INV-5 note: the dispatcher subscribes persistently to the bus (unlike panels which
 * subscribe in `onMount`). This is intentional — the dispatcher must hear the over-scroll
 * from ANY active panel. The SEMANTIC INV-5 rule is "exactly one PANEL handler call";
 * the dispatcher is not a panel, it is a router-level listener that triggers a panel
 * mount. At the top boundary the panel's own scroll-up handler is a clamped no-op while
 * the dispatcher mounts the menu — no double-action. The distinction is documented in
 * the dispatcher's JSDoc.
 *
 * Tests (QALPD-* discriminator markers):
 *   QALPD-01  over-scroll while non-menu OverlayPanel (at top boundary) is top → pushOverlay called
 *   QALPD-02  over-scroll when NO panel at z=2 (null top) → pushOverlay called (menu over main HUD)
 *   QALPD-03  over-scroll when QuickActionMenuPanel is top → pushOverlay NOT called
 *   QALPD-04  other gestures (tap, scroll-down, double-tap) → pushOverlay NOT called
 *   QALPD-04b scroll-up when NOT at top boundary → pushOverlay NOT called (ordinary scroll)
 *   QALPD-05  conc-drop-modal edge case → console.warn + pushOverlay called (ck-13)
 *   QALPD-06  unsubscribe → subsequent over-scroll does NOT trigger pushOverlay
 *
 * @see packages/g2-app/src/panels/quick-action-overscroll-dispatcher.ts
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3
 * @see Specs.md §7.14.4 ck 7 + ck 13
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-2)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayPanel, R1Gesture } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { attachQuickActionOverscroll } from '../quick-action-overscroll-dispatcher.js';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

/**
 * Minimal mock layer with a given id — simulates any mounted layer.
 *
 * @param id            Layer id (drives short-circuit / conc-modal branches).
 * @param atTopBoundary Optional `isAtTopBoundary()` return. When omitted, the
 *                      layer exposes NO `isAtTopBoundary` method, so the
 *                      dispatcher's `?? true` default treats it as over-scrollable
 *                      (mirrors non-scrolling layers).
 */
function makeMockLayer(id: string, atTopBoundary?: boolean): OverlayPanel {
  const layer: Record<string, unknown> = {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    getContainerCount: vi.fn().mockReturnValue({ image: 0, text: 1 }),
  };
  if (atTopBoundary !== undefined) {
    layer.isAtTopBoundary = vi.fn(() => atTopBoundary);
  }
  return layer as unknown as OverlayPanel;
}

/** Mock LayerManager with configurable `getTopLayer()` return value. */
function makeMockLayerManager(topLayer: OverlayPanel | null = null) {
  return {
    getTopLayer: vi.fn(() => topLayer),
    getLayer: vi.fn(() => undefined),
    bundle: vi.fn().mockResolvedValue(undefined),
  };
}

/** Mock PanelRouter — tracks pushOverlay calls. */
function makeMockRouter() {
  return {
    pushOverlay: vi.fn().mockResolvedValue(undefined),
    popOverlay: vi.fn().mockResolvedValue(undefined),
    openPanel: vi.fn().mockResolvedValue(undefined),
    overlayStack: [] as OverlayPanel[],
  };
}

/** Dummy QuickActionMenuPanel factory — returns a layer with id 'quick-action-menu'. */
function makeMenu(): OverlayPanel {
  return makeMockLayer('quick-action-menu');
}

/** Publish a gesture directly to the bus (test-only shorthand). */
function simulateGesture(bus: PanelGestureBus, gesture: R1Gesture): void {
  bus.publish(gesture);
}

/** Convenience: publish an over-scroll (swipe-up) gesture. */
function simulateOverscroll(bus: PanelGestureBus): void {
  simulateGesture(bus, { kind: 'scroll', direction: 'up' });
}

// ─── QALPD-* tests ────────────────────────────────────────────────────────────

describe('attachQuickActionOverscroll dispatcher (QALPD-*)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /**
   * QALPD-01: over-scroll while a non-menu OverlayPanel (at top boundary) is top →
   * pushOverlay called.
   *
   * Maps to Specs §7.14.4 ck 7 — over-scroll from CharacterSheet opens Quick Action menu.
   */
  it('QALPD-01: over-scroll with non-menu panel at top boundary → pushOverlay called once', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet', true);
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);
    simulateOverscroll(bus);

    // pushOverlay must have been called with the menu + layerManager
    expect(router.pushOverlay).toHaveBeenCalledOnce();
    const [calledPanel] = router.pushOverlay.mock.calls[0] ?? [];
    expect((calledPanel as OverlayPanel | undefined)?.id).toBe('quick-action-menu');

    unsub();
  });

  /**
   * QALPD-02: over-scroll when NO panel at z=2 → pushOverlay called (menu over main HUD).
   *
   * The dispatcher does not require a panel at z=2 — over-scroll from main HUD (null top)
   * is a valid trigger (the `?? true` boundary default applies). The dispatcher opens the
   * menu over the main HUD state.
   */
  it('QALPD-02: over-scroll when getTopLayer() returns null → pushOverlay called', () => {
    const bus = new PanelGestureBus();
    const lm = makeMockLayerManager(null); // no overlay mounted
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);
    simulateOverscroll(bus);

    expect(router.pushOverlay).toHaveBeenCalledOnce();

    unsub();
  });

  /**
   * QALPD-03: over-scroll when QuickActionMenuPanel is already top → pushOverlay NOT called.
   *
   * The menu handles its own navigation. The dispatcher must short-circuit to avoid
   * nested menu recursion.
   *
   * Maps to Specs §7.14.4 ck 7 implicit: menu open = no-op for the dispatcher.
   */
  it('QALPD-03: over-scroll when top is quick-action-menu → pushOverlay NOT called', () => {
    const bus = new PanelGestureBus();
    const menuLayer = makeMockLayer('quick-action-menu', true);
    const lm = makeMockLayerManager(menuLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);
    simulateOverscroll(bus);

    expect(router.pushOverlay).not.toHaveBeenCalled();

    unsub();
  });

  /**
   * QALPD-04: other gestures (tap, scroll-down, double-tap) → pushOverlay NOT triggered.
   *
   * The dispatcher fires only on an over-scroll (swipe-up). It must ignore all other
   * gesture kinds to preserve INV-5 "exactly one panel handler" semantics.
   */
  it('QALPD-04: tap / scroll-down / double-tap → pushOverlay NOT called', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet', true);
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);

    simulateGesture(bus, { kind: 'tap' });
    simulateGesture(bus, { kind: 'scroll', direction: 'down' });
    simulateGesture(bus, { kind: 'double-tap' });

    expect(router.pushOverlay).not.toHaveBeenCalled();

    unsub();
  });

  /**
   * QALPD-04b: scroll-up when the top layer is NOT at its top boundary → pushOverlay
   * NOT called. This is an ordinary scroll-up (the panel handles it); only an
   * over-scroll (swipe-up AT the top boundary) opens the menu.
   */
  it('QALPD-04b: scroll-up when NOT at top boundary → pushOverlay NOT called', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet', false); // mid-scroll
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);
    simulateOverscroll(bus);

    expect(router.pushOverlay).not.toHaveBeenCalled();

    unsub();
  });

  /**
   * QALPD-05: conc-drop-modal active → console.warn + pushOverlay called.
   *
   * Maps to Specs §7.14.4 ck 13 implicit semantics: the concentration-drop modal
   * is NOT in the overlayStack (it was mounted directly via dispatcher, not via
   * pushOverlay). When over-scroll fires, the dispatcher replaces the modal with the
   * menu and logs a telemetry warning. The user's conc-modal interaction is lost
   * (documented edge case — MVP acceptable per threat model T-06-04-04).
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   */
  it('QALPD-05: conc-drop-modal active → console.warn telemetry + pushOverlay called (ck-13 edge)', () => {
    const bus = new PanelGestureBus();
    // conc-drop-modal is non-scrolling → omits isAtTopBoundary (defaults to true).
    const concModal = makeMockLayer('conc-drop-modal');
    const lm = makeMockLayerManager(concModal);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);
    simulateOverscroll(bus);

    // Telemetry must be emitted
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnCall = warnSpy.mock.calls[0]?.[0] as string | undefined;
    expect(typeof warnCall).toBe('string');
    expect(warnCall).toContain('conc-modal');

    // pushOverlay must still be called (menu replaces modal)
    expect(router.pushOverlay).toHaveBeenCalledOnce();

    unsub();
  });

  /**
   * QALPD-06: unsubscribe detaches the bus handler — subsequent over-scroll is a no-op.
   *
   * Verifies the returned closure properly removes the subscriber so teardown
   * propagates correctly from `BootEngineHandle.teardown()` (BERW-05).
   *
   * @see packages/g2-app/src/internal/boot-engine-core.ts teardown
   */
  it('QALPD-06: after unsub(), over-scroll does NOT trigger pushOverlay', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet', true);
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionOverscroll(bus, router, lm as never, makeMenu);

    // First call should work
    simulateOverscroll(bus);
    expect(router.pushOverlay).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsub();

    // Subsequent call must be a no-op
    simulateOverscroll(bus);
    expect(router.pushOverlay).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});
