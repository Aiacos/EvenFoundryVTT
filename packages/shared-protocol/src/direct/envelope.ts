/**
 * Sealed envelope carried by the relay room (ADR-0019).
 *
 * The relay is a third party and only forwards opaque frames, so the plaintext never
 * travels: AES-256-GCM with the per-device pairing key, a random 96-bit IV and
 * `from>to` as additional authenticated data (a ciphertext reflected back to its sender
 * fails authentication). A `ts` inside the plaintext bounds replay; request ids double
 * as idempotency keys on the projector.
 *
 * Crypto goes through `crypto.ts`: WebCrypto in a secure context (the Even App WebView on
 * https, Foundry on https/localhost, Node ≥ 20 in tests), the audited noble fallback on
 * plain-http pages — same bytes on the wire either way.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md §Decision Outcome 4 (envelope)
 * @see docs/architecture/0019-relay-pairing-player-projector.md §Decision Outcome 4
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url.js';
import {
  aesGcmOpen,
  aesGcmSeal,
  CryptoBackendError,
  type DeviceKey,
  importAesKey,
} from './crypto.js';

/** Address of the Foundry tab that serves the device (AAD `from`/`to`). */
export const PROJECTOR_ADDRESS = 'projector' as const;

/** Address of the G2 app (AAD `from`/`to`); the room already isolates the device. */
export const GLASSES_ADDRESS = 'glasses' as const;

/** Maximum clock skew / age accepted for a sealed message (ms). */
export const MAX_ENVELOPE_AGE_MS = 120_000;

export const SealedEnvelopeSchema = z.strictObject({
  evf: z.literal(1),
  to: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  iv: z.string().length(16),
  ct: z.string().min(1),
});
export type SealedEnvelope = z.infer<typeof SealedEnvelopeSchema>;

/**
 * Imports a raw 32-byte base64url key for AES-GCM (WebCrypto or fallback, see `crypto.ts`).
 *
 * @throws Error when the key is not valid base64url or not 32 bytes long
 */
export async function importDeviceKey(keyB64: string): Promise<DeviceKey> {
  const raw = fromBase64Url(keyB64);
  if (raw.byteLength !== 32) throw new Error(`device key must be 32 bytes, got ${raw.byteLength}`);
  return importAesKey(raw);
}

/** Generates a fresh random 32-byte device key, base64url-encoded. */
export function generateDeviceKey(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encrypts `message` for `to`. Adds `ts` (sender clock) to the plaintext.
 */
export async function seal(
  key: DeviceKey,
  from: string,
  to: string,
  message: object,
  now: number = Date.now(),
): Promise<SealedEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({ ...message, ts: now }));
  const ct = await aesGcmSeal(key, iv, encoder.encode(`${from}>${to}`), plaintext);
  return { evf: 1, to, from, iv: toBase64Url(iv), ct: toBase64Url(ct) };
}

/** Why `open` refused an envelope. */
export type OpenFailure = 'malformed' | 'auth' | 'stale';

/**
 * Decrypts and authenticates an envelope. Returns the plaintext object (with `ts`
 * stripped) or a failure reason — never throws on hostile input.
 *
 * @throws CryptoBackendError when the crypto backend itself cannot run
 */
export async function open(
  key: DeviceKey,
  envelope: SealedEnvelope,
  now: number = Date.now(),
): Promise<{ ok: true; message: Record<string, unknown> } | { ok: false; reason: OpenFailure }> {
  let plain: Uint8Array;
  try {
    plain = await aesGcmOpen(
      key,
      fromBase64Url(envelope.iv),
      encoder.encode(`${envelope.from}>${envelope.to}`),
      fromBase64Url(envelope.ct),
    );
  } catch (err) {
    // A backend that cannot run (fallback chunk not loadable, foreign key handle) is not
    // the peer's fault: rethrow it. Any other decrypt failure (bad tag, bad base64url) is
    // hostile or foreign input — reported as 'auth', never thrown (documented contract).
    if (err instanceof CryptoBackendError) throw err;
    return { ok: false, reason: 'auth' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plain));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' };
  }
  const { ts, ...message } = parsed as Record<string, unknown>;
  if (typeof ts !== 'number' || Math.abs(now - ts) > MAX_ENVELOPE_AGE_MS) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, message };
}
