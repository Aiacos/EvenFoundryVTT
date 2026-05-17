---
phase: 9
slug: action-economy-edge-cases
status: human_needed
verified_at: 2026-05-16
must_haves_total: 5
must_haves_passed: 5
must_haves_failed: 0
hardware_pending: 3
test_count: 2036
test_files: 125
test_delta: "+178 (1858 → 2036)"
commits: 15
---

# Phase 9 Verification — Goal-Backward Audit

> **Phase goal (ROADMAP):** Action / Bonus / Reaction enforcement is visible and binding; concentration drop, multi-attack, and slot consumption all behave correctly under real combat sequencing.

## Verdict

**SOFTWARE-SIDE: CLOSED ✅** — All 5 ROADMAP success criteria met in software; REQ COMB-02 software-closed; 14-socketlib-handler invariant (ISM-W9-10) confirmed.

**HARDWARE-SIDE: human_needed** — 3 SCs (SC-09-01..03) carry to ADR-0005 PROVISIONAL Branch A `human_needed` gate.

## Success Criteria — Goal-Backward Check

| # | SC (ROADMAP §Phase 9) | Software | Hardware | Evidence |
|---|---|---|---|---|
| 1 | Action economy widget renders Action / Bonus / Reaction / Move slots used vs available; client-side precondition tool blocks a second Action in the same turn (COMB-02) | ✅ PASS | SC-09-01 | ActionEconomyPayloadSchema (Plan 09-01); ActionEconomyWidget INV-1 fixtures (Plan 09-02); preconditioner in ActionOptionsModal (Plan 09-02); ISM-W9-02..04 |
| 2 | Concentration drop flow end-to-end: casting a new concentration spell while concentrating opens modal → on confirm previous concentration drops in Foundry, on cancel the cast is aborted | ✅ PASS | SC-09-02 | concentration-detector (Plan 09-03); conc-retry-cache (Plan 09-03); ConcentrationDropModalPanel tap dual-emit (Plan 09-03); FM-ISM-W9-03; ISM-W9-05..07 |
| 3 | Multi-attack flow completes: Fighter L5 burns Action once for both attacks; widget reflects single Action consumption | ✅ PASS | n/a (software-verifiable) | combat-action-tracker attackId dedup (Plan 09-01 CAT-05..06); FM-ISM-W9-05; ISM-W9-02 |
| 4 | Spell slot consumption auto-suggests the highest available slot for upcast; downcast is selectable via R1 scroll before confirm | ✅ PASS | SC-09-03 | SlotPickerPanel scroll-cycle (Plan 09-04 SPP-01..12); ActionOptionsModal requiresSlotPicker branch (Plan 09-04 AOM-SLOT-01..05); ISM-W9-08..09 |
| 5 | Reaction-prompt UI fires when the player becomes a Shield/Counterspell candidate; passive-notification (REACT-01) is the display mechanism but reaction-slot accounting in the widget is wired here | ✅ PASS | n/a (software-verifiable) | ActionEconomyWidget reactionsUsed field rendered (Plan 09-02); ISM-W9-02 (payload round-trip) |

## REQ-ID Coverage Matrix

| REQ | Closed by | Test Suites | Hardware Pending |
|-----|-----------|-------------|------------------|
| COMB-02 | 09-01 (ActionEconomyPayloadSchema + combat-action-tracker + audit-log attackId) + 09-02 (Action Economy Widget + client preconditioner + 4 INV-1 fixtures) + 09-03 (concentration-detector + conc-retry-cache + single-attempt retry flow) + 09-04 (SlotPickerPanel + cast-spell slot forwarding + 4 INV-1 fixtures) + 09-05 (ISM-W9-01..10 + FM-ISM-W9-01..10) | CAT-*, SHR-EW-*, AOM-PRE-*, CS-CONC-*, SPP-*, ISM-W9-*, FM-ISM-W9-* | SC-09-01..03 |

## Hardware-Deferred Stress Cases (ADR-0005 Branch A carry-forward)

| ID | Behavior | REQ | Close via |
|----|----------|-----|-----------|
| SC-09-01 | Action Economy Widget renders character-perfect on real G2 display; slot icons and row layout hold under real hardware phosphor green colour at 576×288 (INV-1 visual on device) | COMB-02 | `pnpm --filter @evf/validation-harness validate:all` |
| SC-09-02 | Concentration drop end-to-end on real Foundry world + dnd5e 5.3.3: casting Hold Person while concentrating on Bless opens modal → tap [Y] → Bless effect.delete() fires on Foundry GM side → Hold Person proceeds | COMB-02 | same + manual UAT |
| SC-09-03 | SlotPickerPanel scroll-cycle feels right on real R1 ring: scroll up/down advances selection, tap confirms, timing window responsive; 3rd-level default selected for Fireball; upcast to 4th selectable | COMB-02 | same + manual UAT |

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8): 26 SCs
Phase 9 adds: 3 SCs
New running total: **29 hardware-pending SCs** awaiting Even G2 + R1 hardware grant.

## Quality Gates (Final)

| Gate | Result |
|------|--------|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint:ci` (`biome ci`) | ✅ exit 0 |
| `pnpm test` (workspace) | ✅ **2036 tests passing across 125 files** (+178 from Phase 8's 1858 baseline) |
| INV-1 fixture matching | ✅ 4 Phase 9 economy fixtures + 4 slot-picker fixtures pass `matchAsciiFixture` (Plans 09-02 + 09-04) |
| 14-socketlib-handler invariant | ✅ confirmed in ISM-W9-10 + FM-ISM-W9-09: grep count = 14 (no new handlers) |
| T-09-03 single-attempt retry invariant | ✅ ISM-W9-06 + ISM-W9-07: consumeLatestConfirmed() returns null after [Y]; null on [N] |

## Plan Closure Signal

| Plan | Wave | Status | Key Commit(s) |
|------|------|--------|----------------|
| 09-01 | 0 | ✅ closed | see 09-01-SUMMARY.md |
| 09-02 | 1 | ✅ closed | see 09-02-SUMMARY.md |
| 09-03 | 2 | ✅ closed | see 09-03-SUMMARY.md |
| 09-04 | 3 | ✅ closed | see 09-04-SUMMARY.md |
| 09-05 | 4 | ✅ closed | `1fe7fa2` (ISM-W9 g2-app smoke) + `2d9f166` (FM-ISM-W9 foundry-module smoke) + closure commit (STATE + ROADMAP + VERIFICATION) |

## Invariant Confirmations

| Invariant | Status | Evidence |
|-----------|--------|---------|
| INV-1 Layout integrity | ✅ upheld | 8 INV-1 fixtures (Plans 09-02 + 09-04); no fixture regressions |
| INV-4 Code quality | ✅ upheld | typecheck + biome ci exit 0; no TODO without issue link |
| INV-5 Gesture Determinism | ✅ upheld | ActionOptionsModal preconditioner deterministic (AOM-PRE-01..05); SlotPickerPanel scroll/tap deterministic (SPP-01..12); zero-handler path console.warn only |
| 14-socketlib-handler count | ✅ upheld | ISM-W9-10 + FM-ISM-W9-09 grep confirms exactly 14 `socketlib.registerComplexHandler` calls (ADR-0011) |
| T-09-01 double trust boundary | ✅ upheld | action-economy-dispatcher outer/inner parse (AED-01..10); ISM-W9-02 end-to-end |
| T-09-03 single-attempt retry | ✅ upheld | consumeLatestConfirmed() deletes on access; ISM-W9-06 confirms null after [Y] |

## Phase 10 Readiness

Phase 10 (Polish & Field Test MVP) is unblocked.

**Depends on Phase 9 closure** — full action economy, concentration drop, slot picker, and multi-attack dedup are now software-complete. Hardware-pending SCs (SC-09-01..03) carry forward to ADR-0005 Branch A `human_needed` gate alongside the 26 prior SCs.
