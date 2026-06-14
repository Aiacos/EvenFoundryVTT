/**
 * Unit tests for GET /v1/scene/viewport — covering auth + error guard arms.
 *
 * SCN-ROUTE-01: 401 — no Authorization header
 * SCN-ROUTE-02: 503 — token valid but validate returns foundry_unreachable
 * SCN-ROUTE-03: 200 zero-state — foundryFn returns a shape that fails SceneViewportSchema
 * SCN-ROUTE-04: 200 — valid SceneViewport returned
 *
 * @see packages/bridge/src/routes/scene.ts
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';
import { registerSceneRoute } from './scene.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-scene-bearer';

function makeValidateFn(mode: 'valid' | 'invalid' | 'foundry_unreachable' = 'valid') {
  return async (token: string) => {
    if (mode === 'foundry_unreachable') {
      return { valid: false as const, reason: 'foundry_unreachable' as const };
    }
    if (token === VALID_TOKEN && mode === 'valid') {
      return {
        valid: true as const,
        entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'w1', userId: 'u1' },
      };
    }
    return { valid: false as const, reason: 'unknown_token' as const };
  };
}

async function makeApp(
  validateMode: 'valid' | 'invalid' | 'foundry_unreachable',
  foundryFn: FoundrySnapshotFn,
) {
  const app = Fastify({ logger: false });
  const cache = new TokenCache(makeValidateFn(validateMode));
  await registerSceneRoute(app, cache, foundryFn);
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /v1/scene/viewport', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('SCN-ROUTE-01: 401 when Authorization header is missing', async () => {
    app = await makeApp('valid', async () => ({}));
    const res = await app.inject({ method: 'GET', url: '/v1/scene/viewport' });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe('invalid_token');
  });

  it('SCN-ROUTE-02: 503 when tokenCache returns foundry_unreachable', async () => {
    app = await makeApp('foundry_unreachable', async () => ({}));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/scene/viewport',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: string }>().error).toBe('foundry_unreachable');
  });

  it('SCN-ROUTE-03: 200 zero-state when foundryFn returns schema-mismatch object', async () => {
    // Return object that fails SceneViewportSchema (missing required fields)
    app = await makeApp('valid', async () => ({ invalid: 'shape' }));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/scene/viewport',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ sceneId: string; viewX: number; viewY: number }>();
    // Zero-state: sceneId is empty string, viewX/viewY are 0
    expect(body.sceneId).toBe('');
    expect(body.viewX).toBe(0);
    expect(body.viewY).toBe(0);
  });

  it('SCN-ROUTE-04: 200 with valid SceneViewport returned', async () => {
    const viewport = {
      sceneId: 'scene-1',
      sceneName: 'Dungeon Level 1',
      viewX: 100,
      viewY: 200,
      scale: 1.5,
      tokenIds: ['tok-1', 'tok-2'],
    };
    app = await makeApp('valid', async () => viewport);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/scene/viewport',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(viewport);
  });
});
