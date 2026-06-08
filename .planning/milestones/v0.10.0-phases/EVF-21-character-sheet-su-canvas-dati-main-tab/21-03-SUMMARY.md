---
phase: 21-character-sheet-su-canvas-dati-main-tab
plan: 03
subsystem: ui
tags: [canvas, character-sheet, dual-interface, CanvasLayer, OverlayPanel, paint-tab, dirty-gate]

# Dependency graph
requires:
  - phase: 21
    plan: 01
    provides: CharacterSnapshot.class + .initiative + .speed schema fields + readers
  - phase: 21
    plan: 02
    provides: dither-utils.ts (not directly used but enables Plan 21-04 portrait pipeline)
  - phase: 20
    provides: CanvasCompositor + CanvasStatusHudLayer as CanvasLayer pattern reference
provides:
  - CanvasCharacterSheetPanel dual-interface class (CanvasLayer + OverlayPanel)
  - 6 additive paint*Tab(ctx,...) canvas renderers alongside PRESERVED render*Tab string renderers
  - renderMode-gated boot dispatch (canvas → 'canvas-character-sheet', glyph → 'character-sheet')
affects: [21-04-portrait-pipeline, future-canvas-panels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-interface canvas panel: implements CanvasLayer AND OverlayPanel in a single class"
    - "Dirty-gate: _dirty=false as LAST line of paint(); never double-guarded inside paint()"
    - "Chrome pre-bake: OffscreenCanvas scratch + createImageBitmap; null-fallback for happy-dom"
    - "Additive paint*Tab: canvas renderers live alongside preserved render*Tab string renderers"
    - "renderMode-gated dispatch: onNavigate intercept in boot-engine-core gates panel id at dispatch time"

key-files:
  created:
    - packages/g2-app/src/panels/canvas-character-sheet-panel.ts
    - packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts
  modified:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts
    - packages/g2-app/src/internal/boot-engine-core.ts

key-decisions:
  - "panel-gesture-bus.ts NOT modified (SC2 gesture-identity locked decision)"
  - "id: 'canvas-character-sheet' (distinct from glyph 'character-sheet') — Pitfall 2 from RESEARCH.md"
  - "getContainerCount() returns {image:0,text:0} literal — ADR-0013 Amendment 1"
  - "Boot dispatch: onNavigate target='character-sheet' redirected to 'canvas-character-sheet' when getRenderMode()==='canvas'; glyph stays unchanged"
  - "_locale stored as instance field (not private readonly constructor shorthand) to satisfy TS6133 while preserving Plan 21-04 locale-forwarding path"
  - "void this._locale read in _paintActiveTab to satisfy strict TypeScript until Plan 21-04 wires locale to paint*Tab renderers"

requirements-completed: [RSHEET-01, RSHEET-02]

# Metrics
duration: 35min
completed: 2026-06-07
---

# Phase 21 Plan 03: CanvasCharacterSheetPanel Summary

**CanvasCharacterSheetPanel dual-interface class (CanvasLayer + OverlayPanel) with 6 additive paint*Tab canvas renderers and renderMode-gated boot dispatch — real initiative/speed from snapshot, no em-dash placeholders.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-06-07T19:35:00Z
- **Completed:** 2026-06-07T21:42:00Z
- **Tasks:** 3 (TDD Task 1 RED + Task 1 GREEN + Task 2 GREEN + Task 3 auto)
- **Files modified:** 4

## Accomplishments

### Task 1: Additive paint*Tab canvas renderers

- Added 6 `paint*Tab(ctx, snapshot, bounds, font)` functions to `character-sheet-tab-renderers.ts` — purely additive, all existing `render*Tab` string renderers preserved intact (RCSP-PAINT-ADDITIVE)
- `paintMainTab`: draws `class Lv N` + HP bar (`█░` ratio) + vitals row `CA N  INI +N  VEL N` with real `formatAbilityMod(snapshot.initiative)` (signed +3/-1/+0) and `String(snapshot.speed)` — NO `—` placeholder
- `paintSkillsTab/InventoryTab/SpellsTab/FeatsTab/BioTab`: delegate to existing string renderers via `renderTabContent`/`renderSkillsTab`/etc.
- `PaintBounds` interface exported; `CANVAS_FG` + `CANVAS_LINE_H` constants

### Task 2: CanvasCharacterSheetPanel class

- New `canvas-character-sheet-panel.ts` — default export `CanvasCharacterSheetPanel implements CanvasLayer, OverlayPanel`
- `static meta.id = 'canvas-character-sheet'` (distinct from glyph panel, auto-discovered by PanelRouter `*-panel.ts` glob)
- CanvasLayer contract: `attachCanvas` (null-ctx guard + `_initAsync`), `paint` (chrome blit + tab dispatch + `_dirty=false` LAST), `isDirty()`, `getContainerCount()={image:0,text:0}`, `getCaptureContainer()='hud-capture'`, `draw()=Promise.resolve()`, `destroy()`
- OverlayPanel contract: `onMount` (gestureBus subscribe + `_restoreLastTab`), `onUnmount` (idempotent unsubscribe + portrait slot clear), `onEvent` (tap/scroll→tab cycle, double-tap→no-op per ADR-0012)
- Chrome pre-bake: `_prebakeChrome` creates scratch OffscreenCanvas, draws frame+tabstrip, stores `ImageBitmap`; falls back to inline `_drawChrome` in happy-dom
- Threat mitigations: T-21-01 (safeParse gate in `onSnapshot`) + T-21-LEAK (null guard unsubscribe in `onUnmount`)

### Task 3: renderMode-gated boot dispatch

- `onNavigate` in `boot-engine-core.ts`: when `target === 'character-sheet'` and `layerManager.getRenderMode() === 'canvas'`, resolves to `'canvas-character-sheet'`; glyph mode untouched
- `setPanelInstanceHandler('canvas-character-sheet', ...)` for mapBase injection (Plan 21-04 portrait prep)
- `CanvasCharacterSheetPanel` auto-discovered by `discoverPanels()` via `../panels/**/*-panel.ts` glob — no explicit import needed

## Task Commits

1. **Task 1 RED — failing tests** - `7efc7a1` (test)
2. **Task 1 GREEN — paint*Tab renderers** - `888a31e` (feat)
3. **Task 2 GREEN — CanvasCharacterSheetPanel** - `7274108` (feat)
4. **Task 3 — renderMode-gated boot dispatch** - `96cfcb4` (feat)

## Files Created/Modified

- `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — RCSP-PAINTMAIN/ADDITIVE/SC1..SC4/GEST/GEST-BUS/BOOT tests (18 tests)
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — Added 6 `paint*Tab` functions + `PaintBounds` interface (+258 lines)
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — New 600-line dual-interface panel class
- `packages/g2-app/src/internal/boot-engine-core.ts` — renderMode gate in `onNavigate` + `setPanelInstanceHandler('canvas-character-sheet')` (+23 lines)

## Decisions Made

- `panel-gesture-bus.ts` NOT modified — SC2 gesture-identity locked decision preserved
- `id: 'canvas-character-sheet'` distinct from `'character-sheet'` — Pitfall 2 from 21-RESEARCH.md (dispatch-time gate, not sort order)
- `getContainerCount()` returns `{image: 0, text: 0}` — ADR-0013 Amendment 1 (canvas layers don't declare containers)
- `_locale` stored via constructor assignment (not `private readonly` shorthand) — avoids TypeScript TS6133 on `private readonly` fields declared but never read; `void this._locale` in `_paintActiveTab` satisfies the read constraint until Plan 21-04 wires locale-aware rendering
- `discoverPanels()` glob `../panels/**/*-panel.ts` auto-discovers `canvas-character-sheet-panel.ts` — no explicit import needed in `boot-engine-core.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `beforeEach` imported but not used in test file**
- **Found during:** typecheck after Task 2 GREEN
- **Issue:** `import { beforeEach, describe, expect, it, vi }` — TypeScript TS6133 error for `beforeEach`
- **Fix:** Removed `beforeEach` from import
- **Files modified:** `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts`
- **Verification:** `pnpm typecheck` exit 0

**2. [Rule 1 - Bug] `_locale` declared as `private readonly` in constructor shorthand but never read**
- **Found during:** typecheck after writing CanvasCharacterSheetPanel
- **Issue:** TypeScript strict TS6133 — `_locale` declared in `private readonly` constructor shorthand is never read in class body
- **Fix:** Extracted `_locale` as a separate private field with explicit constructor assignment `this._locale = locale`; added `void this._locale` in `_paintActiveTab` as read-placeholder until Plan 21-04 wires locale forwarding
- **Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
- **Verification:** `pnpm typecheck` exit 0

**3. [Rule 1 - Bug] Biome unsorted imports**
- **Found during:** `pnpm lint:ci` after writing CanvasCharacterSheetPanel
- **Issue:** Biome `organizeImports` violation — import block at line 50 not sorted
- **Fix:** Applied `biome check --write` to auto-sort imports
- **Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
- **Verification:** `pnpm lint:ci` — no errors for canvas-character-sheet files

---

**Total deviations:** 3 auto-fixed (Rule 1 — TypeScript strict + lint)
**Impact on plan:** Corrected 2 TypeScript strict errors and 1 biome lint violation. No scope change.

## TDD Gate Compliance

| Gate | Commit | Verified |
|------|--------|---------|
| RED (test) | `7efc7a1` | Tests fail before source files exist |
| GREEN (feat paint*Tab) | `888a31e` | All RCSP-PAINTMAIN/ADDITIVE pass |
| GREEN (feat panel) | `7274108` | All RCSP-SC/GEST/GEST-BUS pass |

## Issues Encountered

None beyond the 3 auto-fixed deviations above.

## User Setup Required

None — pure internal canvas panel implementation, no external service configuration required.

## Next Phase Readiness

- `CanvasCharacterSheetPanel` ready for Plan 21-04 portrait pipeline injection (`setMapBaseLayer` + slot 3 `setPortraitOverride`)
- `paintMainTab` has real initiative/speed data (no `—` placeholders)
- `_locale` field in place, `void this._locale` placeholder ready to be replaced with locale forwarding in Plan 21-04
- Boot dispatch wired: canvas mode opens `canvas-character-sheet`, glyph mode opens `character-sheet`

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. `CharacterSnapshotSchema.safeParse` gate in `onSnapshot` is the threat boundary for T-21-01. No trust boundaries widened vs plan spec.

## Known Stubs

- `paintSkillsTab/InventoryTab/SpellsTab/FeatsTab/BioTab` delegate to string renderers with `locale = 'en'` hardcoded — locale-aware wiring is Plan 21-04 scope. NOT a blocker for this plan's goal (tab content renders; locale switching is stretch).
- Portrait slot: `mapBaseLayer?.setPortraitOverride(3, null)` on unmount fires but portrait fetch (`setPortraitOverride(3, data)`) is Plan 21-04. Slot 3 intentionally stays blank in this plan.

## Self-Check

- [x] `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — created
- [x] `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — created
- [x] `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — modified (paint*Tab added)
- [x] `packages/g2-app/src/internal/boot-engine-core.ts` — modified (renderMode gate + setPanelInstanceHandler)
- [x] Commits `7efc7a1`, `888a31e`, `7274108`, `96cfcb4` exist in git log
- [x] All 1543 g2-app tests pass (`pnpm --filter @evf/g2-app test -- --run`)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm lint:ci` — no errors in canvas-character-sheet files
- [x] `panel-gesture-bus.ts` UNCHANGED (SC2 locked decision)

---
*Phase: 21-character-sheet-su-canvas-dati-main-tab*
*Completed: 2026-06-07*
