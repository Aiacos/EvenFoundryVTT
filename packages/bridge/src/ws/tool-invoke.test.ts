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
import { SessionStore } from './session-store.js';
import { type DispatchToolFn, type ToolInvokeResult, handleToolInvoke } from './tool-invoke.js';

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

function makeDispatchFn(result: ToolInvokeResult = { success: true, data: { ok: true } }): DispatchToolFn {
  return vi.fn().mockResolvedValue(result) as DispatchToolFn;
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
  // Must be a valid UUID v4 to pass EnvelopeSchema.session_id validation
  const SESSION_ID = '00000000-0000-4000-8000-000000000abc';
  const BEARER = 'bearer-token-test';

  beforeEach(() => {
    socket = makeMockSocket();
    sessionStore = new SessionStore();
    logger = makeMockLogger();
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
      rawData,
      logger,
    );

    const [, bearerArg] = dispatchSpy.mock.calls[0]!;
    expect(bearerArg).toBe(specificBearer);
  });
});
