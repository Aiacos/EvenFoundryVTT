/**
 * Locale override persistence + boot read-back (Phase 5 Plan 06 — I18N-02).
 *
 * Analogous to `engine/map-mode-toggle.ts` (Phase 4b Plan 02 exemplar):
 *   - `persistLocaleOverride(bridge, locale)` — writes to Even Hub kv store
 *     (best-effort; swallows exceptions, never rolls back any in-memory state)
 *   - `loadLocaleOverride(bridge)` — reads + validates the stored value;
 *     returns `'auto'` on any failure, missing key, or unknown code
 *
 * # Storage semantics
 *
 * Key: `'view.locale.override'`  (dot-separated ASCII, device-local — never
 * modifies Foundry world settings per I18N-02 device-local constraint).
 *
 * Value set: `['auto', 'it', 'en', 'de', 'es', 'fr', 'pt-br']` — the 7 codes
 * from `LOCALE_MENU` (05-01). Any value outside this set is normalised to
 * `'auto'` (T-05-06-01 mitigation — defensive whitelist validation).
 *
 * # Failure-mode policy (analogous to 04B-RESEARCH §Q8)
 *
 *   - `getLocalStorage` resolves `''` (SDK missing-key signal) → returns `'auto'`
 *   - `getLocalStorage` resolves a value outside the whitelist → returns `'auto'`
 *   - `getLocalStorage` throws → returns `'auto'` (T-05-06-02 mitigation)
 *   - `setLocalStorage` throws → swallowed silently (cosmetic persistence — the
 *     current session locale is managed in-memory by the boot engine; only the
 *     NEXT boot's read-back is affected by persistence failure)
 *
 * # INV-2 SDK citations (verified `@evenrealities/even_hub_sdk@0.0.10` 2026-05-15)
 *
 * - `EvenAppBridge.setLocalStorage(key, value): Promise<boolean>` — dist/index.d.ts
 * - `EvenAppBridge.getLocalStorage(key): Promise<string>` — resolves `''` for missing key
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 4
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 5
 * @see packages/g2-app/src/engine/map-mode-toggle.ts (Phase 4b exemplar)
 * @see packages/g2-app/src/locale/locale-menu.ts (LOCALE_MENU 7 codes)
 * @see packages/g2-app/src/internal/boot-engine-core.ts step 9c (consumer)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { HudLocale } from '../status-hud/i18n-budgets.js';

/**
 * Even Hub kv-store key for the device-local locale override.
 *
 * Format: dot-separated ASCII alphanumeric — matches the Phase 4b map-mode
 * key convention (`view.map.mode`). Device-local; never touches Foundry world
 * settings (I18N-02 device-local constraint, verified by `no game.settings.set`
 * audit grep in g2-app package).
 */
export const LOCALE_OVERRIDE_KEY = 'view.locale.override' as const;

/**
 * Valid locale override values — `'auto'` plus the 6 `HudLocale` codes.
 *
 * `'auto'` means "follow `game.i18n.lang` auto-detect at boot time"; any of
 * the 6 locale codes overrides auto-detect. ES/FR/PT-BR are best-effort (I18N-05).
 */
export type LocaleOverride = 'auto' | HudLocale;

/**
 * The complete whitelist of valid stored values, derived from `LOCALE_MENU`.
 *
 * Used by `loadLocaleOverride` for whitelist validation (T-05-06-01).
 * Kept as a `const` to avoid importing `LOCALE_MENU` at this level — the
 * locale-override module must remain leaf-level with no circular deps.
 */
const VALID_LOCALE_CODES: ReadonlySet<string> = new Set([
  'auto',
  'it',
  'en',
  'de',
  'es',
  'fr',
  'pt-br',
]);

/**
 * Read the device-local locale override from Even Hub kv store.
 *
 * Defensive behaviour (T-05-06-01 + T-05-06-02 mitigations):
 *   - SDK resolves `''` (empty string) when key absent → returns `'auto'`
 *   - SDK resolves a code not in `VALID_LOCALE_CODES` → returns `'auto'`
 *   - `getLocalStorage` throws → returns `'auto'`
 *
 * Never throws. The defensive fallback to `'auto'` lets the boot-time
 * auto-detected locale win when no explicit user override is stored.
 *
 * Called from `boot-engine-core.ts` step 9c to override `opts.locale` when
 * the user has previously selected a different locale via the Phase 6
 * Quick Action `[N] Language` picker.
 *
 * @param bridge Resolved `EvenAppBridge` singleton (must be ready at call time)
 * @returns Stored locale override, or `'auto'` on any failure / missing key / invalid code
 */
export async function loadLocaleOverride(bridge: EvenAppBridge): Promise<LocaleOverride> {
  try {
    const raw = await bridge.getLocalStorage(LOCALE_OVERRIDE_KEY);
    if (VALID_LOCALE_CODES.has(raw) && raw !== '') {
      return raw as LocaleOverride;
    }
    // Empty string (SDK missing-key signal) or anything outside whitelist → 'auto'.
    return 'auto';
  } catch (err) {
    console.warn('[locale-override] loadLocaleOverride failed — defaulting to auto', err);
    return 'auto';
  }
}

/**
 * Persist a locale override to Even Hub kv store (best-effort, cosmetic).
 *
 * Writes `locale` under `LOCALE_OVERRIDE_KEY`. On bridge rejection or thrown
 * exception, the error is swallowed and the function resolves normally — the
 * in-memory locale (managed by the boot engine) is unaffected.
 *
 * A `false` resolve from the SDK (`setLocalStorage` returns `Promise<boolean>`)
 * is treated the same as success — the single-tenant homelab scenario makes
 * over-storage-failure recovery out of scope.
 *
 * Called by the Phase 6 Quick Action `[N] Language` tap handler after the user
 * selects a new locale. The selection takes immediate in-memory effect; this
 * write only gates the NEXT boot's step 9c read-back.
 *
 * @param bridge Resolved `EvenAppBridge` singleton
 * @param locale Locale code to persist (`'auto'` clears the override)
 */
export async function persistLocaleOverride(
  bridge: EvenAppBridge,
  locale: LocaleOverride,
): Promise<void> {
  try {
    await bridge.setLocalStorage(LOCALE_OVERRIDE_KEY, locale);
  } catch (err) {
    console.warn(
      '[locale-override] persistLocaleOverride failed — in-memory locale unaffected',
      err,
    );
  }
}
