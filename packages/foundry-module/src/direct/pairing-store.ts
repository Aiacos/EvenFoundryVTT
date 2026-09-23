/**
 * Paired-device registry for the direct G2 channel (ADR-0012 §Decision Outcome 5,
 * amended by ADR-0013).
 *
 * Storage split — the whole point of this module:
 * - **Secrets** (per-device AES-256 key, base64url) live ONLY in a hidden
 *   `scope: 'client'` setting, i.e. the browser storage of the client that paired the
 *   device: the **player's own browser** for self-service pairing (ADR-0013), or the GM
 *   browser for pairing on behalf of a player (ADR-0012 flow, kept). They never reach
 *   the Foundry server in clear (player keys travel to GMs only sealed — see
 *   `glasses-flags.ts`).
 * - **Public metadata** (which "(G2)" user, for which player/actor, label, timestamps,
 *   pending-rotation flag, which GM holds the key) lives in a hidden `scope: 'world'`
 *   setting readable by every client (projector election needs it). Only GMs write it:
 *   world settings are GM-managed, so every writer here no-ops on player clients.
 *
 * Migration from ADR-0012 records: they have no `keyHolder`; {@link migrateKeyHolders}
 * stamps the GM whose browser holds the key, and until then the election treats the
 * active GM as holder (ADR-0012 behaviour).
 *
 * Values read back from settings are treated as untrusted and re-validated (a
 * corrupted or hand-edited setting degrades to "no devices", never throws).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 * @see docs/design/g2-thirds-layout.md §Associazione e connessione
 */
import { MODULE_ID } from '../module-id.js';

/** World-scope setting key holding {@link DeviceMeta} records. */
export const DEVICES_SETTING = 'g2Devices' as const;
/** Client-scope setting key holding the per-device keys (secrets). */
export const DEVICE_KEYS_SETTING = 'g2DeviceKeys' as const;

/** `lastSeenAt` is persisted to the world setting at most this often (ms). */
export const TOUCH_PERSIST_INTERVAL_MS = 60_000;

/** Public metadata of one paired G2 device (world setting). */
export interface DeviceMeta {
  /** Foundry user id of the dedicated "(G2)" user — the device address on the relay. */
  g2UserId: string;
  /** Foundry user id of the human player the device belongs to. */
  playerUserId: string;
  /** Actor projected on the glasses (the G2 user is OWNER of this actor only). */
  actorId: string;
  /** Display label, e.g. `"Luca (G2)"`. */
  label: string;
  /** Epoch ms when the pairing was created. */
  createdAt: number;
  /** Epoch ms of the last authenticated message, or null if never connected. */
  lastSeenAt: number | null;
  /** True until the first `hello` consumed the one-time QR/manual credentials. */
  pendingRotation: boolean;
  /**
   * GM user whose browser holds the device key (pairing on behalf of the player);
   * `null` = no GM-held key (glasses enabled for self-service only); absent = legacy
   * ADR-0012 record (the active GM is assumed to hold it).
   */
  keyHolder?: string | null;
}

/** A device with its secret key (null when this client does not hold the key). */
export interface PairedDevice {
  meta: DeviceMeta;
  key: string | null;
}

/**
 * Registers the two hidden settings. Must run during `Hooks.once('init')`.
 */
export function registerPairingSettings(): void {
  game.settings.register(MODULE_ID, DEVICES_SETTING, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });
  game.settings.register(MODULE_ID, DEVICE_KEYS_SETTING, {
    scope: 'client',
    config: false,
    type: Object,
    default: {},
  });
}

function isDeviceMeta(value: unknown): value is DeviceMeta {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.g2UserId === 'string' &&
    typeof v.playerUserId === 'string' &&
    typeof v.actorId === 'string' &&
    typeof v.label === 'string' &&
    typeof v.createdAt === 'number' &&
    (v.lastSeenAt === null || typeof v.lastSeenAt === 'number') &&
    typeof v.pendingRotation === 'boolean' &&
    (v.keyHolder === undefined || v.keyHolder === null || typeof v.keyHolder === 'string')
  );
}

function readMetaRecord(): Record<string, DeviceMeta> {
  const raw = game.settings.get(MODULE_ID, DEVICES_SETTING);
  const out: Record<string, DeviceMeta> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (isDeviceMeta(meta) && meta.g2UserId === id) out[id] = meta;
  }
  return out;
}

function readKeyRecord(): Record<string, string> {
  const raw = game.settings.get(MODULE_ID, DEVICE_KEYS_SETTING);
  const out: Record<string, string> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, key] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === 'string') out[id] = key;
  }
  return out;
}

/** All paired devices (public metadata), oldest first. */
export function listDevices(): DeviceMeta[] {
  return Object.values(readMetaRecord()).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Looks up a device by its "(G2)" user id.
 *
 * @returns metadata + key (key is null when this browser did not pair the device),
 *          or null when the user id is not a paired device.
 */
export function getDevice(g2UserId: string): PairedDevice | null {
  const meta = readMetaRecord()[g2UserId];
  if (meta === undefined) return null;
  return { meta, key: readKeyRecord()[g2UserId] ?? null };
}

/**
 * Creates or replaces a device: metadata to the world setting, key to the client
 * setting (GM only — pairing on behalf / enablement).
 */
export async function upsertDevice(meta: DeviceMeta, key: string | null): Promise<void> {
  const metas = readMetaRecord();
  metas[meta.g2UserId] = meta;
  if (key !== null) await setDeviceKey(meta.g2UserId, key);
  await game.settings.set(MODULE_ID, DEVICES_SETTING, metas);
}

/**
 * Stores the secret key of a device in THIS browser (rotation, self-service pairing).
 * Client-scope: allowed on player clients too.
 */
export async function setDeviceKey(g2UserId: string, key: string): Promise<void> {
  const keys = readKeyRecord();
  keys[g2UserId] = key;
  await game.settings.set(MODULE_ID, DEVICE_KEYS_SETTING, keys);
}

/** Forgets the key of a device in THIS browser only. */
export async function clearDeviceKey(g2UserId: string): Promise<void> {
  const keys = readKeyRecord();
  if (!(g2UserId in keys)) return;
  delete keys[g2UserId];
  await game.settings.set(MODULE_ID, DEVICE_KEYS_SETTING, keys);
}

/**
 * Shallow-merges `patch` into a device's metadata; no-op for unknown devices and on
 * non-GM clients (world settings are GM-written).
 */
export async function updateDeviceMeta(
  g2UserId: string,
  patch: Partial<Omit<DeviceMeta, 'g2UserId'>>,
): Promise<void> {
  if (!game.user.isGM) return;
  const metas = readMetaRecord();
  const current = metas[g2UserId];
  if (current === undefined) return;
  metas[g2UserId] = { ...current, ...patch };
  await game.settings.set(MODULE_ID, DEVICES_SETTING, metas);
}

/** Forgets a device: metadata and key. */
export async function removeDevice(g2UserId: string): Promise<void> {
  const metas = readMetaRecord();
  delete metas[g2UserId];
  const keys = readKeyRecord();
  delete keys[g2UserId];
  await game.settings.set(MODULE_ID, DEVICE_KEYS_SETTING, keys);
  await game.settings.set(MODULE_ID, DEVICES_SETTING, metas);
}

/**
 * Records that a device was seen at `now`. The world setting is written at most every
 * {@link TOUCH_PERSIST_INTERVAL_MS} to avoid a database write per ping, and only by GMs.
 *
 * @returns true when the setting was written.
 */
export async function touchDevice(g2UserId: string, now: number = Date.now()): Promise<boolean> {
  if (!game.user.isGM) return false;
  const meta = readMetaRecord()[g2UserId];
  if (meta === undefined) return false;
  if (meta.lastSeenAt !== null && now - meta.lastSeenAt < TOUCH_PERSIST_INTERVAL_MS) return false;
  await updateDeviceMeta(g2UserId, { lastSeenAt: now });
  return true;
}

/**
 * ADR-0012 → ADR-0013 migration (GM clients, on `ready`): every legacy record whose key
 * sits in THIS browser gets `keyHolder = game.user.id`, so the election can pick this GM
 * even when another GM is the designated active GM.
 *
 * @returns the number of migrated records
 */
export async function migrateKeyHolders(): Promise<number> {
  if (!game.user.isGM) return 0;
  const metas = readMetaRecord();
  const keys = readKeyRecord();
  let migrated = 0;
  for (const meta of Object.values(metas)) {
    if (meta.keyHolder !== undefined || keys[meta.g2UserId] === undefined) continue;
    meta.keyHolder = game.user.id;
    migrated++;
  }
  if (migrated > 0) await game.settings.set(MODULE_ID, DEVICES_SETTING, metas);
  return migrated;
}
