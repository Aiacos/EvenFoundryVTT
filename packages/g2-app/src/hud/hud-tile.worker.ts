/**
 * hud-tile.worker.ts — off-main-thread HUD tile builder (layout B perf lever).
 *
 * Receives the composited full-screen 576×288 RGBA buffer (transferred, zero
 * copy), slices it into the 4 × 288×144 tiles, Bayer-dithers each to the
 * 16-step greyscale palette and encodes a 4-bit indexed PNG per tile.
 *
 * Replicates `hud-raster-frame.ts` MINIMALLY (same convention as that file's
 * own replication from `raster-worker.ts` — Worker modules cannot be imported
 * by main-thread modules without bundler coupling; geometry constants are
 * duplicated by design and guarded by the main-thread tests).
 *
 * Protocol: `{ seq, rgba: ArrayBuffer }` → `{ seq, tiles: [{ id, name, bytes }] }`.
 * Errors respond `{ seq, error }` — the client falls back to the synchronous
 * main-thread path for that cycle.
 *
 * @see packages/g2-app/src/hud/hud-tile-worker-client.ts (request/response client)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (synchronous twin — fallback path)
 */

import UPNG from 'upng-js';

const FRAME_W = 576;
const FRAME_H = 288;
const TILE_W = 288;
const TILE_H = 144;
const TILE_NAMES = ['hud-tile-0', 'hud-tile-1', 'hud-tile-2', 'hud-tile-3'] as const;

/** 4×4 Bayer matrix normalized to ±0.5 (twin of hud-raster-frame.ts BAYER_4X4). */
const BAYER_4X4: ReadonlyArray<number> = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16 - 0.5,
);

/** Bayer ordered-dither one tile to 16 grey levels (twin of hud-raster-frame.ts). */
function ditherTile(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < TILE_H; y++) {
    const rowT = (y & 3) << 2;
    for (let x = 0; x < TILE_W; x++) {
      const i = (y * TILE_W + x) * 4;
      const luma =
        0.2126 * (rgba[i] ?? 0) + 0.7152 * (rgba[i + 1] ?? 0) + 0.0722 * (rgba[i + 2] ?? 0);
      let level = Math.floor((luma / 255) * 15 + 0.5 + (BAYER_4X4[rowT | (x & 3)] ?? 0));
      if (level < 0) level = 0;
      else if (level > 15) level = 15;
      const v = Math.round((level * 255) / 15);
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}

self.onmessage = (ev: MessageEvent): void => {
  const { seq, rgba } = ev.data as { seq: number; rgba: ArrayBuffer };
  try {
    const frame = new Uint8ClampedArray(rgba);
    if (frame.length !== FRAME_W * FRAME_H * 4) {
      throw new Error(`bad frame length ${frame.length}`);
    }
    const tiles: Array<{ id: number; name: string; bytes: Uint8Array }> = [];
    const transfers: Transferable[] = [];
    for (let t = 0; t < 4; t++) {
      const tx = t % 2;
      const ty = t >> 1;
      const tile = new Uint8ClampedArray(TILE_W * TILE_H * 4);
      for (let y = 0; y < TILE_H; y++) {
        const src = ((ty * TILE_H + y) * FRAME_W + tx * TILE_W) * 4;
        tile.set(frame.subarray(src, src + TILE_W * 4), y * TILE_W * 4);
      }
      const dithered = ditherTile(tile);
      const png = UPNG.encode([dithered.buffer], TILE_W, TILE_H, 16);
      const bytes = new Uint8Array(png);
      tiles.push({ id: t, name: TILE_NAMES[t] ?? `hud-tile-${t}`, bytes });
      transfers.push(bytes.buffer);
    }
    (self as unknown as Worker).postMessage({ seq, tiles }, transfers);
  } catch (err) {
    (self as unknown as Worker).postMessage({ seq, error: String(err) });
  }
};
