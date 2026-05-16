/**
 * castSpellHandler — Phase 7 Plan 02 (Wave 1) write-path handler.
 *
 * Resolves an actor + spell item + spell activity, then calls
 * `activity.use({ configure: false })` via the dnd5e 5.x Activity API.
 *
 * Single-workflow-origin discipline (ADR-0011): this file is the ONLY place
 * in the EVF codebase that calls `activity.use()` for spell casting.
 * CI Gate 8 prevents `activity.use(` from appearing in g2-app or bridge.
 *
 * # Error codes
 * - `actor_not_found`   — `args.actor_id` not in `game.actors`
 * - `item_not_found`    — `args.spell_id` not in `actor.items.contents`
 * - `no_activity`       — `item.system.activities?.contents[0]` is undefined
 * - `no_gm_connected`   — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`         — any other dnd5e error (string from caught Error)
 *
 * # Threat model
 * T-07-02-01: actor ownership validated upstream by dispatchTool (bearer-bound
 * idempotency key). Handler validates actor + item exist — returns typed error
 * codes, never game-state info (T-07-02-03 constant-shape errors).
 * T-07-02-02: no token-position mutation in this handler (cast-spell only).
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { CastSpellInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Defensively extracts a chat card ID from an activity.use() result.
 *
 * dnd5e 5.x activity.use() resolves to a ChatMessage-like object on success.
 * The exact shape is version-specific; we defensively read `.id` and return
 * `null` if the shape doesn't match (non-critical — audit log captures result).
 *
 * @param result - The raw return value from activity.use()
 * @returns Chat card document ID string or null
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
 * Detects a GM-offline signal from a thrown error.
 *
 * socketlib.executeAsGM rejects with a message containing "No connected GM"
 * (or similar) when no GM client is available. We normalise this to the
 * `no_gm_connected` error code so the bridge can return HTTP 503 (Pitfall 5).
 *
 * @param err - The caught error value
 * @returns true if the error indicates no GM is connected
 */
function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<CastSpellInput> for the 'cast-spell' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('cast-spell', castSpellHandler)`
 * in `handlers/index.ts` at module-load time.
 */
export const castSpellHandler: ToolHandler<(typeof CastSpellInputSchema)['_input']> = {
  argsSchema: CastSpellInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve spell item by spell_id
    const item = actor.items?.contents.find((i) => i.id === args.spell_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first activity on the spell item
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
