/**
 * App store — the single contract between the direct transport (`src/direct/`,
 * `src/phone/`) and the glasses HUD (`src/hud/`).
 *
 * The transport is the only writer of `connection` and the Foundry snapshots; the HUD
 * reads state and calls {@link AppActions}. Plain observable, no framework: G2 output
 * is SDK container calls, not DOM (Specs.md §3.1).
 *
 * @see docs/design/g2-sheet-ux.html
 * @see docs/architecture/0012-direct-foundry-streaming.md
 */
import type {
  ActionEconomyPayload,
  ActionResultPayload,
  CharacterSnapshot,
  CombatSnapshot,
  LogSnapshot,
  MapSnapshot,
  MovementBudgetPayload,
  ReactionAvailablePayload,
  RollRequestPayload,
  SnapshotTopic,
} from '@evf/shared-protocol';

/** Connection lifecycle shown by screens S10 (unpaired), S11 (connecting), S12 (offline). */
export type ConnectionStatus = 'unpaired' | 'connecting' | 'online' | 'offline' | 'revoked';

/** Progress steps rendered by S11 while connecting. */
export interface ConnectSteps {
  server: boolean;
  login: boolean;
  gm: boolean;
  character: boolean;
  scene: boolean;
}

export interface ConnectionState {
  status: ConnectionStatus;
  /** Foundry host shown to the user (no credentials). */
  server?: string;
  userName?: string;
  gmName?: string;
  actorName?: string;
  worldTitle?: string;
  /** Foundry UI language from `welcome` — used when `settings.locale` is 'auto'. */
  foundryLocale?: string;
  /** Epoch ms of the last successful snapshot/delta (S12 "dati di 2 min fa"). */
  lastSyncAt?: number;
  /** Offline only: next retry countdown and attempt counter. */
  retryInMs?: number;
  attempt?: number;
  /** Offline only: machine-readable cause (`no-gm`, `network`, `auth`, `background`). */
  cause?: 'no-gm' | 'network' | 'auth' | 'background';
  steps?: ConnectSteps;
}

/** Device-local preferences (phone page P02, persisted by the transport layer). */
export interface AppSettings {
  locale: 'auto' | 'it' | 'en';
  mapCellPx: 6 | 8 | 12;
  followToken: boolean;
  /**
   * Automatic sheet page (design §Pagina automatica): GM-requested check/save →
   * «Tiri salvezza · Abilità», request handled → «Caratteristiche». Off = manual only.
   */
  autoSheetPage: boolean;
}

export interface AppState {
  connection: ConnectionState;
  settings: AppSettings;
  character: CharacterSnapshot | null;
  combat: CombatSnapshot | null;
  map: MapSnapshot | null;
  log: LogSnapshot | null;
  /** Pending reaction prompt (S7); cleared by the HUD after choice/timeout. */
  reaction: ReactionAvailablePayload | null;
  /** Pending GM roll request (S8); cleared by the HUD once the player dismissed it. */
  rollRequest: RollRequestPayload | null;
  /** Latest action result for the paired actor (S6). */
  lastResult: ActionResultPayload | null;
  /**
   * Action / Bonus / Reaction usage of the paired actor this turn (header row
   * "● Azione ▲ Bonus ◆ Reazione", S2/S6); null outside combat or before the first update.
   */
  actionEconomy: ActionEconomyPayload | null;
  /** Movement budget of the paired actor this turn (header "25 FT"); null outside combat. */
  movement: MovementBudgetPayload | null;
}

/** Outcome of a tool invocation relayed to the GM projector. */
export type InvokeResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

/** Side effects the HUD may request; implemented by the direct transport. */
export interface AppActions {
  invoke(tool: string, input: unknown): Promise<InvokeResult>;
  refresh(topic: SnapshotTopic): void;
  reconnect(): void;
  updateSettings(patch: Partial<AppSettings>): void;
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'auto',
  mapCellPx: 12,
  followToken: true,
  autoSheetPage: true,
};

/** Initial state before credentials are read. */
export function initialState(): AppState {
  return {
    connection: { status: 'unpaired' },
    settings: { ...DEFAULT_SETTINGS },
    character: null,
    combat: null,
    map: null,
    log: null,
    reaction: null,
    rollRequest: null,
    lastResult: null,
    actionEconomy: null,
    movement: null,
  };
}

export type Listener = (state: AppState, previous: AppState) => void;

/** Minimal observable store with shallow-merge updates. */
export interface AppStore {
  get(): AppState;
  update(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void;
  subscribe(listener: Listener): () => void;
}

/** Creates a store; listeners run synchronously after each update, in order. */
export function createAppStore(initial: AppState = initialState()): AppStore {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    update(patch) {
      const previous = state;
      const delta = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...delta };
      for (const l of listeners) l(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Effective UI language: explicit setting → Foundry language from `welcome` → phone
 * language → English (canonical fallback, Specs §7.16.5). Only `it`/`en` are shipped.
 */
export function resolveLocale(state: AppState, phoneLanguage = 'en'): 'it' | 'en' {
  if (state.settings.locale !== 'auto') return state.settings.locale;
  const candidate = (state.connection.foundryLocale ?? phoneLanguage).toLowerCase();
  return candidate.startsWith('it') ? 'it' : 'en';
}
