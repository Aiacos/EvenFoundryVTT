/**
 * skill_check tool input schema.
 *
 * Allows a player to request an ability or skill check roll for an actor.
 * The `skill` field accepts any non-empty string so Phase 07 can validate
 * against the dnd5e 5.x system's actual skill list at dispatch time.
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * `actor.rollSkill()` call.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `skill_check` tool.
 *
 * - `actor_id`  — Foundry actor document ID.
 * - `skill`     — Skill identifier string (e.g. `'perception'`, `'stealth'`). Phase 07 validates against dnd5e.
 * - `advantage` — Roll advantage state (`'normal'` default).
 */
export const SkillCheckInputSchema = z.object({
  actor_id: z.string().min(1),
  skill: z.string().min(1),
  advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
});

/** TypeScript type inferred from {@link SkillCheckInputSchema}. */
export type SkillCheckInput = z.infer<typeof SkillCheckInputSchema>;
