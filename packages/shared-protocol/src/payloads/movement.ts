/**
 * Movement budget payload schema (Plan 08-04 — ACT-01 move variant).
 *
 * Emitted by `combat-movement-tracker.ts` in `@evf/foundry-module` on each
 * `updateToken` hook that advances the active combatant's position, and on
 * each `updateCombat` turn-change reset.
 *
 * The `status-hud-layer.ts` in `@evf/g2-app` consumes envelopes of this shape
 * via `_onDelta` narrowing on `R1_MOVEMENT_BUDGET_TYPE`, then calls
 * `renderer.setMovementBudget({ remaining, total })` to toggle the `Mov 25/30`
 * footer chip in the StatusHudRenderer.
 *
 * ## Researcher Q4 resolution
 *
 * dnd5e 5.3.3 does NOT expose `actor.system.attributes.movement.used` as a
 * tracked counter — verified via Phase 8 grep on the dnd5e 5.3.3 source tree.
 * `combat-movement-tracker.ts` hand-rolls the per-turn accumulator via
 * `updateToken` + `updateCombat` hooks. Phase 9 COMB-02 may refine this with
 * token vision/path-finding if dnd5e exposes it by then.
 *
 * ## Documented invariant (not Zod-enforced)
 *
 * `usedThisTurn + remainingFeet === walkSpeed` is the expected arithmetic
 * relationship. The Zod schema does NOT enforce this constraint — it is the
 * sender's (combat-movement-tracker.ts) responsibility. Phase 9 COMB-02 action-
 * economy widget owns server-side enforcement. Negative `remainingFeet` values
 * are allowed (over-budget scenario Phase 9 will gate).
 *
 * ## Trust boundary
 *
 * The dispatcher (g2-app-side) applies double trust-boundary validation:
 *   1. Outer: `EnvelopeSchema.safeParse` for the canonical wire format.
 *   2. Inner: `MovementBudgetPayloadSchema.safeParse` for this payload.
 *
 * @see packages/foundry-module/src/write-path/combat-movement-tracker.ts (emitter)
 * @see packages/g2-app/src/status-hud/status-hud-layer.ts (consumer — _onDelta narrowing)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (consumer — setMovementBudget)
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 1
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for movement budget events.
 *
 * Matches `EnvelopeSchema.type` field — used by the StatusHudLayer dispatcher
 * to narrow from the outer Envelope parse before applying the inner payload
 * schema.
 */
export const R1_MOVEMENT_BUDGET_TYPE = 'r1.movement.budget' as const;

/**
 * Payload schema for a single movement-budget update event.
 *
 * Fields:
 * - `actorId`      — Foundry actor ID of the combatant whose movement is tracked.
 * - `walkSpeed`    — Base walking speed in feet (`actor.system.attributes.movement.walk`).
 * - `usedThisTurn` — Movement feet consumed this turn (0 at start of turn). Non-negative.
 * - `remainingFeet`— Remaining movement feet (`walkSpeed - usedThisTurn`). Signed —
 *                    negative values indicate an over-budget move; Phase 9 COMB-02
 *                    will gate this server-side.
 */
export const MovementBudgetPayloadSchema = z
  .object({
    actorId: z.string().min(1),
    walkSpeed: z.number().int().nonnegative(),
    usedThisTurn: z.number().int().nonnegative(),
    remainingFeet: z.number().int(),
  })
  .strict();

/** TypeScript type inferred from {@link MovementBudgetPayloadSchema}. */
export type MovementBudgetPayload = z.infer<typeof MovementBudgetPayloadSchema>;
