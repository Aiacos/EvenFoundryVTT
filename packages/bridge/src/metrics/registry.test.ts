/**
 * Unit tests for createMetricsRegistry().
 *
 * Verifies:
 * 1. Factory returns all 7 named metrics + registry reference.
 * 2. Two parallel calls do NOT throw (Pitfall 2 — fresh Registry per call).
 * 3. registry.metrics() returns non-empty string with all 6 EVF metric names + a nodejs_ default.
 * 4. idempotencyDedupTotal counter increments correctly.
 * 5. wsSessionsActive gauge increments/decrements correctly.
 * 6. httpRequestDuration histogram records observations correctly.
 */

import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import { createMetricsRegistry } from './registry.js';

/** Stub accessors for tests — always return 0. */
function makeAccessors(
  overrides: Partial<{ replayBufferSize: () => number; idempotencyStoreSize: () => number }> = {},
) {
  return {
    replayBufferSize: overrides.replayBufferSize ?? (() => 0),
    idempotencyStoreSize: overrides.idempotencyStoreSize ?? (() => 0),
  };
}

describe('createMetricsRegistry', () => {
  it('returns EvfMetrics with all 7 named metrics and a registry reference', () => {
    const metrics = createMetricsRegistry(makeAccessors());

    expect(metrics.registry).toBeInstanceOf(Registry);
    expect(metrics.httpRequestDuration).toBeDefined();
    expect(metrics.wsSessionsActive).toBeDefined();
    expect(metrics.replayBufferSize).toBeDefined();
    expect(metrics.idempotencyStoreSize).toBeDefined();
    expect(metrics.idempotencyDedupTotal).toBeDefined();
    expect(metrics.tokenCacheHitsTotal).toBeDefined();
    expect(metrics.tokenCacheMissesTotal).toBeDefined();
  });

  it('two parallel createMetricsRegistry calls do NOT throw (Pitfall 2 — fresh Registry)', () => {
    expect(() => {
      const m1 = createMetricsRegistry(makeAccessors());
      const m2 = createMetricsRegistry(makeAccessors());
      // Both should be fully independent
      return [m1, m2];
    }).not.toThrow();
  });

  it('registry.metrics() returns all 6 EVF metric names and a nodejs_ default metric', async () => {
    const metrics = createMetricsRegistry(makeAccessors());
    const text = await metrics.registry.metrics();

    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);

    // All 6 EVF metric names must appear in the output
    expect(text).toContain('evf_http_request_duration_seconds');
    expect(text).toContain('evf_ws_sessions_active');
    expect(text).toContain('evf_replay_buffer_size');
    expect(text).toContain('evf_idempotency_store_size');
    expect(text).toContain('evf_idempotency_dedup_total');
    expect(text).toContain('evf_token_cache_hits_total');

    // At least one nodejs_ default metric must be present
    expect(text).toMatch(/nodejs_/);
  });

  it('idempotencyDedupTotal.inc() increments the counter to 1 in exposition text', async () => {
    const metrics = createMetricsRegistry(makeAccessors());

    metrics.idempotencyDedupTotal.inc();

    const text = await metrics.registry.metrics();
    // Counter should show value 1 (or more precisely, a line with the metric name and value)
    expect(text).toContain('evf_idempotency_dedup_total');
    // The value line should show 1
    expect(text).toMatch(/evf_idempotency_dedup_total\s+1/);
  });

  it('wsSessionsActive inc/inc/dec results in gauge value 1', async () => {
    const metrics = createMetricsRegistry(makeAccessors());

    metrics.wsSessionsActive.inc();
    metrics.wsSessionsActive.inc();
    metrics.wsSessionsActive.dec();

    const text = await metrics.registry.metrics();
    expect(text).toMatch(/evf_ws_sessions_active\s+1/);
  });

  it('httpRequestDuration.observe populates _bucket, _sum, _count', async () => {
    const metrics = createMetricsRegistry(makeAccessors());

    metrics.httpRequestDuration.observe(
      { method: 'GET', route: '/healthz', status_code: '200' },
      0.012,
    );

    const text = await metrics.registry.metrics();

    // The 0.012s observation should appear under the 0.05 bucket
    expect(text).toContain('evf_http_request_duration_seconds_bucket{');
    expect(text).toContain('le="0.05"');
    // _count should be 1
    expect(text).toMatch(/evf_http_request_duration_seconds_count\{[^}]*\}\s+1/);
    // _sum should be non-zero
    expect(text).toMatch(/evf_http_request_duration_seconds_sum\{[^}]*\}\s+0\.0/);
  });
});
