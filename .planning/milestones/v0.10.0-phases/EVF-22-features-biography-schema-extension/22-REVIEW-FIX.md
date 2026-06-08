---
phase: EVF-22-features-biography-schema-extension
fixed_at: 2026-06-08T01:37:00Z
review_path: .planning/phases/EVF-22-features-biography-schema-extension/22-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase EVF-22: Code Review Fix Report

**Fixed at:** 2026-06-08T01:37:00Z
**Source review:** `.planning/phases/EVF-22-features-biography-schema-extension/22-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (4 Warning + 4 Info — no criticals)
- Fixed: 8
- Skipped: 0

All fixes verified with Biome lint (clean), TypeScript strict noEmit (clean), and full
workspace test suite (237 test files, 3263 tests — all green).

Note: WR-01 and WR-02 both modify `canvas-character-sheet-panel.ts` and were committed
in a single atomic commit (`13c2720`) because the two changes are inseparable at the
gesture-layer mutation site (same `case 'scroll'` block). The commit message covers WR-01;
WR-02 behaviour is described in the commit body.

---

## Fixed Issues

### WR-01: `_scrollOffset` grows without upper bound at the gesture layer

**Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
**Commit:** `13c2720`
**Applied fix:** Added `MAX_SCROLL_OFFSET = 200` constant in the Constants section with
JSDoc explaining the ceiling. Applied `Math.min(this._scrollOffset + 1, MAX_SCROLL_OFFSET)`
at the scroll-down gesture site replacing the bare `this._scrollOffset++`.

---

### WR-02: `_persistLastTab` called on every within-tab scroll (wasted Even Hub writes)

**Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
**Commit:** `13c2720` (same commit as WR-01 — same file, same code block)
**Applied fix:** Captured `prevTabIndex = this._activeTabIndex` before the mutation block.
Wrapped `void this._persistLastTab()` in `if (this._activeTabIndex !== prevTabIndex)` so
BLE storage writes are emitted only on actual tab changes, not on within-tab scroll gestures.

---

### WR-03: HTML block-level tags stripped without injecting whitespace — adjacent sentence content merges

**Files modified:**
- `packages/foundry-module/src/readers/character-reader.ts`
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts`

**Commit:** `ef3468e`
**Applied fix:** Both `stripHtml` implementations updated identically. The new implementation:
1. Replaces `<\/?(p|br|li|ul|ol|h[1-6]|div|blockquote)[^>]*>` with a single space (block-level boundary injection).
2. Strips remaining tags with `/<[^>]*>/g`.
3. Collapses multiple spaces with `/\s{2,}/g`.
4. Trims leading/trailing whitespace.

Test fixtures are unchanged — existing test data does not contain block-level HTML tags,
so no fixture update was needed. Full suite confirmed green post-fix.

---

### WR-04: `extractFeats` and `extractBiography` annotated `@internal` but exported — INV-4 violation

**Files modified:** `packages/foundry-module/src/readers/character-reader.ts`
**Commit:** `649f6d8`
**Applied fix:** Replaced `@internal` with `@remarks` on both `extractFeats` and
`extractBiography` explaining: "Exported for unit-test access within the `foundry-module`
package only. Not part of the stable public API — prefer `getCharacterSnapshot`."

---

### IN-01: `getCharacterSnapshot` JSDoc does not document Phase 22 additions

**Files modified:** `packages/foundry-module/src/readers/character-reader.ts`
**Commit:** `f1deeca`
**Applied fix:** Added Phase 22 Plan 22-02 addition paragraph after the Phase 21 paragraph,
documenting `extractFeats` (RDATA-03), `extractBiography` (RDATA-04), and the optional-field
contract (D-22.1/D-22.4). Matches the established phase-addition documentation pattern.

---

### IN-02: `PASSIVE_ABBR[locale] ?? PASSIVE_ABBR.en` fallback is unreachable dead code (INV-4)

**Files modified:** `packages/g2-app/src/panels/character-sheet-tab-renderers.ts`
**Commit:** `0f0b7de`
**Applied fix:** Removed the `?? PASSIVE_ABBR.en` fallback. `PASSIVE_ABBR` is typed as
`Record<HudLocale, ...>` with all 6 locale keys present (`it`, `en`, `de`, `es`, `fr`,
`pt-br`); the fallback was dead. Added an inline comment documenting the exhaustiveness
invariant. TypeScript enforces a compile-time error if a new `HudLocale` is added without
updating `PASSIVE_ABBR`. Confirmed no TypeScript errors with `noUncheckedIndexedAccess`.

---

### IN-03: `TABS[this._activeTabIndex] ?? 'main'` fallback in `_persistLastTab` is unreachable (INV-4)

**Files modified:** `packages/g2-app/src/panels/canvas-character-sheet-panel.ts`
**Commit:** `bcd5a73`
**Applied fix:** Replaced `TABS[this._activeTabIndex] ?? 'main'` with
`TABS[this._activeTabIndex]!` (non-null assertion) plus an explanatory comment confirming
`_activeTabIndex` is always in `[0, TABS.length-1]` via modulo. Added
`biome-ignore lint/style/noNonNullAssertion: invariant enforced by all mutation sites`
suppression comment for the Biome rule. Required because `noUncheckedIndexedAccess` is
enabled in `tsconfig.base.json`.

---

### IN-04: `FeatEntrySchema.category` accepts empty string — schema doesn't enforce non-empty invariant

**Files modified:** `packages/shared-protocol/src/payloads/character.ts`
**Commit:** `cd6decc`
**Applied fix:** Changed `category: z.string()` to `category: z.string().min(1)`.
Updated the JSDoc comment to document the `min(1)` constraint and its rationale.
No test fixtures use `category: ''` — confirmed by grep. Full suite green after change.

---

## Skipped Issues

None — all 8 findings were fixed successfully.

---

_Fixed: 2026-06-08T01:37:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
