---
phase: 18
plan: 18
subsystem: spec-drift-polish + milestone-close
tags: [polish, inv-3-atomic, milestone-close, tdd, it-locale, ui-spec-reconciliation]
requires: [Phase 14 INV-3 atomic 3a0c5cf, Phase 15 INV-3 atomic dc161d6, Phase 16 INV-3 atomic d68d7f2, Phase 17 INV-3 atomic c208d24]
provides: [INFILL-14.1-A Resolved, INFILL-14.1-B Resolved, INFILL-14.1-C Resolved, v0.9.13 SHIPPED]
affects: [Specs.md, README.md, docs/showcase/index.html, .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, .planning/milestones/v0.9.12-phases/EVF-14/14-UI-SPEC.md, .planning/milestones/v0.9.12-phases/EVF-14/14-UI-REVIEW.md, packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt, packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts]
tech-stack:
  added: []
  patterns: [TDD RED-GREEN gate, INV-3 atomic single-commit milestone close, surgical test-scope cell-skip for legitimate state markers, broader-than-plan auto-fix per deviation Rule 2]
key-files:
  created: [.planning/phases/EVF-18-phase-14-1-spec-drift-polish-single-inv-3-atomic/18-VERIFICATION.md]
  modified: [Specs.md, README.md, docs/showcase/index.html, .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, .planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md, .planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-REVIEW.md, packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt, packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts]
decisions:
  - "[D-1] Option (a) doc-fix for §10 width-budget reconciliation (lower-risk than re-padding fixtures, per UI-REVIEW Priority Fix 1)"
  - "[D-2] TDD discipline for the test extension: RED commit before GREEN proves test catches regression"
  - "[D-3] Triade test exposed 4 IT-locale leaks beyond plan-acknowledged rows 1+17; all 6 leaks fixed atomically per deviation Rule 2 (auto-add missing critical functionality)"
  - "[D-4] [GLY] state-marker exemption: surgical cell-skip row 20 cols 89..93 instead of dropping row 20 from sweep (preserves regression detection on the rest of the row)"
  - "[D-5] INV-3 atomic milestone-close commit pattern continues Phase 14/15/16/17 precedent"
metrics:
  duration_min: 17
  completed_date: 2026-05-18
  tasks: 4
  commits: 4
  files_modified: 10
  files_created: 1
---

# Phase 18 Plan 18: Spec-Drift Polish + v0.9.13 Milestone Close Summary

Single INV-3 atomic milestone-close phase closing 3 advisory UI-REVIEW findings from Phase 14 + bumping Specs.md v0.9.12 → v0.9.13 + shipping v0.9.13 Sheet Data Completion + Polish (9/9 v1 REQ-IDs Resolved, software-only).

## Tasks completed

| Task | Type | Commit | Description |
|------|------|--------|-------------|
| 1 | RED (TDD) | `e064168` | `test(18)`: Z05-INV-02b triade extension exposes WR-UI-03 locale leak — new test added BEFORE fixture fix; verified failing on row 5 col 70 (`P` vs `H`). |
| 2 | GREEN (TDD) | `fe4d81f` | `fix(shared-render)`: WR-UI-03 — IT locale leak in `glyph-scene.glyph-idle-z05.it.txt` Status HUD column (rows 1/5/7/9/12/17 — TURNO + PF + CA 18 VEL 30 + Az. + Slot + Condizioni IT-locale restored); test scope refined with surgical `[GLY]` exemption (row 20 cols 89..93 per UI-SPEC §6.3). |
| 3 | DOC | `a84f6a9` | `docs(18)`: WR-UI-01..03 — reconcile archived `14-UI-SPEC.md` §2 col-anchors (col 70 → 67, content-width 66 → 64 cells, divider note added, frame-corner enumeration {0,71,95} → {0,68,95}) + §10 width-budget table re-derived from `idle-infill-layer.ts` runtime literals (Option (a) doc-fix: label 40 → 52/40 raster/glyph; stats 60 → 54/51); `14-UI-REVIEW.md` WR-UI-01/02/03 resolution annotations added cross-referencing Phase 18 tasks. |
| 4 | INV-3 CLOSE | `df4ea02` | `docs(phase-18)`: close Phase 18 + v0.9.13 milestone SHIPPED (INV-3 atomic) — bundles Specs.md v0.9.13 bump + changelog stanza + README badge + showcase + STATE.md frontmatter complete + ROADMAP Phase 18 ✅ + REQUIREMENTS INFILL-14.1-A/B/C → Resolved + 18-VERIFICATION.md in a single atomic commit per Phase 14/15/16/17 precedent. |

## Decisions made

- **D-1 Option (a) doc-fix for §10 width-budget reconciliation.** UI-REVIEW Priority Fix 1 offered two paths: (a) re-derive UI-SPEC §10 numbers from `idle-infill-layer.ts` runtime literals (doc-only INV-3 atomic commit), or (b) re-pad the 3 z=0.5 strips in State A fixtures + glyph stats strip to the spec'd widths (40/53/60) regenerating snapshots + Z05-FX-01..03. Option (a) selected as lower-risk; it leaves all shipped fixtures byte-stable and doesn't invalidate the Z05-FX-* round-trip contract. Documented in commit `a84f6a9` body + UI-SPEC §10 explanatory note.

- **D-2 TDD discipline for the test extension.** Per 18-PLAN.md and the planning context's Area 1, the Z05-INV-02b triade extension was committed BEFORE the fixture fix (RED commit `e064168`) to prove the test catches the regression rather than tautologically passing post-fix. The RED commit verified non-zero exit and a concrete failure pointer (row 5 col 70 `P` vs `H`); the subsequent GREEN commit `fe4d81f` flips it to passing. This locks future C_it modifications against silent re-introduction of the same locale-leak pattern.

- **D-3 Broader-scope locale-leak fix per deviation Rule 2.** Plan text in Task 2 acknowledged only rows 1 + 17 IT-locale leaks. The Z05-INV-02b-triade test's byte-identity contract (A_it ↔ B_it ↔ C_it for cols 69..95 rows 3..20) surfaced 4 additional genuine IT-locale leaks in the same fixture (rows 5: PF vs HP; row 7: CA 18 VEL 30 vs AC 18 SPD 30; row 9: Az. vs Act; row 12: Slot vs Slots). All 6 rows fixed atomically — broader scope than plan acknowledged but all genuine IT-locale leaks against the IT raster baseline. Documented in commit `fe4d81f` body + 14-UI-REVIEW.md WR-UI-03 resolution annotation + STATE.md Decisions D-3.

- **D-4 `[GLY]` state-marker exemption via surgical cell-skip.** C_it row 20 cols 89..93 carry `[GLY]` (glyph-mode indicator per UI-SPEC §6.3); A_it has those cols as spaces. Triade test refined with `if (row === 20 && col >= 89 && col <= 93) continue;` — preserves regression detection on the rest of row 20 (cols 69..88, 94..95) so any future drift around the marker still fails. Choice preserves UI-SPEC §6.3 visual contract AND the triade test's tight regression net.

- **D-5 INV-3 atomic close per Phase 14/15/16/17 precedent.** Single commit covers Specs.md v0.9.12 → v0.9.13 bump + full changelog stanza + README badge + showcase version stat + STATE.md frontmatter complete + ROADMAP Phase 18 ✅ + REQUIREMENTS INFILL-14.1-A/B/C → Resolved + 18-VERIFICATION.md + (archived) 14-UI-SPEC.md §2/§10 + (archived) 14-UI-REVIEW.md WR-UI-* resolutions. Pattern continues `3a0c5cf` / `dc161d6` / `d68d7f2` / `c208d24`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Auto-add missing critical functionality] Broader-scope IT-locale-leak fix in C_it**
- **Found during:** Task 1 RED execution — the new Z05-INV-02b-triade test (per plan-supplied invariant text "byte-identical across triade A_it ↔ B_it ↔ C_it for cols 69..95 rows 3..20") FAILED on multiple rows beyond the 2 (rows 1 + 17) acknowledged in 18-PLAN.md Task 2.
- **Issue:** C_it Status HUD column (cols 69..95) had wholesale-copy-pasted from the EN baseline (`glyph-scene.raster-idle.txt`), leaking EN-locale labels on rows 1/5/7/9/12/17. The plan's spot-check identified only rows 1 + 17.
- **Fix:** All 6 rows fixed atomically in Task 2 GREEN commit `fe4d81f`. The fix replaces cols 69..95 of rows 5/7/9/12/17 with the byte-identical content from A_it (`glyph-scene.raster-idle-it.txt`); row 1 additionally rebalances the prefix padding because `glyph` mode label is 1 char shorter than `raster`.
- **Files modified:** `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` (rows 1, 5, 7, 9, 12, 17).
- **Commit:** `fe4d81f`.

**2. [Rule 1 - Bug-style refinement] Triade test scope refined for `[GLY]` state-marker**
- **Found during:** Task 1 RED execution.
- **Issue:** Literal plan-supplied test sweeps cols 69..95 rows 3..20 with no exemptions. C_it row 20 cols 89..93 legitimately carry the `[GLY]` glyph-mode indicator per UI-SPEC §6.3 — a state-marker, NOT a locale leak. Including the 5 marker cells in the byte-identity sweep would either force removal of the legit indicator OR force the test to fail forever.
- **Fix:** Surgical 5-cell skip in the triade test inner loop (`if (row === 20 && col >= 89 && col <= 93) continue;`) with documented comment + UI-SPEC §6.3 cross-reference. Preserves regression detection on the rest of row 20 (cols 69..88, 94..95).
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts`.
- **Commit:** `fe4d81f` (bundled with the fixture fix in the GREEN commit since both together satisfy the GREEN gate).

## Authentication gates

None — Phase 18 is doc-only + 1 fixture + 1 test extension; no external service or hardware interaction.

## Quality gates

- ✅ `pnpm test` — **2667 → 2668** workspace tests passing (+1 Z05-INV-02b-triade).
- ✅ `pnpm typecheck` — exit 0.
- ✅ `pnpm lint:ci` — exit 0 (warnings tolerated; no new lint failures introduced).
- ✅ CI Gate 8 socketlib handler count: `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` = **17** preserved (no socketlib changes).
- ✅ INV-1 96×24 width invariant preserved on all 24 rows of `glyph-scene.glyph-idle-z05.it.txt` (verified via Node codepoint counter).
- ✅ INV-3 atomic single-commit close — `df4ea02` touches Specs.md + README.md + docs/showcase/index.html + .planning/STATE.md + .planning/ROADMAP.md + .planning/REQUIREMENTS.md + 18-VERIFICATION.md per CLAUDE.md hard-gate.

## Milestone close

**v0.9.13 Sheet Data Completion + Polish SHIPPED 2026-05-18.**

- **3 phases (16–18), 7/7 plans, 9/9 v1 REQ-IDs Resolved.**
- **Workspace tests:** 2559 → 2668 (+109 across milestone: +89 Phase 16, +22 Phase 17, +1 Phase 18 triade).
- **CI Gate 8 socketlib handler count = 17 preserved end-to-end** across the milestone — both Sheet phases are pure read-path extensions, no new socketlib handlers; Phase 18 is doc-only + 1 fixture + 1 test extension.
- **Software-only — zero new hardware-pending SCs.** 35 SCs from v0.9.11 carry under ADR-0005 PROVISIONAL Branch A unchanged.
- **INV-2 cross-checked ✓ 2026-05-18**: dnd5e 5.3.3 canonical `actor.system.{abilities,skills}.<key>.*` schema re-verified on `github.com/foundryvtt/dnd5e@release-5.3.3` `module/data/actor/templates/common.mjs` + dnd5e wiki Roll-Formulas. Cited in Specs.md v0.9.13 changelog stanza for Phase 16 + Phase 17.

## Self-Check: PASSED

**Created files exist:**
- ✓ `.planning/phases/EVF-18-phase-14-1-spec-drift-polish-single-inv-3-atomic/18-VERIFICATION.md`
- ✓ `.planning/phases/EVF-18-phase-14-1-spec-drift-polish-single-inv-3-atomic/18-SUMMARY.md` (this file)

**Commits exist:**
- ✓ `e064168` test(18): RED — Z05-INV-02b triade extension exposes WR-UI-03 locale leak
- ✓ `fe4d81f` fix(shared-render): WR-UI-03 — IT locale leak in glyph-idle-z05 Status HUD
- ✓ `a84f6a9` docs(18): WR-UI-01..03 — reconcile archived 14-UI-SPEC §2/§10 + cross-ref resolutions
- ✓ `df4ea02` docs(phase-18): close Phase 18 + v0.9.13 milestone SHIPPED (INV-3 atomic)

**Next:** `/gsd-audit-milestone` → `/gsd-complete-milestone v0.9.13` → `/gsd-cleanup` per v0.9.11 + v0.9.12 close pattern.
