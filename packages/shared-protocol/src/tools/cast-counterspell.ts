/**
 * CastCounterspellInputSchema — ACT-04 reaction handler input schema.
 *
 * Used by the `cast-counterspell` socketlib handler (Plan 13-01 — ACT-04).
 * Counterspell is a level-3 abjuration spell that costs 1 reaction.
 * Upcast is permitted (3..9 slots; increases auto-fail threshold in 2014 PHB).
 *
 * Fields:
 * - `actor_id`         — Foundry Actor document ID of the player casting Counterspell.
 * - `activity_id`      — Optional specific activity ID (defensive resolver in handler
 *                        falls back to `system.identifier === 'counterspell'` when absent).
 * - `slot_level`       — Spell slot level (3..9, default 3). Upcast allowed per D-13-02.
 * - `target_caster_id` — Actor ID of the caster being countered. Captured for audit/
 *                        repudiation purposes only; NOT consumed by activity.use().
 *                        (T-13-04b mitigation — dispatchTool audit log records this.)
 *
 * Strict-object: extra fields are rejected (T-13-04a).
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-counterspell.ts (handler)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1 (D-13-02)
 */
import { z } from 'zod';

/**
 * Zod schema for the `cast-counterspell` handler arguments.
 *
 * `slot_level` defaults to 3 (minimum level for Counterspell); max 9.
 * `target_caster_id` is required for audit trail (T-13-04b).
 * Strict-object rejects extra properties (T-13-04a mitigation).
 */
export const CastCounterspellInputSchema = z
  .object({
    actor_id: z.string().min(1),
    activity_id: z.string().min(1).optional(),
    slot_level: z.number().int().min(3).max(9).default(3),
    target_caster_id: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link CastCounterspellInputSchema}. */
export type CastCounterspellInput = z.infer<typeof CastCounterspellInputSchema>;
