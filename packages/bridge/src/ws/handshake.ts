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
 * - 4400 — invalid/unparseable handshake message
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
import type { TokenCache } from '../auth/token-cache.js';
import type { ReplayBuffer } from './replay-buffer.js';
import type { SessionStore } from './session-store.js';

/** WS close code for an invalid/unparseable handshake message. */
export const CLOSE_INVALID_HANDSHAKE = 4400;
/** WS close code for an invalid, expired, or revoked bearer token. */
export const CLOSE_INVALID_TOKEN = 4401;

/**
 * Handle the WS handshake for a newly connected client.
 *
 * Called from the Fastify route handler that wraps `@fastify/websocket`.
 * After this function returns, the socket is either closed (on error)
 * or has received a valid HandshakeServerSchema response.
 *
 * @param socket - Raw ws WebSocket instance from @fastify/websocket connection
 * @param _req - Fastify request (available for IP logging etc., unused for now)
 * @param tokenCache - Shared TokenCache instance
 * @param replayBuffer - Shared ReplayBuffer instance
 * @param sessionStore - Shared SessionStore instance
 * @param logger - pino logger (with redact config applied at server level)
 */
export async function handleHandshake(
  socket: WebSocket,
  _req: FastifyRequest,
  tokenCache: TokenCache,
  replayBuffer: ReplayBuffer,
  sessionStore: SessionStore,
  logger: Logger,
): Promise<void> {
  return new Promise<void>((resolve) => {
    socket.once('message', async (rawData) => {
      try {
        // Parse first message as HandshakeClientSchema
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawData.toString());
        } catch {
          logger.warn('WS handshake: received non-JSON message — closing 4400');
          socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
          resolve();
          return;
        }

        const parseResult = HandshakeClientSchema.safeParse(parsed);
        if (!parseResult.success) {
          logger.warn(
            { issues: parseResult.error.issues.length },
            'WS handshake: schema validation failed — closing 4400',
          );
          socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
          resolve();
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
          resolve();
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
            sessionId = existing.sessionId;
            replaySeq = replayBuffer.lastSeq(sessionId);
            logger.debug({ sessionId, replaySeq }, 'WS handshake: reconnect — replaying from seq');
          } else {
            // Session not found (expired/flushed) — create new
            const session = sessionStore.createSession(client.token, client.locale, intersection);
            sessionId = session.sessionId;
            replaySeq = 0;
            logger.debug({ sessionId }, 'WS handshake: reconnect session not found — new session');
          }
        } else {
          // First connect
          const session = sessionStore.createSession(client.token, client.locale, intersection);
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
        resolve();
      } catch (err) {
        logger.error({ err }, 'WS handshake: unexpected error — closing 4400');
        socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
        resolve();
      }
    });
  });
}
