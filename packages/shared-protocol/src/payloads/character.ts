/**
 * CharacterSnapshot Zod schema — dnd5e 5.x actor read shape.
 *
 * Dual-edition aware (PHB 2014 + PHB 2024 via `core.modernRules`):
 * - `conditions` is read from `actor.statuses` (Set<string>) — same across editions.
 * - `level` is from `actor.system.details.level` — same across editions.
 * - HP/AC are from `actor.system.attributes.*` — same across editions.
 *
 * This is a full-replacement delta (ADR-0002 §Phase 2): no field-level diff.
 * Phase 5 narrows to field-level deltas when the payload union arms are filled.
 *
 * @see docs/architecture/0002-protocol-versioning.md (WS envelope + delta semantics)
 * @see Specs.md §4 (read pipeline), §3.4 (Foundry compat ≥13.347)
 * @see packages/foundry-module/src/readers/character-reader.ts (producer)
 * @see 02-05-PLAN.md Task 1 (CharacterSnapshotSchema spec)
 */
import { z } from 'zod';

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
});

export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;

/**
 * character.delta envelope type string (discriminant for WS envelope routing).
 *
 * Used by DeltaEmitter to route `updateActor` hook events.
 * Shape identical to CharacterSnapshot (full-replacement per ADR-0002 Phase 2).
 */
export const CHARACTER_DELTA_TYPE = 'character.delta' as const;
