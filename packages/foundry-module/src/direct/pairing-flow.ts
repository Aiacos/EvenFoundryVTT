/**
 * Pairing flow behind the «Collega occhiali G2» window (ADR-0019 §Decision Outcome 3).
 *
 * One pairing session = one 16-char code (Crockford base32, 80 bits). The relay room and
 * the device key are both derived from it (`deriveCodePairing`), and the QR carries the
 * same room + key, so QR and code are two views of one single-use secret. The pairing is
 * stored in THIS browser with `expiresAt`; the projector rotates room and key on the
 * first `hello` (QR spent). An unused session expires after {@link PAIRING_TTL_MS} and is
 * forgotten.
 *
 * No GM, no Foundry user, no password: any user who owns the actor can pair.
 *
 * @see packages/shared-protocol/src/direct/pairing.ts
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */
import {
  buildPairingUrl,
  DEFAULT_RELAY_URL,
  deriveCodePairing,
  generateManualCode,
  generateRoomId,
  type PairingPayload,
  relayHealthUrl,
} from '@evf/shared-protocol';
import QRCode from 'qrcode';
import { userOwnsActor } from './ownership.js';
import { getPairing, removePairing, savePairing } from './pairing-store.js';

/** Lifetime of a displayed QR / code (ms). */
export const PAIRING_TTL_MS = 5 * 60_000;

/** A freshly generated pairing, ready to be displayed. */
export interface PairingSession {
  deviceId: string;
  actorId: string;
  actorName: string;
  /** Code grouped `XXXX-XXXX-XXXX-XXXX`. */
  code: string;
  /** QR target URL (secrets in the fragment). */
  url: string;
  /** QR as an SVG string. */
  qrSvg: string;
  /** Epoch ms after which the session is expired. */
  expiresAt: number;
}

/** Where the QR points and which relay the devices meet on. */
export interface PairingEndpoints {
  appUrl: string;
  relayUrl: string;
}

/**
 * Starts a pairing of `actorId` for THIS browser's user: stores it (pending) and returns
 * the QR + code. The caller opens the projector channel for `deviceId`.
 *
 * @throws when the actor does not exist or the current user does not own it
 */
export async function startPairing(
  actorId: string,
  endpoints: PairingEndpoints,
  now: number = Date.now(),
): Promise<PairingSession> {
  const actor = game.actors.get(actorId);
  if (actor === undefined) throw new Error(`actor ${actorId} not found`);
  if (!userOwnsActor(actorId, game.user.id)) {
    throw new Error(`${game.user.id} does not own actor ${actorId}`);
  }
  const code = generateManualCode();
  const { room, key } = await deriveCodePairing(code);
  const deviceId = generateRoomId();
  const expiresAt = now + PAIRING_TTL_MS;
  const label = actor.name.slice(0, 64);
  await savePairing({
    deviceId,
    room,
    key,
    actorId,
    label,
    createdAt: now,
    lastSeenAt: null,
    expiresAt,
  });
  const payload: PairingPayload = {
    v: 2,
    r: room,
    k: key,
    l: label,
    // Only non-default relays travel in the QR (development, self-hosting).
    ...(endpoints.relayUrl === DEFAULT_RELAY_URL ? {} : { relay: endpoints.relayUrl }),
  };
  const url = buildPairingUrl(endpoints.appUrl, payload);
  const qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return { deviceId, actorId, actorName: actor.name, code, url, qrSvg, expiresAt };
}

/**
 * Forgets a session whose QR/code was never used.
 *
 * @returns true when the pending pairing was removed
 */
export async function expirePairing(deviceId: string): Promise<boolean> {
  const pairing = getPairing(deviceId);
  if (pairing === null || pairing.expiresAt === null) return false;
  await removePairing(deviceId);
  return true;
}

/**
 * Whether the relay answers `GET /health` from this tab (gate G1: a CSP or a network
 * block would show up here before the player scans anything).
 */
export async function checkRelay(relayUrl: string, timeoutMs = 5_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(relayHealthUrl(relayUrl), { signal: controller.signal });
    return res.ok;
  } catch (err) {
    console.warn(`[EVF] relay ${relayUrl} unreachable: ${String(err)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
