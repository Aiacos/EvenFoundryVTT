/**
 * Ambient type declarations for `upng-js@2.1.0`.
 *
 * The package ships no `.d.ts` and no `@types/upng-js`. We hand-declare the
 * narrow surface the HUD image zones use (`hud/zones/png.ts` encodes; `decode` /
 * `toRGBA8` are used only by the lossless round-trip test). Signatures mirror the
 * JSDoc-equivalent contract in the upstream README:
 *
 *   UPNG.encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, [dels: number[]]): ArrayBuffer
 *
 * - `imgs`: array of RGBA pixel buffers (8 bits per channel).
 * - `w`, `h`: image dimensions.
 * - `cnum`: number of palette colors; 0 = lossless (an exact palette is still built for
 *   ≤ 256 colours — see `png.ts` for how zones stay at 4-bit depth).
 * - `dels`: optional per-frame delays (ignored for single-frame PNGs).
 *
 * @see https://github.com/photopea/UPNG.js (upstream README)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Pattern 2 (raster pipeline)
 */
declare module 'upng-js' {
  /**
   * Encode one or more RGBA frame buffers as a PNG (or APNG) byte stream.
   *
   * @param imgs   Array of RGBA pixel buffers — one per frame.
   * @param w      Image width in pixels.
   * @param h      Image height in pixels.
   * @param cnum   Palette size (0 = lossless; 16 = 4-bit indexed; 256 = 8-bit).
   * @param dels   Optional per-frame delays in milliseconds.
   * @returns      PNG byte stream as ArrayBuffer.
   */
  export function encode(
    imgs: ReadonlyArray<ArrayBuffer>,
    w: number,
    h: number,
    cnum: number,
    dels?: ReadonlyArray<number>,
  ): ArrayBuffer;

  /** Decoded PNG header fields used by the round-trip test. */
  export interface DecodedPng {
    width: number;
    height: number;
    depth: number;
  }

  /** Parses a PNG byte stream. */
  export function decode(buffer: ArrayBuffer): DecodedPng;

  /** Expands every frame to 8-bit RGBA. */
  export function toRGBA8(image: DecodedPng): ArrayBuffer[];
}
