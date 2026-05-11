# @evf/g2-app

Browser bundle for the EVF G2 plugin host (Even Realities App WebView).

**Status:** Phase 4a placeholder. Real implementation lands in Phase 4a (G2 Engine + Raster + Status HUD).

## Stack

- Vite 8 (build + dev server)
- Web Worker + OffscreenCanvas (Phase 4a — raster pipeline)
- `image-q@4.0.0` + `upng-js@2.1.0` + `xxhash-wasm@1.1.0` (Phase 4a — dither + 4-bit PNG + delta hash)

## Consumers / Downstream

Phase 4a: render Foundry scene as 4-bit dithered raster to G2 glasses.
Phase 4b: overlay slot + map mode toggle + adversarial UI.
Phase 5: 6-tab character sheet panel consumes via shared-render.

## See also

- `Specs.md` §3.7 (plugin host architecture)
- `docs/architecture/0001-layered-ui-model.md` (when Wave 2 lands)
- `.planning/phases/01-foundation/01-CONTEXT.md`
