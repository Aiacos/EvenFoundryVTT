/**
 * 20-raster-inv1.test.ts — RINV-01: raster INV-1 SHA-256 tile hashes
 *
 * # Contract (INV-1 raster extension, Phase 20)
 *
 * A deterministic synthetic RGBA (576×288 gradient where pixel value at (x,y)
 * = (y*576 + x) mod 256) is fed to `buildHudTiles()`. Each of the 4 resulting
 * PNG tile `bytes` is SHA-256-hashed (Node `crypto.createHash`, the synchronous
 * API — NOT `crypto.subtle.digest`) and compared against a committed golden
 * fixture at `packages/shared-render/src/fixtures/status-hud.raster-hash.json`.
 *
 * # First-run semantics
 *
 * If the fixture file does not exist, the test generates and writes it (mirroring
 * Vitest `toMatchFileSnapshot` semantics for ASCII fixtures) and returns green.
 * Subsequent runs compare the computed hashes against the committed fixture and
 * fail loudly on any drift — establishing the INV-1 raster contract.
 *
 * # Why synthetic RGBA (not canvas-text output)
 *
 * Canvas text rendering is non-deterministic across environments (happy-dom,
 * Node versions, platform font rendering). The locked decision RINV-01 explicitly
 * forbids hashing canvas-text output. The synthetic gradient is reproducible
 * byte-for-byte from code, requires no binary blobs, and is the same generator
 * used by `hud-raster-frame.test.ts`.
 *
 * # Hash algorithm
 *
 * SHA-256 via Node `crypto.createHash('sha256')` — zero wasm-init cost,
 * deterministic, consistent with the `perf-probe-hash.test.ts` sha256-truncated
 * precedent. xxhash-wasm is reserved for the Phase 24 runtime delta loop.
 *
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (`buildHudTiles` signature)
 * @see packages/shared-render/src/fixtures/status-hud.raster-hash.json (golden fixture)
 * @see .planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-02-PLAN.md (RINV-01)
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHudTiles } from '../hud/hud-raster-frame.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FRAME_W = 576;
const FRAME_H = 288;

/**
 * Path to the committed golden fixture file.
 * Relative from `packages/g2-app/src/__tests__/` up 3 levels to `packages/`,
 * then into `shared-render/src/fixtures/`.
 */
const FIXTURE_PATH = path.resolve(
  import.meta.dirname,
  '../../../shared-render/src/fixtures/status-hud.raster-hash.json',
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate the canonical synthetic RGBA for RINV-01.
 *
 * Pixel value at (x, y) = (y * FRAME_W + x) mod 256. All channels R=G=B=v,
 * alpha=255. Identical to the generator in `hud-raster-frame.test.ts` —
 * this is the RINV-01 canonical source and must NOT be changed without updating
 * the committed fixture.
 *
 * @returns A 576×288×4 Uint8ClampedArray deterministic gradient.
 */
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

/**
 * Compute SHA-256 hex digest of `data`.
 *
 * Uses Node `crypto.createHash` (synchronous) — NOT the async Web Crypto
 * `crypto.subtle.digest` API. This keeps fixture generation synchronous and
 * avoids any async/Promise complexity in the test body.
 *
 * @param data Raw bytes to hash.
 * @returns 64-char lowercase hex string.
 */
function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// ── Fixture schema type ───────────────────────────────────────────────────────

interface RasterHashFixture {
  version: number;
  description: string;
  tiles: Array<{
    index: number;
    containerName: string;
    sha256: string;
  }>;
}

// ── RINV-01 test suite ────────────────────────────────────────────────────────

describe('RINV-01: raster INV-1 SHA-256 tile hashes', () => {
  it('RINV-01: tile hashes match committed fixture', () => {
    // Build tiles from the canonical synthetic RGBA
    const rgba = makeSyntheticRgba();
    const tiles = buildHudTiles(rgba);

    // Guard: buildHudTiles must return exactly 4 tiles
    expect(tiles).toHaveLength(4);

    // Compute SHA-256 hash for each tile
    const hashes = tiles.map((t) => sha256hex(t.bytes));

    if (!existsSync(FIXTURE_PATH)) {
      // First run: generate and write the fixture (toMatchFileSnapshot semantics).
      // This is always green — subsequent runs perform the comparison.
      console.info('[EVF] RINV-01: fixture absent — generating', FIXTURE_PATH);

      const fixture: RasterHashFixture = {
        version: 1,
        description: 'SHA-256 hashes of 4 HUD tile PNGs from canonical synthetic RGBA (Phase 20)',
        tiles: tiles.map((t, i) => ({
          index: i,
          containerName: t.containerName,
          sha256: hashes[i] ?? '',
        })),
      };

      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
      console.info('[EVF] RINV-01: fixture written — re-run to verify stability');

      // First run is always green (fixture generation, not comparison)
      return;
    }

    // Subsequent runs: compare computed hashes against committed fixture
    const raw = readFileSync(FIXTURE_PATH, 'utf8');
    const fixture = JSON.parse(raw) as RasterHashFixture;

    expect(fixture.tiles).toHaveLength(4);

    for (let i = 0; i < 4; i++) {
      const fixtureEntry = fixture.tiles[i];
      const computed = hashes[i];

      expect(fixtureEntry).toBeDefined();
      expect(computed).toBeDefined();

      // Core RINV-01 assertion: SHA-256 of tile PNG bytes must match fixture
      expect(
        computed,
        `[EVF] RINV-01: tile ${i} (${fixtureEntry?.containerName}) SHA-256 mismatch — raster pipeline is non-deterministic or the fixture is stale`,
      ).toBe(fixtureEntry?.sha256);
    }
  });
});
