/**
 * Pairing flow behind the «Associa occhiali G2» window (mock P01, ADR-0012 §3).
 *
 * One pairing session = one 16-char manual code (Crockford base32, 80 bits):
 * - the code (normalised, no dashes) **is** the Foundry password of the "(G2)" user;
 * - the device key is `deriveKeyFromManualCode(code, g2UserId)` (HKDF-SHA256);
 * - the QR encodes the same credentials `{v:1, u, p: code, k}` in the URL fragment,
 *   so QR and manual code are two views of the same one-time secret.
 *
 * The device is stored with `pendingRotation: true`; the projector replaces both
 * password and key with random 144/256-bit values on the first `hello`. If nobody
 * connects within {@link PAIRING_TTL_MS}, {@link expirePairing} rotates them anyway
 * so the displayed QR/code become useless.
 *
 * @see packages/shared-protocol/src/direct/pairing.ts
 * @see docs/design/g2-thirds-layout.md §Associazione e connessione
 */
import {
  buildPairingUrl,
  deriveKeyFromManualCode,
  G2_APP_PATH,
  generateDeviceKey,
  generateManualCode,
  normalizeManualCode,
} from '@evf/shared-protocol';
import QRCode from 'qrcode';
import {
  deleteG2User,
  ensureG2User,
  generatePassword,
  grantActorOwnership,
  setG2Password,
} from './g2-user.js';
import { deliverPassword, removeAccess } from './glasses-access.js';
import { writeSelfFlags } from './glasses-flags.js';
import { getDevice, removeDevice, setDeviceKey, upsertDevice } from './pairing-store.js';

/** Lifetime of a displayed QR / manual code (ms). */
export const PAIRING_TTL_MS = 5 * 60_000;

/** A freshly generated pairing, ready to be displayed. */
export interface PairingSession {
  g2UserId: string;
  /** `"<Player> (G2)"`. */
  label: string;
  actorId: string;
  actorName: string;
  /**
   * Manual code grouped `XXXX-XXXX-XXXX-XXXX`; null when the password is not a manual
   * code (self-service after a GM-side rotation: QR only).
   */
  code: string | null;
  /** QR target URL (credentials in the fragment). */
  url: string;
  /** QR as an SVG string. */
  qrSvg: string;
  /** Epoch ms after which the session is expired. */
  expiresAt: number;
}

/** Result of the environment checks shown under the QR. */
export interface EnvironmentCheck {
  /** Page served over HTTPS (required by the Even App WebView). */
  https: boolean;
  /** The bundled G2 app answers at `<base>/modules/evenfoundryvtt/g2/index.html`. */
  served: boolean;
  /** This client's Foundry socket is connected. */
  socket: boolean;
  /**
   * The GM browser is NOT on a loopback address. The QR is built from
   * `window.location`, so a GM on `http://localhost:30000` would hand the phone a URL
   * it cannot open (setup guide §HTTPS reachable from the phone).
   */
  publicHost: boolean;
}

/** True for `localhost`, `*.localhost`, `127.x.x.x` and `[::1]` host names. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    host === '[::1]' ||
    host === '::1'
  );
}

/**
 * Public base URL of this Foundry server including the route prefix, e.g.
 * `https://host/foundry`. Uses `foundry.utils.getRoute('/')` for the prefix.
 */
export function foundryBaseUrl(): string {
  return `${window.location.origin}${foundry.utils.getRoute('/')}`.replace(/\/+$/, '');
}

/**
 * Pairing **on behalf of** a player (GM mode, players without Foundry open): creates/
 * refreshes the "(G2)" user for `playerUserId`, grants it `actorId`, stores the device
 * with the key in THIS GM browser (`keyHolder` = this GM) and returns the QR + manual
 * code. A self-service pairing of the same player is superseded (its flags cleared);
 * an enabled player gets the new password re-delivered sealed.
 *
 * @throws when player or actor do not exist, or Foundry refuses a document write
 */
export async function startPairing(
  playerUserId: string,
  actorId: string,
  now: number = Date.now(),
): Promise<PairingSession> {
  const player = game.users.get(playerUserId);
  if (player === undefined) throw new Error(`player ${playerUserId} not found`);
  const actor = game.actors.get(actorId);
  if (actor === undefined) throw new Error(`actor ${actorId} not found`);

  const code = generateManualCode();
  const password = normalizeManualCode(code);
  if (password === null) throw new Error('generated manual code failed normalisation');

  const g2 = await ensureG2User(player, password);
  const key = await deriveKeyFromManualCode(code, g2.id);
  const previous = getDevice(g2.id)?.meta ?? null;
  await grantActorOwnership(g2.id, actorId, previous?.actorId ?? null);

  const label = g2.name ?? g2.id;
  await upsertDevice(
    {
      g2UserId: g2.id,
      playerUserId,
      actorId,
      label,
      createdAt: previous?.createdAt ?? now,
      lastSeenAt: previous?.lastSeenAt ?? null,
      pendingRotation: true,
      keyHolder: game.user.id,
    },
    key,
  );
  await writeSelfFlags(player, { device: null, gmKeys: null });
  await deliverPassword(playerUserId, g2.id, password, now);

  const url = buildPairingUrl(foundryBaseUrl(), { v: 1, u: g2.id, p: password, k: key });
  const qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return {
    g2UserId: g2.id,
    label,
    actorId,
    actorName: actor.name,
    code,
    url,
    qrSvg,
    expiresAt: now + PAIRING_TTL_MS,
  };
}

/**
 * Invalidates an unused pairing session: if the device has not yet said `hello`,
 * its password and key are replaced by random values nobody knows.
 *
 * @returns true when credentials were rotated
 */
export async function expirePairing(g2UserId: string): Promise<boolean> {
  const device = getDevice(g2UserId);
  if (device === null || !device.meta.pendingRotation) return false;
  const password = generatePassword();
  await setG2Password(g2UserId, password);
  await setDeviceKey(g2UserId, generateDeviceKey());
  await deliverPassword(device.meta.playerUserId, g2UserId, password);
  return true;
}

/**
 * Revokes a device: `notify` first (the projector seals `{t:'revoked'}` while the key
 * still exists), then deletes the "(G2)" user, forgets metadata + key, the player's
 * enablement and self-pairing flags.
 */
export async function revokePairing(
  g2UserId: string,
  notify: (g2UserId: string) => Promise<void>,
): Promise<void> {
  try {
    await notify(g2UserId);
  } catch (err) {
    // The device may be offline; revocation must still happen.
    console.warn(`[EVF] could not notify ${g2UserId} of revocation`, err);
  }
  const playerUserId = getDevice(g2UserId)?.meta.playerUserId;
  await deleteG2User(g2UserId);
  await removeDevice(g2UserId);
  if (playerUserId === undefined) return;
  await removeAccess(playerUserId);
  const player = game.users.get(playerUserId);
  if (player !== undefined) await writeSelfFlags(player, { device: null, gmKeys: null });
}

/** Runs the checks of mock P01 (HTTPS · module served · socket · public address). */
export async function checkEnvironment(): Promise<EnvironmentCheck> {
  let served = false;
  try {
    const res = await fetch(`${foundryBaseUrl()}/${G2_APP_PATH}`, { method: 'HEAD' });
    served = res.ok;
  } catch {
    // Network failure = not served; surfaced as a failed check in the window.
    served = false;
  }
  return {
    https: window.location.protocol === 'https:',
    served,
    socket: game.socket?.connected === true,
    publicHost: !isLoopbackHost(window.location.hostname),
  };
}
