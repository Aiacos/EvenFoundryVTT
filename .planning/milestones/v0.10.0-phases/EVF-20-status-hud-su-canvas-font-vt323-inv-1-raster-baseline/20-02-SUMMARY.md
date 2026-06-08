---
phase: 20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
plan: 02
subsystem: testing
tags: [raster, inv-1, sha256, golden-fixture, buildHudTiles, determinism]

# Dependency graph
requires:
  - phase: 19-hud-raster-rendering
    provides: buildHudTiles() pipeline (400x200 RGBA → 4 dithered 4-bit PNG tiles)
  - phase: 20-01
    provides: "@fontsource/vt323 installed; CanvasLayer.attachCanvas signature updated to Promise<void>"
provides:
  - "RINV-01 raster INV-1 contract: deterministic SHA-256 hashes of 4 HUD tile PNGs"
  - "status-hud.raster-hash.json golden fixture (4 tiles, 64-char hex each)"
  - "20-raster-inv1.test.ts suite discoverable by --testNamePattern RINV-01"
affects:
  - "20-04: checkInv1Raster uses --testNamePattern RINV-01 to run this suite"
  - "Phase 24: delta loop builds on same buildHudTiles pipeline whose determinism is now locked"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SHA-256 golden fixture pattern (raster analog to ASCII .txt fixtures)"
    - "First-run fixture generation: write if absent, compare on subsequent runs"
    - "Node crypto.createHash('sha256') sync API for deterministic test hashing"

key-files:
  created:
    - packages/g2-app/src/__tests__/20-raster-inv1.test.ts
    - packages/shared-render/src/fixtures/status-hud.raster-hash.json
  modified: []

key-decisions:
  - "Path depth from packages/g2-app/src/__tests__/ to shared-render/src/fixtures/ is 3 levels (../../../), not 4 as stated in plan — corrected"
  - "Biome auto-format applied after initial write (multi-line function call reformatted to single-line template string)"
  - "Fixture generation semantics: first run writes, subsequent runs compare (consistent with toMatchFileSnapshot convention)"

patterns-established:
  - "RINV-01: raster INV-1 contract uses SHA-256 of PNG bytes from deterministic synthetic RGBA, not canvas-text output"
  - "makeSyntheticRgba() canonical generator: pixel(x,y) = (y*400+x)%256, copied verbatim from hud-raster-frame.test.ts"

requirements-completed: [RINV-01]

# Metrics
duration: 6min
completed: 2026-06-06
---

# Phase 20 Plan 02: RINV-01 Raster INV-1 SHA-256 Tile Hashes Summary

**Raster INV-1 contract established: deterministic synthetic RGBA → buildHudTiles() → 4 SHA-256 PNG tile hashes committed as golden fixture in shared-render/src/fixtures/**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-06T07:55:27Z
- **Completed:** 2026-06-06T08:01:27Z
- **Tasks:** 1/1
- **Files modified:** 2

## Accomplishments

- Created `20-raster-inv1.test.ts` under `packages/g2-app/src/__tests__/` with the RINV-01 raster suite.
- Generated and committed `status-hud.raster-hash.json` with 4 tile entries (64-char SHA-256 hex each).
- Test is discoverable by `--testNamePattern RINV-01` (used by plan 20-04's `checkInv1Raster`).
- Hashes verified stable across 3 consecutive runs (first run: fixture generation; runs 2+3: comparison passes, no git diff on fixture).
- Typecheck (`pnpm --filter @evf/g2-app exec tsc --noEmit`) and Biome CI both green.
- No `fillText` in test file (RINV-01 locked decision: no canvas-text hashing).

## Commits

| Hash | Message |
|------|---------|
| `0e98673` | test(20-02): RINV-01 raster INV-1 SHA-256 tile hashes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture path depth corrected**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified `../../../../shared-render/src/fixtures/` (4 levels up from `__tests__/`). The actual path from `packages/g2-app/src/__tests__/` to `packages/shared-render/src/fixtures/` is 3 levels up (`../../../`). Using 4 levels would resolve to the workspace root.
- **Fix:** Used `path.resolve(import.meta.dirname, '../../../shared-render/src/fixtures/status-hud.raster-hash.json')`.
- **Files modified:** `packages/g2-app/src/__tests__/20-raster-inv1.test.ts`
- **Commit:** `0e98673`

**2. [Rule 1 - Bug] Biome formatting applied**
- **Found during:** Task 1 verification (lint:ci step)
- **Issue:** Initial file had multi-line `console.info(...)` call that Biome reformats to a single-line template string. `biome ci` reported a formatting error.
- **Fix:** `pnpm exec biome format --write` applied automatically.
- **Files modified:** `packages/g2-app/src/__tests__/20-raster-inv1.test.ts`
- **Commit:** `0e98673` (formatting applied before commit)

## Known Stubs

None — the fixture contains real computed values, not placeholders. All 4 `sha256` fields are 64-char hex strings computed from the deterministic synthetic RGBA.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns (test-only filesystem write to `packages/shared-render/src/fixtures/`), or schema changes at trust boundaries introduced.

## Self-Check: PASSED

- `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` — FOUND
- `packages/shared-render/src/fixtures/status-hud.raster-hash.json` — FOUND (4 sha256 entries)
- Commit `0e98673` — FOUND (`git log --oneline -1` = `0e98673 test(20-02): RINV-01 raster INV-1 SHA-256 tile hashes`)
- `--testNamePattern RINV-01` — 1 passed, 1500 skipped
- No `fillText` in test file — confirmed (grep returns 0)
- Fixture stable across runs — confirmed (no git diff after 3rd run)
