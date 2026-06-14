/**
 * Tests for BearerRegistrySnapshotSchema + BearerRegistryEntrySchema.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts
 */

import { describe, expect, it } from 'vitest';
import {
  BearerAuthorizationSchema,
  BearerRegistryEntrySchema,
  BearerRegistrySnapshotSchema,
  R1_BEARERS_AVAILABLE_TYPE,
} from './bearer-registry.js';

describe('R1_BEARERS_AVAILABLE_TYPE', () => {
  it('equals r1.bearers.available', () => {
    expect(R1_BEARERS_AVAILABLE_TYPE).toBe('r1.bearers.available');
  });
});

describe('BearerRegistryEntrySchema', () => {
  const validEntry = {
    token: 'some-base64url-token-string',
    alias: 'Aiacos G2',
    expiresAt: 1717000000000,
    worldId: 'my-world',
    userId: 'user-aiacos',
    authorizedActorIds: ['actor-1', 'actor-2'],
  };

  it('accepts a valid entry', () => {
    const result = BearerRegistryEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  // ── ADR-0014: bearer ↔ Foundry-User binding (userId required, fail-closed) ──

  it('accepts an entry with userId', () => {
    const result = BearerRegistryEntrySchema.safeParse({
      ...validEntry,
      userId: 'user-xyz',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a legacy entry missing userId (fail-closed migration)', () => {
    const { userId: _, ...legacy } = validEntry;
    const result = BearerRegistryEntrySchema.safeParse(legacy);
    expect(result.success).toBe(false);
  });

  it('rejects empty userId', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, userId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing token', () => {
    const { token: _, ...rest } = validEntry;
    const result = BearerRegistryEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, token: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty alias', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, alias: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty worldId', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, worldId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer expiresAt', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, expiresAt: 3.14 });
    expect(result.success).toBe(false);
  });

  it('accepts expiresAt === 0 (epoch)', () => {
    const result = BearerRegistryEntrySchema.safeParse({ ...validEntry, expiresAt: 0 });
    expect(result.success).toBe(true);
  });

  // ── ADR-0014: per-bearer authorizedActorIds (cached enforce path) ──

  it('accepts an empty authorizedActorIds (fail-closed — authorizes nothing)', () => {
    const result = BearerRegistryEntrySchema.safeParse({
      ...validEntry,
      authorizedActorIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry missing authorizedActorIds (ADR-0014 — required for cached enforce)', () => {
    const { authorizedActorIds: _, ...rest } = validEntry;
    const result = BearerRegistryEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects non-string actor ids in authorizedActorIds', () => {
    const result = BearerRegistryEntrySchema.safeParse({
      ...validEntry,
      authorizedActorIds: ['actor-1', 99],
    });
    expect(result.success).toBe(false);
  });
});

describe('BearerRegistrySnapshotSchema', () => {
  const validPayload = {
    bearers: [
      {
        token: 'token-abc',
        alias: 'G2 Device',
        expiresAt: 1717000000000,
        worldId: 'world-xyz',
        userId: 'user-abc',
        authorizedActorIds: ['actor-abc'],
      },
    ],
    source: 'foundry-registry' as const,
    count: 1,
    generatedAt: 1716000000000,
  };

  it('accepts a valid payload', () => {
    const result = BearerRegistrySnapshotSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts source=empty with empty bearers (cold-cache sentinel)', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      bearers: [],
      source: 'empty',
      count: 0,
      generatedAt: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      ...validPayload,
      source: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative count', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({ ...validPayload, count: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer generatedAt', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      ...validPayload,
      generatedAt: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing generatedAt', () => {
    const { generatedAt: _, ...rest } = validPayload;
    const result = BearerRegistrySnapshotSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects bearers entry with missing token', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      ...validPayload,
      bearers: [{ alias: 'G2', expiresAt: 1000, worldId: 'w', userId: 'u' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects bearers entry with missing userId (ADR-0014 fail-closed)', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      ...validPayload,
      bearers: [{ token: 't', alias: 'G2', expiresAt: 1000, worldId: 'w' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts multiple bearers', () => {
    const result = BearerRegistrySnapshotSchema.safeParse({
      ...validPayload,
      bearers: [
        {
          token: 'token-1',
          alias: 'G2 A',
          expiresAt: 1000,
          worldId: 'world-1',
          userId: 'u1',
          authorizedActorIds: ['a1'],
        },
        {
          token: 'token-2',
          alias: 'G2 B',
          expiresAt: 2000,
          worldId: 'world-2',
          userId: 'u2',
          authorizedActorIds: [],
        },
      ],
      count: 2,
    });
    expect(result.success).toBe(true);
  });
});

describe('BearerAuthorizationSchema (ADR-0014)', () => {
  const validAuth = {
    userId: 'user-aiacos',
    authorizedActorIds: ['actor-1', 'actor-2'],
  };

  it('accepts a valid authorization payload', () => {
    const result = BearerAuthorizationSchema.safeParse(validAuth);
    expect(result.success).toBe(true);
  });

  it('round-trips parsed output identically', () => {
    const result = BearerAuthorizationSchema.safeParse(validAuth);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAuth);
    }
  });

  it('accepts an empty authorizedActorIds set (authorizes nothing)', () => {
    const result = BearerAuthorizationSchema.safeParse({
      userId: 'user-no-actors',
      authorizedActorIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing userId', () => {
    const { userId: _, ...rest } = validAuth;
    const result = BearerAuthorizationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty userId', () => {
    const result = BearerAuthorizationSchema.safeParse({ ...validAuth, userId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing authorizedActorIds', () => {
    const { authorizedActorIds: _, ...rest } = validAuth;
    const result = BearerAuthorizationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects non-string actor ids', () => {
    const result = BearerAuthorizationSchema.safeParse({
      ...validAuth,
      authorizedActorIds: ['actor-1', 42],
    });
    expect(result.success).toBe(false);
  });
});
