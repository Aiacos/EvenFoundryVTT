/**
 * Map mode runtime toggle + Even Hub persistence (Phase 4b Plan 02 — MAP-05).
 *
 * Ships the `toggleMapMode(newMode)` runtime primitive that Phase 6 Quick Action
 * `[M] Map ctrl` will wire to its tap handler, plus the boot-time
 * `loadPersistedMapMode(bridge)` reader that `bootEngine` consults at step 9b to
 * override the BLE-probe verdict when the user has previously locked the mode.
 *
 * # Best-effort persistence policy (04B-RESEARCH §Q8)
 *
 * Per the locked failure-mode policy:
 *
 *   1. In-memory mutation FIRST — `layerManager.setMapMode(newMode)` and (for
 *      `raster` | `glyph` only) `rasterController.setBleVerdict(newMode)` happen
 *      before any I/O touches the bridge. The live session always succeeds.
 *   2. Persistence SECOND — `bridge.setLocalStorage(STORAGE_KEY, newMode)` is
 *      wrapped in try/catch. Rejection OR `false` resolution emits a single
 *      `console.warn` and the function returns normally. The in-memory toggle
 *      is NEVER rolled back: a session that lost persistence still renders in
 *      the requested mode; only the NEXT boot's fallback path is affected.
 *
 * # Pitfall 7 — 'auto' does NOT re-probe BLE
 *
 * `toggleMapMode('auto')` clears the persisted override but does NOT re-run
 * `probeBleThroughput`. The `RasterController.bleVerdict` retains whatever
 * value the prior raster/glyph toggle left it in. Phase 6 Quick Action `[M]`
 * MAY add a synchronous re-probe at toggle time if user feedback demands it;
 * for Phase 4b the limitation is documented and acceptable.
 *
 * # Direct bridge access (Pitfall 1)
 *
 * Engine code (this module + `boot-engine-core.ts`) imports `EvenAppBridge`
 * directly from `@evenrealities/even_hub_sdk` and calls `bridge.setLocalStorage`
 * / `bridge.getLocalStorage` verbatim. The Phase 2 `hub-polyfill.ts` is a
 * wizard-only backward-compat shim; engine code MUST NOT route through it.
 *
 * # INV-2 SDK citations (verified `@evenrealities/even_hub_sdk@0.0.10` 2026-05-15)
 *
 * - `EvenAppBridge.setLocalStorage(key, value): Promise<boolean>` —
 *   `dist/index.d.ts` line 1144
 * - `EvenAppBridge.getLocalStorage(key): Promise<string>` — `dist/index.d.ts`
 *   line 1157 (resolves `''` empty string for missing key, NOT `null`)
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-02-PLAN.md
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 3
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 2 + §Q8
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { LayerManager, MapMode } from './layer-manager.js';
import type { RasterControllerLike } from './layer-types.js';

/**
 * Even Hub kv-store key for the persisted map mode.
 *
 * Format: dot-separated ASCII alphanumeric — matches the Phase 2 hub-polyfill
 * key convention per 04B-RESEARCH §Q8 key constraints. Device-local; does NOT
 * modify Foundry world settings (those are Phase 7+ write path).
 */
export const STORAGE_KEY = 'view.map.mode' as const;

/**
 * Read the persisted map mode from Even Hub kv store.
 *
 * Defensive behaviour:
 *   - SDK resolves `''` (empty string) when the key is missing → returns `'auto'`
 *   - SDK resolves any value not in the whitelist (`'raster' | 'glyph' | 'auto'`)
 *     → returns `'auto'` (T-4b-02-01 mitigation — untrusted stored value)
 *   - `getLocalStorage` rejection → returns `'auto'` + `console.warn` once
 *
 * Never throws. The defensive fallback to `'auto'` lets the BLE-probe verdict
 * win at boot when no explicit user override is stored.
 *
 * Called from `boot-engine-core.ts` step 9b to override the BLE-probe verdict
 * when the user has previously toggled raster ↔ glyph explicitly.
 *
 * @param bridge Resolved `EvenAppBridge` singleton (must be ready)
 * @returns Persisted `MapMode` value, or `'auto'` on any failure / missing key
 */
export async function loadPersistedMapMode(bridge: EvenAppBridge): Promise<MapMode> {
  try {
    const raw = await bridge.getLocalStorage(STORAGE_KEY);
    if (raw === 'raster' || raw === 'glyph' || raw === 'auto') {
      return raw;
    }
    // Empty string (SDK missing-key signal) or anything else → defensive 'auto'.
    return 'auto';
  } catch (err) {
    console.warn('[map-mode-toggle] loadPersistedMapMode failed — defaulting to auto', err);
    return 'auto';
  }
}

/**
 * Apply a new map mode + persist best-effort to Even Hub kv store.
 *
 * Implements the Q8 best-effort persistence policy:
 *
 *   1. **In-memory FIRST** — `layerManager.setMapMode(newMode)` mutates the
 *      LayerManager's `mapMode` field synchronously. For `'raster'` or
 *      `'glyph'`, `rasterController.setBleVerdict(newMode)` is also invoked.
 *      For `'auto'`, `setBleVerdict` is NOT called — the RasterControllerLike
 *      contract only accepts `'raster' | 'glyph'` (see Pitfall 7 note above).
 *   2. **Persistence SECOND** — `bridge.setLocalStorage(STORAGE_KEY, newMode)`
 *      is awaited inside a try/catch. `false` resolution OR rejection emits a
 *      single `console.warn` and the function still returns normally. The
 *      in-memory toggle is NEVER rolled back (T-4b-02-02 mitigation).
 *
 * Phase 6 Quick Action `[M] Map ctrl` will call this function directly from
 * the tap handler — no additional wiring needed at the Phase 4b boundary.
 *
 * @param bridge            Resolved `EvenAppBridge` singleton
 * @param layerManager      LayerManager instance to mutate in-memory
 * @param rasterController  RasterController (or any `RasterControllerLike`) to flip
 * @param newMode           Desired map mode (`'auto' | 'raster' | 'glyph'`)
 * @returns Promise that resolves after the persistence write attempt (best-effort)
 */
export async function toggleMapMode(
  bridge: EvenAppBridge,
  layerManager: LayerManager,
  rasterController: RasterControllerLike,
  newMode: MapMode,
): Promise<void> {
  // STEP 1 — In-memory state mutation FIRST. Always succeeds; never reaches
  // the bridge. The live session honours the new mode regardless of what
  // happens in STEP 2.
  layerManager.setMapMode(newMode);
  if (newMode === 'raster' || newMode === 'glyph') {
    rasterController.setBleVerdict(newMode);
  }
  // 'auto' intentionally does NOT call setBleVerdict — the RasterControllerLike
  // contract refuses 'auto' (only accepts 'raster' | 'glyph'). Pitfall 7: a
  // future toggleMapMode('auto') re-probe enhancement (Phase 6) would re-run
  // probeBleThroughput here; for Phase 4b the previous verdict stays in the
  // controller.

  // STEP 2 — Persistence is best-effort (Q8 failure-mode policy).
  try {
    const ok = await bridge.setLocalStorage(STORAGE_KEY, newMode);
    if (!ok) {
      console.warn(
        `[map-mode-toggle] setLocalStorage returned false for ${STORAGE_KEY}=${newMode}; in-memory toggle applied, next-boot fallback unaffected`,
      );
    }
  } catch (err) {
    console.warn('[map-mode-toggle] setLocalStorage threw — toggle applied in-memory only', err);
  }
}
