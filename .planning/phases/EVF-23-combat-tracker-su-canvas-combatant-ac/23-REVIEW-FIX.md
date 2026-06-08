---
phase: EVF-23-combat-tracker-su-canvas-combatant-ac
fixed_at: 2026-06-08T08:20:00Z
review_path: .planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-06-08T08:20:00Z
**Source review:** `.planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### WR-01 / WR-03: `combat-reader.ts` null guard + optional chain

**Files modified:** `packages/foundry-module/src/readers/combat-reader.ts`
**Commit:** `5ca9986`
**Applied fix:**
- WR-01: `if (combat === null)` → `if (!combat)` so `undefined` (Foundry init edge states) also short-circuits.
- WR-03: `actor?.system.attributes.ac?.value` → `actor?.system?.attributes?.ac?.value` — full optional chain protects against non-dnd5e or incomplete actor shapes at runtime.

---

### CR-01: `_findCurrentTurnRowIndex` false-positive on QA-bar `[▶X]` marker

**Files modified:**
- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts`
- `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts`

**Commit:** `1b06b1f`
**Applied fix:**
Changed `includes('▶')` to `includes('▶ ')` (marker + trailing space). The combatant current-turn marker is `▶ ` (space after); the QA-bar slot is `[▶X]` (letter directly after, no space). This eliminates the false-positive when the current-turn combatant is scrolled out of the visible window and a QA key is selected.

Added regression test `RCOMB-WIN-3` covering the scrolled-out + QA-selected reproduction path — verifies that `_drawCurrentTurnHighlight` (fillRect) is NOT called when only a `[▶X]` QA marker is present in the rows.

---

### CR-02: `CanvasCombatTrackerPanel` missing public `setMultiAttackState`

**Files modified:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts`
**Commit:** `f74b5e9`
**Applied fix:**
Added `public setMultiAttackState(state: MultiAttackState | null): void` with full TSDoc. The method assigns `_multiAttackState` and sets `_dirty = true`, mirroring `CombatTrackerPanel.setMultiAttackState` (glyph panel, combat-tracker-panel.ts:789). `CanvasCombatTrackerPanel` now satisfies the `MultiAttackPanelHandle` structural interface, so `multi-attack-progress-dispatcher.ts` can update the `[Atk N/M]` chip in canvas mode.

---

### WR-02: `onMount` double-mount gesture subscription leak

**Files modified:**
- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts`
- `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts`

**Commit:** `c754f30`
**Applied fix:**
Added a null-check + call-and-null guard at the top of `onMount` for `_unsubscribeGesture` — mirrors the existing idempotent pattern already present in `onUnmount`. If `onMount` is called a second time without a preceding `onUnmount`, the previous subscription is properly released before a new one is registered. Without this fix, the `PanelGestureBus` would retain two stale callbacks causing duplicate `onEvent` invocations.

Added regression test `RCOMB-LIFECYCLE-DOUBLE-MOUNT` verifying that bus subscriber count stays at exactly 1 after a double-mount.

---

### IN-01 / IN-02: Extract `QA_KEYS` and `DOUBLE_TAP_WINDOW_MS` to shared constants module

**Files modified:**
- `packages/g2-app/src/panels/combat-tracker-constants.ts` _(new file)_
- `packages/g2-app/src/panels/combat-tracker-panel.ts`
- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts`

**Commit:** `e95df12`
**Applied fix:**
Created `combat-tracker-constants.ts` exporting `QA_KEYS` (ReadonlyArray) and `DOUBLE_TAP_WINDOW_MS` (600). Both panel files now import from this module. Removed the two duplicate `const QA_KEYS` declarations and replaced the `600` magic literal in the glyph panel's `withinWindow` comparison with the named constant. No behaviour change — same values, structural divergence risk eliminated per INV-4.

---

_Fixed: 2026-06-08T08:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
