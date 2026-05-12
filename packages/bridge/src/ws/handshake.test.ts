/**
 * Unit tests for handleHandshake.
 *
 * Covers:
 * - valid token → successful handshake response
 * - invalid token → 4401 close
 * - malformed (non-JSON) message → 4400 close
 * - schema validation failure → 4400 close
 * - partial capability overlap → intersection returned + pino.warn called
 * - replay_seq populated on reconnect (existing session in sessionStore)
 * - new session created on fresh connect (replay_seq = 0)
 * - session_id not found on reconnect → new session (replay_seq = 0)
 */

import { EventEmitter } from 'node:events';
import type { Envelope } from '@evf/shared-protocol';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { TokenCache, type ValidateTokenResult } from '../auth/token-cache.js';
import { CLOSE_INVALID_HANDSHAKE, CLOSE_INVALID_TOKEN, handleHandshake } from './handshake.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function makeValidHandshake(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    token: 'valid-token-abc123',
    locale: 'it',
    capabilities: ['read_char', 'read_combat', 'subscribe'],
    ...overrides,
  });
}

interface MockSocket extends EventEmitter {
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.close = vi.fn();
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

function makeValidResult(): ValidateTokenResult {
  return {
    valid: true,
    entry: { alias: 'Test G2', expiresAt: Date.now() + 86_400_000, worldId: 'test-world' },
  };
}

function makeInvalidResult(
  reason: ValidateTokenResult['reason'] = 'unknown_token',
): ValidateTokenResult {
  return { valid: false, reason };
}

function makeEnvelope(sessionId: string, seq: number): Envelope {
  return {
    proto: 'evf-v1',
    seq,
    ts: Date.now(),
    type: 'test.delta',
    session_id: sessionId,
    payload: null,
  };
}

const MOCK_REQ = {} as FastifyRequest;

/** noUncheckedIndexedAccess-safe helper to get the first argument of the first mock.calls entry. */
function firstCallArg(mockFn: ReturnType<typeof vi.fn>): string {
  const call = mockFn.mock.calls[0];
  if (call === undefined) throw new Error('Mock was not called');
  const arg = call[0];
  if (typeof arg !== 'string') throw new Error(`Expected string arg, got ${typeof arg}`);
  return arg;
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

describe('handleHandshake', () => {
  let socket: MockSocket;
  let logger: Logger;
  let tokenCache: TokenCache;
  let replayBuffer: ReplayBuffer;
  let sessionStore: SessionStore;

  beforeEach(() => {
    socket = makeMockSocket();
    logger = makeMockLogger();
    tokenCache = new TokenCache(vi.fn().mockResolvedValue(makeValidResult()));
    replayBuffer = new ReplayBuffer();
    sessionStore = new SessionStore();
  });

  // ── Valid handshake ────────────────────────────────

  describe('valid handshake', () => {
    it('sends handshake response on valid token', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake());
      const sessionId = await promise;

      expect(socket.close).not.toHaveBeenCalled();
      expect(socket.send).toHaveBeenCalledOnce();

      const sent = JSON.parse(firstCallArg(socket.send)) as Record<string, unknown>;
      expect(sent.proto_chosen).toBe('evf-v1');
      expect(sent.server_caps).toBeInstanceOf(Array);
      expect(sent.session_id).toBeTypeOf('string');
      expect(sent.replay_seq).toBe(0);

      // Phase 03: success path returns a non-empty UUID string (not null)
      expect(sessionId).toBeTypeOf('string');
      expect(sessionId).not.toBeNull();
      expect(sessionId?.length).toBeGreaterThan(0);
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('returns intersection of client caps and SERVER_CAPS_V1', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit(
        'message',
        makeValidHandshake({
          capabilities: ['read_char', 'read_combat', 'midiqol_capability_v1'],
        }),
      );
      const sessionId = await promise;

      const sent = JSON.parse(firstCallArg(socket.send)) as Record<string, unknown>;
      // midiqol_capability_v1 is NOT in SERVER_CAPS_V1 (Phase 7)
      expect(sent.server_caps).toEqual(expect.arrayContaining(['read_char', 'read_combat']));
      expect(sent.server_caps as string[]).not.toContain('midiqol_capability_v1');

      // Phase 03: success path returns non-null sessionId
      expect(sessionId).not.toBeNull();
    });
  });

  // ── Invalid token → 4401 ──────────────────────────

  describe('invalid token', () => {
    it('closes with 4401 when token is invalid', async () => {
      const invalidCache = new TokenCache(
        vi.fn().mockResolvedValue(makeInvalidResult('unknown_token')),
      );

      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        invalidCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake({ token: 'bad-token' }));
      const sessionId = await promise;

      expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_TOKEN, 'invalid_token');
      expect(socket.send).not.toHaveBeenCalled();
      // Phase 03: failure path returns null
      expect(sessionId).toBeNull();
    });

    it('closes with 4401 on expired token', async () => {
      const expiredCache = new TokenCache(vi.fn().mockResolvedValue(makeInvalidResult('expired')));

      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        expiredCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake());
      const sessionId = await promise;

      expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_TOKEN, 'invalid_token');
      // Phase 03: failure path returns null
      expect(sessionId).toBeNull();
    });

    it('closes with 4401 on revoked token', async () => {
      const revokedCache = new TokenCache(vi.fn().mockResolvedValue(makeInvalidResult('revoked')));

      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        revokedCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake());
      const sessionId = await promise;

      expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_TOKEN, 'invalid_token');
      // Phase 03: failure path returns null
      expect(sessionId).toBeNull();
    });
  });

  // ── Malformed message → 4400 ──────────────────────

  describe('malformed message', () => {
    it('closes with 4400 on non-JSON message', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', 'not-valid-json{{{');
      const sessionId = await promise;

      expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
      expect(socket.send).not.toHaveBeenCalled();
      // Phase 03: failure path returns null
      expect(sessionId).toBeNull();
    });

    it('closes with 4400 when schema validation fails', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', JSON.stringify({ proto: 'wrong-proto', token: 'x' }));
      const sessionId = await promise;

      expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
      // Phase 03: failure path returns null
      expect(sessionId).toBeNull();
    });
  });

  // ── Capability intersection warn-and-continue ─────

  describe('capability negotiation', () => {
    it('logs a warning when client requests unknown capabilities', async () => {
      const warnFn = vi.fn();
      const warnLogger = { ...logger, warn: warnFn } as unknown as Logger;

      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        warnLogger,
      );

      socket.emit(
        'message',
        makeValidHandshake({
          capabilities: ['read_char', 'midiqol_capability_v1', 'future_cap'],
        }),
      );
      await promise;

      // warn-and-continue: socket should NOT be closed
      expect(socket.close).not.toHaveBeenCalled();
      // pino.warn should have been called
      expect(warnFn).toHaveBeenCalled();
    });

    it('returns empty server_caps when no capabilities overlap', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit(
        'message',
        makeValidHandshake({
          capabilities: ['midiqol_capability_v1', 'future_cap'],
        }),
      );
      await promise;

      expect(socket.close).not.toHaveBeenCalled();
      const sent = JSON.parse(firstCallArg(socket.send)) as Record<string, unknown>;
      expect(sent.server_caps).toEqual([]);
    });
  });

  // ── Reconnect: replay_seq from buffer ─────────────

  describe('reconnect', () => {
    it('returns replay_seq from buffer when session exists', async () => {
      // Create a session
      const session = sessionStore.createSession('valid-token-abc123', 'it', ['read_char']);
      const { sessionId } = session;

      // Push some deltas into the replay buffer
      replayBuffer.push(makeEnvelope(sessionId, 1));
      replayBuffer.push(makeEnvelope(sessionId, 2));
      replayBuffer.push(makeEnvelope(sessionId, 7));

      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake({ session_id: sessionId }));
      await promise;

      const sent = JSON.parse(firstCallArg(socket.send)) as Record<string, unknown>;
      expect(sent.replay_seq).toBe(7);
      expect(sent.session_id).toBe(sessionId);
    });

    it('creates new session when reconnect session_id not found', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit(
        'message',
        makeValidHandshake({
          session_id: '00000000-0000-4000-8000-000000000099',
        }),
      );
      await promise;

      const sent = JSON.parse(firstCallArg(socket.send)) as Record<string, unknown>;
      expect(sent.replay_seq).toBe(0);
      // A new session_id was generated (different from the non-existent one)
      expect(sent.session_id).not.toBe('00000000-0000-4000-8000-000000000099');
    });
  });

  // ── Session store interaction ──────────────────────

  describe('session store', () => {
    it('creates a session in the store on successful handshake', async () => {
      const promise = handleHandshake(
        socket as unknown as WebSocket,
        MOCK_REQ,
        tokenCache,
        replayBuffer,
        sessionStore,
        logger,
      );

      socket.emit('message', makeValidHandshake());
      await promise;

      expect(sessionStore.size).toBe(1);
      const sent = JSON.parse(firstCallArg(socket.send)) as { session_id: string };
      const session = sessionStore.getSession(sent.session_id);
      expect(session).toBeDefined();
      expect(session?.locale).toBe('it');
    });
  });
});
