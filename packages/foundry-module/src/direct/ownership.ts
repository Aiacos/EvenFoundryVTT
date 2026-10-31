/**
 * Live actor-ownership check of the projector (ADR-0019, carried forward from ADR-0014's
 * `userOwnsActor`): a device may only show and act for an actor its projector's user
 * owns. Evaluated on every `hello` / `get` / `invoke`, never cached, so a GM removing the
 * ownership takes effect immediately.
 *
 * @see https://foundryvtt.com/api/v13/variables/CONST.DOCUMENT_OWNERSHIP_LEVELS.html
 */

/**
 * Whether `userId` owns `actorId`, per Foundry's own permission test: a GM owns every
 * actor; a player needs OWNER — an explicit per-user level wins over `default` (an actor
 * owned by everyone but lowered to LIMITED for one player is not that player's).
 *
 * @returns false for an unknown actor or user
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#testuserpermission
 */
export function userOwnsActor(actorId: string, userId: string): boolean {
  const actor = game.actors.get(actorId);
  const user = game.users.get(userId);
  if (actor === undefined || user === undefined) return false;
  return actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
}

/**
 * Users whose eyes the glasses of `actorId` stand for — whose whispers they may show.
 *
 * A player's tab projects for that player. A GM's tab usually projects for a player
 * without a device: the glasses then see as the players recorded as OWNER of the actor
 * (`Document#getUserLevel`, role ignored), never as the GM — a whisper to the GM must not
 * reach a player's glasses. Only an actor no player owns is projected as the GM.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#getuserlevel
 */
export function glassesViewers(actorId: string): string[] {
  const me = game.user;
  if (!me.isGM) return [me.id];
  const actor = game.actors.get(actorId);
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const players =
    actor === undefined
      ? []
      : game.users.contents
          .filter((u) => !u.isGM && actor.getUserLevel(u) === owner)
          .map((u) => u.id);
  return players.length > 0 ? players : [me.id];
}

/** Characters (`type: 'character'`) `userId` owns, sorted by name. */
export function ownedCharacters(userId: string): Array<{ id: string; name: string }> {
  return game.actors.contents
    .filter((a) => a.type === 'character' && userOwnsActor(a.id, userId))
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
