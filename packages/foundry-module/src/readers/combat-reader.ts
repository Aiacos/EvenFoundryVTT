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
 * Returns a combat snapshot for the currently active combat, or null.
 *
 * Returns null when `game.combat` is null (no active combat).
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

    return {
      id: c.id,
      name: c.name,
      actorId: c.actorId,
      initiative: c.initiative,
      hp: hp !== undefined ? hp.value : null,
      maxHp: hp !== undefined ? hp.max : null,
      isCurrentTurn: c.id === currentCombatantId,
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
