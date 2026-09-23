/**
 * Dedicated Foundry user per paired G2 device (ADR-0016 §Decision Outcome 2).
 *
 * The glasses never log in as the player: Foundry rejects concurrent logins of one
 * user (foundryvtt/foundryvtt#14728), so the module creates `"<Player> (G2)"` with
 * role PLAYER and OWNER permission on the chosen actor only — never TRUSTED,
 * ASSISTANT or GAMEMASTER. The user is tagged with `flags.evenfoundryvtt.g2For =
 * <playerUserId>` so re-pairing refreshes the same user instead of creating
 * duplicates. All functions are GM-only (Foundry enforces it server-side).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseUser.html — `name`, `role`, `password` schema fields (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html — `create` / `update` / `delete`
 * @see https://foundryvtt.com/api/v13/modules/foundry.CONST.html — USER_ROLES, DOCUMENT_OWNERSHIP_LEVELS
 */
import { toBase64Url } from '@evf/shared-protocol';
import { MODULE_ID } from '../module-id.js';

/** Flag (under `flags.evenfoundryvtt`) linking a "(G2)" user to its player. */
export const G2_FOR_FLAG = 'g2For' as const;

/** Display name of the dedicated user for `playerName`. */
export function g2UserName(playerName: string): string {
  return `${playerName} (G2)`;
}

/** Random Foundry password: 18 random bytes → 24 base64url chars (144 bits). */
export function generatePassword(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(18)));
}

/** The existing "(G2)" user of `playerUserId`, if any. */
export function findG2User(playerUserId: string): FoundryUser | undefined {
  return game.users.contents.find((u) => u.flags?.[MODULE_ID]?.[G2_FOR_FLAG] === playerUserId);
}

/** True when `user` is a module-managed "(G2)" user. */
export function isG2User(user: FoundryUser): boolean {
  return typeof user.flags?.[MODULE_ID]?.[G2_FOR_FLAG] === 'string';
}

function requireUser(userId: string): FoundryUser {
  const user = game.users.get(userId);
  if (user === undefined) throw new Error(`G2 user ${userId} not found`);
  return user;
}

/**
 * Creates the "(G2)" user for `player`, or refreshes the existing one (name, role
 * forced back to PLAYER, new password).
 *
 * @param player   - the human player the glasses belong to (must not itself be a G2 user)
 * @param password - new Foundry password for the G2 user
 * @returns the G2 user document
 * @throws when `player` is a G2 user or Foundry refuses the create/update
 */
export async function ensureG2User(player: FoundryUser, password: string): Promise<FoundryUser> {
  if (isG2User(player)) throw new Error('cannot pair a "(G2)" user as a player');
  const name = g2UserName(player.name ?? player.id);
  const existing = findG2User(player.id);
  if (existing !== undefined) {
    if (existing.update === undefined) throw new Error(`G2 user ${existing.id} is not updatable`);
    await existing.update({ name, role: CONST.USER_ROLES.PLAYER, password });
    return existing;
  }
  const created = await CONFIG.User.documentClass.create({
    name,
    role: CONST.USER_ROLES.PLAYER,
    password,
    flags: { [MODULE_ID]: { [G2_FOR_FLAG]: player.id } },
  });
  if (created === undefined) throw new Error(`Foundry refused to create user "${name}"`);
  return created;
}

/** Sets a new Foundry password on a G2 user (rotation / QR expiry). */
export async function setG2Password(g2UserId: string, password: string): Promise<void> {
  const user = requireUser(g2UserId);
  if (user.update === undefined) throw new Error(`G2 user ${g2UserId} is not updatable`);
  await user.update({ password });
}

/**
 * Grants OWNER on `actorId` to the G2 user; when re-paired to a different actor, the
 * previous actor's permission for that user is reset to NONE.
 *
 * @throws when an actor is missing or not updatable
 */
export async function grantActorOwnership(
  g2UserId: string,
  actorId: string,
  previousActorId: string | null,
): Promise<void> {
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  if (previousActorId !== null && previousActorId !== actorId) {
    const previous = game.actors.get(previousActorId);
    if (previous?.update !== undefined) {
      await previous.update({ ownership: { [g2UserId]: levels.NONE } });
    }
  }
  const actor = game.actors.get(actorId);
  if (actor?.update === undefined) throw new Error(`actor ${actorId} not found or not updatable`);
  await actor.update({ ownership: { [g2UserId]: levels.OWNER } });
}

/** Deletes a G2 user (revocation). Missing users are ignored. */
export async function deleteG2User(g2UserId: string): Promise<void> {
  const user = game.users.get(g2UserId);
  if (user === undefined) return;
  if (!isG2User(user)) throw new Error(`refusing to delete non-G2 user ${g2UserId}`);
  if (user.delete === undefined) throw new Error(`G2 user ${g2UserId} is not deletable`);
  await user.delete();
}
