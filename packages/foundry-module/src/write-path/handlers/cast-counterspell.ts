/**
 * castCounterspellHandler — Phase 13 Plan 01 (ACT-04) reaction handler.
 *
 * Resolves an actor + Counterspell spell item + cast activity, then calls
 * `activity.use({ configure: false, spell: { slot: `spell${slot_level}` } })`.
 *
 * # Defensive resolver (D-13-02)
 * Prefers `item.system.identifier === 'counterspell'` (SRD identifier), then
 * falls back to lowercase name matching against `'counterspell'` (EN) or
 * `'contromagia'` (IT). Surface `'spell_not_known'` if none match.
 *
 * # Contested check resolution
 * The dnd5e Activity workflow automatically prompts the target caster for the
 * appropriate roll (CON save in 2024 PHB; ability check in 2014 PHB) when
 * `activity.use()` fires. The handler does NOT coordinate the contested check.
 *
 * # Upcast support
 * Counterspell supports upcast (slots 3..9). `slot_level` defaults to 3.
 * Pass a higher value to upcast (increases auto-fail threshold in 2014 PHB).
 *
 * # Error codes
 * - `actor_not_found`  — `args.actor_id` not in `game.actors`
 * - `spell_not_known`  — actor has no Counterspell item matching identifier or name
 * - `no_activity`      — item found but `activities.contents[0]` undefined
 * - `no_gm_connected`  — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`        — any other dnd5e error
 *
 * Single-workflow-origin discipline (ADR-0011): this file is the ONLY place
 * in the EVF codebase that calls `activity.use()` for Counterspell reaction.
 * CI Gate 8 prevents `activity.use(` from appearing in g2-app or bridge.
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/13-v2-stretch/13-01-PLAN.md Task 2 (D-13-02)
 */

import { CastCounterspellInputSchema } from '@evf/shared-protocol';
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

/** Lowercase names to match Counterspell in IT/EN locale. */
const COUNTERSPELL_NAMES = new Set(['counterspell', 'contromagia']);

/**
 * Defensive item resolver for Counterspell spell (D-13-02).
 *
 * Priority: `system.identifier === 'counterspell'` first, then case-insensitive
 * name match against 'counterspell' (EN) or 'contromagia' (IT).
 */
function resolveCounterspellItem(items: unknown[]): unknown | undefined {
  // Priority 1: SRD system.identifier
  const byId = items.find(
    (i) =>
      i !== null &&
      typeof i === 'object' &&
      typeof (i as Record<string, unknown>).system === 'object' &&
      (i as Record<string, { identifier?: string }>).system?.identifier === 'counterspell',
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
      COUNTERSPELL_NAMES.has(((i as Record<string, string>).name ?? '').toLowerCase()),
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<CastCounterspellInput> for the 'cast-counterspell' reaction tool.
 *
 * Registered via `registerToolHandler('cast-counterspell', castCounterspellHandler)` in
 * `handlers/index.ts` at module-load time.
 *
 * @see @evf/shared-protocol/src/tools/cast-counterspell.ts (CastCounterspellInputSchema)
 */
export const castCounterspellHandler: ToolHandler<(typeof CastCounterspellInputSchema)['_input']> =
  {
    argsSchema: CastCounterspellInputSchema,

    async handle(args): Promise<ToolResult> {
      // Step 1: resolve actor
      const actor = game.actors.get(args.actor_id);
      if (actor === undefined) {
        return { success: false, error: 'actor_not_found' };
      }

      // Step 2: resolve Counterspell via defensive resolver (D-13-02)
      const items: unknown[] = actor.items?.contents ?? [];
      const item = resolveCounterspellItem(items);
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

      // Step 4: invoke activity.use — spell.slot: `spell${slot_level}` (upcast supported)
      const slotLevel = args.slot_level ?? 3;
      try {
        const result = await (activity as { use: (cfg: unknown) => Promise<unknown> }).use({
          configure: false,
          spell: { slot: `spell${slotLevel}` },
        });
        return {
          success: true,
          data: {
            chatCardId: extractChatCardId(result),
            target_caster_id: args.target_caster_id, // echoed for audit/repudiation
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
