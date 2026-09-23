/**
 * Sealed envelope for the Foundry `module.evenfoundryvtt` relay.
 *
 * Foundry relays module socket messages to **every** connected client, so the
 * plaintext never travels: AES-256-GCM with the per-device pairing key, a random
 * 96-bit IV and `from>to` as additional authenticated data (a ciphertext re-addressed
 * to another device fails authentication). A `ts` inside the plaintext bounds replay;
 * request ids double as idempotency keys on the projector.
 *
 * Uses WebCrypto only (`globalThis.crypto.subtle`) — available in the Even App
 * WebView, Foundry browser clients and Node ≥ 20 (tests).
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md §Decision Outcome 4
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md §Decision 6
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url.js';

/** Socket event name used on the Foundry relay (`module.<id>`). */
export const DIRECT_SOCKET_EVENT = 'module.evenfoundryvtt' as const;

/**
 * Address the glasses write to: whichever Foundry client is currently elected projector
 * for the device (the player's own client, else a GM holding the device key — ADR-0017
 * §Decision 6). Replies are sealed `from` the same address, so the AAD `from>to` does not
 * depend on which client answered.
 */
export const PROJECTOR_ADDRESS = 'projector' as const;

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

/** Imports a raw 32-byte base64url key for AES-GCM. */
export async function importDeviceKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyB64);
  if (raw.byteLength !== 32) throw new Error(`device key must be 32 bytes, got ${raw.byteLength}`);
  return globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
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
  key: CryptoKey,
  from: string,
  to: string,
  message: object,
  now: number = Date.now(),
): Promise<SealedEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({ ...message, ts: now }));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${from}>${to}`) },
    key,
    plaintext,
  );
  return { evf: 1, to, from, iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/** Why `open` refused an envelope. */
export type OpenFailure = 'malformed' | 'auth' | 'stale';

/**
 * Decrypts and authenticates an envelope. Returns the plaintext object (with `ts`
 * stripped) or a failure reason — never throws on hostile input.
 */
export async function open(
  key: CryptoKey,
  envelope: SealedEnvelope,
  now: number = Date.now(),
): Promise<{ ok: true; message: Record<string, unknown> } | { ok: false; reason: OpenFailure }> {
  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.iv),
        additionalData: encoder.encode(`${envelope.from}>${envelope.to}`),
      },
      key,
      fromBase64Url(envelope.ct),
    );
  } catch {
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
