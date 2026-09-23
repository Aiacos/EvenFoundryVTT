/**
 * Test fixtures for the HUD: mock states M01–M11 with min/max content variants.
 */
import {
  ABILITY_KEYS,
  type ActionEconomyPayload,
  type ActionResultPayload,
  type CharacterSnapshot,
  type CombatSnapshot,
  type LogSnapshot,
  type MapSnapshot,
  type MovementBudgetPayload,
  SKILL_KEYS,
  type Skills,
} from '@evf/shared-protocol';
import { type AppState, initialState } from '../../state/app-store.js';
import { initialUi, type UiState } from '../input/ui-state.js';

export type Variant = 'min' | 'max';

function abilities(): CharacterSnapshot['abilities'] {
  const mods = { str: 4, dex: 1, con: 3, int: 0, wis: 1, cha: -1 } as const;
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [
      k,
      {
        value: 10 + mods[k] * 2,
        mod: mods[k],
        save: mods[k] + (k === 'str' || k === 'con' ? 3 : 0),
        proficient: k === 'str' || k === 'con',
        dc: 13,
      },
    ]),
  ) as CharacterSnapshot['abilities'];
}

function skills(): Skills {
  const prof: Partial<Record<(typeof SKILL_KEYS)[number], 0 | 1 | 2>> = {
    ath: 2,
    itm: 1,
    prc: 1,
    sur: 1,
  };
  return Object.fromEntries(
    SKILL_KEYS.map((k, i) => [
      k,
      {
        total: (i % 5) - 1 + (prof[k] ?? 0) * 3,
        ability: 'wis',
        proficient: prof[k] ?? 0,
        passive: 14,
      },
    ]),
  ) as Skills;
}

export function character(v: Variant = 'min'): CharacterSnapshot {
  const max = v === 'max';
  return {
    actorId: 'actor-1',
    name: max ? 'Thorin Scudodiquercia il Magnifico' : 'Thorin',
    hp: max ? 345 : 7,
    maxHp: max ? 999 : 9,
    tempHp: max ? 120 : 0,
    ac: max ? 25 : 18,
    level: max ? 20 : 5,
    conditions: max ? ['Benedetto', 'Avvelenato', 'Spaventato', 'Prono'] : [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: true },
    inventory: [
      {
        id: 'w1',
        name: max ? 'Ascia bipenne +3 del Drago Rosso' : 'Ascia',
        type: 'weapon',
        damage: '1d12+4',
      },
      { id: 'w2', name: 'Giavellotto', type: 'weapon', damage: '1d6+4' },
      {
        id: 'p1',
        name: max ? 'Pozione di guarigione superiore' : 'Pozione',
        type: 'consumable',
        quantity: 3,
      },
    ],
    spells: max
      ? {
          slots: [
            { level: 1, value: 3, max: 4 },
            { level: 2, value: 1, max: 3 },
            { level: 3, value: 0, max: 2 },
          ],
          spells: [
            {
              id: 's0',
              name: 'Fiamma sacra',
              level: 0,
              school: 'evo',
              activation: 'action',
              range: '60ft',
              effect: '1d8',
              prepared: false,
              alwaysPrepared: false,
              concentration: false,
            },
            {
              id: 's1',
              name: 'Cura ferite',
              level: 1,
              school: 'evo',
              activation: 'action',
              range: 'tocco',
              effect: '1d8',
              prepared: true,
              alwaysPrepared: false,
              concentration: false,
            },
            {
              id: 's2',
              name: 'Benedizione',
              level: 1,
              school: 'enc',
              activation: 'action',
              range: '30ft',
              effect: '',
              prepared: true,
              alwaysPrepared: false,
              concentration: true,
            },
          ],
        }
      : { slots: [], spells: [] },
    abilities: abilities(),
    skills: skills(),
  };
}

export function combat(myTurn: boolean, v: Variant = 'min'): CombatSnapshot {
  const long = v === 'max';
  return {
    combatId: 'c1',
    round: long ? 123 : 3,
    turn: 0,
    currentCombatantId: myTurn ? 'k1' : 'k2',
    combatants: [
      {
        id: 'k1',
        name: long ? 'Thorin Scudodiquercia il Magnifico' : 'Thorin',
        actorId: 'actor-1',
        initiative: 19,
        hp: 45,
        maxHp: 68,
        isCurrentTurn: myTurn,
      },
      {
        id: 'k2',
        name: 'Goblin A',
        actorId: 'g1',
        initiative: 17,
        hp: null,
        maxHp: null,
        isCurrentTurn: !myTurn,
      },
      {
        id: 'k3',
        name: 'Mira',
        actorId: 'm1',
        initiative: 15,
        hp: 31,
        maxHp: 38,
        isCurrentTurn: false,
      },
    ],
  };
}

export function log(v: Variant = 'min'): LogSnapshot {
  if (v === 'min') return { events: [] };
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

export function mapSnap(extra: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    sceneId: 'scene-1',
    name: "Cripta di Vel'Nar",
    cols: 40,
    rows: 40,
    gridPx: 100,
    darkness: 0,
    walls: [{ c: [0, 0, 10, 0] }, { c: [10, 0, 10, 10], door: true }],
    tokens: [
      { id: 't-self', name: 'Thorin', kind: 'self', x: 20, y: 20, w: 1, h: 1 },
      { id: 't-ally', name: 'Mira', kind: 'ally', x: 22, y: 20, w: 1, h: 1, hp: 0.8 },
      { id: 't-gob', name: 'Goblin A', kind: 'enemy', x: 21, y: 21, w: 1, h: 1, hp: 0.4 },
      { id: 't-npc', name: 'Mercante', kind: 'neutral', x: 18, y: 18, w: 1, h: 1 },
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
    damage: '11 taglienti',
    status: 'success',
    recipientUserId: 'u1',
  };
}

/** Action economy of the paired actor (`actionsUsed` 1 after attacking, M06). */
export function economy(actionsUsed: 0 | 1 = 0): ActionEconomyPayload {
  return {
    actorId: 'actor-1',
    actionsUsed,
    bonusActionsUsed: 0,
    reactionsUsed: 0,
    multiAttackInProgress: false,
    recipientUserId: 'u1',
  };
}

/** Movement budget of the paired actor (max variant: fast actor, over budget). */
export function movement(v: Variant = 'min'): MovementBudgetPayload {
  return v === 'max'
    ? { actorId: 'actor-1', walkSpeed: 120, usedThisTurn: 125, remainingFeet: -5 }
    : { actorId: 'actor-1', walkSpeed: 30, usedThisTurn: 5, remainingFeet: 25 };
}

export function online(v: Variant = 'min', patch: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    connection: { status: 'online', server: 'foundry.example', lastSyncAt: 0 },
    character: character(v),
    map: mapSnap(),
    log: log(v),
    ...patch,
  };
}

export interface MockState {
  id: string;
  app: AppState;
  ui: UiState;
}

/** M01–M11 mock states for a variant. */
export function mockStates(v: Variant): MockState[] {
  const ui = initialUi();
  const inCombat = online(v, {
    combat: combat(true, v),
    actionEconomy: economy(),
    movement: movement(v),
  });
  const pendingWeapon = { kind: 'weapon' as const, itemId: 'w1', name: 'Ascia' };
  return [
    { id: 'M01', app: online(v), ui },
    { id: 'M02', app: inCombat, ui: { ...ui, sheetPage: 1 } },
    { id: 'M03', app: inCombat, ui: { ...ui, sheetPage: 1, view: 'actions', cursor: 1 } },
    {
      id: 'M04',
      app: inCombat,
      ui: { ...ui, sheetPage: 1, view: 'target', pending: pendingWeapon },
    },
    { id: 'M05', app: online('max'), ui: { ...ui, sheetPage: 3, view: 'spells', cursor: 2 } },
    {
      id: 'M06',
      app: { ...inCombat, lastResult: result(), actionEconomy: economy(1) },
      ui: {
        ...ui,
        sheetPage: 1,
        view: 'result',
        result: { title: 'Ascia → Goblin A', shownAt: 0, ack: 'ok', payload: result() },
      },
    },
    {
      id: 'M07',
      app: {
        ...online(v, { combat: combat(false, v) }),
        reaction: { kind: 'opportunity-attack', sourceName: 'Goblin A', expiresAt: 10_000 },
      },
      ui: { ...ui, sheetPage: 1, view: 'reaction', reactionDeadline: 6_000 },
    },
    { id: 'M08', app: online(v), ui: { ...ui, sheetPage: 2 } },
    { id: 'M09', app: initialState(), ui },
    {
      id: 'M10',
      app: {
        ...initialState(),
        connection: {
          status: 'connecting',
          server: v === 'max' ? 'foundry.una-casa-molto-lontana.example.org' : 'foundry.casa.it',
          userName: 'Luca (G2)',
          gmName: 'Anna',
          actorName: 'Thorin',
          steps: { server: true, login: true, gm: true, character: false, scene: false },
        },
      },
      ui,
    },
    {
      id: 'M11',
      app: online(v, {
        connection: {
          status: 'offline',
          retryInMs: 8000,
          attempt: 3,
          lastSyncAt: 0,
          cause: 'network',
        },
      }),
      ui,
    },
  ];
}
