---
phase: quick-260610-lx5
plan: 01
subsystem: foundry-module/canvas-extractor
tags: [raster, canvas, pixi, render-to-texture, map-frame-pipeline]
dependency_graph:
  requires: []
  provides: [render-to-texture-viewport-capture]
  affects: [canvas-extractor, raster-pipeline, map-frame]
tech_stack:
  added: []
  patterns: [PIXI.RenderTexture, renderer.render+extract.pixels, finally-destroy-gpu]
key_files:
  created: []
  modified:
    - packages/foundry-module/src/canvas-extractor.ts
    - packages/foundry-module/src/canvas-extractor.test.ts
    - .changeset/lx5-render-to-texture-viewport-capture.md
decisions:
  - "RT primary path uses PIXI.RenderTexture + renderer.render(stage, {renderTexture, clear:true}) + extract.pixels(rt) — deterministic regardless of canvas idle state"
  - "acquireSourceBytes() helper function extracted to avoid TypeScript definite-assignment issues in the nested try/finally pattern"
  - "renderer.render?.() (optional chain) used instead of renderer.render!() (non-null assertion) per Biome noNonNullAssertion rule"
  - "No-arg fallback preserved unchanged for test fixtures (makeCanvasMock has no render fn, no globalThis.PIXI)"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-10"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260610-lx5: Render-to-Texture Viewport Capture Summary

**One-liner:** Render-to-texture primary capture path eliminates idle all-zero map frames by rendering canvas.stage into a fresh PIXI.RenderTexture before extraction instead of reading the idle main framebuffer.

## What Was Built

### Task 1 — RT primary capture path in canvas-extractor.ts (commit 9eaed5a)

Rewrote `extractCurrentFrame`'s source-byte acquisition block to:

1. **acquireSourceBytes() helper** — extracted the primary/fallback split into a standalone function to satisfy TypeScript's definite-assignment analysis across the nested try/finally pattern.

2. **RT primary path** — when `globalThis.PIXI.RenderTexture`, `renderer.render`, and `canvas.stage` are all present:
   - `RT.create({ width: vw, height: vh })` creates a viewport-sized texture (dimensions from `renderer.screen?.width/height` falling back to `renderer.width/height`)
   - `renderer.render?.(canvas.stage, { renderTexture: rt, clear: true })` renders the stage (with pan/zoom + fog-of-war) into the texture
   - `renderer.extract.pixels(rt)` extracts RGBA bytes from the texture
   - `rt.destroy(true)` runs in a `finally` block — on every capture including throws (T-lx5-01 GPU leak prevention)

3. **No-arg fallback** — preserved unchanged for test fixtures and exotic hosts where `PIXI.RenderTexture` is unavailable.

4. **CanvasLike interface extended** — added `screen?: { width, height }`, `render?()`, and updated `stage` JSDoc to reflect it IS now read by the RT path.

5. **Module JSDoc updated** — describes RT capture rationale, references quick-task 260610-lx5, and the live evidence (maxG=0 idle frames 2026-06-10).

All existing guards (byte-length check, k-inference, warn-and-skip, normalize algorithm) remain intact on both paths.

### Task 2 — CE-VP-4..7 tests + changeset (commit f86a48f)

Added four new tests to the CE-VP describe block:

- **CE-VP-4** — RT path: asserts `renderer.render` called with stage and `{renderTexture: rt, clear: true}`; `extract.pixels(rt)` called with rt (not no-arg); `rt.destroy(true)` called.
- **CE-VP-5** — Destroy-on-throw: `extract.pixels` throws → null returned, `console.warn` called, `rt.destroy(true)` still invoked (finally block).
- **CE-VP-6** — Fallback: without `globalThis.PIXI` → `extract.pixels` called with zero arguments.
- **CE-VP-7** — Screen dims: with `renderer.screen = {width: 576, height: 288}` → `RT.create` called with screen dims, not renderer.width/height.

Also:
- Updated `afterEach` to `delete (globalThis as { PIXI?: unknown }).PIXI` — prevents RT stub pollution in CE-NORM/CE-INT suites.
- Updated file-top JSDoc index to list CE-VP-4..7 with quick-task reference.
- Created `.changeset/lx5-render-to-texture-viewport-capture.md` (patch for `@evf/foundry-module`).

## Verification Results

| Check | Result |
|-------|--------|
| `corepack pnpm --filter @evf/foundry-module exec tsc --noEmit` | PASS |
| `corepack pnpm --filter @evf/foundry-module test` | 578/578 PASS (4 new: CE-VP-4..7) |
| `corepack pnpm typecheck` (workspace) | PASS |
| `corepack pnpm changeset:status` | @evf/foundry-module patch declared |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Code Quality] Extracted acquireSourceBytes() helper**
- **Found during:** Task 1
- **Issue:** The nested `try { try { srcBytes = ...; } finally { rt.destroy() } } catch { return null }` pattern required TypeScript to see `srcBytes` as definitely assigned, but the assignment was inside a nested try block — TypeScript strict mode flagged this.
- **Fix:** Extracted the primary/fallback split into a standalone `acquireSourceBytes()` helper that returns `AcquiredBytes | null`, making the definite-assignment proof trivial.
- **Files modified:** `packages/foundry-module/src/canvas-extractor.ts`

**2. [Rule 1 - Bug] Fixed renderer.render!() → renderer.render?.() (Biome lint)**
- **Found during:** Task 1 commit (pre-commit hook)
- **Issue:** `renderer.render!` (non-null assertion) triggered Biome's `noNonNullAssertion` rule. The `useRTPath` guard already checks `typeof renderer.render === 'function'`, so optional chain `?.()` is both type-safe and lint-clean.
- **Fix:** Changed to `renderer.render?.()` in `acquireSourceBytes()`.
- **Files modified:** `packages/foundry-module/src/canvas-extractor.ts` (committed in Task 2)

## Known Stubs

None — the RT path is fully wired; the no-arg fallback is intentionally retained as a documented fallback for test fixtures.

## Self-Check

- [x] `packages/foundry-module/src/canvas-extractor.ts` exists and contains `RenderTexture`
- [x] `packages/foundry-module/src/canvas-extractor.test.ts` exists and contains `CE-VP-4`, `CE-VP-5`, `CE-VP-6`, `CE-VP-7`
- [x] `.changeset/lx5-render-to-texture-viewport-capture.md` exists and contains `@evf/foundry-module`
- [x] Commit `9eaed5a` exists (Task 1)
- [x] Commit `f86a48f` exists (Task 2)

## Self-Check: PASSED
