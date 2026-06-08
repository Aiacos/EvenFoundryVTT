---
phase: 21-character-sheet-su-canvas-dati-main-tab
plan: "05"
subsystem: shared-render / g2-app
tags: [inv-1, glyph-renderer, raster-fixture, sha256, fixtures]
dependency_graph:
  requires: ["21-01", "21-03", "21-04"]
  provides: ["21-05-inv1-closure"]
  affects: ["shared-render/fixtures", "g2-app/panels"]
tech_stack:
  added: []
  patterns:
    - "first-run-writes / subsequent-compares SHA-256 raster hash fixture (RINV-01 pattern reuse)"
    - "INV-1 glyph fixture update via Vitest -u snapshot update"
key_files:
  created:
    - packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json
  modified:
    - packages/shared-render/src/fixtures/sheet.main.2014.it.txt
    - packages/shared-render/src/fixtures/sheet.main.2014.en.txt
    - packages/shared-render/src/fixtures/sheet.main.2014.de.txt
    - packages/shared-render/src/fixtures/sheet.main.2024.it.txt
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
    - packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts
decisions:
  - "Row-6 vitals bar uses formatAbilityMod(snapshot.initiative) and String(snapshot.speed) — em-dash placeholders retired (RDATA-01/02)"
  - "Fixture values use initiative:2 -> +2 and speed:30 -> 30, consistent with BASE_CHARACTER_SNAPSHOT (plan said speed:25 for dwarf; actual test snapshot uses speed:30)"
  - "RCSP-INV1 reuses Phase 20 synthetic RGBA generator — no new non-deterministic source"
  - "Pre-existing lint error in debug-agent.ts (noConsole) deferred — not introduced by this plan"
metrics:
  duration: "~7 minutes"
  completed: "2026-06-07"
  tasks_completed: 3
  files_changed: 6
  tests_added: 1
---

# Phase 21 Plan 05: INV-1 Fixture Closure Summary

Closes Phase 21's INV-1 contract: glyph Main tab renderer now emits real `initiative`/`speed` (signed +N via `formatAbilityMod`) instead of em-dash placeholders, all 4 `sheet.main.*.txt` fixtures updated atomically, and new `canvas-sheet-panel.raster-hash.json` raster SHA-256 fixture with RCSP-INV1 test + FALSE-PASS guard.

## Tasks Completed

| Task | Name | Commit | Files Changed |
|------|------|--------|---------------|
| 1 | Update glyph Main tab renderer + 4 fixtures row-6 (atomic INV-1) | `6067522` | character-sheet-tab-renderers.ts + 4 fixture .txt files |
| 2 | Create canvas-sheet-panel.raster-hash.json + RCSP-INV1 raster contract | `7f85363` | canvas-sheet-panel.raster-hash.json + canvas-character-sheet-panel.test.ts |
| 3 | Full-phase regression (inv:all + workspace) green | — (verification only, no files changed) | — |

## What Was Built

**Task 1 — Glyph renderer + 4 fixture updates:**
- `character-sheet-tab-renderers.ts` row-6 vitals bar: `⛨ CA 18    ⚡ INI ${formatAbilityMod(snapshot.initiative)}    ⚔ VEL ${String(snapshot.speed)}    COMP ${profStr}` — em-dashes retired
- All 4 `sheet.main.*.txt` fixtures row 7 updated: `INI —` → `INI +2`, `VEL/SPD/GES —` → `VEL/SPD/GES 30`
- INV-1 column alignment preserved: `row66()` pads to 66 code-points; trailing spaces auto-corrected via `vitest -u`

**Task 2 — Raster INV-1 SHA-256 fixture:**
- `canvas-sheet-panel.raster-hash.json`: 4 tile hashes from `buildHudTiles()` over canonical synthetic RGBA (same Phase 20 RINV-01 pipeline)
- RCSP-INV1 test: first-run-writes fixture; subsequent runs compare; FALSE-PASS guard asserts 4 tiles present

**Task 3 — Regression:**
- 3230/3230 tests PASS workspace-wide (3229 + 1 RCSP-INV1)
- `pnpm typecheck`: EXIT 0
- socketlib handler count = 17 (unchanged)
- `panel-gesture-bus.ts` unmodified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Plan vs. Reality] speed:30 not speed:25 in fixtures**
- **Found during:** Task 1 fixture update
- **Issue:** Plan specified `VEL 25` (Thorin dwarf dwarf speed) but `BASE_CHARACTER_SNAPSHOT` and `snapshot2014` in the test suite both have `speed: 30`. Using 25 would cause INV-1 fixture mismatch.
- **Fix:** Updated all 4 fixtures with `VEL/SPD/GES 30` to match actual test snapshot values
- **Files modified:** All 4 `sheet.main.*.txt` files

**2. [Rule 1 - Bug] Trailing spaces stripped from fixture rows**
- **Found during:** Task 1, after initial manual edit
- **Issue:** Initial edit removed trailing spaces from row-6 strings; `toMatchFileSnapshot` compares bytes — would fail on the next test run
- **Fix:** Ran `pnpm vitest --run --project g2-app -u` to auto-update `.txt` fixtures via Vitest's snapshot update mechanism; `row66()` pads all rows to exactly 66 code-points

## Known Stubs

None — all Phase 21 data fields (`initiative`, `speed`, `class`) are now wired to real `CharacterSnapshot` fields in both glyph and canvas renderers.

## Deferred Items

**Pre-existing lint error — NOT introduced by this plan:**
- File: `packages/g2-app/src/debug/debug-agent.ts` lines 95-96
- Error: `noConsole` violation (`console.log.bind(console)`)
- Status: Pre-existed this plan; confirmed via `git diff HEAD~2 -- debug-agent.ts` (no changes). Out of scope per SCOPE BOUNDARY rule.
- Tracked in: `.planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/deferred-items.md`

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Success Criteria Verification

- [x] 4 glyph fixtures row-6 show real INI/VEL atomically with the renderer (`INI +2` / `VEL 30`)
- [x] `canvas-sheet-panel.raster-hash.json` exists with 4 tile SHA-256 entries
- [x] RCSP-INV1 green on second run (compare branch); FALSE-PASS guard present
- [x] `pnpm test -- --run` GREEN workspace-wide (3230/3230)
- [x] `pnpm typecheck` EXIT 0
- [x] socketlib handler count = 17 unchanged
- [x] `panel-gesture-bus.ts` unchanged
- [x] Requirements RSHEET-01, RDATA-01, RDATA-02 fulfilled

## Self-Check: PASSED
