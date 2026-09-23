/**
 * Narrow ambient types for the `upng-js@2.1.0` decoder used by `sim-lib.ts` (the package
 * ships no `.d.ts`). The app-side encoder surface is declared in `src/hud/zones/upng-js.d.ts`.
 *
 * @see https://github.com/photopea/UPNG.js (README: `decode`, `toRGBA8`, `encode`)
 */
declare module 'upng-js' {
  interface DecodedPng {
    width: number;
    height: number;
  }
  const UPNG: {
    /** Parses a PNG byte stream. */
    decode(buffer: ArrayBuffer): DecodedPng;
    /** Expands every frame to 8-bit RGBA. */
    toRGBA8(image: DecodedPng): ArrayBuffer[];
    /** Encodes RGBA frames (`cnum` 0 = lossless) — used by the tests to build screenshots. */
    encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
  };
  export default UPNG;
}
