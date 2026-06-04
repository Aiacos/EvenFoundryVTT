/**
 * @evf/g2-app — production boot entry for the G2 plugin host.
 *
 * Phase 4a replaces the Phase 1 placeholder with the real boot wiring.
 * This module is a **thin production wrapper** around `_bootEngineCore`
 * which lives behind the `internal/` directory boundary
 * (Option B per 04A-PLAN-CHECK.md §NF-2).
 *
 * **W-4 closure (do NOT inline the test-only DI factory literals here):**
 *
 * The boot-sequence body — including every reference to test-only DI
 * factories — lives in `./internal/boot-engine-core.ts`. This file
 * contains zero ws-factory / bridge-factory substrings and zero
 * testing-dependencies references; both are confined to the internal
 * core + `./index.test-support.ts`. The W-4 grep gate (a `! grep -E`
 * over the two DI-factory identifiers against this file, see
 * `src/__tests__/launch.test.ts` LAUNCH-W4 + the Task 2 verify)
 * enforces this constraint and lets the test-only DI surface stay
 * structurally invisible to production callers. The forbidden literals
 * are deliberately spelled with hyphens above so this header itself
 * stays grep-clean (Quick Task 260604-ovn — W-4 gate hardening).
 *
 * Production usage:
 * ```ts
 * import { bootEngine } from '@evf/g2-app';
 * const handle = await bootEngine({ bridgeUrl, token, locale: 'it' });
 * // Later: handle.teardown();
 * ```
 *
 * Test usage (NOT through this entry):
 * ```ts
 * import { bootEngineForTest } from '@evf/g2-app/src/index.test-support';
 * ```
 *
 * @see Specs.md §3.7 (plugin host architecture) + §11.5.7 (raster pipeline)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Recommended Project Structure
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §W-4 + §NF-2
 * @see ./internal/boot-engine-core.ts (the actual boot-sequence body)
 * @see ./index.test-support.ts (test-only DI surface)
 */

import type { LayerManager } from './engine/layer-manager.js';
import { _bootEngineCore, type BootEngineOpts } from './internal/boot-engine-core.js';
import { launchApp } from './internal/launch.js';
import type { RasterController } from './raster/raster-controller.js';

/** Re-export the production options type — single source of truth in boot-engine-core.ts. */
export type { BootEngineOpts } from './internal/boot-engine-core.js';

/**
 * Boot the G2 engine end-to-end.
 *
 * Runs the canonical Phase 4a boot sequence:
 *
 *   1. Install the Phase 2 `hub.*` polyfill (idempotent backward-compat shim).
 *   2. Acquire the `EvenAppBridge` singleton via `waitForEvenAppBridge()`.
 *   3. Create the 11-container boot page.
 *   4. Render the 5-step boot-splash checklist (UI-SPEC §Screen 1).
 *   5. Open the bridge WebSocket and await `'open'`.
 *   6. Perform the capability handshake (negotiated `SERVER_CAPS_V1`).
 *   7. Construct `LayerManager` + propagate negotiated caps.
 *   8. Construct `RasterController` (singleton Web Worker).
 *   9. BLE-probe → controller verdict + `layerManager.setMapMode` (Area 4).
 *  10. Build `MapBaseLayer` (z=0) + `IdleInfillLayer` (z=0.5) + `StatusHudLayer` (z=1).
 *  11. Wire Plan 06 `attachSceneInputToWs` for `frame_pixels` envelopes.
 *  12. Atomic 3-layer bundle (single `rebuildPageContainer` per ADR-0001 Amd 1).
 *  13. Draw the first frame (no-op until Plan 06 pushes the first scene).
 *
 * Returns a handle exposing the `LayerManager`, `RasterController`, and a
 * `teardown()` closure that releases every acquired resource.
 *
 * Fails closed: any error from the bridge, handshake, or LayerManager
 * propagates to the caller and no partial state is left mounted.
 *
 * @param opts Production options (bridge URL + 24h bearer token + locale)
 * @returns Boot handle (`{ layerManager, rasterController, teardown }`)
 */
export async function bootEngine(opts: BootEngineOpts): Promise<{
  layerManager: LayerManager;
  rasterController: RasterController;
  teardown: () => void;
}> {
  return _bootEngineCore(opts, undefined);
}

/** Stable package name marker (retained for any consumer that imported the Phase 1 stub). */
export const PACKAGE_NAME = '@evf/g2-app';

// Quick Task 260604-cwa: install the dev-only debug agent on engine boot.
// Log-only path (no store) — exposes window.__EVF_DEBUG__ + console mirror.
// Dynamic import gate so the debug-agent module is tree-shaken from prod dist.
if (import.meta.env.DEV || import.meta.env.VITE_EVF_DEBUG) {
  import('./debug/debug-agent.js')
    .then(({ installDebugAgent }) => {
      installDebugAgent();
    })
    .catch(() => {
      // Soft-fail — debug agent is dev-only; failure must not affect prod callers.
    });
}

// Quick Task 260604-ovn: production launch glue.
//
// On index.html load, decide between booting the engine (no-auth dev fallback)
// and redirecting to the pairing wizard (unpaired / paired-non-dev). Runs AFTER
// the debug-agent block above: the debug-agent install is fire-and-forget, and
// bootEngine (inside launchApp) installs the hub polyfill + waits for the bridge
// itself, so ordering is safe. launchApp is internally fail-soft; the extra
// `.catch` here is belt-and-suspenders against a synchronous-throw edge so a
// launch error never white-screens the app.
launchApp().catch((err) => {
  console.error('[EVF] index: launchApp failed', err);
});
