/**
 * Root-page exit dispatcher — EXIT-01 / LIFE-03 (ADR-0012 D-4).
 *
 * Router-level bus listener that calls `bridge.shutDownPageContainer(1)` (Even Hub
 * Mode 1 = graceful exit dialog) on a `double-tap` while no overlay is open
 * (i.e. the root map is the effective top, whether glyph or canvas mode).
 *
 * # Why this exists (Even Hub app-submission requirement)
 *
 * `hub.evenrealities.com/docs/reference/app-submission` (INV-2 2026-05-31) requires:
 * *"Root-page double-tap calls `bridge.shutDownPageContainer(1)`"* — Mode 0 (immediate
 * exit) is unacceptable on the root page; the WebView must show the system exit dialog
 * and close on confirm. Without this the app fails QA step 3.
 *
 * # Root detection (Rule 1 auto-fix 2026-06-10 — canvas-mode fix)
 *
 * `layerManager.getTopLayer()` returns the TOPMOST OverlayPanel (z=2), or `null` when
 * no overlay is open. In canvas mode the root layer is `MapCanvasLayer` (id='map-canvas')
 * at z=0, which is NOT an OverlayPanel — so `getTopLayer()` returns `null` at the root.
 * In glyph mode the root is `MapBaseLayer` (id='map-base') — also not an OverlayPanel,
 * so `getTopLayer()` also returns `null` at the root.
 *
 * Updated logic: fire exit when `top === null` (no overlay open). When `top !== null`
 * an overlay IS open; its own `onEvent` handles double-tap as close/back — root-exit
 * must NOT fire (overlay-open suppression preserved).
 *
 * Pre-fix logic (`top === null || top.id !== 'map-base'`) incorrectly returned early
 * in canvas mode because `top === null` triggered the early-return guard. The early
 * return is now guarded by `top !== null` only — `null` means "no overlay → exit".
 *
 * # Best-effort
 *
 * `shutDownPageContainer` returns `Promise<boolean>`. A rejected promise (SDK/bridge
 * failure) is caught and logged — the app does not crash; the player can retry the
 * gesture. Mirrors the `map-mode-toggle` best-effort persistence policy.
 *
 * @param gestureBus   Shared in-process gesture bus.
 * @param layerManager LayerManager singleton — `getTopLayer()` identifies open overlays.
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

/** Even Hub graceful-exit mode (1 = confirm dialog; 0 = immediate is forbidden on root). */
const EXIT_MODE_CONFIRM = 1 as const;

/**
 * Attach the root-exit dispatcher to the gesture bus.
 *
 * On `double-tap`:
 *   1. `layerManager.getTopLayer()` — if NOT `null`, an overlay is open; its own
 *      `onEvent` handles double-tap as close/back → return without firing exit.
 *   2. If `null` (no overlay open — root map is the effective top in both glyph and
 *      canvas mode) → call `bridge.shutDownPageContainer(1)` (best-effort, await-guarded).
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
    // An open overlay (top !== null) handles its own double-tap via onEvent.
    // `null` means no overlay — root double-tap → graceful exit.
    if (top !== null) {
      return;
    }
    // Best-effort graceful exit (Mode 1 dialog). Never throw into the bus.
    void Promise.resolve(bridge.shutDownPageContainer(EXIT_MODE_CONFIRM)).catch((err: unknown) => {
      console.warn('[root-exit-dispatcher] shutDownPageContainer(1) failed', err);
    });
  };

  return gestureBus.subscribe(handler);
}
