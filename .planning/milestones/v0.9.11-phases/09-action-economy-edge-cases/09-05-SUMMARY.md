---
phase: 09-action-economy-edge-cases
plan: "05"
subsystem: integration-smoke
tags: [integration-smoke, phase-closure, action-economy, concentration, slot-picker, socketlib-invariant]
dependency_graph:
  requires: [09-04-PLAN.md, 08-05-SUMMARY.md]
  provides: [ISM-W9-01..10, FM-ISM-W9-01..10, 09-VERIFICATION.md, PHASE_9_CLOSED]
  affects: [STATE.md, ROADMAP.md, REQUIREMENTS.md]
tech_stack:
  added: []
  patterns: [integration-smoke-harness, MockSocket-EventEmitter, StubCaptureLayer, vi-resetModules-dynamic-import]
key_files:
  created:
    - packages/g2-app/src/__tests__/09-integration-smoke.test.ts
    - packages/foundry-module/src/__tests__/09-integration-smoke.test.ts
    - .planning/phases/09-action-economy-edge-cases/09-VERIFICATION.md
    - .planning/phases/09-action-economy-edge-cases/09-05-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - ISM-W9-10 socketlib-handler grep gate uses readFileSync + string filter on 'socketlib.registerComplexHandler' (not generic 'registerComplexHandler') to avoid counting line 268 comment; count = 14
  - FM-ISM-W9 tests use vi.resetModules() + dynamic imports in beforeEach for clean TOOL_REGISTRY and hook handler state per test
  - R1Gesture scroll variant has no 'delta' field (only direction: 'up'|'down'); test corrected from { kind:'scroll', direction:'down', delta:1 } to { kind:'scroll', direction:'down' }
  - Biome auto-format applied to both test files (import sorting + trailing newline)
metrics:
  duration: "~35 min (Task 1+2: ~25 min, Task 3: ~10 min)"
  completed_date: "2026-05-16"
  task_count: 3
  file_count: 6
---

# Phase 9 Plan 05: Phase 9 Closure — ISM-W9-01..10 + FM-ISM-W9-01..10 Integration Smoke Summary

**One-liner:** Full action-economy + concentration drop + slot-picker integration smoke (20 tests total) with 14-socketlib-handler grep gate; PHASE_9_CLOSED with 29 hardware-pending SCs and COMB-02 software-closed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | g2-app 09-integration-smoke.test.ts (ISM-W9-01..10) | `1fe7fa2` | packages/g2-app/src/__tests__/09-integration-smoke.test.ts |
| 2 | foundry-module 09-integration-smoke.test.ts (FM-ISM-W9-01..10) | `2d9f166` | packages/foundry-module/src/__tests__/09-integration-smoke.test.ts |
| 3 | Phase 9 closure — STATE + ROADMAP + VERIFICATION (atomic commit) | _(this commit)_ | .planning/STATE.md, .planning/ROADMAP.md, .planning/phases/09-action-economy-edge-cases/09-VERIFICATION.md |

## Test Coverage

### g2-app ISM-W9-01..10

| ID | Scenario | Status |
|----|----------|--------|
| ISM-W9-01 | Phase 9 layer set mounts cleanly; capture invariant + single rebuildPageContainer | PASS |
| ISM-W9-02 | r1.action.economy envelope → state cache updated + StatusHudRenderer non-null | PASS |
| ISM-W9-03 | ActionOptionsModal tap with actionsUsed=1 → toast enqueued; ws.send NOT called | PASS |
| ISM-W9-04 | ActionOptionsModal tap with multiAttackInProgress=true → ws.send called; no toast | PASS |
| ISM-W9-05 | conc.conflict envelope → ConcentrationDropModalPanel mounts at z=2 | PASS |
| ISM-W9-06 | conc modal [Y] tap → 3 ws.send calls in order; each passes EnvelopeSchema | PASS |
| ISM-W9-07 | conc modal [N] double-tap → 0 retry; toast with concentration-cancelled | PASS |
| ISM-W9-08 | SlotPickerPanel scroll→selection 1; tap → slot_level=4 in envelope | PASS |
| ISM-W9-09 | ActionOptionsModal requiresSlotPicker=false → slot_level=3 direct emit | PASS |
| ISM-W9-10 | 14-socketlib-handler grep gate; EnvelopeSchema round-trip on all Phase 9 types | PASS |

### foundry-module FM-ISM-W9-01..10

| ID | Scenario | Status |
|----|----------|--------|
| FM-ISM-W9-01 | cast-spell slot_level:4 non-concentration → activity.use with spell4 slot | PASS |
| FM-ISM-W9-02 | cast-spell slot_level:0 cantrip → activity.use without spell.slot key | PASS |
| FM-ISM-W9-03 | cast-spell concentration + active concentration → concentration-required error + bridgeDeltaEmitter | PASS |
| FM-ISM-W9-04 | combat-action-tracker createChatMessage cast-spell → emit actionsUsed:1 | PASS |
| FM-ISM-W9-05 | weapon-attack attackId dedup — same attackId counts once; multiAttackInProgress:true | PASS |
| FM-ISM-W9-06 | updateCombat turn change → emit zeroed payload (actionsUsed:0, multiAttackInProgress:false) | PASS |
| FM-ISM-W9-07 | updateCombat non-turn/round change → no emit | PASS |
| FM-ISM-W9-08 | action-result-watcher concentration-required error → errorKind:'concentration-required' | PASS |
| FM-ISM-W9-09 | 14-socketlib-handler grep gate (foundry-module side) | PASS |
| FM-ISM-W9-10 | audit-log attackId included in log entry (regression guard Plan 09-01 Task 1 extension) | PASS |

## Quality Gates

| Gate | Result |
|------|--------|
| `pnpm test` (workspace) | PASS — 2036 tests across 125 files (+178 from Phase 8 baseline 1858) |
| `pnpm typecheck` | PASS — exit 0 |
| `pnpm lint:ci` (biome ci) | PASS — no errors (168 pre-existing warnings) |
| 14-socketlib-handler invariant | CONFIRMED — ISM-W9-10 + FM-ISM-W9-09 grep 'socketlib.registerComplexHandler' = 14 |
| INV-1 Layout integrity | UPHELD — 8 INV-1 fixtures from Plans 09-02 + 09-04 all pass matchAsciiFixture |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed excess property in SlotPickerPanel scroll event test**
- **Found during:** Task 1 (typecheck run)
- **Issue:** Test at ISM-W9-08 passed `{ kind: 'scroll', direction: 'down', delta: 1 }` — but the `R1Gesture` scroll variant in `layer-types.ts` only has `{ kind: 'scroll'; direction: 'up' | 'down' }` with no `delta` field. TypeScript excess-property checking (TS2353) caught this.
- **Fix:** Removed `delta: 1` → `{ kind: 'scroll', direction: 'down' }`.
- **Files modified:** `packages/g2-app/src/__tests__/09-integration-smoke.test.ts` line 654
- **Commit:** included in `1fe7fa2` (Biome auto-fix applied alongside the typecheck fix)

**2. [Rule 2 - Auto-format] Biome import-sorting + trailing newline**
- **Found during:** Task 3 (lint:ci gate)
- **Issue:** Both new test files had unsorted imports (Biome organizeImports rule) and minor formatting issues.
- **Fix:** `biome check --write` applied auto-fixes to both files.
- **Files modified:** Both `09-integration-smoke.test.ts` files
- **Commit:** included in corresponding task commits (no behavior change)

## Phase 9 Closure — Hardware-Pending SCs

| ID | Description | REQ | Resolution path |
|----|-------------|-----|-----------------|
| SC-09-01 | Action Economy Widget renders character-perfect on real G2 display (576×288 phosphor green) | COMB-02 | `pnpm --filter @evf/validation-harness validate:all` + visual UAT |
| SC-09-02 | Concentration drop end-to-end on real Foundry world + dnd5e 5.3.3 | COMB-02 | Same + manual UAT (Hold Person while concentrating on Bless) |
| SC-09-03 | SlotPickerPanel scroll-cycle feels right on real R1 ring | COMB-02 | Same + manual UAT |

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8): 26 SCs
Phase 9 adds: 3 SCs
New running total: **29 hardware-pending SCs** carried to ADR-0005 Branch A human_needed

## Invariant Confirmations

| Invariant | Status | Evidence |
|-----------|--------|---------|
| INV-1 Layout integrity | UPHELD | 8 INV-1 fixtures (Plans 09-02 + 09-04) pass matchAsciiFixture; no regressions |
| INV-3 Doc coherence | UPHELD | STATE.md + ROADMAP.md + 09-VERIFICATION.md + 09-05-SUMMARY.md in single atomic commit |
| INV-4 Code quality | UPHELD | typecheck + biome ci exit 0; no TODO without issue link |
| INV-5 Gesture Determinism | UPHELD | All panel onEvent() handlers deterministic; zero-handler path is console.warn only |
| 14-socketlib-handler count | CONFIRMED | ISM-W9-10 + FM-ISM-W9-09: grep 'socketlib.registerComplexHandler' = 14 |
| T-09-01 double trust boundary | CONFIRMED | ISM-W9-02 end-to-end (outer EnvelopeSchema + inner ActionEconomyPayloadSchema) |
| T-09-03 single-attempt retry | CONFIRMED | ISM-W9-06 + ISM-W9-07: consumeLatestConfirmed() returns null after [Y]; null on [N] |

## Known Stubs

None — all Phase 9 panels are fully wired (ActionEconomyWidget, ActionOptionsModal preconditioner, SlotPickerPanel, ConcentrationDropModalPanel dual-emit). The `currentUserId: '<unknown>'` bearer-user-id stub from Phase 8 Plan 05 is still present in boot-engine (TODO(ADR-0005)) but does not affect Phase 9 test correctness since ISM-W9 tests set the recipientUserId directly.

## Threat Flags

None — no new network endpoints or auth paths introduced by integration smoke tests (test-only files).

## Self-Check

### Files exist:

- `packages/g2-app/src/__tests__/09-integration-smoke.test.ts` — FOUND (created Task 1, commit 1fe7fa2)
- `packages/foundry-module/src/__tests__/09-integration-smoke.test.ts` — FOUND (created Task 2, commit 2d9f166)
- `.planning/phases/09-action-economy-edge-cases/09-VERIFICATION.md` — FOUND (created Task 3)

### Commits exist:

- `1fe7fa2` — FOUND (ISM-W9-01..10 g2-app integration smoke)
- `2d9f166` — FOUND (FM-ISM-W9-01..10 foundry-module integration smoke)

### Self-Check: PASSED
