---
phase: 06-r1-integration-quick-action-inv-5
plan: "02"
subsystem: ui
tags: [overlay-stack, panel-router, quick-action-menu, i18n, inv-1, inv-5, tdd, vitest]

# Dependency graph
requires:
  - phase: 06-r1-integration-quick-action-inv-5
    provides: Plan 06-01 LayerManager.getTopLayer + attachR1EventSource + INV-5 gesture determinism foundation

provides:
  - PanelRouter.pushOverlay / popOverlay with overlay suspension stack semantics
  - PanelMetaSchema.navKey relaxed to z.string().max(1) (empty string = system overlay, not user-navigable)
  - QuickActionMenuPanel — 9-item main menu + 7-item language sub-menu, Strategy A (single overlay-block container)
  - 20 new i18n width-budget keys (quick_menu_title, quick_lang_submenu_title, quick_item_*, quick_hint_*, quick_r1_*)
  - 4 INV-1 ASCII fixture snapshots for QuickActionMenuPanel states (IT base, DE base, lang-submenu, combat-suspended)
  - 36 new unit tests (9 PRT-* for overlay stack, 27 QAM-* for QuickActionMenuPanel)

affects:
  - 06-03-PLAN.md (uses QuickActionMenuPanel + pushOverlay in the main R1 routing integration)
  - 06-04-PLAN.md (wire LocaleEventEmitter to actual Foundry locale switch)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Overlay suspension stack: overlayStack.push(current) before bundle([destroy, mount]); overlayStack.pop() on popOverlay"
    - "Single atomic bundle for overlay swap: one bundle([destroy z2, mount z2]) call to avoid flicker"
    - "navKey: '' marks system overlays — silently excluded in discoverPanels() (no console.warn)"
    - "Strategy A overlay panel: single 'overlay-block' text container per OverlayPanel"
    - "INV-5 at QAM: bus.size() === 1 at all steady states (onMount subscribes, onUnmount releases)"
    - "LocaleEventEmitter.emit('changed', code) after persistLocaleOverride() — separate from R1Gesture bus"
    - "Code-point width: [...str].length for Unicode-safe label truncation"

key-files:
  created:
    - packages/g2-app/src/panels/quick-action-menu-panel.ts
    - packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts
    - packages/shared-render/src/fixtures/quick-action.base.it.txt
    - packages/shared-render/src/fixtures/quick-action.base.de.txt
    - packages/shared-render/src/fixtures/quick-action.language-submenu.it.txt
    - packages/shared-render/src/fixtures/quick-action.combat-suspended.it.txt
  modified:
    - packages/g2-app/src/engine/panel-router.ts
    - packages/g2-app/src/engine/__tests__/panel-router.test.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts

key-decisions:
  - "navKey empty string filter is silent (no console.warn) — system overlays are not configuration errors"
  - "Single atomic bundle([destroy z2, mount z2]) for overlay swap — prevents any flicker window between destroy and mount"
  - "overlayStack field declared readonly (array ref is immutable, contents are mutated via push/pop)"
  - "Long-press in language sub-menu returns to main menu (not closes) — preserves progressive disclosure UX"
  - "MENU_WIDTH=70 chosen to match 70-char G2 row budget (INNER_WIDTH=66, LABEL_BUDGET=22)"
  - "MockCallbacks uses vi.fn() as unknown as ... intersection pattern — Vitest 4 rejects vi.fn<[],void>() 2-arg form"

patterns-established:
  - "Overlay suspension stack pattern: router owns overlayStack, pushOverlay/popOverlay manage depth"
  - "Language override flow: persistLocaleOverride(bridge, code) → localeEvents.emit('changed', code) → mode='main'"
  - "INV-1 auto-seed: matchAsciiFixture with toMatchFileSnapshot creates fixture on first run"

requirements-completed: [NAV-02]

# Metrics
duration: 95min
completed: 2026-05-16
---

# Phase 6 Plan 02: QuickActionMenuPanel + PanelRouter Overlay Stack Summary

**PanelRouter overlay suspension stack (pushOverlay/popOverlay) + QuickActionMenuPanel with 9-item main menu and 7-language sub-menu, 4 INV-1 fixtures, 20 i18n budget keys, 36 new tests (1244 total passing)**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-05-16T08:00:00Z
- **Completed:** 2026-05-16T10:10:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `PanelRouter.pushOverlay` and `popOverlay` implement an overlay suspension stack with single-atomic-bundle swap semantics (no flicker window)
- `PanelMetaSchema.navKey` relaxed from `z.string().length(1)` to `z.string().max(1)` enabling empty navKey for system overlays; `discoverPanels()` silently filters these out
- `QuickActionMenuPanel` ships Strategy A (single `overlay-block` text container), 9-item main mode (S/C/L/B/I/A/M/N/X), 7-item language sub-menu (A/I/E/D/S/F/P), scroll/tap/long-press R1 gesture handling per mode
- 4 INV-1 character-perfect ASCII fixtures auto-seeded: IT base, DE locale stress, lang-submenu, combat-suspended (all rows exactly 70 chars)
- 20 new i18n width-budget keys added to `i18n-budgets.ts` (140 → 160 keys), type-checked at build time via `as const satisfies Record<string, WidthBudgetRow>`

## Task Commits

1. **Task 1: PanelMetaSchema navKey relax + PanelRouter pushOverlay/popOverlay** - `1d929db` (feat)
2. **Task 2: QuickActionMenuPanel + 4 INV-1 fixtures + 20 i18n keys** - `6408fd4` (feat)

**Plan metadata:** (this commit — docs)

_Note: Both tasks followed TDD RED→GREEN cycle; tests committed as part of task feat commits_

## Files Created/Modified

- `packages/g2-app/src/engine/panel-router.ts` — navKey schema relaxation, `overlayStack` field, `pushOverlay`, `popOverlay`
- `packages/g2-app/src/engine/__tests__/panel-router.test.ts` — 9 PRT-NK/PUSH/POP/BUS tests, `makeOverlayPanelWithBus` + `makeRealGestureBus` helpers
- `packages/g2-app/src/status-hud/i18n-budgets.ts` — 20 new QAM i18n keys (140 → 160 total)
- `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` — count assertions updated to 160
- `packages/g2-app/src/panels/quick-action-menu-panel.ts` — `QuickActionMenuPanel` class (OverlayPanel), MAIN_ITEMS, SUB_MENU_KEYS, _buildLines, _buildItemRow, _padRow
- `packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts` — 27 QAM-* tests across 10 describe blocks + 4 INV-1 fixture snapshot tests
- `packages/shared-render/src/fixtures/quick-action.base.it.txt` — IT base state fixture (15 rows × 70 chars)
- `packages/shared-render/src/fixtures/quick-action.base.de.txt` — DE locale stress fixture
- `packages/shared-render/src/fixtures/quick-action.language-submenu.it.txt` — lang sub-menu state fixture
- `packages/shared-render/src/fixtures/quick-action.combat-suspended.it.txt` — combat-suspended state fixture

## Decisions Made

- **navKey empty filter is silent** — empty navKey is a design choice (system overlays not user-navigable), not a misconfiguration; `console.warn` would be misleading noise
- **Single atomic bundle** — `pushOverlay` always builds a single `bundle([...ops])` call; the ops array differs based on whether z=2 is occupied (1 op for fresh mount, 2 ops for swap). This eliminates any flicker window (Pitfall 3 from RESEARCH)
- **overlayStack readonly** — `private readonly overlayStack: OverlayPanel[] = []` satisfies TypeScript strict; the array reference is immutable, contents mutate via push/pop
- **Long-press in lang sub-menu → back to main (not close)** — progressive disclosure: user opened language menu from main menu, long-press undoes one level, preserving the "escape to close" semantic for main menu long-press only
- **MockCallbacks type alias** — `vi.fn<[], void>()` is rejected by Vitest 4's type system; `vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void)` via `MockCallbacks` type alias was the correct workaround

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TestablePanelRouter.discoverPanels() was missing the empty navKey filter**
- **Found during:** Task 1 (PRT-NK-02 test run)
- **Issue:** `TestablePanelRouter` in the test file has its own `discoverPanels()` override that duplicated old discovery logic. After the production filter was added, the override still lacked the `if (meta.navKey === '') continue` guard, causing PRT-NK-02 to see `getRegistrySize() === 2` instead of 1.
- **Fix:** Added `if (meta.navKey === '') { continue; }` inside `TestablePanelRouter.discoverPanels()` test override to mirror production code
- **Files modified:** packages/g2-app/src/engine/__tests__/panel-router.test.ts
- **Verification:** PRT-NK-02 passed; `getRegistrySize()` returns 1 correctly
- **Committed in:** `1d929db` (Task 1 commit)

**2. [Rule 1 - Bug] Top border and spacer rows were 68 chars instead of 70**
- **Found during:** Task 2 (first AsciiGrid.fromString on rendered QAM output)
- **Issue:** `AsciiGrid.fromString` threw "row 2 has 70 cells, expected 68" — item rows were 70 chars but top border and spacer rows were only 68. Root cause: top border used `INNER_WIDTH` (66) to compute dashes instead of `MENU_WIDTH - 2` (68).
- **Fix:** `const topInnerLen = MENU_WIDTH - 2;` and `const topDashes = '─'.repeat(topInnerLen - 1 - titleBracket.length);`. Spacer: `│${' '.repeat(MENU_WIDTH - 2)}│`.
- **Files modified:** packages/g2-app/src/panels/quick-action-menu-panel.ts
- **Verification:** All 4 INV-1 fixture files seeded with rows consistently 70 chars; `matchAsciiFixture` passes
- **Committed in:** `6408fd4` (Task 2 commit)

**3. [Rule 2 - Biome lint] useImportType + organizeImports + noSwitchDeclarations**
- **Found during:** Task 2 (pre-commit lint:ci check)
- **Issue:** 9 Biome lint errors across 6 files — type-only imports lacking `import type`, import ordering, `const` declaration inside `switch` case without block
- **Fix:** `pnpm format` auto-fixed all 9 errors across the 6 affected files
- **Files modified:** packages/g2-app/src/panels/quick-action-menu-panel.ts + 5 others
- **Verification:** `pnpm lint:ci` exits 0 after format
- **Committed in:** `6408fd4` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing lint compliance)
**Impact on plan:** All auto-fixes were necessary for correctness and code quality. No scope creep.

## Issues Encountered

- **Vitest 4 `vi.fn<[], void>()` type error** — Vitest 4 rejects the 2-type-argument form of `vi.fn`. Resolved by using `vi.fn() as unknown as MockCallbacks` intersection pattern. Not a deviation (implementation choice within the plan's test infrastructure).
- **`QuickActionMenuCallbacks` unused import** — After refactoring to `MockCallbacks`, the imported type became unused. Removed via Biome autofix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PanelRouter.pushOverlay` and `popOverlay` are fully wired and tested — Plan 06-03 can integrate the main R1 routing with `attachR1EventSource` + `pushOverlay(quickActionMenu, layerManager)`
- `QuickActionMenuPanel` exposes `callbacks.onOpenPanel(panelId)` and `callbacks.onClose()` — the router will wire these to `navigateTo` / `destroyOverlay` in Plan 06-03
- All 4 INV-1 fixtures are committed to `shared-render/src/fixtures/` — INV-1 snapshot CI gate is active for all future QAM states
- 1244 tests passing, typecheck + lint:ci clean

---
*Phase: 06-r1-integration-quick-action-inv-5*
*Completed: 2026-05-16*

## Self-Check: PASSED

- packages/g2-app/src/panels/quick-action-menu-panel.ts FOUND
- packages/g2-app/src/engine/panel-router.ts contains `pushOverlay` + `popOverlay` (9 occurrences)
- packages/shared-render/src/fixtures/quick-action.base.it.txt FOUND
- packages/shared-render/src/fixtures/quick-action.base.de.txt FOUND
- packages/shared-render/src/fixtures/quick-action.combat-suspended.it.txt FOUND
- packages/shared-render/src/fixtures/quick-action.language-submenu.it.txt FOUND
- 20 new i18n keys (quick_* patterns: 25 occurrences including 5 base keys from earlier plans) confirmed in i18n-budgets.ts — typecheck exits 0
- Task commits in git log: `1d929db` feat(06-02) Task 1, `6408fd4` feat(06-02) Task 2 FOUND
- 1244 tests passing (78 test files)
