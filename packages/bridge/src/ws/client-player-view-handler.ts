/**
 * WS `client_player_view` handler — records the headless player-view intent,
 * drives the orchestrator, and replies with the live orchestrator status.
 *
 * The EvenHub settings panel sends `{ type: 'client_player_view', mode,
 * actorId?, foundryUrl? }` when the player changes the map-view source. The
 * bridge:
 * 1. records the intent in the {@link PlayerViewStore} (audit / last-write-wins),
 * 2. drives the {@link HeadlessOrchestrator} (ADR-0015 §C, P2b) — which launches
 *    or tears down the headless Foundry session and BROADCASTS each lifecycle
 *    transition (`starting → live/error/off/unavailable`) to ALL glasses panels,
 * 3. replies to THIS session immediately with the orchestrator's CURRENT state so
 *    the panel reflects the toggle without waiting for the first broadcast.
 *
 * The async transitions (e.g. `starting → live`) arrive later via the
 * orchestrator's `onStatus` broadcast wired in `server.ts`; this handler only
 * sends the synchronous current-state reply.
 *
 * Mirrors the {@link handleClientSetting} / {@link handleClientSelectActor}
 * contract: parse-or-no-op on non-matching input (other message types route to
 * their own handlers), never throws.
 *
 * @see packages/shared-protocol/src/payloads/player-view.ts (schemas)
 * @see packages/bridge/src/headless/player-view-store.ts (intent record)
 * @see packages/bridge/src/headless/orchestrator.ts (state machine)
 * @see packages/bridge/src/ws/delta-emitter.ts (single-session send)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

import {
  ClientPlayerViewMessageSchema,
  PLAYER_VIEW_STATUS_TYPE,
  type PlayerViewStatus,
  PlayerViewStatusSchema,
} from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { PlayerViewIntent, PlayerViewStore } from '../headless/player-view-store.js';
import type { DeltaEmitter } from './delta-emitter.js';

/**
 * Minimal orchestrator surface this handler depends on (ADR-0015 §C, P2b).
 *
 * The handler only needs to push the latest intent in and read the current state
 * back out; the full {@link HeadlessOrchestrator} satisfies this structurally,
 * and tests can inject a lightweight fake.
 */
export interface PlayerViewOrchestratorLike {
  /** Drive the state machine with the latest intent (fire-and-forget; never throws). */
  applyIntent(intent: PlayerViewIntent): void;
  /** Current orchestrator status — used for the immediate per-session reply. */
  getState(): PlayerViewStatus;
}

/**
 * Dependencies for {@link handleClientPlayerView}.
 *
 * All three singletons are already in scope at the `server.ts` WS message loop.
 */
export interface ClientPlayerViewDeps {
  /** Store recording the latest player-view intent (audit / last-write-wins). */
  playerViewStore: PlayerViewStore;
  /** DeltaEmitter — used to push the immediate `player_view_status` reply to this session. */
  deltaEmitter: DeltaEmitter;
  /** Headless orchestrator driven by each intent (ADR-0015 §C, P2b). */
  orchestrator: PlayerViewOrchestratorLike;
  /** Roster cache — resolves `actorId` → owning Foundry username for `actor` mode. */
  characterListCache: CharacterListUserResolver;
}

/** Minimal cache surface this handler needs: actorId → opted-in owning username. */
export interface CharacterListUserResolver {
  getUserName(actorId: string): string | undefined;
}

/**
 * Handle a parsed-or-not `client_player_view` message on an already-handshaked socket.
 *
 * Flow (all early-returns are silent no-ops):
 * 1. Defensive parse → ignore non-`client_player_view` messages.
 * 2. Record the intent in the {@link PlayerViewStore}.
 * 3. Drive the orchestrator with the intent (it launches/tears down asynchronously
 *    and broadcasts subsequent transitions).
 * 4. Read the orchestrator's CURRENT state, validate it against
 *    {@link PlayerViewStatusSchema}, and push it to THIS session via
 *    {@link DeltaEmitter.sendInitialToSession}.
 *
 * Never throws.
 *
 * @param deps      - Shared dependencies (see {@link ClientPlayerViewDeps}).
 * @param sessionId - Session ID returned by `handleHandshake` (post-auth identity).
 * @param rawData   - Raw socket payload (Buffer or string from the `ws` library).
 * @param logger    - pino logger (redaction config applied at server level).
 */
export function handleClientPlayerView(
  deps: ClientPlayerViewDeps,
  sessionId: string,
  rawData: Buffer | ArrayBuffer | Buffer[] | string,
  logger: Logger,
): void {
  const { playerViewStore, deltaEmitter, orchestrator, characterListCache } = deps;

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

  const result = ClientPlayerViewMessageSchema.safeParse(parsed);
  if (!result.success) {
    // Not a client_player_view message — ignore. Other message types route elsewhere.
    return;
  }

  const { mode, actorId, foundryUrl } = result.data;

  // ── Step 2: record the intent (audit / last-write-wins) ──────────────────────
  // Build with only present optional keys — `exactOptionalPropertyTypes` rejects
  // an explicit `undefined` on an optional field.
  const intent: PlayerViewIntent = { mode };
  if (actorId !== undefined) {
    intent.actorId = actorId;
  }
  if (foundryUrl !== undefined) {
    intent.foundryUrl = foundryUrl;
  }
  // `actor` mode (password-free): resolve the selected PC's owning Foundry username
  // from the roster cache — present ONLY for players who opted in to streaming. The
  // headless then selects that user on `/join` (blank password). Absent → the
  // orchestrator reports `unavailable` (the actor is not streamable).
  if (mode === 'actor' && actorId !== undefined) {
    const userName = characterListCache.getUserName(actorId);
    if (userName !== undefined) {
      intent.userName = userName;
    }
  }
  playerViewStore.set(intent);
  logger.info(
    { sessionId, mode, actorId, streamable: intent.userName !== undefined },
    'WS client_player_view: intent recorded',
  );
  if (foundryUrl !== undefined) {
    logger.debug({ sessionId, foundryUrl }, 'WS client_player_view: foundryUrl');
  }

  // ── Step 3: drive the orchestrator (async launch/teardown + broadcast) ───────
  // applyIntent never throws; lifecycle transitions broadcast via onStatus.
  orchestrator.applyIntent(intent);

  // ── Step 4: reply with the orchestrator's CURRENT state to THIS session only ─
  const payload: PlayerViewStatus = orchestrator.getState();

  const validated = PlayerViewStatusSchema.safeParse(payload);
  if (!validated.success) {
    logger.warn({ sessionId }, 'WS client_player_view: status payload failed schema — skip send');
    return;
  }

  deltaEmitter.sendInitialToSession(sessionId, PLAYER_VIEW_STATUS_TYPE, validated.data);
}
