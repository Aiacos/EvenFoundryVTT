---
phase: 06
slug: r1-integration-quick-action-inv-5
status: fixed
critical_count: 0
warning_count: 0
info_count: 2
reviewed_at: 2026-05-16
fixed_at: 2026-05-16
files_reviewed: 14
files_reviewed_list:
  - packages/g2-app/src/engine/r1-event-source.ts
  - packages/g2-app/src/engine/r1-timings.ts
  - packages/g2-app/src/locale/locale-events.ts
  - packages/g2-app/src/panels/quick-action-menu-panel.ts
  - packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts
  - packages/shared-protocol/src/payloads/r1.ts
  - docs/architecture/INVARIANTS.md
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/engine/layer-types.ts
  - packages/g2-app/src/engine/panel-router.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 6 delivers R1 gesture routing (INV-5), the Quick Action overlay menu, locale-change
pub/sub, the context chip, and `getR1Hints()` on all five Phase 5 panels. The core
architecture is sound: the double trust boundary in `r1-event-source.ts`, the explicit
descending-z sort in `getTopLayer()`, the atomic bundle pattern in `pushOverlay`/`popOverlay`,
and the LocaleEventEmitter separation are all correctly implemented.

One critical bug is present: the `'navigate'` branch in `QuickActionMenuPanel._activateCurrentItem`
calls both `onNavigate` (which opens a new panel, closing the menu) **and** `onClose` (which
pops the overlay stack, destroying the newly opened panel). This makes all Quick Action
navigation non-functional — the destination panel is destroyed immediately after it mounts.

Four warnings cover: the IT/DE language-mode context chip overflowing the 38 code-point
renderer budget; an `as never` type-safety escape hatch in the long-press dispatcher; stale
locale capture in the `makeMenu` factory; and a dead budget-table entry with an inconsistent
`max` value.

---

## Critical Issues

### CR-01: `navigate` action calls `onNavigate` then `onClose` concurrently — destination panel destroyed immediately

**File:** `packages/g2-app/src/panels/quick-action-menu-panel.ts:350-353`

**Issue:** In `_activateCurrentItem`, the `'navigate'` case calls both callbacks
fire-and-forget with `void`:

```ts
case 'navigate':
  this.callbacks.onNavigate(item.target);  // starts panelRouter.openPanel (async)
  this.callbacks.onClose();                // starts panelRouter.popOverlay (async)
  break;
```

`onNavigate` is wired as:
```ts
onNavigate: (target) => { void panelRouter.openPanel(target, deps); }
```
`openPanel` calls `_closeActiveInternal` (which destroys the menu at z=2 via a `bundle`)
and then mounts the target panel. `onClose` is wired as:
```ts
onClose: () => { void panelRouter.popOverlay(layerManager); }
```
`popOverlay` pops from `overlayStack` and destroys whatever is at z=2.

Because both are started synchronously in the same call frame (no `await` between them),
both async chains begin concurrently. Since `openPanel` was started first, its microtask
chain runs first: it destroys the menu and mounts the target panel. Then `popOverlay` runs,
sees the target panel at z=2, and either:
- Restores a suspended primary panel from `overlayStack` (replacing the target), or
- Destroys the target panel outright (when `overlayStack` is empty).

In both cases the navigated panel is destroyed within the same event-loop turn. All five
Quick Action navigation entries (`[S]`, `[C]`, `[L]`, `[B]`, `[I]`) are non-functional.

**Fix:** Remove `this.callbacks.onClose()` from the `'navigate'` case. `openPanel` already
closes the menu by calling `_closeActiveInternal`. The `overlayStack` accumulation from a
prior `pushOverlay` must also be cleared when `openPanel` takes over. The simplest correct
implementation:

```ts
case 'navigate':
  // openPanel closes the current z=2 (the menu) and mounts the target.
  // Do NOT call onClose: that would pop the overlay stack and destroy the target.
  this.callbacks.onNavigate(item.target);
  // overlayStack contains the panel that was suspended when the menu was pushed.
  // openPanel does not clear it. Add a clearOverlayStack callback, or have
  // onNavigate handle stack clearing, or wire popOverlay with a 'skipRestore' flag.
  break;
```

A minimal fix that does not require a new callback is to change `onNavigate` in
`boot-engine-core.ts` to clear the overlay stack before calling `openPanel`:

```ts
onNavigate: (target) => {
  // Pop the overlay stack before navigating so popOverlay won't be called
  // implicitly later. openPanel closes the current z=2 panel itself.
  panelRouter.clearOverlayStack();          // new method needed on PanelRouter
  void panelRouter.openPanel(target, deps);
},
```

Alternatively, rename the callbacks to clarify their contract and restructure
`_activateCurrentItem` so `onClose` is never called after `onNavigate`.

---

## Warnings

### WR-01: Language-mode context chip overflows 38 code-point renderer budget for IT and DE

**File:** `packages/g2-app/src/panels/quick-action-menu-panel.ts:292-304` and
`packages/g2-app/src/status-hud/status-hud-renderer.ts:628`

**Issue:** `QuickActionMenuPanel.getR1Hints()` returns (for the `'language'` mode):
- `tap`: `getLabel('quick_r1_lang_tap', locale)` — IT `'applica'`
- `scroll`: `getLabel('quick_r1_lang_scroll', locale)` — IT `'lingua'`
- `longPressLabel`: `getLabel('quick_r1_lang_long', locale)` — IT `'indietro'`

`renderContextChip` in `status-hud-renderer.ts` assembles:
```
chipContent = `tap=${hints.tap} scroll=${hints.scroll} long=${hints.longPressLabel}`
```

For IT: `"tap=applica scroll=lingua long=indietro"` = **39 code-points**.
For DE: `"tap=anwenden scroll=Sprache long=zurück"` = **39 code-points**.

The renderer clips at 38 code-points (line 628):
```ts
const truncated = cps.length > 38 ? `${cps.slice(0, 37).join('')}…` : chipContent;
```

Result displayed on the HUD: `tap=applica scroll=lingua long=indiet…` (IT) and
`tap=anwenden scroll=Sprache long=zurü…` (DE). The long-press label is visibly truncated in
2 of 3 canonical locales — an INV-1-adjacent display defect.

**Fix:** Shorten the `quick_r1_lang_long` values so the assembled chip stays ≤ 38 code-points:

```ts
// i18n-budgets.ts
quick_r1_lang_long: { it: 'indietro', en: 'back', de: 'zurück', max: 8 },
//                           ↑ 8 chars                ↑ 6 chars
// 'tap=applica scroll=lingua long=indietro' = 39  →  too long
// Fix: shorten 'scroll=lingua' or 'long=indietro':
quick_r1_lang_scroll: { it: 'lingua', en: 'lang', de: 'Sprache', max: 7 },
// IT: 'tap=applica scroll=lingua long=ind.' = 37 ✓  (use 'ind.')
// Or accept truncation and shorten the longest token.
```

The simplest fix with no UX regression is to change IT `long` from `'indietro'` to `'ind.'`
(5 chars, keeping it recognisable): assembled chip becomes 35 code-points. Or shorten DE
`tap` from `'anwenden'` to `'wählen'` (6 chars): assembled chip becomes 37 code-points.

---

### WR-02: `as never` type-safety escape hatch in long-press dispatcher

**File:** `packages/g2-app/src/panels/quick-action-long-press-dispatcher.ts:108`

**Issue:**
```ts
void panelRouter.pushOverlay(menu as never, layerManager as never);
```

`attachQuickActionLongPress` declares its `layerManager` parameter as
`Pick<LayerManager, 'getTopLayer'>`, but `PanelRouter.pushOverlay` requires the full
`LayerManager`. The `as never` double-cast silences the TypeScript error rather than
fixing the type mismatch. If `pushOverlay`'s signature changes in a future phase (e.g.,
new LayerManager methods added as prerequisites), the cast will mask the incompatibility
silently.

**Fix:** Accept the full `LayerManager` (or a structurally compatible interface that
satisfies both `getTopLayer()` and what `pushOverlay` needs) as the dispatcher's
parameter:

```ts
// Option A: widen dispatcher parameter to full LayerManager
export function attachQuickActionLongPress(
  gestureBus: PanelGestureBus,
  panelRouter: Pick<PanelRouter, 'pushOverlay'>,
  layerManager: LayerManager,   // not narrowed to Pick
  makeMenu: () => OverlayPanel,
): () => void {
  // ...
  void panelRouter.pushOverlay(menu, layerManager);  // no cast needed
}
```

Option B: define a `LayerManagerForDispatcher` interface that includes both
`getTopLayer()` and whatever `pushOverlay` structurally needs, and make `LayerManager`
satisfy it explicitly.

---

### WR-03: `makeMenu` factory captures boot-time `effectiveLocale` and `currentLocaleOverride` — stale after locale change

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:383-416`

**Issue:** The `makeMenu` closure captures `effectiveLocale` (the boot-time locale) and
`currentLocaleOverride` (the boot-time persisted override) by reference at step 11c:

```ts
const localeOverride = await loadLocaleOverride(bridge);   // boot-time read
const effectiveLocale: BootEngineLocale = ...;             // fixed at boot
const currentLocaleOverride: LocaleOverride = ...;         // fixed at boot

const makeMenu = (): QuickActionMenuPanel => {
  return new QuickActionMenuPanel(
    bridge,
    gestureBus,
    effectiveLocale,         // always boot locale
    currentLocaleOverride,   // always boot override
    ...
  );
};
```

After the user selects a new locale via `[N] Language`, subsequent long-press events
create a new `QuickActionMenuPanel` that still shows labels in the **boot locale** and
pre-selects the **boot-time locale** in the language sub-menu. The locale change is
persisted to Even Hub kv (via `persistLocaleOverride`) and emitted on `localeEvents`, but
the `makeMenu` factory never reads the current value.

**Fix:** The factory must read the current effective locale at call time, not at closure
capture time. The simplest approach: maintain a mutable ref that `localeEvents.on('changed')`
updates:

```ts
// In boot-engine-core.ts step 11c:
let currentEffectiveLocale: BootEngineLocale = effectiveLocale;
let currentOverride: LocaleOverride = localeOverride === 'auto' ? 'auto' : localeOverride;

localeEvents.on('changed', (code) => {
  currentEffectiveLocale = code === 'auto' ? opts.locale : code;
  currentOverride = code;
});

const makeMenu = (): QuickActionMenuPanel => {
  return new QuickActionMenuPanel(
    bridge,
    gestureBus,
    currentEffectiveLocale,   // live value
    currentOverride,           // live value
    localeEvents,
    callbacks,
  );
};
```

Note: the `localeEvents.on` call here would itself need cleanup in `teardown()`.

---

### WR-04: `hud_r1_lang_submenu` is dead code in `HUD_WIDTH_BUDGETS` with an inconsistent `max`

**File:** `packages/g2-app/src/status-hud/i18n-budgets.ts:821-826`

**Issue:** The budget table entry:
```ts
hud_r1_lang_submenu: {
  it: 'scroll=lingua tap=applica long=indietro',   // 39 chars
  en: 'scroll=language tap=apply long=back',        // 35 chars
  de: 'scroll=Sprache tap=anwenden long=zurück',    // 39 chars
  max: 39,
},
```

is never referenced in any production source file. A `grep -rn 'hud_r1_lang_submenu'`
over the entire `packages/` tree finds only the definition itself (in `i18n-budgets.ts`)
and a test-file comment. The entry was likely intended as documentation of the assembled
chip string, but because `QuickActionMenuPanel.getR1Hints()` assembles the chip from
separate `quick_r1_lang_*` keys, this composite entry is never consumed.

Additionally, `max: 39` exceeds the 38 code-point renderer budget enforced by
`renderContextChip` (line 628 of `status-hud-renderer.ts`). If this entry were ever
consumed, `assertWithinBudget` would not warn (39 ≤ 39) but the renderer would still
truncate (39 > 38). The budget is inconsistent with the actual enforcement boundary.

**Fix:** Either remove the dead entry entirely, or convert it to a comment explaining
the assembled chip format. If retained, correct `max` to `38` to match the renderer:

```ts
// Remove hud_r1_lang_submenu from HUD_WIDTH_BUDGETS — it is dead code.
// The language sub-menu chip is assembled dynamically from:
//   quick_r1_lang_tap + quick_r1_lang_scroll + quick_r1_lang_long
// and rendered by renderContextChip with a 38-codepoint cap.
```

---

## Info

### IN-01: `assertWithinBudget` uses `.length` (UTF-16 code units) while renderers use `[...value].length` (code-points)

**File:** `packages/g2-app/src/status-hud/i18n-budgets.ts:940`

**Issue:**
```ts
if (value.length > budget) {  // UTF-16 code units
```

All rendering code that counts characters for column width uses `[...value]` (spread
iterates by code-point). For BMP characters (which all current HUD strings use) these are
identical. For any future string containing astral-plane characters (emoji, some CJK
extensions), `String.length` would over-count relative to the visual width that `[...]`
correctly measures, causing `assertWithinBudget` to silently under-warn while the renderer
truncates more aggressively than the budget implies.

**Fix:** Change the guard to use code-point counting for consistency:
```ts
export function assertWithinBudget(value: string, field: HudBudgetField): void {
  const budget = HUD_WIDTH_BUDGETS[field].max;
  if ([...value].length > budget) {   // code-points, not UTF-16 units
    console.warn(`[EVF] i18n-budgets: '${field}' exceeded budget ${budget}: "${value}"`);
  }
}
```

---

### IN-02: Hardcoded `activeIndex = 7` for `[N] Language` row is fragile

**File:** `packages/g2-app/src/panels/quick-action-menu-panel.ts:239` and `line 340`

**Issue:** Two locations hard-code `this.activeIndex = 7` to navigate back to the `[N]
Language` row in `MAIN_ITEMS`. If `MAIN_ITEMS` is ever reordered (e.g., a future phase
inserts a new item before `[N]`), these sites will silently point to the wrong row.

```ts
// onEvent long-press in language mode:
this.activeIndex = 7; // [N] Language row

// _activateCurrentItem after locale selection:
this.activeIndex = 7;
```

**Fix:** Compute the index at runtime using `MAIN_ITEMS.findIndex`:
```ts
const LANGUAGE_ITEM_INDEX = MAIN_ITEMS.findIndex((item) => item.key === 'N');
// assert LANGUAGE_ITEM_INDEX >= 0 at module load (defensive)

// Replace hardcoded 7 with:
this.activeIndex = LANGUAGE_ITEM_INDEX;
```

---

_Reviewed: 2026-05-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Fixes Applied

All critical and warning findings fixed. 2026-05-16. Fixer: Claude (gsd-code-fixer).

| Finding | Status | Commit | Notes |
|---------|--------|--------|-------|
| CR-01 | fixed | `00c681e` | Removed `onClose()` from `'navigate'` branch; added `PanelRouter.clearOverlayStack()`; wired in `boot-engine-core.ts`; updated QAM-12a..e tests; added 6 QAM-NAV regression tests |
| WR-01 | fixed | `593a863` | `quick_r1_lang_long` IT: `indietro`→`dietro`; `quick_r1_lang_tap` DE: `anwenden`→`wählen`; chips now 37 chars ≤ 38 budget; updated QAM-14 |
| WR-02 | fixed | `61b21d8` | Widened `attachQuickActionLongPress` `layerManager` param from `Pick<LayerManager,'getTopLayer'>` to full `LayerManager`; removed `as never` double-cast |
| WR-03 | fixed | `a8ba723` | Added `currentMenuLocale`/`currentMenuOverride` mutable refs + `localeEvents.on('changed',...)` listener in step 11c; `makeMenu` reads live refs; listener torn down in `teardown()`; BERW-03 updated (size 0→1) |
| WR-04 | fixed | `a291d25` | Deleted dead `hud_r1_lang_submenu` from `HUD_WIDTH_BUDGETS`; key count 172→171; IB-ALL-1 + IB-P5-COUNT tests updated |

**Test gate:** 1309 → 1315 tests (+6 QAM-NAV regression). `pnpm typecheck && pnpm test` both clean.

## REVIEW COMPLETE

**1 critical issue** (CR-01): Quick Action navigation is fully broken — the `'navigate'` case calls both `onNavigate` (mounts destination) and `onClose` (destroys destination) concurrently, so every `[S/C/L/B/I]` selection results in the target panel being immediately destroyed.

**4 warnings**: language-mode chip truncation in IT/DE (INV-1 adjacent); `as never` type escape hatch in the long-press dispatcher; stale locale capture in `makeMenu` factory; dead `hud_r1_lang_submenu` budget entry with inconsistent `max`.

**2 info items**: `assertWithinBudget` uses `.length` instead of code-point counting; hardcoded `activeIndex = 7` for `[N]` row.
