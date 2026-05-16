/**
 * Unit tests for conc-retry-cache (Plan 09-03, Task 2 — RED phase).
 *
 * Tests CRC-01..06 cover the single-attempt buffer with confirmed/unconfirmed status:
 *   - CRC-01: unconfirmed entry → consume returns null
 *   - CRC-02: confirm then consume → returns envelope ONCE (single-attempt: T-09-03)
 *   - CRC-03: TTL eviction after 30s (via vi.advanceTimersByTime)
 *   - CRC-04: clearRetryCache() empties the map
 *   - CRC-05: consumeLatestConfirmed on non-existent key → null silently
 *   - CRC-06: consumeLatestConfirmed returns most-recent confirmed entry then clears it
 *
 * @see packages/g2-app/src/panels/conc-retry-cache.ts
 * @see .planning/phases/09-action-economy-edge-cases/09-03-PLAN.md Task 2
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheRetryEnvelope,
  clearRetryCache,
  consumeLatestConfirmed,
  consumeRetryEnvelope,
  markRetryConfirmed,
} from './conc-retry-cache.js';

describe('conc-retry-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRetryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearRetryCache();
  });

  // CRC-01: unconfirmed entry → consumeRetryEnvelope returns null
  it('CRC-01: cacheRetryEnvelope with status unconfirmed → consumeRetryEnvelope returns null', () => {
    const envelope = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-1' },
    };
    cacheRetryEnvelope('idem-key-1', envelope, 'unconfirmed');

    const result = consumeRetryEnvelope('idem-key-1');
    expect(result).toBeNull();
  });

  // CRC-02: markRetryConfirmed then consumeRetryEnvelope → returns once, then null (single-attempt)
  it('CRC-02: mark confirmed then consume → returns envelope ONCE; second consume returns null (T-09-03)', () => {
    const envelope = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-2' },
    };
    cacheRetryEnvelope('idem-key-2', envelope, 'unconfirmed');
    markRetryConfirmed('idem-key-2');

    const first = consumeRetryEnvelope('idem-key-2');
    expect(first).toEqual(envelope);

    // Second consume must return null (entry deleted — single-attempt T-09-03)
    const second = consumeRetryEnvelope('idem-key-2');
    expect(second).toBeNull();
  });

  // CRC-03: TTL eviction — entry unreachable after 30s
  it('CRC-03: TTL eviction — entry not retrievable after 30s (T-09-04)', () => {
    const envelope = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-3' },
    };
    cacheRetryEnvelope('idem-key-3', envelope, 'unconfirmed');
    markRetryConfirmed('idem-key-3');

    // Advance fake timers past TTL
    vi.advanceTimersByTime(30_001);

    const result = consumeRetryEnvelope('idem-key-3');
    expect(result).toBeNull();
  });

  // CRC-04: clearRetryCache() empties the map
  it('CRC-04: clearRetryCache() clears all entries (boot teardown hook)', () => {
    const envelope = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-4' },
    };
    cacheRetryEnvelope('idem-key-4', envelope, 'unconfirmed');
    markRetryConfirmed('idem-key-4');
    clearRetryCache();

    const result = consumeRetryEnvelope('idem-key-4');
    expect(result).toBeNull();
  });

  // CRC-05: consumeRetryEnvelope on non-existent key → null (no throw)
  it('CRC-05: consumeRetryEnvelope on non-existent key returns null silently', () => {
    expect(() => consumeRetryEnvelope('does-not-exist')).not.toThrow();
    expect(consumeRetryEnvelope('does-not-exist')).toBeNull();
  });

  // CRC-06: consumeLatestConfirmed returns most-recent confirmed entry, then clears it
  it('CRC-06: consumeLatestConfirmed returns the most recent confirmed entry then clears it', () => {
    const envelope1 = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-6a' },
    };
    const envelope2 = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-6b' },
    };

    cacheRetryEnvelope('idem-key-6a', envelope1, 'unconfirmed');
    markRetryConfirmed('idem-key-6a');

    // Adding a second entry — the latest confirmed pointer updates
    cacheRetryEnvelope('idem-key-6b', envelope2, 'unconfirmed');
    markRetryConfirmed('idem-key-6b');

    const result = consumeLatestConfirmed();
    // The last confirmed is idem-key-6b
    expect(result).toEqual(envelope2);

    // Second call: no confirmed entry left
    const second = consumeLatestConfirmed();
    expect(second).toBeNull();
  });

  // Edge: markRetryConfirmed on non-existent key → no-op
  it('markRetryConfirmed on non-existent key is a no-op', () => {
    expect(() => markRetryConfirmed('no-such-key')).not.toThrow();
  });

  // Edge: cacheRetryEnvelope overwrites existing entry with same key
  it('cacheRetryEnvelope overwrites existing entry (same key)', () => {
    const original = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-x' },
    };
    const updated = {
      type: 'tool.invoke',
      payload: { toolId: 'cast-spell', idempotencyKey: 'idem-x-v2' },
    };

    cacheRetryEnvelope('idem-key-x', original, 'unconfirmed');
    markRetryConfirmed('idem-key-x');
    // Overwrite with a fresh entry (still unconfirmed)
    cacheRetryEnvelope('idem-key-x', updated, 'unconfirmed');

    // Should be unconfirmed (overwrite resets to unconfirmed)
    const result = consumeRetryEnvelope('idem-key-x');
    expect(result).toBeNull();
  });
});
