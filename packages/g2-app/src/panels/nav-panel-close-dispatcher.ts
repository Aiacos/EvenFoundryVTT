/**
 * Nav-panel close dispatcher — NAV-CLOSE-01 / ADR-0012 D-3.
 *
 * Router-level bus listener that calls `panelRouter.popOverlay(layerManager)` on a
 * `double-tap` while a **nav panel** (character-sheet, combat-tracker, log, inventory,
 * spellbook and their canvas-mode counterparts) is the top z=2 layer. Implements the
 * ADR-0012 D-3 close/back gesture for nav panels, closing the debted "router closes
 * panel at bus level" stub that existed in those panels since Phase 5.
 *
 * # INV-5 exemption (same pattern as over-scroll and root-exit dispatchers)
 *
 * INV-5 states "every R1 gesture maps to exactly one PANEL handler call". This
 * dispatcher is NOT a panel — it is a router-level persistent listener that acts as
 * the gesture-bus-to-router bridge. Nav panels have a synchronous no-op `double-tap`
 * branch in their `onEvent`; this dispatcher calls `popOverlay` once. No double-action.
 *
 * The pattern is identical to `quick-action-overscroll-dispatcher` (ADR-0012 D-2) and
 * `root-exit-dispatcher` (ADR-0012 D-4). Documented here per the INV-5 rule.
 *
 * # Discrimination between nav panels and self-managing panels
 *
 * Panels that handle their own double-tap (modals, pickers, the Quick Action menu)
 * declare `readonly handlesDoubleTap = true as const` on their class. The dispatcher
 * checks `top.handlesDoubleTap === true` and returns early — avoiding a double-action
 * where both the panel's `onEvent` AND the dispatcher would fire for the same gesture.
 *
 * # Root-exit interaction
 *
 * `root-exit-dispatcher` fires `shutDownPageContainer(1)` when the top layer is the
 * bare map (`id 'map-base'`). This dispatcher fires `popOverlay` for all OTHER top
 * layers that do not self-manage double-tap. The two dispatchers are mutually exclusive
 * by their top-layer checks.
 *
 * # Canvas mode note
 *
 * In canvas mode `getTopLayer()` returns the `CanvasStatusHudLayer` when no z=2 panel
 * is mounted (it is the sole layer at z=1). That layer has no `handlesDoubleTap` field
 * and its `id` is `'canvas-status-hud'`, not `'map-base'`. The `getLayer(Z2_OVERLAY)`
 * guard (below) ensures the dispatcher only fires when a z=2 panel is actually open —
 * avoiding a spurious `popOverlay` no-op call on every double-tap at root-canvas.
 *
 * @param gestureBus   Shared in-process gesture bus.
 * @param panelRouter  PanelRouter singleton — `popOverlay(lm)` closes the top panel.
 * @param layerManager LayerManager singleton — `getLayer(Z2_OVERLAY)` + `getTopLayer()`.
 * @returns Idempotent unsubscribe closure — call in `BootEngineHandle.teardown()`.
 *
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-3)
 * @see packages/g2-app/src/panels/root-exit-dispatcher.ts (D-4 — root double-tap)
 * @see packages/g2-app/src/panels/quick-action-overscroll-dispatcher.ts (D-2 — over-scroll)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */

import type { LayerManager } from '../engine/layer-manager.js';
import type { Layer, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { PanelRouter } from '../engine/panel-router.js';

/**
 * Attach the nav-panel close dispatcher to the gesture bus.
 *
 * On `double-tap`:
 *   1. Check `layerManager.getLayer(Z2_OVERLAY)` — if nothing is mounted at z=2 → return
 *      (no panel to close; root-exit handles the bare-map case).
 *   2. Read `top = layerManager.getTopLayer()` — defensive null guard.
 *   3. If `top.handlesDoubleTap === true` → return (panel manages its own close/back).
 *   4. Otherwise: call `panelRouter.popOverlay(layerManager)` (best-effort, void-guarded).
 *
 * On any other gesture kind: return immediately.
 *
 * Returns an idempotent unsubscribe closure.
 */
export function attachNavPanelClose(
  gestureBus: PanelGestureBus,
  panelRouter: Pick<PanelRouter, 'popOverlay'>,
  layerManager: LayerManager,
): () => void {
  const handler = (gesture: R1Gesture): void => {
    if (gesture.kind !== 'double-tap') {
      return;
    }

    // Guard: only act when a z=2 panel is actually mounted.
    const z2Layer = layerManager.getLayer(ZIndex.Z2_OVERLAY);
    if (z2Layer === undefined) {
      // Nothing at z=2 — root-exit-dispatcher handles bare-root double-tap.
      return;
    }

    // Get the top layer (always the z=2 panel when one is mounted, since z=2 is
    // the highest stratum — but use getTopLayer() for future-proofing).
    const top = layerManager.getTopLayer();
    if (top === null) {
      return;
    }

    // If the panel self-manages double-tap (modal/picker/menu), skip.
    // Narrowed via the optional `handlesDoubleTap` field on OverlayPanel.
    if ((top as Layer & { handlesDoubleTap?: true }).handlesDoubleTap === true) {
      return;
    }

    // Nav panel — close it. Best-effort: a rejected popOverlay (unlikely) MUST NOT
    // propagate into the bus subscriber and crash the gesture pipeline.
    void Promise.resolve(panelRouter.popOverlay(layerManager)).catch((err: unknown) => {
      console.warn('[nav-panel-close-dispatcher] popOverlay failed', err);
    });
  };

  // Persistent subscription — lives for the full app boot lifetime until teardown.
  return gestureBus.subscribe(handler);
}
