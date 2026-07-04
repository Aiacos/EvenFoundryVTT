/**
 * Mock map generator for the hybrid-HUD preview harness (dev-only).
 *
 * Produces a synthetic "dungeon" scene rasterised to the exact hybrid map region
 * geometry (400×200, split into 4 × 200×100 tiles) so the preview page can show a
 * realistic 4-bit greyscale map on the glasses WITHOUT a live Foundry/bridge WS
 * connection. This is the same tile geometry the RasterController pushes at
 * runtime (`hybrid-map-tile-0..3`, ids 0-3) — see container-registry.ts.
 *
 * NOT shipped in the production bundle: only imported by `src/demo/*` which is a
 * dev-server preview entry, never listed in vite `rollupOptions.input`.
 *
 * @see packages/g2-app/src/demo/hybrid-preview.ts (consumer)
 * @see packages/g2-app/src/engine/container-registry.ts (hybrid map tile geometry)
 */

import * as UPNG from 'upng-js';

/** Hybrid map region width (px) — 2 tiles across. */
const MAP_W = 400;
/** Hybrid map region height (px) — 2 tiles down. */
const MAP_H = 200;
/** Single tile width (px). */
const TILE_W = 200;
/** Single tile height (px). */
const TILE_H = 100;
/** 4-bit greyscale levels. */
const LEVELS = 16;

/** A single encoded map tile ready for `bridge.updateImageRawData`. */
export interface MockMapTile {
  /** Numeric host container id (0-3) — matches the hybrid schema. */
  readonly containerID: number;
  /** Container name in the hybrid schema. */
  readonly containerName: string;
  /** 4-bit indexed PNG bytes (200×100). */
  readonly pngBytes: Uint8Array;
}

/** Ordered 4×4 Bayer matrix (normalised to ±0.5) for ordered dithering. */
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

/**
 * Compute a synthetic greyscale luminance (0-255) for a map pixel.
 *
 * Combines a soft radial light falloff (a "torch" near the party marker), a
 * faint floor grid, and a few rectangular "walls" so the dithered output reads
 * as a top-down dungeon room rather than a flat gradient.
 */
function scenePixel(x: number, y: number): number {
  // Dark stone floor as the base — a dungeon reads as bright features on dark,
  // so keep the floor low and let a gentle torch glow lift the centre only mildly.
  const cx = 200;
  const cy = 100;
  const dist = Math.hypot(x - cx, y - cy);
  let lum = 40 + Math.max(0, 46 - dist * 0.42); // floor 40, gentle centred glow peak ~86

  // Floor grid every 40px — visible brighter mortar lines for scale/tactics.
  if (x % 40 === 0 || y % 40 === 0) lum += 26;

  // Room walls (bright stone) framing the chamber + an interior pillar block.
  const inWall =
    x < 12 ||
    x > MAP_W - 12 ||
    y < 10 ||
    y > MAP_H - 10 ||
    (x > 248 && x < 272 && y > 40 && y < 150);
  if (inWall) lum = 210;

  // A door gap in the right wall.
  if (x > MAP_W - 12 && y > 86 && y < 118) lum = 34;

  // Token pips: a bright ring (outline) so they read as discrete tokens, not blobs.
  const ring = (tx: number, ty: number): boolean => {
    const d = Math.hypot(x - tx, y - ty);
    return d > 4 && d < 8;
  };
  if (ring(cx, cy)) lum = 255; // focus PC
  if (ring(96, 150)) lum = 235; // ally
  if (ring(320, 66)) lum = 235; // enemy

  return Math.max(0, Math.min(255, lum));
}

/**
 * Render one 200×100 tile at map-space offset (ox, oy) to a Bayer-dithered
 * 4-bit indexed PNG.
 */
function encodeTile(ox: number, oy: number): Uint8Array {
  const rgba = new Uint8ClampedArray(TILE_W * TILE_H * 4);
  for (let ty = 0; ty < TILE_H; ty++) {
    for (let tx = 0; tx < TILE_W; tx++) {
      const lum = scenePixel(ox + tx, oy + ty);
      const threshold = BAYER_4X4[(ty & 3) * 4 + (tx & 3)] ?? 0;
      const level = Math.max(
        0,
        Math.min(LEVELS - 1, Math.round((lum / 255) * (LEVELS - 1) + threshold)),
      );
      const g = Math.round((level / (LEVELS - 1)) * 255);
      const i = (ty * TILE_W + tx) * 4;
      rgba[i] = g;
      rgba[i + 1] = g;
      rgba[i + 2] = g;
      rgba[i + 3] = 255;
    }
  }
  const png = UPNG.encode([rgba.buffer], TILE_W, TILE_H, LEVELS);
  return new Uint8Array(png);
}

/**
 * Paint the mock dungeon scene (greyscale) directly into a canvas region.
 *
 * Used by the composited showcase-HUD preview: the scene is drawn INTO the HUD
 * canvas so map + frame + status dither as one image. The 400×200 scene is scaled
 * to fit the given `w×h` region. Pixels are neutral grey (r=g=b=luma) so the 4-bit
 * dither reads true luminance.
 */
export function paintMockScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const lum = scenePixel((px * MAP_W) / w, (py * MAP_H) / h);
      const i = (py * w + px) * 4;
      img.data[i] = lum;
      img.data[i + 1] = lum;
      img.data[i + 2] = lum;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, x, y);
}

/**
 * Build the 4 mock map tiles for the hybrid region, in id order (0-3).
 *
 * Tile layout (matches the hybrid schema in container-registry.ts):
 *   id0 (0,0)   id1 (200,0)
 *   id2 (0,100) id3 (200,100)
 */
export function buildMockMapTiles(): MockMapTile[] {
  const offsets: Array<{ id: number; ox: number; oy: number }> = [
    { id: 0, ox: 0, oy: 0 },
    { id: 1, ox: TILE_W, oy: 0 },
    { id: 2, ox: 0, oy: TILE_H },
    { id: 3, ox: TILE_W, oy: TILE_H },
  ];
  return offsets.map(({ id, ox, oy }) => ({
    containerID: id,
    containerName: `hybrid-map-tile-${id}`,
    pngBytes: encodeTile(ox, oy),
  }));
}

export { MAP_H, MAP_W };
