---
phase: quick-260610-fw7
plan: "01"
subsystem: foundry-module
tags: [fix, canvas-extractor, viewport-capture, byte-length-guard, raster-pipeline]
dependency_graph:
  requires: []
  provides: [fw7-canvas-extractor-viewport-capture, fw7-byte-length-guard]
  affects: [foundry-module/canvas-extractor, foundry-module/raster-pipeline]
tech_stack:
  added: []
  patterns:
    - "Viewport framebuffer capture: renderer.extract.pixels() with no target (PIXI v7)"
    - "Byte-length sanity guard with integer-k resolution inference (fail-loud on garbage)"
key_files:
  created:
    - .changeset/fw7-canvas-extractor-viewport.md
  modified:
    - packages/foundry-module/src/canvas-extractor.ts
    - packages/foundry-module/src/canvas-extractor.test.ts
decisions:
  - "Phase 27 viewport decision: viewport capture (no target) instead of canvas.stage re-render"
  - "Non-integer buffer mismatch returns null + console.warn; never emits garbage to glasses"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-10"
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-260610-fw7 Plan 01: Fix canvas-extractor stage-vs-viewport Summary

**One-liner:** Switch canvas-extractor from `pixels(canvas.stage)` (whole-world re-render, wrong stride) to `pixels()` (viewport framebuffer capture, correct stride) — fixes horizontal-stripe frame corruption on live Forge; add fail-loud byte-length guard with integer-k resolution inference.

## What Was Built

### Task 1: Switch to viewport capture + byte-length sanity guard

Fixed the root cause of horizontal-stripe frame corruption observed on the Forge client (scene N6y1vDsWHaBYp5ms, 2026-06-10).

**Root cause:** `renderer.extract.pixels(canvas.stage)` in PIXI v7 re-renders the entire world stage into a temporary texture sized by the stage's LOCAL BOUNDS × resolution — this returns a buffer that may be 4000×3000 px or larger. The code then interpreted the returned buffer with `renderer.width × renderer.height` as the row stride → stride mismatch → horizontal stripes on the G2 glasses. Synthetic tests never caught this because the mock always returned a renderer-sized buffer.

**Fix applied:**
- Changed `renderer.extract.pixels(canvas.stage)` → `renderer.extract.pixels()` (no target). PIXI v7 with no target reads the existing main framebuffer at `renderer.screen × resolution`, which equals `renderer.width × renderer.height` exactly — correct stride, correct viewport content (zoom + fog applied), zero per-capture re-render cost.
- Added effective-dims byte-length sanity guard after the read:
  - If `srcBytes.length === srcWidth * srcHeight * 4`: use renderer dims as-is (normal viewport case).
  - If mismatch with clean integer k ≥ 2 (within 1e-6 float epsilon): reinterpret as `effWidth = srcWidth*k`, `effHeight = srcHeight*k` — handles high-DPR / resolution-multiplied renderers.
  - Any other mismatch: `console.warn` with both expected and actual byte lengths, return `null` (skip frame, never emit garbage).
- Replaced all `srcWidth`/`srcHeight` references in the box-average downscale loop (sy1 clamp, sx1 clamp, si stride) with `effWidth`/`effHeight` — no stale-dim bug path can survive.
- Updated `CanvasLike.stage` field with a comment explaining it is retained for test fixture structural compatibility but NOT read by the extractor (INV-4 compliance).
- Updated module-level JSDoc: documents viewport capture, the Phase 27 viewport decision, the row-stride fix, and T-fw7-01/T-fw7-02 mitigations.

### Task 2: Tests + changeset

Added three new regression tests:

- **CE-VP-1** — asserts `extract.pixels` mock was called with exactly zero arguments (the core regression guard: verifies `canvas.stage` is never passed again).
- **CE-VP-2** — k=2 inference path: renderer reports 400×200 but mock returns an 800×400 buffer with bright corner markers. Asserts frame is not null, dims are 400×200, and all four corners are brighter than the dark field — proving the inference reinterpreted the buffer correctly and the downscale loop used the effective dims.
- **CE-VP-3** — garbage-length buffer (expected×3, k=√3 non-integer): asserts `extractCurrentFrame` returns `null` and `console.warn` was called at least once with both the expected and actual byte lengths.

Extended `makeCanvasMock` with `bufferScale?: number` and `rawBuffer?: Uint8Array` options. All 574 existing tests (CE-1..CE-7, CE-INT-1..CE-INT-4, CE-NORM-1..CE-NORM-5) remain green.

Created `.changeset/fw7-canvas-extractor-viewport.md` — patch bump for `@evf/foundry-module`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | fb95f03 | fix(foundry-module): switch canvas-extractor to viewport capture, add byte-length guard |
| 2 | ff60e90 | test(foundry-module): add CE-VP viewport-capture regression tests + fw7 changeset |

## Verification Gates (All Passed)

- `corepack pnpm typecheck` — exits 0
- `corepack pnpm exec biome ci packages/foundry-module/src/canvas-extractor.ts` — exits 0
- `corepack pnpm exec biome ci packages/foundry-module/src/canvas-extractor.test.ts` — exits 0
- `corepack pnpm --filter @evf/foundry-module test` — 574 tests pass (0 failures)
- `grep -n 'extract\.pixels(' canvas-extractor.ts` — shows `renderer.extract.pixels()` with no argument
- `corepack pnpm changeset:status` — detects patch changeset for `@evf/foundry-module`

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. T-fw7-01 and T-fw7-02 mitigations applied as specified in the plan's threat model.

## Self-Check: PASSED

- `packages/foundry-module/src/canvas-extractor.ts` — FOUND, modified
- `packages/foundry-module/src/canvas-extractor.test.ts` — FOUND, modified
- `.changeset/fw7-canvas-extractor-viewport.md` — FOUND, created
- Commit fb95f03 — FOUND in git log
- Commit ff60e90 — FOUND in git log
