/**
 * Tests for BridgeClient — RED phase (TDD Task 1 — Plan 11-02).
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
import {
  BridgeAuthExpiredError,
  BridgeClient,
  type BridgeInvokeResult,
} from './bridge-client.js';

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
    } catch { /* ignore */ }
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
    mockWs.simulateMessage(makeToolResult({ success: true, data: { status: 'phase-07-pending', tool: 'cast_spell', accepted_at: 123 } }));
    const result = await invokePromise;
    expect(result).toEqual({ success: true, data: { status: 'phase-07-pending', tool: 'cast_spell', accepted_at: 123 } });
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
      wsFactory: () => { throw new Error('ECONNREFUSED'); },
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
});
