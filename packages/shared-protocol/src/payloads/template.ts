/**
 * Template placement envelope payload schemas — Phase 7 Plan 03 AoE template flow.
 *
 * Defines the three envelope payloads exchanged when a player places an AoE
 * template during spell casting (ACT-02 — AoE template placement):
 *
 * - {@link TemplatePlacementRequestedPayloadSchema} — Module → g2-app:
 *   Emitted by `placeTemplateHandler` after calling `AbilityTemplate.fromActivity(activity)`
 *   (synchronous per RESEARCH §Q2). Bridge fans out one envelope per template index.
 *   g2-app receives it, mounts {@link TemplatePlacementPanel} at z=2.
 *
 * - {@link TemplatePlacementConfirmPayloadSchema} — g2-app → Module (via tool.invoke):
 *   Emitted by the {@link TemplatePlacementPanel} when R1 tap confirms position.
 *   The module's `confirmTemplatePlacementHandler` uses `placementId` to look up the
 *   pending placement context and calls `canvas.scene.createEmbeddedDocuments`.
 *
 * - {@link TemplatePlacementCancelPayloadSchema} — g2-app → Module:
 *   Emitted by {@link TemplatePlacementPanel} when R1 long-press cancels placement.
 *   Module discards the placement context; no template is committed.
 *
 * # Critical design rules (RESEARCH §Q2 + Pitfall 3)
 * - `AbilityTemplate.fromActivity()` is SYNCHRONOUS — never await it.
 * - `drawPreview()` is NEVER called — incompatible with R1 input model.
 * - Multi-template spells (Magic Missile = 3 templates) send one `requested` envelope
 *   per template; g2-app shows the panel for each sequentially.
 *
 * Carrier shape: all payloads ride inside the canonical {@link EnvelopeSchema}
 * (`proto: 'evf-v1'` / `seq` / `ts` / `type` / `session_id` (UUID) / `payload`).
 * The type constants are the discriminant strings on `envelope.type`.
 *
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2 (fromActivity sync + bypass drawPreview)
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-CONTEXT.md §Area 2 (AoE flow)
 * @see packages/foundry-module/src/write-path/handlers/place-template.ts (producer)
 * @see packages/g2-app/src/panels/template-placement-panel.ts (consumer/emitter)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 */

import { z } from 'zod';

// ─── TemplatePlacementRequestedPayloadSchema ───────────────────────────────────

/**
 * Module → g2-app template placement request payload.
 *
 * Emitted once per template index when `placeTemplateHandler` processes a
 * spell with AoE templates. The bridge reads the handler's response array and
 * fans out one envelope per `templateIndex`.
 *
 * Fields:
 * - `placementId`    — UUID v4 minted by the module, stable for the entire
 *                      multi-template placement session (all indices of one spell
 *                      share the same `placementId`). Stored in PLACEMENT_CONTEXTS
 *                      Map (60s TTL) so `confirmTemplatePlacementHandler` can look
 *                      up the template array.
 * - `spellName`      — Display name of the AoE spell (e.g. `"Fireball"`)
 * - `templateIndex`  — 0-based index of this specific template in the session
 * - `total`          — Total number of templates to place for this spell (min 1)
 * - `type`           — Template shape per dnd5e MeasuredTemplate types:
 *                      `'circle'` | `'cone'` | `'rect'` | `'ray'`
 * - `distance`       — Template radius/length in scene units (feet)
 * - `angle`          — Cone angle in degrees (only present for `type: 'cone'`)
 *
 * Strict-object: extra fields are rejected (no forward-compatible extension here —
 * the payload is a synchronous Foundry API mirror, unlikely to expand).
 */
export const TemplatePlacementRequestedPayloadSchema = z.strictObject({
  placementId: z.string().uuid(),
  spellName: z.string(),
  templateIndex: z.number().int().min(0),
  total: z.number().int().min(1),
  type: z.enum(['circle', 'cone', 'rect', 'ray']),
  distance: z.number().positive(),
  angle: z.number().positive().optional(),
});

export type TemplatePlacementRequestedPayload = z.infer<
  typeof TemplatePlacementRequestedPayloadSchema
>;

/**
 * Wire-protocol discriminant for {@link TemplatePlacementRequestedPayloadSchema}.
 *
 * Routed on `envelope.type` by the g2-app `template-placement-dispatcher.ts`
 * → mounts {@link TemplatePlacementPanel} at z=2.
 */
export const TEMPLATE_PLACEMENT_REQUESTED_TYPE = 'template.placement.requested' as const;

// ─── TemplatePlacementConfirmPayloadSchema ─────────────────────────────────────

/**
 * g2-app → Module template placement confirmation payload.
 *
 * Emitted by the g2-app {@link TemplatePlacementPanel} when the player taps R1
 * to confirm the current cursor position. Rides inside a `tool.invoke` envelope
 * (toolId: `'confirm-template-placement'`). The module's
 * `confirmTemplatePlacementHandler` uses `placementId` to look up the pending
 * placement context and commits the template via
 * `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])`.
 *
 * Fields:
 * - `placementId`    — UUID v4 from the preceding `template.placement.requested`
 *                      envelope (same UUID for all templates in one spell session)
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

/**
 * Wire-protocol discriminant for {@link TemplatePlacementConfirmPayloadSchema}.
 *
 * Used by the g2-app `TemplatePlacementPanel` when constructing the outgoing
 * `tool.invoke` envelope's payload type field.
 */
export const TEMPLATE_PLACEMENT_CONFIRMED_TYPE = 'template.placement.confirmed' as const;

// ─── TemplatePlacementCancelPayloadSchema ──────────────────────────────────────

/**
 * g2-app → Module template placement cancellation payload.
 *
 * Emitted by the g2-app {@link TemplatePlacementPanel} when the player performs
 * R1 long-press to cancel the placement. The module discards the placement context
 * (PLACEMENT_CONTEXTS.delete(placementId)) and no template is committed to the scene.
 *
 * Fields:
 * - `placementId` — UUID v4 from the preceding `template.placement.requested`
 *                   envelope (identifies which session to cancel)
 *
 * Strict-object: extra fields rejected. Minimal payload — only the context key needed.
 */
export const TemplatePlacementCancelPayloadSchema = z.strictObject({
  placementId: z.string().uuid(),
});

export type TemplatePlacementCancelPayload = z.infer<typeof TemplatePlacementCancelPayloadSchema>;

/**
 * Wire-protocol discriminant for {@link TemplatePlacementCancelPayloadSchema}.
 *
 * Used by the g2-app `TemplatePlacementPanel` when constructing the outgoing
 * cancel envelope.
 */
export const TEMPLATE_PLACEMENT_CANCEL_TYPE = 'template.placement.cancel' as const;
