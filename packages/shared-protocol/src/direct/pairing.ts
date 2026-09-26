/**
 * Pairing secrets handed from a Foundry client (the projector) to the G2 app (ADR-0019,
 * Amendment 1).
 *
 * A pairing is a relay **room** plus an AES-256 device **key**, both derived with HKDF from
 * one 16-char Crockford-base32 **code** (80 bits, {@link deriveCodePairing}). Nothing about
 * Foundry — no user, no password, no URL — ever reaches the phone.
 *
 * - **QR path**: `<app-url>#c=<CODE>[&relay=<ws(s)://…>]` — the code only, so the QR stays
 *   small (≈ 63 characters, QR version 4) and scannable from a screen, and the link is short
 *   enough to type. The URL fragment never reaches any server. `relay` is present only for
 *   development / self-hosted relays.
 * - **Manual path**: the same code typed on the phone page.
 *
 * Single use: the projector rotates room and key to fresh random values on the first
 * `welcome`, and an unused code expires after 5 minutes.
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md §Decision Outcome 3 + Amendment 1
 */
import { z } from 'zod';
import { toBase64Url } from './base64url.js';

/** URL fragment key carrying the pairing code. */
export const PAIRING_CODE_KEY = 'c' as const;
/** URL fragment key carrying a non-default relay (development / self-hosting). */
export const PAIRING_RELAY_KEY = 'relay' as const;

/** Relay room id: base64url, 22 chars = 128 bits (the relay accepts 22–64). */
export const RoomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/** AES-256 device key, base64url (32 bytes). */
export const DeviceKeySchema = z.string().min(43).max(44);

/** Relay override accepted in a pairing link: `ws://` or `wss://`, no query or fragment. */
export const RelayUrlSchema = z
  .string()
  .regex(/^wss?:\/\/[^\s#?&]+$/)
  .max(256);

/** What a pairing link (QR) carries. */
export interface PairingLink {
  /** Normalised 16-char code (no dashes). */
  code: string;
  /** Relay override; absent = the relay the app was built for. */
  relay?: string;
}

const encoder = new TextEncoder();

/** Generates a fresh random 128-bit room id. */
export function generateRoomId(): string {
  return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Builds the QR URL: the glasses-app page plus the code (and a non-default relay) in the
 * fragment.
 *
 * @param appUrl - Page URL of the glasses app (any existing fragment is dropped).
 * @throws Error when the code or the relay is invalid
 */
export function buildPairingUrl(appUrl: string, link: PairingLink): string {
  const code = normalizeManualCode(link.code);
  if (code === null) throw new Error('invalid pairing code');
  const relay =
    link.relay === undefined ? '' : `&${PAIRING_RELAY_KEY}=${RelayUrlSchema.parse(link.relay)}`;
  return `${appUrl.split('#')[0]}#${PAIRING_CODE_KEY}=${code}${relay}`;
}

/** Extracts the pairing link from `location.hash` (`#c=…`), if any. */
export function readPairingFragment(hash: string): PairingLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(PAIRING_CODE_KEY);
  const code = raw === null ? null : normalizeManualCode(raw);
  if (code === null) return null;
  const relay = params.get(PAIRING_RELAY_KEY);
  if (relay === null) return { code };
  const parsed = RelayUrlSchema.safeParse(relay);
  return parsed.success ? { code, relay: parsed.data } : null;
}

/**
 * Extracts the pairing link from any scanned text: a full pairing URL (the fragment is what
 * matters, whatever the origin), a bare fragment, or just the code.
 */
export function readPairingText(text: string): PairingLink | null {
  const trimmed = text.trim();
  const hashAt = trimmed.indexOf('#');
  if (hashAt >= 0) return readPairingFragment(trimmed.slice(hashAt));
  if (trimmed.includes('=')) return readPairingFragment(trimmed);
  const code = normalizeManualCode(trimmed);
  return code === null ? null : { code };
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
