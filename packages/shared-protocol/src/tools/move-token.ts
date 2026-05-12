/**
 * move_token tool input schema.
 *
 * Allows a player to move a token to a specific grid coordinate. The `x` and
 * `y` values are grid-space coordinates (integers in Foundry canvas units).
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * Token.update() call.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `move_token` tool.
 *
 * - `token_id` — Foundry token document ID.
 * - `x`        — Target grid X coordinate (canvas units).
 * - `y`        — Target grid Y coordinate (canvas units).
 */
export const MoveTokenInputSchema = z.object({
  token_id: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

/** TypeScript type inferred from {@link MoveTokenInputSchema}. */
export type MoveTokenInput = z.infer<typeof MoveTokenInputSchema>;
