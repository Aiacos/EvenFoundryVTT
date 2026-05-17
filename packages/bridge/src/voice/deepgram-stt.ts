/**
 * Deepgram Nova-3 Multilingual streaming STT adapter — Plan 12-03 Task 1.
 *
 * Creates a `DeepgramAdapter` that wraps the Deepgram streaming WebSocket API
 * (`wss://api.deepgram.com/v1/listen`). The adapter is disabled when
 * `DEEPGRAM_API_KEY` is not set — bridge boots unconditionally and the
 * `/v1/audio/stream` route closes with 1011 + 'voice-disabled' (soft-fail
 * per Phase 11 11-04 BridgeClient soft-fail pattern).
 *
 * # Auth
 *
 * Deepgram requires `Authorization: Token <KEY>` (NOT `Bearer`). This is the
 * canonical Deepgram auth scheme — asserted by DG-06 test.
 *
 * # PCM passthrough
 *
 * Even Hub SDK delivers `event.audioEvent.audioPcm: Uint8Array` — 16 kHz s16le
 * mono (Specs.md §3.5). Bridge forwards verbatim to Deepgram via `sendAudio()`.
 * No transcoding. Deepgram `encoding=linear16` expects exactly this format.
 *
 * # Results frame
 *
 * Deepgram sends JSON over WS: `{ type: 'Results', channel: { alternatives: [...] }, is_final }`.
 * All non-Results frame types (Metadata, SpeechStarted, UtteranceEnd, etc.) are
 * silently dropped. Malformed JSON is silently dropped and logged at debug level.
 *
 * # Security (T-12-02)
 *
 * `apiKey` flows ONLY via the WS Authorization header — never logged (pino redact
 * list in server.ts covers 'deepgramKey', 'apiKey', '*.deepgramKey', '*.apiKey').
 * Zero secret patterns in this file — asserted by T-12-LEAK-01 grep gate.
 *
 * @see ./audio-stream-route.ts (consumer)
 * @see ../server.ts (pino redact list + route registration at step 10)
 * @see packages/shared-protocol/src/payloads/voice.ts (VoiceTranscriptPayloadSchema)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 */

import type { Logger } from 'pino';
import { WebSocket as NodeWebSocket } from 'ws';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateDeepgramSttOpts {
  /** DEEPGRAM_API_KEY from env; when undefined or '', the adapter operates in disabled mode. */
  apiKey: string | undefined;
  /** Override the Deepgram URL for testing (e.g. 'ws://localhost:9999/mock-deepgram' in vitest). When not provided, uses the canonical Deepgram URL. */
  urlOverride?: string | undefined;
  logger: Logger;
  /**
   * Optional callback returning the current Deepgram Keyterm Prompting vocabulary
   * for the next session. Called lazily on every {@link DeepgramAdapter.connect}
   * invocation (DGKT-05) — supports the hot-update model where plan 15-03's
   * entity-pack cache may have changed between sessions. Return `[]` (or omit
   * the callback entirely; DGKT-06) to disable keyterm prompting and preserve
   * the Phase 12 baseline URL byte-for-byte (DGKT-04).
   *
   * Each returned string is URL-encoded via {@link encodeURIComponent} (RFC 3986)
   * before being appended to the Deepgram WS URL as a `keyterm=<encoded>` query
   * parameter — one occurrence per entry per Deepgram wire format.
   *
   * @see ./keyterm-merger.ts (production producer: buildKeytermList)
   * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-02-PLAN.md
   * @see .planning/quick/20260517-voice-intent-research/RESEARCH.md §2 Option C
   */
  keytermProvider?: () => string[];
  /**
   * @internal Test-only: inject a custom WebSocket factory.
   * Production always uses the `ws` package's WebSocket constructor.
   */
  _wsFactory?: (url: string, opts: { headers: Record<string, string> }) => unknown;
}

export interface DeepgramStream {
  /** Forward a binary PCM frame from g2-app to Deepgram. */
  sendAudio(frame: Uint8Array): void;
  /** Register a callback for Results frames (parsed JSON). */
  onTranscript(cb: (frame: DeepgramResultsFrame) => void): void;
  /** Tear down the underlying Deepgram WS + remove all listeners. */
  close(): void;
}

export interface DeepgramResultsFrame {
  type: 'Results';
  channel: { alternatives: Array<{ transcript: string; confidence: number }> };
  is_final: boolean;
}

export interface DeepgramAdapter {
  /** True when apiKey was provided at construction. */
  isEnabled(): boolean;
  /** Create a new DeepgramStream for an inbound audio session. */
  connect(sessionId: string): DeepgramStream;
}

// ─── Deepgram URL ─────────────────────────────────────────────────────────────

/**
 * Canonical Deepgram Nova-3 Multilingual streaming endpoint.
 *
 * Query parameters (per Deepgram streaming codecs docs):
 *   model=nova-3               — Nova-3 Multilingual per CONTEXT.md D-12-01
 *   language=multi             — Code-switching mode (IT+EN interleaved)
 *   punctuate=true             — Deepgram punctuation restoration
 *   encoding=linear16          — Required when sending raw s16le PCM (Deepgram default is opus)
 *   sample_rate=16000          — Even Hub SDK delivers 16kHz mono PCM (Specs.md §3.5)
 *   channels=1                 — Mono
 */
const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true&encoding=linear16&sample_rate=16000&channels=1';

// ─── Keyterm URL builder (Phase 15 Plan 02) ──────────────────────────────────

/**
 * Append Deepgram Keyterm Prompting query params to a base Deepgram WS URL.
 *
 * Each keyterm is appended as a separate `keyterm=<encoded>` query parameter —
 * the canonical Deepgram wire format (per RESEARCH.md §2 Option C, verified
 * 2026-05-17 against Deepgram learn article). Encoding follows RFC 3986 via
 * {@link encodeURIComponent}: spaces become `%20` (NOT `+` form-style), and
 * `&` / `=` / accented UTF-8 bytes are percent-escaped — the T-15-05 URL-
 * injection mitigation surfaces here.
 *
 * When `keyterms` is empty the base URL is returned unchanged byte-for-byte
 * (DGKT-04 contract — preserves Phase 12 baseline for users without entity
 * pack push).
 *
 * @param baseUrl - The canonical Deepgram URL (or test override). MUST already
 *   contain at least one query parameter — keyterms are joined with `&`.
 * @param keyterms - List of keyterm strings (in `buildKeytermList` output order).
 * @returns The base URL with one `&keyterm=<encoded>` appended per entry.
 *
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-02-PLAN.md DGKT-01..06
 * @see .planning/quick/20260517-voice-intent-research/RESEARCH.md §2 Option C
 */
function buildDeepgramUrl(baseUrl: string, keyterms: string[]): string {
  if (keyterms.length === 0) return baseUrl;
  const encoded = keyterms.map((k) => `keyterm=${encodeURIComponent(k)}`).join('&');
  return `${baseUrl}&${encoded}`;
}

// ─── Shape guard for Results frames ──────────────────────────────────────────

/**
 * Type guard: checks if parsed JSON is a Deepgram Results frame with at least one
 * non-empty alternative. Malformed or non-Results frames return false.
 *
 * We use a hand-written guard (not Zod) to keep the Deepgram adapter dependency-free
 * relative to @evf/shared-protocol — the adapter is a bridge-internal module.
 */
function isValidResultsFrame(raw: unknown): raw is DeepgramResultsFrame {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (obj['type'] !== 'Results') return false;
  const channel = obj['channel'];
  if (typeof channel !== 'object' || channel === null) return false;
  const alts = (channel as Record<string, unknown>)['alternatives'];
  if (!Array.isArray(alts) || alts.length === 0) return false;
  const first = alts[0] as Record<string, unknown>;
  return typeof first['transcript'] === 'string' && typeof first['confidence'] === 'number';
}

// ─── Disabled stream (no-op) ──────────────────────────────────────────────────

function createNoOpStream(): DeepgramStream {
  return {
    sendAudio(_frame) {
      // No-op: adapter is disabled (DEEPGRAM_API_KEY not set).
    },
    onTranscript(_cb) {
      // No-op: no transcripts will arrive.
    },
    close() {
      // No-op: nothing to tear down.
    },
  };
}

// ─── Live stream ──────────────────────────────────────────────────────────────

function createLiveStream(
  url: string,
  apiKey: string,
  logger: Logger,
  wsFactory: (url: string, opts: { headers: Record<string, string> }) => unknown,
): DeepgramStream {
  // Construct the WS with the canonical Deepgram auth header.
  // Deepgram uses `Authorization: Token <KEY>` (NOT `Bearer`) — DG-06.
  const ws = wsFactory(url, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  }) as {
    on: (event: string, handler: (...args: unknown[]) => void) => unknown;
    send: (data: Uint8Array) => void;
    close: () => void;
  };

  const transcriptCallbacks: ((frame: DeepgramResultsFrame) => void)[] = [];

  ws.on('message', (data: unknown) => {
    try {
      const text = data instanceof Buffer ? data.toString('utf-8') : String(data);
      const parsed: unknown = JSON.parse(text);
      if (isValidResultsFrame(parsed)) {
        for (const cb of transcriptCallbacks) {
          cb(parsed);
        }
      } else {
        logger.debug(
          { type: (parsed as Record<string, unknown>)?.['type'] },
          'deepgram-stt: dropped non-Results frame',
        );
      }
    } catch {
      logger.debug('deepgram-stt: dropped malformed JSON frame');
    }
  });

  ws.on('close', () => {
    logger.debug('deepgram-stt: Deepgram WS closed');
  });

  ws.on('error', (err: unknown) => {
    logger.warn({ err }, 'deepgram-stt: Deepgram WS error');
  });

  return {
    sendAudio(frame: Uint8Array) {
      try {
        ws.send(frame);
      } catch (err) {
        logger.warn({ err }, 'deepgram-stt: sendAudio failed');
      }
    },
    onTranscript(cb) {
      transcriptCallbacks.push(cb);
    },
    close() {
      try {
        ws.close();
      } catch (err) {
        logger.warn({ err }, 'deepgram-stt: close failed');
      }
    },
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a Deepgram STT adapter.
 *
 * # Phase 15 Plan 02 — Keyterm Prompting wiring (VOICE-06)
 *
 * When `opts.keytermProvider` is supplied, the adapter invokes it lazily on
 * every {@link DeepgramAdapter.connect} call (DGKT-05) and appends one
 * `keyterm=<URL-encoded>` query parameter per returned entry to the Deepgram
 * WS URL. The keyterm vocabulary is the merger output of static SRD spells
 * + dynamic Foundry-derived entity-pack (plan 15-01's `buildKeytermList`).
 *
 * Both IT and EN locale variants of each spell/entity reach Deepgram in a
 * single Nova-3 Multilingual session — CONTEXT D-02 — because the existing
 * `language=multi` URL param is preserved and the merger interleaves both
 * locales into a single keyterm list. Nova-3 handles intra-phrase code-
 * switch like `"casta fireball"` natively.
 *
 * When `keytermProvider` returns `[]` (cold entity cache) OR is omitted
 * entirely, the URL byte-for-byte matches the Phase 12 baseline (DGKT-04 /
 * DGKT-06) — voice STT continues to function as in Phase 12, just without
 * the +625% entity-recall lift.
 *
 * @param opts.apiKey - `process.env.DEEPGRAM_API_KEY`; `undefined` or `''` → disabled mode.
 * @param opts.urlOverride - Override Deepgram URL for testing (injects mock server URL).
 * @param opts.logger - pino Logger instance from the Fastify app.
 * @param opts.keytermProvider - @see {@link CreateDeepgramSttOpts.keytermProvider}.
 * @param opts._wsFactory - @internal Test-only WS factory injection.
 *
 * @returns DeepgramAdapter — `isEnabled()` + `connect(sessionId)`.
 */
export function createDeepgramStt(opts: CreateDeepgramSttOpts): DeepgramAdapter {
  const { apiKey, urlOverride, logger, keytermProvider } = opts;
  const enabled = apiKey !== undefined && apiKey !== '';

  if (!enabled) {
    logger.warn('deepgram-stt: voice path disabled — DEEPGRAM_API_KEY not set');
  }

  // Default to the ws package WebSocket; tests inject _wsFactory.
  const wsFactory: (url: string, opts: { headers: Record<string, string> }) => unknown =
    opts._wsFactory ??
    ((url: string, wsOpts: { headers: Record<string, string> }) => new NodeWebSocket(url, wsOpts));

  const deepgramUrl = urlOverride ?? DEEPGRAM_URL;

  return {
    isEnabled(): boolean {
      return enabled;
    },

    connect(sessionId: string): DeepgramStream {
      if (!enabled) {
        logger.debug(
          { sessionId },
          'deepgram-stt: connect called but adapter disabled — returning no-op stream',
        );
        return createNoOpStream();
      }
      // Resolve keyterms lazily per connect() (DGKT-05). T-15-07 mitigation:
      // wrap the provider invocation in try/catch — if the merger throws (e.g.
      // unexpected entity-cache state), we degrade to baseline (no keyterms)
      // rather than fail-closed the entire voice path.
      let keyterms: string[] = [];
      if (keytermProvider !== undefined) {
        try {
          keyterms = keytermProvider();
        } catch (err) {
          logger.warn(
            { err, sessionId },
            'deepgram-stt: keytermProvider threw — proceeding with no keyterms (Phase 12 baseline)',
          );
          keyterms = [];
        }
      }
      const sessionUrl = buildDeepgramUrl(deepgramUrl, keyterms);
      logger.info(
        { sessionId, keytermCount: keyterms.length },
        'deepgram-stt: connecting to Deepgram',
      );
      // apiKey is non-empty here (enabled === true)
      return createLiveStream(sessionUrl, apiKey as string, logger, wsFactory);
    },
  };
}
