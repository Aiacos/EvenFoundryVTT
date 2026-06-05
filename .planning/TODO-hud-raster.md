# TODO — Image-based HUD (raster) — branch `feat/hud-raster-rendering`

Direction anchor: **ADR-0013** (`docs/architecture/0013-hud-raster-rendering.md`).
PoC done + live-sim verified (quick task `260605-ksd`): a single image-HUD frame renders on the
glasses framebuffer via `?hud=raster` (canvas 576×288 → 4-bit dither → 4 tiles 288×144 →
`updateImageRawData`). Reuses the existing raster pipeline (image-q/upng); no new deps; no Python.
PoC code: `packages/g2-app/src/hud/{hud-canvas-renderer,hud-raster-frame,hud-poc-page,boot-hud-raster-poc}.ts`.
Verify with: `pnpm sim start --actor E14Tfh9Ba07cpPyM` + sim URL `?hud=raster&actor=...` + `pnpm sim shot`.

## Next steps

- [ ] **1. Live re-render on `character.delta`** — wire the d0v/dog/e9t/flv data path so the HUD canvas
      redraws + re-pushes tiles whenever the character snapshot changes (not just one frame on connect).
- [ ] **2. ~5 fps delta loop** — drive the raster HUD through (or alongside) the existing
      `RasterController` (200 ms debounce, adaptive fps, sub-tile xxhash delta) so only CHANGED tiles
      are re-encoded/sent. Idle HUD ≈ near-zero bandwidth.
- [ ] **3. Final font / density / aesthetic** — pick the production bitmap/pixel font + layout density
      (the PoC uses 14px monospace and only the top half of the screen — we can fit much more, or
      bigger, with a real glanceable design). Phosphor-green VFD/CRT look.
- [ ] **4. Promote off the `?hud=raster` flag** — make the raster HUD the real default-view substrate
      (replace the text-container status page); keep the text/glyph HUD as the BLE-degraded fallback
      (ADR-0005). Update `container-registry` default page → 4 HUD image tiles.
- [ ] **5. INV-1 contract for the raster HUD** — deterministic snapshot of the canvas output / tile
      hashes (replaces the text-fixture INV-1 approach for the HUD).
- [ ] **6. INV-3 coherence** — update Specs §7 (raster-HUD layout), README, `docs/showcase/index.html`.
- [ ] **7. Generalize the raster pipeline geometry** — `raster-worker` is currently map-only 400×200 /
      200×100 tiles; generalize to full-screen 576×288 / 288×144 (or a parallel HUD config) so map + HUD
      share one worker.

## Deferred / related
- Map-as-gesture-mode toggle (default view is the HUD; map opens on demand) — ADR-0013 §Scope.
- Overlay panels (combat-tracker, inventory, spellbook, …) still text-container + 27px-dense — a separate
  "g2-app UI density rework" once the HUD raster substrate is proven.
- GEST-01 / ADR-0012 `long=`→`qa=` gesture-vocab sweep stays Phase 20.

## Housekeeping (from session 2026-06-05)
- 2 stray text-only Gmail drafts ("[EVF] PoC HUD a immagini …") — email attachment via the Gmail MCP
  tool failed (binaries unsupported); drafts can be deleted. Frame PNG: `release-artifacts/evf-hud-poc-artemis.png`.
- `feat/real-foundry-pairing` (27 commits: data path, selection, sim harness, text HUD) is ready for its PR.
