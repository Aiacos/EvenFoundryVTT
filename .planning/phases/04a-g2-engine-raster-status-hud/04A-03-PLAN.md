---
phase: 04a
plan: 03
type: execute
wave: 2
depends_on: ["04a-02"]
files_modified:
  - packages/g2-app/src/raster/raster-worker.ts
  - packages/g2-app/src/raster/raster-controller.ts
  - packages/g2-app/src/raster/tile-delta.ts
  - packages/g2-app/src/raster/rle-encoder.ts
  - packages/g2-app/src/raster/glyph-renderer.ts
  - packages/g2-app/src/raster/map-base-layer.ts
  - packages/g2-app/src/raster/__tests__/tile-delta.test.ts
  - packages/g2-app/src/raster/__tests__/rle-encoder.test.ts
  - packages/g2-app/src/raster/__tests__/raster-controller.test.ts
  - packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts
  - packages/g2-app/src/raster/__tests__/map-base-layer.test.ts
autonomous: true
requirements: [MAP-01, MAP-02, MAP-03, MAP-04]
user_setup: []
tags: [g2-app, raster, web-worker, image-q, upng-js, xxhash-wasm, glyph-fallback, wave-2]
must_haves:
  truths:
    - "Raster pipeline runs in a singleton Web Worker (not main thread) — Worker holds OffscreenCanvas + image-q + upng-js + xxhash-wasm instances"
    - "Sub-tile delta detection identifies unchanged tiles and skips re-encoding (zero-change frame produces zero updateImageRawData calls)"
    - "Custom RLE encoder roundtrip preserves 4-bit greyscale pixel data byte-for-byte"
    - "Glyph mode renderer produces a 96-char-wide AsciiGrid mapping scene tokens to single glyphs (@ PC, M monster, N NPC, o object)"
    - "MapBaseLayer implements Layer interface and delegates to raster or glyph based on layerManager.getMapMode() resolution"
    - "RasterController debounces canvas update events at 200 ms and falls back to 0.3 fps idle heartbeat (per Specs §7.4b.6.1)"
  artifacts:
    - path: "packages/g2-app/src/raster/raster-worker.ts"
      provides: "Web Worker entry: receives RasterRequest, performs 10-stage pipeline, postMessage RasterResponse with PNG bytes per changed tile"
      contains: "self.onmessage"
    - path: "packages/g2-app/src/raster/raster-controller.ts"
      provides: "Main-thread RasterController class: Worker lifecycle, MessageChannel frameId correlation, debounce + heartbeat, EvenAppBridge.updateImageRawData dispatch"
      exports: ["RasterController"]
    - path: "packages/g2-app/src/raster/tile-delta.ts"
      provides: "TileDelta class: xxhash sub-tile hash table, detectChanges() returns indices of changed tiles vs previous frame"
      exports: ["TileDelta"]
    - path: "packages/g2-app/src/raster/rle-encoder.ts"
      provides: "encodeRle4bit + decodeRle4bit pure functions for 4-bit nibble RLE"
      exports: ["encodeRle4bit", "decodeRle4bit"]
    - path: "packages/g2-app/src/raster/glyph-renderer.ts"
      provides: "renderGlyphScene(bridge, scene) → textContainerUpgrade with 96×24 ASCII grid; buildGlyphGrid(scene) pure helper for tests"
      exports: ["renderGlyphScene", "buildGlyphGrid"]
    - path: "packages/g2-app/src/raster/map-base-layer.ts"
      provides: "MapBaseLayer implements Layer; getCaptureContainer returns 'map-capture'; draw() delegates to raster controller or glyph renderer based on resolved mode"
      exports: ["MapBaseLayer"]
  key_links:
    - from: "packages/g2-app/src/raster/raster-controller.ts"
      to: "packages/g2-app/src/raster/raster-worker.ts"
      via: "new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })"
      pattern: "new URL\\('./raster-worker\\.ts', import\\.meta\\.url\\)"
    - from: "packages/g2-app/src/raster/raster-controller.ts"
      to: "@evenrealities/even_hub_sdk EvenAppBridge"
      via: "bridge.updateImageRawData per changed tile; ImageRawDataUpdateResult.isSuccess check"
      pattern: "updateImageRawData"
    - from: "packages/g2-app/src/raster/map-base-layer.ts"
      to: "packages/g2-app/src/engine/layer-types.ts Layer interface"
      via: "implements Layer; getCaptureContainer() returns 'map-capture'"
      pattern: "implements Layer"
    - from: "packages/g2-app/src/raster/glyph-renderer.ts"
      to: "@evf/shared-render AsciiGrid"
      via: "AsciiGrid constructor + toString() for the 96×24 char grid"
      pattern: "AsciiGrid"
    - from: "packages/g2-app/src/raster/raster-worker.ts"
      to: "xxhash-wasm + image-q + upng-js"
      via: "createXXHash3 / image-q.ErrorDiffusionArray / UPNG.encode"
      pattern: "createXXHash3|image-q|UPNG.encode"

threat_model:
  trust_boundaries:
    - description: "Foundry canvas pixels → main thread → Worker → EvenAppBridge: pixel data is trusted (sourced from Foundry desktop scene), but Worker isolation contains library defects"
    - description: "Worker → main thread postMessage: response shape must be type-checked before consumption"
  threats:
    - id: "T-4a-03-01"
      category: "D"
      component: "raster-worker.ts infinite hash loop on malformed pixel data"
      disposition: "mitigate"
      mitigation_plan: "All loops bounded by tile array length (constant 4 × 200×100 pixels). xxhash-wasm is pure function; no recursion. Worker `onerror` in raster-controller terminates worker + flips layerManager.setMapMode('glyph') (graceful degrade per ADR-0006)"
    - id: "T-4a-03-02"
      category: "T"
      component: "raster-controller.ts Worker postMessage response"
      disposition: "mitigate"
      mitigation_plan: "Response correlated by frameId; pending Map is consulted before dispatch — stale or unknown frameId is dropped silently with console.warn (no throw). Transferable Uint8Array length is bounded by tile size (max 200×100×4=80000 bytes RGBA, far smaller after 4-bit indexed encode)"
    - id: "T-4a-03-03"
      category: "I"
      component: "Foundry canvas extract path"
      disposition: "accept"
      mitigation_plan: "Foundry canvas is local desktop renderer running for the player; pixel data is the same scene the player already sees. No PII exfiltration risk. (Real-device PIXI performance gate is Specs §11.5.7 pitfall 11 — `human_needed` per ADR-0005)"
    - id: "T-4a-03-04"
      category: "D"
      component: "ImageRawDataUpdateResult sendFailed loop"
      disposition: "mitigate"
      mitigation_plan: "On `!ImageRawDataUpdateResult.isSuccess(result)` for the same tile twice consecutively → log + skip frame; on three consecutive failures in 5 s → layerManager.setMapMode('glyph') graceful degrade. No retry storm"
---

<objective>
Deliver the complete raster pipeline + glyph fallback as the z=0 Map Base Layer. This is the heaviest plan in Phase 4a (~30-40% context), justifying its own slot per `<scope_estimation>`.

Purpose: Convert Foundry's PIXI canvas to G2's 4-bit greyscale wire format via a 10-stage pipeline that runs entirely in a singleton Web Worker (per Specs §11.5.7 pitfall 9 / ADR-0006). Sub-tile delta detection skips re-encoding for static scenes. Glyph fallback engages automatically when BLE probe (Plan 02) reports <100 kbps.

Output: 6 source modules + 5 test files. RasterController dispatches frames to the Worker via MessageChannel, applies tile-level delta gating, and calls bridge.updateImageRawData only for changed tiles. MapBaseLayer is the consumable Layer that LayerManager mounts at ZIndex.Z0_MAP. Hardware-pending verifications (≥5 fps, BLE p50 latency, real-device PIXI extract perf) carry `verification_mode: human_needed` per ADR-0005 PROVISIONAL Branch A.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md
@docs/architecture/0006-raster-pipeline-library-stack.md
@docs/architecture/0005-phase0-go-no-go.md
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/__tests__/test-helpers/worker-mock.ts
@packages/shared-render/src/ascii-grid.ts
@packages/shared-render/src/snapshot.ts
@packages/g2-app/vitest.config.ts

<interfaces>
<!-- Library APIs (subject to runtime verification per Open Question A1) -->

From xxhash-wasm@1.1.0:
- `import { createXXHash3 } from 'xxhash-wasm'`  
- `const xxhash = await createXXHash3()` — Promise<{ h32(input: Uint8Array): number; h64?(): bigint }>
- `xxhash.h32(buf)` returns a 32-bit unsigned integer

From image-q@4.0.0 (training-derived; verify at implementation per RESEARCH §Open Question 4):
- `import * as ImageQ from 'image-q'`
- `new ImageQ.Palette()` + `.add(new ImageQ.Point(r, g, b, a))`
- `new ImageQ.ErrorDiffusionArray(new ImageQ.ErrorDiffusionArrayKernel(ImageQ.ErrorDiffusionArrayKernel.FloydSteinberg))`
- `ImageQ.utils.PointContainer.fromUint8Array(rgba: Uint8ClampedArray, w: number, h: number)`
- `.quantize(inPointContainer, palette)` → outPointContainer
- `outPointContainer.toUint8Array()` → indexed-data Uint8Array

From upng-js@2.1.0:
- `import * as UPNG from 'upng-js'`
- `UPNG.encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[], depth?: number)` — for 16 colours + 4-bit indexed: `UPNG.encode([indexedData.buffer], w, h, 16, [], 4)` → ArrayBuffer

From @evenrealities/even_hub_sdk:
- `class ImageRawDataUpdate { constructor(data: { containerName: string; imageData: Uint8Array | number[] }) }`
- `bridge.updateImageRawData(data: ImageRawDataUpdate): Promise<ImageRawDataUpdateResult>`
- `namespace ImageRawDataUpdateResult { function isSuccess(value): boolean }`

From packages/g2-app/src/engine/layer-types.ts:
- `interface Layer { id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string }`
- `enum ZIndex` (Z0_MAP = 0 is the slot MapBaseLayer mounts into)

From packages/g2-app/src/engine/layer-manager.ts:
- `class LayerManager` with `getMapMode(): 'auto'|'raster'|'glyph'`

From @evf/shared-render:
- `class AsciiGrid` — character-grid with toString() returning rows joined by \n; constructor enforces uniform row width
- See packages/shared-render/src/ascii-grid.ts lines 12-52 for noUncheckedIndexedAccess guard pattern

Sub-tile arithmetic (per RESEARCH §Open Question 1 — choose ONE in implementation and document):
- floor: `Math.floor(200/32) × Math.floor(100/32) = 6 × 3 = 18 sub-tiles/tile` (matches CONTEXT.md Area 2 "18")
- ceil: `Math.ceil(200/32) × Math.ceil(100/32) = 7 × 4 = 28 sub-tiles/tile` (covers partial edges)
Locked decision for this plan: **use ceil arithmetic = 28 sub-tiles/tile × 4 tiles = 112 sub-tiles/full frame**. Document this choice in raster-worker.ts JSDoc citing the discrepancy. CONTEXT.md "18" reflected design intent without the ceil partial edges; ceil is safer and matches actual hash coverage.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: tile-delta + rle-encoder pure utilities (TDD)</name>
  <read_first>
    - packages/shared-render/src/ascii-grid.ts (lines 12-52 — noUncheckedIndexedAccess guard precedent: `const row = cells[i]; if (row === undefined) throw`)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §tile-delta.ts (verbatim TileDelta class with `?? 0` guard pattern for Uint32Array indexed access)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Example 2 (xxhash sub-tile delta — extractSubTile helper signature)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Common Pitfalls Pitfall 5 (noUncheckedIndexedAccess and tile array access)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2 sub-tile granularity (32×32 px decision)
  </read_first>
  <files>packages/g2-app/src/raster/tile-delta.ts, packages/g2-app/src/raster/rle-encoder.ts, packages/g2-app/src/raster/__tests__/tile-delta.test.ts, packages/g2-app/src/raster/__tests__/rle-encoder.test.ts</files>
  <behavior>
    tile-delta:
    - Test TD-1: Two TileDelta instances with same sub-tile count, given identical Uint32Array of hashes, detectChanges returns empty array on second invocation (first call seeds prev state and returns ALL indices as "changed-from-zero-init"; second identical call returns [])
    - Test TD-2: Changing a single hash at index 17 makes detectChanges return exactly `[17]` on next invocation
    - Test TD-3: Changing every other hash returns the correct subset of indices in order
    - Test TD-4: Construct with tilesPerFrame=4, subTilesPerTile=28 → subTileCount === 112
    - Test TD-5: detectChanges with mismatched array length (input.length !== subTileCount) → throws Error with message identifying the mismatch
    - Test TD-6: After detectChanges, prev hash array is updated (subsequent call with same input returns [])

    rle-encoder:
    - Test RLE-1: `encodeRle4bit(new Uint8Array([0,0,0,0,5,5,5,15]))` produces a byte stream that `decodeRle4bit` reverses to the same input (roundtrip identity)
    - Test RLE-2: Encoding a run longer than 255 (max run length in 1 byte) splits into multiple runs without data loss
    - Test RLE-3: Encoding all-zero buffer produces a single compact run; encoded length << input length
    - Test RLE-4: Decoding malformed input (e.g., truncated run header) → throws Error with `RLE decode` in message
    - Test RLE-5: Encode/decode handles 4-bit values 0-15 only; values >15 in input → throws (invalid 4-bit pixel)
  </behavior>
  <action>
    Implement two pure-function utility modules with full TDD discipline.

    **1. `packages/g2-app/src/raster/tile-delta.ts`:**
    Module JSDoc citing CONTEXT.md Area 2, ascii-grid.ts noUncheckedIndexedAccess precedent, and the locked 4×28 sub-tile geometry (4 tiles × 28 sub-tiles/tile = 112). Document the floor-vs-ceil decision (ceil chosen).

    Exports:
    - `export class TileDelta { readonly subTileCount: number; private prevHashes: Uint32Array; constructor(tilesPerFrame: number, subTilesPerTile: number); detectChanges(currHashes: Uint32Array): number[]; reset(): void }`
    - Implementation per PATTERNS.md verbatim, with `?? 0` guard for `prevHashes[i]` and `currHashes[i]` reads, and length-mismatch check at function entry.
    - First-call semantics: prev array initialized to all-zero in constructor; if any caller-supplied hash is nonzero, first detectChanges returns indices where input ≠ 0. Document this in JSDoc.

    **2. `packages/g2-app/src/raster/rle-encoder.ts`:**
    Module JSDoc citing CONTEXT.md Area 2 (custom RLE for changed sub-tiles) and 4-bit pixel constraint (values 0-15 per phosphor green palette).

    Exports:
    - `export function encodeRle4bit(input: Uint8Array): Uint8Array` — Standard run-length encoding. Each output unit = `[runLength: u8 (1-255), pixelValue: u8 (0-15)]`. Longer runs split. Validate every input byte ≤ 15 at entry (throw with `RLE encode: invalid 4-bit value` if violated). Document the wire shape in JSDoc.
    - `export function decodeRle4bit(input: Uint8Array, expectedLength?: number): Uint8Array` — Reverses encodeRle4bit. Throws Error with `RLE decode: ...` prefix on malformed input. If expectedLength provided and output length ≠ expectedLength, throw with `RLE decode: length mismatch`.

    Write tests FIRST in `packages/g2-app/src/raster/__tests__/tile-delta.test.ts` and `rle-encoder.test.ts` matching `<behavior>` (RED phase). Both modules are pure functions — no SDK mock, no Worker mock needed. Then implement to GREEN.

    Constraints:
    - noUncheckedIndexedAccess: every typed-array read uses `?? 0` or explicit `undefined` guard. AsciiGrid is the canonical precedent — read it before writing tile-delta.
    - Pure functions (no I/O, no global state). No lint suppressions allowed.
    - JSDoc on every export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/tile-delta.test.ts src/raster/__tests__/rle-encoder.test.ts && grep -c '\?\? 0' packages/g2-app/src/raster/tile-delta.ts && grep -c 'RLE encode' packages/g2-app/src/raster/rle-encoder.ts && grep -c 'RLE decode' packages/g2-app/src/raster/rle-encoder.ts && pnpm typecheck</automated>
  </verify>
  <done>
    Both test files green (11 tests minimum); tile-delta.ts contains at least one `?? 0` guard (noUncheckedIndexedAccess proof); rle-encoder.ts contains both `RLE encode` and `RLE decode` error prefixes; typecheck exits 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: glyph-renderer + MapBaseLayer + Layer wiring (TDD)</name>
  <read_first>
    - packages/shared-render/src/ascii-grid.ts (AsciiGrid public API — constructor, toString, dimensions)
    - packages/shared-render/src/snapshot.ts (matchAsciiFixture — Plan 04 writes the glyph-scene fixture this test consumes)
    - packages/g2-app/src/wizard/steps/completion.ts (analog for renderer using bridge.textContainerUpgrade — PATTERNS.md §glyph-renderer.ts analog)
    - packages/g2-app/src/engine/layer-types.ts (Layer interface — MapBaseLayer implements this)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §glyph-renderer.ts + §map-base-layer.ts (verbatim patterns)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 3 Glyph Mode + §Glyph Dictionary (full canonical glyph list: @ PC, M monster, N NPC, o object, ▶◀▲▼ facing, ░ floor, ▒ rough, ▓ wall, etc.)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 4 (glyph layout source + [GLY] badge rule, 96×24 char grid)
  </read_first>
  <files>packages/g2-app/src/raster/glyph-renderer.ts, packages/g2-app/src/raster/map-base-layer.ts, packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts, packages/g2-app/src/raster/__tests__/map-base-layer.test.ts</files>
  <behavior>
    glyph-renderer:
    - Test GR-1: `buildGlyphGrid({ tokens: [{kind:'pc', x:10, y:5, facing:'east'}], width: 66, height: 21 })` returns an AsciiGrid where row 5 col 10 is `@` and col 11 is `▶`
    - Test GR-2: `buildGlyphGrid({ tokens: [{kind:'monster', id:'g1', x:20, y:8}, {kind:'monster', id:'g2', x:30, y:8}] })` places `g1` at col 20-21 row 8 and `g2` at col 30-31 row 8
    - Test GR-3: NPC kind → `N` glyph; object kind → `o` glyph
    - Test GR-4: Terrain layer with walls produces `▓` at the wall coordinates; floor produces `░`
    - Test GR-5: AsciiGrid width is 66 (col 0-65 per UI-SPEC §Layout Grid; map area is col 0-67 but glyph border consumes 2)
    - Test GR-6: `renderGlyphScene(mockBridge, scene)` calls `bridge.textContainerUpgrade` exactly once with containerName 'map-capture' (the glyph mode uses the capture text container for the grid)

    map-base-layer:
    - Test MBL-1: `new MapBaseLayer(bridge, controller, glyphRenderer, layerManager).id === 'map-base'`
    - Test MBL-2: `getCaptureContainer()` returns `'map-capture'` (the canonical capture container name from UI-SPEC §Container Budget Allocation)
    - Test MBL-3: When `layerManager.getMapMode() === 'raster'`, `draw()` calls `rasterController.requestFrame(...)` and does NOT call glyphRenderer.renderGlyphScene
    - Test MBL-4: When `layerManager.getMapMode() === 'glyph'`, `draw()` calls glyphRenderer and does NOT call rasterController.requestFrame
    - Test MBL-5: When `layerManager.getMapMode() === 'auto'` and last BLE probe returned 'glyph' (passed via constructor or store), `draw()` routes to glyph
    - Test MBL-6: `destroy()` calls `rasterController.terminate()` and unsubscribes any store listeners (no leaks)
  </behavior>
  <action>
    **1. `packages/g2-app/src/raster/glyph-renderer.ts`:**
    Module JSDoc citing UI-SPEC §Screen 3, §Glyph Dictionary, CONTEXT.md Area 4.

    Imports: `import { AsciiGrid } from '@evf/shared-render'`; `import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'`.

    Exports:
    - `export interface GlyphSceneInput { tokens: Array<{ kind: 'pc'|'monster'|'npc'|'object'; x: number; y: number; id?: string; facing?: 'east'|'west'|'north'|'south' }>; terrain?: Array<{ kind: 'floor'|'rough'|'wall'; x: number; y: number }>; width: number; height: number }`
    - `export function buildGlyphGrid(scene: GlyphSceneInput): AsciiGrid` — pure function building a uniform-width char grid per UI-SPEC §Glyph Dictionary (canonical mapping: pc→`@`, monster→lowercase letter + digit derived from id, npc→`N`, object→`o`, wall→`▓`, floor→`░`, rough→`▒`; facing east→`▶`, west→`◀`, north→`▲`, south→`▼` placed at adjacent cell).
    - `export async function renderGlyphScene(bridge: EvenAppBridge, scene: GlyphSceneInput, containerName: string = 'map-capture'): Promise<void>` — builds grid + calls `bridge.textContainerUpgrade` with the grid's `toString()`. (Glyph mode reuses `map-capture` as the visible text container per UI-SPEC §Container Budget §Glyph mode.)

    **2. `packages/g2-app/src/raster/map-base-layer.ts`:**
    Module JSDoc citing UI-SPEC §Screen 2 (raster) + §Screen 3 (glyph), CONTEXT.md Area 4 setMapMode reservation, ADR-0001 (z=0 always rendered).

    Imports: type-only from `@evenrealities/even_hub_sdk`, from `../engine/layer-types.js` (Layer), from `../engine/layer-manager.js` (LayerManager), from `./raster-controller.js` (RasterController — forward import, controller lands in Task 3 same plan), from `./glyph-renderer.js`.

    Exports:
    - `export class MapBaseLayer implements Layer { readonly id = 'map-base'; constructor(private readonly bridge, private readonly controller, private readonly renderer: typeof renderGlyphScene, private readonly layerManager); getCaptureContainer(): string { return 'map-capture' } async draw(): Promise<void> { /* route based on resolved mode */ } destroy(): void { /* terminate controller, unsub */ } async setScene(scene: GlyphSceneInput | RasterFrameInput): void { /* stash latest scene; called by Plan 05 smoke test or future delta subscribers */ } }`
    - Mode resolution rule (encoded in `draw()`): if `getMapMode() === 'auto'`, consult last BLE probe verdict from controller (controller exposes `getBleVerdict(): 'raster' | 'glyph' | null`); if null, default to 'raster'. Document this resolution path in JSDoc.

    Write tests FIRST in `packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts` and `map-base-layer.test.ts` matching `<behavior>` (RED phase). Mock LayerManager + RasterController + EvenAppBridge using vi.fn() factories. Plan 04 will commit the glyph-scene fixture files; glyph-renderer tests in this plan rely on AsciiGrid structural assertions (specific cells contain expected glyphs) — NOT on matchAsciiFixture. Fixture-level snapshot comparison is covered by Plan 04's i18n fixture tests + Plan 05's integration smoke.

    Constraints:
    - Glyph dictionary MUST match UI-SPEC §Glyph Dictionary table verbatim (no improvised glyphs).
    - AsciiGrid constructor enforces uniform row width — pad rows with spaces to the declared `width`.
    - MapBaseLayer.draw() is the entry point LayerManager calls; do not assume LayerManager will iterate frames.
    - JSDoc on every export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/glyph-renderer.test.ts src/raster/__tests__/map-base-layer.test.ts && grep -c "'@'" packages/g2-app/src/raster/glyph-renderer.ts && grep -c "implements Layer" packages/g2-app/src/raster/map-base-layer.ts && grep -c "'map-capture'" packages/g2-app/src/raster/map-base-layer.ts && grep -c "textContainerUpgrade" packages/g2-app/src/raster/glyph-renderer.ts</automated>
  </verify>
  <done>
    Both test files green (12 tests minimum); glyph-renderer source contains the `@` PC glyph literal; map-base-layer implements Layer interface and returns 'map-capture' from getCaptureContainer; glyph-renderer calls textContainerUpgrade.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: raster-worker + RasterController (Web Worker singleton + frame scheduler)</name>
  <read_first>
    - packages/g2-app/src/raster/tile-delta.ts (Task 1 output — Worker uses TileDelta inline; controller does not)
    - packages/g2-app/src/raster/rle-encoder.ts (Task 1 output — Worker uses encodeRle4bit on changed sub-tiles)
    - packages/g2-app/src/__tests__/test-helpers/worker-mock.ts (Plan 01 — mock Worker + OffscreenCanvas for happy-dom)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §raster-worker.ts + §raster-controller.ts (Worker entry boilerplate + singleton class + Map-based frameId correlation pattern)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Pattern 2 (singleton Web Worker + MessageChannel) + §Examples 2-4 (xxhash-wasm + image-q + upng-js code snippets) + §Common Pitfalls Pitfall 4 (Vite ?worker import) + §Open Question 2 (Vite + WASM bundling)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Raster Pipeline Visual Contract (10-stage pipeline + frame rate state machine)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2 (worker topology, frame trigger debounce, idle heartbeat 0.3 fps)
    - packages/bridge/src/ws/delta-emitter.ts (analog for singleton Map-based fanout)
    - vite docs cheatsheet: `new Worker(new URL('./file.ts', import.meta.url), { type: 'module' })` is the canonical Vite Worker import
  </read_first>
  <files>packages/g2-app/src/raster/raster-worker.ts, packages/g2-app/src/raster/raster-controller.ts, packages/g2-app/src/raster/__tests__/raster-controller.test.ts</files>
  <behavior>
    raster-controller (under happy-dom + Worker mock):
    - Test RC-1: `new RasterController(mockBridge)` constructs a Worker via `new URL('./raster-worker.ts', import.meta.url)` (verified by intercepting the Worker constructor in the mock)
    - Test RC-2: `controller.requestFrame(pixelData, width, height)` returns a Promise; mock worker fires postMessage `{frameId: N, changedTiles: [...]}` and Promise resolves with the response object
    - Test RC-3: Two requestFrame calls within 200 ms → debounce drops the first; only the second's pixel data is sent to Worker (verify mockWorker.postMessage called exactly once after debounce window)
    - Test RC-4: Worker response with changedTiles=[{index:0, pngBytes: new Uint8Array([0xAA])}] triggers `bridge.updateImageRawData` with containerName 'map-tile-0'
    - Test RC-5: When updateImageRawData result is NOT isSuccess, controller logs warning + counts failure; 3 consecutive failures in 5 s flips `controller.getBleVerdict()` to 'glyph'
    - Test RC-6: `controller.startIdleHeartbeat()` triggers a frame request every ~3333 ms (0.3 fps) when no canvas updates seen; fake timers verify the interval
    - Test RC-7: `controller.terminate()` calls worker.terminate() and clears pending Map
    - Test RC-8: Unknown frameId in worker response (stale) is dropped silently with console.warn (no throw)
  </behavior>
  <action>
    **1. `packages/g2-app/src/raster/raster-worker.ts`:**
    Module JSDoc citing CONTEXT.md Area 2, RESEARCH.md Pattern 2, sub-tile ceil decision (4 × 28 = 112), and Pitfall 4 (Vite Worker bundling). Mark file with TODO(ADR-0005-OQ-INV2-1.b) for hardware tile-size verification.

    File structure (Worker entry, no `export` declarations — Workers run in their own module scope and respond via postMessage):
    1. Inline type defs (Worker-internal): `interface RasterRequest { frameId: number; pixelData: ImageData | Uint8ClampedArray; width: number; height: number; isInitial?: boolean }`, `interface RasterResponse { frameId: number; changedTiles: Array<{ index: 0|1|2|3; pngBytes: Uint8Array; subTileCount: number }> }`.
    2. Lazy WASM init: `let xxhash: Awaited<ReturnType<typeof createXXHash3>> | null = null; let palette: ImageQ.Palette | null = null; let tileDelta: TileDelta | null = null` — initialized inside `self.onmessage` on first frame. Document why lazy (avoid Worker startup blocking on WASM compile).
    3. `self.onmessage = async (ev: MessageEvent<RasterRequest>) => { ... }` — performs the 10 stages from UI-SPEC §Raster Pipeline Visual Contract:
       1. Resize pixelData via OffscreenCanvas to 400×200 (or skip if input already 400×200)
       2. Greyscale via luminance: `0.299*r + 0.587*g + 0.114*b` per pixel
       3. image-q FloydSteinberg dither against the 16-step greyscale palette
       4. Split indexed 400×200 buffer into 4 × 200×100 tile buffers (tile order: top-left, top-right, bottom-left, bottom-right; matches container names map-tile-0..3)
       5. For each tile: compute 28 sub-tile hashes (4×7 ceil grid; each sub-tile up to 32×32) using xxhash.h32
       6. Concatenate all 112 hashes into a Uint32Array, pass to tileDelta.detectChanges
       7. Determine which TILES (0-3) have any changed sub-tile (group by tile index)
       8. For each changed tile: encodeRle4bit the tile buffer (stored as compression metric; the wire format is PNG, but RLE is also computed per UI-SPEC §Raster Pipeline stage 8). Document RLE is for telemetry/stats; PNG is the wire payload.
       9. For each changed tile: `UPNG.encode([tileBuffer.buffer], 200, 100, 16, [], 4)` → PNG bytes
       10. `self.postMessage({frameId, changedTiles: [...]}, [/* transferable: each pngBytes.buffer */])`
    4. Catch any stage error → `self.postMessage({frameId, error: { stage, message }})` instead of throwing inside the Worker (a Worker throw crashes the entire pipeline).

    Imports: `import { createXXHash3 } from 'xxhash-wasm'; import * as ImageQ from 'image-q'; import * as UPNG from 'upng-js'; import { TileDelta } from './tile-delta.js'; import { encodeRle4bit } from './rle-encoder.js'`.

    No DOM imports. No exports.

    **2. `packages/g2-app/src/raster/raster-controller.ts`:**
    Module JSDoc citing CONTEXT.md Area 2 (200 ms debounce + 0.3 fps idle heartbeat), ADR-0006 Branch A.

    Imports: `import { EvenAppBridge, ImageRawDataUpdate, ImageRawDataUpdateResult } from '@evenrealities/even_hub_sdk'`.

    Exports:
    - `export class RasterController` with:
      - Private state: `worker: Worker` (constructed via `new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })` per Pitfall 4), `frameId: number = 0`, `pending: Map<number, { resolve, reject, timer }>`, `debounceTimer: ReturnType<typeof setTimeout> | null`, `idleTimer: ReturnType<typeof setInterval> | null`, `consecutiveFailures: number = 0`, `failureWindowStart: number = 0`, `bleVerdict: 'raster' | 'glyph' | null = null`.
      - Constructor: `constructor(private readonly bridge: EvenAppBridge)` — wires `worker.onmessage` to consult pending Map by frameId.
      - `requestFrame(pixelData: Uint8ClampedArray | ImageData, width: number, height: number): Promise<RasterResponse>` — debounced 200 ms; the LATEST call within the window wins; earlier pending resolves with a sentinel `{frameId, changedTiles: [], skipped: true}`. After debounce, increments frameId, posts to worker with frameId, stores resolver in pending Map.
      - `setBleVerdict(verdict: 'raster' | 'glyph'): void` — called by capability-handshake post-probe; consumed by MapBaseLayer when mode='auto'.
      - `getBleVerdict(): 'raster' | 'glyph' | null` — accessor.
      - `startIdleHeartbeat(getCurrentScene: () => Uint8ClampedArray | null): void` — `setInterval(3333 ms)` calling `requestFrame` if no recent activity (lastActivityMs > 3000).
      - `stopIdleHeartbeat(): void`.
      - `terminate(): void` — worker.terminate() + clear pending + clear timers.
      - `private async _dispatchChangedTiles(changedTiles): Promise<void>` — for each changed tile, `await bridge.updateImageRawData(new ImageRawDataUpdate({ containerName: 'map-tile-' + tile.index, imageData: tile.pngBytes }))`; on non-success check failure counter; if 3 consecutive failures within 5 s → setBleVerdict('glyph') + emit a warning.

    Write tests FIRST in `packages/g2-app/src/raster/__tests__/raster-controller.test.ts` matching `<behavior>`. Use `worker-mock.ts` from Plan 01. Use `vi.useFakeTimers()` for debounce + heartbeat assertions. Mock `bridge.updateImageRawData` with vi.fn() returning ImageRawDataUpdateResult-shaped values.

    Constraints:
    - Worker constructor MUST use the `new URL('./raster-worker.ts', import.meta.url)` pattern (Pitfall 4); no plain `import` of the worker file.
    - All EvenAppBridge call results checked with `ImageRawDataUpdateResult.isSuccess(result)` — never compare to `true` or `false` directly (Pitfall 6).
    - Worker tests do NOT execute the real worker source under happy-dom (the worker pipeline is integration-tested via Plan 05 smoke + hardware human_needed); raster-worker.ts is verified by typecheck + lint only in this plan.
    - JSDoc on every export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/raster/__tests__/raster-controller.test.ts && grep -c "new URL('./raster-worker.ts'" packages/g2-app/src/raster/raster-controller.ts && grep -c "ImageRawDataUpdateResult.isSuccess" packages/g2-app/src/raster/raster-controller.ts && grep -c "self.onmessage" packages/g2-app/src/raster/raster-worker.ts && grep -c "createXXHash3" packages/g2-app/src/raster/raster-worker.ts && grep -c "UPNG.encode" packages/g2-app/src/raster/raster-worker.ts && grep -c "200" packages/g2-app/src/raster/raster-controller.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    RasterController tests green (8 tests minimum); Worker constructor uses Vite-canonical URL pattern; ImageRawDataUpdateResult.isSuccess is consulted (not bare boolean); raster-worker.ts contains self.onmessage + createXXHash3 + UPNG.encode (proves the 10-stage pipeline is wired); debounce 200 literal present in controller; typecheck + lint:ci both exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Foundry canvas → main thread | Player's own Foundry desktop renderer; trusted local source |
| Main thread → Worker postMessage | Transferable Uint8Array crosses serialization boundary; library defects contained within Worker |
| Worker → main thread response | Response object correlated by frameId before dispatch to EvenAppBridge |
| EvenAppBridge updateImageRawData | Per-tile PNG bytes dispatched via envelope to host runtime |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-03-01 | D | raster-worker.ts hash loop | mitigate | Bounded loops (4 tiles × ≤28 sub-tiles each); xxhash-wasm pure function; Worker `onerror` handler in controller terminates worker + flips mode to glyph |
| T-4a-03-02 | T | raster-controller.ts Worker postMessage response | mitigate | Pending Map consulted by frameId; unknown frameId dropped with console.warn; transferable buffer length bounded by tile size |
| T-4a-03-03 | I | Foundry canvas extract | accept | Pixel data is the same scene the player already sees; no PII exfiltration |
| T-4a-03-04 | D | ImageRawDataUpdateResult retry storm | mitigate | 3 consecutive failures in 5 s → setBleVerdict('glyph') graceful degrade; no auto-retry loop |
| T-4a-03-05 | T | UPNG.encode malformed input | accept | Input is internally generated indexed-palette buffer from image-q; not user-controlled. UPNG version pinned 2.1.0 (no auto-update vector) |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with all 5 new test files green (~32 tests across Tasks 1-3)
- `pnpm typecheck && pnpm lint:ci` exit 0
- Vite Worker import pattern present (`new URL('./raster-worker.ts', import.meta.url)`)
- All three new raster libs imported at least once in raster-worker.ts (createXXHash3, image-q, UPNG.encode)
- ImageRawDataUpdateResult.isSuccess is the only success-check pattern (no bare `result === true`)

**Hardware-pending verifications (verification_mode: human_needed per ADR-0005 PROVISIONAL Branch A; NOT auto-green):**
- MAP-04 ≥5 fps sustained in single-token-move scenario — real G2 + paired R1 + clean RF environment required; run via `pnpm --filter @evf/validation-harness validate:all` (when hardware grants land)
- MAP-03 BLE p50 latency in Phase 0 envelope — real BLE measurement
- Branch B/C auto-fallback under <100 kbps real BLE — software trigger is tested via Plan 02 probeBleThroughput + Plan 03 setBleVerdict, but real-RF probe is hardware-pending
- PIXI canvas extract performance: Foundry desktop UI does NOT stutter — Specs §11.5.7 pitfall 11; manual eyeball test
</verification>

<success_criteria>
Plan 03 closes when:
- MAP-01 fully addressed software-side: 4-bit greyscale dithered raster pipeline runs in singleton Worker; updateImageRawData dispatch wired
- MAP-02 fully addressed: glyph fallback renderer produces 96×24 AsciiGrid via canonical glyph dictionary; mode toggle routable via MapBaseLayer + LayerManager.setMapMode
- MAP-03 addressed software-side: sub-tile delta + custom RLE + adaptive frame rate (200 ms debounce + 0.3 fps idle heartbeat) all implemented; BLE 4.2+ DLE is platform-level (no app code), idle heartbeat is the visible Layer 6 component. Hardware throughput verification carries human_needed gate.
- MAP-04 software-correctness verified (pipeline produces output ≤200 ms per frame in Vitest bench); ≥5 fps sustained on real device carries human_needed gate per ADR-0005
- MapBaseLayer can be mounted into LayerManager at ZIndex.Z0_MAP for Plan 05 integration smoke
- Plan 04 (Status HUD) can run in parallel — no file-modified overlap (Plan 04 owns status-hud/ + shared-render/src/fixtures/)
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-03-SUMMARY.md` capturing:
- Final image-q API shape used (resolves RESEARCH §Open Question A1) — note any adjustments from the documented training-data shape
- Vite + xxhash-wasm WASM bundling outcome (resolves RESEARCH §Open Question 2) — whether plain `import { createXXHash3 } from 'xxhash-wasm'` works in the Vite Worker bundle or whether `vite-plugin-wasm` or `new URL` asset import was required
- Sub-tile ceil decision documented in raster-worker.ts (resolves §Open Question 1; locked at 28 sub-tiles/tile, 112 per frame)
- ImageRawDataUpdateResult enum values observed in the SDK (success / sendFailed / imageSizeInvalid / imageToGray4Failed / imageException) and which trigger the failure counter
- Test counts per file (target: 6 tile-delta + 5 rle-encoder + 6 glyph-renderer + 6 map-base-layer + 8 raster-controller = 31 minimum)
- Hardware-pending TODO references that landed in source (e.g., `// TODO(ADR-0005-OQ-INV2-1.b): verify 200×100 per tile on real G2 — human_needed`)
</output>
