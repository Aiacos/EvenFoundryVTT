# ADR-0013: HUD raster rendering (image-based HUD)

- **Status:** Accepted (2026-06-05)
- **Supersedes (in part):** the text-container HUD rendering path of ADR-0001 (layered UI model) for the always-on status view. ADR-0001's layered z-model is retained; the **rendering substrate** of the status/HUD layer changes from SDK text containers to a rasterized image.
- **Relates to:** ADR-0006 (raster pipeline library stack), ADR-0005 (Phase 0 GO/NO-GO — BLE bandwidth), ADR-0009 (LayerManager contract).

## Context

The Even Realities G2 SDK exposes two rendering substrates:

1. **Text containers** — native LVGL text. **Fixed 27px line height, no font control** (`hub.evenrealities.com/docs/guides/device-apis`: *"no text alignment, no font control"*). Measured with `@evenrealities/pretext`: 576×288 → **~10 rows max**, full-width line ≈ **~50 chars**.
2. **Image containers** — arbitrary 4-bit greyscale bitmaps via `updateImageRawData`. **4 images max, each ≤ 288×144 px** (`@evenrealities/even_hub_sdk` typedefs). `4 × (288×144)` arranged 2×2 = **576×288 = full screen**.

The text-container HUD (status-hud-renderer, quick task `260605-j0t`) was redesigned to fit the real 27px grid (full-width 8-row sheet) and works, but it is permanently bound to the SDK font: low information density, no typographic control, "scritte troppo grandi" by user assessment. The text substrate cannot deliver the intended dense "Alien Nostromo / VFD / CRT phosphor-green" aesthetic (Specs §0 Project, §7.2).

The project **already owns a complete raster pipeline** (`packages/g2-app/src/raster/`, ADR-0006): a long-lived Web Worker running `OffscreenCanvas` + `image-q` (Floyd-Steinberg dither, 16-step greyscale palette) + `upng-js` (4-bit indexed PNG) + `xxhash-wasm` (sub-tile delta hashing), with `RasterController` (200 ms debounce, adaptive frame rate, BLE-failure → glyph fallback). It currently rasterizes only the **map** (4 × 200×100 tiles → `map-tile-0..3`).

## Decision

**Render the always-on HUD as a rasterized image**, drawn on an `OffscreenCanvas` at a font/size/layout we fully control, then pushed through the existing raster pipeline as **4 image tiles of 288×144 covering the full 576×288 screen**, at a committed **~5 fps** (user-accepted) with delta encoding so static frames cost ~nothing.

Concretely:
- A new **HUD canvas renderer** draws the status sheet (HP bar, AC, conditions, turn, etc.) onto a 576×288 OffscreenCanvas using a chosen bitmap/pixel font — typographic density is ours to set (target the spec's dense glanceable card, far more than 10 rows if useful).
- The **raster pipeline is generalized** from the map-only 400×200 / 200×100-tile geometry to a full-screen 576×288 / **288×144-tile** geometry (or a parallel HUD config), reusing the worker's dither→tile→delta→PNG stages verbatim.
- The default boot page declares **4 image containers** (full-screen tiles) for the HUD instead of text containers. Text containers are retained only where native scroll genuinely helps (TBD per overlay; the always-on HUD is fully raster).
- **The j0t status-hud-renderer's CONTENT logic is reused** — *what* to show (fields, formatting, fallbacks for missing data) is unchanged; only the **output target** changes from `\n`-joined strings to canvas draw calls.
- `character.delta` (the d0v/dog/e9t/flv data path) → HUD canvas redraw → changed tiles re-encoded → `updateImageRawData`. The 5 fps adaptive cadence + delta hashing keep a static HUD near-zero bandwidth.

## Consequences

**Positive**
- **Full font/layout control** — directly resolves "scritte troppo grandi" and unlocks the intended dense phosphor-green aesthetic. Density is a design choice, not an SDK limit.
- **Reuses existing, tested infrastructure** (raster-controller/worker/rle/tile-delta + image-q/upng/xxhash). No new runtime dependency or language.
- **One coherent substrate** — map and HUD both raster; the layered z-model (ADR-0001) composites onto the canvas before tiling.

**Negative / risks**
- **Bandwidth** — a full-screen 4-bit frame is ~82 KB raw; mitigated by delta encoding (HUD is mostly static) + RLE + PNG + 5 fps cap. On real hardware this depends on sustained BLE ≥ ~200 kbps (ADR-0005 Phase 0, `human_needed` on real G2). In the simulator it is unconstrained.
- **Loses native text scroll** for any view moved off text containers — scrolling lists must be rendered/paged in-canvas (manual). Acceptable for the always-on HUD; evaluated per overlay panel.
- **CPU** — per-frame canvas draw + dither in the worker; bounded by the 5 fps cap + delta short-circuit (unchanged tiles skip encode).

## Why NOT Python (explicit, user asked)

Runtime rendering happens in the **phone WebView (JS/TS + OffscreenCanvas)** — the plugin execution model runs on the phone, not a Python process (`hub.evenrealities.com/docs/getting-started/overview`). The only server-side option is the **Node bridge** (which already has `sharp`), not Python. The raster pipeline is already JS (`image-q`/`upng-js`/`xxhash-wasm`). Introducing Python would fragment the TS/Node monorepo (Tech Stack §What NOT to Use) for zero benefit. Python is, at most, an optional **build-time** asset generator (bitmap fonts, static sprites) — and even that is better done with the existing JS canvas tooling for stack consistency.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep text-container HUD (j0t) | Permanently bound to the 27px SDK font; cannot reach the intended density/aesthetic. Kept only as a glyph-mode fallback. |
| Server-side render in the Node bridge (sharp) then push images | Viable (Specs §11.5.7 Option B) but moves rendering off-device, adds WS image traffic for every HUD change, and duplicates the existing client raster worker. Revisit only if WebView CPU proves insufficient. |
| Python renderer/microservice | Wrong execution model (WebView is JS), fragments the stack, adds a service. Rejected. |

## Scope (follow-up plan, this branch `feat/hud-raster-rendering`)

1. Generalize the raster pipeline to full-screen 576×288 / 288×144 tiles (or a HUD-specific config alongside the map config).
2. HUD canvas renderer (reuse j0t content logic; choose the bitmap font + density).
3. Boot page = 4 HUD image tiles; wire `character.delta` → redraw → tiles.
4. INV-1 contract for the raster HUD (snapshot the canvas output / tile hashes deterministically) + Specs §7 update + showcase.
5. Glyph/text fallback retained for the BLE-degraded path (ADR-0005).

## Amendments

### Amendment 1 — Canvas compositor substrate (2026-06-05, Specs v0.10.0)

**Status:** ACCEPTED — extends the raster HUD direction; does not overturn it. The core decision (render the always-on HUD as a rasterized image via the existing raster pipeline) stands unchanged. This amendment corrects the geometry stated in the original Decision body and ratifies the five architectural decisions required for the Canvas Compositor Core phase (Phase 19).

**Trigger:** INV-2 verification round (2026-06-05) against `hub.evenrealities.com/docs/guides/display` confirmed that the G2 image-container hardware cap is **20–200 px wide × 20–100 px tall, max 4 per page** — not the 288×144 assumed in the original Decision. The 288×144 / 576×288 geometry was derived from the `@evenrealities/even_hub_sdk` TypeScript typedefs and validated only in the EvenHub simulator (which does not enforce hardware image-size limits). It was never confirmed on real hardware. Additionally, the Phase 19 compositor design decisions (Option B per-layer OffscreenCanvas, capture-container re-mapping, fixed-budget canvas mode, serialized push, renderMode flag) were locked during architecture research and must be ratified as a written contract before any implementation merge.

**Decision:**

This amendment locks five architectural decisions for the Canvas Compositor Core (Phase 19+):

#### 1. Compositor model — Option B

**Per-layer `OffscreenCanvas`, composited via `drawImage` in ascending z-order onto a master 400×200 canvas.** `CanvasCompositor` owns the master canvas; `LayerManager` stays orchestrator-only (it does not render directly). Each `CanvasLayer` exposes `paint()` + dirty-tracking + optional static cache. The compositor iterates registered layers sorted by ascending `ZIndex` value (using `[...entries].sort(([a],[b]) => a-b)`) to guarantee correct z-order regardless of registration order.

Rationale: the static/dynamic layer split is first-class at the `CanvasLayer` boundary; each layer is independently testable; `LayerManager` retains its existing orchestration contract without acquiring rendering responsibilities; the existing `buildHudTiles` / `pushHudTiles` pipeline is consumed unchanged.

#### 2. Geometry correction (INV-2, verified 2026-06-05)

**Raster surface = 400×200 (4 tiles of 200×100 each), NOT 576×288 / 288×144.**

| Dimension | Original Decision | Corrected (INV-2) | Source |
|-----------|-------------------|-------------------|--------|
| Tile width | 288 px | **200 px** | `hub.evenrealities.com/docs/guides/display` — image container max width |
| Tile height | 144 px | **100 px** | same — image container max height |
| Raster region | 576×288 (full screen) | **400×200** | 4 tiles × 200 px wide, 2 rows × 100 px tall |
| Tile layout | 2×2 covering full screen | **2×2 covering a 400×200 region** | same hardware cap |

`HUD_TILE_GEOMETRY` is set to 200×100 (4 tiles). Tile offsets relative to the raster-region origin: tile-0=(0,0), tile-1=(200,0), tile-2=(0,100), tile-3=(200,100). **The on-screen placement of the 400×200 region inside the 576×288 physical screen is parameterized** — the default offset is deferred to Phase 20 when visible content is first rendered. No hard-coded 576×288 on-screen offset is introduced in Phase 19.

**Why 288×144 must be rejected:** that geometry passed only in the EvenHub simulator, which does not enforce hardware image-size limits. On real G2 hardware, a 288×144 image container would exceed the 200×100 per-container cap and be rejected by the host. See memory `g2-image-container-hard-limits`.

#### 3. Capture-container re-mapping

**The 5th page container `'hud-capture'` is a full-screen text container (576×288) with `isEventCapture:1`, placed behind the 4 image tiles in declaration order.** It is NOT a zero-size container — that approach is undocumented and untested. The canonical EvenHub first-app example uses a full-screen text container as the gesture-capture target; this is the established pattern.

INV-5 (gesture determinism) is preserved: the `hud-capture` text container is the sole `isEventCapture:1` container on the HUD raster page, providing unambiguous R1 input routing. `MapBaseLayer.getCaptureContainer()` continues to return `'map-capture'` for the map/glyph path; the HUD raster page uses `'hud-capture'` as its capture target (different page, different container namespace).

#### 4. Container budget — fixed mode + serialized push

**In canvas mode the container budget is FIXED at page creation: 5 containers (4 image tiles + 1 text capture).** `CanvasLayer.getContainerCount()` MUST return `{image:0, text:0}` — canvas layers do not allocate individual SDK containers; the 5-container budget is declared once via `buildHudRasterPageSchema()` at `_flushPage()`. `_assertContainerBudget()` uses a fixed-budget branch in canvas mode (no per-layer sum) that validates each layer returns `{image:0, text:0}` and throws `panel_mount_budget_exceeded` if a layer declares non-zero counts.

**Serialized push:** `updateImageRawData` does NOT allow concurrent sends (SDK constraint). `_compositeAndPush()` pushes the 4 tiles sequentially (`for...of` with `await` per tile), NOT concurrently (`Promise.all` is forbidden). The existing `pushHudTiles()` implementation already uses serialized push; it is called unchanged from `_compositeAndPush()`.

**Schema is fixed:** panel change (Phase 21+) is accomplished via `updateImageRawData` on existing tiles, NOT `rebuildPageContainer` — rebuilding the page schema would flicker and lose all container state. The page schema is declared once per `_flushPage()` call; subsequent redraws update the image data in-place.

#### 5. Glyph fallback coexistence + `_flushPage()` schema selector

**`LayerManager.renderMode: 'canvas' | 'glyph'`** selects the rendering path. Default = `'glyph'` (backwards-compatible with all existing behavior). The glyph path is **byte-identical to today** throughout Phase 19 — BLE-degraded fallback per ADR-0005 Branch A; zero behavioral changes to the glyph branch.

`_flushPage()` selects the page schema based on `renderMode`:

| `renderMode` | Schema builder | Containers |
|-------------|----------------|------------|
| `'canvas'`  | `buildHudRasterPageSchema()` | 5 (4 image tiles + 1 text capture) |
| `'glyph'`   | `buildStatusViewTextContainers()` | 3 (header + footer + status-hud text, unchanged) |

Mode switch is atomic via `bundle([])`. In canvas mode, `_flushPage()` additionally calls `_compositeAndPush()` to write the compositor's RGBA output to the 4 image tiles.

---

**Consistency check vs original Decision:**

- ✓ Raster-substrate direction retained — the always-on HUD is rendered as a rasterized image pushed via `updateImageRawData`.
- ✓ Layered z-model retained — ADR-0001 Option A z-stack unchanged; `CanvasCompositor` composites within z=1.
- ✓ Reuse of existing raster pipeline (`buildHudTiles`, `pushHudTiles`, `image-q`, `upng-js`) — these are consumed unchanged.
- ✓ Glyph fallback retained — `renderMode: 'glyph'` path is byte-identical to pre-Phase-19 behavior.
- ⚠ **Geometry corrected:** 288×144 / 576×288 → **200×100 / 400×200**. The original Decision stated "4 image tiles of 288×144 covering the full 576×288 screen" — this is rejected by INV-2 hardware evidence. The raster region covers 400×200 of the 576×288 screen; placement of the region is parameterized.
- ⚠ **Capture container type changed:** the original ADR had no explicit capture-container in the HUD raster schema (it was a PoC with only 4 image tiles). Amendment 1 adds the required `'hud-capture'` text container as the 5th container with `isEventCapture:1`, satisfying INV-5.

---

**INV-2 status:** Verified 2026-06-05 against `hub.evenrealities.com/docs/guides/display`. The G2 image-container hardware limits are: max 4 image containers per page, each 20–200 px wide × 20–100 px tall. The 400×200 raster region (4 tiles 200×100 each) is at the hardware maximum. Source authority: `hub.evenrealities.com/docs/guides/display` (INV-2 primary source). Memory record: `g2-image-container-hard-limits`. This verification supersedes the `@evenrealities/even_hub_sdk` typedef dimensions and the EvenHub simulator behavior, both of which permitted oversized containers.

**Hardware SC:** The 400×200 raster region + full-screen `hud-capture` text container rendering and gesture routing on **real G2 hardware** is `human_needed` under **ADR-0005 Branch A** — no physical hardware is available for automated testing. The software-side geometry migration (RINV-02) and schema construction (RAST-02) are verified by automated unit tests. Hardware confirmation is deferred to the first real-device test session.
