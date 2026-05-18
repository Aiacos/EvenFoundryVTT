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
 * Phase 16 Plan 16-01 — `abilities` atomic schema extension (CS-AB-1..7):
 *
 *   - CS-AB-1  happy-path: 6-keyed `abilities` object parses
 *   - CS-AB-2  REQUIRED (not .optional()): missing `abilities` field rejected
 *   - CS-AB-3  negative mod/save: CHA 8 → mod=-1, save=-1 parses
 *   - CS-AB-4  range gates: dc=-1 rejected, dc=23 accepted, value=31 rejected
 *   - CS-AB-5  proficient strict-boolean: numeric 1 rejected (reader coerces, not schema)
 *   - CS-AB-6  z.object forward-compat: extra sibling on per-ability object accepted
 *   - CS-AB-7  type inference: `const a: Abilities = {...}` compiles + roundtrips
 *
 * @see ./character.ts (schema definitions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 1
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-01-PLAN.md
 */
import { describe, expect, it } from 'vitest';
import {
  type Abilities,
  AbilitiesSchema,
  AbilityScoreSchema,
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

/** Canonical Thorin Oakenshield ability spread (Specs.md §7.5.2; CONTEXT §Area 4).
 *  Used both standalone and woven into VALID_SNAPSHOT so every pre-existing
 *  CS-DS/CHAR-MR/CHAR-INV/CHAR-SPL/CS-PORT test picks up the new field via spread.
 *  Uniform `dc: 10` baseline — Plan 16-02 computes real per-caster DCs at the
 *  reader; the canonical sample uses the non-spellcaster baseline. */
const VALID_ABILITIES: Abilities = {
  str: { value: 16, mod: 3, save: 5, proficient: true, dc: 10 },
  dex: { value: 14, mod: 2, save: 2, proficient: false, dc: 10 },
  con: { value: 14, mod: 2, save: 5, proficient: true, dc: 10 },
  int: { value: 18, mod: 4, save: 4, proficient: false, dc: 10 },
  wis: { value: 12, mod: 1, save: 1, proficient: false, dc: 10 },
  cha: { value: 8, mod: -1, save: -1, proficient: false, dc: 10 },
};

/** Canonical valid snapshot used as the test base; schema-extension fields
 *  (`death`, `world`, `inventory`, `spells`, `abilities`) are included with
 *  defaults and overridden per case. */
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
  abilities: VALID_ABILITIES,
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

// ─── Plan 13-03: CharacterSnapshot optional portrait field ────────────────────

describe('CharacterSnapshotSchema — portrait extension (CS-PORT)', () => {
  // CS-PORT-01: portrait present → accepted with url
  it('CS-PORT-01: portrait with url is accepted when actor.img is present', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      portrait: { url: 'worlds/my-world/portraits/thorin.webp' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.portrait?.url).toBe('worlds/my-world/portraits/thorin.webp');
  });

  // CS-PORT-02: portrait absent → snapshot still valid (optional field, no breaking change)
  it('CS-PORT-02: portrait absent → snapshot still valid (backward compatible)', () => {
    const result = CharacterSnapshotSchema.safeParse(VALID_SNAPSHOT);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.portrait).toBeUndefined();
  });

  // CS-PORT-03: portrait with absolute external URL → accepted (bridge validates, not schema)
  it('CS-PORT-03: portrait with absolute HTTPS URL is accepted by schema', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      portrait: { url: 'https://cdn.example.com/portraits/hero.png' },
    });
    expect(result.success).toBe(true);
  });

  // CS-PORT-04: portrait with empty url → rejected (min(1))
  it('CS-PORT-04: portrait with empty url is rejected', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      portrait: { url: '' },
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16 Plan 16-01 — abilities atomic extension (CS-AB-1..7)
// ─────────────────────────────────────────────────────────────────────────────

describe('CharacterSnapshotSchema — abilities extension (CS-AB)', () => {
  it('CS-AB-1: parses a snapshot carrying all 6 ability sub-objects (happy path)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: VALID_ABILITIES,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.abilities.str.value).toBe(16);
      expect(result.data.abilities.str.mod).toBe(3);
      expect(result.data.abilities.str.save).toBe(5);
      expect(result.data.abilities.str.proficient).toBe(true);
      expect(result.data.abilities.cha.mod).toBe(-1);
    }
  });

  it('CS-AB-2: REQUIRED field — snapshot without `abilities` is rejected (NOT .optional())', () => {
    const { abilities: _abilities, ...snapshotWithoutAbilities } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutAbilities);
    expect(result.success).toBe(false);
  });

  it('CS-AB-3: negative mod/save parse (CHA 8 → mod=-1, save=-1)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        cha: { value: 8, mod: -1, save: -1, proficient: false, dc: 10 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.abilities.cha.mod).toBe(-1);
      expect(result.data.abilities.cha.save).toBe(-1);
    }
  });

  it('CS-AB-4: range gates — dc=-1 rejected, dc=23 accepted, value=31 rejected, value=30 accepted', () => {
    // dc=-1 must be rejected (min 0)
    const negDc = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        str: { value: 16, mod: 3, save: 5, proficient: true, dc: -1 },
      },
    });
    expect(negDc.success).toBe(false);

    // dc=23 (legendary caster) must be accepted
    const highDc = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        int: { value: 18, mod: 4, save: 4, proficient: false, dc: 23 },
      },
    });
    expect(highDc.success).toBe(true);

    // value=31 must be rejected (max 30 — divine score cap)
    const overValue = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        str: { value: 31, mod: 10, save: 10, proficient: true, dc: 10 },
      },
    });
    expect(overValue.success).toBe(false);

    // value=30 (cap) must be accepted
    const capValue = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        str: { value: 30, mod: 10, save: 10, proficient: true, dc: 10 },
      },
    });
    expect(capValue.success).toBe(true);
  });

  it('CS-AB-5: proficient is strict-boolean — numeric 1 rejected (reader coerces, not schema)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        // dnd5e raw `proficient: 1` — schema MUST reject; reader coerces 0|0.5|1|2 → boolean.
        str: { value: 16, mod: 3, save: 5, proficient: 1 as unknown as boolean, dc: 10 },
      },
    });
    expect(result.success).toBe(false);
  });

  it('CS-AB-6: AbilityScoreSchema is z.object (forward-compat) — extra sibling field accepted', () => {
    // Phase 17 may add half-prof / expertise fields. AbilityScoreSchema uses z.object
    // (not z.strictObject), so extra siblings on a per-ability sub-object must NOT reject.
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      abilities: {
        ...VALID_ABILITIES,
        str: {
          value: 16,
          mod: 3,
          save: 5,
          proficient: true,
          dc: 10,
          // future Phase 17 field — must be accepted by z.object forward-compat
          expertise: true,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('CS-AB-7: AbilitiesSchema + AbilityScoreSchema export + roundtrip + type inference', () => {
    // Belt-and-suspenders: compile-time type check + runtime parse roundtrip.
    const a: Abilities = VALID_ABILITIES;
    const result = AbilitiesSchema.safeParse(a);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.str.value).toBe(16);
      expect(result.data.cha.mod).toBe(-1);
    }

    // AbilityScoreSchema standalone roundtrip
    const singleResult = AbilityScoreSchema.safeParse({
      value: 14,
      mod: 2,
      save: 2,
      proficient: false,
      dc: 10,
    });
    expect(singleResult.success).toBe(true);
  });

  it('CS-AB-7b: AbilitiesSchema rejects missing ability key (closed 6-key enum)', () => {
    // AbilitiesSchema is z.strictObject — the 6 D&D ability codes are frozen.
    // Missing any key must reject (no defaults; reader's job to emit them).
    const { cha: _cha, ...incomplete } = VALID_ABILITIES;
    const result = AbilitiesSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
