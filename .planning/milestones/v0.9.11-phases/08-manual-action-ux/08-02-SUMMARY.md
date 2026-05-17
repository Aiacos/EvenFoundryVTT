---
phase: 08-manual-action-ux
plan: "02"
subsystem: target-picker
tags: [target-picker, target-resolver, inv-1, gesture, overlay-panel, tdd, w4-envelope]
dependency_graph:
  requires: ["08-01"]
  provides: ["target-resolver", "target-picker-panel", "inv1-target-fixtures"]
  affects: ["08-03", "08-05"]
tech_stack:
  added: []
  patterns:
    - "OverlayPanel z=2 with PanelGestureBus subscribe/unsubscribe lifecycle"
    - "Pure-function resolver module (zero side effects, full test isolation)"
    - "Empty-state auto-close via setTimeout + clearTimeout in onUnmount (idempotent)"
    - "vi.fn<(data: string) => void>() typed Vitest 4 mock for ws.send"
    - "as { content: string } structural cast over as TextContainerUpgrade (optional field guard)"
key_files:
  created:
    - packages/g2-app/src/panels/target-resolver.ts
    - packages/g2-app/src/panels/target-resolver.test.ts
    - packages/g2-app/src/panels/target-picker-panel.ts
    - packages/g2-app/src/panels/target-picker-panel.test.ts
    - packages/shared-render/src/fixtures/target-picker.full-list.it.txt
    - packages/shared-render/src/fixtures/target-picker.single-target.it.txt
    - packages/shared-render/src/fixtures/target-picker.empty.it.txt
  modified:
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
decisions:
  - "ac: null for combat-sourced TargetCandidate — CombatantSchema has no ac field; Phase 9 COMB-02 may supplement from scene token data"
  - "FRAME_WIDTH=70 / PANEL_INNER_WIDTH=66 — matches QuickActionMenuPanel + CombatTrackerPanel layout constants"
  - "AUTO_CLOSE_MS=2000 — plan spec; timer saved in onMount, cleared in onUnmount for idempotency"
  - "vi.fn<(data: string) => void>() Vitest 4 typed mock — correct single type-arg syntax for @vitest/spy v4"
  - "as { content: string } cast over as TextContainerUpgrade — TextContainerUpgrade.content is content?: string in SDK; structural cast asserts the draw() invariant cleanly"
  - "5 i18n keys added (target_picker_title, target_picker_empty_hint, target_picker_hp_label, target_picker_ac_label, hud_r1_target_picker) — plan called for ~6, hud_r1_target_picker covers the composite hint in one key"
metrics:
  duration: "~45 min (including context recovery after summarization)"
  completed: "2026-05-16T15:48:30Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 2
---

# Phase 08 Plan 02: TargetPickerPanel + target-resolver + INV-1 fixtures Summary

TargetPickerPanel z=2 OverlayPanel with PanelGestureBus lifecycle, resolveValidTargets pure helper, and 3 INV-1 character-perfect ASCII fixtures for full-list/single-target/empty states.

## Tasks Completed

| Task | TDD Gate | Commit | Description |
|------|----------|--------|-------------|
| Task 1 RED | test | 1b20376 | TR-01..07 failing tests for target-resolver |
| Task 1 GREEN | feat | 9669185 | target-resolver.ts + resolveValidTargets + describeTargetRow + 5 i18n keys |
| Task 2 RED | test | e739962 | TPP-01..17 failing tests for TargetPickerPanel |
| Task 2 GREEN | feat | ffe744c | TargetPickerPanel + 3 INV-1 fixtures + type fixes |

## What Was Built

### target-resolver.ts

Pure-function module with zero side effects and no bridge/ws dependencies:

- `resolveValidTargets(combatSnapshot, sceneTokens, callerActorId, _rangeHint?)` — returns `TargetCandidate[]` filtered by:
  - Excludes caller's own actorId
  - Excludes defeated combatants (hp <= 0 or null)
  - Active-turn combatant first, then descending initiative, then scene-only tokens
  - Deduplication via actorId Set (combat candidates suppress same-actor scene tokens)
  - Phase 8 broad heuristic: rangeHint accepted but not used for filtering (Phase 9 COMB-02 refines)

- `describeTargetRow(candidate, locale, idx, isSelected, width)` — formats a single row string with `▶` indicator, localized HP/AC labels, truncated name, fits within specified width (code-point count).

- `TargetCandidate` interface: `tokenId`, `actorId`, `name`, `hp`, `maxHp`, `ac` (null for combat sources), `isActiveTurn`, `sourceIdx`.

### target-picker-panel.ts

`TargetPickerPanel implements OverlayPanel` at z=2 (`ZIndex.Z2_OVERLAY`):

- **Constructor**: `(bridge, ws, gestureBus, candidates, locale, sessionId, toolInvocation, onClose)`
- **onMount**: subscribes to PanelGestureBus; if `candidates.length === 0` schedules `setTimeout(AUTO_CLOSE_MS=2000)` auto-close
- **onUnmount**: unsubscribes (saves unsubscribe closure from `gestureBus.subscribe()`), clears timer, idempotent
- **onEvent(gesture)**:
  - `scroll down`: selectedIdx = (selectedIdx + 1) % length
  - `scroll up`: selectedIdx = (selectedIdx - 1 + length) % length
  - `tap`: emits canonical `tool.invoke` envelope via `ws.send(JSON.stringify(...))`, then calls `onClose()`; no-op if no candidates
  - `double-tap`: calls `onClose()` without emitting (cancel)
  - `long-press`: ignored
- **draw()**: calls `bridge.textContainerUpgrade(new TextContainerUpgrade({ ... }))` with 18-row × 70-char frame content
- **getContainerCount()**: `{ image: 0, text: 1 }` (Strategy A single `overlay-block` container per ADR-0009 Amendment 1)
- **getR1Hints()**: returns parsed `{ tap, scroll, longPressLabel }` from `parseR1HintString(hud_r1_target_picker)`

### INV-1 Fixtures

Three character-perfect ASCII fixtures at `packages/shared-render/src/fixtures/`:

- `target-picker.full-list.it.txt` — 3 targets, idx=1 (GOBLIN BRUTO) selected with `▶`, 18 rows × 70 chars
- `target-picker.single-target.it.txt` — 1 target, idx=0 (GOBLIN ARCHER) selected with `▶`, 18 rows × 70 chars
- `target-picker.empty.it.txt` — 0 targets, centered "Nessun bersaglio" hint, 18 rows × 70 chars

### i18n-budgets.ts

5 new keys added (total: 185 → 190):
- `target_picker_title` — 'BERSAGLIO' / 'TARGET' / 'ZIEL', max 12
- `target_picker_empty_hint` — 'Nessun bersaglio' / 'No targets' / 'Keine Ziele', max 28
- `target_picker_hp_label` — 'PF' / 'HP' / 'TP', max 3
- `target_picker_ac_label` — 'CA' / 'AC' / 'RK', max 3
- `hud_r1_target_picker` — composite R1 hint string (tap/scroll/long), max 38

## Test Coverage

- **TR-01..07**: 22 tests for `resolveValidTargets` + `describeTargetRow` — empty state, filtering, ordering, dedup, range broad heuristic, candidate shape, IT/EN row format
- **TPP-01..17**: 33 tests for `TargetPickerPanel` — identity, lifecycle, gesture routing, W-4 envelope round-trip, INV-1 fixtures
- **All 55 tests pass**; workspace total: 1735 tests across 111 files

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (`test(08-02)`) | 1b20376 | PASS |
| Task 1 GREEN (`feat(08-02)`) | 9669185 | PASS |
| Task 2 RED (`test(08-02)`) | e739962 | PASS |
| Task 2 GREEN (`feat(08-02)`) | ffe744c | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict errors in target-picker-panel.test.ts**
- **Found during:** Task 2 GREEN typecheck (`pnpm --filter @evf/g2-app exec tsc --noEmit`)
- **Issue 1:** `bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade` — `TextContainerUpgrade.content` is typed `content?: string` in the SDK, so `arg.content` was `string | undefined`, failing `AsciiGrid.fromString(arg.content: string)` strict assignment
- **Fix 1:** Changed all 7 `as TextContainerUpgrade` casts that access `.content` to `as { content: string }` — structural type assertion matching the draw() invariant
- **Issue 2:** `vi.fn<[string], void>()` — incorrect Vitest 4 `fn` type-arg syntax (expected 0-1 args, not 2 tuple args)
- **Fix 2:** Changed to `vi.fn<(data: string) => void>()` — correct single Procedure type-arg syntax per `@vitest/spy` v4 `fn<T extends Procedure | Constructable>()` signature
- **Issue 3:** `TargetPickerWebSocket` imported but unused after removing it from `MockWs` type
- **Fix 3:** Removed `type TargetPickerWebSocket` from test import
- **Files modified:** `packages/g2-app/src/panels/target-picker-panel.test.ts`
- **Commit:** ffe744c (bundled with Task 2 GREEN)

**2. [Rule 1 - Bug] Biome `noNonNullAssertion` in TPP-16 test**
- **Found during:** Task 2 GREEN biome check
- **Issue:** `const singleCandidate = [FULL_CANDIDATES[0]!]` triggers `lint/style/noNonNullAssertion`
- **Fix:** Changed to `FULL_CANDIDATES.slice(0, 1)` — semantically safer (returns empty array on empty input rather than inserting undefined)
- **Files modified:** `packages/g2-app/src/panels/target-picker-panel.test.ts`
- **Commit:** ffe744c

**3. [Rule 1 - Bug] Biome `noUnusedImports` — `beforeEach` unused**
- **Found during:** Task 2 GREEN biome check
- **Issue:** `import { afterEach, beforeEach, ... }` — `beforeEach` imported but not used
- **Fix:** Removed `beforeEach` from import
- **Files modified:** `packages/g2-app/src/panels/target-picker-panel.test.ts`
- **Commit:** ffe744c

**4. [Rule 2 - Missing critical] i18n-budgets.test.ts count assertions**
- **Found during:** Task 1 GREEN verification
- **Issue:** Adding 5 i18n keys (185 → 190) broke `IB-ALL-1` and `IB-P5-COUNT` assertions that asserted `toBe(185)` — same class of deviation as Phase 08-01 Plan 02
- **Fix:** Updated both assertions to `toBe(190)` with updated description comments
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
- **Commit:** 9669185

## W-4 Regression Gate

Gate passed: zero matches for `WireEnvelopeSchema` or `envelope.value` in target-picker files.
Outgoing `tool.invoke` envelope uses canonical shape: `{ proto, seq, ts, type, session_id, payload }`.
`payload` validated by `ToolInvocationEnvelopePayloadSchema` in TPP-14 + TPP-07d/e round-trip tests.

## Known Stubs

None. All plan deliverables are fully wired. `TargetPickerPanel` consumers (Plan 08-03 ActionOptionsModal, Plan 08-05 boot-engine wiring) will be connected in their respective plans.

## Threat Flags

None. No new network endpoints or auth paths introduced. `ws.send` in `TargetPickerPanel` uses the same existing WebSocket surface established by `ConcentrationDropModal` (T-4b-01-03 pattern).

## Self-Check: PASSED

Files created:
- FOUND: packages/g2-app/src/panels/target-resolver.ts
- FOUND: packages/g2-app/src/panels/target-resolver.test.ts
- FOUND: packages/g2-app/src/panels/target-picker-panel.ts
- FOUND: packages/g2-app/src/panels/target-picker-panel.test.ts
- FOUND: packages/shared-render/src/fixtures/target-picker.full-list.it.txt
- FOUND: packages/shared-render/src/fixtures/target-picker.single-target.it.txt
- FOUND: packages/shared-render/src/fixtures/target-picker.empty.it.txt

Commits verified:
- FOUND: 1b20376 (Task 1 RED)
- FOUND: 9669185 (Task 1 GREEN)
- FOUND: e739962 (Task 2 RED)
- FOUND: ffe744c (Task 2 GREEN)

Tests: 55 pass (2 files), 1735 workspace total.
