/**
 * Per-client ECDH identity key (ADR-0017 §Decision 2).
 *
 * Every Foundry client running the module — players and GMs — owns one P-256 key pair:
 * - the **private** JWK lives in a hidden `scope: 'client'` setting (this browser only);
 * - the **public** JWK is published in the user's own flag `flags.evenfoundryvtt.pub`,
 *   readable by every client, so others can seal secrets for it
 *   (`@evf/shared-protocol` `sealFor`).
 *
 * Created lazily on `ready` ({@link ensureIdentity}). A new browser of the same user
 * generates a new pair and overwrites the flag; secrets sealed for the previous key are
 * re-sealed by their owners when they notice the change (`updateUser` hook).
 *
 * Players may update flags on their own User document: the Player Configuration lets a
 * player edit their own User (avatar, color, character — foundryvtt.com/article/users),
 * and `Document#setFlag`/`update` on `game.user` is the documented way to store
 * user-scoped module data. A refused write is logged and degrades to "no sealed
 * delivery" (the GM can still pair on the player's behalf).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.User.html — `setFlag`, `update`, `isSelf`
 * @see https://foundryvtt.com/api/v13/classes/foundry.helpers.ClientSettings.html — setting scopes (client = this browser)
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md
 */
import {
  generateIdentityKeyPair,
  type IdentityPublicJwk,
  IdentityPublicJwkSchema,
  importIdentityPrivateKey,
} from '@evf/shared-protocol';
import { MODULE_ID } from '../module-id.js';

/** Client-scope setting holding this browser's identity key pair. */
export const IDENTITY_SETTING = 'identityKey' as const;
/** User flag (under `flags.evenfoundryvtt`) with the public identity key. */
export const PUB_FLAG = 'pub' as const;

interface StoredIdentity {
  publicJwk: IdentityPublicJwk;
  privateJwk: JsonWebKey;
}

let privateKey: { jwk: JsonWebKey; key: CryptoKey } | null = null;

/** Registers the hidden client setting. Must run during `init`. */
export function registerIdentitySettings(): void {
  game.settings.register(MODULE_ID, IDENTITY_SETTING, {
    scope: 'client',
    config: false,
    type: Object,
    default: {},
  });
}

function readStored(): StoredIdentity | null {
  const raw = game.settings.get(MODULE_ID, IDENTITY_SETTING);
  if (typeof raw !== 'object' || raw === null) return null;
  const { publicJwk, privateJwk } = raw as Record<string, unknown>;
  const pub = IdentityPublicJwkSchema.safeParse(publicJwk);
  if (!pub.success || typeof privateJwk !== 'object' || privateJwk === null) return null;
  const priv = privateJwk as JsonWebKey;
  if (typeof priv.d !== 'string' || priv.x !== pub.data.x) return null;
  return { publicJwk: pub.data, privateJwk: priv };
}

/** The public identity key published by `user`, or null (never published / malformed). */
export function publicKeyOf(
  user: Pick<FoundryUser, 'flags'> | undefined,
): IdentityPublicJwk | null {
  const parsed = IdentityPublicJwkSchema.safeParse(user?.flags?.[MODULE_ID]?.[PUB_FLAG]);
  return parsed.success ? parsed.data : null;
}

/**
 * Stable identifier of a public key, used to tell which key a sealed blob was made
 * for (the x coordinate identifies a P-256 point up to the sign of y; collisions
 * across real keys are negligible).
 */
export function keyIdOf(jwk: IdentityPublicJwk): string {
  return jwk.x;
}

/**
 * Loads (or creates) this browser's identity and makes sure the public key is
 * published on `game.user`.
 *
 * @returns the public key of this client
 * @throws when WebCrypto or the client setting is unavailable
 */
export async function ensureIdentity(): Promise<IdentityPublicJwk> {
  let stored = readStored();
  if (stored === null) {
    stored = await generateIdentityKeyPair();
    await game.settings.set(MODULE_ID, IDENTITY_SETTING, stored);
  }
  const published = publicKeyOf(game.user);
  if (published === null || keyIdOf(published) !== keyIdOf(stored.publicJwk)) {
    try {
      await game.user.update?.({ flags: { [MODULE_ID]: { [PUB_FLAG]: stored.publicJwk } } });
    } catch (err) {
      console.warn('[EVF] could not publish the identity key on this user', err);
    }
  }
  return stored.publicJwk;
}

/**
 * This client's private identity key, or null before {@link ensureIdentity} stored one.
 */
export async function myPrivateKey(): Promise<CryptoKey | null> {
  const stored = readStored();
  if (stored === null) return null;
  if (privateKey === null || privateKey.jwk.d !== stored.privateJwk.d) {
    privateKey = { jwk: stored.privateJwk, key: await importIdentityPrivateKey(stored.privateJwk) };
  }
  return privateKey.key;
}
