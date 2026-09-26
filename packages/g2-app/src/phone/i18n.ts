/**
 * Phone page strings (P02 / P03), IT + EN — EN is the canonical fallback (Specs.md §7.16.5).
 * Terminology matches the glasses UI and the Foundry pairing window (ADR-0019): «Collega
 * occhiali G2», «Scansiona QR», 16-char code.
 *
 * @see docs/design/g2-thirds-layout.md §P02 §P03
 */

const EN = {
  titleConnection: 'G2 HUD · Connection',
  titleSetup: 'G2 HUD · First setup',
  status: 'Status',
  server: 'Relay',
  user: 'Foundry',
  character: 'Character',
  gm: 'GM',
  latency: 'Latency',
  language: 'Language',
  map: 'Map',
  sheet: 'Sheet',
  statusOnline: 'Connected',
  statusConnecting: 'Connecting…',
  statusOffline: 'Offline',
  retryIn: (s: number, attempt: number) => `retrying in ${s} s (attempt ${attempt})`,
  causeNoProjector:
    'the Foundry tab that paired these glasses is closed — open Foundry there and they reconnect by themselves',
  causeNetwork: 'relay not reachable',
  causeBackground: 'app in background',
  gmOnline: (name: string) => `${name} (online)`,
  autoLocale: 'Follow Foundry',
  italian: 'Italiano',
  english: 'English',
  cellSize: (px: number) => `Cell ${px} px`,
  mapArt: 'Map art',
  mapPixel: (n: number) => `Pixels ×${n}`,
  followToken: 'Follow my token',
  autoSheet: 'Automatic sheet page',
  reconnect: 'Reconnect',
  disconnect: 'Disconnect',
  diagnostics: 'Diagnostics',
  moduleVersion: 'EVF module',
  noErrors: 'No recent errors.',
  debugLog: 'Debug log (latest first)',
  debugEmpty: 'No debug events yet.',
  forget: 'Forget pairing',
  unknown: '—',
  noPairing: 'No pairing found.',
  revokedNotice: 'The glasses were disconnected from Foundry. Connect them again.',
  easiest: 'In Foundry:',
  easiestSteps:
    'right-click your name in the Players list › «Connect G2 glasses» (or Alt+G), then scan the QR.',
  scan: 'Scan QR',
  noQrInPhoto: 'No QR found in the photo: frame the whole QR and try again.',
  notPairingQr: 'That is not an EvenFoundryVTT pairing QR.',
  orCode: 'or enter the code',
  code: 'Code',
  connect: 'Connect',
  invalidCode: 'Invalid code: 16 characters, e.g. 7QK3-MX9P-2HRA-C4TE.',
  help: 'The code is shown under the QR in Foundry (single use, 5 min). No Foundry login is needed on the phone.',
};

/** String table shape (EN is canonical). */
export type PhoneStrings = typeof EN;

const IT: PhoneStrings = {
  titleConnection: 'G2 HUD · Connessione',
  titleSetup: 'G2 HUD · Prima configurazione',
  status: 'Stato',
  server: 'Relay',
  user: 'Foundry',
  character: 'PG',
  gm: 'GM',
  latency: 'Latenza',
  language: 'Lingua',
  map: 'Mappa',
  sheet: 'Scheda',
  statusOnline: 'Collegato',
  statusConnecting: 'Collegamento…',
  statusOffline: 'Non collegato',
  retryIn: (s, attempt) => `riprovo tra ${s} s (tent. ${attempt})`,
  causeNoProjector:
    'la scheda di Foundry che ha collegato questi occhiali è chiusa — riapri Foundry lì e si ricollegano da soli',
  causeNetwork: 'relay non raggiungibile',
  causeBackground: 'app in background',
  gmOnline: (name) => `${name} (online)`,
  autoLocale: 'Segui Foundry',
  italian: 'Italiano',
  english: 'English',
  cellSize: (px) => `Casella ${px} px`,
  mapArt: 'Arte mappa',
  mapPixel: (n) => `Pixel ×${n}`,
  followToken: 'Segui il mio token',
  autoSheet: 'Pagina scheda automatica',
  reconnect: 'Riconnetti',
  disconnect: 'Disconnetti',
  diagnostics: 'Diagnostica',
  moduleVersion: 'Modulo EVF',
  noErrors: 'Nessun errore recente.',
  debugLog: 'Log di debug (più recenti in alto)',
  debugEmpty: 'Nessun evento di debug.',
  forget: 'Dimentica associazione',
  unknown: '—',
  noPairing: 'Nessuna associazione trovata.',
  revokedNotice: 'Gli occhiali sono stati scollegati da Foundry. Collegali di nuovo.',
  easiest: 'Su Foundry:',
  easiestSteps:
    'tasto destro sul tuo nome nella lista giocatori › «Collega occhiali G2» (o Alt+G), poi inquadra il QR.',
  scan: 'Scansiona QR',
  noQrInPhoto: 'Nessun QR nella foto: inquadra tutto il QR e riprova.',
  notPairingQr: 'Questo non è un QR di associazione EvenFoundryVTT.',
  orCode: 'oppure inserisci il codice',
  code: 'Codice',
  connect: 'Collega',
  invalidCode: 'Codice non valido: 16 caratteri, es. 7QK3-MX9P-2HRA-C4TE.',
  help: 'Il codice è sotto il QR su Foundry (monouso, 5 min). Sul telefono non serve nessun login a Foundry.',
};

/** Returns the string table for a locale. */
export function phoneStrings(locale: 'it' | 'en'): PhoneStrings {
  return locale === 'it' ? IT : EN;
}
