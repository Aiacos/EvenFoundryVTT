/**
 * character-list-handler — bridge handler for r1.characters.available envelopes.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * Called by the `/internal/delta` route's DeltaEmitter fan-out path when an
 * envelope with `type === 'r1.characters.available'` arrives from the Foundry module.
 *
 * ## Responsibility
 *
 * Validates the envelope payload with `CharacterListSnapshotSchema.safeParse`
 * (T-RFP-01: cache poisoning mitigation) and writes the validated snapshot into
 * the `CharacterListCache` singleton.
 *
 * ## Multiplexed dispatch
 *
 * `server.ts` calls `handleBearerRegistryEnvelope`, `handleCharacterListEnvelope`,
 * `handleSpellPackEnvelope`, and `handleEntityPackEnvelope` inside the
 * `/internal/delta` onDelta callback. Each returns `false` when the type does
 * not match, so dispatching to all is safe and order-independent.
 *
 * @see packages/bridge/src/cache/character-list-cache.ts (CharacterListCache)
 * @see packages/bridge/src/routes/internal-delta.ts (caller context)
 * @see packages/shared-protocol/src/payloads/character-list.ts (schema)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 3
 */

import { CharacterListSnapshotSchema, R1_CHARACTERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import type { CharacterListCache } from '../cache/character-list-cache.js';

/**
 * Handle an incoming `r1.characters.available` envelope from the Foundry module.
 *
 * Validates the payload with `CharacterListSnapshotSchema.safeParse` and
 * writes it to the `CharacterListCache` if valid. Invalid payloads are silently
 * ignored (T-RFP-01: prevents cache poisoning from malformed envelopes).
 *
 * @param type    - Envelope type discriminant (e.g. `'r1.characters.available'`).
 * @param payload - Raw parsed envelope payload (unknown — validated internally).
 * @param cache   - CharacterListCache singleton to write into.
 * @returns `true` if the envelope was handled (type matched); `false` otherwise.
 */
export function handleCharacterListEnvelope(
  type: string,
  payload: unknown,
  cache: CharacterListCache,
): boolean {
  if (type !== R1_CHARACTERS_AVAILABLE_TYPE) {
    return false;
  }

  // T-RFP-01: Validate before writing to cache — prevents cache poisoning.
  const parsed = CharacterListSnapshotSchema.safeParse(payload);
  if (!parsed.success) {
    // Invalid payload — silently ignore (do NOT log payload contents).
    return true; // Still "handled" — type matched, we just rejected the body.
  }

  cache.set(parsed.data);
  return true;
}
