/**
 * use_item tool input schema.
 *
 * Allows a player to use a consumable or activated item from an actor's inventory.
 *
 * Phase 03 stub: the bridge dispatches this to the Foundry module which returns
 * `{ status: 'phase-07-pending' }`. Phase 07 replaces the stub with a real
 * `activity.use()` call.
 *
 * @see docs/architecture/0003-tool-registry-pattern.md (ADR-0003)
 * @see Specs.md §5.3 (Tool Registry)
 */

import { z } from 'zod';

/**
 * Input schema for the `use_item` tool.
 *
 * - `actor_id` — Foundry actor document ID.
 * - `item_id`  — Foundry item document ID of the item to use.
 * - `targets`  — Array of token IDs to target (empty array = no explicit targets).
 */
export const UseItemInputSchema = z.object({
  actor_id: z.string().min(1),
  item_id: z.string().min(1),
  targets: z.array(z.string()),
});

/** TypeScript type inferred from {@link UseItemInputSchema}. */
export type UseItemInput = z.infer<typeof UseItemInputSchema>;
