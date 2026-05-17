/**
 * Tests for AvailableEntitiesPayloadSchema + EntityPackEntrySchema.
 *
 * Quick Task 260517-k2g.
 *
 * @see packages/shared-protocol/src/payloads/entity-pack.ts
 */

import { describe, expect, it } from 'vitest';
import {
  AvailableEntitiesPayloadSchema,
  EntityPackEntrySchema,
  R1_ENTITIES_AVAILABLE_TYPE,
} from './entity-pack.js';

describe('R1_ENTITIES_AVAILABLE_TYPE', () => {
  it('equals r1.entities.available', () => {
    expect(R1_ENTITIES_AVAILABLE_TYPE).toBe('r1.entities.available');
  });
});

describe('EntityPackEntrySchema', () => {
  const validItemEntry = {
    id: 'longsword',
    packId: 'dnd5e.items',
    entityKind: 'item' as const,
    entityType: 'weapon',
    name: 'Longsword',
    nameLocalized: 'Spada Lunga',
  };

  const validActorEntry = {
    id: 'goblin-1',
    packId: 'dnd5e.monsters',
    entityKind: 'actor' as const,
    entityType: 'npc',
    name: 'Goblin',
    nameLocalized: 'Goblin',
  };

  it('accepts a valid item entry (weapon)', () => {
    const result = EntityPackEntrySchema.safeParse(validItemEntry);
    expect(result.success).toBe(true);
  });

  it('accepts a valid actor entry (npc)', () => {
    const result = EntityPackEntrySchema.safeParse(validActorEntry);
    expect(result.success).toBe(true);
  });

  it('accepts entityKind=actor with entityType=vehicle', () => {
    const result = EntityPackEntrySchema.safeParse({
      ...validActorEntry,
      entityType: 'vehicle',
    });
    expect(result.success).toBe(true);
  });

  it('accepts entityKind=item with entityType=consumable', () => {
    const result = EntityPackEntrySchema.safeParse({
      ...validItemEntry,
      entityType: 'consumable',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const { id: _, ...rest } = validItemEntry;
    const result = EntityPackEntrySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = EntityPackEntrySchema.safeParse({ ...validItemEntry, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty nameLocalized', () => {
    const result = EntityPackEntrySchema.safeParse({
      ...validItemEntry,
      nameLocalized: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entityKind', () => {
    const result = EntityPackEntrySchema.safeParse({
      ...validItemEntry,
      entityKind: 'creature',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty entityType', () => {
    const result = EntityPackEntrySchema.safeParse({ ...validItemEntry, entityType: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty packId', () => {
    const result = EntityPackEntrySchema.safeParse({ ...validItemEntry, packId: '' });
    expect(result.success).toBe(false);
  });
});

describe('AvailableEntitiesPayloadSchema', () => {
  const validPayload = {
    entries: [
      {
        id: 'longsword',
        packId: 'dnd5e.items',
        entityKind: 'item' as const,
        entityType: 'weapon',
        name: 'Longsword',
        nameLocalized: 'Spada Lunga',
      },
    ],
    source: 'foundry-packs' as const,
    count: 1,
    generatedAt: 1716000000000,
  };

  it('accepts a valid payload', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('round-trips a valid payload (parse → identical data)', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it('accepts source=empty with empty entries', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse({
      entries: [],
      source: 'empty',
      count: 0,
      generatedAt: 1716000000000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple entries with mixed entityKind (item + actor + npc + vehicle)', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse({
      entries: [
        validPayload.entries[0],
        {
          id: 'plate-armor',
          packId: 'dnd5e.items',
          entityKind: 'item',
          entityType: 'equipment',
          name: 'Plate',
          nameLocalized: 'Armatura di Piastre',
        },
        {
          id: 'goblin-1',
          packId: 'dnd5e.monsters',
          entityKind: 'actor',
          entityType: 'npc',
          name: 'Goblin',
          nameLocalized: 'Goblin',
        },
        {
          id: 'siege-tower',
          packId: 'dnd5e.vehicles',
          entityKind: 'actor',
          entityType: 'vehicle',
          name: 'Siege Tower',
          nameLocalized: 'Torre d’Assedio',
        },
      ],
      source: 'foundry-packs',
      count: 4,
      generatedAt: 1716000000000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid source', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse({
      ...validPayload,
      source: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative count', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse({ ...validPayload, count: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing generatedAt', () => {
    const { generatedAt: _, ...rest } = validPayload;
    const result = AvailableEntitiesPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects entries with invalid entityKind nested', () => {
    const result = AvailableEntitiesPayloadSchema.safeParse({
      ...validPayload,
      entries: [{ ...validPayload.entries[0], entityKind: 'monster' }],
    });
    expect(result.success).toBe(false);
  });
});
