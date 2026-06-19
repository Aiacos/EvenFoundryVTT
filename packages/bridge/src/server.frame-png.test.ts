/**
 * Integration test for `frame_png` POST→WS pass-through via buildServer({}).
 *
 * Quick Task 260611-e71 Task 3 — proves that a `frame_png` envelope posted to
 * /internal/delta is broadcast over WS to a subscribed client with payload intact.
 *
 * The bridge requires NO source changes to support frame_png: it is not in the
 * DELTA_CAP_MAP so it broadcasts to all subscribed sessions like any uncapped
 * type (the same mechanism used by character.delta, r1.characters.available, etc.).
 *
 * Strategy:
 * - Build server via buildServer({}) — the PROD path (no foundrySnapshotFn injected).
 * - Use /internal/delta to push a frame_png envelope with the correct EVF_INTERNAL_SECRET.
 * - Open a real WS connection, complete the EVF handshake, then assert the broadcast
 *   frame_png message arrives with the original payload intact.
 *
 * This is a structural mirror of server.character-snapshot.test.ts Test B (DOG-INT-02).
 *
 * @see packages/bridge/src/server.ts (pass-through wiring)
 * @see packages/shared-protocol/src/payloads/frame-png.ts (FramePngSchema)
 * @see .planning/quick/260611-e71-modulo-v0-1-15-frame-png-captureinterval/260611-e71-PLAN.md Task 3
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from './server.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'foundry-module',
  'lang',
);

const INTERNAL_SECRET = 'e71-frame-png-test-secret-32bytes';
const DEV_BEARER = 'dev-no-auth';

// ─── Synthetic tiny PNG ────────────────────────────────────────────────────────

/**
 * Minimal valid base64 PNG for the test fixture.
 *
 * A 1×1 white pixel PNG (grayscale 8-bit), base64-encoded.
 * This is intentionally tiny — the test asserts transit, not pixel content.
 *
 * If the FramePngSchema pngB64 field requires a decodable PNG, this is valid.
 * If the schema only requires a non-empty string, this also satisfies that.
 */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** POST a frame_png envelope to /internal/delta. */
async function pushFramePng(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/internal/delta',
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'frame_png', payload }),
  });
}

/** Build a valid FramePng payload. */
function makeFramePngPayload(): Record<string, unknown> {
  return {
    sceneId: 'e71-test-scene',
    width: 576,
    height: 288,
    pngB64: TINY_PNG_B64,
    ts: Date.now(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Quick Task 260611-e71: frame_png POST→WS pass-through (buildServer({}))', () => {
  let savedSecret: string | undefined;
  let savedDevNoAuth: string | undefined;
  let app: FastifyInstance;

  beforeEach(() => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    savedDevNoAuth = process.env.EVF_DEV_NO_AUTH;
    process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
    process.env.EVF_DEV_NO_AUTH = 'true'; // dev-no-auth sentinel accepted by onRequest hook
  });

  afterEach(async () => {
    if (app) await app.close();
    const restore = (k: string, v: string | undefined): void => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('EVF_INTERNAL_SECRET', savedSecret);
    restore('EVF_DEV_NO_AUTH', savedDevNoAuth);
  });

  // ── E71-INT-01: POST /internal/delta with frame_png → 200 ────────────────────

  it('E71-INT-01: POST frame_png to /internal/delta returns 200 ok', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });

    const payload = makeFramePngPayload();
    const res = await pushFramePng(app, payload);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);
  });

  // ── E71-INT-02: frame_png broadcast over WS ───────────────────────────────────

  it(
    'E71-INT-02: frame_png POST→WS pass-through — subscribed client receives frame_png with payload intact',
    () =>
      new Promise<void>((done, fail) => {
        buildServer({ langDirOverride: LANG_DIR })
          .then((builtApp) => {
            app = builtApp;

            return app.listen({ port: 0, host: '127.0.0.1' }).then(async () => {
              const addr = app.server.address();
              const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

              const framePngPayload = makeFramePngPayload();

              // Open a real WS connection and complete the EVF handshake.
              const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
              const received: Array<Record<string, unknown>> = [];
              let resolved = false;

              const deadline = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  ws.close();
                  fail(
                    new Error(
                      `E71-INT-02: No frame_png received within 2s. Got: ${JSON.stringify(received)}`,
                    ),
                  );
                }
              }, 2000);

              ws.on('message', (raw) => {
                try {
                  const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

                  if (typeof msg.type === 'string') {
                    received.push(msg);
                  }

                  const framePng = received.find((m) => m.type === 'frame_png');
                  if (framePng !== undefined && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    try {
                      // Verify the payload fields are intact.
                      const p = framePng.payload as Record<string, unknown>;
                      expect(p.sceneId).toBe(framePngPayload.sceneId);
                      expect(p.width).toBe(framePngPayload.width);
                      expect(p.height).toBe(framePngPayload.height);
                      expect(p.pngB64).toBe(framePngPayload.pngB64);
                      ws.close();
                      done();
                    } catch (err) {
                      ws.close();
                      fail(err);
                    }
                  }
                } catch (err) {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    ws.close();
                    fail(err);
                  }
                }
              });

              ws.once('open', () => {
                // Complete EVF handshake — subscribe with read_char capability.
                ws.send(
                  JSON.stringify({
                    proto: 'evf-v1',
                    token: DEV_BEARER,
                    locale: 'it',
                    capabilities: ['read_char', 'read_combat'],
                  }),
                );
              });

              ws.once('error', (err) => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(deadline);
                  fail(err);
                }
              });

              // Wait a tick for the handshake to complete, then POST the frame_png.
              // Use setTimeout(0) to ensure the WS message listener is set up before the push.
              await new Promise<void>((r) => setTimeout(r, 100));

              const pushRes = await pushFramePng(app, framePngPayload);
              if (pushRes.statusCode !== 200) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(deadline);
                  ws.close();
                  fail(
                    new Error(
                      `E71-INT-02: POST frame_png failed: ${pushRes.statusCode} ${pushRes.body}`,
                    ),
                  );
                }
              }
            });
          })
          .catch(fail);
      }),
    5000,
  );
});
