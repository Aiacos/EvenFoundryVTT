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
export const TILE_W = 200;
/** Single tile height (px). */
export const TILE_H = 100;
/** Number of tiles the 400×200 region splits into (2×2, ids 0-3). */
export const TILE_COUNT = 4;
/** Bytes in one contiguous 200×100 RGBA quadrant (the {@link extractQuadrant} output size). */
export const QUADRANT_BYTES = TILE_W * TILE_H * 4;
/** 4-bit greyscale levels. */
const LEVELS = 16;

/** Tile id → source-region offset (matches the hybrid schema 2×2 layout). */
const TILE_LAYOUT: ReadonlyArray<{
  readonly id: number;
  readonly ox: number;
  readonly oy: number;
}> = [
  { id: 0, ox: 0, oy: 0 },
  { id: 1, ox: TILE_W, oy: 0 },
  { id: 2, ox: 0, oy: TILE_H },
  { id: 3, ox: TILE_W, oy: TILE_H },
];

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
 * Copy tile `id`'s 200×100 quadrant out of the 400×200 source region into `out`.
 *
 * `out` (length {@link QUADRANT_BYTES}) is caller-owned + reusable — the showcase
 * delta gate holds ONE scratch quadrant and rewrites it per tile, so the hot path
 * allocates nothing here. Isolating the quadrant into a contiguous buffer lets the
 * caller xxhash the SOURCE pixels of a single tile (delta-gate BEFORE the dither +
 * `UPNG.encode` cost — the {@link ./showcase-hud-layer.ts} counterpart of
 * `engine/hud-delta-driver.ts` `splitFrameIntoTiles`/`_hashSourceTile`).
 *
 * `out` is zero-filled first so an out-of-bounds source read (undersized `src`)
 * lands as 0 — byte-for-byte the `?? 0` fallback the in-place {@link encodeQuadrant}
 * applies, keeping {@link encodeRegionToTiles} output identical for short buffers.
 *
 * @param src The full 400×200 RGBA source buffer.
 * @param id  Tile id (0-3); an unknown id leaves `out` all-zero.
 * @param out Reusable destination, length {@link QUADRANT_BYTES} (200×100×4).
 */
export function extractQuadrant(src: Uint8ClampedArray, id: number, out: Uint8ClampedArray): void {
  out.fill(0);
  const layout = TILE_LAYOUT[id];
  if (layout === undefined) return;
  const { ox, oy } = layout;
  const rowBytes = TILE_W * 4;
  for (let ty = 0; ty < TILE_H; ty++) {
    const sStart = ((oy + ty) * REGION_W + ox) * 4;
    // subarray clamps to src length; a short src copies fewer bytes, the pre-fill
    // leaves the remainder 0 (matches the pre-refactor `src[si] ?? 0` semantics).
    out.set(src.subarray(sStart, sStart + rowBytes), ty * rowBytes);
  }
}

/**
 * Bayer-dither one contiguous 200×100 RGBA quadrant and UPNG-encode it to 4-bit PNG.
 *
 * Reads local `(ty, tx)` — the Bayer threshold depends only on the in-tile position,
 * so a quadrant extracted by {@link extractQuadrant} yields a PNG byte-identical to
 * the pre-refactor whole-region `encodeTile(src, ox, oy)` for the same pixels.
 *
 * @param quad Contiguous 200×100 RGBA quadrant ({@link extractQuadrant} output).
 * @returns 4-bit indexed PNG bytes for the tile (200×100).
 */
function encodeQuadrantBytes(quad: Uint8ClampedArray): Uint8Array {
  const rgba = new Uint8ClampedArray(QUADRANT_BYTES);
  for (let ty = 0; ty < TILE_H; ty++) {
    for (let tx = 0; tx < TILE_W; tx++) {
      const si = (ty * TILE_W + tx) * 4;
      const y = luma(quad[si] ?? 0, quad[si + 1] ?? 0, quad[si + 2] ?? 0);
      const threshold = BAYER_4X4[(ty & 3) * 4 + (tx & 3)] ?? 0;
      const level = Math.max(
        0,
        Math.min(LEVELS - 1, Math.round((y / 255) * (LEVELS - 1) + threshold)),
      );
      const g = Math.round((level / (LEVELS - 1)) * 255);
      rgba[si] = g;
      rgba[si + 1] = g;
      rgba[si + 2] = g;
      rgba[si + 3] = 255;
    }
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], TILE_W, TILE_H, LEVELS));
}

/**
 * Dither + encode one contiguous 200×100 quadrant into a {@link RasterTile}.
 *
 * The delta-gated encode seam: {@link ./showcase-hud-layer.ts} calls this ONLY for
 * tiles whose source quadrant hash changed, so unchanged tiles never pay the dither
 * + PNG cost. Determinism holds — identical `quad` → byte-identical `pngBytes`.
 *
 * @param quad Contiguous 200×100 RGBA quadrant ({@link extractQuadrant} output).
 * @param id   Tile id (0-3) → `containerID` + `hybrid-map-tile-{id}` name.
 */
export function encodeQuadrant(quad: Uint8ClampedArray, id: number): RasterTile {
  return {
    containerID: id,
    containerName: `hybrid-map-tile-${id}`,
    pngBytes: encodeQuadrantBytes(quad),
  };
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
 * Encodes ALL 4 tiles unconditionally — the non-delta-gated full-region path used by
 * the dev preview harnesses. The production {@link ./showcase-hud-layer.ts} instead
 * gates per-tile via {@link extractQuadrant} + {@link encodeQuadrant} so an unchanged
 * tile is never re-encoded; both paths emit byte-identical PNGs for the same pixels.
 *
 * @param src The full 400×200 RGBA pixel buffer (`ctx.getImageData(...).data`).
 * @returns Exactly 4 tiles in id order (0-3), each a non-empty PNG.
 */
export function encodeRegionToTiles(src: Uint8ClampedArray): RasterTile[] {
  const quad = new Uint8ClampedArray(QUADRANT_BYTES);
  return TILE_LAYOUT.map(({ id }) => {
    extractQuadrant(src, id, quad);
    return encodeQuadrant(quad, id);
  });
}
