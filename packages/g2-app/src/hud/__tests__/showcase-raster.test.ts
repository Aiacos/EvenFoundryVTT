/**
 * Unit tests for the production showcase HUD raster encoder.
 *
 * Verifies {@link encodeRegionToTiles} splits a 400×200 RGBA buffer into exactly 4
 * ordered tiles (ids 0-3), each a non-empty PNG, and that the ordered Bayer dither
 * is deterministic (identical input → byte-identical output).
 */

import { describe, expect, it } from 'vitest';
import { encodeRegionToTiles, REGION_H, REGION_W } from '../showcase-raster.js';

/** Build a synthetic 400×200 RGBA buffer with a smooth diagonal luma gradient. */
function makeRegion(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(REGION_W * REGION_H * 4);
  for (let y = 0; y < REGION_H; y++) {
    for (let x = 0; x < REGION_W; x++) {
      const g = Math.round(((x + y) / (REGION_W + REGION_H)) * 255);
      const i = (y * REGION_W + x) * 4;
      buf[i] = g;
      buf[i + 1] = g;
      buf[i + 2] = g;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

describe('encodeRegionToTiles', () => {
  it('returns exactly 4 tiles with ids 0-3 in order and the hybrid names', () => {
    const tiles = encodeRegionToTiles(makeRegion());
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.containerID)).toEqual([0, 1, 2, 3]);
    expect(tiles.map((t) => t.containerName)).toEqual([
      'hybrid-map-tile-0',
      'hybrid-map-tile-1',
      'hybrid-map-tile-2',
      'hybrid-map-tile-3',
    ]);
  });

  it('encodes each tile as a non-empty PNG (Uint8Array with the PNG signature)', () => {
    const tiles = encodeRegionToTiles(makeRegion());
    for (const tile of tiles) {
      expect(tile.pngBytes).toBeInstanceOf(Uint8Array);
      expect(tile.pngBytes.length).toBeGreaterThan(0);
      // PNG magic: 0x89 'P' 'N' 'G'.
      expect(Array.from(tile.pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it('is deterministic — the same input yields byte-identical tiles', () => {
    const a = encodeRegionToTiles(makeRegion());
    const b = encodeRegionToTiles(makeRegion());
    const bytesOf = (tiles: ReturnType<typeof encodeRegionToTiles>) =>
      tiles.map((t) => Array.from(t.pngBytes));
    expect(bytesOf(b)).toEqual(bytesOf(a));
  });

  it('tolerates a short/undersized buffer (out-of-bounds reads clamp to 0, no throw)', () => {
    // A buffer smaller than 400×200×4 makes most reads undefined → `?? 0` fallback.
    const short = new Uint8ClampedArray(16);
    let tiles!: ReturnType<typeof encodeRegionToTiles>;
    expect(() => {
      tiles = encodeRegionToTiles(short);
    }).not.toThrow();
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.pngBytes.length).toBeGreaterThan(0);
    }
  });

  it('produces different tiles for different content', () => {
    const flat = new Uint8ClampedArray(REGION_W * REGION_H * 4).fill(255);
    const [flatTile0] = encodeRegionToTiles(flat);
    const [gradientTile0] = encodeRegionToTiles(makeRegion());
    expect(flatTile0).toBeDefined();
    expect(gradientTile0).toBeDefined();
    expect(Array.from(gradientTile0?.pngBytes ?? [])).not.toEqual(
      Array.from(flatTile0?.pngBytes ?? []),
    );
  });
});
