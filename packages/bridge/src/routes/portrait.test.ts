/**
 * Unit tests for GET /v1/portrait/:actorId (Plan 13-03 — STRETCH-06).
 *
 * PORT-ROUTE-01: 401 missing bearer
 * PORT-ROUTE-02: 401 invalid bearer
 * PORT-ROUTE-03: 404 actor not found
 * PORT-ROUTE-04: 404 actor has no portrait URL
 * PORT-ROUTE-05: 400 malformed URL
 * PORT-ROUTE-06: 400 data URI scheme denied
 * PORT-ROUTE-07: 403 deny-listed hostname (localhost)
 * PORT-ROUTE-08: 403 mismatched origin (not in allowedHosts)
 * PORT-ROUTE-09: 200 cache hit — renderer NOT called, ETag present
 * PORT-ROUTE-10: 200 cache miss — renderer invoked, response stored, deltaEmitter called
 * PORT-ROUTE-11: ETag header present in response
 * PORT-ROUTE-12: Content-Type is image/png
 *
 * @see packages/bridge/src/routes/portrait.ts
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 3
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ValidateTokenResult } from '../auth/token-cache.js';
import { TokenCache } from '../auth/token-cache.js';
import type { PortraitCacheEntry } from '../portrait/portrait-cache.js';
import { PortraitCache } from '../portrait/portrait-cache.js';
import type { PortraitRenderer } from '../portrait/portrait-renderer.js';
import type { FoundrySnapshotFn } from './character.js';
import { registerPortraitRoute } from './portrait.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-portrait-bearer';
const ACTOR_ID = 'actor-thorin';
const PORTRAIT_URL = 'worlds/my-world/portraits/thorin.webp';
const ALLOWED_HOST = 'foundry.example.com';
const FOUNDRY_ORIGIN = `http://${ALLOWED_HOST}`;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x01]);
const URL_HASH = 'a'.repeat(64); // mock sha256; real route computes it

function makeTokenValidateFn(): (token: string) => Promise<ValidateTokenResult> {
  return async (token: string) => {
    if (token === VALID_TOKEN) {
      return {
        valid: true as const,
        entry: { alias: 'TestG2', expiresAt: Date.now() + 86_400_000, worldId: 'w1' },
      };
    }
    return { valid: false as const, reason: 'unknown_token' as const };
  };
}

function makeSnapshotWithPortrait() {
  return {
    actorId: ACTOR_ID,
    name: 'Thorin',
    portrait: { url: PORTRAIT_URL },
  };
}

function makeSnapshotWithoutPortrait() {
  return { actorId: ACTOR_ID, name: 'Thorin' };
}

function makeRenderer(pngBytes: Uint8Array = PNG_BYTES): PortraitRenderer & { renderPortrait: ReturnType<typeof vi.fn> } {
  return {
    renderPortrait: vi.fn().mockResolvedValue({
      pngBytes,
      urlHash: URL_HASH,
    }),
  };
}

function makeDeltaEmitter() {
  return { emitDelta: vi.fn() };
}

async function buildTestServer({
  snapshotFn = (() => Promise.resolve(makeSnapshotWithPortrait())) as FoundrySnapshotFn,
  renderer = makeRenderer(),
  cachePrePopulated = false,
  allowedHosts = [ALLOWED_HOST],
  deltaEmitter = undefined as ReturnType<typeof makeDeltaEmitter> | undefined,
} = {}) {
  const app = Fastify({ logger: false });
  const tokenCache = new TokenCache(makeTokenValidateFn());
  const portraitCache = new PortraitCache({ maxEntries: 4, ttlMs: 3_600_000 });

  if (cachePrePopulated) {
    // Pre-populate cache with the hash the route will compute at runtime.
    // The route resolves 'worlds/my-world/portraits/thorin.webp' relative to FOUNDRY_ORIGIN,
    // producing: http://foundry.example.com/worlds/my-world/portraits/thorin.webp
    const resolvedUrl = `${FOUNDRY_ORIGIN}/${PORTRAIT_URL}`;
    const hash = await computeHash(resolvedUrl);
    const entry: PortraitCacheEntry = { pngBytes: PNG_BYTES, urlHash: hash, cachedAt: Date.now() };
    portraitCache.set(hash, entry);
  }

  await registerPortraitRoute({
    app,
    tokenCache,
    foundrySnapshotFn: snapshotFn,
    portraitCache,
    portraitRenderer: renderer,
    allowedHosts,
    // Only pass deltaEmitter when defined (exactOptionalPropertyTypes)
    ...(deltaEmitter !== undefined ? { deltaEmitter } : {}),
    foundryOrigin: FOUNDRY_ORIGIN,
  });

  await app.ready();
  return { app, renderer, portraitCache, deltaEmitter };
}

/** Compute SHA-256 hex in tests (mirrors route implementation). */
async function computeHash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /v1/portrait/:actorId', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // PORT-ROUTE-01: 401 missing bearer
  it('PORT-ROUTE-01: 401 when Authorization header is missing', async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({ method: 'GET', url: `/v1/portrait/${ACTOR_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // PORT-ROUTE-02: 401 invalid bearer
  it('PORT-ROUTE-02: 401 when bearer token is invalid', async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: 'Bearer bad-token-xyz' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // PORT-ROUTE-03: 404 actor not found
  it('PORT-ROUTE-03: 404 when actor snapshot is null', async () => {
    const { app } = await buildTestServer({ snapshotFn: () => Promise.resolve(null) });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('actor_not_found');
    await app.close();
  });

  // PORT-ROUTE-04: 404 actor has no portrait URL
  it('PORT-ROUTE-04: 404 when actor snapshot has no portrait field', async () => {
    const { app } = await buildTestServer({
      snapshotFn: () => Promise.resolve(makeSnapshotWithoutPortrait()),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('portrait_not_available');
    await app.close();
  });

  // PORT-ROUTE-05: 400 malformed URL
  it('PORT-ROUTE-05: 400 when portrait URL is malformed', async () => {
    const { app } = await buildTestServer({
      // 'http://' (missing host) causes new URL() to throw — truly malformed absolute URL.
      // Note: ':::bad:::' resolves to a valid path under the Foundry base, so it is NOT malformed.
      snapshotFn: () => Promise.resolve({ actorId: ACTOR_ID, name: 'T', portrait: { url: 'http://' } }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // PORT-ROUTE-06: 400 data URI scheme denied
  it('PORT-ROUTE-06: 400 when portrait URL is a data URI (scheme denied)', async () => {
    const { app } = await buildTestServer({
      snapshotFn: () =>
        Promise.resolve({
          actorId: ACTOR_ID,
          name: 'T',
          portrait: { url: 'data:image/png;base64,iVBORw0KGgo=' },
        }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // PORT-ROUTE-07: 403 deny-listed hostname (localhost)
  it('PORT-ROUTE-07: 403 when portrait URL hostname is on deny-list (localhost)', async () => {
    const { app } = await buildTestServer({
      snapshotFn: () =>
        Promise.resolve({
          actorId: ACTOR_ID,
          name: 'T',
          portrait: { url: 'http://localhost/evil' },
        }),
      allowedHosts: ['localhost', ALLOWED_HOST], // even if in allowedHosts, deny-list wins
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // PORT-ROUTE-08: 403 mismatched origin
  it('PORT-ROUTE-08: 403 when portrait URL hostname is not in allowedHosts', async () => {
    const { app } = await buildTestServer({
      snapshotFn: () =>
        Promise.resolve({
          actorId: ACTOR_ID,
          name: 'T',
          portrait: { url: 'https://evil.example.com/portrait.png' },
        }),
      allowedHosts: [ALLOWED_HOST],
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // PORT-ROUTE-09: 200 cache hit — renderer NOT called
  it('PORT-ROUTE-09: 200 cache hit — renderer not called, ETag present', async () => {
    const renderer = makeRenderer();
    const { app } = await buildTestServer({ renderer, cachePrePopulated: true });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(renderer.renderPortrait).not.toHaveBeenCalled();
    expect(res.headers['etag']).toBeDefined();
    await app.close();
  });

  // PORT-ROUTE-10: 200 cache miss — renderer invoked, deltaEmitter called
  it('PORT-ROUTE-10: 200 cache miss — renderer invoked and delta emitted', async () => {
    const renderer = makeRenderer();
    const delta = makeDeltaEmitter();
    const { app } = await buildTestServer({ renderer, deltaEmitter: delta });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(renderer.renderPortrait).toHaveBeenCalledOnce();
    expect(delta.emitDelta).toHaveBeenCalledOnce();
    await app.close();
  });

  // PORT-ROUTE-11: ETag header present
  it('PORT-ROUTE-11: ETag header is present in 200 response (cache miss)', async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toMatch(/^[0-9a-f]{64}$/);
    await app.close();
  });

  // PORT-ROUTE-12: Content-Type is image/png
  it('PORT-ROUTE-12: Content-Type is image/png', async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/portrait/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    await app.close();
  });
});
