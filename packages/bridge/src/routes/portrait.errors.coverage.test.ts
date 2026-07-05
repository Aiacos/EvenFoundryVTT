/**
 * Render-error + auth-degradation coverage for GET /v1/portrait/:actorId.
 *
 * The main portrait.test.ts covers the happy path + validation rejections, but
 * not the renderer failure arms (fetch/too-large/decode) nor the
 * foundry_unreachable degradation. This suite drives a renderer that throws each
 * typed error and asserts the exact HTTP status the route maps it to, plus the
 * 503 path when the token cache reports Foundry unreachable. It also adds a few
 * validatePortraitUrl edge cases (malformed octet forms) missed by the SSRF suite.
 *
 * @see ./portrait.ts (route error mapping + validatePortraitUrl)
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ValidateTokenResult } from '../auth/token-cache.js';
import { TokenCache } from '../auth/token-cache.js';
import { PortraitCache } from '../portrait/portrait-cache.js';
import {
  PortraitDecodeError,
  PortraitFetchError,
  type PortraitRenderer,
  PortraitTooLargeError,
} from '../portrait/portrait-renderer.js';
import type { FoundrySnapshotFn } from './character.js';
import { registerPortraitRoute, validatePortraitUrl } from './portrait.js';

const VALID_TOKEN = 'valid-portrait-bearer';
const ACTOR_ID = 'actor-thorin';
const ALLOWED_HOST = 'foundry.example.com';
const FOUNDRY_ORIGIN = `http://${ALLOWED_HOST}`;
const PORTRAIT_URL = 'worlds/w/portraits/thorin.webp';

function snapshotFn(): FoundrySnapshotFn {
  return (() =>
    Promise.resolve({
      actorId: ACTOR_ID,
      name: 'Thorin',
      portrait: { url: PORTRAIT_URL },
    })) as FoundrySnapshotFn;
}

/** TokenCache whose validate always reports Foundry unreachable. */
function unreachableValidateFn(): (token: string) => Promise<ValidateTokenResult> {
  return async () => ({ valid: false as const, reason: 'foundry_unreachable' as const });
}

function okValidateFn(): (token: string) => Promise<ValidateTokenResult> {
  return async (token: string) =>
    token === VALID_TOKEN
      ? {
          valid: true as const,
          entry: { alias: 'G2', expiresAt: Date.now() + 8.64e7, worldId: 'w1', userId: 'u1' },
        }
      : { valid: false as const, reason: 'unknown_token' as const };
}

async function buildWithRenderer(
  renderer: PortraitRenderer,
  validateFn = okValidateFn(),
): Promise<import('fastify').FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerPortraitRoute({
    app,
    tokenCache: new TokenCache(validateFn),
    foundrySnapshotFn: snapshotFn(),
    portraitCache: new PortraitCache({ maxEntries: 4, ttlMs: 3_600_000 }),
    portraitRenderer: renderer,
    allowedHosts: [ALLOWED_HOST],
    foundryOrigin: FOUNDRY_ORIGIN,
  });
  await app.ready();
  return app;
}

function get(app: import('fastify').FastifyInstance, token = VALID_TOKEN) {
  return app.inject({
    method: 'GET',
    url: `/v1/portrait/${ACTOR_ID}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('GET /v1/portrait/:actorId — degradation + renderer error mapping', () => {
  afterEach(() => vi.clearAllMocks());

  it('503 foundry_unreachable when the token cache cannot reach Foundry', async () => {
    const renderer: PortraitRenderer = { renderPortrait: vi.fn() };
    const app = await buildWithRenderer(renderer, unreachableValidateFn());
    const res = await get(app);
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: string }>().error).toBe('foundry_unreachable');
    expect(renderer.renderPortrait).not.toHaveBeenCalled();
    await app.close();
  });

  it('502 portrait_fetch_failed when the renderer throws PortraitFetchError', async () => {
    const renderer: PortraitRenderer = {
      renderPortrait: vi.fn().mockRejectedValue(new PortraitFetchError('http://x/p.webp', 404)),
    };
    const app = await buildWithRenderer(renderer);
    const res = await get(app);
    expect(res.statusCode).toBe(502);
    expect(res.json<{ error: string }>().error).toBe('portrait_fetch_failed');
    await app.close();
  });

  it('413 portrait_too_large when the renderer throws PortraitTooLargeError', async () => {
    const renderer: PortraitRenderer = {
      renderPortrait: vi.fn().mockRejectedValue(new PortraitTooLargeError('http://x/p.webp')),
    };
    const app = await buildWithRenderer(renderer);
    const res = await get(app);
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: string }>().error).toBe('portrait_too_large');
    await app.close();
  });

  it('502 portrait_decode_failed when the renderer throws PortraitDecodeError', async () => {
    const renderer: PortraitRenderer = {
      renderPortrait: vi
        .fn()
        .mockRejectedValue(new PortraitDecodeError('http://x/p.webp', new Error('bad png'))),
    };
    const app = await buildWithRenderer(renderer);
    const res = await get(app);
    expect(res.statusCode).toBe(502);
    expect(res.json<{ error: string }>().error).toBe('portrait_decode_failed');
    await app.close();
  });

  it('rethrows an unexpected (non-typed) renderer error → 500', async () => {
    const renderer: PortraitRenderer = {
      renderPortrait: vi.fn().mockRejectedValue(new Error('unexpected boom')),
    };
    const app = await buildWithRenderer(renderer);
    const res = await get(app);
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('validatePortraitUrl — IPv6 literal edge cases', () => {
  const ALLOWED = [ALLOWED_HOST];

  it('denies the IPv6 unspecified address (::)', () => {
    const r = validatePortraitUrl('http://[::]/p.webp', FOUNDRY_ORIGIN, [...ALLOWED, '[::]']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.statusCode).toBe(403);
  });

  it('denies a unique-local IPv6 literal (fd00::)', () => {
    const r = validatePortraitUrl('http://[fd00::1]/p.webp', FOUNDRY_ORIGIN, [
      ...ALLOWED,
      '[fd00::1]',
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.statusCode).toBe(403);
  });
});
