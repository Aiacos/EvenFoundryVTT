/**
 * Bundled fallback i18n catalog for the phone-WebView wizard.
 *
 * The wizard normally fetches strings from the bridge (`GET {bridgeUrl}/v1/i18n/{lang}`),
 * but **Step 1 is the step where the user enters the bridge URL** — so there is no bridge
 * to fetch from yet (chicken-and-egg). Without a bundled catalog the UI would render raw
 * key names (`evf.wizard.step1.title`, …). This catalog ships the strings in the bundle so
 * every step is readable immediately; the bridge-fetched catalog is merged ON TOP and may
 * override/extend it (see `wizard.ts` initWizard + `makeT`).
 *
 * This bundle is the source of truth for wizard strings. Keep its keys in sync with
 * `ALL_I18N_KEYS` (wizard.ts). If the bridge later serves any of these (via
 * `packages/foundry-module/lang/{en,it}.json` → `GET /v1/i18n/{lang}`), the fetched value
 * overrides the bundled one at runtime.
 *
 * Placeholders: `{n}`/`{total}` (step indicator), `{name}`/`{class}` (character),
 * `{url}` (bridge) — interpolated by `makeT`.
 */

/** IT/EN wizard strings, bundled so the UI is readable before the bridge connects. */
export const DEFAULT_WIZARD_CATALOG: Record<'it' | 'en', Record<string, string>> = {
  it: {
    'evf.wizard.step_indicator': 'Passo {n} di {total}',

    // Step 1 — connection / profile
    'evf.wizard.step1.title': 'Connetti al bridge',
    'evf.wizard.step1.saved_profiles_label': 'Profili salvati',
    'evf.wizard.step1.no_profiles': 'Nessun profilo salvato',
    'evf.wizard.step1.manual_url_label': 'Indirizzo del bridge (URL)',
    'evf.wizard.step1.url_hint': 'Es. https://evf-bridge.tuodominio.net',
    'evf.wizard.step1.url_error_format':
      'URL non valido. Usa un indirizzo https:// completo, senza spazi.',
    'evf.wizard.step1.profile_corrupt':
      'Profilo salvato danneggiato. Reinserisci l’URL manualmente.',

    // Step 2 — access token
    'evf.wizard.step2.title': 'Inserisci il token di accesso',
    'evf.wizard.step2.paste_label': 'Token di accesso (valido 24 ore)',
    'evf.wizard.step2.show_toggle': 'Mostra',
    'evf.wizard.step2.hide_toggle': 'Nascondi',
    'evf.wizard.step2.paste_btn': 'Incolla',
    'evf.wizard.step2.short_token_hint': 'Il token sembra troppo corto.',
    'evf.wizard.step2.cta': 'Connetti',
    'evf.wizard.step2.connecting': 'Connessione in corso…',
    'evf.wizard.step2.error.401': 'Token non valido o scaduto.',
    'evf.wizard.step2.error.403': 'Questo token non ha accesso.',
    'evf.wizard.step2.error.timeout': 'Il bridge non risponde (timeout).',
    'evf.wizard.step2.error.unreachable': 'Bridge irraggiungibile. Controlla URL e rete.',
    'evf.wizard.step2.error.version_mismatch':
      'Versione del bridge incompatibile. Aggiorna il bridge.',

    // Step 3 — character selection
    'evf.wizard.step3.title': 'Scegli il personaggio',
    'evf.wizard.step3.loading': 'Caricamento personaggi…',
    'evf.wizard.step3.cta': 'Conferma',
    'evf.wizard.step3.empty': 'Nessun personaggio disponibile su questo bridge.',
    'evf.wizard.step3.empty.retry': 'Riprova',
    'evf.wizard.step3.error.fetch': 'Impossibile caricare i personaggi.',
    'evf.wizard.step3.error.go_back': 'Torna indietro',

    // Completion
    'evf.wizard.complete.heading': 'Tutto pronto!',
    'evf.wizard.complete.character': 'Personaggio: {name} ({class})',
    'evf.wizard.complete.bridge': 'Bridge: {url}',
    'evf.wizard.complete.instructions':
      'Indossa i G2 e guarda il tavolo: la scheda apparirà nell’HUD.',
    'evf.wizard.complete.repair': 'Riconfigura la connessione',

    // Auto-connect / repair (saved-profile reconnect failure)
    'evf.autoconnect.connecting': 'Riconnessione in corso…',
    'evf.autoconnect.error.unreachable': 'Bridge non raggiungibile.',
    'evf.autoconnect.repair.title': 'Connessione non riuscita',
    'evf.autoconnect.repair.reason': 'Motivo:',
    'evf.autoconnect.repair.body': 'Non è stato possibile riconnettersi al bridge salvato.',
    'evf.autoconnect.repair.cta': 'Riconfigura',

    // Buttons
    'evf.btn.back': 'Indietro',
    'evf.btn.continue': 'Continua',
    'evf.btn.edit_url': 'Modifica URL',
    'evf.btn.retry': 'Riprova',
  },
  en: {
    'evf.wizard.step_indicator': 'Step {n} of {total}',

    'evf.wizard.step1.title': 'Connect to your bridge',
    'evf.wizard.step1.saved_profiles_label': 'Saved profiles',
    'evf.wizard.step1.no_profiles': 'No saved profiles',
    'evf.wizard.step1.manual_url_label': 'Bridge URL',
    'evf.wizard.step1.url_hint': 'e.g. https://evf-bridge.yourdomain.net',
    'evf.wizard.step1.url_error_format':
      'Invalid URL. Use a full https:// address, with no spaces.',
    'evf.wizard.step1.profile_corrupt': 'Saved profile is corrupted. Re-enter the URL manually.',

    'evf.wizard.step2.title': 'Enter your access token',
    'evf.wizard.step2.paste_label': 'Access token (valid 24 hours)',
    'evf.wizard.step2.show_toggle': 'Show',
    'evf.wizard.step2.hide_toggle': 'Hide',
    'evf.wizard.step2.paste_btn': 'Paste',
    'evf.wizard.step2.short_token_hint': 'That token looks too short.',
    'evf.wizard.step2.cta': 'Connect',
    'evf.wizard.step2.connecting': 'Connecting…',
    'evf.wizard.step2.error.401': 'Invalid or expired token.',
    'evf.wizard.step2.error.403': 'This token doesn’t have access.',
    'evf.wizard.step2.error.timeout': 'The bridge timed out.',
    'evf.wizard.step2.error.unreachable': 'Bridge unreachable. Check the URL and your network.',
    'evf.wizard.step2.error.version_mismatch': 'Incompatible bridge version. Update the bridge.',

    'evf.wizard.step3.title': 'Choose your character',
    'evf.wizard.step3.loading': 'Loading characters…',
    'evf.wizard.step3.cta': 'Confirm',
    'evf.wizard.step3.empty': 'No characters available on this bridge.',
    'evf.wizard.step3.empty.retry': 'Retry',
    'evf.wizard.step3.error.fetch': 'Couldn’t load characters.',
    'evf.wizard.step3.error.go_back': 'Go back',

    'evf.wizard.complete.heading': 'You’re all set!',
    'evf.wizard.complete.character': 'Character: {name} ({class})',
    'evf.wizard.complete.bridge': 'Bridge: {url}',
    'evf.wizard.complete.instructions':
      'Put on your G2 and look at the table — your sheet appears in the HUD.',
    'evf.wizard.complete.repair': 'Reconfigure connection',

    'evf.autoconnect.connecting': 'Reconnecting…',
    'evf.autoconnect.error.unreachable': 'Bridge unreachable.',
    'evf.autoconnect.repair.title': 'Connection failed',
    'evf.autoconnect.repair.reason': 'Reason:',
    'evf.autoconnect.repair.body': 'Couldn’t reconnect to the saved bridge.',
    'evf.autoconnect.repair.cta': 'Reconfigure',

    'evf.btn.back': 'Back',
    'evf.btn.continue': 'Continue',
    'evf.btn.edit_url': 'Edit URL',
    'evf.btn.retry': 'Retry',
  },
};

/** Bundled catalog for the given primary locale tag, falling back to English. */
export function defaultWizardCatalog(lang: string): Record<string, string> {
  return DEFAULT_WIZARD_CATALOG[lang as 'it' | 'en'] ?? DEFAULT_WIZARD_CATALOG.en;
}
