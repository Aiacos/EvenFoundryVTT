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
});
