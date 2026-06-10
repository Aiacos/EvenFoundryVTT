---
phase: quick-260610-d42
verified: 2026-06-10T10:15:00Z
status: passed
score: 7/7 must-haves verified (2 gaps closed in gap-fix pass, commit a705477)
overrides_applied: 0
gaps:
  - truth: "Status info renders in a native G2 text container (hud-status push live in production)"
    status: failed
    reason: >
      CanvasStatusHudLayer is constructed in boot-engine-core.ts (line 823) without the
      optional `bridge` parameter: `new CanvasStatusHudLayer({ wsEvents: wsEventBus })`.
      The bridge push code exists in _onDelta and is guarded by `if (this._bridge !== undefined)`.
      Without bridge injection, textContainerUpgrade is never called at runtime. Tests pass because
      they inject bridge explicitly. The plan Action for Task 3 explicitly states:
      "Pass `bridge` from boot-engine-core into the CanvasStatusHudLayer construction (~line 822)".
    artifacts:
      - path: "packages/g2-app/src/internal/boot-engine-core.ts"
        issue: "Line 823: new CanvasStatusHudLayer({ wsEvents: wsEventBus }) — bridge param missing"
    missing:
      - "Pass bridge to CanvasStatusHudLayer constructor: new CanvasStatusHudLayer({ wsEvents: wsEventBus, bridge })"
  - truth: "Changeset declared for this task (patch @evf/g2-app + @evf/foundry-module)"
    status: failed
    reason: >
      No d42-specific changeset file exists in .changeset/. The plan success criteria
      explicitly require: "corepack pnpm changeset — add a changeset (patch @evf/g2-app +
      @evf/foundry-module)". Existing changesets cover these packages from prior tasks but
      not from the d42 changes (continuous interval capture, MapCanvasLayer, hud-status,
      root-exit fix).
    artifacts:
      - path: ".changeset/"
        issue: "No changeset file describing d42 changes (MapCanvasLayer, hud-status, continuous capture, root-exit fix)"
    missing:
      - "Run: corepack pnpm changeset — add patch bump for @evf/g2-app + @evf/foundry-module describing d42 changes"
---

# Quick Task 260610-d42: Full-Screen Streamed Map + Text-Container HUD — Verification Report

**Task Goal:** Full-screen streamed map + text-container HUD — Foundry pre-rendered viewport screenshots stream constantly (~1Hz + canvasPan hook) to the glasses as a full-screen map at compositor z=0 (MapCanvasLayer), with status info relocated into a native G2 text container (hud-status), and canvas-mode root double-tap exit fixed.

**Verified:** 2026-06-10T10:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Foundry viewport screenshots stream continuously to the glasses (~1s cadence) even when no hook fires | VERIFIED | `canvas-extractor.ts` lines 81,281,344: `DEFAULT_INTERVAL_MS = 1000`, `intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS`, `setInterval(performExtract, intervalMs)`. Tests CE-INT-1..4 green. |
| 2 | In canvas mode, incoming frame_pixels paint a full-screen map at z=0 in the compositor (NOT via the legacy RasterController map-tile path) | VERIFIED | `scene-input.ts` lines 221-225: `isMapFrameSink` discriminator routes to `sink.setFrame(framed, CANONICAL_W, CANONICAL_H)` in canvas mode. `boot-engine-core.ts` line 849: `getRenderMode() === 'canvas' ? mapCanvas : rasterController`. `map-canvas-layer.ts` line 74: `id = 'map-canvas'`, mounted at `ZIndex.Z0_MAP` (line 1505). |
| 3 | The full-screen opaque chrome no longer hides the z=0 map; status info renders in a native G2 text container instead of over the raster | FAILED | Opaque fill REMOVAL is verified: `canvas-status-hud-layer.ts` line 479 shows only `fillRect(0, 0, COMPOSITOR_W, 27)` (27px strip, not full frame). BUT the native hud-status push is NOT wired in production: `boot-engine-core.ts` line 823 constructs `CanvasStatusHudLayer({ wsEvents: wsEventBus })` — no `bridge` param. The `_onDelta` bridge push is guarded by `if (this._bridge !== undefined)` so it never fires at runtime. |
| 4 | A new frame triggers hudDeltaDriver.requestCycle() so the debounced delta loop pushes only changed sub-tiles | VERIFIED | `boot-engine-core.ts` line 835-838: `new MapCanvasLayer({ onFrame: () => { hudDeltaDriver.requestCycle(); } })`. `map-canvas-layer.ts` line 160: `this._opts.onFrame()` called in `setFrame`. Tests MCL-2 verify this. |
| 5 | Canvas-mode root double-tap exit fires again (getTopLayer no longer null at root) | VERIFIED | `root-exit-dispatcher.ts` line 80: `if (top !== null) { return; }` — fires exit when `top === null` (no overlay). Tests ROOT-1a/1b confirm null-top triggers `shutDownPageContainer(1)`. ROOT-2 confirms overlay-open suppression still works. |
| 6 | Exactly ONE isEventCapture:1 container remains per page (hud-capture, id 4) | VERIFIED | `container-registry.ts` line 218-226: `hud-capture` is the sole `isEventCapture:1` in `buildHudRasterPageSchema()`. Test REG-CAPTURE-INV (line 243) asserts exactly one across both text containers including hud-status. |
| 7 | Changeset declared for d42 changes (patch @evf/g2-app + @evf/foundry-module) | FAILED | No d42-specific changeset file found in `.changeset/`. Existing changesets cover these packages from prior unrelated tasks. Plan success criteria require a new changeset for this task's changes. |

**Score:** 5/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/g2-app/src/hud/map-canvas-layer.ts` | z=0 CanvasLayer, putImageData, requestCycle trigger, min 60 lines | VERIFIED | 242 lines; `id='map-canvas'`; `setFrame` stores RGBA + calls `onFrame()`; `paint()` constructs `ImageData` lazily + `putImageData`; `isDirty()` gate; `getContainerCount()` returns `{image:0, text:0}` |
| `packages/foundry-module/src/canvas-extractor.ts` | Continuous periodic capture (intervalMs) + canvasPan hook + interval cleared by unregister | VERIFIED | `intervalMs` field in `CanvasExtractorOpts` (line 123); `setInterval(performExtract, intervalMs)` (line 344); `clearInterval(intervalHandle)` in unregister (line 353); `canvasPan` registered as 5th hook (line 331) |
| `packages/g2-app/src/engine/container-registry.ts` | hud-status non-capture text container in HUD raster page schema | VERIFIED | `hud-status` at id=5, `isEventCapture:0`, 576×27 (lines 234-242); `HUD_RASTER_CONTAINER_TOTAL = 6` (line 392); `buildHudRasterPageSchema()` includes `hud-status` `TextContainerProperty` in `textObject` (lines 479-490) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/g2-app/src/scene-input.ts` | `MapCanvasLayer.setFrame` | canvas-mode frame_pixels routing | VERIFIED | `isMapFrameSink` type guard at line 141; `sink.setFrame(framed, CANONICAL_W, CANONICAL_H)` at line 225; wired in `boot-engine-core.ts` line 849 |
| `packages/g2-app/src/hud/map-canvas-layer.ts` | `hudDeltaDriver.requestCycle` | onFrame callback injected at construction | VERIFIED | `this._opts.onFrame()` at line 160 in `setFrame`; injected via `boot-engine-core.ts` lines 836-837 |
| `packages/foundry-module/src/canvas-extractor.ts` | `setInterval/clearInterval` | periodic capture lifecycle | VERIFIED | `setInterval(performExtract, intervalMs)` at line 344; `clearInterval(intervalHandle)` at line 353 in unregister fn |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MapCanvasLayer` | `_frame` (rgba bytes) | `scene-input.ts` → `setFrame` ← bridge WS `frame_pixels` envelope ← `canvas-extractor.ts` | Yes — PIXI `renderer.extract.pixels` + fit-downscale | FLOWING |
| `CanvasStatusHudLayer` | `_snapshot` (CharacterSnapshot) | `character.delta` WS event | Yes — wired to wsEventBus | FLOWING |
| `CanvasStatusHudLayer` → hud-status container | `statusLine` text | `_onDelta` → `bridge.textContainerUpgrade` | **NO** — `this._bridge` is `undefined` in production (`boot-engine-core.ts` line 823 omits bridge) | HOLLOW_PROP |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points testable without running Foundry + bridge. Tests cover behavior end-to-end.

### Probe Execution

Step 7c: No probe scripts declared or found for this quick task.

### Requirements Coverage

No formal REQUIREMENTS.md entries declared in the PLAN frontmatter (`requirements: []`). The task is a quick task (not a phase) with goal-defined acceptance criteria.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/g2-app/src/engine/container-registry.ts` | 287, 299 | `TODO(HUD-27PX):` | INFO | Both reference `(#issue)` placeholder — does not reference a concrete issue number. These are pre-existing TODOs from a prior task (quick-260605-j0t), not introduced by d42. |
| `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` | 491 | `TODO(ADR-0013):` | INFO | References formal ADR — compliant with INV-4. |
| `packages/g2-app/src/internal/boot-engine-core.ts` | various | `TODO(ADR-*)`, `TODO(SC-*)` | INFO | All reference formal ADR or SC numbers — compliant with INV-4. |

Note: `TODO(HUD-27PX): ... (#issue)` uses `(#issue)` as a literal placeholder rather than a real GitHub issue number. These are pre-existing, not introduced by d42. Per the debt-marker gate they reference a follow-up token — borderline, but not introduced by this task so not a d42 BLOCKER.

### Human Verification Required

None identified — all behaviors are mechanically verifiable via code inspection and tests.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 (BLOCKER) — bridge not injected into CanvasStatusHudLayer:**
The plan explicitly required passing `bridge` to `CanvasStatusHudLayer` at construction (`boot-engine-core.ts` ~line 822). The code structure and tests support it — `CanvasStatusHudLayerOpts.bridge` is declared as optional, `_onDelta` has the push code, tests CSHUD-2 verify it works when bridge is passed. But the production construction site omits it. At runtime, `this._bridge === undefined`, the `if (this._bridge !== undefined)` guard in `_onDelta` short-circuits, and the `hud-status` native text container never receives any text. The "status info renders in a native G2 text container" truth is therefore not met in production.

Fix: Change line 823 from `new CanvasStatusHudLayer({ wsEvents: wsEventBus })` to `new CanvasStatusHudLayer({ wsEvents: wsEventBus, bridge })`.

**Gap 2 (BLOCKER) — changeset missing:**
The plan success criteria and verification block both require `corepack pnpm changeset` to add a patch changeset for `@evf/g2-app` and `@evf/foundry-module`. No d42-specific changeset exists. Existing changesets in `.changeset/` cover these packages from prior unrelated tasks, but do not describe the d42 changes (continuous interval capture in canvas-extractor, MapCanvasLayer, hud-status container, root-exit fix).

Fix: Run `corepack pnpm changeset` and describe the d42 changes.

---

_Verified: 2026-06-10T10:15:00Z_
_Verifier: Claude (gsd-verifier)_


---

## Gap-closure addendum (orchestrator, 2026-06-10)

Both blocking gaps were closed by a gap-fix executor pass (commit `a705477`):

1. **Bridge injection** — `boot-engine-core.ts:823` now constructs `new CanvasStatusHudLayer({ wsEvents: wsEventBus, bridge })`; regression test CR-01d (boot-engine-glyph-fallback-mount.test.ts) boots canvas mode, fires `character.delta`, asserts `bridge.textContainerUpgrade` is called. 1656 g2-app tests pass.
2. **Changeset** — `.changeset/feat-fullscreen-streamed-map-hud-status.md` added (patch `@evf/g2-app` + `@evf/foundry-module`).

**Live-sim verification (fresh simulator PID, vite :5173, bridge :8911):**
- Real Foundry v14 frame (3440×1440 RGBA dump) pushed through the PRODUCTION extractor (`_scene_e2e.ts`) → `POST /internal/delta` 200 → map renders FULL-SCREEN across the whole 400×200 raster region with no HUD chrome over it (`/tmp/evf-shots/80-d42-map-fullscreen.png`).
- Native text row `PF 41/63 CA 18 LV 10` rendered by the `hud-status` container (id=5) above the map — production push path confirmed end-to-end.
- Overlay cycle: swipe-up opens `[ AZIONE RAPIDA ]` over the map (`81-d42-menu-over-map.png`); double-tap closes it; map + status row restored pixel-identical (`82-d42-map-restored.png`).
