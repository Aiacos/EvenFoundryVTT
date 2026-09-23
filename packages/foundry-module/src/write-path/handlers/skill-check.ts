/**
 * skillCheckHandler — Phase 8 write channel (ACT-01) write-path handler.
 *
 * Resolves an actor by `args.actor_id`, then rolls — per `args.kind` — a skill check
 * (`Actor5e#rollSkill`, default), an ability check (`rollAbilityCheck`) or a saving
 * throw (`rollSavingThrow`), all with `config.ability` + the advantage booleans. Mirrors the structure of `use-item.ts`
 * (actor resolution → API call → error normalisation).
 *
 * # dnd5e 5.x rollSkill signature
 *
 * dnd5e 4.x/5.x refactored the roll methods to the three-config-object form:
 *
 *   async rollSkill(config = {}, dialog = {}, message = {}): Promise<D20Roll[] | null>
 *
 * The skill id is `config.skill` (a 3-letter key from `CONFIG.DND5E.skills`, e.g.
 * `'prc'`). Advantage/disadvantage are honoured as TOP-LEVEL booleans merged into the
 * roll config (`mergeObject({ advantage, disadvantage, ... }, config)`), so passing
 * `{ skill, advantage: true }` / `{ skill, disadvantage: true }` selects the mode.
 * `null` is returned when the (suppressed) dialog is cancelled.
 *
 * We map our `args.advantage` enum (`'normal' | 'advantage' | 'disadvantage'`) to the
 * boolean pair, never set both true, and pass `{ skill, advantage, disadvantage }`.
 *
 * Source (INV-2): github.com/foundryvtt/dnd5e — `Actor5e#rollSkill`,
 * `#rollAbilityCheck`, `#rollSavingThrow` (release-5.3.3,
 * `module/documents/actor/actor.mjs`), verified 2026-06-19 and 2026-09-23. (Specs.md §5.3 / §7.x
 * still show the pre-4.x positional `rollSkill(skillId)` form — a known doc drift;
 * the runtime call here uses the canonical 5.x config-object form.)
 *
 * # Error codes
 * - `actor_not_found`   — `args.actor_id` not in `game.actors`
 * - `no_gm_connected`   — dnd5e / socketlib threw "No connected GM" (Pitfall 5)
 * - `<message>`         — any other dnd5e error
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/handlers/use-item.ts (structural exemplar)
 * @see packages/shared-protocol/src/tools/skill-check.ts (SkillCheckInputSchema)
 */

import { SkillCheckInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detects a GM-offline signal from a thrown error (Pitfall 5 — mirrors use-item.ts).
 */
function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<SkillCheckInput> for the 'skill-check' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('skill-check', skillCheckHandler)`
 * in `handlers/index.ts` at module-load time. Reached through `dispatchTool` from the
 * direct projector, which re-checks the actor ownership live first (ADR-0016/0017).
 */
export const skillCheckHandler: ToolHandler<(typeof SkillCheckInputSchema)['_input']> = {
  argsSchema: SkillCheckInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: roll via the dnd5e 5.x config-object API (skill / ability check / save).
    // Map the advantage enum to the top-level boolean pair (never both true).
    try {
      const advantage = args.advantage === 'advantage';
      const disadvantage = args.advantage === 'disadvantage';
      const mode = { advantage, disadvantage };
      // FAST-FORWARD the roll: the glasses drive this handler HEADLESSLY (no human at
      // this client to confirm a roll-configuration dialog). dnd5e's roll methods open
      // that dialog by DEFAULT — left open it blocks forever, the glasses' invoke times
      // out and the tap appears to "do nothing". `dialog: { configure: false }` rolls
      // immediately with the supplied mode (the canonical 5.x way to suppress the
      // dialog), so a chat message posts and the result returns at once.
      const dialog = { configure: false };
      const kind = args.kind ?? 'skill';
      let result: unknown;
      if (kind === 'save') {
        result = await actor.rollSavingThrow?.({ ability: args.ability ?? '', ...mode }, dialog);
      } else if (kind === 'check') {
        result = await actor.rollAbilityCheck?.({ ability: args.ability ?? '', ...mode }, dialog);
      } else {
        result = await actor.rollSkill?.(
          {
            skill: args.skill ?? '',
            ...(args.ability !== undefined && { ability: args.ability }),
            ...mode,
          },
          dialog,
        );
      }
      return {
        success: true,
        data: {
          kind,
          ...(args.skill !== undefined && { skill: args.skill }),
          ...(args.ability !== undefined && { ability: args.ability }),
          advantage: args.advantage,
          result,
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
