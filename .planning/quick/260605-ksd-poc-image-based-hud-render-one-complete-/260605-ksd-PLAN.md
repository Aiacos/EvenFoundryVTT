---
phase: quick-260605-ksd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/hud/hud-canvas-renderer.ts
  - packages/g2-app/src/hud/hud-raster-frame.ts
  - packages/g2-app/src/hud/hud-poc-page.ts
  - packages/g2-app/src/hud/boot-hud-raster-poc.ts
  - packages/g2-app/src/hud/hud-raster-frame.test.ts
  - packages/g2-app/src/hud/hud-poc-page.test.ts
  - packages/g2-app/src/internal/launch.ts
  - packages/g2-app/src/index.ts
autonomous: true
requirements: [ADR-0013-POC]
must_haves:
  truths:
    - "Launching `pnpm sim start --actor E14Tfh9Ba07cpPyM` with `?hud=raster` draws an IMAGE-rendered status sheet on the glasses framebuffer (visibly denser than the 27px SDK text HUD)."
    - "Without `?hud=raster`, the normal text-HUD boot path is byte-identical (PoC code never runs)."
    - "The PoC renders exactly ONE frame on connect — no Web Worker loop, no live re-render."
    - "The status sheet content (name+Lv, HP bar, AC, conditions, slots, death saves) matches the j0t status content."
  artifacts:
    - path: "packages/g2-app/src/hud/hud-canvas-renderer.ts"
      provides: "renderHudFrame(snapshot, {width,height}) → 576×288 RGBA via 2D canvas, compact 14px font"
      exports: ["renderHudFrame"]
    - path: "packages/g2-app/src/hud/hud-raster-frame.ts"
      provides: "buildHudTiles(rgba) → 4 × 288×144 dithered 4-bit PNG tiles with container ids"
      exports: ["buildHudTiles", "HUD_TILE_GEOMETRY"]
    - path: "packages/g2-app/src/hud/hud-poc-page.ts"
      provides: "4 full-screen image container defs + createHudPocPage(bridge) + pushHudTiles(bridge, tiles)"
      exports: ["HUD_POC_CONTAINERS", "buildHudPocPageSchema", "createHudPocPage", "pushHudTiles"]
    - path: "packages/g2-app/src/hud/boot-hud-raster-poc.ts"
      provides: "bootHudRasterPoc(opts) — isolated PoC boot: bridge → page → fetch snapshot → render → push 1 frame"
      exports: ["bootHudRasterPoc"]
  key_links:
    - from: "packages/g2-app/src/internal/launch.ts"
      to: "boot-hud-raster-poc.ts#bootHudRasterPoc"
      via: "?hud=raster URL flag in the no-auth dev branch"
      pattern: "hud.*raster"
    - from: "packages/g2-app/src/hud/boot-hud-raster-poc.ts"
      to: "bridge.updateImageRawData"
      via: "pushHudTiles → ImageRawDataUpdate per tile"
      pattern: "updateImageRawData"
---

<objective>
Render ONE complete image-based HUD frame on the EvenHub simulator so the user can
visually evaluate the raster-HUD approach (ADR-0013). The status sheet is drawn on a
576×288 2D canvas with a COMPACT font (deliberately denser than the SDK's fixed 27px
text), quantized to 4-bit greyscale, sliced into 4 tiles of 288×144, and pushed via
`updateImageRawData` to 4 full-screen image containers.

The trigger is `?hud=raster` in the no-auth dev branch of `launchApp`. When the flag
is present, an ISOLATED PoC boot path runs INSTEAD of the normal `bootEngine` — the
normal text-HUD boot is byte-identical when the flag is absent. Single frame; no Web
Worker, no live `character.delta` re-render (that is the follow-up).

Purpose: validate ADR-0013's "render the always-on HUD as a rasterized image" decision
with a real screenshot before generalizing the raster pipeline.
Output: 4 new files under `packages/g2-app/src/hud/` + a guarded trigger in launch/boot.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/architecture/0013-hud-raster-rendering.md

# Reuse these patterns VERBATIM where noted in tasks:
@packages/g2-app/src/raster/raster-worker.ts        # buildGreyscalePalette, toGreyscaleRgba, ditherTile, UPNG.encode([rgba.buffer],W,H,16)
@packages/g2-app/src/raster/raster-controller.ts    # ImageRawDataUpdate + ImageRawDataUpdateResult.isSuccess push pattern
@packages/g2-app/src/engine/container-registry.ts   # buildBaseImageContainers → ImageContainerProperty {containerID + name + x/y/w/h}
@packages/g2-app/src/engine/page-lifecycle.ts       # createStartUpPageContainer / StartUpPageCreateResult.success
@packages/g2-app/src/status-hud/status-hud-renderer.ts  # j0t CONTENT: name+Lv, HP bar, AC, conditions, slots, death saves (reuse the field/format logic, drawn to canvas)
@packages/g2-app/src/internal/launch.ts             # no-auth dev branch + readUrlSearch ?actor= pattern (add ?hud= sibling)
@packages/g2-app/src/internal/boot-engine-core.ts   # BootEngineOpts shape (bridgeUrl, token, locale, characterId)
@packages/shared-protocol/src/payloads/character.ts # CharacterSnapshot fields (name, level, hp, maxHp, ac, conditions, spells.slots, death)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: HUD canvas renderer + raster frame assembler (pure-logic tested)</name>
  <files>packages/g2-app/src/hud/hud-canvas-renderer.ts, packages/g2-app/src/hud/hud-raster-frame.ts, packages/g2-app/src/hud/hud-raster-frame.test.ts</files>
  <behavior>
    hud-raster-frame.test.ts (pure logic — canvas text is NOT unit-testable in happy-dom, so test ONLY the geometry/assembler):
    - HUD_TILE_GEOMETRY is exactly 4 tiles: id 0 (0,0,288,144), id 1 (288,0,288,144), id 2 (0,144,288,144), id 3 (288,144,288,144).
    - buildHudTiles(rgba 576×288×4) returns exactly 4 tiles, each {containerName:`hud-tile-N`, containerID:N, bytes:Uint8Array(len>0)}, ids 0..3 in order.
    - buildHudTiles slices the correct sub-region per tile (assert a TL-vs-BR pixel-origin difference using a synthetic gradient RGBA: top-left tile origin pixel ≠ bottom-right tile origin pixel).
    - buildHudTiles tolerates a Uint8ClampedArray of the wrong length by throwing a clear Error (defensive guard).
  </behavior>
  <action>
    Create hud-canvas-renderer.ts exporting `renderHudFrame(snapshot: CharacterSnapshot, dims: {width: number; height: number}): Uint8ClampedArray`.
    Draw the status sheet on a 2D canvas context: in the WebView/sim use a real canvas via `document.createElement('canvas')` when `typeof document !== 'undefined'`, else fall back to `new OffscreenCanvas(w,h)` when available, else throw a guarded Error (the test env never calls renderHudFrame — only Task-1 pure logic is tested). Set canvas width/height to dims (576×288). Fill black background (`ctx.fillStyle='#000'`), then draw white text (`#fff` — the dither maps greyscale → phosphor green on device). Use a COMPACT monospace font: `ctx.font = '14px monospace'` with `ctx.textBaseline='top'` and a ~16px line pitch — deliberately dense and clearly NOT the SDK 27px (that density IS the point of this PoC). Reuse the j0t CONTENT logic from status-hud-renderer.ts (the field selection + formatting: `${name}  Lv${level}`, an HP bar drawn as a FILLED RECT proportional to hp/maxHp with an outline rect, `AC ${ac}`, `VEL —`, `Cond: ${conditions.join(', ') || '—'}`, `Turno — Round — [—]` placeholders, spell-slots row from `spells.slots` rendered as `L●○` groups, and a death-saves row `TS morte ●●○ / ○○○`). Draw the HP bar as `ctx.strokeRect` outline + `ctx.fillRect` fill (width = ratio × barWidth) rather than glyph characters — image rendering lets us draw a real bar. Return `ctx.getImageData(0,0,width,height).data` (RGBA Uint8ClampedArray). TSDoc the public function; note it is the canvas analogue of status-hud-renderer's `render()`.

    Create hud-raster-frame.ts exporting `HUD_TILE_GEOMETRY` (the 4-tile 288×144 layout const) and `buildHudTiles(rgba: Uint8ClampedArray): HudTile[]` where `HudTile = {containerName: string; containerID: number; bytes: Uint8Array}`. REPLICATE MINIMALLY the raster-worker patterns (do NOT import the worker — it is a Web Worker module): import `* as ImageQ from 'image-q'` and `* as UPNG from 'upng-js'`; copy `buildGreyscalePalette()` (16-step 0..240) and a tile-scoped `ditherTile(rgba, pal, 288, 144)` (PointContainer.fromUint8Array → applyPaletteSync floyd-steinberg euclidean-bt709). Slice the 576×288 RGBA into 4 × 288×144 tile buffers (row-by-row subarray copy, TL/TR/BL/BR — mirror raster-worker's splitIntoTiles but with FRAME_W=576, FRAME_H=288, TILE_W=288, TILE_H=144). For each tile: greyscale → dither → `UPNG.encode([dithered.buffer], 288, 144, 16)` → `new Uint8Array(png)`. Return the 4 tiles with containerName `hud-tile-${i}` and containerID `i`. Throw if `rgba.length !== 576*288*4`. TSDoc each export; cite ADR-0013 and the raster-worker source of the reused patterns. Do NOT add xxhash/delta/RLE — the PoC encodes all 4 tiles unconditionally (single frame, no delta).

    Create hud-raster-frame.test.ts implementing the <behavior> spec above (pure geometry/assembler only).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run src/hud/hud-raster-frame.test.ts</automated>
  </verify>
  <done>hud-raster-frame.test.ts passes; renderHudFrame + buildHudTiles + HUD_TILE_GEOMETRY exported and typed; biome + tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PoC page (4 image containers) + push + isolated PoC boot</name>
  <files>packages/g2-app/src/hud/hud-poc-page.ts, packages/g2-app/src/hud/boot-hud-raster-poc.ts, packages/g2-app/src/hud/hud-poc-page.test.ts</files>
  <behavior>
    hud-poc-page.test.ts (pure schema logic — no live bridge):
    - HUD_POC_CONTAINERS has 4 entries hud-tile-0..3 with ids 0..3 and geometry (0,0)(288,0)(0,144)(288,144), each 288×144.
    - buildHudPocPageSchema() returns {containerTotalNum: 4, imageObject: 4 ImageContainerProperty (ids 0..3, name+geometry set), textObject: []}.
    - pushHudTiles(mockBridge, tiles) calls bridge.updateImageRawData once per tile with an ImageRawDataUpdate carrying containerID + containerName + imageData bytes; resolves without throw when every result isSuccess; logs a warning (does NOT throw) when a result is not success (assert via a spy / non-success mock).
  </behavior>
  <action>
    Create hud-poc-page.ts. Export `HUD_POC_CONTAINERS` — a frozen array of 4 image container defs mirroring container-registry's ImageContainerProperty shape: `hud-tile-0`(id0, x0,y0,w288,h144), `hud-tile-1`(id1, x288,y0), `hud-tile-2`(id2, x0,y144), `hud-tile-3`(id3, x288,y144). Export `buildHudPocPageSchema()` returning `{containerTotalNum: 4, imageObject: ImageContainerProperty[], textObject: []}` built from HUD_POC_CONTAINERS (reuse container-registry's `buildBaseImageContainers` pattern: `new ImageContainerProperty({containerID, containerName, xPosition, yPosition, width, height})`). Export `async createHudPocPage(bridge)` — builds `new CreateStartUpPageContainer({...schema})`, awaits `bridge.createStartUpPageContainer(payload)`, throws if result !== `StartUpPageCreateResult.success` (mirror page-lifecycle's createBootPage). Export `async pushHudTiles(bridge, tiles: HudTile[])` — for each tile build `new ImageRawDataUpdate({containerID, containerName, imageData: bytes})`, await `bridge.updateImageRawData(payload)`, and on `!ImageRawDataUpdateResult.isSuccess(result)` `console.warn` (never throw — PoC is best-effort, mirror raster-controller's result check). TSDoc each export; note this is a PoC-LOCAL page (4 image containers full-screen) DISTINCT from the default status-text boot page, and cite the qm0 numeric-containerID requirement.

    Create boot-hud-raster-poc.ts exporting `async bootHudRasterPoc(opts: {bridgeUrl: string; token: string; locale: string; characterId?: string}): Promise<void>`. Sequence (ISOLATED — does NOT touch boot-engine-core): (1) `installHubPolyfill()` then `await waitForEvenAppBridge()` (import both from the SDK / hub-polyfill exactly as boot-engine-core does). (2) `await createHudPocPage(bridge)`. (3) Fetch the snapshot: `GET ${opts.bridgeUrl.replace(/\/+$/,'')}/v1/character/${opts.characterId}` with header `Authorization: Bearer ${opts.token}` via native `fetch`; `CharacterSnapshotSchema.safeParse(await res.json())`; if characterId is undefined OR the fetch/parse fails, log a warning and render with a minimal fallback snapshot (em-dash placeholders) so the PoC ALWAYS draws something — surface the gap, do not silently abort. (4) `const rgba = renderHudFrame(snapshot, {width: 576, height: 288})`. (5) `const tiles = buildHudTiles(rgba)`. (6) `await pushHudTiles(bridge, tiles)`. Wrap the whole body in try/catch → `console.error('[EVF] hud-raster-poc: …')` (fail-soft, never reject). TSDoc the function; state explicitly: SINGLE FRAME, no Worker, no live re-render (follow-up per ADR-0013 §Scope).

    Create hud-poc-page.test.ts implementing the <behavior> spec above (mock bridge for createStartUpPageContainer + updateImageRawData; assert call shapes + non-success warning path).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run src/hud/hud-poc-page.test.ts</automated>
  </verify>
  <done>hud-poc-page.test.ts passes; createHudPocPage/pushHudTiles/bootHudRasterPoc exported + typed; biome + tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Wire the ?hud=raster trigger in launch (guarded, isolated)</name>
  <files>packages/g2-app/src/internal/launch.ts, packages/g2-app/src/index.ts</files>
  <action>
    In launch.ts, inside the no-auth dev branch (`if (deps.isNoAuth())`), AFTER resolving `characterId` from `?actor=`, read `?hud=` from the same `search` string: `const hudMode = new URLSearchParams(search).get('hud')`. When `hudMode === 'raster'`, call the PoC boot path INSTEAD of `deps.bootEngine`: `await deps.bootHudRasterPoc({ bridgeUrl: deps.devBridgeUrl(), token: 'dev-no-auth', locale, ...(characterId !== undefined ? { characterId } : {}) })` inside the existing try/catch, then `return`. When `hudMode` is absent/any-other-value, fall through to the EXISTING normal `deps.bootEngine` call UNCHANGED (the normal text-HUD boot must stay byte-identical). Add `bootHudRasterPoc` to the `LaunchDeps` interface (default = the real `bootHudRasterPoc` imported from `../hud/boot-hud-raster-poc.js`, wired in the `deps` object literal alongside the other defaults). Update the module JSDoc header with a short "Branch A-raster — ?hud=raster PoC" bullet citing ADR-0013. Keep the W-4 gate intact: the import of `bootHudRasterPoc` must route through a thin re-export if needed — verify whether launch.ts importing `../hud/boot-hud-raster-poc.js` directly trips the W-4 grep gate (it only forbids `wsFactory`/`bridgeFactory` literals, which the PoC does not use, so a direct import is fine; do NOT add DI literals).

    In index.ts, re-export `bootHudRasterPoc` from `../hud/boot-hud-raster-poc.js` ONLY IF the package's public surface / W-4 boundary requires the production entry to own the import (match the existing `bootEngine` re-export pattern). If launch.ts can import it directly without tripping W-4, leave index.ts untouched and note that in the SUMMARY.

    Do NOT modify boot-engine-core.ts, status-hud-renderer.ts, container-registry.ts, or page-lifecycle.ts.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app exec vitest run src/internal && corepack pnpm --filter @evf/g2-app exec tsc --noEmit && corepack pnpm exec biome check packages/g2-app/src/hud packages/g2-app/src/internal/launch.ts</automated>
  </verify>
  <done>launch tests pass; ?hud=raster routes to bootHudRasterPoc, absent flag routes to bootEngine unchanged; tsc + biome clean across the new hud/ dir and launch.ts.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| bridge REST → g2-app | `GET /v1/character/:id` JSON crosses into the renderer; untrusted shape. |
| g2-app → EvenHub host | `updateImageRawData` image bytes + container ids cross to the host framebuffer. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ksd-01 | Tampering | snapshot fetch | mitigate | `CharacterSnapshotSchema.safeParse` gates the REST JSON before render; parse-fail → em-dash fallback snapshot (no crash). |
| T-ksd-02 | Denial of Service | bridge unreachable in sim | accept | PoC try/catch fail-soft; `console.error` + return; no retry storm (single frame). |
| T-ksd-03 | Information disclosure | wrong-actor snapshot | accept | dev-no-auth sim only; characterId is the user-supplied `?actor=`; not a prod path. |
| T-ksd-SC | Tampering | npm installs | mitigate | No new deps — reuses existing `image-q` + `upng-js` already vetted in g2-app (ADR-0006). No install task. |
</threat_model>

<verification>
- `corepack pnpm --filter @evf/g2-app exec vitest run src/hud` — pure-logic specs (geometry, tile assembler, page schema, push call shapes) pass.
- `corepack pnpm --filter @evf/g2-app exec tsc --noEmit` — clean.
- `corepack pnpm exec biome check packages/g2-app/src/hud packages/g2-app/src/internal/launch.ts` — clean.
- Existing g2-app suite unaffected: `corepack pnpm --filter @evf/g2-app exec vitest run src/internal` green.
- DEFINITIVE GATE (orchestrator, live — canvas text is NOT unit-testable in happy-dom):
  `pnpm sim start --actor E14Tfh9Ba07cpPyM` → open the sim URL with `?hud=raster&actor=E14Tfh9Ba07cpPyM` → `pnpm sim shot` → the screenshot shows an IMAGE-rendered status sheet (compact ~14px font, real filled HP bar, Artemis data) covering the full 576×288 — visibly denser than the SDK 27px text HUD. Orchestrator emails the screenshot to the user.
</verification>

<success_criteria>
- ONE image-based HUD frame renders on the sim framebuffer under `?hud=raster`.
- Normal boot (no flag) is byte-identical — text-HUD path untouched.
- 4 full-screen 288×144 image tiles pushed via `updateImageRawData` (ids 0..3).
- Single frame: no Web Worker, no live `character.delta` re-render.
- No new dependencies; reuses image-q + upng-js.
- All new code TSDoc'd, biome-clean, tsc-clean.
</success_criteria>

<output>
Create `.planning/quick/260605-ksd-poc-image-based-hud-render-one-complete-/260605-ksd-SUMMARY.md` when done.
</output>
