/**
 * Pairing credentials shared from the Foundry module (GM) to the G2 app.
 *
 * - **QR path**: `<origin>/modules/evenfoundryvtt/g2/index.html#evf=<payload>`; the URL
 *   fragment never reaches the server. `payload` = base64url(JSON {v,u,p,k}).
 * - **Manual path**: the user picks the "(G2)" Foundry user and types a 16-char
 *   Crockford-base32 code; the code is the Foundry password and the AES key is
 *   HKDF-SHA256(code, salt = userId). Both are rotated on the first `welcome`.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md §Decision Outcome 3
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './base64url.js';

/** URL fragment key carrying the pairing payload. */
export const PAIRING_FRAGMENT_KEY = 'evf' as const;

/** Module-relative path of the G2 app entrypoint served by Foundry. */
export const G2_APP_PATH = 'modules/evenfoundryvtt/g2/index.html' as const;

export const PairingPayloadSchema = z.strictObject({
  v: z.literal(1),
  /** Foundry user id of the dedicated "(G2)" user. */
  u: z.string().min(1).max(64),
  /** Foundry password of that user. */
  p: z.string().min(12).max(128),
  /** AES-256 device key, base64url. */
  k: z.string().min(43).max(44),
});
export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
 * Builds the QR URL for a Foundry origin (may include a routePrefix path, e.g.
 * `https://host/foundry`). Trailing slashes are normalised.
 */
export function buildPairingUrl(foundryBase: string, payload: PairingPayload): string {
  const base = foundryBase.replace(/\/+$/, '');
  return `${base}/${G2_APP_PATH}#${PAIRING_FRAGMENT_KEY}=${encodePairingPayload(payload)}`;
}

/** Extracts the pairing payload from `location.hash` (`#evf=…`), if any. */
export function readPairingFragment(hash: string): PairingPayload | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const value = params.get(PAIRING_FRAGMENT_KEY);
  return value === null ? null : decodePairingPayload(value);
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

/** Derives the base64url AES key for the manual path (HKDF-SHA256, salt = userId). */
export async function deriveKeyFromManualCode(code: string, userId: string): Promise<string> {
  const normalized = normalizeManualCode(code);
  if (normalized === null) throw new Error('invalid manual code');
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalized),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(userId),
      info: encoder.encode('evf-pair-v1'),
    },
    material,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}
