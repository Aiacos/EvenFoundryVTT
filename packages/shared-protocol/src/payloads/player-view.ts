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
 * Credentials are NEVER carried here — the toggle only signals intent; the
 * bridge holds the Forge + Foundry credentials (ADR-0015 §C AUTH).
 *
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */
import { z } from 'zod';

/** Wire-format type for the upstream `client_player_view` WS message. */
export const CLIENT_PLAYER_VIEW_TYPE = 'client_player_view' as const;

/**
 * Upstream `client_player_view` message (EvenHub app → bridge).
 *
 * `z.strictObject` — no unexpected keys on the control channel. `actorId` /
 * `foundryUrl` are the player to log in as and the Foundry URL to open; both are
 * optional on `enabled:false` (a disable needs neither).
 */
export const ClientPlayerViewMessageSchema = z.strictObject({
  type: z.literal(CLIENT_PLAYER_VIEW_TYPE),
  enabled: z.boolean(),
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
