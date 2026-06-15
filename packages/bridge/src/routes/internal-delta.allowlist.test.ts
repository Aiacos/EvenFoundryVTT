/**
 * Security regression: POST /internal/delta enforces a type ALLOWLIST before fan-out.
 *
 * MEDIUM finding (review cleanup): the route formerly accepted ANY non-empty `type`
 * with a `z.unknown()` payload and broadcast it verbatim to every subscribed WS client
 * (and is `rateLimit:false`), allowing arbitrary-envelope injection into all connected
 * glasses clients. The route now rejects any `type` outside the closed allowlist with
 * 400 BEFORE any fan-out.
 *
 * Tests:
 *   - A KNOWN allowlisted type (character.delta) → 200 + fans out over WS.
 *   - An UNKNOWN type (attacker.injected) → 400 `unknown_delta_type`, no fan-out.
 *
 * Strategy mirrors server.frame-png.test.ts: buildServer({}) prod path, real WS client,
 * EVF handshake, assert broadcast (or absence thereof).
 *
 * @see packages/bridge/src/routes/internal-delta.ts (ALLOWED_DELTA_TYPES)
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from '../server.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  'foundry-module',
  'lang',
);

const INTERNAL_SECRET = 'allowlist-test-secret-32bytes-ok!';
const DEV_BEARER = 'dev-no-auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** POST an arbitrary-typed envelope to /internal/delta with the correct secret. */
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

/**
 * Open a WS connection, send the EVF handshake, and collect every broadcast
 * message `type` received. Resolves once the socket is open + handshake sent;
 * callers wait a short beat (as in server.frame-png.test.ts) before asserting.
 */
async function collectBroadcasts(
  port: number,
): Promise<{ ws: WebSocket; received: string[]; ready: Promise<void> }> {
  const received: string[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  let resolveReady: () => void;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });

  ws.on('message', (raw: WebSocket.RawData) => {
    let msg: { type?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (typeof msg.type === 'string') received.push(msg.type);
  });

  ws.once('open', () => {
    // EVF handshake: subscribe with read_char so character.delta fans out to us.
    ws.send(
      JSON.stringify({
        proto: 'evf-v1',
        token: DEV_BEARER,
        locale: 'it',
        capabilities: ['read_char', 'read_combat'],
      }),
    );
    // Give the handshake a tick to register the session before callers POST.
    setTimeout(() => resolveReady(), 100);
  });

  return { ws, received, ready };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /internal/delta type allowlist', () => {
  let savedSecret: string | undefined;
  let savedDevNoAuth: string | undefined;
  let app: FastifyInstance;

  beforeEach(() => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    savedDevNoAuth = process.env.EVF_DEV_NO_AUTH;
    process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
    // Dev-no-auth lets the WS client handshake without a real Foundry/token.
    process.env.EVF_DEV_NO_AUTH = 'true';
  });

  afterEach(async () => {
    if (app) await app.close();
    if (savedSecret === undefined) delete process.env.EVF_INTERNAL_SECRET;
    else process.env.EVF_INTERNAL_SECRET = savedSecret;
    if (savedDevNoAuth === undefined) delete process.env.EVF_DEV_NO_AUTH;
    else process.env.EVF_DEV_NO_AUTH = savedDevNoAuth;
  });

  it('rejects an unknown delta type with 400 and does NOT fan it out', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const { ws, received, ready } = await collectBroadcasts(port);
    await ready;

    // Unknown type → 400, no fan-out.
    const res = await postDelta(app, 'attacker.injected', { evil: true });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'unknown_delta_type' });

    // Give any (erroneous) broadcast a beat to arrive.
    await new Promise((r) => setTimeout(r, 100));
    expect(received).not.toContain('attacker.injected');

    ws.close();
  });

  it('accepts a known allowlisted type (character.delta) with 200 and fans it out', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const { ws, received, ready } = await collectBroadcasts(port);
    await ready;

    const res = await postDelta(app, 'character.delta', { actorId: 'dev-pc-1', hp: 12 });
    expect(res.statusCode).toBe(200);

    // Wait for the broadcast to arrive.
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toContain('character.delta');

    ws.close();
  });
});
