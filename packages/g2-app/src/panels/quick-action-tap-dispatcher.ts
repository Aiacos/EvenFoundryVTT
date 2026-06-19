/**
 * Quick Action tap dispatcher — router-level bus listener that opens the Quick
 * Action menu on a TAP from the BASE view (ADR-0012 Amendment 2).
 *
 * Replaces the previous over-scroll (swipe-up) invocation: the menu now opens
 * with a single tap while NO z=2 overlay is active (i.e. on the map / status-HUD
 * base view). When a panel or modal IS active (the LayerManager z=2 slot is
 * occupied), the tap is left to that panel's own handler — in the interactive Inventario /
 * Libro / Skill panels a tap ACTIVATES the highlighted entry, in the character
 * sheet it cycles the tab, etc. This makes the two semantics non-conflicting:
 * tap = "primary action in the current context" (open menu on base, activate in
 * a panel).
 *
 * **Architectural distinction from INV-5:** INV-5 states "every R1 gesture maps
 * to exactly one PANEL handler call". The dispatcher is NOT a panel — it is a
 * router-level listener (gesture-bus → router bridge) that triggers a panel MOUNT.
 * No double-action arises: on the base view no panel consumes the tap, so only the
 * dispatcher acts; when an overlay is active the dispatcher is inert (the gate
 * below) and the panel's own tap handler runs.
 *
 * The dispatcher subscribes PERSISTENTLY (unlike panels which subscribe in
 * `onMount`): it must hear the tap regardless of which base layer is on top. It is
 * attached ONCE from `boot-engine-core.ts` and torn down via the returned
 * unsubscribe in `BootEngineHandle.teardown()` (idempotent — T-06-04-01).
 *
 * @param gestureBus   Shared in-process gesture bus.
 * @param panelRouter  PanelRouter — `pushOverlay` mounts the menu.
 * @param layerManager LayerManager — `getLayer(Z2_OVERLAY)` gates the tap (base
 *                     view only) and is passed to `pushOverlay`.
 * @param makeMenu     Factory that constructs a fresh `QuickActionMenuPanel` with the
 *                     current locale + callbacks at call time.
 * @returns Idempotent unsubscribe closure — call in `BootEngineHandle.teardown()`.
 *
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (Amendment 2)
 * @see packages/g2-app/src/engine/panel-router.ts (hasActiveOverlay)
 * @see packages/g2-app/src/internal/boot-engine-core.ts
 */

import type { LayerManager } from '../engine/layer-manager.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelRouter } from '../engine/panel-router.js';

/**
 * Attach the Quick-Action tap dispatcher to the gesture bus.
 *
 * On a `tap` while the LayerManager z=2 overlay slot is empty (base view), it
 * constructs a fresh menu via `makeMenu()` and `pushOverlay`s it. On any other
 * gesture, or when a z=2 overlay is already mounted, it returns immediately (the
 * active panel's own handler — if any — runs instead).
 *
 * Returns an idempotent unsubscribe closure.
 */
export function attachQuickActionTap(
  gestureBus: PanelGestureBus,
  panelRouter: Pick<PanelRouter, 'pushOverlay'>,
  layerManager: LayerManager,
  makeMenu: () => OverlayPanel,
): () => void {
  const handler = (gesture: R1Gesture): void => {
    // Only a tap opens the menu (ADR-0012 Amendment 2 — swipe-up no longer used).
    if (gesture.kind !== 'tap') {
      return;
    }

    // Gate: open the menu ONLY from the base view — i.e. when the z=2 overlay slot
    // is empty. Checking the LayerManager slot (not just router state) also covers
    // overlays mounted DIRECTLY on the LayerManager (e.g. the concentration-drop
    // modal), so the tap belongs to that overlay (activate entry / cycle tab /
    // confirm / drop-concentration) and the dispatcher stays inert — no double-action.
    if (layerManager.getLayer(ZIndex.Z2_OVERLAY) !== undefined) {
      return;
    }

    const menu = makeMenu();
    void panelRouter.pushOverlay(menu, layerManager);
  };

  // Persistent subscription for the full app boot lifetime until teardown.
  return gestureBus.subscribe(handler);
}
