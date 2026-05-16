/**
 * Unit tests for `attachQuickActionLongPress` dispatcher (QALPD-* markers).
 *
 * Verifies INV-5 architectural enforcement: the dispatcher is a router-level bus
 * subscriber (NOT a panel) that triggers `pushOverlay` when a `long-press` gesture
 * arrives and the top layer is not the QuickActionMenuPanel itself.
 *
 * INV-5 note: the dispatcher subscribes persistently to the bus (unlike panels which
 * subscribe in `onMount`). This is intentional — the dispatcher must hear long-press
 * from ANY active panel. The SEMANTIC INV-5 rule is "exactly one PANEL handler call";
 * the dispatcher is not a panel, it is a router-level listener that triggers a panel
 * mount. The distinction is documented in the dispatcher's JSDoc.
 *
 * Tests (QALPD-* discriminator markers):
 *   QALPD-01  long-press while non-menu OverlayPanel is top → pushOverlay called
 *   QALPD-02  long-press when NO panel at z=2 → pushOverlay called (menu over main HUD)
 *   QALPD-03  long-press when QuickActionMenuPanel is top → pushOverlay NOT called
 *   QALPD-04  other gestures (tap, scroll, double-tap) → pushOverlay NOT called
 *   QALPD-05  conc-drop-modal edge case → console.warn + pushOverlay called (ck-13)
 *   QALPD-06  unsubscribe → subsequent long-press does NOT trigger pushOverlay
 *
 * @see packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3
 * @see Specs.md §7.14.4 ck 7 + ck 13
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayPanel, R1Gesture } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { attachQuickActionLongPress } from '../quick-action-long-press-dispatcher.js';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

/** Minimal mock layer with a given id — simulates any mounted layer. */
function makeMockLayer(id: string): OverlayPanel {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    getContainerCount: vi.fn().mockReturnValue({ image: 0, text: 1 }),
  } as unknown as OverlayPanel;
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
function simulateGesture(
  bus: PanelGestureBus,
  kind: 'tap' | 'scroll' | 'long-press' | 'double-tap',
): void {
  const gesture: R1Gesture =
    kind === 'scroll' ? { kind: 'scroll', direction: 'up' } : ({ kind } as R1Gesture);
  bus.publish(gesture);
}

// ─── QALPD-* tests ────────────────────────────────────────────────────────────

describe('attachQuickActionLongPress dispatcher (QALPD-*)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  /**
   * QALPD-01: long-press while a non-menu OverlayPanel is top → pushOverlay called.
   *
   * Maps to Specs §7.14.4 ck 7 — long-press from CharacterSheet opens Quick Action menu.
   */
  it('QALPD-01: long-press with non-menu panel as top → pushOverlay called once', async () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet');
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);
    simulateGesture(bus, 'long-press');

    // pushOverlay must have been called with the menu + layerManager
    expect(router.pushOverlay).toHaveBeenCalledOnce();
    const [calledPanel] = router.pushOverlay.mock.calls[0] ?? [];
    expect((calledPanel as OverlayPanel | undefined)?.id).toBe('quick-action-menu');

    unsub();
  });

  /**
   * QALPD-02: long-press when NO panel at z=2 → pushOverlay called (menu over main HUD).
   *
   * The dispatcher does not require a panel at z=2 — long-press from main HUD (null top)
   * is a valid trigger. The dispatcher opens the menu over the main HUD state.
   * (Note: `getTopLayer()` returns null when no OverlayPanel is mounted; the
   * differential demolish auto-handles z=0.5 via the bundle.)
   */
  it('QALPD-02: long-press when getTopLayer() returns null → pushOverlay called', async () => {
    const bus = new PanelGestureBus();
    const lm = makeMockLayerManager(null); // no overlay mounted
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);
    simulateGesture(bus, 'long-press');

    expect(router.pushOverlay).toHaveBeenCalledOnce();

    unsub();
  });

  /**
   * QALPD-03: long-press when QuickActionMenuPanel is already top → pushOverlay NOT called.
   *
   * The menu handles its own long-press (cancel → close). The dispatcher must
   * short-circuit to avoid nested menu recursion.
   *
   * Maps to Specs §7.14.4 ck 7 implicit: menu open = no-op for the dispatcher.
   */
  it('QALPD-03: long-press when top is quick-action-menu → pushOverlay NOT called', () => {
    const bus = new PanelGestureBus();
    const menuLayer = makeMockLayer('quick-action-menu');
    const lm = makeMockLayerManager(menuLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);
    simulateGesture(bus, 'long-press');

    expect(router.pushOverlay).not.toHaveBeenCalled();

    unsub();
  });

  /**
   * QALPD-04: other gestures (tap, scroll, double-tap) → pushOverlay NOT triggered.
   *
   * The dispatcher is purely a long-press dispatcher — it must ignore all other
   * gesture kinds to preserve INV-5 "exactly one panel handler" semantics.
   */
  it('QALPD-04: tap / scroll / double-tap → pushOverlay NOT called', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet');
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);

    simulateGesture(bus, 'tap');
    simulateGesture(bus, 'scroll');
    simulateGesture(bus, 'double-tap');

    expect(router.pushOverlay).not.toHaveBeenCalled();

    unsub();
  });

  /**
   * QALPD-05: conc-drop-modal active → console.warn + pushOverlay called.
   *
   * Maps to Specs §7.14.4 ck 13 implicit semantics: the concentration-drop modal
   * is NOT in the overlayStack (it was mounted directly via dispatcher, not via
   * pushOverlay). When long-press fires, the dispatcher replaces the modal with the
   * menu and logs a telemetry warning. The user's conc-modal interaction is lost
   * (documented edge case — MVP acceptable per threat model T-06-04-04).
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   */
  it('QALPD-05: conc-drop-modal active → console.warn telemetry + pushOverlay called (ck-13 edge)', () => {
    const bus = new PanelGestureBus();
    const concModal = makeMockLayer('conc-drop-modal');
    const lm = makeMockLayerManager(concModal);
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);
    simulateGesture(bus, 'long-press');

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
   * QALPD-06: unsubscribe detaches the bus handler — subsequent long-press is a no-op.
   *
   * Verifies the returned closure properly removes the subscriber so teardown
   * propagates correctly from `BootEngineHandle.teardown()` (BERW-05).
   *
   * @see packages/g2-app/src/internal/boot-engine-core.ts teardown
   */
  it('QALPD-06: after unsub(), long-press does NOT trigger pushOverlay', () => {
    const bus = new PanelGestureBus();
    const sheetLayer = makeMockLayer('character-sheet');
    const lm = makeMockLayerManager(sheetLayer);
    const router = makeMockRouter();

    const unsub = attachQuickActionLongPress(bus, router as never, lm as never, makeMenu);

    // First call should work
    simulateGesture(bus, 'long-press');
    expect(router.pushOverlay).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsub();

    // Subsequent call must be a no-op
    simulateGesture(bus, 'long-press');
    expect(router.pushOverlay).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});
