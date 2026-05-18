# Phase 18: Phase-14.1 Spec-Drift Polish (single INV-3 atomic) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), 3 grey areas accepted-all on Phase 14/15/16/17 INV-3 atomic precedent

<domain>
## Phase Boundary

Close 3 UI-REVIEW WR-UI findings from Phase 14 (col-anchors drift, width-budget drift, IT locale leak in glyph-idle-z05 fixture) in a single INV-3 atomic commit, AND ship the v0.9.13 milestone-close artifacts (Specs.md v0.9.12 → v0.9.13 bump with changelog stanza + README badge + showcase version stat). Mostly doc + 1 fixture edit + 1 test extension; zero implementation defects to fix. Brings UI-SPEC numeric tables back into byte-identity with the actual fixtures shipped in Phase 14.

After Phase 18 INV-3 atomic close, run audit-milestone → complete-milestone → cleanup per the standard milestone-close sequence.

**Explicitly out of scope:**
- New features — Phase 18 is purely doc-coherence + 1 fixture byte-fix.
- Behavior changes — no production code touched in `packages/*/src/` (only fixture + tests).
- v0.9.13 retrospective beyond what the INV-3 atomic commit captures.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Scope of Phase 18 atomic

- **Update archived `14-UI-SPEC.md`** at `.planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md`. The archived spec is still the binding contract for Z05 fixture round-trip; future contributors read the archived UI-SPEC. INV-3 carries through archives.
- **Two-pronged INFILL-14.1-C fix:** correct the fixture rows 1+17 IT-locale leak AND extend Z05-INV-02b to triade A_it ↔ B_it ↔ C_it byte-identity for rows 3..20 cols 69..95. The test extension closes the regression-detection gap that allowed the original WR-UI-03 to ship.
- **Single INV-3 atomic commit** bundles all Phase 18 changes (doc fixes + fixture + test + milestone-close artifacts). One PLAN file (18-PLAN.md, not 18-01..N). Matches REQUIREMENTS.md "single INV-3 atomic" scoping.
- **TDD discipline for the test extension:** RED first (extend Z05-INV-02b WITHOUT fixing the fixture → test fails on C_it row 1/17 deltas), then GREEN (apply fixture fix → test passes). This proves the test catches the regression rather than tautologically passing.

### Area 2: Milestone-close artifacts

- **Bump `Specs.md` v0.9.12 → v0.9.13.** Update header version, add changelog stanza summarizing Phase 16 (abilities) + Phase 17 (skills) + Phase 18 (spec-drift polish). INV-2 sources re-verified 2026-05-18 (dnd5e 5.3.3 schema) already in REQUIREMENTS.md → cite in changelog.
- **README badge + relevant section updates.** Version badge v0.9.12 → v0.9.13. Add a milestone-shipped paragraph noting Sheet Main + Skills tabs now data-bound, plus Phase-14.1 polish done. INV-3 projection must stay coherent.
- **Showcase (`docs/showcase/index.html`) updates.** Hero version stat → v0.9.13. Footer + closing paragraph note Sheet data completion. INV-3 projection.
- **Changelog entry includes the Phase 14 carry-forward closure** with explicit `Re-verified ✓ 2026-05-18` for INV-2 sources (dnd5e common.mjs + wiki Roll-Formulas).

### Area 3: Audit + cleanup sequence

- **Sequence:** Phase 18 INV-3 atomic close commit → `Skill(gsd-audit-milestone)` → `Skill(gsd-complete-milestone v0.9.13)` → `Skill(gsd-cleanup)`. Same sequence as v0.9.11 / v0.9.12 close pattern.
- **Skip standalone code-review** — Phase 14/15/16/17 closed without separate code-review skill runs; autonomous-mode pragma. Quality gates green (2667/2667 tests, lint:ci clean, typecheck clean, CI Gate 8 = 17).
- **Single 18-PLAN.md** (no 18-01/18-02 split). REQUIREMENTS.md scopes Phase 18 as "single INV-3 atomic"; ROADMAP says "~1-2 plans" with 1 as the canonical choice.

### Claude's Discretion

- Specific Specs.md changelog stanza wording (executor crafts during plan execution).
- README/showcase paragraph wording.
- Exact Z05-INV-02b triade extension test code shape (RED commit + GREEN commit pattern).
- Whether to delete the now-obsolete WR-UI-01..03 entries from 14-UI-REVIEW.md (probably leave them as historical record, mark as RESOLVED via Phase-14.1 → Phase 18 cross-reference).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md` — archived UI-SPEC §2 + §10 drift to fix.
- `.planning/milestones/v0.9.12-phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-REVIEW.md` — full WR-UI-01/02/03 findings + Priority Fix sections. Source-of-truth for the fix specs.
- `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` — rows 1 + 17 IT-locale leak to fix.
- `packages/shared-render/src/__tests__/z05-state-machine-fixtures.test.ts` (or similar location) — Z05-INV-02b test to extend to triade IT.
- `Specs.md` — version header at top, changelog section at bottom, v0.9.12 stanza to extend to v0.9.13.
- `README.md` — version badge + showcase section.
- `docs/showcase/index.html` — hero version stat + footer.

### Established Patterns
- INV-3 atomic single-commit milestone close: Phase 14 `3a0c5cf` / Phase 15 `dc161d6` / Phase 16 `d68d7f2` / Phase 17 `c208d24` precedent.
- Specs.md version bump pattern: header version line + changelog stanza with Re-verified ✓ for INV-2 sources.
- TDD discipline for test extension: RED commit (test fails on the existing-but-broken state) → GREEN commit (apply fix → test passes).
- Audit → Complete → Cleanup sequence after final phase close (v0.9.11 + v0.9.12 close patterns).

### Integration Points
- INV-3 cross-cutting commit touches: Specs.md + README + showcase + STATE.md + ROADMAP.md + REQUIREMENTS.md + 18-VERIFICATION.md + 14-UI-SPEC.md (archived) + 14-UI-REVIEW.md (archived, mark resolved) + glyph-scene.glyph-idle-z05.it.txt + z05-state-machine-fixtures.test.ts. All atomic.
- No CI Gate 8 socketlib impact (no socketlib changes).
- No production code touched (no security review needed).

</code_context>

<specifics>
## Specific Ideas

- **WR-UI-02 fix (UI-SPEC §2):**
  - `right-stop (z=0.5)` row → change col 70 → col 67
  - `content-width (z=0.5 strip)` row → change 66 cells → 64 cells (col 4 → col 67 inclusive)
  - Add one-line note: "Central divider `║` sits at col 68 (not col 71 as some older mockups show)."
- **WR-UI-01 fix (UI-SPEC §10):**
  - Reconcile to fixture bytes: label-separator = 52 cells (not 40), stats strip = 54 cells (not 60). Glyph-mode stats strip = 51 cells (state C exception).
  - OR: re-pad the fixtures to spec's 40/60 cells. **Choose Option (a) doc-fix per UI-REVIEW Priority Fix 1 recommendation: "Option (a) is lower risk (doc-only INV-3 atomic commit)".**
- **WR-UI-03 fix (IT locale leak):**
  - `glyph-scene.glyph-idle-z05.it.txt` row 1 cols 38..55: `ROUND 3 · TURN 2/5` → `TURNO 2/5` (pad to preserve 96-col width per `raster-idle-it.txt:2`).
  - `glyph-scene.glyph-idle-z05.it.txt` row 17 cols 71..82: `Conditions` → `Condizioni  ` (pad to preserve 96-col width).
- **Z05-INV-02b triade extension:**
  - Existing test: A_it ↔ B_it byte-identity for cols 69..95 rows 3..20.
  - Extension: add C_it (`glyph-scene.glyph-idle-z05.it.txt`) to the chain: A_it ↔ B_it ↔ C_it for cols 69..95 rows 3..20.
  - TDD: commit the test extension BEFORE the fixture fix (RED proof — test fails on row 17 col 71..82 mismatch); then commit the fixture fix (GREEN).
- **Specs.md v0.9.13 changelog stanza** structure:
  - Heading: `### v0.9.13 (2026-05-18) — Sheet Data Completion + Polish`
  - Bullets:
    - Phase 16: Sheet Main tab abilities end-to-end (CharacterSnapshotSchema.abilities + extractAbilities + renderMainTab + 4 fixture byte-updates). 3 REQ-IDs closed. INV-2 cross-checked dnd5e 5.3.3 common.mjs + wiki Roll-Formulas (Re-verified ✓ 2026-05-18).
    - Phase 17: Sheet Skills tab + Main tab senses passives (CharacterSnapshotSchema.skills + extractSkills + dynamic renderSkillsTab + 5 fixtures). 3 REQ-IDs closed. INV-2 re-confirmed.
    - Phase 18: Phase-14.1 spec-drift polish (UI-SPEC §2/§10 reconciliation + IT locale leak fix + Z05-INV-02b triade IT). 3 INFILL-14.1-* sub-items closed. Doc-coherence cleanup.
    - CI Gate 8 socketlib handler count = 17 preserved end-to-end (read-only extensions).
    - Workspace tests: 2546 → 2667 (+121 across milestone).
    - Hardware verification: 35 SCs from v0.9.11 carry under ADR-0005 Branch A unchanged.
- **No new V2 surface** — milestone scoped intentionally narrow.

</specifics>

<deferred>
## Deferred Ideas

- Spells tab DC binding (primed by Phase 16 abilities.dc; not implemented this milestone).
- Inventory/Bio/Feats tab polish — outside scope.
- Hardware UAT closure — ADR-0005 Branch A carries unchanged.
- Sketch / playground / spike of next-milestone candidates — out of v0.9.13 scope.

</deferred>
