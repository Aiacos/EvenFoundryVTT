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
});

export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;

/**
 * character.delta envelope type string (discriminant for WS envelope routing).
 *
 * Used by DeltaEmitter to route `updateActor` hook events.
 * Shape identical to CharacterSnapshot (full-replacement per ADR-0002 Phase 2).
 */
export const CHARACTER_DELTA_TYPE = 'character.delta' as const;
