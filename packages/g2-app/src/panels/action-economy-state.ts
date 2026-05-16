/**
 * action-economy-state — module-scoped per-actor action economy cache (Plan 09-01 — COMB-02).
 *
 * Maintains a synchronous in-process cache of per-actor action economy state,
 * written by `action-economy-dispatcher.ts` on every validated `r1.action.economy`
 * envelope and read by Plan 09-02's `ActionOptionsModal` client-side preconditioner.
 *
 * ## Trust boundary
 *
 * This cache ONLY stores payloads that have passed the double trust boundary
 * validation in `action-economy-dispatcher.ts` (outer EnvelopeSchema + inner
 * ActionEconomyPayloadSchema). The cache itself is in-process and trusted.
 *
 * ## T-09-01 (desync): client cache is OPTIONAL fast-path
 *
 * The cache exists to prevent unnecessary round-trips when the UI knows an action
 * slot is already consumed. The Foundry server ALWAYS re-validates from chat-card
 * history before executing any tool. If the cache is stale (network hiccup, deferred
 * envelope), the server-side check is the authoritative gate.
 *
 * ## T-09-03 (cross-player leak)
 *
 * Only payloads with matching `recipientUserId` reach this cache (filtered by
 * `action-economy-dispatcher.ts` before calling `setActionEconomyState`). The cache
 * does not filter on lookup — caller provides the actorId directly.
 *
 * @see packages/g2-app/src/panels/action-economy-dispatcher.ts (writer)
 * @see packages/shared-protocol/src/payloads/action-economy.ts (ActionEconomyPayload shape)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 3
 */

import type { ActionEconomyPayload } from '@evf/shared-protocol';

// ─── Module-scoped state ──────────────────────────────────────────────────────

/**
 * Per-actor economy state cache.
 *
 * Keyed by `actorId` (Foundry actor document ID). Only actors whose envelopes
 * have been validated and routed to this session are present.
 *
 * Cleared on boot teardown or explicit `clearActionEconomyState()` (used by tests
 * and boot lifecycle reset).
 */
const _state: Map<string, ActionEconomyPayload> = new Map();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the cached economy state for the given actor, or `null` if not yet seen.
 *
 * The Plan 09-02 preconditioner calls this to short-circuit dispatch when
 * `actionsUsed === 1` (or `bonusActionsUsed === 1`) — avoiding a server round-trip
 * for an action that will certainly fail economy validation.
 *
 * Returns `null` rather than a zeroed default to distinguish "cache cold" from
 * "cache populated with all-zero state". Callers should treat `null` as "no data
 * yet" and allow the action (server will validate).
 *
 * @param actorId - Foundry actor document ID.
 * @returns The latest validated ActionEconomyPayload, or null if not yet cached.
 */
export function getActionEconomyState(actorId: string): ActionEconomyPayload | null {
  return _state.get(actorId) ?? null;
}

/**
 * Write the validated economy payload into the cache.
 *
 * Called exclusively by `action-economy-dispatcher.ts` after the double trust
 * boundary parse succeeds and `recipientUserId` matches the current session's
 * bearer. NEVER call from untrusted code.
 *
 * @param payload - The validated ActionEconomyPayload (already passed safeParse).
 */
export function setActionEconomyState(payload: ActionEconomyPayload): void {
  _state.set(payload.actorId, payload);
}

/**
 * Clear all cached economy state.
 *
 * Used by:
 * - Test `beforeEach` to isolate module-scoped state across tests.
 * - Boot teardown to reset client state when the WS session closes.
 *
 * Safe to call on an empty cache (no-op).
 */
export function clearActionEconomyState(): void {
  _state.clear();
}
