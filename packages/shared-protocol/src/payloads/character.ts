/**
 * CharacterSnapshot Zod schema — dnd5e 5.x actor read shape.
 *
 * Dual-edition aware (PHB 2014 + PHB 2024 via `core.modernRules`):
 * - `conditions` is read from `actor.statuses` (Set<string>) — same across editions.
 * - `level` is from `actor.system.details.level` — same across editions.
 * - HP/AC are from `actor.system.attributes.*` — same across editions.
 * - `death` is from `actor.system.attributes.death.{success,failure}` — same across
 *   editions per dnd5e 5.x; counters are integers 0..3 (3 successes = stabilized,
 *   3 failures = dead).
 * - `world.modernRules` is from `game.settings.get('dnd5e','rulesVersion') === 'modern'`
 *   (Phase 5 Plan 05-01 Wave-0 atomic extension; REQUIRED field per atomic-commit pattern).
 * - `inventory` is from `actor.items.contents` filtered to player-visible types
 *   (Phase 5 Plan 05-04 atomic extension; REQUIRED field — see T-05-04-01).
 * - `spells` is from `actor.system.spells.*` + actor.items filtered to spells
 *   (Phase 5 Plan 05-04 atomic extension; REQUIRED field — see T-05-04-02).
 *
 * This is a full-replacement delta (ADR-0002 §Phase 2): no field-level diff.
 * Phase 5 narrows to field-level deltas when the payload union arms are filled.
 *
 * @see docs/architecture/0002-protocol-versioning.md (WS envelope + delta semantics)
 * @see Specs.md §4 (read pipeline), §3.4 (Foundry compat ≥13.347)
 * @see packages/foundry-module/src/readers/character-reader.ts (producer)
 * @see 02-05-PLAN.md Task 1 (CharacterSnapshotSchema spec)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q4 (death-saves extension)
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 3 (modernRules mapping)
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-04-PLAN.md Task 1 (inventory + spells atomic extension)
 */
import { z } from 'zod';

/**
 * Death saving throw progress per dnd5e v5.x `actor.system.attributes.death`.
 *
 * Each death save outcome increments the appropriate counter (0..3 each); 3 successes
 * = stabilized, 3 failures = dead. Counters reset on full rest or HP restoration.
 *
 * Required as a sub-field of {@link CharacterSnapshotSchema} — the field is NOT
 * optional (Phase 4b Pitfall 3 mitigation: atomic commit closes the
 * .optional() drift window).
 *
 * @see Specs.md §3.4 (Foundry dnd5e v5.x compatibility)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q4 (schema extension rationale + verified field path)
 */
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});

export type DeathSaves = z.infer<typeof DeathSavesSchema>;

/**
 * World-state sub-object — edition and world-level settings that affect
 * how the character snapshot is rendered on the G2.
 *
 * Uses `z.object` (not `z.strictObject`) for forward-compat: Phase 7+ may
 * add additional world fields (e.g. `currentEdition`) without breaking
 * Phase 5 consumers that parse existing payloads.
 *
 * `modernRules`: `true` when `game.settings.get('dnd5e','rulesVersion')` is
 * `'modern'` (PHB 2024), `false` otherwise (PHB 2014 default).
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 3
 * @see Specs.md §11.5.1 — dual-edition support (PHB 2014 + PHB 2024)
 */
export const WorldStateSchema = z.object({
  modernRules: z.boolean(),
});

export type WorldState = z.infer<typeof WorldStateSchema>;

/**
 * Item type discriminant — covers all player-visible dnd5e item categories.
 *
 * - `weapon`    — melee/ranged weapons (may carry `[M]` mastery flag in 2024 mode)
 * - `armor`     — worn armour and shields
 * - `consumable`— potions, scrolls, ammunition, food
 * - `equipment` — gear, tools, trinkets (miscellaneous)
 * - `container` — bags, pouches, chests
 * - `currency`  — coin summaries (rolled up by character-reader)
 *
 * T-05-04-01 mitigation: `z.enum` strict gate ensures no unknown item type
 * reaches the renderer — the reader silently drops unrecognized types.
 */
export const INVENTORY_ITEM_TYPES = [
  'weapon',
  'armor',
  'consumable',
  'equipment',
  'container',
  'currency',
] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

/**
 * Single inventory item carried by the character.
 *
 * Optional fields are truly optional at the data level — not all item types
 * have damage or tags (e.g. a coin purse has weight but no damage).
 */
export const InventoryItemSchema = z.object({
  /** Foundry item document ID (stable). */
  id: z.string().min(1),
  /** Display name (localized via Foundry, passed through verbatim). */
  name: z.string().min(1),
  /** Item category — determines glyph + section assignment. */
  type: z.enum(INVENTORY_ITEM_TYPES),
  /** Damage formula string (e.g. `'1d8 taglio'`) — weapons only. */
  damage: z.string().optional(),
  /** Descriptive tags (e.g. `['versatile', '1d10']` for versatile weapons). */
  tags: z.array(z.string()).optional(),
  /** Item weight in kg (may be absent for weightless items). */
  weight: z.number().optional(),
  /** Stack quantity (e.g. 3 for ×3 potions). Defaults to 1 if absent. */
  quantity: z.number().int().positive().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

/**
 * Single spell slot level — covers levels 0 (cantrips) through 9 + pact slots.
 *
 * `level === 0` = cantrip level (unlimited; `value` and `max` are both 0 and
 * unused — the slot bar is not rendered for cantrips).
 * `level === 10` = pact slots (warlock Eldritch Invocation).
 *
 * T-05-04-02 mitigation: `min(0).max(10)` clamps the level; reader validates
 * `actor.system.spells.spell{N}` shape before inclusion.
 */
export const SpellSlotSchema = z.object({
  /** Spell slot level (0=cantrip, 1-9=standard, 10=pact). */
  level: z.number().int().min(0).max(10),
  /** Remaining spell slots. */
  value: z.number().int().nonnegative(),
  /** Maximum spell slots at this level. */
  max: z.number().int().nonnegative(),
});

export type SpellSlot = z.infer<typeof SpellSlotSchema>;

/**
 * Spell activation time category.
 *
 * Maps to the i18n-budgets abbreviations used in the spellbook renderer:
 * `action → azione/action`, `reaction → reaziN/reactN`, etc.
 */
export const SPELL_ACTIVATION_TYPES = ['action', 'reaction', 'bonus', 'ritual'] as const;
export type SpellActivation = (typeof SPELL_ACTIVATION_TYPES)[number];

/**
 * Single spell entry in the character's known/prepared list.
 *
 * `alwaysPrepared` is a 2024 PHB concept: class features (e.g. Divine Smite
 * spells for Paladins) are always prepared and show the `≡` glyph.
 * `concentration` drives the `≀` glyph on the spell row.
 *
 * T-05-04-02 mitigation: `level.min(0).max(9)` — reader clamps incoming level;
 * values from `actor.items.system.level` are integers 0..9 for all standard spells.
 */
export const SpellEntrySchema = z.object({
  /** Foundry item document ID. */
  id: z.string().min(1),
  /** Display name (localized via Foundry, passed through). */
  name: z.string().min(1),
  /** Spell level (0 = cantrip, 1-9 = standard). */
  level: z.number().int().min(0).max(9),
  /** School of magic (e.g. `'evocation'`) — used in future detail rows. */
  school: z.string(),
  /** Cast time category for the activation abbreviation column. */
  activation: z.enum(SPELL_ACTIVATION_TYPES),
  /** Range string (e.g. `'36m'`, `'self'`). */
  range: z.string(),
  /** Effect/damage summary (e.g. `'1d10 fuoco'`, `'blocca incantesimo ≤ 3°'`). */
  effect: z.string(),
  /** Whether the spell is currently prepared (shows `◉` glyph). */
  prepared: z.boolean(),
  /** PHB 2024 always-prepared flag (shows `≡` glyph instead of `◉`). */
  alwaysPrepared: z.boolean(),
  /** Whether the spell requires concentration (shows `≀` glyph). */
  concentration: z.boolean(),
});

export type SpellEntry = z.infer<typeof SpellEntrySchema>;

/**
 * Complete spellbook payload — slots + full spell list.
 *
 * `slots` covers all spell levels the character has (levels where max > 0 are
 * rendered as level sections with a slot bar; levels with max === 0 are skipped
 * by the renderer). Level 0 (cantrips) always renders without a slot bar.
 *
 * Uses `z.object` (not `z.strictObject`) for forward-compat — future phases
 * may add pact magic fields without breaking existing consumers.
 */
export const SpellbookSchema = z.object({
  /** Spell slot levels (empty array = non-caster). */
  slots: z.array(SpellSlotSchema),
  /** Full known/prepared spell list (empty array = non-caster). */
  spells: z.array(SpellEntrySchema),
});

export type Spellbook = z.infer<typeof SpellbookSchema>;

/**
 * Canonical 6 dnd5e ability codes in fixed order.
 *
 * Frozen by D&D 5e rules. The list is shared between {@link AbilitiesSchema}
 * (the 6-key container) and {@link SkillSchema}.ability (which references
 * one ability per skill row, e.g. acr → dex). Phase 16 inlined the list
 * verbatim in `AbilitiesSchema`; Phase 17 factors it into a named tuple to
 * enable cross-file reuse without re-litigating the closed set.
 *
 * `AbilitiesSchema` itself is NOT refactored — its verbatim runtime shape
 * is preserved byte-identical (Phase 16 wire contract). This tuple is an
 * additive export only.
 *
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-01-PLAN.md
 */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export const AbilityKeySchema = z.enum(ABILITY_KEYS);

/**
 * Per-ability sub-object — dnd5e 5.x `actor.system.abilities.<k>` prep-time
 * computed projection (Phase 16 Plan 16-01 atomic extension; REQ SHEET-05).
 *
 * Fields are all plain integers (the reader passes through dnd5e's computed
 * totals; we never re-derive `mod` from `value` ourselves so that custom
 * modifiers from feats/race/items are preserved).
 *
 * - `value`      — Raw ability score, 0..30 (standard human 8..18; magical
 *                  enhancements may push to 22+; divine score cap 30).
 * - `mod`        — Ability modifier (`floor((value-10)/2)`); accepts negative
 *                  values (CHA 8 → mod -1; CHA 6 → mod -2).
 * - `save`       — Saving throw modifier (dnd5e prep-time computed total from
 *                  `actor.system.abilities.<k>.save.value`); equals `mod` +
 *                  prof bonus when `proficient === true`, else `mod` alone.
 *                  Negative allowed (CHA 8 not-prof → save -1).
 * - `proficient` — Strict boolean. dnd5e raw value is `0 | 0.5 | 1 | 2` (none/
 *                  half/full/expertise); reader (Plan 16-02) coerces to boolean
 *                  for Main tab consumption. Phase 17 will introduce the full
 *                  numeric for Skills tab glyph spectrum (○/◉/◈).
 * - `dc`         — Spell save DC for this ability (e.g. WIS-based caster DC).
 *                  Primes Spells tab DC binding without a follow-up schema bump.
 *                  Non-spellcaster baseline emits `dc: 10`; the reader computes
 *                  `8 + prof + mod` for caster abilities.
 *
 * Uses `z.object` (NOT `z.strictObject`) for forward-compat per CONTEXT
 * D-Area-1: Phase 17 may add half-prof / expertise fields without breaking
 * Phase 16 consumers that parse existing payloads.
 *
 * Required as a sub-field of {@link AbilitiesSchema} — Pitfall 3 mitigation
 * (Phase 4b atomic-commit pattern): no `.optional()` drift window.
 *
 * @see Specs.md §7.5.2 (Main tab mockup — ability scores + saves)
 * @see https://github.com/foundryvtt/dnd5e — `actor.system.abilities.<k>`
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-CONTEXT.md §Area 1
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-01-PLAN.md Task 2
 */
export const AbilityScoreSchema = z.object({
  /** Raw ability score (0..30 — 0 = incapacitated, 30 = divine cap). */
  value: z.number().int().min(0).max(30),
  /** Ability modifier `floor((value-10)/2)` — negative allowed (low scores). */
  mod: z.number().int(),
  /** Saving throw modifier (dnd5e prep-time computed total) — negative allowed. */
  save: z.number().int(),
  /** Whether the actor is proficient on this ability's save (strict boolean —
   *  reader (Plan 16-02) coerces dnd5e `0|0.5|1|2` numeric → boolean). */
  proficient: z.boolean(),
  /** Spell save DC for this ability (≥ 0; non-caster baseline = 10). */
  dc: z.number().int().min(0),
});

export type AbilityScore = z.infer<typeof AbilityScoreSchema>;

/**
 * Container for all 6 D&D ability scores (Phase 16 Plan 16-01).
 *
 * Keyed by canonical ability codes (`str/dex/con/int/wis/cha`); the 6 keys are
 * frozen by D&D 5e rules — no other ability codes exist in canonical play.
 * Future homebrew/setting extensions (e.g. "Sanity") are non-canonical and
 * out of scope for this schema.
 *
 * Uses `z.strictObject` (not `z.object`) because the 6 keys are a closed
 * enumeration: any unknown ability key on the wire indicates either drift or
 * a malformed payload and MUST reject.
 *
 * Per-ability sub-objects use `z.object` for forward-compat — see
 * {@link AbilityScoreSchema} JSDoc.
 *
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-CONTEXT.md §Area 1
 */
export const AbilitiesSchema = z.strictObject({
  /** Strength — physical might, melee attacks, athletics, carrying capacity. */
  str: AbilityScoreSchema,
  /** Dexterity — agility, ranged attacks, AC (light/medium), initiative. */
  dex: AbilityScoreSchema,
  /** Constitution — endurance, HP per level, concentration saves. */
  con: AbilityScoreSchema,
  /** Intelligence — reasoning, lore, Wizard spellcasting. */
  int: AbilityScoreSchema,
  /** Wisdom — perception, intuition, Cleric/Druid/Ranger spellcasting. */
  wis: AbilityScoreSchema,
  /** Charisma — force of personality, social, Bard/Sorcerer/Warlock/Paladin casting. */
  cha: AbilityScoreSchema,
});

export type Abilities = z.infer<typeof AbilitiesSchema>;

/**
 * Canonical 18 D&D 5e skill codes in fixed order.
 *
 * Frozen by D&D 5e rules — no other skill codes exist in canonical play.
 * Homebrew/setting skills (e.g. Sanity) are out of scope.
 *
 * Order is the dnd5e-system canonical sort (alphabetical by short code),
 * matching the order used by the dnd5e Foundry system at runtime and
 * preserved in the renderer's static `SKILL_NAMES` table.
 *
 * Mapping: acr=Acrobatics, ani=Animal Handling, arc=Arcana, ath=Athletics,
 * dec=Deception, his=History, ins=Insight, itm=Intimidation,
 * inv=Investigation, med=Medicine, nat=Nature, prc=Perception,
 * prf=Performance, per=Persuasion, rel=Religion, slt=Sleight of Hand,
 * ste=Stealth, sur=Survival.
 *
 * @see Specs.md §7.5.3 (Skills tab mockup)
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Specifics
 */
export const SKILL_KEYS = [
  'acr',
  'ani',
  'arc',
  'ath',
  'dec',
  'his',
  'ins',
  'itm',
  'inv',
  'med',
  'nat',
  'prc',
  'prf',
  'per',
  'rel',
  'slt',
  'ste',
  'sur',
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

/**
 * Per-skill sub-object — dnd5e 5.x `actor.system.skills.<k>` prep-time
 * computed projection (Phase 17 Plan 17-01 atomic extension; REQ SHEET-08).
 *
 * Fields:
 * - `total`     — Final skill modifier (ability mod + proficiency bonus +
 *                 item bonuses + feat bonuses + magic). Integer, may be
 *                 negative (CHA-8 character → Persuasione -1).
 * - `ability`   — The ability that drives this skill (e.g. acr → dex,
 *                 arc → int, prc → wis). Closed {@link AbilityKey} enum
 *                 re-using the 6-code set from {@link AbilitiesSchema}.
 * - `proficient`— dnd5e raw proficiency tier: 0 (none) | 0.5 (half) | 1 (full) |
 *                 2 (expertise). Phase 17 renderer uses the full 4-level
 *                 spectrum for ○/◉/★ glyph mapping per UI-SPEC §3
 *                 (half-prof rounds up to ◉). Stored verbatim — reader does
 *                 NOT coerce to boolean (unlike {@link AbilityScoreSchema}
 *                 `.proficient` which IS boolean for Main tab simplicity).
 * - `passive`   — Passive skill score (10 + total under standard 5e rules;
 *                 magic items + Observant feat may add static bonuses, so
 *                 this is read verbatim from dnd5e prep-time, NOT recomputed
 *                 by the reader). Main tab senses line surfaces
 *                 `skills.{prc,ins,inv}.passive` per UI-SPEC §4. Integer
 *                 ≥ 0 (clamped non-negative; D&D passive floor in practice
 *                 is 10 + min mod-5 = 5 but the schema accepts 0 to avoid
 *                 edge-case rejection on heavily debuffed actors).
 *
 * Uses `z.object` (NOT `z.strictObject`) for forward-compat per CONTEXT
 * D-Area-1 atomic-extension precedent: future phases may add `bonus` /
 * `expertise` / `advantage` sibling fields without breaking Phase 17
 * consumers.
 *
 * The schema does NOT cross-validate `passive` against `total` — they are
 * independent integer slots. Real Foundry actors may have magic-item or
 * Observant-feat bonuses on `passive` that don't appear in `total`.
 *
 * Required as a sub-field of {@link SkillsSchema} — Pitfall 3 mitigation
 * (Phase 4b/16 atomic-commit pattern): no `.optional()` drift window.
 *
 * @see Specs.md §7.5.3 (Skills tab mockup)
 * @see https://github.com/foundryvtt/dnd5e — `actor.system.skills.<k>` canonical (INV-2 cross-checked 2026-05-18)
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Area 1
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-01-PLAN.md
 */
export const SkillSchema = z.object({
  /** Final skill modifier (dnd5e prep-time computed total). Integer; negative allowed. */
  total: z.number().int(),
  /** Ability driving this skill (closed AbilityKey enum). */
  ability: AbilityKeySchema,
  /** dnd5e raw proficiency tier 0|0.5|1|2 (closed enum — NOT boolean; renderer
   *  uses full spectrum for ○/◉/★ glyph mapping; half-prof rounds up to ◉). */
  proficient: z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)]),
  /** Passive skill score (dnd5e prep-time computed; ≥ 0). */
  passive: z.number().int().nonnegative(),
});

export type Skill = z.infer<typeof SkillSchema>;

/**
 * Container for all 18 D&D 5e skills (Phase 17 Plan 17-01).
 *
 * Keyed by canonical dnd5e short codes in {@link SKILL_KEYS} order. The 18
 * keys are FROZEN by D&D 5e rules. Homebrew skills are out of scope.
 *
 * Uses `z.strictObject` (not `z.object`) because the 18 keys are a closed
 * enumeration: any unknown skill key on the wire indicates either drift or
 * a malformed payload and MUST reject.
 *
 * Per-skill sub-objects use `z.object` for forward-compat — see
 * {@link SkillSchema} JSDoc.
 *
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Area 1
 */
export const SkillsSchema = z.strictObject({
  /** Acrobatics — DEX-based; balance, tumbling. */
  acr: SkillSchema,
  /** Animal Handling — WIS-based; calming/training animals. */
  ani: SkillSchema,
  /** Arcana — INT-based; arcane lore. */
  arc: SkillSchema,
  /** Athletics — STR-based; climbing, jumping, swimming. */
  ath: SkillSchema,
  /** Deception — CHA-based; lies, misdirection. */
  dec: SkillSchema,
  /** History — INT-based; historical lore. */
  his: SkillSchema,
  /** Insight — WIS-based; reading intentions; passive surfaced on Main tab. */
  ins: SkillSchema,
  /** Intimidation — CHA-based; threats, coercion. */
  itm: SkillSchema,
  /** Investigation — INT-based; clues, deduction; passive surfaced on Main tab. */
  inv: SkillSchema,
  /** Medicine — WIS-based; first aid, diagnosis. */
  med: SkillSchema,
  /** Nature — INT-based; natural lore. */
  nat: SkillSchema,
  /** Perception — WIS-based; awareness; passive surfaced on Main tab. */
  prc: SkillSchema,
  /** Performance — CHA-based; entertainment. */
  prf: SkillSchema,
  /** Persuasion — CHA-based; influence by reason. */
  per: SkillSchema,
  /** Religion — INT-based; religious lore. */
  rel: SkillSchema,
  /** Sleight of Hand — DEX-based; pickpocket, palming. */
  slt: SkillSchema,
  /** Stealth — DEX-based; sneaking. */
  ste: SkillSchema,
  /** Survival — WIS-based; tracking, foraging. */
  sur: SkillSchema,
});

export type Skills = z.infer<typeof SkillsSchema>;

/**
 * A single feat or class feature carried by the character (Phase 22 Plan 22-01; RDATA-03).
 *
 * Validates entries extracted from `actor.items` filtered to `type === 'feat'`.
 * The `category` is stored verbatim from `item.system.type.value` (dnd5e featureTypes
 * taxonomy: `'background'|'class'|'race'|'feat'|'monster'|'supernaturalGift'|etc.`);
 * PHB 2014 feats that lack `system.type.value` fall back to `'general'` in the reader.
 *
 * Uses `z.object` (NOT `z.strictObject`) for forward-compat — matching SpellEntrySchema
 * and AbilityScoreSchema precedents. Extra fields passed on the wire survive without error.
 *
 * @see packages/foundry-module/src/readers/character-reader.ts (extractFeats producer)
 * @see .planning/phases/EVF-22-features-biography-schema-extension/22-CONTEXT.md D-22.2
 * @see .planning/phases/EVF-22-features-biography-schema-extension/22-01-PLAN.md Task 1
 * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/config.mjs — featureTypes taxonomy
 * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/item/fields/item-type-field.mjs
 */
export const FeatEntrySchema = z.object({
  /**
   * Feature category from dnd5e featureTypes taxonomy.
   * Reader value: `item.system.type.value` when non-empty; fallback `'general'` for
   * PHB 2014 items that predate the categorisation system (blank/absent type.value).
   * Open `z.string()` (NOT enum) — dnd5e featureTypes is extensible and the reader
   * passes `system.type.value` verbatim without remapping.
   */
  category: z.string(),
  /**
   * Display name of the feat/feature from `item.name`.
   * min(1): nameless items are dropped by the reader; the schema enforces the invariant.
   */
  name: z.string().min(1),
  /**
   * True for PHB 2024 origin feats: `system.type.value === 'feat'` AND
   * `system.type.subtype === 'origin'`. False for all other feats/features.
   * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/config.mjs — feat subtypes
   */
  isOrigin: z.boolean(),
  /**
   * Short description (HTML-stripped in the reader before wire storage).
   * Reader path: `item.system.description.value`, stripped via `/<[^>]*>/g → ''`.
   * Empty string when description is absent (PHB 2014 items without descriptions).
   */
  description: z.string(),
});
export type FeatEntry = z.infer<typeof FeatEntrySchema>;

/**
 * Character biography fields from `actor.system.details.*` (Phase 22 Plan 22-01; RDATA-04).
 *
 * All five fields are REQUIRED on the sub-object (the reader always provides them as empty
 * strings when the actor fields are absent — empty-string fallback per D-22.4). This avoids
 * partial-object edge cases in the renderer.
 *
 * Uses `z.object` (NOT `z.strictObject`) for forward-compat, matching existing sub-schema
 * patterns (WorldStateSchema, AbilityScoreSchema).
 *
 * Field-name mapping (dnd5e field key → BiographySnapshot key):
 * - `system.details.trait` → `personality`  (labeled "DND5E.PersonalityTraits" in dnd5e; NOT
 *   `system.details.personality` — common pitfall documented in 22-RESEARCH.md Pitfall 2)
 * - `system.details.ideal` → `ideal`
 * - `system.details.bond`  → `bond`
 * - `system.details.flaw`  → `flaw`
 * - `system.details.biography.value` (HTMLField, stripped) → `backstory`
 *
 * @see packages/foundry-module/src/readers/character-reader.ts (extractBiography producer)
 * @see .planning/phases/EVF-22-features-biography-schema-extension/22-CONTEXT.md D-22.4
 * @see .planning/phases/EVF-22-features-biography-schema-extension/22-01-PLAN.md Task 1
 * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/character.mjs
 * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/templates/details.mjs
 */
export const BiographySnapshotSchema = z.object({
  /**
   * Personality traits from `system.details.trait` (NOT `system.details.personality`).
   * CITED: dnd5e character.mjs — field key is `trait`, label "DND5E.PersonalityTraits".
   */
  personality: z.string(),
  /** Character ideals from `system.details.ideal`. */
  ideal: z.string(),
  /** Character bonds from `system.details.bond`. */
  bond: z.string(),
  /** Character flaws from `system.details.flaw`. */
  flaw: z.string(),
  /**
   * Backstory from `system.details.biography.value` (HTMLField, HTML-stripped by reader).
   * T-05-03-02 mirror: biography.value is HTML; stripped before wire payload by extractBiography.
   */
  backstory: z.string(),
});
export type BiographySnapshot = z.infer<typeof BiographySnapshotSchema>;

/**
 * Snapshot of a single player character's mutable game state.
 *
 * Read-only in Phase 2. Write path (HP update, condition apply) deferred to Phase 7.
 *
 * Fields:
 * - `actorId`    — Foundry actor UUID (stable across sessions)
 * - `name`       — Character name (display only)
 * - `hp`         — Current HP (may be negative if `allowNegativeHP` world setting is on)
 * - `maxHp`      — Maximum HP (base + temp max)
 * - `tempHp`     — Temporary HP (may be 0)
 * - `ac`         — Armour Class value
 * - `level`      — Character level (1–20)
 * - `conditions` — Active condition IDs (e.g. `["poisoned", "prone"]`), sourced from
 *                  `actor.statuses` (Foundry v13+ Set<string>)
 * - `exhaustion` — Exhaustion level (0–6; 0 = none); PHB 2024 uses a different scale
 *                  but the Foundry dnd5e 5.x system still stores it as a number
 * - `death`      — Death saving throw counters (`success`/`failure`, each 0..3). REQUIRED.
 *                  Phase 4b addition for the status-hud death-save pivot trigger
 *                  (Plan 05 consumes `DeathSavesSchema` for ergonomic narrowing).
 * - `world`      — World-state sub-object (Phase 5 addition, REQUIRED per atomic-commit
 *                  pattern — see ADR-0002 Phase 2 drift note). Contains `modernRules`
 *                  boolean indicating PHB 2024 mode. Uses open `z.object` for forward-compat
 *                  (Phase 7+ may add more world fields).
 */
export const CharacterSnapshotSchema = z.strictObject({
  actorId: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().int(),
  maxHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  ac: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(20),
  conditions: z.array(z.string()),
  exhaustion: z.number().int().min(0).max(6),
  death: DeathSavesSchema,
  /**
   * World-state sub-object (Phase 5 Plan 05-01 Wave-0 atomic extension).
   * REQUIRED — atomic commit with character-reader closes the drift window.
   */
  world: WorldStateSchema,
  /**
   * Character inventory — all player-visible items from `actor.items.contents`.
   * REQUIRED (Phase 5 Plan 05-04 atomic extension — T-05-04-01 mitigation).
   * Reader filters to recognized item types; unknown types are silently dropped.
   * Empty array = character has no items (valid for fresh actors).
   */
  inventory: z.array(InventoryItemSchema),
  /**
   * Character spellbook — slot levels + full spell list.
   * REQUIRED (Phase 5 Plan 05-04 atomic extension — T-05-04-02 mitigation).
   * Non-casters have `{ slots: [], spells: [] }`.
   */
  spells: SpellbookSchema,
  /**
   * Character ability scores (Phase 16 Plan 16-01 atomic extension; REQ SHEET-05).
   * REQUIRED — atomic commit closes the .optional() drift window (Pitfall 3,
   * Phase 4b precedent). 6-key container `{str,dex,con,int,wis,cha}` each
   * carrying `{value, mod, save, proficient, dc}` per {@link AbilityScoreSchema}.
   *
   * Reader (Plan 16-02) emits defensive defaults for fresh actors lacking
   * `system.abilities`. Renderer (Plan 16-03) replaces `dash` placeholders on
   * the Main tab with formatted values per UI-SPEC §3.
   */
  abilities: AbilitiesSchema,
  /**
   * Character skills (Phase 17 Plan 17-01 atomic extension; REQ SHEET-08).
   * REQUIRED — atomic commit closes the .optional() drift window (Pitfall 3,
   * Phase 4b/16 precedent). 18-key container indexed by dnd5e short codes,
   * each carrying `{total, ability, proficient, passive}` per
   * {@link SkillSchema}.
   *
   * Reader (Plan 17-02) emits defensive defaults for fresh actors lacking
   * `system.skills`. Renderer (Plan 17-03) replaces the hardcoded
   * DEFAULT_SKILLS array with snapshot-driven lookup AND surfaces
   * `skills.{prc,ins,inv}.passive` on the Main tab senses line per
   * UI-SPEC §4. Proficient is preserved as raw 0|0.5|1|2 (NOT coerced to
   * boolean) because the Skills tab uses the full glyph spectrum ○/◉/★;
   * half-prof rounds up to ◉ per UI-SPEC §3.
   */
  skills: SkillsSchema,
  /**
   * Character class display name (Phase 21 Plan 21-01 atomic extension; RDATA-01).
   * REQUIRED — empty string for classless or fresh actors.
   * Multiclass: joined as "Fighter / Wizard" (reader extracts from actor.items
   * filtered to `type === 'class'`).
   * `level` carries the numeric level separately — this field is class name(s) only.
   */
  class: z.string(),
  /**
   * Initiative modifier — dnd5e prep-time computed total (Phase 21; RDATA-02).
   * REQUIRED — integer, may be negative (e.g. DEX-penalised character).
   * Reader path: `actor.system.attributes.init.total ?? 0`.
   */
  initiative: z.number().int(),
  /**
   * Walking speed in feet (Phase 21; RDATA-02).
   * REQUIRED — non-negative integer (standard D&D 5e: 30 ft; dwarves 25 ft).
   * Reader path: `actor.system.attributes.movement.walk ?? 30`.
   * Other movement modes (fly/swim/climb) are deferred to a future phase.
   */
  speed: z.number().int().nonnegative(),
  /**
   * Character feats and features (Phase 22 Plan 22-01 atomic extension; RDATA-03).
   * OPTIONAL — absent when the actor has not yet been synced or has no feat items.
   * Renderers fall back to empty array (`snapshot.feats ?? []`) when absent.
   * FeatEntry[] from `actor.items` filtered to `type === 'feat'`.
   *
   * Pitfall 4 (22-RESEARCH.md): optional on z.strictObject = field may be absent
   * (valid) OR present with declared type (valid); unknown top-level keys still rejected.
   */
  feats: z.array(FeatEntrySchema).optional(),
  /**
   * Character biography (Phase 22 Plan 22-01 atomic extension; RDATA-04).
   * OPTIONAL — absent when all biography fields are empty OR actor not yet synced.
   * Renderer falls back to empty-string per field when absent (D-22.4).
   * HTML-stripped in extractBiography before wire storage (T-22-01/T-22-02 mitigate).
   */
  biography: BiographySnapshotSchema.optional(),
  /**
   * Character portrait URL from `actor.img` (Plan 13-03 — STRETCH-06 optional addition).
   *
   * Optional — omitted entirely for actors where `actor.img` is absent or an empty string.
   * The bridge validates and resolves the URL against the Foundry world origin (T-13-02).
   * NOTE: z.string().min(1) accepts any non-empty string (including relative paths like
   * `worlds/foo/p.webp`) — URL validation is the bridge's responsibility, not the schema's.
   */
  portrait: z.object({ url: z.string().min(1) }).optional(),
});

export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;

/**
 * character.delta envelope type string (discriminant for WS envelope routing).
 *
 * Used by DeltaEmitter to route `updateActor` hook events.
 * Shape identical to CharacterSnapshot (full-replacement per ADR-0002 Phase 2).
 */
export const CHARACTER_DELTA_TYPE = 'character.delta' as const;
