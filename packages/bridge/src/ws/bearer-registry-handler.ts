/**
 * bearer-registry-handler — bridge handler for r1.bearers.available envelopes.
 *
 * Quick Task 260604-eyf — push-based bearer-registry path for real pairing.
 *
 * Called by the `/internal/delta` route's DeltaEmitter fan-out path when an
 * envelope with `type === 'r1.bearers.available'` arrives from the Foundry module.
 *
 * ## Responsibility
 *
 * Validates the envelope payload with `BearerRegistrySnapshotSchema.safeParse`
 * (T-RFP-01: cache poisoning mitigation) and writes the validated snapshot into
 * the `BearerRegistryCache` singleton.
 *
 * ## Security
 *
 * - **T-RFP-01 (Tampering / cache poisoning):** Payload validated with
 *   `BearerRegistrySnapshotSchema.safeParse` BEFORE writing to cache.
 * - **T-RFP-02 (Information Disclosure):** Payload contents are NEVER logged
 *   (bearer tokens must not appear in logs — T-02-01 constraint).
 *
 * ## Multiplexed dispatch
 *
 * `server.ts` calls both `handleBearerRegistryEnvelope` and
 * `handleCharacterListEnvelope` inside the `/internal/delta` onDelta callback.
 * Each returns `false` when the type does not match, so dispatching to both is
 * safe and order-independent.
 *
 * @see packages/bridge/src/cache/bearer-registry-cache.ts (BearerRegistryCache)
 * @see packages/bridge/src/routes/internal-delta.ts (caller context)
 * @see packages/shared-protocol/src/payloads/bearer-registry.ts (schema)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import { BearerRegistrySnapshotSchema, R1_BEARERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { BearerRegistryCache } from '../cache/bearer-registry-cache.js';

/**
 * Handle an incoming `r1.bearers.available` envelope from the Foundry module.
 *
 * Validates the payload with `BearerRegistrySnapshotSchema.safeParse` and
 * writes it to the `BearerRegistryCache` if valid. Invalid payloads are silently
 * ignored (T-RFP-01: prevents cache poisoning from malformed envelopes).
 * Payload contents are NEVER logged (T-RFP-02 / T-02-01: bearer tokens must
 * not appear in logs).
 *
 * @param type    - Envelope type discriminant (e.g. `'r1.bearers.available'`).
 * @param payload - Raw parsed envelope payload (unknown — validated internally).
 * @param cache   - BearerRegistryCache singleton to write into.
 * @returns `true` if the envelope was handled (type matched); `false` otherwise.
 */
export function handleBearerRegistryEnvelope(
  type: string,
  payload: unknown,
  cache: BearerRegistryCache,
): boolean {
  if (type !== R1_BEARERS_AVAILABLE_TYPE) {
    return false;
  }

  // Resilience (write-channel BUG): a self-minted bearer MAY carry an empty `alias`
  // (self-pair-ingestion accepts `alias: ''`), but BearerRegistryEntrySchema requires
  // `alias` min(1). Because `bearers` is an array, ONE empty-alias entry fails the
  // WHOLE snapshot's safeParse — silently dropping the entire registry push, so the
  // bridge can never resolve any bearer's bound user (tool.invoke routing breaks for
  // every non-GM player). The alias is a display-only label with NO security role
  // (authz uses token + userId), so coerce an empty/missing alias to a placeholder
  // BEFORE validation rather than let one unlabeled bearer strand routing for all.
  if (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray((payload as { bearers?: unknown }).bearers)
  ) {
    for (const entry of (payload as { bearers: unknown[] }).bearers) {
      if (entry !== null && typeof entry === 'object') {
        const e = entry as { alias?: unknown };
        if (typeof e.alias !== 'string' || e.alias.length === 0) {
          e.alias = 'G2';
        }
      }
    }
  }

  // T-RFP-01: Validate before writing to cache — prevents cache poisoning.
  const parsed = BearerRegistrySnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    // Invalid payload — silently ignore (do NOT log payload contents;
    // bearer tokens must NEVER appear in logs per T-02-01 / T-RFP-02).
    return true; // Still "handled" — type matched, we just rejected the body.
  }

  cache.set(parsed.data);
  return true;
}
