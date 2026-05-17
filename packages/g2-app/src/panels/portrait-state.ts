/**
 * portrait-state — module-scoped per-actor portrait byte cache (Plan 13-04 — STRETCH-06).
 *
 * Mirrors `action-economy-state.ts` exactly in structure. Maintains a synchronous
 * in-process cache of per-actor portrait entries, written by `portrait-dispatcher.ts`
 * on every validated `r1.portrait.ready` envelope and read by
 * `CharacterSheetPanel._applyPortraitOverride` on Bio tab activation.
 *
 * ## Trust boundary
 *
 * This cache ONLY stores payloads that have passed the double trust boundary
 * validation in `portrait-dispatcher.ts` (outer EnvelopeSchema + inner
 * PortraitReadyPayloadSchema). The cache itself is in-process and trusted.
 *
 * ## T-13-03 (cache poisoning at g2-app boundary)
 *
 * Portrait bytes are validated by PortraitReadyPayloadSchema (urlHash regex
 * /^[0-9a-f]{64}$/, width/height z.literal(100/60)) before reaching this cache.
 * The cache is scoped to the current WebView session (single-tenant homelab):
 * no cross-session leakage is possible.
 *
 * @see packages/g2-app/src/panels/portrait-dispatcher.ts (writer)
 * @see packages/shared-protocol/src/payloads/portrait.ts (PortraitReadyPayload shape)
 * @see .planning/phases/13-v2-stretch/13-04-PLAN.md Task 1
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-actor portrait cache entry.
 *
 * `pngBase64` — Base64-encoded 100×60 4-bit indexed-palette PNG bytes produced
 * by the bridge's server-side dither pipeline (Plan 13-03 PortraitRenderer).
 * `urlHash` — SHA-256 hex of the resolved portrait URL (64 hex chars).
 */
export interface PortraitEntry {
  /** Base64-encoded PNG bytes (100×60 4-bit greyscale palette). */
  pngBase64: string;
  /** SHA-256 hex of the resolved portrait URL (64 chars, /^[0-9a-f]{64}$/). */
  urlHash: string;
}

// ─── Module-scoped state ──────────────────────────────────────────────────────

/**
 * Per-actor portrait byte cache.
 *
 * Keyed by `actorId` (Foundry actor document ID). Only actors whose envelopes
 * have been validated and routed to this session are present.
 *
 * Cleared on boot teardown or explicit `clearPortraitBytes()` (used by tests
 * and boot lifecycle reset).
 */
const _bytes: Map<string, PortraitEntry> = new Map();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the cached portrait bytes for the given actor, or `null` if not yet seen.
 *
 * CharacterSheetPanel._applyPortraitOverride calls this to retrieve the portrait
 * bytes for the current actor on Bio tab activation.
 *
 * Returns `null` rather than a stub to distinguish "cache cold" from "cache
 * populated". Callers should gracefully skip portrait rendering when `null`.
 *
 * @param actorId - Foundry actor document ID.
 * @returns The cached PortraitEntry, or null if not yet received.
 */
export function getPortraitBytes(actorId: string): PortraitEntry | null {
  return _bytes.get(actorId) ?? null;
}

/**
 * Write the validated portrait entry into the cache.
 *
 * Called exclusively by `portrait-dispatcher.ts` after the double trust
 * boundary parse succeeds. NEVER call from untrusted code.
 *
 * @param actorId - Foundry actor document ID.
 * @param entry   - The validated portrait entry (already passed PortraitReadyPayloadSchema).
 */
export function setPortraitBytes(actorId: string, entry: PortraitEntry): void {
  _bytes.set(actorId, entry);
}

/**
 * Clear cached portrait bytes.
 *
 * - `clearPortraitBytes(actorId)` — remove a single actor's entry.
 * - `clearPortraitBytes()` — clear the entire cache.
 *
 * Used by:
 * - Test `afterEach` to isolate module-scoped state across tests.
 * - Boot teardown to reset client state when the WS session closes.
 * - CharacterSheetPanel.onUnmount to release stale portrait bytes.
 *
 * Safe to call on an empty cache or with an unknown actorId (no-op).
 *
 * @param actorId - Optional actor ID to clear. If omitted, clears all.
 */
export function clearPortraitBytes(actorId?: string): void {
  if (actorId !== undefined) {
    _bytes.delete(actorId);
  } else {
    _bytes.clear();
  }
}
