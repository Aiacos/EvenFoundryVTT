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
 * Attach a `frame_pixels` envelope receiver to a WebSocket.
 *
 * Registers a `ws.addEventListener('message', handler)`; the handler
 * defense-in-depth-parses each incoming envelope and dispatches valid
 * `frame_pixels` payloads to `controller.requestFrame`. Returns an
 * unsubscribe closure that calls `ws.removeEventListener('message', handler)`.
 *
 * @param ws         - Native WebSocket (or test-compatible mock with the
 *                     `addEventListener`/`removeEventListener` surface)
 * @param controller - Raster controller (only `requestFrame` is invoked)
 * @returns Unsubscribe function (idempotent)
 */
export function attachSceneInputToWs(
  ws: WebSocket,
  controller: RasterControllerLike,
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

      // 5) Dispatch fire-and-forget — Plan 03 RasterController is the Worker
      //    boundary. Attach a `.catch` so a rejected Promise logs and does
      //    not crash the WS listener.
      controller.requestFrame(pixels, fp.data.width, fp.data.height).catch((err) => {
        console.warn('[scene-input] requestFrame rejected', err);
      });
    } catch (err) {
      console.warn('[scene-input] message processing failed', err);
    }
  };

  ws.addEventListener('message', handler as EventListener);
  return () => {
    ws.removeEventListener('message', handler as EventListener);
  };
}
