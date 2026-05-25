/**
 * Unit tests for GET /v1/combat/current — covering auth + error guard arms.
 *
 * CMB-ROUTE-01: 401 — no Authorization header
 * CMB-ROUTE-02: 503 — tokenCache returns foundry_unreachable
 * CMB-ROUTE-03: 204 — foundryFn returns null (no active combat)
 * CMB-ROUTE-04: 204 — foundryFn returns schema-mismatch object
 * CMB-ROUTE-05: 200 — foundryFn returns valid CombatSnapshot
 *
 * @see packages/bridge/src/routes/combat.ts
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenCache } from '../auth/token-cache.js';
import type { FoundrySnapshotFn } from './character.js';
import { registerCombatRoute } from './combat.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-combat-bearer';

function makeValidateFn(mode: 'valid' | 'foundry_unreachable' = 'valid') {
  return async (token: string) => {
    if (mode === 'foundry_unreachable') {
      return { valid: false as const, reason: 'foundry_unreachable' as const };
    }
    if (token === VALID_TOKEN) {
      return {
        valid: true as const,
        entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'w1' },
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
  await registerCombatRoute(app, cache, foundryFn);
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /v1/combat/current', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('CMB-ROUTE-01: 401 when Authorization header is missing', async () => {
    app = await makeApp('valid', async () => null);
    const res = await app.inject({ method: 'GET', url: '/v1/combat/current' });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: string }>().error).toBe('invalid_token');
  });

  it('CMB-ROUTE-02: 503 when tokenCache returns foundry_unreachable', async () => {
    app = await makeApp('foundry_unreachable', async () => null);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/combat/current',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: string }>().error).toBe('foundry_unreachable');
  });

  it('CMB-ROUTE-03: 204 when foundryFn returns null (no active combat)', async () => {
    app = await makeApp('valid', async () => null);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/combat/current',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  it('CMB-ROUTE-04: 204 when foundryFn returns schema-mismatch object', async () => {
    // Missing required CombatSnapshot fields
    app = await makeApp('valid', async () => ({ invalidField: 'only-this' }));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/combat/current',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  it('CMB-ROUTE-05: 200 with valid CombatSnapshot', async () => {
    // Must match CombatSnapshotSchema (all required fields present)
    const snapshot = {
      combatId: 'combat-1',
      round: 2,
      turn: 0,
      currentCombatantId: 'combatant-1',
      combatants: [],
    };
    app = await makeApp('valid', async () => snapshot);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/combat/current',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(snapshot);
  });
});
