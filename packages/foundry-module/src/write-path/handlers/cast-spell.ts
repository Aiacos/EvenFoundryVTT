/**
 * castSpellHandler — Phase 7 Plan 02 (Wave 1) write-path handler.
 *
 * Resolves an actor + spell item + spell activity, then calls
 * `activity.use({ configure: false })` via the dnd5e 5.x Activity API.
 *
 * Single-workflow-origin discipline (ADR-0011): this file is the ONLY place
 * in the EVF codebase that calls `activity.use()` for spell casting.
 * CI Gate 8 prevents `activity.use(` from appearing in g2-app or bridge.
 *
 * # Error codes
 * - `actor_not_found`        — `args.actor_id` not in `game.actors`
 * - `item_not_found`         — `args.spell_id` not in `actor.items.contents`
 * - `no_activity`            — `item.system.activities?.contents[0]` is undefined
 * - `concentration-required` — Spell requires concentration and actor already has
 *                              an active concentration effect (Plan 09-03).
 *                              `detectActiveConcentration` fires, bridge emits
 *                              `conc.conflict` envelope, `activity.use()` is NOT called.
 * - `no_gm_connected`        — socketlib / dnd5e threw "No connected GM" (Pitfall 5)
 * - `<message>`              — any other dnd5e error (string from caught Error)
 *
 * # Threat model
 * T-07-02-01: actor ownership validated upstream by dispatchTool (bearer-bound
 * idempotency key). Handler validates actor + item exist — returns typed error
 * codes, never game-state info (T-07-02-03 constant-shape errors).
 * T-07-02-02: no token-position mutation in this handler (cast-spell only).
 * T-09-01: concentration detection is fail-open — on detector throw, null is
 * returned and the cast proceeds (server-side dnd5e is the authoritative validator).
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see packages/foundry-module/src/write-path/concentration-detector.ts (Plan 09-03)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 * @see .planning/phases/09-action-economy-edge-cases/09-03-PLAN.md Task 1
 */

import { CONC_CONFLICT_TYPE, CastSpellInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';
import { detectActiveConcentration } from '../concentration-detector.js';

// ─── Injected emitter ─────────────────────────────────────────────────────────

/**
 * Concentration conflict emitter — injected by `module.ts` to avoid a circular
 * dependency (handler → module). Defaults to a no-op so unit tests do not need
 * to inject. Pattern mirrors `setMultiAttackProgressEmitter` in weapon-attack.ts.
 *
 * When set, called with `(CONC_CONFLICT_TYPE, payload)` before returning the
 * `concentration-required` typed error. Fire-and-forget: if the emitter throws,
 * the error is caught and the handler still returns the typed error (CS-CONC-04).
 */
let concConflictEmitter: ((type: string, payload: unknown) => void) | null = null;

/**
 * Inject the concentration conflict emitter from module.ts.
 *
 * Called in `Hooks.once('ready', ...)` after `bridgeDeltaEmitter` is available.
 * Pass `null` to reset to no-op (used in tests to clean up after each case).
 *
 * @param emitter - Callback accepting `(type, payload)`, or null to reset.
 */
export function setConcConflictEmitter(
  emitter: ((type: string, payload: unknown) => void) | null,
): void {
  concConflictEmitter = emitter;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Defensively extracts a chat card ID from an activity.use() result.
 *
 * dnd5e 5.x activity.use() resolves to a ChatMessage-like object on success.
 * The exact shape is version-specific; we defensively read `.id` and return
 * `null` if the shape doesn't match (non-critical — audit log captures result).
 *
 * @param result - The raw return value from activity.use()
 * @returns Chat card document ID string or null
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
 * Detects a GM-offline signal from a thrown error.
 *
 * socketlib.executeAsGM rejects with a message containing "No connected GM"
 * (or similar) when no GM client is available. We normalise this to the
 * `no_gm_connected` error code so the bridge can return HTTP 503 (Pitfall 5).
 *
 * @param err - The caught error value
 * @returns true if the error indicates no GM is connected
 */
function isNoGmError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('no_gm_connected') || msg.includes('No connected GM');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<CastSpellInput> for the 'cast-spell' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('cast-spell', castSpellHandler)`
 * in `handlers/index.ts` at module-load time.
 */
export const castSpellHandler: ToolHandler<(typeof CastSpellInputSchema)['_input']> = {
  argsSchema: CastSpellInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve spell item by spell_id
    const item = actor.items?.contents.find((i) => i.id === args.spell_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first activity on the spell item
    const activity = item.system.activities?.contents[0];
    if (activity === undefined) {
      return { success: false, error: 'no_activity' };
    }

    // Step 3.5: concentration conflict detection (Plan 09-03).
    // If the spell requires concentration AND the actor already has an active
    // concentrating effect, block the cast and emit a `conc.conflict` envelope
    // so the g2-app can mount the ConcentrationDropModalPanel.
    //
    // The detection is fail-open (T-09-01): `detectActiveConcentration` returns
    // null on any error, allowing the cast to proceed. The server-side dnd5e
    // Activity API is the authoritative concentration validator.
    const concConflict = detectActiveConcentration(
      actor as Parameters<typeof detectActiveConcentration>[0],
      item as Parameters<typeof detectActiveConcentration>[1],
    );
    if (concConflict !== null) {
      try {
        concConflictEmitter?.(CONC_CONFLICT_TYPE, concConflict);
      } catch (emitErr) {
        // Fire-and-forget: emitter failure must not suppress the typed error (CS-CONC-04).
        console.warn('[cast-spell] conc.conflict emit failed', emitErr);
      }
      return { success: false, error: 'concentration-required' };
    }

    // Step 4: invoke activity.use() — wrapped in try/catch for error normalisation.
    //
    // Plan 09-04: slot_level forwarding (T-09-04 mitigate — validated integer 0..9).
    // - slot_level === 0 → cantrip path: omit spell.slot override (cantrips don't consume slots).
    // - slot_level 1..9 → include spell.slot: 'spell<N>' override (dnd5e 5.3.3 verified API).
    //   Pact slots (level 10) are Phase 13 stretch — omit for MVP.
    // Defense-in-depth: slot_level is already validated z.number().int().min(0).max(9) by
    // CastSpellInputSchema at bridge gate (T-09-04-a). The string template
    // `spell${args.slot_level}` only receives a validated integer (T-09-04-b).
    // dnd5e activity.use throws on unknown slot key → caught and normalised below (T-09-04-c).
    const slotOverride =
      args.slot_level > 0
        ? ({ spell: { slot: `spell${args.slot_level}` } } as { spell: { slot: string } })
        : {};
    try {
      const result = await activity.use({ configure: false, ...slotOverride });
      return { success: true, data: { chatCardId: extractChatCardId(result) } };
    } catch (err) {
      if (isNoGmError(err)) {
        return { success: false, error: 'no_gm_connected' };
      }
      return { success: false, error: String(err) };
    }
  },
};
