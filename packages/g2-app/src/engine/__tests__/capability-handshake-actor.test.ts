/**
 * capability-handshake tests for actorId param (FLV-CHAR-SELECT Task 3).
 *
 * CH-ACT-01: performCapabilityHandshake with actorId → sent JSON includes "actorId"
 * CH-ACT-02: performCapabilityHandshake WITHOUT actorId → sent JSON has NO actorId key
 *
 * @see packages/g2-app/src/engine/capability-handshake.ts
 */

import { EventEmitter } from 'node:events';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performCapabilityHandshake } from '../capability-handshake.js';

interface MockSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.send = vi.fn();
  emitter.close = vi.fn();
  emitter.addEventListener = vi.fn(
    (event: string, handler: (ev: { data: string }) => void, _options?: { once?: boolean }) => {
      emitter.once(event, (data: string) => handler({ data }));
    },
  );
  emitter.removeEventListener = vi.fn();
  return emitter;
}

function validServerResponse(): string {
  return JSON.stringify({
    proto_chosen: 'evf-v1',
    server_caps: [...SERVER_CAPS_V1],
    server_locale: 'it',
    session_id: '00000000-0000-4000-8000-000000000001',
    replay_seq: 0,
  });
}

describe('performCapabilityHandshake — actorId param (FLV-CHAR-SELECT)', () => {
  let socket: MockSocket;

  beforeEach(() => {
    socket = makeMockSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CH-ACT-01: with actorId → sent JSON includes "actorId" with the exact value', async () => {
    const promise = performCapabilityHandshake(
      socket as unknown as WebSocket,
      'tok',
      'it',
      undefined,
      10_000,
      '6KWxQXAiJgz4zKlS',
    );
    socket.emit('message', validServerResponse());
    await promise;

    expect(socket.send).toHaveBeenCalledTimes(1);
    const sentRaw = socket.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(sentRaw) as Record<string, unknown>;
    expect(parsed.actorId).toBe('6KWxQXAiJgz4zKlS');
  });

  it('CH-ACT-02: WITHOUT actorId → sent JSON has NO actorId key (exactOptionalPropertyTypes-clean)', async () => {
    const promise = performCapabilityHandshake(
      socket as unknown as WebSocket,
      'tok',
      'it',
      undefined,
      10_000,
      // actorId intentionally omitted
    );
    socket.emit('message', validServerResponse());
    await promise;

    expect(socket.send).toHaveBeenCalledTimes(1);
    const sentRaw = socket.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(sentRaw) as Record<string, unknown>;
    expect('actorId' in parsed).toBe(false);
  });
});
