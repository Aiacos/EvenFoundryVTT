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
  causeCodePending:
    'code waiting for an answer from Foundry — keep open the Foundry tab that showed the QR (the window may be closed)',
  causeActor:
    'Foundry cannot find your character (deleted, or no longer yours) — check it in Foundry',
  causeReplaced: 'another app took this pairing — tap Reconnect to take it back here',
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
  scanHint:
    'Hold the phone 15–20 cm away: the QR should fill about half of the photo. In Foundry, «Enlarge QR» makes it bigger.',
  noQrInPhoto:
    'No QR found in the photo: move closer until the QR fills about half of it (or «Enlarge QR» in Foundry), hold still and try again — or type the code below.',
  photoFormat: (mime: string) =>
    `This photo cannot be read (${mime}): type the code shown under the QR below.`,
  noPhoto: 'No photo received. If the camera does not open, type the code below.',
  cameraUnavailable: 'The camera is not available here: type the code shown under the QR below.',
  notPairingQr: 'That is not an EvenFoundryVTT pairing QR.',
  orCode: 'or enter the code',
  code: 'Code (or the whole link)',
  connect: 'Connect',
  invalidCode: 'Invalid code: 16 characters, e.g. 7QK3-MX9P-2HRA-C4TE.',
  help: 'The code is shown under the QR in Foundry (single use, 5 min). No Foundry login is needed on the phone.',
  pairFailed: (message: string) => `Pairing failed: ${message}`,
  codeUsed: 'Code already used on this phone: make a new QR in Foundry.',
  codeUnanswered:
    'No answer to the code: QR expired, cancelled or already used — make a new QR in Foundry.',
  legacyLink: 'QR from an old version of the module: update EvenFoundryVTT in Foundry.',
  invalidLink: 'The QR link carries no valid code: type the 16-character code shown under the QR.',
  linkUsedKept: 'Code already used on this phone: the current pairing is kept.',
  repair: 'Pair again',
  bootFailed: (message: string) => `The app failed to start: ${message}`,
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
  causeCodePending:
    'codice in attesa di risposta da Foundry — tieni aperta la scheda di Foundry che ha mostrato il QR (la finestra si può chiudere)',
  causeActor:
    'Foundry non trova il tuo personaggio (eliminato, o non più tuo) — controllalo in Foundry',
  causeReplaced: "un'altra app ha preso questa associazione — tocca Riconnetti per riprenderla qui",
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
  scanHint:
    'Tieni il telefono a 15–20 cm: il QR deve riempire circa metà della foto. In Foundry «Ingrandisci QR» lo fa più grande.',
  noQrInPhoto:
    'Nessun QR nella foto: avvicinati finché il QR ne riempie circa metà (o «Ingrandisci QR» in Foundry), tieni fermo e riprova — o digita il codice qui sotto.',
  photoFormat: (mime: string) =>
    `Foto non leggibile (${mime}): digita il codice mostrato sotto il QR.`,
  noPhoto: 'Nessuna foto ricevuta. Se la fotocamera non si apre, digita il codice qui sotto.',
  cameraUnavailable: 'Fotocamera non disponibile qui: digita il codice mostrato sotto il QR.',
  notPairingQr: 'Questo non è un QR di associazione EvenFoundryVTT.',
  orCode: 'oppure inserisci il codice',
  code: 'Codice (o il link intero)',
  connect: 'Collega',
  invalidCode: 'Codice non valido: 16 caratteri, es. 7QK3-MX9P-2HRA-C4TE.',
  help: 'Il codice è sotto il QR su Foundry (monouso, 5 min). Sul telefono non serve nessun login a Foundry.',
  pairFailed: (message) => `Collegamento non riuscito: ${message}`,
  codeUsed: 'Codice già usato su questo telefono: genera un nuovo QR in Foundry.',
  codeUnanswered:
    'Nessuna risposta al codice: QR scaduto, annullato o già usato — genera un nuovo QR in Foundry.',
  legacyLink: 'QR di una versione vecchia del modulo: aggiorna EvenFoundryVTT in Foundry.',
  invalidLink:
    'Il link del QR non contiene un codice valido: digita il codice di 16 caratteri mostrato sotto il QR.',
  linkUsedKept: "Codice già usato su questo telefono: l'associazione attuale resta valida.",
  repair: 'Collega di nuovo',
  bootFailed: (message) => `L'app non si è avviata: ${message}`,
};

/** Returns the string table for a locale. */
export function phoneStrings(locale: 'it' | 'en'): PhoneStrings {
  return locale === 'it' ? IT : EN;
}
