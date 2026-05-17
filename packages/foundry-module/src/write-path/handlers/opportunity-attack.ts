/**
 * opportunityAttackHandler — Phase 13 Plan 01 (ACT-04) reaction handler.
 *
 * Resolves an actor + explicit weapon item + attack-type activity, then calls
 * `activity.use({ configure: false, consume: { action: false } }, { flags: { dnd5e: { opportunityAttack: true } } })`.
 *
 * # Opportunity Attack rules (D-13-03)
 * - Does NOT consume the player's Action slot (`consume.action: false`).
 * - DOES consume the Reaction slot (tracked by combat-action-tracker via audit log).
 * - `flags.dnd5e.opportunityAttack: true` marker sets chat card flavor text.
 * - `item_id` is required (explicit weapon — no auto-pick for determinism).
 * - `target_id` is captured for audit/repudiation but NOT consumed by activity.use().
 *
 * # Error codes
 * - `actor_not_found`    — `args.actor_id` not in `game.actors`
 * - `item_not_found`     — `args.item_id` not in `actor.items.contents`
 * - `no_attack_activity` — item has activities but none with `type === 'attack'`
 * - `no_gm_connected`    — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`          — any other dnd5e error
 *
 * Single-workflow-origin discipline (ADR-0011): this file is the ONLY place
 * in the EVF codebase that calls `activity.use()` for Opportunity Attack.
 * CI Gate 8 prevents `activity.use(` from appearing in g2-app or bridge.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-03)
 */

import { OpportunityAttackInputSchema } from '@evf/shared-protocol';
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
 * Implements ToolHandler<OpportunityAttackInput> for the 'opportunity-attack' reaction tool.
 *
 * Registered via `registerToolHandler('opportunity-attack', opportunityAttackHandler)` in
 * `handlers/index.ts` at module-load time.
 *
 * @see @evf/shared-protocol/src/tools/opportunity-attack.ts (OpportunityAttackInputSchema)
 */
export const opportunityAttackHandler: ToolHandler<
  (typeof OpportunityAttackInputSchema)['_input']
> = {
  argsSchema: OpportunityAttackInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve explicit weapon item by item_id (D-13-03 — determinism: no auto-pick)
    const item = actor.items?.contents.find((i) => i.id === args.item_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first attack-type activity on the weapon
    type AttackActivity = {
      type?: string;
      use: (cfg: unknown, msgCfg?: unknown) => Promise<unknown>;
    };
    const itemSystem = (item as unknown as Record<string, unknown>).system as
      | { activities?: { contents?: AttackActivity[] } }
      | undefined;
    const activity = itemSystem?.activities?.contents?.find((a) => a.type === 'attack');
    if (activity === undefined) {
      return { success: false, error: 'no_attack_activity' };
    }

    // Step 4: invoke activity.use — two-arg form for opportunityAttack flag
    // consume.action: false — OA does NOT consume the Action slot (only Reaction).
    // messageConfig flags.dnd5e.opportunityAttack: true — chat card flavor text.
    try {
      const result = await activity.use(
        { configure: false, consume: { action: false } },
        { flags: { dnd5e: { opportunityAttack: true } } },
      );
      return {
        success: true,
        data: {
          chatCardId: extractChatCardId(result),
          target_id: args.target_id, // echoed for audit/repudiation
        },
      };
    } catch (err) {
      if (isNoGmError(err)) {
        return { success: false, error: 'no_gm_connected' };
      }
      return { success: false, error: String(err) };
    }
  },
};
