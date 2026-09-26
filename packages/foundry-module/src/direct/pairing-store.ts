/**
 * Paired glasses of THIS browser (ADR-0019 §Decision Outcome 1/3).
 *
 * Whoever shows the pairing QR is that device's projector, so a pairing lives only in the
 * browser that created it: a hidden `scope: 'client'` setting (browser storage). Nothing
 * reaches the Foundry server or other clients — no world setting, no user flag, no GM
 * write — which is what lets a Player pair without a GM.
 *
 * Values read back are treated as untrusted and re-validated: a corrupted or hand-edited
 * setting degrades to "no pairings", never throws.
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */
import { DeviceKeySchema, RoomIdSchema } from '@evf/shared-protocol';
import { z } from 'zod';
import { MODULE_ID } from '../module-id.js';

/** Client-scope setting key holding the {@link Pairing} records. */
export const PAIRINGS_SETTING = 'g2Pairings' as const;

const PairingSchema = z.strictObject({
  /** Local id of the device (random, never sent anywhere). */
  deviceId: z.string().min(1).max(64),
  /** Relay room the device and this browser meet in. */
  room: RoomIdSchema,
  /** AES-256 device key, base64url. */
  key: DeviceKeySchema,
  /** Actor projected on the glasses. */
  actorId: z.string().min(1),
  /** Display label (character name at pairing time). */
  label: z.string().max(64),
  /** Epoch ms of the pairing. */
  createdAt: z.number(),
  /** Epoch ms of the last authenticated message, or null if never connected. */
  lastSeenAt: z.number().nullable(),
  /**
   * Epoch ms after which an unused QR/code stops working, or null once the device said
   * `hello` (room and key rotated: the QR is spent).
   */
  expiresAt: z.number().nullable(),
});

/** One paired device, as stored in this browser. */
export type Pairing = z.infer<typeof PairingSchema>;

/** Registers the hidden setting. Must run during `Hooks.once('init')`. */
export function registerPairingSettings(): void {
  game.settings.register(MODULE_ID, PAIRINGS_SETTING, {
    scope: 'client',
    config: false,
    type: Object,
    default: {},
  });
}

function readAll(): Record<string, Pairing> {
  const raw = game.settings.get(MODULE_ID, PAIRINGS_SETTING);
  const out: Record<string, Pairing> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = PairingSchema.safeParse(value);
    if (parsed.success && parsed.data.deviceId === id) out[id] = parsed.data;
  }
  return out;
}

async function writeAll(pairings: Record<string, Pairing>): Promise<void> {
  await game.settings.set(MODULE_ID, PAIRINGS_SETTING, pairings);
}

/** Pairings of this browser, oldest first. */
export function listPairings(): Pairing[] {
  return Object.values(readAll()).sort((a, b) => a.createdAt - b.createdAt);
}

/** The pairing `deviceId`, or null. */
export function getPairing(deviceId: string): Pairing | null {
  return readAll()[deviceId] ?? null;
}

/** Creates or replaces a pairing. */
export async function savePairing(pairing: Pairing): Promise<void> {
  const all = readAll();
  all[pairing.deviceId] = PairingSchema.parse(pairing);
  await writeAll(all);
}

/**
 * Shallow-merges `patch` into a pairing (no-op for unknown ids).
 *
 * @returns the updated pairing, or null when it does not exist
 */
export async function updatePairing(
  deviceId: string,
  patch: Partial<Omit<Pairing, 'deviceId'>>,
): Promise<Pairing | null> {
  const all = readAll();
  const current = all[deviceId];
  if (current === undefined) return null;
  const next = PairingSchema.parse({ ...current, ...patch });
  all[deviceId] = next;
  await writeAll(all);
  return next;
}

/** Forgets a pairing. */
export async function removePairing(deviceId: string): Promise<void> {
  const all = readAll();
  if (!(deviceId in all)) return;
  delete all[deviceId];
  await writeAll(all);
}

/**
 * Drops pairings whose QR/code expired unused (never said `hello`).
 *
 * @returns the ids removed
 */
export async function pruneExpired(now: number = Date.now()): Promise<string[]> {
  const all = readAll();
  const expired = Object.values(all)
    .filter((p) => p.expiresAt !== null && p.expiresAt <= now)
    .map((p) => p.deviceId);
  if (expired.length === 0) return [];
  for (const id of expired) delete all[id];
  await writeAll(all);
  return expired;
}
