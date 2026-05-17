---
phase: "05"
fixed_at: "2026-05-15T21:45:50Z"
review_path: ".planning/phases/05-panel-plugin-system-read-only-panels/05-REVIEW.md"
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-05-15T21:45:50Z
**Source review:** `.planning/phases/05-panel-plugin-system-read-only-panels/05-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (3 Critical + 5 Warning; Info excluded)
- Fixed: 8
- Skipped: 0
- Post-fix test count: **1172 passed / 73 files** (baseline was 1149 — +23 regression tests added)
- Gate: `pnpm typecheck && pnpm lint:ci && pnpm test` all pass (exit 0)

---

## Fixed Issues

### CR-01: Spell slot bar inverted

**Files modified:** `packages/g2-app/src/panels/spellbook-panel.ts`,
`packages/shared-render/src/fixtures/spellbook.caster.it.txt`,
`packages/shared-render/src/fixtures/spellbook.half-caster.it.txt`,
`packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts`
**Commit:** `dc2782d`
**Applied fix:** Changed `renderSlotBar(slot.value, slot.max)` to
`renderSlotBar(slot.max - slot.value, slot.max)`. `slot.value` holds
remaining slots; `renderSlotBar` expects spent slots as its first arg.
Updated two canonical INV-1 fixtures to reflect correct `▓`/`░`
distribution. Added 3 regression tests (SP-CR01-ALL-AVAILABLE,
SP-CR01-PARTIAL, SP-CR01-ALL-SPENT).
**Status:** fixed: requires human verification (logic inversion)

---

### CR-02: Malformed damage-formula ternary discards `base.formula`

**Files modified:** `packages/foundry-module/src/readers/character-reader.ts`,
`packages/foundry-module/src/readers/readers.test.ts`
**Commit:** `6c1ae81` (shared with WR-03)
**Applied fix:** Replaced the malformed ternary that had a truthy guard
on `damage.base?.formula` but then read `damage.parts?.[0]` on both
branches. New logic: read `base.formula` first; fall back to
`String(parts[0])` only when `base.formula` is absent. Added 3
regression tests (CR-02-BASE-FORMULA, CR-02-PARTS-FALLBACK,
CR-02-NO-DAMAGE).
**Status:** fixed: requires human verification (conditional logic)

---

### CR-03: `_rjust` left-slices HP strings ≥ 100

**Files modified:** `packages/g2-app/src/panels/combat-tracker-panel.ts`,
`packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
**Commit:** `e9bae3f`
**Applied fix:** Introduced `_formatHpField(hp, maxHp, width)` helper
that right-pads when the string fits and calls `_pad()` (truncation with
ellipsis) only on overflow — replacing the unsafe `_rjust` which
`slice(-width)` left-sliced digits. Changed the HP field render line to
use the new helper. Added 3 regression tests (CTP-CR03-HIGH-HP-WIDTH,
CTP-CR03-NO-LEFT-SLICE, CTP-CR03-SMALL-HP-UNCHANGED).
**Status:** fixed: requires human verification (layout arithmetic)

---

### WR-01: YOU-marker nameField 19 cp exceeds 18-cp budget

**Files modified:** `packages/g2-app/src/panels/combat-tracker-panel.ts`,
`packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
**Commit:** `aeae625`
**Applied fix:** Added `_pad(youMarkerRaw, 4)` clamp so the marker is
exactly 4 code points regardless of locale string length (EN "YOU" = 3
cp padded to 4; IT "TU" = 2 cp padded to 4). Name field width held at
12 cp; total nameField = 12 + 2 spaces + 4 = 18 cp. Added 2 regression
tests (CTP-WR01-YOU-EN-WIDTH, CTP-WR01-YOU-IT-WIDTH).
**Status:** fixed

---

### WR-02: `scrollOffset` unbounded in LogPanel and CombatTrackerPanel

**Files modified:** `packages/g2-app/src/panels/log-panel.ts`,
`packages/g2-app/src/panels/combat-tracker-panel.ts`,
`packages/g2-app/src/panels/__tests__/log-panel.test.ts`,
`packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
**Commit:** `8f41abb`
**Applied fix:**
- `LogPanel`: clamp `scrollOffset` to `[0, events.length - 1]` on each
  scroll gesture; down clamps to `maxOffset = Math.max(0, events.length - 1)`,
  up clamps to 0.
- `CombatTrackerPanel`: compute `maxOff = Math.max(0, combatants.length - 3)`
  and clamp the signed offset to `[-maxOff, maxOff]` bidirectionally.
Added 2 regression tests (WR-02-LP-CLAMP, WR-02-CTP-CLAMP).
**Status:** fixed

---

### WR-03: Dead code `type === ('spell' as string)` (unreachable guard)

**Files modified:** `packages/foundry-module/src/readers/character-reader.ts`,
`packages/foundry-module/src/readers/readers.test.ts`
**Commit:** `6c1ae81` (shared with CR-02)
**Applied fix:** Removed the dead `if (type === ('spell' as string)) continue`
line. Spell items were already excluded earlier via `mapItemType` returning
null (not in `INVENTORY_ITEM_TYPES`) and the `if (itemType === null) continue`
null-guard. Added regression test WR-03-SPELL-EXCLUSION verifying exclusion
still works through the surviving null-guard path.
**Status:** fixed

---

### WR-04: `renderLogFilterBar` never called from `renderLogContent`

**Files modified:** `packages/g2-app/src/panels/log-panel.ts`,
`packages/g2-app/src/panels/__tests__/log-panel.test.ts`
**Commit:** `a216acd`
**Applied fix:** Added `activeFilter: LogFilter = 'all'` parameter to
`renderLogContent`. When `activeFilter !== 'all'`, the filter bar row is
inserted immediately after the top border (using `renderLogFilterBar`)
and the content budget shrinks by 1. `LogPanel.draw()` now passes
`this.activeFilter`. Default `'all'` leaves existing fixtures unchanged.
Added 3 regression tests (WR-04-ALL-FILTER, WR-04-ROLLS-FILTER,
WR-04-WIDTH-ROWS).
**Status:** fixed

---

### WR-05: Description always appends " roll" regardless of kind

**Files modified:** `packages/foundry-module/src/readers/log-reader.ts`,
`packages/foundry-module/src/readers/__tests__/log-reader.test.ts`
**Commit:** `a12c7a0`
**Applied fix:** Replaced `${actorName} ${kind} roll` with a conditional
template: for roll-like kinds (`attack`, `roll`, `damage`) produce
`${actorName} — ${kind}`; for `spell`, `feature`, `chat` produce
`actorName` alone (no kind suffix). Added 6 regression tests
(WR-05-ATTACK-DESCRIPTION, WR-05-SPELL-DESCRIPTION,
WR-05-FEATURE-DESCRIPTION, WR-05-DAMAGE-DESCRIPTION,
WR-05-CHAT-DESCRIPTION, WR-05-NO-ACTOR-DESCRIPTION).
**Status:** fixed

---

## Post-fix type safety correction

A follow-up commit (`607e9f1`) added `as unknown as ReturnType<typeof makeItem>`
casts to three CR-02 test mock objects whose inline `damage.parts: string[][]`
shape did not match the `makeItem` inferred type (`parts: never[]`). TypeScript
strict mode rejected the mismatch; the two-step cast is the idiomatic approach
for intentionally non-conforming test mocks exercising defensive runtime paths.

---

## Skipped Issues

None — all 8 in-scope findings were fixed.

---

_Fixed: 2026-05-15T21:45:50Z_
_Fixer: Claude Sonnet 4.6 (gsd-code-fixer)_
_Iteration: 1_
