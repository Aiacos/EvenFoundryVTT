/**
 * Ambient type declarations for `upng-js@2.1.0`.
 *
 * Mirrors the declaration in packages/g2-app/src/types/upng-js.d.ts.
 * The package ships no `.d.ts` and no `@types/upng-js`.
 *
 * @see packages/g2-app/src/types/upng-js.d.ts (canonical declaration source)
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 2 (bridge portrait renderer)
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
}
