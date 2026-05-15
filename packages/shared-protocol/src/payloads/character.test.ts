/**
 * @evf/shared-protocol — CharacterSnapshotSchema + DeathSavesSchema tests.
 *
 * Covers Plan 4b-06 Task 1 behaviour CS-DS-1..CS-DS-8 — the death-saves schema
 * extension landed atomically alongside the character-reader.ts producer and the
 * downstream g2-app + bridge consumer fixtures (Pitfall 3 mitigation: no
 * `.optional()` window of drift).
 *
 *   - CS-DS-1  happy-path: success=0, failure=0 (idle character) parses
 *   - CS-DS-2  stabilized: success=3, failure=0 parses
 *   - CS-DS-3  dead: success=0, failure=3 parses
 *   - CS-DS-4  out-of-range high: success=4 rejected
 *   - CS-DS-5  negative: success=-1 rejected
 *   - CS-DS-6  REQUIRED (not .optional()): missing `death` field rejected
 *   - CS-DS-7  DeathSavesSchema exported separately + roundtrips
 *   - CS-DS-8  type inference: `const d: DeathSaves = {...}` compiles cleanly
 *
 * @see ./character.ts (schema definitions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import {
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  type DeathSaves,
  DeathSavesSchema,
  InventoryItemSchema,
  SpellbookSchema,
  SpellEntrySchema,
  SpellSlotSchema,
  WorldStateSchema,
} from './character.js';

/** Canonical valid snapshot used as the test base; schema-extension fields
 *  (`death`, `world`, `inventory`, `spells`) are included with defaults
 *  and overridden per case. */
const VALID_SNAPSHOT: CharacterSnapshot = {
  actorId: 'pc-aiacos',
  name: 'Aiacos',
  hp: 36,
  maxHp: 36,
  tempHp: 0,
  ac: 16,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
};

describe('CharacterSnapshotSchema — death-saves extension (CS-DS)', () => {
  it('CS-DS-1: parses an idle character with death={success:0,failure:0}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 0, failure: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-2: parses a stabilized character with death={success:3,failure:0}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 3, failure: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-3: parses a dead character with death={success:0,failure:3}', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 0, failure: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('CS-DS-4: rejects death.success=4 (out of 0..3 range)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: 4, failure: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('CS-DS-5: rejects death.success=-1 (negative)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      death: { success: -1, failure: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('CS-DS-6: REQUIRED field — snapshot without `death` is rejected (NOT .optional())', () => {
    const { death: _death, ...snapshotWithoutDeath } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutDeath);
    expect(result.success).toBe(false);
  });

  it('CS-DS-7: DeathSavesSchema parses {success:1,failure:2} standalone', () => {
    const result = DeathSavesSchema.safeParse({ success: 1, failure: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ success: 1, failure: 2 });
    }
  });

  it('CS-DS-8: DeathSaves type infers correctly (compile-time check)', () => {
    // If this compiles, the type is correctly inferred. Asserting equality at
    // runtime is a belt-and-suspenders sanity check.
    const d: DeathSaves = { success: 1, failure: 2 };
    expect(d.success).toBe(1);
    expect(d.failure).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — world.modernRules extension (CHAR-MR-1..5)
// ─────────────────────────────────────────────────────────────────────────────

describe('CharacterSnapshotSchema — world.modernRules extension (CHAR-MR)', () => {
  it('CHAR-MR-1: payload with world.modernRules=true parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      world: { modernRules: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.world.modernRules).toBe(true);
    }
  });

  it('CHAR-MR-2: payload with world.modernRules=false parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      world: { modernRules: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.world.modernRules).toBe(false);
    }
  });

  it('CHAR-MR-3: payload WITHOUT world field FAILS to parse (field is REQUIRED)', () => {
    const { world: _world, ...snapshotWithoutWorld } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutWorld);
    expect(result.success).toBe(false);
  });

  it('CHAR-MR-4: payload with extra fields in world PASSES (open z.object, not strictObject)', () => {
    // WorldStateSchema uses z.object (not z.strictObject) for forward-compat.
    // Phase 7+ may add currentEdition or other world fields without breaking consumers.
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      world: { modernRules: true, extraField: 'future-value' },
    });
    expect(result.success).toBe(true);
  });

  it('CHAR-MR-5: payload with world.modernRules="true" (string) FAILS (boolean required)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      world: { modernRules: 'true' }, // wrong type — should be boolean
    });
    expect(result.success).toBe(false);
  });

  it('CHAR-MR-6: WorldStateSchema exported separately + roundtrips', () => {
    const result = WorldStateSchema.safeParse({ modernRules: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modernRules).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Plan 05-04 — inventory extension (CHAR-INV-1..6)
// ─────────────────────────────────────────────────────────────────────────────

describe('CharacterSnapshotSchema — inventory extension (CHAR-INV)', () => {
  it('CHAR-INV-1: payload with empty inventory array parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      inventory: [],
    });
    expect(result.success).toBe(true);
  });

  it('CHAR-INV-2: payload with a weapon item parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      inventory: [
        {
          id: 'item-sword-001',
          name: 'Spada lunga',
          type: 'weapon',
          damage: '1d8 taglio',
          tags: ['versatile'],
          weight: 1.4,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toHaveLength(1);
      expect(result.data.inventory[0]?.name).toBe('Spada lunga');
    }
  });

  it('CHAR-INV-3: payload with multiple item types parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      inventory: [
        { id: 'w1', name: 'Ascia a mano', type: 'weapon' },
        { id: 'a1', name: 'Maglia', type: 'armor' },
        { id: 'c1', name: 'Pozione di Guarigione', type: 'consumable', quantity: 3 },
        { id: 'e1', name: 'Corda 15m', type: 'equipment' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toHaveLength(4);
    }
  });

  it('CHAR-INV-4: snapshot MISSING inventory field FAILS (REQUIRED per atomic gate)', () => {
    const { inventory: _inventory, ...snapshotWithoutInventory } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutInventory);
    expect(result.success).toBe(false);
  });

  it('CHAR-INV-5: InventoryItemSchema rejects unknown item type', () => {
    const result = InventoryItemSchema.safeParse({
      id: 'bad-type',
      name: 'Unknown Thing',
      type: 'vehicle', // not in INVENTORY_ITEM_TYPES
    });
    expect(result.success).toBe(false);
  });

  it('CHAR-INV-6: InventoryItemSchema parses optional fields correctly', () => {
    // All optional fields absent
    const result = InventoryItemSchema.safeParse({
      id: 'minimal-item',
      name: 'Stick',
      type: 'equipment',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.damage).toBeUndefined();
      expect(result.data.tags).toBeUndefined();
      expect(result.data.weight).toBeUndefined();
      expect(result.data.quantity).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 Plan 05-04 — spells extension (CHAR-SPL-1..8)
// ─────────────────────────────────────────────────────────────────────────────

describe('CharacterSnapshotSchema — spells extension (CHAR-SPL)', () => {
  const validSpell = {
    id: 'spell-fireball-001',
    name: 'Palla di Fuoco',
    level: 3,
    school: 'evocation',
    activation: 'action' as const,
    range: '45m',
    effect: '8d6 fuoco',
    prepared: true,
    alwaysPrepared: false,
    concentration: false,
  };

  const validSlot = { level: 3, value: 2, max: 3 };

  it('CHAR-SPL-1: payload with empty spells (non-caster) parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      spells: { slots: [], spells: [] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spells.slots).toHaveLength(0);
      expect(result.data.spells.spells).toHaveLength(0);
    }
  });

  it('CHAR-SPL-2: payload with realistic spell data parses successfully', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      spells: {
        slots: [validSlot, { level: 1, value: 4, max: 4 }, { level: 2, value: 3, max: 3 }],
        spells: [validSpell, { ...validSpell, id: 'sp2', name: 'Dardo di Fuoco', level: 0 }],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spells.slots).toHaveLength(3);
      expect(result.data.spells.spells).toHaveLength(2);
    }
  });

  it('CHAR-SPL-3: snapshot MISSING spells field FAILS (REQUIRED per atomic gate)', () => {
    const { spells: _spells, ...snapshotWithoutSpells } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutSpells);
    expect(result.success).toBe(false);
  });

  it('CHAR-SPL-4: SpellEntrySchema rejects level > 9 (T-05-04-02 mitigation)', () => {
    const result = SpellEntrySchema.safeParse({ ...validSpell, level: 10 });
    expect(result.success).toBe(false);
  });

  it('CHAR-SPL-5: SpellEntrySchema rejects level < 0', () => {
    const result = SpellEntrySchema.safeParse({ ...validSpell, level: -1 });
    expect(result.success).toBe(false);
  });

  it('CHAR-SPL-6: SpellSlotSchema parses correctly', () => {
    const result = SpellSlotSchema.safeParse({ level: 1, value: 2, max: 4 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe(2);
      expect(result.data.max).toBe(4);
    }
  });

  it('CHAR-SPL-7: concentration spell parses and flags concentration=true', () => {
    const concSpell = { ...validSpell, concentration: true };
    const result = SpellEntrySchema.safeParse(concSpell);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concentration).toBe(true);
    }
  });

  it('CHAR-SPL-8: SpellbookSchema parses standalone', () => {
    const result = SpellbookSchema.safeParse({
      slots: [{ level: 2, value: 1, max: 3 }],
      spells: [validSpell],
    });
    expect(result.success).toBe(true);
  });
});
