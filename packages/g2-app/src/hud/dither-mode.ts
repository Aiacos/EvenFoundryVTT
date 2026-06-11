/**
 * Dither-mode persistence + boot read-back (quick-task 260611-CLR).
 *
 * Mirrors `locale/locale-override.ts` (the persistence-helper pattern for
 * device-local UI toggles backed by the Even Hub kv store):
 *   - `persistDitherMode(bridge, on)` — writes to Even Hub kv store (best-effort;
 *     swallows exceptions, never rolls back any in-memory state).
 *   - `loadDitherMode(bridge)` — reads + validates the stored value; returns
 *     `true` (dither ON) on missing key, unknown value, or kv read error (fail-soft).
 *
 * # Storage semantics
 *
 * Key: `'view.hud.dither'` (dot-separated ASCII, device-local — never touches
 * Foundry world settings).
 *
 * Values: `'1'` = dither ON (Bayer 4×4), `'0'` = dither OFF (direct quantization).
 * Absent / '' (SDK missing-key signal) / anything else → default OFF (user
 * decision 2026-06-11: dithering off unless explicitly enabled).
 *
 * # Failure-mode policy (mirrors locale-override.ts §Failure-mode policy)
 *
 *   - `getLocalStorage` resolves `''` (SDK missing-key signal) → returns `false`
 *   - `getLocalStorage` resolves any value other than `'1'` → returns `false`
 *   - `getLocalStorage` throws → returns `false` (T-05-06-02 pattern)
 *   - `setLocalStorage` throws → swallowed silently (cosmetic persistence —
 *     the current session toggle is managed in-memory by boot-engine-core;
 *     only the NEXT boot's read-back is affected by persistence failure)
 *
 * # INV-2 SDK citations (verified `@evenrealities/even_hub_sdk@0.0.10` 2026-05-15)
 *
 * - `EvenAppBridge.setLocalStorage(key, value): Promise<boolean>` — dist/index.d.ts
 * - `EvenAppBridge.getLocalStorage(key): Promise<string>` — resolves `''` for missing key
 *
 * @see packages/g2-app/src/locale/locale-override.ts (pattern exemplar)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (consumer — step loading + onDitherToggle)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (getDitherMode opt consumer)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

/**
 * Even Hub kv-store key for the device-local HUD dither-mode toggle.
 *
 * Format: dot-separated ASCII alphanumeric — matches the existing key convention
 * (`view.map.mode`, `view.locale.override`, `evf.fps.indicator`).
 * Device-local; never touches Foundry world settings.
 */
export const DITHER_MODE_KV_KEY = 'view.hud.dither' as const;

/**
 * Read the device-local dither-mode from the Even Hub kv store.
 *
 * Defensive behaviour (fail-soft, mirrors T-05-06-01 + T-05-06-02):
 *   - SDK resolves `''` (empty string) when key absent → returns `false` (default OFF)
 *   - SDK resolves `'1'` → returns `true` (dither ON)
 *   - SDK resolves any other value → returns `false` (default OFF)
 *   - `getLocalStorage` throws → returns `false` with a `console.warn`
 *
 * Never throws. The defensive fallback to `false` keeps direct quantization as
 * the default (user decision 2026-06-11) unless dither was explicitly enabled.
 *
 * Called from `boot-engine-core.ts` at startup to initialise `ditherOn` before
 * passing `getDitherMode: () => ditherOn` into `HudDeltaDriver`.
 *
 * @param bridge Resolved `EvenAppBridge` singleton (must be ready at call time).
 * @returns `true` when dither ON; `false` when dither OFF (`'0'` was stored).
 */
export async function loadDitherMode(bridge: EvenAppBridge): Promise<boolean> {
  try {
    const stored = await bridge.getLocalStorage(DITHER_MODE_KV_KEY);
    return stored === '1'; // '0', '' (missing), or anything else → false (OFF)
  } catch (err) {
    console.warn('[dither-mode] loadDitherMode failed — defaulting to OFF (dither=false)', err);
    return false;
  }
}

/**
 * Persist the device-local dither-mode to the Even Hub kv store (best-effort).
 *
 * Writes `'1'` (ON) or `'0'` (OFF) under {@link DITHER_MODE_KV_KEY}. On bridge
 * rejection or thrown exception the error is swallowed and the function resolves
 * normally — the in-memory `ditherOn` flag (managed by `boot-engine-core.ts`) is
 * unaffected.
 *
 * Called by the `onDitherToggle` callback in `boot-engine-core.ts` after the user
 * selects the `[D] Dither` Quick Action menu item. The toggle takes immediate
 * in-memory effect; this write only gates the NEXT boot's read-back.
 *
 * @param bridge Resolved `EvenAppBridge` singleton.
 * @param on `true` to persist dither ON (`'1'`); `false` for dither OFF (`'0'`).
 */
export async function persistDitherMode(bridge: EvenAppBridge, on: boolean): Promise<void> {
  try {
    await bridge.setLocalStorage(DITHER_MODE_KV_KEY, on ? '1' : '0');
  } catch (err) {
    console.warn('[dither-mode] persistDitherMode failed — in-memory dither flag unaffected', err);
  }
}
