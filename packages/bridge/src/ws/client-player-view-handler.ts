/**
 * WS `client_player_view` handler — records the headless player-view intent and
 * replies with the orchestrator status.
 *
 * The EvenHub settings panel sends `{ type: 'client_player_view', enabled,
 * actorId?, foundryUrl? }` when the player toggles "Player view (headless)". The
 * bridge records the intent in the {@link PlayerViewStore} (which the P2 headless
 * orchestrator will read — ADR-0015 §C) and immediately replies to THAT session
 * with a `player_view_status` delta so the panel can reflect what's happening.
 *
 * P1 (this task) has no orchestrator deployed, so:
 * - `enabled: true`  → `{ state: 'unavailable', detail: … }`
 * - `enabled: false` → `{ state: 'off' }`
 *
 * Mirrors the {@link handleClientSetting} / {@link handleClientSelectActor}
 * contract: parse-or-no-op on non-matching input (other message types route to
 * their own handlers), never throws.
 *
 * @see packages/shared-protocol/src/payloads/player-view.ts (schemas)
 * @see packages/bridge/src/headless/player-view-store.ts (intent record)
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
 * Dependencies for {@link handleClientPlayerView}.
 *
 * Both singletons are already in scope at the `server.ts` WS message loop.
 */
export interface ClientPlayerViewDeps {
  /** Store recording the latest player-view intent (P2 orchestrator reads it). */
  playerViewStore: PlayerViewStore;
  /** DeltaEmitter — used to push the `player_view_status` reply to this session only. */
  deltaEmitter: DeltaEmitter;
}

/** Detail surfaced in P1 when the player enables the toggle (no orchestrator yet). */
const UNAVAILABLE_DETAIL = 'Headless orchestrator not yet deployed (ADR-0015 P2)';

/**
 * Handle a parsed-or-not `client_player_view` message on an already-handshaked socket.
 *
 * Flow (all early-returns are silent no-ops):
 * 1. Defensive parse → ignore non-`client_player_view` messages.
 * 2. Record the intent in the {@link PlayerViewStore}.
 * 3. Compute the P1 status (`unavailable` when enabling, `off` when disabling),
 *    validate it against {@link PlayerViewStatusSchema}, and push it to THIS
 *    session via {@link DeltaEmitter.sendInitialToSession}.
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
  const { playerViewStore, deltaEmitter } = deps;

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

  const { enabled, actorId, foundryUrl } = result.data;

  // ── Step 2: record the intent (P2 orchestrator reads this) ───────────────────
  // Build with only present optional keys — `exactOptionalPropertyTypes` rejects
  // an explicit `undefined` on an optional field.
  const intent: PlayerViewIntent = { enabled };
  if (actorId !== undefined) {
    intent.actorId = actorId;
  }
  if (foundryUrl !== undefined) {
    intent.foundryUrl = foundryUrl;
  }
  playerViewStore.set(intent);
  // foundryUrl is potentially noisy / sensitive-ish — info logs the toggle shape;
  // debug carries the full URL.
  logger.info({ sessionId, enabled, actorId }, 'WS client_player_view: intent recorded');
  if (foundryUrl !== undefined) {
    logger.debug({ sessionId, foundryUrl }, 'WS client_player_view: foundryUrl');
  }

  // ── Step 3: reply with the P1 orchestrator status to THIS session only ───────
  const payload: PlayerViewStatus = enabled
    ? { state: 'unavailable', detail: UNAVAILABLE_DETAIL }
    : { state: 'off' };

  const validated = PlayerViewStatusSchema.safeParse(payload);
  if (!validated.success) {
    logger.warn({ sessionId }, 'WS client_player_view: status payload failed schema — skip send');
    return;
  }

  deltaEmitter.sendInitialToSession(sessionId, PLAYER_VIEW_STATUS_TYPE, validated.data);
}
