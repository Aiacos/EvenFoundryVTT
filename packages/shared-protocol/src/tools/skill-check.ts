/**
 * skill_check tool input schema: a skill check, an ability check or a saving throw
 * rolled for the paired actor (self-initiated, or answering a GM roll-request card —
 * same `kind` / `ability` / `skill` vocabulary as {@link RollRequestPayloadSchema}).
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see packages/foundry-module/src/write-path/handlers/skill-check.ts (handler)
 */

import { z } from 'zod';
import { AbilityKeySchema } from '../payloads/character.js';

/**
 * Input schema for the `skill_check` tool.
 *
 * - `actor_id`  — Foundry actor document ID.
 * - `kind`      — `skill` (default) → `Actor5e#rollSkill`, `check` → `rollAbilityCheck`,
 *                 `save` → `rollSavingThrow`.
 * - `skill`     — dnd5e skill code (e.g. `'prc'`); required for `kind: 'skill'`.
 * - `ability`   — ability key (`str` … `cha`); required for `check` / `save`, optional
 *                 override of the skill's ability otherwise.
 * - `advantage` — Roll advantage state (`'normal'` default).
 */
export const SkillCheckInputSchema = z
  .object({
    actor_id: z.string().min(1),
    kind: z.enum(['skill', 'check', 'save']).default('skill'),
    skill: z.string().min(1).optional(),
    ability: AbilityKeySchema.optional(),
    advantage: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'skill' && v.skill === undefined) {
      ctx.addIssue({ code: 'custom', path: ['skill'], message: 'skill is required' });
    }
    if (v.kind !== 'skill' && v.ability === undefined) {
      ctx.addIssue({ code: 'custom', path: ['ability'], message: 'ability is required' });
    }
  });

/** TypeScript type inferred from {@link SkillCheckInputSchema}. */
export type SkillCheckInput = z.infer<typeof SkillCheckInputSchema>;
