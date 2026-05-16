/**
 * Quick Action long-press dispatcher — router-level bus listener that triggers
 * `PanelRouter.pushOverlay(QuickActionMenuPanel)` when a `long-press` gesture
 * arrives from any active panel.
 *
 * **Architectural distinction from INV-5:**
 * INV-5 states "every R1 gesture maps to exactly one PANEL handler call". The
 * dispatcher is NOT a panel — it is a router-level listener that acts as the
 * gesture-bus-to-router bridge. Its job is to trigger a panel MOUNT in response
 * to a long-press, not to semantically handle the gesture payload itself.
 *
 * The dispatcher subscribes PERSISTENTLY to the bus (unlike panels which subscribe
 * in `onMount`). This is intentional: it must hear long-press from ANY active panel
 * regardless of which panel is currently on top. The persistent subscription is
 * called ONCE from `boot-engine-core.ts` step 11b and torn down via the returned
 * unsubscribe closure in `BootEngineHandle.teardown()`.
 *
 * **Why free-standing (not inside PanelRouter)?**
 * Free-standing keeps PanelRouter pure — it does not need to know about the gesture
 * bus. The dispatcher is an application-level glue layer between the bus and the
 * router. PanelRouter only exposes `pushOverlay(panel, lm)`.
 *
 * **Threat model (T-06-04-01):** `attachQuickActionLongPress` is called EXACTLY ONCE
 * in `boot-engine-core.ts` step 11b. Idempotent unsubscribe + teardown closes it on
 * app shutdown. BERW-05 verifies.
 *
 * **Threat model (T-06-04-02):** The dispatcher short-circuits when the top layer is
 * already the QuickActionMenuPanel (QALPD-03 verifies). Hardware long-press flooding
 * while the menu is open produces no additional pushOverlay calls.
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
 *                     `getTopLayer()` to determine whether to short-circuit.
 *                     Must be the full `LayerManager` (not a narrowed Pick) so
 *                     that `pushOverlay(menu, layerManager)` type-checks without
 *                     unsafe casts (WR-02 fix).
 * @param makeMenu     Factory closure that constructs a new `QuickActionMenuPanel`
 *                     with the current locale + callbacks at call time. The factory
 *                     pattern is used because the panel needs boot-time locale and
 *                     router callbacks which the dispatcher does not own.
 * @returns Idempotent unsubscribe closure — call in `BootEngineHandle.teardown()`.
 *
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q3 (suspension)
 * @see Specs.md §7.14.4 ck 7 (long-press → menu) + ck 13 (conc-modal edge)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 * @see packages/g2-app/src/internal/boot-engine-core.ts step 11b
 */

import type { LayerManager } from '../engine/layer-manager.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelRouter } from '../engine/panel-router.js';

/**
 * Attach the long-press dispatcher to the gesture bus.
 *
 * The dispatcher subscribes a handler that fires on every gesture published to
 * the bus. On `long-press`:
 *
 *   1. `layerManager.getTopLayer()` — returns the highest-z mounted OverlayPanel.
 *   2. If `top.id === 'quick-action-menu'` → return (menu handles its own cancel).
 *   3. If `top.id === 'conc-drop-modal'` → emit `console.warn` telemetry (ck-13 edge)
 *      then proceed to mount the menu (modal state is lost — documented MVP edge).
 *   4. Call `makeMenu()` to construct a fresh `QuickActionMenuPanel` instance.
 *   5. `panelRouter.pushOverlay(menu, layerManager)` — suspends the active panel
 *      (if any) and atomically mounts the menu via LayerManager.bundle.
 *
 * On any other gesture kind: return immediately (no side effects).
 *
 * Returns an idempotent unsubscribe closure. Calling it more than once is safe.
 */
export function attachQuickActionLongPress(
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
    // Only act on long-press — ignore tap, scroll, double-tap.
    if (gesture.kind !== 'long-press') {
      return;
    }

    const top = layerManager.getTopLayer();

    // Short-circuit: menu is already open — the panel's own onEvent handles cancel.
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
