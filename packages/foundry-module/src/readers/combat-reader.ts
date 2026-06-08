/**
 * Foundry-side combat snapshot reader.
 *
 * Reads from `game.combat` — the active combat encounter (null when no combat is running).
 * Returns null if `game.combat` is null → bridge route returns 204 (no content).
 *
 * Read-only contract (Phase 2): no `combat.advance()` calls.
 * Write path deferred to Phase 7.
 *
 * @see Specs.md §4 (read pipeline), FOUN-01 (getCombatState reader contract)
 * @see packages/foundry-module/src/types/foundry-globals.d.ts (combat shape declarations)
 * @see 02-05-PLAN.md Task 1 (combat-reader.ts spec)
 */

import type { Combatant, CombatSnapshot } from '@evf/shared-protocol';

/**
 * Extracts the Armor Class value from a Foundry actor, null-safely.
 *
 * Reads the single edition-stable field `actor.system.attributes.ac.value`
 * (already declared as `Dnd5eAttributes.ac: { value: number }` in
 * `foundry-globals.d.ts` line 254 — no ambient-types change needed).
 *
 * Per D-23.4: reads the single derived-total field only — NO flat+bonus+armor
 * sub-field derivation. Absent/non-numeric/unlinked actor → returns `undefined`.
 *
 * Negative values are clamped to 0 and fractional values are rounded to the
 * nearest integer so the result always satisfies `CombatantSchema.ac`'s
 * `.int().nonnegative()` constraint.
 *
 * @param actor - The combatant's actor (null for unlinked tokens)
 * @returns Armor Class as a non-negative integer, or `undefined` if unavailable
 * @see packages/shared-protocol/src/payloads/combat.ts (CombatantSchema.ac)
 * @see RDATA-05, D-23.4
 */
function extractCombatantAc(actor: FoundryActor | null): number | undefined {
  const val = actor?.system.attributes.ac?.value;
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return undefined;
  }
  return Math.max(0, Math.round(val));
}

/**
 * Returns a combat snapshot for the currently active combat, or null.
 *
 * Returns null when `game.combat` is null (no active combat).
 *
 * Phase 5 addition: populates optional `concentration` sub-object for each combatant
 * that is concentrating on a spell. Source: `c.actor.effects.contents` — finds the
 * first effect with `flags?.dnd5e?.concentrating === true` (RESEARCH §Pattern 4,
 * assumption A2 — dnd5e 5.x sets this flag on concentration effects).
 * `spellName` = effect.name, `duration` = effect.duration?.label ?? ''.
 *
 * Phase 23 addition: populates optional `ac` field per combatant via
 * `extractCombatantAc` (reads `actor.system.attributes.ac.value`, null-safe,
 * D-23.4 single-field read, RDATA-05).
 *
 * @returns CombatSnapshot or null
 */
export function getCombatSnapshot(): CombatSnapshot | null {
  const combat = game.combat;

  if (combat === null) {
    return null;
  }

  const currentCombatantId = combat.combatant?.id ?? null;

  const combatants: Combatant[] = combat.combatants.contents.map((c) => {
    const hp = c.actor?.system.attributes.hp;

    // Phase 5: Concentration detection via actor effects (RESEARCH §Pattern 4 assumption A2).
    // Iterate actor.effects.contents; find the first effect with flags.dnd5e.concentrating === true.
    // Defensive: c.actor may be null (unlinked combatant).
    const concentrationEffect = c.actor?.effects.contents.find(
      (e) => e.flags?.dnd5e?.concentrating === true,
    );

    const concentration =
      concentrationEffect !== undefined
        ? {
            spellName: concentrationEffect.name,
            duration: concentrationEffect.duration?.label ?? '',
          }
        : undefined;

    // Phase 23: AC extraction (RDATA-05, D-23.4 — single derived-total field).
    const acVal = extractCombatantAc(c.actor);

    return {
      id: c.id,
      name: c.name,
      actorId: c.actorId,
      initiative: c.initiative,
      hp: hp !== undefined ? hp.value : null,
      maxHp: hp !== undefined ? hp.max : null,
      isCurrentTurn: c.id === currentCombatantId,
      ...(concentration !== undefined ? { concentration } : {}),
      ...(acVal !== undefined ? { ac: acVal } : {}),
    };
  });

  return {
    combatId: combat.id,
    round: combat.round,
    turn: combat.turn,
    currentCombatantId,
    combatants,
  };
}
