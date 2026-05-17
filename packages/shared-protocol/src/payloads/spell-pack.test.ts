/**
 * Tests for AvailableSpellsPayloadSchema + SpellPackEntrySchema.
 *
 * @see packages/shared-protocol/src/payloads/spell-pack.ts
 */

import { describe, expect, it } from 'vitest';
import {
  AvailableSpellsPayloadSchema,
  R1_SPELLS_AVAILABLE_TYPE,
  SpellPackEntrySchema,
} from './spell-pack.js';

describe('R1_SPELLS_AVAILABLE_TYPE', () => {
  it('equals r1.spells.available', () => {
    expect(R1_SPELLS_AVAILABLE_TYPE).toBe('r1.spells.available');
  });
});

describe('SpellPackEntrySchema', () => {
  const validEntry = {
    id: 'abc123',
    packId: 'dnd5e.spells',
    name: 'Fireball',
    nameLocalized: 'Palla di Fuoco',
    level: 3,
    school: 'evo',
  };

  it('accepts a valid entry', () => {
    const result = SpellPackEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it('accepts level 0 (cantrip)', () => {
    const result = SpellPackEntrySchema.safeParse({ ...validEntry, level: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts level 9', () => {
    const result = SpellPackEntrySchema.safeParse({ ...validEntry, level: 9 });
    expect(result.success).toBe(true);
  });

  it('accepts empty school (homebrew)', () => {
    const result = SpellPackEntrySchema.safeParse({ ...validEntry, school: '' });
    expect(result.success).toBe(true);
  });

  it('rejects level 10', () => {
    const result = SpellPackEntrySchema.safeParse({ ...validEntry, level: 10 });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const { id: _, ...rest } = validEntry;
    const result = SpellPackEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = SpellPackEntrySchema.safeParse({ ...validEntry, name: '' });
    expect(result.success).toBe(false);
  });
});

describe('AvailableSpellsPayloadSchema', () => {
  const validPayload = {
    entries: [
      {
        id: 'abc123',
        packId: 'dnd5e.spells',
        name: 'Fireball',
        nameLocalized: 'Palla di Fuoco',
        level: 3,
        school: 'evo',
      },
    ],
    source: 'foundry-packs' as const,
    count: 1,
    generatedAt: 1716000000000,
  };

  it('accepts a valid payload', () => {
    const result = AvailableSpellsPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('accepts source=empty with empty entries', () => {
    const result = AvailableSpellsPayloadSchema.safeParse({
      entries: [],
      source: 'empty',
      count: 0,
      generatedAt: 1716000000000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = AvailableSpellsPayloadSchema.safeParse({ ...validPayload, source: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects negative count', () => {
    const result = AvailableSpellsPayloadSchema.safeParse({ ...validPayload, count: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing generatedAt', () => {
    const { generatedAt: _, ...rest } = validPayload;
    const result = AvailableSpellsPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts multiple entries and validates each', () => {
    const result = AvailableSpellsPayloadSchema.safeParse({
      ...validPayload,
      entries: [
        ...validPayload.entries,
        {
          id: 'def456',
          packId: 'dnd5e.spells',
          name: 'Magic Missile',
          nameLocalized: 'Dardo Incantato',
          level: 1,
          school: 'evo',
        },
      ],
      count: 2,
    });
    expect(result.success).toBe(true);
  });
});
