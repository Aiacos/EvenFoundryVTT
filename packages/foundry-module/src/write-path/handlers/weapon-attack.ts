/**
 * weaponAttackHandler — Phase 7 Plan 04 (Wave 2) write-path handler.
 *
 * Resolves an actor + weapon item + attack-type activity, then executes
 * Path B multi-attack loop: `for i in count: activity.use({ configure: false })`.
 *
 * ## Multi-attack loop (MULTI-01 — Path B mandatory)
 *
 * RESEARCH §Q1 verdict (github.com/foundryvtt/dnd5e/blob/release-5.3.3/...):
 * `ActivityUseConfiguration` has NO `count`, `times`, or `repeat` field.
 * Path A (`activity.use({ count: N })`) does not exist. Path B is the only valid
 * implementation. The handler iterates `args.count` times:
 *
 * ```ts
 * for (let i = 0; i < args.count; i++) {
 *   await activity.use({ configure: false, consume: { action: i === 0 } });
 * }
 * ```
 *
 * `consume.action: true` only on `i === 0` — action economy deducted once
 * (Extra Attack is a feature, not a repeated Action cost in 5e rules).
 *
 * ## Progress emission
 *
 * After each successful iteration, `emitMultiAttackProgress` is called with
 * `{ attackId, current, total, chatCardId, actorId }`. The emitter is injected
 * via `setMultiAttackProgressEmitter` in `module.ts`'s `ready` hook — defaults
 * to a no-op so unit tests do not need to inject. NO new socketlib handler is
 * registered (handler count stays 14).
 *
 * ## Error codes
 * - `actor_not_found`     — `args.actor_id` not in `game.actors`
 * - `item_not_found`      — `args.item_id` not in `actor.items.contents`
 * - `no_attack_activity`  — no activity with `type === 'attack'` found on item
 * - `no_gm_connected`     — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`           — any other dnd5e error (fails on the failing iteration)
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-04-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q1, Pattern 2
 */

import type { MultiAttackProgressPayload } from '@evf/shared-protocol';
import { WeaponAttackInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Progress emitter (injectable — module.ts wires the real emitter) ─────────

/**
 * Module-scoped progress emitter function.
 *
 * Defaults to no-op so unit tests work without injection. `module.ts` wires
 * the real `bridgeDeltaEmitter` call via `setMultiAttackProgressEmitter`.
 *
 * Using a mutable closure rather than a module-level `let` binding allows
 * both the setter and the emitter call sites to share state cleanly without
 * any module re-import risk.
 */
let _progressEmitter: ((payload: MultiAttackProgressPayload) => void) | null = null;

/**
 * Inject (or clear) the multi-attack progress emitter.
 *
 * Call with a function to wire the real emitter (module.ts `ready` hook).
 * Call with `null` to restore the no-op default (test teardown).
 *
 * @param fn - Emitter function that forwards the payload to the bridge, or null
 *             to reset to the no-op default.
 */
export function setMultiAttackProgressEmitter(
  fn: ((payload: MultiAttackProgressPayload) => void) | null,
): void {
  _progressEmitter = fn;
}

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
 * Plan 07-04 extends Plan 07-02's single-attack path with the Path B loop.
 * `args.count` defaults to 1 (backward-compatible — existing calls without
 * `count` run a single attack exactly as before).
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('weapon-attack', weaponAttackHandler)`
 * in `handlers/index.ts` at module-load time.
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

    // Step 4: Path B multi-attack loop (RESEARCH §Q1 — no count param in dnd5e 5.3.3)
    // Defensive ?? 1: handle cases where handle() is called directly in tests without
    // schema parsing (argsSchema.default(1) applies only when going through safeParse).
    const count = args.count ?? 1;
    const attackId = crypto.randomUUID();
    const attacks: Array<{ attackIndex: number; chatCardId: string | null }> = [];

    for (let i = 0; i < count; i++) {
      try {
        // consume.action: true only on first iteration (action economy — Extra Attack
        // does NOT double-spend the action; see RESEARCH Pattern 2).
        const result = await activity.use({ configure: false, consume: { action: i === 0 } });
        const chatCardId = extractChatCardId(result);
        attacks.push({ attackIndex: i + 1, chatCardId });

        // Emit progress envelope (fire-and-forget; no-op if emitter not injected)
        _progressEmitter?.({
          attackId,
          current: i + 1,
          total: count,
          chatCardId,
          actorId: args.actor_id,
        });
      } catch (err) {
        if (isNoGmError(err)) {
          return { success: false, error: 'no_gm_connected' };
        }
        return { success: false, error: String(err) };
      }
    }

    return { success: true, data: { attackId, attacks } };
  },
};
