---
phase: 06-r1-integration-quick-action-inv-5
plan: 03
subsystem: status-hud / chip / panels
tags: [chip, r1-hints, nav-01, inv-5, i18n, fixture]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [renderContextChip, getR1Hints-panels, chip-fixtures]
  affects: [status-hud-renderer, status-hud-layer, panels, i18n-budgets, shared-render-fixtures]
tech_stack:
  added: []
  patterns:
    - "R1HintProvider narrow interface (structural typing, test-injectable — mirrors WebSocketLike)"
    - "LayerManagerLike narrow interface (structural typing, no full-class import)"
    - "Pre-authored chip i18n strings with single-space separators (≤38-char budget INV-1 §3.2)"
    - "parseR1HintString pure helper for pre-composed token parsing (order-independent)"
    - "DEFAULT_R1_HINTS Object.freeze constant (planner-locked Q3 fallback)"
    - "matchAsciiFixture auto-seed on first run (5 chip fixtures)"
key_files:
  created:
    - packages/g2-app/src/status-hud/r1-hint-parser.ts
    - packages/g2-app/src/status-hud/__tests__/r1-hint-parser.test.ts
    - packages/shared-render/src/fixtures/status-hud.chip.main.it.txt
    - packages/shared-render/src/fixtures/status-hud.chip.sheet.it.txt
    - packages/shared-render/src/fixtures/status-hud.chip.combat.it.txt
    - packages/shared-render/src/fixtures/status-hud.chip.menu.it.txt
    - packages/shared-render/src/fixtures/status-hud.chip.boot-error.it.txt
  modified:
    - packages/g2-app/src/status-hud/status-hud-renderer.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
    - packages/g2-app/src/panels/character-sheet-panel.ts
    - packages/g2-app/src/panels/combat-tracker-panel.ts
    - packages/g2-app/src/panels/log-panel.ts
    - packages/g2-app/src/panels/inventory-panel.ts
    - packages/g2-app/src/panels/spellbook-panel.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts
    - packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts
    - packages/g2-app/src/panels/__tests__/log-panel.test.ts
    - packages/g2-app/src/panels/__tests__/inventory-panel.test.ts
    - packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
decisions:
  - "Single-space separators in pre-authored chip strings (not double-space) — keeps all strings within 38-char INV-1 budget without abbreviating token values further (Rule 1 bug fix on initial double-space authoring)"
  - "R1HintProvider narrow interface on LayerManagerLike.getTopLayer() — avoids requiring test mocks to satisfy full Layer contract (id, draw, destroy); matches WebSocketLike structural typing pattern"
  - "DEFAULT_R1_HINTS uses EN-canonical values (cycle/nav/quick) — planner-locked Q3 resolution; appears only in degenerate fallback state (non-overlay layer at top without getR1Hints)"
  - "renderer.locale exposed as public readonly — allows StatusHudLayer._renderNow() to pass locale to renderContextChip without re-storing it separately in the layer"
metrics:
  duration: ~90min (continuation from previous session)
  completed: "2026-05-16T08:39:00Z"
  tasks: 2
  files_changed: 16
requirements_closed: [NAV-01]
---

# Phase 6 Plan 03: StatusHudRenderer Context Chip + Panel getR1Hints() Summary

**One-liner:** Context-aware R1 chip via `LayerManager.getTopLayer()?.getR1Hints?.()` pull model; all 5 Phase 5 panels expose `getR1Hints()`; 5 INV-1 chip fixtures seeded; closes NAV-01 + INV-5 SC-4.

## What Was Built

### Task 1: Per-panel `getR1Hints()` + 12 i18n keys + parser helper

**New module:** `r1-hint-parser.ts` — pure `parseR1HintString(raw: string)` helper that tokenizes `tap=X scroll=Y long=Z` strings into `{ tap, scroll, longPressLabel }`. Order-independent, 8 unit tests (RHP-01..08).

**12 new keys added to `HUD_WIDTH_BUDGETS`** (160 → 172 total):
`hud_r1_main`, `hud_r1_sheet`, `hud_r1_combat`, `hud_r1_log`, `hud_r1_inv`, `hud_r1_spell`, `hud_r1_menu`, `hud_r1_lang_submenu`, `hud_r1_boot`, `hud_r1_boot_error`, `hud_r1_conc_modal`, `hud_r1_death_saves`.

All strings use single-space separator format and fit within their `max` values (IB-3 test verifies every locale string ≤ max).

**5 panels extended with `getR1Hints()` via `parseR1HintString(getLabel('hud_r1_<panel>', locale))`:**
- `CharacterSheetPanel` → `hud_r1_sheet` IT: `tap=tab scroll=cont long=q[sheet]`
- `CombatTrackerPanel` → `hud_r1_combat` IT: `scroll=iniz tap=rapida long=q[combat]`
- `LogPanel` → `hud_r1_log` IT: `scroll=evento tap=apri long=q[log]`
- `InventoryPanel` → `hud_r1_inv` IT: `scroll=oggetto tap=usa long=q[inv]`
- `SpellbookPanel` → `hud_r1_spell` IT: `scroll=incant tap=lancia long=q[spell]`

**10 new panel tests** (2 per panel): `CHSP/CTP/LP/IP/SP-R1HINTS-IT` + `CHSP/CTP/LP/IP/SP-R1HINTS-BUDGET`.

Commit: `c1617a6` (from previous session)

### Task 2: `renderContextChip` + LayerManagerLike + StatusHudLayer wiring + 5 INV-1 fixtures

**New exports in `status-hud-renderer.ts`:**
- `DEFAULT_R1_HINTS = Object.freeze({ tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' })` — planner-locked Q3 fallback.
- `R1HintProvider` interface — minimal structural type for `getR1Hints?()` (test-injectable, no full Layer import).
- `LayerManagerLike` interface — narrow `{ getTopLayer(): R1HintProvider | null }` (structural typing, test-injectable).
- `StatusHudRenderer.locale` — exposed as `public readonly` for layer-side chip calls.

**`renderContextChip(layerManager: LayerManagerLike | null, locale: HudLocale): string`** — pull-model chip (RESEARCH §Q4 Option b):
- Case null lm OR `getTopLayer() === null` → `hud_r1_main` parsed via `parseR1HintString`.
- Case top layer without `getR1Hints` → `DEFAULT_R1_HINTS`.
- Case top layer with `getR1Hints()` → compose from its values.
- Single-space format: `tap=X scroll=Y long=Z`. Defensive truncation at 38 code-points.
- Returns `R1: <content>` (≤42 total code-points per SR-CHIP-07).

**StatusHudLayer wired:** `opts.layerManager?: LayerManagerLike` stored; `_renderNow()` calls `renderContextChip(this.layerManager, this.renderer.locale)` and appends chip to bridge content payload.

**5 INV-1 chip fixtures seeded** via `matchAsciiFixture` auto-seed:
- `status-hud.chip.main.it.txt` → `R1: tap=cycle scroll=nav long=quick`
- `status-hud.chip.sheet.it.txt` → `R1: tap=tab scroll=cont long=q[sheet]`
- `status-hud.chip.combat.it.txt` → `R1: tap=rapida scroll=iniz long=q[combat]`
- `status-hud.chip.menu.it.txt` → `R1: tap=apri scroll=voce long=annulla`
- `status-hud.chip.boot-error.it.txt` → `R1: tap= scroll= long=riprova`

**13 new tests GREEN:** SR-CHIP-01..08 + SR-FIX-CHIP-01..05.

Commits: `a673b4e` (renderContextChip + fixtures), `deb5a04` (layer wiring)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-authored chip i18n strings used double-space separators exceeding 38-char budget**
- **Found during:** Task 2 GREEN phase (SR-CHIP-04 test failing — `q[sheet]` truncated)
- **Issue:** Initial `hud_r1_sheet` IT string was `tap=cambia-tab  scroll=cont  long=q[sheet]` (42 chars with double-spaces), exceeding the 38-char chip segment budget. SR-CHIP-04 expected `q[sheet]` to survive truncation but it was cut at position 37.
- **Fix:** Updated all 12 `hud_r1_*` strings to single-space separator format (≤38 chars each); updated `max` values accordingly; updated renderer composition to single-space format; updated test mocks to use abbreviated token values matching the pre-authored strings.
- **Files modified:** `i18n-budgets.ts`, `status-hud-renderer.ts`, `status-hud-renderer.test.ts`
- **Commit:** `a673b4e`

**2. [Rule 1 - Bug] `LayerManagerLike.getTopLayer()` returning full `Layer | null` caused TS2345 in tests**
- **Found during:** Task 2 typecheck after implementing `LayerManagerLike`
- **Issue:** Test mocks for `getTopLayer()` returned lightweight objects `{ getR1Hints?() }` without `id`, `draw`, `destroy` — not assignable to `Layer`.
- **Fix:** Introduced `R1HintProvider` narrow interface; `LayerManagerLike.getTopLayer()` now returns `R1HintProvider | null` (structural typing — `Layer` satisfies `R1HintProvider` transitively since `Layer.getR1Hints?()` has the same signature).
- **Files modified:** `status-hud-renderer.ts`
- **Commit:** `a673b4e`

**3. [Rule 1 - Bug] `private readonly locale` prevented StatusHudLayer from passing locale to renderContextChip**
- **Found during:** Task 2 StatusHudLayer wiring — `layerManager` stored but TS6133 unused error
- **Issue:** TS strict `noUnusedLocals` rejected storing `layerManager` without using it. Using it required calling `renderContextChip(this.layerManager, locale)`, but `locale` was private in the renderer.
- **Fix:** Exposed `renderer.locale` as `public readonly`. The layer then calls `renderContextChip(this.layerManager, this.renderer.locale)` in `_renderNow()`.
- **Files modified:** `status-hud-renderer.ts`, `status-hud-layer.ts`
- **Commit:** `deb5a04`

## Self-Check

```bash
# All 5 panel files contain getR1Hints method:
grep -lc "getR1Hints" packages/g2-app/src/panels/{character-sheet,combat-tracker,log,inventory,spellbook}-panel.ts
# Expected: 5 files listed

# renderContextChip present in renderer:
grep -c "renderContextChip" packages/g2-app/src/status-hud/status-hud-renderer.ts
# Expected: ≥ 1

# 5 INV-1 chip fixtures exist:
ls packages/shared-render/src/fixtures/status-hud.chip.*.txt | wc -l
# Expected: 5

# 12 hud_r1_* keys in i18n-budgets:
grep -c "hud_r1_" packages/g2-app/src/status-hud/i18n-budgets.ts
# Expected: ≥ 12

# 3 task commits in git log:
git log --oneline | grep "06-03" | wc -l
# Expected: ≥ 3 (c1617a6 + a673b4e + deb5a04)
```

## Self-Check: PASSED

- All 5 panel files found with `getR1Hints` method (grep-lc returns 5 files)
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` contains `renderContextChip` (6 occurrences)
- 5 INV-1 chip fixtures present in `packages/shared-render/src/fixtures/`
- 172 total keys in `HUD_WIDTH_BUDGETS` (12 new `hud_r1_*` keys added, `satisfies` gate GREEN)
- 3 task commits in git log (c1617a6, a673b4e, deb5a04)
- `pnpm typecheck && pnpm lint:ci && pnpm test` all exit 0 (1275 tests passing)
- NAV-01 requirement closed
- INV-5 SC-4 visible enforcement: chip names live long-press target per all 5 mounted-state fixtures
