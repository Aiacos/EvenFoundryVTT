/**
 * Crypto backend of the direct channel (ADR-0019, Amendment 2 · P0-A).
 *
 * WebCrypto (`crypto.subtle`, `crypto.randomUUID`) exists only in a **secure context**
 * (https, localhost): on a plain-http page — a phone opening `http://<LAN-IP>:5173/`, a
 * Foundry tab on `http://192.168.…:30000` — both are undefined and pairing used to die
 * with `TypeError … reading 'importKey'`. Every crypto call of the channel therefore goes
 * through this module: WebCrypto when present, otherwise the audited noble fallback
 * (`crypto-fallback.ts`), **imported lazily** so secure pages never download it. Same
 * algorithms, byte-identical wire format; `getRandomValues` (available everywhere) stays
 * the only randomness source.
 *
 * @see https://w3c.github.io/webcrypto/#crypto-interface (`subtle`, `randomUUID` are `[SecureContext]`)
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */

/** Which implementation serves the crypto calls on this page. */
export type CryptoBackend = 'webcrypto' | 'fallback';

declare const deviceKeyBrand: unique symbol;

/**
 * Opaque AES-256-GCM device key, made only by `importDeviceKey` (envelope) /
 * {@link importAesKey}. Holds a non-extractable `CryptoKey` under WebCrypto, or the raw
 * bytes under the fallback (the base64url key is already in the pairing storage, so the
 * fallback reveals nothing new). `backend` is for diagnostics only.
 */
export interface DeviceKey {
  readonly backend: CryptoBackend;
  readonly [deviceKeyBrand]: true;
}

/**
 * A crypto call could not run at all (fallback chunk not loadable, handle not made by
 * {@link importAesKey}) — as opposed to an authentication failure, which callers such as
 * `open` turn into a `'auth'` result. Never swallow it.
 */
export class CryptoBackendError extends Error {
  override readonly name = 'CryptoBackendError';
}

type KeyMaterial =
  | { readonly backend: 'webcrypto'; readonly key: CryptoKey }
  | { readonly backend: 'fallback'; readonly raw: Uint8Array };

/** Key material behind each handle — unreachable from outside this module. */
const materials = new WeakMap<DeviceKey, KeyMaterial>();

type Fallback = typeof import('./crypto-fallback.js');
let fallback: Promise<Fallback> | null = null;

/** The `SubtleCrypto` of this page, or `undefined` outside a secure context. */
function subtleOrUndefined(): SubtleCrypto | undefined {
  // Typed as always present by lib.dom, but `[SecureContext]`: undefined on http pages.
  const subtle: SubtleCrypto | undefined = globalThis.crypto.subtle;
  return subtle;
}

/**
 * Loads the noble fallback once (a separate chunk in the g2-app build). A failed load is
 * not cached, so the next call retries.
 *
 * @throws CryptoBackendError('crypto fallback failed to load …') with the loader's error
 */
function loadFallback(): Promise<Fallback> {
  fallback ??= import('./crypto-fallback.js').catch((err: unknown) => {
    fallback = null;
    throw new CryptoBackendError(
      `crypto fallback failed to load (no WebCrypto: the page is not https/localhost): ${String(err)}`,
    );
  });
  return fallback;
}

function materialOf(key: DeviceKey): KeyMaterial {
  const material = materials.get(key);
  if (material === undefined) {
    throw new CryptoBackendError('unknown device key (use importDeviceKey)');
  }
  return material;
}

/** Reports which backend serves this page (for the phone page / window diagnostic line). */
export function cryptoBackend(): CryptoBackend {
  return subtleOrUndefined() === undefined ? 'fallback' : 'webcrypto';
}

/**
 * Wraps raw AES-256 key bytes in a {@link DeviceKey} of the current backend.
 *
 * @param raw - 32 key bytes (the caller validates the length)
 */
export async function importAesKey(raw: Uint8Array): Promise<DeviceKey> {
  const subtle = subtleOrUndefined();
  const material: KeyMaterial =
    subtle === undefined
      ? { backend: 'fallback', raw: raw.slice() }
      : {
          backend: 'webcrypto',
          key: await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
        };
  // The brand is type-only (a `declare`d symbol): the handle is a frozen plain object.
  const handle = Object.freeze({ backend: material.backend }) as DeviceKey;
  materials.set(handle, material);
  return handle;
}

/**
 * AES-256-GCM encryption with a 96-bit `iv` and `aad`; returns `ciphertext ‖ tag(16)`.
 *
 * @throws CryptoBackendError for a handle not made by {@link importAesKey} or when the
 *   fallback cannot load
 */
export async function aesGcmSeal(
  key: DeviceKey,
  iv: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const material = materialOf(key);
  if (material.backend === 'fallback') {
    return (await loadFallback()).aesGcmSeal(material.raw, iv, aad, plaintext);
  }
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    material.key,
    plaintext,
  );
  return new Uint8Array(ct);
}

/**
 * AES-256-GCM decryption of `ciphertext ‖ tag`.
 *
 * @throws CryptoBackendError when the call cannot run (see {@link aesGcmSeal})
 * @throws Error when authentication fails (wrong key / IV / AAD, tampered or truncated data)
 */
export async function aesGcmOpen(
  key: DeviceKey,
  iv: Uint8Array,
  aad: Uint8Array,
  sealed: Uint8Array,
): Promise<Uint8Array> {
  const material = materialOf(key);
  if (material.backend === 'fallback') {
    return (await loadFallback()).aesGcmOpen(material.raw, iv, aad, sealed);
  }
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    material.key,
    sealed,
  );
  return new Uint8Array(plain);
}

/** HKDF-SHA256 (RFC 5869): `length` bytes from `ikm`, `salt`, `info`. */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const subtle = subtleOrUndefined();
  if (subtle === undefined) return (await loadFallback()).hkdfSha256(ikm, salt, info, length);
  const material = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    material,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** SHA-256 digest (32 bytes). */
export async function sha256Digest(data: Uint8Array): Promise<Uint8Array> {
  const subtle = subtleOrUndefined();
  if (subtle === undefined) return (await loadFallback()).sha256Digest(data);
  return new Uint8Array(await subtle.digest('SHA-256', data));
}

/**
 * A random UUID v4 for request ids and idempotency keys: `crypto.randomUUID` when present,
 * otherwise built from `getRandomValues` (RFC 9562 §5.4 version/variant bits).
 */
export function randomId(): string {
  // `randomUUID` is `[SecureContext]` too: undefined on http pages despite lib.dom.
  const randomUUID: (() => string) | undefined = globalThis.crypto.randomUUID;
  if (randomUUID !== undefined) return randomUUID.call(globalThis.crypto);
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes.set([((bytes[6] ?? 0) & 0x0f) | 0x40], 6);
  bytes.set([((bytes[8] ?? 0) & 0x3f) | 0x80], 8);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
