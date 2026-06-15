/**
 * FramePixels Zod schema + base64 helpers — the typed payload carried inside the
 * shared `EnvelopeSchema` for the raster pipeline data-source ingress.
 *
 * Plan 4a-06 (B-5 closure) introduces this payload to wire the previously-missing
 * raster-pipeline input chain:
 *   Foundry PIXI canvas (canvas-extractor.ts)
 *     → bridge WS `frame_pixels` envelope
 *     → g2-app `scene-input.ts` (`EnvelopeSchema.safeParse` + `FramePixelsSchema.safeParse`)
 *     → `RasterController.requestFrame(pixelData, width, height)` (Plan 03 sink)
 *
 * This module defines ONLY the typed payload (the inner `payload` of the wire
 * envelope) plus base64 helpers for transport. Plan 06 does NOT define a new
 * envelope schema — the outer wrapper is the existing `EnvelopeSchema` from
 * `./envelope.ts`. The full NF-1 closure contract (real export name, carrier
 * field name, required `session_id` UUID v4) lives in 04A-PLAN-CHECK.md §NF-1;
 * the canonical schema definition is in `./envelope.ts`.
 *
 * **Cross-schema contract**
 *
 * FramePixels travels inside `EnvelopeSchema` from `./envelope.ts`:
 * ```ts
 * {
 *   proto: 'evf-v1',
 *   seq: <monotonic>,
 *   ts: <ms epoch>,
 *   type: 'frame_pixels',
 *   session_id: <uuid v4 from pair registry>,
 *   payload: FramePixels,                      // satisfies FramePixelsSchema
 * }
 * ```
 *
 * Consumers parse the outer envelope via `EnvelopeSchema.safeParse`, narrow on
 * `envelope.type === 'frame_pixels'`, then parse `envelope.payload` via
 * `FramePixelsSchema.safeParse` (defense-in-depth two-layer parse — T-4a-06-02).
 *
 * **Bounds** (ADR-0013 Amendment 1 canonical raster region — INV-2 re-verified
 * 2026-06-05 against `hub.evenrealities.com/docs/guides/display`):
 *   - width:  20 ≤ w ≤ 576   (4 image tiles of 288×144, 2×2 → 576×288 FULL SCREEN —
 *     SDK verbatim limits: image container 20–288 × 20–144, INV-2 re-verified 2026-06-10)
 *   - height: 20 ≤ h ≤ 288
 *
 * **Schema bound vs. worker tile layout — not the same thing**
 *
 * The SCHEMA permits the full G2 raster region: 20–576 wide × 20–288 high. That
 * is the wire contract — any producer may send a frame anywhere in that range
 * and it validates. The legacy `raster-worker.ts` resizes / normalizes the
 * incoming frame internally to its own 400×200 tile layout; that 400×200 figure
 * is the worker's INTERNAL working size, NOT a wire bound, and callers never
 * need to pre-size to it.
 *
 * History: the original Plan 4a-06 bounds were 288×144 (OQ-INV2-4 SDK polyfill
 * typedefs, STATE.md 2026-05-14). The Phase 19 geometry correction (ADR-0013
 * Amendment 1) widened the region to full-screen and the schema bound moved up
 * to 576×288 so a canonical full-region frame is expressible on the wire (debug
 * `map-frame-pipeline-dims`, 2026-06-10; the old 288→144 cap made full-screen
 * frames un-expressible). The 400×200 internal worker layout predates that
 * widening and is unrelated to the wire bound documented here.
 *
 * **Wire-size note**
 *
 * Base64 doubles wire size; a maximum 288×144 RGBA payload (165,888 bytes)
 * encodes to ≈221 KB. Plan 03 sub-tile delta encoding sends only changed tiles,
 * so per-frame wire cost is typically much smaller. A future optimisation could
 * use binary WebSocket frames (`ArrayBuffer` instead of base64), which would
 * halve the per-frame payload at the cost of breaking JSON envelope uniformity
 * (deferred to Phase 13 per 04a-CONTEXT.md §Deferred).
 *
 * @see docs/architecture/0002-protocol-versioning.md (ADR-0002 envelope versioning)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-5 + §NF-1
 * @see ./envelope.ts (the real `EnvelopeSchema` — outer wire envelope)
 */
import { z } from 'zod';

// ─── Dual-environment globals (Node Buffer / browser btoa+atob) ──────────────
//
// `@evf/shared-protocol` runs in both Node-shaped hosts (Foundry's Electron
// desktop runtime, the bridge) AND browser-shaped hosts (g2-app in the Even
// Realities App WebView). Its tsconfig declares no ambient `lib` types beyond
// `ES2023`, so we type the narrow surface we touch via a local cast over
// `globalThis` and feature-detect at runtime. This keeps the package
// dependency-free apart from `zod` (per Phase 1 D-1.04) while still letting us
// roundtrip base64 uniformly across both runtime shapes.

interface BufferLike {
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
  toString(encoding: string): string;
}

interface BufferCtorLike {
  from(input: ArrayBuffer | ArrayBufferLike | string, encoding?: string): BufferLike;
  from(input: ArrayBuffer | ArrayBufferLike, byteOffset: number, byteLength: number): BufferLike;
}

interface FrameGlobals {
  readonly Buffer?: BufferCtorLike;
  readonly btoa?: (s: string) => string;
  readonly atob?: (s: string) => string;
}

const FRAME_GLOBALS: FrameGlobals = globalThis as unknown as FrameGlobals;

/**
 * Typed payload carried inside the `frame_pixels` `EnvelopeSchema`.
 *
 * Fields:
 *   - `sceneId`   — Foundry scene `_id` of the captured scene (lets the consumer
 *                   discriminate frames across scene transitions).
 *   - `width`     — Frame width in pixels (20–576, inclusive — full-screen raster region, layout B 2026-06-10).
 *   - `height`    — Frame height in pixels (20–288, inclusive — full-screen raster region, layout B 2026-06-10).
 *   - `pixelsB64` — Base64-encoded RGBA byte array. After decode, length MUST
 *                   equal `width × height × 4` (enforced at decode time by
 *                   `decodeFramePixels`). Encoding is JSON-uniform; binary
 *                   transport is a Phase 13 stretch.
 *   - `ts`        — Emitter timestamp (ms since epoch) for staleness checks.
 */
export const FramePixelsSchema = z.object({
  sceneId: z.string().min(1),
  width: z.number().int().min(20).max(576),
  height: z.number().int().min(20).max(288),
  pixelsB64: z.string(),
  ts: z.number().int().positive(),
});

/** Static type inferred from {@link FramePixelsSchema}. */
export type FramePixels = z.infer<typeof FramePixelsSchema>;

// ─── Base64 helpers — dual-environment (Node Buffer / browser btoa+atob) ──────

/**
 * Base64-encode an RGBA byte array for transport inside the `pixelsB64` field
 * of a {@link FramePixels} payload.
 *
 * Dual-environment implementation:
 *   - On Node-like hosts (Foundry's Electron-based desktop runtime, the bridge)
 *     uses `Buffer.from(bytes).toString('base64')` for native-speed encoding.
 *   - On the browser side (g2-app inside the Even Realities App WebView) falls
 *     back to a chunked `btoa(String.fromCharCode(...))` path. The chunked form
 *     avoids the call-stack overflow that `String.fromCharCode(...largeArray)`
 *     can trigger on 165 KB inputs in older WebKit builds.
 *
 * Producers populate `sceneId`/`width`/`height`/`ts` separately on the same
 * envelope; this helper covers only the pixels-array encoding.
 *
 * @param pixels - RGBA byte array (length = width × height × 4)
 * @returns Base64 string suitable for the `pixelsB64` field
 */
export function encodeFramePixels(pixels: Uint8ClampedArray | Uint8Array): string {
  const BufferCtor = FRAME_GLOBALS.Buffer;
  if (BufferCtor !== undefined) {
    return BufferCtor.from(pixels.buffer, pixels.byteOffset, pixels.byteLength).toString('base64');
  }
  const btoaFn = FRAME_GLOBALS.btoa;
  if (btoaFn === undefined) {
    throw new Error('FramePixels encode: no Buffer or btoa available in this environment');
  }
  // Browser fallback: chunk by 0x8000 bytes to keep the apply-spread inside
  // call-stack limits on WebKit builds (the WebView host platform).
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < pixels.length; i += CHUNK) {
    const slice = pixels.subarray(i, Math.min(i + CHUNK, pixels.length));
    // String.fromCharCode.apply accepts an array-like; cast is necessary because
    // Uint8ClampedArray / Uint8Array are not assignable to readonly number[].
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoaFn(binary);
}

/**
 * Decode a `pixelsB64` field back into a `Uint8ClampedArray` RGBA byte array.
 *
 * Performs two validations beyond raw base64 decoding:
 *   1. **Invalid base64** — throws `FramePixels decode: invalid base64 — <cause>`
 *      when the input contains characters outside the RFC 4648 alphabet or is
 *      otherwise unparsable.
 *   2. **Length mismatch** — throws
 *      `FramePixels decode: length mismatch — expected <w>×<h>×4 bytes, got <n>`
 *      when the decoded byte count is not exactly `width × height × 4`.
 *      Defense-in-depth against a producer/consumer width/height drift
 *      (T-4a-06-02 mitigation).
 *
 * The returned `Uint8ClampedArray` owns its underlying `ArrayBuffer` (own
 * buffer, `byteOffset === 0`, `byteLength === buffer.byteLength`) so callers
 * can pass it directly to a `postMessage(msg, [buffer])` zero-copy transfer
 * (this is the prerequisite that Plan 06 SI-7 verifies; the actual Worker
 * transfer is Plan 03 `RasterController` RC-2's responsibility).
 *
 * @param b64    - Base64-encoded RGBA byte array
 * @param width  - Expected frame width in pixels
 * @param height - Expected frame height in pixels
 * @returns Fresh `Uint8ClampedArray` of length `width × height × 4`
 * @throws Error('FramePixels decode: invalid base64 — …') on decode failure
 * @throws Error('FramePixels decode: length mismatch — …') on size mismatch
 */
export function decodeFramePixels(b64: string, width: number, height: number): Uint8ClampedArray {
  const expectedLen = width * height * 4;

  let bytes: Uint8Array;
  try {
    const BufferCtor = FRAME_GLOBALS.Buffer;
    if (BufferCtor !== undefined) {
      // Node-style decode is defensive against the silent-strip behaviour where
      // `Buffer.from('***', 'base64')` returns an empty buffer instead of
      // throwing. Pre-validate against the RFC 4648 alphabet (+ `=` padding) so
      // any non-conforming character explicitly errors.
      const stripped = b64.replace(/=+$/, '');
      if (b64.length > 0 && !/^[A-Za-z0-9+/]*$/.test(stripped)) {
        throw new Error('contains non-base64 characters');
      }
      const buf = BufferCtor.from(b64, 'base64');
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      const atobFn = FRAME_GLOBALS.atob;
      if (atobFn === undefined) {
        throw new Error('no Buffer or atob available in this environment');
      }
      // Browser path: atob throws DOMException on invalid input.
      const binary = atobFn(b64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        // biome-ignore lint/style/noNonNullAssertion: bounded loop, idx in range
        bytes[i] = binary.charCodeAt(i)!;
      }
    }
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`FramePixels decode: invalid base64 — ${cause}`);
  }

  if (bytes.length !== expectedLen) {
    throw new Error(
      `FramePixels decode: length mismatch — expected ${width}×${height}×4 = ${expectedLen} bytes, got ${bytes.length}`,
    );
  }

  // Copy into a fresh, contiguous ArrayBuffer so the caller can transfer it to
  // a Worker (`postMessage(msg, [buffer])`). The Buffer-backed Uint8Array above
  // may be a slice over a pooled ArrayBuffer with non-zero byteOffset; making a
  // dedicated allocation here keeps the transferable-prerequisite invariant
  // (SI-7) trivially true.
  const owned = new Uint8ClampedArray(expectedLen);
  owned.set(bytes);
  return owned;
}
