/**
 * Tests for registerDebugRoutes — the 7 dev-gated debug endpoints + WS stream.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * Strategy: register the routes on a bare Fastify instance with FAKE deps
 * (DeltaEmitter / dispatchToolFn / stores) so we assert call contracts directly.
 * A separate suite drives the full buildServer() to assert the existence gate
 * (404 when EVF_DEBUG unset).
 *
 * Coverage:
 *   - existence gate: EVF_DEBUG unset → GET /debug/state 404 (route absent via buildServer).
 *   - auth gate: wrong/missing secret → 401 on every route.
 *   - GET /debug/state → 200 redacted snapshot (tokenHint only, never raw token).
 *   - GET /debug/events?tail&direction → filtered, capped.
 *   - POST /debug/inject (all + targeted + unknown-session 404) → emitDelta call counts.
 *   - POST /debug/dispatch-tool → dispatchToolFn(payload, token) once; W-1 fresh-uuid contract.
 *   - POST /debug/simulate-gesture → emitDelta('r1.gesture', …); invalid kind 400.
 *   - POST /debug/displayop → debugBus records direction:'display'; {recorded:true}.
 *   - W-3: WS /debug/stream unsubscribes on close (subscriberCount returns to baseline).
 *
 * @see ./debug-routes.ts
 */

import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { SessionStore } from '../ws/session-store.js';
import { DebugEventBus } from './debug-event-bus.js';
import { type DebugRouteDeps, registerDebugRoutes } from './debug-routes.js';

const SECRET = 'test-internal-secret';

/** Build a Fastify app with debug routes + fake deps. Returns app + spies. */
async function buildDebugApp(overrides: Partial<DebugRouteDeps> = {}): Promise<{
  app: FastifyInstance;
  deps: DebugRouteDeps;
  emitDelta: ReturnType<typeof vi.fn>;
  dispatchToolFn: ReturnType<typeof vi.fn>;
}> {
  process.env.EVF_INTERNAL_SECRET = SECRET;
  const app = Fastify();
  await app.register(fastifyWebsocket);

  const sessionStore = overrides.sessionStore ?? new SessionStore();
  const debugBus = overrides.debugBus ?? new DebugEventBus();

  const emitDelta = vi.fn();
  const dispatchToolFn = vi.fn(async () => ({ success: true, data: { ok: 1 } }));

  // Minimal fake DeltaEmitter: emitDelta + currentSeq + connectionCount.
  let seq = 0;
  const deltaEmitter = {
    emitDelta: (type: string, payload: unknown) => {
      seq += 1;
      emitDelta(type, payload);
    },
    get currentSeq() {
      return seq;
    },
    get connectionCount() {
      return sessionStore.size;
    },
  } as unknown as DebugRouteDeps['deltaEmitter'];

  const deps: DebugRouteDeps = {
    debugBus,
    sessionStore,
    deltaEmitter,
    replayBuffer: { size: () => 0, lastSeq: () => 0 } as unknown as DebugRouteDeps['replayBuffer'],
    tokenCache: { size: 0 } as unknown as DebugRouteDeps['tokenCache'],
    spellCache: { get: () => null } as unknown as DebugRouteDeps['spellCache'],
    entityCache: { get: () => null } as unknown as DebugRouteDeps['entityCache'],
    metricsAccessors: { connectionCount: () => sessionStore.size },
    dispatchToolFn: dispatchToolFn as unknown as DebugRouteDeps['dispatchToolFn'],
    ...overrides,
  };

  await registerDebugRoutes(app, deps);
  await app.ready();
  return { app, deps, emitDelta, dispatchToolFn };
}

const auth = { authorization: `Bearer ${SECRET}` };

describe('registerDebugRoutes — auth gate', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    ({ app } = await buildDebugApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 401 with missing secret on /debug/state', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong secret on /debug/state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/debug/state',
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 on /debug/inject without secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/inject',
      payload: { type: 'x', payload: {} },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /debug/state', () => {
  let app: FastifyInstance;
  let store: SessionStore;
  beforeEach(async () => {
    store = new SessionStore();
    store.createSession('supersecrettoken_abcdef123456', 'it', ['read_char']);
    ({ app } = await buildDebugApp({ sessionStore: store }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns a redacted snapshot with tokenHint and never the raw token', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].tokenHint).toBeDefined();
    expect(body.sessions[0].tokenHint.length).toBeLessThanOrEqual(8 + 1); // hint + ellipsis
    expect(JSON.stringify(body)).not.toContain('supersecrettoken_abcdef123456');
    expect(body.sessions[0].token).toBeUndefined();
  });

  it('enriches per-session with age_ms (number) and lastSeq', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state', headers: auth });
    const body = res.json();
    const s = body.sessions[0];
    expect(typeof s.age_ms).toBe('number');
    expect(s.age_ms).toBeGreaterThanOrEqual(0);
    expect(typeof s.lastSeq).toBe('number');
  });

  it('adds top-level uptime_sec, ts, and debug.{eventBufferSize,byDirection}', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state', headers: auth });
    const body = res.json();
    expect(typeof body.uptime_sec).toBe('number');
    expect(body.uptime_sec).toBeGreaterThanOrEqual(0);
    expect(typeof body.ts).toBe('number');
    expect(typeof body.debug.eventBufferSize).toBe('number');
    expect(body.debug.byDirection).toEqual({
      inbound: 0,
      outbound: 0,
      tool: 0,
      log: 0,
      display: 0,
    });
  });
});

describe('GET /debug/state — enriched debug.byDirection + cache counts', () => {
  let app: FastifyInstance;
  let bus: DebugEventBus;
  beforeEach(async () => {
    bus = new DebugEventBus();
    bus.push({
      ts: 1,
      direction: 'log',
      sessionId: null,
      type: 'log.warn',
      seq: null,
      summary: 'x',
      payload: {},
    });
    bus.push({
      ts: 2,
      direction: 'outbound',
      sessionId: null,
      type: 'character.delta',
      seq: 1,
      summary: 'x',
      payload: {},
    });
    ({ app } = await buildDebugApp({
      debugBus: bus,
      spellCache: {
        get: () => ({ count: 70, entries: [] }),
      } as unknown as DebugRouteDeps['spellCache'],
      entityCache: {
        get: () => ({ count: 12, entries: [] }),
      } as unknown as DebugRouteDeps['entityCache'],
    }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('debug.byDirection + eventBufferSize reflect pushed events', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state', headers: auth });
    const body = res.json();
    expect(body.debug.eventBufferSize).toBe(2);
    expect(body.debug.byDirection.log).toBe(1);
    expect(body.debug.byDirection.outbound).toBe(1);
  });

  it('caches surface {populated,count} summaries (no entries dumped)', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/state', headers: auth });
    const body = res.json();
    expect(body.caches.spell).toEqual({ populated: true, count: 70 });
    expect(body.caches.entity).toEqual({ populated: true, count: 12 });
    // No full entries array dumped into the snapshot.
    expect(JSON.stringify(body.caches)).not.toContain('entries');
  });

  it('cold caches report populated:false count:0', async () => {
    const { app: coldApp } = await buildDebugApp({ debugBus: new DebugEventBus() });
    const res = await coldApp.inject({ method: 'GET', url: '/debug/state', headers: auth });
    const body = res.json();
    expect(body.caches.spell).toEqual({ populated: false, count: 0 });
    expect(body.caches.entity).toEqual({ populated: false, count: 0 });
    await coldApp.close();
  });
});

describe('GET /debug/events', () => {
  let app: FastifyInstance;
  let bus: DebugEventBus;
  beforeEach(async () => {
    bus = new DebugEventBus();
    bus.push({
      ts: 1,
      direction: 'inbound',
      sessionId: 's',
      type: 'a',
      seq: 1,
      summary: 'a',
      payload: {},
    });
    bus.push({
      ts: 2,
      direction: 'outbound',
      sessionId: 's',
      type: 'b',
      seq: 2,
      summary: 'b',
      payload: {},
    });
    bus.push({
      ts: 3,
      direction: 'outbound',
      sessionId: 's',
      type: 'c',
      seq: 3,
      summary: 'c',
      payload: {},
    });
    ({ app } = await buildDebugApp({ debugBus: bus }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('filters by direction and caps by tail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/debug/events?tail=2&direction=outbound',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeLessThanOrEqual(2);
    expect(body.every((e: { direction: string }) => e.direction === 'outbound')).toBe(true);
  });
});

describe('POST /debug/inject', () => {
  let app: FastifyInstance;
  let store: SessionStore;
  let emitDelta: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    store = new SessionStore();
    store.createSession('tok-a', 'it', []);
    store.createSession('tok-b', 'it', []);
    ({ app, emitDelta } = await buildDebugApp({ sessionStore: store }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('with no target → fans to all sessions, returns targetCount + seq', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/inject',
      headers: auth,
      payload: { type: 'combat.turn', payload: { a: 1 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.injected).toBe(true);
    expect(body.targetCount).toBe(2);
    expect(typeof body.seq).toBe('number');
    expect(emitDelta).toHaveBeenCalledWith('combat.turn', { a: 1 });
  });

  it('with targetSessionId → targets only that session (targetCount=1)', async () => {
    const target = store.createSession('tok-c', 'it', []);
    const res = await app.inject({
      method: 'POST',
      url: '/debug/inject',
      headers: auth,
      payload: { type: 'x', payload: {}, targetSessionId: target.sessionId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().targetCount).toBe(1);
  });

  it('with unknown targetSessionId → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/inject',
      headers: auth,
      payload: { type: 'x', payload: {}, targetSessionId: 'nope' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /debug/dispatch-tool (W-1 fresh-uuid contract)', () => {
  let app: FastifyInstance;
  let store: SessionStore;
  let dispatchToolFn: ReturnType<typeof vi.fn>;
  let sessionId: string;
  beforeEach(async () => {
    store = new SessionStore();
    sessionId = store.createSession('tok-dispatch', 'it', []).sessionId;
    ({ app, dispatchToolFn } = await buildDebugApp({ sessionStore: store }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('calls dispatchToolFn(payload, token) once and returns {result, durationMs}', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId, toolId: 'cast-spell', args: { spellId: 'fireball' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.success).toBe(true);
    expect(typeof body.durationMs).toBe('number');
    expect(dispatchToolFn).toHaveBeenCalledTimes(1);
    const call0 = dispatchToolFn.mock.calls[0] as [{ toolId: string }, string];
    expect(call0[0].toolId).toBe('cast-spell');
    expect(call0[1]).toBe('tok-dispatch');
  });

  it('W-1: two omitted-key dispatches produce two DISTINCT fresh uuids', async () => {
    await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId, toolId: 'cast-spell', args: {} },
    });
    await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId, toolId: 'cast-spell', args: {} },
    });
    expect(dispatchToolFn).toHaveBeenCalledTimes(2);
    const calls = dispatchToolFn.mock.calls as Array<[{ idempotencyKey: string }, string]>;
    const call1 = calls[0] as [{ idempotencyKey: string }, string];
    const call2 = calls[1] as [{ idempotencyKey: string }, string];
    const key1 = call1[0].idempotencyKey;
    const key2 = call2[0].idempotencyKey;
    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toBe(key2);
    // Fresh keys are valid UUIDs.
    expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('W-1: a supplied idempotencyKey is forwarded verbatim', async () => {
    const supplied = '11111111-1111-4111-8111-111111111111';
    await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId, toolId: 'cast-spell', idempotencyKey: supplied, args: {} },
    });
    const suppliedCall = dispatchToolFn.mock.calls[0] as [{ idempotencyKey: string }, string];
    expect(suppliedCall[0].idempotencyKey).toBe(supplied);
  });

  it('W-1: a non-UUID supplied idempotencyKey → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId, toolId: 'cast-spell', idempotencyKey: 'not-a-uuid', args: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('unknown sessionId → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/dispatch-tool',
      headers: auth,
      payload: { sessionId: 'nope', toolId: 'cast-spell', args: {} },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /debug/simulate-gesture', () => {
  let app: FastifyInstance;
  let store: SessionStore;
  let emitDelta: ReturnType<typeof vi.fn>;
  let sessionId: string;
  beforeEach(async () => {
    store = new SessionStore();
    sessionId = store.createSession('tok-g', 'it', []).sessionId;
    ({ app, emitDelta } = await buildDebugApp({ sessionStore: store }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('emits r1.gesture for a valid kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/simulate-gesture',
      headers: auth,
      payload: { sessionId, kind: 'tap' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().injected).toBe(true);
    expect(emitDelta).toHaveBeenCalledTimes(1);
    const gestureCall = emitDelta.mock.calls[0] as [string, { kind: string }];
    expect(gestureCall[0]).toBe('r1.gesture');
    expect(gestureCall[1].kind).toBe('tap');
  });

  it('rejects an invalid kind with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/simulate-gesture',
      headers: auth,
      payload: { sessionId, kind: 'swipe' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('unknown sessionId → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/simulate-gesture',
      headers: auth,
      payload: { sessionId: 'nope', kind: 'tap' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /debug/displayop', () => {
  let app: FastifyInstance;
  let bus: DebugEventBus;
  beforeEach(async () => {
    bus = new DebugEventBus();
    ({ app } = await buildDebugApp({ debugBus: bus }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('records a display-direction event and returns {recorded:true}', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/displayop',
      headers: auth,
      payload: { op: 'rebuild', containerCount: 3, ts: 1_700_000_000_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recorded).toBe(true);
    const recorded = bus.query({ direction: 'display' });
    expect(recorded.length).toBe(1);
    expect(recorded[0]?.type).toBe('r1.debug.displayop');
  });

  it('rejects an invalid displayop body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/displayop',
      headers: auth,
      payload: { op: 'explode', ts: 1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('WS /debug/stream (W-3 teardown)', () => {
  it('unsubscribes from the bus on socket close (subscriberCount returns to baseline)', async () => {
    const bus = new DebugEventBus();
    const { app } = await buildDebugApp({ debugBus: bus });
    const baseline = bus.subscriberCount;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/debug/stream?secret=${SECRET}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    // After open, one subscriber should be registered.
    await vi.waitFor(() => expect(bus.subscriberCount).toBe(baseline + 1));

    ws.close();
    await vi.waitFor(() => expect(bus.subscriberCount).toBe(baseline));
    await app.close();
  });

  it('rejects a WS handshake with a wrong secret', async () => {
    const bus = new DebugEventBus();
    const { app } = await buildDebugApp({ debugBus: bus });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    // The HTTP upgrade may succeed (client sees 'open') but the server immediately
    // closes with 1008 on a bad secret and never subscribes. Assert the terminal
    // closed state + zero subscribers regardless of open/close ordering.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/debug/stream?secret=wrong`);
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => resolve(-1));
    });
    expect(closeCode === 1008 || closeCode === -1).toBe(true);
    await vi.waitFor(() => expect(bus.subscriberCount).toBe(0));
    await app.close();
  });
});

describe('existence gate via buildServer', () => {
  let savedDebug: string | undefined;
  beforeEach(() => {
    savedDebug = process.env.EVF_DEBUG;
  });
  afterEach(() => {
    if (savedDebug === undefined) delete process.env.EVF_DEBUG;
    else process.env.EVF_DEBUG = savedDebug;
  });

  it('GET /debug/state → 404 when EVF_DEBUG is unset (route never registered)', async () => {
    delete process.env.EVF_DEBUG;
    const { buildServer } = await import('../server.js');
    const app = await buildServer({});
    const res = await app.inject({ method: 'GET', url: '/debug/state' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
