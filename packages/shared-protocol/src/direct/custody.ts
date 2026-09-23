/**
 * Records of the player-owned glasses flow (ADR-0013), stored in world-readable places
 * of Foundry (a GM-written world setting and each player's own User flags). They only
 * ever carry public metadata and {@link SealedBlob}s — never a secret in clear.
 *
 * @see docs/architecture/0013-player-owned-glasses-hybrid-projector.md
 */
import { z } from 'zod';
import { SealedBlobSchema } from './ecdh.js';

/**
 * Player flag `flags.evenfoundryvtt.device` — the glasses the player paired themselves.
 */
export const SelfDeviceSchema = z.object({
  /** The "(G2)" user of this player (must match the GM enablement record). */
  g2UserId: z.string().min(1),
  /** Actor projected on the glasses (must be owned by the player). */
  actorId: z.string().min(1),
  /** True until the first `hello` consumed the one-time QR. */
  pendingRotation: z.boolean(),
  /** False when the player's browser lost the key (GM fallback only). */
  playerHasKey: z.boolean(),
  updatedAt: z.number(),
});
export type SelfDevice = z.infer<typeof SelfDeviceSchema>;

/** Player flag `flags.evenfoundryvtt.gmKeys[gmUserId]` — device key sealed for a GM. */
export const GmKeyEntrySchema = z.object({
  /** Id of the GM public key the blob was sealed for (its `x` coordinate). */
  for: z.string().min(1),
  blob: SealedBlobSchema,
});
export type GmKeyEntry = z.infer<typeof GmKeyEntrySchema>;

/**
 * GM world record per enabled player: the "(G2)" password sealed for the player's
 * public key (`null` until the player published one).
 */
export const GlassesAccessSchema = z.object({
  g2UserId: z.string().min(1),
  sealed: SealedBlobSchema.nullable(),
  /** Id of the player public key `sealed` was made for. */
  sealedFor: z.string().nullable(),
  updatedAt: z.number(),
});
export type GlassesAccess = z.infer<typeof GlassesAccessSchema>;

/** Sealing context of a device key for a GM (binds a blob to device and GM). */
export function deviceKeyContext(g2UserId: string, gmUserId: string): string {
  return `dk:${g2UserId}:${gmUserId}`;
}

/** Sealing context of a "(G2)" user password for its player. */
export function passwordContext(g2UserId: string): string {
  return `pw:${g2UserId}`;
}
