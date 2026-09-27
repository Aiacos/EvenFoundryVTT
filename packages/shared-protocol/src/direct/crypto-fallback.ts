/**
 * Software crypto for pages without WebCrypto — loaded lazily by `crypto.ts` only when
 * `crypto.subtle` is missing (a plain-http page is not a secure context, so `subtle` is
 * undefined there; `getRandomValues` stays). Covers exactly what the direct channel uses:
 * AES-256-GCM (96-bit IV, AAD, 128-bit tag appended to the ciphertext, as WebCrypto),
 * HKDF-SHA256 and SHA-256. Output is byte-identical to WebCrypto.
 *
 * Backed by the audited noble libraries, pinned exactly in `package.json`:
 * `@noble/ciphers` 2.4.0 and `@noble/hashes` 2.4.0. The cure53 audits covered earlier
 * releases (ciphers v1.0.0, Sep 2024 — scope: everything; hashes, Jan 2022 — scope includes
 * sha2, hkdf, hmac), not the pinned 2.4.0 itself.
 *
 * Side channels: noble is only *algorithmically* constant-time (JIT and GC defeat more in
 * JS). The GCM tag comparison is constant-time (`equalBytes`), so forging by timing is not
 * the concern; the AES rounds use table lookups that may leak cache timings (noble README
 * §Constant-timeness), weaker in theory than the native WebCrypto AES of a secure page.
 * Accepted: this path runs only on plain-http pages, already exposed to their network, and
 * https (WebCrypto) remains the recommended setup.
 *
 * @see https://github.com/paulmillr/noble-ciphers#security
 * @see https://github.com/paulmillr/noble-ciphers#constant-timeness
 * @see https://github.com/paulmillr/noble-hashes#security
 * @see docs/architecture/0019-relay-pairing-player-projector.md (Amendment 2, P0-A)
 */
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** AES-GCM encrypt: returns `ciphertext ‖ tag(16)`, like `SubtleCrypto.encrypt`. */
export function aesGcmSeal(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return gcm(key, iv, aad).encrypt(plaintext);
}

/**
 * AES-GCM decrypt of `ciphertext ‖ tag`.
 *
 * @throws Error when the tag does not authenticate (wrong key, IV, AAD or tampered data)
 */
export function aesGcmOpen(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  sealed: Uint8Array,
): Uint8Array {
  return gcm(key, iv, aad).decrypt(sealed);
}

/** HKDF-SHA256 (RFC 5869) of `length` bytes. */
export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  return hkdf(sha256, ikm, salt, info, length);
}

/** SHA-256 digest (32 bytes). */
export function sha256Digest(data: Uint8Array): Uint8Array {
  return sha256(data);
}
