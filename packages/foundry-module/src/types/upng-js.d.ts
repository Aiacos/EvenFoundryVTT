/**
 * Ambient type declarations for `upng-js@2.1.0`.
 *
 * The package ships no `.d.ts` and no `@types/upng-js`. We hand-declare the
 * surface used by the foundry-module raster pipeline (encoder + decoder for
 * tests and roundtrip verification).
 *
 * **Verified surface** (empirically against upng-js@2.1.0, 2026-06-11):
 * Exported members: `encode`, `decode`, `toRGBA8`, `quantize`.
 * `encodeLL` does NOT exist — do not use it.
 *
 * **Verified encode recipe** (FRAME-PNG-01 CRITICAL API CORRECTION):
 * The correct call for a greyscale-content lossless PNG that roundtrips exactly
 * and stays small is:
 *   `UPNG.encode([rgba.buffer], w, h, 0, undefined, true)`
 * where the 6th argument `forbidPlte=true` forces ctype=2 RGB output. The
 * palette path (`forbidPlte=false`, default) produces ctype=3 whose
 * `UPNG.toRGBA8` crashes under Node (photopea PLTE/tRNS indexing bug).
 *
 * @see g2-app/src/types/upng-js.d.ts (g2-app declarations — subset; this file
 *   extends it with decode + toRGBA8 + the 6th forbidPlte arg on encode)
 * @see https://github.com/photopea/UPNG.js (upstream README)
 */
declare module 'upng-js' {
  /**
   * Encode one or more RGBA frame buffers as a PNG (or APNG) byte stream.
   *
   * @param imgs       Array of RGBA pixel buffers — one per frame.
   * @param w          Image width in pixels.
   * @param h          Image height in pixels.
   * @param cnum       Palette size (0 = lossless; 16 = 4-bit indexed; 256 = 8-bit).
   *                   Pass 0 with `forbidPlte=true` for lossless ctype=2 RGB output.
   * @param dels       Optional per-frame delays in milliseconds. Pass `undefined` for
   *                   single-frame PNGs.
   * @param forbidPlte When `true`, forces ctype=2 RGB output (lossless, exact roundtrip,
   *                   works with `toRGBA8` under Node). When omitted or `false`, the
   *                   encoder may produce a palette PNG (ctype=3) whose `toRGBA8`
   *                   crashes under Node — DO NOT omit this argument.
   * @returns PNG byte stream as ArrayBuffer.
   */
  export function encode(
    imgs: ReadonlyArray<ArrayBuffer>,
    w: number,
    h: number,
    cnum: number,
    dels?: ReadonlyArray<number>,
    forbidPlte?: boolean,
  ): ArrayBuffer;

  /**
   * Decode a PNG ArrayBuffer into an UPNG image object.
   *
   * @param buf - PNG byte stream as ArrayBuffer.
   * @returns UPNG image object (use `toRGBA8` to extract RGBA frame data).
   */
  export function decode(buf: ArrayBuffer): unknown;

  /**
   * Extract RGBA frame data from a decoded UPNG image.
   *
   * @param img - Decoded image returned by {@link decode}.
   * @returns Array of RGBA ArrayBuffers, one per frame.
   */
  export function toRGBA8(img: unknown): ArrayBuffer[];
}
