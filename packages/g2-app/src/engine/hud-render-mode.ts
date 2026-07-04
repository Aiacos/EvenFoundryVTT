/**
 * HUD render-mode boot override (Feature 002 — hybrid native+raster substrate).
 *
 * The boot default substrate is `'showcase'` (the whole glanceable HUD rasterised as
 * one 400×200 image — see `boot-engine-core.ts` step 7). This module ships the
 * optional device-local kv override that lets a user / dev force a specific substrate:
 *
 *   - `'showcase'` — whole-HUD 400×200 raster (the PRODUCTION default)
 *   - `'hybrid'` — native chrome/status + raster map region (Feature 002 fallback)
 *   - `'canvas'` — full-screen canvas raster (the retained v0.10.0 fallback)
 *   - `'glyph'`  — native text-only status view (the BLE-degraded fallback)
 *
 * The BLE-degraded verdict still flips the live mode to `'glyph'` independently
 * (boot step 9d) — this override governs only the boot-time substrate selection.
 *
 * Defensive behaviour mirrors `loadPersistedMapMode`:
 *   - missing key (SDK resolves `''`) → returns `null` (use the showcase default)
 *   - any value not in the whitelist → returns `null`
 *   - `getLocalStorage` rejection → returns `null` + a single `console.warn`
 *
 * Never throws.
 *
 * @see specs/002-hybrid-native-raster-render/spec.md
 * @see packages/g2-app/src/engine/map-mode-toggle.ts (sibling reader pattern)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { HudRenderMode } from './layer-manager.js';

/**
 * Even Hub kv-store key for the persisted HUD render substrate override.
 * Device-local; never modifies Foundry world settings.
 */
export const RENDER_MODE_STORAGE_KEY = 'view.hud.render' as const;

/**
 * Read the persisted HUD render-mode override from the Even Hub kv store.
 *
 * @param bridge Resolved `EvenAppBridge` singleton (must be ready).
 * @returns A whitelisted {@link HudRenderMode} when explicitly stored, else `null`
 *   (boot uses the showcase default). Never throws.
 */
export async function loadPersistedRenderMode(
  bridge: EvenAppBridge,
): Promise<HudRenderMode | null> {
  try {
    const raw = await bridge.getLocalStorage(RENDER_MODE_STORAGE_KEY);
    if (raw === 'showcase' || raw === 'hybrid' || raw === 'canvas' || raw === 'glyph') {
      return raw;
    }
    return null;
  } catch (err) {
    console.warn('[hud-render-mode] loadPersistedRenderMode failed — using showcase default', err);
    return null;
  }
}
