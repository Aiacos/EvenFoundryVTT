/**
 * Foundry hook subscribers — character / combat deltas for the direct projector.
 *
 * Registers Foundry hooks that observe game state changes and push delta payloads
 * through the injected `emitFn` (the projector's `pushDelta`, ADR-0016; a spy in tests).
 *
 * Hooks registered:
 * 1. `updateActor`  → `character.delta` (HP, AC, conditions, exhaustion)
 * 2. `updateCombat` → `combat.turn`
 * 3. `combatStart`  → `combat.state`
 * 4. `targetToken`  → `combat.targets` (FOUN-04 read-side)
 *
 * Map/scene changes and chat log events are pushed by the projector itself because
 * they need per-device filtering (visible tokens, whisper recipients).
 *
 * Read-only contract: no `actor.update()`, no `game.settings.set()`, no
 * `combat.advance()`. Performance (D-2.15 zero polling): push-only via hooks.
 * The `updateActor` guard (changes.system?.attributes or changes.statuses) prevents
 * spurious emits on unrelated actor changes (e.g. macro flag updates).
 *
 * @see 02-CONTEXT.md D-2.14 (hook list), D-2.15 (zero polling)
 * @see packages/foundry-module/src/direct/projector.ts (emitFn implementation)
 */

import {
  CHARACTER_DELTA_TYPE,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TARGETS_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
} from '@evf/shared-protocol';
import { getCharacterSnapshot } from './character-reader.js';
import { getCombatSnapshot } from './combat-reader.js';

/**
 * Function that emits a typed delta to the paired G2 devices.
 *
 * Injected from `module.ts` — the concrete implementation is the projector's
 * `pushDelta` (sealed envelopes on the Foundry socket relay). Tests inject a spy.
 *
 * Must be fire-and-forget (returns void, not Promise<void>): hook callbacks
 * are synchronous; the emit happens in the background. Errors are logged
 * but never re-thrown.
 */
export type EmitFn = (type: string, payload: unknown) => void;

// ─── Hook handlers ─────────────────────────────────────────────────────────────

/**
 * Handles the `updateActor` hook.
 *
 * Guard: only emit if the changed fields include HP, AC, statuses, or exhaustion.
 * This prevents spurious emits for unrelated actor changes (e.g. flag updates,
 * folder changes). The `changes` parameter is a partial diff object.
 *
 * @param actor   - The actor document (post-update)
 * @param changes - Partial diff of what changed (noUncheckedIndexedAccess-safe checks)
 * @param emitFn  - Delta emission function
 */
function handleUpdateActor(actor: FoundryActor, changes: unknown, emitFn: EmitFn): void {
  // Type-guard: changes must be an object for attribute inspection
  if (typeof changes !== 'object' || changes === null) {
    return;
  }

  const changesObj = changes as Record<string, unknown>;

  // Emit only when HP/AC/exhaustion or statuses changed (D-2.15 performance guard).
  // HP, AC and exhaustion all live under `system.attributes`, so a bare
  // `system` change with no `attributes` sub-key (e.g. a flag or currency tweak)
  // is NOT relevant and must be skipped.
  const statusesChanged = 'statuses' in changesObj;
  const systemObj =
    typeof changesObj.system === 'object' && changesObj.system !== null
      ? (changesObj.system as Record<string, unknown>)
      : null;
  const attributesChanged =
    systemObj !== null && typeof systemObj.attributes === 'object' && systemObj.attributes !== null;

  if (!attributesChanged && !statusesChanged) {
    return;
  }

  const snapshot = getCharacterSnapshot(actor.id);
  if (snapshot !== null) {
    emitFn(CHARACTER_DELTA_TYPE, snapshot);
  }
}

/**
 * Handles the `updateCombat` hook.
 * Emits `combat.turn` on every round/turn change.
 *
 * Note: `combat.state` (full snapshot on combat creation) is emitted separately by
 * the `combatStart` hook lambda in `registerHookSubscribers`. This function only
 * emits `combat.turn`.
 *
 * @param _combat  - Combat document (unused; we always read from game.combat)
 * @param emitFn   - Delta emission function
 */
function handleUpdateCombat(_combat: unknown, emitFn: EmitFn): void {
  const snapshot = getCombatSnapshot();
  if (snapshot !== null) {
    emitFn(COMBAT_TURN_DELTA_TYPE, snapshot);
  }
}

/**
 * Handles the `targetToken` hook (FOUN-04 — read-side observation).
 *
 * Emits `combat.targets` with the user's current target set.
 * Read-only in Phase 2: we observe targets but never call `setTargets()`.
 * Write path (setTargets mutation) deferred to Phase 7.
 *
 * @param user     - The Foundry user who changed their targets
 * @param token    - The token that was targeted/untargeted
 * @param targeted - Whether the token was targeted (true) or untargeted (false)
 * @param emitFn   - Delta emission function
 */
function handleTargetToken(user: unknown, token: unknown, targeted: unknown, emitFn: EmitFn): void {
  if (typeof user !== 'object' || user === null) {
    return;
  }

  const userDoc = user as FoundryUser;
  const userId = userDoc.id;

  // Read current targets from the user's targets Set (game.user.targets)
  const targets = Array.from(userDoc.targets).map((t: FoundryToken) => ({
    tokenId: t.id,
    actorId: t.document.actorId,
    name: t.name,
  }));

  // Suppress unused variable warnings — hook args are needed for TS signature
  void token;
  void targeted;

  emitFn(COMBAT_TARGETS_DELTA_TYPE, { userId, targets });
}

// ─── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers the character / combat Foundry hook subscribers.
 *
 * Returns a cleanup function that calls `Hooks.off(id)` for all registered hooks.
 * Call the cleanup function to deregister (e.g. on module teardown or in tests).
 *
 * @param emitFn - Delta emission function (injected; fire-and-forget)
 * @returns Cleanup function that removes all registered hooks
 *
 * @example
 * ```ts
 * // module.ts ready hook:
 * const cleanup = registerHookSubscribers(projector.pushDelta);
 * // On teardown (rarely needed in Foundry modules):
 * cleanup();
 * ```
 */
export function registerHookSubscribers(emitFn: EmitFn): () => void {
  const hookIds: number[] = [];

  hookIds.push(
    Hooks.on('updateActor', (actor: unknown, changes: unknown) => {
      handleUpdateActor(actor as FoundryActor, changes, emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('updateCombat', (_combat: unknown) => {
      handleUpdateCombat(_combat, emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('combatStart', (_combat: unknown) => {
      // combatStart fires on new combat creation — emit full state
      const snapshot = getCombatSnapshot();
      if (snapshot !== null) {
        emitFn(COMBAT_STATE_DELTA_TYPE, snapshot);
      }
    }),
  );

  hookIds.push(
    Hooks.on('targetToken', (user: unknown, token: unknown, targeted: unknown) => {
      handleTargetToken(user, token, targeted, emitFn);
    }),
  );

  // Cleanup: deregister all hooks
  return () => {
    for (const id of hookIds) {
      Hooks.off(id);
    }
  };
}
