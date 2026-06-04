/**
 * Unit tests for BearerRegistryCache.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * Test IDs:
 *   - BRC-BASIC-01: get() before any set() returns null (cold cache)
 *   - BRC-BASIC-02: set() overwrites the previous snapshot (last-write-wins)
 *   - BRC-BASIC-03: clear() resets the cache to null
 *
 * @see ./bearer-registry-cache.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import type { BearerRegistrySnapshot } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { BearerRegistryCache } from './bearer-registry-cache.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSnapshot(name: string): BearerRegistrySnapshot {
  return {
    bearers: [
      {
        token: `token-${name}`,
        alias: name,
        expiresAt: Date.now() + 86_400_000,
        worldId: 'world-test',
      },
    ],
    source: 'foundry-registry',
    count: 1,
    generatedAt: 1000,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BearerRegistryCache', () => {
  let cache: BearerRegistryCache;

  beforeEach(() => {
    cache = new BearerRegistryCache();
  });

  it('BRC-BASIC-01: get() before any set() returns null (cold cache)', () => {
    expect(cache.get()).toBeNull();
  });

  it('BRC-BASIC-02: set() overwrites previous snapshot (last-write-wins)', () => {
    const first = makeSnapshot('first');
    const second = makeSnapshot('second');
    cache.set(first);
    expect(cache.get()).toBe(first);
    cache.set(second);
    expect(cache.get()).toBe(second);
  });

  it('BRC-BASIC-03: clear() resets the cache to null', () => {
    cache.set(makeSnapshot('to-clear'));
    expect(cache.get()).not.toBeNull();
    cache.clear();
    expect(cache.get()).toBeNull();
  });

  it('cold cache after clear is distinguishable (null === foundry_unreachable)', () => {
    // Verifies T-RFP-03: never-pushed → foundry_unreachable, not unknown_token
    cache.set(makeSnapshot('some-token'));
    cache.clear();
    // After clear, get() returns null — signal for foundry_unreachable
    expect(cache.get()).toBeNull();
  });
});
