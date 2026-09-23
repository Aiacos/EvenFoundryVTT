/**
 * Demo scenarios — scripted fixtures for the design states of the thirds layout
 * (docs/design/g2-thirds-layout.md M01–M11), reproduced on the real HUD without Foundry.
 *
 * Each scenario starts the HUD on a "calm" state (no combat, no reaction), then applies
 * `patch` (so the HUD sees the same store transitions as in play: combat start → combat
 * sheet page, reaction arrival → M07) and replays `gestures` through the real input path.
 * The app states are the HUD INV-1 test fixtures (`mockStates`) — one source of truth.
 *
 * @see docs/design/g2-thirds-layout.md
 */

import type { TapGesture } from '../debug/bridge-tap.js';
import { menuIdOf } from '../hud/input/state-machine.js';
import type { AppState } from '../state/app-store.js';
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
  'skills',
  'unpaired',
  'connecting',
  'offline',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

/** `?demo=tour` cycles every scenario in {@link SCENARIO_NAMES} order. */
export const TOUR = 'tour';

/** A scenario ready to be played. */
export interface Scenario {
  name: ScenarioName;
  /** Design mock it reproduces. */
  mock: string;
  /** Store state when the HUD starts. */
  initial: AppState;
  /** Store transition applied right after the HUD subscribed (may be empty). */
  patch: Partial<AppState>;
  /** Gestures replayed through the bridge event path after `patch`. */
  gestures: readonly TapGesture[];
  /**
   * Store transition applied once the first render settled, or `null`. M11 needs it: the
   * map is frozen, not blank, so the scene must have been online (map drawn) first.
   */
  after: Partial<AppState> | null;
}

/** Last snapshot "2 min ago" (M11 "Dati mostrati: 2 min fa"). */
const LAST_SYNC_AGE_MS = 120_000;
/** Reaction prompts outlive the HUD 10 s cap so the timeout path is the HUD's. */
const REACTION_TTL_MS = 30_000;

const nextPage: TapGesture = { menu: menuIdOf('nextPage') };

interface Recipe {
  mock: string;
  /** `mockStates` variant: `max` = longest names/values (INV-1 worst case). */
  variant: 'min' | 'max';
  gestures: readonly TapGesture[];
  /** Start online and switch to the fixture's connection after the first render. */
  connectionAfter?: true;
}

/**
 * Gesture scripts reaching each design state from the root view (thirds entries order:
 * weapons, "Spells…", "Items…", "Options…"; targets: enemies first).
 */
const RECIPES: Readonly<Record<ScenarioName, Recipe>> = {
  explore: { mock: 'M01', variant: 'min', gestures: [] },
  'combat-my-turn': { mock: 'M02', variant: 'min', gestures: [] },
  actions: { mock: 'M03', variant: 'min', gestures: ['tap', 'down'] },
  target: { mock: 'M04', variant: 'min', gestures: ['tap', 'tap'] },
  // M05 uses the `max` character (spells): page 4/4, Actions → down×2 → "Spells…".
  spells: {
    mock: 'M05',
    variant: 'max',
    gestures: [nextPage, nextPage, nextPage, 'tap', 'down', 'down', 'tap', 'down', 'down'],
  },
  // Attack with the first weapon on the first (enemy) target → invoke → M06.
  result: { mock: 'M06', variant: 'min', gestures: ['tap', 'tap', 'tap'] },
  reaction: { mock: 'M07', variant: 'min', gestures: [] },
  skills: { mock: 'M08', variant: 'min', gestures: [nextPage, nextPage] },
  unpaired: { mock: 'M09', variant: 'min', gestures: [] },
  connecting: { mock: 'M10', variant: 'min', gestures: [] },
  offline: { mock: 'M11', variant: 'min', gestures: [], connectionAfter: true },
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
  const app = mockStates(recipe.variant).find((m) => m.id === recipe.mock)?.app;
  if (app === undefined) throw new Error(`demo: fixture ${recipe.mock} missing`);
  const connection =
    app.connection.lastSyncAt === undefined
      ? app.connection
      : { ...app.connection, lastSyncAt: now - LAST_SYNC_AGE_MS };
  const patch: Partial<AppState> = {};
  if (app.combat !== null) patch.combat = app.combat;
  if (app.reaction !== null) {
    patch.reaction = { ...app.reaction, expiresAt: now + REACTION_TTL_MS };
  }
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
