/**
 * @evf/foundry-module — Settings panel registration.
 *
 * Registers the EvenFoundryVTT settings menu entry in the Foundry Settings panel
 * under "Module Settings → EvenFoundryVTT". In Wave 0 this is a stub: the pair
 * button opens a placeholder `PairModalStub`. Plan 02 (Wave 1) replaces the stub
 * with the full `PairModal` ApplicationV2 implementation.
 *
 * Also reads and exports `detectedLocale` from `game.i18n.lang` at call time,
 * satisfying I18N-01 (locale detection at module boot).
 *
 * @see Specs.md §7.14.7.3 (pair flow — QR + bearer)
 * @see 02-CONTEXT.md D-2.01 (pair-button location: Settings panel)
 * @see 02-CONTEXT.md D-2.18 (locale detection: game.i18n.lang at boot)
 * @see 02-UI-SPEC.md §UI-A I18N keys table (evf.settings.pair_button)
 */

import { MODULE_ID } from './module.js';

/**
 * Locale detected from `game.i18n.lang` at module init time.
 * Normalised to primary subtag only (e.g. "it-IT" → "it").
 * Propagated in the WS handshake `locale` field (Plan 04).
 */
export let detectedLocale: string = 'en';

/**
 * Placeholder modal class for the pair button in Wave 0.
 *
 * Replaced by the full `PairModal` (ApplicationV2) implementation in Plan 02.
 * Declared here to satisfy `game.settings.registerMenu` `type` requirement
 * (must be a constructor returning an Application instance).
 *
 * @internal Wave 0 stub — do not use outside this file.
 * @see packages/foundry-module/src/pair/PairModal.ts (Plan 02)
 */
export class PairModalStub extends Application {
  override get title(): string {
    return 'EVF Pair';
  }
}

/**
 * Registers the EvenFoundryVTT settings menu in the Foundry Settings panel.
 *
 * Must be called inside the `Hooks.once("init")` callback to ensure
 * `game.settings` is available. Reads `game.i18n.lang` immediately and
 * stores the result in `detectedLocale` for downstream consumers.
 *
 * @example
 * ```ts
 * Hooks.once('init', () => {
 *   registerSettings();
 * });
 * ```
 */
export function registerSettings(): void {
  // I18N-01: detect locale at module boot, normalise to primary tag
  detectedLocale = game.i18n.lang.split('-')[0] ?? 'en';

  game.settings.registerMenu(MODULE_ID, 'pairDevice', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    icon: 'fas fa-qrcode',
    type: PairModalStub,
    restricted: true,
  });
}
