/**
 * HUD strings — Italian (MVP) + English (canonical fallback), Specs.md §7.16.
 *
 * Every string is a plain template; width budgeting happens in the renderers via
 * pixel measurement (`text/measure.ts`), and the INV-1 tests render every state in
 * both locales at min/max content.
 *
 * @see docs/design/g2-thirds-layout.md
 */
import type { AbilityKey, SkillKey } from '@evf/shared-protocol';
import type { AppSettings } from '../state/app-store.js';

/** Effective HUD locale (resolved by `resolveLocale` in `state/app-store.ts`). */
export type HudLocale = 'it' | 'en';

/** Next locale in the on-glasses cycle `auto → it → en → auto`. */
export function nextLocaleSetting(current: AppSettings['locale']): AppSettings['locale'] {
  return current === 'auto' ? 'it' : current === 'it' ? 'en' : 'auto';
}

export interface HudStrings {
  pages: readonly [string, string, string, string];
  level: string;
  exploration: string;
  yourTurn: string;
  turnOf: string;
  hp: string;
  ac: string;
  temp: string;
  abilities: Record<AbilityKey, string>;
  skills: Record<SkillKey, string>;
  slots: string;
  conditions: string;
  noConditions: string;
  exhaustion: string;
  deathSaves: string;
  passivePerception: string;
  weapons: string;
  items: string;
  spells: string;
  noSpells: string;
  concentration: string;
  scene: string;
  noScene: string;
  log: string;
  emptyLog: string;
  party: string;
  initiative: string;
  recent: string;
  actions: string;
  attack: string;
  spellsMenu: string;
  itemsMenu: string;
  optionsMenu: string;
  options: string;
  target: string;
  noTarget: string;
  ft: string;
  advantage: Record<'normal' | 'advantage' | 'disadvantage', string>;
  slotTitle: string;
  noSlots: string;
  cantrip: string;
  result: string;
  pending: string;
  outcomes: Record<
    'hit' | 'miss' | 'save_success' | 'save_fail' | 'damage_dealt' | 'no_roll',
    string
  >;
  damage: string;
  done: string;
  failed: string;
  errors: Record<
    | 'no-targets'
    | 'out-of-range'
    | 'out-of-resource'
    | 'wrong-turn'
    | 'concentration-required'
    | 'gm-rejected',
    string
  >;
  reactionTitle: string;
  reactionTrigger: string;
  expiresIn: string;
  ignore: string;
  opportunityAttack: string;
  shield: string;
  counterspell: string;
  offlineTitle: string;
  offlineCauses: Record<'no-gm' | 'network' | 'auth' | 'background', string>;
  retryIn: (seconds: number, attempt: number) => string;
  dataAge: (minutes: number) => string;
  frozen: string;
  /** Action economy row labels (Action / Bonus action / Reaction), ≤ 42 px each. */
  economy: { action: string; bonus: string; reaction: string };
  /** Movement row prefix (`Mov 25/30 ft`). */
  movement: string;
  /** Actions-list / menu / result title for ending the turn (M03). */
  endTurn: string;
  menu: {
    nextPage: string;
    zoomIn: string;
    zoomOut: string;
    follow: string;
    advantage: string;
    endTurn: string;
    language: string;
    reconnect: string;
  };
  /** Options list (column C) labels, showing the current value. */
  option: {
    nextPage: string;
    zoom: (dir: '+' | '-', px: number) => string;
    follow: (on: boolean) => string;
    language: (setting: AppSettings['locale']) => string;
  };
  footer: {
    root: string;
    list: string;
    target: string;
    result: string;
    reaction: string;
    offline: string;
    exit: string;
    cancel: string;
  };
  unpaired: readonly string[];
  revoked: string;
  connectingTo: (server: string) => string;
  steps: {
    server: string;
    login: (user: string) => string;
    gm: (gm: string) => string;
    character: (actor: string) => string;
    scene: string;
  };
}

const IT: HudStrings = {
  pages: ['Principale', 'Combattimento', 'Abilità & TS', 'Incantesimi/Inv.'],
  level: 'Liv',
  exploration: 'Esplorazione',
  yourTurn: 'TUO TURNO',
  turnOf: 'Turno',
  hp: 'PF',
  ac: 'CA',
  temp: 'temp',
  abilities: { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' },
  skills: {
    acr: 'Acrobazia',
    ani: 'Addestrare animali',
    arc: 'Arcano',
    ath: 'Atletica',
    dec: 'Inganno',
    his: 'Storia',
    ins: 'Intuizione',
    itm: 'Intimidazione',
    inv: 'Indagare',
    med: 'Medicina',
    nat: 'Natura',
    prc: 'Percezione',
    prf: 'Intrattenimento',
    per: 'Persuasione',
    rel: 'Religione',
    slt: 'Rapidità di mano',
    ste: 'Furtività',
    sur: 'Sopravvivenza',
  },
  slots: 'Slot',
  conditions: 'Condizioni',
  noConditions: 'nessuna',
  exhaustion: 'Esaurimento',
  deathSaves: 'TS morte',
  passivePerception: 'Perc. passiva',
  weapons: 'Armi',
  items: 'Oggetti',
  spells: 'Incantesimi',
  noSpells: 'nessun incantesimo',
  concentration: 'conc.',
  scene: 'SCENA',
  noScene: 'nessuna scena',
  log: 'Registro',
  emptyLog: '(vuoto)',
  party: 'Party',
  initiative: 'INIZIATIVA',
  recent: 'Ultimi eventi',
  actions: 'AZIONI',
  attack: 'Attacca',
  spellsMenu: 'Incantesimi…',
  itemsMenu: 'Oggetto…',
  optionsMenu: 'Opzioni…',
  options: 'OPZIONI',
  target: 'BERSAGLIO',
  noTarget: '(nessun bersaglio)',
  ft: 'ft',
  advantage: { normal: 'Vantaggio: no', advantage: 'Vantaggio: sì', disadvantage: 'Svantaggio' },
  slotTitle: 'SLOT',
  noSlots: 'nessuno slot libero',
  cantrip: 'T',
  result: 'ESITO',
  pending: 'in corso…',
  outcomes: {
    hit: 'COLPITO',
    miss: 'MANCATO',
    save_success: 'TS riuscito',
    save_fail: 'TS fallito',
    damage_dealt: 'danni inflitti',
    no_roll: 'eseguito',
  },
  damage: 'Danni',
  done: 'eseguito',
  failed: 'non riuscito',
  errors: {
    'no-targets': 'nessun bersaglio',
    'out-of-range': 'fuori portata',
    'out-of-resource': 'risorse esaurite',
    'wrong-turn': 'non è il tuo turno',
    'concentration-required': 'serve concentrazione',
    'gm-rejected': 'rifiutato dal GM',
  },
  reactionTitle: 'REAZIONE',
  reactionTrigger: 'Innesco',
  expiresIn: 'scade',
  ignore: 'Ignora',
  opportunityAttack: 'Att. opp.',
  shield: 'Scudo (1°)',
  counterspell: 'Controincant. 3°',
  offlineTitle: 'OFFLINE',
  offlineCauses: {
    'no-gm': 'nessun GM connesso',
    network: 'Foundry non risponde',
    auth: 'accesso rifiutato',
    background: 'telefono in background',
  },
  retryIn: (s, n) => `Riprovo tra ${s} s (#${n})`,
  dataAge: (m) => `Dati: ${m} min fa`,
  frozen: 'dati congelati',
  economy: { action: 'Az', bonus: 'Bon', reaction: 'Rea' },
  movement: 'Mov',
  endTurn: 'Fine turno',
  menu: {
    nextPage: 'Scheda: pagina succ.',
    zoomIn: 'Mappa: zoom +',
    zoomOut: 'Mappa: zoom -',
    follow: 'Mappa: segui/libera',
    advantage: 'Vantaggio/Svantaggio',
    endTurn: 'Fine turno',
    language: 'Lingua',
    reconnect: 'Riconnetti',
  },
  option: {
    nextPage: 'Scheda: pag. succ.',
    zoom: (d, px) => `Zoom ${d} (${px} px)`,
    follow: (on) => `Segui token: ${on ? 'sì' : 'no'}`,
    language: (l) => `Lingua: ${l === 'auto' ? 'auto' : l.toUpperCase()}`,
  },
  footer: {
    root: '● azioni  ●● esci',
    list: '● ok  ●● indietro',
    target: '● tira  ●● indietro',
    result: '● azioni ●● chiudi',
    reaction: '● ok ●● ignora',
    offline: '● riprova  ●● esci',
    exit: '●● esci',
    cancel: '●● annulla',
  },
  unpaired: [
    'Occhiali non ancora associati a Foundry.',
    '1. Su Foundry: Impostazioni > Configura moduli > EvenFoundryVTT',
    '    > «Associa occhiali G2»: appare un QR',
    '2. Sul telefono: Even Realities App > scansiona il QR',
    '3. Fatto. Nessun server da installare, nessun URL.',
    'Aiuto: apri questa app sul telefono, pagina «Connessione».',
  ],
  revoked: 'Associazione revocata dal GM.',
  connectingTo: (s) => `Collegamento a ${s} …`,
  steps: {
    server: 'server raggiungibile (HTTPS)',
    login: (u) => `accesso come «${u}»`,
    gm: (g) => `GM connesso: ${g}`,
    character: (a) => `ricevo scheda di ${a}`,
    scene: 'ricevo scena',
  },
};

const EN: HudStrings = {
  pages: ['Main', 'Combat', 'Skills & Saves', 'Spells/Items'],
  level: 'Lv',
  exploration: 'Exploration',
  yourTurn: 'YOUR TURN',
  turnOf: 'Turn',
  hp: 'HP',
  ac: 'AC',
  temp: 'temp',
  abilities: { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' },
  skills: {
    acr: 'Acrobatics',
    ani: 'Animal Handling',
    arc: 'Arcana',
    ath: 'Athletics',
    dec: 'Deception',
    his: 'History',
    ins: 'Insight',
    itm: 'Intimidation',
    inv: 'Investigation',
    med: 'Medicine',
    nat: 'Nature',
    prc: 'Perception',
    prf: 'Performance',
    per: 'Persuasion',
    rel: 'Religion',
    slt: 'Sleight of Hand',
    ste: 'Stealth',
    sur: 'Survival',
  },
  slots: 'Slots',
  conditions: 'Conditions',
  noConditions: 'none',
  exhaustion: 'Exhaustion',
  deathSaves: 'Death saves',
  passivePerception: 'Passive Perc.',
  weapons: 'Weapons',
  items: 'Items',
  spells: 'Spells',
  noSpells: 'no spells',
  concentration: 'conc.',
  scene: 'SCENE',
  noScene: 'no scene',
  log: 'Log',
  emptyLog: '(empty)',
  party: 'Party',
  initiative: 'INITIATIVE',
  recent: 'Recent events',
  actions: 'ACTIONS',
  attack: 'Attack',
  spellsMenu: 'Spells…',
  itemsMenu: 'Item…',
  optionsMenu: 'Options…',
  options: 'OPTIONS',
  target: 'TARGET',
  noTarget: '(no target)',
  ft: 'ft',
  advantage: { normal: 'Advantage: no', advantage: 'Advantage: yes', disadvantage: 'Disadvantage' },
  slotTitle: 'SLOT',
  noSlots: 'no free slot',
  cantrip: 'C',
  result: 'RESULT',
  pending: 'in progress…',
  outcomes: {
    hit: 'HIT',
    miss: 'MISS',
    save_success: 'save passed',
    save_fail: 'save failed',
    damage_dealt: 'damage dealt',
    no_roll: 'done',
  },
  damage: 'Damage',
  done: 'done',
  failed: 'failed',
  errors: {
    'no-targets': 'no targets',
    'out-of-range': 'out of range',
    'out-of-resource': 'out of resources',
    'wrong-turn': 'not your turn',
    'concentration-required': 'concentration required',
    'gm-rejected': 'rejected by GM',
  },
  reactionTitle: 'REACTION',
  reactionTrigger: 'Trigger',
  expiresIn: 'ends',
  ignore: 'Ignore',
  opportunityAttack: 'Opp. att.',
  shield: 'Shield (1st)',
  counterspell: 'Counterspell 3rd',
  offlineTitle: 'OFFLINE',
  offlineCauses: {
    'no-gm': 'no GM connected',
    network: 'Foundry not responding',
    auth: 'login rejected',
    background: 'phone in background',
  },
  retryIn: (s, n) => `Retry in ${s} s (#${n})`,
  dataAge: (m) => `Data: ${m} min ago`,
  frozen: 'data frozen',
  economy: { action: 'Act', bonus: 'Bon', reaction: 'Rea' },
  movement: 'Mov',
  endTurn: 'End turn',
  menu: {
    nextPage: 'Sheet: next page',
    zoomIn: 'Map: zoom +',
    zoomOut: 'Map: zoom -',
    follow: 'Map: follow/free',
    advantage: 'Advantage/Disadv.',
    endTurn: 'End turn',
    language: 'Language',
    reconnect: 'Reconnect',
  },
  option: {
    nextPage: 'Sheet: next page',
    zoom: (d, px) => `Zoom ${d} (${px} px)`,
    follow: (on) => `Follow token: ${on ? 'on' : 'off'}`,
    language: (l) => `Language: ${l === 'auto' ? 'auto' : l.toUpperCase()}`,
  },
  footer: {
    root: '● actions  ●● exit',
    list: '● ok  ●● back',
    target: '● roll  ●● back',
    result: '● actions ●● close',
    reaction: '● ok ●● ignore',
    offline: '● retry  ●● exit',
    exit: '●● exit',
    cancel: '●● cancel',
  },
  unpaired: [
    'Glasses not paired with Foundry yet.',
    '1. On Foundry: Settings > Configure modules > EvenFoundryVTT',
    '    > «Pair G2 glasses»: a QR code appears',
    '2. On the phone: Even Realities App > scan the QR',
    '3. Done. No server to install, no URL to type.',
    'Help: open this app on the phone, «Connection» page.',
  ],
  revoked: 'Pairing revoked by the GM.',
  connectingTo: (s) => `Connecting to ${s} …`,
  steps: {
    server: 'server reachable (HTTPS)',
    login: (u) => `signed in as «${u}»`,
    gm: (g) => `GM connected: ${g}`,
    character: (a) => `receiving sheet of ${a}`,
    scene: 'receiving scene',
  },
};

/** Returns the string table for `locale`. */
export function strings(locale: HudLocale): HudStrings {
  return locale === 'it' ? IT : EN;
}
