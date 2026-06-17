/**
 * player-view-store — in-memory record of the latest headless player-view intent.
 *
 * The EvenHub settings panel sends a `client_player_view` WS message when the
 * player toggles "Player view (headless)". The bridge handler
 * ({@link handleClientPlayerView}) records the latest intent here. In P1 (this
 * task) the store is write-only from the handler's perspective; in P2 the
 * headless Chromium orchestrator (ADR-0015 §C) will READ this store to decide
 * whether to spin a headless Foundry session up/down and which actor + Foundry
 * URL to log in as.
 *
 * Single-tenant homelab scope: one world, one store instance per bridge server.
 * Last-write-wins — a later toggle fully replaces the prior intent. Mirrors the
 * simplicity of {@link SettingsStore} (no persistence, no eviction).
 *
 * @see packages/shared-protocol/src/payloads/player-view.ts (schema)
 * @see packages/bridge/src/ws/client-player-view-handler.ts (writer)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

/**
 * The latest player-view intent recorded from a `client_player_view` message.
 *
 * `actorId` / `foundryUrl` are present only when the player enabled the toggle
 * with those fields set; a disable carries neither.
 */
export interface PlayerViewIntent {
  /**
   * Map-view source mode: `off` (GM live, no headless), `streaming` (shared
   * headless session as the streaming Foundry user — auto-framed), or `actor`
   * (headless session as the selected PC → their fogged view).
   */
  mode: 'off' | 'streaming' | 'actor';
  /** Foundry actor to log the headless session in as — `actor` mode (P2). */
  actorId?: string;
  /** Foundry URL the headless session should open (P2). */
  foundryUrl?: string;
}

/** Default cold-start intent: GM live, no headless. */
const DEFAULT_INTENT: PlayerViewIntent = { mode: 'off' };

/**
 * In-memory holder for the latest headless player-view intent (one per world).
 *
 * A single instance is created in `buildServer()` and shared between the
 * `client_player_view` inbound handler (writer) and — in P2 — the headless
 * orchestrator (reader).
 */
export class PlayerViewStore {
  /** The most recent intent; defaults to disabled until the first toggle. */
  private _intent: PlayerViewIntent = DEFAULT_INTENT;

  /**
   * Replace the recorded intent (last-write-wins).
   *
   * Called from the `client_player_view` WS inbound handler on each valid toggle.
   *
   * @param intent - The new player-view intent.
   */
  set(intent: PlayerViewIntent): void {
    this._intent = intent;
  }

  /**
   * Return the latest recorded intent.
   *
   * The P2 orchestrator polls / reads this to drive the headless session.
   */
  get(): PlayerViewIntent {
    return this._intent;
  }
}
