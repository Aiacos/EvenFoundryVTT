/**
 * Live actor-ownership check of the projector (ADR-0019, carried forward from ADR-0014's
 * `userOwnsActor`): a device may only show and act for an actor its projector's user
 * owns. Evaluated on every `hello` / `get` / `invoke`, never cached, so a GM removing the
 * ownership takes effect immediately.
 *
 * @see https://foundryvtt.com/api/v13/variables/CONST.DOCUMENT_OWNERSHIP_LEVELS.html
 */

/**
 * Whether `userId` owns `actorId`: a GM owns every actor; a player needs OWNER in the
 * actor's ownership map (per user or `default`).
 */
export function userOwnsActor(actorId: string, userId: string): boolean {
  const actor = game.actors.get(actorId);
  if (actor === undefined) return false;
  if (game.users.get(userId)?.isGM === true) return true;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const ownership = actor.ownership ?? {};
  return ownership[userId] === owner || ownership.default === owner;
}

/** Characters (`type: 'character'`) `userId` owns, sorted by name. */
export function ownedCharacters(userId: string): Array<{ id: string; name: string }> {
  return game.actors.contents
    .filter((a) => a.type === 'character' && userOwnsActor(a.id, userId))
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
