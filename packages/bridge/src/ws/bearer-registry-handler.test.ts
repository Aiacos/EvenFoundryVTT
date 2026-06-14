/**
 * Unit tests for handleBearerRegistryEnvelope.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * @see ./bearer-registry-handler.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import { R1_BEARERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { BearerRegistryCache } from '../cache/bearer-registry-cache.js';
import { handleBearerRegistryEnvelope } from './bearer-registry-handler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeValidPayload() {
  return {
    bearers: [
      {
        token: 'valid-token-abc',
        alias: 'G2 Device',
        expiresAt: NOW + 86_400_000,
        worldId: 'world-xyz',
        userId: 'user-abc',
        authorizedActorIds: ['actor-abc'],
      },
    ],
    source: 'foundry-registry' as const,
    count: 1,
    generatedAt: NOW,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleBearerRegistryEnvelope', () => {
  let cache: BearerRegistryCache;

  beforeEach(() => {
    cache = new BearerRegistryCache();
  });

  it('returns false when type does not match', () => {
    const result = handleBearerRegistryEnvelope('r1.other.type', {}, cache);
    expect(result).toBe(false);
    expect(cache.get()).toBeNull(); // cache untouched
  });

  it('returns true and sets cache when type matches and payload is valid', () => {
    const payload = makeValidPayload();
    const result = handleBearerRegistryEnvelope(R1_BEARERS_AVAILABLE_TYPE, payload, cache);
    expect(result).toBe(true);
    expect(cache.get()).not.toBeNull();
    expect(cache.get()?.count).toBe(1);
    expect(cache.get()?.bearers[0]?.alias).toBe('G2 Device');
  });

  it('returns true but leaves cache unchanged when payload fails Zod validation', () => {
    // Invalid: missing `bearers` field
    const badPayload = { source: 'foundry-registry', count: 0, generatedAt: NOW };
    const result = handleBearerRegistryEnvelope(R1_BEARERS_AVAILABLE_TYPE, badPayload, cache);
    expect(result).toBe(true); // type matched
    expect(cache.get()).toBeNull(); // cache NOT written (T-RFP-01)
  });

  it('returns true but leaves cache unchanged for invalid source value', () => {
    const badPayload = { ...makeValidPayload(), source: 'invalid-source' };
    const result = handleBearerRegistryEnvelope(R1_BEARERS_AVAILABLE_TYPE, badPayload, cache);
    expect(result).toBe(true);
    expect(cache.get()).toBeNull();
  });

  it('last-write-wins: second valid push overwrites first', () => {
    const first = makeValidPayload();
    const second = {
      ...makeValidPayload(),
      count: 2,
      bearers: [
        {
          token: 'token-1',
          alias: 'G2 A',
          expiresAt: NOW + 1000,
          worldId: 'w',
          userId: 'u1',
          authorizedActorIds: ['a1'],
        },
        {
          token: 'token-2',
          alias: 'G2 B',
          expiresAt: NOW + 2000,
          worldId: 'w',
          userId: 'u2',
          authorizedActorIds: [],
        },
      ],
    };
    handleBearerRegistryEnvelope(R1_BEARERS_AVAILABLE_TYPE, first, cache);
    handleBearerRegistryEnvelope(R1_BEARERS_AVAILABLE_TYPE, second, cache);
    expect(cache.get()?.count).toBe(2);
    expect(cache.get()?.bearers).toHaveLength(2);
  });
});
