/**
 * useItemHandler — Phase 7 Plan 02 (Wave 1) write-path handler.
 *
 * Resolves an actor + item + first activity, then calls
 * `activity.use({ configure: false })` via the dnd5e 5.x Activity API.
 *
 * Use-item covers consumables and other activated items (not spells).
 * Activity lookup: `item.system.activities?.contents[0]` — first activity
 * regardless of type (consumables typically have a single 'utility' or
 * 'save' activity).
 *
 * # Error codes
 * - `actor_not_found`   — `args.actor_id` not in `game.actors`
 * - `item_not_found`    — `args.item_id` not in `actor.items.contents`
 * - `no_activity`       — `item.system.activities?.contents[0]` is undefined
 * - `no_gm_connected`   — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`         — any other dnd5e error
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { UseItemInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Defensively extracts a chat card ID from an activity.use() result.
 */
function extractChatCardId(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === 'object' &&
    'id' in result &&
    typeof (result as Record<string, unknown>).id === 'string'
  ) {
    return (result as { id: string }).id;
  }
  return null;
}

/**
 * Detects a GM-offline signal from a thrown error (Pitfall 5).
 */
function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<UseItemInput> for the 'use-item' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('use-item', useItemHandler)`
 * in `handlers/index.ts` at module-load time.
 */
export const useItemHandler: ToolHandler<(typeof UseItemInputSchema)['_input']> = {
  argsSchema: UseItemInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve item by item_id
    const item = actor.items?.contents.find((i) => i.id === args.item_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first activity on the item (any type — use-item is type-agnostic)
    const activity = item.system.activities?.contents[0];
    if (activity === undefined) {
      return { success: false, error: 'no_activity' };
    }

    // Step 4: invoke activity.use() — wrapped in try/catch for error normalisation
    try {
      const result = await activity.use({ configure: false });
      return { success: true, data: { chatCardId: extractChatCardId(result) } };
    } catch (err) {
      if (isNoGmError(err)) {
        return { success: false, error: 'no_gm_connected' };
      }
      return { success: false, error: String(err) };
    }
  },
};
