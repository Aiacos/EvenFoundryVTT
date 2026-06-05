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
