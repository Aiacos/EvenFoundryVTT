/**
 * HUD strings — Italian (MVP) + English (canonical fallback), Specs.md §7.16.
 *
 * Two families:
 * - image-zone strings (header, sheet, portrait, map, full screens) are drawn with the
 *   caps bitmap faces of `@evf/shared-render` and upper-cased at draw time; the glyph
 *   coverage test renders every one of them in both locales;
 * - context strings (zone E) go to firmware text containers and are width-budgeted by
 *   pretext measurement (`text/measure.ts`).
 *
 * @see docs/design/g2-sheet-ux.html
 */
import type { AbilityKey, SkillKey } from '@evf/shared-protocol';
import type { AppSettings } from '../state/app-store.js';

/** Effective HUD locale (resolved by `resolveLocale` in `state/app-store.ts`). */
export type HudLocale = 'it' | 'en';

/** Next locale in the on-glasses cycle `auto → it → en → auto`. */
export function nextLocaleSetting(current: AppSettings['locale']): AppSettings['locale'] {
  return current === 'auto' ? 'it' : current === 'it' ? 'en' : 'auto';
}

/** Condition chip family: hourglass (concentration), skull (harmful), star (other). */
export type ConditionKind = 'conc' | 'bad' | 'good';

/**
 * dnd5e status ids (`actor.statuses`) the HUD labels; unknown ids are shown verbatim.
 * Kinds follow the design: concentration = hourglass, incapacitating/harmful = skull.
 */
export const CONDITION_KINDS: Readonly<Record<string, ConditionKind>> = {
  concentrating: 'conc',
  blinded: 'bad',
  charmed: 'bad',
  deafened: 'bad',
  frightened: 'bad',
  grappled: 'bad',
  incapacitated: 'bad',
  paralyzed: 'bad',
  petrified: 'bad',
  poisoned: 'bad',
  prone: 'bad',
  restrained: 'bad',
  stunned: 'bad',
  unconscious: 'bad',
  dead: 'bad',
  bleeding: 'bad',
  cursed: 'bad',
  surprised: 'bad',
  sleeping: 'bad',
  silenced: 'bad',
  exhaustion: 'bad',
  invisible: 'good',
  hiding: 'good',
  dodging: 'good',
  flying: 'good',
  hovering: 'good',
  ethereal: 'good',
  burrowing: 'good',
  marked: 'good',
  stable: 'good',
  transformed: 'good',
  blessed: 'good',
};

/** Labels of {@link CONDITION_KINDS} ids. */
export type ConditionLabels = Readonly<Record<keyof typeof CONDITION_KINDS, string>>;

export interface HudStrings {
  // ── Zone A/B/C/D (bitmap caps) ──────────────────────────────────────────────
  level: string;
  yourTurn: string;
  turnOf: string;
  hitPoints: string;
  ac: string;
  temp: string;
  initiativeShort: string;
  speedShort: string;
  profShort: string;
  economyShort: { action: string; bonus: string; reaction: string };
  ft: string;
  noConditions: string;
  conditions: ConditionLabels;
  /** Exhaustion chip (`ESAUSTO 2`). */
  exhaustion: (n: number) => string;
  abilities: Record<AbilityKey, string>;
  skills: Record<SkillKey, string>;
  tabs: { abilities: string; saves: string };
  savesTitle: string;
  skillsTitle: string;
  profLegend: string;
  passivePerception: (n: number) => string;
  darkvision: (ft: number) => string;
  passiveInsight: (ins: number, inv: number) => string;
  deathTitle: string;
  deathSuccess: string;
  deathFailure: string;
  deathHint: string;
  north: string;
  // ── Full screens S10 / S11 (bitmap caps) ─────────────────────────────────────
  appTitle: string;
  unpairedSubtitle: string;
  revokedSubtitle: string;
  pairSteps: readonly (readonly [string, string])[];
  scan: string;
  exitHint: string;
  connectingTo: (server: string) => string;
  steps: {
    server: string;
    login: (user: string) => string;
    gm: (gm: string) => string;
    character: (actor: string) => string;
    scene: string;
  };
  cancelHint: string;
  // ── Zone E (firmware text) ────────────────────────────────────────────────────
  exploration: string;
  noScene: string;
  emptyLog: string;
  initiative: string;
  round: (n: number) => string;
  actions: string;
  spellsMenu: string;
  itemsMenu: string;
  featsMenu: string;
  optionsMenu: string;
  spells: string;
  items: string;
  feats: string;
  /** Right-column tag of a PHB 2024 origin feat. */
  featOrigin: string;
  options: string;
  slotTitle: string;
  noSlots: string;
  target: string;
  noTarget: string;
  cantrip: string;
  advantage: Record<'normal' | 'advantage' | 'disadvantage', string>;
  result: string;
  pending: string;
  outcomes: Record<
    'hit' | 'miss' | 'save_success' | 'save_fail' | 'damage_dealt' | 'no_roll',
    string
  >;
  concentration: string;
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
  expiresIn: (seconds: number) => string;
  reactionTrigger: (source: string) => string;
  ignore: string;
  opportunityAttack: string;
  shield: string;
  counterspell: string;
  requestTitle: string;
  requestFrom: string;
  requestSave: (ability: string) => string;
  requestCheck: (ability: string) => string;
  requestSkill: (skill: string) => string;
  requestDc: (dc: number) => string;
  /** «Done»: the player rolled real dice at the table. */
  requestOk: string;
  /** Roll the request in Foundry (`skill-check` tool). */
  requestRollFoundry: string;
  downTitle: string;
  downRoll: string;
  downTally: (success: number, failure: number) => string;
  offlineTitle: string;
  offlineCauses: Record<'no-gm' | 'network' | 'auth' | 'background', string>;
  retryIn: (seconds: number, attempt: number) => string;
  dataAge: (minutes: number) => string;
  frozen: string;
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
  option: {
    nextPage: string;
    zoom: (dir: '+' | '-', px: number) => string;
    follow: (on: boolean) => string;
    language: (setting: AppSettings['locale']) => string;
  };
  footer: {
    root: string;
    combat: string;
    list: string;
    target: string;
    result: string;
    reaction: string;
    request: string;
    offline: string;
  };
}

const IT: HudStrings = {
  level: 'LIV',
  yourTurn: 'TUO TURNO',
  turnOf: 'TURNO',
  hitPoints: 'PUNTI FERITA',
  ac: 'CA',
  temp: 'TEMP',
  initiativeShort: 'INIZ',
  speedShort: 'VEL',
  profShort: 'COMP',
  economyShort: { action: 'AZ', bonus: 'BON', reaction: 'REA' },
  ft: 'FT',
  noConditions: 'NESSUNA CONDIZIONE',
  conditions: {
    concentrating: 'CONC.',
    blinded: 'ACCECATO',
    charmed: 'AFFASCINATO',
    deafened: 'ASSORDATO',
    frightened: 'SPAVENTATO',
    grappled: 'AFFERRATO',
    incapacitated: 'INCAPACITATO',
    paralyzed: 'PARALIZZATO',
    petrified: 'PIETRIFICATO',
    poisoned: 'AVVELENATO',
    prone: 'PRONO',
    restrained: 'TRATTENUTO',
    stunned: 'STORDITO',
    unconscious: 'PRIVO DI SENSI',
    dead: 'MORTO',
    bleeding: 'SANGUINANTE',
    cursed: 'MALEDETTO',
    surprised: 'SORPRESO',
    sleeping: 'ADDORMENTATO',
    silenced: 'SILENZIATO',
    exhaustion: 'ESAUSTO',
    invisible: 'INVISIBILE',
    hiding: 'NASCOSTO',
    dodging: 'SCHIVATA',
    flying: 'IN VOLO',
    hovering: 'SOSPESO',
    ethereal: 'ETEREO',
    burrowing: 'SCAVA',
    marked: 'MARCHIATO',
    stable: 'STABILE',
    transformed: 'TRASFORMATO',
    blessed: 'BENEDETTO',
  },
  exhaustion: (n) => `ESAUSTO ${n}`,
  abilities: { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' },
  skills: {
    acr: 'Acrobazia',
    ani: 'Addestrare animali',
    arc: 'Arcano',
    ath: 'Atletica',
    dec: 'Inganno',
    his: 'Storia',
    ins: 'Intuizione',
    itm: 'Intimidire',
    inv: 'Indagare',
    med: 'Medicina',
    nat: 'Natura',
    prc: 'Percezione',
    prf: 'Intrattenere',
    per: 'Persuasione',
    rel: 'Religione',
    slt: 'Rapidità di mano',
    ste: 'Furtività',
    sur: 'Sopravvivenza',
  },
  tabs: { abilities: 'CARATTERISTICHE', saves: 'TIRI SALVEZZA · ABILITÀ' },
  savesTitle: 'TIRI SALVEZZA',
  skillsTitle: 'ABILITÀ',
  profLegend: '● COMP · ◉ MAESTRIA',
  passivePerception: (n) => `PERCEZIONE PASSIVA ${n}`,
  darkvision: (ft) => `SCUROVISIONE ${ft}`,
  passiveInsight: (ins, inv) => `INTUIZIONE PASSIVA ${ins} · INDAGARE PASSIVO ${inv}`,
  deathTitle: 'TIRI CONTRO LA MORTE',
  deathSuccess: 'SUCCESSI',
  deathFailure: 'FALLIMENTI',
  deathHint: 'TIRA IL D20 SUL TAVOLO · GUARIRE AZZERA',
  north: 'N',
  appTitle: 'EVENFOUNDRYVTT',
  unpairedSubtitle: 'OCCHIALI NON ANCORA ASSOCIATI',
  revokedSubtitle: 'ASSOCIAZIONE REVOCATA DAL GM',
  pairSteps: [
    ['SU FOUNDRY: IMPOSTAZIONI › EVENFOUNDRYVTT', '› «ASSOCIA OCCHIALI G2» MOSTRA UN QR'],
    ['SUL TELEFONO: EVEN REALITIES APP', '› INQUADRA IL QR'],
    ['INDOSSA GLI OCCHIALI: LA SCHEDA COMPARE', 'DA SOLA, COLLEGATA AL TUO PERSONAGGIO'],
  ],
  scan: 'SCANSIONA',
  exitHint: '●● ESCI',
  connectingTo: (s) => `COLLEGAMENTO A ${s}`,
  steps: {
    server: 'SERVER RAGGIUNGIBILE (HTTPS)',
    login: (u) => `ACCESSO COME «${u}»`,
    gm: (g) => `GM CONNESSO: ${g}`,
    character: (a) => `RICEVO LA SCHEDA DI ${a}…`,
    scene: 'RICEVO LA SCENA',
  },
  cancelHint: '●● ANNULLA',
  exploration: 'esplorazione',
  noScene: 'nessuna scena',
  emptyLog: '(nessun evento)',
  initiative: 'Iniziativa',
  round: (n) => `round ${n}`,
  actions: 'Azioni',
  spellsMenu: 'Incantesimi…',
  itemsMenu: 'Oggetti…',
  featsMenu: 'Talenti…',
  optionsMenu: 'Opzioni…',
  spells: 'Incantesimi',
  items: 'Oggetti',
  feats: 'Talenti',
  featOrigin: 'origine',
  options: 'Opzioni',
  slotTitle: 'Slot',
  noSlots: 'nessuno slot libero',
  target: 'Bersaglio',
  noTarget: '(nessun bersaglio)',
  cantrip: 'trucchetto',
  advantage: { normal: 'Vantaggio: no', advantage: 'Vantaggio: sì', disadvantage: 'Svantaggio' },
  result: 'Esito',
  pending: 'in corso…',
  outcomes: {
    hit: 'COLPITO',
    miss: 'MANCATO',
    save_success: 'TS riuscito',
    save_fail: 'TS fallito',
    damage_dealt: 'danni inflitti',
    no_roll: 'eseguito',
  },
  concentration: 'C',
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
  reactionTitle: '▲ Reazione',
  expiresIn: (s) => `scade ${s} s`,
  reactionTrigger: (src) => `Innesco: ${src}`,
  ignore: 'Ignora',
  opportunityAttack: 'Attacco di opportunità',
  shield: 'Scudo (1°)',
  counterspell: 'Controincantesimo (3°)',
  requestTitle: 'Prova richiesta',
  requestFrom: 'dal GM',
  requestSave: (a) => `Tiro salvezza su ${a}`,
  requestCheck: (a) => `Prova di ${a}`,
  requestSkill: (sk) => `Prova di ${sk}`,
  requestDc: (dc) => `CD ${dc}`,
  requestOk: 'Fatto · d20 al tavolo',
  requestRollFoundry: 'Tira in Foundry',
  downTitle: 'Sei a terra',
  downRoll: 'Tiro salvezza contro la morte',
  downTally: (s, f) => `Successi ${s}/3 · Fallimenti ${f}/3`,
  offlineTitle: '▲ Offline',
  offlineCauses: {
    'no-gm': 'Nessun GM connesso',
    network: 'Foundry non risponde',
    auth: 'Accesso rifiutato',
    background: 'Telefono in background',
  },
  retryIn: (s, n) => `Riprovo tra ${s} s (tentativo ${n})`,
  dataAge: (m) => `dati di ${m} min fa`,
  frozen: 'Scheda e mappa congelate',
  endTurn: 'Fine turno',
  menu: {
    nextPage: 'Scheda',
    zoomIn: 'Mappa: zoom +',
    zoomOut: 'Mappa: zoom -',
    follow: 'Mappa: segui/libera',
    advantage: 'Vantaggio/Svantaggio',
    endTurn: 'Fine turno',
    language: 'Lingua',
    reconnect: 'Riconnetti',
  },
  option: {
    nextPage: 'Scheda: pagina successiva',
    zoom: (d, px) => `Zoom ${d} (${px} px)`,
    follow: (on) => `Segui token: ${on ? 'sì' : 'no'}`,
    language: (l) => `Lingua: ${l === 'auto' ? 'auto' : l.toUpperCase()}`,
  },
  footer: {
    root: '●  azioni     ●●  esci',
    combat: '●  azioni   ↕  scorri   ●●  esci',
    list: '↕ scegli   ● ok   ●● indietro',
    target: '↕ bersaglio  ● tira  ●● indietro',
    result: '●  azioni     ●●  chiudi',
    reaction: '↕ scegli   ● ok   ●● ignora',
    request: '↕ scegli   ● ok   ●● chiudi',
    offline: '●  riprova ora     ●●  esci',
  },
};

const EN: HudStrings = {
  level: 'LV',
  yourTurn: 'YOUR TURN',
  turnOf: 'TURN',
  hitPoints: 'HIT POINTS',
  ac: 'AC',
  temp: 'TEMP',
  initiativeShort: 'INIT',
  speedShort: 'SPD',
  profShort: 'PROF',
  economyShort: { action: 'ACT', bonus: 'BON', reaction: 'REA' },
  ft: 'FT',
  noConditions: 'NO CONDITIONS',
  conditions: {
    concentrating: 'CONC.',
    blinded: 'BLINDED',
    charmed: 'CHARMED',
    deafened: 'DEAFENED',
    frightened: 'FRIGHTENED',
    grappled: 'GRAPPLED',
    incapacitated: 'INCAPACITATED',
    paralyzed: 'PARALYZED',
    petrified: 'PETRIFIED',
    poisoned: 'POISONED',
    prone: 'PRONE',
    restrained: 'RESTRAINED',
    stunned: 'STUNNED',
    unconscious: 'UNCONSCIOUS',
    dead: 'DEAD',
    bleeding: 'BLEEDING',
    cursed: 'CURSED',
    surprised: 'SURPRISED',
    sleeping: 'SLEEPING',
    silenced: 'SILENCED',
    exhaustion: 'EXHAUSTED',
    invisible: 'INVISIBLE',
    hiding: 'HIDDEN',
    dodging: 'DODGING',
    flying: 'FLYING',
    hovering: 'HOVERING',
    ethereal: 'ETHEREAL',
    burrowing: 'BURROWING',
    marked: 'MARKED',
    stable: 'STABLE',
    transformed: 'TRANSFORMED',
    blessed: 'BLESSED',
  },
  exhaustion: (n) => `EXHAUSTED ${n}`,
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
  tabs: { abilities: 'ABILITIES', saves: 'SAVES · SKILLS' },
  savesTitle: 'SAVING THROWS',
  skillsTitle: 'SKILLS',
  profLegend: '● PROF · ◉ EXPERTISE',
  passivePerception: (n) => `PASSIVE PERCEPTION ${n}`,
  darkvision: (ft) => `DARKVISION ${ft}`,
  passiveInsight: (ins, inv) => `PASSIVE INSIGHT ${ins} · PASSIVE INVESTIGATION ${inv}`,
  deathTitle: 'DEATH SAVES',
  deathSuccess: 'SUCCESSES',
  deathFailure: 'FAILURES',
  deathHint: 'ROLL THE D20 AT THE TABLE · HEALING RESETS',
  north: 'N',
  appTitle: 'EVENFOUNDRYVTT',
  unpairedSubtitle: 'GLASSES NOT PAIRED YET',
  revokedSubtitle: 'PAIRING REVOKED BY THE GM',
  pairSteps: [
    ['ON FOUNDRY: SETTINGS › EVENFOUNDRYVTT', '› «PAIR G2 GLASSES» SHOWS A QR CODE'],
    ['ON THE PHONE: EVEN REALITIES APP', '› SCAN THE QR CODE'],
    ['WEAR THE GLASSES: THE SHEET APPEARS', 'BY ITSELF, LINKED TO YOUR CHARACTER'],
  ],
  scan: 'SCAN',
  exitHint: '●● EXIT',
  connectingTo: (s) => `CONNECTING TO ${s}`,
  steps: {
    server: 'SERVER REACHABLE (HTTPS)',
    login: (u) => `SIGNED IN AS «${u}»`,
    gm: (g) => `GM CONNECTED: ${g}`,
    character: (a) => `RECEIVING ${a}'S SHEET…`,
    scene: 'RECEIVING THE SCENE',
  },
  cancelHint: '●● CANCEL',
  exploration: 'exploring',
  noScene: 'no scene',
  emptyLog: '(no events)',
  initiative: 'Initiative',
  round: (n) => `round ${n}`,
  actions: 'Actions',
  spellsMenu: 'Spells…',
  itemsMenu: 'Items…',
  featsMenu: 'Feats…',
  optionsMenu: 'Options…',
  spells: 'Spells',
  items: 'Items',
  feats: 'Feats',
  featOrigin: 'origin',
  options: 'Options',
  slotTitle: 'Slot',
  noSlots: 'no free slot',
  target: 'Target',
  noTarget: '(no target)',
  cantrip: 'cantrip',
  advantage: { normal: 'Advantage: no', advantage: 'Advantage: yes', disadvantage: 'Disadvantage' },
  result: 'Result',
  pending: 'in progress…',
  outcomes: {
    hit: 'HIT',
    miss: 'MISS',
    save_success: 'save passed',
    save_fail: 'save failed',
    damage_dealt: 'damage dealt',
    no_roll: 'done',
  },
  concentration: 'C',
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
  reactionTitle: '▲ Reaction',
  expiresIn: (s) => `ends in ${s} s`,
  reactionTrigger: (src) => `Trigger: ${src}`,
  ignore: 'Ignore',
  opportunityAttack: 'Opportunity attack',
  shield: 'Shield (1st)',
  counterspell: 'Counterspell (3rd)',
  requestTitle: 'Roll requested',
  requestFrom: 'by the GM',
  requestSave: (a) => `${a} saving throw`,
  requestCheck: (a) => `${a} check`,
  requestSkill: (sk) => `${sk} check`,
  requestDc: (dc) => `DC ${dc}`,
  requestOk: 'Done · d20 at the table',
  requestRollFoundry: 'Roll in Foundry',
  downTitle: 'You are down',
  downRoll: 'Death saving throw',
  downTally: (s, f) => `Successes ${s}/3 · Failures ${f}/3`,
  offlineTitle: '▲ Offline',
  offlineCauses: {
    'no-gm': 'No GM connected',
    network: 'Foundry not responding',
    auth: 'Login rejected',
    background: 'Phone in background',
  },
  retryIn: (s, n) => `Retry in ${s} s (attempt ${n})`,
  dataAge: (m) => `data from ${m} min ago`,
  frozen: 'Sheet and map frozen',
  endTurn: 'End turn',
  menu: {
    nextPage: 'Sheet',
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
    root: '●  actions     ●●  exit',
    combat: '● actions   ↕ scroll   ●● exit',
    list: '↕ choose   ● ok   ●● back',
    target: '↕ target   ● roll   ●● back',
    result: '●  actions     ●●  close',
    reaction: '↕ choose   ● ok   ●● ignore',
    request: '↕ choose   ● ok   ●● close',
    offline: '●  retry now     ●●  exit',
  },
};

/** Returns the string table for `locale`. */
export function strings(locale: HudLocale): HudStrings {
  return locale === 'it' ? IT : EN;
}
