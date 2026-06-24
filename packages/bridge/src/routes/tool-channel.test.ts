/**
 * Route tests for the Phase 8 tool reverse-channel internal routes.
 *
 * Covers:
 *   - TC-AUTH-01: GET /internal/tool-requests rejects a missing/wrong secret (401).
 *   - TC-AUTH-02: POST /internal/tool-result rejects a missing/wrong secret (401).
 *   - TC-DRAIN-01: GET /internal/tool-requests returns an empty list when idle (cold).
 *   - TC-RESULT-01: POST /internal/tool-result for an unknown request id → 404.
 *   - TC-RESULT-02: POST /internal/tool-result with a malformed body → 400.
 *
 * The enqueue→drain→resolve round-trip through the queue itself is covered by
 * tool-invocation-queue.test.ts; here we exercise the HTTP surface + auth.
 *
 * @see packages/bridge/src/routes/tool-channel.ts
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  'foundry-module',
  'lang',
);

const INTERNAL_SECRET = 'tool-channel-secret-32bytes!!!!!';

describe('Phase 8 tool reverse-channel routes', () => {
  let savedSecret: string | undefined;
  let app: FastifyInstance;

  beforeEach(async () => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
    app = await buildServer({ langDirOverride: LANG_DIR });
  });

  afterEach(async () => {
    if (app) await app.close();
    if (savedSecret === undefined) delete process.env.EVF_INTERNAL_SECRET;
    else process.env.EVF_INTERNAL_SECRET = savedSecret;
  });

  it('TC-AUTH-01: GET /internal/tool-requests rejects a missing secret (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/tool-requests' });
    expect(res.statusCode).toBe(401);
  });

  it('TC-AUTH-01b: GET /internal/tool-requests rejects a wrong secret (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/tool-requests',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('TC-AUTH-02: POST /internal/tool-result rejects a missing secret (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/tool-result',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ requestId: 'x', result: { success: true } }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('TC-DRAIN-01: GET /internal/tool-requests returns an empty list when idle', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/tool-requests',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requests: [] });
  });

  it('TC-BEACON-01: GET accepts the module-version beacon (&mv=) without breaking the drain', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/tool-requests?userId=user-a&mv=0.1.52',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });
    // The extra `mv` query param is ignored by the drain (logged on change) — still 200 + empty.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requests: [] });
  });

  it('TC-RESULT-01: POST /internal/tool-result for an unknown request id → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/tool-result',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ requestId: 'never-enqueued', result: { success: true } }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'unknown_request' });
  });

  it('TC-RESULT-02: POST /internal/tool-result with a malformed body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/tool-result',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ requestId: 'x' }), // missing `result`
    });
    expect(res.statusCode).toBe(400);
  });
});
