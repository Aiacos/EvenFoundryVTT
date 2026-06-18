/**
 * Player-view (headless session) protocol — EvenHub toggle ⇆ bridge.
 *
 * Upstream `client_player_view` (EvenHub app → bridge): the player toggles
 * "Player view (headless)" in the settings panel. When enabled, the bridge's
 * headless orchestrator (ADR-0015 §C, P2) logs a headless Chromium into Foundry
 * as the selected player so the glasses show that player's REAL view — their
 * viewport, lighting, vision, and fog (which the GM-side synthesized framing
 * cannot reproduce; see ADR-0015 §B).
 *
 * Downstream `player_view_status` (bridge → EvenHub app): the bridge reports the
 * orchestrator state back so the panel can show what's happening. In P1 (no
 * orchestrator yet) the bridge replies `unavailable`.
 *
 * Credential model (ADR-0015 §C AUTH, revised 2026-06-17 — PASSWORD-FREE):
 * NO credentials ever ride on this channel. `streaming` uses the bridge's
 * configured streaming account; `actor` ALSO uses the streaming account to pass
 * the Forge gate, then the headless selects the **selected player's Foundry user**
 * on the `/join` screen and joins with a BLANK password (Foundry users have no
 * password by default). The bridge resolves `actorId` → that user's Foundry
 * username from the character-list cache (only actors of players who OPTED IN to
 * streaming are listed), so the control message carries no secrets.
 *
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */
import { z } from 'zod';

/** Wire-format type for the upstream `client_player_view` WS message. */
export const CLIENT_PLAYER_VIEW_TYPE = 'client_player_view' as const;

/**
 * Map-view source modes:
 * - `off`      — the GM's live, correctly-lit viewport (default; no headless session).
 * - `streaming` — a shared headless session whose joined Foundry user is chosen
 *   from the app's character selector (`actorId` → that PC's owning user); when no
 *   PC is selected / the owner has not opted in, the bridge falls back to the
 *   configured env stream user (`EVF_PLAYER_VIEW_STREAM_USER`). One stream for all glasses.
 * - `actor`    — a headless session joined as the **selected player's Foundry user**
 *   (blank password) → that player's real fogged view (vision + lighting + fog).
 *   No per-player credentials: the bridge resolves the actor's Foundry username.
 */
export const PLAYER_VIEW_MODES = ['off', 'streaming', 'actor'] as const;

/**
 * Upstream `client_player_view` message (EvenHub app → bridge).
 *
 * `z.strictObject` — no unexpected keys, and NO credentials (password-free model;
 * see the module header). `actorId` identifies the selected PC — for BOTH `actor`
 * and `streaming` mode the bridge maps it to that player's Foundry username for the
 * `/join` selection (streaming falls back to the env stream user when absent);
 * `foundryUrl` overrides the bridge's configured Foundry game URL.
 *
 * Feature 001 D2 — unified roster selection (no new wire field): the EvenHub app
 * now derives this message from ONE roster selector. The synthetic top **"Party"**
 * entry maps to `{ mode: 'streaming' }`; selecting a real player character maps to
 * `{ mode: 'actor', actorId }`. The separate off/streaming/actor mode dropdown was
 * removed; `off` is reached implicitly when no capture source is configured.
 */
export const ClientPlayerViewMessageSchema = z.strictObject({
  type: z.literal(CLIENT_PLAYER_VIEW_TYPE),
  mode: z.enum(PLAYER_VIEW_MODES),
  actorId: z.string().min(1).optional(),
  foundryUrl: z.string().url().optional(),
});

/** Typed `client_player_view` WS message. */
export type ClientPlayerViewMessage = z.infer<typeof ClientPlayerViewMessageSchema>;

/** Wire-format type for the downstream `player_view_status` delta. */
export const PLAYER_VIEW_STATUS_TYPE = 'player_view_status' as const;

/** Orchestrator lifecycle states surfaced to the EvenHub panel. */
export const PLAYER_VIEW_STATES = ['off', 'starting', 'live', 'unavailable', 'error'] as const;

/**
 * Downstream `player_view_status` payload (bridge → EvenHub app).
 *
 * `state` is the orchestrator lifecycle; `detail` is an optional human-readable
 * note (e.g. the error reason, or "orchestrator not deployed" in P1).
 */
export const PlayerViewStatusSchema = z.strictObject({
  state: z.enum(PLAYER_VIEW_STATES),
  detail: z.string().max(200).optional(),
});

/** Typed `player_view_status` payload. */
export type PlayerViewStatus = z.infer<typeof PlayerViewStatusSchema>;
