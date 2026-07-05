/**
 * Branch-coverage tests for BridgeClient.
 *
 * Complements bridge-client.test.ts by exercising the arms the cases 1–30 suite
 * skipped:
 * - Non-string WS frame data (Buffer) → String(event.data) branch, still parses.
 * - onerror fired pre-handshake → ready resolves, isConnected false.
 * - tool.result envelope with no payload → ignored, later valid result resolves.
 * - tool.result payload.error === 'invalid_token' → BridgeAuthExpiredError.
 * - _resolvePending / _rejectPendingWithAuthError with no in-flight call → no-op.
 * - Queued call dispatched after the connection dropped → bridge_unreachable.
 * - 30s dispatch timeout → bridge_timeout.
 * - REST 200 success paths for character(actorId) / combat / scene viewport.
 * - getEventLog object body without `entries` → [] (?? fallback).
 *
 * @see packages/foundry-mcp/src/tools/bridge-client.ts
 */

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeAuthExpiredError, BridgeClient, type BridgeInvokeResult } from './bridge-client.js';

interface MockWebSocket {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: { error?: Error }) => void) | null;
  simulateOpen: () => void;
  simulateMessage: (data: unknown) => void;
  simulateError: () => void;
  simulateClose: (code: number, reason?: string) => void;
}

function createMockWebSocket(): MockWebSocket {
  const ws: MockWebSocket = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    simulateOpen() {
      ws.readyState = 1;
      ws.onopen?.();
    },
    simulateMessage(data: unknown) {
      ws.onmessage?.({ data });
    },
    simulateError() {
      ws.onerror?.({});
    },
    simulateClose(code: number, reason = '') {
      ws.readyState = 3;
      ws.onclose?.({ code, reason });
    },
  };
  return ws;
}

function makeServerHello(sessionId = 'test-session-id'): string {
  return JSON.stringify({ proto_chosen: 'evf-v1', session_id: sessionId, replay_seq: 0 });
}

function makeToolResult(payload: BridgeInvokeResult | undefined): string {
  const envelope: Record<string, unknown> = {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'tool.result',
    session_id: 'test-session-id',
  };
  if (payload !== undefined) envelope.payload = payload;
  return JSON.stringify(envelope);
}

describe('BridgeClient — additional branch coverage', () => {
  let mockWs: MockWebSocket;
  let client: BridgeClient;
  const logger = pino({ level: 'silent' });

  function createClient(): BridgeClient {
    return new BridgeClient({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger,
      wsFactory: () => mockWs as unknown as WebSocket,
    });
  }

  async function connectClient(): Promise<BridgeClient> {
    const c = createClient();
    mockWs.simulateOpen();
    mockWs.simulateMessage(makeServerHello());
    await c.ready;
    return c;
  }

  beforeEach(() => {
    mockWs = createMockWebSocket();
  });

  afterEach(async () => {
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('non-string frame data (Buffer) is coerced via String() and still parsed', async () => {
    const c = createClient();
    mockWs.simulateOpen();
    // server_hello delivered as a Buffer, not a string → hits String(event.data) arm.
    mockWs.simulateMessage(Buffer.from(makeServerHello()));
    await c.ready;
    expect(c.isConnected()).toBe(true);
    client = c;
  });

  it('onerror before handshake → ready resolves, isConnected stays false', async () => {
    const c = createClient();
    mockWs.simulateOpen();
    mockWs.simulateError(); // pre-handshake error
    await expect(c.ready).resolves.toBeUndefined();
    expect(c.isConnected()).toBe(false);
    client = c;
  });

  it('tool.result with missing payload is ignored; a later valid result resolves', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((r) => setTimeout(r, 0));

    // Malformed tool.result (no payload) → early return, pending untouched.
    mockWs.simulateMessage(makeToolResult(undefined));
    // Valid result arrives afterwards → resolves the still-pending call.
    mockWs.simulateMessage(makeToolResult({ success: true, data: { ok: 1 } }));

    const result = await invokePromise;
    expect(result).toEqual({ success: true, data: { ok: 1 } });
  });

  it('tool.result payload.error === invalid_token → rejects with BridgeAuthExpiredError', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((r) => setTimeout(r, 0));
    mockWs.simulateMessage(makeToolResult({ success: false, error: 'invalid_token' }));
    await expect(invokePromise).rejects.toBeInstanceOf(BridgeAuthExpiredError);
  });

  it('tool.result with no in-flight call → _resolvePending no-ops (no throw)', async () => {
    client = await connectClient();
    // No pending invoke — resolving path must early-return on null pending.
    expect(() => mockWs.simulateMessage(makeToolResult({ success: true, data: {} }))).not.toThrow();
    expect(client.isConnected()).toBe(true);
  });

  it('WS close 4001 with no in-flight call → _rejectPendingWithAuthError no-ops', async () => {
    client = await connectClient();
    // No pending invoke; a 4001 close must not throw when the pending pipeline is empty.
    expect(() => mockWs.simulateClose(4001, 'invalid_token')).not.toThrow();
  });

  it('queued call dispatched after connection dropped → bridge_unreachable', async () => {
    vi.useFakeTimers();
    try {
      const c = createClient();
      mockWs.simulateOpen();
      mockWs.simulateMessage(makeServerHello());
      await c.ready;

      const p1 = c.invokeTool('cast_spell', {}); // dispatched (in-flight)
      const p2 = c.invokeTool('weapon_attack', {}); // queued behind p1

      // Connection lost while p1 is pending and p2 is queued (queue NOT drained).
      c.markUnreachable();

      // p1's 30s in-flight timer fires → bridge_timeout → _dequeueNext dispatches
      // p2, which finds the connection down → _dispatchTool early-returns unreachable.
      await vi.advanceTimersByTimeAsync(30_000);

      expect(await p1).toEqual({ success: false, error: 'bridge_timeout' });
      expect(await p2).toEqual({ success: false, error: 'bridge_unreachable' });
      client = c;
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispatch timeout (30s) with no response → bridge_timeout', async () => {
    vi.useFakeTimers();
    try {
      const c = createClient();
      mockWs.simulateOpen();
      mockWs.simulateMessage(makeServerHello());
      await c.ready;

      const invokePromise = c.invokeTool('cast_spell', {});
      // Advance past the 30s in-flight timeout without any tool.result.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await invokePromise).toEqual({ success: false, error: 'bridge_timeout' });
      client = c;
    } finally {
      vi.useRealTimers();
    }
  });

  describe('REST 200 success paths', () => {
    it('getCharacterSnapshot(actorId) — 200 → snapshot passthrough', async () => {
      const snapshot = { actorId: 'actor-9', name: 'Aragorn' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue(snapshot) }),
      );
      client = await connectClient();
      expect(await client.getCharacterSnapshot('actor-9')).toEqual(snapshot);
    });

    it('getCombatSnapshot — 200 → combat snapshot passthrough', async () => {
      const combat = { round: 2, turn: 1, combatants: [] };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue(combat) }),
      );
      client = await connectClient();
      expect(await client.getCombatSnapshot()).toEqual(combat);
    });

    it('getSceneViewport — 200 → viewport passthrough', async () => {
      const viewport = { sceneId: 's1', x: 0, y: 0, scale: 1 };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue(viewport) }),
      );
      client = await connectClient();
      expect(await client.getSceneViewport()).toEqual(viewport);
    });

    it('getEventLog — object body without `entries` → [] (?? fallback)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue({}) }),
      );
      client = await connectClient();
      expect(await client.getEventLog(5)).toEqual([]);
    });
  });
});
