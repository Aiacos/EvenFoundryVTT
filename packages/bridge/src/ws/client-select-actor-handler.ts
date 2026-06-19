/**
 * WS `client_select_actor` handler — live, no-reconnect character re-pin.
 *
 * The glasses / EvenHub app sends `{ type: 'client_select_actor', actorId }`
 * over the already-handshaked WS to switch the active PC mid-session. The bridge
 * re-targets this session's `selectedActorId`, which makes two existing pipes
 * follow the new actor automatically:
 *
 * - {@link SessionStore.getFocusActorId} → map auto-framing centres on the new PC
 *   (routes/internal-delta.ts frame-POST piggyback);
 * - {@link DeltaEmitter} filters `character.delta` on `session.selectedActorId`,
 *   so subsequent character deltas re-target with no extra wiring.
 *
 * To avoid a render gap until the next natural `character.delta`, the handler
 * also pushes the cached snapshot for the NEW actor to THIS session only, reusing
 * {@link pushInitialCharacterDelta} (the same mechanism the on-connect initial
 * push uses) — a graceful no-op if no snapshot is available.
 *
 * ## Authorization (ADR-0014, fail-closed)
 *
 * The requested `actorId` is checked against the bearer's live authorized
 * (owned) actor set, obtained by re-validating the session's token via the same
 * {@link TokenCache} the handshake / `tool.invoke` write-path use (5-min cached,
 * so this is a hot-path lookup, not a Foundry round-trip). An unauthorized or
 * unknown actor is rejected with NO session mutation and a `warn` log. This is
 * the same `isActorAuthorized` predicate that gates the handshake `actorId` pin.
 *
 * Mirrors the {@link handleClientSetting} / {@link handleResume} contract:
 * parse-or-no-op on non-matching input (other message types route to their own
 * handlers), never throws.
 *
 * @see packages/shared-protocol/src/payloads/client-select-actor.ts (schema)
 * @see packages/bridge/src/auth/actor-authorization.ts (isActorAuthorized)
 * @see packages/bridge/src/ws/initial-snapshot.ts (snapshot push mechanism)
 * @see docs/architecture/0014-bearer-actor-authorization.md §4
 */

import { ClientSelectActorMessageSchema } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import { isActorAuthorized } from '../auth/actor-authorization.js';
import type { TokenCache } from '../auth/token-cache.js';
import type { CharacterListCache } from '../cache/character-list-cache.js';
import type { FoundrySnapshotFn } from '../routes/character.js';
import type { DeltaEmitter } from './delta-emitter.js';
import { pushInitialCharacterDelta } from './initial-snapshot.js';
import type { SessionStore } from './session-store.js';

/**
 * Dependencies for {@link handleClientSelectActor}.
 *
 * Grouped into an object (rather than a long positional list) because the
 * handler threads several shared singletons; all are already in scope at the
 * `server.ts` WS message loop.
 */
export interface ClientSelectActorDeps {
  /** Session store — lookup + `setSelectedActor` mutation. */
  sessionStore: SessionStore;
  /** Token cache — re-validated to obtain the bearer's live `authorizedActorIds` (ADR-0014). */
  tokenCache: TokenCache;
  /** DeltaEmitter — used by the snapshot push to deliver to this session only. */
  deltaEmitter: DeltaEmitter;
  /** Character list cache — roster source for the snapshot push (unused when a pin is set). */
  characterListCache: CharacterListCache;
  /** Injected Foundry snapshot function (same instance backing `GET /v1/character/:actorId`). */
  foundryFn: FoundrySnapshotFn;
}

/**
 * Handle a parsed-or-not `client_select_actor` message on an already-handshaked socket.
 *
 * Flow (all early-returns are silent no-ops except the auth reject, which warns):
 * 1. Defensive parse → ignore non-`client_select_actor` messages.
 * 2. Look up the session (gone if it expired between handshake and this frame).
 * 3. Re-validate the session token and authorize `actorId` (fail-closed).
 * 4. On success, update `session.selectedActorId` and push the new actor's snapshot.
 *
 * Never throws — any error in the snapshot push is swallowed by
 * `pushInitialCharacterDelta` (it always resolves).
 *
 * @param deps      - Shared dependencies (see {@link ClientSelectActorDeps}).
 * @param sessionId - Session ID returned by `handleHandshake` (post-auth identity).
 * @param rawData   - Raw socket payload (Buffer or string from the `ws` library).
 * @param logger    - pino logger (redaction config applied at server level).
 */
export async function handleClientSelectActor(
  deps: ClientSelectActorDeps,
  sessionId: string,
  rawData: Buffer | ArrayBuffer | Buffer[] | string,
  logger: Logger,
): Promise<void> {
  const { sessionStore, tokenCache, deltaEmitter, characterListCache, foundryFn } = deps;

  // ── Step 1: parse raw bytes to JSON ──────────────────────────────────────────
  let parsed: unknown;
  try {
    const text =
      typeof rawData === 'string'
        ? rawData
        : Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Array.isArray(rawData)
            ? Buffer.concat(rawData).toString('utf-8')
            : Buffer.from(rawData).toString('utf-8');
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const result = ClientSelectActorMessageSchema.safeParse(parsed);
  if (!result.success) {
    // Not a client_select_actor message — ignore. Other message types route elsewhere.
    return;
  }

  const { actorId } = result.data;

  // ── Step 2: look up the session (may have expired post-handshake) ────────────
  const session = sessionStore.getSession(sessionId);
  if (session === undefined) {
    logger.warn({ sessionId }, 'WS client_select_actor: session not found — ignoring');
    return;
  }

  // ── Step 3: authorize the requested actor (ADR-0014, fail-closed) ────────────
  // Re-validate the session token to obtain the bearer's live authorized set —
  // the same TokenCache (5-min cached) the handshake pin / tool.invoke write-path
  // use. An unknown / unauthorized actor is rejected with NO session mutation.
  const validation = await tokenCache.validate(session.token);
  if (!validation.valid || !isActorAuthorized(validation.authorizedActorIds, actorId)) {
    logger.warn(
      { sessionId },
      'WS client_select_actor: actorId not authorized — rejected (no session change)',
    );
    return;
  }

  // ── Step 4: re-pin the session, then push the new actor's snapshot ───────────
  sessionStore.setSelectedActor(sessionId, actorId);
  logger.debug({ sessionId }, 'WS client_select_actor: session re-pinned to new actor');

  // Push the NEW actor's cached snapshot to THIS session so the glasses update
  // immediately (graceful no-op when no snapshot is cached — the next natural
  // `character.delta` will carry it). Reuses the on-connect push mechanism with
  // the new actor pinned, so the cache-fetch + schema-guard + single-session send
  // are byte-identical. `pushInitialCharacterDelta` always resolves.
  await pushInitialCharacterDelta({
    sessionId,
    token: session.token,
    deltaEmitter,
    characterListCache,
    foundryFn,
    logger,
    selectedActorId: actorId,
  });
}
