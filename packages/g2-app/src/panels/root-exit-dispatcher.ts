/**
 * Root-page exit dispatcher — EXIT-01 / LIFE-03 (ADR-0012 D-4).
 *
 * Router-level bus listener that calls `bridge.shutDownPageContainer(1)` (Even Hub
 * Mode 1 = graceful exit dialog) on a `double-tap` while the bare map (`id 'map-base'`,
 * z=0 root, no overlay) is the top layer.
 *
 * # Why this exists (Even Hub app-submission requirement)
 *
 * `hub.evenrealities.com/docs/reference/app-submission` (INV-2 2026-05-31) requires:
 * *"Root-page double-tap calls `bridge.shutDownPageContainer(1)`"* — Mode 0 (immediate
 * exit) is unacceptable on the root page; the WebView must show the system exit dialog
 * and close on confirm. Without this the app fails QA step 3.
 *
 * # Why root-only
 *
 * On overlay panels (id !== 'map-base') `double-tap` is the panel's own close/back
 * gesture, handled by the panel's `onEvent`. The dispatcher fires ONLY when the top
 * layer is the bare map — i.e. there is no overlay to close, so double-tap means
 * "exit the app". This mirrors the over-scroll dispatcher's router-level pattern and
 * its documented INV-5 exemption ("a router-level listener, not a panel").
 *
 * # Best-effort
 *
 * `shutDownPageContainer` returns `Promise<boolean>`. A rejected promise (SDK/bridge
 * failure) is caught and logged — the app does not crash; the player can retry the
 * gesture. Mirrors the `map-mode-toggle` best-effort persistence policy.
 *
 * @param gestureBus   Shared in-process gesture bus.
 * @param layerManager LayerManager singleton — `getTopLayer()` identifies the root.
 * @param bridge       Resolved `EvenAppBridge` — `shutDownPageContainer(1)` exit call.
 * @returns Idempotent unsubscribe closure — call in `BootEngineHandle.teardown()`.
 *
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-4)
 * @see .planning/REQUIREMENTS.md LIFE-03 / EXIT-01
 * @see @evenrealities/even_hub_sdk dist/index.d.ts:1201 (shutDownPageContainer)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { LayerManager } from '../engine/layer-manager.js';
import type { R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';

/** The z=0 root map layer id (see `raster/map-base-layer.ts`). */
const ROOT_LAYER_ID = 'map-base' as const;

/** Even Hub graceful-exit mode (1 = confirm dialog; 0 = immediate is forbidden on root). */
const EXIT_MODE_CONFIRM = 1 as const;

/**
 * Attach the root-exit dispatcher to the gesture bus.
 *
 * On `double-tap`:
 *   1. `layerManager.getTopLayer()` — if `null` or `id !== 'map-base'` → return
 *      (an overlay is open; its own `onEvent` handles double-tap as close/back).
 *   2. Otherwise call `bridge.shutDownPageContainer(1)` (best-effort, await-guarded).
 *
 * On any other gesture kind: return immediately.
 *
 * Returns an idempotent unsubscribe closure.
 */
export function attachRootExit(
  gestureBus: PanelGestureBus,
  layerManager: Pick<LayerManager, 'getTopLayer'>,
  bridge: Pick<EvenAppBridge, 'shutDownPageContainer'>,
): () => void {
  const handler = (gesture: R1Gesture): void => {
    if (gesture.kind !== 'double-tap') {
      return;
    }
    const top = layerManager.getTopLayer();
    // Only the bare map root exits; an open overlay consumes its own double-tap.
    if (top === null || top.id !== ROOT_LAYER_ID) {
      return;
    }
    // Best-effort graceful exit (Mode 1 dialog). Never throw into the bus.
    void Promise.resolve(bridge.shutDownPageContainer(EXIT_MODE_CONFIRM)).catch((err: unknown) => {
      console.warn('[root-exit-dispatcher] shutDownPageContainer(1) failed', err);
    });
  };

  return gestureBus.subscribe(handler);
}
