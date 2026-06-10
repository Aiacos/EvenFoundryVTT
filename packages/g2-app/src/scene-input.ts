/**
 * Scene-input — bridge WS message receiver for the raster pipeline data source.
 *
 * Plan 4a-06 Task 3 — closes the B-5 gap on the g2-app side. Subscribes to
 * `ws.message` events, parses each incoming envelope via the real
 * `EnvelopeSchema` (defense-in-depth outer parse), narrows on
 * `envelope.type === 'frame_pixels'`, then parses `envelope.payload` via
 * `FramePixelsSchema` (defense-in-depth inner parse) before dispatching the
 * decoded RGBA bytes to `RasterController.requestFrame`.
 *
 * **NF-1 closure (verbatim contract — do NOT alter)**
 *
 * - Imports the real `EnvelopeSchema` export from `@evf/shared-protocol`.
 * - Reads the carrier payload via the schema's `payload` field name.
 * - `session_id: z.string().uuid()` is REQUIRED on the outer envelope; the
 *   bridge populates it from the pair registry. Consumers (this module) only
 *   verify it parses — they do not need to read it.
 *
 * Plan 4a-06 plan-check `NF-1` specifically forbids three drift patterns that
 * an earlier draft of this plan tried to use. The patterns are intentionally
 * NOT spelled out in this comment because the verify gate runs a literal
 * grep against this file — see 04A-PLAN-CHECK.md §NF-1 for the full list.
 *
 * **Defense-in-depth (T-4a-06-02 mitigation)**
 *
 * Every WS message goes through:
 *   1. `JSON.parse` in `try/catch` — non-JSON → log + drop.
 *   2. `EnvelopeSchema.safeParse(raw)` — outer schema failure → log + drop.
 *   3. Narrow on `envelope.type === 'frame_pixels'` — drop other types silently
 *      (they're for other consumers, not bugs).
 *   4. `FramePixelsSchema.safeParse(envelope.payload)` — payload schema
 *      failure → log + drop.
 *   5. `decodeFramePixels` (throws on bad base64 or length mismatch) — caught
 *      via the outer try/catch → log + drop.
 *
 * `RasterController.requestFrame` is **never** called with unvalidated input.
 *
 * **Transferable prerequisite (NF-4 scope)**
 *
 * `decodeFramePixels` returns a fresh `Uint8ClampedArray` whose underlying
 * `ArrayBuffer` is owned (`byteOffset === 0`, `byteLength === buffer.byteLength`),
 * so the buffer is transferable-capable when handed to
 * `controller.requestFrame`. The actual zero-copy
 * `postMessage(msg, [buffer])` transfer to the raster Worker happens inside
 * `RasterController` and is verified end-to-end by Plan 03 RC-2; this module
 * only verifies the prerequisite (SI-7).
 *
 * **Fire-and-forget on the per-frame path**
 *
 * `controller.requestFrame` returns a Promise; the handler does NOT await
 * (per-frame latency budget is dominated by the 200 ms producer debounce, not
 * the Worker round-trip). A `.catch` is attached so a rejected Promise logs
 * and does not crash the WS listener.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 3
 * @see docs/architecture/0002-protocol-versioning.md (ADR-0002 envelope versioning)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (ADR-0006 raster pipeline)
 * @see ./raster/raster-controller.ts (RasterController.requestFrame — Plan 03 sink)
 * @see ./engine/layer-types.ts (RasterControllerLike type-only contract)
 */
import { decodeFramePixels, EnvelopeSchema, FramePixelsSchema } from '@evf/shared-protocol';
import type { RasterControllerLike } from './engine/layer-types.js';

/**
 * Function returned by {@link attachSceneInputToWs}. Calling it removes the
 * `message` event listener installed at attach time. Idempotent on repeat call.
 */
export type UnsubscribeFn = () => void;

/**
 * Minimal sink interface for the canvas-mode map frame path.
 *
 * `MapCanvasLayer` implements this — `attachSceneInputToWs` accepts either a
 * `RasterControllerLike` (glyph fallback) or a `MapFrameSink` (canvas mode).
 * When a `MapFrameSink` is provided, incoming `frame_pixels` envelopes are
 * routed to `setFrame` instead of `RasterController.requestFrame`, bypassing
 * the Worker + dither pipeline (the compositor ingests RGBA directly).
 *
 * The interface is intentionally minimal — only `setFrame` is required so
 * test doubles can implement it without importing the full `MapCanvasLayer` class.
 *
 * T-d42-02: `setFrame` receives pre-validated, padded 400×200 bytes from the
 * `padFrame` step below — malformed bytes never reach `setFrame`.
 */
export interface MapFrameSink {
  /**
   * Store a new full-screen RGBA frame.
   *
   * @param rgba Pre-validated, canonical 576×288 RGBA bytes from `padFrame`.
   * @param w    Frame width (always `CANVAS_CANONICAL_W = 576`).
   * @param h    Frame height (always `CANVAS_CANONICAL_H = 288`).
   */
  setFrame(rgba: Uint8ClampedArray, w: number, h: number): void;
}

/** Canvas-mode canonical width — full screen (layout B, 2026-06-10). */
const CANVAS_CANONICAL_W = 576;

/** Canvas-mode canonical height — full screen (layout B, 2026-06-10). */
const CANVAS_CANONICAL_H = 288;

/** Glyph-mode canonical width (legacy raster-worker contract — exactly 400). */
const GLYPH_CANONICAL_W = 400;

/** Glyph-mode canonical height (legacy raster-worker contract — exactly 200). */
const GLYPH_CANONICAL_H = 200;

/**
 * Center-pad an RGBA frame onto an opaque-black canonical buffer.
 *
 * Frames already at target size are returned as-is (no copy — preserves the
 * transferable-ownership property of `decodeFramePixels`). Smaller frames are
 * centered on a zero-filled buffer whose padding alpha is forced to 255 so the
 * letterbox bands dither to solid black, not undefined-transparent.
 * Returns `null` for frames LARGER than the target (cannot pad down): the
 * glyph legacy path (400×200 worker contract) skips full-screen 576×288 frames
 * from module ≥v0.1.14 — glyph map streaming is superseded by canvas mode.
 */
function padFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetW: number,
  targetH: number,
): Uint8ClampedArray | null {
  if (width === targetW && height === targetH) {
    return pixels;
  }
  if (width > targetW || height > targetH) {
    return null;
  }
  const out = new Uint8ClampedArray(targetW * targetH * 4);
  // Opaque-black base: set every alpha byte; RGB stays 0.
  for (let i = 3; i < out.length; i += 4) {
    out[i] = 255;
  }
  const padX = Math.floor((targetW - width) / 2);
  const padY = Math.floor((targetH - height) / 2);
  for (let row = 0; row < height; row++) {
    const srcOffset = row * width * 4;
    const dstOffset = ((padY + row) * targetW + padX) * 4;
    out.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset);
  }
  return out;
}

/**
 * Runtime type guard — returns `true` when `sink` is a `MapFrameSink` (canvas
 * mode) rather than a `RasterControllerLike` (glyph fallback).
 *
 * The discriminator is the presence of `setFrame` as a function — this property
 * exists on `MapCanvasLayer` but NOT on `RasterController`.
 */
function isMapFrameSink(sink: RasterControllerLike | MapFrameSink): sink is MapFrameSink {
  return typeof (sink as MapFrameSink).setFrame === 'function';
}

/**
 * Attach a `frame_pixels` envelope receiver to a WebSocket.
 *
 * Registers a `ws.addEventListener('message', handler)`; the handler
 * defense-in-depth-parses each incoming envelope and dispatches valid
 * `frame_pixels` payloads to the appropriate sink:
 *
 *   - **Canvas mode** (when `sink` is a `MapFrameSink`): calls `sink.setFrame`
 *     synchronously — no Worker round-trip (the compositor ingests RGBA directly).
 *     This is the canvas-mode path introduced in quick-task 260610-d42 Task 2.
 *     The legacy `RasterController.requestFrame` map-tile path is explicitly
 *     canvas-mode-unreachable via this branch — see the rationale comment below.
 *
 *   - **Glyph fallback** (when `sink` is a `RasterControllerLike`): calls
 *     `sink.requestFrame(framed, 400, 200)` fire-and-forget with
 *     a `.catch` guard — the Worker + dither pipeline path.
 *
 * Returns an unsubscribe closure that calls `ws.removeEventListener('message', handler)`.
 *
 * @param ws   - Native WebSocket (or test-compatible mock with the
 *               `addEventListener`/`removeEventListener` surface)
 * @param sink - MapFrameSink (canvas mode) or RasterControllerLike (glyph fallback)
 * @returns Unsubscribe function (idempotent)
 */
export function attachSceneInputToWs(
  ws: WebSocket,
  sink: RasterControllerLike | MapFrameSink,
): UnsubscribeFn {
  const handler = (ev: MessageEvent): void => {
    try {
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      let raw: unknown;
      try {
        raw = JSON.parse(rawText);
      } catch (err) {
        console.warn('[scene-input] message is not valid JSON, dropping', err);
        return;
      }

      // 1) Outer envelope parse — proto / seq / ts / type / session_id (UUID) / payload.
      const env = EnvelopeSchema.safeParse(raw);
      if (!env.success) {
        console.warn('[scene-input] envelope parse failed', env.error);
        return;
      }

      // 2) Discriminate on type — drop non-frame_pixels envelopes silently
      //    (they're targeted at other consumers; not a bug).
      if (env.data.type !== 'frame_pixels') {
        return;
      }

      // 3) Inner payload parse — width / height bounds + base64 shape.
      const fp = FramePixelsSchema.safeParse(env.data.payload);
      if (!fp.success) {
        console.warn('[scene-input] FramePixels payload parse failed', fp.error);
        return;
      }

      // 4) Decode base64 → fresh Uint8ClampedArray (own ArrayBuffer; the
      //    transferable-prerequisite for the Worker handoff in Plan 03 RC-2).
      //    Throws on invalid base64 or length-mismatch → caught by outer try.
      const pixels = decodeFramePixels(fp.data.pixelsB64, fp.data.width, fp.data.height);

      // 4b) Normalize to the canonical 400×200 raster region (ADR-0013
      //     Amendment 1). `raster-worker.ts` REJECTS any other dims, while
      //     FramePixelsSchema admits 20..400 × 20..200 — without this pad an
      //     in-bounds but undersized frame would be silently unprocessable
      //     (debug map-frame-pipeline-dims, 2026-06-10). The module emitter
      //     already letterboxes to exactly 400×200; this is the consumer-side
      //     defence for older module builds and test producers.
      // 4b/5) Mode-specific canonical pad + dispatch.
      if (isMapFrameSink(sink)) {
        // canvas mode routes scene frames to the compositor MapCanvasLayer (z=0)
        // at the FULL-SCREEN 576×288 canonical (layout B). Old modules (≤v0.1.13)
        // emit 400×200 — letterbox-centered inside 576×288 (backward compat).
        const framed = padFrame(
          pixels,
          fp.data.width,
          fp.data.height,
          CANVAS_CANONICAL_W,
          CANVAS_CANONICAL_H,
        );
        if (framed === null) {
          // Unreachable while FramePixelsSchema caps at 576×288 — defensive.
          console.warn('[scene-input] frame larger than canvas canonical — dropped');
          return;
        }
        sink.setFrame(framed, CANVAS_CANONICAL_W, CANVAS_CANONICAL_H);
      } else {
        // Glyph fallback — Plan 03 RasterController is the Worker boundary
        // (exactly 400×200). Full-screen 576×288 frames from module ≥v0.1.14
        // cannot fit and are skipped: glyph map streaming is superseded by
        // canvas mode (default boot since Phase 20).
        const framed = padFrame(
          pixels,
          fp.data.width,
          fp.data.height,
          GLYPH_CANONICAL_W,
          GLYPH_CANONICAL_H,
        );
        if (framed === null) {
          console.warn('[scene-input] full-screen frame on glyph path — dropped (canvas-only)');
          return;
        }
        // Attach a `.catch` so a rejected Promise logs and does not crash the WS listener.
        sink.requestFrame(framed, GLYPH_CANONICAL_W, GLYPH_CANONICAL_H).catch((err) => {
          console.warn('[scene-input] requestFrame rejected', err);
        });
      }
    } catch (err) {
      console.warn('[scene-input] message processing failed', err);
    }
  };

  ws.addEventListener('message', handler as EventListener);
  return () => {
    ws.removeEventListener('message', handler as EventListener);
  };
}
