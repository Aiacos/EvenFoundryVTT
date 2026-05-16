/**
 * sync-lost-chip — builds the `⚠ SYNC LOST` footer chip string for the Status HUD.
 *
 * Replaces the R1 hint chip row in the HUD footer when the WebSocket is
 * disconnected and `WsReconnectController` is in the reconnect backoff window.
 *
 * **Chip formats:**
 * - Countdown: `⚠ SYNC LOST (riconnetto in {N}s)` (IT) / `⚠ SYNC LOST (reconnect in {N}s)` (EN)
 * - In-flight sentinel (retryInMs === 0): `⚠ SYNC LOST (riconnessione…)` (IT) /
 *   `⚠ SYNC LOST (reconnecting…)` (EN)
 *
 * **Width budget:** ≤38 code-points inner (same as R1 chip row per INV-1 §3.2).
 * Verified at all retry values 0..30s for IT + EN (test SLC-04).
 *
 * **i18n:** reads from `getLabel('hud_sync_lost_chip_template', locale)` and
 * `getLabel('hud_sync_lost_chip_inflight', locale)`. ES/FR/PT-BR fall back to EN
 * per I18N-05 best-effort (getLabel handles this transparently).
 *
 * **{N} substitution:** The countdown in seconds is derived from `retryInMs` by
 * integer division (Math.ceil for non-zero values so `1500ms → 2s`, not `1s`).
 * retryInMs values that are exact multiples of 1000 substitute directly.
 *
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (hud_sync_lost_chip_template/inflight)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (renderContextChip consumer)
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 3
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 1 D-Area1
 */
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';

/**
 * Build the SYNC LOST footer chip string for the given retry state and locale.
 *
 * @param retryInMs - Remaining milliseconds before the next reconnect attempt.
 *   - `0` → in-flight sentinel (`⚠ SYNC LOST (riconnessione…)` / `⚠ SYNC LOST (reconnecting…)`).
 *   - `> 0` → countdown chip with `{N}s` substituted.
 * @param locale - Active HUD locale (IT canonical; EN/DE full; ES/FR/PT-BR best-effort).
 * @returns Chip string, ≤38 code-points.
 *
 * @example
 * ```ts
 * buildSyncLostChip(4000, 'it')  // → '⚠ SYNC LOST (riconnetto in 4s)'
 * buildSyncLostChip(4000, 'en')  // → '⚠ SYNC LOST (reconnect in 4s)'
 * buildSyncLostChip(0, 'it')     // → '⚠ SYNC LOST (riconnessione…)'
 * buildSyncLostChip(0, 'en')     // → '⚠ SYNC LOST (reconnecting…)'
 * ```
 */
export function buildSyncLostChip(retryInMs: number, locale: HudLocale): string {
  if (retryInMs <= 0) {
    return getLabel('hud_sync_lost_chip_inflight', locale);
  }
  const seconds = Math.ceil(retryInMs / 1000);
  const template = getLabel('hud_sync_lost_chip_template', locale);
  return template.replace('{N}', String(seconds));
}
