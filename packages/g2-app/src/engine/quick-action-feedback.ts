/**
 * Quick Action menu user-feedback helpers ([M] Map control + [A] Action).
 *
 * These two Quick Action menu items have no shipped destination panel in the
 * canvas-default boot:
 *
 *   - `[M] Map control` — in canvas mode the map is ALREADY the z=0 full-screen
 *     background (`MapCanvasLayer`). There is no separate "map mode" to toggle.
 *     The legacy glyph 400×200 raster toggle path (`toggleMapMode`) MUST NOT run
 *     in canvas mode: pushing the glyph raster tiles corrupts the canvas tile
 *     push (floods `updateImageRawData ... sendFailed` and blanks the display
 *     until restart). So in canvas mode `[M]` is a no-op that surfaces a brief
 *     toast instead of touching the glyph raster path.
 *   - `[A] Action` — the Action panel is not yet shipped (Phase 7). Selecting it
 *     used to emit only a silent `console.warn`, leaving the user with no
 *     feedback. It now surfaces a non-blocking toast.
 *
 * Both helpers build a validated `Toast` payload (consumed by `ToastQueueLayer`)
 * and never throw. They are intentionally pure (locale → Toast) so the boot
 * wiring stays a thin `toastQueue.enqueue(buildX(locale))` call and the
 * behaviour is unit-testable without the full boot harness.
 *
 * Locale policy mirrors §7.16.5: IT is the MVP primary; every other locale
 * falls back to the EN canonical string. Both message bodies fit the
 * `ToastSchema.message` 38-char budget (`toast-types.ts`).
 *
 * @see ../status-hud/toast-types.ts (ToastSchema / Toast / 38-char budget)
 * @see ../internal/boot-engine-core.ts (Quick Action menu callback wiring)
 */
import type { Toast } from '../status-hud/toast-types.js';

/**
 * Locale tag accepted by the feedback builders.
 *
 * Structurally a subset of `BootEngineLocale` — only `'it'` selects the Italian
 * string; every other tag (`en` / `de` / `es` / `fr` / `pt-br`) takes the EN
 * canonical fallback per §7.16.5.
 */
export type FeedbackLocale = 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br';

/** IT primary / EN canonical fallback message for the canvas-mode `[M]` no-op. */
export const MAP_ALREADY_FULLSCREEN_MESSAGE: Readonly<Record<'it' | 'en', string>> = {
  it: 'Mappa già a schermo intero',
  en: 'Map already full-screen',
};

/** IT primary / EN canonical fallback message for the not-yet-shipped `[A]` panel. */
export const ACTION_PENDING_MESSAGE: Readonly<Record<'it' | 'en', string>> = {
  it: 'Azione: non ancora disponibile',
  en: 'Action panel: not yet available',
};

/**
 * Build the toast shown when `[M] Map control` is selected in canvas mode.
 *
 * The map is already full-screen, so this is informational feedback for an
 * intentional no-op — never an error.
 *
 * @param locale Live render locale (`'it'` → Italian, else EN canonical).
 * @param now    Emit timestamp (defaults to `Date.now()`; injectable for tests).
 * @returns A validated `Toast` payload ready for `ToastQueueLayer.enqueue`.
 */
export function buildMapAlreadyFullscreenToast(
  locale: FeedbackLocale,
  now: number = Date.now(),
): Toast {
  return {
    id: `map-mode-canvas-${now}`,
    severity: 'info',
    message:
      locale === 'it' ? MAP_ALREADY_FULLSCREEN_MESSAGE.it : MAP_ALREADY_FULLSCREEN_MESSAGE.en,
    emittedAt: now,
  };
}

/**
 * Build the toast shown when `[A] Action` is selected (panel not yet shipped).
 *
 * Informational, non-blocking feedback that replaces the previous silent
 * `console.warn` so the gesture is never a dead no-feedback action.
 *
 * @param locale Live render locale (`'it'` → Italian, else EN canonical).
 * @param now    Emit timestamp (defaults to `Date.now()`; injectable for tests).
 * @returns A validated `Toast` payload ready for `ToastQueueLayer.enqueue`.
 */
export function buildActionPendingToast(locale: FeedbackLocale, now: number = Date.now()): Toast {
  return {
    id: `action-pending-${now}`,
    severity: 'info',
    message: locale === 'it' ? ACTION_PENDING_MESSAGE.it : ACTION_PENDING_MESSAGE.en,
    emittedAt: now,
  };
}
