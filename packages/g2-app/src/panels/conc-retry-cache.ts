/**
 * conc-retry-cache — Single-attempt buffer for concentration-conflict cast retry.
 *
 * Plan 09-03 Task 2: buffers the original `tool.invoke` envelope emitted by
 * `ActionOptionsModal` when a concentration spell is blocked by the server
 * (`concentration-required` error). The `ConcentrationDropModalPanel` [Y] tap
 * consumes the buffer via `consumeLatestConfirmed()` and re-dispatches the
 * blocked cast after the active concentration has been dropped.
 *
 * ## Flow
 *
 * 1. `ActionOptionsModal` emits `tool.invoke` (cast-spell) + caches with `'unconfirmed'`.
 * 2. `castSpellHandler` returns `{ success: false, error: 'concentration-required' }`.
 * 3. `action-result-watcher` maps error → `errorKind: 'concentration-required'`.
 * 4. `action-result-dispatcher` sees `errorKind === 'concentration-required'` →
 *    calls `markRetryConfirmed(payload.idempotencyKey)` instead of enqueueing a toast.
 * 5. Concurrently: `bridgeDeltaEmitter(CONC_CONFLICT_TYPE, ...)` triggers the bridge to
 *    forward `conc.conflict` → `conc-conflict-dispatcher` mounts the modal.
 * 6. `ConcentrationDropModalPanel` [Y] tap:
 *    a. Emits `tool.invoke` for drop-concentration.
 *    b. Emits legacy `conc.drop.confirmed`.
 *    c. Calls `consumeLatestConfirmed()` → re-dispatches the blocked envelope.
 * 7. The re-dispatched envelope uses the SAME `idempotencyKey` (Phase 7's
 *    `IdempotencyStore` TTL has expired or the entry was consumed — acceptable:
 *    the re-dispatch is intentional, not a duplicate).
 *
 * ## Threat mitigations
 *
 * - **T-09-03 (retry race):** `consumeLatestConfirmed()` deletes the entry on first
 *   call, so the second [Y] tap is a no-op. Single-attempt invariant enforced by
 *   tests CRC-02 + CRC-06.
 * - **T-09-04 (DoS via cache growth):** 30s TTL (`evictExpired()` called lazily on
 *   every consume call) + `clearRetryCache()` on boot teardown.
 * - **T-09-02 (spoofing):** Only entries that reach `confirmed` status can be
 *   consumed. Confirmation requires the server to actually reject the cast with
 *   `concentration-required` (action-result-dispatcher path). An attacker cannot
 *   create a confirmed entry without sending a valid cast that conflicts.
 *
 * ## Key selection
 *
 * Two-level index:
 * - Primary: `Map<idempotencyKey, CacheEntry>` — used by `markRetryConfirmed` and
 *   `consumeRetryEnvelope` (idempotencyKey-addressed lookups).
 * - Secondary: `latestConfirmedKey: string | null` — pointer to the most-recently-
 *   confirmed entry. Used by `consumeLatestConfirmed()` so the modal doesn't need
 *   to know the original idempotencyKey (which is embedded in the envelope payload
 *   but not directly accessible from the modal's session context).
 *
 * @see packages/g2-app/src/panels/action-options-modal.ts (writes unconfirmed entry)
 * @see packages/g2-app/src/panels/action-result-dispatcher.ts (marks confirmed)
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (consumes latest)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (teardown: clearRetryCache)
 * @see .planning/phases/09-action-economy-edge-cases/09-03-PLAN.md Task 2
 */

/** Status of a cache entry. */
type CacheStatus = 'unconfirmed' | 'confirmed';

/** A single cache entry. */
interface CacheEntry {
  readonly envelope: unknown;
  status: CacheStatus;
  readonly expiresAt: number;
}

/** TTL in milliseconds (T-09-04 DoS mitigation). */
const CACHE_TTL_MS = 30_000;

// ─── Module-scoped state ─────────────────────────────────────────────────────

/**
 * Primary map: idempotencyKey → cache entry.
 *
 * Written by `cacheRetryEnvelope`; read by `markRetryConfirmed`,
 * `consumeRetryEnvelope`, `clearRetryCache`, and `evictExpired`.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Secondary index: points to the most-recently-confirmed idempotencyKey.
 *
 * Updated by `markRetryConfirmed`; consumed by `consumeLatestConfirmed`.
 * Reset to null by `clearRetryCache` and `consumeLatestConfirmed` after returning.
 */
let latestConfirmedKey: string | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Evict all expired entries from the cache (lazy — called on every consume op).
 *
 * Iterates the entire map and deletes entries whose `expiresAt` has passed.
 * Also clears `latestConfirmedKey` if the pointed entry is evicted.
 *
 * Lazy eviction avoids needing a proactive timer — TTL + consume op is sufficient
 * for the Phase 9 use case (one retry per concentration conflict).
 */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
      if (latestConfirmedKey === key) {
        latestConfirmedKey = null;
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write an envelope to the retry cache with the given status.
 *
 * Overwrites any existing entry for `idemKey` (including confirmed entries —
 * overwrite resets status to the provided value). Entries expire after
 * {@link CACHE_TTL_MS} milliseconds.
 *
 * Called by `ActionOptionsModal` immediately BEFORE `ws.send(...)` in the tap
 * path (requiresTarget=false), with status `'unconfirmed'`.
 *
 * @param idemKey  Idempotency key from the outgoing `tool.invoke` envelope payload.
 * @param envelope The original outgoing envelope (verbatim JSON-serializable object).
 * @param status   Initial cache status. Default: `'unconfirmed'`.
 */
export function cacheRetryEnvelope(
  idemKey: string,
  envelope: unknown,
  status: CacheStatus = 'unconfirmed',
): void {
  cache.set(idemKey, {
    envelope,
    status,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Mark a cached entry as confirmed, enabling it to be consumed.
 *
 * Called by `action-result-dispatcher` when it receives an `r1.action.result`
 * envelope with `errorKind === 'concentration-required'`. This proves the
 * server actually rejected the cast (T-09-02 mitigation — attacker cannot
 * create a confirmed entry without triggering a real server rejection).
 *
 * Updates `latestConfirmedKey` to enable `consumeLatestConfirmed()`.
 *
 * @param idemKey Idempotency key of the entry to confirm.
 */
export function markRetryConfirmed(idemKey: string): void {
  const entry = cache.get(idemKey);
  if (entry === undefined) {
    return; // No-op: entry may have expired or never existed
  }
  entry.status = 'confirmed';
  latestConfirmedKey = idemKey;
}

/**
 * Consume a confirmed entry by idempotencyKey.
 *
 * Returns the buffered envelope AND deletes the entry (single-attempt invariant —
 * T-09-03). Returns `null` if the entry does not exist, is not confirmed, or has
 * expired.
 *
 * Calls `evictExpired()` lazily on every invocation.
 *
 * @param idemKey Idempotency key of the entry to consume.
 * @returns The buffered envelope, or `null` if not consumable.
 */
export function consumeRetryEnvelope(idemKey: string): unknown | null {
  evictExpired();
  const entry = cache.get(idemKey);
  if (entry === undefined || entry.status !== 'confirmed') {
    return null;
  }
  // Single-attempt: delete immediately (T-09-03 mitigation)
  cache.delete(idemKey);
  if (latestConfirmedKey === idemKey) {
    latestConfirmedKey = null;
  }
  return entry.envelope;
}

/**
 * Consume the most recently confirmed entry without knowing its idempotencyKey.
 *
 * Used by `ConcentrationDropModalPanel` [Y] tap: the modal has the session UUID
 * but NOT the original cast's idempotencyKey. This function bridges that gap via
 * the `latestConfirmedKey` secondary index.
 *
 * Deletes the entry on consumption (single-attempt — T-09-03). Calls `evictExpired()`
 * lazily. Returns `null` if no confirmed entry exists.
 *
 * @returns The most-recently-confirmed envelope, or `null`.
 */
export function consumeLatestConfirmed(): unknown | null {
  evictExpired();
  if (latestConfirmedKey === null) {
    return null;
  }
  return consumeRetryEnvelope(latestConfirmedKey);
}

/**
 * Clear all entries from the retry cache.
 *
 * Called by `boot-engine-core.ts` teardown (BERW-17) to prevent bleed across
 * boot cycles in tests. Also resets `latestConfirmedKey`.
 */
export function clearRetryCache(): void {
  cache.clear();
  latestConfirmedKey = null;
}
