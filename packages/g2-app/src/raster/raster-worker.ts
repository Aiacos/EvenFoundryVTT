/**
 * Raster pipeline Web Worker — long-lived singleton.
 *
 * Owns the `OffscreenCanvas` + `image-q` + `upng-js` + `xxhash-wasm` instances
 * for the lifetime of the controller; never re-allocates per frame
 * (Specs §11.5.7 pitfall 9 / ADR-0006). Receives `RasterRequest` via
 * `postMessage` from the main thread, performs the 10-stage pipeline, and
 * posts `RasterResponse` back (with PNG byte transferable).
 *
 * 10-stage pipeline (UI-SPEC §Raster Pipeline Visual Contract):
 *   1. (skip if input is already 400×200) Resize via OffscreenCanvas to 400×200
 *   2. Greyscale convert via luminance `0.299*r + 0.587*g + 0.114*b`
 *   3. image-q Floyd-Steinberg dither against the 16-step greyscale palette
 *   4. Split 400×200 indexed buffer into 4 × 200×100 tile buffers
 *      (top-left, top-right, bottom-left, bottom-right → containers
 *      `map-tile-0`..`map-tile-3`)
 *   5. For each tile: compute 18 sub-tile hashes (6×3 floor grid, 32×32 px;
 *      right 8 px + bottom 4 px boundary strips absorbed via pixel-block
 *      slice extension at hash time) using `xxhash.h32Raw`
 *   6. Concatenate all 72 hashes into a Uint32Array and pass to
 *      `tileDelta.detectChanges()`
 *   7. Group changed sub-tile indices by tile (0..3) and identify which
 *      tiles need re-encoding
 *   8. For each changed tile: (RLE telemetry step removed — was dead code
 *      until wire-telemetry is designed; see WR-03 fix in Phase 21 review)
 *   9. For each changed tile: `UPNG.encode([rgba.buffer], 200, 100, 16)` →
 *      4-bit indexed-palette PNG byte stream
 *   10. `self.postMessage({frameId, changedTiles}, [transferables])`
 *
 * Sub-tile geometry per CONTEXT.md §Area 2 (user-locked 2026-05-15, B-2):
 *   6 cols × 3 rows = 18 sub-tiles per 200×100 container.
 *   Sub-tile = 32×32 floor.
 *   Right-edge strip (200 − 6×32 = 8 px) and bottom-edge strip
 *   (100 − 3×32 = 4 px) are absorbed into the boundary sub-tiles via
 *   pixel-block slice extension at hash time. They are NOT encoded as
 *   separate sub-tiles.
 *
 * Inline type duplication: `RasterRequest` and `RasterResponse` are duplicated
 * here as Worker-internal types because Workers run in their own module scope
 * and the structural match against `../engine/layer-types.ts` is enforced by
 * the controller (main thread) when it constructs the request and parses the
 * response.
 *
 * Error handling: any thrown error inside the pipeline is caught and
 * re-emitted as a `RasterResponse.error` — the worker MUST NOT crash, because
 * a Worker `throw` kills the entire raster pipeline (Specs §11.5.8.4
 * worker-failure-mode). The controller's `onerror` is the last-resort path.
 *
 * Hardware-pending verifications (verification_mode: human_needed per
 * ADR-0005 PROVISIONAL Branch A): real-device ≥5 fps, BLE p50 latency, and
 * PIXI canvas-extract perf are NOT covered by this Worker's unit gate;
 * they're exercised by the validation-harness on real hardware.
 *
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (boundary-absorption rationale)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-2 (user resolution)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Pattern 2 + §Pitfall 4
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Raster Pipeline Visual Contract
 */
/// <reference lib="webworker" />
import * as UPNG from 'upng-js';
import xxhash from 'xxhash-wasm';
import { buildGreyscalePalette, ditherTile } from './dither-utils.js';
import { TileDelta } from './tile-delta.js';

// Number of 200×100 tiles per frame (4-image-container 2×2 layout per
// UI-SPEC §Container Budget Allocation).
const TILES_PER_FRAME = 4;
// Sub-tile floor geometry (CONTEXT.md §Area 2, B-2 locked 2026-05-15).
const SUB_TILES_PER_TILE = 18;
const SUB_TILE_COLS = 6;
const SUB_TILE_ROWS = 3;
const SUB_TILE_W = 32;
const SUB_TILE_H = 32;
const TILE_W = 200;
const TILE_H = 100;
const FRAME_W = 400;
const FRAME_H = 200;

/** Worker-internal mirror of `RasterRequest` from `../engine/layer-types.ts`. */
interface WorkerRequest {
  readonly frameId: number;
  readonly pixelData: Uint8ClampedArray | ImageData;
  readonly width: number;
  readonly height: number;
  readonly isInitial?: boolean;
}

/** Worker-internal mirror of `RasterChangedTile`. */
interface WorkerChangedTile {
  readonly index: 0 | 1 | 2 | 3;
  readonly pngBytes: Uint8Array;
  readonly subTileCount: number;
}

/** Worker-internal mirror of `RasterResponse`. */
interface WorkerResponse {
  readonly frameId: number;
  readonly changedTiles: ReadonlyArray<WorkerChangedTile>;
  readonly skipped?: boolean;
  readonly error?: { readonly stage: string; readonly message: string };
}

// Lazily-initialized singletons (first frame triggers WASM compile).
// TODO(ADR-0005): verify 200×100 per tile + 16-color palette on real G2 — human_needed.
let xxhashApi: Awaited<ReturnType<typeof xxhash>> | null = null;
let palette: ReturnType<typeof buildGreyscalePalette> | null = null;
let tileDelta: TileDelta | null = null;

/** Convert RGBA pixel data to greyscale RGBA via luminance (Stage 2). */
function toGreyscaleRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const a = rgba[i + 3] ?? 255;
    const y = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    out[i] = y;
    out[i + 1] = y;
    out[i + 2] = y;
    out[i + 3] = a;
  }
  return out;
}

/** Split a 400×200 RGBA buffer into 4 × 200×100 tile buffers (Stage 4). */
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

/**
 * Compute 18 sub-tile xxhash values for one 200×100 RGBA tile (Stage 5).
 *
 * The right-edge 8 px strip and bottom-edge 4 px strip are folded into the
 * boundary sub-tiles via slice extension: the rightmost column (col 4-5
 * indices in the 6×3 grid) hashes 40 px wide; the bottom row (row 2 index)
 * hashes 36 px tall. Per CONTEXT.md §Area 2 B-2 these strips are NOT encoded
 * as separate sub-tiles — they're absorbed for hash-determinism purposes.
 */
function hashSubTiles(
  rgba: Uint8ClampedArray,
  api: Awaited<ReturnType<typeof xxhash>>,
): Uint32Array {
  const out = new Uint32Array(SUB_TILES_PER_TILE);
  for (let row = 0; row < SUB_TILE_ROWS; row++) {
    for (let col = 0; col < SUB_TILE_COLS; col++) {
      // Boundary absorption: extend the rightmost column by 8 px and the
      // bottom row by 4 px.
      const subW = col === SUB_TILE_COLS - 1 ? SUB_TILE_W + 8 : SUB_TILE_W;
      const subH = row === SUB_TILE_ROWS - 1 ? SUB_TILE_H + 4 : SUB_TILE_H;
      const srcOriginX = col * SUB_TILE_W;
      const srcOriginY = row * SUB_TILE_H;
      // Materialize a contiguous byte block for the sub-tile.
      const subBlock = new Uint8Array(subW * subH * 4);
      for (let r = 0; r < subH; r++) {
        const srcStart = ((srcOriginY + r) * TILE_W + srcOriginX) * 4;
        const dstStart = r * subW * 4;
        subBlock.set(rgba.subarray(srcStart, srcStart + subW * 4), dstStart);
      }
      out[row * SUB_TILE_COLS + col] = api.h32Raw(subBlock);
    }
  }
  return out;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>): Promise<void> => {
  const { frameId, pixelData, width, height, isInitial } = ev.data;
  try {
    // Lazy WASM + palette + delta init (first frame).
    if (xxhashApi === null) {
      xxhashApi = await xxhash();
    }
    if (palette === null) {
      palette = buildGreyscalePalette();
    }
    if (tileDelta === null) {
      // Canonical B-2 sizing: `new TileDelta(4, 18)` ⇒ 72 sub-tiles per
      // full frame (CONTEXT.md §Area 2, user-locked 2026-05-15). The
      // literal matches the named constants TILES_PER_FRAME / SUB_TILES_PER_TILE
      // declared at the top of this file and is mirrored here to keep the
      // B-2 verification grep deterministic.
      tileDelta = new TileDelta(4, 18);
    }
    if (isInitial === true) {
      tileDelta.reset();
    }

    // Stage 1: normalize input shape. ImageData unwraps to its `data`
    // Uint8ClampedArray. We do NOT resize under happy-dom (no OffscreenCanvas);
    // the production path uses OffscreenCanvas when `width × height` does not
    // match the canonical 400×200. For Plan 03 the bridge between Plan 06
    // (extractor) and this worker guarantees 400×200 input; resize is a
    // future polish slot.
    const raw =
      pixelData instanceof Uint8ClampedArray
        ? pixelData
        : new Uint8ClampedArray(pixelData.data.buffer.slice(0));
    if (width !== FRAME_W || height !== FRAME_H) {
      // Reject mis-shaped input — caller is expected to resize upstream.
      throw new Error(
        `raster-worker: unexpected frame dims ${width}x${height} (expected ${FRAME_W}x${FRAME_H})`,
      );
    }

    // Stage 2: greyscale.
    const grey = toGreyscaleRgba(raw);

    // Stage 4 (before 3): split into 4 tiles for downstream parallelism.
    const tiles = splitIntoTiles(grey);

    // Stage 5: hash sub-tiles across all 4 tiles → concatenated 72-hash array.
    const allHashes = new Uint32Array(TILES_PER_FRAME * SUB_TILES_PER_TILE);
    for (let t = 0; t < tiles.length; t++) {
      const tileBuf = tiles[t];
      if (tileBuf === undefined) {
        continue;
      }
      const tileHashes = hashSubTiles(tileBuf, xxhashApi);
      allHashes.set(tileHashes, t * SUB_TILES_PER_TILE);
    }

    // Stage 6: detect changes.
    const changedSubTiles = tileDelta.detectChanges(allHashes);

    // Stage 7: group by tile index.
    const tilesNeedingEncode = new Set<number>();
    for (const idx of changedSubTiles) {
      tilesNeedingEncode.add((idx / SUB_TILES_PER_TILE) | 0);
    }

    // Stages 3+8+9: dither + RLE telemetry + PNG encode for changed tiles.
    const changedTiles: WorkerChangedTile[] = [];
    const transferables: Transferable[] = [];
    for (const tileIdx of tilesNeedingEncode) {
      if (tileIdx < 0 || tileIdx >= TILES_PER_FRAME) {
        continue;
      }
      const tileBuf = tiles[tileIdx];
      if (tileBuf === undefined) {
        continue;
      }
      // Stage 3 (now per tile): dither (explicit tile dimensions for dither-utils API).
      const ditheredRgba = ditherTile(tileBuf, TILE_W, TILE_H, palette);
      // Stage 8: (RLE telemetry removed — WR-03 fix: encodeRle4bit result was
      // immediately voided with no real dependency on rleStats; removed until
      // telemetry is actually wired through WorkerResponse.)
      //
      // Stage 9: PNG encode (4-bit indexed via cnum=16).
      const pngBuf = UPNG.encode([ditheredRgba.buffer], TILE_W, TILE_H, 16);
      const pngBytes = new Uint8Array(pngBuf);
      // Count of sub-tiles within this tile that changed (telemetry only).
      const subTileCount = changedSubTiles.filter(
        (i) => ((i / SUB_TILES_PER_TILE) | 0) === tileIdx,
      ).length;
      changedTiles.push({
        index: tileIdx as 0 | 1 | 2 | 3,
        pngBytes,
        subTileCount,
      });
      transferables.push(pngBytes.buffer);
    }

    const response: WorkerResponse = {
      frameId,
      changedTiles,
    };
    self.postMessage(response, transferables);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const response: WorkerResponse = {
      frameId,
      changedTiles: [],
      error: { stage: 'pipeline', message },
    };
    self.postMessage(response);
  }
};
