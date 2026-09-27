/**
 * Demo scenarios — scripted fixtures for the screens S1–S12 of the sheet HUD
 * (docs/design/g2-sheet-ux.html), reproduced on the real HUD without Foundry.
 *
 * Each scenario starts the HUD on a "calm" state (no combat, no reaction, no GM
 * request), then applies `patch` (so the HUD sees the same store transitions as in play:
 * reaction arrival → S7, GM roll request → S8 with the automatic sheet page) and replays
 * `gestures` through the real input path. The app states are the HUD golden-fixture
 * states (`mockStates`) — one source of truth. After S1–S12 come the pairing variants
 * (S10 / S12 with the connection the session produces for a pending or unanswered code, a
 * refused character and a pairing taken by another app instance).
 *
 * @see docs/design/g2-sheet-ux.html §Schermate
 */

import type { TapGesture } from '../debug/bridge-tap.js';
import type { AppState, ConnectionState } from '../state/app-store.js';
import { mockStates } from './fixtures.js';

/** Scenario names accepted by `?demo=`. */
export const SCENARIO_NAMES = [
  'explore',
  'combat-my-turn',
  'actions',
  'target',
  'spells',
  'result',
  'reaction',
  'saves',
  'dying',
  'unpaired',
  'connecting',
  'offline',
  'code-pending',
  'code-unanswered',
  'actor',
  'replaced',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

/** `?demo=tour` cycles every scenario in {@link SCENARIO_NAMES} order. */
export const TOUR = 'tour';

/** A scenario ready to be played. */
export interface Scenario {
  name: ScenarioName;
  /** Design screen it reproduces (`S1`–`S12`). */
  mock: string;
  /** Store state when the HUD starts. */
  initial: AppState;
  /** Store transition applied right after the HUD subscribed (may be empty). */
  patch: Partial<AppState>;
  /** Gestures replayed through the bridge event path after `patch`. */
  gestures: readonly TapGesture[];
  /**
   * Store transition applied once the first render settled, or `null`. S12 needs it: the
   * zones are frozen, not blank, so the scene must have been online (drawn) first.
   */
  after: Partial<AppState> | null;
}

/** Last snapshot "2 min ago" (S12 "dati di 2 min fa"). */
const LAST_SYNC_AGE_MS = 120_000;
/** Reaction prompts outlive the HUD 10 s cap so the timeout path is the HUD's. */
const REACTION_TTL_MS = 30_000;

/** Relay host shown by the pairing variants. */
const DEMO_RELAY = 'evf-relay.evf-relay.workers.dev';

interface Recipe {
  mock: string;
  gestures: readonly TapGesture[];
  /** Start online and switch to the fixture's connection after the first render. */
  connectionAfter?: true;
  /** Replaces the fixture's connection (pairing variants of S10 / S12). */
  connection?: ConnectionState;
}

/**
 * Gesture scripts reaching each design screen from the root view (actions order:
 * weapons, «Incantesimi…», «Oggetti…», «Fine turno», «Opzioni…»; targets: enemies by
 * distance).
 */
const RECIPES: Readonly<Record<ScenarioName, Recipe>> = {
  explore: { mock: 'S1', gestures: [] },
  'combat-my-turn': { mock: 'S2', gestures: [] },
  actions: { mock: 'S3', gestures: ['tap'] },
  target: { mock: 'S4', gestures: ['tap', 'tap'] },
  spells: { mock: 'S5', gestures: ['tap', 'down', 'down', 'tap', 'down'] },
  // Attack with the war hammer on the nearest enemy → invoke → S6.
  result: { mock: 'S6', gestures: ['tap', 'tap', 'tap'] },
  reaction: { mock: 'S7', gestures: [] },
  saves: { mock: 'S8', gestures: [] },
  dying: { mock: 'S9', gestures: [] },
  unpaired: { mock: 'S10', gestures: [] },
  connecting: { mock: 'S11', gestures: [] },
  offline: { mock: 'S12', gestures: [], connectionAfter: true },
  // First pairing, code not answered yet: no character, so the full S11 screen names the cause.
  'code-pending': {
    mock: 'S10',
    gestures: [],
    connection: {
      status: 'offline',
      cause: 'code-pending',
      server: DEMO_RELAY,
      steps: { relay: true, projector: false, paired: false, character: false, scene: false },
    },
  },
  'code-unanswered': {
    mock: 'S10',
    gestures: [],
    connection: { status: 'unpaired', notice: 'code-unanswered' },
  },
  actor: {
    mock: 'S10',
    gestures: [],
    connection: {
      status: 'offline',
      cause: 'actor',
      server: DEMO_RELAY,
      steps: { relay: true, projector: true, paired: false, character: false, scene: false },
    },
  },
  // Seen live, then another app instance took the pairing (relay close 4000): no retry.
  replaced: {
    mock: 'S12',
    gestures: [],
    connectionAfter: true,
    connection: { status: 'offline', cause: 'replaced', lastSyncAt: 0 },
  },
};

/** Type guard for `?demo=` values. */
export function isScenarioName(value: string): value is ScenarioName {
  return (SCENARIO_NAMES as readonly string[]).includes(value);
}

/**
 * Builds a scenario with timestamps rebased on `now` (the fixtures use epoch 0).
 *
 * @throws Error when the fixture set no longer contains the recipe's mock id.
 */
export function buildScenario(name: ScenarioName, now: number): Scenario {
  const recipe = RECIPES[name];
  const app = mockStates('min').find((m) => m.id === recipe.mock)?.app;
  if (app === undefined) throw new Error(`demo: fixture ${recipe.mock} missing`);
  const base = recipe.connection ?? app.connection;
  const connection =
    base.lastSyncAt === undefined ? base : { ...base, lastSyncAt: now - LAST_SYNC_AGE_MS };
  const patch: Partial<AppState> = {};
  if (app.combat !== null) patch.combat = app.combat;
  if (app.reaction !== null) {
    patch.reaction = { ...app.reaction, expiresAt: now + REACTION_TTL_MS };
  }
  if (app.rollRequest !== null) patch.rollRequest = app.rollRequest;
  const online = { status: 'online' as const, lastSyncAt: now };
  return {
    name,
    mock: recipe.mock,
    // `lastResult` is produced by the fake invoke, never preloaded.
    initial: {
      ...app,
      connection: recipe.connectionAfter === true ? online : connection,
      combat: null,
      reaction: null,
      rollRequest: null,
      lastResult: null,
    },
    patch,
    gestures: recipe.gestures,
    after: recipe.connectionAfter === true ? { connection } : null,
  };
}

/**
 * Resolves a `?demo=` request into the scenario playlist.
 *
 * @returns The playlist and whether the request was valid (invalid → full tour).
 */
export function playlist(request: string): { names: readonly ScenarioName[]; valid: boolean } {
  if (request === TOUR) return { names: SCENARIO_NAMES, valid: true };
  if (isScenarioName(request)) return { names: [request], valid: true };
  return { names: SCENARIO_NAMES, valid: false };
}
