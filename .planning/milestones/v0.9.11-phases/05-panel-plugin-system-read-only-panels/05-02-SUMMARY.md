---
phase: "05"
plan: "02"
subsystem: "g2-app"
tags: [character-sheet, tab-strip, inv-1, sheet-01, sheet-04, persistence, panel-skeleton]
dependency_graph:
  requires:
    - 05-01 (PanelRouter + PanelMetaSchema + HudLocale + CharacterSnapshotSchema.world)
    - 04b (OverlayPanel + PanelGestureBus + hub-polyfill setLocalStorage/getLocalStorage)
  provides:
    - CharacterSheetPanel class (OverlayPanel skeleton, 6-tab state machine)
    - TABS constant ['main','skills','inventory','spells','feats','bio'] as const
    - TAB_LABELS constant ['MAI','SKI','INV','SPL','FEA','BIO'] as const
    - buildTabStrip(activeIdx) pure helper — 70-code-point tab strip row
    - PERSIST_KEY = 'view.sheet.lastTab' as const
    - _renderTabContentStub injection point for 05-03
    - 6 INV-1 fixtures (sheet.tab-strip.*-active.it.txt) — SHEET-04 ck 13
  affects:
    - 05-03 (replaces _renderTabContentStub body; adds character-sheet-tab-renderers.ts)
    - 05-04/05-05/05-06 (consume CharacterSheetPanel via PanelRouter auto-discovery)
tech_stack:
  added: []
  patterns:
    - Single-class 6-tab state machine (activeTabIndex + scrollOffset instance fields)
    - buildTabStrip pure helper — 70-char row via cell join + trailing dash fill
    - Code-point spread counting ([...row].length) for INV-1 width assertions (RESEARCH Pitfall 5)
    - Even Hub kv persistence (view.sheet.lastTab) — same pattern as view.map.mode
    - TABS.indexOf + Math.max(0, idx) defensive restore (T-05-02-01)
    - _renderTabContentStub with STUB comment — 05-03 injection point
key_files:
  created:
    - packages/g2-app/src/panels/character-sheet-panel.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts
    - packages/shared-render/src/fixtures/sheet.tab-strip.main-active.it.txt
    - packages/shared-render/src/fixtures/sheet.tab-strip.skills-active.it.txt
    - packages/shared-render/src/fixtures/sheet.tab-strip.inventory-active.it.txt
    - packages/shared-render/src/fixtures/sheet.tab-strip.spells-active.it.txt
    - packages/shared-render/src/fixtures/sheet.tab-strip.feats-active.it.txt
    - packages/shared-render/src/fixtures/sheet.tab-strip.bio-active.it.txt
  modified: []
decisions:
  - buildTabStrip uses separator-joined cells (6 cells + 5 dash separators + prefix + trailing fill + closing bracket = 70 chars)
  - UI-SPEC §4.2 text description (70 chars) is authoritative over the mockup row (68 chars visual count) — deviation documented below
  - fixtureDir resolves via __dirname relative path (../../../../shared-render/src/fixtures) matching snapshot.test.ts pattern
metrics:
  duration: "~6 minutes"
  completed: "2026-05-15T19:43:00Z"
  tasks_completed: 2
  tasks_total: 2
  task_commits: 2
  files_created: 8
  files_modified: 0
  tests_added: 26
---

# Phase 5 Plan 02: CharacterSheetPanel Skeleton + Tab Strip + INV-1 Fixtures

**One-liner:** 6-tab CharacterSheetPanel skeleton with 70-char buildTabStrip helper, last-viewed persistence via Even Hub `view.sheet.lastTab`, and 6 INV-1 fixture files proving SHEET-04 ck 13 width-exact contract.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | CharacterSheetPanel skeleton + tab strip + persistence + 26 CHSP-* tests | `6c7bc3a` | character-sheet-panel.ts, character-sheet-panel.test.ts |
| 2 | 6 INV-1 tab-strip fixtures (SHEET-04 ck 13) | `508de61` | 6 × sheet.tab-strip.*-active.it.txt |

## Key Decisions

### buildTabStrip format: separator-joined cells

The tab strip row is built as:
```
┌─  +  [▶MAI ]─[ SKI ]─[ INV ]─[ SPL ]─[ FEA ]─[ BIO ]  +  ────────────────────  +  ┐
 2         47 code-points (6 cells × 7 + 5 separators)         20 trailing dashes    1
= 70 total
```

Each cell is 7 code-points: `[ XXX ]` (inactive) or `[▶XXX ]` (active). 6 cells joined with 5 `─` separator characters + 2-char prefix + 20 trailing dashes + 1 closing `┐` = 70.

### Per-key EN fallback — not needed here

Tab labels (`MAI`/`SKI`/`INV`/`SPL`/`FEA`/`BIO`) are locale-fixed ASCII. No i18n budget involved for the tab strip row itself (CONTEXT.md §Area 2 rationale confirmed: 3-char tags are always safe).

### _renderTabContentStub injection point

The stub returns 18 rows × 66 code-points (inner content width). 05-03 will replace the method body or import `character-sheet-tab-renderers.ts`. The method is clearly marked with:
```ts
// STUB: 05-03 replaces this with real per-tab content from character-sheet-tab-renderers.ts
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture path resolution via __dirname not import.meta.dirname**
- **Found during:** Task 2 first run (fixture files written to wrong location)
- **Issue:** Initial test used `path.resolve(import.meta.dirname, '../../../../../shared-render/src/fixtures')`. In the Vitest/happy-dom environment, `import.meta.dirname` resolved to the workspace root rather than the test file's directory, placing fixtures at `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/shared-render/src/fixtures/` (wrong — missing `packages/` prefix).
- **Fix:** Replaced `path.resolve(import.meta.dirname, ...)` with `resolve(__dirname, '../../../../shared-render/src/fixtures')` — matching the pattern in `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`. Fixtures were copied from the wrong location to the correct one, the wrong directory was removed.
- **Files modified:** character-sheet-panel.test.ts (FIXTURE_DIR → fixtureDir() function)
- **Commits:** included in Task 1 re-stage after fix

**2. [Rule 1 - Bug] Biome import order sort**
- **Found during:** Task 1 `pnpm lint:ci`
- **Issue:** Named imports from `'../character-sheet-panel.js'` were in plan-specified order (`PERSIST_KEY, TABS, TAB_LABELS, buildTabStrip`) but Biome requires alphabetical (`buildTabStrip, PERSIST_KEY, TAB_LABELS, TABS`). Also a formatting fix in character-sheet-panel.ts (multi-line arrow function collapsed to single line).
- **Fix:** `pnpm format` applied automatically (2 files fixed).
- **Commits:** included in Task 1 commit.

### Design Contract Clarification (UI-SPEC drift, not a deviation)

The plan and UI-SPEC §4.2 text state "exactly 70 code-points" but the UI-SPEC §5.2 mockup row visual counts to 68 code-points (2 fewer trailing dashes). The **text description is authoritative** (explicit "Total tab strip width: exactly 70 chars" in §4.2). The mockup visual may have been manually typed with 18 instead of 20 trailing dashes. Executor followed the text contract; all 6 fixtures are 70 code-points. CHSP-FIX-* round-trips enforce the contract going forward.

## Test Coverage

| Suite | Tests Added | IDs |
|-------|-------------|-----|
| character-sheet-panel.test.ts | 26 | CHSP-META-1/2, CHSP-CTOR-1/2, CHSP-MOUNT-1, CHSP-UNMOUNT-1, CHSP-TAP-1/2, CHSP-SCROLL-UP-1, CHSP-SCROLL-DOWN-1, CHSP-PERSIST-1, CHSP-RESTORE-1/2/3, CHSP-TABSTRIP-1/2 + all-6 test, CHSP-DRAW-1, CHSP-DBL-TAP-1, CHSP-LONG-PRESS-1, CHSP-FIX-MAIN/SKILLS/INVENTORY/SPELLS/FEATS/BIO |

**Final test run:** 891 passed, 0 failed (63 test files)

## Known Stubs

**1. `_renderTabContentStub` in `character-sheet-panel.ts`**
- **File:** `packages/g2-app/src/panels/character-sheet-panel.ts`
- **Pattern:** Returns 18 rows of `' '.repeat(66)` with one centred hint row `(content rendered by 05-03) [tab: <tab>]`
- **Reason:** Intentional — 05-03 owns per-tab content rendering; stub is the injection point
- **Resolution:** Plan 05-03 replaces `_renderTabContentStub` body with real tab renderers

## Wave-1 Sequential Signal

Plan 05-02 is complete. Plan 05-03 is unblocked:
- `CharacterSheetPanel` compiles and passes all tests
- `_renderTabContentStub` is the single injection point (clearly marked with STUB comment)
- `buildTabStrip` is the source of truth for tab strip width (70 code-points, fixtures verified)
- `TABS`, `TAB_LABELS`, `PERSIST_KEY` are all exported and ready for 05-03 import

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. `view.sheet.lastTab` is stored via Even Hub kv (same tier as `view.map.mode` from Phase 4b).

## Self-Check: PASSED

Created files verified:
- packages/g2-app/src/panels/character-sheet-panel.ts — FOUND
- packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.main-active.it.txt — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.skills-active.it.txt — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.inventory-active.it.txt — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.spells-active.it.txt — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.feats-active.it.txt — FOUND
- packages/shared-render/src/fixtures/sheet.tab-strip.bio-active.it.txt — FOUND

Commits verified:
- 6c7bc3a (Task 1) — FOUND
- 508de61 (Task 2) — FOUND

Tests: 891/891 passing. Lint: 0 errors. Typecheck: clean.
