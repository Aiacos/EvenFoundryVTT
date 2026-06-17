/**
 * player-view-store — in-memory record of the latest headless player-view intent.
 *
 * The EvenHub settings panel sends a `client_player_view` WS message when the
 * player toggles "Player view (headless)". The bridge handler
 * ({@link handleClientPlayerView}) records the latest intent here and drives the
 * headless Chromium orchestrator (ADR-0015 §C, P2b) with the same intent. The
 * store provides a stable last-write-wins record (audit / future reconnect
 * re-drive); the orchestrator owns the actual session lifecycle.
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
 * PASSWORD-FREE: no credentials are carried. `actor` mode resolves the selected
 * player's Foundry username (`userName`) from the character-list cache; the
 * headless passes the Forge gate with the bridge's streaming account, then joins
 * as that user with a blank password.
 */
export interface PlayerViewIntent {
  /**
   * Map-view source mode: `off` (GM live, no headless), `streaming` (shared
   * headless session as the bridge's streaming Foundry user — auto-framed), or
   * `actor` (headless joined as the selected player's Foundry user → their real
   * fogged view; no per-player credentials).
   */
  mode: 'off' | 'streaming' | 'actor';
  /** Selected PC actor id — `actor` mode (focus framing + audit + username resolution). */
  actorId?: string;
  /** Foundry game URL the headless session should open (overrides the env default). */
  foundryUrl?: string;
  /**
   * Foundry username to SELECT on the `/join` screen — `actor` mode only. Resolved
   * by the bridge from `actorId` via the character-list cache (only opted-in
   * players are listed). Absent → the actor is not available for streaming.
   */
  userName?: string;
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
