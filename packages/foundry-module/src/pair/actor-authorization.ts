/**
 * @evf/foundry-module — Foundry-authoritative per-user actor authorization (ADR-0014).
 *
 * Foundry is the single authorization authority for per-actor reads. A bearer is
 * bound to a Foundry `User` at pairing time (see {@link generateBearer}); the set
 * of actors that bearer may read is derived **live** from that user's Foundry
 * ownership at validation time — never frozen into the bearer (ADR-0014 §3).
 *
 * Owned set = `game.actors.filter(a => a.testUserPermission(user, "OWNER"))`.
 *
 * Fail-closed (ADR-0014 §5): an unknown / missing user id authorizes the empty
 * set. Callers MUST treat an empty set as "authorizes no actors" rather than
 * "authorizes everything".
 *
 * @see docs/architecture/0014-bearer-actor-authorization.md
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (validateToken / getCharacterSnapshot)
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (BearerAuthorization contract)
 */

/**
 * Foundry ownership-level name for full ownership.
 *
 * Passed to `actor.testUserPermission(user, OWNER_PERMISSION)`. Foundry accepts
 * the string name (resolved against `CONST.DOCUMENT_OWNERSHIP_LEVELS`) — we use
 * the string so we don't depend on the numeric global being present in the
 * module's type surface. INV-2: foundryvtt.com/api Document#testUserPermission.
 */
const OWNER_PERMISSION = 'OWNER' as const;

/**
 * Computes the live set of actor ids the given Foundry user OWNs.
 *
 * Iterates `game.actors.contents` and keeps every actor for which
 * `actor.testUserPermission(user, "OWNER")` is true. Returns the actor ids.
 *
 * Fail-closed: returns `[]` when
 * - `userId` is falsy, or
 * - `game.users.get(userId)` is undefined (user deleted since pairing), or
 * - any error is thrown while iterating (defensive — never throws).
 *
 * The returned array is the `authorizedActorIds` field of the
 * {@link BearerAuthorization} contract (shared-protocol).
 *
 * @param userId - Foundry `User` id the bearer is bound to.
 * @returns Actor ids the user owns (OWNER permission). Possibly empty.
 */
export function authorizedActorIdsForUser(userId: string): string[] {
  if (!userId) return [];
  try {
    const user = game.users.get(userId);
    if (user === undefined) {
      // Fail-closed: user no longer exists → authorizes nothing (ADR-0014 §5).
      return [];
    }
    return game.actors.contents
      .filter((actor) => {
        try {
          return actor.testUserPermission(user, OWNER_PERMISSION);
        } catch {
          // A single malformed actor must not break the whole computation.
          return false;
        }
      })
      .map((actor) => actor.id);
  } catch (err) {
    // Defensive: authorization computation must never throw into a socketlib
    // handler. console.warn allowed per biome.jsonc noConsole allow:[error,warn].
    console.warn('[EVF actor-authorization] authorizedActorIdsForUser threw:', err);
    return [];
  }
}
