/**
 * Pairing secrets handed from a Foundry client (the projector) to the G2 app (ADR-0019).
 *
 * A pairing is a relay **room** (128-bit random id) plus a 256-bit AES device **key**.
 * Nothing about Foundry — no user, no password, no URL — ever reaches the phone.
 *
 * - **QR path**: `<app-url>#evf=<payload>`; the URL fragment never reaches any server.
 *   `payload` = base64url(JSON {v:2, r, k, l?, relay?}). The same QR is scanned by the
 *   Even Realities App (sideload of the hosted page) or by the installed app's camera.
 * - **Manual path**: a 16-char Crockford-base32 code (80 bits). Room and key are both
 *   derived from it with HKDF-SHA256 ({@link deriveCodePairing}), so the phone needs
 *   nothing else.
 *
 * Both are single-use: the projector rotates room and key on the first `welcome`.
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md §Decision Outcome 3
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url.js';

/** URL fragment key carrying the pairing payload. */
export const PAIRING_FRAGMENT_KEY = 'evf' as const;

/** Relay room id: base64url, 22 chars = 128 bits (the relay accepts 22–64). */
export const RoomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/** AES-256 device key, base64url (32 bytes). */
export const DeviceKeySchema = z.string().min(43).max(44);

export const PairingPayloadSchema = z.strictObject({
  v: z.literal(2),
  /** Relay room id. */
  r: RoomIdSchema,
  /** AES-256 device key, base64url. */
  k: DeviceKeySchema,
  /** Human label shown on the phone before the first `welcome` (character name). */
  l: z.string().max(64).optional(),
  /**
   * Relay origin override (`wss://…` / `ws://…` for development or a self-hosted relay).
   * Absent = the relay the app was built for.
   */
  relay: z
    .string()
    .regex(/^wss?:\/\/[^\s#?]+$/)
    .max(256)
    .optional(),
});
export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Generates a fresh random 128-bit room id. */
export function generateRoomId(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

/** Serialises a payload for the URL fragment. */
export function encodePairingPayload(payload: PairingPayload): string {
  return toBase64Url(encoder.encode(JSON.stringify(PairingPayloadSchema.parse(payload))));
}

/** Parses a fragment value; returns `null` for anything malformed. */
export function decodePairingPayload(encoded: string): PairingPayload | null {
  try {
    const json: unknown = JSON.parse(decoder.decode(fromBase64Url(encoded)));
    const parsed = PairingPayloadSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Builds the QR URL: the glasses-app page plus the payload in the fragment.
 *
 * @param appUrl - Page URL of the glasses app (any existing fragment is dropped).
 */
export function buildPairingUrl(appUrl: string, payload: PairingPayload): string {
  return `${appUrl.split('#')[0]}#${PAIRING_FRAGMENT_KEY}=${encodePairingPayload(payload)}`;
}

/** Extracts the pairing payload from `location.hash` (`#evf=…`), if any. */
export function readPairingFragment(hash: string): PairingPayload | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const value = params.get(PAIRING_FRAGMENT_KEY);
  return value === null ? null : decodePairingPayload(value);
}

/**
 * Extracts the pairing payload from any scanned text: a full pairing URL (the `#evf=`
 * fragment is what matters, whatever the origin) or a bare fragment.
 */
export function readPairingText(text: string): PairingPayload | null {
  const hashAt = text.indexOf('#');
  return readPairingFragment(hashAt >= 0 ? text.slice(hashAt) : text);
}

// ─── Manual code ─────────────────────────────────────────────────────────────

/** Crockford base32 alphabet (no I, L, O, U — unambiguous when typed). */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const MANUAL_CODE_LENGTH = 16;

/** Generates a random 16-char code (80 bits), grouped `XXXX-XXXX-XXXX-XXXX`. */
export function generateManualCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(MANUAL_CODE_LENGTH));
  let code = '';
  for (const b of bytes) code += CROCKFORD[b & 31];
  return formatManualCode(code);
}

/** Groups a normalised code in blocks of four for display. */
export function formatManualCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * Normalises user input: uppercase, strips separators, maps ambiguous glyphs
 * (O→0, I/L→1). Returns `null` unless exactly 16 valid characters remain.
 */
export function normalizeManualCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== MANUAL_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CROCKFORD.includes(ch)) return null;
  return cleaned;
}

/** Room + key derived from a manual code. */
export interface CodePairing {
  room: string;
  key: string;
}

async function hkdf(material: CryptoKey, info: string, bits: number): Promise<Uint8Array> {
  const out = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('evf-pair-v2'),
      info: encoder.encode(info),
    },
    material,
    bits,
  );
  return new Uint8Array(out);
}

/**
 * Derives the relay room (128 bits) and the AES key (256 bits) of a manual code with
 * HKDF-SHA256 (distinct `info` labels, so knowing the room reveals nothing of the key).
 *
 * @throws Error('invalid manual code') when the code does not normalise to 16 chars
 */
export async function deriveCodePairing(code: string): Promise<CodePairing> {
  const normalized = normalizeManualCode(code);
  if (normalized === null) throw new Error('invalid manual code');
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalized),
    'HKDF',
    false,
    ['deriveBits'],
  );
  return {
    room: toBase64Url(await hkdf(material, 'evf-room', 128)),
    key: toBase64Url(await hkdf(material, 'evf-key', 256)),
  };
}
