/**
 * Bearer-registry push payload schemas (Quick Task 260604-eyf — real pairing).
 *
 * Emitted by the Foundry module's `bearer-registry-reader.ts` when the `ready`
 * hook fires and when bearers are generated, revoked, or rotated. Carries the
 * non-revoked (and currently-valid) bearer registry as a compact snapshot for
 * the bridge to use for token validation without a socketlib roundtrip.
 *
 * The bridge caches the latest payload in `bearer-registry-cache.ts`
 * (last-write-wins). `buildServer({})` builds its internal `foundryValidateFn`
 * from the cache: a token absent from a pushed registry is `unknown_token`;
 * a token present but expired is `expired`; a valid token returns the alias,
 * expiresAt, and worldId. A cold cache (no push received) returns
 * `foundry_unreachable`, distinguishable from `unknown_token`.
 *
 * ## Push-based architecture (no new socketlib handler)
 *
 * The Foundry module pushes bearer updates via the existing
 * `bridgeDeltaEmitter` channel (POST /internal/delta). This preserves the
 * `registerComplexHandler` count invariant (= 17 as of Phase 13).
 *
 * ## Security (T-RFP-01 / T-RFP-02)
 *
 * Bearer tokens are transmitted over the **EVF_INTERNAL_SECRET-gated
 * /internal/delta channel** (homelab trust model) and stored in the bridge
 * in-memory cache only. They are NEVER logged — the handler does not log
 * payload contents; the cache stores pre-validated objects.
 * Payload is Zod-validated at the handler boundary (T-RFP-01 cache-poisoning
 * mitigation) BEFORE writing to cache.
 *
 * @see packages/foundry-module/src/readers/bearer-registry-reader.ts (emitter)
 * @see packages/bridge/src/cache/bearer-registry-cache.ts (bridge cache)
 * @see packages/bridge/src/ws/bearer-registry-handler.ts (bridge handler)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for bearer-registry pushes.
 *
 * Used by the bridge's `bearer-registry-handler.ts` to narrow from the outer
 * `/internal/delta` body before applying `BearerRegistrySnapshotSchema`.
 */
export const R1_BEARERS_AVAILABLE_TYPE = 'r1.bearers.available' as const;

/**
 * Single bearer entry in the registry snapshot.
 *
 * Fields:
 * - `token`     — Opaque base64url bearer token (32-byte random).
 * - `alias`     — Human-readable device label (set by DM at pair time).
 * - `expiresAt` — Unix timestamp (ms) when this token expires.
 * - `worldId`   — Foundry world ID at time of pairing.
 *
 * @security Bearer tokens are transmitted over the EVF_INTERNAL_SECRET-gated
 *   /internal/delta channel (homelab trust model). They are never logged.
 */
export const BearerRegistryEntrySchema = z.object({
  /** Opaque base64url bearer token (32-byte random). Never logged. */
  token: z.string().min(1),
  /** Human-readable device alias (e.g. "Aiacos G2"). */
  alias: z.string().min(1),
  /** Unix timestamp (ms) when this token expires. */
  expiresAt: z.number().int().min(0),
  /** Foundry world ID at time of pairing. */
  worldId: z.string().min(1),
});

/** TypeScript type inferred from {@link BearerRegistryEntrySchema}. */
export type BearerRegistryEntry = z.infer<typeof BearerRegistryEntrySchema>;

/**
 * Full bearer-registry snapshot emitted by bearer-registry-reader.ts.
 *
 * Fields:
 * - `bearers`     — Non-revoked, non-expired bearer entries, newest-first.
 * - `source`      — `'foundry-registry'` for module-pushed payloads;
 *                   `'empty'` for cold-cache bridge responses.
 * - `count`       — Convenience count (= bearers.length).
 * - `generatedAt` — Unix timestamp (ms) when the reader built this snapshot.
 *
 * @security Transmitted over the EVF_INTERNAL_SECRET-gated /internal/delta
 *   channel. The bridge uses this to validate bearer tokens without a
 *   socketlib roundtrip (T-RFP-03 disconnected-module detection).
 */
export const BearerRegistrySnapshotSchema = z.object({
  /** Non-revoked, non-expired bearer entries, newest-first. */
  bearers: z.array(BearerRegistryEntrySchema),
  /**
   * Source discriminant:
   * - `'foundry-registry'` — pushed by foundry-module bearer-registry-reader.ts
   * - `'empty'`            — cold-cache bridge response (no push received yet)
   */
  source: z.enum(['foundry-registry', 'empty']),
  /** Count of bearers (= bearers.length). */
  count: z.number().int().min(0),
  /** Unix timestamp (ms) when this snapshot was generated. */
  generatedAt: z.number().int().min(0),
});

/** TypeScript type inferred from {@link BearerRegistrySnapshotSchema}. */
export type BearerRegistrySnapshot = z.infer<typeof BearerRegistrySnapshotSchema>;
