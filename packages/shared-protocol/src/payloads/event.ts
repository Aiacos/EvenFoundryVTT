/**
 * EventLogEntry Zod schema — Foundry chat/combat event log read shape.
 *
 * Entries are stored in the Foundry-side 200-entry ring buffer (D-2.16).
 * Consumed by `GET /v1/events?since=N&limit=200` for cursor-based pagination.
 *
 * @see Specs.md §4 (read pipeline), §7 (event log overlay)
 * @see packages/foundry-module/src/readers/event-log-reader.ts (producer)
 * @see packages/foundry-module/src/readers/ring-buffer.ts (200-entry ring buffer)
 * @see 02-05-PLAN.md Task 1 (EventLogEntrySchema spec)
 */
import { z } from 'zod';

/**
 * Event type discriminant for the event log.
 *
 * - `chat`   — General chat message (not damage/heal/death)
 * - `damage` — Damage applied to an actor
 * - `heal`   — Healing applied to an actor
 * - `death`  — Actor dropped to 0 HP or below
 */
export const EventTypeSchema = z.enum(['chat', 'damage', 'heal', 'death']);
export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * A single event log entry from the Foundry chat/combat stream.
 *
 * `seq` is the ring-buffer monotonic cursor (not the WS envelope seq).
 * `actorId` is null for messages not linked to a specific actor.
 */
export const EventLogEntrySchema = z.strictObject({
  /** Ring-buffer monotonic cursor. Used for `?since=N` pagination. */
  seq: z.number().int().nonnegative(),
  /** Emission timestamp (`Date.now()` at time of hook), ms since epoch. */
  ts: z.number().int(),
  /** Event type discriminant. */
  type: EventTypeSchema,
  /** Actor ID linked to this event (null for unlinked chat messages). */
  actorId: z.string().nullable(),
  /** Human-readable message content (chat text, damage formula result, etc.). */
  content: z.string(),
});

export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;

/**
 * event.log.delta envelope type (emitted by createChatMessage hook).
 */
export const EVENT_LOG_DELTA_TYPE = 'event.log.delta' as const;

/**
 * Response shape for GET /v1/events — paginated event log.
 *
 * `cursor` is the seq of the last entry returned (for use as `?since=` in subsequent calls).
 */
export const EventLogResponseSchema = z.strictObject({
  entries: z.array(EventLogEntrySchema),
  cursor: z.number().int().nonnegative(),
});

export type EventLogResponse = z.infer<typeof EventLogResponseSchema>;
