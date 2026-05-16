/**
 * reaction-watcher — `dnd5e.preUseActivity` hook subscriber (Plan 07-05 — REACT-01).
 *
 * Subscribes to the `dnd5e.preUseActivity` hook (CORRECT hook name per
 * RESEARCH §Q3 — wrong alternatives do NOT exist in dnd5e 5.3.3).
 *
 * When an NPC activity fires (not the player's own action), infers the
 * reaction kind via a Phase 7 broad heuristic and emits a `ReactionAvailablePayload`
 * via the injected `emit` callback. The callback is wired by `module.ts` to
 * `bridgeDeltaEmitter('r1.reaction.available', payload)`.
 *
 * ## CRITICAL: NEVER return false
 *
 * The hook handler MUST NEVER return `false`. Returning `false` from
 * `dnd5e.preUseActivity` cancels the NPC action entirely (RESEARCH §Q3 Pitfall 1).
 * Phase 7 is DISPLAY-ONLY — execution blocking stays V2 (ACT-04).
 *
 * ## Phase 7 heuristic (broad)
 *
 * - Any NPC **attack** activity → `kind: 'shield'`
 * - Any NPC **spell** activity → `kind: 'counterspell'`
 * - Otherwise → no emit (return early)
 *
 * Precise per-trigger matching (checking actual R1 geometry, concentration state,
 * reaction availability) is Phase 9 COMB-02 territory. Phase 7 accepts
 * false positives intentionally.
 *
 * ## Return value
 *
 * `registerReactionWatcher` returns an unsubscribe closure that calls `Hooks.off`
 * with the hook ID returned by `Hooks.on`. For MVP, the return value is discarded
 * (`module.ts` comment: "module lifecycle is for-the-session").
 *
 * @see dnd5e 5.3.3 source: github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs line ~348
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q3 + Pitfall 1
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 */

import type { ReactionAvailablePayload } from '@evf/shared-protocol';

// ─── Module-local helpers ─────────────────────────────────────────────────────

/**
 * Broad Phase 7 heuristic: does the activity target the player's character?
 *
 * In Phase 7, ANY activity from a non-player actor is treated as targeting the
 * player (broad match — display-only, false positives acceptable). Phase 9
 * COMB-02 will refine this to check actual token target sets.
 *
 * @param activity      - Raw dnd5e activity document (untyped)
 * @param playerActorId - The player's character actor ID
 * @returns true if the activity may be targeting the player (Phase 7: always true for NPCs)
 */
function inspectTargetIncludesActor(
  _activity: Record<string, unknown>,
  _playerActorId: string,
): boolean {
  // Phase 7 broad heuristic: any NPC activity is considered as potentially
  // targeting the player. Phase 9 COMB-02 will refine with token target geometry.
  return true;
}

/**
 * Infer the reaction kind from the dnd5e activity.
 *
 * Phase 7 heuristic:
 * - `activity.type === 'attack'` → 'shield'
 * - `activity.item?.type === 'spell'` → 'counterspell'
 * - Otherwise → null (no reaction toast emitted)
 *
 * RESEARCH Assumption A2: `activity.type === 'attack'` identifies attack
 * activities. Verify at Phase 9 if activity.type uses different discriminants.
 *
 * @param activity - Raw dnd5e activity document (typed defensively)
 * @returns Reaction kind string, or null if no reaction is triggered
 */
function inferReactionKind(
  activity: Record<string, unknown>,
): 'shield' | 'counterspell' | 'opportunity-attack' | null {
  if (activity.type === 'attack') {
    return 'shield';
  }
  const item = activity.item as Record<string, unknown> | null | undefined;
  if (item?.type === 'spell') {
    return 'counterspell';
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register the `dnd5e.preUseActivity` hook subscriber.
 *
 * **CORRECT hook name: `dnd5e.preUseActivity`** — verified via dnd5e 5.3.3 source
 * at github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/activity/mixin.mjs
 * line ~348: `Hooks.call("dnd5e.preUseActivity", activity, usageConfig, dialogConfig, messageConfig)`.
 *
 * Wrong hook names (preActivityUse, preItemUsage) do NOT exist in dnd5e 5.3.3
 * (RESEARCH §Q3 + Pitfall 1). Using them produces a silent no-op — the handler
 * is registered but NEVER fired.
 *
 * @param emit - Callback to emit the reaction payload via bridgeDeltaEmitter.
 *               Called at most once per triggering activity. Never called for
 *               the player's own actions.
 * @returns Unsubscribe closure — calls `Hooks.off(hookId)`. Discarded by module.ts
 *          for MVP (module lifecycle is for-the-session).
 */
export function registerReactionWatcher(
  emit: (payload: ReactionAvailablePayload) => void,
): () => void {
  // CRITICAL: register with CORRECT hook name 'dnd5e.preUseActivity'
  // Source: dnd5e 5.3.3 mixin.mjs line ~348
  // Wrong alternatives (preActivityUse, preItemUsage) are NOT valid hooks.
  const hookId = Hooks.on('dnd5e.preUseActivity', (...args: unknown[]): void => {
    // Hook signature: (activity, usageConfig, dialogConfig, messageConfig)
    // NEVER return false — that cancels the NPC action (Pitfall 1, RESEARCH §Q3)
    try {
      const rawActivity = args[0];
      if (rawActivity === null || typeof rawActivity !== 'object') {
        return;
      }

      const activity = rawActivity as Record<string, unknown>;

      // Get the actor performing the action
      const actor = activity.actor as Record<string, unknown> | null | undefined;
      if (actor === null || actor === undefined) {
        return;
      }

      // Get the player character ID — skip if no character is assigned
      const playerCharacter = game.user?.character as { id: string } | null | undefined;
      const playerActorId = playerCharacter?.id ?? null;
      if (playerActorId === null || playerActorId === undefined) {
        return;
      }

      // Skip the player's OWN action (not a reaction trigger for the player)
      const actingActorId = actor.id as string | undefined;
      if (actingActorId === playerActorId) {
        return;
      }

      // Phase 7 broad heuristic: check if target includes player actor
      if (!inspectTargetIncludesActor(activity, playerActorId)) {
        return;
      }

      // Infer reaction kind — null means no reaction is triggered
      const reactionKind = inferReactionKind(activity);
      if (reactionKind === null) {
        return;
      }

      // Emit the reaction payload
      const sourceName = (actor.name as string | undefined) ?? 'Unknown';
      emit({
        kind: reactionKind,
        sourceName,
        expiresAt: Date.now() + 6000, // 6s window (generous — no precise hook to close it)
      });
    } catch (err) {
      // Defensive: swallow ALL throws — a reaction-watcher error must never
      // interrupt the Foundry session or the dnd5e hook chain.
      // console.warn is allowed per biome.jsonc noConsole allow:[error,warn]
      console.warn('[reaction-watcher] hook handler threw', err);
    }
    // NEVER return false — display-only invariant (ACT-04 V2 owns blocking)
    // TypeScript: void return type enforces this contract
  });

  // Return unsubscribe closure
  return (): void => {
    Hooks.off(hookId);
  };
}
