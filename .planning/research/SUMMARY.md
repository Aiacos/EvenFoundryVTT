# Project Research Summary — v0.10.0 Raster UI Substrate

**Project:** EvenFoundryVTT (EVF)
**Milestone:** v0.10.0 Raster UI Substrate
**Domain:** AR glasses HUD compositor — swapping text-container SDK substrate for composited raster canvas
**Researched:** 2026-06-05
**Confidence:** HIGH (stack additions from platform API specs + npm registry; architecture from verified codebase; features from CharacterSnapshotSchema + renderer source; pitfalls from ADR-0013 + ADR-0005 + raster source files)

> **⚠ INV-2 GEOMETRY CORRECTION (2026-06-05, post-synthesis — supersedes any 288×144 / 576×288 figure below):** verified against `hub.evenrealities.com/docs/guides/display` — G2 image containers are **max 4 per page, each 20–200px wide × 20–100px tall**. The **288×144** tile (Pitfall R-2) is **confirmed REJECTED** on real hardware (it only worked because the simulator does not enforce hardware size limits). The raster surface is therefore a shared **400×200 region (4 tiles 200×100), NOT the full 576×288 screen** — the full screen cannot be raster-filled. `updateImageRawData` does not allow concurrent sends (serialize the 4 tile pushes); a fixed image-tile page schema + per-frame `updateImageRawData` avoids `rebuildPageContainer` flicker; capture-invariant via a full-screen text container with `isEventCapture:1` behind the tiles. The active plan (PROJECT.md / REQUIREMENTS.md / ROADMAP.md) is corrected to 400×200 / 200×100. See memory `g2-image-container-hard-limits`. The HUD_TILE_GEOMETRY "FULL_SCREEN_2x2 vs DOCUMENTED_LIMIT_2x2" toggle proposed below is moot — it is fixed at 200×100.

---

## Executive Summary

v0.10.0 is a **substrate swap**, not a feature addition. The HUD rendering target moves from SDK text containers (fixed 27 px font, 10 rows × 50 chars) to a compositor that paints layers onto a single 576×288 `OffscreenCanvas`, dithers via the existing `image-q` + `upng-js` pipeline, and pushes 4 tiles of 288×144 via the 4 image-container SDK slots. Full typographic control is the payoff: ~18 rows at 16 px VT323 instead of 10 rows at 27 px. Approximately 90 % of content logic already exists across `character-sheet-tab-renderers.ts`, `combat-tracker-panel.ts`, `LayerManager`, and the `src/hud/*` raster pipeline — the work is wiring a canvas compositor between data and output.

The recommended compositor model (chosen over a shared-context alternative) is **per-layer `OffscreenCanvas`, composited via `drawImage` in z-order**. Each layer caches its last paint as an `ImageBitmap`; clean layers cost one GPU blit per composite instead of a full repaint. This makes the static/dynamic split first-class: chrome (borders, dividers, tab strip, section labels) is baked once; only HP values, slot pips, and turn indicators repaint on `character.delta`. The two downstream functions `buildHudTiles` and `pushHudTiles` in `hud-raster-frame.ts` / `hud-poc-page.ts` are **unchanged**; they remain the exit point of the pipeline.

Two hard ordering constraints govern the roadmap. First, **ADR-0013 Amendment 1 must be written before any implementation begins** — the amendment codifies the compositor model, capture-container re-mapping, container-budget fixed mode, glyph fallback `renderMode`, and `_flushPage()` schema selector. Second, **the xxhash sub-tile delta loop (TODO-hud-raster #2) must precede promotion off the `?hud=raster` flag (TODO-hud-raster #4)** — without delta, every `character.delta` event re-encodes all four 288×144 tiles, saturating BLE bandwidth in combat. The open question requiring an explicit requirements decision: **does v0.10.0 include TODO-hud-raster #2, or does it ship the compositor + content (Phases A–E) behind the flag with a hard "promote blocked until delta lands" gate?** This must be resolved before planning begins.

---

## Key Findings

### Recommended Stack

No new heavy dependencies. The v0.10.0 stack additions are:

**Core technologies:**
- `@fontsource/vt323` v5.2.7 (OFL-1.1, ~10–15 KB WOFF2): pixel font for HUD, self-hosted, loaded in Worker via `new FontFace('VT323', arrayBuffer)` + `self.fonts.add(face)`. Replaces `'14px monospace'`. Best sizes: 16 px, 20 px.
- `createImageBitmap(canvas)` (platform API, no install): freezes static chrome `OffscreenCanvas` as GPU-resident `ImageBitmap`; `ctx.drawImage(imageBitmap)` is a GPU-to-GPU blit, effectively free. Alternative: keep source `OffscreenCanvas` alive and `drawImage` from it directly (avoids `close()` obligation).
- `new OffscreenCanvas` + 2D context (platform API): each layer owns one; compositor owns master 576×288. Full support Safari 17+, partial Safari 16.2. Main-thread fallback via `document.createElement('canvas')` already in `acquireCanvas2d()`.
- `WorkerGlobalScope.fonts` + `FontFace` (platform API): font loading in Worker requires `self.fonts.add(face)`, NOT `document.fonts`. CSS `@font-face` on main thread does NOT carry to Worker. On Safari 16 WKWebView empirical status is uncertain; implement with `try/catch` + `'16px monospace'` fallback chain.

**Confirmed unchanged:** `image-q` 4.0.0, `upng-js` 2.1.0, `xxhash-wasm` 1.1.0, Vite 8, TypeScript 5.8.3 strict, Vitest 4, Biome 2, pnpm 10.33.4.

**What NOT to add:** `fabric.js` / `konva.js` / `pixi.js` (scene graphs, no retained-mode needed), `opentype.js` / `fontkit` (no glyph metrics beyond `measureText`), Google Fonts CDN (Even Hub whitelist forbids external CDN), `document.fonts.add()` in Worker (throws `ReferenceError`).

### Expected Features

**Must have (table stakes, v0.10.0):**
- REQ-PERF-01..04 — Canvas compositor architecture (root dependency for all raster panels)
- REQ-MAIN-01..13 — All Main tab fields: name, class/level, HP bar, AC, 6 abilities + saves, conditions, death saves, senses passives, initiative, speed, proficiency, exhaustion
- REQ-SCHEMA-01..06 — Six missing schema fields: `class` (unlocks class/level line), `initiative`, `speed`, `feats[]` (unlocks Features tab real data), `biography` (unlocks Bio tab real data), `combatant.ac` (closes `acValue = ' --'` placeholder at `combat-tracker-panel.ts:292`). Each extension ships atomically with the renderer that consumes it.
- REQ-SKILL-01..06, REQ-INV-01..06, REQ-SPELL-01..07, REQ-FEAT-01..06, REQ-BIO-01..06 — Full canvas port of all 6 tabs
- REQ-COMB-01..11 — Combat tracker raster port (all existing logic preserved)
- REQ-NAV-01..06 — Gesture navigation: tab cycle, scroll, double-press close, over-scroll, tab strip chrome, scroll-position indicator

**Should have (P2, add within v0.10.0 if budget allows):**
- REQ-MAIN-14 — Portrait inset (async fetch + `image-q` dither, cached at panel-open; schema already has `portrait.url`)
- REQ-SPELL-08 — Spell save DC binding (schema already primed: `abilities.<k>.dc`)
- REQ-COMB-12..13 — Current-turn full-contrast row, HP bar greyscale gradient (low-cost raster differentiators)
- REQ-SCHEMA-06 + REQ-COMB-05 — Combatant AC

**Defer (v0.10.1 / future):**
- REQ-PERF-05 — xxhash sub-tile delta loop (TODO-hud-raster #2) — out of scope per PROJECT.md unless pulled in by requirements decision
- REQ-COMB-14 — Live effects section (requires effects data in `CombatantSchema`)

**Anti-features to refuse:**
- Hit Dice recovery UI on Main tab (no write path yet)
- Full feat/spell descriptions inline (prose on a glance surface)
- XP bar on Main tab (prime real estate for rarely-checked stat)
- Double-buffered canvas (G2 is frame-push, no tearing, zero benefit)
- Full 576×288 re-encode on every delta (BLE bandwidth bomb)

### Architecture Approach

**Compositor model: Option B (per-layer `OffscreenCanvas`, `drawImage` in z-order)**. Chosen over Option A (shared ctx) because static/dynamic split is first-class; layers are independently testable; `LayerManager` stays an orchestrator not a renderer.

**New components:**
1. `CanvasCompositor` (`src/engine/canvas-compositor.ts`) — owns master 576×288 canvas; composites layers in z-order; returns RGBA for `buildHudTiles`; injected into `LayerManager`
2. `CanvasLayer` interface (`layer-types.ts`, additive) — extends `Layer` with `attachCanvas()`, `paint()`, `isDirty()`; no changes to existing `Layer`, `OverlayPanel`, `LayerOp`
3. `buildHudRasterPageSchema()` — 5-container schema: 4 image tiles (`hud-tile-0..3`) + 1 zero-size capture text container (`hud-capture`, `isEventCapture:1`). Solves INV-5 without consuming any image-container budget.
4. `CanvasStatusHudLayer`, `CanvasCharacterSheetPanel`, `CanvasCombatTrackerPanel` — canvas-output variants of existing layers; glyph-fallback text-path variants kept intact as separate classes
5. `hud-font-loader.ts` — isolates `FontFace` + `self.fonts.add()` in Worker scope with fallback chain
6. `hud-chrome-layer.ts` — static chrome pre-bake: draw borders/dividers/labels once, cache as `ImageBitmap`, expose `composite(ctx)`

**Modified existing (scope summary):** `LayerManager` (add `renderMode`, inject `CanvasCompositor`, update `_flushPage()` + `_compositeAndPush()`, fixed-budget assertion); `boot-engine-core.ts` (wire compositor, switch default to 5-container HUD schema, remove `?hud=raster` gate); `MapBaseLayer` (rename `'map-capture'` → `'hud-capture'`; `getContainerCount()` returns `{image:0, text:0}` in canvas mode).

**Unchanged and reused as-is:** `hud-raster-frame.ts` (`buildHudTiles`), `hud-poc-page.ts` (`pushHudTiles`), `hud-canvas-renderer.ts` (`renderHudFrame`), `hud-live-render.ts`, all existing text-path renderers, `PanelGestureBus`, `panel-router.ts`, `RasterController` + worker.

**INV-1 raster determinism story:** Inject a **synthetic RGBA fixture** (deterministic pixel array, NOT from `renderHudFrame`), run `buildHudTiles(syntheticRgba)` through full dither + encode pipeline, snapshot tile PNG SHA-256 or xxhash via `expect(hex).toMatchInlineSnapshot()`. `image-q` Floyd-Steinberg with the canonical 16-step palette is deterministic for a given input. Content-correctness functions (`formatConditions`, `formatSlots`, `hpFraction`, etc.) are pure — test independently of canvas. Canvas text rendering (`ctx.fillText`) is non-deterministic across engines — validate visually via `pnpm sim shot` only.

### Critical Pitfalls

**v0.10.0 raster-specific (in order of severity):**

1. **Pitfall R-2 — 288×144 tile size is simulator-confirmed only; documented cap is 200×100** — the single highest-risk unverified assumption. Prevention: INV-2 re-fetch `hub.evenrealities.com/docs/guides/device-apis` before Phase A merges. Parameterize `HUD_TILE_GEOMETRY` as a config flag switching between `FULL_SCREEN_2x2` (288×144) and `DOCUMENTED_LIMIT_2x2` (200×100). Add `human_needed` SC to promotion gate.

2. **Pitfall R-3 — full 4-tile re-encode on every `character.delta` is a BLE bandwidth bomb** — 4 × ~12 KB × 5 fps = ~240 KB/s saturates BLE Branch A p50. Prevention: TODO-hud-raster #2 (delta loop) must precede #4 (promote). Immediate guard: `MIN_REDRAW_INTERVAL_MS = 200` in `makeSnapshotRenderHandler`.

3. **Pitfall R-1 / R-4 — ASCII INV-1 fixtures become false safety net** — ~60 `.txt` fixtures test glyph-fallback only; CI stays green while primary raster surface has zero coverage. Prevention: `raster-fixtures/` directory in `packages/shared-render/src/`; `inv:all` distinguishes `glyph suite` from `raster suite`; do NOT delete ASCII fixtures — annotate as glyph-fallback path.

4. **Pitfall R-7 — capture-container invariant breaks if raster HUD page schema omits `isEventCapture:1`** — PoC page has no capture container; `LayerManager` invariant fires on promotion. Prevention: 5th zero-size `hud-capture` text container in `buildHudRasterPageSchema()`; test in simulator before promotion PR.

5. **Pitfall R-5 — synchronous `renderHudFrame` + `buildHudTiles` on main thread causes R1 gesture starvation** — HUD tiles are 4× larger in area than map tiles. Prevention (interim): `setTimeout(0)` yield between render and encode. Full fix: TODO-hud-raster #7 (move `buildHudTiles` to Worker).

**From baseline pitfall research (relevant to v0.10.0):**

6. **Pitfall 15 — Floyd-Steinberg in sRGB produces over-dark midtones on 4-bit phosphor green** — Prevention: linearize before dither (`pow(srgb/255, 2.2)`); perceptually-spaced CIE L* palette; serpentine scan in `image-q` v4. Address in Phase B before INV-1 raster fixtures are frozen.

7. **Pitfall 7 — Even Realities SDK has no SemVer guarantee** — firmware OTA can change `updateImageRawData` byte format silently. Prevention: boot-time format probe; `firmware_version` in capability handshake; tested-against matrix.

---

## Implications for Roadmap

### Phase A: Canvas Compositor Core
**Rationale:** Infrastructure-only. All existing tests pass unchanged. Root dependency for every subsequent phase.
**Delivers:** `CanvasCompositor`; `CanvasLayer` interface; `buildHudRasterPageSchema()` (5-container with capture); `LayerManager` `renderMode` + `_flushPage()` selector + `_compositeAndPush()` + fixed-budget assertion.
**Prerequisite before this phase opens:** ADR-0013 Amendment 1 written (compositor model, capture-container re-mapping, budget fixed mode, glyph fallback `renderMode`, `_flushPage()` schema selector).
**Avoids:** Pitfall R-7 (capture container in schema from day one).
**Research flag:** Standard patterns — no further research needed.

### Phase B: Status HUD on Canvas (z=1) + INV-1 Raster Baseline
**Rationale:** First visible raster layer. Establishes `CanvasStatusHudLayer` pattern repeated by Phases C and D. Must also establish INV-1 raster contract here — not deferred — so fixtures capture the correct palette behavior.
**Delivers:** `CanvasStatusHudLayer`; `hud-font-loader.ts` (VT323 + fallback chain); `hud-chrome-layer.ts` (static chrome pre-bake); rename `'map-capture'` → `'hud-capture'`; INV-1 raster fixtures (loading/active/death-saves states); palette linearization (Pitfall 15 mitigation).
**Stack:** `@fontsource/vt323` v5.2.7 installed here.
**Avoids:** Pitfall R-1 (INV-1 raster contract defined early); Pitfall R-10 (font fallback chain tested).
**Research flag:** WKWebView `WorkerGlobalScope.fonts` on iOS 16 is MEDIUM confidence — `try/catch` fallback chain is mandatory, not optional.

### Phase C: Character Sheet Panel on Canvas (z=2)
**Rationale:** Largest content surface (6 tabs). REQ-SCHEMA-01..05 extensions (class, initiative, speed, feats[], biography) ship atomically with their renderers. Features and Bio tabs currently hardcoded stubs — unlock here.
**Delivers:** `CanvasCharacterSheetPanel`; `paint*Tab(ctx, bounds)` variants for all 6 tabs (additive); REQ-SCHEMA-01..05 + foundry-module readers; REQ-MAIN-01..13 + REQ-SKILL-01..06 + REQ-INV-01..06 + REQ-SPELL-01..07 + REQ-FEAT-01..06 + REQ-BIO-01..06; portrait inset (REQ-MAIN-14, P2).
**Avoids:** Pitfall R-11 (glyph-fallback text renderers kept intact, not deleted).
**Research flag:** Standard patterns — dual-output renderer pattern established in codebase.

### Phase D: Combat Tracker on Canvas (z=2)
**Rationale:** Separate panel from character sheet. REQ-SCHEMA-06 (`combatant.ac`) closes the `acValue = ' --'` placeholder. Pattern identical to Phase C.
**Delivers:** `CanvasCombatTrackerPanel`; `paintCombatTracker(ctx, snapshot)`; `CombatantSchema` extension with `ac` + foundry-module reader; REQ-COMB-01..13.
**Research flag:** Standard patterns.

### Phase E: INV-1 Raster Contract Formalization + ASCII Fixture Annotation
**Rationale:** Raster output must be stable before the contract is formalized. Phases B–D deliver stable output; this phase locks it and makes `inv:all` meaningful for the raster path.
**Delivers:** `matchRasterFixture` snapshot matcher in `packages/shared-render/`; `raster-fixtures/` directory; `inv:all` updated to run `glyph suite` + `raster suite`; ASCII fixtures annotated as "glyph-fallback path — BLE-degraded mode".
**Avoids:** Pitfall R-4 (false safety net eliminated).
**Research flag:** Standard patterns — modeled on existing `hud-raster-frame.test.ts`.

### Phase F: INV-3 Doc Coherence
**Rationale:** INV-3 mandates Specs.md + README + showcase update in the same atomic commit for any cross-cutting change. Comes last because docs must describe stable, finalized behavior.
**Delivers:** Specs.md §7.2 raster substrate section; §7.4 ASCII mockups migrated to "Glyph Fallback Mode" subsection; README "Rendering" section updated; `docs/showcase/index.html` stats updated.
**Avoids:** Pitfall R-6 (INV-3 doc drift; "10 rows × 50 chars" README stat corrected).
**Research flag:** Standard patterns — INV-3 atomic commit established in v0.9.11–v0.9.13.

---

### Phase Ordering Rationale

- ADR-0013 Amendment 1 before Phase A: the amendment is the design contract that makes Phase A's LayerManager changes reviewable.
- Phase A before everything: `CanvasCompositor` and `CanvasLayer` are the substrate; nothing else can be wired without them.
- Phase B before C and D: establishes font loading, chrome pre-bake, and the INV-1 raster baseline pattern that C and D repeat.
- Phase C before D: no hard technical dependency, but convention consistency maintained.
- Phases B–D before E: INV-1 contract must snapshot stable output.
- Phase E before F: docs must describe the finalized quality contract.

---

### HARD Ordering Constraint: Delta Loop Before Promotion

TODO-hud-raster #2 (xxhash sub-tile delta) **must precede** TODO-hud-raster #4 (promote off `?hud=raster` flag). This constraint is external to Phases A–F. The roadmap must include an explicit promotion gate:

> **Promotion Gate (TODO-hud-raster #4 prerequisites):** delta loop (#2) landed AND INV-2 re-verify of 288×144 hardware tile size green AND capture-container simulator test green AND INV-3 §7 doc update committed.

**Open question for requirements (resolve before planning):** Does v0.10.0 include TODO-hud-raster #2 (delta loop), or does it deliver Phases A–F behind the `?hud=raster` flag with a hard "promote blocked" exit criterion? Recommendation: include #2 in v0.10.0 scope — a compositor without delta is not production-safe on real hardware — but flag it as the highest-complexity item.

---

### Research Flags

**Needs INV-2 re-verify EARLY (before or during Phase A):**
- 288×144 tile size vs documented 200×100 cap — re-fetch `hub.evenrealities.com/docs/guides/device-apis` and log result. If 200×100 confirmed, `HUD_TILE_GEOMETRY` must be parameterized before Phase A lands. Carry `human_needed` SC from ADR-0005 §OQ-INV2-1.b forward.
- 5th zero-size `isEventCapture:1` text container in a 4-image-tile page — verify pattern in EvenHub simulator before Phase A's `buildHudRasterPageSchema()` merges.

**Needs empirical testing (Phase B):**
- `WorkerGlobalScope.fonts` + `FontFace` on iOS 16 WKWebView — `try/catch` fallback to `'16px monospace'` is mandatory from day one.
- `createImageBitmap(canvas)` in Worker on iOS 16 — treat as optional optimization; `ctx.drawImage(OffscreenCanvas)` is the safe fallback.

**Standard patterns (skip additional research):**
- Phase A `CanvasCompositor` — modeled on `MapBaseLayer` + `RasterController` pattern.
- Phase C dual-output renderer — modeled on Phase 16/17 atomic-commit approach.
- Phase E synthetic-RGBA tile hash test — modeled on `hud-raster-frame.test.ts`.
- Phase F INV-3 atomic commit — modeled on v0.9.11–v0.9.13 milestone-close commits.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack additions | HIGH | Platform APIs verified vs MDN Baseline + WebKit bug tracker. `@fontsource/vt323` verified on npm 2026-06-05. WKWebView iOS 16 empirical status MEDIUM — fallback chain is the correctness guarantee. |
| Features | HIGH | Sourced from verified codebase: `CharacterSnapshotSchema`, all 6 tab renderers, `combat-tracker-panel.ts`. Schema gaps confirmed from source code. |
| Architecture | HIGH | Sourced entirely from codebase: `layer-manager.ts`, `layer-types.ts`, `hud-canvas-renderer.ts`, `hud-raster-frame.ts`, `hud-poc-page.ts`, `map-base-layer.ts`, ADR-0001, ADR-0013. No web research needed. |
| Pitfalls | HIGH (software) / MEDIUM (hardware) | R-1 through R-8 from codebase + ADR analysis. Hardware tile size (R-2) MEDIUM — simulator-only confirmed. |

**Overall confidence:** HIGH for software architecture and feature scope. MEDIUM for hardware-dependent assumptions (tile geometry, capture-container on real G2).

### Gaps to Address

- **288×144 tile size hardware confirmation** — highest-risk unresolved assumption. Parameterize `HUD_TILE_GEOMETRY` immediately; carry `human_needed` SC to hardware UAT; INV-2 re-fetch as early planning task.
- **Delta loop scope decision** — requirements must explicitly decide whether TODO-hud-raster #2 is in v0.10.0 scope. Affects milestone exit criterion and phase count.
- **WKWebView iOS 16 font loading** — implement `try/catch` + `'16px monospace'` fallback from day one. No special workaround needed; uncertainty is only about which code path executes.
- **Palette calibration** — linearize-before-dither and CIE L* palette should be addressed in Phase B before INV-1 raster fixtures are frozen, so fixtures capture correct palette behavior.

---

## Sources

### Primary (HIGH confidence — codebase + verified npm)

- `docs/architecture/0013-hud-raster-rendering.md` — ADR-0013: raster HUD decision, scope, consequences, PoC status
- `docs/architecture/0005-phase0-go-no-go.md` — ADR-0005 §OQ-INV2-1.b PROVISIONAL hardware tile size carry
- `packages/g2-app/src/engine/layer-manager.ts`, `layer-types.ts` — LayerManager, Layer interface, capture invariant
- `packages/g2-app/src/hud/hud-canvas-renderer.ts`, `hud-raster-frame.ts`, `hud-poc-page.ts`, `hud-live-render.ts` — raster pipeline implementation
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts`, `combat-tracker-panel.ts`, `inventory-panel.ts`, `spellbook-panel.ts` — content logic + confirmed schema gaps
- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema` confirmed field inventory
- `.planning/PROJECT.md` — v0.10.0 milestone scope, carry items, locked decisions
- `.planning/TODO-hud-raster.md` — 7 next-step items, delta loop scoping, INV-1/INV-3 items
- `@fontsource/vt323` v5.2.7 — `npm view @fontsource/vt323 version` verified 2026-06-05, OFL-1.1

### Secondary (MEDIUM confidence — platform API docs + WebKit tracker)

- MDN `WorkerGlobalScope.fonts` — Baseline Widely available since September 2022
- MDN `FontFace` — Baseline Widely available since January 2020
- MDN `OffscreenCanvas.transferToImageBitmap()` — Baseline Widely available since March 2023; blanks source canvas on call
- WebKit bug 202793 (text rendering on OffscreenCanvas in Worker) — FIXED 2021-04-02
- WebKit bug 224178 (FontFace in Workers for OffscreenCanvas) — FIXED 2021-04-22
- WHATWG HTML issue #7847 — relative CSS units undefined in Worker; absolute `px` required
- Can I Use — OffscreenCanvas: Safari 16.2 partial, Safari 17.0 full
- Even Realities App Store — iOS 16.0+ minimum requirement
- VT323 project — https://github.com/phoikoi/VT323 — DEC VT320 glyph origin, OFL-1.1

---

*Research completed: 2026-06-05*
*Ready for requirements + roadmap: yes — pending explicit scope decision on delta loop (TODO-hud-raster #2) and ADR-0013 Amendment 1 authoring*
