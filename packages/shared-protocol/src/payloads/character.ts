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
});

export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;

/**
 * character.delta envelope type string (discriminant for WS envelope routing).
 *
 * Used by DeltaEmitter to route `updateActor` hook events.
 * Shape identical to CharacterSnapshot (full-replacement per ADR-0002 Phase 2).
 */
export const CHARACTER_DELTA_TYPE = 'character.delta' as const;
