/**
 * Unit tests for TileDelta (Phase 4a Plan 03 Task 1).
 *
 * Covers (per 04A-03-PLAN.md `<behavior>` block):
 *   - TD-1: identical hashes between two consecutive calls → empty delta after seed
 *   - TD-2: single-index change reports exactly that index
 *   - TD-3: every-other change returns the correct ordered subset
 *   - TD-4: 4-tile × 18 sub-tile geometry → subTileCount === 72 (B-2 user resolution 2026-05-15)
 *   - TD-5: length-mismatch input throws with descriptive message
 *   - TD-6: prev state is mutated by detectChanges; subsequent identical call returns []
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-2
 */
import { describe, expect, it } from 'vitest';
import { TileDelta } from '../tile-delta.js';

describe('TileDelta — sub-tile delta detection (B-2 user-locked 18 sub-tiles/tile floor)', () => {
  it('TD-1: identical hashes across two consecutive calls produce empty delta on second call', () => {
    const td = new TileDelta(4, 18);
    const hashes = new Uint32Array(td.subTileCount);
    for (let i = 0; i < hashes.length; i++) {
      hashes[i] = i + 1;
    }
    // First call seeds prev state from all-zero — every nonzero index is "changed".
    const firstChanges = td.detectChanges(hashes);
    expect(firstChanges.length).toBeGreaterThan(0);
    // Second call with the same hashes → no changes.
    const secondChanges = td.detectChanges(hashes);
    expect(secondChanges).toEqual([]);
  });

  it('TD-2: changing a single hash at index 11 returns exactly [11]', () => {
    const td = new TileDelta(4, 18);
    const baseline = new Uint32Array(td.subTileCount);
    for (let i = 0; i < baseline.length; i++) {
      baseline[i] = 100 + i;
    }
    td.detectChanges(baseline); // seed
    const next = new Uint32Array(baseline);
    next[11] = 999_999;
    const changes = td.detectChanges(next);
    expect(changes).toEqual([11]);
  });

  it('TD-3: changing every other hash returns the correct ordered subset', () => {
    const td = new TileDelta(4, 18);
    const baseline = new Uint32Array(td.subTileCount);
    for (let i = 0; i < baseline.length; i++) {
      baseline[i] = 100 + i;
    }
    td.detectChanges(baseline); // seed
    const next = new Uint32Array(baseline);
    const expected: number[] = [];
    for (let i = 0; i < baseline.length; i += 2) {
      next[i] = (baseline[i] ?? 0) + 1;
      expected.push(i);
    }
    const changes = td.detectChanges(next);
    expect(changes).toEqual(expected);
  });

  it('TD-4: tilesPerFrame=4, subTilesPerTile=18 ⇒ subTileCount === 72 (B-2)', () => {
    const td = new TileDelta(4, 18);
    expect(td.subTileCount).toBe(72);
    // Sanity: 4 tiles × 18 sub-tiles/tile (6×3 floor) = 72 total sub-tiles per full frame.
    expect(4 * 18).toBe(72);
  });

  it('TD-5: input length mismatch throws Error with descriptive message', () => {
    const td = new TileDelta(4, 18);
    const wrong = new Uint32Array(71); // off-by-one
    expect(() => td.detectChanges(wrong)).toThrow(/length mismatch|expected 72|got 71/i);
  });

  it('TD-6: prev hashes are updated after detectChanges (subsequent identical call returns [])', () => {
    const td = new TileDelta(4, 18);
    const hashes = new Uint32Array(td.subTileCount);
    for (let i = 0; i < hashes.length; i++) {
      hashes[i] = 7 * (i + 1);
    }
    td.detectChanges(hashes); // seed
    // A clone with identical values → second call must report empty.
    const sameAgain = new Uint32Array(hashes);
    expect(td.detectChanges(sameAgain)).toEqual([]);
  });
});
