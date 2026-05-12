/**
 * Unit tests for handleResume — the ADR-0002 WS resume decision matrix.
 *
 * Covers all four branches:
 * 1. Non-resume message (junk JSON, wrong schema) → silently no-op.
 * 2. Buffer has gap → resume_full_snapshot { reason: 'buffer_gap' }.
 * 3. Buffer empty (expired or caught up) → resume_full_snapshot { reason: 'buffer_expired' }.
 * 4. Buffer contiguous + has entries → resume_replay header + N envelope frames.
 *
 * @see .planning/phases/03-bridge-service-skeleton/03-01-PLAN.md Task 4
 */

import { EventEmitter } from 'node:events';
import type { Envelope } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { ReplayBuffer } from './replay-buffer.js';
import { handleResume } from './resume.js';

interface MockSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.send = vi.fn();
  return emitter;
}

function makeMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function makeEnvelope(sessionId: string, seq: number, ts = Date.now()): Envelope {
  return {
    proto: 'evf-v1',
    seq,
    ts,
    type: 'character.delta',
    session_id: sessionId,
    payload: { actor_id: 'a', field: 'hp', value: 10 },
  };
}

function makeResume(sessionId: string, lastSeq: number): string {
  return JSON.stringify({
    proto: 'evf-v1',
    type: 'client_resume',
    session_id: sessionId,
    last_seq: lastSeq,
  });
}

const SID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('handleResume', () => {
  let socket: MockSocket;
  let logger: Logger;
  let buffer: ReplayBuffer;

  beforeEach(() => {
    socket = makeMockSocket();
    logger = makeMockLogger();
    buffer = new ReplayBuffer();
  });

  describe('ignores non-resume messages', () => {
    it('no-ops on malformed JSON', () => {
      handleResume(socket as unknown as WebSocket, SID, buffer, 'not-json', logger);
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('no-ops on JSON without client_resume schema', () => {
      handleResume(
        socket as unknown as WebSocket,
        SID,
        buffer,
        JSON.stringify({ hello: 'world' }),
        logger,
      );
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('no-ops on a different message type', () => {
      const wrongType = JSON.stringify({
        proto: 'evf-v1',
        type: 'some_future_command',
        last_seq: 3,
      });
      handleResume(socket as unknown as WebSocket, SID, buffer, wrongType, logger);
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('decodes Buffer payloads (the wire format from `ws`)', () => {
      const payload = Buffer.from(makeResume(SID, 0));
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 2));
      handleResume(socket as unknown as WebSocket, SID, buffer, payload, logger);
      // header + 2 frames = 3 sends
      expect(socket.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('buffer_gap branch', () => {
    it('sends resume_full_snapshot { reason: buffer_gap } when seq jumps', () => {
      // Buffer holds seq 1, 2, 5 — missing 3 and 4 → gap.
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 2));
      buffer.push(makeEnvelope(SID, 5));

      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 0), logger);

      expect(socket.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(sent).toEqual({
        proto: 'evf-v1',
        type: 'resume_full_snapshot',
        reason: 'buffer_gap',
      });
    });

    it('DOES NOT replay the gapped envelopes (T-03-01: no partial replay)', () => {
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 5));

      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 0), logger);

      // Exactly one send — the full_snapshot envelope — never the gapped envelopes themselves.
      expect(socket.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(sent.type).toBe('resume_full_snapshot');
    });
  });

  describe('buffer_expired branch', () => {
    it('sends resume_full_snapshot { reason: buffer_expired } when no entries match', () => {
      // last_seq = 10, buffer empty → no entries with seq > 10.
      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 10), logger);

      expect(socket.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(sent).toEqual({
        proto: 'evf-v1',
        type: 'resume_full_snapshot',
        reason: 'buffer_expired',
      });
    });

    it('sends buffer_expired when last_seq is at/above latest buffered seq', () => {
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 2));
      // Client claims seq 5 — newer than anything in buffer → no envelopes with seq > 5.
      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 5), logger);

      expect(socket.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(sent.type).toBe('resume_full_snapshot');
      expect(sent.reason).toBe('buffer_expired');
    });
  });

  describe('resume_replay branch', () => {
    it('sends header + envelope frames for contiguous range', () => {
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 2));
      buffer.push(makeEnvelope(SID, 3));

      // Client has seq 1; expects 2 and 3 replayed.
      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 1), logger);

      // 1 header + 2 envelope frames = 3 sends.
      expect(socket.send).toHaveBeenCalledTimes(3);

      const header = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(header).toEqual({ proto: 'evf-v1', type: 'resume_replay', count: 2 });

      const env1 = JSON.parse(socket.send.mock.calls[1]?.[0] as string);
      expect(env1.seq).toBe(2);

      const env2 = JSON.parse(socket.send.mock.calls[2]?.[0] as string);
      expect(env2.seq).toBe(3);
    });

    it('replays all entries when last_seq = 0 (new session catch-up)', () => {
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(SID, 2));
      buffer.push(makeEnvelope(SID, 3));

      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 0), logger);

      expect(socket.send).toHaveBeenCalledTimes(4); // header + 3 frames
      const header = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(header.count).toBe(3);
    });

    it('isolates sessions — does NOT replay deltas from another session', () => {
      const OTHER = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
      buffer.push(makeEnvelope(SID, 1));
      buffer.push(makeEnvelope(OTHER, 1));
      buffer.push(makeEnvelope(OTHER, 2));

      handleResume(socket as unknown as WebSocket, SID, buffer, makeResume(SID, 0), logger);

      // Header + 1 frame (only SID's entry, not OTHER's).
      expect(socket.send).toHaveBeenCalledTimes(2);
      const header = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
      expect(header.count).toBe(1);
      const env = JSON.parse(socket.send.mock.calls[1]?.[0] as string);
      expect(env.session_id).toBe(SID);
    });
  });
});
