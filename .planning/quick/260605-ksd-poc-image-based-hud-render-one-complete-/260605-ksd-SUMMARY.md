---
phase: quick-260605-ksd
plan: 01
subsystem: g2-app/hud
tags: [raster, hud, poc, image-containers, canvas, dither, png, adr-0013]
dependency_graph:
  requires:
    - packages/g2-app/src/raster/raster-worker.ts  # dither palette pattern source
    - packages/g2-app/src/raster/raster-controller.ts  # updateImageRawData push pattern
    - packages/g2-app/src/engine/container-registry.ts  # ImageContainerProperty pattern
    - packages/g2-app/src/engine/page-lifecycle.ts  # createStartUpPageContainer pattern
    - packages/g2-app/src/internal/launch.ts  # ?actor= URL flag pattern
    - packages/shared-protocol/src/payloads/character.ts  # CharacterSnapshotSchema
  provides:
    - packages/g2-app/src/hud/hud-canvas-renderer.ts  # renderHudFrame
    - packages/g2-app/src/hud/hud-raster-frame.ts  # buildHudTiles + HUD_TILE_GEOMETRY
    - packages/g2-app/src/hud/hud-poc-page.ts  # HUD_POC_CONTAINERS + createHudPocPage + pushHudTiles
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts  # bootHudRasterPoc
  affects:
    - packages/g2-app/src/internal/launch.ts  # added ?hud=raster branch + bootHudRasterPoc dep
tech_stack:
  added: []
  patterns:
    - image-q Floyd-Steinberg dither (replicated from raster-worker, not imported)
    - UPNG.encode 4-bit indexed PNG (replicated from raster-worker)
    - CharacterSnapshotSchema.safeParse JSON gate (T-ksd-01)
    - LaunchDeps injectable seam extended with bootHudRasterPoc
key_files:
  created:
    - packages/g2-app/src/hud/hud-canvas-renderer.ts
    - packages/g2-app/src/hud/hud-raster-frame.ts
    - packages/g2-app/src/hud/hud-poc-page.ts
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
    - packages/g2-app/src/hud/hud-raster-frame.test.ts
    - packages/g2-app/src/hud/hud-poc-page.test.ts
  modified:
    - packages/g2-app/src/internal/launch.ts
decisions:
  - "index.ts left untouched — direct import of bootHudRasterPoc in launch.ts is W-4-clean (no DI literals)"
  - "Error message kept as 'bootEngine failed' in catch block to preserve existing LAUNCH-FAILSOFT test assertion"
  - "Import order follows Biome's alphabetical rule (hud/ before index.js)"
metrics:
  duration: 14m
  completed: "2026-06-05T13:19:17Z"
  tasks_completed: 3
  files_created: 6
  files_modified: 1
---

# Phase quick-260605-ksd Plan 01: Image-based HUD PoC (single frame) Summary

**One-liner:** 4-tile 288×144 raster HUD PoC draws character status sheet via 14px canvas font + Floyd-Steinberg dither + 4-bit PNG tiles behind `?hud=raster` flag, leaving normal text-HUD boot byte-identical.

## What Was Built

### Task 1: HUD canvas renderer + raster frame assembler (TDD)

- `hud-canvas-renderer.ts`: `renderHudFrame(snapshot, {width,height}) → Uint8ClampedArray`
  - Draws on a 2D canvas (576×288) with `14px monospace` font (compact vs SDK 27px)
  - Black background, white text — dithered to phosphor green on the G2
  - Draws: name+Lv, divider, HP bar (filled rect) + fraction, CA + VEL, Turn/Round, Cond, divider, spell slots, death saves
  - Environment-aware: `document.createElement('canvas')` in WebView/sim, `OffscreenCanvas` in Workers, throws if neither (test safety)

- `hud-raster-frame.ts`: `buildHudTiles(rgba) → HudTile[]` + `HUD_TILE_GEOMETRY`
  - Replicates `buildGreyscalePalette` + `ditherTile` + `UPNG.encode` from `raster-worker.ts` (NOT imported — worker module scope)
  - Slices 576×288 RGBA into 4×288×144 tile buffers (row-by-row copy, TL/TR/BL/BR)
  - Each tile: greyscale dither → `UPNG.encode([…], 288, 144, 16)` → `new Uint8Array(png)`
  - Throws `Error` with message matching `/expected 576\*288\*4/` on wrong input length
  - No xxhash / delta / RLE — single frame PoC

- Tests: 11 specs covering tile geometry assertions, 4-tile return, ids 0..3 in order, TL≠BR pixel proof, wrong-length throws

### Task 2: PoC page + push + isolated boot (TDD)

- `hud-poc-page.ts`:
  - `HUD_POC_CONTAINERS` — frozen array of 4 container defs (id, x, y, w, h)
  - `buildHudPocPageSchema()` → `{containerTotalNum: 4, imageObject: 4×ImageContainerProperty, textObject: []}`
  - `createHudPocPage(bridge)` — creates the page, throws on non-success (mirrors `createBootPage`)
  - `pushHudTiles(bridge, tiles)` — pushes each tile via `ImageRawDataUpdate`, `console.warn` on non-success (never throws)

- `boot-hud-raster-poc.ts`: `bootHudRasterPoc(opts)` — isolated 7-step PoC boot sequence
  - installHubPolyfill → waitForEvenAppBridge → createHudPocPage → fetch snapshot → renderHudFrame → buildHudTiles → pushHudTiles
  - `CharacterSnapshotSchema.safeParse` gates the REST JSON (T-ksd-01)
  - Em-dash fallback snapshot when characterId absent or fetch/parse fails (always draws something)
  - Entire body wrapped in try/catch → `console.error` (fail-soft, never rejects)
  - SINGLE FRAME — no Worker, no delta re-render

- Tests: 13 specs covering container geometry, schema shape, 4 updateImageRawData calls, non-success warning path

### Task 3: Wire `?hud=raster` in launch.ts (guarded, isolated)

- Added `bootHudRasterPoc` to `LaunchDeps` interface with JSDoc
- Added `bootHudRasterPoc` to the default `deps` object
- In no-auth branch: read `?hud=` from URLSearchParams alongside `?actor=`
- `hudMode === 'raster'` → calls `deps.bootHudRasterPoc(...)` INSTEAD of `deps.bootEngine`
- All other `hudMode` values (null/absent/other) → fall through to existing `deps.bootEngine` call — BYTE-IDENTICAL
- index.ts untouched (direct import in launch.ts is W-4-clean — no `wsFactory`/`bridgeFactory` literals)

## Deviations from Plan

None — plan executed exactly as written.

**Notes:**
- The error message `'[EVF] launch: bootEngine failed'` was preserved in the catch block (the plan did not specify a message change, and the existing LAUNCH-FAILSOFT test asserts on it). Both the raster PoC and normal boot share the same try/catch — the message is accurate for both.
- `index.ts` was NOT modified (as the plan explicitly allows when a direct import doesn't trip W-4).

## Threat Mitigation Coverage

| ID | Mitigation | Status |
|----|-----------|--------|
| T-ksd-01 | `CharacterSnapshotSchema.safeParse` gates REST JSON in `boot-hud-raster-poc.ts#fetchSnapshot` | Implemented |
| T-ksd-02 | Single fetch attempt, try/catch fail-soft, no retry storm | Implemented |
| T-ksd-SC | No new deps — reuses existing `image-q` + `upng-js` (vetted in ADR-0006) | Confirmed |

## Known Stubs

None that affect plan goal. All em-dash placeholders are INTENTIONAL:
- `Turno —  Round —  [—]` — turn/round data not in CharacterSnapshot (tracked as HUD-27PX TODO)
- `VEL —` — speed not in CharacterSnapshot (tracked as HUD-27PX TODO)
- The fallback snapshot in `boot-hud-raster-poc.ts` is intentional (shows when no actor is pinned or fetch fails)

The PoC goal (render ONE image-based HUD frame under `?hud=raster`) is fully achieved.

## Test Results

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| hud/hud-raster-frame.test.ts | 1 | 11 | PASS |
| hud/hud-poc-page.test.ts | 1 | 13 | PASS |
| __tests__/launch.test.ts | 1 | 6 | PASS |
| __tests__/launch-actor.test.ts | 1 | 2 | PASS |
| Full g2-app suite | 100 | 1459 | PASS |

## Self-Check: PASSED

Files created:
- packages/g2-app/src/hud/hud-canvas-renderer.ts: FOUND
- packages/g2-app/src/hud/hud-raster-frame.ts: FOUND
- packages/g2-app/src/hud/hud-poc-page.ts: FOUND
- packages/g2-app/src/hud/boot-hud-raster-poc.ts: FOUND
- packages/g2-app/src/hud/hud-raster-frame.test.ts: FOUND
- packages/g2-app/src/hud/hud-poc-page.test.ts: FOUND

Commits:
- fbaf541: test(quick-260605-ksd-01): RED test — tile geometry + assembler
- b47f9a0: feat(quick-260605-ksd-01): HUD canvas renderer + raster frame assembler
- c1e60ac: test(quick-260605-ksd-02): RED test — PoC page schema + pushHudTiles
- 122ffe7: feat(quick-260605-ksd-02): PoC page (4 image containers) + push + isolated boot
- a11ec05: feat(quick-260605-ksd-03): wire ?hud=raster trigger in launch

All commits exist in git history. All tests pass. biome + tsc clean.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (Task 1) | fbaf541 `test(quick-260605-ksd-01):` | PASSED |
| GREEN (Task 1) | b47f9a0 `feat(quick-260605-ksd-01):` | PASSED |
| RED (Task 2) | c1e60ac `test(quick-260605-ksd-02):` | PASSED |
| GREEN (Task 2) | 122ffe7 `feat(quick-260605-ksd-02):` | PASSED |
