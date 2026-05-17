/**
 * CastShieldInputSchema — ACT-04 reaction handler input schema.
 *
 * Used by the `cast-shield` socketlib handler (Plan 13-01 — ACT-04).
 * Shield is a level-1 abjuration spell that costs 1 reaction; no upcast support
 * in MVP (D-13-01 — Shield does not benefit from upcasting).
 *
 * Fields:
 * - `actor_id`    — Foundry Actor document ID of the player character casting Shield.
 * - `activity_id` — Optional specific activity ID when the actor has multiple Shield
 *                   spell entries (defensive resolver in castShieldHandler falls back
 *                   to `system.identifier === 'shield'` when absent).
 * - `slot_level`  — Spell slot level (fixed at 1, no upcast). Default: 1.
 *
 * Strict-object: extra fields are rejected (T-13-04a).
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-shield.ts (handler)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 1 (D-13-01)
 */
import { z } from 'zod';

/**
 * Zod schema for the `cast-shield` handler arguments.
 *
 * `actor_id` and optional `activity_id` are non-empty strings.
 * `slot_level` is always 1 (Shield is level-1 only; no upcast in MVP).
 * Strict-object rejects extra properties (T-13-04a mitigation).
 */
export const CastShieldInputSchema = z
  .object({
    actor_id: z.string().min(1),
    activity_id: z.string().min(1).optional(),
    slot_level: z.number().int().min(1).max(1).default(1),
  })
  .strict();

/** TypeScript type inferred from {@link CastShieldInputSchema}. */
export type CastShieldInput = z.infer<typeof CastShieldInputSchema>;
