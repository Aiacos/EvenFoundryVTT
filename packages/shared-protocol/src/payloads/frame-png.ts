/**
 * FramePng Zod schema — the typed payload carried inside the shared
 * `EnvelopeSchema` for the v0.1.15 map-stream raster pipeline.
 *
 * Quick Task 260611-e71 (FRAME-PNG-01) introduces this payload to replace the
 * heavier `frame_pixels` wire format with a greyscale lossless PNG:
 *   Foundry PIXI canvas (canvas-extractor.ts)
 *     → upng-js encode (greyscale-content RGB PNG, ~1-5 KB)
 *     → bridge POST /internal/delta `frame_png` envelope
 *     → g2-app `scene-input.ts` (`EnvelopeSchema.safeParse` + `FramePngSchema.safeParse`)
 *     → UPNG.decode → UPNG.toRGBA8 → `MapFrameSink.setFrame` (same sink as frame_pixels)
 *
 * This module defines ONLY the typed payload (the inner `payload` of the wire
 * envelope) plus the type constant. PNG encoding/decoding is NOT handled here —
 * producers (canvas-extractor.ts) and consumers (scene-input.ts) own the
 * upng-js codec at their own boundaries.
 *
 * **Cross-schema contract**
 *
 * FramePng travels inside `EnvelopeSchema` from `./envelope.ts`:
 * ```ts
 * {
 *   proto: 'evf-v1',
 *   seq: <monotonic>,
 *   ts: <ms epoch>,
 *   type: 'frame_png',
 *   session_id: <uuid v4 from pair registry>,
 *   payload: FramePng,                       // satisfies FramePngSchema
 * }
 * ```
 *
 * Consumers parse the outer envelope via `EnvelopeSchema.safeParse`, narrow on
 * `envelope.type === 'frame_png'`, then parse `envelope.payload` via
 * `FramePngSchema.safeParse` (defense-in-depth two-layer parse).
 *
 * **Bounds** (same as FramePixelsSchema — full-screen layout B 2026-06-10):
 *   - width:  20 ≤ w ≤ 576
 *   - height: 20 ≤ h ≤ 288
 *
 * **Wire-size advantage over frame_pixels**
 *
 * `frame_pixels` carries raw RGBA base64 — a maximum 576×288 RGBA payload
 * (663,552 bytes RGBA) encodes to ≈884 KB on the wire. `frame_png` carries a
 * base64-encoded greyscale lossless PNG produced via:
 *   `UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined, true)`
 * (forbidPlte=true → ctype=2 RGB, exact Rec.601 luma roundtrip).
 * Measured: 576×288 gradient → 1.2 KB; realistic noisy frame → 3.5 KB.
 * This is 100–700× smaller on the wire, materially improving BLE/WS bandwidth
 * and the perceived frame rate on the G2.
 *
 * **Back-compat**
 *
 * `frame_pixels` (FramePixelsSchema) is NOT removed. Modules ≤v0.1.14 still
 * emit `frame_pixels`; g2-app's scene-input.ts handles both types. Only
 * foundry-module v0.1.15+ exclusively emits `frame_png`.
 *
 * @see ./frame.ts (FramePixelsSchema — the predecessor wire format, still exported)
 * @see packages/foundry-module/src/canvas-extractor.ts (encoder — v0.1.15+)
 * @see packages/g2-app/src/scene-input.ts (decoder)
 * @see docs/architecture/0002-protocol-versioning.md (ADR-0002 envelope versioning)
 */
import { z } from 'zod';

/**
 * Wire-format type constant for `frame_png` envelopes.
 *
 * Consumers narrow on `envelope.type === FRAME_PNG_TYPE` before parsing the
 * inner payload via `FramePngSchema`.
 */
export const FRAME_PNG_TYPE = 'frame_png' as const;

/**
 * Typed payload carried inside the `frame_png` `EnvelopeSchema`.
 *
 * Fields:
 *   - `sceneId`  — Foundry scene `_id` of the captured scene (lets the consumer
 *                  discriminate frames across scene transitions).
 *   - `width`    — Frame width in pixels (20–576, inclusive — full-screen raster region, layout B 2026-06-10).
 *   - `height`   — Frame height in pixels (20–288, inclusive — full-screen raster region, layout B 2026-06-10).
 *   - `pngB64`   — Base64-encoded greyscale-content image. Lossless PNG by
 *                  default (`UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined,
 *                  true)` or the browser-native encoder); module v0.1.27+ may
 *                  carry lossy WebP instead when the `mapWebpQuality` world
 *                  setting is > 0 (~4-7× smaller; latency audit 2026-06-11).
 *                  The field name stays `pngB64` for wire back-compat — the
 *                  g2-app native decode path (`createImageBitmap`) sniffs the
 *                  container from the magic bytes, never from this name.
 *                  With PNG, after base64-decode + UPNG.decode + UPNG.toRGBA8
 *                  the R/G/B channels equal the Rec.601 luma of the source
 *                  frame exactly; with WebP the luma is approximate (lossy)
 *                  and the consumer re-quantizes to 16 levels anyway.
 *   - `ts`       — Emitter timestamp (ms since epoch) for staleness checks.
 */
export const FramePngSchema = z.object({
  sceneId: z.string().min(1),
  width: z.number().int().min(20).max(576),
  height: z.number().int().min(20).max(288),
  pngB64: z.string(),
  ts: z.number().int().positive(),
});

/** Static type inferred from {@link FramePngSchema}. */
export type FramePng = z.infer<typeof FramePngSchema>;
