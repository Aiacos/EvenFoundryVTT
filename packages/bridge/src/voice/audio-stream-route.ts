/**
 * Fastify WS route `/v1/audio/stream` — Plan 12-03 Task 1.
 *
 * Bridges g2-app PCM audio frames → Deepgram STT adapter → VoiceTranscript envelopes
 * via the existing DeltaEmitter. Mounted at step 10 in `server.ts` (after the /ws
 * handshake route at step 9).
 *
 * # Flow
 *
 * 1. WS upgrade received at `/v1/audio/stream`
 * 2. Extract `Authorization: Bearer <token>` header, validate via TokenCache
 *    - Invalid/missing → close 1008 'invalid-bearer'
 * 3. Check `deepgramStt.isEnabled()`
 *    - Disabled → close 1011 'voice-disabled' (bridge soft-fail — Phase 11 precedent)
 * 4. `deepgramStt.connect(sessionId)` → create a live DeepgramStream
 * 5. Inbound binary frames → `stream.sendAudio(frame)` (PCM passthrough — no transcoding)
 * 6. `stream.onTranscript(cb)` → parse Results frame → build VoiceTranscriptPayload
 *    → validate via VoiceTranscriptPayloadSchema → wrap in envelope →
 *    `deltaEmitter.emitDelta(R1_VOICE_TRANSCRIPT_TYPE, payload)`
 * 7. Client WS close → `stream.close()`
 *
 * # Security (T-12-07)
 *
 * tokenCache.validate(bearer) at WS upgrade — same gate as existing /ws route.
 * Without valid bearer → close(1008, 'invalid-bearer').
 *
 * @see ./deepgram-stt.ts (DeepgramAdapter + DeepgramStream)
 * @see ../ws/delta-emitter.ts (DeltaEmitter.emitDelta)
 * @see packages/shared-protocol/src/payloads/voice.ts (VoiceTranscriptPayloadSchema)
 * @see ../server.ts (step 10 registration)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 */

import { R1_VOICE_TRANSCRIPT_TYPE, VoiceTranscriptPayloadSchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { TokenCache } from '../auth/token-cache.js';
import type { DeltaEmitter } from '../ws/delta-emitter.js';
import type { DeepgramAdapter } from './deepgram-stt.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterAudioStreamRouteOpts {
  app: FastifyInstance;
  deltaEmitter: DeltaEmitter;
  deepgramStt: DeepgramAdapter;
  tokenCache: TokenCache;
  logger: Logger;
}

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * Register the `/v1/audio/stream` WebSocket route on the Fastify instance.
 *
 * The route mounts via `@fastify/websocket` (already registered in server.ts step 3).
 * It validates the bearer token, checks Deepgram availability, and sets up bidirectional
 * PCM ↔ VoiceTranscript bridging.
 */
export async function registerAudioStreamRoute(opts: RegisterAudioStreamRouteOpts): Promise<void> {
  const { app, deltaEmitter, deepgramStt, tokenCache, logger } = opts;

  // Register the WS route. @fastify/websocket injects `{ websocket: true }` to
  // mark the route as a WebSocket upgrade handler.
  app.get(
    '/v1/audio/stream',
    { websocket: true },
    (
      socket: {
        close: (code: number, reason: string) => void;
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      },
      req: { headers: Record<string, string | string[] | undefined> },
    ) => {
      // Handler is sync — async work runs inside via void-wrapped async IIFE.
      void (async () => {
        // 1. Extract bearer token from Authorization header.
        const authHeader =
          (req.headers['authorization'] as string | undefined) ??
          (req.headers['Authorization'] as string | undefined);

        if (!authHeader?.startsWith('Bearer ')) {
          logger.warn('audio-stream-route: missing or malformed Authorization header');
          socket.close(1008, 'invalid-bearer');
          return;
        }

        const bearer = authHeader.slice(7); // strip "Bearer "

        // 2. Validate bearer via TokenCache (same gate as /ws route).
        const validation = await tokenCache.validate(bearer);
        if (!validation.valid) {
          logger.warn('audio-stream-route: invalid bearer token');
          socket.close(1008, 'invalid-bearer');
          return;
        }

        // 3. Check Deepgram availability.
        if (!deepgramStt.isEnabled()) {
          logger.warn('audio-stream-route: Deepgram STT disabled — DEEPGRAM_API_KEY not set');
          socket.close(1011, 'voice-disabled');
          return;
        }

        // 4. Create a Deepgram stream for this session.
        const sessionId = crypto.randomUUID();
        logger.info({ sessionId }, 'audio-stream-route: new audio session started');
        const stream = deepgramStt.connect(sessionId);

        // 5. Pipe inbound binary PCM frames → Deepgram stream.sendAudio.
        socket.on('message', (data: unknown) => {
          try {
            // data is Buffer (Node ws) or ArrayBuffer (browser). Convert to Uint8Array.
            let pcm: Uint8Array;
            if (data instanceof Uint8Array) {
              pcm = data;
            } else if (data instanceof ArrayBuffer) {
              pcm = new Uint8Array(data);
            } else if (Buffer.isBuffer(data)) {
              pcm = new Uint8Array(
                (data as Buffer).buffer,
                (data as Buffer).byteOffset,
                (data as Buffer).byteLength,
              );
            } else {
              logger.debug(
                { type: typeof data },
                'audio-stream-route: non-binary frame received, skipping',
              );
              return;
            }
            stream.sendAudio(pcm);
          } catch (err) {
            logger.warn({ err }, 'audio-stream-route: error forwarding audio frame');
          }
        });

        // 6. Wire Deepgram transcript → VoiceTranscript envelope → DeltaEmitter.
        stream.onTranscript((frame) => {
          try {
            const first = frame.channel.alternatives[0];
            if (first === undefined) return;

            const rawPayload = {
              transcript: first.transcript,
              confidence: first.confidence,
              language: 'multi' as const,
              isFinal: frame.is_final,
              timestamp: Date.now(),
            };

            // Defence-in-depth: validate the constructed payload before emitting.
            const parseResult = VoiceTranscriptPayloadSchema.safeParse(rawPayload);
            if (!parseResult.success) {
              logger.warn(
                { issues: parseResult.error.issues },
                'audio-stream-route: VoiceTranscriptPayload validation failed — dropping frame',
              );
              return;
            }

            deltaEmitter.emitDelta(R1_VOICE_TRANSCRIPT_TYPE, parseResult.data);

            logger.debug(
              { sessionId, isFinal: frame.is_final, confidence: first.confidence },
              'audio-stream-route: emitted voice transcript',
            );
          } catch (err) {
            logger.warn({ err }, 'audio-stream-route: error building transcript envelope');
          }
        });

        // 7. Clean up on client WS close.
        socket.on('close', () => {
          logger.info(
            { sessionId },
            'audio-stream-route: client disconnected — tearing down Deepgram stream',
          );
          try {
            stream.close();
          } catch (err) {
            logger.warn({ err }, 'audio-stream-route: error closing Deepgram stream');
          }
        });
      })();
    },
  );
}
