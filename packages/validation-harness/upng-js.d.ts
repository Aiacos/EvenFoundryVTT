// Ambient module declaration for upng-js@2.1.0 — package ships no .d.ts in this version.
// CLAUDE.md §11.5.7 pins upng-js@2.1.0; @types/upng-js does not exist on npm (verified 2026-05-10).
// encodeLL signature confirmed via UPNG.js source: encodeLL(buffers, w, h, channels, depthChannels, depth)

declare module 'upng-js' {
  const UPNG: {
    encodeLL: (
      buffers: ArrayBuffer[],
      w: number,
      h: number,
      channels: number,
      depthChannels: number,
      depth: number,
    ) => ArrayBuffer;
  };
  export default UPNG;
}
