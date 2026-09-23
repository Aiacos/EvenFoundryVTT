/**
 * Canonical HUD states S1–S12 of docs/design/g2-sheet-ux.html — Thorin, hill dwarf,
 * Cleric 5 (War domain), with the stats of the design's `PC` object — plus a `max`
 * content variant (long names, 3-digit PF, every condition) for the INV-1 width budgets.
 * Shared by demo mode (`?demo=`), the golden fixtures and the HUD unit tests, so all of
 * them render the same data.
 */
import {
  ABILITY_KEYS,
  type AbilityKey,
  type ActionEconomyPayload,
  type ActionResultPayload,
  type CharacterSnapshot,
  type CombatSnapshot,
  type LogSnapshot,
  type MapSnapshot,
  type MovementBudgetPayload,
  SKILL_KEYS,
  type SkillKey,
  type Skills,
} from '@evf/shared-protocol';
import { initialUi, type UiState } from '../hud/input/ui-state.js';
import { type AppState, initialState } from '../state/app-store.js';

export type Variant = 'min' | 'max';

/** Design `PC`: ability scores. */
const SCORES: Record<AbilityKey, number> = { str: 16, dex: 10, con: 14, int: 10, wis: 18, cha: 12 };
const SAVE_PROF: ReadonlySet<AbilityKey> = new Set(['str', 'wis', 'cha']);
const PROF = 3;
/** Skill proficiency: Intuizione, Medicina ● · Religione ◉ (design `PC.skills`). */
const SKILL_PROF: Partial<Record<SkillKey, 1 | 2>> = { ins: 1, med: 1, rel: 2 };
const SKILL_ABILITY: Record<SkillKey, AbilityKey> = {
  acr: 'dex',
  ani: 'wis',
  arc: 'int',
  ath: 'str',
  dec: 'cha',
  his: 'int',
  ins: 'wis',
  itm: 'cha',
  inv: 'int',
  med: 'wis',
  nat: 'int',
  prc: 'wis',
  prf: 'cha',
  per: 'cha',
  rel: 'int',
  slt: 'dex',
  ste: 'dex',
  sur: 'wis',
};

const mod = (k: AbilityKey): number => Math.floor((SCORES[k] - 10) / 2);

function abilities(): CharacterSnapshot['abilities'] {
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [
      k,
      {
        value: SCORES[k],
        mod: mod(k),
        save: mod(k) + (SAVE_PROF.has(k) ? PROF : 0),
        proficient: SAVE_PROF.has(k),
        dc: 8 + PROF + mod(k),
      },
    ]),
  ) as CharacterSnapshot['abilities'];
}

function skills(): Skills {
  return Object.fromEntries(
    SKILL_KEYS.map((k) => {
      const tier = SKILL_PROF[k] ?? 0;
      const total = mod(SKILL_ABILITY[k]) + tier * PROF;
      return [k, { total, ability: SKILL_ABILITY[k], proficient: tier, passive: 10 + total }];
    }),
  ) as Skills;
}

/** URL of the demo portrait (served by the demo decoder, never fetched). */
export const DEMO_PORTRAIT_URL = 'demo/thorin.webp';
/** URL of the demo crypt art (served by the demo art decoder, never fetched). */
export const DEMO_MAP_URL = 'demo/crypt-map.webp';
/** Token pictures of the demo crypt (served by the demo art decoder). */
export const DEMO_TOKEN_ART = {
  thorin: 'demo/token-thorin.webp',
  mira: 'demo/token-mira.webp',
  goblin: 'demo/token-goblin.webp',
  hobgoblin: 'demo/token-hobgoblin.webp',
} as const;

export function character(v: Variant = 'min'): CharacterSnapshot {
  const max = v === 'max';
  return {
    actorId: 'actor-1',
    name: max ? 'Thorin Scudodiquercia il Magnifico' : 'Thorin',
    hp: max ? 345 : 27,
    maxHp: max ? 999 : 38,
    tempHp: max ? 120 : 5,
    ac: max ? 25 : 18,
    level: max ? 20 : 5,
    conditions: max
      ? ['concentrating', 'blessed', 'poisoned', 'frightened', 'prone', 'restrained']
      : ['concentrating', 'blessed'],
    exhaustion: max ? 3 : 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: true },
    inventory: [
      {
        id: 'w1',
        name: max ? 'Martello da guerra +3 del Drago Rosso' : 'Martello da guerra',
        type: 'weapon',
        damage: '1d8+3',
        toHit: '+6',
      },
      { id: 'w2', name: 'Giavellotto', type: 'weapon', damage: '1d6+3', toHit: '+6' },
      {
        id: 'p1',
        name: max ? 'Pozione di guarigione superiore' : 'Pozione di guarigione',
        type: 'consumable',
        quantity: 2,
      },
    ],
    spells: {
      slots: [
        { level: 1, value: 3, max: 4 },
        { level: 2, value: 2, max: 3 },
        { level: 3, value: 1, max: 2 },
      ],
      spells: [
        spell('s0', 'Fiamma sacra', 0, '60 ft', false),
        spell('s1', 'Cura ferite', 1, 'tocco', false),
        spell('s2', 'Benedizione', 1, '30 ft', true),
        spell('s3', 'Spiriti guardiani', 3, '15 ft', true),
      ],
    },
    abilities: abilities(),
    skills: skills(),
    portrait: { url: DEMO_PORTRAIT_URL },
    details: {
      classId: 'cleric',
      className: 'Chierico',
      subclass: 'Dominio della Guerra',
      race: max ? 'Nano delle colline di Ferrosangue' : 'Nano delle colline',
      inspiration: true,
      speed: 25,
      proficiency: PROF,
      initiative: 0,
      darkvision: 60,
    },
  };
}

function spell(
  id: string,
  name: string,
  level: number,
  range: string,
  concentration: boolean,
): CharacterSnapshot['spells']['spells'][number] {
  return {
    id,
    name,
    level,
    school: 'evo',
    activation: 'action',
    range,
    effect: '',
    prepared: true,
    alwaysPrepared: false,
    concentration,
  };
}

/** Initiative of the design (S2): Thorin, Goblin A, Mira, Hobgoblin. */
export function combat(
  current: 'thorin' | 'goblin-b',
  v: Variant = 'min',
  round = 3,
): CombatSnapshot {
  const long = v === 'max';
  const names = long
    ? [
        'Thorin Scudodiquercia il Magnifico',
        'Goblin A',
        'Mira la Veggente dei Sette Mari',
        'Hobgoblin',
      ]
    : ['Thorin', 'Goblin A', 'Mira', 'Hobgoblin'];
  return {
    combatId: 'c1',
    round: long ? 123 : round,
    turn: 0,
    currentCombatantId: current === 'thorin' ? 'k1' : 'k5',
    combatants: [
      {
        id: 'k1',
        name: names[0] ?? '',
        actorId: 'actor-1',
        initiative: 19,
        hp: long ? 345 : 27,
        maxHp: long ? 999 : 38,
        isCurrentTurn: current === 'thorin',
      },
      {
        id: 'k2',
        name: names[1] ?? '',
        actorId: 'g1',
        initiative: 17,
        hp: null,
        maxHp: null,
        isCurrentTurn: false,
      },
      {
        id: 'k3',
        name: names[2] ?? '',
        actorId: 'm1',
        initiative: 15,
        hp: 31,
        maxHp: 38,
        isCurrentTurn: false,
      },
      {
        id: 'k4',
        name: names[3] ?? '',
        actorId: 'h1',
        initiative: 12,
        hp: null,
        maxHp: null,
        isCurrentTurn: false,
      },
      {
        id: 'k5',
        name: 'Goblin B',
        actorId: 'g2',
        initiative: 9,
        hp: null,
        maxHp: null,
        isCurrentTurn: current === 'goblin-b',
      },
    ],
  };
}

/** Exploration log of S1 (newest last, as the projector sends it). */
export function log(v: Variant = 'min'): LogSnapshot {
  if (v === 'max') {
    return {
      events: Array.from({ length: 10 }, (_, i) => ({
        id: `e${i}`,
        timestamp: 1000 + i,
        actorName: 'Mira la Veggente dei Sette Mari',
        kind: 'roll' as const,
        description: 'Percezione con vantaggio e ispirazione bardica',
        result: { kind: i % 2 ? ('hit' as const) : ('pass' as const), value: 17 },
      })),
    };
  }
  return {
    events: [
      { id: 'e1', timestamp: 1, actorName: 'Bram', kind: 'chat', description: 'si muove di 20 ft' },
      {
        id: 'e2',
        timestamp: 2,
        actorName: 'GM',
        kind: 'chat',
        description: '«Senti passi a nord»',
      },
      {
        id: 'e3',
        timestamp: 3,
        actorName: 'Mira',
        kind: 'roll',
        description: 'Percezione',
        result: { kind: 'pass', value: 17 },
      },
    ],
  };
}

/** Four walls of a 0.6-cell square column centred on (cx, cy). */
function pillar(cx: number, cy: number): MapSnapshot['walls'] {
  const [x0, y0, x1, y1] = [cx - 0.3, cy - 0.3, cx + 0.3, cy + 0.3];
  return [
    { c: [x0, y0, x1, y0] },
    { c: [x1, y0, x1, y1] },
    { c: [x1, y1, x0, y1] },
    { c: [x0, y1, x0, y0] },
  ];
}

/**
 * Crypt of the design map (S1–S9): a room with pillars, an open door and a corridor,
 * with procedural scene art (`demo/map-art.ts`) and token pictures.
 */
export function mapSnap(extra: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    sceneId: 'scene-1',
    name: "Cripta di Vel'Nar",
    cols: 30,
    rows: 30,
    gridPx: 100,
    background: { src: DEMO_MAP_URL, x: 0, y: 0, w: 3000, h: 3000 },
    darkness: 0,
    walls: [
      { c: [9, 8, 16, 8] },
      { c: [9, 17, 16, 17] },
      { c: [9, 8, 9, 17] },
      { c: [16, 8, 16, 11] },
      { c: [16, 11, 16, 13], door: true, open: true },
      { c: [16, 13, 16, 17] },
      { c: [16, 11, 21, 11] },
      { c: [16, 13, 21, 13] },
      // Columns: small sight-blocking squares around the drums of the scene art.
      ...pillar(11.15, 10),
      ...pillar(11.15, 15),
    ],
    tokens: [
      {
        id: 't-self',
        name: 'Thorin',
        kind: 'self',
        x: 12,
        y: 12,
        w: 1,
        h: 1,
        img: DEMO_TOKEN_ART.thorin,
        sight: 12,
      },
      {
        id: 't-ally',
        name: 'Mira',
        kind: 'ally',
        x: 14,
        y: 12,
        w: 1,
        h: 1,
        hp: 0.8,
        img: DEMO_TOKEN_ART.mira,
      },
      {
        id: 't-gob',
        name: 'Goblin A',
        kind: 'enemy',
        x: 13,
        y: 13,
        w: 1,
        h: 1,
        hp: 0.6,
        img: DEMO_TOKEN_ART.goblin,
      },
      {
        id: 't-gob2',
        name: 'Goblin B',
        kind: 'enemy',
        x: 14,
        y: 10,
        w: 1,
        h: 1,
        hp: 1,
        img: DEMO_TOKEN_ART.goblin,
      },
      {
        id: 't-boss',
        name: 'Hobgoblin',
        kind: 'enemy',
        x: 18,
        y: 12,
        w: 1,
        h: 1,
        hp: 1,
        img: DEMO_TOKEN_ART.hobgoblin,
      },
    ],
    selfTokenId: 't-self',
    ...extra,
  };
}

export function result(): ActionResultPayload {
  return {
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    toolId: 'weapon-attack',
    d20: 16,
    outcome: 'hit',
    damage: '9 contundenti',
    status: 'success',
    recipientUserId: 'u1',
  };
}

/** Action economy of the paired actor (`actionsUsed` 1 after attacking, S6). */
export function economy(actionsUsed: 0 | 1 = 0, reactionsUsed: 0 | 1 = 0): ActionEconomyPayload {
  return {
    actorId: 'actor-1',
    actionsUsed,
    bonusActionsUsed: 0,
    reactionsUsed,
    multiAttackInProgress: false,
    recipientUserId: 'u1',
  };
}

/** Movement budget of the paired actor (max variant: over budget). */
export function movement(v: Variant = 'min'): MovementBudgetPayload {
  return v === 'max'
    ? { actorId: 'actor-1', walkSpeed: 120, usedThisTurn: 125, remainingFeet: -5 }
    : { actorId: 'actor-1', walkSpeed: 25, usedThisTurn: 0, remainingFeet: 25 };
}

export function online(v: Variant = 'min', patch: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    connection: { status: 'online', server: 'foundry.casa-rossi.it', lastSyncAt: 0 },
    character: character(v),
    map: mapSnap(),
    log: log(v),
    ...patch,
  };
}

export interface MockState {
  /** Design screen id `S1`–`S12`. */
  id: string;
  app: AppState;
  ui: UiState;
}

/** S1–S12 states for a content variant. */
export function mockStates(v: Variant): MockState[] {
  const ui = initialUi();
  const myTurn = online(v, {
    combat: combat('thorin', v),
    actionEconomy: economy(),
    movement: movement(v),
  });
  const hammer = { kind: 'weapon' as const, itemId: 'w1', name: 'Martello da guerra' };
  const ch = character(v);
  return [
    { id: 'S1', app: online(v), ui },
    { id: 'S2', app: myTurn, ui },
    { id: 'S3', app: myTurn, ui: { ...ui, view: 'actions' } },
    { id: 'S4', app: myTurn, ui: { ...ui, view: 'target', pending: hammer } },
    { id: 'S5', app: myTurn, ui: { ...ui, view: 'spells', cursor: 1 } },
    {
      id: 'S6',
      app: {
        ...myTurn,
        lastResult: result(),
        actionEconomy: economy(1),
        map: mapSnap({ targetId: 't-gob' }),
      },
      ui: {
        ...ui,
        view: 'result',
        result: { title: 'Martello → Goblin A', shownAt: 0, ack: 'ok', payload: result() },
      },
    },
    {
      id: 'S7',
      app: {
        ...online(v, {
          combat: combat('goblin-b', v),
          actionEconomy: economy(),
          movement: movement(v),
        }),
        reaction: { kind: 'opportunity-attack', sourceName: 'Goblin B', expiresAt: 130_000 },
      },
      // Fixture clock: 120 s (S12 "dati di 2 min fa" with lastSyncAt 0) → 6 s left.
      ui: { ...ui, view: 'reaction', reactionDeadline: 126_000 },
    },
    {
      id: 'S8',
      app: online(v, { rollRequest: { messageId: 'm1', kind: 'save', ability: 'wis' } }),
      ui: { ...ui, view: 'request', sheetPage: 'saves' },
    },
    {
      id: 'S9',
      app: online(v, {
        character: {
          ...ch,
          hp: 0,
          tempHp: 0,
          conditions: ['unconscious'],
          death: { success: 1, failure: 2 },
        },
        combat: combat('thorin', v, 4),
        actionEconomy: economy(),
        movement: movement(v),
      }),
      ui,
    },
    { id: 'S10', app: initialState(), ui },
    {
      id: 'S11',
      app: {
        ...initialState(),
        connection: {
          status: 'connecting',
          server:
            v === 'max' ? 'foundry.una-casa-molto-lontana.example.org' : 'foundry.casa-rossi.it',
          userName: 'Luca (G2)',
          gmName: 'Anna',
          actorName: 'Thorin',
          steps: { server: true, login: true, gm: true, character: false, scene: false },
        },
      },
      ui,
    },
    {
      id: 'S12',
      app: online(v, {
        connection: {
          status: 'offline',
          retryInMs: 8000,
          attempt: 3,
          lastSyncAt: 0,
          cause: 'no-gm',
        },
      }),
      ui,
    },
  ];
}
