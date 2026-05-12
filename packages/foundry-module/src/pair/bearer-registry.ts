/**
 * @evf/foundry-module — Bearer token registry.
 *
 * Foundry-authoritative store for opaque bearer tokens used to authenticate
 * the Even Realities App (phone WebView) to the EvenFoundryVTT bridge.
 *
 * Security design:
 * - Tokens are 32-byte cryptographically random base64url strings — NOT JWTs.
 *   (D-2.10: opaque = rotatable, revocable O(1), no verifiable-claims overhead)
 * - `internal_secret` is a second 32-byte random value generated per-pair.
 *   Consumed by the Foundry module to authenticate outbound HTTP POST requests
 *   to bridge `/internal/delta` (Plan 05). Stored as the `internalSecret` field
 *   inside each `BearerEntry` within the `evf.bearerRegistry` setting (world scope).
 * - Tokens are NEVER logged (T-02-01 threat mitigation).
 * - Token values are NEVER rendered in ApplicationV2 HTML — only alias + expiry.
 *
 * Storage:
 * - `evf.bearerRegistry` — `BearerRegistry` keyed by token (world scope, Tier 3)
 *
 * ADR-0002 envelope shape (documented here, defined in Plan 05 shared-protocol):
 * Envelope: { proto: "evf-v1", seq: number, ts: number, type: string, payload: unknown }
 *
 * @see 02-02-PLAN.md Task 1 (bearer registry specification)
 * @see 02-CONTEXT.md D-2.10 (opaque bearer), D-2.11 (TTL + grace), D-2.12 (registry tier)
 * @see Specs.md §11.5.4 (bearer 24h opaque token)
 */

import { MODULE_ID } from '../module.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single paired device entry in the registry.
 *
 * The `token` field is the opaque 32-byte base64url bearer used by the Even App
 * to authenticate WS connections to the bridge.
 *
 * The `internalSecret` is a second opaque 32-byte base64url value used only on
 * the server side: the Foundry module uses it to authenticate HTTP POST requests
 * to the bridge `/internal/delta` endpoint (Plan 05). It is included in the QR
 * payload `{ bridge_url, token, internal_secret, world, expires }` so the bridge
 * can associate the secret with the correct bearer at setup time.
 *
 * @see Specs.md §7.14.7.3 (QR payload: bridge_url, token, world, expires)
 * @see 02-02-PLAN.md H-1 (per-pair internal_secret fix — plan-check gap closure)
 */
export interface BearerEntry {
  /** Opaque 32-byte base64url bearer token. Authenticated by bridge. */
  token: string;
  /** Device alias (up to 40 chars). Set by DM in pair modal. */
  alias: string;
  /** Foundry world ID at time of pairing. */
  worldId: string;
  /** Bridge URL the QR was configured for (e.g. "https://bridge.local:8910"). */
  bridgeUrl: string;
  /** Per-pair internal secret (32-byte base64url). Used for Foundry→Bridge POST auth. */
  internalSecret: string;
  /** Unix epoch ms when this entry was created. */
  createdAt: number;
  /** Unix epoch ms when this token expires. Default: createdAt + 24h. */
  expiresAt: number;
  /** Unix epoch ms of the last successful validation call; null if never seen. */
  lastSeenAt: number | null;
  /** Unix epoch ms when this token was revoked; null if still active. */
  revokedAt: number | null;
}

/**
 * Foundry settings-stored registry of all bearer entries.
 *
 * Stored under `game.settings.get("evenfoundryvtt", "bearerRegistry")`.
 * Keyed by the raw token string for O(1) lookup.
 */
export interface BearerRegistry {
  /** All bearer entries, including revoked and expired (for audit trail). */
  entries: Record<string, BearerEntry>;
  /** Schema version sentinel. Must equal 1. */
  version: 1;
}

// ─── Registry setting key ─────────────────────────────────────────────────────

const REGISTRY_KEY = 'bearerRegistry' as const;

/** 24-hour TTL in milliseconds. */
const TTL_24H_MS = 24 * 3600 * 1000;

/** Grace period for old tokens after refresh (D-2.11). */
const GRACE_60S_MS = 60 * 1000;

/** Maximum alias length (enforced at entry creation). */
const MAX_ALIAS_LENGTH = 40;

// ─── Registry helpers ─────────────────────────────────────────────────────────

/**
 * Reads the bearer registry from Foundry settings.
 * Returns an empty registry if none is stored yet.
 */
function readRegistry(): BearerRegistry {
  const stored = game.settings.get(MODULE_ID, REGISTRY_KEY) as BearerRegistry | undefined;
  if (!stored) {
    return { entries: {}, version: 1 };
  }
  return stored;
}

/**
 * Persists the bearer registry to Foundry settings.
 *
 * @param registry - The registry to persist
 */
function writeRegistry(registry: BearerRegistry): void {
  game.settings.set(MODULE_ID, REGISTRY_KEY, registry);
}

/**
 * Converts a Uint8Array to a base64url string (no padding).
 *
 * Uses the standard base64url alphabet: A-Z, a-z, 0-9, -, _
 * (RFC 4648 §5 — URL and Filename Safe Base64).
 *
 * @param bytes - Raw bytes to encode
 * @returns base64url string without padding characters
 */
function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generates a cryptographically random 32-byte base64url opaque token.
 *
 * Uses `crypto.getRandomValues` (available in Foundry v13+ browser context and
 * in Node.js 24 via globalThis.crypto). The resulting string is 43 chars minimum
 * (32 bytes × 4/3, no padding).
 *
 * Token values are NEVER logged (T-02-01 threat mitigation).
 *
 * @returns 43+ character base64url string (no dots — NOT a JWT)
 */
function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64url(bytes);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a new bearer token entry and persists it to the registry.
 *
 * If `refresh=true`, the previous active token for the same alias + bridgeUrl
 * combination is updated to expire after a 60-second grace period (D-2.11),
 * allowing in-flight requests to complete before the old token is fully rejected.
 *
 * @param alias - Human-readable device label (up to 40 chars; truncated if longer)
 * @param bridgeUrl - Bridge URL the QR is configured for
 * @param worldId - Foundry world ID (included in QR payload)
 * @param refresh - If true, shorten the TTL of the previous active bearer to 60s
 * @returns The newly created BearerEntry (token value included for QR generation only)
 *
 * @example
 * ```ts
 * const entry = await generateBearer("Aiacos's G2", "https://bridge.local:8910", "world-abc");
 * // Use entry.token + entry.internalSecret to build the QR payload
 * // NEVER log entry.token (T-02-01)
 * ```
 */
export async function generateBearer(
  alias: string,
  bridgeUrl: string,
  worldId: string,
  refresh = false,
): Promise<BearerEntry> {
  const registry = readRegistry();
  const now = Date.now();

  // Enforce alias length limit
  const safeAlias = alias.slice(0, MAX_ALIAS_LENGTH);

  // Silent refresh: shorten TTL of any active bearer for this alias+bridge to 60s grace
  if (refresh) {
    for (const entry of Object.values(registry.entries)) {
      if (
        entry.alias === safeAlias &&
        entry.bridgeUrl === bridgeUrl &&
        entry.revokedAt === null &&
        entry.expiresAt > now
      ) {
        entry.expiresAt = now + GRACE_60S_MS;
      }
    }
  }

  // Generate new token and internal secret (separate random values — D-2.10)
  const token = generateOpaqueToken();
  const internalSecret = generateOpaqueToken();

  const entry: BearerEntry = {
    token,
    alias: safeAlias,
    worldId,
    bridgeUrl,
    internalSecret,
    createdAt: now,
    expiresAt: now + TTL_24H_MS,
    lastSeenAt: null,
    revokedAt: null,
  };

  registry.entries[token] = entry;
  writeRegistry(registry);

  return entry;
}

/**
 * Validates a bearer token against the registry.
 *
 * Checks in order: existence → revocation → expiry.
 * Returns `{ valid: false, reason: "unknown_token" }` for any unregistered token
 * rather than throwing — guards against malformed calls per T-02-04.
 *
 * @param token - The raw bearer token string to validate
 * @returns Validation result with entry reference on success, reason on failure
 */
export function validateBearer(token: string): {
  valid: boolean;
  entry?: BearerEntry;
  reason?: string;
} {
  const registry = readRegistry();
  const entry = registry.entries[token];

  if (!entry) {
    return { valid: false, reason: 'unknown_token' };
  }

  if (entry.revokedAt !== null) {
    return { valid: false, reason: 'revoked', entry };
  }

  if (entry.expiresAt < Date.now()) {
    return { valid: false, reason: 'expired', entry };
  }

  return { valid: true, entry };
}

/**
 * Revokes a bearer token by recording the revocation timestamp.
 *
 * After revocation, `validateBearer` will return `{ valid: false, reason: "revoked" }`.
 * The entry is preserved in the registry for audit trail purposes.
 * Is a no-op for unknown tokens (does not throw).
 *
 * @param token - The raw bearer token string to revoke
 */
export function revokeBearer(token: string): void {
  const registry = readRegistry();
  const entry = registry.entries[token];

  if (!entry) {
    return; // No-op for unknown tokens
  }

  entry.revokedAt = Date.now();
  writeRegistry(registry);
}

/**
 * Returns all non-revoked bearer entries, sorted by `createdAt` descending
 * (most recent first). Expired but non-revoked entries are included (useful for
 * showing "refresh needed" state in the pair modal).
 *
 * @returns Array of active (non-revoked) BearerEntry objects, newest first
 */
export function listBearers(): BearerEntry[] {
  const registry = readRegistry();

  return Object.values(registry.entries)
    .filter((entry) => entry.revokedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt);
}
