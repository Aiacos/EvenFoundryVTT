/**
 * castShieldHandler — Phase 13 Plan 01 (ACT-04) reaction handler.
 *
 * Resolves an actor + Shield spell item + cast activity, then calls
 * `activity.use({ configure: false, spell: { slot: 'spell1' } })`.
 *
 * # Defensive resolver (D-13-01)
 * Prefers `item.system.identifier === 'shield'` (SRD identifier), then falls
 * back to lowercase name matching against `'shield'` (EN) or `'scudo'` (IT).
 * Surface `'spell_not_known'` if none match.
 *
 * # Slot accounting
 * Shield is level-1; no upcast in MVP. Reaction consumption is server-side via
 * dnd5e's `system.activation.type === 'reaction'` setting — the handler does NOT
 * pass `consume.reaction`; the cast itself consumes the reaction slot.
 * combat-action-tracker (Plan 13-02) handles the widget update.
 *
 * # Error codes
 * - `actor_not_found`  — `args.actor_id` not in `game.actors`
 * - `spell_not_known`  — actor has no Shield item matching identifier or name
 * - `no_activity`      — item found but `activities.contents[0]` undefined
 * - `no_gm_connected`  — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`        — any other dnd5e error
 *
 * Single-workflow-origin discipline (ADR-0011): this file is the ONLY place
 * in the EVF codebase that calls `activity.use()` for Shield reaction casting.
 * CI Gate 8 prevents `activity.use(` from appearing in g2-app or bridge.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-01)
 */

import { CastShieldInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Defensively extracts a chat card ID from an activity.use() result.
 *
 * dnd5e 5.x activity.use() resolves to a ChatMessage-like object on success.
 * The exact shape is version-specific; we defensively read `.id` and return
 * `null` if the shape doesn't match (non-critical — audit log captures result).
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
 *
 * socketlib.executeAsGM rejects with "No connected GM" when no GM is available.
 */
function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

/** Lowercase names to match Shield in IT/EN locale. */
const SHIELD_NAMES = new Set(['shield', 'scudo']);

/**
 * Defensive item resolver for Shield spell (D-13-01).
 *
 * Priority: `system.identifier === 'shield'` (SRD identifier) first, then
 * case-insensitive name match against 'shield' (EN) or 'scudo' (IT).
 *
 * @param items - Flat array of actor item documents
 * @returns The matching item, or undefined if none found
 */
function resolveShieldItem(items: unknown[]): unknown | undefined {
  // Priority 1: SRD system.identifier
  const byId = items.find(
    (i) =>
      i !== null &&
      typeof i === 'object' &&
      typeof (i as Record<string, unknown>).system === 'object' &&
      (i as Record<string, { identifier?: string }>).system?.identifier === 'shield',
  );
  if (byId !== undefined) {
    return byId;
  }
  // Priority 2: locale-insensitive name fallback
  return items.find(
    (i) =>
      i !== null &&
      typeof i === 'object' &&
      typeof (i as Record<string, unknown>).name === 'string' &&
      SHIELD_NAMES.has(((i as Record<string, string>).name ?? '').toLowerCase()),
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<CastShieldInput> for the 'cast-shield' reaction tool.
 *
 * Registered via `registerToolHandler('cast-shield', castShieldHandler)` in
 * `handlers/index.ts` at module-load time.
 *
 * @see @evf/shared-protocol/src/tools/cast-shield.ts (CastShieldInputSchema)
 */
export const castShieldHandler: ToolHandler<(typeof CastShieldInputSchema)['_input']> = {
  argsSchema: CastShieldInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve Shield spell via defensive resolver (D-13-01)
    const items: unknown[] = actor.items?.contents ?? [];
    const item = resolveShieldItem(items);
    if (item === undefined) {
      return { success: false, error: 'spell_not_known' };
    }

    // Step 3: locate first activity
    const itemSystem = (item as Record<string, unknown>).system as
      | { activities?: { contents?: unknown[] } }
      | undefined;
    const activity = itemSystem?.activities?.contents?.[0];
    if (activity === undefined) {
      return { success: false, error: 'no_activity' };
    }

    // Step 4: invoke activity.use — spell.slot: 'spell1' (Shield is level-1 only).
    // dnd5e 5.x `use(usage, dialog, message)`: the slot override is the usage arg and
    // `{ configure: false }` MUST be the dialog arg (INV-2: foundryvtt/dnd5e
    // module/documents/activity/mixin.mjs). In the usage arg it left the dialog enabled
    // → the cast hangs until the bridge's 10s foundry_timeout.
    try {
      const result = await (
        activity as { use: (usage: unknown, dialog?: unknown) => Promise<unknown> }
      ).use({ spell: { slot: 'spell1' } }, { configure: false });
      return { success: true, data: { chatCardId: extractChatCardId(result) } };
    } catch (err) {
      if (isNoGmError(err)) {
        return { success: false, error: 'no_gm_connected' };
      }
      return { success: false, error: String(err) };
    }
  },
};
