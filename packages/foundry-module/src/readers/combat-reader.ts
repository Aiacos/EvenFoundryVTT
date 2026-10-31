/**
 * Foundry-side combat snapshot reader.
 *
 * Reads from `game.combat` — the active combat encounter (null when no combat is running).
 * Returns null if `game.combat` is null (the projector sends `data: null`).
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
  const val = actor?.system?.attributes?.ac?.value;
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return undefined;
  }
  return Math.max(0, Math.round(val));
}

/**
 * Who looks at the tracker on the glasses (built by the projector, see
 * `direct/ownership.ts` `glassesViewers`).
 */
export interface CombatViewer {
  /** Actor projected on the glasses. */
  actorId: string;
  /** Users the glasses stand for (ally detection by recorded ownership). */
  userIds: readonly string[];
  /** The glasses see as a GM: hidden combatants and every number included. */
  gm: boolean;
}

/** Hidden from players: the combatant itself or its token. */
function isHidden(c: FoundryCombatant): boolean {
  return c.hidden === true || c.token?.hidden === true;
}

/**
 * Whether `viewer` may read a combatant's exact HP and AC — the map's policy
 * (`direct/map-reader.ts`): the viewer's own actor, friendly tokens, and actors the
 * viewer's users are recorded OWNER of (`Document#getUserLevel`, role ignored).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#getuserlevel
 */
function isFriendly(c: FoundryCombatant, viewer: CombatViewer): boolean {
  if (viewer.gm || c.actorId === viewer.actorId) return true;
  if (c.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return true;
  const actor = c.actor;
  if (actor === null) return false;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return viewer.userIds.some((id) => {
    const user = game.users.get(id);
    return user !== undefined && actor.getUserLevel(user) === owner;
  });
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
 * Privacy (as the map): for a player viewer, hidden combatants are left out (and a hidden
 * current combatant reads as no current combatant); exact HP / AC only for friendly
 * combatants ({@link isFriendly}) — the HUD shows the map's coarse gauge for the others.
 *
 * @param viewer - Who looks at the tracker on the glasses
 * @returns CombatSnapshot or null
 */
export function getCombatSnapshot(viewer: CombatViewer): CombatSnapshot | null {
  const combat = game.combat;

  if (!combat) {
    return null;
  }

  const visible = combat.combatants.contents.filter((c) => viewer.gm || !isHidden(c));
  const current = combat.combatant;
  const currentCombatantId =
    current !== null && visible.some((c) => c.id === current.id) ? current.id : null;

  const combatants: Combatant[] = visible.map((c) => {
    const friendly = isFriendly(c, viewer);
    const hp = friendly ? c.actor?.system.attributes.hp : undefined;

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
    const acVal = friendly ? extractCombatantAc(c.actor) : undefined;

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
