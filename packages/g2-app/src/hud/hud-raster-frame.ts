/**
 * HUD raster frame assembler — slices a 576×288 RGBA frame into 4 × 288×144
 * dithered 4-bit PNG tiles ready for `updateImageRawData`.
 *
 * # Geometry (INV-2 verified 2026-06-05)
 *
 * G2 image containers are capped at 20–288 px wide × 20–144 px tall (SDK d.ts
 * verbatim `PB：Width，范围 20~288` / `Height 20~144` — INV-2 re-verified 2026-06-10;
 * the earlier 200×100 claim was drift)
 * (`hub.evenrealities.com/docs/guides/display`, verified 2026-06-05). The
 * raster surface is therefore the FULL SCREEN 576×288 (4 tiles of 288×144 each
 * in a 2×2 grid — layout B, user decision 2026-06-10). No placement parameter
 * (default deferred to Phase 20).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 *
 * # Reuse from raster-worker.ts (patterns replicated minimally — NOT imported)
 *
 * The raster-worker runs in a Web Worker module scope (separate JS thread).
 * Importing it here would attempt to spawn a nested worker, which fails in
 * both the test environment and the main thread. Instead, the relevant
 * functions are replicated MINIMALLY:
 *
 * - `buildGreyscalePalette()` — canonical 16-step 0..240 greyscale palette
 *   (verbatim from raster-worker.ts, same algorithm)
 * - `ditherTile()` — Floyd-Steinberg dither via image-q against the palette
 *   (adapted for TILE_W/TILE_H = 288×144)
 * - `UPNG.encode([rgba.buffer], 288, 144, 16)` — 4-bit indexed-palette PNG
 *   (verbatim call pattern from raster-worker.ts Stage 9)
 *
 * No xxhash/delta/RLE — `buildHudTiles` encodes all 4 tiles unconditionally
 * (per-call, no delta state). The delta loop is owned by `HudDeltaDriver`
 * (Phase 24, ADR-0013 Amendment 1).
 *
 * # Container ID contract (qm0)
 *
 * The EvenHub host addresses containers by NUMERIC `containerID` in the global
 * declaration-order namespace (debug probe 2026-06-04). Each `HudTile` carries
 * both `containerName` and `containerID` so `pushHudTiles` can pass both to
 * `ImageRawDataUpdate` without a registry lookup.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 * @see packages/g2-app/src/raster/raster-worker.ts (source of replicated patterns)
 * @see .planning/debug/glasses-render-blank-containerid.md (qm0 numeric-id requirement)
 */

import * as ImageQ from 'image-q';
import * as UPNG from 'upng-js';

// ── Frame / tile geometry ─────────────────────────────────────────────────────

/**
 * Raster surface width: 2 columns × 288 px = 576 px (full screen).
 * INV-2 verified 2026-06-05 (`hub.evenrealities.com/docs/guides/display`).
 */
const FRAME_W = 576;
/**
 * Raster surface height: 2 rows × 144 px = 288 px (full screen).
 * INV-2 verified 2026-06-05 (`hub.evenrealities.com/docs/guides/display`).
 */
const FRAME_H = 288;
/**
 * Tile width — max per Even Realities image container spec (20–288 px).
 * Source: `hub.evenrealities.com/docs/guides/display`, verified 2026-06-05.
 */
const TILE_W = 288;
/**
 * Tile height — max per Even Realities image container spec (20–100 px).
 * Source: `hub.evenrealities.com/docs/guides/display`, verified 2026-06-05.
 */
const TILE_H = 144;
/** Number of tiles per frame (2×2 layout). */
const TILES_PER_FRAME = 4;

// ── Exported types ────────────────────────────────────────────────────────────

/**
 * A single dithered 4-bit PNG tile with its container addressing metadata.
 *
 * Both `containerName` and `containerID` are required by `ImageRawDataUpdate`
 * to address the EvenHub host container unambiguously (qm0 requirement —
 * see `.planning/debug/glasses-render-blank-containerid.md`).
 */
export interface HudTile {
  /** Container name (e.g. `"hud-tile-0"`). */
  readonly containerName: string;
  /** Numeric host container ID (0-3 for the 4 HUD image tiles). */
  readonly containerID: number;
  /** 4-bit indexed-palette PNG bytes ready for `updateImageRawData`. */
  readonly bytes: Uint8Array;
}

/**
 * Descriptor for a single HUD tile's geometry and container identity.
 *
 * Used by `push-hud-tiles.ts` (serialized tile push) and by tests to assert
 * the tile layout without calling the dither pipeline.
 *
 * `x` and `y` are offsets **relative to the 400×200 raster-region origin** —
 * not absolute on-screen positions within the 576×288 G2 display. The raster
 * region's on-screen placement inside 576×288 is parameterized (Phase 20
 * decision). No hard-coded 576×288 on-screen offset is introduced here.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1 — geometry)
 */
export interface HudTileGeometryEntry {
  /** Numeric host container ID (0-3). */
  readonly containerID: number;
  /** Container name (e.g. `"hud-tile-0"`). */
  readonly containerName: string;
  /** Top-left X offset relative to the 400×200 raster-region origin (pixels). */
  readonly x: number;
  /** Top-left Y offset relative to the 400×200 raster-region origin (pixels). */
  readonly y: number;
  /** Tile width in pixels (always 200 — max per Even Realities image container spec). */
  readonly width: number;
  /** Tile height in pixels (always 100 — max per Even Realities image container spec). */
  readonly height: number;
}

// ── HUD_TILE_GEOMETRY ─────────────────────────────────────────────────────────

/**
 * The 4 HUD tile geometry descriptors in id order (TL, TR, BL, BR).
 *
 * Tile offsets are relative to the **400×200 raster-region origin** (not the
 * 576×288 physical G2 screen). The raster-region's on-screen placement is
 * parameterized — default deferred to Phase 20 (ADR-0013 Amendment 1).
 *
 * ```
 *   ┌────────────┬────────────┐
 *   │ hud-tile-0 │ hud-tile-1 │  (0,0)─(200,0)─(400,0)
 *   │   200×100  │   200×100  │
 *   ├────────────┼────────────┤  y=100
 *   │ hud-tile-2 │ hud-tile-3 │
 *   │   200×100  │   200×100  │
 *   └────────────┴────────────┘  y=200
 * ```
 *
 * Tile size (200×100) is the hardware maximum per Even Realities image container
 * spec (`hub.evenrealities.com/docs/guides/display`, INV-2 verified 2026-06-05).
 * 4 tiles at maximum size yield the 400×200 raster surface.
 *
 * Container IDs start at 0 and are declared first in the page schema (images
 * before text in the global id namespace).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1 — geometry)
 * @see .planning/debug/glasses-render-blank-containerid.md (global id namespace)
 */
export const HUD_TILE_GEOMETRY: ReadonlyArray<HudTileGeometryEntry> = Object.freeze([
  { containerID: 0, containerName: 'hud-tile-0', x: 0, y: 0, width: TILE_W, height: TILE_H },
  { containerID: 1, containerName: 'hud-tile-1', x: TILE_W, y: 0, width: TILE_W, height: TILE_H },
  {
    containerID: 2,
    containerName: 'hud-tile-2',
    x: 0,
    y: TILE_H,
    width: TILE_W,
    height: TILE_H,
  },
  {
    containerID: 3,
    containerName: 'hud-tile-3',
    x: TILE_W,
    y: TILE_H,
    width: TILE_W,
    height: TILE_H,
  },
]);

// ── Private pipeline helpers (replicated from raster-worker.ts) ──────────────

/**
 * Build the canonical 16-step phosphor-green greyscale palette (0..240).
 *
 * Replicated MINIMALLY from `raster-worker.ts#buildGreyscalePalette`.
 * Cannot import the worker directly — Worker modules are not importable in
 * the main thread or test environment.
 *
 * @returns A `Palette` instance with 16 greyscale entries spaced 16 apart.
 *
 * @see packages/g2-app/src/raster/raster-worker.ts (source pattern, ADR-0006)
 */
function buildGreyscalePalette(): ImageQ.utils.Palette {
  const pal = new ImageQ.utils.Palette();
  for (let i = 0; i < 16; i++) {
    const v = i * 16; // 0, 16, 32, ..., 240
    pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255));
  }
  return pal;
}

/**
 * Quantize one 200×100 RGBA tile against the greyscale palette using
 * Floyd-Steinberg dithering.
 *
 * Replicated MINIMALLY from `raster-worker.ts#ditherTile` for the HUD tile
 * dimensions (200×100 — max per Even Realities image container spec,
 * `hub.evenrealities.com/docs/guides/display`, INV-2 verified 2026-06-05).
 *
 * @param rgba   200×100×4 RGBA pixel buffer.
 * @param pal    16-step greyscale palette from `buildGreyscalePalette`.
 * @returns Dithered RGBA Uint8ClampedArray of the same length.
 *
 * @see packages/g2-app/src/raster/raster-worker.ts (source pattern, ADR-0006)
 */
function ditherTile(rgba: Uint8ClampedArray, pal: ImageQ.utils.Palette): Uint8ClampedArray {
  const inContainer = ImageQ.utils.PointContainer.fromUint8Array(rgba, TILE_W, TILE_H);
  const outContainer = ImageQ.applyPaletteSync(inContainer, pal, {
    imageQuantization: 'floyd-steinberg',
    colorDistanceFormula: 'euclidean-bt709',
  });
  return new Uint8ClampedArray(outContainer.toUint8Array());
}

/**
 * Slice a 400×200 RGBA frame into 4 × 200×100 tile buffers (row-by-row copy).
 *
 * Layout: TL(id=0), TR(id=1), BL(id=2), BR(id=3) — mirrors `raster-worker.ts`
 * `splitIntoTiles` but for the HUD 400×200 / 200×100 geometry.
 *
 * @param rgba 400×200×4 RGBA pixel buffer.
 * @returns Array of 4 tile buffers in id order.
 */
function splitIntoTiles(rgba: Uint8ClampedArray): Uint8ClampedArray[] {
  const tiles: Uint8ClampedArray[] = [];
  for (let t = 0; t < TILES_PER_FRAME; t++) {
    const buf = new Uint8ClampedArray(TILE_W * TILE_H * 4);
    const tileCol = t % 2; // 0 = left, 1 = right
    const tileRow = (t / 2) | 0; // 0 = top, 1 = bottom
    const srcOriginX = tileCol * TILE_W;
    const srcOriginY = tileRow * TILE_H;
    for (let row = 0; row < TILE_H; row++) {
      const srcStart = ((srcOriginY + row) * FRAME_W + srcOriginX) * 4;
      const dstStart = row * TILE_W * 4;
      buf.set(rgba.subarray(srcStart, srcStart + TILE_W * 4), dstStart);
    }
    tiles.push(buf);
  }
  return tiles;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Slice a 400×200 RGBA frame into 4 dithered 4-bit PNG tiles ready for
 * `updateImageRawData`, returning them in container-id order (0..3).
 *
 * # Pipeline (single frame — no delta, no xxhash, no RLE):
 * 1. Validate `rgba.length === 400*200*4` (throws on mismatch).
 * 2. Split into 4 × 200×100 tile buffers (row-by-row subarray copy).
 * 3. For each tile: Floyd-Steinberg dither → `UPNG.encode([…], 200, 100, 16)`
 *    → `new Uint8Array(png)`.
 * 4. Return 4 `HudTile` objects with `containerName`, `containerID`, `bytes`.
 *
 * The dither pipeline is replicated MINIMALLY from `raster-worker.ts`
 * (`buildGreyscalePalette`, `ditherTile`, `UPNG.encode` call pattern) without
 * importing the worker module itself (ADR-0013, ADR-0006 cross-reference).
 *
 * Tile size (200×100) is the hardware maximum per Even Realities image container
 * spec (`hub.evenrealities.com/docs/guides/display`, INV-2 verified 2026-06-05).
 *
 * @param rgba 400×200×4 RGBA Uint8ClampedArray (from `CanvasCompositor.composite()` in canvas mode).
 * @returns 4 `HudTile` objects in id order (0=TL, 1=TR, 2=BL, 3=BR).
 * @throws Error when `rgba.length !== 400*200*4`.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 * @see packages/g2-app/src/raster/raster-worker.ts (source of replicated patterns)
 * @see packages/g2-app/src/hud/push-hud-tiles.ts (consumer — pushHudTiles)
 */
export function buildHudTiles(rgba: Uint8ClampedArray): HudTile[] {
  const expectedLength = FRAME_W * FRAME_H * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(
      `[EVF] buildHudTiles: rgba buffer has wrong length ${rgba.length}; ` +
        `expected ${FRAME_W}*${FRAME_H}*4 = ${expectedLength}`,
    );
  }

  const palette = buildGreyscalePalette();
  const tileBuffers = splitIntoTiles(rgba);
  const result: HudTile[] = [];

  for (let i = 0; i < TILES_PER_FRAME; i++) {
    // biome-ignore lint/style/noNonNullAssertion: splitIntoTiles contract — always exactly TILES_PER_FRAME entries
    const tileBuf = tileBuffers[i]!;
    const dithered = ditherTile(tileBuf, palette);
    // Stage 9 from raster-worker: UPNG.encode([rgba.buffer], W, H, 16) → 4-bit indexed PNG.
    const pngBuf = UPNG.encode([dithered.buffer], TILE_W, TILE_H, 16);
    const bytes = new Uint8Array(pngBuf);
    result.push({
      containerName: `hud-tile-${i}`,
      containerID: i,
      bytes,
    });
  }

  return result;
}
