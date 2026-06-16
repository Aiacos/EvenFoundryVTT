/**
 * Upstream `client_select_actor` WS message (glasses / EvenHub app → bridge).
 *
 * Lets the player change the active character (the "focus actor") live from the
 * EvenHub app settings panel, WITHOUT reconnecting. The bridge re-checks the
 * requested `actorId` against the session bearer's authorized set (ADR-0014,
 * fail-closed) and, if allowed, updates `session.selectedActorId`. That single
 * field then drives both:
 *   - `character.delta` delivery filtering (delta-emitter keys on
 *     `session.selectedActorId`), and
 *   - map auto-framing (the module learns it via `SessionStore.getFocusActorId`
 *     piggybacked on the frame-POST response).
 *
 * Mirrors the `client_setting` upstream channel (same strict-object discipline).
 *
 * @see packages/shared-protocol/src/payloads/settings-display.ts (sibling upstream message)
 * @see docs/architecture/0015-player-view-map-capture.md (selection → focus actor)
 */
import { z } from 'zod';

/** Wire-format type constant for the upstream `client_select_actor` WS message. */
export const CLIENT_SELECT_ACTOR_TYPE = 'client_select_actor' as const;

/**
 * Upstream `client_select_actor` WS message (glasses → bridge).
 *
 * `z.strictObject` — extra/unknown top-level fields are REJECTED so the write
 * channel cannot smuggle unexpected keys. `actorId` is a non-empty string (the
 * Foundry actor id to focus); the bridge still authorizes it against the
 * bearer's owned-actor set before applying (the schema only guarantees shape).
 */
export const ClientSelectActorMessageSchema = z.strictObject({
  type: z.literal(CLIENT_SELECT_ACTOR_TYPE),
  actorId: z.string().min(1),
});

/** Typed `client_select_actor` WS message. */
export type ClientSelectActorMessage = z.infer<typeof ClientSelectActorMessageSchema>;
