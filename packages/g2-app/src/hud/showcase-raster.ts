/**
 * Showcase HUD raster encoder (PRODUCTION).
 *
 * Takes a composited 400×200 greyscale canvas (the full showcase HUD drawn by
 * {@link ./showcase-hud-renderer.ts}) and produces the 4 × 200×100 Bayer-dithered
 * 4-bit PNG tiles that the hybrid map region expects (`hybrid-map-tile-0..3`,
 * ids 0-3). This is the same dither + split + `UPNG.encode` pipeline the runtime
 * map path uses, applied to one composited image so map + framed chrome + status
 * card land on the glasses as a single crisp raster HUD.
 *
 * Deterministic: identical input RGBA yields byte-identical PNG tiles (ordered
 * Bayer dither, no randomness), so a rendered frame can be delta-hashed upstream.
 *
 * @see packages/g2-app/src/hud/showcase-hud-renderer.ts (draws the source canvas)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (the runtime map-frame equivalent)
 */

import * as UPNG from 'upng-js';

/** Hybrid raster region width (px). */
export const REGION_W = 400;
/** Hybrid raster region height (px). */
export const REGION_H = 200;
/** Single tile width (px). */
const TILE_W = 200;
/** Single tile height (px). */
const TILE_H = 100;
/** 4-bit greyscale levels. */
const LEVELS = 16;

/** Ordered 4×4 Bayer matrix (normalised to ±0.5). */
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

/** An encoded tile ready for `bridge.updateImageRawData`. */
export interface RasterTile {
  /** Numeric host container id (0-3) — matches the hybrid schema. */
  readonly containerID: number;
  /** Container name in the hybrid schema (`hybrid-map-tile-{id}`). */
  readonly containerName: string;
  /** 4-bit indexed PNG bytes (200×100). */
  readonly pngBytes: Uint8Array;
}

/** Rec.601 luma from an RGBA source pixel. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Bayer-dither one 200×100 tile out of the 400×200 source RGBA and UPNG-encode it.
 *
 * @param src The full 400×200 RGBA pixel buffer.
 * @param ox  Tile x offset in the source (0 or 200).
 * @param oy  Tile y offset in the source (0 or 100).
 * @returns 4-bit indexed PNG bytes for the tile.
 */
function encodeTile(src: Uint8ClampedArray, ox: number, oy: number): Uint8Array {
  const rgba = new Uint8ClampedArray(TILE_W * TILE_H * 4);
  for (let ty = 0; ty < TILE_H; ty++) {
    for (let tx = 0; tx < TILE_W; tx++) {
      const si = ((oy + ty) * REGION_W + (ox + tx)) * 4;
      const y = luma(src[si] ?? 0, src[si + 1] ?? 0, src[si + 2] ?? 0);
      const threshold = BAYER_4X4[(ty & 3) * 4 + (tx & 3)] ?? 0;
      const level = Math.max(
        0,
        Math.min(LEVELS - 1, Math.round((y / 255) * (LEVELS - 1) + threshold)),
      );
      const g = Math.round((level / (LEVELS - 1)) * 255);
      const di = (ty * TILE_W + tx) * 4;
      rgba[di] = g;
      rgba[di + 1] = g;
      rgba[di + 2] = g;
      rgba[di + 3] = 255;
    }
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], TILE_W, TILE_H, LEVELS));
}

/**
 * Split + dither + encode a 400×200 RGBA buffer into the 4 hybrid map tiles.
 *
 * Tile → container id mapping matches the hybrid schema:
 * ```
 *   id0 (0,0)   id1 (200,0)
 *   id2 (0,100) id3 (200,100)
 * ```
 *
 * @param src The full 400×200 RGBA pixel buffer (`ctx.getImageData(...).data`).
 * @returns Exactly 4 tiles in id order (0-3), each a non-empty PNG.
 */
export function encodeRegionToTiles(src: Uint8ClampedArray): RasterTile[] {
  const layout: Array<{ id: number; ox: number; oy: number }> = [
    { id: 0, ox: 0, oy: 0 },
    { id: 1, ox: TILE_W, oy: 0 },
    { id: 2, ox: 0, oy: TILE_H },
    { id: 3, ox: TILE_W, oy: TILE_H },
  ];
  return layout.map(({ id, ox, oy }) => ({
    containerID: id,
    containerName: `hybrid-map-tile-${id}`,
    pngBytes: encodeTile(src, ox, oy),
  }));
}
