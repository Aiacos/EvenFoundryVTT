/**
 * entity-pack-handler — bridge WS handler for r1.entities.available envelopes.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-pack-handler).
 *
 * Called by the `/internal/delta` route's DeltaEmitter fan-out path when an
 * envelope with `type === 'r1.entities.available'` arrives from the Foundry module.
 *
 * ## Responsibility
 *
 * Validates the envelope payload with `AvailableEntitiesPayloadSchema.safeParse`
 * (T-EP-02: cache poisoning mitigation) and writes the validated payload into
 * the `EntityPackCache` singleton.
 *
 * ## Multiplexed dispatch
 *
 * `server.ts` calls both `handleSpellPackEnvelope` and `handleEntityPackEnvelope`
 * inside the `/internal/delta` onDelta callback. Each returns `false` when the
 * type does not match, so dispatching to both is safe and order-independent.
 *
 * ## Why not a full WS socket handler
 *
 * The `r1.entities.available` envelope arrives via POST /internal/delta (module →
 * bridge push), NOT via the WS path from the g2-app client. The
 * `internal-delta.ts` route calls `deltaEmitter.emitDelta()` which fans the
 * envelope to connected g2-app WS sessions. We intercept in the `/internal/delta`
 * route BEFORE the fan-out to cache the payload.
 *
 * This handler is therefore a POST-body processor, not a `socket.on('message')`
 * handler. Same pattern as `spell-pack-handler.ts`.
 *
 * @see packages/bridge/src/cache/entity-pack-cache.ts (EntityPackCache)
 * @see packages/bridge/src/routes/internal-delta.ts (caller context)
 * @see packages/bridge/src/ws/spell-pack-handler.ts (sibling pipeline)
 * @see packages/shared-protocol/src/payloads/entity-pack.ts (schema)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 2
 */

import { AvailableEntitiesPayloadSchema, R1_ENTITIES_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { EntityPackCache } from '../cache/entity-pack-cache.js';

/**
 * Handle an incoming `r1.entities.available` envelope from the Foundry module.
 *
 * Validates the payload with `AvailableEntitiesPayloadSchema.safeParse` and
 * writes it to the `EntityPackCache` if valid. Invalid payloads are silently
 * ignored (T-EP-02: prevents cache poisoning from malformed envelopes).
 *
 * @param type    - Envelope type discriminant (e.g. `'r1.entities.available'`).
 * @param payload - Raw parsed envelope payload (unknown — validated internally).
 * @param cache   - EntityPackCache singleton to write into.
 * @returns `true` if the envelope was handled (type matched); `false` otherwise.
 */
export function handleEntityPackEnvelope(
  type: string,
  payload: unknown,
  cache: EntityPackCache,
): boolean {
  if (type !== R1_ENTITIES_AVAILABLE_TYPE) {
    return false;
  }

  // T-EP-02: Validate before writing to cache — prevents cache poisoning.
  const parsed = AvailableEntitiesPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    // Invalid payload — silently ignore (do NOT log payload contents; may be large).
    return true; // Still "handled" — type matched, we just rejected the body.
  }

  cache.set(parsed.data);
  return true;
}
