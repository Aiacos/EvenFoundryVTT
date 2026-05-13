/**
 * @evf/foundry-module — Settings panel registration.
 *
 * Registers the EvenFoundryVTT settings menu entry in the Foundry Settings panel
 * under "Module Settings → EvenFoundryVTT". Wave 1 (Plan 02) replaces the
 * `PairModalStub` placeholder with the full `PairModal` ApplicationV2 implementation.
 *
 * Also reads and exports `detectedLocale` from `game.i18n.lang` at call time,
 * satisfying I18N-01 (locale detection at module boot).
 *
 * Also registers the bearer registry setting (scope: "world", config: false —
 * programmatic access only, not shown in the Foundry UI settings form).
 *
 * @see Specs.md §7.14.7.3 (pair flow — QR + bearer)
 * @see 02-CONTEXT.md D-2.01 (pair-button location: Settings panel)
 * @see 02-CONTEXT.md D-2.18 (locale detection: game.i18n.lang at boot)
 * @see 02-UI-SPEC.md §UI-A I18N keys table (evf.settings.pair_button)
 */

import { MODULE_ID } from './module.js';
import { PairModal } from './pair/PairModal.js';

/**
 * Locale detected from `game.i18n.lang` at module init time.
 * Normalised to primary subtag only (e.g. "it-IT" → "it").
 * Propagated in the WS handshake `locale` field (Plan 04).
 */
export let detectedLocale: string = 'en';

/**
 * Registers the EvenFoundryVTT settings menu in the Foundry Settings panel.
 *
 * Must be called inside the `Hooks.once("init")` callback to ensure
 * `game.settings` is available. Reads `game.i18n.lang` immediately and
 * stores the result in `detectedLocale` for downstream consumers.
 *
 * Registers the bearer registry and internal secrets as hidden world-scope
 * settings (Tier 3 DM-authoritative storage per D-2.12).
 *
 * @example
 * ```ts
 * Hooks.once('init', () => {
 *   registerSettings();
 * });
 * ```
 */
export function registerSettings(): void {
  // I18N-01: detect locale at module boot, normalise to primary tag.
  // Guard against `game.i18n` being undefined at the `init` hook (Foundry v13
  // re-ordered some globals; this function used to throw silently before
  // reaching the register calls below, leaving zero settings registered —
  // observed in production after manifest install. Caught by HUMAN-UAT).
  try {
    const lang = game.i18n?.lang ?? 'en';
    detectedLocale = lang.split('-')[0] ?? 'en';
  } catch {
    detectedLocale = 'en';
  }

  // Bearer registry — world scope, hidden from UI (programmatic only)
  game.settings.register(MODULE_ID, 'bearerRegistry', {
    scope: 'world',
    config: false,
    type: Object,
    default: { entries: {}, version: 1 },
  });

  // Pair button in Module Settings panel — opens PairModal (Wave 1).
  // Cast required: PairModal(bridgeUrl, worldId) has typed args but Foundry's registerMenu
  // type declaration accepts a generic constructor. Runtime call uses no-arg `new type()`.
  game.settings.registerMenu(MODULE_ID, 'pairDevice', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    icon: 'fas fa-qrcode',
    type: PairModal as unknown as new (...args: unknown[]) => object,
    restricted: true,
  });
}
