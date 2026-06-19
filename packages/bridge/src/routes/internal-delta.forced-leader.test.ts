/**
 * Unit tests: POST /internal/delta forced-leader frame arbitration (ADR-0015 §C P2c).
 *
 * A headless player-view client tags its frame POSTs with `X-EVF-Forced-Leader: 1`.
 * While such frames arrive (within the tracker TTL), the GM's untagged frames are
 * DROPPED from the WS broadcast so the glasses show the headless view; once the
 * headless stops, the GM's frames flow again. Non-frame deltas are never gated.
 *
 * Strategy: register the route with a real DeltaEmitter (emitDelta spied) + a
 * ForcedLeaderTracker, exercise via `app.inject`, assert which frames fan out.
 *
 * @see packages/bridge/src/routes/internal-delta.ts
 * @see packages/bridge/src/headless/forced-leader-tracker.ts
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForcedLeaderTracker } from '../headless/forced-leader-tracker.js';
import { DeltaEmitter } from '../ws/delta-emitter.js';
import { ReplayBuffer } from '../ws/replay-buffer.js';
import { SessionStore } from '../ws/session-store.js';
import { registerInternalDeltaRoute } from './internal-delta.js';

const INTERNAL_SECRET = 'forced-leader-test-secret-32byte!';

const FRAME = { sceneId: 's1', width: 576, height: 288, pngB64: 'AA==', ts: 1 };

function postFrame(app: FastifyInstance, forced: boolean, type = 'frame_png') {
  return app.inject({
    method: 'POST',
    url: '/internal/delta',
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
      'content-type': 'application/json',
      ...(forced ? { 'x-evf-forced-leader': '1' } : {}),
    },
    body: JSON.stringify({ type, payload: FRAME }),
  });
}

describe('POST /internal/delta — forced-leader frame arbitration', () => {
  let savedSecret: string | undefined;
  let app: FastifyInstance | undefined;
  let emit: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
    app = Fastify();
    const deltaEmitter = new DeltaEmitter(new ReplayBuffer(), new SessionStore());
    emit = vi.spyOn(deltaEmitter, 'emitDelta');
    await registerInternalDeltaRoute(
      app,
      deltaEmitter,
      undefined,
      undefined,
      () => null,
      new ForcedLeaderTracker(10_000),
    );
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    vi.restoreAllMocks();
    if (savedSecret === undefined) delete process.env.EVF_INTERNAL_SECRET;
    else process.env.EVF_INTERNAL_SECRET = savedSecret;
  });

  it('FL-01: a forced frame is broadcast (and activates the tracker)', async () => {
    const res = await postFrame(app as FastifyInstance, true);
    expect(res.statusCode).toBe(200);
    expect(emit).toHaveBeenCalledWith('frame_png', FRAME);
  });

  it('FL-02: a GM (non-forced) frame is DROPPED while a forced leader is active', async () => {
    await postFrame(app as FastifyInstance, true); // forced → tracker active
    emit.mockClear();
    const res = await postFrame(app as FastifyInstance, false); // GM frame
    expect(res.statusCode).toBe(200); // still 200 (reverse channel intact)
    expect(emit).not.toHaveBeenCalled(); // but not broadcast
  });

  it('FL-03: a GM frame IS broadcast when no forced leader is active', async () => {
    const res = await postFrame(app as FastifyInstance, false);
    expect(res.statusCode).toBe(200);
    expect(emit).toHaveBeenCalledWith('frame_png', FRAME);
  });

  it('FL-04: non-frame deltas are never gated by the forced leader', async () => {
    await postFrame(app as FastifyInstance, true); // forced active
    emit.mockClear();
    const res = await (app as FastifyInstance).inject({
      method: 'POST',
      url: '/internal/delta',
      headers: {
        authorization: `Bearer ${INTERNAL_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'character.delta', payload: { actorId: 'pc', hp: 5 } }),
    });
    expect(res.statusCode).toBe(200);
    expect(emit).toHaveBeenCalledWith('character.delta', { actorId: 'pc', hp: 5 });
  });
});
