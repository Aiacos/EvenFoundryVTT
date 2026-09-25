/**
 * @evf/foundry-module — settings registration (ADR-0019).
 *
 * - hidden client-scope pairing store (`direct/pairing-store.ts`);
 * - «Collega occhiali G2» settings menu (every user — players pair their own glasses),
 *   plus the Players-list entry and the `Alt+G` keybinding (`direct/players-menu.ts`);
 * - two client-scope advanced settings, left at their defaults by everyone except
 *   developers and self-hosters: the glasses-app page the QR opens and the relay origin.
 *
 * Also reads `detectedLocale` from `game.i18n.lang` (I18N-01, locale detection at
 * module boot).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */

import { DEFAULT_APP_URL, DEFAULT_RELAY_URL } from '@evf/shared-protocol';
import { createPairG2App } from './direct/PairG2App.js';
import type { PairingEndpoints } from './direct/pairing-flow.js';
import { registerPairingSettings } from './direct/pairing-store.js';
import { registerPairShortcuts } from './direct/players-menu.js';
import type { Projector } from './direct/projector.js';
import { MODULE_ID } from './module-id.js';

/** Setting key: page of the glasses app the pairing QR opens. */
export const APP_URL_SETTING = 'appUrl' as const;
/** Setting key: relay origin (`wss://…`). */
export const RELAY_URL_SETTING = 'relayUrl' as const;

/**
 * Locale detected from `game.i18n.lang` at module init time.
 * Normalised to primary subtag only (e.g. "it-IT" → "it").
 */
export let detectedLocale = 'en';

/** Reads a string setting, falling back to `fallback` when empty or unset. */
function stringSetting(key: string, fallback: string): string {
  const value = game.settings.get(MODULE_ID, key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Current app page + relay (module settings, defaults = production). */
export function pairingEndpoints(): PairingEndpoints {
  return {
    appUrl: stringSetting(APP_URL_SETTING, DEFAULT_APP_URL),
    relayUrl: stringSetting(RELAY_URL_SETTING, DEFAULT_RELAY_URL),
  };
}

/**
 * Registers settings, the pairing menu and its shortcuts. Must be called inside
 * `Hooks.once("init")`.
 *
 * @param projector - projector instance shared with the pairing window
 */
export function registerSettings(projector: Projector): void {
  // I18N-01: detect locale at module boot, normalise to primary tag. Guarded because
  // `game.i18n` may be undefined at `init` on some Foundry v13 builds (HUMAN-UAT).
  const lang = game.i18n?.lang ?? 'en';
  detectedLocale = lang.split('-')[0] || 'en';

  registerPairingSettings();
  game.settings.register(MODULE_ID, APP_URL_SETTING, {
    name: 'evf.settings.app_url',
    hint: 'evf.settings.app_url_hint',
    scope: 'client',
    config: true,
    type: String,
    default: DEFAULT_APP_URL,
  });
  game.settings.register(MODULE_ID, RELAY_URL_SETTING, {
    name: 'evf.settings.relay_url',
    hint: 'evf.settings.relay_url_hint',
    scope: 'client',
    config: true,
    type: String,
    default: DEFAULT_RELAY_URL,
    requiresReload: true,
  });

  const PairG2App = createPairG2App(projector, pairingEndpoints);
  game.settings.registerMenu(MODULE_ID, 'pairG2', {
    name: 'evf.settings.pair_button',
    label: 'evf.settings.pair_button',
    hint: 'evf.settings.pair_hint',
    icon: 'fas fa-glasses',
    type: PairG2App,
    restricted: false,
  });
  registerPairShortcuts((actorId) => {
    PairG2App.openFor(actorId).catch((err: unknown) => {
      console.error('[EVF] could not open the pairing window', err);
    });
  });
}
