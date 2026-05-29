/**
 * Tests for BridgeClient — Plan 11-02 + coverage batch 260525-owx.
 *
 * Extended in quick task 260525-owx to cover REST branches and additional WS
 * branches that were not covered in the original TDD suite (cases 11–25):
 * - REST 401 → BridgeAuthExpiredError
 * - REST 404 → null / []
 * - REST network throw → default value
 * - REST array vs {entries:[]} body for getEventLog
 * - getCharacterSnapshot() auto-detect (no actorId) + empty list → null
 * - Combat 204 → null
 * - invokeTool when disconnected → bridge_unreachable
 * - FIFO queue branch (second invokeTool while first pending)
 * - bearer.rotated envelope (warn, no pending effect)
 * - non-tool.result non-bearer.rotated → fans out to addMessageListener
 * - close() on null WS (no-op)
 * - close() where ws.close throws (catch arm)
 * - markUnreachable() flips isConnected
 * - unexpected handshake response (no session_id)
 * - WS close (non-4001) while pending → bridge_unreachable
 *
 * Original TDD phase (cases 1-10):
 *
 * BridgeClient connects to the bridge via WebSocket and sends tool.invoke envelopes
 * using the EVF WS protocol (EnvelopeSchema + ToolInvocationEnvelopePayloadSchema).
 * FIFO request queue ensures one in-flight tool call at a time (bridge doesn't echo
 * idempotencyKey in tool.result responses, so we can't correlate otherwise).
 *
 * Test setup: a mock WebSocket class is injected via `wsFactory` constructor option
 * so tests never open real network connections. The mock exposes:
 * - `.send` — vi.fn() to assert outgoing envelopes
 * - `.close` — vi.fn()
 * - `.simulateOpen()` — trigger onopen
 * - `.simulateMessage(data)` — trigger onmessage with a raw string
 * - `.simulateClose(code)` — trigger onclose
 *
 * Test case index:
 * 1. invokeTool('cast_spell', args) calls ws.send with correct envelope shape
 * 2. Bridge returns success → result: { success: true, data: { ... } }
 * 3. Bridge returns success with chatCardId shape → result.data passes through
 * 4. Bridge returns failure payload → result: { success: false, error: 'actor_not_found' }
 * 5. Bridge WS close with code 4001 → throws BridgeAuthExpiredError
 * 6. Bridge returns tool.result { success: false, error: 'foundry_unreachable' } → mapped
 * 7. Bridge returns tool.result { success: false, error: 'unknown_tool' } → mapped
 * 8. No network (wsFactory throws) → result: { success: false, error: 'bridge_unreachable' }
 * 9. Two consecutive invokeTool calls use different idempotencyKey fields in envelope
 * 10. drop_concentration routing: toolId in envelope = 'drop-concentration' (kebab)
 */

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeAuthExpiredError, BridgeClient, type BridgeInvokeResult } from './bridge-client.js';

// ─── Mock WebSocket ────────────────────────────────────────────────────────────

interface MockWebSocket {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: { error?: Error }) => void) | null;
  simulateOpen: () => void;
  simulateMessage: (data: string) => void;
  simulateClose: (code: number, reason?: string) => void;
}

function createMockWebSocket(): MockWebSocket {
  const ws: MockWebSocket = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 0, // CONNECTING
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    simulateOpen() {
      ws.readyState = 1; // OPEN
      ws.onopen?.();
    },
    simulateMessage(data: string) {
      ws.onmessage?.({ data });
    },
    simulateClose(code: number, reason = '') {
      ws.readyState = 3; // CLOSED
      ws.onclose?.({ code, reason });
    },
  };
  return ws;
}

/** Valid server_hello envelope to send after client_hello */
function makeServerHello(sessionId = 'test-session-id'): string {
  return JSON.stringify({
    proto_chosen: 'evf-v1',
    server_caps: [],
    server_locale: 'en',
    session_id: sessionId,
    replay_seq: 0,
  });
}

/** Valid tool.result envelope */
function makeToolResult(payload: BridgeInvokeResult): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'tool.result',
    session_id: 'test-session-id',
    payload,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BridgeClient', () => {
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
    // Trigger open → client sends client_hello → we respond with server_hello
    mockWs.simulateOpen();
    // Simulate server sending server_hello
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
  });

  it('case 1: invokeTool sends correct envelope shape over WebSocket', async () => {
    client = await connectClient();

    const args = { actor_id: 'actor-1', spell_id: 'fireball', slot_level: 3, targets: [] };
    const invokePromise = client.invokeTool('cast_spell', args);

    // Give it a tick to send
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify ws.send was called with a valid tool.invoke envelope
    expect(mockWs.send).toHaveBeenCalledWith(expect.any(String));
    const sentEnvelope = JSON.parse(mockWs.send.mock.calls.at(-1)![0] as string);

    expect(sentEnvelope.proto).toBe('evf-v1');
    expect(sentEnvelope.type).toBe('tool.invoke');
    expect(sentEnvelope.payload.toolId).toBe('cast-spell'); // kebab-case
    expect(sentEnvelope.payload.args).toEqual(args);
    expect(sentEnvelope.payload.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Resolve the promise by simulating the response
    mockWs.simulateMessage(makeToolResult({ success: true, data: { chatCardId: 'abc' } }));
    await invokePromise;
  });

  it('case 2: bridge success response → result: { success: true, data: {...} }', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(
      makeToolResult({
        success: true,
        data: { status: 'phase-07-pending', tool: 'cast_spell', accepted_at: 123 },
      }),
    );
    const result = await invokePromise;
    expect(result).toEqual({
      success: true,
      data: { status: 'phase-07-pending', tool: 'cast_spell', accepted_at: 123 },
    });
  });

  it('case 3: bridge success with chatCardId shape → data passes through', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(makeToolResult({ success: true, data: { chatCardId: 'abc' } }));
    const result = await invokePromise;
    expect(result).toEqual({ success: true, data: { chatCardId: 'abc' } });
  });

  it('case 4: bridge returns failure → result: { success: false, error }', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(makeToolResult({ success: false, error: 'actor_not_found' }));
    const result = await invokePromise;
    expect(result).toEqual({ success: false, error: 'actor_not_found' });
  });

  it('case 5: WS close with code 4001 (invalid_token) → throws BridgeAuthExpiredError', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateClose(4001, 'invalid_token');
    await expect(invokePromise).rejects.toBeInstanceOf(BridgeAuthExpiredError);
  });

  it('case 5b: pre-handshake close (no session yet) resolves ready and does NOT fall through to the 4001 branch', async () => {
    client = createClient();
    mockWs.simulateOpen();
    // NO server_hello → _sessionId stays unset (pre-handshake).
    // A close arriving now (even code 4001) must resolve ready and early-return,
    // never running _rejectPendingWithAuthError on the (empty) pending pipeline.
    mockWs.simulateClose(4001, 'invalid_token');
    // ready resolves (does not hang, does not reject).
    await expect(client.ready).resolves.toBeUndefined();
  });

  it('case 6: bridge returns foundry_unreachable → result: { success: false, error: "foundry_unreachable" }', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(makeToolResult({ success: false, error: 'foundry_unreachable' }));
    const result = await invokePromise;
    expect(result).toEqual({ success: false, error: 'foundry_unreachable' });
  });

  it('case 7: bridge returns unknown_tool → result: { success: false, error: "unknown_tool" }', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(makeToolResult({ success: false, error: 'unknown_tool' }));
    const result = await invokePromise;
    expect(result).toEqual({ success: false, error: 'unknown_tool' });
  });

  it('case 8: wsFactory throws (bridge unreachable) → result: { success: false, error: "bridge_unreachable" }', async () => {
    const brokenClient = new BridgeClient({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger,
      wsFactory: () => {
        throw new Error('ECONNREFUSED');
      },
    });

    // ready should resolve (with failed state, not throw)
    await brokenClient.ready;

    const result = await brokenClient.invokeTool('cast_spell', {});
    expect(result).toEqual({ success: false, error: 'bridge_unreachable' });
    await brokenClient.close();
  });

  it('case 9: two consecutive invokeTool calls use different idempotencyKey values', async () => {
    client = await connectClient();

    // First call
    const p1 = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call1 = JSON.parse(mockWs.send.mock.calls.at(-1)![0] as string);
    const key1 = call1.payload.idempotencyKey;
    mockWs.simulateMessage(makeToolResult({ success: true, data: {} }));
    await p1;

    // Second call
    const p2 = client.invokeTool('weapon_attack', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call2 = JSON.parse(mockWs.send.mock.calls.at(-1)![0] as string);
    const key2 = call2.payload.idempotencyKey;
    mockWs.simulateMessage(makeToolResult({ success: true, data: {} }));
    await p2;

    // Keys must differ
    expect(key1).not.toBe(key2);
    // Both must be valid UUIDs
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(key1).toMatch(uuidRe);
    expect(key2).toMatch(uuidRe);
  });

  it('case 10: drop_concentration uses kebab-case toolId "drop-concentration" in envelope', async () => {
    client = await connectClient();
    const p = client.invokeTool('drop_concentration', { actor_id: 'a1', effect_id: 'e1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sentEnvelope = JSON.parse(mockWs.send.mock.calls.at(-1)![0] as string);
    expect(sentEnvelope.payload.toolId).toBe('drop-concentration');

    mockWs.simulateMessage(makeToolResult({ success: true, data: {} }));
    await p;
  });

  // ─── REST branch tests (cases 11–21) ─────────────────────────────────────────

  describe('REST branches (vi.stubGlobal fetch)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('case 11: getCharacterSnapshot with actorId — 401 → throws BridgeAuthExpiredError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: vi.fn() }));
      client = await connectClient();
      await expect(client.getCharacterSnapshot('actor-1')).rejects.toBeInstanceOf(
        BridgeAuthExpiredError,
      );
    });

    it('case 12: getCharacterSnapshot with actorId — 404 → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, json: vi.fn() }));
      client = await connectClient();
      const result = await client.getCharacterSnapshot('actor-1');
      expect(result).toBeNull();
    });

    it('case 13: getCharacterSnapshot with actorId — network error → null (honours `… | null` return)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      client = await connectClient();
      // _restGet now receives an explicit `null` default → returns null, not undefined.
      const result = await client.getCharacterSnapshot('actor-1');
      expect(result).toBeNull();
    });

    it('case 13b: getCombatSnapshot / getSceneViewport — network error → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      client = await connectClient();
      expect(await client.getCombatSnapshot()).toBeNull();
      expect(await client.getSceneViewport()).toBeNull();
    });

    it('case 13c: getCharacterSnapshot auto-detect — network error → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      client = await connectClient();
      expect(await client.getCharacterSnapshot()).toBeNull();
    });

    it('case 14: getCharacterSnapshot auto-detect (no actorId) — array body → first element', async () => {
      const snapshot = { actorId: 'actor-auto', name: 'Thorin' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: vi.fn().mockResolvedValue([snapshot]),
        }),
      );
      client = await connectClient();
      const result = await client.getCharacterSnapshot();
      expect(result).toEqual(snapshot);
    });

    it('case 15: getCharacterSnapshot auto-detect (no actorId) — empty array → null', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: vi.fn().mockResolvedValue([]),
        }),
      );
      client = await connectClient();
      const result = await client.getCharacterSnapshot();
      expect(result).toBeNull();
    });

    it('case 16: getCharacterSnapshot auto-detect (no actorId) — 204 → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, json: vi.fn() }));
      client = await connectClient();
      const result = await client.getCharacterSnapshot();
      expect(result).toBeNull();
    });

    it('case 17: getCombatSnapshot — 204 → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, json: vi.fn() }));
      client = await connectClient();
      const result = await client.getCombatSnapshot();
      expect(result).toBeNull();
    });

    it('case 18: getEventLog — array body → returned as-is', async () => {
      const entries = [{ id: 'e1', type: 'attack' }];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: vi.fn().mockResolvedValue(entries),
        }),
      );
      client = await connectClient();
      const result = await client.getEventLog(10);
      expect(result).toEqual(entries);
    });

    it('case 19: getEventLog — {entries:[...]} body → extracts entries array', async () => {
      const entries = [{ id: 'e2', type: 'spell' }];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: vi.fn().mockResolvedValue({ entries }),
        }),
      );
      client = await connectClient();
      const result = await client.getEventLog(5);
      expect(result).toEqual(entries);
    });

    it('case 20: getEventLog — 404 → empty array', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, json: vi.fn() }));
      client = await connectClient();
      const result = await client.getEventLog(10);
      expect(result).toEqual([]);
    });

    it('case 21: getSceneViewport — 401 → throws BridgeAuthExpiredError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: vi.fn() }));
      client = await connectClient();
      await expect(client.getSceneViewport()).rejects.toBeInstanceOf(BridgeAuthExpiredError);
    });
  });

  // ─── Additional WS branch tests (cases 22–30) ────────────────────────────────

  it('case 22: invokeTool when not connected → returns bridge_unreachable immediately', async () => {
    // Create a connected client and mark it unreachable
    client = await connectClient();
    client.markUnreachable();
    const result = await client.invokeTool('cast_spell', {});
    expect(result).toEqual({ success: false, error: 'bridge_unreachable' });
  });

  it('case 23: FIFO queue — second invokeTool while first pending is queued and resolved after first', async () => {
    client = await connectClient();

    const p1 = client.invokeTool('cast_spell', {});
    // Tick: first invoke dispatched
    await new Promise((resolve) => setTimeout(resolve, 0));

    const p2 = client.invokeTool('weapon_attack', {});
    // p2 is now queued (p1 is still in-flight)

    // Resolve p1
    mockWs.simulateMessage(makeToolResult({ success: true, data: { first: true } }));
    const r1 = await p1;
    expect(r1).toEqual({ success: true, data: { first: true } });

    // Now p2 should be dispatched — resolve it
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWs.simulateMessage(makeToolResult({ success: false, error: 'spell_fail' }));
    const r2 = await p2;
    expect(r2).toEqual({ success: false, error: 'spell_fail' });
  });

  it('case 24: bearer.rotated envelope → warn logged, no pending disruption', async () => {
    client = await connectClient();

    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate bearer.rotated (unrelated to tool.result — should not disrupt pending)
    mockWs.simulateMessage(
      JSON.stringify({
        proto: 'evf-v1',
        type: 'bearer.rotated',
        payload: { graceUntil: Date.now() + 60_000 },
      }),
    );

    // Resolve the invoke normally after
    mockWs.simulateMessage(makeToolResult({ success: true, data: {} }));
    const result = await invokePromise;
    expect(result).toEqual({ success: true, data: {} });
  });

  it('case 25: non-tool.result non-bearer.rotated message fans out to addMessageListener', async () => {
    client = await connectClient();
    const received: unknown[] = [];
    client.addMessageListener((envelope) => received.push(envelope));

    // Simulate a delta envelope
    mockWs.simulateMessage(
      JSON.stringify({ proto: 'evf-v1', type: 'character.delta', payload: { hp: 12 } }),
    );

    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).type).toBe('character.delta');
  });

  it('case 26: addMessageListener returns unsubscribe that stops receiving', async () => {
    client = await connectClient();
    const received: unknown[] = [];
    const unsubscribe = client.addMessageListener((envelope) => received.push(envelope));

    mockWs.simulateMessage(
      JSON.stringify({ proto: 'evf-v1', type: 'character.delta', payload: {} }),
    );
    expect(received).toHaveLength(1);

    unsubscribe();
    mockWs.simulateMessage(
      JSON.stringify({ proto: 'evf-v1', type: 'character.delta', payload: {} }),
    );
    expect(received).toHaveLength(1); // no new messages after unsubscribe
  });

  it('case 27: close() on already-null ws (wsFactory threw) — no-op', async () => {
    const brokenClient = new BridgeClient({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger,
      wsFactory: () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await brokenClient.ready;
    // close on a client whose ws is null — should not throw
    await expect(brokenClient.close()).resolves.toBeUndefined();
  });

  it('case 28: close() where ws.close throws — catch arm does not propagate', async () => {
    client = await connectClient();
    // Make ws.close throw
    mockWs.close.mockImplementation(() => {
      throw new Error('WS already closed');
    });
    // Should not throw
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('case 29: WS close with non-4001 code while pending → resolves with bridge_unreachable', async () => {
    client = await connectClient();
    const invokePromise = client.invokeTool('cast_spell', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Non-4001 close (e.g. 1001 going away)
    mockWs.simulateClose(1001, 'going_away');
    const result = await invokePromise;
    expect(result).toEqual({ success: false, error: 'bridge_unreachable' });
  });

  it('case 30: unexpected handshake response (no session_id) — resolves ready, invokeTool returns bridge_unreachable', async () => {
    const c = new BridgeClient({
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-bearer',
      logger,
      wsFactory: () => mockWs as unknown as WebSocket,
    });
    mockWs.simulateOpen();
    // Send a malformed server_hello (no session_id)
    mockWs.simulateMessage(JSON.stringify({ proto: 'evf-v1', msg: 'unexpected' }));
    await c.ready;
    // Not connected (no session_id → _connected stays false)
    expect(c.isConnected()).toBe(false);
    const result = await c.invokeTool('cast_spell', {});
    expect(result).toEqual({ success: false, error: 'bridge_unreachable' });
    await c.close();
  });
});
