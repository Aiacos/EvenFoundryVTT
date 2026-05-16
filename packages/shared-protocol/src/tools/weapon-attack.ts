/**
 * weapon_attack tool input schema.
 *
 * Allows a player to make a weapon attack from an actor against one or more
 * token targets. The `advantage` field uses the three-way enum rather than
 * a boolean pair to simplify downstream dispatch and keep the JSON Schema
 * self-documenting.
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * `activity.use()` call (or `MidiQOL.completeActivityUse` when present).
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `weapon_attack` tool.
 *
 * - `actor_id`  — Foundry actor document ID.
 * - `item_id`   — Foundry item document ID of the weapon.
 * - `targets`   — Array of token IDs to attack (empty array = no explicit targets).
 * - `advantage` — Roll advantage state (`'normal'` default).
 * - `count`     — Number of attacks (Plan 07-04 MULTI-01). Default 1 = single attack
 *                 (backward-compatible). Max 10 enforces T-07-04-01 DoS limit.
 *                 Extra Attack feature (Fighter L5+, etc.) enables count > 1.
 */
export const WeaponAttackInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),
  targets: z.array(z.string()),
  advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
  count: z.number().int().min(1).max(10).default(1),
});

/** TypeScript type inferred from {@link WeaponAttackInputSchema}. */
export type WeaponAttackInput = z.infer<typeof WeaponAttackInputSchema>;
