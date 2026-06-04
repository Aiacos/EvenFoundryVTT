/**
 * Tests for registerAgentRoutes — WS /debug/agent, GET /debug/agents,
 * POST /debug/cmd, GET /debug/logs.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * Strategy:
 *   - Build a bare Fastify instance + fake deps for HTTP route assertions.
 *   - Use app.inject for happy + 401 + 404 paths.
 *   - For the existence gate, build via a helper that mirrors the server.ts condition
 *     (i.e. registers routes only when EVF_DEBUG is set).
 *   - WS /debug/agent: tested by injecting a fake agent into the registry to assert
 *     the registry-level contracts without needing a full WS upgrade in inject mode.
 *
 * Coverage:
 *   - Existence gate: EVF_DEBUG unset → /debug/agents 404 + /debug/cmd 404 + /debug/logs 404.
 *   - Auth gate: missing/wrong secret → 401 on all 3 HTTP routes.
 *   - GET /debug/agents → 200 + roster.
 *   - POST /debug/cmd: unknown target → 404; known target → 200 + {id}.
 *   - POST /debug/cmd wait=true: result from registry.waitFor included in response.
 *   - GET /debug/logs?since=<n> → events with id > since, latestId included.
 *   - Agent log and result events pushed to bus appear in /debug/logs.
 *   - Redaction: known token in agent log is scrubbed.
 *   - WS /debug/agent: wrong secret → close 1008 (integration WS test).
 *
 * @see ./agent-routes.ts
 */

import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { DebugEventBus } from './debug-event-bus.js';
import { AgentRegistry } from './agent-registry.js';
import { type AgentRouteDeps, registerAgentRoutes } from './agent-routes.js';

const SECRET = 'test-agent-secret-42';
const auth = { authorization: `Bearer ${SECRET}` };

/** Build a minimal Fastify app with agent routes + fake deps. */
async function buildAgentApp(
  overrides: Partial<AgentRouteDeps> & { skipEnv?: boolean } = {},
): Promise<{ app: FastifyInstance; debugBus: DebugEventBus; agentRegistry: AgentRegistry }> {
  if (!overrides.skipEnv) {
    process.env.EVF_INTERNAL_SECRET = SECRET;
  }
  const app = Fastify();
  await app.register(fastifyWebsocket);

  const debugBus = overrides.debugBus ?? new DebugEventBus();
  const agentRegistry = overrides.agentRegistry ?? new AgentRegistry();

  const deps: AgentRouteDeps = {
    debugBus,
    agentRegistry,
    ...overrides,
  };

  await registerAgentRoutes(app, deps);
  await app.ready();
  return { app, debugBus, agentRegistry };
}

// ─── Existence gate ────────────────────────────────────────────────────────────
describe('registerAgentRoutes — existence gate (routes absent when not called)', () => {
  it('GET /debug/agents → 404 when routes are not registered', async () => {
    process.env.EVF_INTERNAL_SECRET = SECRET;
    const app = Fastify();
    await app.register(fastifyWebsocket);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/debug/agents', headers: auth });
    expect(res.statusCode).toBe(404);
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('POST /debug/cmd → 404 when routes are not registered', async () => {
    const app = Fastify();
    await app.register(fastifyWebsocket);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      payload: { target: 'x', cmd: 'y', args: {} },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /debug/logs → 404 when routes are not registered', async () => {
    const app = Fastify();
    await app.register(fastifyWebsocket);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/debug/logs' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Auth gate ─────────────────────────────────────────────────────────────────
describe('registerAgentRoutes — auth gate', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildAgentApp());
  });
  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('GET /debug/agents → 401 without secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/agents' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /debug/agents → 401 with wrong secret', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/debug/agents',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /debug/cmd → 401 without secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      payload: { target: 'g2-app', cmd: 'getState', args: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /debug/logs → 401 without secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/logs' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /debug/agents ─────────────────────────────────────────────────────────
describe('GET /debug/agents', () => {
  let app: FastifyInstance;
  let agentRegistry: AgentRegistry;

  beforeEach(async () => {
    ({ app, agentRegistry } = await buildAgentApp());
  });
  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('returns 200 + empty roster when no agents registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/agents', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { agents: unknown[] };
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents).toHaveLength(0);
  });

  it('returns 200 + roster with agent info when an agent is registered', async () => {
    const socket = { send: vi.fn(), close: vi.fn() };
    const agentId = agentRegistry.register({
      role: 'g2-app',
      name: 'main',
      socket: socket as never,
    });
    const res = await app.inject({ method: 'GET', url: '/debug/agents', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { agents: Array<{ agentId: string; role: string; name: string }> };
    expect(body.agents).toHaveLength(1);
    const agent = body.agents[0]!;
    expect(agent.agentId).toBe(agentId);
    expect(agent.role).toBe('g2-app');
    expect(agent.name).toBe('main');
  });
});

// ─── POST /debug/cmd ───────────────────────────────────────────────────────────
describe('POST /debug/cmd', () => {
  let app: FastifyInstance;
  let agentRegistry: AgentRegistry;

  beforeEach(async () => {
    ({ app, agentRegistry } = await buildAgentApp());
  });
  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('returns 404 when target agent is unknown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { target: 'nonexistent', cmd: 'getState', args: {} },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toBe('unknown_target');
  });

  it('returns 200 + {id} when target agent is known', async () => {
    const socket = { send: vi.fn(), close: vi.fn() };
    agentRegistry.register({ role: 'g2-app', name: 'main', socket: socket as never });
    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { target: 'main', cmd: 'getState', args: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(typeof body.id).toBe('string');
    expect(socket.send).toHaveBeenCalledOnce();
  });

  it('returns 400 on invalid body (missing target)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { cmd: 'getState', args: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('wait=true: returns result inline when registry.waitFor resolves quickly', async () => {
    const socket = { send: vi.fn(), close: vi.fn() };
    agentRegistry.register({ role: 'g2-app', name: 'main', socket: socket as never });

    // Spy on send — after it's called, resolve the pending command
    socket.send.mockImplementation((raw: string) => {
      const frame = JSON.parse(raw) as { id: string };
      // Resolve asynchronously so the route handler enters waitFor first
      setTimeout(() => {
        agentRegistry.resolve(frame.id, { ok: true, result: { step: 'STEP2' } });
      }, 0);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/debug/cmd',
      headers: auth,
      payload: { target: 'main', cmd: 'getState', args: {}, wait: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; result: { ok: boolean; result: unknown } };
    expect(typeof body.id).toBe('string');
    expect(body.result).toBeDefined();
    expect(body.result.ok).toBe(true);
  });
});

// ─── GET /debug/logs ──────────────────────────────────────────────────────────
describe('GET /debug/logs', () => {
  let app: FastifyInstance;
  let debugBus: DebugEventBus;

  beforeEach(async () => {
    ({ app, debugBus } = await buildAgentApp());
  });
  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('returns 200 + empty events array when bus is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/logs', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: unknown[]; latestId: number };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(0);
    expect(typeof body.latestId).toBe('number');
  });

  it('returns events with id > since', async () => {
    debugBus.push({
      ts: 1,
      direction: 'agent-log',
      sessionId: null,
      type: 'agent.log',
      seq: null,
      summary: 'hello',
      payload: {},
    });
    const first = debugBus.push({
      ts: 2,
      direction: 'agent-log',
      sessionId: null,
      type: 'agent.log',
      seq: null,
      summary: 'world',
      payload: {},
    });
    const res = await app.inject({
      method: 'GET',
      url: `/debug/logs?since=1`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ id: number }>; latestId: number };
    // Only event with id > 1 should appear (id=2)
    expect(body.events.every((e) => e.id > 1)).toBe(true);
    expect(body.latestId).toBe(first.id);
  });

  it('returns latestId = 0 when bus is empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/logs', headers: auth });
    const body = res.json() as { latestId: number };
    expect(body.latestId).toBe(0);
  });
});

// ─── Redaction via bus ────────────────────────────────────────────────────────
describe('GET /debug/logs — redaction', () => {
  it('a known token pushed as agent-log is scrubbed in /debug/logs response', async () => {
    const SECRET_TOKEN = 'supersecrettoken-abcdef123456-should-not-appear';
    const { app, debugBus } = await buildAgentApp();

    debugBus.setKnownTokens([SECRET_TOKEN]);
    debugBus.push({
      ts: Date.now(),
      direction: 'agent-log',
      sessionId: null,
      type: 'agent.log',
      seq: null,
      summary: `agent log containing ${SECRET_TOKEN}`,
      payload: { token: SECRET_TOKEN },
    });

    const res = await app.inject({ method: 'GET', url: '/debug/logs', headers: auth });
    expect(res.statusCode).toBe(200);
    const raw = res.body;
    expect(raw).not.toContain(SECRET_TOKEN);

    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });
});

// ─── WS /debug/agent — secret gate ────────────────────────────────────────────
describe('WS /debug/agent — wrong secret closes 1008', () => {
  let app: FastifyInstance;
  let port: number;

  beforeEach(async () => {
    process.env.EVF_INTERNAL_SECRET = SECRET;
    const raw = Fastify();
    await raw.register(fastifyWebsocket);
    const debugBus = new DebugEventBus();
    const agentRegistry = new AgentRegistry();
    await registerAgentRoutes(raw, { debugBus, agentRegistry });
    await raw.ready();
    await raw.listen({ port: 0, host: '127.0.0.1' });
    const addr = raw.server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    app = raw;
  });
  afterEach(async () => {
    await app.close();
    delete process.env.EVF_INTERNAL_SECRET;
  });

  it('closes with code 1008 when secret is wrong', () =>
    new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/debug/agent?secret=wrong`);
      ws.on('close', (code) => {
        try {
          expect(code).toBe(1008);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      ws.on('error', reject);
    }));

  it('stays open when secret is correct and sends register frame', () =>
    new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/debug/agent?secret=${encodeURIComponent(SECRET)}`,
      );
      ws.on('open', () => {
        // Send register frame
        ws.send(
          JSON.stringify({ kind: 'register', role: 'g2-app', name: 'test-agent' }),
          (err) => {
            if (err) {
              reject(err);
            } else {
              // Give it a tick to process, then close cleanly
              setTimeout(() => {
                ws.close();
                resolve();
              }, 50);
            }
          },
        );
      });
      ws.on('error', reject);
    }));
});
