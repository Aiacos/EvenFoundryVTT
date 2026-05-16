/**
 * weaponAttackHandler — Phase 7 Plan 02 (Wave 1) write-path handler.
 *
 * Resolves an actor + weapon item + attack-type activity, then calls
 * `activity.use({ configure: false })` via the dnd5e 5.x Activity API.
 *
 * Single attack path only — multi-attack `count` parameter ships in Plan 07-04.
 * DO NOT add `count` to this handler; that is Plan 07-04's surface.
 *
 * Activity lookup pattern: `item.system.activities?.contents.find(a => a.type === 'attack')`
 * (RESEARCH Pattern 2 — weapon items may have multiple activities; we locate the
 * first attack-type activity).
 *
 * # Error codes
 * - `actor_not_found`     — `args.actor_id` not in `game.actors`
 * - `item_not_found`      — `args.item_id` not in `actor.items.contents`
 * - `no_attack_activity`  — no activity with `type === 'attack'` found on item
 * - `no_gm_connected`     — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`           — any other dnd5e error
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md Pattern 2
 */

import { WeaponAttackInputSchema } from '@evf/shared-protocol';
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
 * Implements ToolHandler<WeaponAttackInput> for the 'weapon-attack' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('weapon-attack', weaponAttackHandler)`
 * in `handlers/index.ts` at module-load time.
 *
 * Plan 07-04 will extend this handler to support multi-attack `count` parameter.
 * This plan ships the single-attack path only (default count = 1).
 */
export const weaponAttackHandler: ToolHandler<(typeof WeaponAttackInputSchema)['_input']> = {
  argsSchema: WeaponAttackInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve weapon item by item_id
    const item = actor.items?.contents.find((i) => i.id === args.item_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first attack-type activity on the weapon item
    // Pattern 2: weapon items may have multiple activities; we find the first 'attack' type.
    const activity = item.system.activities?.contents.find((a) => a.type === 'attack');
    if (activity === undefined) {
      return { success: false, error: 'no_attack_activity' };
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
