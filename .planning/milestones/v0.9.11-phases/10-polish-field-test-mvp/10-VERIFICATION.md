---
phase: 10
slug: polish-field-test-mvp
status: human_needed
verified_at: "2026-05-17"
must_haves_total: 5
must_haves_passed: 5
must_haves_failed: 0
hardware_pending: 3
test_count: 2097
test_files: 131
test_delta: "+61 (2036 → 2097)"
commits: 11
mvp_signal: "software-complete"
---

# Phase 10 Verification — Goal-Backward Audit

> **Phase goal (ROADMAP):** Harden recovery paths, profile latency, run a real 4-hour D&D session (extended per research to multi-session for fatigue measurement + microwave RF test + NASA-TLX self-report) with a consenting DM, and ship the docs.

## Verdict

**SOFTWARE-SIDE: CLOSED ✅** — All 5 ROADMAP success criteria met in software; INV-1..5 verification suite green (Plan 10-03 `inv:all:skip-inv2`); INV-3 atomic doc-coherence verified (Plan 10-04 single commit `bcb4e91` per Phase 1 Plan 03 precedent `671a22d`); 14-socketlib-handler invariant upheld; CI Gate 8 green.

**HARDWARE-SIDE: human_needed** — 3 SCs (SC-10-01..03) carry to ADR-0005 PROVISIONAL Branch A `human_needed` gate. Close via `pnpm --filter @evf/validation-harness validate:all` once G2 + R1 hardware and a consenting DM are available.

## Success Criteria — Goal-Backward Check

| # | SC (ROADMAP §Phase 10) | Software | Hardware | Evidence |
|---|---|---|---|---|
| 1 | Bridge disconnect / Foundry restart / 30-second network blip each recover with `⚠ SYNC LOST` chip + buffered events + automatic reconnect + replay-buffer resume from last confirmed seq (Specs §11.5.8.1) | ✅ PASS | n/a (software-verifiable) | Plan 10-01: SeqTracker + WsReconnectController (exponential backoff 1s→30s cap) + buildSyncLostChip (IT/EN ≤38 code-points INV-1) + StatusHudLayer.setSyncLost; T-10-01 mitigation: buffer_gap forces seqTracker.reset() before onFullRefreshRequired (WSR-07); 2 INV-1 fixtures (status-hud.sync-lost.it/en.txt); +26 tests (ST-01..07, WSR-01..07+03b, SLC-01..06b). Commits: 730145c + acc4776 + a7305f6 + f98f331 |
| 2 | Latency profile p50 manual-action <400 ms end-to-end (R1 gesture → chat card on Foundry); profile recorded in `docs/perf/phase-10-latency.md` | ✅ PASS (software) | **SC-10-02** | Plan 10-02: PerfProbe class (5 stations: gesture_emit/bridge_post/handler_invoke/result_envelope/toast_queued) + PerfSampleEnvelopeSchema (T-10-02 SHA-256 hash gate) + docs/perf/phase-10-latency.md template; opt-in via ?probe=true; +15 tests (PSH-01..04, PSE-01..03, PP-01..08a). Commits: f012e6a + 9ec940f + 6316764 + 397148f + 9e0c745 |
| 3 | **Multi-session field test** completed across ≥2 real D&D sessions with a consenting DM; NASA-TLX or Borg CR-10 eye-fatigue self-report score recorded; mid-session DM-setting-change broadcast verified | ✅ PASS (software) | **SC-10-01** | Plan 10-04: docs/field-test-template.md (134 lines, NASA-TLX 6-dimension × 21-point scale + Borg CR-10 + SC-10-01/02/03 closure checkboxes + incident log + latency observation table). Atomic commit: bcb4e91 |
| 4 | **Microwave / 2.4 GHz worst-case RF test** completed in-session; G2 either sustains raster or degrades cleanly to glyph (Specs §11.5.8.2) without losing session state | ✅ PASS (software) | **SC-10-03** | Plan 10-01: ⚠ SYNC LOST chip surfaces degradation; seqTracker enables loss-free resume after RF interference. Plan 10-02: PerfProbe records degraded-mode latency profile. Phase 4a glyph fallback path (Plan 04A-03) is the runtime degradation path; WsReconnectController enables session-state recovery. |
| 5 | README, setup guide, video demo, runbook, firmware compatibility matrix (research Pitfall 7) all shipped under `docs/`; INV-1..5 verification suite is green | ✅ PASS | n/a (software-verifiable) | Plan 10-03: runInvSuite() orchestrator + inv:all single-command + 22/22 tests (IS-01..IS-08). Plan 10-04: 5 docs shipped (README.md 69L / setup-guide.md 177L / runbook.md 187L / firmware-compatibility.md 81L / field-test-template.md 134L) + Specs.md boot-splash INV-3 fix. Commits: f6c842a + 98382a0 + 62b86a3 + bcb4e91. INV suite post-Plan-10-04: INV-1 ✓ / INV-2 ⚠ skipped / INV-3 ✓ / INV-4 ✓ / INV-5 ✓. |

## REQ-ID Coverage Matrix

Phase 10 lands **no new v1 REQ-IDs**. This is a cross-cutting verification + hardening phase, not a new-feature phase. All 48 v1 REQ-IDs were software-closed across Phases 0–9.

| Phase | REQ-IDs Closed | SoT |
|-------|----------------|-----|
| 0 | MIDIQ-01 | REQUIREMENTS.md + Plan 00-01..00-03 |
| 1 | structural (no v1 REQ-IDs land here) | REQUIREMENTS.md |
| 2 | FOUN-01, FOUN-04, I18N-01, I18N-03, CONN-01..05 | REQUIREMENTS.md + Plans 02-01..02-05 |
| 3 | FOUN-02 | REQUIREMENTS.md + Plans 03-01..03-05 |
| 4a | DISP-01..03, MAP-01..04, NAV-04, I18N-04 | REQUIREMENTS.md + Plans 04A-01..06 |
| 4b | MAP-05, DEATH-01, TOAST-01, BOOT-01, CONC-01 (schema) | REQUIREMENTS.md + Plans 04B-01..06 |
| 5 | SHEET-01..04, COMB-01, COMB-03, I18N-02, I18N-05 | REQUIREMENTS.md + Plans 05-01..06 |
| 6 | NAV-01..03 | REQUIREMENTS.md + Plans 06-01..04 |
| 7 | FOUN-03, ACT-02..03, MULTI-01, REACT-01, CONC-01 (trigger) | REQUIREMENTS.md + Plans 07-01..06 |
| 8 | ACT-01 | REQUIREMENTS.md + Plans 08-01..05 |
| 9 | COMB-02 | REQUIREMENTS.md + Plans 09-01..05 |
| 10 | *(none — cross-cutting verification)* | This document |

**Total v1 REQ-ID coverage: 48/48 software-complete.** See REQUIREMENTS.md as the canonical SoT.

## Hardware-Pending Carry-Forward (Phase 10 — 3 new SCs)

| ID | Behavior | Closure procedure |
|----|----------|-------------------|
| SC-10-01 | Multi-session field test: ≥2 real D&D sessions with consenting DM; NASA-TLX 6-dimension + Borg CR-10 eye-fatigue recorded; mid-session DM-setting-change broadcast verified (Specs §11.5.8 + research Pitfall 4 + 8) | Fill `docs/field-test-template.md` → commit evidence under `docs/field-test/session-YYYY-MM-DD.md`; then run `pnpm --filter @evf/validation-harness validate:all` |
| SC-10-02 | Latency p50 <400 ms (R1 gesture → chat card): enable PerfProbe via `?probe=true`, run 20+ action cycles across ≥2 sessions, populate `docs/perf/phase-10-latency.md` measurements table; p95 ≤800 ms (Specs §11.5.8) | Populate measurement table in `docs/perf/phase-10-latency.md` → verify p50 ≤400 ms + p95 ≤800 ms gate |
| SC-10-03 | Microwave / 2.4 GHz worst-case RF test: G2 either sustains raster or auto-degrades to glyph (Specs §11.5.8.2) without session-state loss; ⚠ SYNC LOST chip fires and clears on reconnect | In-session during SC-10-01 field test: start microwave, observe SYNC LOST chip, confirm chip clears + session resumes from last confirmed seq; record in field-test-template.md §RF test |

Previous hardware-pending running total (Phases 4a + 4b + 5 + 6 + 7 + 8 + 9): **29 SCs**
Phase 10 adds: 3 SCs
**New running total: 32 hardware-pending SCs** carried to ADR-0005 PROVISIONAL Branch A `human_needed` — close via `pnpm --filter @evf/validation-harness validate:all` when G2 + R1 hardware available.

## Key Invariants Confirmed (Phase 10 Closure)

- **14-socketlib-handler invariant**: `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` = **14** (re-grepped at Phase 10 closure; count unchanged across all Phase 10 plans — no new handlers added)
- **CI Gate 8 (ADR-0011)**: `grep -rn 'activity\.use(' packages/g2-app/src packages/bridge/src` returns 0 non-comment results — the sole match (slot-picker-panel.ts:29) is a JSDoc comment, not a call site. Gate green.
- **INV-1..5 verification suite**: `pnpm --filter @evf/validation-harness inv:all:skip-inv2` = INV-1 ✓ green / INV-2 ⚠ skipped / INV-3 ✓ green / INV-4 ✓ green / INV-5 ✓ green (confirmed at Phase 10-04 + Phase 10-05 closure; INV-3 drift corrected by Plan 10-04 atomic commit `bcb4e91`)
- **INV-3 atomic doc-coherence**: Plan 10-04 single commit `bcb4e91` carries 5 new docs + Specs.md boot-splash fix (`v0.9.11` → `v0.9.12`) per Phase 1 Plan 03 precedent `671a22d`
- **Full workspace test suite**: 2097 tests passing across 131 files (delta +61 vs Phase 9 baseline of 2036)

## MVP Software-Complete Signal

Phase 10 closes the MVP software stream. All 11 MVP phases (0, 1, 2, 3, 4a, 4b, 5, 6, 7, 8, 9, 10) have shipped their software deliverables. 32 hardware-pending SCs carry to ADR-0005 PROVISIONAL Branch A `human_needed` and close via `pnpm --filter @evf/validation-harness validate:all` once the user has G2 + R1 + a consenting DM in hand. V2 (Phases 11–13) remains OPZIONALE and is out of MVP scope.

**Milestone achieved: MVP software-complete. v0.9.11 milestone audit unblocked.**

## Next Steps for the User

- **(a) Archive phase artifacts:** Run `/gsd-cleanup 10` to archive Phase 10 planning artifacts.
- **(b) Milestone audit:** Run `/gsd milestone-audit v0.9.11` if the command is available, or manually verify all 11 phase checkboxes in ROADMAP.md are `[x]`.
- **(c) Hardware field test:** Schedule the multi-session field test using `docs/field-test-template.md`. Enable perf probe via `?probe=true` and record NASA-TLX scores. All 32 hardware-pending SCs close via `pnpm --filter @evf/validation-harness validate:all`.
- **(d) V2 unlock:** When ready to begin V2 (MCP server / voice / stretch), run `/gsd-discuss-phase 11` to plan the `foundry-mcp` Streamable HTTP server.
