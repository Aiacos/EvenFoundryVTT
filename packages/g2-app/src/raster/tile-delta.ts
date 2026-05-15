/**
 * TileDelta — sub-tile xxhash delta table for the raster pipeline.
 *
 * Stores `tilesPerFrame × subTilesPerTile` 32-bit xxhash values and reports the
 * indices of sub-tiles that changed between two consecutive frames. Used by
 * the singleton raster Web Worker to decide which 200×100 tiles must be
 * re-encoded as 4-bit indexed PNG and dispatched to the G2 via
 * `EvenAppBridge.updateImageRawData`.
 *
 * Sub-tile geometry per CONTEXT.md §Area 2 (user-locked 2026-05-15, B-2):
 *   6 cols × 3 rows = 18 sub-tiles per 200×100 container.
 *   Sub-tile = 32×32 floor (NOT ceil — 6×32 = 192 < 200; 3×32 = 96 < 100).
 *   Right-edge strip (200 − 6×32 = 8 px) and bottom-edge strip (100 − 3×32 = 4 px)
 *   are absorbed into the boundary sub-tiles via pixel-block slice extension
 *   at hash time. They are NOT encoded as separate sub-tiles. The TileDelta
 *   itself is geometry-agnostic — it just hashes whatever 32-bit words the
 *   worker emits — but the constant `subTilesPerTile=18` is the canonical
 *   sizing used by `new TileDelta(4, 18)` in `raster-worker.ts`.
 *
 * Length-mismatch + `noUncheckedIndexedAccess` (`?? 0` guard) precedent:
 * `packages/shared-render/src/ascii-grid.ts` (lines 18-33).
 *
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (boundary-absorption rationale)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-2 (user resolution)
 * @see packages/shared-render/src/ascii-grid.ts (noUncheckedIndexedAccess precedent)
 */

/**
 * Sub-tile xxhash delta table.
 *
 * Pure data structure — no I/O, no globals. Safe to instantiate inside the
 * raster Web Worker (no DOM dependency).
 *
 * First-call semantics: the constructor initializes `prevHashes` to all-zero.
 * The first `detectChanges()` call therefore returns every index whose input
 * hash is non-zero — callers treat the first frame as fully-changed (the
 * `isInitial: true` request shape in `RasterRequest` is the orthogonal
 * mechanism for the worker to skip the compare entirely).
 */
export class TileDelta {
  /** Total number of sub-tiles in one full frame (`tilesPerFrame × subTilesPerTile`). */
  public readonly subTileCount: number;

  /** Previous-frame hash snapshot, replaced on every `detectChanges()` call. */
  private prevHashes: Uint32Array;

  /**
   * Construct a TileDelta sized for `tilesPerFrame × subTilesPerTile` sub-tiles.
   *
   * Canonical Phase 4a sizing: `new TileDelta(4, 18)` → 72 sub-tiles total
   * (4 200×100 image containers × 18 sub-tiles in a 6×3 floor grid each).
   *
   * @param tilesPerFrame    Number of 200×100 image containers per frame (4 for Phase 4a).
   * @param subTilesPerTile  Number of 32×32 sub-tiles within each tile (18 per B-2).
   */
  constructor(tilesPerFrame: number, subTilesPerTile: number) {
    this.subTileCount = tilesPerFrame * subTilesPerTile;
    this.prevHashes = new Uint32Array(this.subTileCount);
  }

  /**
   * Compare `currHashes` against the stored previous frame and return the
   * ordered list of sub-tile indices whose hash changed.
   *
   * `currHashes` is copied into the internal `prevHashes` slot at the end —
   * subsequent identical calls return `[]`.
   *
   * @param currHashes  Hash array of length `subTileCount`.
   * @returns           Ascending indices of changed sub-tiles.
   * @throws            `Error` if `currHashes.length !== subTileCount`.
   */
  detectChanges(currHashes: Uint32Array): number[] {
    if (currHashes.length !== this.subTileCount) {
      throw new Error(
        `TileDelta.detectChanges: length mismatch — expected ${this.subTileCount}, got ${currHashes.length}`,
      );
    }
    const changed: number[] = [];
    for (let i = 0; i < this.subTileCount; i++) {
      // noUncheckedIndexedAccess guard (AsciiGrid precedent line 22).
      const prev = this.prevHashes[i] ?? 0;
      const curr = currHashes[i] ?? 0;
      if (prev !== curr) {
        changed.push(i);
      }
    }
    // Snapshot for the next call. We copy (not aliasing) so that callers may
    // mutate the input buffer post-call without corrupting the delta state.
    this.prevHashes = new Uint32Array(currHashes);
    return changed;
  }

  /**
   * Reset the delta table — next `detectChanges()` will treat all non-zero
   * inputs as changed. Useful after a mode transition (raster ↔ glyph) or
   * when the worker is recycled.
   */
  reset(): void {
    this.prevHashes = new Uint32Array(this.subTileCount);
  }
}
