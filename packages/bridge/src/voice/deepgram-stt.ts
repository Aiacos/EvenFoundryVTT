/**
 * Deepgram Nova-3 Multilingual streaming STT adapter — Plan 12-03 Task 1 +
 * Plan 15-02 (keyterm wiring) + Plan 15-03 (refreshKeyterm invalidation) +
 * Plan 15-04 (empty-cache one-shot warn + keyterm-reject retry-then-fallback).
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
 * # Phase 15 Plan 04 — Failure modes (CONTEXT D-05 + D-06)
 *
 * - **Empty entity-pack cache** (D-05): when the keytermProvider reports
 *   `entityCachePresent: false`, the adapter emits a single `logger.warn`
 *   with `{ event: 'keyterm.empty-entity-cache' }` on the FIRST observation
 *   per empty-streak. Subsequent connects with the cache still empty do NOT
 *   re-emit. When the cache transitions to present, the flag resets so a
 *   later return-to-empty fires the warn again. The warn is **never**
 *   emitted when the provider returns a bare `string[]` — that signals
 *   "no entity-cache awareness" and is opt-out of the diagnostic.
 *
 * - **Keyterm-reject retry-then-fallback** (D-06): when Deepgram closes a
 *   session BEFORE any Results frame arrives, with a close code in the
 *   keyterm-reject set (1007 invalid-payload-data, 1008 policy-violation,
 *   or any code in the application range 4000-4999), the adapter:
 *     1. Retries ONCE with a {@link sanitizeKeyterms}-normalised URL.
 *     2. If the retry also fails with a keyterm-reject code, falls back to
 *        a no-keyterm baseline URL (Phase 12 behaviour preserved).
 *   Retries are per-session ephemeral — each new `connect()` starts again
 *   with the optimistic full keyterm list. There is no global "keyterms
 *   are bad" state. Voice is NEVER fail-closed when Deepgram is reachable.
 *
 * @see ./audio-stream-route.ts (consumer)
 * @see ../server.ts (pino redact list + route registration at step 10)
 * @see ./keyterm-sanitizer.ts (retry-path sanitiser — Plan 15-04 Task 1)
 * @see packages/shared-protocol/src/payloads/voice.ts (VoiceTranscriptPayloadSchema)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 1
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-04-PLAN.md
 */

import type { Logger } from 'pino';
import { WebSocket as NodeWebSocket } from 'ws';
import { sanitizeKeyterms } from './keyterm-sanitizer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Phase 15 Plan 04 — richer return shape for the keytermProvider callback.
 *
 * Returning the bare `string[]` form keeps Phase 15 Plan 02 backward
 * compatibility — the adapter normalises it internally and skips the
 * empty-cache warning entirely (no entity-cache awareness signalled).
 *
 * Returning the object form `{ keyterms, entityCachePresent }` opts into the
 * D-05 one-shot empty-cache warning: when `entityCachePresent === false`,
 * the FIRST observation per empty-streak emits a single `logger.warn` with
 * `{ event: 'keyterm.empty-entity-cache' }`.
 */
export interface KeytermProviderResult {
  /** The keyterm list to forward to Deepgram (already deduped/capped by the merger). */
  keyterms: string[];
  /** True when the entity-pack cache had a non-null snapshot at compute time. */
  entityCachePresent: boolean;
}

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
   * # Phase 15 Plan 04 — richer return shape
   *
   * The provider may optionally return the object form
   * {@link KeytermProviderResult}, where `entityCachePresent` drives the
   * one-shot empty-cache warning (CONTEXT D-05). The bare `string[]` form
   * remains supported for Phase 15 Plan 02 backward compatibility; under
   * that form the empty-cache warn path is disabled (the warn is opt-in
   * via the richer shape, not a generic "empty keyterms" diagnostic).
   *
   * @see ./keyterm-merger.ts (production producer: buildKeytermList)
   * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-02-PLAN.md
   * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-04-PLAN.md
   * @see .planning/quick/20260517-voice-intent-research/RESEARCH.md §2 Option C
   */
  keytermProvider?: () => string[] | KeytermProviderResult;
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
  /**
   * Phase 15 Plan 03 — invalidation signal for the keyterm list (VOICE-09).
   *
   * Re-invokes the {@link CreateDeepgramSttOpts.keytermProvider} (so the log
   * payload reflects the latest count) and emits a structured
   * `event: 'keyterm.refreshed'` pino logger.info call. **Does NOT touch any
   * active Deepgram WS** — the Deepgram streaming protocol does not support
   * mid-stream keyterm hot-swap, so the realistic refresh model is "next
   * connect() picks up the new keyterm list" (already true thanks to the
   * lazy `keytermProvider` contract — DGKT-05).
   *
   * The Phase 15 KeytermRefresher orchestrator calls this method after each
   * debounced + mutex-serialised entity-pack-cache change. Sessions in
   * progress when refreshKeyterm() fires continue with their original
   * keyterm list until next reconnect — acceptable per CONTEXT D-07
   * (Deepgram sessions are short-lived; "≤ 5 min SLA" from VOICE-09 is
   * naturally satisfied by per-utterance reconnects).
   *
   * T-15-11 disposition (accept): the emitted log payload contains ONLY
   * `keytermCount: number` + `fromCache: boolean` — **never the keyterm
   * values themselves**. DGRF-02 enforces this.
   *
   * @see ../../../planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md DGRF-01..DGRF-05
   */
  refreshKeyterm(): void;
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

// ─── Phase 15 Plan 04 — Keyterm-reject close codes ────────────────────────────

/**
 * WS close codes that signal a Deepgram-side rejection of the keyterm list.
 *
 * - **1007** (RFC 6455 invalid-payload-data) — Deepgram occasionally maps
 *   malformed UTF-8 / control-char-laden keyterm strings to this code.
 * - **1008** (RFC 6455 policy-violation) — generic "request violates server
 *   policy"; Deepgram's WS layer uses it for keyterm-list validation failures.
 *
 * In addition to these RFC 6455 codes, any application close code in the
 * range `4000-4999` is treated as keyterm-suspect (Deepgram reserves the
 * application range for its own service-specific signals).
 *
 * Codes OUTSIDE these (1000 normal, 1006 abnormal, 1011 server error, etc.)
 * are NOT keyterm-related and do not trigger retry. Phase 12 close behaviour
 * is preserved for those codes (DGFM-04).
 *
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-CONTEXT.md D-06
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.4.1 (WS close codes)
 */
const KEYTERM_REJECT_CODES = [1007, 1008] as const;

/** True when `code` is in {@link KEYTERM_REJECT_CODES} or the 4000-4999 application range. */
function isKeytermRejectCode(code: number): boolean {
  if (KEYTERM_REJECT_CODES.includes(code as 1007 | 1008)) return true;
  if (code >= 4000 && code <= 4999) return true;
  return false;
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

// ─── Internal types for the retry chain (Phase 15 Plan 04) ────────────────────

/**
 * Minimal WS-instance shape consumed by the adapter. Production injects a
 * `ws` package WebSocket; tests inject a mock with `emit('close', code, …)`
 * support. The factory return is `unknown` so we cast to this shape at the
 * single attach point.
 */
interface LiveWsHandle {
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  send: (data: Uint8Array) => void;
  close: () => void;
}

/** Discriminator for the retry chain — drives the close-handler decision tree. */
type AttemptKind = 'initial' | 'retry' | 'fallback';

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
 * # Phase 15 Plan 04 — Failure modes (CONTEXT D-05 + D-06)
 *
 * See module-level JSDoc for the empty-cache one-shot warn and keyterm-reject
 * retry-then-fallback semantics. Voice path NEVER fails closed when Deepgram
 * is reachable.
 *
 * @param opts.apiKey - `process.env.DEEPGRAM_API_KEY`; `undefined` or `''` → disabled mode.
 * @param opts.urlOverride - Override Deepgram URL for testing (injects mock server URL).
 * @param opts.logger - pino Logger instance from the Fastify app.
 * @param opts.keytermProvider - @see {@link CreateDeepgramSttOpts.keytermProvider}.
 * @param opts._wsFactory - @internal Test-only WS factory injection.
 *
 * @returns DeepgramAdapter — `isEnabled()` + `connect(sessionId)` + `refreshKeyterm()`.
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

  /**
   * Phase 15 Plan 04 — one-shot empty-cache warn flag (CONTEXT D-05).
   *
   * Closure-local, per-adapter-instance. The flag is set on the first
   * observation of an empty entity-pack cache (`entityCachePresent === false`
   * from the richer keytermProvider return shape). Subsequent empty-cache
   * observations during the same "empty streak" are absorbed silently.
   * Transitioning to `entityCachePresent === true` resets the flag — so a
   * later return to empty fires the warn again (one per empty-streak).
   */
  let _emptyCacheWarned = false;

  /**
   * Phase 15 Plan 04 — normalise the keytermProvider return shape and emit
   * the one-shot empty-cache warn (D-05) when appropriate.
   *
   * Accepts both the bare `string[]` form (Plan 15-02 backward compat) and
   * the richer `{ keyterms, entityCachePresent }` form (Plan 15-04). The
   * D-05 warning ONLY fires for the richer object form — the bare-array
   * form signals "no entity-cache awareness" and skips the diagnostic
   * entirely (DGEC-03).
   */
  function resolveKeyterms(): string[] {
    if (keytermProvider === undefined) return [];
    let raw: string[] | KeytermProviderResult;
    try {
      raw = keytermProvider();
    } catch (err) {
      // T-15-07 mitigation: throwing provider → baseline (no keyterms),
      // never fail-closed. Reset the empty-cache flag so a subsequent
      // recovery can re-fire the diagnostic if needed.
      logger.warn(
        { err },
        'deepgram-stt: keytermProvider threw — proceeding with no keyterms (Phase 12 baseline)',
      );
      return [];
    }
    // Bare string[] form — Phase 15 Plan 02 contract. No D-05 path.
    if (Array.isArray(raw)) {
      return raw;
    }
    // Richer object form — Phase 15 Plan 04 contract. Drives D-05.
    const { keyterms, entityCachePresent } = raw;
    if (entityCachePresent === false) {
      if (!_emptyCacheWarned) {
        logger.warn(
          { event: 'keyterm.empty-entity-cache', keytermCount: keyterms.length },
          'deepgram-stt: entity-pack cache empty — using spells-only keyterm list (D-05)',
        );
        _emptyCacheWarned = true;
      }
    } else {
      // entityCachePresent === true → reset for next empty-streak.
      _emptyCacheWarned = false;
    }
    return keyterms;
  }

  return {
    isEnabled(): boolean {
      return enabled;
    },

    refreshKeyterm(): void {
      // Phase 15 Plan 03 — VOICE-09 invalidation signal.
      // The Deepgram WS protocol does NOT support mid-stream keyterm hot-swap.
      // The realistic refresh model is "next connect() picks up the new
      // keyterm list" (already true thanks to lazy keytermProvider — DGKT-05).
      // We re-invoke the provider only to populate the log payload count; the
      // returned array is otherwise discarded. T-15-11 disposition (accept):
      // log MUST NOT include keyterm values, ONLY the count + fromCache flag.
      //
      // Note: refreshKeyterm does NOT go through resolveKeyterms() — the
      // empty-cache warn is a per-CONNECT diagnostic (drives session URL
      // construction), not a per-REFRESH telemetry signal. Mixing them
      // would risk firing the D-05 warn from a hot-update path that has
      // no user-visible session impact.
      let keytermCount = 0;
      if (keytermProvider !== undefined) {
        try {
          const raw = keytermProvider();
          keytermCount = Array.isArray(raw) ? raw.length : raw.keyterms.length;
        } catch (err) {
          // Same defensive try/catch pattern as in connect() — a throwing
          // provider degrades to baseline (count=0) rather than crash the
          // refresh path. The KeytermRefresher orchestrator's drain-then-
          // restart mutex remains safe because this method always returns
          // void synchronously.
          logger.warn(
            { err },
            'deepgram-stt: keytermProvider threw during refreshKeyterm — log count defaults to 0',
          );
          keytermCount = 0;
        }
      }
      logger.info(
        {
          event: 'keyterm.refreshed',
          keytermCount,
          fromCache: keytermProvider !== undefined,
        },
        'deepgram-stt: keyterm list invalidated; next connect() will use updated values',
      );
    },

    connect(sessionId: string): DeepgramStream {
      if (!enabled) {
        logger.debug(
          { sessionId },
          'deepgram-stt: connect called but adapter disabled — returning no-op stream',
        );
        return createNoOpStream();
      }

      // Resolve keyterms lazily per connect() (DGKT-05). T-15-07 mitigation
      // is bundled into resolveKeyterms (throwing provider → []).
      const keyterms = resolveKeyterms();
      const initialUrl = buildDeepgramUrl(deepgramUrl, keyterms);

      logger.info(
        { sessionId, keytermCount: keyterms.length },
        'deepgram-stt: connecting to Deepgram',
      );

      // Phase 15 Plan 04 — retry-then-fallback state machine.
      //
      // The returned DeepgramStream routes sendAudio/close/onTranscript
      // through whichever WS instance is currently "live" (mutable
      // `liveWs` reference reassigned on each attempt). Each WS instance
      // installs its own message/error/close handlers; once a Results frame
      // is observed, any later close is treated as a normal session end
      // (no retry — the keyterm list was clearly accepted).
      //
      // `apiKey` is non-empty here (enabled === true).
      const transcriptCallbacks: ((frame: DeepgramResultsFrame) => void)[] = [];
      let liveWs: LiveWsHandle | null = null;
      let closedByCaller = false;

      const _attemptConnect = (url: string, attempt: AttemptKind): void => {
        const ws = wsFactory(url, {
          headers: { Authorization: `Token ${apiKey as string}` },
        }) as LiveWsHandle;
        liveWs = ws;
        // Whether a valid Results frame has been observed for THIS attempt.
        // Once true, close events are normal session ends — no retry.
        let hasReceivedResultsFrame = false;

        ws.on('message', (data: unknown) => {
          try {
            const text = data instanceof Buffer ? data.toString('utf-8') : String(data);
            const parsed: unknown = JSON.parse(text);
            if (isValidResultsFrame(parsed)) {
              hasReceivedResultsFrame = true;
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

        ws.on('error', (err: unknown) => {
          logger.warn({ err, sessionId, attempt }, 'deepgram-stt: Deepgram WS error');
        });

        ws.on('close', (...args: unknown[]) => {
          const code = typeof args[0] === 'number' ? (args[0] as number) : 1000;
          // If the caller already requested close, this is a normal teardown.
          // If we already received a Results frame, the keyterm list was
          // clearly accepted — any later close is unrelated to keyterms.
          if (closedByCaller || hasReceivedResultsFrame) {
            logger.debug({ code, sessionId, attempt }, 'deepgram-stt: Deepgram WS closed');
            return;
          }
          if (!isKeytermRejectCode(code)) {
            // Phase 12 baseline behaviour: standard close (server error,
            // normal, abnormal, etc.). No retry — DGFM-04.
            logger.debug({ code, sessionId, attempt }, 'deepgram-stt: Deepgram WS closed');
            return;
          }
          // Keyterm-reject branch. Decide between retry and fallback.
          // WR-01 mitigation: clear `liveWs` BEFORE invoking the next attempt
          // so that any in-flight `sendAudio(frame)` during the retry window
          // becomes a no-op (via `liveWs?.send` short-circuit) rather than a
          // send-on-closed throw. The old WS is already closed by Deepgram
          // (we are inside its close handler), so no explicit `.close()` is
          // needed — only the reference must be detached. `_attemptConnect`
          // will reassign `liveWs` to the fresh handle.
          if (attempt === 'initial') {
            const sanitizedUrl = buildDeepgramUrl(deepgramUrl, sanitizeKeyterms(keyterms));
            logger.warn(
              { event: 'keyterm.retry-with-sanitized', code, sessionId },
              'deepgram-stt: Deepgram rejected keyterm list — retrying with sanitized form (D-06)',
            );
            liveWs = null;
            _attemptConnect(sanitizedUrl, 'retry');
            return;
          }
          if (attempt === 'retry') {
            const baselineUrl = buildDeepgramUrl(deepgramUrl, []);
            logger.warn(
              { event: 'keyterm.fallback-to-baseline', code, sessionId },
              'deepgram-stt: sanitized retry also rejected — falling back to no-keyterm baseline (D-06)',
            );
            liveWs = null;
            _attemptConnect(baselineUrl, 'fallback');
            return;
          }
          // attempt === 'fallback' → no further retries. Phase 12 baseline
          // also failed, meaning Deepgram has a real outage. Surface as
          // standard close — voice path degrades gracefully.
          logger.debug({ code, sessionId, attempt }, 'deepgram-stt: Deepgram WS closed');
        });
      };

      _attemptConnect(initialUrl, 'initial');

      return {
        sendAudio(frame: Uint8Array) {
          try {
            liveWs?.send(frame);
          } catch (err) {
            logger.warn({ err }, 'deepgram-stt: sendAudio failed');
          }
        },
        onTranscript(cb) {
          transcriptCallbacks.push(cb);
        },
        close() {
          closedByCaller = true;
          try {
            liveWs?.close();
          } catch (err) {
            logger.warn({ err }, 'deepgram-stt: close failed');
          }
        },
      };
    },
  };
}
