/**
 * Public-key sealing for the player-owned glasses flow (ADR-0017 §Decision 2, 3, 5).
 *
 * Every participating Foundry client (players and GMs) owns an ECDH P-256 identity key
 * pair: the private key stays in that browser's `scope:'client'` storage, the public key
 * (JWK) is published in the owner's User flags. A secret (the "(G2)" user password, a
 * device AES key) is **sealed for** a recipient public key so it can travel through
 * world-readable records — settings or User flags every client can read — while only
 * the recipient browser can open it.
 *
 * Construction (ECIES-style, WebCrypto only):
 * 1. fresh ephemeral P-256 key pair per seal;
 * 2. `Z = ECDH(ephemeral private, recipient public)` (256 bits);
 * 3. `K = HKDF-SHA256(Z, salt = ephemeral public x‖y, info = "evf-seal-v1|" + context)`;
 * 4. `ct = AES-256-GCM(K, iv = random 96 bit, AAD = context, plaintext)`.
 *
 * `context` binds a blob to its purpose and owner (e.g. `pw:<g2UserId>`,
 * `dk:<g2UserId>:<gmUserId>`): a blob copied into another record fails to open.
 *
 * @see https://www.w3.org/TR/WebCryptoAPI/ (ECDH `deriveBits`, HKDF, AES-GCM)
 * @see https://www.rfc-editor.org/rfc/rfc5869 (HKDF)
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url.js';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INFO_PREFIX = 'evf-seal-v1|';

/** Public identity key as published in `flags.evenfoundryvtt.pub` (P-256, JWK). */
export const IdentityPublicJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().length(43),
  y: z.string().length(43),
});
export type IdentityPublicJwk = z.infer<typeof IdentityPublicJwkSchema>;

/** A secret sealed for one public key (see module docs for the construction). */
export const SealedBlobSchema = z.strictObject({
  v: z.literal(1),
  /** Ephemeral public key of the sender. */
  epk: IdentityPublicJwkSchema,
  iv: z.string().length(16),
  ct: z.string().min(1).max(4096),
});
export type SealedBlob = z.infer<typeof SealedBlobSchema>;

/** Identity key pair in storable form (both JWK; the private one never leaves its client). */
export interface IdentityKeyPair {
  publicJwk: IdentityPublicJwk;
  privateJwk: JsonWebKey;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Keeps only the public members of an EC JWK (drops `d`, `key_ops`, `ext`). */
function publicPart(jwk: JsonWebKey): IdentityPublicJwk {
  return IdentityPublicJwkSchema.parse({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
}

/**
 * Generates a new identity key pair.
 *
 * @returns public + private JWK (the private JWK must be stored client-side only)
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const pair = await globalThis.crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const [pub, priv] = await Promise.all([
    globalThis.crypto.subtle.exportKey('jwk', pair.publicKey),
    globalThis.crypto.subtle.exportKey('jwk', pair.privateKey),
  ]);
  return { publicJwk: publicPart(pub), privateJwk: priv };
}

/**
 * Imports a stored private identity key for {@link openSealed}.
 *
 * @throws when the JWK is not a P-256 private key
 */
export function importIdentityPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('jwk', jwk, CURVE, false, ['deriveBits']);
}

async function deriveAesKey(
  privateKey: CryptoKey,
  publicJwk: IdentityPublicJwk,
  salt: IdentityPublicJwk,
  context: string,
): Promise<CryptoKey> {
  const publicKey = await globalThis.crypto.subtle.importKey('jwk', publicJwk, CURVE, false, []);
  const shared = await globalThis.crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const material = await globalThis.crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ]);
  const saltBytes = new Uint8Array([...fromBase64Url(salt.x), ...fromBase64Url(salt.y)]);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: encoder.encode(INFO_PREFIX + context) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Seals `plaintext` so only the holder of the private key matching `recipient` can
 * read it.
 *
 * @param recipient - recipient public identity key (from its User flag)
 * @param plaintext - secret to seal (UTF-8)
 * @param context   - purpose/owner binding, also required to open (AAD + HKDF info)
 * @throws when `recipient` is not a valid P-256 public key
 */
export async function sealFor(
  recipient: IdentityPublicJwk,
  plaintext: string,
  context: string,
): Promise<SealedBlob> {
  const ephemeral = await globalThis.crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const epk = publicPart(await globalThis.crypto.subtle.exportKey('jwk', ephemeral.publicKey));
  const key = await deriveAesKey(ephemeral.privateKey, recipient, epk, context);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    encoder.encode(plaintext),
  );
  return { v: 1, epk, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/**
 * Opens a blob sealed with {@link sealFor}. Never throws on hostile input.
 *
 * @param privateKey - this client's private identity key
 * @param blob       - untrusted value (validated with {@link SealedBlobSchema})
 * @param context    - the context the blob was sealed with
 * @returns the plaintext, or null when malformed, sealed for another key, tampered
 *          with, or bound to another context
 */
export async function openSealed(
  privateKey: CryptoKey,
  blob: unknown,
  context: string,
): Promise<string | null> {
  const parsed = SealedBlobSchema.safeParse(blob);
  if (!parsed.success) return null;
  try {
    const key = await deriveAesKey(privateKey, parsed.data.epk, parsed.data.epk, context);
    const plain = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(parsed.data.iv),
        additionalData: encoder.encode(context),
      },
      key,
      fromBase64Url(parsed.data.ct),
    );
    return decoder.decode(plain);
  } catch {
    // Wrong key, tampered ciphertext or an invalid ephemeral point: all mean "not for us".
    return null;
  }
}
