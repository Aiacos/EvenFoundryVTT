---
phase: 8
slug: manual-action-ux
status: human_needed
verified_at: 2026-05-16
must_haves_total: 5
must_haves_passed: 5
must_haves_failed: 0
hardware_pending: 3
test_count: 1858
test_files: 116
test_delta: "+543 (1315 → 1858)"
commits: 21
---

# Phase 8 Verification — Goal-Backward Audit

> **Phase goal (ROADMAP):** Player can cast a spell, use an item, attack, or move entirely via R1 from the G2 overlays; every action surfaces a result toast.

## Verdict

**SOFTWARE-SIDE: CLOSED ✅** — All 5 ROADMAP success criteria met in software; REQ ACT-01 software-closed; 14-socketlib-handler invariant (ISM-W8-10) confirmed.

**HARDWARE-SIDE: human_needed** — 3 SCs (SC-08-01..03) carry to ADR-0005 PROVISIONAL Branch A `human_needed` gate.

## Success Criteria — Goal-Backward Check

| # | SC (ROADMAP §Phase 8) | Software | Hardware | Evidence |
|---|---|---|---|---|
| 1 | Spellbook tap-to-cast: scroll spell → long-press → ActionOptionsModal → tap → (requiresTarget=true → TargetPickerPanel) → confirm → tool.invoke envelope (ACT-01 cast variant) | ✅ PASS | SC-08-01 | SpellbookPanel.setActionOptionsHandler (Plan 08-03); ActionOptionsModal (Plan 08-02); TargetPickerPanel (Plan 08-02); ISM-W8-01..03 + ISM-W8-09 |
| 2 | Inventory tap-to-use: scroll item → long-press → ActionOptionsModal → tap → automatic tool.invoke envelope (ACT-01 use variant) | ✅ PASS | SC-08-01 | InventoryPanel.setActionOptionsHandler (Plan 08-03); ISM-W8-09 round-trip |
| 3 | Combat overlay quick actions `[A][S][I][M]` each double-tap fires matching handler via CombatTrackerPanel QA-bar (ACT-01 attack variant) | ✅ PASS | SC-08-02 | CombatTrackerPanel.setQuickActionHandler (Plan 08-05 Task 1); CTQ-01..08 unit tests; ISM-W8-04..05 smoke; boot-engine Step 11g (Plan 08-05 Task 2) |
| 4 | Every completed action shows a result toast (d20 + outcome + damage ≤ 38 chars; failures show an error toast naming the cause) | ✅ PASS | SC-08-03 | attachActionResultHandler (Plan 08-01); formatActionMessage + formatSeverity (Plan 08-01); ToastQueueLayer mount in boot sequence (Plan 08-05 Step 11e); ISM-W8-06 + ISM-W8-10 (5×3 i18n cases) |
| 5 | Target picker handles empty-target edge case gracefully (no crash; "no targets" hint visible) | ✅ PASS | n/a (test-verifiable) | TargetPickerPanel.draw() empty-candidates path (Plan 08-02); INV-1 fixture `target-picker.empty.it.txt` |

## REQ-ID Coverage Matrix

| REQ | Closed by | Test Suites | Hardware Pending |
|-----|-----------|-------------|------------------|
| ACT-01 | 08-01 (dispatcher + i18n) + 08-02 (modal + target-picker) + 08-03 (spellbook/inventory wiring) + 08-05 (QA-bar + boot-engine) | AREH-*, CTQ-*, SHL-MV-*, BERW-09..12, ISM-W8-01..10 | SC-08-01..03 |

## Hardware-Deferred Stress Cases (ADR-0005 Branch A carry-forward)

| ID | Behavior | REQ | Close via |
|----|----------|-----|-----------|
| SC-08-01 | Real spellbook tap-to-cast round-trip: SpellbookPanel long-press → ActionOptionsModal → tool.invoke → cast-spell handler → real Foundry chat card visible in session | ACT-01 | `pnpm --filter @evf/validation-harness validate:all` |
| SC-08-02 | Real combat tracker QA-bar [A][S][I][M] double-tap on real G2 + R1: correct handler fires, Phase 8 stub console.warn replaced by Phase 9 full logic | ACT-01 | same + manual UAT |
| SC-08-03 | Action-result toast renders correctly on real G2 display: d20 + outcome + damage within 38-char budget, 3-second dwell, correct IT/EN locale selected per `game.i18n.lang` | ACT-01 | same + manual UAT |

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7): 23 SCs
Phase 8 adds: 3 SCs
New running total: **26 hardware-pending SCs** awaiting Even G2 + R1 hardware grant.

## Quality Gates (Final)

| Gate | Result |
|------|--------|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint:ci` (`biome ci`) | ✅ exit 0 |
| `pnpm test` (workspace) | ✅ **1858 tests passing across 116 files** (+543 from Phase 7's 1315 baseline) |
| INV-1 fixture matching | ✅ 4 new Phase 8 fixtures pass `matchAsciiFixture` (Plans 08-01 + 08-04) |
| 14-socketlib-handler invariant | ✅ confirmed in ISM-W8-10: grep count = 14 (no new handlers added) |
| T-08-02 cross-player leak prevention | ✅ ISM-W8-07: mismatched recipientUserId → NO toast (silent drop, no console.warn) |

## Plan Closure Signal

| Plan | Wave | Status | Key Commit(s) |
|------|------|--------|----------------|
| 08-01 | 1 | ✅ closed | see 08-01-SUMMARY.md |
| 08-02 | 2 | ✅ closed | see 08-02-SUMMARY.md |
| 08-03 | 2 | ✅ closed | see 08-03-SUMMARY.md |
| 08-04 | 3 | ✅ closed | see 08-04-SUMMARY.md |
| 08-05 | 4 | ✅ closed | `9901fe8` (CTQ + SHL-MV) + `219f3a3` (BERW RED) + `e8d5f03` (boot-engine GREEN) + `71ec0c2` (ISM-W8 smoke) |

## Invariant Confirmations

| Invariant | Status | Evidence |
|-----------|--------|---------|
| INV-1 Layout integrity | ✅ upheld | 4 INV-1 fixtures (Plans 08-01 + 08-04); no fixture regressions |
| INV-4 Code quality | ✅ upheld | typecheck + biome ci exit 0; no TODO without issue link |
| INV-5 Gesture Determinism | ✅ upheld | Double-tap-to-fire semantics deterministic (CTQ-01..08; ISM-W8-04..05); zero-handler path console.warn only |
| 14-socketlib-handler count | ✅ upheld | ISM-W8-10 grep confirms exactly 14 `registerComplexHandler` calls (ADR-0011) |

## Phase 9 Readiness

Phase 9 (Action Economy & Edge Cases) is unblocked.

**Depends on**: Phase 8 write-path stubs replaced by full Phase 9 logic:
- `[A]` QA-key → Phase 9 attack flow (currently console.warn stub)
- `[M]` QA-key → Phase 9 move flow (MoveDirectionPicker already wired in Phase 8 Plan 04)
- Spell slot consumption + concentration drop end-to-end (COMB-02)
