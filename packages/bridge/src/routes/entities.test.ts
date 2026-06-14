/**
 * Tests for GET /v1/entities/available + EntityPackCache + handleEntityPackEnvelope.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spells.test.ts).
 *
 * Coverage:
 * - EntityPackCache: set/get/clear, last-write-wins
 * - handleEntityPackEnvelope: valid payload → cache updated
 * - handleEntityPackEnvelope: invalid payload → cache unchanged (T-EP-02)
 * - handleEntityPackEnvelope: wrong type → returns false
 * - GET /v1/entities/available: 401 without bearer
 * - GET /v1/entities/available: 401 with invalid bearer
 * - GET /v1/entities/available: 503 when foundry_unreachable
 * - GET /v1/entities/available: cold cache → empty response
 * - GET /v1/entities/available: warm cache → cached payload returned (mixed kinds)
 *
 * @see packages/bridge/src/cache/entity-pack-cache.ts
 * @see packages/bridge/src/ws/entity-pack-handler.ts
 * @see packages/bridge/src/routes/entities.ts
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 2
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';
import { R1_ENTITIES_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityPackCache } from '../cache/entity-pack-cache.js';
import { buildServer } from '../server.js';
import { handleEntityPackEnvelope } from '../ws/entity-pack-handler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fixture: 1 item.weapon + 1 actor.npc — demonstrates entityKind cross-coverage. */
const VALID_PAYLOAD: AvailableEntitiesPayload = {
  entries: [
    {
      id: 'longsword',
      packId: 'dnd5e.items',
      entityKind: 'item',
      entityType: 'weapon',
      name: 'Longsword',
      nameLocalized: 'Spada Lunga',
    },
    {
      id: 'goblin-1',
      packId: 'dnd5e.monsters',
      entityKind: 'actor',
      entityType: 'npc',
      name: 'Goblin',
      nameLocalized: 'Goblin',
    },
  ],
  source: 'foundry-packs',
  count: 2,
  generatedAt: 1716000000000,
};

// ─── EntityPackCache ──────────────────────────────────────────────────────────

describe('EntityPackCache', () => {
  it('returns null when cold', () => {
    const cache = new EntityPackCache();
    expect(cache.get()).toBeNull();
  });

  it('stores and retrieves a payload', () => {
    const cache = new EntityPackCache();
    cache.set(VALID_PAYLOAD);
    expect(cache.get()).toEqual(VALID_PAYLOAD);
  });

  it('last-write-wins on multiple sets', () => {
    const cache = new EntityPackCache();
    cache.set(VALID_PAYLOAD);
    const second: AvailableEntitiesPayload = {
      ...VALID_PAYLOAD,
      count: 3,
      entries: [
        ...VALID_PAYLOAD.entries,
        {
          id: 'potion-001',
          packId: 'dnd5e.items',
          entityKind: 'item',
          entityType: 'consumable',
          name: 'Potion of Healing',
          nameLocalized: 'Pozione di Cura',
        },
      ],
    };
    cache.set(second);
    expect(cache.get()?.count).toBe(3);
  });

  it('clear resets to null', () => {
    const cache = new EntityPackCache();
    cache.set(VALID_PAYLOAD);
    cache.clear();
    expect(cache.get()).toBeNull();
  });
});

// ─── handleEntityPackEnvelope ──────────────────────────────────────────────────

describe('handleEntityPackEnvelope', () => {
  it('returns false for unrelated envelope types', () => {
    const cache = new EntityPackCache();
    const result = handleEntityPackEnvelope('r1.spells.available', VALID_PAYLOAD, cache);
    expect(result).toBe(false);
    expect(cache.get()).toBeNull();
  });

  it('returns false for character.delta', () => {
    const cache = new EntityPackCache();
    const result = handleEntityPackEnvelope('character.delta', VALID_PAYLOAD, cache);
    expect(result).toBe(false);
    expect(cache.get()).toBeNull();
  });

  it('validates and caches a valid payload', () => {
    const cache = new EntityPackCache();
    const result = handleEntityPackEnvelope(R1_ENTITIES_AVAILABLE_TYPE, VALID_PAYLOAD, cache);
    expect(result).toBe(true);
    expect(cache.get()).toEqual(VALID_PAYLOAD);
  });

  it('returns true but does not update cache for invalid payload (T-EP-02)', () => {
    const cache = new EntityPackCache();
    const invalidPayload = { entries: 'not-an-array', source: 'bad', count: -99 };
    const result = handleEntityPackEnvelope(R1_ENTITIES_AVAILABLE_TYPE, invalidPayload, cache);
    expect(result).toBe(true); // type matched
    expect(cache.get()).toBeNull(); // cache not poisoned
  });

  it('replaces existing cache on new valid payload', () => {
    const cache = new EntityPackCache();
    cache.set(VALID_PAYLOAD);

    const updated: AvailableEntitiesPayload = {
      entries: [],
      source: 'foundry-packs',
      count: 0,
      generatedAt: 1716000001000,
    };
    handleEntityPackEnvelope(R1_ENTITIES_AVAILABLE_TYPE, updated, cache);
    expect(cache.get()?.count).toBe(0);
    expect(cache.get()?.generatedAt).toBe(1716000001000);
  });
});

// ─── GET /v1/entities/available (via buildServer) ─────────────────────────────

describe('GET /v1/entities/available', () => {
  let app: FastifyInstance;
  let entityCache: EntityPackCache;

  beforeEach(async () => {
    entityCache = new EntityPackCache();

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
        if (bearer === 'unreachable-token') {
          return { valid: false, reason: 'foundry_unreachable' as const };
        }
        return { valid: false, reason: 'unknown_token' as const };
      },
      entityCache,
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns 401 without bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/entities/available' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities/available',
      headers: { authorization: 'Bearer bad-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 503 when foundry validation reports foundry_unreachable', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities/available',
      headers: { authorization: 'Bearer unreachable-token' },
    });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.payload) as { error: string };
    expect(body.error).toBe('foundry_unreachable');
  });

  it('returns cold-cache response when cache is empty', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities/available',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as AvailableEntitiesPayload;
    expect(body.source).toBe('empty');
    expect(body.entries).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.generatedAt).toBe(0);
  });

  it('returns cached payload when cache is warm (mixed entityKind: item + actor)', async () => {
    entityCache.set(VALID_PAYLOAD);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities/available',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as AvailableEntitiesPayload;
    expect(body.source).toBe('foundry-packs');
    expect(body.count).toBe(2);
    expect(body.entries[0]?.entityKind).toBe('item');
    expect(body.entries[0]?.entityType).toBe('weapon');
    expect(body.entries[1]?.entityKind).toBe('actor');
    expect(body.entries[1]?.entityType).toBe('npc');
  });
});
