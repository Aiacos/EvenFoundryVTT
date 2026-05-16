/**
 * Action economy payload schema (Plan 09-01 — COMB-02 Wave 0).
 *
 * Emitted by `combat-action-tracker.ts` in `@evf/foundry-module` on each
 * `createChatMessage` hook that increments a per-actor action/bonus/reaction
 * counter, and on each `updateCombat` turn-change reset.
 *
 * g2-app's `action-economy-dispatcher.ts` receives this envelope, validates it
 * with a double trust boundary (outer `EnvelopeSchema` + inner this schema), then
 * writes into `action-economy-state.ts` for Plan 09-02 client-side preconditioning.
 *
 * ## Security
 *
 * - **T-09-01 (Tampering / desync):** Schema uses `z.strictObject` — extra fields
 *   are rejected, preventing field-smuggling at the WS-receive trust boundary.
 *   The client-side cache is an OPTIONAL fast-path; the server ALWAYS re-validates
 *   from Foundry chat-card history before executing any action.
 * - **T-09-03 (Cross-player leak):** `recipientUserId` is a REQUIRED field (not
 *   optional). The dispatcher silently drops envelopes where `recipientUserId`
 *   does not match the bound bearer's `user_id`. No default value is set to
 *   prevent silent cross-player leaks from schema version skew (T-08-02 pattern).
 *
 * ## Threat model
 *
 * T-09-01: Action economy desync. Mitigated by server-side re-validation; client
 *          cache is advisory only.
 * T-09-02: attackId collision across players. Mitigated in combat-action-tracker.ts
 *          via `(actorId, attackId)` composite keying.
 * T-09-03: Cross-player action economy leak. Mitigated by recipientUserId filter
 *          in the dispatcher (T-08-02 pattern — SILENT drop, no warn).
 *
 * @see packages/foundry-module/src/write-path/combat-action-tracker.ts (emitter)
 * @see packages/g2-app/src/panels/action-economy-dispatcher.ts (consumer)
 * @see packages/g2-app/src/panels/action-economy-state.ts (cache)
 * @see packages/shared-protocol/src/payloads/movement.ts (schema pattern reference)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 1
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for action economy events.
 *
 * Matches `EnvelopeSchema.type` field — used by the action-economy-dispatcher
 * to narrow from the outer Envelope parse before applying the inner payload
 * schema.
 */
export const R1_ACTION_ECONOMY_TYPE = 'r1.action.economy' as const;

/**
 * Payload schema for a single action-economy update event.
 *
 * Strict object: extra fields are rejected (T-09-01 belt-and-suspenders).
 *
 * Fields:
 * - `actorId`              — Foundry actor document ID of the combatant. min(1).
 * - `actionsUsed`          — Number of standard Actions consumed this turn. 0 or 1
 *                            (caps at 1 — standard 5e Action economy). int, min(0), max(1).
 * - `bonusActionsUsed`     — Number of Bonus Actions consumed this turn. 0 or 1.
 *                            int, min(0), max(1).
 * - `reactionsUsed`        — Number of Reactions consumed this turn. 0 or 1.
 *                            int, min(0), max(1).
 * - `multiAttackInProgress`— True while a multi-attack attackId group is incomplete.
 *                            Boolean, required (no default — absence is a bug, not broadcast).
 * - `recipientUserId`      — REQUIRED. Foundry user ID of the player whose economy
 *                            state this payload describes. Dispatcher silently drops
 *                            on mismatch (T-09-03 / T-08-02 pattern). min(1) — empty
 *                            string sentinel must NOT pass (AES-05 / AES-09 test).
 *
 * @example
 * ```ts
 * const payload: ActionEconomyPayload = {
 *   actorId: 'actor-abc',
 *   actionsUsed: 1,
 *   bonusActionsUsed: 0,
 *   reactionsUsed: 0,
 *   multiAttackInProgress: false,
 *   recipientUserId: 'user-player-xyz',
 * };
 * ```
 */
export const ActionEconomyPayloadSchema = z.strictObject({
  /** Foundry actor document ID of the combatant. */
  actorId: z.string().min(1),
  /** Standard Actions consumed this turn (0 or 1). */
  actionsUsed: z.number().int().min(0).max(1),
  /** Bonus Actions consumed this turn (0 or 1). */
  bonusActionsUsed: z.number().int().min(0).max(1),
  /** Reactions consumed this turn (0 or 1). */
  reactionsUsed: z.number().int().min(0).max(1),
  /**
   * True while a multi-attack sequence is in progress (first chat-card seen,
   * subsequent cards still pending). The dispatcher resets this to false via the
   * multi-attack-progress channel when `current === total`.
   */
  multiAttackInProgress: z.boolean(),
  /**
   * REQUIRED. Foundry user ID of the action's player.
   * Dispatcher silently drops envelopes where this !== currentBearer.user_id.
   * Not optional — absence means schema version skew, not "broadcast to all".
   */
  recipientUserId: z.string().min(1),
});

/** TypeScript type inferred from {@link ActionEconomyPayloadSchema}. */
export type ActionEconomyPayload = z.infer<typeof ActionEconomyPayloadSchema>;
