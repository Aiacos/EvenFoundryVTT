/**
 * App store — the single contract between the direct transport (`src/direct/`,
 * `src/phone/`) and the glasses HUD (`src/hud/`).
 *
 * The transport is the only writer of `connection` and the Foundry snapshots; the HUD
 * reads state and calls {@link AppActions}. Plain observable, no framework: G2 output
 * is SDK container calls, not DOM (Specs.md §3.1).
 *
 * @see docs/design/g2-thirds-layout.md
 * @see docs/architecture/0012-direct-foundry-streaming.md
 */
import type {
  ActionResultPayload,
  CharacterSnapshot,
  CombatSnapshot,
  LogSnapshot,
  MapSnapshot,
  ReactionAvailablePayload,
  SnapshotTopic,
} from '@evf/shared-protocol';

/** Connection lifecycle shown by mocks M09 (unpaired), M10 (connecting), M11 (offline). */
export type ConnectionStatus = 'unpaired' | 'connecting' | 'online' | 'offline' | 'revoked';

/** Progress steps rendered by M10 while connecting. */
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
  /** Epoch ms of the last successful snapshot/delta (M11 "Dati mostrati: 2 min fa"). */
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
  autoCombatPage: boolean;
}

export interface AppState {
  connection: ConnectionState;
  settings: AppSettings;
  character: CharacterSnapshot | null;
  combat: CombatSnapshot | null;
  map: MapSnapshot | null;
  log: LogSnapshot | null;
  /** Pending reaction prompt (M07); cleared by the HUD after choice/timeout. */
  reaction: ReactionAvailablePayload | null;
  /** Latest action result for the paired actor (M06). */
  lastResult: ActionResultPayload | null;
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
  mapCellPx: 8,
  followToken: true,
  autoCombatPage: true,
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
    lastResult: null,
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
