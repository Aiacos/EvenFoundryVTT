/**
 * character-snapshot-handler — bridge handler for character.delta envelopes.
 *
 * Quick Task 260605-dog — bridge caches the latest character.delta per actorId.
 *
 * Called by the `/internal/delta` route's fan-out callback when an envelope
 * with `type === 'character.delta'` arrives from the Foundry module.
 *
 * ## Responsibility
 *
 * Validates the envelope payload with `CharacterSnapshotSchema.safeParse`
 * (T-dog-01: cache poisoning mitigation) and writes the validated snapshot into
 * the `CharacterSnapshotCache` keyed by `actorId`.
 *
 * ## Multiplexed dispatch
 *
 * `server.ts` calls all envelope handlers inside the `/internal/delta` onDelta
 * callback. Each handler returns `false` when the envelope type does not match,
 * so dispatching to all handlers in sequence is safe and order-independent.
 * `handleCharacterSnapshotEnvelope` therefore returns `false` on any type other
 * than `'character.delta'`, allowing sibling handlers to process their own types.
 *
 * ## Why not a full WS socket handler
 *
 * The `character.delta` envelope arrives via POST /internal/delta (module →
 * bridge push), NOT via the WS path from the g2-app client. The
 * `internal-delta.ts` route fans the envelope to connected g2-app WS sessions
 * via `DeltaEmitter.emitDelta` (UNCHANGED). We intercept in the onDelta
 * callback to additionally cache the payload for `internalSnapshotFn`.
 *
 * @see packages/bridge/src/cache/character-snapshot-cache.ts (CharacterSnapshotCache)
 * @see packages/bridge/src/routes/internal-delta.ts (caller context)
 * @see packages/bridge/src/ws/spell-pack-handler.ts (sibling handler)
 * @see packages/shared-protocol/src/payloads/character.ts (schema)
 * @see .planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-PLAN.md Task 1
 */

import { CHARACTER_DELTA_TYPE, CharacterSnapshotSchema } from '@evf/shared-protocol';
import type { CharacterSnapshotCache } from '../cache/character-snapshot-cache.js';

/**
 * Handle an incoming `character.delta` envelope from the Foundry module.
 *
 * Validates the payload with `CharacterSnapshotSchema.safeParse` and writes
 * the snapshot to the `CharacterSnapshotCache` (keyed by `actorId`) if valid.
 * Invalid payloads are silently ignored (T-dog-01: prevents cache poisoning
 * from malformed envelopes; mirrors T-SP-02 / T-EP-02 conventions).
 *
 * @param type    - Envelope type discriminant (e.g. `'character.delta'`).
 * @param payload - Raw parsed envelope payload (unknown — validated internally).
 * @param cache   - CharacterSnapshotCache to write into (keyed by actorId).
 * @returns `true` if the envelope type matched (regardless of body validity);
 *          `false` if the type did not match (sibling handlers may handle it).
 */
export function handleCharacterSnapshotEnvelope(
  type: string,
  payload: unknown,
  cache: CharacterSnapshotCache,
): boolean {
  if (type !== CHARACTER_DELTA_TYPE) {
    return false;
  }

  // T-dog-01: Validate before writing to cache — prevents cache poisoning.
  const parsed = CharacterSnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    // Invalid payload — silently ignore (do NOT log payload contents; may contain PII).
    return true; // Still "handled" — type matched, we just rejected the body.
  }

  cache.set(parsed.data);
  return true;
}
