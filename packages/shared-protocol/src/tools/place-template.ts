/**
 * place_template tool input schema.
 *
 * Allows a player to place a measured template (AoE indicator) on the scene,
 * anchored to the specified grid coordinates. The `actor_id` + `item_id` pair
 * identifies which spell or ability triggers the template so Phase 07 can
 * resolve template dimensions from the dnd5e activity definition.
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * MeasuredTemplate.create() call.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `place_template` tool.
 *
 * - `actor_id` — Foundry actor document ID (owner of the ability/spell).
 * - `item_id`  — Foundry item document ID (the spell or feature with an AoE).
 * - `x`        — Template origin X coordinate (canvas units).
 * - `y`        — Template origin Y coordinate (canvas units).
 */
export const PlaceTemplateInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/** TypeScript type inferred from {@link PlaceTemplateInputSchema}. */
export type PlaceTemplateInput = z.infer<typeof PlaceTemplateInputSchema>;
