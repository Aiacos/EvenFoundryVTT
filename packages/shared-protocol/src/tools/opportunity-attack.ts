/**
 * OpportunityAttackInputSchema — ACT-04 reaction handler input schema.
 *
 * Used by the `opportunity-attack` socketlib handler (Plan 13-01 — ACT-04).
 * Opportunity Attack is a built-in 5e Reaction: when a hostile creature leaves
 * the player's reach, the player may use their Reaction to make ONE melee weapon
 * attack. Per D-13-03, `item_id` is required (explicit weapon, no auto-pick —
 * determinism first).
 *
 * Fields:
 * - `actor_id`  — Foundry Actor document ID of the player making the opportunity attack.
 * - `item_id`   — Explicit weapon Item document ID (no auto-pick; determinism per D-13-03).
 * - `target_id` — Token document ID of the fleeing target. Captured for audit/repudiation;
 *                 NOT consumed directly by activity.use() (T-13-04b mitigation).
 *
 * Strict-object: extra fields are rejected (T-13-04a).
 *
 * @see packages/foundry-module/src/write-path/handlers/opportunity-attack.ts (handler)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1 (D-13-03)
 */
import { z } from 'zod';

/**
 * Zod schema for the `opportunity-attack` handler arguments.
 *
 * All three fields are non-empty strings.
 * Strict-object rejects extra properties (T-13-04a mitigation).
 */
export const OpportunityAttackInputSchema = z
  .object({
    actor_id: z.string().min(1),
    item_id: z.string().min(1),
    target_id: z.string().min(1),
  })
  .strict();

/** TypeScript type inferred from {@link OpportunityAttackInputSchema}. */
export type OpportunityAttackInput = z.infer<typeof OpportunityAttackInputSchema>;
