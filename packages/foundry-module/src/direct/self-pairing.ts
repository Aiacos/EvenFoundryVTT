/**
 * Self-service pairing on the PLAYER's own Foundry client — «Associa i miei occhiali»
 * (ADR-0013 §Decision 4–5).
 *
 * Preconditions: the GM enabled glasses for this player (`glasses-access.ts`) and this
 * browser can open the sealed "(G2)" password.
 *
 * - {@link startSelfPairing}: device key = HKDF(password-as-manual-code, g2UserId) so
 *   the QR (`{u, p, k}`) and the manual code are two views of the same secret (as in
 *   ADR-0012); stored in THIS browser, announced in the player's own flag
 *   `device` (`pendingRotation: true`) and sealed for every GM in `gmKeys`.
 * - first `hello` → the player's projector calls {@link rotateSelfKey}: a random key
 *   replaces the derived one (single-use QR); the password rotates only when the GM
 *   regenerates it.
 * - {@link expireSelfPairing}: nobody connected within the TTL → random key anyway.
 * - {@link resealForGms}: a GM published a new public key → re-seal the key for it.
 * - {@link reconcileSelfCustody}: browser storage lost the key → tell the election
 *   (`playerHasKey: false`), so the GM fallback answers instead.
 *
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 */
import {
  buildPairingUrl,
  deriveKeyFromManualCode,
  deviceKeyContext,
  formatManualCode,
  type GmKeyEntry,
  generateDeviceKey,
  normalizeManualCode,
  sealFor,
} from '@evf/shared-protocol';
import QRCode from 'qrcode';
import { userOwnsActor } from './election.js';
import { getAccess, openMyPassword } from './glasses-access.js';
import { readGmKeys, readSelfDevice, writeSelfFlags } from './glasses-flags.js';
import { keyIdOf, publicKeyOf } from './identity-keys.js';
import { foundryBaseUrl, PAIRING_TTL_MS, type PairingSession } from './pairing-flow.js';
import { getDevice, setDeviceKey } from './pairing-store.js';

/** Why a player cannot pair right now (i18n key suffix `evf.pair.self.<reason>`). */
export type SelfPairingBlock = 'not_enabled' | 'password_pending' | 'no_actor';

/** Thrown by {@link startSelfPairing} with a displayable reason. */
export class SelfPairingError extends Error {
  constructor(readonly reason: SelfPairingBlock) {
    super(`self pairing unavailable: ${reason}`);
  }
}

/** Actors this player owns and may project (type `character`). */
export function ownedCharacters(): Array<{ id: string; name: string }> {
  return game.actors.contents
    .filter((a) => a.type === 'character' && userOwnsActor(a.id, game.user.id))
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Seals `key` for every GM that published a public identity key.
 *
 * @returns the `gmKeys` flag value
 */
export async function sealForGms(
  g2UserId: string,
  key: string,
): Promise<Record<string, GmKeyEntry>> {
  const out: Record<string, GmKeyEntry> = {};
  for (const gm of game.users.contents.filter((u) => u.isGM)) {
    const pub = publicKeyOf(gm);
    if (pub === null) continue;
    out[gm.id] = {
      for: keyIdOf(pub),
      blob: await sealFor(pub, key, deviceKeyContext(g2UserId, gm.id)),
    };
  }
  return out;
}

/**
 * Creates the QR + manual code for this player's glasses.
 *
 * @throws SelfPairingError when not enabled, the password is not (yet) readable by
 *         this browser, or the actor is not owned; other errors when Foundry refuses
 *         the flag write
 */
export async function startSelfPairing(
  actorId: string,
  now: number = Date.now(),
): Promise<PairingSession> {
  const access = getAccess(game.user.id);
  if (access === null) throw new SelfPairingError('not_enabled');
  const password = await openMyPassword();
  if (password === null) throw new SelfPairingError('password_pending');
  const actor = game.actors.get(actorId);
  if (actor === undefined || !userOwnsActor(actorId, game.user.id)) {
    throw new SelfPairingError('no_actor');
  }
  const { g2UserId } = access;
  // Passwords issued by enablement are manual codes; one rotated by a GM projector is
  // random — then only the QR works (manual code hidden).
  const manual = normalizeManualCode(password);
  const key =
    manual === null ? generateDeviceKey() : await deriveKeyFromManualCode(manual, g2UserId);
  await setDeviceKey(g2UserId, key);
  await writeSelfFlags(game.user, {
    device: { g2UserId, actorId, pendingRotation: true, playerHasKey: true, updatedAt: now },
    gmKeys: await sealForGms(g2UserId, key),
  });

  const url = buildPairingUrl(foundryBaseUrl(), { v: 1, u: g2UserId, p: password, k: key });
  const qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return {
    g2UserId,
    label: game.users.get(g2UserId)?.name ?? g2UserId,
    actorId,
    actorName: actor.name,
    code: manual === null ? null : formatManualCode(manual),
    url,
    qrSvg,
    expiresAt: now + PAIRING_TTL_MS,
  };
}

/**
 * Replaces this player's device key (after the first `hello`, or on expiry): stored
 * locally, `pendingRotation` cleared, re-sealed for the GMs.
 */
export async function rotateSelfKey(
  g2UserId: string,
  key: string,
  now: number = Date.now(),
): Promise<void> {
  await setDeviceKey(g2UserId, key);
  const device = readSelfDevice(game.user);
  if (device === null || device.g2UserId !== g2UserId) return;
  await writeSelfFlags(game.user, {
    device: { ...device, pendingRotation: false, playerHasKey: true, updatedAt: now },
    gmKeys: await sealForGms(g2UserId, key),
  });
}

/**
 * Invalidates an unused self-service QR (countdown reached 0).
 *
 * @returns true when the key was rotated
 */
export async function expireSelfPairing(
  g2UserId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const device = readSelfDevice(game.user);
  if (device === null || device.g2UserId !== g2UserId || !device.pendingRotation) return false;
  await rotateSelfKey(g2UserId, generateDeviceKey(), now);
  return true;
}

/**
 * Re-seals the device key for GMs whose `gmKeys` entry is missing or made for an older
 * public key (new GM browser). Player clients only; no write when nothing changed.
 *
 * @returns true when the flag was written
 */
export async function resealForGms(): Promise<boolean> {
  if (game.user.isGM) return false;
  const device = readSelfDevice(game.user);
  const key = device === null ? null : (getDevice(device.g2UserId)?.key ?? null);
  if (device === null || key === null) return false;
  const current = readGmKeys(game.user);
  const stale = game.users.contents.some((u) => {
    const pub = u.isGM ? publicKeyOf(u) : null;
    return pub !== null && current[u.id]?.for !== keyIdOf(pub);
  });
  if (!stale) return false;
  await writeSelfFlags(game.user, { gmKeys: await sealForGms(device.g2UserId, key) });
  return true;
}

/**
 * Keeps `playerHasKey` truthful for the election (player clients, on `ready`).
 *
 * @returns true when the flag was written
 */
export async function reconcileSelfCustody(now: number = Date.now()): Promise<boolean> {
  const device = readSelfDevice(game.user);
  if (device === null || game.user.isGM) return false;
  const hasKey = typeof getDevice(device.g2UserId)?.key === 'string';
  if (hasKey === device.playerHasKey) return false;
  await writeSelfFlags(game.user, { device: { ...device, playerHasKey: hasKey, updatedAt: now } });
  return true;
}
