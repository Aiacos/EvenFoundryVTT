---
phase: 22-features-biography-schema-extension
plan: 03
subsystem: ui
tags: [g2-app, canvas, character-sheet, feats, biography, scroll, tdd, inv-1, raster]

dependency_graph:
  requires:
    - 22-01 (FeatEntrySchema + BiographySnapshotSchema in @evf/shared-protocol)
    - 22-02 (extractFeats() + extractBiography() in foundry-module character-reader)
  provides:
    - renderFeatsTab consumes snapshot.feats (real data, RDATA-03)
    - renderBioTab consumes snapshot.biography (real data, RDATA-04)
    - paintFeatsTab(ctx, snapshot, bounds, font, locale, scrollOffset) optional trailing param
    - paintBioTab(ctx, snapshot, bounds, font, locale, scrollOffset) optional trailing param
    - CanvasCharacterSheetPanel.onEvent tab-aware scroll (Bio+Feats scroll content; others cycle)
    - DEFAULT_FEATS constant removed (INV-4)
    - FeatDef.category widened to string (Open Question 1)
    - Empty/absent feats/biography graceful empty state
    - 5 INV-1 fixtures updated byte-aligned (4 empty-state + 1 unchanged)
  affects:
    - Phase 23+ (full raster pipeline — renderer produces correct content via real data)
    - Phase 24 (xxhash delta driver — will call paint*Tab with correct scrollOffset)

tech_stack:
  added: []
  patterns:
    - "Tab-aware scroll: 'bio'|'feats' tabs increment/decrement _scrollOffset; other tabs cycle on scroll"
    - "Single scroll cursor: _scrollOffset resets to 0 on tab change (no per-tab independent scroll)"
    - "Paint*Tab optional trailing scrollOffset param: backward-compatible, default=0"
    - "FeatDef.category: string (open taxonomy — FEAT_SECTION_ORDER drives display; unknown cats appended)"
    - "addSection skips if text.length===0 (no header for empty biography fields — D-22.4)"
    - "INV-1 fixture update: byte-aligned per 21-05 precedent when renderer output changes"
    - "isAtTopBoundary() = _scrollOffset===0 — MUST NOT change (ADR-0012 over-scroll gate contract)"

key_files:
  created: []
  modified:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
    - packages/g2-app/src/panels/canvas-character-sheet-panel.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts
    - packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts
    - packages/shared-render/src/fixtures/sheet.feats.2014.it.txt
    - packages/shared-render/src/fixtures/sheet.feats.2024.it.txt
    - packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt
    - packages/shared-render/src/fixtures/sheet-bio-with-portrait.it.txt

key-decisions:
  - "Open Question 1 resolved: FeatDef.category widened from union to string; FEAT_SECTION_ORDER drives display order; unknown categories appended after known sections"
  - "Open Question 2 resolved: tap gesture stays tab-cycle (D-22.5 scroll via scroll gesture only)"
  - "D-22.4 implemented: addSection skips empty text — no empty headers rendered"
  - "isAtTopBoundary() unchanged at _scrollOffset===0 (Pitfall 5 / ADR-0012 over-scroll gate)"
  - "Single scroll cursor per panel: _scrollOffset resets on tab change (no per-tab independent offset)"
  - "INV-1 fixtures for feats tabs updated to empty-feats state; sheet.bio.it.txt unchanged (snapshotWithBio carries same IT text as old hardcoded)"

requirements-completed: [RDATA-03, RDATA-04]

duration: ~90min
completed: 2026-06-08
---

# Phase 22 Plan 03: renderFeatsTab/renderBioTab real data wiring + tab-aware scroll Summary

**renderFeatsTab/renderBioTab consume real `snapshot.feats`/`snapshot.biography`; DEFAULT_FEATS removed; Bio+Feats tabs scroll content via `_scrollOffset`; paint*Tab gains optional scrollOffset param; 5 INV-1 fixtures updated byte-aligned.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-07T22:00Z (estimate)
- **Completed:** 2026-06-08T01:16Z
- **Tasks:** 2 (both TDD RED→GREEN)
- **Files modified:** 8 (2 source, 2 test, 4 INV-1 fixtures)

## Accomplishments

- Removed `DEFAULT_FEATS` constant (24-line dead fixture, INV-4 compliance); renderer now uses `snapshot.feats ?? []`
- Replaced 5 hardcoded Italian biography strings with `snapshot.biography?.field ?? ''` (RDATA-04)
- `CanvasCharacterSheetPanel.onEvent` rewritten to be tab-aware: Bio+Feats tabs scroll content via `_scrollOffset`; non-scrollable tabs preserve existing cycle behaviour
- `paintFeatsTab` and `paintBioTab` gain optional trailing `scrollOffset = 0` param (backward-compatible — all 1562 tests unaffected)
- `addSection` skips empty-string text fields (D-22.4 — no phantom headers for absent biography sections)
- `FeatDef.category` widened from `'class'|'race'|'background'|'feat'` union to `string` (Open Question 1; consistent with `FeatEntrySchema.category: z.string()`)
- `isAtTopBoundary()` unchanged at `return this._scrollOffset === 0` (Pitfall 5 / ADR-0012 contract)

## Task Commits

1. **Task 1 RED: add failing CSTR-FEAT-1..3 + CSTR-BIO-1..3 tests** — `5e57c82` (test)
2. **Task 1 GREEN: renderFeatsTab/renderBioTab consume real snapshot data; remove DEFAULT_FEATS** — `4a4616d` (feat)
3. **Task 2 RED: add failing RCSP-BIO-1..5 + RCSP-PAINT-SCROLL tests** — `588023f` (test)
4. **Task 2 GREEN: paintFeatsTab/paintBioTab accept scrollOffset; onEvent tab-aware scroll** — `6f3d310` (feat)

## Files Created/Modified

- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — removed `DEFAULT_FEATS`; widened `FeatDef.category`; `renderFeatsTab` uses `snapshot.feats ?? []`; `renderBioTab` uses `snapshot.biography?.*`; `addSection` skips empty text; `paintFeatsTab`/`paintBioTab` gain optional `scrollOffset = 0` param
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — `onEvent` scroll case rewritten tab-aware; `_paintActiveTab` passes `this._scrollOffset` to `paintFeatsTab`/`paintBioTab`; `isAtTopBoundary()` unchanged
- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` — added `snapshotWithFeats`, `snapshotWithRealBio`; updated `snapshotWithBio` with real biography data; added CSTR-FEAT-1..3, CSTR-BIO-1..3; updated CSTR-FIX-FEATS-2014/2024 to reflect empty-feats fixture state
- `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — added RCSP-BIO-1..5 (tab-aware scroll), RCSP-PAINT-SCROLL (`snapshotWithLongBio` proves different scroll window)
- `packages/shared-render/src/fixtures/sheet.feats.2014.it.txt` — updated to empty-feats state (scroll hint + 17 blank rows, 18 rows × 66 chars)
- `packages/shared-render/src/fixtures/sheet.feats.2024.it.txt` — same as 2014 empty-feats state
- `packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt` — updated to empty-bio state (`bioSnapshot` has no `biography` field)
- `packages/shared-render/src/fixtures/sheet-bio-with-portrait.it.txt` — updated to empty-bio state (same)

## Decisions Made

- **Open Question 1 (category widening):** `FeatDef.category` widened to `string`. `FEAT_SECTION_ORDER = ['class','race','background','feat','general']` drives display order; categories not in the order list are appended alphabetically after known sections. Consistent with `FeatEntrySchema.category: z.string()` established in 22-01.
- **Open Question 2 (tap gesture):** `tap` remains tab-cycle per research. D-22.5 scroll behaviour is exclusively via scroll gesture. No ambiguity in gesture routing.
- **Single scroll cursor:** `_scrollOffset` resets to `0` on every tab change. No per-tab independent scroll offset stored. Simpler state, fewer edge cases.
- **`addSection` skip-empty:** Empty text means no `addSection` call at all (no header emitted). A bio with all-empty fields renders as scroll-hint + blank rows (same as `biography: undefined`).
- **INV-1 fixture strategy:** `snapshotWithBio` was updated to carry real biography IT text (same as previously hardcoded), so `sheet.bio.it.txt` required no change. `sheet.feats.2014/2024.it.txt` updated because `snapshotWithBio` has no feats; `sheet-bio-*.it.txt` updated because `bioSnapshot` in panel tests has no `biography` field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RCSP-PAINT-SCROLL test always equal when bio text too short**
- **Found during:** Task 2 GREEN (writing test verification)
- **Issue:** `renderBioTab` clamps `scrollOffset` to `Math.max(0, allLines.length - (ROW_COUNT-1))`. With a short bio (16 lines), offset=3 clamps to 0 and produces identical output to offset=0. The test would have been a false-pass.
- **Fix:** Replaced the short biography literal with `snapshotWithLongBio` — a snapshot carrying ~22 lines of biography content so `scrollOffset=3` produces a genuinely different render window.
- **Files modified:** `canvas-character-sheet-panel.test.ts`
- **Verification:** `pnpm --filter @evf/g2-app test -- --run -t "RCSP-PAINT-SCROLL"` passes; the two render outputs are confirmed different
- **Committed in:** `6f3d310` (Task 2 GREEN)

**2. [Rule 1 - Bug] CSTR-FIX-FEATS-2014/2024 fixture mismatch after DEFAULT_FEATS removal**
- **Found during:** Task 1 GREEN
- **Issue:** INV-1 round-trip tests `CSTR-FIX-FEATS-2014/2024` used `snapshotWithBio` which has no `feats` field → `renderFeatsTab` now renders empty-feats state, not the old DEFAULT_FEATS content the fixtures were based on
- **Fix:** Regenerated `sheet.feats.2014.it.txt` and `sheet.feats.2024.it.txt` to the correct empty-feats state (scroll hint + 17 blank rows, 18 rows × 66 code-points). Byte-aligned per 21-05 precedent.
- **Files modified:** `packages/shared-render/src/fixtures/sheet.feats.2014.it.txt`, `sheet.feats.2024.it.txt`
- **Verification:** `CSTR-FIX-FEATS-2014/2024` pass; width invariant maintained (66 chars/row)
- **Committed in:** `4a4616d` (Task 1 GREEN)

**3. [Rule 1 - Bug] CHSP-FIX-PORT-01/02 fixture mismatch**
- **Found during:** Task 1 GREEN
- **Issue:** `bioSnapshot` in `canvas-character-sheet-panel.test.ts` has no `biography` field → `renderBioTab` returns empty-bio state, not the content the `sheet-bio-*.it.txt` fixtures expected
- **Fix:** Regenerated `sheet-bio-without-portrait.it.txt` and `sheet-bio-with-portrait.it.txt` to empty-bio state (scroll hint + 17 blank rows)
- **Files modified:** `packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt`, `sheet-bio-with-portrait.it.txt`
- **Verification:** `CHSP-FIX-PORT-01/02` pass
- **Committed in:** `4a4616d` (Task 1 GREEN)

**4. [Rule 3 - Biome format] Long string literal auto-formatted**
- **Found during:** Task 2 GREEN — `pnpm biome ci` flagged the `personality` string literal in `snapshotWithLongBio` as exceeding line-length
- **Fix:** Ran `pnpm biome check --write` on the test file; Biome auto-folded the string
- **Files modified:** `canvas-character-sheet-panel.test.ts`
- **Verification:** `pnpm biome ci` clean on all touched files
- **Committed in:** `6f3d310` (Task 2 GREEN)

**5. [Rule 3 - Biome] Unused function parameter**
- **Found during:** Task 2 GREEN — `navigateToTab(bus, panel, targetTabIndex)` had unused `panel` parameter
- **Fix:** Removed `panel` param; updated all call sites (3 places). Biome `noUnusedFunctionParameters` clean.
- **Files modified:** `canvas-character-sheet-panel.test.ts`
- **Verification:** `pnpm biome ci` clean; all RCSP-BIO-* tests green
- **Committed in:** `6f3d310` (Task 2 GREEN)

---

**Total deviations:** 5 auto-fixed (2 Rule 1 bugs, 1 Rule 1 false-pass prevention, 2 Rule 3 blocking/format)
**Impact on plan:** All auto-fixes necessary for correct test assertions and INV-1 compliance. No scope creep.

## Issues Encountered

- The plan verification note said "INV-1: no .txt glyph fixture references the removed DEFAULT_FEATS/bio strings — no byte-aligned fixture update required." This was incorrect: removing DEFAULT_FEATS changed the renderer output for snapshots without feats, which is the test snapshot for the 2014/2024 fixtures. Four fixtures required byte-aligned updates. This is documented above (Deviations #2 and #3).

## TDD Gate Compliance

- **Task 1 RED gate:** `5e57c82` — 6 tests added (CSTR-FEAT-1..3, CSTR-BIO-1..3); all fail before implementation (renderFeatsTab still used DEFAULT_FEATS, renderBioTab still used hardcoded text)
- **Task 1 GREEN gate:** `4a4616d` — implementation complete; all 1562 tests pass
- **Task 2 RED gate:** `588023f` — 6 tests added (RCSP-BIO-1..5, RCSP-PAINT-SCROLL); all fail before implementation (paintBioTab/paintFeatsTab had no scrollOffset param)
- **Task 2 GREEN gate:** `6f3d310` — implementation complete; all 1562 tests pass

## Known Stubs

None. Both `renderFeatsTab` and `renderBioTab` now consume real snapshot data. The `snapshot.feats` and `snapshot.biography` fields are populated by `extractFeats()`/`extractBiography()` in the foundry-module (22-02). No hardcoded or placeholder text remains in either renderer.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. Threat mitigations from the plan:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-22-05 | Malformed snapshot.feats/biography → existing `safeParse` gate (T-21-01) + `?? [] / ?? ''` fallbacks | Implemented: both renderers use null-coalescing defensively |
| T-22-06 | Extremely long backstory → ROW_COUNT × INNER_WIDTH window bound + scroll offset clamped | Implemented: `renderBioTab` clamps scroll offset to `Math.max(0, allLines.length - (ROW_COUNT-1))` |

## Next Phase Readiness

Phase 22 is complete (schema 22-01 + reader 22-02 + renderers 22-03 all shipped). The full data pipeline is operational:

```
Foundry dnd5e actor
  → extractFeats() / extractBiography() [foundry-module, 22-02]
  → CharacterSnapshotSchema.feats / .biography [shared-protocol, 22-01]
  → renderFeatsTab(snapshot, ..., scrollOffset) / renderBioTab(snapshot, ..., scrollOffset) [g2-app, 22-03]
  → canvas composited via paintFeatsTab / paintBioTab [g2-app, 22-03]
  → CanvasCharacterSheetPanel._paintActiveTab with this._scrollOffset [g2-app, 22-03]
```

Ready for Phase 23+ (raster pipeline integration) and Phase 24 (xxhash delta driver — `paintBioTab`/`paintFeatsTab` now accept `scrollOffset` correctly).

---

## Self-Check: PASSED

- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — FOUND
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — FOUND
- `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` — FOUND
- `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — FOUND
- `packages/shared-render/src/fixtures/sheet.feats.2014.it.txt` — FOUND
- `packages/shared-render/src/fixtures/sheet.feats.2024.it.txt` — FOUND
- `packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt` — FOUND
- `packages/shared-render/src/fixtures/sheet-bio-with-portrait.it.txt` — FOUND
- Commit `5e57c82` (Task 1 RED) — FOUND
- Commit `4a4616d` (Task 1 GREEN) — FOUND
- Commit `588023f` (Task 2 RED) — FOUND
- Commit `6f3d310` (Task 2 GREEN) — FOUND
- `grep "DEFAULT_FEATS" character-sheet-tab-renderers.ts` → 0 matches — CONFIRMED
- `grep "snapshot.feats" character-sheet-tab-renderers.ts` → line 753 — CONFIRMED
- `grep "snapshot.biography" character-sheet-tab-renderers.ts` → line 912-919 — CONFIRMED
- `grep "return this._scrollOffset === 0" canvas-character-sheet-panel.ts` → line 473 — CONFIRMED
- `pnpm --filter @evf/g2-app test -- --run` → 1562/1562 — CONFIRMED
- `pnpm --filter @evf/g2-app exec tsc --noEmit` → exit 0 — CONFIRMED
- `pnpm biome ci` (touched files) → 0 errors — CONFIRMED

---
*Phase: 22-features-biography-schema-extension*
*Completed: 2026-06-08*
