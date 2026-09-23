/**
 * Per-device projector election (ADR-0013 §Decision 6).
 *
 * Every Foundry client runs a projector, but for each paired device exactly one client
 * — the **responder** — answers. All clients compute the same answer from state they
 * all share (user `active` flags, `game.users.activeGM`, the world device registry and
 * the player's own flags), so no coordination message is needed:
 *
 * 1. the **player's own client** when the device was self-paired, the player's browser
 *    still holds the key (`SelfDevice.playerHasKey`) and the player is connected;
 * 2. otherwise a connected **GM that can open the device key**: from the player's
 *    `gmKeys[gmId]` (sealed for that GM's current public key) for self-paired devices,
 *    or its own browser storage (`DeviceMeta.keyHolder`) for devices paired on the
 *    player's behalf; legacy ADR-0012 records (no `keyHolder`) assume the active GM.
 *    Preference: `game.users.activeGM`, then the lowest user id (deterministic).
 * 3. nobody (the glasses time out and retry).
 *
 * Connection state is Foundry's own: `User#active` ("Is the User currently logged into
 * the game World?") is kept up to date on every client by the server's user-activity
 * broadcast, and the `userConnected` hook fires when "some other User joins or leaves".
 *
 * @see https://foundryvtt.com/api/v14/classes/foundry.documents.User.html — `active`, `isSelf`
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.collections.Users.html — `activeGM`
 * @see https://foundryvtt.com/api/v13/functions/hookEvents.userConnected.html
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 */
import type { GmKeyEntry, SelfDevice } from '@evf/shared-protocol';
import { readGmKeys, readSelfDevice } from './glasses-flags.js';
import { keyIdOf, publicKeyOf } from './identity-keys.js';
import type { DeviceMeta } from './pairing-store.js';

/** Inputs of {@link electResponder} — plain data, no Foundry globals. */
export interface ElectionInput {
  playerUserId: string;
  playerActive: boolean;
  /** The self-paired device of the player, when it is this device. */
  selfDevice: SelfDevice | null;
  /** `game.users.activeGM?.id`. */
  activeGMId: string | null;
  /** Ids of every connected GM. */
  activeGmIds: readonly string[];
  /** Whether GM `gmId` can open the device key. */
  gmCanOpen: (gmId: string) => boolean;
}

/**
 * Picks the responder of a device (rules in the module docs).
 *
 * @returns the user id of the elected client, or null when nobody can answer
 */
export function electResponder(input: ElectionInput): string | null {
  if (input.selfDevice?.playerHasKey === true && input.playerActive) return input.playerUserId;
  const candidates = input.activeGmIds.filter((id) => input.gmCanOpen(id));
  if (input.activeGMId !== null && candidates.includes(input.activeGMId)) return input.activeGMId;
  return [...candidates].sort()[0] ?? null;
}

/** Everything a client needs to serve one device. */
export interface DeviceContext {
  meta: DeviceMeta;
  /** Self-pairing facts of the player (null: paired by a GM on the player's behalf). */
  selfDevice: SelfDevice | null;
  /** GM-sealed device keys (self-paired devices only). */
  gmKeys: Record<string, GmKeyEntry>;
  /** Actor to project: the player's choice when self-paired and owned, else the GM's. */
  actorId: string;
  responderId: string | null;
}

/** True when `userId` owns `actorId` (explicit OWNER or default OWNER). */
export function userOwnsActor(actorId: string, userId: string): boolean {
  const owner = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const ownership = game.actors.get(actorId)?.ownership ?? {};
  return ownership[userId] === owner || ownership.default === owner;
}

/**
 * Builds the {@link DeviceContext} of `meta` from the current Foundry state.
 */
export function deviceContext(meta: DeviceMeta): DeviceContext {
  const player = game.users.get(meta.playerUserId);
  const own = readSelfDevice(player);
  const selfDevice = own !== null && own.g2UserId === meta.g2UserId ? own : null;
  const gmKeys = selfDevice === null ? {} : readGmKeys(player);
  const activeGMId = game.users.activeGM?.id ?? null;
  const gmCanOpen = (gmId: string): boolean => {
    if (selfDevice !== null) {
      const pub = publicKeyOf(game.users.get(gmId));
      return pub !== null && gmKeys[gmId]?.for === keyIdOf(pub);
    }
    if (meta.keyHolder === undefined) return gmId === activeGMId;
    return meta.keyHolder === gmId;
  };
  const responderId = electResponder({
    playerUserId: meta.playerUserId,
    playerActive: player?.active === true,
    selfDevice,
    activeGMId,
    activeGmIds: game.users.contents.filter((u) => u.isGM && u.active).map((u) => u.id),
    gmCanOpen,
  });
  const actorId =
    selfDevice !== null && userOwnsActor(selfDevice.actorId, meta.playerUserId)
      ? selfDevice.actorId
      : meta.actorId;
  return { meta, selfDevice, gmKeys, actorId, responderId };
}
