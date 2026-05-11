/**
 * Foundry-side event log reader.
 *
 * Reads from the module-level RingBuffer<EventLogEntry> instance.
 * The ring buffer is populated by the `createChatMessage` hook subscriber.
 *
 * Used by:
 * - REST `GET /v1/events?since=N&limit=200` (socketlib executeAsGM "evf.getEventLog")
 *
 * @see packages/foundry-module/src/readers/ring-buffer.ts (RingBuffer implementation)
 * @see packages/foundry-module/src/readers/hook-subscribers.ts (populates the buffer)
 * @see 02-05-PLAN.md Task 1 (event-log-reader.ts spec)
 */

import type { EventLogEntry } from '@evf/shared-protocol';
import { RingBuffer } from './ring-buffer.js';

/**
 * Module-level event log ring buffer (200-entry capacity per D-2.16).
 *
 * Exported for testing and for hook-subscribers.ts to push entries.
 * Not exported from the package public API — only socketlib handlers access it.
 */
export const eventLogBuffer = new RingBuffer<EventLogEntry>(200);

/**
 * Returns event log entries with seq > since, capped at limit.
 *
 * @param since - Exclusive lower bound on `seq` (use 0 for all entries)
 * @param limit - Maximum number of entries to return (capped at 200)
 * @returns Matching entries in insertion order (oldest first)
 */
export function getEventLog(since: number, limit: number): EventLogEntry[] {
  const cappedLimit = Math.min(limit, 200);
  return eventLogBuffer.since(since).slice(0, cappedLimit);
}
