---
phase: 09-action-economy-edge-cases
plan: "04"
subsystem: g2-app/panels + boot-engine + foundry-module/cast-spell
tags:
  - slot-picker
  - spell-cast
  - overlay-panel
  - inv-1-fixture
  - dnd5e-activity-api
dependency_graph:
  requires:
    - "09-03 (conc-retry-cache + ActionOptionsModal envelope caching)"
    - "08-03 (ActionOptionsModal base)"
    - "08-05 (boot-engine setPanelInstanceHandler wiring)"
  provides:
    - "SlotPickerPanel z=2 OverlayPanel for upcast/downcast slot selection"
    - "ActionOptionsCloseReason discriminant for close-path routing"
    - "StatusHudLayer.getCachedSnapshot() public accessor"
    - "cast-spell handler slot_level forwarding to dnd5e activity.use()"
  affects:
    - "SpellbookPanel → ActionOptionsModal → SlotPickerPanel cast flow"
    - "boot-engine-core step 11f spellbook factory closure"
tech_stack:
  added: []
  patterns:
    - "ActionOptionsCloseReason discriminant (reason-callback pattern avoids state introspection)"
    - "getCachedSnapshot() minimal public accessor (bearer-bound snapshot access)"
    - "dynamic import factory closure for SlotPickerPanel (avoids circular boot-time dep)"
    - "4 INV-1 ASCII fixtures via matchAsciiFixture (shared-render)"
key_files:
  created:
    - packages/g2-app/src/panels/slot-picker-panel.ts
    - packages/g2-app/src/panels/slot-picker-panel.test.ts
    - packages/shared-render/src/fixtures/slot-picker.fireball-3rd-default.it.txt
    - packages/shared-render/src/fixtures/slot-picker.fireball-4th-upcast.it.txt
    - packages/shared-render/src/fixtures/slot-picker.empty-only-base.it.txt
    - packages/shared-render/src/fixtures/slot-picker-en.txt
  modified:
    - packages/g2-app/src/panels/action-options-modal.ts
    - packages/g2-app/src/panels/action-options-modal.test.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts
    - packages/foundry-module/src/write-path/handlers/cast-spell.ts
    - packages/foundry-module/src/write-path/handlers/cast-spell.test.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
decisions:
  - "ActionOptionsCloseReason discriminant replaces null/boolean close signal — reason-callback avoids any _emittedFor state accessor on the modal"
  - "spell.slots field path is snapshot.spells.slots (SpellbookSchema) not snapshot.spellbook?.slots — plan had wrong path but correct semantics"
  - "Cantrip: availableSlots=[], requiresSlotPicker=false, defaultSlotLevel=0 — 0 is the edition-agnostic cantrip marker per CastSpellInputSchema"
  - "Boot inventory handler uses _reason (discard) — items never require slot picker"
  - "BERW-19..23 tests use structural + snapshot-delta injection — dynamic import factory makes full behavioral mock impractical at this level; SPP-*/AOM-SLOT-* cover behavioral contracts"
metrics:
  duration: "~16 minutes"
  completed: "2026-05-16"
  tasks: 3
  files_modified: 15
---

# Phase 9 Plan 04: SlotPickerPanel + cast-spell slot forwarding Summary

**One-liner:** SlotPickerPanel z=2 OverlayPanel for spell-slot upcast/downcast selection, wired into boot-engine-core step 11f with CharacterSnapshot-derived slot enrichment and cast-spell handler forwarding via `activity.use({ spell: { slot: 'spellN' } })`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | SlotPickerPanel + i18n keys + INV-1 fixtures | b59d061 | slot-picker-panel.ts, 4 fixtures, i18n-budgets.ts |
| 2 | ActionOptionsModal requiresSlotPicker + cast-spell slot forwarding | d92c90b | action-options-modal.ts, cast-spell.ts, AOM-SLOT+CS-SLOT tests |
| 3 | boot-engine-core factory closure + getCachedSnapshot wiring | 44c0979 | boot-engine-core.ts, status-hud-layer.ts, BERW-19..23 |

## What Was Built

### Task 1: SlotPickerPanel
- Full `OverlayPanel` at z=2 (Strategy A: single `'overlay-block'` container)
- Constructor throws on empty `availableSlots` (T-09-06 guard)
- R1 scroll: cycles selection cyclically; tap: emits `tool.invoke` + close; double-tap: cancel close; long-press: no-op (router-level QuickAction handles it per AOM-07 precedent)
- Tap envelope includes `slot_level: selected.level` (CastSpellInputSchema)
- `_getSelectedIdxForTest()` test-only accessor
- 7 new i18n keys added to `HUD_WIDTH_BUDGETS` (total: 209 → 216)
- 4 INV-1 fixtures: IT default, IT upcast, IT single-slot edge, EN locale

### Task 2: ActionOptionsModal + cast-spell handler
- `ActionOptionsRequest` extended with optional `requiresSlotPicker?: boolean` + `defaultSlotLevel?: number`
- `ActionOptionsCloseReason` union type (`'emit' | 'slot-picker-needed' | 'preconditioner-blocked' | 'cancel'`)
- `ActionOptionsCloseHandler` now receives reason discriminant
- Tap path: preconditioner → slot-picker branch → emit (in that order)
- `cast-spell.ts`: cantrip (slot_level=0) → `activity.use({ configure: false })`; non-cantrip → `activity.use({ configure: false, spell: { slot: 'spellN' } })`
- AOM-SLOT-01..05 + CS-SLOT-01..04 tests green

### Task 3: boot-engine-core SlotPickerPanel wiring
- `StatusHudLayer.getCachedSnapshot()`: minimal public accessor (bearer-bound, T-09-05)
- Spellbook instance handler enriched: snapshot lookup → `spells.spells.find(s => s.id === itemId)` → `spells.slots.filter(s => s.level >= spellLevel && s.value > 0)` → `requiresSlotPicker` / `defaultSlotLevel`
- Cantrip path: `spellLevel === 0` → `requiresSlotPicker=false`, `defaultSlotLevel=0`, `availableSlots=[]`
- Single-slot path: `availableSlots.length <= 1` → `requiresSlotPicker=false` (cast fires directly)
- Multi-slot path: `requiresSlotPicker=true` → `onCloseCb('slot-picker-needed')` → `openSlotPicker()` dynamic import factory
- Inventory handler: `_reason` (always popOverlay, items have no slot picker)
- BERW-19..23 tests: structural + character.delta WS injection + `_instanceHandlers` test accessor

## Test Counts

- SPP-01..12 + I18N-09-04 (13 tests, Task 1)
- AOM-SLOT-01..05 + CS-SLOT-01..04 (9 tests, Task 2)
- BERW-19..23 (5 tests, Task 3)
- Total new tests: ~27
- Workspace total: 2016 (all passing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong snapshot field path for spellbook**
- **Found during:** Task 3
- **Issue:** Plan's `<action>` block used `snapshot.spellbook?.slots` but actual CharacterSnapshot field is `snapshot.spells.slots` (inside SpellbookSchema)
- **Fix:** Used `snapshot.spells.slots` and `snapshot.spells.spells` (correct field path)
- **Files modified:** packages/g2-app/src/internal/boot-engine-core.ts
- **Commit:** 44c0979

**2. [Rule 2 - Missing critical functionality] ActionOptionsCloseReason discriminant**
- **Found during:** Task 3 implementation
- **Issue:** Plan suggested two approaches for detecting 'slot-picker-needed'; the simpler reason-callback approach prevents future behavioral bugs if close paths are added
- **Fix:** Added `ActionOptionsCloseReason` union type + updated all `onCloseCb()` calls to pass reason; inventory handler uses `_reason` (prefix) to suppress noUnusedParameters
- **Files modified:** packages/g2-app/src/panels/action-options-modal.ts, action-options-modal.test.ts
- **Commit:** 44c0979

**3. [Rule 1 - Bug] Biome useLiteralKeys on HUD_WIDTH_BUDGETS['hud_r1_slot_picker']**
- **Found during:** Post-implementation lint check
- **Issue:** Bracket notation on a valid identifier triggered Biome lint error
- **Fix:** Changed to dot notation `HUD_WIDTH_BUDGETS.hud_r1_slot_picker`
- **Files modified:** packages/g2-app/src/panels/slot-picker-panel.test.ts
- **Commit:** 44c0979 (post-format)

## Threat Model Verification

| Threat ID | Status |
|-----------|--------|
| T-09-04 (malformed slot_level) | Mitigated: CastSpellInputSchema gate + string template (no concatenation) + dnd5e throw caught |
| T-09-05 (cross-player slot info) | Mitigated: getCachedSnapshot() is bearer-bound WS session; no cross-player surface |
| T-09-06 (empty availableSlots crashes panel) | Mitigated: boot auto-skips when ≤1 slot; constructor throws on empty (defensive guard) |

## Known Stubs

None — plan is fully wired. SlotPickerPanel tap emits real `tool.invoke` envelopes. The cast-spell handler calls real `activity.use({ spell: { slot: 'spellN' } })`. Boot-engine enrichment reads real `getCachedSnapshot()`.

## Self-Check: PASSED

- `packages/g2-app/src/panels/slot-picker-panel.ts` — exists
- `packages/g2-app/src/status-hud/status-hud-layer.ts` (getCachedSnapshot) — exists
- `packages/g2-app/src/internal/boot-engine-core.ts` (step 11f enrichment) — exists
- Commits b59d061, d92c90b, 44c0979 — all present in git log
- `pnpm test` exit 0 (2016 tests)
- `pnpm lint:ci` exit 0 (0 errors)
- `pnpm typecheck` exit 0
- `registerComplexHandler` count = 14 (unchanged)
- 4 INV-1 fixtures generated and committed
