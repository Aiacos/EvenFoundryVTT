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
 *
 * Uses `buildServer()` with injected foundryValidateFn (no real socketlib).
 * Lang files read from foundry-module/lang/ via langDirOverride.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ValidateTokenResult } from './auth/token-cache.js';
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
    it('returns 200 with empty tools array for valid bearer', async () => {
      app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tools',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ tools: unknown[] }>();
      expect(body.tools).toEqual([]);
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
});
