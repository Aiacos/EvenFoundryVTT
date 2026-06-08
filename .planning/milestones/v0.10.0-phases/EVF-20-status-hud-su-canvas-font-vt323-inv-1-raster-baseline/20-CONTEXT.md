# Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Render the persistent Status HUD (z=1) onto canvas with the VT323 pixel font and
pre-baked static chrome, establish the raster INV-1 contract (PNG-tile hash
fixtures), and make `inv:all` expose two distinct suites — the existing glyph
suite (validating the BLE-degraded fallback path) and the new raster suite
(validating canvas tile output). Also propagate the `'map-capture'` →
`'hud-capture'` rename across all sites.

Builds directly on the Phase 19 substrate: `CanvasCompositor` (400×200 master,
dirty-skip, z-order), the `CanvasLayer` interface, `buildHudRasterPageSchema()`
(5-container schema), and the `LayerManager` `renderMode` / `_flushPage` selector
/ `_compositeAndPush` machinery.

Out of scope: the ~5fps xxhash delta loop (Phase 24), character-sheet/combat
raster panels (Phases 21/23), and INV-3 doc-coherence milestone close (Phase 26).
</domain>

<decisions>
## Implementation Decisions

### Raster INV-1 Contract
- **Hash algorithm: SHA-256** via Node `crypto` for the raster tile fixtures —
  deterministic, zero wasm-init cost, and consistent with the existing
  `perf-probe-hash.test.ts` sha256-truncated precedent. (xxhash-wasm stays
  reserved for the Phase 24 runtime delta loop, not the test contract.)
- **Golden tile hashes live in a committed fixture file** under
  `packages/shared-render/src/fixtures/` (e.g. a `*.raster-hash.json` companion
  to the existing ASCII `.txt` fixtures), not as inline test constants — keeps
  the INV-1 contract data-driven and reviewable like the glyph fixtures.
- **Canonical RGBA source for `buildHudTiles()`** is a deterministic synthetic
  generator: a fixed, known Status-HUD state drawn in-test into the canvas, not a
  checked-in PNG asset. Reproducible byte-for-byte from code, no binary blobs.
- `inv:all` must expose two clearly-labelled suites — "glyph suite" (existing
  ASCII fixtures) and "raster suite" (PNG-tile SHA-256 hashes). Both green is the
  gate.

### Boot Wiring & Scope
- **Canvas becomes the default boot path in this phase.** `renderMode` defaults
  to `'canvas'`; the glyph/text path becomes the BLE-degraded fallback (Phase 25
  later formalizes the fallback-switch semantics and removes the `?hud=raster`
  guard).
- This is BLE-safe ahead of the Phase 24 delta loop because SC3 mandates
  `CanvasStatusHudLayer.paint()` fire **only** when `isDirty()` (after a
  `character.delta`) — idle frames trigger no re-paint and no re-push, so the
  idle HUD already has near-zero BLE bandwidth without the full delta loop.
- The `renderMode` flag itself is retained (the mechanism that Phase 25 will use
  for the fallback switch); only the default value flips to `'canvas'`.
- **Downstream note:** flipping the default here means Phases 24/25 inherit a
  canvas-default world. Phase 25's job narrows to formalizing the glyph fallback
  switch + removing the `?hud=raster` guard rather than performing the promotion.

### Rendering Substrate
- VT323 via `@fontsource/vt323`, loaded in the Worker/canvas context with
  `FontFace` + `self.fonts.add(face)`, with an explicit `try/catch` fallback
  chain to `'16px monospace'` resolved before the first frame; the fallback is
  tested explicitly (SC1).
- Static chrome (frames, labels, tab strip, backgrounds) is pre-baked once into
  an `ImageBitmap` cache at layer mount; subsequent renders GPU-blit the cached
  bitmap without re-drawing chrome (SC2).

### Claude's Discretion
- Exact fixture-file naming/shape, the synthetic RGBA state chosen as canonical,
  the tile-iteration order for hashing, and the `inv-all.ts` suite-labelling
  mechanics are at Claude's discretion within the contract above.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/g2-app/src/engine/canvas-compositor.ts` — `CanvasCompositor`
  (400×200 master, dirty-skip, z-order) from Phase 19.
- `packages/g2-app/src/engine/layer-types.ts` — `CanvasLayer` interface.
- `packages/g2-app/src/engine/layer-manager.ts` — `renderMode` (`'canvas' |
  'glyph'`, currently defaulting to `'glyph'` at line 97), `_flushPage`
  selector, `_compositeAndPush`, canvas-budget; `buildHudRasterPageSchema`
  consumer; `'map-capture'` assertion site.
- `packages/g2-app/src/engine/hud-chrome.ts` — existing chrome helper.
- `packages/g2-app/src/engine/container-registry.ts` — `buildHudRasterPageSchema`
  + `'map-capture'` registry entry to rename.
- `packages/g2-app/src/hud/hud-raster-frame.ts` — `buildHudTiles()` (PoC tile
  builder; SC4 references it as the raster-suite input).
- `packages/g2-app/src/status-hud/status-hud-layer.ts` +
  `status-hud-renderer.ts` — current (glyph) status-HUD layout source of truth
  for the canonical synthetic state.
- `packages/shared-render/src/snapshot.ts` + `fixtures/status-hud.*.txt` —
  existing glyph INV-1 suite and matcher to mirror for the raster suite.
- `packages/validation-harness/scripts/inv-all.ts` — `inv:all` orchestrator to
  extend with the raster suite.

### Established Patterns
- INV-1 fixtures are committed `.txt` files matched by `snapshot.ts`; raster
  suite should mirror this data-driven pattern with a hash-fixture file.
- SHA-256-truncated hashing precedent: `g2-app/src/__tests__/perf-probe-hash.test.ts`.
- `renderMode`-gated `_flushPage` selection already branches canvas vs glyph in
  `layer-manager.ts`.

### Integration Points
- `LayerManager.renderMode` default (line 97) flips `'glyph'` → `'canvas'`.
- `inv-all.ts` gains a raster suite alongside the glyph suite.
- `'map-capture'` rename touches: container-registry, MapBaseLayer,
  LayerManager assertion, and ~12 test files (see grep inventory).
</code_context>

<specifics>
## Specific Ideas

- Glyph suite must keep validating the BLE-degraded fallback path even after the
  default flips to canvas — it is not deprecated, it is the documented fallback.
- The `'map-capture'` → `'hud-capture'` rename must be regression-free across all
  ~14 occurrence sites (already inventoried via grep).
</specifics>

<deferred>
## Deferred Ideas

- ~5fps xxhash delta loop → Phase 24.
- Glyph fallback-switch formalization + `?hud=raster` guard removal → Phase 25
  (now narrowed since the canvas default lands here).
- Character-sheet and combat-tracker raster panels → Phases 21/23.
</deferred>
