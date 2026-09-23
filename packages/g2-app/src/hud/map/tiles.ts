/**
 * Map tiling, change detection and PNG encoding for the two 192×144 image
 * containers of column B.
 *
 * Hash choice: 32-bit FNV-1a in plain JS instead of `xxhash-wasm`. At the design
 * budget (≤ 1 map frame/s, 2 × 27 648 bytes) FNV-1a costs well under 1 ms, needs no
 * async WASM instantiation (so the render path stays synchronous and testable) and
 * adds nothing to the bundle. Collisions only cost a skipped repaint until the next
 * change.
 *
 * Encoding: 4-bit indexed PNG via `upng-js` (reused from the former raster pipeline,
 * ADR-0006) — the Even Hub host accepts encoded images for `updateImageRawData` and
 * converts them to grey-4.
 */
import * as UPNG from 'upng-js';
import { MAP_TILE_H, MAP_TILE_W } from '../layout.js';
import { MAP_H, MAP_W } from './pixel-map.js';

const TILE_BYTES = MAP_TILE_W * MAP_TILE_H;

/**
 * Splits the 192×288 map into the top and bottom 192×144 tiles (copies).
 *
 * @throws Error when `pixels` is not 192×288.
 */
export function splitTiles(pixels: Uint8Array): [Uint8Array, Uint8Array] {
  if (pixels.length !== MAP_W * MAP_H) {
    throw new Error(`splitTiles: expected ${MAP_W * MAP_H} pixels, got ${pixels.length}`);
  }
  return [pixels.slice(0, TILE_BYTES), pixels.slice(TILE_BYTES)];
}

/** 32-bit FNV-1a hash of a tile. */
export function hashTile(tile: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < tile.length; i++) {
    h ^= tile[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Encodes a 192×144 grey-4 tile as an indexed PNG (≤ 16 greys → ≤ 4-bit depth).
 *
 * @param tile - 27 648 grey levels 0–15.
 * @returns PNG bytes.
 */
export function encodeTilePng(tile: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(tile.length * 4);
  for (let i = 0; i < tile.length; i++) {
    const v = (tile[i] ?? 0) * 17;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], MAP_TILE_W, MAP_TILE_H, 16));
}
