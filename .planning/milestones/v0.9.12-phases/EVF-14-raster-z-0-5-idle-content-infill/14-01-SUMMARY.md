---
phase: 14-raster-z-0-5-idle-content-infill
plan: 01
subsystem: testing
tags: [inv-1, fixture, ascii-grid, snapshot, vitest, layered-render, z=0.5]

# Dependency graph
requires:
  - phase: 04a-g2-engine-raster-status-hud
    provides: glyph-scene.raster-idle*.txt fixtures + matchAsciiFixture matcher
  - phase: 04b-amendment-1
    provides: idle-infill-layer.ts + LayerManager.bundle() differential demolish
provides:
  - State B INV-1 fixtures (raster-overlay-open.{it,en}.txt) — z=0+z=1+z=2 with z=0.5 demolished
  - State C glyph + z=0.5 INV-1 fixture (glyph-scene.glyph-idle-z05.it.txt) — 2-strip degradation locked
  - 7 cross-state column-equality tests (Z05-FX-01..03 + Z05-INV-01..04) — frame integrity contract
affects:
  - 14-02 (LMT-DD-07 race-coverage test) — already shipped, shares the state-machine contract
  - 14-03 (INV-3 atomic v0.9.11→v0.9.12 spec bump) — will reference the locked fixtures + tests
  - any future change to idle-infill-layer.ts, layer-manager.ts, raster-pipeline.ts — INV-1 will catch drift

# Tech tracking
tech-stack:
  added: []  # no new dependencies — Vitest 4, AsciiGrid, matchAsciiFixture pre-existing
  patterns:
    - "INV-1 cross-state column-equality assertion (FRAME_COLS × FRAME_ROWS double-loop)"
    - "Programmatic fixture construction via Node.js width-budget validator (avoids manual char-counting drift)"
    - "Codepoint-safe slice helper sliceCells(grid, row, col, len) — uses grid.cells not String.slice"

key-files:
  created:
    - packages/shared-render/src/fixtures/raster-overlay-open.it.txt
    - packages/shared-render/src/fixtures/raster-overlay-open.en.txt
    - packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt
    - packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts
  modified:
    - .planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md

key-decisions:
  - "Frame divider columns are effectively {0, 68, 95} not {0, 71, 95} as cited in the PLAN — discovered by inspection of the 5 frozen INV-1 fixtures (UI-SPEC §13 deliverable 1 freeze contract); tests use the real columns."
  - "Status HUD right column for cross-state byte-identical assertion = cols 69..95 (everything right of the central divider at col 68), not cols 71..95."
  - "State C (glyph + z=0.5) fixture uses the EN base for unmutated rows (right Status HUD column + raster grid) and only the z=0.5 strip rows + footer are IT-localized — coherent with the PLAN's 'Row 20 unchanged from glyph-scene.glyph-idle.txt' instruction."

patterns-established:
  - "Z05-FX-* + Z05-INV-* test naming convention for z=0.5 state machine snapshots and invariants"
  - "Programmatic fixture builder (Node script + assertWidth) — pattern reusable for any 96×24 fixture generation in subsequent plans"

requirements-completed: [INFILL-02, INFILL-05]

# Metrics
duration: ~20min
completed: 2026-05-17
---

# Phase 14 Plan 01: z=0.5 State Machine INV-1 Snapshot Fixtures Summary

**Locked the z=0.5 visual contract via 3 new 96×24 INV-1 fixtures (State B IT/EN + State C glyph-z=0.5) and 7 cross-state column-equality tests that bind frame integrity (cols 0/68/95, rows 0/2/21/23) across raster idle ↔ overlay-open ↔ glyph idle to a CI failure.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-17T15:55Z (approx)
- **Completed:** 2026-05-17T16:04Z
- **Tasks:** 3
- **Files created:** 4 (3 fixtures + 1 test file)
- **Files modified:** 1 (deferred-items.md)

## Accomplishments

- 3 new INV-1 fixtures shipped, each 96 cols × 24 rows with trailing newline, character-precision per UI-SPEC §8.2:
  - `raster-overlay-open.it.txt` — State B IT (z=2 SHEET·BIO panel at rows 18-20, Status HUD column preserved byte-identical from State A IT)
  - `raster-overlay-open.en.txt` — State B EN canonical
  - `glyph-scene.glyph-idle-z05.it.txt` — State C glyph + 2-strip z=0.5 (label + stats, no combat-log per UI-SPEC §6.3 locked degradation)
- 7 new tests in `z05-state-machine-fixtures.test.ts`:
  - Z05-FX-01..03 — round-trip each new fixture through `matchAsciiFixture`
  - Z05-INV-01 — frame chars at cols {0, 68, 95} × rows {0, 2, 21, 23} byte-identical across State A ↔ B ↔ C
  - Z05-INV-02 — right Status HUD (cols 69..95) byte-identical between State A EN ↔ State B EN for rows 3..20
  - Z05-INV-03 — frame columns identical across IT State A ↔ IT State B
  - Z05-INV-04 — State B row 18 carries z=2 panel header (`┌─[ SHEET ·`) AND preserves Status HUD content (`▶ Bless (7r)`)
- All 7 tests GREEN on first GREEN run; g2-app full test suite 1324/1324 passing (no regressions).
- Existing 5 frozen fixtures (`glyph-scene.raster-idle*.txt` + `glyph-scene.glyph-idle.txt`) NOT edited — UI-SPEC §13 deliverable 1 freeze contract preserved.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 3 new INV-1 fixtures (State B IT + EN, State C glyph + z=0.5)** — `65cc5f5` (test)
2. **Task 2: Z05 state machine INV-1 cross-state column equality tests** — `ec9b703` (test)
3. **Task 3: Document pre-existing workspace lint:ci failures (scope boundary)** — `fd35c99` (docs)

_Note: Plan 14-01 is test-only — no production code change._

## Files Created/Modified

- `packages/shared-render/src/fixtures/raster-overlay-open.it.txt` — State B IT-locale canonical (z=0+z=1+z=2, z=0.5 demolished); 96×24 char-precision
- `packages/shared-render/src/fixtures/raster-overlay-open.en.txt` — State B EN-locale variant; 96×24 char-precision
- `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` — State C glyph mode + z=0.5 (label + stats only); 96×24 char-precision
- `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` — 7 tests (Z05-FX-01..03 + Z05-INV-01..04) binding UI-SPEC §8.2 invariants
- `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/deferred-items.md` — appended Plan 14-01 entry documenting pre-existing workspace lint:ci failures (out of scope)

## Decisions Made

- **Effective frame columns are {0, 68, 95}, not {0, 71, 95}**: empirical inspection of the 5 frozen INV-1 fixtures showed the central divider `║` lives at col 68 in every load-bearing fixture. The PLAN's column citation drifted from reality; the frozen fixtures (UI-SPEC §13 deliverable 1) are authoritative. Tests use the real columns so they exercise the actual contract that a future code change would actually emit.
- **Right Status HUD byte-identical region = cols 69..95** (everything right of the central divider), not cols 71..95 as the PLAN textually claimed. The PLAN's intent — "Status HUD column preserved across A↔B" — is captured exactly by this slice.
- **State C base uses EN for unmutated rows**: the new file is named `.it.txt` because the z=0.5 strip footer is IT-localized, but the unchanged rows (raster grid, right Status HUD column) inherit the EN base per the PLAN's "row 20 unchanged from glyph-scene.glyph-idle.txt" instruction. This is a single-locale-pair fixture for State C — additional locales can be added by the planner if needed.
- **No production code touched**: `idle-infill-layer.ts`, `layer-manager.ts`, `status-hud-renderer.ts`, `raster-pipeline.ts` are untouched by Plan 14-01. The plan's scope is purely the snapshot contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Column citation drift in PLAN text (0/71/95 → effective 0/68/95)**
- **Found during:** Task 2 (writing the cross-state invariant tests)
- **Issue:** The PLAN `<interfaces>` block and `<behavior>` block both cite "Frame `║` columns: 0, 71, 95" and "right Status HUD column = cols 71..95". Direct inspection of the 5 frozen INV-1 fixtures (`glyph-scene.raster-idle*.txt`, `glyph-scene.glyph-idle.txt`) shows the central divider `║` is at col 68 (NOT 71), with right Status HUD content occupying cols 69..95.
- **Fix:** Built the 3 new fixtures with the central `║` at col 68 (matching the frozen baselines byte-for-byte for rows the plan said to copy "byte-identical"). Wrote the Z05-INV-* tests using the effective columns {0, 68, 95} and Status HUD slice cols 69..95. Documented the drift in the test file's file-header JSDoc and in this SUMMARY so future planners catch it.
- **Why Rule 1 (bug):** following the PLAN's literal column citation would have produced fixtures that DON'T match the frozen baselines (violating UI-SPEC §13 deliverable 1 freeze contract) AND would have produced tests asserting equality at columns that don't actually hold frame characters — silently passing because both grids would have spaces at those positions, defeating INV-1's drift-detection purpose.
- **Files modified:** all 3 new fixtures + the new test file
- **Verification:** all 7 Z05-* tests pass on first run; visual inspection of fixture rows 17-22 shows frame chars at the documented column positions.
- **Committed in:** `65cc5f5` (Task 1) and `ec9b703` (Task 2)

**2. [Rule 3 - Scope boundary] Workspace `pnpm lint:ci` fails on ~36 pre-existing files**
- **Found during:** Task 3 (CI quality gates)
- **Issue:** `pnpm lint:ci` exit 1 with 1 error + 255 warnings across `packages/{bridge,foundry-mcp,foundry-module,validation-harness,g2-app}`. All entries pre-date Plan 14-01 (commits `fbaac3c`, `0fa1364`, `2044df0`).
- **Fix:** Verified the plan's deliverables are individually lint-clean (`pnpm exec biome ci` on the new test file = OK; .txt fixtures are ignored by Biome by config). Appended a detailed entry to `deferred-items.md` documenting the pre-existing nature and suggesting the workspace-wide fix is folded into Plan 14-03 (INV-3 atomic commit). Per scope-boundary rule, pre-existing failures unrelated to the current task's changes are out of scope.
- **Files modified:** `deferred-items.md`
- **Verification:** Plan 14-01's task-local gates GREEN (typecheck, new-file lint, new-test suite 7/7, `it(` count = 7). g2-app full suite 1324/1324 passing.
- **Committed in:** `fd35c99` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 PLAN bug, 1 scope-boundary deferral)
**Impact on plan:** Both auto-fixes essential. Deviation 1 is mandatory for correctness (following the PLAN literally would have produced silently-broken tests). Deviation 2 is mandatory per scope-boundary rule. No scope creep — all deliverables shipped per PLAN frontmatter.

## Issues Encountered

- None during execution. The plan's authored mockup column positions (cols 4..63 panel header, col 71 Status HUD start) needed reconciliation against the frozen fixture byte-layout (cols 4..59 panel header in actual frame, col 68 central divider), which surfaced as Deviation 1 above. Resolved within Task 1 by building fixtures programmatically with a Node validator that asserted each row = exactly 96 cells before writing.

## Threat Flags

None — the plan's deliverables are test fixtures and a snapshot test file. No new network surface, no new auth path, no new file-access pattern beyond the existing `loadSceneFixture` (readFileSync of a known-relative path) already used in 80+ fixtures. T-14-01-01 (tampering of fixture files) is mitigated exactly as the plan's threat model predicted: the new Z05-INV-* tests bind cross-state column equality so any single-cell edit on cols 0/68/95 fails CI.

## Self-Check: PASSED

Verified:
- `packages/shared-render/src/fixtures/raster-overlay-open.it.txt` FOUND
- `packages/shared-render/src/fixtures/raster-overlay-open.en.txt` FOUND
- `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` FOUND
- `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` FOUND (181 lines, 7 `it(` blocks)
- Commit `65cc5f5` (Task 1 fixtures) FOUND in git log
- Commit `ec9b703` (Task 2 tests) FOUND in git log
- Commit `fd35c99` (Task 3 deferred-items doc) FOUND in git log
- All 7 Z05-* tests GREEN (verified locally during Task 2 and Task 3)
- g2-app full test suite GREEN (1324/1324)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 14-02 (LMT-DD-07 race-coverage) — already shipped in commit `60d68c0`; shares the z=0.5 state machine contract with Plan 14-01 but exercises the timing/atomicity property (single-flush guarantee) at the LayerManager level.
- Plan 14-03 (INV-3 atomic v0.9.11→v0.9.12 spec bump) — ready to reference the 3 new fixtures + 7 tests as the locked visual contract. Should fold the workspace-wide `pnpm lint:ci` cleanup into the same atomic commit (see deferred-items.md).
- No blockers. Wave 1 of Phase 14 is software-complete.

---
*Phase: 14-raster-z-0-5-idle-content-infill*
*Plan: 01*
*Completed: 2026-05-17*
