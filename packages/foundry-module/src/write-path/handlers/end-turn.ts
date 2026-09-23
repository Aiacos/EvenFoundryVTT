/**
 * endTurnHandler — the paired actor ends its own combat turn (docs/design/g2-thirds-layout.md
 * M03 «Fine turno» / «End turn»).
 *
 * Runs GM-side through `dispatchTool` only (ADR-0011 single-workflow-origin). The
 * direct projector already forces `actor_id` to the device's paired actor; this
 * handler additionally checks that the **current combatant** belongs to that actor,
 * so a device can never advance somebody else's turn, then calls
 * `Combat#nextTurn()` — "Advance the combat to the next turn" (Foundry v13 API,
 * INV-2 re-verified 2026-09-23 on foundryvtt.com/api/v13).
 *
 * The turn change fires `updateCombat`, which resets the action-economy and movement
 * trackers and pushes the fresh combat snapshot through the existing hook subscribers.
 *
 * # Error codes
 * - `no_combat`        — no active encounter (`game.combat` null)
 * - `combat_not_started` — encounter exists but `Combat#started` is false
 * - `not_your_turn`    — the current combatant is not `args.actor_id`
 * - `no_gm_connected`  — Foundry threw "No connected GM"
 * - `<message>`        — any other error thrown by `nextTurn`
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.Combat.html#nextturn
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.Combat.html#combatant
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 */
import { type EndTurnInput, EndTurnInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

/** Result data of a successful end turn: the encounter position after advancing. */
export interface EndTurnData {
  combatId: string;
  round: number;
  turn: number;
}

/**
 * Implements `ToolHandler<EndTurnInput>` for the `end-turn` tool. Registered in
 * `handlers/index.ts`.
 */
export const endTurnHandler: ToolHandler<EndTurnInput> = {
  argsSchema: EndTurnInputSchema,

  async handle(args): Promise<ToolResult> {
    const combat = game.combat;
    if (combat === null || combat === undefined || typeof combat.nextTurn !== 'function') {
      return { success: false, error: 'no_combat' };
    }
    if (combat.started === false) return { success: false, error: 'combat_not_started' };
    if (combat.combatant?.actorId !== args.actor_id) {
      return { success: false, error: 'not_your_turn' };
    }
    try {
      await combat.nextTurn();
    } catch (err) {
      const message = String(err);
      if (message.includes('No connected GM')) return { success: false, error: 'no_gm_connected' };
      return { success: false, error: err instanceof Error ? err.message : message };
    }
    const data: EndTurnData = { combatId: combat.id, round: combat.round, turn: combat.turn };
    return { success: true, data };
  },
};
