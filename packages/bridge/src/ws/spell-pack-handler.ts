/**
 * spell-pack-handler — bridge WS handler for r1.spells.available envelopes.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 2).
 *
 * Called by the `/internal/delta` route's DeltaEmitter fan-out path when an
 * envelope with `type === 'r1.spells.available'` arrives from the Foundry module.
 *
 * ## Responsibility
 *
 * Validates the envelope payload with `AvailableSpellsPayloadSchema.safeParse`
 * (T-SP-02: cache poisoning mitigation) and writes the validated payload into
 * the `SpellPackCache` singleton.
 *
 * ## Why not a full WS socket handler
 *
 * The `r1.spells.available` envelope arrives via POST /internal/delta (module →
 * bridge push), NOT via the WS path from the g2-app client. The
 * `internal-delta.ts` route calls `deltaEmitter.emitDelta()` which fans the
 * envelope to connected g2-app WS sessions. We intercept in the `/internal/delta`
 * route BEFORE the fan-out to cache the payload.
 *
 * This handler is therefore a POST-body processor, not a `socket.on('message')`
 * handler. It follows the same pattern as the portrait renderer (Plan 13-03)
 * which intercepts `/internal/delta` typed payloads.
 *
 * @see packages/bridge/src/cache/spell-pack-cache.ts (SpellPackCache)
 * @see packages/bridge/src/routes/internal-delta.ts (caller context)
 * @see packages/shared-protocol/src/payloads/spell-pack.ts (schema)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 2
 */

import { AvailableSpellsPayloadSchema, R1_SPELLS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { SpellPackCache } from '../cache/spell-pack-cache.js';

/**
 * Handle an incoming `r1.spells.available` envelope from the Foundry module.
 *
 * Validates the payload with `AvailableSpellsPayloadSchema.safeParse` and
 * writes it to the `SpellPackCache` if valid. Invalid payloads are silently
 * ignored (T-SP-02: prevents cache poisoning from malformed envelopes).
 *
 * @param type    - Envelope type discriminant (e.g. `'r1.spells.available'`).
 * @param payload - Raw parsed envelope payload (unknown — validated internally).
 * @param cache   - SpellPackCache singleton to write into.
 * @returns `true` if the envelope was handled (type matched); `false` otherwise.
 */
export function handleSpellPackEnvelope(
  type: string,
  payload: unknown,
  cache: SpellPackCache,
): boolean {
  if (type !== R1_SPELLS_AVAILABLE_TYPE) {
    return false;
  }

  // T-SP-02: Validate before writing to cache — prevents cache poisoning.
  const parsed = AvailableSpellsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    // Invalid payload — silently ignore (do NOT log payload contents; may be large).
    return true; // Still "handled" — type matched, we just rejected the body.
  }

  cache.set(parsed.data);
  return true;
}
