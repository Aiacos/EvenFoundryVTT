---
phase: 23-combat-tracker-su-canvas-combatant-ac
plan: 03
subsystem: g2-app
tags: [g2-app, canvas-overlay, combat-tracker, tdd, rcomb-01, rdata-05, inv-1]

# Dependency graph
requires:
  - phase: 23-combat-tracker-su-canvas-combatant-ac
    plan: 01
    provides: CombatantSchema.ac optional field
  - phase: 23-combat-tracker-su-canvas-combatant-ac
    plan: 02
    provides: extractCombatantAc + getCombatSnapshot emitting ac
provides:
  - CanvasCombatTrackerPanel dual-interface canvas overlay (id 'canvas-combat-tracker')
  - Shared renderCombatantRow with real AC (c.ac !== undefined ? _rjust : ' --')
  - Boot dispatch gate: combat-tracker -> canvas-combat-tracker when renderMode=canvas
  - setPanelInstanceHandler('canvas-combat-tracker') wiring wsEventBus + quickActionHandler
affects:
  - packages/g2-app/src/panels/combat-tracker-panel.ts (shared AC renderer)
  - packages/g2-app/src/internal/boot-engine-core.ts (dispatch gate + handler)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CanvasCombatTrackerPanel: dual CanvasLayer+OverlayPanel — mirrors CanvasCharacterSheetPanel structure (attachCanvas/_initAsync/_prebakeChrome, paint dirty-gate, chrome pre-bake, destroy)"
    - "Approach A: renderCombatTrackerContent() -> string rows -> ctx.fillText per row; current-turn _drawCurrentTurnHighlight inverted fillRect band (Pattern 6/A3)"
    - "Dual-channel subscription: onMount subscribes BOTH combat.turn + combat.state into _unsubscribeCombat[]; onUnmount iterates and clears array (Pitfall 4 / T-23-03)"
    - "Boot dispatch gate: chained ternary in onNavigate resolvedTarget (character-sheet arm + combat-tracker arm) — Pitfall 2 from 21-RESEARCH.md"
    - "WsEventBusLike structural interface keeps panel decoupled from boot module (Pitfall 5)"
    - "isAtTopBoundary() verbatim return this._scrollOffset === 0 (Pitfall 6 — ADR-0012 gate)"

key-files:
  created:
    - packages/g2-app/src/panels/canvas-combat-tracker-panel.ts
    - packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts
  modified:
    - packages/g2-app/src/panels/combat-tracker-panel.ts
    - packages/g2-app/src/internal/boot-engine-core.ts

key-decisions:
  - "Panel id 'canvas-combat-tracker' is DISTINCT from glyph 'combat-tracker' (Pitfall 2 — same-id glob overwrite)"
  - "Approach A chosen: reuse renderCombatTrackerContent string rows via ctx.fillText — no separate canvas-native renderer needed"
  - "Shared renderCombatantRow: c.ac !== undefined ? _rjust(String(c.ac),3) : ' --' — _rjust ensures 3-cp field, INV-1 row width stays 66"
  - "Both combat.turn + combat.state routed to same _onCombatDelta handler (Open Question 1/A4 — both carry CombatSnapshot)"
  - "void _bridge in constructor — accepted for parity with glyph panel; canvas output goes to CanvasCompositor directly"
  - "D-23.5: panel-router.ts + panel-gesture-bus.ts unmodified — GUARD-PASS confirmed"

requirements-completed: [RCOMB-01, RDATA-05]

# Metrics
duration: ~15min
completed: 2026-06-08
---

# Phase 23 Plan 03: CanvasCombatTrackerPanel + Boot Gate + Real AC Summary

**`CanvasCombatTrackerPanel` (canvas-combat-tracker) created as dual CanvasLayer+OverlayPanel; shared `renderCombatantRow` updated to real AC via `_rjust`; boot dispatch gate + handler injection wired; D-23.5 GUARD-PASS confirmed**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-08T05:51:00Z
- **Completed:** 2026-06-08T06:00:00Z
- **Tasks:** 3 (TDD: RED test + GREEN implementation + boot gate)
- **Files created:** 2 / modified: 2

## Accomplishments

### Task 1 — RED: RCOMB-01 test file

Created `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts` covering all RCOMB-01 sub-behaviors:

- **RCOMB-IFACE**: id/meta.id/getContainerCount/getCaptureContainer/draw()
- **RCOMB-DIRTY**: isDirty() true at construction; false after paint() with real ctx; null-ctx degrades gracefully
- **RCOMB-AUTOFOL**: combat.turn delta with new currentCombatantId resets _scrollOffset + sets dirty (D-23.3)
- **RCOMB-SCROLL**: manual scroll-down changes _scrollOffset; isAtTopBoundary() === (_scrollOffset === 0)
- **RCOMB-WIN**: 7 combatants → 5 rows via window; fillRect highlight for current-turn row
- **RCOMB-AC**: ac:18 renders " 18"; missing ac renders " --" fallback
- **RCOMB-T2301**: malformed payload dropped — _dirty and _snapshot unchanged (T-23-01)
- **RCOMB-LIFECYCLE**: onMount subscribes BOTH combat.turn + combat.state; onUnmount unsubscribes all; idempotent; post-unmount delta is no-op
- **RCOMB-DTAP**: double-tap is no-op (no throw, no scrollOffset change)
- **RCOMB-BOOT**: boot gate logic purity check

Test was RED (import of missing panel file failed).

### Task 2 — GREEN: Panel implementation + shared AC

Updated `combat-tracker-panel.ts`:
- Replaced `const acValue = ' --';` (hard-coded, with "Phase 5 scope" comment) with:
  `const acValue = c.ac !== undefined ? _rjust(String(c.ac), 3) : ' --';`
- `_rjust(..., 3)` preserves INV-1 66-code-point row width — AC field is always exactly 3 chars
- Comment updated: cites Phase 23 Plan 23-03 / D-23.2 / RDATA-05

Created `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts` (~430 lines):
- `static meta: PanelMeta = { id: 'canvas-combat-tracker', ... }` (DISTINCT from glyph 'combat-tracker')
- `public readonly id = 'canvas-combat-tracker'`; `public readonly z = ZIndex.Z2_OVERLAY`
- Constructor mirrors glyph CombatTrackerPanel: `(_bridge, _gestureBus, _locale, _ownActorId='')`
  - `void _bridge` pattern: accepted for parity; canvas output goes to CanvasCompositor
- `setWsEventBus(bus)` + `setQuickActionHandler(h)` injection seams (Pitfall 5 — pre-onMount injection)
- `attachCanvas`: null-ctx degrade + `_initAsync` (ensureVt323Loaded + _prebakeChrome)
- `paint()`: clearRect + chrome blit/inline + Approach A (18 rows via ctx.fillText) + `_drawCurrentTurnHighlight` inverted fill + `_dirty = false` last line
- `isDirty()`, `draw()` no-op, `getContainerCount(): {image:0,text:0}`, `getCaptureContainer(): 'hud-capture'`, `destroy()` closes bitmap
- `onMount`: subscribe gestureBus + both combat channels → push to `_unsubscribeCombat[]` + `_dirty=true`
- `onUnmount`: invoke+null `_unsubscribeGesture`; iterate+clear `_unsubscribeCombat[]` (T-23-03 / Pitfall 4)
- `onEvent`: scroll ±1 clamped (T-23-02); tap QA-bar cycle/fire (CTQ-04/05); double-tap no-op (ADR-0012)
- `isAtTopBoundary(): return this._scrollOffset === 0` verbatim (Pitfall 6)
- `_onCombatDelta`: safeParse gate (T-23-01); auto-follow reset (D-23.3); WR-02 chip clear
- `getRenderedRows()` test-seam accessor (wraps renderCombatTrackerContent for RCOMB-WIN/AC tests)
- `_findCurrentTurnRowIndex` + `_drawCurrentTurnHighlight` private helpers

All 1578 RCOMB-01 + existing glyph combat-tracker tests GREEN; `tsc --noEmit` exit 0.

### Task 3 — Boot gate + handler

Updated `packages/g2-app/src/internal/boot-engine-core.ts`:
- Extended `resolvedTarget` ternary in `onNavigate` (~line 894):
  ```
  target === 'combat-tracker' && layerManager.getRenderMode() === 'canvas'
    ? 'canvas-combat-tracker'
    : target
  ```
  (chained after existing character-sheet arm; Phase 23 / RCOMB-01 / D-23.5 comment added)
- Added `panelRouter.setPanelInstanceHandler('canvas-combat-tracker', (panel) => { ... })`
  immediately after the existing `combat-tracker` handler block:
  - Casts panel to `{ setWsEventBus, setQuickActionHandler }` shape
  - Calls `tracker.setWsEventBus(wsEventBus)` + `tracker.setQuickActionHandler(quickActionHandler)`
  - Comment cites D-23.5, Pitfall 4 (no subscription inside handler), Pitfall 5

D-23.5 GUARD-PASS:
```
git diff --quiet packages/g2-app/src/engine/panel-router.ts \
                 packages/g2-app/src/engine/panel-gesture-bus.ts && echo "GUARD-PASS"
→ GUARD-PASS: router+bus unchanged
```

## Task Commits

1. **Task 1: RCOMB-01 RED tests** — `fe83495` (test)
2. **Task 2: CanvasCombatTrackerPanel GREEN** — `05fc920` (feat)
3. **Task 3: Boot dispatch gate + handler** — `8adf4a3` (feat)

## Files Created/Modified

- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts` — NEW, ~430 lines
- `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts` — NEW, ~650 lines
- `packages/g2-app/src/panels/combat-tracker-panel.ts` — MODIFIED: 1 line (acValue)
- `packages/g2-app/src/internal/boot-engine-core.ts` — MODIFIED: 28 lines (gate + handler)

## Decisions Made

- Approach A (glyph strings → ctx.fillText) chosen over canvas-native renderer: simpler, reuses all tested business logic from combat-tracker-panel.ts, no INV-1 re-verification needed for string output.
- Both `combat.turn` and `combat.state` routed to `_onCombatDelta` — both carry `CombatSnapshot`; the panel behavior is identical for either event type (Open Question 1/A4 resolution).
- `_bridge` kept in constructor as `void _bridge` — constructor parity with glyph panel is required for PanelRouter.openPanel uniform injection; `void` suppresses TS6133 cleanly without suppression comments.
- `getRenderedRows()` test-seam preferred over spy on private `ctx.fillText` for RCOMB-AC assertions — more readable, decoupled from rendering details.
- INV-1: no fixture drift — existing combat-tracker fixtures all use combatants WITHOUT `ac` field, so they continue to produce `' --'` via the new fallback path. Zero fixture updates needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Mock wsEventBus unsubscribe did not remove handler**

- **Found during:** Task 1 → Task 2 GREEN iteration
- **Issue:** The `makeMockWsEventBus()` in the test returned a `vi.fn()` spy for unsub but did not actually remove the handler from the Map. After `onUnmount`, `wsEvents.emit()` continued to call the handler, causing RCOMB-LIFECYCLE-2 to fail (post-unmount delta still marked dirty).
- **Fix:** Updated the unsub function to both call `handlers.delete(channel)` (functional) AND be a vi.fn spy (verifiable). The real `wsEventBus.subscribe` returns a proper unsubscribe that removes the listener — the mock must faithfully reflect this.
- **Files modified:** `canvas-combat-tracker-panel.test.ts`

**2. [Rule 1 - Bug] RCOMB-AUTOFOL-1 used 2-combatant snapshot for scroll test**

- **Found during:** Task 2 GREEN iteration
- **Issue:** `makeCombatSnapshot()` with 2 combatants gives `maxOff = max(0, 2-3) = 0`, so scroll is clamped to 0. The test published a scroll-down gesture and expected `isAtTopBoundary() === false`, but it stayed true.
- **Fix:** Changed RCOMB-AUTOFOL-1 to use `makeLargeCombatSnapshot()` (7 combatants → `maxOff = 4`) so scroll is effective before the auto-follow reset assertion.
- **Files modified:** `canvas-combat-tracker-panel.test.ts`

**3. [Rule 1 - Bug] TypeScript TS6133: combatantRows variable declared but never read**

- **Found during:** Task 2 typecheck
- **Issue:** RCOMB-WIN-1 declared `combatantRows` for a filter but used `namedRows` instead.
- **Fix:** Removed the unused `combatantRows` assignment.
- **Files modified:** `canvas-combat-tracker-panel.test.ts`

**4. [Rule 1 - Bug] TypeScript TS6138: _bridge private field never read**

- **Found during:** Task 2 typecheck
- **Issue:** `private readonly _bridge: EvenAppBridge` was declared but never used in canvas mode.
- **Fix:** Changed to non-private parameter `_bridge: EvenAppBridge` with `void _bridge` in constructor body — preserves constructor parity, suppresses TS6138 cleanly per INV-4 (no dead code).
- **Files modified:** `canvas-combat-tracker-panel.ts`

**5. [Rule 1 - Bug] Imported `computeWindow` was never used after `_computeWindow` field removal**

- **Found during:** Task 2 typecheck
- **Issue:** `_computeWindow = computeWindow` test-seam field was removed (superseded by `getRenderedRows()`), but the import was not updated.
- **Fix:** Removed `computeWindow` from the import statement.
- **Files modified:** `canvas-combat-tracker-panel.ts`

## Known Stubs

None — `CanvasCombatTrackerPanel` renders real combat data from `CombatSnapshot`. The `' --'` AC fallback is intentional (combatant with no linked actor), not a stub.

## INV-1 Verification

The shared `renderCombatantRow` change (`c.ac !== undefined ? _rjust(String(c.ac), 3) : ' --'`) uses `_rjust(..., 3)` to ensure the AC field remains exactly 3 code-points (cols 48–50). Existing test fixtures use combatants with no `ac` field, producing the same `' --'` output as before — zero fixture drift. No INV-1 snapshot update was needed.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes. The `_onCombatDelta` T-23-01 safeParse gate is implemented as specified in the threat register.

## Self-Check

**Files exist:**
- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts` — FOUND (contains `canvas-combat-tracker`, ≥200 lines)
- `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts` — FOUND
- `packages/g2-app/src/panels/combat-tracker-panel.ts` — FOUND (contains `c.ac !== undefined`)
- `packages/g2-app/src/internal/boot-engine-core.ts` — FOUND (contains `canvas-combat-tracker` ≥2x)

**Commits exist:**
- `fe83495` — FOUND (test(23-03): add failing RCOMB-01 tests RED)
- `05fc920` — FOUND (feat(23-03): implement CanvasCombatTrackerPanel GREEN)
- `8adf4a3` — FOUND (feat(23-03): boot dispatch gate + handler injection)

**D-23.5 guard:**
- `git diff --quiet panel-router.ts panel-gesture-bus.ts && echo GUARD-PASS` → GUARD-PASS

**Test suite:**
- 1578/1578 g2-app tests pass; 3288/3288 workspace-wide

**Typecheck:** `tsc --noEmit` exit 0

## Self-Check: PASSED

---
*Phase: 23-combat-tracker-su-canvas-combatant-ac*
*Completed: 2026-06-08*
