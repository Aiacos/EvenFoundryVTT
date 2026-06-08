---
phase: EVF-23-combat-tracker-su-canvas-combatant-ac
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - packages/foundry-module/src/readers/combat-reader.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/panels/canvas-combat-tracker-panel.ts
  - packages/g2-app/src/panels/combat-tracker-panel.ts
  - packages/shared-protocol/src/payloads/combat.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 23 adds `CombatantSchema.ac` (optional int), the `extractCombatantAc` reader, the
`CanvasCombatTrackerPanel` (canvas z=2 overlay), the shared `renderCombatantRow` AC column,
and the boot dispatch gate that routes `'combat-tracker'` → `'canvas-combat-tracker'` in
canvas mode.

The AC reader, schema, and row renderer are correct. The subscription lifecycle (onMount /
onUnmount / idempotency / last-value-replay) is properly structured. The dirty-gate pattern
(`_dirty = false` as last line of `paint()`) is sound.

Two blockers require fixes before this ships:
1. `_findCurrentTurnRowIndex` can false-positive on the `[▶X]` QA-bar marker when no
   current-turn combatant is visible in the scroll window, causing the wrong row to be
   inverted-highlighted.
2. `CanvasCombatTrackerPanel` has no public `setMultiAttackState` method, making the
   `[Atk N/M]` chip silently inert in canvas mode.

---

## Structural Findings (fallow)

No structural pre-pass was provided for this review.

---

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: `_findCurrentTurnRowIndex` false-positive on QA-bar `[▶X]` marker

**File:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts:705-712`

**Issue:**
`_findCurrentTurnRowIndex` scans all 18 rendered rows for the Unicode `▶` character and
returns the first match. The current-turn combatant rows use `▶ ` (U+25B6 + space), but
the quick-action bar also contains `▶` when a QA key is selected:
`renderQuickActionBar` emits `[▶X]` for the highlighted slot (combat-tracker-panel.ts:401).

When the current-turn combatant is scrolled OUT of the visible window (user manually
scrolled away) AND a QA key has been selected by tapping (`_qaSelectedIdx ≥ 0`, handler
set), the combatant rows carry no `▶` but the QA bar row does. The scan returns the QA bar
row index, causing `_drawCurrentTurnHighlight` to paint a white band over the QA bar (and
the QA bar text to render in black on white). This is visually incorrect.

Reproduction path:
1. Open canvas-combat-tracker with ≥6 combatants (windowing active).
2. Tap once to select a QA key (sets `_qaSelectedIdx = 1`).
3. Scroll down until the current-turn combatant is out of the visible window.
4. The QA bar row receives the inverted highlight.

**Fix:**
Change the detection heuristic to match the combatant marker exactly (`▶ ` with trailing
space), or — more robustly — have `renderCombatTrackerContent` return the current-turn row
index alongside the row array so the canvas panel does not need to re-derive it by string
scanning.

The simplest single-file fix is to tighten the search string:

```typescript
// canvas-combat-tracker-panel.ts – _findCurrentTurnRowIndex
private _findCurrentTurnRowIndex(rows: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    // Match "▶ " (marker + space) exactly to avoid false-positive on "[▶X]" QA bar.
    if ((rows[i] ?? '').includes('▶ ')) {
      return i;
    }
  }
  return -1;
}
```

The two-character sequence `'▶ '` (marker + space) is produced only by `renderCombatantRow`
for `isCurrentTurn === true`; the QA bar produces `[▶X]` (marker directly followed by the
key letter, no trailing space). This distinguishes the two cases without any structural change.

---

#### CR-02: `CanvasCombatTrackerPanel` missing public `setMultiAttackState` method

**File:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts:224-228`

**Issue:**
`_multiAttackState` is declared private and is only ever cleared on turn-advance inside
`_onCombatDelta` (line 688). There is no public `setMultiAttackState(state: MultiAttackState | null): void`
method, unlike the glyph `CombatTrackerPanel` (combat-tracker-panel.ts:789).

`multi-attack-progress-dispatcher.ts` calls `panel.setMultiAttackState(...)` via the
`MultiAttackPanelHandle` interface (line 63). Because `CanvasCombatTrackerPanel` does not
implement that interface, the dispatcher cannot update the canvas panel. Consequently the
`[Atk N/M]` chip, which the class doc explicitly says "mirrors glyph CombatTrackerPanel
MULTI-01", is silently never set in canvas mode — it will always render as `--` distance.

The class renders `_multiAttackState` in both `paint()` (line 402) and `getRenderedRows()`
(line 620), so the field is wired to the rendering path but the public API to populate it
is missing.

**Fix:**
Add the public setter, mirroring the glyph panel:

```typescript
/**
 * Set or clear the multi-attack chip state, then mark dirty for re-paint.
 *
 * Called by `attachMultiAttackProgressHandler` on each validated
 * `r1.multiattack.progress` envelope. Call with `null` to clear the chip.
 * Auto-clearing on turn-advance is handled in `_onCombatDelta`.
 *
 * @param state Multi-attack state to display, or null to clear.
 */
public setMultiAttackState(state: MultiAttackState | null): void {
  this._multiAttackState = state;
  this._dirty = true;
}
```

Also update the boot-engine-core `setPanelInstanceHandler('canvas-combat-tracker', ...)` block
(boot-engine-core.ts:1356) to inject `setMultiAttackState` alongside `setWsEventBus` and
`setQuickActionHandler`, once `attachMultiAttackProgressHandler` is wired for this panel.

---

### Warnings

#### WR-01: `game.combat` strict-null check misses `undefined`

**File:** `packages/foundry-module/src/readers/combat-reader.ts:62-65`

**Issue:**
```typescript
const combat = game.combat;
if (combat === null) {
  return null;
}
```

The ambient type declares `game.combat: FoundryCombat | null`, but Foundry VTT's real
runtime value is `undefined` when the game is initializing or in certain edge states
(observed in Foundry v12/v13 module hooks that fire before the combat collection is ready).
The strict `=== null` check does NOT guard against `undefined`, so any downstream access
(`combat.combatant`, `combat.combatants.contents.map(...)`) would throw
`TypeError: Cannot read property 'combatant' of undefined`.

**Fix:**
Use a loose falsy check (consistent with how Foundry module code conventionally defends
this):

```typescript
if (!combat) {
  return null;
}
```

Or widen the type declaration to `FoundryCombat | null | undefined` and use `combat == null`
(loose equality catches both). Either is acceptable; the falsy check is idiomatic Foundry.

---

#### WR-02: `onMount` gesture subscription leaked on double-mount (no prior `onUnmount`)

**File:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts:498-512`

**Issue:**
`onMount` (line 499) always overwrites `_unsubscribeGesture` without calling the previous
closure:

```typescript
async onMount(): Promise<void> {
  this._unsubscribeGesture = this._gestureBus.subscribe(...); // overwrites unconditionally
  // ...
}
```

If `onMount` is called a second time without a preceding `onUnmount` (e.g. a panel-router
bug, test harness, or future hot-reload), the first gesture subscription is permanently
leaked — the `PanelGestureBus` retains the stale callback, and every gesture fires both
the old (stale) and new (active) handlers. This causes duplicate `onEvent` invocations
and can corrupt `_qaSelectedIdx` / `_scrollOffset` / `_dirty` state.

The combat channel subscriptions (`_unsubscribeCombat`) do NOT have this problem: they are
pushed into an array that `onUnmount` clears, so a double-mount would push 4 closures
instead of 2, but the array is cleared on any subsequent `onUnmount`.

**Fix:**
Guard the gesture subscribe with the same null-check + call pattern already used in
`onUnmount`:

```typescript
async onMount(): Promise<void> {
  // Guard against double-mount without prior onUnmount.
  if (this._unsubscribeGesture !== null) {
    this._unsubscribeGesture();
    this._unsubscribeGesture = null;
  }
  this._unsubscribeGesture = this._gestureBus.subscribe((gesture) => this.onEvent(gesture));
  // ...
}
```

---

#### WR-03: `extractCombatantAc` — `actor.system` accessed without optional chain when actor is non-null

**File:** `packages/foundry-module/src/readers/combat-reader.ts:37`

**Issue:**
```typescript
const val = actor?.system.attributes.ac?.value;
```

When `actor` is non-null, `actor.system.attributes` is accessed directly (no optional chain
on `.system` or `.attributes`). The ambient type declares both as non-optional, which is
correct for standard dnd5e character and NPC actors. However, in a world that uses mixed
system actors (e.g., a `"vehicle"` actor type, or a combatant token linked to an actor
from a different game system installed alongside dnd5e), `actor.system.attributes` may be
absent or shaped differently at runtime. A thrown `TypeError` here would propagate up
through `getCombatSnapshot`, crash the HTTP handler, and return a 500 instead of the
expected 204/200.

This is a low-probability but silent crash path for non-standard combat configurations.

**Fix:**
Extend the optional chain through `system` and `attributes`:

```typescript
const val = actor?.system?.attributes?.ac?.value;
```

TypeScript will not flag redundant `?.` on non-optional fields, and the defensive chain
costs nothing at runtime when all three are present (the happy path).

---

### Info

#### IN-01: `QA_KEYS` constant duplicated between canvas and glyph panels

**File:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts:107` and
`packages/g2-app/src/panels/combat-tracker-panel.ts:374`

**Issue:**
`QA_KEYS` is defined identically in both files:
```typescript
const QA_KEYS: ReadonlyArray<'A' | 'S' | 'I' | 'M'> = ['A', 'S', 'I', 'M'] as const;
```
INV-4 ("zero dead/unreachable code tolerated") implicitly covers duplication. If the key
set changes in a future phase, both definitions must be updated together — an obvious
divergence risk.

**Fix:**
Extract to a shared module (e.g., `combat-tracker-constants.ts` in the same directory, or
export from `combat-tracker-panel.ts`) and import in `canvas-combat-tracker-panel.ts`.

---

#### IN-02: `DOUBLE_TAP_WINDOW_MS` constant defined only in canvas panel; glyph panel uses magic number `600`

**File:** `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts:110` and
`packages/g2-app/src/panels/combat-tracker-panel.ts:704`

**Issue:**
`canvas-combat-tracker-panel.ts` defines `const DOUBLE_TAP_WINDOW_MS = 600` (line 110).
The glyph `CombatTrackerPanel` (combat-tracker-panel.ts:704) uses the magic literal `600`
directly in the `withinWindow` comparison with no named constant. The two are currently
in sync, but a phase that tunes the double-tap window would need to find and update both.

This is the same root cause as IN-01: shared gesture constants not centralized.

**Fix:**
Export `DOUBLE_TAP_WINDOW_MS` from the shared constants module (see IN-01 fix) and import
it in both panel files.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
