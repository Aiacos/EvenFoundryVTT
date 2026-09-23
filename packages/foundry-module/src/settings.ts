/**
 * @evf/foundry-module — settings registration.
 *
 * Registers the hidden pairing settings (device metadata world-scope, device keys
 * client-scope — see `direct/pairing-store.ts`; identity key client-scope —
 * `direct/identity-keys.ts`; sealed glasses passwords world-scope —
 * `direct/glasses-access.ts`), the GM-only settings menu «Associa occhiali G2»
 * (enablement + pairing on behalf, mock P01), the player menu «Associa i miei occhiali»
 * (self-service, ADR-0013), and the same entries in the Players list context menu
 * (`direct/players-menu.ts`).
 *
 * Also reads `detectedLocale` from `game.i18n.lang` (I18N-01, locale detection at
 * module boot).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md §Decision Outcome 3
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 * @see docs/design/g2-thirds-layout.md §P01
 */

import { registerAccessSettings } from './direct/glasses-access.js';
import { registerIdentitySettings } from './direct/identity-keys.js';
import { createPairG2App } from './direct/PairG2App.js';
import { registerPairingSettings } from './direct/pairing-store.js';
import { registerPlayersMenu } from './direct/players-menu.js';
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
  registerIdentitySettings();
  registerAccessSettings();

  const PairG2App = createPairG2App(projector, 'gm');
  const PairMyG2App = createPairG2App(projector, 'player');
  game.settings.registerMenu(MODULE_ID, 'pairG2', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    hint: 'evf.settings.pair_hint',
    icon: 'fas fa-glasses',
    type: PairG2App,
    restricted: true,
  });
  game.settings.registerMenu(MODULE_ID, 'pairMyG2', {
    name: 'evf.settings.pair_self_button',
    label: 'evf.settings.pair_self_button',
    hint: 'evf.settings.pair_self_hint',
    icon: 'fas fa-glasses',
    type: PairMyG2App,
    restricted: false,
  });
  const report = (err: unknown): void => {
    console.error('[EVF] could not open the pairing window', err);
  };
  registerPlayersMenu(
    (target) => {
      PairG2App.openFor(target).catch(report);
    },
    () => {
      PairMyG2App.openFor(null).catch(report);
    },
  );
}
