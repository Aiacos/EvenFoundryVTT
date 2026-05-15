---
phase: 04a
plan: 03
subsystem: g2-app
tags: [g2-app, raster, web-worker, image-q, upng-js, xxhash-wasm, glyph-fallback, wave-2]
dependency_graph:
  requires:
    - "Wave 0 contracts (layer-types.ts → ZIndex / Layer / RasterControllerLike / RasterRequest / RasterResponse / RasterChangedTile / RasterFrameInput)"
    - "Wave 1 engine (layer-manager.ts getMapMode() — Plan 02)"
    - "Wave 0 test seam (packages/g2-app/src/__tests__/test-helpers/worker-mock.ts — createMockWorker)"
    - "shared-render AsciiGrid (constructor + toString() for the glyph grid)"
    - "@evenrealities/even_hub_sdk@0.0.10 EvenAppBridge + ImageRawDataUpdate + ImageRawDataUpdateResult.isSuccess + TextContainerUpgrade"
    - "image-q@4.0.0 (PointContainer.fromUint8Array + applyPaletteSync({imageQuantization:'floyd-steinberg'}) + utils.Palette + utils.Point.createByRGBA)"
    - "upng-js@2.1.0 UPNG.encode(imgs, w, h, cnum) (ambient typings in packages/g2-app/src/types/upng-js.d.ts)"
    - "xxhash-wasm@1.1.0 default-export factory → XXHashAPI.h32Raw(Uint8Array)"
  provides:
    - "TileDelta pure utility: xxhash sub-tile delta table (4×18=72 sub-tile floor; ?? 0 noUncheckedIndexedAccess guards)"
    - "encodeRle4bit / decodeRle4bit pure functions: 4-bit nibble run-length codec with byte-level roundtrip identity, 255-cap chunk splitting, and `RLE encode`/`RLE decode` error prefixes"
    - "buildGlyphGrid(scene) + renderGlyphScene(bridge, scene) — Branch B/C glyph fallback with UI-SPEC §Glyph Dictionary canonical mapping"
    - "MapBaseLayer implements Layer at ZIndex.Z0_MAP; owns 'map-capture' container; mode-routed draw via RasterControllerLike (type-only) / glyph renderer"
    - "RasterController class implements RasterControllerLike (B-4 closure): Worker lifecycle, frameId-correlated postMessage, 200 ms debounce, 0.3 fps idle heartbeat, 3-failure/5 s → BLE glyph fallback"
    - "raster-worker.ts singleton Web Worker: 10-stage pipeline (greyscale → image-q Floyd-Steinberg dither → 4× tile split → 18 sub-tile xxhash with boundary absorption [right 8 px + bottom 4 px] → TileDelta detect → per-tile RLE telemetry + upng-js 4-bit indexed PNG encode → postMessage transferable)"
    - "types/upng-js.d.ts ambient declarations (no @types/upng-js on npm)"
  affects:
    - "Plan 04 (Status HUD) — independent at file level; will mount StatusHudLayer at z=1 alongside MapBaseLayer at z=0"
    - "Plan 05 (smoke / ADR-0009 acceptance) — composes LayerManager + MapBaseLayer + StatusHudLayer + IdleInfillLayer to exercise the atomic-bundle path"
    - "Plan 06 (Foundry canvas extractor + WS receiver) — owns the pixel-data ingress; calls RasterController.requestFrame(pixelData, w, h) and MapBaseLayer.setScene"
    - "Phase 4b (Quick Action [M] Map mode wiring) — flips layerManager.setMapMode() to force raster ↔ glyph"
tech-stack:
  added:
    - "image-q@4.0.0 (Floyd-Steinberg dither against 16-step greyscale palette — first runtime consumer)"
    - "upng-js@2.1.0 (4-bit indexed PNG encode via cnum=16 — first runtime consumer)"
    - "xxhash-wasm@1.1.0 (h32Raw 32-bit sub-tile hash — first runtime consumer)"
  patterns:
    - "Vite-canonical Worker URL pattern: `new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })` (RESEARCH.md Pitfall 4)"
    - "WorkerLike test seam: constructor-injected workerFactory option lets unit tests substitute the real Worker with createMockWorker without monkey-patching globalThis"
    - "noUncheckedIndexedAccess discipline: every typed-array read uses `?? 0` (AsciiGrid precedent line 22)"
    - "B-4 forward-import-cycle resolution: `import type { RasterControllerLike }` from layer-types.ts in Task 2 (MapBaseLayer); concrete class `implements RasterControllerLike` in Task 3 — atomic commits compile standalone"
    - "Pipeline error propagation: Worker `try/catch` re-emits failures as RasterResponse.error instead of throwing (Worker throw kills the entire pipeline per Specs §11.5.8.4)"
    - "Result-enum success gate: every updateImageRawData result checked via ImageRawDataUpdateResult.isSuccess (NEVER bare `=== true` per Pitfall 6)"
    - "Frame-id correlation Map + sliding-window failure counter (3 in 5 s → glyph) without retry storm"
key-files:
  created:
    - "packages/g2-app/src/raster/tile-delta.ts"
    - "packages/g2-app/src/raster/rle-encoder.ts"
    - "packages/g2-app/src/raster/glyph-renderer.ts"
    - "packages/g2-app/src/raster/map-base-layer.ts"
    - "packages/g2-app/src/raster/raster-worker.ts"
    - "packages/g2-app/src/raster/raster-controller.ts"
    - "packages/g2-app/src/types/upng-js.d.ts"
    - "packages/g2-app/src/raster/__tests__/tile-delta.test.ts"
    - "packages/g2-app/src/raster/__tests__/rle-encoder.test.ts"
    - "packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts"
    - "packages/g2-app/src/raster/__tests__/map-base-layer.test.ts"
    - "packages/g2-app/src/raster/__tests__/raster-controller.test.ts"
  modified: []
key-decisions:
  - "image-q v4 API shape (Open Question A1 resolved): the documented `ImageQ.ErrorDiffusionArray` constructor pattern from training data does NOT exist on v4. The actual v4 API is functional: `ImageQ.utils.PointContainer.fromUint8Array(rgba, w, h)` → `ImageQ.applyPaletteSync(image, palette, { imageQuantization: 'floyd-steinberg', colorDistanceFormula: 'euclidean-bt709' })`. The greyscale palette is built via `new ImageQ.utils.Palette()` + 16× `pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255))` for v = 0, 16, 32, ..., 240."
  - "xxhash-wasm@1.1.0 API shape: the package's `types.d.ts` exports a default async factory (`xxhash(): Promise<XXHashAPI>`), NOT a named `createXXHash3`. Raster worker uses `import xxhash from 'xxhash-wasm'` then `await xxhash()` to obtain the API. Sub-tile hashes use `api.h32Raw(Uint8Array)` returning a 32-bit number."
  - "upng-js@2.1.0 has no shipped types and no @types/upng-js on npm. Hand-rolled ambient declarations live in packages/g2-app/src/types/upng-js.d.ts (narrow surface — encode only). UPNG.encode signature is `(imgs: ArrayBuffer[], w, h, cnum, [dels])` — `cnum=16` produces a 4-bit indexed PNG (matches G2 wire format)."
  - "Sub-tile floor decision documented in raster-worker.ts (B-2 user resolution 2026-05-15; locked at 18 sub-tiles/tile floor = 72 per frame; right-edge 8 px + bottom-edge 4 px absorbed via boundary padding using pixel-block slice extension at hash time). The `new TileDelta(4, 18)` literal is mirrored next to the named constants `TILES_PER_FRAME=4` / `SUB_TILES_PER_TILE=18` so both the B-2 verification grep and INV-4 readability constraint are satisfied simultaneously."
  - "WorkerLike test seam: rather than monkey-patching globalThis.Worker (which happy-dom 20.x cannot dispatch postMessage onto reliably), the production code exposes a `workerFactory` option in `RasterControllerOptions`. Production callers omit the option (default uses `new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })`); tests pass `createMockWorker()` from the Plan 01 worker-mock helper."
  - "B-4 forward-contract closure verified at both ends: MapBaseLayer (Task 2 commit ca8fa80) imports `RasterControllerLike` type-only from ../engine/layer-types.js — `! grep -E \"from .['\\\"]\\\\./raster-controller\" packages/g2-app/src/raster/map-base-layer.ts` returns 0 occurrences. RasterController (Task 3 commit 4c33843) declares `class RasterController implements RasterControllerLike` so the type-level contract is enforced by the TS compiler. Both task-boundary typechecks pass independently."
  - "ImageRawDataUpdateResult enum values observed in the SDK: success / imageException / imageSizeInvalid / imageToGray4Failed / sendFailed (5-value enum per SDK index.d.ts:589). All non-success values are counted toward the consecutive-failure counter; the controller does not discriminate further (any non-success in 3 of 5 s → glyph fallback). Future enhancement could differentiate sendFailed (transient BLE) from imageSizeInvalid (programmer error) — out of scope for Plan 03 (4a-03)."
  - "Vite + xxhash-wasm WASM bundling (Open Question 2 resolved): no plugin needed. The plain `import xxhash from 'xxhash-wasm'` works in the Vite Worker bundle because xxhash-wasm@1.1.0 ships separate `esm/` and `workerd/` entries (verified via the package's `package.json` and the on-disk node_modules layout). Runtime hardware verification of the actual fetch path is human_needed per ADR-0005."
requirements-completed: [MAP-02, MAP-03, MAP-04]
metrics:
  duration_minutes: 19
  completed_date: "2026-05-15"
  tasks_completed: 3
  files_created: 12
  files_modified: 0
  commits: 3
---

# Phase 04a Plan 03: G2 Engine + Raster + Status HUD — Wave 2 Raster Pipeline Summary

**One-liner:** Lands the complete Branch A raster pipeline (image-q Floyd-Steinberg dither + xxhash sub-tile delta with B-2 boundary absorption + upng-js 4-bit indexed PNG) as a singleton Web Worker driven by a debounced + heartbeat-aware main-thread RasterController, plus the Branch B/C glyph fallback renderer, all wired into a single z=0 MapBaseLayer that closes the B-4 forward-import-cycle with the Plan 01 RasterControllerLike contract.

## Performance

- **Duration:** ~19 min
- **Started:** 2026-05-15T06:49:01Z
- **Completed:** 2026-05-15T07:09:07Z
- **Tasks:** 3
- **Files created:** 12 (6 source + 5 test + 1 ambient .d.ts)
- **Files modified:** 0
- **Commits:** 3 (atomic per task)

## Accomplishments

- **Raster path (MAP-03 + MAP-04 software-side):** Full 10-stage pipeline runs in a singleton Web Worker. Sub-tile delta detection skips re-encoding for static scenes — only changed tiles dispatch a `bridge.updateImageRawData` call.
- **Glyph path (MAP-02):** `buildGlyphGrid(scene)` produces a uniform-width `AsciiGrid` honoring the UI-SPEC §Glyph Dictionary verbatim (PC `@`, enemy `<letter><digit>` from id, NPC `N`, object `o`, facing arrows `▶◀▲▼`, terrain `░`/`▒`/`▓`/`~`/`≡`/`·`). `renderGlyphScene(bridge, scene)` dispatches a single `textContainerUpgrade` against `map-capture`.
- **Mode routing (MAP-02 toggle):** `MapBaseLayer.draw()` resolves `'auto'` → `'raster' | 'glyph'` using the controller's BLE verdict (raster default while pending). `LayerManager.setMapMode()` is the orthogonal manual override (Plan 02).
- **Failure-mode graceful degrade (B-2 threat T-4a-03-04):** 3 consecutive `!ImageRawDataUpdateResult.isSuccess` results within a 5 s window flip the BLE verdict to `'glyph'` — no retry storm.
- **34 colocated TDD tests** green under happy-dom (6 tile-delta + 5 rle-encoder + 6 glyph-renderer + 8 map-base-layer + 9 raster-controller). Workspace-wide: 512 tests across 35 files.

## Task Commits

Each task was committed atomically:

1. **Task 1: tile-delta + rle-encoder pure utilities (TDD)** — `8e606a4` (feat) — 11 tests
2. **Task 2: glyph-renderer + MapBaseLayer (TDD)** — `ca8fa80` (feat) — 14 tests
3. **Task 3: raster-worker + RasterController (TDD)** — `4c33843` (feat) — 9 tests

Plan metadata commit will follow upon SUMMARY.md staging.

## Files Created

### Source

- `packages/g2-app/src/raster/tile-delta.ts` — TileDelta class (xxhash delta table; `?? 0` guards; `reset()`/`detectChanges()` API).
- `packages/g2-app/src/raster/rle-encoder.ts` — `encodeRle4bit` / `decodeRle4bit` pure functions; 255-cap chunk split; `RLE encode`/`RLE decode` error prefixes.
- `packages/g2-app/src/raster/glyph-renderer.ts` — `buildGlyphGrid(scene)` + `renderGlyphScene(bridge, scene, [containerName])`; canonical UI-SPEC §Glyph Dictionary mapping.
- `packages/g2-app/src/raster/map-base-layer.ts` — `MapBaseLayer implements Layer`; capture-container provider; mode-routed `draw()`; `setScene(MapSceneInput)` cache.
- `packages/g2-app/src/raster/raster-worker.ts` — singleton Web Worker entry: `self.onmessage` 10-stage pipeline with `new TileDelta(4, 18)` boundary-absorption geometry.
- `packages/g2-app/src/raster/raster-controller.ts` — `class RasterController implements RasterControllerLike`; Vite-canonical Worker URL pattern; debounce + heartbeat + failure-counter; `workerFactory` test seam.
- `packages/g2-app/src/types/upng-js.d.ts` — ambient declarations for upng-js@2.1.0 (no `@types` package on npm).

### Tests

- `packages/g2-app/src/raster/__tests__/tile-delta.test.ts` — 6 tests (TD-1..TD-6).
- `packages/g2-app/src/raster/__tests__/rle-encoder.test.ts` — 5 tests (RLE-1..RLE-5).
- `packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts` — 6 tests (GR-1..GR-6).
- `packages/g2-app/src/raster/__tests__/map-base-layer.test.ts` — 8 tests (MBL-1..MBL-7 + MBL-5 raster-default sub-case).
- `packages/g2-app/src/raster/__tests__/raster-controller.test.ts` — 9 tests (RC-1..RC-9).

**Total: 34 tests (target ≥32 per plan output spec).**

## Decisions Made

See `key-decisions` frontmatter. Highlights:

- Adapted to the **actual image-q v4 functional API** rather than the training-data shape documented in PLAN.md `<interfaces>`. Worker uses `applyPaletteSync(...,{ imageQuantization: 'floyd-steinberg' })` — not the non-existent `ErrorDiffusionArray` class.
- **xxhash-wasm default-export factory:** `import xxhash from 'xxhash-wasm'` then `await xxhash()` → `XXHashAPI.h32Raw`. Plan's `createXXHash3` reference was incorrect for v1.1.0.
- **upng-js cnum-only API:** the real `UPNG.encode` signature is `(imgs, w, h, cnum, [dels])`. Setting `cnum=16` yields a 4-bit indexed PNG (matches G2 wire format). The plan's `UPNG.encode([buf], w, h, 16, [], 4)` had an extra trailing `4` that does not exist.
- **WorkerLike test seam** instead of `vi.stubGlobal('Worker', ...)`: cleaner injection model, no global mutation, the production code still uses the Vite-canonical URL literal exactly so the bundler still emits the worker chunk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Corrected image-q API usage**
- **Found during:** Task 3 (raster-worker.ts implementation)
- **Issue:** PLAN.md `<interfaces>` block documented an `ImageQ.ErrorDiffusionArray` class + Floyd-Steinberg kernel constructor pattern from training data. This API does NOT exist in image-q@4.0.0 (verified via the actual `dist/types/src/basicAPI.d.ts` shape: functional `applyPaletteSync(image, palette, { imageQuantization: 'floyd-steinberg' })`).
- **Fix:** Used the real v4 functional API. Built the 16-step greyscale palette via `new ImageQ.utils.Palette()` + 16× `pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255))` for `v = 0, 16, ..., 240`. The plan reserved §Open Question A1 explicitly for "verify image-q API at implementation per RESEARCH §Open Question 4" — this resolves it.
- **Files modified:** `packages/g2-app/src/raster/raster-worker.ts`
- **Verification:** `pnpm typecheck && pnpm test` pass.
- **Committed in:** `4c33843` (Task 3 commit)

**2. [Rule 1 — Bug] Corrected xxhash-wasm import shape**
- **Found during:** Task 3 (raster-worker.ts implementation)
- **Issue:** PLAN.md referenced `createXXHash3` named export from xxhash-wasm. The actual v1.1.0 package exports a default async factory (`xxhash(): Promise<XXHashAPI>`); there is no `createXXHash3`.
- **Fix:** Used `import xxhash from 'xxhash-wasm'`, then `xxhashApi = await xxhash()`, then `xxhashApi.h32Raw(Uint8Array)` for sub-tile hashes. The plan reserved §Open Question 2 for "Vite + xxhash-wasm WASM bundling" — verified in this commit that no plugin is needed.
- **Files modified:** `packages/g2-app/src/raster/raster-worker.ts`
- **Verification:** `pnpm typecheck && pnpm test` pass.
- **Committed in:** `4c33843`

**3. [Rule 1 — Bug] Corrected upng-js encode signature**
- **Found during:** Task 3 (raster-worker.ts implementation)
- **Issue:** PLAN.md documented `UPNG.encode([buf], w, h, 16, [], 4)` (6 args, with a trailing depth=4). The real signature per the upstream README is `UPNG.encode(imgs, w, h, cnum, [dels])` (5 args max). `cnum=16` is what produces a 4-bit indexed PNG — there is no separate depth parameter.
- **Fix:** `UPNG.encode([ditheredRgba.buffer], TILE_W, TILE_H, 16)` (4 args). Also added `packages/g2-app/src/types/upng-js.d.ts` ambient declarations (no `@types/upng-js` on npm) with the correct narrow signature.
- **Files modified:** `packages/g2-app/src/raster/raster-worker.ts`, `packages/g2-app/src/types/upng-js.d.ts`
- **Verification:** `pnpm typecheck && pnpm test` pass.
- **Committed in:** `4c33843`

**4. [Rule 3 — Blocking] Added WorkerLike interface for test seam**
- **Found during:** Task 3 (raster-controller.ts test design)
- **Issue:** happy-dom 20.x cannot dispatch postMessage to a `new Worker(new URL(...))` constructor under unit-test conditions (RESEARCH.md Pitfall 4 documents this explicitly). The plan's test design required intercepting the Worker constructor.
- **Fix:** Introduced `WorkerLike` interface + `RasterControllerOptions.workerFactory` constructor option. Production callers omit the option (default falls back to the Vite-canonical `new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })`); tests pass `() => createMockWorker()` from the Plan 01 worker-mock helper. The URL literal is preserved verbatim in the default factory so Vite's static analysis still emits the worker chunk.
- **Files modified:** `packages/g2-app/src/raster/raster-controller.ts`, `packages/g2-app/src/raster/__tests__/raster-controller.test.ts`
- **Verification:** Both the type-check (`pnpm typecheck`) and the 9 RC tests pass; `grep -c "new URL('./raster-worker.ts'" packages/g2-app/src/raster/raster-controller.ts` returns 3 (default factory body + 1 JSDoc occurrence + 1 docblock reference).
- **Committed in:** `4c33843`

---

**Total deviations:** 4 auto-fixed (3 library-shape bugs surfaced at integration time + 1 blocking test-infrastructure gap)
**Impact on plan:** All four corrections are essential for correctness; none expand scope. The three library-shape corrections also explicitly resolve PLAN.md §Open Question A1 (image-q API shape) and §Open Question 2 (xxhash-wasm Vite bundling) — both were listed in the `<output>` spec as items to document upon completion. The WorkerLike seam exists ONLY to satisfy the happy-dom unit-test constraint already documented in RESEARCH.md Pitfall 4; production behavior is unchanged.

## Issues Encountered

- Initial `pnpm --filter @evf/g2-app test --run -- ...` invocation failed because the package's `test` script already includes `--run`, leading to a duplicate-flag error from Vitest's CAC parser. Resolution: invoked vitest directly at the workspace root via `pnpm exec vitest --run --project g2-app <files>` — same coverage gate, no flag collision. (Not a deviation — just a developer-experience papercut around running scoped tests.)
- Native `Worker` type from `lib.webworker.d.ts` is a superset of the minimal `WorkerLike` interface (extra `onmessageerror`, `dispatchEvent`, `addEventListener` members). Required a single `as unknown as WorkerLike` cast inside `defaultWorkerFactory` to satisfy the TS strict assignability check. The cast is documented inline with the rationale.

## TDD Gate Compliance

All three tasks ran a clean RED → GREEN cycle:

- **Task 1 RED:** `vite:import-analysis` reported `Failed to resolve import "../tile-delta.js"` — tests authored before module existed.
- **Task 1 GREEN:** 11 tests pass after implementation.
- **Task 2 RED:** Same import-resolution failure for `../map-base-layer.js`.
- **Task 2 GREEN:** 14 tests pass.
- **Task 3 RED:** Same import-resolution failure for `../raster-controller.js`.
- **Task 3 GREEN:** 9 tests pass.

The plan-level pattern is `feat()` commits with embedded TDD discipline (test + impl in the same atomic commit), not separate `test(...)` then `feat(...)` commits. The commits' subjects are scoped to the user-facing behavior shipped; the tests are part of the same atomic unit per the plan's `task_commit_protocol`.

## Hardware-Pending TODOs

Per ADR-0005 PROVISIONAL Branch A, the following gates inherit `verification_mode: human_needed`:

- **MAP-04 ≥5 fps sustained** in single-token-move scenario — requires real G2 + paired R1 + clean RF environment. Run via `pnpm --filter @evf/validation-harness validate:all` when hardware grants land.
- **MAP-03 BLE p50 latency** in Phase 0 envelope — real BLE measurement.
- **Branch B/C auto-fallback under real <100 kbps RF** — software trigger is fully tested via Plan 02 `probeBleThroughput` + Plan 03 `setBleVerdict`; real-RF probe is hardware-pending.
- **PIXI canvas extract performance** (Foundry desktop UI does NOT stutter during extraction) — owned by Plan 06; perf gate inherits.
- **Worker `cnum=16` actually emits depth=4 indexed PNG on the device** — software path produces a 4-bit indexed PNG (verified via upng-js cnum semantics); hardware accepts it via `updateImageRawData` per ADR-0005 OQ-INV2-1.b.

Inline source markers:

- `raster-worker.ts:108` — `// TODO(ADR-0005): verify 200×100 per tile + 16-color palette on real G2 — human_needed`.

## Cross-Plan Handoff to Plan 06

`RasterController.requestFrame(pixelData, width, height)` is the pixel-data ingress for the raster pipeline. **Plan 03 does NOT extract pixels** — Plan 06 owns:

1. Foundry-side `canvas.app.renderer.extract.pixels()` extraction in `packages/foundry-module/`
2. WS `frame_pixels` envelope (Zod-validated in `packages/shared-protocol/`)
3. `packages/g2-app/src/scene-input.ts` WS receiver that calls `mapBaseLayer.setScene({ pixelData, width: 400, height: 200 })` and, when raster mode is active, the underlying `controller.requestFrame` chain.

Plan 05's smoke test exercises the composed path with a synthetic 400×200 pixel buffer (no Foundry required) to confirm wiring.

## B-2 / B-4 Closure Verification

- **B-2 (sub-tile geometry):** `! grep -rE "subTilesPerTile.*28|28[^0-9].*sub.?tile|new TileDelta\(4, 28\)" packages/g2-app/src/raster/` → zero hits. `grep -c "new TileDelta(4, 18)" packages/g2-app/src/raster/raster-worker.ts` → 2 (initialization site + docblock mirror). `grep -c "18" packages/g2-app/src/raster/__tests__/tile-delta.test.ts` → 11 occurrences (TD-1..TD-6 use the canonical sizing).
- **B-4 (forward-import-cycle):** `! grep -E "from .[\"']\./raster-controller" packages/g2-app/src/raster/map-base-layer.ts` → 0 (Task 2 imports only the type contract). `grep -c "implements RasterControllerLike" packages/g2-app/src/raster/raster-controller.ts` → 2 (class declaration + JSDoc reference). Both Task 2 and Task 3 typecheck pass at their respective commit boundaries.

## Self-Check: PASSED

All claimed source files exist on disk:

- `packages/g2-app/src/raster/tile-delta.ts` ✓
- `packages/g2-app/src/raster/rle-encoder.ts` ✓
- `packages/g2-app/src/raster/glyph-renderer.ts` ✓
- `packages/g2-app/src/raster/map-base-layer.ts` ✓
- `packages/g2-app/src/raster/raster-worker.ts` ✓
- `packages/g2-app/src/raster/raster-controller.ts` ✓
- `packages/g2-app/src/types/upng-js.d.ts` ✓
- `packages/g2-app/src/raster/__tests__/{tile-delta,rle-encoder,glyph-renderer,map-base-layer,raster-controller}.test.ts` ✓ (all 5)

All claimed commits exist in `git log --oneline --all`:

- `8e606a4` ✓ (Task 1)
- `ca8fa80` ✓ (Task 2)
- `4c33843` ✓ (Task 3)

Workspace-wide green: `pnpm test` reports 512/512 tests passing across 35 files; `pnpm typecheck && pnpm lint:ci` exit 0 (137 pre-existing lint warnings in `packages/validation-harness/scripts/` are not in scope — Plan 03 introduces zero new warnings).

## Next Phase Readiness

- **Plan 04 (Status HUD)** can run independently — no file-modified overlap. Will mount `StatusHudLayer` at `ZIndex.Z1_STATUS_HUD` alongside the `MapBaseLayer` at `ZIndex.Z0_MAP` defined here.
- **Plan 05 (smoke test)** can compose the full `LayerManager` + `MapBaseLayer` + `RasterController` + glyph renderer stack against mock pixel data to exercise ADR-0009 acceptance.
- **Plan 06 (Foundry extractor + WS receiver)** can call `mapBaseLayer.setScene({ pixelData, width: 400, height: 200 })` and have the raster pipeline take over end-to-end. The `RasterController.requestFrame` API is stable and matches the `RasterControllerLike` contract from Plan 01.

---

*Phase: 04a-g2-engine-raster-status-hud*
*Completed: 2026-05-15*
