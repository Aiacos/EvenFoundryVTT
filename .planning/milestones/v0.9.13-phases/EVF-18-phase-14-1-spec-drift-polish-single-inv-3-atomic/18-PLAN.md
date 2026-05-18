---
phase: 18
plan: 18
wave: 1
autonomous: true
gap_closure: false
files_modified:
  - packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt
  - packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts
  - .planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md
  - .planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-REVIEW.md
  - Specs.md
  - README.md
  - docs/showcase/index.html
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/phases/EVF-18-phase-14-1-spec-drift-polish-single-inv-3-atomic/18-VERIFICATION.md
task_count: 4
---

# Phase 18 — Plan: Spec-Drift Polish + v0.9.13 Milestone Close

## Objective

Close 3 UI-REVIEW WR-UI findings from Phase 14 (col-anchors drift WR-UI-02, width-budget drift WR-UI-01, IT locale leak in glyph-idle-z05 fixture WR-UI-03) in atomic commits, AND ship the v0.9.13 milestone-close artifacts (Specs.md v0.9.12 → v0.9.13 bump + changelog stanza + README + showcase). The phase culminates in a single INV-3 atomic ratification commit per Phase 14/15/16/17 precedent.

## Requirement IDs

INFILL-14.1-A, INFILL-14.1-B, INFILL-14.1-C

## Pre-conditions

- Phase 16 closed at commit `d68d7f2` (abilities); Phase 17 closed at commit `c208d24` (skills).
- Workspace tests: 2667/2667 green at Phase 17 close.
- CI Gate 8 socketlib handler count = 17 preserved.
- No production code changes in this plan — only fixture (1 file) + test (1 file) + docs (multiple).

## Task 1 — RED: Extend Z05-INV-02b to triade A_it ↔ B_it ↔ C_it

**Goal:** Add a third assertion to `z05-state-machine-fixtures.test.ts` that asserts byte-identity across cols 69..95 rows 3..20 for `glyph-scene.glyph-idle-z05.it.txt` (C_it) against A_it. This MUST fail on the current C_it fixture (row 17 col 71..82 mismatch: `Conditions` vs `Condizioni`; row 1 col 38..55 mismatch: `ROUND 3 · TURN 2/5` vs `TURNO 2/5`).

**Implementation:**
1. After the existing `Z05-INV-02b` test in `z05-state-machine-fixtures.test.ts:191-210`, add a new test:
   ```typescript
   it('Z05-INV-02b-triade (UI-SPEC §8.2 invariant 2 + WR-UI-03): right Status HUD column (cols 69..95) is byte-identical across triade A_it ↔ B_it ↔ C_it for rows 3..20', () => {
     // Closes WR-UI-03 regression-detection gap: original Z05-INV-02b only asserted
     // A_it ↔ B_it. C_it (glyph-scene.glyph-idle-z05.it.txt) was NOT in the byte-identity
     // chain, allowing the EN-baseline copy-paste leak (Conditions vs Condizioni, row 1
     // ROUND vs TURNO) to pass CI. Triade extension closes the gap.
     const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
     const gridC = loadSceneFixture('glyph-scene.glyph-idle-z05.it.txt');
     for (let row = 3; row <= 20; row++) {
       for (let col = 69; col <= 95; col++) {
         const a = gridA.at(col, row);
         const c = gridC.at(col, row);
         expect(
           c,
           `WR-UI-03 triade: C_it col ${col} row ${row} must match A_it (got A=${JSON.stringify(a)} C=${JSON.stringify(c)})`,
         ).toBe(a);
       }
     }
   });
   ```
2. Run `pnpm --filter @evf/g2-app test z05-state-machine` — verify the new test FAILS on row 17 col 71+ deltas (and possibly row 1 if cols 69..95 overlap the TURN/TURNO mismatch).
3. Commit: `test(18): RED — Z05-INV-02b triade extension exposes WR-UI-03 locale leak`

**Gate WAVE-18-G1:**
- Test file modified +1 new `it()` block.
- `pnpm --filter @evf/g2-app test z05-state-machine` exits NON-ZERO (RED).
- Commit hash recorded.

## Task 2 — GREEN: Fix IT fixture rows 1 + 17 locale leak

**Goal:** Update `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` to use IT-locale strings in rows 1 + 17. The 96-col width invariant must be preserved exactly.

**Implementation:**
1. Read current row 1: `║ MAP · Sala Banchetti · glyph        ROUND 3 · TURN 2/5         ⌁ R1 92%                      ║`
   - Per `raster-idle-it.txt:2`, the IT-locale baseline should read `TURNO 2/5` (not `ROUND 3 · TURN 2/5`).
   - Diff cells: cols 38..55 currently `ROUND 3 · TURN 2/5` (18 chars); replace with `TURNO 2/5` (9 chars) + 9 spaces padding to preserve 96-col width.
   - Verify exact column positions by reading the IT raster baseline `glyph-scene.raster-idle-it.txt:2` and matching.
2. Read current row 17: `║                                                                   ║ Conditions               ║`
   - Per `glyph-scene.raster-idle-it.txt:18`, IT baseline reads `Condizioni`.
   - Diff cells: cols 71..82 currently `Conditions` (10 chars); replace with `Condizioni` (10 chars) — same length, no padding adjustment.
3. Verify width invariant: `awk '{ if (length($0) != 96) print NR": "length($0) }' packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` must output nothing.
4. Re-run `pnpm --filter @evf/g2-app test z05-state-machine` — Z05-INV-02b-triade now PASSES.
5. Commit: `fix(shared-render): WR-UI-03 — IT locale leak in glyph-idle-z05 rows 1 + 17`

**Gate WAVE-18-G2:**
- Fixture rows 1 + 17 byte-updated.
- Width invariant preserved (96 codepoints per row).
- Z05-INV-02b-triade test PASSES (GREEN).
- All other Z05-INV-* tests still pass (no regression).
- Commit hash recorded.

## Task 3 — DOC: Update archived 14-UI-SPEC.md §2 + §10 (WR-UI-01 + WR-UI-02)

**Goal:** Reconcile archived UI-SPEC numeric tables with fixture bytes shipped in Phase 14. This is the "Option (a) lower-risk doc-only fix" per Phase 14 UI-REVIEW Priority Fix 1.

**Implementation:**
1. **§2 Spacing tokens table (WR-UI-02):**
   - Locate the row `right-stop (z=0.5)` → change `col 70` to `col 67`.
   - Locate the row `content-width (z=0.5 strip)` → change `66 cells (col 4 → col 69 inclusive)` to `64 cells (col 4 → col 67 inclusive)`.
   - Add a one-line note below the table: `> Note: Central divider \`║\` sits at col 68 (not col 71 as some older mockups show). Frame col 68 is the right edge of the z=0.5 content window; Status HUD owns cols 69..94 with frame col 95.`

2. **§10 Width-budget table (WR-UI-01):**
   - Reconcile to fixture bytes (Option (a) doc-fix):
     - Label-separator: change `40 cells (literal)` to `52 cells (literal, raster State A); 40 cells (glyph State C)`. Cite source as `LABEL_SEPARATOR_CONTENT` in `idle-infill-layer.ts`.
     - Stats strip canonical: change `60 cells (literal computed via STATS_STRIP_WIDTH)` to `54 cells (raster State A); 51 cells (glyph State C)`. Cite source as runtime literal.
   - Add a one-line note: `> The spec width-budget reflects what \`idle-infill-layer.ts\` constants emit; the 40/60 figures cited in earlier drafts were aspirational rounding and never matched the shipped fixtures. This row re-derived from runtime literals 2026-05-18.`

3. **14-UI-REVIEW.md cross-reference annotations:**
   - At WR-UI-01 entry, append: `**Resolution:** Closed in Phase 18 — UI-SPEC §10 re-derived from idle-infill-layer.ts runtime literals. See 18-PLAN.md Task 3.`
   - At WR-UI-02 entry, append: `**Resolution:** Closed in Phase 18 — UI-SPEC §2 col-anchors corrected to col 67/col 68. See 18-PLAN.md Task 3.`
   - At WR-UI-03 entry, append: `**Resolution:** Closed in Phase 18 — IT fixture rows 1+17 fixed + Z05-INV-02b-triade extension prevents regression. See 18-PLAN.md Task 1+2.`

4. Commit: `docs(18): WR-UI-01..03 — reconcile archived 14-UI-SPEC §2/§10 + cross-ref resolutions`

**Gate WAVE-18-G3:**
- §2 col-anchor numbers changed (70 → 67, 66 → 64).
- §10 width-budget numbers re-derived to fixture bytes (40 → 52, 60 → 54).
- §10 has the explanatory note re-derived from runtime.
- 14-UI-REVIEW.md has 3 Resolution annotations cross-referencing 18-PLAN.md.
- Commit hash recorded.

## Task 4 — CLOSE: INV-3 atomic milestone-close commit

**Goal:** Bundle all v0.9.13 milestone-close artifacts into ONE atomic commit per Phase 14 (3a0c5cf) / Phase 15 (dc161d6) / Phase 16 (d68d7f2) / Phase 17 (c208d24) precedent. This is the milestone-shipped event.

**Implementation:**

1. **Bump Specs.md version v0.9.12 → v0.9.13:**
   - Update header `**Version:** v0.9.12` → `v0.9.13`.
   - Add new changelog stanza near top of changelog section:
     ```
     ### v0.9.13 (2026-05-18) — Sheet Data Completion + Polish

     - **Phase 16 — Sheet Main tab abilities end-to-end** (commits 1336417 → d68d7f2). CharacterSnapshotSchema.abilities REQUIRED (`{value, mod, save, proficient, dc}` × 6 abilities); extractAbilities reader helper with defensive defaults + proficient boolean coercion; renderMainTab data binding replacing 14 cells of `—` placeholder with formatted values via `formatAbilityValue` + `formatAbilityMod` helpers; 4 INV-1 fixtures byte-updated (sheet.main.{2014.it,2024.it,2014.en,2014.de}.txt). SHEET-05/06/07 closed. INV-2: dnd5e 5.3.3 module/data/actor/templates/common.mjs + wiki Roll-Formulas — Re-verified ✓ 2026-05-18.
     - **Phase 17 — Sheet Skills tab + Main tab senses passives** (commits d2e0403 → c208d24). CharacterSnapshotSchema.skills REQUIRED (18 keys × `{total, ability, proficient, passive}` with closed `0|0.5|1|2` enum); extractSkills reader helper with SKILL_DEFAULT_ABILITY map; dynamic renderSkillsTab replacing DEFAULT_SKILLS hardcoded; SKILL_NAMES static i18n + PASSIVE_ABBR map; Main tab senses line populated with passive Perception/Insight/Investigation; 5 INV-1 fixtures (sheet.skills.it.txt byte-identical + new sheet.skills.en.txt + 4 sheet.main.* row-17 senses byte-update). SHEET-08/09/10 closed. INV-2: dnd5e 5.3.x skills schema — Re-verified ✓ 2026-05-18.
     - **Phase 18 — Phase-14.1 spec-drift polish** (this commit). Archived 14-UI-SPEC.md §2 col-anchors corrected (col 70 → col 67, content-width 66 → 64 cells); §10 width-budget table re-derived from runtime literals (label 40 → 52, stats 60 → 54); IT locale leak fix in glyph-scene.glyph-idle-z05.it.txt rows 1 + 17; Z05-INV-02b-triade test extension closes regression-detection gap. INFILL-14.1-A/B/C closed.
     - **Quality gates:** CI Gate 8 socketlib handler count = 17 preserved end-to-end (read-only extensions, no new handlers). Workspace tests 2546 → 2667 (+121 tests across milestone). All INV-1..5 verification suites green.
     - **Hardware verification:** 35 SCs from v0.9.11 carry under ADR-0005 PROVISIONAL Branch A unchanged (no new hardware-pending SCs this milestone).
     - **Out of scope (carried forward):** RTL languages (ADR-0007), Spells tab DC binding (primed by abilities.dc), STRETCH-01..05/07/08 (deferred per Phase 13 minimal scope), Picovoice Rhino edge classifier (conditional on hardware SC-12-01 measurement).
     ```

2. **README.md updates:**
   - Version badge `v0.9.12` → `v0.9.13`.
   - In the "Status" / "Milestones shipped" section, add a v0.9.13 entry: `**v0.9.13 (2026-05-18) — Sheet Data Completion + Polish.** Character sheet Main + Skills tabs fully data-bound; Phase-14.1 spec-drift polish closes 3 advisory UI-REVIEW findings. Workspace tests 2667/2667 green. 3 phases (16–18), 7 plans, 9/9 v1 REQ-IDs closed. Software-only — zero new hardware-pending SCs.`
   - Update any badges showing test counts or phase counts.

3. **docs/showcase/index.html updates:**
   - Hero version stat `v0.9.12` → `v0.9.13`.
   - Update any footer/stat-strip references mentioning Sheet panel state.
   - Add a closing paragraph (or extend existing) noting v0.9.13 milestone shipped: Sheet data binding complete + polish.

4. **.planning/STATE.md updates:**
   - Frontmatter: `status: complete` for milestone v0.9.13.
   - `last_updated`: 2026-05-18 (or current ISO timestamp).
   - Current Position: clear active phase; note milestone shipped.
   - Recent Trend: prepend v0.9.13 close entry summarizing phases 16/17/18 + tests + commits.
   - Decisions: log Phase 18 close decisions (Option (a) doc-fix for §10, triade extension TDD).

5. **.planning/ROADMAP.md updates:**
   - Mark Phase 18 ✅ in the v0.9.13 section.
   - Progress table: v0.9.13 row → `3/3 phases, 7/7 plans, ✅ Shipped, 2026-05-18`.
   - Move v0.9.13 details into a `<details>` collapsed archive section matching v0.9.11/v0.9.12 pattern (or leave inline until cleanup phase moves it).

6. **.planning/REQUIREMENTS.md updates:**
   - Mark INFILL-14.1-A, INFILL-14.1-B, INFILL-14.1-C as Resolved (Phase 18).
   - Update milestone status to `**SHIPPED 2026-05-18**`.
   - Coverage: 9/9 v1 REQ-IDs Resolved.

7. **Create 18-VERIFICATION.md:**
   ```markdown
   ---
   phase: 18
   verified_date: 2026-05-18
   status: passed
   ---

   # Phase 18 Verification — Spec-Drift Polish + v0.9.13 Milestone Close

   ## Success Criteria

   1. ✅ **UI-SPEC §2 spacing tokens reconciled** — col 67 right-stop + content-width 64 cells + central divider note added (Task 3, commit {hash}).
   2. ✅ **UI-SPEC §10 width-budget table re-derived from fixtures** — label 52 cells / stats 54 cells (raster) + 40/51 (glyph) + runtime-derivation note added (Task 3).
   3. ✅ **IT locale leak fix** — `glyph-scene.glyph-idle-z05.it.txt` rows 1 + 17 corrected to IT strings; 96-col width preserved; Z05-INV-02b-triade test passes (Tasks 1+2).
   4. ✅ **Z05-INV-02b extended to A_it ↔ B_it ↔ C_it triade** — regression-detection gap closed (Task 1 commit {hash}).
   5. ✅ **INV-3 atomic close** — Specs.md v0.9.13 + README + showcase + STATE.md + ROADMAP.md + REQUIREMENTS.md + 18-VERIFICATION.md + 14-UI-SPEC.md (archived) + 14-UI-REVIEW.md (archived) all in single commit (Task 4).

   ## Requirement IDs

   - ✅ **INFILL-14.1-A** UI-SPEC §2 col-anchors drift (Task 3)
   - ✅ **INFILL-14.1-B** UI-SPEC §10 width-budget drift (Task 3)
   - ✅ **INFILL-14.1-C** IT locale leak + Z05-INV-02b triade extension (Tasks 1+2)

   ## Quality Gates

   - Workspace tests: 2667/2667 → 2668/2668 (Z05-INV-02b-triade +1).
   - Typecheck: `pnpm typecheck` exit 0.
   - Lint: `pnpm lint:ci` exit 0.
   - CI Gate 8 socketlib handler count = 17 preserved.
   - INV-1 (96×24 width invariant): preserved.
   - INV-2: dnd5e 5.3.3 schema re-verified 2026-05-18 (cited in Specs.md v0.9.13 changelog).
   - INV-3: single atomic commit touches Specs.md + README + showcase + planning artifacts.
   - INV-4: zero dead code; TypeScript strict + Biome lint green.
   - INV-5: gesture determinism untouched (no input-path changes).

   ## Hardware Verification

   Carried forward — 35 SCs from v0.9.11 unchanged under ADR-0005 PROVISIONAL Branch A.

   ## Status

   PASSED — milestone v0.9.13 SHIPPED 2026-05-18.
   ```

8. **Verify workspace integrity before commit:**
   - `pnpm test` → 2668/2668 green.
   - `pnpm typecheck` → exit 0.
   - `pnpm lint:ci` → exit 0.
   - `git grep -c socketlib.registerComplexHandler packages/foundry-module/src/pair/socketlib-handlers.ts` → 17.
   - `awk '{ if (length($0) != 96) print NR": "length($0) }' packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` → no output.

9. **Atomic commit:**
   ```
   gsd-sdk query commit "docs(phase-18): close Phase 18 + v0.9.13 milestone SHIPPED (INV-3 atomic)" --files <all-modified-files>
   ```
   - Files: Specs.md, README.md, docs/showcase/index.html, .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, .planning/phases/EVF-18-phase-14-1-spec-drift-polish-single-inv-3-atomic/18-VERIFICATION.md.

10. Commit Task 4 closes the phase + milestone.

**Gate WAVE-18-G4 (INV-3 atomic):**
- Specs.md header version → v0.9.13.
- Specs.md changelog has v0.9.13 stanza.
- README version badge → v0.9.13.
- Showcase version stat → v0.9.13.
- STATE.md frontmatter `status: complete` for v0.9.13.
- ROADMAP.md Phase 18 ✅ + v0.9.13 row Shipped.
- REQUIREMENTS.md INFILL-14.1-A/B/C → Resolved.
- 18-VERIFICATION.md frontmatter `status: passed`.
- All in single commit.
- Workspace 2668/2668 green; typecheck + lint:ci clean; CI Gate 8 = 17.

## Threat Model

- **No external input boundary changes.** Doc-only + 1 fixture row + 1 test extension.
- **Schema validation gate unchanged** — no production code in `packages/*/src/` touched (except fixture file which is build-time INV-1 contract, not runtime).
- **Doc coherence (INV-3) — high severity if missed.** Mitigation: single atomic commit; pre-commit hook + post-commit verify.
- **No CI Gate 8 impact** — socketlib count untouched.
- **No supply-chain impact** — no dependency changes.

## Success Criteria (Phase 18 final)

1. UI-SPEC §2 internal consistency restored (col-anchors match fixture bytes).
2. UI-SPEC §10 width-budget table reconciled to runtime literals (no drift).
3. IT-locale fixture leak corrected (rows 1 + 17).
4. Z05-INV-02b extended to triade A_it ↔ B_it ↔ C_it (regression catch).
5. v0.9.13 milestone SHIPPED via INV-3 atomic ratification commit.
6. All quality gates green (tests + typecheck + lint + CI Gate 8).
