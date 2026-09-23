/**
 * Template placement confirmation payload schema — AoE template flow (ACT-02).
 *
 * {@link TemplatePlacementConfirmPayloadSchema} is the argument of the
 * `confirm-template-placement` tool: the module's `confirmTemplatePlacementHandler`
 * uses `placementId` to look up the pending placement context and commits the template.
 *
 * The request/cancel envelopes of the removed bridge flow are gone (ADR-0016: the
 * direct channel has no module → glasses template-placement push).
 *
 * @see packages/foundry-module/src/write-path/handlers/place-template.ts (consumer)
 */

import { z } from 'zod';

// ─── TemplatePlacementConfirmPayloadSchema ─────────────────────────────────────

/**
 * g2-app → Module template placement confirmation payload.
 *
 * Sent by the glasses when the player confirms the template position, as the input of
 * the `confirm-template-placement` tool. The module's
 * `confirmTemplatePlacementHandler` uses `placementId` to look up the pending
 * placement context and commits the template via
 * `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])`.
 *
 * Fields:
 * - `placementId`    — UUID v4 returned by `place-template`
 *                      (same UUID for all templates in one spell session)
 * - `templateIndex`  — Index of the template being confirmed (0-based)
 * - `x`             — Confirmed canvas X coordinate (scene units)
 * - `y`             — Confirmed canvas Y coordinate (scene units)
 *
 * Strict-object: extra fields rejected. Coordinates allow any numeric value
 * (negative allowed for edge cases; Foundry validates scene bounds on update).
 *
 * @see T-07-03-01: placementId UUID is unguessable; templateIndex range validated by handler
 * @see T-07-03-03: x/y validated by Foundry's createEmbeddedDocuments, not by EVF
 */
export const TemplatePlacementConfirmPayloadSchema = z.strictObject({
  placementId: z.string().uuid(),
  templateIndex: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
});

export type TemplatePlacementConfirmPayload = z.infer<typeof TemplatePlacementConfirmPayloadSchema>;
