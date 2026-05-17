---
phase: 06
fixed_at: 2026-05-16T11:31:00Z
review_path: .planning/phases/06-r1-integration-quick-action-inv-5/06-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-05-16T11:31:00Z
**Source review:** `.planning/phases/06-r1-integration-quick-action-inv-5/06-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical + 4 Warning; Info excluded per default scope)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: navigate action calls onNavigate then onClose concurrently — destination panel destroyed immediately

**Files modified:** `packages/g2-app/src/panels/quick-action-menu-panel.ts`, `packages/g2-app/src/engine/panel-router.ts`, `packages/g2-app/src/internal/boot-engine-core.ts`, `packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts`
**Commit:** `00c681e`
**Applied fix:**

1. `quick-action-menu-panel.ts` — Removed `this.callbacks.onClose()` from the `'navigate'` case in `_activateCurrentItem`. Only `this.callbacks.onNavigate(item.target)` is called. Added JSDoc contract clarification in `QuickActionMenuCallbacks.onNavigate`.

2. `panel-router.ts` — Added `clearOverlayStack()` public method that drains `overlayStack` without restoring any suspended panel. This is needed because `openPanel` destroys the menu via `_closeActiveInternal` but does not touch `overlayStack`. Without clearing it, a future `popOverlay` would erroneously restore the pre-menu panel on top of the navigated target.

3. `boot-engine-core.ts` — Updated `onNavigate` callback to call `panelRouter.clearOverlayStack()` before `panelRouter.openPanel(...)`. Added detailed comment explaining the CR-01 race condition and why this ordering is correct.

4. `quick-action-menu-panel.test.ts` — Updated QAM-12a..e test assertions from `onClose called` to `onClose NOT called`. Added 6 regression tests in the new `QAM-NAV` suite that lock the fix: each navigation item asserts exactly one `onNavigate` call with the correct panelId, and zero `onClose` calls.

**Verification approach:** After `openPanel` starts, it calls `_closeActiveInternal` (which destroys the menu at z=2 and mounts the target). Since `clearOverlayStack()` was already called synchronously before the async `openPanel`, the overlay stack is empty when `openPanel` returns. No subsequent `popOverlay` can erroneously restore a stale panel. The race is eliminated by ensuring only one async chain begins (openPanel), not two concurrent chains (openPanel + popOverlay).

---

### WR-01: Language-mode context chip overflows 38 code-point renderer budget for IT and DE

**Files modified:** `packages/g2-app/src/status-hud/i18n-budgets.ts`, `packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts`
**Commit:** `593a863`
**Applied fix:**

- `quick_r1_lang_long` IT: `'indietro'` (8 chars) → `'dietro'` (6 chars)
- `quick_r1_lang_tap` DE: `'anwenden'` (8 chars) → `'wählen'` (6 chars)

Post-fix assembled chip widths (format: `tap={T} scroll={S} long={L}`):
- IT: `tap=applica scroll=lingua long=dietro` = 37 chars ≤ 38 ✓
- EN: `tap=apply scroll=language long=back` = 31 chars ≤ 38 ✓
- DE: `tap=wählen scroll=Sprache long=zurück` = 37 chars ≤ 38 ✓

QAM-14 test updated: `longPressLabel` expectation `'indietro'` → `'dietro'`.

---

### WR-02: `as never` type-safety escape hatch in long-press dispatcher

**Files modified:** `packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts`
**Commit:** `61b21d8`
**Applied fix:**

Widened `layerManager` parameter type in `attachQuickActionLongPress` from `Pick<LayerManager, 'getTopLayer'>` to full `LayerManager`. Removed both `as never` casts from `void panelRouter.pushOverlay(menu as never, layerManager as never)` — the call site now type-checks cleanly as `void panelRouter.pushOverlay(menu, layerManager)`.

`boot-engine-core.ts` already passes the full `LayerManager` singleton, satisfying the widened constraint. The test mocks still use `as never` to satisfy the mock shape — these are test-only casts that remain safe because both `pushOverlay` and `getTopLayer` are mocked.

---

### WR-03: `makeMenu` factory captures boot-time locale — stale after locale change

**Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts`, `packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts`
**Commit:** `a8ba723`
**Applied fix:**

In step 11c of `_bootEngineCore`:

1. Replaced the fixed `const currentLocaleOverride` with two mutable refs:
   - `let currentMenuLocale: BootEngineLocale` (initialized from `effectiveLocale`)
   - `let currentMenuOverride: LocaleOverride` (initialized from `localeOverride`)

2. Added `const unsubMenuLocale = localeEvents.on('changed', (code) => { ... })` that updates both refs on every locale change event. When `code === 'auto'`, `currentMenuLocale` falls back to `opts.locale` (the boot-detected locale); for specific locale codes, it is set directly.

3. `makeMenu` now reads `currentMenuLocale` and `currentMenuOverride` at call time (not at closure-capture time), so every `pushOverlay` produces a menu with the live locale.

4. `unsubMenuLocale()` is called in `teardown()` with a try/catch guard, matching the pattern used for other subscriptions.

BERW-03 test updated: `size() === 0` → `size() === 1` (the WR-03 listener is the one permanent boot-time subscriber). An additional assertion verifies `size() === 0` after `teardown()`.

---

### WR-04: `hud_r1_lang_submenu` is dead code in `HUD_WIDTH_BUDGETS` with inconsistent `max`

**Files modified:** `packages/g2-app/src/status-hud/i18n-budgets.ts`, `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
**Commit:** `a291d25`
**Applied fix:**

Deleted the `hud_r1_lang_submenu` entry from `HUD_WIDTH_BUDGETS` entirely (INV-4 zero dead code). A comment block replaces it explaining why the entry was removed and how the language sub-menu chip is actually assembled.

Key count: 172 → 171. Updated three locations in `i18n-budgets.test.ts`:
- IB-ALL-1 test name and `toBe(172)` → `toBe(171)`
- IB-P5-COUNT test name and `toBe(172)` → `toBe(171)`
- Comment in IB-ALL-1 that listed `hud_r1_lang_submenu` as a Plan 03 key

---

## Skipped Issues

None — all in-scope findings were fixed.

---

## Gate Results

| Check | Result |
|-------|--------|
| `pnpm typecheck` | Pass (clean) |
| `pnpm lint:ci` | 1 pre-existing error in `packages/validation-harness/scripts/10-0-1-r1-timing.ts` (not introduced by these fixes; present on base branch before any changes) |
| `pnpm test` | 1315 passed / 0 failed (82 test files) |
| Test count delta | 1309 → 1315 (+6 QAM-NAV regression tests for CR-01) |

---

_Fixed: 2026-05-16T11:31:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
