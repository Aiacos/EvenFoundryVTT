/**
 * WS handshake handler — capability negotiation + session creation.
 *
 * On WS connection open:
 * 1. Read first message and parse with HandshakeClientSchema
 * 2. Validate bearer token via TokenCache (socketlib roundtrip on miss)
 * 3. Negotiate capabilities: server_caps = intersection(client.capabilities, SERVER_CAPS_V1)
 * 4. Create or resume session (reconnect uses session_id + replay_seq from ReplayBuffer)
 * 5. Send HandshakeServerSchema response
 *
 * Close codes:
 * - 4400 — invalid/unparseable handshake message (also: idle handshake timeout)
 * - 4401 — invalid/expired/revoked bearer token
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md § D-2.13
 * @see docs/architecture/0002-protocol-versioning.md
 */

import {
  HandshakeClientSchema,
  type HandshakeServer,
  HandshakeServerSchema,
  SERVER_CAPS_V1,
} from '@evf/shared-protocol';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import type { WebSocket } from 'ws';
import { isActorAuthorized } from '../auth/actor-authorization.js';
import type { TokenCache } from '../auth/token-cache.js';
import type { ReplayBuffer } from './replay-buffer.js';
import type { SessionStore } from './session-store.js';

/** WS close code for an invalid/unparseable handshake message. */
export const CLOSE_INVALID_HANDSHAKE = 4400;
/** WS close code for an invalid, expired, or revoked bearer token. */
export const CLOSE_INVALID_TOKEN = 4401;

/**
 * Default idle-handshake timeout in milliseconds.
 *
 * An unauthenticated client that connects and never sends the first handshake
 * frame would otherwise hold a live socket plus an unresolved Promise forever
 * (slow-loris). After this window with no message the socket is closed with
 * {@link CLOSE_INVALID_HANDSHAKE} (4400) and the handshake resolves `null`.
 */
export const HANDSHAKE_IDLE_TIMEOUT_MS = 10_000;

/**
 * Handle the WS handshake for a newly connected client.
 *
 * Called from the Fastify route handler that wraps `@fastify/websocket`.
 * After this function resolves:
 * - Returns `null` if the handshake was rejected (socket already closed).
 * - Returns the `sessionId` string if the handshake succeeded and the socket
 *   is ready to receive deltas.
 *
 * Phase 03 change: return type promoted from `Promise<void>` to
 * `Promise<string | null>` so `server.ts` can wire `deltaEmitter.registerSession`
 * in the `.then()` handler without any test-only injection.
 *
 * @param socket - Raw ws WebSocket instance from @fastify/websocket connection
 * @param _req - Fastify request (available for IP logging etc., unused for now)
 * @param tokenCache - Shared TokenCache instance
 * @param replayBuffer - Shared ReplayBuffer instance
 * @param sessionStore - Shared SessionStore instance
 * @param logger - pino logger (with redact config applied at server level)
 * @param idleTimeoutMs - Idle-handshake timeout in ms (defaults to
 *   {@link HANDSHAKE_IDLE_TIMEOUT_MS}; injectable for testability with fake timers)
 * @returns `sessionId` on success, `null` on failure (socket already closed)
 *
 * @see .planning/phases/03-bridge-service-skeleton/03-01-PLAN.md Task 1
 * @see docs/architecture/0002-protocol-versioning.md
 */
export async function handleHandshake(
  socket: WebSocket,
  _req: FastifyRequest,
  tokenCache: TokenCache,
  replayBuffer: ReplayBuffer,
  sessionStore: SessionStore,
  logger: Logger,
  idleTimeoutMs: number = HANDSHAKE_IDLE_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    // Slow-loris guard: if the first handshake frame never arrives within
    // `idleTimeoutMs`, close the socket (4400) and resolve null so the Promise
    // never dangles. Cleared the instant the message handler fires (below) so
    // every success / invalid-handshake / invalid-token path is unaffected.
    const idleTimer = setTimeout(() => {
      logger.warn('WS handshake: no message within idle timeout — closing 4400');
      socket.close(CLOSE_INVALID_HANDSHAKE, 'handshake_timeout');
      resolve(null);
    }, idleTimeoutMs);

    socket.once('message', async (rawData) => {
      // Clear the idle timer FIRST — before any parse/branch — so no resolve
      // path (success, invalid handshake, invalid token, unexpected error)
      // races a spurious timeout-driven close.
      clearTimeout(idleTimer);
      try {
        // Parse first message as HandshakeClientSchema
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawData.toString());
        } catch {
          logger.warn('WS handshake: received non-JSON message — closing 4400');
          socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
          resolve(null);
          return;
        }

        const parseResult = HandshakeClientSchema.safeParse(parsed);
        if (!parseResult.success) {
          logger.warn(
            { issues: parseResult.error.issues.length },
            'WS handshake: schema validation failed — closing 4400',
          );
          socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
          resolve(null);
          return;
        }

        const client = parseResult.data;

        // Token validation — never log the raw token (T-02-01)
        const tokenHint = client.token.slice(0, 6);
        logger.debug({ tokenHint }, 'WS handshake: validating token');

        const validationResult = await tokenCache.validate(client.token);

        if (!validationResult.valid) {
          logger.warn(
            { tokenHint, reason: validationResult.reason },
            'WS handshake: token invalid — closing 4401',
          );
          socket.close(CLOSE_INVALID_TOKEN, 'invalid_token');
          resolve(null);
          return;
        }

        // Per-actor pin authorization (ADR-0014 §4). The client may pin this
        // session to a chosen PC (`client.actorId`). A pin is targeting, not
        // authorization — reject any pin outside the bearer's authorized (owned)
        // set with the invalid-handshake close code (4400). Fail-closed: a pin
        // against an absent/empty authorized set is rejected. (Pin-less
        // handshakes skip this gate; selection happens later via the roster,
        // which is itself scoped to the authorized set.)
        if (
          client.actorId !== undefined &&
          !isActorAuthorized(validationResult.authorizedActorIds, client.actorId)
        ) {
          logger.warn(
            { tokenHint },
            'WS handshake: client.actorId pin not authorized — closing 4400',
          );
          socket.close(CLOSE_INVALID_HANDSHAKE, 'actor_not_authorized');
          resolve(null);
          return;
        }

        // Capability negotiation: server_caps = intersection(client, SERVER_CAPS_V1)
        const serverCapsSet = new Set<string>(SERVER_CAPS_V1);
        const intersection = client.capabilities.filter((cap) => serverCapsSet.has(cap));

        if (intersection.length < client.capabilities.length) {
          const unknown = client.capabilities.filter((cap) => !serverCapsSet.has(cap));
          logger.warn(
            { unknown, intersection },
            'WS handshake: client requested unknown capabilities — warn-and-continue with intersection (D-2.13)',
          );
        }

        // Session creation or reconnect
        let sessionId: string;
        let replaySeq: number;

        if (client.session_id !== undefined) {
          // Reconnect path: reuse existing session or create a new one if expired
          const existing = sessionStore.getSession(client.session_id);
          if (existing !== undefined) {
            // Reconnect-found: preserve the existing session's selectedActorId — do NOT overwrite.
            sessionId = existing.sessionId;
            replaySeq = replayBuffer.lastSeq(sessionId);
            logger.debug({ sessionId, replaySeq }, 'WS handshake: reconnect — replaying from seq');
          } else {
            // Session not found (expired/flushed) — create new, thread actorId from client.
            const session = sessionStore.createSession(
              client.token,
              client.locale,
              intersection,
              client.actorId,
            );
            sessionId = session.sessionId;
            replaySeq = 0;
            logger.debug({ sessionId }, 'WS handshake: reconnect session not found — new session');
          }
        } else {
          // First connect — thread actorId from client so the bridge pins this session.
          const session = sessionStore.createSession(
            client.token,
            client.locale,
            intersection,
            client.actorId,
          );
          sessionId = session.sessionId;
          replaySeq = 0;
          logger.debug({ sessionId }, 'WS handshake: new session created');
        }

        // Build and send handshake response
        const response: HandshakeServer = {
          proto_chosen: 'evf-v1',
          server_caps: intersection,
          server_locale: client.locale,
          session_id: sessionId,
          replay_seq: replaySeq,
        };

        // Validate response shape before sending (belt-and-suspenders)
        HandshakeServerSchema.parse(response);

        socket.send(JSON.stringify(response));
        resolve(sessionId);
      } catch (err) {
        logger.error({ err }, 'WS handshake: unexpected error — closing 4400');
        socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
        resolve(null);
      }
    });
  });
}
