/**
 * Tests for GET /v1/spells/available + SpellPackCache + handleSpellPackEnvelope.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 2).
 *
 * Coverage:
 * - SpellPackCache: set/get/clear
 * - handleSpellPackEnvelope: valid payload → cache updated
 * - handleSpellPackEnvelope: invalid payload → cache unchanged
 * - handleSpellPackEnvelope: wrong type → returns false
 * - GET /v1/spells/available: 401 without bearer
 * - GET /v1/spells/available: cold cache → empty response
 * - GET /v1/spells/available: warm cache → cached payload returned
 *
 * @see packages/bridge/src/cache/spell-pack-cache.ts
 * @see packages/bridge/src/ws/spell-pack-handler.ts
 * @see packages/bridge/src/routes/spells.ts
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 2
 */

import type { AvailableSpellsPayload } from '@evf/shared-protocol';
import { R1_SPELLS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpellPackCache } from '../cache/spell-pack-cache.js';
import { buildServer } from '../server.js';
import { handleSpellPackEnvelope } from '../ws/spell-pack-handler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_PAYLOAD: AvailableSpellsPayload = {
  entries: [
    {
      id: 'spell-001',
      packId: 'dnd5e.spells',
      name: 'Fireball',
      nameLocalized: 'Palla di Fuoco',
      level: 3,
      school: 'evo',
    },
  ],
  source: 'foundry-packs',
  count: 1,
  generatedAt: 1716000000000,
};

// ─── SpellPackCache ────────────────────────────────────────────────────────────

describe('SpellPackCache', () => {
  it('returns null when cold', () => {
    const cache = new SpellPackCache();
    expect(cache.get()).toBeNull();
  });

  it('stores and retrieves a payload', () => {
    const cache = new SpellPackCache();
    cache.set(VALID_PAYLOAD);
    expect(cache.get()).toEqual(VALID_PAYLOAD);
  });

  it('last-write-wins on multiple sets', () => {
    const cache = new SpellPackCache();
    cache.set(VALID_PAYLOAD);
    const second: AvailableSpellsPayload = {
      ...VALID_PAYLOAD,
      count: 2,
      entries: [
        ...VALID_PAYLOAD.entries,
        {
          id: 'spell-002',
          packId: 'dnd5e.spells',
          name: 'Magic Missile',
          nameLocalized: 'Dardo Incantato',
          level: 1,
          school: 'evo',
        },
      ],
    };
    cache.set(second);
    expect(cache.get()?.count).toBe(2);
  });

  it('clear resets to null', () => {
    const cache = new SpellPackCache();
    cache.set(VALID_PAYLOAD);
    cache.clear();
    expect(cache.get()).toBeNull();
  });
});

// ─── handleSpellPackEnvelope ───────────────────────────────────────────────────

describe('handleSpellPackEnvelope', () => {
  it('returns false for unrelated envelope types', () => {
    const cache = new SpellPackCache();
    const result = handleSpellPackEnvelope('character.delta', VALID_PAYLOAD, cache);
    expect(result).toBe(false);
    expect(cache.get()).toBeNull();
  });

  it('validates and caches a valid payload', () => {
    const cache = new SpellPackCache();
    const result = handleSpellPackEnvelope(R1_SPELLS_AVAILABLE_TYPE, VALID_PAYLOAD, cache);
    expect(result).toBe(true);
    expect(cache.get()).toEqual(VALID_PAYLOAD);
  });

  it('returns true but does not update cache for invalid payload (T-SP-02)', () => {
    const cache = new SpellPackCache();
    const invalidPayload = { entries: 'not-an-array', source: 'bad', count: -99 };
    const result = handleSpellPackEnvelope(R1_SPELLS_AVAILABLE_TYPE, invalidPayload, cache);
    expect(result).toBe(true); // type matched
    expect(cache.get()).toBeNull(); // cache not poisoned
  });

  it('replaces existing cache on new valid payload', () => {
    const cache = new SpellPackCache();
    cache.set(VALID_PAYLOAD);

    const updated: AvailableSpellsPayload = {
      entries: [],
      source: 'foundry-packs',
      count: 0,
      generatedAt: 1716000001000,
    };
    handleSpellPackEnvelope(R1_SPELLS_AVAILABLE_TYPE, updated, cache);
    expect(cache.get()?.count).toBe(0);
    expect(cache.get()?.generatedAt).toBe(1716000001000);
  });
});

// ─── GET /v1/spells/available (via buildServer) ────────────────────────────────

describe('GET /v1/spells/available', () => {
  let app: FastifyInstance;
  let spellCache: SpellPackCache;

  beforeEach(async () => {
    spellCache = new SpellPackCache();

    // Use a mock foundryValidateFn that accepts bearer 'test-token'
    app = await buildServer({
      foundryValidateFn: async (bearer: string) => {
        if (bearer === 'test-token') {
          return {
            valid: true,
            entry: {
              alias: 'Test',
              expiresAt: Date.now() + 86400000,
              worldId: 'test-world',
              userId: 'u1',
            },
          };
        }
        return { valid: false, reason: 'unknown_token' as const };
      },
      spellCache,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns 401 without bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/spells/available' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/spells/available',
      headers: { authorization: 'Bearer bad-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns cold-cache response when cache is empty', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/spells/available',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as AvailableSpellsPayload;
    expect(body.source).toBe('empty');
    expect(body.entries).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('returns cached payload when cache is warm', async () => {
    spellCache.set(VALID_PAYLOAD);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/spells/available',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as AvailableSpellsPayload;
    expect(body.source).toBe('foundry-packs');
    expect(body.count).toBe(1);
    expect(body.entries[0]?.name).toBe('Fireball');
  });
});
