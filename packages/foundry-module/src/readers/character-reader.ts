/**
 * Foundry-side character snapshot reader.
 *
 * Reads from `game.actors` — the Foundry-authoritative actor collection.
 * Returns null if the actor does not exist or is not a player character ("character").
 *
 * Read-only contract (Phase 2): no `actor.update()` calls, no `game.settings.set()`.
 * Write path deferred to Phase 7.
 *
 * TypeScript notes:
 * - `noUncheckedIndexedAccess` (INV-4): all array/object accesses have explicit
 *   undefined guards — no `!` non-null assertions.
 * - `exactOptionalPropertyTypes`: all optional fields checked before access.
 *
 * @see Specs.md §4 (read pipeline), FOUN-01 (getCharacterState reader contract)
 * @see packages/foundry-module/src/types/foundry-globals.d.ts (actor shape declarations)
 * @see 02-05-PLAN.md Task 1 (character-reader.ts spec)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';

/**
 * Returns a character snapshot for the given actor ID, or null.
 *
 * Returns null if:
 * - Actor does not exist in `game.actors`
 * - Actor type is not "character" (NPCs, vehicles excluded — Phase 2 is PC-only)
 *
 * Phase 4b addition: reads `actor.system.attributes.death.{success,failure}` and
 * emits the `death` field on the snapshot. Defensive nullish-coalesce defaults
 * each counter to 0 — fresh dnd5e 5.x actors may have `attributes.death`
 * undefined until the first death save is rolled.
 *
 * Phase 5 addition: reads `game.settings.get('dnd5e', 'rulesVersion')` to populate
 * `world.modernRules`. Maps `'modern'` → `true`, all other values (including `'legacy'`
 * and `undefined`) → `false`. Defensive default of `false` (PHB 2014) is consistent
 * with the Phase 4b death-saves pattern. RESEARCH §Pattern 3 assumption A1 verified:
 * dnd5e 5.x uses `'modern'` / `'legacy'` string values for `rulesVersion`.
 *
 * @param actorId - Foundry actor document ID
 * @returns CharacterSnapshot or null
 */
export function getCharacterSnapshot(actorId: string): CharacterSnapshot | null {
  const actor = game.actors.get(actorId);

  if (actor === undefined) {
    return null;
  }

  // Only player characters in Phase 2
  if (actor.type !== 'character') {
    return null;
  }

  const hp = actor.system.attributes.hp;
  const ac = actor.system.attributes.ac;

  // Death-save counters (Phase 4b) — defensive defaults for fresh actors where
  // dnd5e may leave `attributes.death` undefined until the first save is rolled.
  const death = {
    success: actor.system.attributes.death?.success ?? 0,
    failure: actor.system.attributes.death?.failure ?? 0,
  };

  // World-state: PHB edition detection (Phase 5 Plan 05-01).
  // `game.settings.get('dnd5e', 'rulesVersion')` returns 'modern' (PHB 2024) or
  // 'legacy' (PHB 2014). Any non-'modern' value (including undefined on fresh
  // worlds) defaults to false. RESEARCH §Pattern 3, assumption A1.
  const rulesVersionRaw = game.settings.get('dnd5e', 'rulesVersion');
  const modernRules = typeof rulesVersionRaw === 'string' && rulesVersionRaw === 'modern';

  // Conditions come from Foundry v13+ actor.statuses (Set<string>)
  const conditions = Array.from(actor.statuses);

  return {
    actorId: actor.id,
    name: actor.name,
    hp: hp.value,
    maxHp: hp.max,
    tempHp: hp.temp,
    ac: ac.value,
    level: actor.system.details.level,
    conditions,
    exhaustion: actor.system.attributes.exhaustion,
    death,
    world: { modernRules },
  };
}

/**
 * Returns a list of all player characters in the active world.
 *
 * Used by `GET /v1/characters?world=` (wizard Step 3 character picker).
 * Filters to type==="character" only.
 *
 * @returns Array of { actorId, name, level } objects, sorted by name ascending.
 */
export function listPlayerCharacters(): Array<{ actorId: string; name: string; level: number }> {
  const actors = game.actors.contents;

  return actors
    .filter((a) => a.type === 'character')
    .map((a) => ({
      actorId: a.id,
      name: a.name,
      level: a.system.details.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
