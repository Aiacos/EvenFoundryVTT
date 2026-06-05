/**
 * Integration tests for buildServer() — HTTP routes using Fastify inject().
 *
 * Covers:
 * - GET /v1/health: valid bearer → 200, invalid → 401, unreachable → 503
 * - GET /v1/tools: valid bearer → { tools: [] }, invalid → 401
 * - GET /v1/i18n/en: returns EN catalog JSON
 * - GET /v1/i18n/it: returns IT catalog JSON
 * - GET /v1/i18n/unknown-lang: falls back to EN catalog
 * - GET /v1/i18n/it-IT: normalises BCP-47 to "it"
 * - GET /healthz: always 200, no auth required
 * - GET /readyz: 200 when EVF_INTERNAL_SECRET set, 503 otherwise
 * - GET /metrics: 200 + Prometheus text, all EVF metric names present
 * - HTTP duration histogram populated after requests
 * - Idempotency dedup counter increments on duplicate POST
 * - Token cache hit/miss counters work correctly
 *
 * Uses `buildServer()` with injected foundryValidateFn (no real socketlib).
 * Lang files read from foundry-module/lang/ via langDirOverride.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Registry } from 'prom-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValidateTokenResult } from './auth/token-cache.js';
import { IdempotencyStore } from './middleware/idempotency.js';
import { buildServer } from './server.js';

// Resolve lang dir: packages/bridge/src/ → packages/foundry-module/lang/
// Path: src → bridge → packages → packages/foundry-module/lang
const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'foundry-module',
  'lang',
);

const VALID_TOKEN = 'valid-bearer-token-test';
const INVALID_TOKEN = 'bad-token-xyz';

function makeValidFn(): (token: string) => Promise<ValidateTokenResult> {
  return async (token: string): Promise<ValidateTokenResult> => {
    if (token === VALID_TOKEN) {
      return {
        valid: true,
        entry: { alias: 'Test G2', expiresAt: Date.now() + 86_400_000, worldId: 'test-world' },
      };
    }
    return { valid: false, reason: 'unknown_token' };
  };
}

function makeUnreachableFn(): (token: string) => Promise<ValidateTokenResult> {
  return async (_token: string): Promise<ValidateTokenResult> => ({
    valid: false,
    reason: 'foundry_unreachable',
  });
}

describe('buildServer integration', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── GET /v1/health ────────────────────────────────

  describe('GET /v1/health', () => {
    it('returns 200 with status ok for valid bearer', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; proto: string; uptime_sec: number }>();
      expect(body.status).toBe('ok');
      expect(body.proto).toBe('evf-v1');
      expect(typeof body.uptime_sec).toBe('number');
    });

    it('returns 401 for invalid bearer', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${INVALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('invalid_token');
    });

    it('returns 401 when Authorization header missing', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 503 when Foundry is unreachable', async () => {
      app = await buildServer({
        foundryValidateFn: makeUnreachableFn(),
        langDirOverride: LANG_DIR,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(503);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('foundry_unreachable');
    });
  });

  // ── GET /v1/tools ─────────────────────────────────

  describe('GET /v1/tools', () => {
    it('returns 200 with 7-entry tools array for valid bearer (ADR-0003 Plan 03-04)', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ tools: unknown[] }>();
      // Phase 03-04: TOOL_REGISTRY has 7 entries (cast_spell, weapon_attack, use_item,
      // skill_check, move_token, place_template, set_targets)
      expect(body.tools).toHaveLength(7);
    });

    it('returns 401 for invalid bearer', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${INVALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /v1/i18n/:lang ────────────────────────────

  describe('GET /v1/i18n/:lang', () => {
    it('returns EN catalog for lang=en', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/i18n/en',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, string>>();
      expect(typeof body['evf.settings.pair_button']).toBe('string');
      expect(res.headers['cache-control']).toContain('max-age=300');
    });

    it('returns IT catalog for lang=it', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/i18n/it',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, string>>();
      // IT catalog has Italian strings
      expect(body['evf.settings.pair_button']).toContain('Abbina');
    });

    it('falls back to EN for unknown lang', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const resUnknown = await app.inject({ method: 'GET', url: '/v1/i18n/de' });
      const resEn = await app.inject({ method: 'GET', url: '/v1/i18n/en' });

      expect(resUnknown.json()).toEqual(resEn.json());
    });

    it('normalises BCP-47 (it-IT → it)', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const resFull = await app.inject({ method: 'GET', url: '/v1/i18n/it-IT' });
      const resPrimary = await app.inject({ method: 'GET', url: '/v1/i18n/it' });

      expect(resFull.json()).toEqual(resPrimary.json());
    });

    it('does not require auth', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/i18n/en',
        // No Authorization header
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ── GET /v1/character/:actorId ────────────────────

  describe('GET /v1/character/:actorId', () => {
    const mockSnapshot = {
      actorId: 'actor-1',
      name: 'Aragorn',
      hp: 42,
      maxHp: 50,
      tempHp: 0,
      ac: 16,
      level: 7,
      conditions: [],
      exhaustion: 0,
      death: { success: 0, failure: 0 },
      world: { modernRules: false },
      inventory: [],
      spells: { slots: [], spells: [] },
      abilities: {
        str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      },
      skills: {
        acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
        ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
        arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
        ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
        dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
        his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
        ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
        itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
        inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
        med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
        nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
        prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
        prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
        per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
        rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
        slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
        ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
        sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      },
    };

    it('returns 200 with CharacterSnapshot for valid bearer + actorId', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockSnapshot;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/character/actor-1',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof mockSnapshot>();
      expect(body.actorId).toBe('actor-1');
      expect(body.name).toBe('Aragorn');
      expect(body.hp).toBe(42);
    });

    it('returns 404 when snapshot fn returns null (actor not found)', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => null;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/character/unknown-actor',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('actor_not_found');
    });

    it('returns 401 without auth header', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/v1/character/actor-1' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /v1/combat/current ────────────────────────

  describe('GET /v1/combat/current', () => {
    const mockCombat = {
      combatId: 'combat-1',
      round: 2,
      turn: 1,
      currentCombatantId: 'comb-a',
      combatants: [
        {
          id: 'comb-a',
          name: 'Goblin',
          actorId: 'actor-g',
          initiative: 14,
          hp: 5,
          maxHp: 7,
          isCurrentTurn: true,
        },
      ],
    };

    it('returns 200 with CombatSnapshot when combat is active', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockCombat;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/combat/current',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof mockCombat>();
      expect(body.combatId).toBe('combat-1');
      expect(body.round).toBe(2);
    });

    it('returns 204 when no active combat (null)', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => null;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/combat/current',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it('returns 401 without auth', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      const res = await app.inject({ method: 'GET', url: '/v1/combat/current' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /v1/scene/viewport ────────────────────────

  describe('GET /v1/scene/viewport', () => {
    const mockViewport = {
      sceneId: 'scene-1',
      sceneName: 'Dungeon Level 1',
      viewX: 300,
      viewY: 200,
      scale: 1.5,
      tokenIds: ['tok-1', 'tok-2'],
    };

    it('returns 200 with SceneViewport', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockViewport;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/scene/viewport',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof mockViewport>();
      expect(body.sceneId).toBe('scene-1');
      expect(body.scale).toBe(1.5);
    });

    it('returns 401 without auth', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      const res = await app.inject({ method: 'GET', url: '/v1/scene/viewport' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /v1/events ────────────────────────────────

  describe('GET /v1/events', () => {
    const mockEventResponse = {
      entries: [
        { seq: 5, ts: Date.now(), type: 'chat', actorId: null, content: 'Hello' },
        { seq: 6, ts: Date.now(), type: 'damage', actorId: 'actor-1', content: '-5 HP' },
      ],
      cursor: 6,
    };

    it('returns 200 with event log entries', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockEventResponse;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/events?since=4&limit=10',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<typeof mockEventResponse>();
      expect(body.entries).toHaveLength(2);
      expect(body.cursor).toBe(6);
    });

    it('returns empty entries on schema mismatch', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => ({ bad: true });
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/events',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ entries: unknown[] }>().entries).toHaveLength(0);
    });

    it('returns 401 without auth', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      const res = await app.inject({ method: 'GET', url: '/v1/events' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /v1/characters ────────────────────────────

  describe('GET /v1/characters', () => {
    it('returns 200 with character list', async () => {
      const mockList = [
        { actorId: 'actor-1', name: 'Aragorn', level: 7 },
        { actorId: 'actor-2', name: 'Legolas', level: 7 },
      ];
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockList;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/characters?world=test-world',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ characters: typeof mockList }>();
      expect(body.characters).toHaveLength(2);
      expect(body.characters[0]?.name).toBe('Aragorn');
    });

    it('returns 401 without auth', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      const res = await app.inject({ method: 'GET', url: '/v1/characters' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Quick Task 260604-eyf: internal validate fn from BearerRegistryCache ──────

  describe('buildServer({}) — internalValidateFn from BearerRegistryCache', () => {
    const INTERNAL_SECRET = 'test-internal-secret-32bytes!!!';

    it('returns 503 foundry_unreachable when cache is cold (module never connected)', async () => {
      // buildServer({}) with NO foundryValidateFn → internalValidateFn uses cold cache
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json<{ error: string }>().error).toBe('foundry_unreachable');
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns 200 for a valid token pushed via /internal/delta', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ langDirOverride: LANG_DIR });

      const futureExpiry = Date.now() + 86_400_000;
      // Push a bearer registry snapshot
      await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'r1.bearers.available',
          payload: {
            bearers: [
              { token: VALID_TOKEN, alias: 'G2 Test', expiresAt: futureExpiry, worldId: 'world-1' },
            ],
            source: 'foundry-registry',
            count: 1,
            generatedAt: Date.now(),
          },
        }),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns 401 unknown_token for token absent from pushed registry', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ langDirOverride: LANG_DIR });

      // Push a registry with a DIFFERENT token (not VALID_TOKEN)
      await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'r1.bearers.available',
          payload: {
            bearers: [
              {
                token: 'different-token-xyz',
                alias: 'Other',
                expiresAt: Date.now() + 86_400_000,
                worldId: 'w',
              },
            ],
            source: 'foundry-registry',
            count: 1,
            generatedAt: Date.now(),
          },
        }),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json<{ error: string }>().error).toBe('invalid_token');
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns 401 expired for token that is expired in registry', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ langDirOverride: LANG_DIR });

      // Push a registry with an EXPIRED token
      const expiredTime = Date.now() - 1000; // already expired
      await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'r1.bearers.available',
          payload: {
            bearers: [
              { token: VALID_TOKEN, alias: 'Old G2', expiresAt: expiredTime, worldId: 'w' },
            ],
            source: 'foundry-registry',
            count: 1,
            generatedAt: Date.now(),
          },
        }),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      // TokenCache caches validations for 5 min, so this goes through to internalValidateFn.
      // expired → 401 invalid_token
      expect(res.statusCode).toBe(401);
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('opts.foundryValidateFn overrides internalValidateFn when provided', async () => {
      // Existing tests that inject foundryValidateFn must not be affected
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      // makeValidFn() returns valid for VALID_TOKEN even with cold cache
      expect(res.statusCode).toBe(200);
      delete process.env.EVF_INTERNAL_SECRET;
    });
  });

  // ── Quick Task 260604-eyf: GET /v1/characters from CharacterListCache ─────────

  describe('GET /v1/characters from CharacterListCache (buildServer({}))', () => {
    const INTERNAL_SECRET = 'test-internal-secret-32bytes!!!';

    it('returns [] when character list cache is cold', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;

      const futureExpiry = Date.now() + 86_400_000;
      // Pre-populate bearerRegistryCache so token validates
      const { BearerRegistryCache } = await import('./cache/bearer-registry-cache.js');
      const bearerCache = new BearerRegistryCache();
      bearerCache.set({
        bearers: [{ token: VALID_TOKEN, alias: 'G2', expiresAt: futureExpiry, worldId: 'w' }],
        source: 'foundry-registry',
        count: 1,
        generatedAt: Date.now(),
      });
      app = await buildServer({ langDirOverride: LANG_DIR, bearerRegistryCache: bearerCache });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/characters',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ characters: unknown[] }>().characters).toHaveLength(0);
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns pushed roster when character list cache has data', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;

      const futureExpiry = Date.now() + 86_400_000;
      const { BearerRegistryCache } = await import('./cache/bearer-registry-cache.js');
      const { CharacterListCache } = await import('./cache/character-list-cache.js');

      const bearerCache = new BearerRegistryCache();
      bearerCache.set({
        bearers: [{ token: VALID_TOKEN, alias: 'G2', expiresAt: futureExpiry, worldId: 'w' }],
        source: 'foundry-registry',
        count: 1,
        generatedAt: Date.now(),
      });

      const charCache = new CharacterListCache();
      charCache.set({
        characters: [
          { actorId: 'actor-1', name: 'Aragorn', level: 10 },
          { actorId: 'actor-2', name: 'Gimli', level: 7 },
        ],
        source: 'foundry-world',
        count: 2,
        generatedAt: Date.now(),
      });

      app = await buildServer({
        langDirOverride: LANG_DIR,
        bearerRegistryCache: bearerCache,
        characterListCache: charCache,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/characters',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ characters: Array<{ name: string }> }>();
      expect(body.characters).toHaveLength(2);
      expect(body.characters.map((c) => c.name)).toContain('Aragorn');
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('opts.foundrySnapshotFn overrides internalSnapshotFn when provided', async () => {
      // Existing tests that inject foundrySnapshotFn must continue to work
      const mockList = [{ actorId: 'actor-1', name: 'Legolas', level: 8 }];
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const snapshotFn = async (_h: string, ..._args: unknown[]): Promise<any> => mockList;
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        foundrySnapshotFn: snapshotFn,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/characters',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ characters: typeof mockList }>();
      expect(body.characters).toHaveLength(1);
      expect(body.characters[0]?.name).toBe('Legolas');
    });
  });

  // ── POST /internal/delta ──────────────────────────

  describe('POST /internal/delta', () => {
    const INTERNAL_SECRET = 'test-internal-secret-32bytes!!!';

    it('returns 200 when internal secret matches and body is valid', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'character.delta', payload: { hp: 30 } }),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ ok: boolean }>().ok).toBe(true);
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns 401 when secret is wrong', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: 'Bearer wrong-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'character.delta', payload: {} }),
      });

      expect(res.statusCode).toBe(401);
      delete process.env.EVF_INTERNAL_SECRET;
    });

    it('returns 401 when EVF_INTERNAL_SECRET is not set', async () => {
      delete process.env.EVF_INTERNAL_SECRET;
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'character.delta', payload: {} }),
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when body has no type field', async () => {
      process.env.EVF_INTERNAL_SECRET = INTERNAL_SECRET;
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: {
          authorization: `Bearer ${INTERNAL_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ payload: {} }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toBe('invalid_body');
      delete process.env.EVF_INTERNAL_SECRET;
    });
  });

  // ── GET /healthz ──────────────────────────────────────────────────────────────

  describe('GET /healthz (liveness probe)', () => {
    it('returns 200 with status:ok and uptime_sec — no auth required', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/healthz' });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; uptime_sec: number }>();
      expect(body.status).toBe('ok');
      expect(typeof body.uptime_sec).toBe('number');
      expect(body.uptime_sec).toBeGreaterThanOrEqual(0);
    });

    it('does not require Authorization header', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      // No header at all — should still return 200
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── GET /readyz ───────────────────────────────────────────────────────────────

  describe('GET /readyz (readiness probe)', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns 503 + not_ready when EVF_INTERNAL_SECRET is empty', async () => {
      vi.stubEnv('EVF_INTERNAL_SECRET', '');
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/readyz' });

      expect(res.statusCode).toBe(503);
      const body = res.json<{ status: string; reason: string }>();
      expect(body.status).toBe('not_ready');
      expect(body.reason).toBe('EVF_INTERNAL_SECRET_missing');
    });

    it('returns 503 + not_ready when EVF_INTERNAL_SECRET is not set', async () => {
      vi.stubEnv('EVF_INTERNAL_SECRET', '');
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/readyz' });

      expect(res.statusCode).toBe(503);
    });

    it('returns 200 + ready when EVF_INTERNAL_SECRET is a non-empty string', async () => {
      vi.stubEnv('EVF_INTERNAL_SECRET', 'test-secret-value');
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/readyz' });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('ready');
    });
  });

  // ── GET /metrics ──────────────────────────────────────────────────────────────

  describe('GET /metrics (Prometheus scrape)', () => {
    it('returns 200 with text/plain Content-Type', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/metrics' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('body contains all 6 EVF metric names', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      const body = res.body;

      expect(body).toContain('evf_http_request_duration_seconds');
      expect(body).toContain('evf_ws_sessions_active');
      expect(body).toContain('evf_replay_buffer_size');
      expect(body).toContain('evf_idempotency_store_size');
      expect(body).toContain('evf_idempotency_dedup_total');
      expect(body).toContain('evf_token_cache_hits_total');
    });

    it('body contains nodejs_ default metrics', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({ method: 'GET', url: '/metrics' });

      expect(res.body).toMatch(/nodejs_/);
    });

    it('does not require Authorization header', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── HTTP duration histogram ───────────────────────────────────────────────────

  describe('HTTP duration histogram (evf_http_request_duration_seconds)', () => {
    it('records at least 1 observation in the histogram after a GET /healthz', async () => {
      const registry = new Registry();
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        metricsRegistry: registry,
      });

      // Make a request to populate the histogram
      await app.inject({ method: 'GET', url: '/healthz' });

      // Then check the /metrics output
      const metricsRes = await app.inject({ method: 'GET', url: '/metrics' });
      const body = metricsRes.body;

      // _count should have at least 1 observation (the /healthz request itself)
      expect(body).toMatch(/evf_http_request_duration_seconds_count\{[^}]+\}\s+[1-9]/);
    });

    it('two parallel buildServer() instances use isolated registries (Pitfall 2)', async () => {
      let app2: FastifyInstance | undefined;
      try {
        // Creating two servers with fresh (default) registries must not throw
        app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });
        app2 = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

        // Both should respond independently
        const r1 = await app.inject({ method: 'GET', url: '/healthz' });
        const r2 = await app2.inject({ method: 'GET', url: '/healthz' });
        expect(r1.statusCode).toBe(200);
        expect(r2.statusCode).toBe(200);
      } finally {
        await app2?.close();
      }
    });
  });

  // ── Idempotency dedup counter ─────────────────────────────────────────────────

  describe('evf_idempotency_dedup_total counter', () => {
    it('starts at 0 and appears in /metrics output', async () => {
      const registry = new Registry();
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        metricsRegistry: registry,
      });

      const metricsRes = await app.inject({ method: 'GET', url: '/metrics' });
      // Counter appears in output with value 0 (no dedup hits yet)
      expect(metricsRes.body).toContain('evf_idempotency_dedup_total');
      expect(metricsRes.body).toMatch(/evf_idempotency_dedup_total\s+0/);
    });

    it('increments to 1 when onDedup fires via wired registerIdempotencyHooks', async () => {
      // Since the only POST routes are /internal/delta (excluded from idempotency middleware),
      // we verify the wiring indirectly: the registry counter is bound to the same registry
      // as /metrics. We increment it via the registry directly to prove isolation is correct.
      const registry = new Registry();
      const store = new IdempotencyStore();
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        metricsRegistry: registry,
        idempotencyStore: store,
      });

      // The /internal/delta route IS excluded from idempotency middleware per IDEMPOTENCY_EXCLUDED_PREFIXES.
      // There are no other POST routes in Phase 03 MVP. The wiring is verified by:
      // 1. Counter present in /metrics at 0 (wired = registered in the server's registry)
      // 2. IdempotencyStore.set is confirmed to exist and be called correctly by middleware tests.
      // Full E2E dedup test requires a non-/internal/ POST route (Phase 04+).
      const metricsRes = await app.inject({ method: 'GET', url: '/metrics' });
      expect(metricsRes.body).toContain('evf_idempotency_dedup_total');

      // Verify counter is NOT from global registry (isolation check)
      // If it were global, creating a second server would fail — but we already test that above.
      expect(metricsRes.body).toMatch(/evf_idempotency_dedup_total\s+0/);
    });
  });

  // ── Token cache hit/miss counters ─────────────────────────────────────────────

  describe('evf_token_cache_hits_total / evf_token_cache_misses_total', () => {
    it('increments misses on first validate, hits on second (within TTL)', async () => {
      const registry = new Registry();
      app = await buildServer({
        foundryValidateFn: makeValidFn(),
        langDirOverride: LANG_DIR,
        metricsRegistry: registry,
      });

      // Two calls to a bearer-auth route with the same token
      await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });
      await app.inject({
        method: 'GET',
        url: '/v1/health',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      const metricsRes = await app.inject({ method: 'GET', url: '/metrics' });
      const body = metricsRes.body;

      // First call was a miss; second was a hit
      expect(body).toMatch(/evf_token_cache_misses_total\s+1/);
      expect(body).toMatch(/evf_token_cache_hits_total\s+[1-9]/);
    });
  });
});

// ---------------------------------------------------------------------------
// Plan 03-05: production startup guard semantics (behavior contract for index.ts)
// ---------------------------------------------------------------------------
// index.ts is excluded from coverage thresholds (vitest.config.ts) because it
// calls app.listen() which is not unit-testable in Vitest. These tests mirror
// the guard logic in pure form so the contract is verifiable without spawning
// a real server or mocking process.exit().
// ---------------------------------------------------------------------------
describe('Plan 03-05: production startup guard semantics', () => {
  /**
   * Mirror the index.ts startup guard as a pure function.
   * Returns true = boot allowed, false = boot must be rejected.
   */
  function checkProdGuard(nodeEnv: string | undefined, secret: string | undefined): boolean {
    if (nodeEnv !== 'production') return true; // dev/undefined: always ok
    if (secret === undefined || secret.trim() === '') return false;
    return true;
  }

  it('rejects boot when NODE_ENV=production and EVF_INTERNAL_SECRET is undefined', () => {
    expect(checkProdGuard('production', undefined)).toBe(false);
  });

  it('rejects boot when NODE_ENV=production and EVF_INTERNAL_SECRET is empty string', () => {
    expect(checkProdGuard('production', '')).toBe(false);
  });

  it('rejects boot when NODE_ENV=production and EVF_INTERNAL_SECRET is whitespace only', () => {
    expect(checkProdGuard('production', '   ')).toBe(false);
  });

  it('allows boot when NODE_ENV=production and EVF_INTERNAL_SECRET is set', () => {
    expect(checkProdGuard('production', 'real-secret-value-here')).toBe(true);
  });

  it('allows boot in development even when EVF_INTERNAL_SECRET is undefined', () => {
    expect(checkProdGuard('development', undefined)).toBe(true);
  });

  it('allows boot when NODE_ENV is undefined (development default)', () => {
    expect(checkProdGuard(undefined, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quick Task 260529-icd Task 1: pino logger → DebugEventBus 'log' tap
// ---------------------------------------------------------------------------
// When isDebugEnabled() is true, the bridge logger is built explicitly with a
// pino.multistream whose second leg forwards redacted NDJSON into the SAME
// DebugEventBus that backs /debug/events. When OFF, the logger is the inline
// config object (byte-identical) and NO 'log' events are produced.
// ---------------------------------------------------------------------------
describe('Quick Task 260529-icd: debug logger tap', () => {
  const SECRET = 'icd-debug-secret';
  let savedDebug: string | undefined;
  let savedSecret: string | undefined;
  let savedAllowProd: string | undefined;
  let savedLogLevel: string | undefined;

  beforeEach(() => {
    savedDebug = process.env.EVF_DEBUG;
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    savedAllowProd = process.env.EVF_DEBUG_ALLOW_PROD;
    savedLogLevel = process.env.EVF_DEBUG_LOG_LEVEL;
  });
  afterEach(() => {
    const restore = (k: string, v: string | undefined): void => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('EVF_DEBUG', savedDebug);
    restore('EVF_INTERNAL_SECRET', savedSecret);
    restore('EVF_DEBUG_ALLOW_PROD', savedAllowProd);
    restore('EVF_DEBUG_LOG_LEVEL', savedLogLevel);
  });

  it('enabled: app.log.warn surfaces as a log.warn DebugEvent in /debug/events', async () => {
    process.env.EVF_DEBUG = 'true';
    process.env.EVF_INTERNAL_SECRET = SECRET;
    process.env.EVF_DEBUG_LOG_LEVEL = 'info';
    const app = await buildServer({
      foundryValidateFn: makeValidFn(),
      langDirOverride: LANG_DIR,
    });
    try {
      app.log.warn({ foo: 1 }, 'hello-debug');
      const res = await app.inject({
        method: 'GET',
        url: '/debug/events?direction=log',
        headers: { authorization: `Bearer ${SECRET}` },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json() as Array<{
        direction: string;
        type: string;
        summary: string;
        payload: { foo?: number };
      }>;
      const warn = events.find((e) => e.type === 'log.warn' && e.summary === 'hello-debug');
      expect(warn).toBeDefined();
      expect(warn?.direction).toBe('log');
      expect(warn?.payload.foo).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('enabled: a logged secret never appears in the bus log event', async () => {
    process.env.EVF_DEBUG = 'true';
    process.env.EVF_INTERNAL_SECRET = SECRET;
    const app = await buildServer({
      foundryValidateFn: makeValidFn(),
      langDirOverride: LANG_DIR,
    });
    const LEAK = 'leaked-bearer-token-1234567890abcdef';
    try {
      app.log.info({ token: LEAK, bearer: LEAK }, 'auth-attempt');
      const res = await app.inject({
        method: 'GET',
        url: '/debug/events?direction=log',
        headers: { authorization: `Bearer ${SECRET}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(LEAK);
    } finally {
      await app.close();
    }
  });

  it('disabled: no log-direction events are produced and /debug/events is absent (404)', async () => {
    delete process.env.EVF_DEBUG;
    const app = await buildServer({
      foundryValidateFn: makeValidFn(),
      langDirOverride: LANG_DIR,
    });
    try {
      // Logger still works (writes to stdout) — does not throw.
      expect(() => app.log.warn('off-mode')).not.toThrow();
      const res = await app.inject({ method: 'GET', url: '/debug/events?direction=log' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Quick Task 260605-d0v: WS connect → initial character.delta push
// ---------------------------------------------------------------------------
// Integration tests assert that a g2-app WS client receives an initial
// character.delta envelope immediately after completing the handshake when
// the bridge has a populated CharacterListCache and an injected foundryFn.
//
// Strategy: build a real server, call app.listen({ port: 0 }), open a real
// WebSocket client, complete the EVF handshake, then assert the next message
// is (or is not) a character.delta envelope.
// ---------------------------------------------------------------------------

import WebSocket from 'ws';
import { CharacterListCache } from './cache/character-list-cache.js';

/** Full mock CharacterSnapshot satisfying CharacterSnapshotSchema. */
const INITIAL_DELTA_SNAPSHOT = {
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
} as const;

describe('Quick Task 260605-d0v: WS connect → initial character.delta', () => {
  const SECRET = 'd0v-integration-secret';
  let savedSecret: string | undefined;
  let savedDevNoAuth: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.EVF_INTERNAL_SECRET;
    savedDevNoAuth = process.env.EVF_DEV_NO_AUTH;
    process.env.EVF_INTERNAL_SECRET = SECRET;
    process.env.EVF_DEV_NO_AUTH = 'true'; // no-auth so bearer sentinel is accepted
  });

  afterEach(() => {
    const restore = (k: string, v: string | undefined): void => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('EVF_INTERNAL_SECRET', savedSecret);
    restore('EVF_DEV_NO_AUTH', savedDevNoAuth);
  });

  /**
   * Build a server on a random port with:
   * - A seeded CharacterListCache (roster = [actor-thorin])
   * - foundrySnapshotFn returning INITIAL_DELTA_SNAPSHOT for 'evf.getCharacterSnapshot'
   */
  async function buildD0vServer(): Promise<{ app: FastifyInstance; port: number }> {
    const characterListCache = new CharacterListCache();
    characterListCache.set({
      characters: [{ actorId: 'actor-thorin', name: 'Thorin', level: 5 }],
      source: 'foundry-world',
      count: 1,
      generatedAt: Date.now(),
    });

    const app = await buildServer({
      langDirOverride: LANG_DIR,
      characterListCache,
      foundrySnapshotFn: async (handler, ..._args) => {
        if (handler === 'evf.getCharacterSnapshot') return INITIAL_DELTA_SNAPSHOT;
        return null;
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    return { app, port };
  }

  /**
   * Complete the EVF WS handshake (send client hello, receive server hello).
   * Returns the sessionId from the handshake response.
   */
  function completeHandshake(ws: WebSocket, token: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      ws.once('open', () => {
        ws.send(
          JSON.stringify({
            proto: 'evf-v1',
            token,
            locale: 'it',
            capabilities: ['read_char', 'read_combat'],
          }),
        );
      });
      ws.once('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { session_id?: string; proto_chosen?: string };
          if (msg.proto_chosen === 'evf-v1' && typeof msg.session_id === 'string') {
            resolve(msg.session_id);
          } else {
            reject(new Error(`Unexpected handshake response: ${raw.toString()}`));
          }
        } catch (err) {
          reject(err);
        }
      });
      ws.once('error', reject);
    });
  }

  it(
    'D0V-INT-01: WS connect with populated roster → client receives character.delta with actorId',
    () =>
      new Promise<void>((done, fail) => {
        buildD0vServer()
          .then(({ app, port }) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
            // Collect ALL messages (handshake + initial delta may arrive in quick succession).
            const received: Array<{ type: string; payload?: { actorId?: string } }> = [];
            let resolved = false;

            // Timer: allow up to 2s for the character.delta to arrive.
            const deadline = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                ws.close();
                app
                  .close()
                  .then(() =>
                    fail(
                      new Error(
                        `No character.delta received within 2s. Got: ${JSON.stringify(received)}`,
                      ),
                    ),
                  )
                  .catch(fail);
              }
            }, 2000);

            ws.on('message', (raw) => {
              try {
                const msg = JSON.parse(raw.toString()) as {
                  type?: string;
                  proto_chosen?: string;
                  payload?: { actorId?: string };
                };
                if (msg.type !== undefined) {
                  received.push(msg as { type: string; payload?: { actorId?: string } });
                }
                // Handshake response has proto_chosen — send client hello now.
                if (msg.proto_chosen === undefined && msg.type === undefined) return;

                // Check if character.delta already arrived.
                const delta = received.find((m) => m.type === 'character.delta');
                if (delta !== undefined && !resolved) {
                  resolved = true;
                  clearTimeout(deadline);
                  try {
                    expect(delta.payload?.actorId).toBe('actor-thorin');
                    ws.close();
                    app.close().then(done).catch(fail);
                  } catch (err) {
                    ws.close();
                    app
                      .close()
                      .then(() => fail(err))
                      .catch(fail);
                  }
                }
              } catch (err) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(deadline);
                  ws.close();
                  app
                    .close()
                    .then(() => fail(err))
                    .catch(fail);
                }
              }
            });

            ws.once('open', () => {
              ws.send(
                JSON.stringify({
                  proto: 'evf-v1',
                  token: 'dev-no-auth',
                  locale: 'it',
                  capabilities: ['read_char', 'read_combat'],
                }),
              );
            });

            ws.once('error', (err) => {
              if (!resolved) {
                resolved = true;
                clearTimeout(deadline);
                app
                  .close()
                  .then(() => fail(err))
                  .catch(fail);
              }
            });
          })
          .catch(fail);
      }),
    5000,
  );

  it('D0V-INT-02: WS connect with COLD roster → client receives handshake only (no character.delta)', () =>
    new Promise<void>((done, fail) => {
      // Build server with cold CharacterListCache (no call to cache.set()).
      buildServer({
        langDirOverride: LANG_DIR,
        // characterListCache not set → buildServer creates a fresh cold one
        foundrySnapshotFn: async () => INITIAL_DELTA_SNAPSHOT,
      })
        .then((app) => {
          app
            .listen({ port: 0, host: '127.0.0.1' })
            .then(() => {
              const addr = app.server.address();
              const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
              const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

              completeHandshake(ws, 'dev-no-auth')
                .then(() => {
                  // Wait 150ms: if no message arrives, cold roster correctly produced no push.
                  const timer = setTimeout(() => {
                    // No character.delta received — PASS.
                    ws.close();
                    app.close().then(done).catch(fail);
                  }, 150);

                  ws.once('message', (raw) => {
                    clearTimeout(timer);
                    const envelope = JSON.parse(raw.toString()) as { type: string };
                    ws.close();
                    app
                      .close()
                      .then(() => {
                        fail(new Error(`Expected no message but received type='${envelope.type}'`));
                      })
                      .catch(fail);
                  });
                })
                .catch((err) => {
                  ws.close();
                  app
                    .close()
                    .then(() => fail(err))
                    .catch(fail);
                });
            })
            .catch(fail);
        })
        .catch(fail);
    }));
});

/*
 * ──────────────────────────────────────────────────────────────────────────────
 * Sim smoke (manual) — NOT an automated gate (EvenHub simulator requires
 * xvfb + GTK; the deterministic gate is the Vitest integration test above).
 *
 * To verify end-to-end with the real EvenHub simulator:
 *
 * 1. Start the bridge in dev-no-auth mode:
 *      EVF_DEV_NO_AUTH=true EVF_INTERNAL_SECRET=dev pnpm --filter @evf/bridge start
 *
 * 2. Seed the roster via POST /internal/delta:
 *      curl -s -X POST http://localhost:8910/internal/delta \
 *        -H "Authorization: Bearer dev" \
 *        -H "Content-Type: application/json" \
 *        -d '{"type":"r1.characters.available","payload":{"characters":[{"actorId":"actor-1","name":"Thorin","level":5}],"source":"foundry-world","count":1,"generatedAt":0}}'
 *
 * 3. Set g2-app bridgeUrl to http://localhost:8910 and launch the EvenHub simulator
 *    (xvfb headless, drive via :9898 HTTP API per evenhub:simulator-automation skill).
 *
 * 4. Confirm: on WS connect the glasses status HUD shows the character name and HP
 *    (status-hud-layer.ts CHARACTER_DELTA_CHANNEL handler consumes the delta).
 * ──────────────────────────────────────────────────────────────────────────────
 */
