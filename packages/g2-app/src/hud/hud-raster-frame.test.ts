/**
 * hud-raster-frame.test.ts — pure logic tests for HUD_TILE_GEOMETRY + buildHudTiles.
 *
 * canvas text is NOT testable in happy-dom, so ONLY pure geometry/assembler
 * logic is verified here. The live sim screenshot (via `pnpm sim shot`) is the
 * real visual gate for the rendered content.
 *
 * @see packages/g2-app/src/hud/hud-raster-frame.ts
 */
import { describe, expect, it } from 'vitest';
import { buildHudTiles, HUD_TILE_GEOMETRY } from './hud-raster-frame.js';

const FRAME_W = 576;
const FRAME_H = 288;
const TILE_W = 288;
const TILE_H = 144;
const TILES = 4;

describe('HUD_TILE_GEOMETRY', () => {
  it('has exactly 4 tiles', () => {
    expect(HUD_TILE_GEOMETRY).toHaveLength(TILES);
  });

  it('tile 0 — top-left at (0,0) 288×144', () => {
    const t = HUD_TILE_GEOMETRY[0];
    expect(t).toBeDefined();
    expect(t?.containerID).toBe(0);
    expect(t?.x).toBe(0);
    expect(t?.y).toBe(0);
    expect(t?.width).toBe(TILE_W);
    expect(t?.height).toBe(TILE_H);
  });

  it('tile 1 — top-right at (288,0) 288×144', () => {
    const t = HUD_TILE_GEOMETRY[1];
    expect(t).toBeDefined();
    expect(t?.containerID).toBe(1);
    expect(t?.x).toBe(288);
    expect(t?.y).toBe(0);
    expect(t?.width).toBe(TILE_W);
    expect(t?.height).toBe(TILE_H);
  });

  it('tile 2 — bottom-left at (0,144) 288×144', () => {
    const t = HUD_TILE_GEOMETRY[2];
    expect(t).toBeDefined();
    expect(t?.containerID).toBe(2);
    expect(t?.x).toBe(0);
    expect(t?.y).toBe(144);
    expect(t?.width).toBe(TILE_W);
    expect(t?.height).toBe(TILE_H);
  });

  it('tile 3 — bottom-right at (288,144) 288×144', () => {
    const t = HUD_TILE_GEOMETRY[3];
    expect(t).toBeDefined();
    expect(t?.containerID).toBe(3);
    expect(t?.x).toBe(288);
    expect(t?.y).toBe(144);
    expect(t?.width).toBe(TILE_W);
    expect(t?.height).toBe(TILE_H);
  });
});

describe('buildHudTiles', () => {
  /** Create a synthetic gradient RGBA: pixel value at (x,y) = (y*FRAME_W + x) mod 256. */
  function makeSyntheticRgba(): Uint8ClampedArray {
    const buf = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const idx = (y * FRAME_W + x) * 4;
        const v = (y * FRAME_W + x) % 256;
        buf[idx] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
        buf[idx + 3] = 255;
      }
    }
    return buf;
  }

  it('returns exactly 4 tiles from a valid RGBA buffer', () => {
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);
    expect(tiles).toHaveLength(TILES);
  });

  it('each tile has the expected containerName and containerID', () => {
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);
    for (let i = 0; i < TILES; i++) {
      const tile = tiles[i];
      expect(tile).toBeDefined();
      expect(tile?.containerName).toBe(`hud-tile-${i}`);
      expect(tile?.containerID).toBe(i);
    }
  });

  it('each tile bytes array has positive length (valid PNG)', () => {
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);
    for (const tile of tiles) {
      expect(tile.bytes).toBeInstanceOf(Uint8Array);
      expect(tile.bytes.length).toBeGreaterThan(0);
    }
  });

  it('tile ids are 0..3 in order', () => {
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);
    const ids = tiles.map((t) => t.containerID);
    expect(ids).toEqual([0, 1, 2, 3]);
  });

  it('slices the correct sub-region per tile: TL vs BR origin pixel differs', () => {
    // Make a gradient where pixel value differs across the frame:
    // pixel at (0,0) → R=0, pixel at (288,144) → R=(144*576+288)%256
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);

    // Tile 0 (TL): origin = (0,0) → first pixel
    // Tile 3 (BR): origin = (288,144) → should be different
    const tile0 = tiles[0];
    const tile3 = tiles[3];
    expect(tile0).toBeDefined();
    expect(tile3).toBeDefined();

    // The tiles are PNG-encoded so we can't directly read pixel bytes, but
    // we can verify the two PNG blobs are not byte-identical (different pixels).
    // Convert Uint8Array to hex string for comparison.
    const hex0 = Array.from(tile0?.bytes ?? []).join(',');
    const hex3 = Array.from(tile3?.bytes ?? []).join(',');
    expect(hex0).not.toBe(hex3);
  });

  it('throws with a clear Error when rgba length is wrong', () => {
    const wrongLength = new Uint8ClampedArray(10); // clearly wrong
    expect(() => buildHudTiles(wrongLength)).toThrow(/expected 576\*288\*4/);
  });
});
