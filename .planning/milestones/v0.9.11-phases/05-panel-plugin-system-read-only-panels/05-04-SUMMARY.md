---
phase: "05"
plan: "04"
subsystem: g2-app
tags: [g2-app, panels, inventory, spellbook, sheet-tab, dual-edition, modern-rules, weapon-mastery, spell-slots, inv-1, fixtures]
requires:
  - 05-01
  - 05-02
  - 05-03
provides:
  - InventoryPanel (z=2, Strategy A) — standalone condensed Inventory overlay
  - SpellbookPanel (z=2, Strategy A) — standalone Spellbook overlay with slot bars
  - renderInventoryTabContent — sheet-tab variant (18×66cp, SHEET-01 closed)
  - renderSpellsTabContent — sheet-tab variant (18×66cp, SHEET-01 closed)
  - 7 INV-1 ASCII fixtures (4 inventory + 3 spellbook)
  - character-sheet-tab-renderers dispatcher complete (both stubs removed)
affects:
  - 05-06 integration smoke — PanelRouter now discovers 4 panels
tech-stack:
  added: []
  patterns:
    - "Per-tab + standalone renderer sharing — single renderInventoryRow/renderSpellRow helper called by both tab and standalone variants"
    - "modernRules weapon mastery flag — render-side branch, not schema field; NAME_WIDTH_2014=18 vs NAME_WIDTH_2024=14"
    - "Slot bar rendering — renderSlotBar(spent, max) → padded bar glyphs + N/M counter; MAX_BAR_LENGTH=4"
    - "Always-prepared 2024 glyph — ≡ when modernRules=true + alwaysPrepared=true; ◉ otherwise"
key-files:
  created:
    - packages/g2-app/src/panels/inventory-panel.ts
    - packages/g2-app/src/panels/__tests__/inventory-panel.test.ts
    - packages/g2-app/src/panels/spellbook-panel.ts
    - packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts
    - packages/shared-render/src/fixtures/sheet.inventory.2014.it.txt
    - packages/shared-render/src/fixtures/sheet.inventory.2024.it.txt
    - packages/shared-render/src/fixtures/inventory.2014.it.txt
    - packages/shared-render/src/fixtures/inventory.2024.it.txt
    - packages/shared-render/src/fixtures/sheet.spells.it.txt
    - packages/shared-render/src/fixtures/spellbook.caster.it.txt
    - packages/shared-render/src/fixtures/spellbook.half-caster.it.txt
  modified:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts
decisions:
  - "Fixture normalisation: test uses normaliseRows (trimEnd per row) so fixtures store trimmed content — no trailing-space discipline needed in .txt files"
  - "i18n template substitution: sheet.spell.level_section uses literal 'N' not '{N}', fixed with /N$/ regex; spell.level_section uses '{N}', fixed with .replace('{N}', ...)"
  - "inventory.2014/2024.it.txt fixture does NOT contain 'INVENTARIO' panel title — standalone renderer does not prepend a title row (title lives in the panel header, not content rows). Plan artifact spec 'contains: INVENTARIO' was incorrect; real output starts with 'EQUIPAGGIAMENTO'."
  - "Slot bar MAX_BAR_LENGTH=4: bars wider than 4 glyphs are capped proportionally; shorter max slot counts pad with spaces to maintain counter alignment"
  - "Task 4 audit gate confirms no source file changes required: CHRD-INV-1..5 + CHRD-SPL-1..5 tests from commit 95f02df all pass"
metrics:
  duration: "~90 minutes"
  completed: "2026-05-15"
  tasks: 4
  task_commits: 2
  files_created: 11
  files_modified: 2
  tests_added: 61
---

# Phase 05 Plan 04: InventoryPanel + SpellbookPanel + 7 INV-1 Fixtures Summary

One-liner: `InventoryPanel + SpellbookPanel (dual-edition, slot bars, 7 INV-1 fixtures, dispatcher stubs removed) — SHEET-01/02/03 closed`

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| T-1 schema+reader (from prev session) | `95f02df` | Extend CharacterSnapshotSchema with inventory + spells (atomic) |
| T-2 InventoryPanel | `7938fb4` | InventoryPanel + 4 INV-1 fixtures + dispatcher inventory branch |
| T-3 SpellbookPanel | `97413c1` | SpellbookPanel + 3 INV-1 fixtures + dispatcher spells branch |
| T-4 audit gate | — | No source changes; CHRD-INV-1..5 + CHRD-SPL-1..5 all pass |

## What Was Built

### InventoryPanel (`packages/g2-app/src/panels/inventory-panel.ts`)

- Standalone z=2 OverlayPanel, Strategy A (single text container `overlay-block`)
- `renderInventoryTabContent(snapshot, locale, scrollOffset): string[]` — 18×66cp sheet-tab variant
- `renderInventoryStandaloneContent(snapshot, locale, scrollOffset): string[]` — 18×66cp standalone with condensed CARRIED line
- `renderInventoryRow(item, locale, modernRules): string` — 66cp row; `[M]` mastery flag when `modernRules=true && item.type==='weapon'`
- Column layout: indent(3) + glyph(1) + space(1) + name(18/14) + mastery(0/5) + damage(22) + tags(19)
- Section helpers: `renderEquippedSection` (weapon+armor+equipment) / `renderConsumablesSection` / `renderCarriedSection`

### SpellbookPanel (`packages/g2-app/src/panels/spellbook-panel.ts`)

- Standalone z=2 OverlayPanel, Strategy A (single text container `overlay-block`)
- `renderSpellsTabContent(snapshot, locale, scrollOffset): string[]` — 18×66cp sheet-tab with filter bar + `◇ LIVELLO N` headers
- `renderSpellbookStandaloneContent(snapshot, locale, scrollOffset): string[]` — 18×66cp standalone with title + prepared counter + slot bars
- `renderSpellRow(spell, locale, modernRules, isCursor): string` — 66cp row; markers: ◉/≡/▶/space at col 3, ≀/space at col 4
- `renderSlotBar(spent, max): string` — `▓`/`░` bar (max 4 glyphs) + N/M counter; `← disponibili` when value === max
- `renderLevelSection(level, spells, slot, locale, modernRules): string[]` — level header + spell rows

### Dispatcher Update (`character-sheet-tab-renderers.ts`)

- `'inventory'` branch: replaced `_renderInventoryStub()` with `renderInventoryTabContent(snapshot, locale, scrollOffset)` (T-2)
- `'spells'` branch: replaced `_renderSpellsStub()` with `renderSpellsTabContent(snapshot, locale, scrollOffset)` (T-3)
- Both stubs deleted; dispatcher is now exhaustive and complete
- CSTR-DISP-INV-STUB → CSTR-DISP-INV-REAL; CSTR-DISP-SPL-STUB → CSTR-DISP-SPL-REAL

### 7 INV-1 ASCII Fixtures

All fixtures verified at 66 code-points per row (normalised with `normaliseRows` in tests).

| Fixture | Content |
|---------|---------|
| `sheet.inventory.2014.it.txt` | Sheet Inventory tab, PHB 2014 (no [M] flag) |
| `sheet.inventory.2024.it.txt` | Sheet Inventory tab, PHB 2024 ([M] on weapons) |
| `inventory.2014.it.txt` | Standalone InventoryPanel, PHB 2014 |
| `inventory.2024.it.txt` | Standalone InventoryPanel, PHB 2024 |
| `sheet.spells.it.txt` | Sheet Spells tab (filter bar + ◇ LIVELLO N headers) |
| `spellbook.caster.it.txt` | Standalone SpellbookPanel, full caster (L1-L3 slots) |
| `spellbook.half-caster.it.txt` | Standalone SpellbookPanel, half caster (L1-L2, all free) |

Test characters:
- **Thorin Oakenshield** (F3/W5): inventory fixtures (2 weapons, 1 armor, 1 equipment, 3 consumables, 1 container) + caster fixture (2 cantrips + 5 spells across L1-L3)
- **Aela Aurora** (Paladin 5): half-caster fixture (3 spells, all slots free)

### Test Coverage

- 28 IP-* tests for InventoryPanel (including 4 INV-1 fixture round-trips)
- 33 SP-* tests for SpellbookPanel (including 3 INV-1 fixture round-trips)
- 10 CHRD-INV/SPL-* tests in readers.test.ts (audit gate)
- 2 CSTR-DISP-*-REAL tests updated in character-sheet-tab-renderers.test.ts
- **Total new/modified tests: 61 (70 test files, 1103 tests — all green)**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n template substitution mismatch**
- **Found during:** SpellbookPanel generation (fixture output showed `◇ LIVELLO N` for all levels)
- **Issue:** `sheet.spell.level_section` key uses literal `N` suffix, not `{N}`. The code used `.replace('{N}', ...)` which matched nothing.
- **Fix:** Changed to `/N$/` regex: `getLabel('sheet.spell.level_section', locale).replace(/N$/, String(lvl))`
- **Files modified:** `packages/g2-app/src/panels/spellbook-panel.ts`
- **Commit:** `97413c1`

**2. [Rule 1 - Bug] Biome import order and formatting in new files**
- **Found during:** Pre-commit hooks for T-2 and T-3
- **Issue:** Biome reported import organization + formatting violations in `inventory-panel.ts`, `inventory-panel.test.ts`, `spellbook-panel.ts`, `spellbook-panel.test.ts`
- **Fix:** `pnpm exec biome check --write --unsafe` on affected files; re-verified tests pass after format
- **Files modified:** 4 files (format-only)
- **Commits:** `7938fb4`, `97413c1`

**3. [Rule 2 - Missing functionality] Temp fixture generator files left untracked**
- **Found during:** Post-commit git status checks
- **Issue:** `gen-inventory-fixtures.ts` and `gen-spellbook-fixtures.ts` were left in the g2-app package root after fixture generation
- **Fix:** Deleted both files before committing
- **Commits:** n/a (deleted before staging)

### Plan Artifact Spec Correction

The plan's `must_haves.artifacts` entry for `inventory.2014.it.txt` and `inventory.2024.it.txt` specified `contains: "INVENTARIO"`. The actual standalone renderer does NOT prepend a panel title row — the title string `INVENTARIO` lives in the panel header breadcrumb (handled by the layout layer), not in the 18-row content body. The standalone content body starts with `EQUIPAGGIAMENTO` (first section header). This is correct per UI-SPEC §5.10 — no deviation to plan intent; the spec text was imprecise.

## Task 4 Audit Gate — PASSED

Confirmed in `packages/foundry-module/src/readers/readers.test.ts`:
- `CHRD-INV-1..5` — 5 inventory reader tests (all green)
- `CHRD-SPL-1..5` — 5 spells reader tests (all green)
- `CharacterSnapshotSchema` requires both `inventory` and `spells` (strict gate)
- Non-casters correctly produce `{ slots: [], spells: [] }`

## Known Stubs

- `onEvent` tap handler in `InventoryPanel` and `SpellbookPanel`: returns immediately (Phase 6 NAV-01 will wire item selection / spell casting)
- `double-tap` handler in both panels: returns immediately (Phase 6 NAV-01 close)
- `long-press` handler in both panels: returns immediately (Phase 6 Quick Action)

These are documented Phase 5 boundary stubs (per plan §must_haves), not unintentional gaps.

## Threat Surface Scan

No new security-relevant surfaces introduced beyond those in the plan's threat model:
- T-05-04-01: InventoryItemSchema z.object strict gate in place (from commit `95f02df`)
- T-05-04-02: SpellEntrySchema level.min(0).max(9) clamp in place (from commit `95f02df`)
- T-05-04-03: scrollOffset windowing limits render to 18 rows regardless of inventory/spell count (accepted DoS risk per plan)

## Self-Check

| Item | Status |
|------|--------|
| inventory-panel.ts created | FOUND |
| spellbook-panel.ts created | FOUND |
| inventory-panel.test.ts (28 tests) | FOUND |
| spellbook-panel.test.ts (33 tests) | FOUND |
| sheet.inventory.2014.it.txt | FOUND |
| sheet.inventory.2024.it.txt | FOUND |
| inventory.2014.it.txt | FOUND |
| inventory.2024.it.txt | FOUND |
| sheet.spells.it.txt | FOUND |
| spellbook.caster.it.txt | FOUND |
| spellbook.half-caster.it.txt | FOUND |
| commit 7938fb4 (InventoryPanel) | FOUND |
| commit 97413c1 (SpellbookPanel) | FOUND |
| pnpm test: 1103/1103 green | PASSED |
| pnpm typecheck: 0 errors | PASSED |
| pnpm lint:ci: 0 errors | PASSED |

## Self-Check: PASSED
