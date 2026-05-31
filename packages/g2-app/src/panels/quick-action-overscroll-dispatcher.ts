/**
 * Quick Action over-scroll dispatcher — router-level bus listener that triggers
 * `PanelRouter.pushOverlay(QuickActionMenuPanel)` on an OVER-SCROLL: a swipe-up
 * (`{ kind: 'scroll', direction: 'up' }`) while the focused layer is already at its
 * top boundary (`layer.isAtTopBoundary?.() ?? true`). Replaces the retired long-press
 * invocation (ADR-0012 D-2).
 *
 * **Architectural distinction from INV-5:**
 * INV-5 states "every R1 gesture maps to exactly one PANEL handler call". The
 * dispatcher is NOT a panel — it is a router-level listener that acts as the
 * gesture-bus-to-router bridge. Its job is to trigger a panel MOUNT on over-scroll,
 * not to semantically handle the gesture payload itself. No double-action arises:
 * at the top boundary the focused layer's own `scroll-up` handler is a clamped
 * no-op, while the dispatcher mounts the menu.
 *
 * The dispatcher subscribes PERSISTENTLY to the bus (unlike panels which subscribe
 * in `onMount`). This is intentional: it must hear the over-scroll from ANY active
 * panel regardless of which panel is currently on top. The persistent subscription is
 * called ONCE from `boot-engine-core.ts` step 11b and torn down via the returned
 * unsubscribe closure in `BootEngineHandle.teardown()`.
 *
 * **Why free-standing (not inside PanelRouter)?**
 * Free-standing keeps PanelRouter pure — it does not need to know about the gesture
 * bus. The dispatcher is an application-level glue layer between the bus and the
 * router. PanelRouter only exposes `pushOverlay(panel, lm)`.
 *
 * **Threat model (T-06-04-01):** `attachQuickActionOverscroll` is called EXACTLY ONCE
 * in `boot-engine-core.ts` step 11b. Idempotent unsubscribe + teardown closes it on
 * app shutdown. BERW-05 verifies.
 *
 * **Threat model (T-06-04-02):** The dispatcher short-circuits when the top layer is
 * already the QuickActionMenuPanel (QALPD-03 verifies). Over-scroll flooding while the
 * menu is open produces no additional pushOverlay calls.
 *
 * **Conc-modal edge case (ck-13, T-06-04-04):** When the concentration-drop modal is
 * the active top layer, the dispatcher replaces it with the Quick Action menu. The
 * modal's state is lost — the user must restart the conc-drop flow after closing the
 * menu. This is the MVP-accepted behaviour per Specs §7.14.4 ck 13 implicit semantics.
 * A `console.warn` telemetry entry is emitted for observability.
 *
 * @param gestureBus   Shared in-process gesture bus (Phase 4b/5 panels subscribe)
 * @param panelRouter  PanelRouter singleton — `pushOverlay(menu, lm)` opens the menu
 * @param layerManager LayerManager singleton — passed to `pushOverlay` + used for
 *                     `getTopLayer()` to read the boundary + short-circuit.
 *                     Must be the full `LayerManager` (not a narrowed Pick) so
 *                     that `pushOverlay(menu, layerManager)` type-checks without
 *                     unsafe casts (WR-02 fix).
 * @param makeMenu     Factory closure that constructs a new `QuickActionMenuPanel`
 *                     with the current locale + callbacks at call time. The factory
 *                     pattern is used because the panel needs boot-time locale and
 *                     router callbacks which the dispatcher does not own.
 * @returns Idempotent unsubscribe closure — call in `BootEngineHandle.teardown()`.
 *
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-2)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
 * @see Specs.md §7.14.4 (over-scroll → menu) + ck 13 (conc-modal edge)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 * @see packages/g2-app/src/internal/boot-engine-core.ts step 11b
 */

import type { LayerManager } from '../engine/layer-manager.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelRouter } from '../engine/panel-router.js';

/**
 * Attach the Quick-Action over-scroll dispatcher to the gesture bus.
 *
 * The dispatcher subscribes a handler that fires on every gesture published to
 * the bus. On an OVER-SCROLL (`scroll` direction `up` while the top layer reports
 * `isAtTopBoundary?.() ?? true`):
 *
 *   1. `layerManager.getTopLayer()` — returns the highest-z mounted layer.
 *   2. If the layer is NOT at its top boundary → return (it's an ordinary scroll-up;
 *      the panel handles it).
 *   3. If `top.id === 'quick-action-menu'` → return (menu handles its own navigation).
 *   4. If `top.id === 'conc-drop-modal'` → emit `console.warn` telemetry (ck-13 edge)
 *      then proceed to mount the menu (modal state is lost — documented MVP edge).
 *   5. Call `makeMenu()` to construct a fresh `QuickActionMenuPanel` instance.
 *   6. `panelRouter.pushOverlay(menu, layerManager)` — suspends the active panel
 *      (if any) and atomically mounts the menu via LayerManager.bundle.
 *
 * On any other gesture kind (tap, double-tap, scroll-down, or scroll-up when NOT at
 * the top boundary): return immediately (no side effects).
 *
 * Returns an idempotent unsubscribe closure. Calling it more than once is safe.
 */
export function attachQuickActionOverscroll(
  gestureBus: PanelGestureBus,
  panelRouter: Pick<PanelRouter, 'pushOverlay'>,
  // WR-02 fix: accept full LayerManager (not Pick<…, 'getTopLayer'>) so that
  // pushOverlay can receive it without a type-unsafe cast. The narrowed Pick
  // was structurally incompatible with PanelRouter.pushOverlay's LayerManager
  // parameter, forcing the previous 'as never' double-cast that silently masked
  // any future LayerManager API additions.
  layerManager: LayerManager,
  makeMenu: () => OverlayPanel,
): () => void {
  const handler = (gesture: R1Gesture): void => {
    // Only act on an over-scroll: swipe-up at the focused layer's top boundary.
    // Tap / double-tap / scroll-down are ignored here.
    if (gesture.kind !== 'scroll' || gesture.direction !== 'up') {
      return;
    }

    const top = layerManager.getTopLayer();

    // Boundary gate: only a swipe-up while ALREADY at the top is an over-scroll.
    // Non-scrolling layers (bare map, single-screen modals) omit the method ⇒ `?? true`.
    if (top !== null && (top.isAtTopBoundary?.() ?? true) === false) {
      return;
    }

    // Short-circuit: menu is already open — the panel's own onEvent handles navigation.
    if (top !== null && top.id === 'quick-action-menu') {
      return;
    }

    // Conc-modal edge case (ck-13): modal is not in the overlayStack (it was mounted
    // directly by the conc-conflict-dispatcher). Replacing it loses the user's
    // pending concentration choice. Emit telemetry and proceed — this is the
    // MVP-accepted behaviour per Specs §7.14.4 ck 13 + T-06-04-04 threat model.
    if (top !== null && top.id === 'conc-drop-modal') {
      console.warn(
        '[quick-action-dispatcher] conc-modal active — replacing modal with menu (ck-13 edge)',
      );
    }

    // Construct and push the menu overlay.
    const menu = makeMenu();
    void panelRouter.pushOverlay(menu, layerManager);
  };

  // Persistent subscription — lives for the full app boot lifetime until teardown.
  const unsub = gestureBus.subscribe(handler);

  // Return idempotent unsubscribe (the bus closure is already idempotent).
  return unsub;
}
