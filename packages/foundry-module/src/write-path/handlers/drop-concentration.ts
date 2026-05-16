/**
 * dropConcentrationHandler — Phase 7 Plan 05 (Wave 3) — CONC-01 write closure.
 *
 * Resolves an actor + concentration ActiveEffect in Foundry's game state, then
 * calls `effect.delete()` via the socketlib GM-side execution context (Phase 7
 * ADR-0011 single-workflow-origin discipline).
 *
 * This handler REPLACES the `evf.setTargets` stub in socketlib-handlers.ts
 * (registered as `evf.dropConcentration`). Total `registerComplexHandler` call
 * count stays at 14 — this is a rename, not an addition.
 *
 * # Error codes (constant-shape per T-07-05-01)
 * - `actor_not_found`   — `args.actor_id` not present in `game.actors`
 * - `effect_not_found`  — `args.effect_id` not in `actor.effects.contents`
 * - `no_gm_connected`   — socketlib / Foundry threw "No connected GM"
 * - `<message>`         — any other error caught from `effect.delete()`
 *
 * # Threat model
 * - T-07-05-01: constant-shape error codes (no game-state info in error values).
 * - T-07-05-02: actor + effect existence validated before delete — no blind mutations.
 * - Actor ownership is validated upstream by `dispatchTool` (bearer-bound idempotency).
 *
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (evf.dropConcentration)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 */

import { type DropConcentrationInput, DropConcentrationInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Foundry global types (narrow what we need) ───────────────────────────────

/** Minimal shape of a Foundry ActiveEffect needed by this handler. */
interface FoundryEffect {
  id: string;
  delete(): Promise<unknown>;
}

/** Minimal shape of a Foundry Actor needed by this handler. */
interface FoundryActor {
  effects: { contents: FoundryEffect[] };
}

// ─── Handler implementation ───────────────────────────────────────────────────

/**
 * Looks up `actor_id` in `game.actors`, then finds the effect whose `id`
 * matches `effect_id`, and calls `effect.delete()`.
 *
 * Returns typed error codes on every failure path; never throws.
 */
async function handle(args: DropConcentrationInput): Promise<ToolResult> {
  // Resolve actor
  const actor = (game as { actors: { get(id: string): FoundryActor | undefined } }).actors.get(
    args.actor_id,
  );
  if (!actor) {
    return { success: false, error: 'actor_not_found' };
  }

  // Resolve concentration effect
  const effect = actor.effects.contents.find((e) => e.id === args.effect_id);
  if (!effect) {
    return { success: false, error: 'effect_not_found' };
  }

  // Call delete() — GM-side execution context (socketlib executeAsGM)
  try {
    await effect.delete();
    return { success: true, data: { effectId: args.effect_id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Normalize the "No connected GM" error code (Pitfall 5 across all handlers)
    if (message.includes('No connected GM')) {
      return { success: false, error: 'no_gm_connected' };
    }
    return { success: false, error: message };
  }
}

/**
 * `drop-concentration` tool handler.
 *
 * Registered in `packages/foundry-module/src/write-path/handlers/index.ts` via
 * `registerToolHandler('drop-concentration', dropConcentrationHandler)`.
 * The socketlib entry point is `evf.dropConcentration` in `socketlib-handlers.ts`.
 */
export const dropConcentrationHandler: ToolHandler<DropConcentrationInput> = {
  argsSchema: DropConcentrationInputSchema,
  handle,
};
