/**
 * Unit tests for capability-handshake (Phase 4a Plan 02 Task 2).
 *
 * Covers (per 04A-02-PLAN.md `<behavior>` block, CH-1 .. CH-6):
 *   - performCapabilityHandshake sends a single HandshakeClient JSON
 *   - Successful HandshakeServer response → resolves with parsed payload
 *   - Non-JSON response → rejects with HandshakeError('parse_failed')
 *   - Schema-invalid response → rejects with HandshakeError('schema_failed')
 *   - No response within timeout → rejects with HandshakeError('timeout')
 *   - probeBleThroughput returns 'auto' / 'raster' / 'glyph' per CONTEXT.md Area 4
 *
 * The native-WebSocket addEventListener('message', handler, {once:true}) flow
 * is mocked via an EventEmitter-backed MockSocket whose addEventListener
 * bridges to once() for the test driver.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §capability-handshake.test.ts
 * @see packages/bridge/src/ws/handshake.test.ts (server-side analog)
 */
import { EventEmitter } from 'node:events';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HandshakeError,
  performCapabilityHandshake,
  probeBleThroughput,
} from '../capability-handshake.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  // Native WebSocket uses addEventListener; bridge to EventEmitter.once().
  // The MessageEvent shape only needs a .data field for the SUT.
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

// ─────────────────────────────────────────────────────────────────────────────
// performCapabilityHandshake
// ─────────────────────────────────────────────────────────────────────────────

describe('performCapabilityHandshake', () => {
  let socket: MockSocket;

  beforeEach(() => {
    socket = makeMockSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CH-1: sends one HandshakeClient JSON with proto/token/locale/capabilities', async () => {
    const promise = performCapabilityHandshake(socket as unknown as WebSocket, 'tok-123', 'it');
    socket.emit('message', validServerResponse());
    await promise;
    expect(socket.send).toHaveBeenCalledTimes(1);
    const sentRaw = socket.send.mock.calls[0]?.[0];
    expect(typeof sentRaw).toBe('string');
    const parsed = JSON.parse(sentRaw as string) as Record<string, unknown>;
    expect(parsed.proto).toBe('evf-v1');
    expect(parsed.token).toBe('tok-123');
    expect(parsed.locale).toBe('it');
    expect(parsed.capabilities).toEqual([...SERVER_CAPS_V1]);
  });

  it('CH-2: resolves with parsed HandshakeServer on a valid response', async () => {
    const promise = performCapabilityHandshake(socket as unknown as WebSocket, 'tok-123', 'it');
    socket.emit('message', validServerResponse());
    const result = await promise;
    expect(result.server_caps).toEqual([...SERVER_CAPS_V1]);
    expect(result.server_locale).toBe('it');
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.replay_seq).toBe(0);
  });

  it('CH-3: rejects with HandshakeError(parse_failed) on non-JSON response', async () => {
    const promise = performCapabilityHandshake(socket as unknown as WebSocket, 'tok-123', 'it');
    socket.emit('message', 'this is not json {{{');
    await promise.then(
      () => {
        throw new Error('expected rejection');
      },
      (err) => {
        expect(err).toBeInstanceOf(HandshakeError);
        expect((err as HandshakeError).code).toBe('parse_failed');
      },
    );
  });

  it('CH-4: rejects with HandshakeError(schema_failed) on schema-invalid response', async () => {
    const promise = performCapabilityHandshake(socket as unknown as WebSocket, 'tok-123', 'it');
    socket.emit(
      'message',
      JSON.stringify({ proto_chosen: 'evf-v1' /* missing server_caps etc. */ }),
    );
    await promise.then(
      () => {
        throw new Error('expected rejection');
      },
      (err) => {
        expect(err).toBeInstanceOf(HandshakeError);
        expect((err as HandshakeError).code).toBe('schema_failed');
      },
    );
  });

  it('CH-5: rejects with HandshakeError(timeout) when no response arrives', async () => {
    vi.useFakeTimers();
    const promise = performCapabilityHandshake(
      socket as unknown as WebSocket,
      'tok-123',
      'it',
      undefined,
      10_000,
    );
    // Attach the catcher BEFORE advancing fake timers so the rejection is
    // never unhandled — `expect(...).rejects` records the rejection slot
    // up-front. Then drive the clock past the timeout window.
    const assertion = expect(promise).rejects.toBeInstanceOf(HandshakeError);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
    // Re-await to assert the discriminator code (the `.rejects` chain
    // already consumed the rejection above; a second awaited copy of the
    // same promise resolves to the original rejection reason).
    await expect(promise).rejects.toMatchObject({ code: 'timeout' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// probeBleThroughput
// ─────────────────────────────────────────────────────────────────────────────

describe('probeBleThroughput', () => {
  it('CH-6: returns auto when durationMs < 500 (insufficient sample)', () => {
    expect(probeBleThroughput(100_000, 200)).toBe('auto');
    expect(probeBleThroughput(0, 499)).toBe('auto');
  });

  it('CH-6: returns glyph when sustained throughput < 100 kbps', () => {
    // 1000 bytes in 1000 ms = 8 kbps → glyph
    expect(probeBleThroughput(1000, 1000)).toBe('glyph');
    // Just below 100 kbps in a 1 second window: 100 kbps = 12500 bytes/s
    expect(probeBleThroughput(12_499, 1000)).toBe('glyph');
  });

  it('CH-6: returns raster when sustained throughput >= 100 kbps', () => {
    // 12500 bytes in 1000 ms = 100 kbps → raster
    expect(probeBleThroughput(12_500, 1000)).toBe('raster');
    // Comfortable above threshold
    expect(probeBleThroughput(30_000, 1000)).toBe('raster');
  });
});
