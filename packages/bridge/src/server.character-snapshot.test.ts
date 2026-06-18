/**
 * Integration tests for the CharacterSnapshotCache wiring in buildServer({}).
 *
 * Quick Task 260605-dog — bridge caches the latest character.delta per actorId.
 *
 * Test A (DOG-INT-01): POST character.delta to /internal/delta → GET /v1/character/:actorId
 *   returns 200 with the pushed snapshot (was actor_not_found before this task).
 *
 * Test B (DOG-INT-02): Seed roster (r1.characters.available) + seed snapshot (character.delta)
 *   → fresh WS connect receives initial character.delta whose payload deep-equals the snapshot.
 *
 * Strategy:
 * - Build server via buildServer({}) — the PROD path (no foundrySnapshotFn injected).
 * - Use /internal/delta to push envelopes with the correct EVF_INTERNAL_SECRET header.
 * - Use EVF_DEV_NO_AUTH=true for bearer-auth bypass in Test A (mirrors existing WS tests).
 * - Use real WebSocket client for Test B (mirrors d0v WS integration test pattern).
 *
 * Auth approach (mirroring existing server.test.ts patterns):
 * - EVF_INTERNAL_SECRET: set before buildServer and cleaned up in afterEach.
 * - EVF_DEV_NO_AUTH: set to 'true' so the dev-no-auth sentinel is accepted as bearer.
 * - Bearer for GET /v1/character: 'dev-no-auth' (sentinel accepted by isDevNoAuth hook).
 *
 * @see packages/bridge/src/server.ts (wiring site)
 * @see packages/bridge/src/cache/character-snapshot-cache.ts
 * @see packages/bridge/src/ws/character-snapshot-handler.ts
 * @see .planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-PLAN.md Task 3
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from './server.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// Resolve lang dir: packages/bridge/src/ → packages/foundry-module/lang/
const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'foundry-module',
  'lang',
);

const INTERNAL_SECRET = 'dog-integration-secret-32bytes!!';
const DEV_BEARER = 'dev-no-auth';

// ─── Full mock CharacterSnapshot ─────────────────────────────────────────────

/**
 * Full mock CharacterSnapshot satisfying CharacterSnapshotSchema.
 * Copied from routes/character.test.ts lines 101-143 (all required fields).
 */
const VALID_SNAPSHOT: CharacterSnapshot = {
  actorId: 'actor-thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 0,
  ac: 16,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 16, mod: 3, save: 3, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 14, mod: 2, save: 2, proficient: false, dc: 10 },
    int: { value: 8, mod: -1, save: -1, proficient: false, dc: 10 },
    wis: { value: 12, mod: 1, save: 1, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    arc: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ath: { total: 3, ability: 'str' as const, proficient: 0 as const, passive: 13 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    ins: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    med: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    nat: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    prc: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: -1, ability: 'int' as const, proficient: 0 as const, passive: 9 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 1, ability: 'wis' as const, proficient: 0 as const, passive: 11 },
  },
  class: 'Fighter',
  initiative: 2,
  speed: 25,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** POST a character.delta envelope to /internal/delta. Returns the Fastify inject response. */
async function pushCharacterDelta(app: FastifyInstance, snapshot: CharacterSnapshot) {
  return app.inject({
    method: 'POST',
    url: '/internal/delta',
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'character.delta', payload: snapshot }),
  });
}

/** POST a r1.characters.available envelope to /internal/delta. */
async function pushCharacterRoster(
  app: FastifyInstance,
  actorId: string,
  name: string,
  level: number,
) {
  return app.inject({
    method: 'POST',
    url: '/internal/delta',
    headers: {
      authorization: `Bearer ${INTERNAL_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'r1.characters.available',
      payload: {
        characters: [{ actorId, name, level }],
        source: 'foundry-world',
        count: 1,
        generatedAt: Date.now(),
      },
    }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Quick Task 260605-dog: CharacterSnapshotCache integration (buildServer({}))', () => {
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

  // ── Test A ───────────────────────────────────────────────────────────────────

  it('DOG-INT-01: POST character.delta → GET /v1/character/:actorId returns 200 with snapshot (was actor_not_found)', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });

    // Push the character.delta envelope to /internal/delta
    const pushRes = await pushCharacterDelta(app, VALID_SNAPSHOT);
    expect(pushRes.statusCode).toBe(200);
    expect(pushRes.json<{ ok: boolean }>().ok).toBe(true);

    // Now GET /v1/character/:actorId — should return 200 with the cached snapshot
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/character/${VALID_SNAPSHOT.actorId}`,
      headers: { authorization: `Bearer ${DEV_BEARER}` },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual(VALID_SNAPSHOT);
  });

  it('DOG-INT-01b: GET /v1/character/:actorId returns 404 actor_not_found when cache is cold (no push)', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });

    // No push — cache is cold. Should still return 404.
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/character/${VALID_SNAPSHOT.actorId}`,
      headers: { authorization: `Bearer ${DEV_BEARER}` },
    });

    expect(getRes.statusCode).toBe(404);
    expect(getRes.json<{ error: string }>().error).toBe('actor_not_found');
  });

  it('SR-REQ-01: GET /internal/stream-request rejects a wrong secret (401)', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });
    const res = await app.inject({
      method: 'GET',
      url: '/internal/stream-request',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('SR-REQ-02: GET /internal/stream-request returns {actorId:null} cold (no intent)', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });
    const res = await app.inject({
      method: 'GET',
      url: '/internal/stream-request',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ actorId: string | null }>().actorId).toBeNull();
  });

  // ── Test B (WS end-to-end) ────────────────────────────────────────────────────

  it(
    'DOG-INT-02: roster + cached snapshot → fresh WS connect receives initial character.delta',
    () =>
      new Promise<void>((done, fail) => {
        // Build the server, listen on a random port.
        buildServer({ langDirOverride: LANG_DIR })
          .then((builtApp) => {
            app = builtApp;

            return app.listen({ port: 0, host: '127.0.0.1' }).then(async () => {
              const addr = app.server.address();
              const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

              // 1. Push the roster (r1.characters.available) so CharacterListCache is populated.
              const rosterRes = await pushCharacterRoster(
                app,
                VALID_SNAPSHOT.actorId,
                VALID_SNAPSHOT.name,
                VALID_SNAPSHOT.level,
              );
              if (rosterRes.statusCode !== 200) {
                fail(new Error(`Failed to push roster: ${rosterRes.statusCode} ${rosterRes.body}`));
                return;
              }

              // 2. Push the character.delta so CharacterSnapshotCache is populated.
              const deltaRes = await pushCharacterDelta(app, VALID_SNAPSHOT);
              if (deltaRes.statusCode !== 200) {
                fail(new Error(`Failed to push delta: ${deltaRes.statusCode} ${deltaRes.body}`));
                return;
              }

              // 3. Open a real WS connection and complete the handshake.
              const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
              const received: Array<Record<string, unknown>> = [];
              let resolved = false;

              // Deadline: 2s for character.delta to arrive (mirrors d0v test).
              const deadline = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  ws.close();
                  fail(
                    new Error(
                      `DOG-INT-02: No character.delta received within 2s. Got: ${JSON.stringify(received)}`,
                    ),
                  );
                }
              }, 2000);

              ws.on('message', (raw) => {
                try {
                  const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

                  // Collect typed envelopes (non-handshake).
                  if (typeof msg['type'] === 'string') {
                    received.push(msg);
                  }

                  // Send handshake hello when connected (proto_chosen absent means it's the
                  // handshake request phase — handled via ws.once('open') below).
                  const delta = received.find((m) => m['type'] === 'character.delta');
                  if (delta !== undefined && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    try {
                      expect(delta['payload']).toEqual(VALID_SNAPSHOT);
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
                // Send EVF handshake with dev-no-auth token.
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
            });
          })
          .catch(fail);
      }),
    5000,
  );

  it(
    'BUG-5: seeded roster → fresh WS connect receives r1.characters.available on connect',
    () =>
      new Promise<void>((done, fail) => {
        buildServer({ langDirOverride: LANG_DIR })
          .then((builtApp) => {
            app = builtApp;
            return app.listen({ port: 0, host: '127.0.0.1' }).then(async () => {
              const addr = app.server.address();
              const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

              // Seed the roster so CharacterListCache is warm (simulates the module
              // having pushed before this client connected — e.g. after a bridge restart).
              const rosterRes = await pushCharacterRoster(
                app,
                VALID_SNAPSHOT.actorId,
                VALID_SNAPSHOT.name,
                VALID_SNAPSHOT.level,
              );
              if (rosterRes.statusCode !== 200) {
                fail(new Error(`Failed to push roster: ${rosterRes.statusCode} ${rosterRes.body}`));
                return;
              }

              const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
              const received: Array<Record<string, unknown>> = [];
              let resolved = false;

              const deadline = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  ws.close();
                  fail(
                    new Error(
                      `BUG-5: No r1.characters.available received within 2s. Got: ${JSON.stringify(received)}`,
                    ),
                  );
                }
              }, 2000);

              ws.on('message', (raw) => {
                try {
                  const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
                  if (typeof msg['type'] === 'string') {
                    received.push(msg);
                  }
                  const roster = received.find((m) => m['type'] === 'r1.characters.available');
                  if (roster !== undefined && !resolved) {
                    resolved = true;
                    clearTimeout(deadline);
                    try {
                      const payload = roster['payload'] as {
                        characters?: Array<{ actorId: string }>;
                      };
                      expect(payload.characters?.[0]?.actorId).toBe(VALID_SNAPSHOT.actorId);
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
                ws.send(
                  JSON.stringify({
                    proto: 'evf-v1',
                    token: DEV_BEARER,
                    locale: 'it',
                    capabilities: ['read_char'],
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
            });
          })
          .catch(fail);
      }),
    5000,
  );
});
