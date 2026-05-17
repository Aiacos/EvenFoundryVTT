---
phase: "13"
plan: "02"
subsystem: "reaction-prompt"
tags: [reaction, overlay-panel, dispatcher, combat-action-tracker, tdd, inv-1]
dependency_graph:
  requires: ["13-01"]
  provides: ["reaction-prompt-panel", "reaction-prompt-dispatcher", "reaction-slot-accounting"]
  affects: ["g2-app/panels", "foundry-module/write-path/combat-action-tracker", "shared-render/fixtures", "status-hud/i18n-budgets"]
tech_stack:
  added: []
  patterns: ["OverlayPanel", "double-trust-boundary", "debounce-dispatcher", "TDD RED/GREEN"]
key_files:
  created:
    - packages/g2-app/src/panels/reaction-prompt-panel.ts
    - packages/g2-app/src/panels/reaction-prompt-panel.test.ts
    - packages/g2-app/src/panels/reaction-prompt-dispatcher.ts
    - packages/g2-app/src/panels/reaction-prompt-dispatcher.test.ts
    - packages/shared-render/src/fixtures/reaction-prompt.shield.it.txt
    - packages/shared-render/src/fixtures/reaction-prompt.counterspell.en.txt
    - packages/shared-render/src/fixtures/reaction-prompt.opportunity-attack.it.txt
  modified:
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - packages/foundry-module/src/write-path/combat-action-tracker.ts
    - packages/foundry-module/src/write-path/combat-action-tracker.test.ts
decisions:
  - "Strategy A for ReactionPromptPanel: single 'overlay-block' text container (same as ConcentrationDropModalPanel)"
  - "D-13-04: 500ms debounce coalesces same-tick r1.reaction.available envelopes before mount"
  - "T-13-01a double trust boundary: EnvelopeSchema outer + ReactionAvailablePayloadSchema inner"
  - "RPD-NO-ACTOR-01: null playerActorId → skip mount entirely (no panel shown)"
  - "EconomySlot widened to 'action' | 'bonus' | 'reaction' for cast-shield/cast-counterspell/opportunity-attack"
metrics:
  duration: "~60 minutes (across two sessions)"
  completed_date: "2026-05-17"
  tasks_completed: 3
  files_changed: 11
---

# Phase 13 Plan 02: ReactionPromptPanel + Dispatcher + Reaction Slot Summary

ReactionPromptPanel z=2 overlay with 3 reaction kinds (shield/counterspell/opp-attack), 500ms debounce dispatcher with T-13-01 triple anti-spam guards, and EconomySlot widened to 'reaction' with 3 new TOOL_SLOT_MAP entries.

## Tasks Completed

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| 1 | i18n keys + ReactionPromptPanel + 3 INV-1 fixtures | `c1abb4f` | RPP-01..12 (12 tests) |
| 2 | reaction-prompt-dispatcher 500ms debounce + 5s timeout | `ff56257` | RPD-01..10 (10 tests) |
| 3 RED | CAT-REACT-01..04 failing tests (reaction slot) | `fff2ab5` | 4 failing (RED) |
| 3 GREEN | Widen EconomySlot + extend TOOL_SLOT_MAP | `e0982dd` | CAT-REACT-01..04 (GREEN) |

## Commits

- `c1abb4f` — feat(13-02): ReactionPromptPanel + 8 i18n keys + 3 INV-1 fixtures (RPP-01..12)
- `ff56257` — feat(13-02): reaction-prompt-dispatcher 500ms debounce + 5s timeout (RPD-01..10)
- `fff2ab5` — test(13-02): CAT-REACT-01..04 failing tests for reaction slot accounting
- `e0982dd` — feat(13-02): widen EconomySlot to 'reaction' + extend TOOL_SLOT_MAP (CAT-REACT-01..04)

## Implementation Notes

### Task 1: i18n + ReactionPromptPanel + INV-1 Fixtures

**i18n-budgets.ts** — 8 new keys added (Phase 13 section), total 218 → 226:
- `reaction_prompt_title`, `reaction_prompt_subject_shield/counterspell/opp_attack`
- `reaction_prompt_y_shield/counterspell/opp_attack`, `reaction_prompt_n_cancel`

**ReactionPromptPanel** — Mirrors ConcentrationDropModalPanel structure exactly:
- 60-cp wide × 12-row modal layout (Strategy A single 'overlay-block' container)
- `_buildLines()` produces INV-1 character-perfect layout across all 3 kinds
- `_handleConfirm()`: null actorId guard → builds tool.invoke envelope → ws.send + onClose
- `_buildToolPayload()`: switch on kind → cast-shield / cast-counterspell / opportunity-attack
- W-13 compliance: EnvelopeSchema wraps all outgoing tool.invoke messages

**INV-1 Fixtures** — 3 fixture files, each 12 rows × 60 cp wide:
- `reaction-prompt.shield.it.txt` (IT locale, Shield kind)
- `reaction-prompt.counterspell.en.txt` (EN locale, Counterspell kind)
- `reaction-prompt.opportunity-attack.it.txt` (IT locale, Opportunity Attack kind)

### Task 2: reaction-prompt-dispatcher

T-13-01 triple anti-spam mitigation:
1. **500ms debounce** — clearTimeout + new setTimeout on each envelope (D-13-04)
2. **Concurrent-drop** — `mountedPanel !== null` → silently drop incoming envelope
3. **5s auto-timeout** — setTimeout(destroy, 5000) on mount; cleared on user interaction

Double trust boundary (T-13-01a):
- Outer: `EnvelopeSchema.safeParse(rawMsg)` — canonical wire format
- Inner: `ReactionAvailablePayloadSchema.safeParse(envelope.payload)` — kind/sourceName/expiresAt

RPD-NO-ACTOR-01 guard: `deps.getPlayerActorId() === null` → skip mount entirely.

Unsubscribe closure: removes WS listener + clears both timers + destroys any mounted panel.

### Task 3: combat-action-tracker reaction slot accounting

`EconomySlot` widened: `'action' | 'bonus'` → `'action' | 'bonus' | 'reaction'`

`TOOL_SLOT_MAP` extended with 3 new entries:
- `'cast-shield'` → `'reaction'`
- `'cast-counterspell'` → `'reaction'`
- `'opportunity-attack'` → `'reaction'`

`createChatMessage` hook body: 2-way `if/else` → 3-way branch with `else if (slot === 'reaction')` setting `current.reactionsUsed = 1`.

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- Task 1: No TDD gate (not marked tdd="true" in plan for this task; RPP tests committed with implementation)
- Task 2: No TDD gate (RPD tests committed with implementation in same commit)
- Task 3: Full RED/GREEN cycle enforced
  - RED commit: `fff2ab5` — 4 CAT-REACT tests failing
  - GREEN commit: `e0982dd` — all 4 passing, 2349 total tests green

## Test Counts

| Suite | Tests Added | All Pass |
|-------|-------------|----------|
| reaction-prompt-panel.test.ts | 12 (RPP-01..12) | Yes |
| reaction-prompt-dispatcher.test.ts | 10 (RPD-01..10) | Yes |
| combat-action-tracker.test.ts | 4 (CAT-REACT-01..04) | Yes |
| **Total new** | **26** | **Yes** |
| **Workspace total** | **2349** | **Yes** |

## Known Stubs

None — all behavior wired.

## Threat Flags

No new network endpoints or auth paths introduced. The dispatcher consumes the existing WS connection; outgoing tool.invoke messages follow the existing bridge pipeline. No new threat surface beyond the plan's threat model.

## Self-Check: PASSED
