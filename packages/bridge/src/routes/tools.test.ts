/**
 * Tests for GET /v1/tools and POST /v1/tools/:name routes.
 *
 * Covers:
 * 1.  GET /v1/tools with valid bearer returns 200 + { tools: [...] } with 7 entries.
 * 2.  GET /v1/tools body — each entry has name, description, inputSchema; type:'object'.
 * 3.  GET /v1/tools without bearer returns 401.
 * 4.  POST /v1/tools/cast_spell with valid bearer + valid body returns 200 + phase-07-pending envelope.
 * 5.  POST /v1/tools/cast_spell with Idempotency-Key header echoes key in response.
 * 6.  POST /v1/tools/cast_spell with INVALID body (missing actor_id) returns 400 + invalid_body.
 * 7.  POST /v1/tools/unknown_tool returns 404 + { error:'unknown_tool', tool:'unknown_tool' }.
 * 8.  POST /v1/tools/cast_spell without bearer returns 401.
 * 9.  POST with same Idempotency-Key + same body twice → both return identical body; spy fires once.
 * 10. POST with same Idempotency-Key + DIFFERENT body returns 422 on the second call.
 * 11. All 7 tool names succeed via POST with minimal valid bodies (parametric test).
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ValidateTokenResult } from '../auth/token-cache.js';
import { IdempotencyStore } from '../middleware/idempotency.js';
import { buildServer } from '../server.js';
import type { ToolDispatchResult } from './tools-dispatch.js';

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

/** Minimal valid bodies for each tool. */
const MINIMAL_BODIES: Record<string, unknown> = {
  cast_spell: { actor_id: 'a1', spell_id: 's1', slot_level: 1, targets: [] },
  weapon_attack: { actor_id: 'a1', item_id: 'i1', targets: [] },
  use_item: { actor_id: 'a1', item_id: 'i1', targets: [] },
  skill_check: { actor_id: 'a1', skill: 'perception' },
  move_token: { token_id: 't1', x: 5, y: 10 },
  place_template: { actor_id: 'a1', item_id: 'i1', x: 100, y: 200 },
  set_targets: { token_ids: [] },
};

describe('GET /v1/tools', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 + 7-entry tools array for valid bearer', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/tools',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ tools: unknown[] }>();
    expect(body.tools).toHaveLength(7);
  });

  it('each entry has name, description, inputSchema with type:object', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/tools',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    const body = res.json<{ tools: Array<Record<string, unknown>> }>();
    for (const entry of body.tools) {
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(entry.inputSchema).toBeDefined();
      const schema = entry.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe('object');
    }
  });

  it('returns 401 for invalid bearer', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/tools',
      headers: { authorization: `Bearer ${INVALID_TOKEN}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when Authorization header missing', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/tools',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /v1/tools/:name', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 + phase-07-pending envelope for valid cast_spell body', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(MINIMAL_BODIES.cast_spell),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ToolDispatchResult>();
    expect(body.status).toBe('phase-07-pending');
    expect(body.tool).toBe('cast_spell');
    expect(body.idempotency_key).toBeNull();
    expect(typeof body.accepted_at).toBe('number');
  });

  it('echoes Idempotency-Key in response when header is present', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
        'idempotency-key': 'test-key-1',
      },
      body: JSON.stringify(MINIMAL_BODIES.cast_spell),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ToolDispatchResult>();
    expect(body.idempotency_key).toBe('test-key-1');
  });

  it('returns 400 + invalid_body for missing required field (no actor_id)', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ spell_id: 's1', slot_level: 1, targets: [] }),
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string; details: unknown[] }>();
    expect(body.error).toBe('invalid_body');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown tool name', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/unknown_tool',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string; tool: string }>();
    expect(body.error).toBe('unknown_tool');
    expect(body.tool).toBe('unknown_tool');
  });

  it('returns 401 without bearer token', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(MINIMAL_BODIES.cast_spell),
    });

    expect(res.statusCode).toBe(401);
  });

  it('idempotency dedup: same key + same body → handler fires once; responses identical', async () => {
    const spy = vi.fn().mockResolvedValue({
      status: 'phase-07-pending' as const,
      tool: 'cast_spell' as const,
      idempotency_key: 'k-dedup',
      accepted_at: 12345,
    });

    const store = new IdempotencyStore();
    app = await buildServer({
      foundryValidateFn: makeValidFn(),
      idempotencyStore: store,
      toolDispatchOverride: { cast_spell: spy },
    });

    const payload = JSON.stringify(MINIMAL_BODIES.cast_spell);
    const headers = {
      authorization: `Bearer ${VALID_TOKEN}`,
      'content-type': 'application/json',
      'idempotency-key': 'k-dedup',
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers,
      body: payload,
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers,
      body: payload,
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    // Bodies must be byte-identical (idempotency replay)
    expect(res1.body).toBe(res2.body);
    // Spy fired exactly once — the second call was served from cache
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('idempotency conflict: same key + different body returns 422 on second call', async () => {
    const store = new IdempotencyStore();
    app = await buildServer({
      foundryValidateFn: makeValidFn(),
      idempotencyStore: store,
    });

    const key = 'conflict-key-42';
    const headers = {
      authorization: `Bearer ${VALID_TOKEN}`,
      'content-type': 'application/json',
      'idempotency-key': key,
    };

    // First call: body A
    await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers,
      body: JSON.stringify(MINIMAL_BODIES.cast_spell),
    });

    // Second call: body B (different slot_level)
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/tools/cast_spell',
      headers,
      body: JSON.stringify({ actor_id: 'a1', spell_id: 's1', slot_level: 9, targets: [] }),
    });

    expect(res2.statusCode).toBe(422);
    const body2 = res2.json<{ error: string }>();
    expect(body2.error).toBe('idempotency_key_conflict');
  });

  it('all 7 tool names succeed with minimal valid bodies (parametric)', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn() });

    for (const [toolName, body] of Object.entries(MINIMAL_BODIES)) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/tools/${toolName}`,
        headers: {
          authorization: `Bearer ${VALID_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      expect(res.statusCode, `tool=${toolName} expected 200`).toBe(200);
      const resBody = res.json<ToolDispatchResult>();
      expect(resBody.status).toBe('phase-07-pending');
      expect(resBody.tool).toBe(toolName);
    }
  });
});
