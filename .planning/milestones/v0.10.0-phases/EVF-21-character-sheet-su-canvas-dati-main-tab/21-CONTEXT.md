# Phase 21: Character Sheet su Canvas + Dati Main-tab - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Render the character sheet (scheda PG) as a z=2 raster overlay panel on canvas: the
6 tabs (Main · Skills · Inventory · Spells · Features · Biography) drawn on canvas,
R1 gesture navigation preserved byte-identical to the glyph path, a greyscale-dithered
portrait, and the `class`/`initiative`/`speed` fields added to the schema + readers and
wired into the Main tab (replacing the `—` placeholders).

Builds on Phase 20: `CanvasStatusHudLayer` (the first real `CanvasLayer`), the
async `attachCanvas()` interface, `vt323-font-loader.ts`, the `CanvasCompositor`
dirty-gate + minimal delta-recompose driver, and the INV-1 raster baseline.

Requirements: RSHEET-01, RSHEET-02, RSHEET-03, RDATA-01, RDATA-02.

Out of scope: Features + Biography tab DATA (schema `feats[]` + `biography` reader) →
Phase 22 (the tabs exist here but their real data lands in 22); combat tracker on
canvas → Phase 23; the ~5fps xxhash delta loop → Phase 24.
</domain>

<decisions>
## Implementation Decisions

### Schema Extension (RDATA-01, RDATA-02)
- **`class`, `initiative`, `speed` are REQUIRED schema fields** on
  `CharacterSnapshotSchema` — consistent with the Phase 16 (abilities) / Phase 17
  (skills) REQUIRED-extension precedent. Accept the known downstream cost: ~N
  CharacterSnapshot test literals across g2-app/bridge/foundry-mcp must be extended
  with the new fields (same pattern as Phase 16/17).
- **`class: z.string()`** — display form (e.g. `"Fighter"`; multiclass joined as
  `"Fighter / Wizard"`). `level` already exists separately in the schema, so `class`
  carries the class name(s) only.
- **`initiative: z.number().int()`** — the initiative modifier (e.g. `+2`, may be
  negative).
- **`speed: z.number().int().nonnegative()`** — walking speed in feet (e.g. `30`).
  Other movement modes (fly/swim/climb) are deferred (not this phase).
- Add the corresponding readers in `foundry-module` (mirror the `extractAbilities`/
  `extractSkills` reader pattern) and wire into `getCharacterSnapshot`.

### Canvas Sheet Panel (RSHEET-01, RSHEET-02)
- New `CanvasCharacterSheetPanel` rendered as a z=2 `CanvasLayer` overlay (mirror the
  Phase 20 `CanvasStatusHudLayer` pattern: async attach, dirty-gate, paint).
- **Dual-output, ADDITIVE.** The existing `render*Tab(snapshot, locale) -> string[]`
  glyph renderers in `character-sheet-tab-renderers.ts` are preserved INTACT (they are
  the BLE-degraded fallback). The new canvas `paint*Tab(ctx, bounds)` methods are
  ADDITIVE — no deletion of the string renderers (SC4).
- **Gesture semantics byte-identical.** The canvas panel plugs into the EXISTING
  `panel-router` + `panel-gesture-bus` — `panel-gesture-bus.ts` is NOT modified. Open
  from any HUD state, scroll the 6 tabs via R1 scroll, close via double-press — same
  semantics as the glyph path (SC2).
- Main tab shows real class/level + initiative + speed from the extended snapshot
  (SC1), replacing the `—` placeholders.

### Portrait (RSHEET-03)
- Fetch the portrait async ONCE (from `CharacterSnapshotSchema.portrait.url`), dither
  to greyscale **reusing the raster-worker Floyd-Steinberg pipeline against the existing
  16-step greyscale palette** (`ditherTile` / `applyPaletteSync` in `raster-worker.ts`).
- Size: ~100×100 glanceable (consistent with the MapBaseLayer portrait-override ~100×60
  precedent; pick the glanceable size within the G2 image-container hard limits —
  see [[g2-image-container-hard-limits]]).
- **Reuse the `MapBaseLayer` portrait-override slot infra** (`setPortraitOverride(slot,
  bytes)`, slot 3) rather than a new image container.
- On fetch failure: omit the portrait field silently, no error/crash.

### Claude's Discretion
- Exact `paint*Tab` method signatures, the per-tab canvas layout geometry, the portrait
  fetch/decoding plumbing details, the precise glanceable portrait dimensions within the
  hard limits, and how the canvas panel registers with panel-router are at Claude's
  discretion within the contract above.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — Phase 20 CanvasLayer
  template (async attach, dirty-gate, paint, ImageBitmap chrome pre-bake).
- `packages/g2-app/src/panels/character-sheet-panel.ts` — existing glyph sheet panel.
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — `renderMainTab`,
  `renderSkillsTab`, `renderFeatsTab`, `renderBioTab`, `renderTabContent`, etc.
  (the string renderers to PRESERVE + mirror with `paint*Tab`).
- `packages/g2-app/src/engine/panel-router.ts` + `panel-gesture-bus.ts` — gesture
  routing (gesture-bus must stay UNMODIFIED).
- `packages/g2-app/src/engine/overlay-panel.ts` — z=2 overlay slot.
- `packages/g2-app/src/raster/raster-worker.ts` — `ditherTile()` /
  `applyPaletteSync()` Floyd-Steinberg 16-step greyscale dither (reuse for portrait);
  `image-q` + `upng-js` import patterns.
- `packages/g2-app/src/raster/map-base-layer.ts` — `_portraitOverride` slot infra
  (`setPortraitOverride`, slot 3, ~100×60) to reuse for the sheet portrait.
- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema`
  (~line 490): currently `name/hp/ac/level/conditions/abilities/skills/portrait?`;
  extend with `class`/`initiative`/`speed`.

### Established Patterns
- Phase 16/17 REQUIRED schema extension: schema field + `extract*` reader +
  `getCharacterSnapshot` wiring + downstream test-literal updates across packages.
- INV-1 fixtures: glyph `.txt` fixtures + raster SHA-256 hash fixtures (Phase 20).
- CanvasLayer dual path gated by `renderMode` (canvas default since Phase 20).

### Integration Points
- `CharacterSnapshotSchema` (+ all downstream literal constructors in tests).
- `foundry-module` readers + `getCharacterSnapshot`.
- panel-router registers `CanvasCharacterSheetPanel`; gesture-bus unchanged.
- MapBaseLayer portrait slot consumed by the sheet portrait.
</code_context>

<specifics>
## Specific Ideas

- The glyph `render*Tab` string renderers are NOT deprecated — they are the documented
  BLE-degraded fallback. Canvas `paint*Tab` is strictly additive.
- `panel-gesture-bus.ts` must be byte-unchanged (SC2 gesture-identity).
- Reuse, don't reinvent: portrait dither = raster-worker Floyd-Steinberg; portrait slot
  = MapBaseLayer override infra.
</specifics>

<deferred>
## Deferred Ideas

- `feats[]` + `biography` schema/readers and their tab DATA → Phase 22 (the Features +
  Biography tabs render here but show real data only after Phase 22).
- Combat tracker on canvas → Phase 23.
- ~5fps xxhash sub-tile delta loop → Phase 24.
- Fly/swim/climb movement modes for `speed` → future (walk-only this phase).
</deferred>
