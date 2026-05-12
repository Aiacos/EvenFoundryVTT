/**
 * cast_spell tool input schema.
 *
 * Allows a player to cast a spell from an actor's spell list at one or more
 * token targets. The `slot_level` field accepts 0 as the edition-agnostic
 * cantrip / at-will marker (works for both PHB 2014 and PHB 2024 per Specs.md §11.5.1).
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
 * Input schema for the `cast_spell` tool.
 *
 * - `actor_id`   — Foundry actor document ID (non-empty string; Phase 07 validates against game state).
 * - `spell_id`   — Foundry item document ID of the spell being cast.
 * - `slot_level` — Spell slot level to expend (0 = cantrip / at-will).
 * - `targets`    — Array of token IDs to target (empty array = no explicit targets).
 */
export const CastSpellInputSchema = z.object({
  actor_id: z.string().min(1),
  spell_id: z.string().min(1),
  slot_level: z.number().int().min(0).max(9),
  targets: z.array(z.string()),
});

/** TypeScript type inferred from {@link CastSpellInputSchema}. */
export type CastSpellInput = z.infer<typeof CastSpellInputSchema>;
