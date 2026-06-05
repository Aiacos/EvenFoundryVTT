/**
 * Initial character snapshot push — on-connect targeted delta for new WS sessions.
 *
 * When a g2-app client completes the `/ws` handshake the glasses render is blank
 * until the next Foundry-triggered delta. `pushInitialCharacterDelta` closes this
 * gap by proactively sending a full `character.delta` for the currently-selected
 * actor (first entry of the `CharacterListCache` roster) to the new session only.
 *
 * ## Design
 *
 * - Actor selection: `roster.characters[0].actorId` (last-write-wins push source).
 * - Snapshot fetch: `foundryFn('evf.getCharacterSnapshot', actorId, token)` — the
 *   same injection point that backs `GET /v1/character/:actorId`.
 * - Schema guard: `CharacterSnapshotSchema.safeParse` — mirrors `routes/character.ts`
 *   to reject drift before sending to the client (T-d0v-02).
 * - Graceful no-op on:
 *   - cold roster (`cache.get() === null`)
 *   - empty roster (`characters.length === 0`)
 *   - null/undefined snapshot from foundryFn
 *   - schema mismatch
 *   - foundryFn throw
 * - Capability gate: delegated to `DeltaEmitter.sendInitialToSession` which reuses
 *   `DELTA_CAP_MAP` (T-d0v-01: sessions without `read_char` receive nothing).
 * - One bounded fetch per connection — no retry loop (T-d0v-03: DoS accept).
 *
 * @see packages/bridge/src/ws/delta-emitter.ts (sendInitialToSession)
 * @see packages/bridge/src/cache/character-list-cache.ts (roster source)
 * @see packages/bridge/src/routes/character.ts (foundryFn contract)
 * @see packages/shared-protocol/src/payloads/character.ts (CharacterSnapshotSchema)
 * @see .planning/quick/260605-d0v-push-initial-character-delta-for-the-sel/260605-d0v-PLAN.md
 */

import { CharacterSnapshotSchema } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { CharacterListCache } from '../cache/character-list-cache.js';
import type { FoundrySnapshotFn } from '../routes/character.js';
import type { DeltaEmitter } from './delta-emitter.js';

/**
 * Arguments for {@link pushInitialCharacterDelta}.
 */
export interface PushInitialCharacterDeltaArgs {
  /** UUID v4 of the newly-connected session (returned by handleHandshake). */
  sessionId: string;
  /** Bearer token for the session (used as the foundryFn auth arg). */
  token: string;
  /** DeltaEmitter to call sendInitialToSession on. */
  deltaEmitter: DeltaEmitter;
  /** Character list cache — source of the current actor roster. */
  characterListCache: CharacterListCache;
  /**
   * Injected Foundry snapshot function.
   *
   * Called with `('evf.getCharacterSnapshot', actorId, token)`.
   * In production: real socketlib GM-side handler.
   * In tests: vi.fn() returning mock data.
   */
  foundryFn: FoundrySnapshotFn;
  /** pino logger for debug/error messages. */
  logger: Logger;
}

/**
 * Push an initial `character.delta` to a newly-connected WS session.
 *
 * Selects the first actor from the `CharacterListCache` roster (last-write-wins
 * push source), fetches and validates its snapshot via `foundryFn`, then calls
 * `deltaEmitter.sendInitialToSession` to deliver the envelope only to the new
 * session. All error paths are graceful no-ops with debug logs.
 *
 * @param args - Arguments object (see {@link PushInitialCharacterDeltaArgs}).
 * @returns A promise that always resolves (never rejects).
 */
export async function pushInitialCharacterDelta(
  args: PushInitialCharacterDeltaArgs,
): Promise<void> {
  const { sessionId, token, deltaEmitter, characterListCache, foundryFn, logger } = args;

  // Step 1: resolve actor from roster (IS-03, IS-04).
  const roster = characterListCache.get();
  if (roster === null || roster.characters.length === 0) {
    logger.debug({ sessionId }, 'initial-snapshot: no roster — skipping initial character.delta');
    return;
  }

  const actorId = roster.characters[0]?.actorId;
  if (actorId === undefined) {
    // Unreachable under normal conditions (length > 0 guard above), but safe-guard
    // against noUncheckedIndexedAccess.
    logger.debug({ sessionId }, 'initial-snapshot: roster[0] undefined — skipping');
    return;
  }

  // Step 2: fetch snapshot via foundryFn (IS-07).
  let snapshot: unknown;
  try {
    snapshot = await foundryFn('evf.getCharacterSnapshot', actorId, token);
  } catch (err) {
    logger.debug({ err, sessionId, actorId }, 'initial-snapshot: foundryFn threw — skipping');
    return;
  }

  // Step 3: null/undefined guard (IS-05).
  if (snapshot == null) {
    logger.debug({ sessionId, actorId }, 'initial-snapshot: foundryFn returned null — skipping');
    return;
  }

  // Step 4: schema validation — mirrors routes/character.ts (IS-06, T-d0v-02).
  const parsed = CharacterSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    logger.debug(
      { sessionId, actorId },
      'initial-snapshot: schema mismatch — skipping (schema drift guard)',
    );
    return;
  }

  // Step 5: targeted single-session push (capability gate inside sendInitialToSession).
  deltaEmitter.sendInitialToSession(sessionId, 'character.delta', parsed.data);
}
