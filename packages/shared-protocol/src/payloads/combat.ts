/**
 * CombatSnapshot Zod schema — dnd5e 5.x combat tracker read shape.
 *
 * Covers `game.combat` state: current round/turn, active combatant, all combatants.
 * Dual-edition aware (PHB 2014 + PHB 2024): initiative, HP, and name are edition-stable.
 *
 * Null result from bridge (no active combat) → HTTP 204 (no content).
 *
 * @see Specs.md §4 (read pipeline), FOUN-01 (getCombatState reader contract)
 * @see packages/foundry-module/src/readers/combat-reader.ts (producer)
 * @see 02-05-PLAN.md Task 1 (CombatSnapshotSchema spec)
 */
import { z } from 'zod';

/**
 * Concentration sub-object for a combatant who is concentrating on a spell.
 *
 * Sourced from `actor.effects` — finds the effect with
 * `flags?.dnd5e?.concentrating === true` (RESEARCH §Pattern 4 assumption A2).
 * `spellName` is the effect name (truncated at 12 chars by the renderer, not here).
 * `duration` is the effect duration label (truncated at 6 chars by the renderer).
 *
 * Uses open `z.object` for forward-compat (Phase 7+ may add a spellId field).
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
 * @see 05-UI-SPEC.md §5.8 — concentration sub-line format
 */
export const ConcentrationSchema = z.object({
  /** Name of the concentration spell (raw, not truncated). */
  spellName: z.string(),
  /** Duration label from the effect (e.g. '1m', '8h', 'conc'). */
  duration: z.string(),
});

export type Concentration = z.infer<typeof ConcentrationSchema>;

/**
 * A single combatant entry in the combat tracker.
 *
 * `isCurrentTurn` is derived from `combat.turn === index` at snapshot time.
 * `hp` / `maxHp` are read from the linked actor (null if combatant has no actor).
 * `concentration` is an optional sub-object present when the combatant is actively
 * concentrating on a spell (Phase 5 Plan 05-01 addition).
 */
export const CombatantSchema = z.strictObject({
  /** Combatant ID (foundry combatant document ID). */
  id: z.string().min(1),
  /** Display name for this combatant. */
  name: z.string().min(1),
  /** Linked actor ID (null for token-only combatants). */
  actorId: z.string().nullable(),
  /** Initiative roll result (null if not yet rolled). */
  initiative: z.number().nullable(),
  /** Current HP (null if actor not linked). */
  hp: z.number().int().nullable(),
  /** Maximum HP (null if actor not linked). */
  maxHp: z.number().int().nonnegative().nullable(),
  /** Whether it is this combatant's turn right now. */
  isCurrentTurn: z.boolean(),
  /**
   * Active concentration spell (Phase 5 Plan 05-01 addition).
   * Present only when `actor.effects` contains an effect with
   * `flags.dnd5e.concentrating === true`. Optional — most combatants are not concentrating.
   */
  concentration: ConcentrationSchema.optional(),
});

export type Combatant = z.infer<typeof CombatantSchema>;

/**
 * Snapshot of the active combat encounter.
 *
 * Returned by `GET /v1/combat/current`.
 * Returns 204 (null snapshot) when `game.combat` is null.
 */
export const CombatSnapshotSchema = z.strictObject({
  /** Foundry combat document ID. */
  combatId: z.string().min(1),
  /** Current round number (1-indexed). */
  round: z.number().int().nonnegative(),
  /** Current turn index within the round (0-indexed). */
  turn: z.number().int().nonnegative(),
  /** ID of the combatant whose turn it is (null between rounds). */
  currentCombatantId: z.string().nullable(),
  /** All combatants in initiative order. */
  combatants: z.array(CombatantSchema),
});

export type CombatSnapshot = z.infer<typeof CombatSnapshotSchema>;

/**
 * combat.turn delta envelope type (emitted by updateCombat hook).
 * combat.state delta envelope type (emitted by combatStart hook).
 */
export const COMBAT_TURN_DELTA_TYPE = 'combat.turn' as const;
export const COMBAT_STATE_DELTA_TYPE = 'combat.state' as const;

/**
 * combat.targets delta payload — emitted by targetToken hook (FOUN-04).
 *
 * Read-only in Phase 2. Write path (setTargets mutation) deferred to Phase 7.
 */
export const CombatTargetsPayloadSchema = z.strictObject({
  /** Foundry user ID who changed their targets. */
  userId: z.string().min(1),
  /** Targeted tokens at the time of emission. */
  targets: z.array(
    z.strictObject({
      tokenId: z.string().min(1),
      actorId: z.string().nullable(),
      name: z.string(),
    }),
  ),
});

export type CombatTargetsPayload = z.infer<typeof CombatTargetsPayloadSchema>;

export const COMBAT_TARGETS_DELTA_TYPE = 'combat.targets' as const;
