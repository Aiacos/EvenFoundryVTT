/**
 * Unit tests for the production showcase HUD raster encoder.
 *
 * Verifies {@link encodeRegionToTiles} splits a 400×200 RGBA buffer into exactly 4
 * ordered tiles (ids 0-3), each a non-empty PNG, and that the ordered Bayer dither
 * is deterministic (identical input → byte-identical output).
 */

import { describe, expect, it } from 'vitest';
import {
  encodeQuadrant,
  encodeRegionToTiles,
  extractQuadrant,
  QUADRANT_BYTES,
  REGION_H,
  REGION_W,
  TILE_COUNT,
} from '../showcase-raster.js';

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

// ── Per-quadrant delta-gate primitives (extractQuadrant + encodeQuadrant) ──────────
//
// The production showcase layer no longer encodes all 4 tiles every cycle: it extracts
// each 200×100 SOURCE quadrant, hashes it, and encodes ONLY changed quadrants via
// encodeQuadrant. These tests pin the primitives' correctness AND — critically — prove
// the per-quadrant encode is BYTE-IDENTICAL to the whole-region encodeRegionToTiles, so
// the optimization changes nothing the glasses actually see (visual determinism proof).

describe('extractQuadrant + encodeQuadrant', () => {
  it("extractQuadrant copies each tile's 200×100 quadrant into a reusable buffer", () => {
    const src = makeRegion();
    const quad = new Uint8ClampedArray(QUADRANT_BYTES);
    // Tile id1 is the top-right quadrant (ox=200, oy=0). Its (0,0) pixel maps to
    // source (200,0); its last row-0 pixel to source (399,0).
    extractQuadrant(src, 1, quad);
    const srcAt = (x: number, y: number) => src[(y * REGION_W + x) * 4];
    expect(quad[0]).toBe(srcAt(200, 0));
    expect(quad[199 * 4]).toBe(srcAt(399, 0));
    // Bottom-left pixel of the quadrant (local 0,99) maps to source (200,99).
    expect(quad[99 * 200 * 4]).toBe(srcAt(200, 99));
  });

  it('extractQuadrant zero-fills before copying (unknown id → all zero; no stale bytes)', () => {
    const quad = new Uint8ClampedArray(QUADRANT_BYTES).fill(200); // pre-dirty
    extractQuadrant(makeRegion(), 99, quad); // out-of-range id
    expect(quad.every((b) => b === 0)).toBe(true);
  });

  it('extractQuadrant reused across tiles leaves no cross-tile contamination', () => {
    const src = makeRegion();
    const shared = new Uint8ClampedArray(QUADRANT_BYTES);
    // Extract tile 3 first (dirties the buffer), then tile 0 into the SAME buffer.
    extractQuadrant(src, 3, shared);
    extractQuadrant(src, 0, shared);
    // A fresh dedicated buffer for tile 0 must match the reused one byte-for-byte.
    const fresh = new Uint8ClampedArray(QUADRANT_BYTES);
    extractQuadrant(src, 0, fresh);
    expect(Array.from(shared)).toEqual(Array.from(fresh));
  });

  it('encodeQuadrant emits the hybrid id + name and a non-empty PNG', () => {
    const quad = new Uint8ClampedArray(QUADRANT_BYTES);
    extractQuadrant(makeRegion(), 2, quad);
    const tile = encodeQuadrant(quad, 2);
    expect(tile.containerID).toBe(2);
    expect(tile.containerName).toBe('hybrid-map-tile-2');
    expect(Array.from(tile.pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('DETERMINISM PROOF: extract+encodeQuadrant is byte-identical to encodeRegionToTiles', () => {
    // The showcase layer's delta gate must produce EXACTLY the same PNG bytes the
    // dev-preview whole-region encoder produces — otherwise the optimization would
    // alter the dithered image on the glasses. Prove per-tile == whole-region.
    const src = makeRegion();
    const whole = encodeRegionToTiles(src);
    const quad = new Uint8ClampedArray(QUADRANT_BYTES);
    for (let id = 0; id < TILE_COUNT; id++) {
      extractQuadrant(src, id, quad);
      const perTile = encodeQuadrant(quad, id);
      expect(perTile.containerID).toBe(whole[id]?.containerID);
      expect(perTile.containerName).toBe(whole[id]?.containerName);
      expect(Array.from(perTile.pngBytes)).toEqual(Array.from(whole[id]?.pngBytes ?? []));
    }
  });

  it('DETERMINISM PROOF holds for a flat buffer AND a short/undersized buffer', () => {
    for (const src of [
      new Uint8ClampedArray(REGION_W * REGION_H * 4).fill(128),
      new Uint8ClampedArray(64), // undersized → out-of-bounds reads clamp to 0
    ]) {
      const whole = encodeRegionToTiles(src);
      const quad = new Uint8ClampedArray(QUADRANT_BYTES);
      for (let id = 0; id < TILE_COUNT; id++) {
        extractQuadrant(src, id, quad);
        expect(Array.from(encodeQuadrant(quad, id).pngBytes)).toEqual(
          Array.from(whole[id]?.pngBytes ?? []),
        );
      }
    }
  });
});
