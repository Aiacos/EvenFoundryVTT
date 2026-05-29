/**
 * Tests for the GET /debug/console dashboard route — Quick Task 260529-h5e Wave 3.
 *
 * Contract:
 *   - debug enabled + correct secret → 200, content-type text/html, body marker.
 *   - debug enabled + wrong/missing secret → 401.
 *   - debug disabled (EVF_DEBUG unset) → 404 (route literally absent via buildServer).
 *
 * The dashboard HTML is inlined as a TS string constant (tsup-bundle-safe — no
 * runtime asset resolution), so this suite also indirectly guards that the bundled
 * `dist` ships the markup.
 *
 * @see ./dashboard.ts
 * @see ./debug-routes.ts (registers the route when debug is enabled)
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../ws/session-store.js';
import { DebugEventBus } from './debug-event-bus.js';
import { type DebugRouteDeps, registerDebugRoutes } from './debug-routes.js';

const SECRET = 'dashboard-test-secret';
const auth = { authorization: `Bearer ${SECRET}` };

/** Build a Fastify app with debug routes registered + fake deps. */
async function buildDebugApp(): Promise<FastifyInstance> {
  process.env.EVF_INTERNAL_SECRET = SECRET;
  const app = Fastify();
  const sessionStore = new SessionStore();
  const debugBus = new DebugEventBus();
  let seq = 0;
  const deltaEmitter = {
    emitDelta: () => {
      seq += 1;
    },
    get currentSeq() {
      return seq;
    },
    get connectionCount() {
      return sessionStore.size;
    },
  } as unknown as DebugRouteDeps['deltaEmitter'];

  await registerDebugRoutes(app, {
    debugBus,
    sessionStore,
    deltaEmitter,
    replayBuffer: { size: () => 0, lastSeq: () => 0 } as unknown as DebugRouteDeps['replayBuffer'],
    tokenCache: { size: 0 } as unknown as DebugRouteDeps['tokenCache'],
    spellCache: { get: () => null } as unknown as DebugRouteDeps['spellCache'],
    entityCache: { get: () => null } as unknown as DebugRouteDeps['entityCache'],
    metricsAccessors: { connectionCount: () => sessionStore.size },
    dispatchToolFn: vi.fn(async () => ({
      success: true,
    })) as unknown as DebugRouteDeps['dispatchToolFn'],
  });
  await app.ready();
  return app;
}

describe('GET /debug/console (dashboard route)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildDebugApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 text/html with the console marker when authed', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/console', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('EVF Debug Console');
  });

  it('serves the same dashboard at the /debug alias', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/debug/console',
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with no secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/debug/console' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /debug/console existence gate via buildServer', () => {
  let savedDebug: string | undefined;
  beforeEach(() => {
    savedDebug = process.env.EVF_DEBUG;
  });
  afterEach(() => {
    if (savedDebug === undefined) delete process.env.EVF_DEBUG;
    else process.env.EVF_DEBUG = savedDebug;
  });

  it('GET /debug/console → 404 when EVF_DEBUG is unset (route never registered)', async () => {
    delete process.env.EVF_DEBUG;
    const { buildServer } = await import('../server.js');
    const app = await buildServer({});
    const res = await app.inject({ method: 'GET', url: '/debug/console' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
