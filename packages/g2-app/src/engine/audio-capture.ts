/**
 * G2 microphone audio capture module — Plan 12-03 Task 2.
 *
 * `startAudioCapture()` opens the G2 mic via `EvenAppBridge.audioControl(true)`,
 * subscribes to `onEvenHubEvent` to receive PCM frames (`event.audioEvent.audioPcm`),
 * and forwards them verbatim as binary WS frames to the bridge
 * `/v1/audio/stream` endpoint for Deepgram STT processing.
 *
 * # PCM Passthrough
 *
 * Even Hub SDK delivers `event.audioEvent.audioPcm: Uint8Array` — 16 kHz s16le
 * mono PCM (Specs.md §3.5). We forward each frame directly via `ws.send(audioPcm)`.
 * No transcoding — Deepgram `encoding=linear16` at 16000Hz 1ch expects exactly this.
 *
 * # Mic State Hygiene (T-12-09)
 *
 * Defensive `audioControl(false)` on unexpected WS close ensures the G2 mic
 * never stays on after the engine quits or the bridge drops the connection
 * (Specs.md §3.5 mic-state hygiene, T-12-09 mitigation).
 *
 * # Zero-cost when voice is disabled
 *
 * boot-engine-core checks the handshake `server_caps` for `'voice'` capability
 * before calling `startAudioCapture`. When voice cap is absent, no
 * `AudioCaptureHandle` is created and no `bridge.audioControl` call is made.
 *
 * # Auth
 *
 * The WS to `/v1/audio/stream` uses `Authorization: Bearer <bearer>` — the same
 * 24h bearer paired via QR scan in Phase 2 (NOT Deepgram's `Token` scheme, which
 * is only used by the bridge-to-Deepgram WS in deepgram-stt.ts).
 *
 * @see packages/bridge/src/voice/audio-stream-route.ts (route this uploads to)
 * @see packages/bridge/src/voice/deepgram-stt.ts (downstream Deepgram WS)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (boot wiring)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EvenAppBridge as EvenAppBridgeClass } from '@evenrealities/even_hub_sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioCaptureOpts {
  /** Bridge base URL — e.g. 'http://localhost:8910'. Converted to ws:// internally. */
  bridgeUrl: string;
  /** 24h bearer from QR-pairing (Phase 2). Used in Authorization: Bearer header. */
  bearer: string;
  /** Optional logger — defaults to console (lazy: no output in prod WebView unless debug mode). */
  logger?: Console;
  /**
   * @internal Test-only: inject a mock EvenAppBridge factory.
   * Production uses `EvenAppBridge.getInstance()` (lazy — not at module load time).
   */
  _bridgeFactory?: () => EvenAppBridge;
  /**
   * @internal Test-only: inject a mock WebSocket factory.
   * Production uses the global `WebSocket` constructor (native browser/Node WS).
   */
  _wsFactory?: (url: string, opts?: unknown) => WebSocket;
}

export interface AudioCaptureHandle {
  /** Open the mic and start streaming PCM to the bridge. Idempotent. */
  start(): Promise<void>;
  /** Stop the mic + tear down the WS. Idempotent. */
  stop(): Promise<void>;
  /** True if start() has been called and stop() has NOT yet been called. */
  isCapturing(): boolean;
}

// ─── URL helper ───────────────────────────────────────────────────────────────

/**
 * Convert an HTTP(S) bridge URL to a WebSocket URL for `/v1/audio/stream`.
 *
 * @example
 * buildAudioStreamUrl('http://localhost:8910')  → 'ws://localhost:8910/v1/audio/stream'
 * buildAudioStreamUrl('https://bridge.example.com') → 'wss://bridge.example.com/v1/audio/stream'
 */
function buildAudioStreamUrl(bridgeUrl: string): string {
  const url = bridgeUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  const trimmed = url.endsWith('/') ? url.slice(0, -1) : url;
  return `${trimmed}/v1/audio/stream`;
}

// ─── startAudioCapture ────────────────────────────────────────────────────────

/**
 * Create an `AudioCaptureHandle` for mic-gated PCM streaming to the bridge.
 *
 * The handle is in a stopped state until `start()` is called.
 *
 * @param opts - Configuration + test injection points.
 * @returns AudioCaptureHandle with `start()`, `stop()`, `isCapturing()`.
 */
export function startAudioCapture(opts: AudioCaptureOpts): AudioCaptureHandle {
  const log = opts.logger ?? console;
  const wsFactory =
    opts._wsFactory ??
    ((url: string, initOpts?: unknown) =>
      new WebSocket(url, initOpts as string | string[] | undefined));
  const bridgeFactory = opts._bridgeFactory ?? (() => EvenAppBridgeClass.getInstance());

  // Mutable internal state — closed over by the handle methods.
  let _capturing = false;
  let _ws: WebSocket | null = null;
  let _unsubscribeEventCb: (() => void) | null = null;

  /**
   * Defensive mic-off: called on unexpected WS close to ensure the G2 mic
   * is not left on after the connection drops (T-12-09 mitigation).
   */
  async function _defensiveMicOff(): Promise<void> {
    if (_capturing) {
      _capturing = false;
      _unsubscribeEventCb?.();
      _unsubscribeEventCb = null;
      try {
        await bridgeFactory().audioControl(false);
      } catch (err) {
        log.warn('[audio-capture] defensive audioControl(false) failed', err);
      }
    }
  }

  return {
    isCapturing(): boolean {
      return _capturing;
    },

    async start(): Promise<void> {
      if (_capturing) {
        log.debug?.('[audio-capture] start() called while already capturing — no-op');
        return;
      }

      const bridge = bridgeFactory();
      const streamUrl = buildAudioStreamUrl(opts.bridgeUrl);

      log.info?.(`[audio-capture] opening mic + WS to ${streamUrl}`);

      // 1. Enable the G2 mic via SDK.
      await bridge.audioControl(true);

      // 2. Open the WS to the bridge audio stream route.
      const ws = wsFactory(streamUrl, {
        headers: {
          Authorization: `Bearer ${opts.bearer}`,
        },
      });
      _ws = ws;

      // 3. Wait for the WS to open.
      await new Promise<void>((resolve, reject) => {
        const onOpen = (): void => {
          ws.removeEventListener('open', onOpen as EventListenerOrEventListenerObject);
          ws.removeEventListener('error', onError as EventListenerOrEventListenerObject);
          resolve();
        };
        const onError = (ev: Event): void => {
          ws.removeEventListener('open', onOpen as EventListenerOrEventListenerObject);
          ws.removeEventListener('error', onError as EventListenerOrEventListenerObject);
          reject(new Error(`[audio-capture] WS connection error: ${String(ev.type)}`));
        };
        ws.addEventListener('open', onOpen as EventListenerOrEventListenerObject);
        ws.addEventListener('error', onError as EventListenerOrEventListenerObject);
      });

      // 4. Subscribe to Even Hub audio events + forward PCM frames.
      const unsubscribe = bridge.onEvenHubEvent((event) => {
        if (event.audioEvent?.audioPcm !== undefined) {
          try {
            ws.send(event.audioEvent.audioPcm);
          } catch (err) {
            log.warn('[audio-capture] ws.send failed', err);
          }
        }
      });
      _unsubscribeEventCb = unsubscribe;

      // 5. Wire defensive mic-off on unexpected WS close.
      ws.addEventListener('close', ((ev: CloseEvent) => {
        if (_capturing) {
          log.warn(
            `[audio-capture] WS closed unexpectedly (code=${ev.code}, reason=${ev.reason}) — issuing mic-off`,
          );
          void _defensiveMicOff();
        }
      }) as EventListenerOrEventListenerObject);

      _capturing = true;
      log.info?.('[audio-capture] capture started');
    },

    async stop(): Promise<void> {
      if (!_capturing) {
        log.debug?.('[audio-capture] stop() called while not capturing — no-op');
        return;
      }

      _capturing = false;
      log.info?.('[audio-capture] stopping capture');

      // 1. Unsubscribe from Even Hub audio events.
      _unsubscribeEventCb?.();
      _unsubscribeEventCb = null;

      // 2. Close the WS.
      try {
        _ws?.close();
      } catch (err) {
        log.warn('[audio-capture] WS close failed', err);
      }
      _ws = null;

      // 3. Turn off the G2 mic.
      try {
        await bridgeFactory().audioControl(false);
      } catch (err) {
        log.warn('[audio-capture] audioControl(false) failed', err);
      }

      log.info?.('[audio-capture] capture stopped');
    },
  };
}
