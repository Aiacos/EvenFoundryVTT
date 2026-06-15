/**
 * hud-raster-frame.test.ts — pure logic tests for HUD_TILE_GEOMETRY + buildHudTiles.
 *
 * canvas text is NOT testable in happy-dom, so ONLY pure geometry/assembler
 * logic is verified here. The live sim screenshot (via `pnpm sim shot`) is the
 * real visual gate for the rendered content.
 *
 * Geometry: tiles 288×144, frame 576×288 (FULL SCREEN — layout B, 2026-06-10).
 * The SDK d.ts verbatim caps image containers at 20–288 × 20–144; the earlier
 * 200×100 limit was INV-2 drift (corrected 2026-06-10). 2×2 tiles of 288×144
 * cover the whole 576×288 display.
 *
 * @see packages/g2-app/src/hud/hud-raster-frame.ts
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
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

  // ── Dither flag tests (CLR-01..CLR-04) ────────────────────────────────────

  it('CLR-01: buildHudTiles(rgba) and buildHudTiles(rgba, true) produce byte-identical output', () => {
    const rgba1 = makeSyntheticRgba();
    const rgba2 = makeSyntheticRgba();
    const tilesDefault = buildHudTiles(rgba1);
    const tilesExplicitTrue = buildHudTiles(rgba2, true);
    for (let i = 0; i < TILES; i++) {
      const t0 = tilesDefault[i];
      const t1 = tilesExplicitTrue[i];
      expect(t0).toBeDefined();
      expect(t1).toBeDefined();
      expect(Array.from(t0?.bytes ?? [])).toEqual(Array.from(t1?.bytes ?? []));
    }
  });

  it('CLR-02: buildHudTiles(rgba, false) on a flat grey region produces uniform output (no checkerboard)', () => {
    // Create a flat mid-grey RGBA: all pixels = 128,128,128,255
    const flatGrey = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
    for (let i = 0; i < FRAME_W * FRAME_H; i++) {
      flatGrey[i * 4] = 128;
      flatGrey[i * 4 + 1] = 128;
      flatGrey[i * 4 + 2] = 128;
      flatGrey[i * 4 + 3] = 255;
    }
    const tilesNoDither = buildHudTiles(flatGrey, false);
    // Tiles should still be valid PNG with positive length
    for (const tile of tilesNoDither) {
      expect(tile.bytes.length).toBeGreaterThan(0);
    }
    // A flat-grey region with no dither should compress better (smaller PNG) than
    // the same region with Bayer dither (which varies per-pixel).
    const flatGreyDithered = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
    for (let i = 0; i < FRAME_W * FRAME_H; i++) {
      flatGreyDithered[i * 4] = 128;
      flatGreyDithered[i * 4 + 1] = 128;
      flatGreyDithered[i * 4 + 2] = 128;
      flatGreyDithered[i * 4 + 3] = 255;
    }
    const tilesWithDither = buildHudTiles(flatGreyDithered, true);
    // Dithered flat grey should produce LARGER PNGs (pattern variance) than flat quantized.
    // Use total byte length sum as proxy.
    const noDitherTotal = tilesNoDither.reduce((s, t) => s + t.bytes.length, 0);
    const ditherTotal = tilesWithDither.reduce((s, t) => s + t.bytes.length, 0);
    expect(noDitherTotal).toBeLessThan(ditherTotal);
  });

  it('CLR-03: buildHudTiles(rgba, false) and buildHudTiles(rgba, true) differ on a gradient input', () => {
    const rgba1 = makeSyntheticRgba();
    const rgba2 = makeSyntheticRgba();
    const tilesNoDither = buildHudTiles(rgba1, false);
    const tilesWithDither = buildHudTiles(rgba2, true);
    // At least one tile must differ between the two modes on a gradient input
    let anyDiffers = false;
    for (let i = 0; i < TILES; i++) {
      const hex0 = Array.from(tilesNoDither[i]?.bytes ?? []).join(',');
      const hex1 = Array.from(tilesWithDither[i]?.bytes ?? []).join(',');
      if (hex0 !== hex1) {
        anyDiffers = true;
        break;
      }
    }
    expect(anyDiffers).toBe(true);
  });

  it('CLR-04: dither=false is backward-compatible — signature accepts positional rgba-only call', () => {
    const rgba = makeSyntheticRgba();
    // Must not throw — dither defaults to true
    expect(() => buildHudTiles(rgba)).not.toThrow();
  });
});
