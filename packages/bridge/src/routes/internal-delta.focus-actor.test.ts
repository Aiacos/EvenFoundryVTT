/**
 * Unit tests: POST /internal/delta piggybacks the focus-actor id on the frame
 * response for map auto-framing.
 *
 * The frame-POST is the leader-only reverse channel: on a FRAME delta the route
 * appends `focusActorId` (from the injected getter) to the `{ ok: true }` body so
 * the stream-leader Foundry client can center the captured map region on the
 * player's chosen PC — exactly like `pendingSettings` is piggybacked.
 *
 * Tests:
 *   - A frame-type delta (frame_png) with a getter returning 'actor-xyz' → 200
 *     whose body has `focusActorId: 'actor-xyz'`.
 *   - A NON-frame delta (character.delta) → 200 body WITHOUT `focusActorId`.
 *
 * Strategy: register the route directly on a bare Fastify instance with real
 * DeltaEmitter/ReplayBuffer/SessionStore and a stub `getFocusActorId`, then
 * exercise it via `app.inject` (no WS / no network).
 *
 * @see packages/bridge/src/routes/internal-delta.ts (registerInternalDeltaRoute)
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeltaEmitter } from '../ws/delta-emitter.js';
import { ReplayBuffer } from '../ws/replay-buffer.js';
import { SessionStore } from '../ws/session-store.js';
import { registerInternalDeltaRoute } from './internal-delta.js';

const INTERNAL_SECRET = 'focus-actor-test-secret-32bytes!!';

/** POST an envelope to /internal/delta with the correct internal secret. */
async function postDelta(app: FastifyInstance, type: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/delta',
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, payload }),
  });
}

/** Build a bare Fastify app with the route wired to a focus-actor getter. */
async function buildApp(getFocusActorId: () => string | null): Promise<FastifyInstance> {
  const app = Fastify();
  const sessionStore = new SessionStore();
  const deltaEmitter = new DeltaEmitter(new ReplayBuffer(), sessionStore);
  // settingsStore intentionally omitted (undefined) — proves focus-actor piggyback
  // works independently of the display-settings store.
  await registerInternalDeltaRoute(app, deltaEmitter, undefined, undefined, getFocusActorId);
  await app.ready();
  return app;
}

describe('POST /internal/delta — focus-actor piggyback (map auto-framing)', () => {
  let savedSecret: string | undefined;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    if (savedSecret === undefined) delete process.env.EVF_INTERNAL_SECRET;
    else process.env.EVF_INTERNAL_SECRET = savedSecret;
  });

  it('FA-PB-01: frame_png delta → 200 with focusActorId from the getter', async () => {
    app = await buildApp(() => 'actor-xyz');

    const res = await postDelta(app, 'frame_png', {
      sceneId: 's1',
      width: 576,
      height: 288,
      pngB64: 'AA==',
      ts: Date.now(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, focusActorId: 'actor-xyz' });
  });

  it('FA-PB-02: non-frame delta (character.delta) → 200 WITHOUT focusActorId', async () => {
    app = await buildApp(() => 'actor-xyz');

    const res = await postDelta(app, 'character.delta', { actorId: 'pc-1', hp: 10 });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean; focusActorId?: string }>();
    expect(body.ok).toBe(true);
    expect(body.focusActorId).toBeUndefined();
  });
});
