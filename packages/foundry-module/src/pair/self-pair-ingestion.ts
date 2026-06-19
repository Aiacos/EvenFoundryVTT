/**
 * @evf/foundry-module — Self-service pairing: GM-side flag ingestion.
 *
 * Implements the GM half of SECURE self-service pairing. Each Foundry user mints
 * their OWN G2 bearer token bound to THEIR OWN authenticated identity — the GM
 * never has to do anything manually.
 *
 * AUTHENTICATED-IDENTITY SECURITY MODEL (do not deviate):
 * A bearer is bound to a Foundry `userId`; the bridge then grants per-actor read
 * access = the actors that user OWNS (ADR-0014). The bound userId MUST therefore
 * be authenticated, never client-asserted. The flow:
 *
 *   1. A user (player or GM) writes a "pending pair" request as a flag on THEIR
 *      OWN `User` document (`game.user.setFlag(MODULE_ID, 'pendingPair', …)`). A
 *      user can only write their own user flags, so the flag's OWNER is
 *      authenticated by Foundry document ownership. The client-generated token is
 *      part of that payload; it is valueless until a GM ingests it.
 *   2. A GM client picks the flag up (live via the `updateUser` hook, or via the
 *      `ready` sweep for requests queued while no GM was online) and calls
 *      {@link ingestBearer} — binding the token to `userDoc.id` (the document the
 *      flag LIVES ON), NEVER to any userId field inside the flag payload.
 *   3. The GM re-emits the bearer registry to the bridge and clears the flag.
 *
 * Why socketlib is unsuitable here: socketlib's `executeAsGM` does NOT pass the
 * caller identity to the GM-side handler, so it cannot authenticate WHO is
 * requesting the pair. The per-user-flag pattern authenticates the requester via
 * document ownership instead — and it adds NO socketlib handler (the handler
 * count invariant of 17 is preserved).
 *
 * Why world-side ingestion is required: the bearer registry is a WORLD-scope
 * setting (`game.settings.set(world)`), which only a GM client may write. So the
 * token a player mints becomes VALID only once a GM client materialises it —
 * near-instant when a GM is online, otherwise on the next GM `ready` sweep.
 *
 * @see ./bearer-registry.ts ingestBearer (the registry write)
 * @see ./PairModal.ts (the client mint that writes the pending flag)
 * @see ADR-0014 (bearer↔Foundry-user binding; per-actor read authz)
 */

import { MODULE_ID } from '../module.js';
import { ingestBearer } from './bearer-registry.js';

/** Flag key (under {@link MODULE_ID}) holding a user's pending-pair request. */
const PENDING_PAIR_FLAG = 'pendingPair';

/**
 * Shape of the pending-pair flag a user writes on their own `User` document.
 *
 * NOTE: this payload deliberately carries NO userId — the bound user is taken
 * from the User document the flag lives on (authenticated), never from here.
 */
interface PendingPair {
  /** Human-readable device label (propagated to the bearer entry). */
  alias: string;
  /** Client-generated high-entropy opaque token (the future bearer value). */
  token: string;
  /** Bridge URL the user configured at mint time. */
  bridgeUrl: string;
  /** Foundry world id at mint time. */
  worldId: string;
  /** Unix epoch ms when the request was written (provisional display only). */
  createdAt: number;
}

/** Minimal `User` document shape consumed by the ingestion hook. */
interface UserDocLike {
  readonly id: string;
  getFlag(scope: string, key: string): unknown;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

/**
 * Runtime shape-guard for a pending-pair flag value. The `token`, `bridgeUrl`
 * and `worldId` fields must be non-empty strings (they are load-bearing for a
 * valid bearer); `alias` must be a string but MAY be empty (a freshly-minted
 * device has no prior label); `createdAt` must be a finite number. Rejects
 * anything malformed so a corrupt/partial flag never drives an ingest.
 */
function isPendingPair(v: unknown): v is PendingPair {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const o = v as Record<string, unknown>;
  const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.length > 0;
  return (
    typeof o.alias === 'string' &&
    nonEmpty(o.token) &&
    nonEmpty(o.bridgeUrl) &&
    nonEmpty(o.worldId) &&
    typeof o.createdAt === 'number' &&
    Number.isFinite(o.createdAt)
  );
}

/**
 * Ingest a single user's pending-pair flag (GM-only). Reads the flag from the
 * user document, binds the token to `userDoc.id` (authenticated identity), pushes
 * the refreshed registry to the bridge, then clears the flag. Never throws —
 * a failure must not escape a Foundry hook.
 *
 * @param userDoc - The `User` document whose flag is being ingested.
 * @param reEmit - Re-publishes the bearer registry snapshot to the bridge.
 */
async function maybeIngest(userDoc: UserDocLike, reEmit: () => void): Promise<void> {
  try {
    // GM-only: only a GM client may write the world-scope bearer registry.
    if (game.user?.isGM !== true) {
      return;
    }
    const raw = userDoc.getFlag(MODULE_ID, PENDING_PAIR_FLAG);
    if (!isPendingPair(raw)) {
      return;
    }
    // SECURITY: bind to userDoc.id (the document the flag lives on — authenticated
    // by ownership), NEVER to any userId inside the payload.
    await ingestBearer(userDoc.id, {
      alias: raw.alias,
      token: raw.token,
      bridgeUrl: raw.bridgeUrl,
      worldId: raw.worldId,
    });
    // Push the fresh registry to the bridge so the token validates immediately.
    reEmit();
    // Clear the request so a re-fired hook / ready sweep does not re-ingest.
    await userDoc.unsetFlag(MODULE_ID, PENDING_PAIR_FLAG);
  } catch (err) {
    console.warn('[EVF self-pair] ingest failed:', err);
  }
}

/**
 * Sweep every user's pending-pair flag and ingest any valid request (GM-only).
 *
 * Handles requests queued while no GM was connected — including the GM's OWN
 * pending flag (a GM self-pairs through the same path). Called once at the end of
 * {@link registerSelfPairIngestion} (on `ready`) and exported for direct testing.
 *
 * @param reEmit - Re-publishes the bearer registry snapshot to the bridge.
 */
export function sweepPendingPairs(reEmit: () => void): void {
  if (game.user?.isGM !== true) {
    return;
  }
  // Cast via unknown: the Foundry `User` document has getFlag/unsetFlag at runtime
  // but the ambient FoundryUser type does not declare unsetFlag.
  const users = (game.users?.contents ?? []) as unknown as UserDocLike[];
  for (const userDoc of users) {
    void maybeIngest(userDoc, reEmit);
  }
}

/**
 * Register the GM-side self-pairing ingestion: a live `updateUser` hook plus an
 * initial `ready` sweep. Both are GM-gated inside the ingest path (non-GM clients
 * do nothing). Safe to call on every client — only GM clients act.
 *
 * @param reEmit - Re-publishes the bearer registry snapshot to the bridge so a
 *                 newly-ingested token validates without waiting for the next push.
 */
export function registerSelfPairIngestion(reEmit: () => void): void {
  // Foundry's Hooks.on callback is typed `(...args: unknown[]) => void`; the first
  // arg of `updateUser` is the changed `User` document (has getFlag/unsetFlag at runtime).
  Hooks.on('updateUser', (...args: unknown[]) => {
    void maybeIngest(args[0] as UserDocLike, reEmit);
  });
  // Catch requests queued before any GM connected (and the GM's own flag).
  sweepPendingPairs(reEmit);
}
