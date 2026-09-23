/**
 * GM roll request payload — a dnd5e "roll request" chat card (check, skill or saving
 * throw asked by the GM) relayed to the glasses so the sheet can switch to the
 * «Tiri salvezza · Abilità» page by itself (docs/design/g2-sheet-ux.html §Pagina
 * automatica, S8).
 *
 * Producer: the GM projector parses `[data-action="rollRequest"]` buttons of new chat
 * messages (dnd5e `enrichers.mjs` `handlePostRequest` → `roll-request-card.hbs`, button
 * dataset `type`, `ability`, `skill`, `dc`).
 *
 * @see https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/enrichers.mjs (handlePostRequest, createRequestButton — verified 2026-09-23)
 */
import { z } from 'zod';
import { AbilityKeySchema, SKILL_KEYS } from './character.js';

/** Delta topic carrying {@link RollRequestPayload}. */
export const R1_ROLL_REQUEST_TYPE = 'r1.roll.request' as const;

export const RollRequestPayloadSchema = z.strictObject({
  /** Chat message id of the request card (dedupe). */
  messageId: z.string().min(1).max(64),
  /** `save` = saving throw, `check` = ability check, `skill` = skill check. */
  kind: z.enum(['save', 'check', 'skill']),
  /** Ability of a save / check (and of a skill when the card states it). */
  ability: AbilityKeySchema.optional(),
  /** dnd5e skill code for `skill` requests. */
  skill: z.enum(SKILL_KEYS).optional(),
  /** Difficulty class when the GM made it visible on the card. */
  dc: z.number().int().min(0).max(99).optional(),
});
export type RollRequestPayload = z.infer<typeof RollRequestPayloadSchema>;
