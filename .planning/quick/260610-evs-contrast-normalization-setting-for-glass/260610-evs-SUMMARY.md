---
phase: quick-260610-evs
plan: 01
subsystem: foundry-module/canvas-extractor
tags: [raster, contrast, normalization, g2-display, settings]
dependency_graph:
  requires: [canvas-extractor levels-stretch algorithm]
  provides: [normalize:'off'|'auto' option on extractCurrentFrame, getNormalize per-capture hook, mapContrastNormalize client setting]
  affects: [packages/foundry-module/src/canvas-extractor.ts, packages/foundry-module/src/settings.ts, packages/foundry-module/src/module.ts]
tech_stack:
  added: []
  patterns: [Rec.709 luma histogram + percentile levels-stretch, per-capture hook evaluation, Foundry client scope setting]
key_files:
  created: [.changeset/map-contrast-normalize.md]
  modified:
    - packages/foundry-module/src/canvas-extractor.ts
    - packages/foundry-module/src/canvas-extractor.test.ts
    - packages/foundry-module/src/settings.ts
    - packages/foundry-module/src/module.ts
    - packages/foundry-module/lang/en.json
    - packages/foundry-module/lang/it.json
decisions:
  - "Normalization applied pre-padding so letterbox bands (zero-filled) never enter the histogram — ensures bands stay pure black after stretch"
  - "Skip stretch when p98-p2 >= 220 (already wide) or < 8 (degenerate/near-flat) — avoids clipping bright frames or amplifying noise"
  - "getNormalize evaluated per capture (not per registration) — live toggle without re-registering the extractor"
  - "Safe fallback returns 'auto' (default-on) if settings read throws — matches default:true setting behavior"
  - "Biome required single-line ternary for the getNormalize return statement — auto-fixed during lint gate"
metrics:
  duration: "~15 min"
  completed: "2026-06-10"
  tasks_completed: 2
  files_changed: 7
---

# Quick Task 260610-evs: Contrast Normalization Setting for Glasses — Summary

**One-liner:** Rec.709 luma levels-stretch (p2/p98 percentile histogram) on dark dungeon frames before 4-bit dither, gated behind a live-toggle client Foundry setting.

## What Was Built

Task 1 (TDD — RED `aa356b2` + GREEN `f95c32c`): Pure `normalize:'off'|'auto'` option added to `extractCurrentFrame`. When `'auto'`, builds a 256-bin Rec.709 luma histogram over the CONTENT region (outWidth × outHeight at padX/padY), computes p2 and p98 percentile luma, and linearly maps `[p2, p98] → [0, 255]` applied uniformly to all three channels when range ∈ [8, 219]. Frames with range ≥ 220 (already wide) or < 8 (degenerate/near-flat) pass through unchanged. Normalization is applied before the alpha/letterbox fill so padding bands stay pure black. `getNormalize?: () => 'off'|'auto'` hook added to `CanvasExtractorOpts`; `performExtract` evaluates it on every capture.

Task 2 (`a5a7406`): `mapContrastNormalize` (scope:'client', config:true, Boolean, default:true) registered in `settings.ts`. EN/IT i18n strings added to both lang files. `module.ts` wires `getNormalize` reading the setting with an `'auto'` fallback. Changeset `map-contrast-normalize.md` declares `@evf/foundry-module` patch.

## TDD Gate Compliance

- RED commit: `aa356b2` — 5 failing tests CE-NORM-1..CE-NORM-5
- GREEN commit: `f95c32c` — all 5 tests pass, existing 566 tests preserved
- REFACTOR: not needed (algorithm already clean)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dark-scene test fixture producing median 0 after stretch**
- **Found during:** Task 1 GREEN phase
- **Issue:** CE-NORM-1 fixture had 80% of pixels exactly at p2 (darkVal=21), so after stretch those pixels mapped to 0, making medianAuto = 0 instead of lifted
- **Fix:** Changed to a 3-band fixture: 2% very-dark fringe (sets p2 below majority), 80% mid-dark content (the pixels we want lifted), 18% bright accents (drives p98). midVal pixels now map to a significantly higher output value after stretch
- **Files modified:** `packages/foundry-module/src/canvas-extractor.test.ts`
- **Commit:** `f95c32c`

**2. [Rule 1 - Bug] Fixed Biome format error in module.ts**
- **Found during:** Task 2 lint gate
- **Issue:** Multi-line ternary in `getNormalize` function failed Biome's format check (wanted single-line)
- **Fix:** Collapsed the `? 'auto' : 'off'` ternary onto the return statement line
- **Files modified:** `packages/foundry-module/src/module.ts`
- **Commit:** `a5a7406`

## Known Stubs

None. All settings wired to real behavior.

## Threat Flags

None. `mapContrastNormalize` is a client-scope display preference; it reads no auth-sensitive data, introduces no network surface, and affects only the luma mapping of frame pixels before dithering.

## Self-Check: PASSED

Files exist:
- packages/foundry-module/src/canvas-extractor.ts — FOUND
- packages/foundry-module/src/settings.ts — FOUND
- packages/foundry-module/lang/en.json — FOUND
- packages/foundry-module/lang/it.json — FOUND
- .changeset/map-contrast-normalize.md — FOUND

Commits exist:
- aa356b2 — test: RED phase CE-NORM-1..CE-NORM-5
- f95c32c — feat: GREEN phase normalize + getNormalize hook
- a5a7406 — feat: mapContrastNormalize setting + i18n + wiring
