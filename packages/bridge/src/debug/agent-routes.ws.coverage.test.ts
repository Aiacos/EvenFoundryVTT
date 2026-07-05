/**
 * WS message-handler coverage for registerAgentRoutes (/debug/agent).
 *
 * The existing agent-routes.test.ts exercises the HTTP routes + the secret gate,
 * but drives the WS socket only far enough to send a single register frame without
 * asserting its effects. This suite drives the full client→bridge frame set over a
 * live WS connection and asserts the observable side effects (bus events + registry
 * roster + command correlation), covering the register / log / result(ok|err) /
 * invalid-JSON / invalid-frame / cleanup arms of the message handler.
 *
 * @see ./agent-routes.ts (message handler under test)
 */

import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AgentRegistry } from './agent-registry.js';
import { registerAgentRoutes } from './agent-routes.js';
import { DebugEventBus } from './debug-event-bus.js';

const SECRET = 'ws-coverage-secret-99';
const auth = { authorization: `Bearer ${SECRET}` };

describe('registerAgentRoutes — WS message handler side effects', () => {
  let app: FastifyInstance;
  let debugBus: DebugEventBus;
  let agentRegistry: AgentRegistry;
  let port: number;

  beforeEach(async () => {
    process.env.EVF_INTERNAL_SECRET = SECRET;
    app = Fastify();
    await app.register(fastifyWebsocket);
    debugBus = new DebugEventBus();
    agentRegistry = new AgentRegistry();
    await registerAgentRoutes(app, { debugBus, agentRegistry });
    await app.ready();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  });

  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/debug/agent?secret=${SECRET}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  it('register frame → agent joins roster + agent.register bus event', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ kind: 'register', role: 'g2-app', name: 'coverage-agent' }));
    await tick();

    // Registry roster reflects the registration.
    const roster = agentRegistry.listAgents();
    expect(roster).toHaveLength(1);
    expect(roster[0]?.role).toBe('g2-app');
    expect(roster[0]?.name).toBe('coverage-agent');

    // Bus captured an agent.register event with the assigned id in the payload.
    const registerEvent = debugBus.query({}).find((e) => e.type === 'agent.register');
    expect(registerEvent).toBeDefined();
    expect((registerEvent?.payload as { name?: string }).name).toBe('coverage-agent');
    ws.close();
    await tick();
  });

  it('log frame → mirrored into the bus as agent.log.<level>', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ kind: 'register', role: 'bridge', name: 'logger' }));
    ws.send(
      JSON.stringify({
        kind: 'log',
        ts: Date.now(),
        level: 'warn',
        source: 'wizard.ts',
        msg: 'a warning surfaced',
      }),
    );
    await tick();

    const logEvent = debugBus.query({}).find((e) => e.type === 'agent.log.warn');
    expect(logEvent).toBeDefined();
    expect(logEvent?.summary).toContain('a warning surfaced');
    expect((logEvent?.payload as { source?: string }).source).toBe('wizard.ts');
    ws.close();
    await tick();
  });

  it('result frame (ok:true) settles a pending POST /debug/cmd and pushes agent.result', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ kind: 'register', role: 'g2-app', name: 'resolver' }));
    await tick();

    // When the agent receives the command over WS, reply with a success result.
    ws.on('message', (raw) => {
      const cmd = JSON.parse(String(raw)) as { id: string };
      ws.send(JSON.stringify({ kind: 'result', id: cmd.id, ok: true, result: { step: 'BOOTED' } }));
    });

    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { target: 'resolver', cmd: 'getState', args: {}, wait: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { result: { ok: boolean; result: { step: string } } };
    expect(body.result.ok).toBe(true);
    expect(body.result.result.step).toBe('BOOTED');

    const resultEvent = debugBus.query({}).find((e) => e.type === 'agent.result');
    expect(resultEvent).toBeDefined();
    expect((resultEvent?.payload as { ok?: boolean }).ok).toBe(true);
    ws.close();
    await tick();
  });

  it('result frame (ok:false) settles the pending command with the error message', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ kind: 'register', role: 'g2-app', name: 'failer' }));
    await tick();

    ws.on('message', (raw) => {
      const cmd = JSON.parse(String(raw)) as { id: string };
      ws.send(JSON.stringify({ kind: 'result', id: cmd.id, ok: false, error: 'boom-detail' }));
    });

    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { target: 'failer', cmd: 'crashMe', args: {}, wait: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { result: { ok: boolean; error: string } };
    expect(body.result.ok).toBe(false);
    expect(body.result.error).toBe('boom-detail');

    const resultEvent = debugBus.query({}).find((e) => e.type === 'agent.result');
    expect(resultEvent?.summary).toContain('boom-detail');
    ws.close();
    await tick();
  });

  it('invalid JSON and invalid-shape frames are ignored without side effects', async () => {
    const ws = await connect();
    ws.send('this is not json {{{');
    ws.send(JSON.stringify({ kind: 'not-a-real-kind', foo: 1 }));
    await tick();

    // No agent registered, no bus events produced by the garbage frames.
    expect(agentRegistry.listAgents()).toHaveLength(0);
    expect(debugBus.query({})).toHaveLength(0);
    ws.close();
    await tick();
  });

  it('socket close after register unregisters the agent + pushes agent.disconnect', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ kind: 'register', role: 'foundry', name: 'ephemeral' }));
    await tick();
    expect(agentRegistry.listAgents()).toHaveLength(1);

    ws.close();
    await tick();

    // cleanup() ran (agentId was defined) → roster empty + disconnect event on the bus.
    expect(agentRegistry.listAgents()).toHaveLength(0);
    const disconnect = debugBus.query({}).find((e) => e.type === 'agent.disconnect');
    expect(disconnect).toBeDefined();
  });

  it('GET /debug/logs?since=<non-numeric> falls back to since=0 (returns 200 + all events)', async () => {
    debugBus.push({
      ts: 1,
      direction: 'agent-log',
      sessionId: null,
      type: 'agent.log',
      seq: null,
      summary: 'seed',
      payload: {},
    });
    const res = await app.inject({
      method: 'GET',
      url: '/debug/logs?since=not-a-number',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: unknown[]; latestId: number };
    // NaN since → 0 → every event (id > 0) is returned.
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.latestId).toBeGreaterThan(0);
  });
});
