/**
 * GET /v1/scene/viewport — Scene viewport route.
 *
 * Returns the active scene's ID, name, and current canvas viewport position.
 * Proxied via socketlib GM-side handler. Always returns a response (no 204)
 * since `getSceneViewport` returns a zero-state when no scene is active.
 *
 * Auth: Bearer token (validated via TokenCache).
 *
 * Responses:
 * - 200 + SceneViewport JSON  — viewport state (may be zero-state if no active scene)
 * - 401 `invalid_token`       — token missing or invalid
 * - 503 `foundry_unreachable` — Foundry not reachable
 *
 * @see packages/foundry-module/src/readers/scene-reader.ts
 * @see packages/shared-protocol/src/payloads/scene.ts
 */

import { SceneViewportSchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';

/**
 * Register the GET /v1/scene/viewport route.
 *
 * @param app        - Fastify instance
 * @param tokenCache  - Shared token validation cache
 * @param foundryFn  - Injected socketlib call for testability
 */
export async function registerSceneRoute(
  app: FastifyInstance,
  tokenCache: TokenCache,
  foundryFn: FoundrySnapshotFn,
): Promise<void> {
  app.get('/v1/scene/viewport', async (request, reply) => {
    // --- Auth ---
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }
    const token = authHeader.slice('Bearer '.length);
    const validation = await tokenCache.validate(token);
    if (!validation.valid) {
      if (validation.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    // --- Fetch viewport via socketlib GM handler ---
    const viewport = await foundryFn('evf.getSceneViewport', token);

    // --- Validate shape ---
    const parsed = SceneViewportSchema.safeParse(viewport);
    if (!parsed.success) {
      app.log.warn({ error: parsed.error.message }, 'Scene viewport schema mismatch');
      // Return zero-state viewport when schema fails
      return reply.status(200).send({
        sceneId: '',
        sceneName: '',
        viewX: 0,
        viewY: 0,
        scale: 1.0,
        tokenIds: [],
      });
    }

    return reply.status(200).send(parsed.data);
  });
}
