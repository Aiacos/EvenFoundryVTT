---
phase: 18
verified_date: 2026-05-18
status: passed
---

# Phase 18 Verification — Spec-Drift Polish + v0.9.13 Milestone Close

## Success Criteria

1. ✅ **UI-SPEC §2 spacing tokens reconciled** — `right-stop (z=0.5)` col 70 → col 67; `content-width (z=0.5 strip)` 66 cells → 64 cells (col 4 → col 67 inclusive); frame-corner enumeration {0, 71, 95} → {0, 68, 95}; central-divider note added explaining `║` sits at col 68 not col 71. Task 3, commit `a84f6a9`.
2. ✅ **UI-SPEC §10 width-budget table re-derived from fixtures** — label-separator 40 cells → 52 cells (raster State A) / 40 cells (glyph State C); stats strip 60 cells → 54 cells (raster State A) / 51 cells (glyph State C); combat-log cap ≤ 66 → ≤ 64; runtime-derivation note added explaining numbers were sourced from `packages/g2-app/src/status-hud/idle-infill-layer.ts` runtime literals via Option (a) doc-fix (lower-risk than re-padding fixtures, per UI-REVIEW Priority Fix 1). Task 3, commit `a84f6a9`.
3. ✅ **IT locale leak fix** — `glyph-scene.glyph-idle-z05.it.txt` Status HUD column (cols 69..95) corrected to IT-locale labels. Plan acknowledged rows 1+17 (TURNO 2/5 vs ROUND 3 · TURN 2/5; Condizioni vs Conditions); triade test exposed 4 additional rows: row 5 (PF vs HP), row 7 (CA 18 VEL 30 vs AC 18 SPD 30), row 9 (Az. vs Act), row 12 (Slot vs Slots) — all 6 rows fixed atomically per deviation Rule 2 (auto-add missing critical functionality, broader scope than plan called out). 96-col INV-1 width invariant preserved across all 24 rows. Task 2, commit `fe4d81f`.
4. ✅ **Z05-INV-02b extended to A_it ↔ B_it ↔ C_it triade** — regression-detection gap closed. Test exempts row 20 cols 89..93 `[GLY]` glyph-mode marker per UI-SPEC §6.3 (legitimate C-state-only indicator, NOT a locale leak) via surgical cell-skip that preserves regression detection on the rest of row 20 cols 69..88, 94..95. TDD discipline: RED commit `e064168` (test FAILED before fixture fix on row 5 col 70 `P` vs `H`) → GREEN commit `fe4d81f` (fixture fix applied; test passes). Task 1+2.
5. ✅ **INV-3 atomic close** — single commit ratifies Specs.md v0.9.12 → v0.9.13 bump + full changelog stanza + README badge + showcase version stat + STATE.md frontmatter complete + ROADMAP Phase 18 ✅ + REQUIREMENTS INFILL-14.1-A/B/C → Resolved + 18-VERIFICATION.md + (archived) 14-UI-SPEC.md §2/§10 + (archived) 14-UI-REVIEW.md WR-UI-* resolutions. Pattern continues Phase 14 `3a0c5cf` / Phase 15 `dc161d6` / Phase 16 `d68d7f2` / Phase 17 `c208d24` precedent. Task 4.

## Requirement IDs

- ✅ **INFILL-14.1-A** UI-SPEC §2 col-anchors drift (Task 3, commit `a84f6a9`)
- ✅ **INFILL-14.1-B** UI-SPEC §10 width-budget drift (Task 3, commit `a84f6a9`)
- ✅ **INFILL-14.1-C** IT locale leak + Z05-INV-02b triade extension (Tasks 1+2, commits `e064168` RED + `fe4d81f` GREEN)

## Quality Gates

- **Workspace tests:** 2667/2667 → **2668/2668** passing (+1 Z05-INV-02b-triade extension).
- **Typecheck:** `pnpm typecheck` exit 0.
- **Lint:** `pnpm lint:ci` exit 0.
- **CI Gate 8 socketlib handler count:** `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` = **17** preserved (no socketlib changes — Phase 18 is doc-only + 1 fixture + 1 test).
- **INV-1 (96×24 width invariant):** preserved across all `glyph-scene.glyph-idle-z05.it.txt` row mutations (every row × 96 codepoints, every column × 24 rows).
- **INV-2 (online cross-validation):** dnd5e 5.3.3 abilities + skills schema re-verified 2026-05-18 on `github.com/foundryvtt/dnd5e@release-5.3.3` + dnd5e wiki Roll-Formulas — cited in Specs.md v0.9.13 changelog stanza for Phase 16 + Phase 17. No new INV-2 work in Phase 18 (doc-coherence cleanup only).
- **INV-3 (documentation coherence):** single atomic commit touches Specs.md + README.md + docs/showcase/index.html + .planning/STATE.md + .planning/ROADMAP.md + .planning/REQUIREMENTS.md + 18-VERIFICATION.md per CLAUDE.md hard-gate.
- **INV-4 (code quality):** zero dead code; TypeScript strict + Biome lint clean; no new `// TODO` without issue/ADR link; tests precede implementation (TDD RED → GREEN).
- **INV-5 (gesture determinism):** untouched (no input-path changes in Phase 18 — fixture + test + docs only).

## Deviations

- **Rule 2 (auto-add missing critical functionality)** — plan text in 18-PLAN.md Task 2 acknowledged only rows 1 + 17 IT-locale leaks in `glyph-scene.glyph-idle-z05.it.txt`. The Z05-INV-02b-triade test's broader byte-identity contract (A_it ↔ B_it ↔ C_it cols 69..95 rows 3..20) surfaced 4 additional genuine IT-locale leaks in the same fixture (rows 5/7/9/12) — all are real IT-locale labels that A_it carries correctly but C_it had inherited from the EN baseline. All 6 rows (1, 5, 7, 9, 12, 17) fixed atomically in commit `fe4d81f` per Rule 2 — broader scope than plan acknowledged, but all are correctness fixes against the IT raster baseline (`glyph-scene.raster-idle-it.txt`). Documented in 14-UI-REVIEW.md WR-UI-03 resolution annotation.
- **Rule 1 (auto-fix bugs)** — Z05-INV-02b-triade test included row 20 cols 89..93 in its sweep (per literal plan text), but C_it row 20 cols 89..93 legitimately carry the `[GLY]` glyph-mode indicator per UI-SPEC §6.3 (NOT a locale leak — a state-marker visual contract). Triade test refined with surgical cell-skip `if (row === 20 && col >= 89 && col <= 93) continue;` — preserves regression detection on the rest of row 20 (cols 69..88, 94..95) so any accidental drift around the marker still fails. Documented in test comment + 14-UI-REVIEW.md WR-UI-03 resolution annotation.

## Hardware Verification

Carried forward — 35 SCs from v0.9.11 unchanged under ADR-0005 PROVISIONAL Branch A. Zero new hardware-pending SCs introduced by Phase 18 (doc-only + 1 fixture row-update + 1 test extension; no production code changes in `packages/*/src/`).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 RED | `e064168` | test(18): Z05-INV-02b triade extension exposes WR-UI-03 locale leak |
| 2 GREEN | `fe4d81f` | fix(shared-render): WR-UI-03 — IT locale leak in glyph-idle-z05 Status HUD |
| 3 DOC | `a84f6a9` | docs(18): WR-UI-01..03 — reconcile archived 14-UI-SPEC §2/§10 + cross-ref resolutions |
| 4 CLOSE | _(this commit — INV-3 atomic milestone close)_ | docs(phase-18): close Phase 18 + v0.9.13 milestone SHIPPED (INV-3 atomic) |

## Status

**PASSED — milestone v0.9.13 SHIPPED 2026-05-18.**

Next: `/gsd-audit-milestone` → `/gsd-complete-milestone v0.9.13` → `/gsd-cleanup` per v0.9.11 + v0.9.12 close pattern.
