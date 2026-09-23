/**
 * Self-service pairing state published by a player on their OWN User document
 * (ADR-0013 §Decision 4–5). Every client can read it; only the player (or a GM) can
 * write it — a player cannot update another user's document.
 *
 * - `flags.evenfoundryvtt.device` — {@link SelfDevice}: the glasses the player paired
 *   themselves.
 * - `flags.evenfoundryvtt.gmKeys[gmUserId]` — {@link GmKeyEntry}: the device key sealed
 *   for that GM's public identity key (GM fallback custody while the player is offline).
 *
 * Values are untrusted: readers re-validate with the shared-protocol schemas and
 * degrade to "absent".
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#update — `-=key` deletion syntax
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 */
import {
  type GmKeyEntry,
  GmKeyEntrySchema,
  type SelfDevice,
  SelfDeviceSchema,
} from '@evf/shared-protocol';
import { MODULE_ID } from '../module-id.js';

/** Flag key of {@link SelfDevice}. */
export const DEVICE_FLAG = 'device' as const;
/** Flag key of the GM-sealed device keys. */
export const GM_KEYS_FLAG = 'gmKeys' as const;

/** The self-paired device published by `user`, or null. */
export function readSelfDevice(user: Pick<FoundryUser, 'flags'> | undefined): SelfDevice | null {
  const parsed = SelfDeviceSchema.safeParse(user?.flags?.[MODULE_ID]?.[DEVICE_FLAG]);
  return parsed.success ? parsed.data : null;
}

/** GM-sealed device keys published by `user` (invalid entries dropped). */
export function readGmKeys(
  user: Pick<FoundryUser, 'flags'> | undefined,
): Record<string, GmKeyEntry> {
  const raw = user?.flags?.[MODULE_ID]?.[GM_KEYS_FLAG];
  const out: Record<string, GmKeyEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [gmId, entry] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = GmKeyEntrySchema.safeParse(entry);
    if (parsed.success) out[gmId] = parsed.data;
  }
  return out;
}

/**
 * Writes the self-pairing flags of `user` (merge semantics; `null` deletes the flag).
 *
 * @throws when Foundry refuses the update (e.g. a player writing someone else)
 */
export async function writeSelfFlags(
  user: Pick<FoundryUser, 'id' | 'update'>,
  patch: { device?: SelfDevice | null; gmKeys?: Record<string, GmKeyEntry> | null },
): Promise<void> {
  const flags: Record<string, unknown> = {};
  if (patch.device !== undefined) {
    if (patch.device === null) flags[`-=${DEVICE_FLAG}`] = null;
    else flags[DEVICE_FLAG] = patch.device;
  }
  if (patch.gmKeys !== undefined) {
    if (patch.gmKeys === null) flags[`-=${GM_KEYS_FLAG}`] = null;
    else flags[GM_KEYS_FLAG] = patch.gmKeys;
  }
  if (Object.keys(flags).length === 0) return;
  if (user.update === undefined) throw new Error(`user ${user.id} is not updatable`);
  await user.update({ flags: { [MODULE_ID]: flags } });
}
