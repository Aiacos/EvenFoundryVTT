/**
 * Tests for CharacterListSnapshotSchema + CharacterListEntrySchema.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * @see packages/shared-protocol/src/payloads/character-list.ts
 */

import { describe, expect, it } from 'vitest';
import {
  CharacterListEntrySchema,
  CharacterListSnapshotSchema,
  R1_CHARACTERS_AVAILABLE_TYPE,
} from './character-list.js';

describe('R1_CHARACTERS_AVAILABLE_TYPE', () => {
  it('equals r1.characters.available', () => {
    expect(R1_CHARACTERS_AVAILABLE_TYPE).toBe('r1.characters.available');
  });
});

describe('CharacterListEntrySchema', () => {
  const validEntry = {
    actorId: 'actor-abc123',
    name: 'Aragorn',
    level: 10,
  };

  it('accepts a valid entry', () => {
    const result = CharacterListEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it('accepts level 1 (min)', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, level: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts level 20 (max)', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, level: 20 });
    expect(result.success).toBe(true);
  });

  it('rejects level 0 (below min)', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, level: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects level 21 (above max)', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, level: 21 });
    expect(result.success).toBe(false);
  });

  it('rejects empty actorId', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, actorId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer level', () => {
    const result = CharacterListEntrySchema.safeParse({ ...validEntry, level: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing actorId', () => {
    const { actorId: _, ...rest } = validEntry;
    const result = CharacterListEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('CharacterListSnapshotSchema', () => {
  const validPayload = {
    characters: [
      { actorId: 'actor-1', name: 'Legolas', level: 8 },
      { actorId: 'actor-2', name: 'Gimli', level: 7 },
    ],
    source: 'foundry-world' as const,
    count: 2,
    generatedAt: 1716000000000,
  };

  it('accepts a valid payload', () => {
    const result = CharacterListSnapshotSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts source=empty with empty characters (cold-cache sentinel)', () => {
    const result = CharacterListSnapshotSchema.safeParse({
      characters: [],
      source: 'empty',
      count: 0,
      generatedAt: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = CharacterListSnapshotSchema.safeParse({
      ...validPayload,
      source: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative count', () => {
    const result = CharacterListSnapshotSchema.safeParse({ ...validPayload, count: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing generatedAt', () => {
    const { generatedAt: _, ...rest } = validPayload;
    const result = CharacterListSnapshotSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects character with level 0', () => {
    const result = CharacterListSnapshotSchema.safeParse({
      ...validPayload,
      characters: [{ actorId: 'actor-1', name: 'Newbie', level: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects character with level 21', () => {
    const result = CharacterListSnapshotSchema.safeParse({
      ...validPayload,
      characters: [{ actorId: 'actor-1', name: 'Demigod', level: 21 }],
    });
    expect(result.success).toBe(false);
  });
});
