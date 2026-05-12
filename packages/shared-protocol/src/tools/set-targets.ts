/**
 * set_targets tool input schema.
 *
 * Allows a player to set the active target list on the Foundry canvas for a
 * user (defaulting to the current user if `user_id` is omitted). Token IDs
 * must be non-empty strings; Phase 07 validates them against active tokens.
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * TokenLayer targets update.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `set_targets` tool.
 *
 * - `token_ids` — Array of Foundry token document IDs to target.
 * - `user_id`   — Optional Foundry user document ID; defaults to the GM user on the module side.
 */
export const SetTargetsInputSchema = z.object({
  token_ids: z.array(z.string()),
  user_id: z.string().min(1).optional(),
});

/** TypeScript type inferred from {@link SetTargetsInputSchema}. */
export type SetTargetsInput = z.infer<typeof SetTargetsInputSchema>;
