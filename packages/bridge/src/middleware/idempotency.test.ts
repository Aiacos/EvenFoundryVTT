/**
 * Tests for IdempotencyStore + registerIdempotencyHooks.
 *
 * Split into:
 * - Unit tests (1–4): IdempotencyStore in isolation (no Fastify).
 * - Integration tests (5–10): registerIdempotencyHooks wired to a real Fastify
 *   instance with a minimal `POST /test/echo` route registered after the hooks
 *   (Approach A — self-contained test helper, no dependency on Plan 03-04 routes).
 *
 * Fake timers are used to test TTL eviction without real waits.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyStore, registerIdempotencyHooks } from './idempotency.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal Fastify instance with idempotency hooks + a test echo route.
 *
 * The echo route returns the request body with status 200.
 * The spy tracks how many times the handler actually executed.
 */
async function buildTestApp(
  store: IdempotencyStore,
  opts?: { onDedup?: () => void },
): Promise<{ app: FastifyInstance; spy: ReturnType<typeof vi.fn> }> {
  const app = Fastify({ logger: false });

  // Hooks MUST be registered before routes.
  await registerIdempotencyHooks(app, store, opts);

  const spy = vi.fn();

  // Test POST route: echoes the body back.
  app.post<{ Body: unknown }>('/test/echo', async (request, _reply) => {
    spy();
    return request.body;
  });

  // Test GET route: used for non-POST passthrough test.
  app.get('/test/ping', async (_req, _reply) => {
    spy();
    return { pong: true };
  });

  // Internal delta route: excluded from idempotency.
  app.post<{ Body: unknown }>('/internal/delta', async (_request, _reply) => {
    spy();
    return { received: true };
  });

  return { app, spy };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests: IdempotencyStore
// ─────────────────────────────────────────────────────────────────────────────

describe('IdempotencyStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. get() returns undefined for an unknown key', () => {
    const store = new IdempotencyStore();
    expect(store.get('nonexistent-key')).toBeUndefined();
  });

  it('2. set() then get() within 60s returns the stored entry', () => {
    const store = new IdempotencyStore();

    store.set('k1', {
      requestBodyHash: 'abc123',
      responseStatus: 200,
      responseBody: { ok: true },
    });

    const entry = store.get('k1');
    expect(entry).toBeDefined();
    expect(entry?.requestBodyHash).toBe('abc123');
    expect(entry?.responseStatus).toBe(200);
    expect(entry?.responseBody).toEqual({ ok: true });
  });

  it('3. entry is evicted after 60s + 1ms (lazy eviction on get)', () => {
    const store = new IdempotencyStore();

    store.set('k2', {
      requestBodyHash: 'hash456',
      responseStatus: 201,
      responseBody: { created: true },
    });

    expect(store.get('k2')).toBeDefined();

    // Advance fake time past TTL.
    vi.advanceTimersByTime(60_001);

    expect(store.get('k2')).toBeUndefined();
    // Lazy eviction also removes the entry from the internal map.
    expect(store.size).toBe(0);
  });

  it('4. evicts oldest entry when store is at MAX_ENTRIES (10,000)', () => {
    const store = new IdempotencyStore();

    // Fill to exactly MAX_ENTRIES.
    for (let i = 0; i < 10_000; i++) {
      store.set(`key-${i.toString()}`, {
        requestBodyHash: `hash-${i.toString()}`,
        responseStatus: 200,
        responseBody: null,
      });
    }

    expect(store.size).toBe(10_000);

    // The first key inserted (key-0) should be the oldest.
    // Inserting a new key should evict it.
    store.set('key-new', {
      requestBodyHash: 'hash-new',
      responseStatus: 200,
      responseBody: null,
    });

    // Size remains at 10,000 (one evicted, one inserted).
    expect(store.size).toBe(10_000);

    // key-0 was the oldest and should have been evicted.
    expect(store.get('key-0')).toBeUndefined();

    // key-new should exist.
    expect(store.get('key-new')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests: registerIdempotencyHooks
// ─────────────────────────────────────────────────────────────────────────────

describe('registerIdempotencyHooks (integration)', () => {
  let app: FastifyInstance;
  let store: IdempotencyStore;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new IdempotencyStore();
  });

  afterEach(async () => {
    // Restore real timers BEFORE closing app to avoid timer-related hangs.
    vi.useRealTimers();
    await app?.close();
  });

  it('5. same key + same body: second call returns cached response; handler ran exactly once', async () => {
    ({ app, spy } = await buildTestApp(store));

    const payload = { actor_id: 'a1', spell_id: 'fireball', slot_level: 3, targets: ['t1'] };

    const res1 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': 'idem-key-001', 'content-type': 'application/json' },
      payload,
    });

    const res2 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': 'idem-key-001', 'content-type': 'application/json' },
      payload,
    });

    // Both responses must match.
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual(res1.json());

    // Handler must have fired exactly once.
    expect(spy.mock.calls.length).toBe(1);
  });

  it('6. same key + different body returns 422 idempotency_key_conflict', async () => {
    ({ app, spy } = await buildTestApp(store));

    // First request caches the response.
    const res1 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': 'conflict-key', 'content-type': 'application/json' },
      payload: { value: 'original' },
    });
    expect(res1.statusCode).toBe(200);

    // Second request with a different body → 422.
    const res2 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': 'conflict-key', 'content-type': 'application/json' },
      payload: { value: 'tampered' },
    });
    expect(res2.statusCode).toBe(422);
    const body = res2.json<{ error: string; message: string }>();
    expect(body.error).toBe('idempotency_key_conflict');
    expect(body.message).toContain(
      'Idempotency-Key was already used with a different request body',
    );

    // Handler should have run once (first request only).
    expect(spy.mock.calls.length).toBe(1);
  });

  it('7. same key + same body after 60s+ TTL: handler runs again (cache evicted)', async () => {
    // Use a custom store where we can backdate the cachedAt timestamp.
    const backdatableStore = new IdempotencyStore();
    ({ app, spy } = await buildTestApp(backdatableStore));

    const payload = { data: 'x' };
    const key = 'ttl-test-key';

    // First call — caches the response.
    const res1 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': key, 'content-type': 'application/json' },
      payload,
    });
    expect(res1.statusCode).toBe(200);
    expect(spy.mock.calls.length).toBe(1);

    // Verify the entry is currently in the store.
    expect(backdatableStore.get(key)).toBeDefined();

    // Expire the entry by backdating its cachedAt timestamp to 61s ago.
    // Access via the store's internal set: overwrite with an old cachedAt.
    const currentEntry = backdatableStore.get(key);
    expect(currentEntry).toBeDefined();
    // Use fake timers to control Date.now() for the get() TTL check.
    vi.useFakeTimers();
    // Advance time by 60_001ms to simulate TTL expiry.
    vi.advanceTimersByTime(60_001);
    // Now get() should return undefined (entry expired).
    expect(backdatableStore.get(key)).toBeUndefined();
    // Restore real timers before the inject call.
    vi.useRealTimers();

    // Second call with same key + same body — entry is expired, handler runs again.
    const res2 = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'idempotency-key': key, 'content-type': 'application/json' },
      payload,
    });
    expect(res2.statusCode).toBe(200);

    // Handler must have run twice (first call + post-TTL call).
    expect(spy.mock.calls.length).toBe(2);
  });

  it('8. missing Idempotency-Key header: handler always runs; store stays empty', async () => {
    ({ app, spy } = await buildTestApp(store));

    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/test/echo',
        headers: { 'content-type': 'application/json' },
        payload: { i },
      });
      expect(res.statusCode).toBe(200);
    }

    // Handler ran three times (no dedup without a key).
    expect(spy.mock.calls.length).toBe(3);

    // Store should have no entries (no key → no caching).
    expect(store.size).toBe(0);
  });

  it('9. POST /internal/delta with Idempotency-Key is excluded; store stays empty', async () => {
    ({ app, spy } = await buildTestApp(store));

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/delta',
        headers: { 'idempotency-key': 'delta-key', 'content-type': 'application/json' },
        payload: { seq: i },
      });
      expect(res.statusCode).toBe(200);
    }

    // Handler ran both times (excluded prefix → no dedup).
    expect(spy.mock.calls.length).toBe(2);

    // Store must remain empty.
    expect(store.size).toBe(0);
  });

  it('10. GET request with Idempotency-Key is passed through; store stays empty', async () => {
    ({ app, spy } = await buildTestApp(store));

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/test/ping',
        headers: { 'idempotency-key': 'get-key' },
      });
      expect(res.statusCode).toBe(200);
    }

    // Handler ran both times (GET → non-POST passthrough).
    expect(spy.mock.calls.length).toBe(2);

    // Store must remain empty.
    expect(store.size).toBe(0);
  });
});
