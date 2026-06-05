---
phase: 19-adr-0013-amendment-1-canvas-compositor-core
plan: "01"
subsystem: architecture
tags: [adr, raster, canvas-compositor, geometry, inv-2]
dependency_graph:
  requires: []
  provides: [RAST-05, ADR-0013-Amendment-1]
  affects: [19-03-PLAN, 19-04-PLAN]
tech_stack:
  added: []
  patterns: [adr-amendment-format]
key_files:
  created: []
  modified:
    - docs/architecture/0013-hud-raster-rendering.md
decisions:
  - "Ratified 5 locked architectural decisions for Canvas Compositor Core as ADR-0013 Amendment 1 (ACCEPTED)"
  - "Geometry corrected to 200×100 tiles / 400×200 region per INV-2 verified 2026-06-05 against hub.evenrealities.com/docs/guides/display"
  - "Compositor Option B: per-layer OffscreenCanvas composited via drawImage in z-order on master 400×200 canvas"
  - "hud-capture = full-screen text container (576×288) with isEventCapture:1 behind image tiles"
  - "Canvas mode: fixed 5-container budget + serialized updateImageRawData push"
  - "renderMode 'canvas'|'glyph' on LayerManager; _flushPage() selects schema; glyph path byte-identical"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-05"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 19 Plan 01: ADR-0013 Amendment 1 — Canvas compositor substrate Summary

**One-liner:** ADR-0013 Amendment 1 ratified — geometry corrected to 200×100/400×200 (INV-2), 5-container fixed schema, Option B compositor, serialized push, renderMode selector.

## What Was Built

ADR-0013 Amendment 1 was written and committed to `docs/architecture/0013-hud-raster-rendering.md`. The amendment appends an `## Amendments` section with a `### Amendment 1 — Canvas compositor substrate (2026-06-05, Specs v0.10.0)` subsection following the ADR-0001 Amendment format exactly.

The amendment documents 5 locked architectural decisions:

1. **Compositor Option B** — per-layer `OffscreenCanvas`, composited via `drawImage` in ascending z-order on a master 400×200 canvas. `CanvasCompositor` owns the master; `LayerManager` stays orchestrator-only.
2. **Geometry corrected (INV-2 2026-06-05)** — tile size 200×100 (not 288×144), raster region 400×200 (not 576×288). On-screen placement of the 400×200 region in 576×288 is parameterized (Phase 20). Explicit rejection of 288×144 as simulator-only.
3. **Capture-container re-mapping** — 5th container `hud-capture` is a full-screen text container (576×288) with `isEventCapture:1`, behind image tiles in declaration order. NOT zero-size.
4. **Fixed-budget canvas mode + serialized push** — 5-container schema fixed at page creation; `CanvasLayer.getContainerCount()={image:0,text:0}`; `updateImageRawData` pushes serialized (no `Promise.all`); schema reuse via `updateImageRawData` (no `rebuildPageContainer` for redraws).
5. **`renderMode` + `_flushPage()` selector** — `LayerManager.renderMode: 'canvas'|'glyph'`; glyph path byte-identical to today; `_flushPage()` selects `buildHudRasterPageSchema()` (canvas, 5 containers) or `buildStatusViewTextContainers()` (glyph, 3 containers).

The amendment includes:
- Consistency check vs original Decision (✓ lines + ⚠ geometry and capture-container corrections)
- INV-2 status block citing `hub.evenrealities.com/docs/guides/display`, 2026-06-05 verification date
- Hardware SC block: `human_needed` under ADR-0005 Branch A for real-G2 validation

No Specs.md / README / showcase changes (Phase 19 is infrastructure-only; INV-3 doc coherence is Phase 26 gate).

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | ADR-0013 Amendment 1 — Canvas compositor substrate | `bd0ca16` |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. This plan modifies a documentation file only; no runtime surface introduced.

## Self-Check: PASSED

- `grep -c "### Amendment 1" docs/architecture/0013-hud-raster-rendering.md` → 1 ✓
- `grep -q "hub.evenrealities.com/docs/guides/display"` → found ✓
- `grep -q "400×200"` → found ✓
- `grep -q "ADR-0005 Branch A"` → found ✓
- Commit `bd0ca16` exists ✓
- No Specs.md / README / showcase diff in commit ✓
