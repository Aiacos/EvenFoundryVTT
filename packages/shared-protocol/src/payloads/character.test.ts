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
 * Phase 17 Plan 17-01 — `skills` atomic schema extension (CS-SK-1..8):
 *
 *   - CS-SK-1  happy-path: 18-keyed `skills` object parses with Thorin canonical spread
 *   - CS-SK-2  REQUIRED (not .optional()): missing `skills` field rejected (mirrors CS-AB-2 / CS-DS-6)
 *   - CS-SK-3  invalid ability enum: `acr.ability = 'xyz'` rejected (closed AbilityKey enum)
 *   - CS-SK-4  invalid proficient value: `acr.proficient = 1.5` rejected (closed 0|0.5|1|2 enum)
 *   - CS-SK-5  passive boundary: passive=0 accepted; passive=-1 rejected
 *   - CS-SK-6  z.object forward-compat: extra sibling on per-skill object accepted
 *   - CS-SK-7  type inference: `Skills` / `SkillKey` types compile + roundtrip
 *   - CS-SK-8  closed 18-key enum: missing a skill key (e.g. `sur`) rejected (SkillsSchema strictObject)
 *
 * @see ./character.ts (schema definitions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-06-PLAN.md Task 1
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-01-PLAN.md
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-01-PLAN.md
 */
import { describe, expect, it } from 'vitest';
import {
  ABILITY_KEYS,
  type Abilities,
  AbilitiesSchema,
  type AbilityKey,
  AbilityKeySchema,
  AbilityScoreSchema,
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  type DeathSaves,
  DeathSavesSchema,
  InventoryItemSchema,
  SKILL_KEYS,
  type Skill,
  type SkillKey,
  SkillSchema,
  type Skills,
  SkillsSchema,
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

/** Canonical Thorin Oakenshield 18-skill spread (Specs.md §7.5.3;
 *  CONTEXT §Specifics; 17-01-PLAN.md `<interfaces>` block).
 *
 *  Mirrors the renderer's existing DEFAULT_SKILLS hardcoded values byte-for-byte
 *  so Plan 17-03's `DEFAULT_SKILLS → snapshot.skills` swap preserves
 *  `sheet.skills.it.txt` byte-identity (INV-1 invariant).
 *
 *  Passive Investigation = 14 is intentional even though Indagare `total` = +0
 *  (Thorin INT 18 = +4 mod; the DEFAULT_SKILLS array ships `inv.total=0` un-prof
 *  while passive=14 reflects independent dnd5e prep-time computation). The
 *  schema does NOT cross-validate `total` vs `passive` — they are independent
 *  integer slots; reader passes both verbatim. */
const VALID_SKILLS: Skills = {
  acr: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
  ani: { total: 4, ability: 'wis', proficient: 1, passive: 14 },
  arc: { total: 0, ability: 'int', proficient: 0, passive: 10 },
  ath: { total: 6, ability: 'str', proficient: 1, passive: 16 },
  dec: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
  his: { total: 0, ability: 'int', proficient: 0, passive: 10 },
  ins: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
  itm: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
  inv: { total: 0, ability: 'int', proficient: 0, passive: 14 },
  med: { total: 4, ability: 'wis', proficient: 1, passive: 14 },
  nat: { total: 0, ability: 'int', proficient: 0, passive: 10 },
  prc: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
  prf: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
  per: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
  rel: { total: 0, ability: 'int', proficient: 0, passive: 10 },
  slt: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
  ste: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
  sur: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
};

/** Canonical valid snapshot used as the test base; schema-extension fields
 *  (`death`, `world`, `inventory`, `spells`, `abilities`, `skills`) are
 *  included with defaults and overridden per case. */
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
  skills: VALID_SKILLS,
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 Plan 17-01 — skills atomic extension (CS-SK-1..8)
// ─────────────────────────────────────────────────────────────────────────────

describe('CharacterSnapshotSchema — skills extension (CS-SK)', () => {
  it('CS-SK-1: parses a snapshot carrying all 18 skill sub-objects (happy path)', () => {
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: VALID_SKILLS,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Spot-check the Thorin canonical: Atletica STR-based, proficient, +6
      expect(result.data.skills.ath.total).toBe(6);
      expect(result.data.skills.ath.ability).toBe('str');
      expect(result.data.skills.ath.proficient).toBe(1);
      expect(result.data.skills.ath.passive).toBe(16);
      // Spot-check passive divergence from total: Indagare total=0, passive=14
      expect(result.data.skills.inv.total).toBe(0);
      expect(result.data.skills.inv.passive).toBe(14);
      // Spot-check senses-line trio: Percezione passive=11, Intuizione passive=11
      expect(result.data.skills.prc.passive).toBe(11);
      expect(result.data.skills.ins.passive).toBe(11);
    }
  });

  it('CS-SK-2: REQUIRED field — snapshot without `skills` is rejected (NOT .optional())', () => {
    // Pitfall 3 mirror of CS-AB-2 / CS-DS-6: no .optional() drift window;
    // the field lands required end-to-end in this atomic phase.
    const { skills: _skills, ...snapshotWithoutSkills } = VALID_SNAPSHOT;
    const result = CharacterSnapshotSchema.safeParse(snapshotWithoutSkills);
    expect(result.success).toBe(false);
  });

  it('CS-SK-3: invalid ability enum — `acr.ability="xyz"` rejected', () => {
    // AbilityKey is a closed enum re-using the 6 dnd5e ability codes from
    // AbilitiesSchema. Renderer (Plan 17-03) groups skills by ability column
    // and indexes a 6-row map; any non-canonical ability key MUST reject.
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: {
        ...VALID_SKILLS,
        acr: {
          total: 2,
          ability: 'xyz' as unknown as AbilityKey,
          proficient: 0,
          passive: 12,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('CS-SK-4: invalid proficient value — `acr.proficient=1.5` rejected (closed 0|0.5|1|2 enum)', () => {
    // proficient is a closed numeric enum 0|0.5|1|2 (NOT z.number() with refine,
    // NOT boolean — Skills tab needs the full glyph spectrum ○/◉/★).
    // Any other numeric (including 1.5, 3, 0.25) MUST reject.
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: {
        ...VALID_SKILLS,
        acr: {
          total: 2,
          ability: 'dex',
          // dnd5e never emits 1.5; this catches malformed payloads / drift.
          proficient: 1.5 as unknown as 0 | 0.5 | 1 | 2,
          passive: 12,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('CS-SK-5: passive boundary — passive=0 accepted; passive=-1 rejected', () => {
    // Passive score is z.number().int().nonnegative(). dnd5e passive floor in
    // canonical play is 10 + min mod (rarely below 5), but the schema accepts
    // 0 to avoid rejecting heavily debuffed actors (e.g. blinded + frightened
    // edge cases). Negatives still reject — that's data corruption.

    const zeroPassive = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: {
        ...VALID_SKILLS,
        acr: { total: 2, ability: 'dex', proficient: 0, passive: 0 },
      },
    });
    expect(zeroPassive.success).toBe(true);

    const negativePassive = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: {
        ...VALID_SKILLS,
        acr: { total: 2, ability: 'dex', proficient: 0, passive: -1 },
      },
    });
    expect(negativePassive.success).toBe(false);
  });

  it('CS-SK-6: SkillSchema is z.object (forward-compat) — extra sibling field accepted', () => {
    // Per-skill sub-objects use z.object (NOT z.strictObject) so future phases
    // may add `bonus` / `expertise` / `advantage` siblings without breaking
    // Phase 17 consumers. Counterpart to CS-AB-6.
    const result = CharacterSnapshotSchema.safeParse({
      ...VALID_SNAPSHOT,
      skills: {
        ...VALID_SKILLS,
        acr: {
          total: 2,
          ability: 'dex',
          proficient: 0,
          passive: 12,
          // future Phase field — must be accepted by z.object forward-compat
          bonus: 2,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('CS-SK-7: SkillsSchema + SkillSchema export + roundtrip + type inference (incl. SkillKey)', () => {
    // Belt-and-suspenders: compile-time + runtime sanity for the new public API.
    const s: Skills = VALID_SKILLS;
    const result = SkillsSchema.safeParse(s);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ath.total).toBe(6);
      expect(result.data.inv.passive).toBe(14);
    }

    // SkillSchema standalone roundtrip
    const single: Skill = { total: 1, ability: 'wis', proficient: 0, passive: 11 };
    const singleResult = SkillSchema.safeParse(single);
    expect(singleResult.success).toBe(true);

    // SkillKey compile-time check — must accept all 18 canonical codes
    const k: SkillKey = 'acr';
    expect(k).toBe('acr');

    // SKILL_KEYS tuple — exactly 18 elements in canonical order
    expect(SKILL_KEYS).toHaveLength(18);
    expect(SKILL_KEYS[0]).toBe('acr');
    expect(SKILL_KEYS[SKILL_KEYS.length - 1]).toBe('sur');

    // ABILITY_KEYS tuple — exactly 6 elements; AbilityKey type re-exported
    expect(ABILITY_KEYS).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    const a: AbilityKey = 'str';
    expect(a).toBe('str');

    // AbilityKeySchema standalone
    expect(AbilityKeySchema.safeParse('str').success).toBe(true);
    expect(AbilityKeySchema.safeParse('xyz').success).toBe(false);
  });

  it('CS-SK-8: SkillsSchema rejects missing skill key (closed 18-key enum)', () => {
    // SkillsSchema is z.strictObject — the 18 dnd5e skill codes are frozen.
    // Missing any key must reject (no defaults at schema level; reader is
    // responsible for emitting defensive defaults for fresh actors).
    // Counterpart to CS-AB-7b.
    const { sur: _sur, ...incomplete } = VALID_SKILLS;
    const result = SkillsSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
