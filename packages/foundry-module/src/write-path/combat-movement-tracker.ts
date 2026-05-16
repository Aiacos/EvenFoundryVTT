/**
 * combat-movement-tracker — `updateToken` + `updateCombat` hook subscribers (Plan 08-04 — ACT-01).
 *
 * Subscribes to two Foundry hooks:
 *   1. `updateToken` — fires when a token's position changes. Computes the distance
 *      moved in feet and accumulates it in a module-scoped `MovementState` map keyed
 *      by actorId. Emits a `MovementBudgetPayload` after each accumulation.
 *   2. `updateCombat` — fires when the combat document changes. When `change.turn`
 *      is present (turn advance), resets the accumulator to 0 for each tracked actor
 *      and emits fresh payloads with `usedThisTurn: 0`.
 *
 * ## Researcher Q4 resolution — hand-rolled tracker
 *
 * dnd5e 5.3.3 does NOT expose `actor.system.attributes.movement.used` as a
 * tracked counter (verified via Phase 8 grep on the dnd5e 5.3.3 source tree).
 * This module hand-rolls the per-turn accumulator. Phase 9 COMB-02 may refine
 * with token vision/path-finding if dnd5e exposes it by then.
 *
 * ## Phase 8 scope — combat-only
 *
 * CMT-04: Only tracks movement while `game.combat` is non-null. Exploration-mode
 * movement is Phase 9 stretch — Phase 8 minimal contract.
 *
 * ## Position delta strategy
 *
 * The `updateToken` hook passes `change.x` and `change.y` as NEW (post-update)
 * pixel positions. To compute the delta, the tracker maintains a `lastPosition` map
 * per actorId and computes `dx = change.x - lastPosition.x`. The first movement
 * event initializes `lastPosition` from `tokenDoc.x/y` (already the new position
 * at that point), so the first update delta is 0 — an acceptable Phase 8 broad
 * heuristic for the first step after mount.
 *
 * ## CRITICAL: NEVER return false
 *
 * Hook handlers MUST NEVER return `false`. Returning `false` from `updateToken`
 * or `updateCombat` cancels the Foundry hook chain, which would prevent Foundry
 * from applying the position update or combat state change. TypeScript `void` return
 * type enforces this contract.
 *
 * ## 14-socketlib-handler invariant
 *
 * This module registers NO new socketlib handlers. The total count remains 14.
 * Emission is via the existing `bridgeDeltaEmitter` channel (fire-and-forget
 * POST to bridge).
 *
 * ## Threat model
 *
 * T-08-02-01 (cross-player tracking): only `game.user?.character?.id` is tracked.
 * Cross-player movement is NOT accumulated (CMT-02 + CMT-07 filter).
 *
 * T-08-04-01 (updateToken flood): Foundry batches drag operations — one hook per
 * release. Accumulation is O(1) and emit is a fire-and-forget POST.
 *
 * @see packages/foundry-module/src/write-path/reaction-watcher.ts (pattern reference)
 * @see packages/shared-protocol/src/payloads/movement.ts (MovementBudgetPayload)
 * @see packages/foundry-module/src/module.ts (wiring slot — after registerActionResultWatcher)
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 2
 */

import type { MovementBudgetPayload } from '@evf/shared-protocol';

// ─── Module-scoped state ──────────────────────────────────────────────────────

/**
 * Per-actor movement state for the current combat turn.
 *
 * `walkSpeed` is the base walking speed in feet (`actor.system.attributes.movement.walk`).
 * `usedThisTurn` accumulates feet moved since the last combat turn reset.
 */
interface ActorMovementState {
  walkSpeed: number;
  usedThisTurn: number;
}

/**
 * Movement accumulator — maps actorId to accumulated movement state.
 *
 * Reset on each combat turn advance (CMT-05). Only the player's actor
 * (game.user.character.id) is tracked — cross-player tracking is explicitly
 * out of scope (T-08-02-01).
 */
const _state = new Map<string, ActorMovementState>();

/**
 * Last known position per actorId (in canvas pixels).
 *
 * Used to compute the distance delta on each `updateToken` event. Initialized
 * from `tokenDoc.x/y` on first movement event (first delta is 0 — broad heuristic).
 */
const _lastPosition = new Map<string, { x: number; y: number }>();

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the movement distance in feet from a pixel delta.
 *
 * `gridSize` is the canvas pixels per grid square (scene.grid.size, default 100).
 * `gridDistance` is the feet per grid square (scene.grid.distance, default 5).
 *
 * Formula: `Math.round(sqrt(dx² + dy²) / gridSize * gridDistance)`.
 *
 * @param dx           - Horizontal pixel delta (may be 0).
 * @param dy           - Vertical pixel delta (may be 0).
 * @param gridSize     - Pixels per grid square.
 * @param gridDistance - Feet per grid square.
 * @returns Distance in feet, rounded to nearest integer.
 */
export function _computeDeltaFeet(
  dx: number,
  dy: number,
  gridSize: number,
  gridDistance: number,
): number {
  if (gridSize === 0) return 0;
  return Math.round((Math.sqrt(dx * dx + dy * dy) / gridSize) * gridDistance);
}

/**
 * Read the current player's character actor ID.
 *
 * Returns `null` if no character is assigned to the current user (CMT-07).
 */
function _getPlayerActorId(): string | null {
  const character = game.user?.character as { id: string } | null | undefined;
  return character?.id ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register the `updateToken` + `updateCombat` hook subscribers.
 *
 * Hooks:
 *   - `updateToken` — accumulates position delta for the player's actor when
 *     combat is active.
 *   - `updateCombat` — resets the accumulator on `change.turn !== undefined`
 *     (turn advance).
 *
 * @param emit - Callback to emit the movement budget payload via bridgeDeltaEmitter.
 *               Called at most once per triggering event. Never called when:
 *               - No x/y change in the token update (CMT-02)
 *               - Token is not the player's actor (CMT-02/07)
 *               - Combat is not active (CMT-04)
 * @returns Unsubscribe closure — calls `Hooks.off(updateTokenHookId)` and
 *          `Hooks.off(updateCombatHookId)`. Discarded by module.ts for MVP
 *          (module lifecycle is for-the-session).
 */
export function registerMovementTracker(
  emit: (payload: MovementBudgetPayload) => void,
): () => void {
  // ── updateToken hook ────────────────────────────────────────────────────────
  const updateTokenHookId = Hooks.on('updateToken', (...args: unknown[]): void => {
    try {
      // Hook signature: (tokenDoc, change, options, userId)
      // NEVER return false — Foundry hook chain must not be interrupted
      const rawTokenDoc = args[0];
      const rawChange = args[1];

      if (rawTokenDoc === null || typeof rawTokenDoc !== 'object') return;
      if (rawChange === null || typeof rawChange !== 'object') return;

      const tokenDoc = rawTokenDoc as Record<string, unknown>;
      const change = rawChange as Record<string, unknown>;

      // CMT-02: Early return if no position change
      const newX = change.x as number | undefined;
      const newY = change.y as number | undefined;
      if (newX === undefined && newY === undefined) return;

      // CMT-07: Early return if no player character
      const playerActorId = _getPlayerActorId();
      if (playerActorId === null) return;

      // CMT-02/03: Only track the player's own token
      const tokenActorId = tokenDoc.actorId as string | undefined;
      if (tokenActorId !== playerActorId) return;

      // CMT-04: Only track during active combat
      if (game.combat === null || game.combat === undefined) return;

      // Get the actor for walkSpeed
      const actor = tokenDoc.actor as
        | { id: string; system: { attributes: { movement: { walk: number } } } }
        | null
        | undefined;
      const walkSpeed = actor?.system?.attributes?.movement?.walk ?? 30;

      // Get grid metrics from canvas.scene for feet conversion
      const scene = (
        canvas as { scene?: { grid?: { size?: number; distance?: number } } } | undefined
      )?.scene;
      const gridSize = scene?.grid?.size ?? 100;
      const gridDistance = scene?.grid?.distance ?? 5;

      // Compute delta from last known position
      const currentTokenX = (tokenDoc.x as number) ?? 0;
      const currentTokenY = (tokenDoc.y as number) ?? 0;

      const last = _lastPosition.get(playerActorId);
      let dx = 0;
      let dy = 0;

      if (last !== undefined) {
        // delta from previous position to new position
        const resolvedNewX = newX ?? currentTokenX;
        const resolvedNewY = newY ?? currentTokenY;
        dx = resolvedNewX - last.x;
        dy = resolvedNewY - last.y;
      }
      // else: first update — dx/dy stay 0 (broad Phase 8 heuristic)

      // Update last position to the NEW position (change.x/y are the new values)
      _lastPosition.set(playerActorId, {
        x: newX ?? currentTokenX,
        y: newY ?? currentTokenY,
      });

      // Accumulate movement
      const deltaFeet = _computeDeltaFeet(dx, dy, gridSize, gridDistance);
      const existing = _state.get(playerActorId) ?? { walkSpeed, usedThisTurn: 0 };
      const nextUsed = existing.usedThisTurn + deltaFeet;
      _state.set(playerActorId, { walkSpeed, usedThisTurn: nextUsed });

      // Emit the updated payload
      emit({
        actorId: playerActorId,
        walkSpeed,
        usedThisTurn: nextUsed,
        remainingFeet: walkSpeed - nextUsed,
      });
    } catch (err) {
      // Defensive: swallow ALL throws — a movement-tracker error must never
      // interrupt the Foundry session or hook chain.
      console.warn('[combat-movement-tracker] updateToken handler threw', err);
    }
    // NEVER return false — Foundry hook chain must not be interrupted
    // TypeScript void return type enforces this contract
  });

  // ── updateCombat hook ───────────────────────────────────────────────────────
  const updateCombatHookId = Hooks.on('updateCombat', (...args: unknown[]): void => {
    try {
      // Hook signature: (combat, change, options, userId)
      const rawChange = args[1];
      if (rawChange === null || typeof rawChange !== 'object') return;
      const change = rawChange as Record<string, unknown>;

      // CMT-05: Only reset on turn advance
      if (change.turn === undefined) return;

      // Reset all tracked actors and emit fresh payloads
      for (const [actorId, state] of _state.entries()) {
        _state.set(actorId, { walkSpeed: state.walkSpeed, usedThisTurn: 0 });
        // Also clear last position so the next first-move delta is 0
        _lastPosition.delete(actorId);

        emit({
          actorId,
          walkSpeed: state.walkSpeed,
          usedThisTurn: 0,
          remainingFeet: state.walkSpeed,
        });
      }

      // Also emit for the current player actor if they haven't moved yet this turn
      const playerActorId = _getPlayerActorId();
      if (playerActorId !== null && !_state.has(playerActorId)) {
        // Get walkSpeed from game.user.character
        const character = game.user?.character as
          | { id: string; system: { attributes: { movement: { walk: number } } } }
          | null
          | undefined;
        const walkSpeed = character?.system?.attributes?.movement?.walk ?? 30;
        emit({
          actorId: playerActorId,
          walkSpeed,
          usedThisTurn: 0,
          remainingFeet: walkSpeed,
        });
      }
    } catch (err) {
      console.warn('[combat-movement-tracker] updateCombat handler threw', err);
    }
    // NEVER return false — Foundry hook chain must not be interrupted
  });

  // Return unsubscribe closure
  return (): void => {
    Hooks.off(updateTokenHookId);
    Hooks.off(updateCombatHookId);
  };
}
