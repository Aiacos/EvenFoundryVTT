/**
 * Ambient type declarations for `upng-js@2.1.0`.
 *
 * The package ships no `.d.ts` and no `@types/upng-js`. We hand-declare the
 * narrow surface the raster pipeline uses (the encoder; the decoder is not
 * consumed in g2-app code). Signature mirrors the JSDoc-equivalent contract
 * in the upstream README:
 *
 *   UPNG.encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, [dels: number[]]): ArrayBuffer
 *
 * - `imgs`: array of RGBA pixel buffers (8 bits per channel).
 * - `w`, `h`: image dimensions.
 * - `cnum`: number of palette colors (16 → 4-bit indexed PNG, which is the
 *   G2 wire shape per Specs §3.1).
 * - `dels`: optional per-frame delays (ignored for single-frame PNGs).
 *
 * @see https://github.com/photopea/UPNG.js (upstream README)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Pattern 2 (raster pipeline)
 */
declare module 'upng-js' {
  /**
   * Encode one or more RGBA frame buffers as a PNG (or APNG) byte stream.
   *
   * @param imgs       Array of RGBA pixel buffers — one per frame.
   * @param w          Image width in pixels.
   * @param h          Image height in pixels.
   * @param cnum       Palette size (0 = lossless; 16 = 4-bit indexed; 256 = 8-bit).
   * @param dels       Optional per-frame delays in milliseconds.
   * @param forbidPlte When true, force ctype=2 RGB output (lossless, exact roundtrip via
   *                   toRGBA8; the palette path crashes toRGBA8 under Node).
   * @returns          PNG byte stream as ArrayBuffer.
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
   * Decode a PNG byte stream into an image descriptor.
   *
   * The returned value is opaque — pass it to {@link toRGBA8} to get pixel data.
   *
   * @param buf  PNG byte stream as ArrayBuffer.
   * @returns    Decoded image descriptor (pass to toRGBA8).
   */
  export function decode(buf: ArrayBuffer): unknown;

  /**
   * Convert a decoded image descriptor to an array of RGBA8 frame buffers.
   *
   * For a single-frame PNG, `toRGBA8(img)[0]` contains one ArrayBuffer of
   * `width * height * 4` bytes (R, G, B, A interleaved, 8 bits per channel).
   *
   * @param img  Decoded image descriptor from {@link decode}.
   * @returns    Array of RGBA8 ArrayBuffers — one per animation frame.
   */
  export function toRGBA8(img: unknown): ArrayBuffer[];
}
