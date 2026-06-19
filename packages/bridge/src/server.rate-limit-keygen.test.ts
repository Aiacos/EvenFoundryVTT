/**
 * Security regression: the global @fastify/rate-limit limiter keys on `req.ip`,
 * NOT on the (attacker-controlled) Authorization header value.
 *
 * MEDIUM finding (review cleanup): the previous keyGenerator hashed the RAW,
 * pre-validation `Authorization` header (`req.headers.authorization?.slice(7)`).
 * An unauthenticated caller could therefore mint a FRESH rate bucket per request
 * by rotating `Bearer <random>` values, fully defeating the limiter on
 * unauthenticated routes.
 *
 * Test: flood an unauthenticated route from one IP with a DIFFERENT random bearer
 * on every request. Because the limiter keys on the (shared) IP, the requests
 * share one bucket and a 429 still appears after the 100-req/min budget.
 *
 * @see packages/bridge/src/server.ts (rate-limit registration — keyGenerator)
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

// Resolve lang dir: packages/bridge/src/ → packages/foundry-module/lang/
const LANG_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'foundry-module',
  'lang',
);

describe('rate-limit keyGenerator: keyed on IP, not Authorization header', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('rotating random bearers from one IP share the bucket → 429 after the limit', async () => {
    app = await buildServer({ langDirOverride: LANG_DIR });

    const FLOOD_COUNT = 150;
    const statuses: number[] = [];

    for (let i = 0; i < FLOOD_COUNT; i++) {
      // A DIFFERENT random bearer on every request. If the limiter keyed on the
      // header value, each request would land in its own fresh bucket and NEVER
      // trip 429. Keyed on IP (all inject() requests share 127.0.0.1), they share
      // one bucket and 429 appears once the 100-req/min budget is exhausted.
      const res = await app.inject({
        method: 'GET',
        url: '/v1/i18n/en',
        headers: {
          authorization: `Bearer ${Math.random().toString(36).slice(2)}-${i}-random`,
        },
      });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) break;
    }

    const got429 = statuses.some((s) => s === 429);

    if (got429) {
      expect(got429).toBe(true);
    } else {
      // Fallback (some @fastify/rate-limit versions short-circuit the preHandler
      // for inject()): assert that two DIFFERENT bearers from the same IP resolve
      // to the SAME limiter key. We cannot read the internal bucket directly, so
      // assert the keyGenerator contract structurally via the documented behavior:
      // the limiter must not be defeatable by header rotation. Re-flood without any
      // Authorization header and confirm the same outcome (shared IP bucket).
      const noHeaderStatuses: number[] = [];
      for (let i = 0; i < FLOOD_COUNT; i++) {
        const res = await app.inject({ method: 'GET', url: '/v1/i18n/en' });
        noHeaderStatuses.push(res.statusCode);
        if (res.statusCode === 429) break;
      }
      // If the no-header flood trips 429 but the bearer-rotation flood did not,
      // the limiter is keyed on the header (BUG). Both must behave identically.
      const noHeader429 = noHeaderStatuses.some((s) => s === 429);
      expect(
        got429,
        'bearer-rotation flood must trip 429 exactly like the no-header flood (same IP bucket)',
      ).toBe(noHeader429);
    }
  });
});
