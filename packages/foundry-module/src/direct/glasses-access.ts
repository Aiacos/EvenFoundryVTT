/**
 * One-time GM enablement of player-owned glasses (ADR-0017 §Decision 1, 3).
 *
 * Only a GM can create users and set passwords (foundryvtt.com/article/users: the GM's
 * User Management screen is where one can "add new users, remove existing users,
 * change passwords, and change roles"). So the GM, once, per player:
 *
 * 1. creates/refreshes `"<Player> (G2)"` (role PLAYER) with a random password shaped
 *    as a 16-char manual code (so the player can also pair without a camera);
 * 2. registers the device in the world registry (no GM-held key: `keyHolder: null`);
 * 3. seals the password for the player's public identity key and stores only the
 *    ciphertext in the world setting {@link ACCESS_SETTING} — every client can read
 *    it, only the player's browser can open it ({@link openMyPassword});
 * 4. mirrors the player's actor ownership onto the G2 user, and keeps mirroring it on
 *    `createActor` / `updateActor` while a GM is connected ({@link registerOwnershipMirror}).
 *
 * A player's client cannot write world settings nor another user's document, so all
 * writers here are GM-only (Foundry rejects them server-side otherwise).
 *
 * @see https://foundryvtt.com/article/users/
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.updateDocument.html — `updateActor`
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.createDocument.html — `createActor`
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md
 */
import {
  type GlassesAccess,
  GlassesAccessSchema,
  generateManualCode,
  normalizeManualCode,
  openSealed,
  passwordContext,
  sealFor,
} from '@evf/shared-protocol';
import { MODULE_ID } from '../module-id.js';
import { ensureG2User, findG2User, isG2User, setG2Password } from './g2-user.js';
import { keyIdOf, myPrivateKey, publicKeyOf } from './identity-keys.js';
import { clearDeviceKey, getDevice, upsertDevice } from './pairing-store.js';

/** World setting: `{ [playerUserId]: GlassesAccess }` (ciphertext + metadata only). */
export const ACCESS_SETTING = 'g2Access' as const;

/** Registers the hidden world setting. Must run during `init`. */
export function registerAccessSettings(): void {
  game.settings.register(MODULE_ID, ACCESS_SETTING, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });
}

function readAccessRecord(): Record<string, GlassesAccess> {
  const raw = game.settings.get(MODULE_ID, ACCESS_SETTING);
  const out: Record<string, GlassesAccess> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [playerId, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = GlassesAccessSchema.safeParse(value);
    if (parsed.success) out[playerId] = parsed.data;
  }
  return out;
}

/** The enablement record of a player, or null when glasses are not enabled for them. */
export function getAccess(playerUserId: string): GlassesAccess | null {
  return readAccessRecord()[playerUserId] ?? null;
}

/** Enabled `(player, G2 user)` pairs. */
export function enabledPairs(): Array<{ playerUserId: string; g2UserId: string }> {
  return Object.entries(readAccessRecord()).map(([playerUserId, a]) => ({
    playerUserId,
    g2UserId: a.g2UserId,
  }));
}

/** Players (non-GM, non-"(G2)") that may be enabled. */
export function eligiblePlayers(): FoundryUser[] {
  return game.users.contents.filter((u) => !u.isGM && !isG2User(u));
}

async function writeAccess(playerUserId: string, access: GlassesAccess | null): Promise<void> {
  const record = readAccessRecord();
  if (access === null) delete record[playerUserId];
  else record[playerUserId] = access;
  await game.settings.set(MODULE_ID, ACCESS_SETTING, record);
}

/**
 * Seals `password` for the player's current public key and stores it. No-op when the
 * player is not enabled (on-behalf pairing only) or on non-GM clients.
 *
 * @returns true when the record was written
 */
export async function deliverPassword(
  playerUserId: string,
  g2UserId: string,
  password: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!game.user.isGM || getAccess(playerUserId) === null) return false;
  await writeSealedPassword(playerUserId, g2UserId, password, now);
  return true;
}

async function writeSealedPassword(
  playerUserId: string,
  g2UserId: string,
  password: string,
  now: number,
): Promise<void> {
  const pub = publicKeyOf(game.users.get(playerUserId));
  await writeAccess(playerUserId, {
    g2UserId,
    sealed: pub === null ? null : await sealFor(pub, password, passwordContext(g2UserId)),
    sealedFor: pub === null ? null : keyIdOf(pub),
    updatedAt: now,
  });
}

/** Actor projected by default for `player`: their character, else an owned character. */
function defaultActorId(player: FoundryUser): string {
  if (player.character?.id !== undefined) return player.character.id;
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const owned = game.actors.contents.find(
    (a) => a.type === 'character' && a.ownership?.[player.id] === owner,
  );
  return owned?.id ?? '';
}

/**
 * Enables glasses for one player (steps 1–4 of the module docs). Re-enabling an
 * enabled player issues a new password (glasses paired before must pair again).
 *
 * @returns the "(G2)" user id
 * @throws when the player does not exist / is a GM / is a G2 user, or Foundry refuses
 *         a document write
 */
export async function enableGlasses(
  playerUserId: string,
  now: number = Date.now(),
): Promise<string> {
  const player = game.users.get(playerUserId);
  if (player === undefined || player.isGM || isG2User(player)) {
    throw new Error(`user ${playerUserId} cannot own glasses`);
  }
  const password = newPassword();
  const g2 = await ensureG2User(player, password);
  const previous = getDevice(g2.id)?.meta ?? null;
  await upsertDevice(
    {
      g2UserId: g2.id,
      playerUserId,
      actorId: previous?.actorId || defaultActorId(player),
      label: g2.name ?? g2.id,
      createdAt: previous?.createdAt ?? now,
      lastSeenAt: previous?.lastSeenAt ?? null,
      pendingRotation: false,
      keyHolder: null,
    },
    null,
  );
  // The password changed: a key this GM held from an on-behalf pairing is now useless.
  await clearDeviceKey(g2.id);
  await writeSealedPassword(playerUserId, g2.id, password, now);
  await mirrorAllActors();
  return g2.id;
}

/**
 * Issues a new password for an enabled player («Rigenera password») and re-delivers it.
 *
 * @throws when the player is not enabled or Foundry refuses the password change
 */
export async function regeneratePassword(
  playerUserId: string,
  now: number = Date.now(),
): Promise<void> {
  const access = getAccess(playerUserId);
  if (access === null) throw new Error(`glasses are not enabled for ${playerUserId}`);
  const password = newPassword();
  await setG2Password(access.g2UserId, password);
  await writeSealedPassword(playerUserId, access.g2UserId, password, now);
}

/** Forgets the enablement of a player (revocation). */
export async function removeAccess(playerUserId: string): Promise<void> {
  if (getAccess(playerUserId) !== null) await writeAccess(playerUserId, null);
}

/**
 * GM `ready` / `updateUser`: an enabled player whose sealed password does not match
 * their current public key (never published before, or a new browser) gets a new
 * password sealed for the new key — the old plaintext is known to nobody. Runs on the
 * designated GM only, so two GMs never race.
 *
 * @returns the player ids that were re-sealed
 */
export async function refreshSealedPasswords(now: number = Date.now()): Promise<string[]> {
  if (!isDesignatedGm()) return [];
  const done: string[] = [];
  for (const [playerUserId, access] of Object.entries(readAccessRecord())) {
    const pub = publicKeyOf(game.users.get(playerUserId));
    if (pub === null || access.sealedFor === keyIdOf(pub)) continue;
    if (findG2User(playerUserId) === undefined) continue;
    await regeneratePassword(playerUserId, now);
    done.push(playerUserId);
  }
  return done;
}

/**
 * Player client: opens the password the GM sealed for this browser.
 *
 * @returns the password, or null (not enabled, sealed for another browser, not yet
 *          delivered)
 */
export async function openMyPassword(): Promise<string | null> {
  const access = getAccess(game.user.id);
  const priv = await myPrivateKey();
  if (access === null || access.sealed === null || priv === null) return null;
  return openSealed(priv, access.sealed, passwordContext(access.g2UserId));
}

function newPassword(): string {
  const password = normalizeManualCode(generateManualCode());
  if (password === null) throw new Error('generated manual code failed normalisation');
  return password;
}

// ─── Ownership mirroring ─────────────────────────────────────────────────────

/** True on the one GM client that performs world maintenance (designated active GM). */
export function isDesignatedGm(): boolean {
  if (!game.user.isGM) return false;
  const active = game.users.activeGM;
  return active === undefined || active === null || active.id === game.user.id;
}

/**
 * Ownership changes that make every G2 user mirror its player on one actor: the G2
 * user gets the player's explicit level, else the actor default, else NONE.
 *
 * @returns the `ownership` patch, or null when already mirrored
 */
export function ownershipPatch(
  ownership: Readonly<Record<string, number>>,
  pairs: ReadonlyArray<{ playerUserId: string; g2UserId: string }>,
): Record<string, number> | null {
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  const patch: Record<string, number> = {};
  for (const { playerUserId, g2UserId } of pairs) {
    const want = ownership[playerUserId] ?? ownership.default ?? none;
    if (ownership[g2UserId] !== want) patch[g2UserId] = want;
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

/** Applies {@link ownershipPatch} to one actor. */
export async function mirrorActor(actor: FoundryActor): Promise<boolean> {
  const patch = ownershipPatch(actor.ownership ?? {}, enabledPairs());
  if (patch === null || actor.update === undefined) return false;
  await actor.update({ ownership: patch });
  return true;
}

/** Mirrors ownership on every actor of the world. */
export async function mirrorAllActors(): Promise<number> {
  let changed = 0;
  for (const actor of game.actors.contents) if (await mirrorActor(actor)) changed++;
  return changed;
}

/**
 * Keeps G2 ownership mirrored while a GM is connected (designated GM only; the mirror
 * write re-fires `updateActor`, which then finds nothing to change).
 *
 * @returns the Foundry hook ids
 */
export function registerOwnershipMirror(): number[] {
  const mirror = (actor: unknown): void => {
    if (!isDesignatedGm()) return;
    mirrorActor(actor as FoundryActor).catch((err: unknown) => {
      console.error('[EVF] could not mirror actor ownership to the G2 user', err);
    });
  };
  return [
    Hooks.on('createActor', (actor: unknown) => mirror(actor)),
    Hooks.on('updateActor', (actor: unknown, changes: unknown) => {
      if (typeof changes === 'object' && changes !== null && 'ownership' in changes) mirror(actor);
    }),
  ];
}
