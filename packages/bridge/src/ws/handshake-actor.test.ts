/**
 * handleHandshake tests for actorId / selectedActorId wiring (FLV-CHAR-SELECT Task 1).
 *
 * Covers:
 *   - FLV-HS-FC: first-connect with actorId="actorX" → session.selectedActorId === "actorX"
 *   - FLV-HS-RNF: reconnect-not-found with actorId="actorY" → new session.selectedActorId === "actorY"
 *   - FLV-HS-RF: reconnect-found → existing session's selectedActorId preserved (NOT overwritten)
 *
 * @see packages/bridge/src/ws/handshake.ts
 */

import { EventEmitter } from 'node:events';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { TokenCache, type ValidateTokenResult } from '../auth/token-cache.js';
import { handleHandshake } from './handshake.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHandshakeMsg(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    token: 'valid-token-actor',
    locale: 'it',
    capabilities: ['read_char'],
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
    entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'world', userId: 'u' },
    // ADR-0014: authorize the actor ids these wiring tests pin. The handshake
    // gates the actorId pin on this set (close 4400 when ∉ set); a dedicated
    // deny-path test lives in handshake-actor-authz.test.ts.
    authorizedActorIds: ['actorX', 'actorY', 'actorPinned'],
  };
}

const MOCK_REQ = {} as FastifyRequest;

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('handleHandshake — actorId / selectedActorId wiring (FLV-CHAR-SELECT)', () => {
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

  it('FLV-HS-FC: first-connect with actorId → session.selectedActorId === actorId', async () => {
    const promise = handleHandshake(
      socket as unknown as WebSocket,
      MOCK_REQ,
      tokenCache,
      replayBuffer,
      sessionStore,
      logger,
    );
    socket.emit('message', makeHandshakeMsg({ actorId: 'actorX' }));
    const sessionId = await promise;

    expect(sessionId).not.toBeNull();
    if (sessionId === null) throw new Error('sessionId should not be null');
    const session = sessionStore.getSession(sessionId);
    expect(session?.selectedActorId).toBe('actorX');
  });

  it('FLV-HS-RNF: reconnect-not-found with actorId → new session.selectedActorId === actorId', async () => {
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
      makeHandshakeMsg({
        session_id: '00000000-0000-4000-8000-000000000099', // non-existent
        actorId: 'actorY',
      }),
    );
    const sessionId = await promise;

    expect(sessionId).not.toBeNull();
    // A new session was created (different from the non-existent one)
    expect(sessionId).not.toBe('00000000-0000-4000-8000-000000000099');
    if (sessionId === null) throw new Error('sessionId should not be null');
    const session = sessionStore.getSession(sessionId);
    expect(session?.selectedActorId).toBe('actorY');
  });

  it('FLV-HS-RF: reconnect-found → existing selectedActorId preserved, NOT overwritten', async () => {
    // Create a session with selectedActorId="actorPinned"
    const existing = sessionStore.createSession(
      'valid-token-actor',
      'it',
      ['read_char'],
      'actorPinned',
    );
    const { sessionId } = existing;

    const promise = handleHandshake(
      socket as unknown as WebSocket,
      MOCK_REQ,
      tokenCache,
      replayBuffer,
      sessionStore,
      logger,
    );
    // Reconnect WITHOUT actorId in the handshake
    socket.emit('message', makeHandshakeMsg({ session_id: sessionId }));
    const returnedId = await promise;

    expect(returnedId).toBe(sessionId);
    const session = sessionStore.getSession(sessionId);
    // selectedActorId must still be "actorPinned" — NOT cleared
    expect(session?.selectedActorId).toBe('actorPinned');
  });
});
