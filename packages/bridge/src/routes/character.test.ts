/**
 * Unit tests for GET /v1/character/:actorId — covering auth + error guard arms.
 *
 * CHR-ROUTE-01: 401 — no Authorization header
 * CHR-ROUTE-02: 503 — tokenCache returns foundry_unreachable
 * CHR-ROUTE-03: 404 — foundryFn returns null (actor not found)
 * CHR-ROUTE-04: 404 — foundryFn returns schema-mismatch object
 * CHR-ROUTE-05: 200 — foundryFn returns valid CharacterSnapshot
 *
 * @see packages/bridge/src/routes/character.ts
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenCache } from '../auth/token-cache.js';
import { type FoundrySnapshotFn, registerCharacterRoute } from './character.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-character-bearer';
const ACTOR_ID = 'actor-thorin';

function makeValidateFn(mode: 'valid' | 'foundry_unreachable' = 'valid') {
  return async (token: string) => {
    if (mode === 'foundry_unreachable') {
      return { valid: false as const, reason: 'foundry_unreachable' as const };
    }
    if (token === VALID_TOKEN) {
      return {
        valid: true as const,
        entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'w1', userId: 'u1' },
        // ADR-0014: the valid bearer owns ACTOR_ID (and only ACTOR_ID).
        authorizedActorIds: [ACTOR_ID],
      };
    }
    return { valid: false as const, reason: 'unknown_token' as const };
  };
}

async function makeApp(
  validateMode: 'valid' | 'foundry_unreachable',
  foundryFn: FoundrySnapshotFn,
) {
  const app = Fastify({ logger: false });
  const cache = new TokenCache(makeValidateFn(validateMode));
  await registerCharacterRoute(app, cache, foundryFn);
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /v1/character/:actorId', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('CHR-ROUTE-01: 401 when Authorization header is missing', async () => {
    app = await makeApp('valid', async () => null);
    const res = await app.inject({ method: 'GET', url: `/v1/character/${ACTOR_ID}` });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe('invalid_token');
  });

  it('CHR-ROUTE-02: 503 when tokenCache returns foundry_unreachable', async () => {
    app = await makeApp('foundry_unreachable', async () => null);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/character/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: string }>().error).toBe('foundry_unreachable');
  });

  it('CHR-ROUTE-03: 404 when foundryFn returns null', async () => {
    app = await makeApp('valid', async () => null);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/character/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('actor_not_found');
  });

  it('CHR-ROUTE-04: 404 when foundryFn returns schema-mismatch object', async () => {
    // Missing required CharacterSnapshot fields
    app = await makeApp('valid', async () => ({ invalidField: 'only-this' }));
    const res = await app.inject({
      method: 'GET',
      url: `/v1/character/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('actor_not_found');
  });

  it('CHR-ROUTE-05: 200 with valid CharacterSnapshot', async () => {
    // Must match CharacterSnapshotSchema (all required fields present)
    const snapshot = {
      actorId: ACTOR_ID,
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
    app = await makeApp('valid', async () => snapshot);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/character/${ACTOR_ID}`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(snapshot);
  });

  // ── ADR-0014 §4: per-actor read authorization (T8) ──

  it('CHR-ROUTE-06: 404 when actorId is NOT in the bearer’s authorized set (T8)', async () => {
    // foundryFn would happily return a snapshot — enforcement must reject BEFORE
    // it is reached, with the SAME 404 as a genuinely-unknown actor (no enumeration).
    const foundryFn = vi.fn(async () => ({ actorId: 'actor-someone-else', name: 'Secret' }));
    app = await makeApp('valid', foundryFn);
    const res = await app.inject({
      method: 'GET',
      // VALID_TOKEN owns ACTOR_ID only — this is a different, non-owned actor.
      url: '/v1/character/actor-someone-else',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('actor_not_found');
    // The Foundry handler must never be consulted for a non-owned actor.
    expect(foundryFn).not.toHaveBeenCalled();
  });
});
