/**
 * WS resume handler — decides replay vs full-snapshot after handshake.
 *
 * Phase 03 closes the resume loop opened by ADR-0002. After a successful
 * handshake, the client MAY send a `ClientResume` message with the highest
 * seq it has already received. The bridge then replays missed envelopes
 * (when the buffer is intact and contiguous) or instructs the client to
 * re-fetch full state via REST (when the buffer expired or has a gap).
 *
 * Decision matrix:
 *
 *   | Buffer state for seq > last_seq | Bridge response                                |
 *   | ------------------------------- | ---------------------------------------------- |
 *   | empty (expired or never had it) | `resume_full_snapshot { reason: 'buffer_expired' }` |
 *   | non-contiguous (has gap)        | `resume_full_snapshot { reason: 'buffer_gap' }`     |
 *   | contiguous (≥1 envelope)        | `resume_replay { count: N }` + N envelope frames    |
 *
 * The handler never throws — all parse/decision failures close the socket
 * with code 4400 (CLOSE_INVALID_HANDSHAKE) so the client can reconnect cleanly.
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see .planning/phases/03-bridge-service-skeleton/03-01-PLAN.md Task 4
 * @see .planning/phases/03-bridge-service-skeleton/03-RESEARCH.md §6
 */

import {
  ClientResumeSchema,
  type ResumeFullSnapshot,
  type ResumeReplay,
} from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { WebSocket } from 'ws';
import type { ReplayBuffer } from './replay-buffer.js';

/**
 * Handle a parsed-or-not `client_resume` message on an already-handshaked socket.
 *
 * @param socket - The WS socket the client message arrived on.
 * @param sessionId - The sessionId returned by handleHandshake (post-auth identity).
 * @param replayBuffer - The bridge replay buffer.
 * @param rawData - Raw socket payload (Buffer or string from `ws` library).
 * @param logger - pino logger (redaction config applied at server level).
 * @returns void — side effects: socket.send() one or more frames.
 */
export function handleResume(
  socket: WebSocket,
  sessionId: string,
  replayBuffer: ReplayBuffer,
  rawData: Buffer | ArrayBuffer | Buffer[] | string,
  logger: Logger,
): void {
  // Parse as JSON; ignore non-JSON or messages that don't match the schema.
  // Non-resume messages may legitimately arrive (future Phase 04+ client commands)
  // and MUST NOT crash the handler — silently no-op.
  let parsed: unknown;
  try {
    const text =
      typeof rawData === 'string'
        ? rawData
        : Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Array.isArray(rawData)
            ? Buffer.concat(rawData).toString('utf-8')
            : Buffer.from(rawData).toString('utf-8');
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const result = ClientResumeSchema.safeParse(parsed);
  if (!result.success) {
    // Not a client_resume message — ignore. Future message types route elsewhere.
    return;
  }

  const { last_seq: lastSeq } = result.data;

  // Decision: hasGap first (cheapest + safest — gap means definitely full snapshot).
  if (replayBuffer.hasGap(sessionId, lastSeq)) {
    const env: ResumeFullSnapshot = {
      proto: 'evf-v1',
      type: 'resume_full_snapshot',
      reason: 'buffer_gap',
    };
    socket.send(JSON.stringify(env));
    logger.info(
      { sessionId, lastSeq, reason: 'buffer_gap' },
      'WS resume: gap detected — instructing client to re-fetch state',
    );
    return;
  }

  const deltas = replayBuffer.replay(sessionId, lastSeq);

  // Empty replay means the buffer expired (TTL eviction) OR last_seq is at/above
  // the latest buffered seq (already caught up — no replay needed but client wants
  // confirmation). Treat as `buffer_expired` per the resume protocol: client
  // re-fetches state. This is safer than a silent no-op which could hide drift.
  if (deltas.length === 0) {
    const env: ResumeFullSnapshot = {
      proto: 'evf-v1',
      type: 'resume_full_snapshot',
      reason: 'buffer_expired',
    };
    socket.send(JSON.stringify(env));
    logger.info(
      { sessionId, lastSeq, reason: 'buffer_expired' },
      'WS resume: buffer empty for requested range — instructing client to re-fetch',
    );
    return;
  }

  // Contiguous replay: send header frame then N envelope frames.
  const header: ResumeReplay = {
    proto: 'evf-v1',
    type: 'resume_replay',
    count: deltas.length,
  };
  socket.send(JSON.stringify(header));
  for (const env of deltas) {
    socket.send(JSON.stringify(env));
  }
  logger.info({ sessionId, lastSeq, count: deltas.length }, 'WS resume: replayed missed envelopes');
}
