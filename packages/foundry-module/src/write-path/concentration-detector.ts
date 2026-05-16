/**
 * concentration-detector — Pure function for detecting active concentration conflicts.
 *
 * Plan 09-03 Task 1: detects whether an actor currently has an active concentration
 * effect AND the spell being cast requires concentration. Returns a `ConcConflictPayload`
 * if both conditions are true, or `null` if no conflict exists.
 *
 * ## dnd5e 5.3.3 concentration detection
 *
 * Concentration is tracked via the `SPECIAL STATUS EFFECT` system (not a custom flag).
 * Source: `github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/documents/active-effect.mjs`
 * — the `CONFIG.specialStatusEffects.CONCENTRATING` constant defaults to `'concentrating'`.
 *
 * An ActiveEffect is a concentration effect when its `statuses` collection contains
 * the string `'concentrating'`. The `statuses` field may be a `Set<string>` or an
 * `Array<string>` depending on the Foundry document data layer version — both are
 * handled defensively via `Array.from(effect.statuses ?? [])`.
 *
 * Effect metadata (spell display name) is read from `effect.flags?.dnd5e?.item?.name`
 * (dnd5e 5.3.3 pattern for associating effects with their originating items).
 * Fallback chain: `flags.dnd5e.item.name` → `effect.name` → `'<unknown>'`.
 *
 * ## Fail-open design (T-09-01)
 *
 * If the detection logic throws for any reason, `null` is returned (no conflict
 * detected) and the cast proceeds. The server-side dnd5e Activity API is the
 * authoritative concentration validator — this client-side check is a UX
 * accelerator, not a security gate.
 *
 * @see packages/shared-protocol/src/payloads/concentration.ts (ConcConflictPayload)
 * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts (consumer)
 * @see .planning/phases/09-action-economy-edge-cases/09-03-PLAN.md Task 1
 */

import type { ConcConflictPayload } from '@evf/shared-protocol';

// ─── Minimal Foundry types ────────────────────────────────────────────────────

/**
 * Minimal shape of a Foundry ActiveEffect needed for concentration detection.
 * `statuses` may be a `Set<string>` or `string[]` depending on Foundry version.
 */
interface ConcentrationEffect {
  id: string;
  name?: string;
  statuses?: Set<string> | string[] | undefined;
  flags?: Record<string, unknown>;
}

/** Minimal shape of a Foundry Actor needed by this function. */
interface ConcentrationActor {
  id: string;
  effects?: { contents?: ConcentrationEffect[] };
}

/** Minimal shape of a dnd5e spell item needed by this function. */
interface SpellItem {
  id: string;
  name: string;
  system?: {
    components?: {
      concentration?: boolean;
    };
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect an active concentration conflict for the given actor and spell.
 *
 * Returns a `ConcConflictPayload` when BOTH conditions hold:
 *   1. The spell being cast requires concentration (`spellItem.system.components.concentration === true`).
 *   2. The actor has an active `ActiveEffect` whose `statuses` collection contains
 *      the canonical concentration marker `'concentrating'`.
 *
 * Returns `null` in all other cases (no conflict, spell not concentration,
 * no active concentration, or any detection error — fail-open per T-09-01).
 *
 * ## Source verification
 *
 * - `CONFIG.specialStatusEffects.CONCENTRATING` defaults to `'concentrating'`
 *   (dnd5e `module/documents/active-effect.mjs`, release-5.3.3).
 * - Spell concentration flag: `item.system.components.concentration` (boolean).
 *   Source: dnd5e `module/documents/item.mjs` spell system data schema.
 * - Effect flags path: `effect.flags.dnd5e.item.name` for the originating spell name.
 *   Source: dnd5e `module/documents/active-effect.mjs` `getOriginData()` pattern.
 *
 * @param actor     Foundry Actor — reads `actor.effects.contents` for active effects.
 * @param spellItem dnd5e spell item — reads `system.components.concentration`.
 * @returns `ConcConflictPayload` if conflict detected; `null` otherwise.
 */
export function detectActiveConcentration(
  actor: ConcentrationActor,
  spellItem: SpellItem,
): ConcConflictPayload | null {
  try {
    // Step 1: Early exit for non-concentration spells.
    // Non-concentration spells can never trigger the drop flow regardless of active effects.
    if (spellItem.system?.components?.concentration !== true) {
      return null;
    }

    // Step 2: Iterate actor effects looking for the concentrating marker.
    const effects = actor.effects?.contents ?? [];
    for (const effect of effects) {
      // Normalize statuses — may be Set<string> or string[] depending on Foundry data layer.
      // Array.from handles both Set and Array; ?? [] handles undefined.
      const statusArray = Array.from(effect.statuses ?? []);
      if (!statusArray.includes('concentrating')) {
        continue;
      }

      // Step 3: This effect is the active concentration. Extract display name.
      // Fallback chain: flags.dnd5e.item.name → effect.name → '<unknown>'.
      const flags = effect.flags as Record<string, unknown> | undefined;
      const dnd5eFlags = flags?.dnd5e as Record<string, unknown> | undefined;
      const itemFlags = dnd5eFlags?.item as Record<string, unknown> | undefined;
      const itemFlagName =
        typeof itemFlags?.name === 'string' && itemFlags.name.length > 0
          ? itemFlags.name
          : undefined;
      const currentConcentrationName =
        itemFlagName ??
        (typeof effect.name === 'string' && effect.name.length > 0 ? effect.name : '<unknown>');

      // Step 4: Build and return the conflict payload.
      return {
        effectId: effect.id,
        currentConcentrationName,
        newSpellName: spellItem.name,
        actorId: actor.id,
      };
    }

    // No concentrating effect found — no conflict.
    return null;
  } catch (err) {
    // Fail-open (T-09-01): on any unexpected error, return null and allow the cast.
    // The server-side dnd5e Activity API is the authoritative concentration validator.
    console.warn('[concentration-detector] detection failed, failing open', err);
    return null;
  }
}
