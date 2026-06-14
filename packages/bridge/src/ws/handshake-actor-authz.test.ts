/**
 * handleHandshake per-actor pin authorization tests (ADR-0014 §4 — T8).
 *
 * The client-supplied `actorId` pin is targeting, NOT authorization. The
 * handshake must reject any pin outside the bearer's authorized (owned) set
 * with the invalid-handshake close code (4400) and resolve null.
 *
 * Covers:
 *   - AUTHZ-HS-DENY:  pin ∉ authorizedActorIds → close 4400, no session
 *   - AUTHZ-HS-ALLOW: pin ∈ authorizedActorIds → session created
 *   - AUTHZ-HS-FAILCLOSED: empty authorizedActorIds + a pin → close 4400
 *   - AUTHZ-HS-NOPIN: pin-less handshake is unaffected (no gate)
 *
 * @see packages/bridge/src/ws/handshake.ts
 * @see packages/bridge/src/auth/actor-authorization.ts
 */

import { EventEmitter } from 'node:events';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { TokenCache, type ValidateTokenResult } from '../auth/token-cache.js';
import { CLOSE_INVALID_HANDSHAKE, handleHandshake } from './handshake.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

function makeHandshakeMsg(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    token: 'valid-token-authz',
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

/** Valid result authorizing `authorizedActorIds` (defaults to ['actor-owned']). */
function makeValidResult(authorizedActorIds: string[] = ['actor-owned']): ValidateTokenResult {
  return {
    valid: true,
    entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'world', userId: 'u' },
    authorizedActorIds,
  };
}

const MOCK_REQ = {} as FastifyRequest;

describe('handleHandshake — per-actor pin authorization (ADR-0014 §4)', () => {
  let socket: MockSocket;
  let logger: Logger;
  let replayBuffer: ReplayBuffer;
  let sessionStore: SessionStore;

  beforeEach(() => {
    socket = makeMockSocket();
    logger = makeMockLogger();
    replayBuffer = new ReplayBuffer();
    sessionStore = new SessionStore();
  });

  function run(result: ValidateTokenResult, msgOverrides: Record<string, unknown>) {
    const tokenCache = new TokenCache(vi.fn().mockResolvedValue(result));
    const promise = handleHandshake(
      socket as unknown as WebSocket,
      MOCK_REQ,
      tokenCache,
      replayBuffer,
      sessionStore,
      logger,
    );
    socket.emit('message', makeHandshakeMsg(msgOverrides));
    return promise;
  }

  it('AUTHZ-HS-DENY: pin NOT in authorized set → close 4400, no session (T8)', async () => {
    const sessionId = await run(makeValidResult(['actor-owned']), {
      actorId: 'actor-someone-else',
    });

    expect(sessionId).toBeNull();
    expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_HANDSHAKE, 'actor_not_authorized');
    expect(sessionStore.listSessions()).toHaveLength(0);
  });

  it('AUTHZ-HS-ALLOW: pin in authorized set → session created', async () => {
    const sessionId = await run(makeValidResult(['actor-owned']), { actorId: 'actor-owned' });

    expect(sessionId).not.toBeNull();
    if (sessionId === null) throw new Error('sessionId should not be null');
    expect(sessionStore.getSession(sessionId)?.selectedActorId).toBe('actor-owned');
  });

  it('AUTHZ-HS-FAILCLOSED: empty authorized set + a pin → close 4400 (authorizes nothing)', async () => {
    const sessionId = await run(makeValidResult([]), { actorId: 'actor-owned' });

    expect(sessionId).toBeNull();
    expect(socket.close).toHaveBeenCalledWith(CLOSE_INVALID_HANDSHAKE, 'actor_not_authorized');
    expect(sessionStore.listSessions()).toHaveLength(0);
  });

  it('AUTHZ-HS-NOPIN: pin-less handshake is unaffected by the gate', async () => {
    const sessionId = await run(makeValidResult([]), {});

    expect(sessionId).not.toBeNull();
    expect(socket.close).not.toHaveBeenCalled();
  });
});
