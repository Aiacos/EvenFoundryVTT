/**
 * @evf/foundry-module — settings registration.
 *
 * Registers the hidden pairing settings (device metadata world-scope, device keys
 * client-scope — see `direct/pairing-store.ts`) and the GM-only settings menu
 * «Associa occhiali G2» that opens the pairing window (mock P01).
 *
 * Also reads `detectedLocale` from `game.i18n.lang` (I18N-01, locale detection at
 * module boot).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md §Decision Outcome 3
 * @see docs/design/g2-thirds-layout.md §P01
 */

import { createPairG2App } from './direct/PairG2App.js';
import { registerPairingSettings } from './direct/pairing-store.js';
import type { Projector } from './direct/projector.js';
import { MODULE_ID } from './module-id.js';

/**
 * Locale detected from `game.i18n.lang` at module init time.
 * Normalised to primary subtag only (e.g. "it-IT" → "it").
 */
export let detectedLocale = 'en';

/**
 * Registers settings + the pairing menu. Must be called inside `Hooks.once("init")`.
 *
 * @param projector - projector instance shared with the pairing window (online
 *                    state, sealed revocation notice)
 */
export function registerSettings(projector: Projector): void {
  // I18N-01: detect locale at module boot, normalise to primary tag. Guarded because
  // `game.i18n` may be undefined at `init` on some Foundry v13 builds (HUMAN-UAT).
  const lang = game.i18n?.lang ?? 'en';
  detectedLocale = lang.split('-')[0] || 'en';

  registerPairingSettings();

  game.settings.registerMenu(MODULE_ID, 'pairG2', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    hint: 'evf.settings.pair_hint',
    icon: 'fas fa-glasses',
    type: createPairG2App(projector),
    restricted: true,
  });
}
