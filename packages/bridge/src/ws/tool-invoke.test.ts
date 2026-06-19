/**
 * Unit tests for handleToolInvoke (CR-01 regression suite).
 *
 * Verifies that `tool.invoke` envelopes arriving on an already-handshaked WS
 * socket are correctly parsed, validated, and routed to the injected
 * `dispatchToolFn`. This is the regression suite for CR-01: previously the
 * bridge WS server had no handler for `tool.invoke` messages, causing both
 * the CONC-01 (drop-concentration) and ACT-02 (confirm-template-placement)
 * flows to be silently dropped.
 *
 * Tests:
 * - CR-01-HAPPY: valid tool.invoke envelope routes to dispatchToolFn
 * - CR-01-WRONG-TYPE: non tool.invoke envelope is silently ignored
 * - CR-01-BAD-JSON: malformed JSON is silently ignored
 * - CR-01-BAD-PAYLOAD: invalid payload (missing idempotencyKey) returns error
 * - CR-01-NO-SESSION: expired/missing session returns error
 * - CR-01-DISPATCH-THROWS: dispatchToolFn rejection is caught and returned as error
 * - CR-01-CONFIRM-TPL: confirm-template-placement toolId parses and routes correctly
 * - CR-01-DROP-CONC: drop-concentration toolId parses and routes correctly
 * - CR-01-RESULT-SHAPE: tool.result response has expected proto + type + session_id fields
 * - CR-01-BEARER-FORWARD: dispatchToolFn receives the session bearer token
 *
 * @see packages/bridge/src/ws/tool-invoke.ts
 * @see .planning/phases/07-foundry-module-write-path/07-REVIEW.md CR-01
 */

import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { TokenCache, ValidateTokenResult } from '../auth/token-cache.js';
import { SessionStore } from './session-store.js';
import { type DispatchToolFn, handleToolInvoke, type ToolInvokeResult } from './tool-invoke.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MockSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.send = vi.fn();
  emitter.close = vi.fn();
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

function makeDispatchFn(
  result: ToolInvokeResult = { success: true, data: { ok: true } },
): DispatchToolFn {
  return vi.fn().mockResolvedValue(result) as DispatchToolFn;
}

/**
 * Mock TokenCache whose `validate()` returns the given result.
 *
 * Default: a valid token authorizing `actor-owned` (used by the ADR-0014
 * Amendment 1 write fast-reject). Existing CR-01 tests pass payloads with a
 * camelCase `actorId` field (not the `actor_id` the extractor reads), so the gate
 * is a no-op for them and `validate` is never even called — but a TokenCache must
 * still be injected to satisfy the signature.
 */
function makeMockTokenCache(
  result: ValidateTokenResult = {
    valid: true,
    entry: { alias: 'a', expiresAt: Date.now() + 1_000, worldId: 'w', userId: 'user-owner' },
    authorizedActorIds: ['actor-owned'],
  },
): { cache: TokenCache; validate: ReturnType<typeof vi.fn> } {
  const validate = vi.fn().mockResolvedValue(result);
  return { cache: { validate } as unknown as TokenCache, validate };
}

/**
 * Create a session in the store and return its session ID.
 * Uses the public createSession() API and then retrieves the session to get its ID.
 */
function createSessionAndGetId(store: SessionStore, bearer: string): string {
  const session = store.createSession(bearer, 'it', ['read_char']);
  return session.sessionId;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleToolInvoke', () => {
  let socket: MockSocket;
  let sessionStore: SessionStore;
  let logger: Logger;
  let tokenCache: TokenCache;
  // Must be a valid UUID v4 to pass EnvelopeSchema.session_id validation
  const SESSION_ID = '00000000-0000-4000-8000-000000000abc';
  const BEARER = 'bearer-token-test';

  beforeEach(() => {
    socket = makeMockSocket();
    sessionStore = new SessionStore();
    logger = makeMockLogger();
    // Default token cache — never consulted by the CR-01 tests (they use a
    // camelCase `actorId` arg the gate ignores), but required by the signature.
    tokenCache = makeMockTokenCache().cache;
  });

  // ── CR-01-HAPPY ──────────────────────────────────────────────────────────────

  it('CR-01-HAPPY: valid tool.invoke envelope routes to dispatchToolFn', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        args: { actorId: 'actor-1' },
      },
    });

    const dispatchFn = makeDispatchFn({ success: true, data: { ok: true } });

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledOnce();
    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'drop-concentration' }),
      BEARER,
    );
    expect(socket.send).toHaveBeenCalledOnce();
  });

  // ── CR-01-WRONG-TYPE ─────────────────────────────────────────────────────────

  it('CR-01-WRONG-TYPE: non tool.invoke envelope type is silently ignored', async () => {
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'client_resume',
      session_id: SESSION_ID,
      payload: { last_seq: 0 },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      SESSION_ID,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  // ── CR-01-BAD-JSON ───────────────────────────────────────────────────────────

  it('CR-01-BAD-JSON: malformed JSON is silently ignored', async () => {
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      SESSION_ID,
      sessionStore,
      dispatchFn,
      tokenCache,
      'not json {{{',
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  // ── CR-01-BAD-PAYLOAD ────────────────────────────────────────────────────────

  it('CR-01-BAD-PAYLOAD: invalid payload (missing idempotencyKey) sends error response', async () => {
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: SESSION_ID,
      payload: {
        toolId: 'drop-concentration',
        // Missing idempotencyKey — schema violation
        args: { actorId: 'actor-1' },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      SESSION_ID,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledOnce();
    const sentMsg = JSON.parse(socket.send.mock.calls[0]![0] as string) as {
      type: string;
      payload: { success: boolean; error: string };
    };
    expect(sentMsg.type).toBe('tool.result');
    expect(sentMsg.payload.success).toBe(false);
    expect(sentMsg.payload.error).toBe('invalid_payload');
  });

  // ── CR-01-NO-SESSION ─────────────────────────────────────────────────────────

  it('CR-01-NO-SESSION: missing/expired session sends error response', async () => {
    // sessionStore is empty — no session for SESSION_ID
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: SESSION_ID,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        args: { actorId: 'actor-1' },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      SESSION_ID,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledOnce();
    const sentMsg = JSON.parse(socket.send.mock.calls[0]![0] as string) as {
      payload: { success: boolean; error: string };
    };
    expect(sentMsg.payload.success).toBe(false);
    expect(sentMsg.payload.error).toBe('session_not_found');
  });

  // ── CR-01-DISPATCH-THROWS ────────────────────────────────────────────────────

  it('CR-01-DISPATCH-THROWS: dispatchToolFn rejection returns error result', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        args: { actorId: 'actor-1' },
      },
    });
    const dispatchFn = vi.fn().mockRejectedValue(new Error('socketlib timeout')) as DispatchToolFn;

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(socket.send).toHaveBeenCalledOnce();
    const sentMsg = JSON.parse(socket.send.mock.calls[0]![0] as string) as {
      payload: { success: boolean; error: string };
    };
    expect(sentMsg.payload.success).toBe(false);
    expect(sentMsg.payload.error).toContain('socketlib timeout');
  });

  // ── CR-01-CONFIRM-TPL ────────────────────────────────────────────────────────

  it('CR-01-CONFIRM-TPL: confirm-template-placement toolId routes to dispatchToolFn', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 2,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'confirm-template-placement',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
        args: {
          placementId: '00000000-0000-4000-8000-000000000099',
          templateIndex: 0,
          x: 150,
          y: 300,
        },
      },
    });
    const dispatchFn = makeDispatchFn({ success: true, data: { templateId: 'tmpl-1' } });

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledOnce();
    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'confirm-template-placement' }),
      BEARER,
    );
  });

  // ── CR-01-DROP-CONC ──────────────────────────────────────────────────────────

  it('CR-01-DROP-CONC: drop-concentration toolId routes to dispatchToolFn', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 3,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        args: { actorId: 'actor-wizard' },
      },
    });
    const dispatchFn = makeDispatchFn({ success: true, data: null });

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'drop-concentration' }),
      BEARER,
    );
    expect(socket.send).toHaveBeenCalledOnce();
  });

  // ── CR-01-RESULT-SHAPE ───────────────────────────────────────────────────────

  it('CR-01-RESULT-SHAPE: tool.result response has proto, type, session_id, payload fields', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        args: { actorId: 'actor-1' },
      },
    });
    const expectedResult: ToolInvokeResult = { success: true, data: { droppedAt: 12345 } };
    const dispatchFn = makeDispatchFn(expectedResult);

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    const sentMsg = JSON.parse(socket.send.mock.calls[0]![0] as string) as {
      proto: string;
      type: string;
      session_id: string;
      payload: ToolInvokeResult;
    };
    expect(sentMsg.proto).toBe('evf-v1');
    expect(sentMsg.type).toBe('tool.result');
    expect(sentMsg.session_id).toBe(sessionId);
    expect(sentMsg.payload).toEqual(expectedResult);
  });

  // ── CR-01-BEARER-FORWARD ─────────────────────────────────────────────────────

  it('CR-01-BEARER-FORWARD: dispatchToolFn receives the session bearer token', async () => {
    const specificBearer = 'my-specific-bearer-token-xyz';
    const sessionId = createSessionAndGetId(sessionStore, specificBearer);
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'drop-concentration',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
        args: { actorId: 'actor-1' },
      },
    });
    const dispatchSpy = vi.fn().mockResolvedValue({ success: true, data: null });
    const dispatchFn = dispatchSpy as unknown as DispatchToolFn;

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      tokenCache,
      rawData,
      logger,
    );

    const [, bearerArg] = dispatchSpy.mock.calls[0]!;
    expect(bearerArg).toBe(specificBearer);
  });

  // ── ADR-0014 Amendment 1: write-path per-actor fast-reject ───────────────────

  it('AUTHZ-DENY: acting actor_id NOT in authorized set → not_authorized, dispatch NOT called', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    // Bearer authorizes only `actor-owned`; the write acts as `actor-foreign`.
    const { cache } = makeMockTokenCache({
      valid: true,
      entry: { alias: 'a', expiresAt: Date.now() + 1_000, worldId: 'w', userId: 'user-owner' },
      authorizedActorIds: ['actor-owned'],
    });
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'cast-spell',
        idempotencyKey: '00000000-0000-4000-8000-000000000010',
        args: { actor_id: 'actor-foreign', spell_id: 'spell-1', slot_level: 0, targets: [] },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      cache,
      rawData,
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledOnce();
    const sentMsg = JSON.parse(socket.send.mock.calls[0]?.[0] as string) as {
      payload: { success: boolean; error: string };
    };
    expect(sentMsg.payload.success).toBe(false);
    expect(sentMsg.payload.error).toBe('not_authorized');
  });

  it('AUTHZ-ALLOW: acting actor_id IS in authorized set → dispatch called', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const { cache } = makeMockTokenCache({
      valid: true,
      entry: { alias: 'a', expiresAt: Date.now() + 1_000, worldId: 'w', userId: 'user-owner' },
      authorizedActorIds: ['actor-owned'],
    });
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'cast-spell',
        idempotencyKey: '00000000-0000-4000-8000-000000000011',
        args: { actor_id: 'actor-owned', spell_id: 'spell-1', slot_level: 0, targets: [] },
      },
    });
    const dispatchFn = makeDispatchFn({ success: true, data: { ok: true } });

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      cache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledOnce();
    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: 'cast-spell' }),
      BEARER,
    );
  });

  it('AUTHZ-TARGETS: owned acting actor with FOREIGN targets is NOT over-restricted → dispatch called', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const { cache } = makeMockTokenCache({
      valid: true,
      entry: { alias: 'a', expiresAt: Date.now() + 1_000, worldId: 'w', userId: 'user-owner' },
      authorizedActorIds: ['actor-owned'],
    });
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'weapon-attack',
        idempotencyKey: '00000000-0000-4000-8000-000000000012',
        args: {
          actor_id: 'actor-owned',
          item_id: 'sword-1',
          targets: ['actor-foreign', 'monster-9'],
          advantage: 'normal',
        },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      cache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledOnce();
  });

  it('AUTHZ-NO-ACTOR: tool without an acting actor_id (move-token) bypasses the gate → dispatch called', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const { cache, validate } = makeMockTokenCache();
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'move-token',
        idempotencyKey: '00000000-0000-4000-8000-000000000013',
        args: { token_id: 'tok-1', x: 10, y: 20 },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      cache,
      rawData,
      logger,
    );

    expect(dispatchFn).toHaveBeenCalledOnce();
    // No acting actor → the gate never even consults the token cache.
    expect(validate).not.toHaveBeenCalled();
  });

  it('AUTHZ-INVALID-TOKEN: acting actor_id present but token invalid → not_authorized, dispatch NOT called', async () => {
    const sessionId = createSessionAndGetId(sessionStore, BEARER);
    const { cache } = makeMockTokenCache({ valid: false });
    const rawData = JSON.stringify({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: sessionId,
      payload: {
        toolId: 'cast-spell',
        idempotencyKey: '00000000-0000-4000-8000-000000000014',
        args: { actor_id: 'actor-owned', spell_id: 'spell-1', slot_level: 0, targets: [] },
      },
    });
    const dispatchFn = makeDispatchFn();

    await handleToolInvoke(
      socket as unknown as WebSocket,
      sessionId,
      sessionStore,
      dispatchFn,
      cache,
      rawData,
      logger,
    );

    expect(dispatchFn).not.toHaveBeenCalled();
    const sentMsg = JSON.parse(socket.send.mock.calls[0]?.[0] as string) as {
      payload: { success: boolean; error: string };
    };
    expect(sentMsg.payload.error).toBe('not_authorized');
  });
});
