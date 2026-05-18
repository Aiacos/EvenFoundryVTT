---
phase: 14-raster-z-0-5-idle-content-infill
audit_date: 2026-05-17
auditor: gsd-ui-auditor (Claude Opus 4.7 1M)
baseline: 14-UI-SPEC.md (committed 4391261) + INV-1 fixtures + Specs §7.4c + ADR-0001 Amendment 1
rubric: 6-pillar (hardware-AR adapted — Even Realities G2 576×288 4-bit phosphor green)
screenshots: not captured (hardware target G2 glasses; no dev server; visual contract IS the ASCII fixtures)
status: advisory_non_blocking
phase_status_at_audit: closed_and_verified (commit 3a0c5cf — Verification 5/5, Review 0 BLK + 4 WR fixed + 7 INFO deferred)
---

# Phase 14 — UI Review (Retroactive, Advisory)

> **Stance.** This is an adversarial visual + interaction audit run AFTER ratification (code-review + verification both green). Scoring is NOT averaged upward to soften the picture; every score below cites concrete file:line evidence. The rubric is hardware-AR adapted per the project brief — there is no CSS, no DOM, no breakpoints. The visual contract IS the 96×24 ASCII fixture set + Specs.md §7.4c container budget + ADR-0001 Amendment 1.
>
> **Outcome.** Strong overall delivery. Two warnings worth a Phase-14.1 quick fix in the UI-SPEC itself (numbers in §2 and §10 don't match the bytes the fixtures actually contain). One additional warning on locale leakage in the State C fixture. Zero blockers — the implementation, the test suite, and the ADR ratification are all internally consistent; the gap is between the *prose* spec and the *byte* spec.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copy / Tone | 3/4 | IT/EN string contract holds; 1 locale-leak in `glyph-scene.glyph-idle-z05.it.txt:17` (EN `Conditions` instead of `Condizioni`); IT header row 1 drops `ROUND 3 ·` while EN+glyph-IT keep it |
| 2. Visuals (mockup fidelity) | 4/4 | 3 new fixtures all 96×24 char-precision; AsciiGrid round-trip green; visual order rows 18→19→20 (label/log/stats) matches §6.1; overlay panel header `┌─[ SHEET · BIO ]` and `┌─[ SCHEDA · BIO ]` locale-correct in B fixtures |
| 3. Color / Contrast (4-bit phosphor + accent reservation) | 4/4 | UI-SPEC §4 accent set (`⚔ ▶ ─── [Q]`) ratified per-row: A_en row 19 has `⚔=1 ▶=0`; A_en row 18 has `▶=1` (in HUD column, owned by z=1 — not introduced by z=0.5); zero hardcoded color anywhere (correct — no RGB API on G2 text containers) |
| 4. Typography (firmware monospace + symbol-class discipline) | 4/4 | Two character classes (body ASCII + symbol box-drawing) cleanly separated; no body/symbol mixing inside numeric runs; line-height is hardware-fixed 1 char as designed |
| 5. Spacing / Alignment (INV-1 char-precision column equality) | 2/4 | **UI-SPEC §2 internally inconsistent**: claims `content-width = 66 cells (col 4 → col 69 inclusive)` and `right-stop = col 70`, but the actual divider `║` sits at **col 68** in every fixture (test file documents this drift in its header comment). Real content-width is **64 cells (col 4..67)**. Frame-equality across A/B/C empirically holds, but the spec's stated column numbers are wrong. Test code uses the real columns; UI-SPEC prose does not. |
| 6. Consistency w/ design contract (state-machine + budget) | 2/4 | **UI-SPEC §10 width-budget table contradicts fixture bytes**: spec says label = `= 40 cells` literal, stats strip = `= 60 cells` literal; State A fixtures ship them at **52** and **54** cells respectively. State C glyph (label=40, stats=51) is closer but still misses the `=60` claim. The width-budget contract that the spec calls "locked" doesn't match what the implementation actually emits. Either the fixtures need padding to the spec'd widths, or §10 needs to be re-derived from `idle-infill-layer.ts`. |

**Overall: 19/24** — Good. The fixtures, tests, and ADR ratification are all sound. The score is held back by spec/implementation drift in two numeric-precision sections of the UI-SPEC itself; the underlying *visual contract* is solid.

---

## Top 3 Priority Fixes

1. **WARNING — UI-SPEC §10 width-budget table drifts from fixture bytes (Consistency w/ design contract).**
   - **User impact:** Future contributors reading UI-SPEC will pad to `40 / 53 / 60 cells` per the table; the fixtures actually carry `52 / 53 / 54` (State A) and `40 / — / 51` (State C glyph). A new IT-fixture-author following the spec verbatim would produce a fixture that fails Z05-FX-01..03 round-trip with no clear "why".
   - **Concrete fix:** Quick task in v0.9.12 — either (a) reconcile UI-SPEC §3+§10 against the actual `LABEL_SEPARATOR_CONTENT` literal + `STATS_STRIP_WIDTH` constant in `packages/g2-app/src/status-hud/idle-infill-layer.ts` and rewrite the table with the real numbers, OR (b) re-pad the 3 z=0.5 strips in State A fixtures + glyph stats strip to the spec'd widths (40/53/60), regenerate snapshots, re-run Z05-FX. Option (a) is lower risk (doc-only INV-3 atomic commit).

2. **WARNING — UI-SPEC §2 spacing token table cites wrong divider column (Spacing / Alignment).**
   - **User impact:** §2 says `right-stop = col 70` and `content-width = 66 cells (col 4 → col 69 inclusive)`. The fixtures put the central frame `║` at **col 68**, so the actual content-window is cols 4..67 = 64 cells. The phase-14 test file header (`z05-state-machine-fixtures.test.ts:21-26`) already flags this as a documented PLAN deviation — but the deviation never propagated back into UI-SPEC §2. The next phase that adds a z=0.5 strip variant (e.g., Phase 15 spell-name hint) will inherit the wrong column anchors.
   - **Concrete fix:** Patch UI-SPEC §2 row `right-stop (z=0.5)` → `col 67`, row `content-width (z=0.5 strip)` → `64 cells (col 4 → col 67 inclusive)`. Add a one-line note: "Central divider `║` sits at col 68 (not col 71 as some older mockups show)."

3. **WARNING — Locale leak in State C IT fixture (Copy / Tone).**
   - **User impact:** `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt:17` reads `║                                                                   ║ Conditions               ║` — the right-column heading is the **EN** word `Conditions`, but the file is the `.it.txt` IT-locale fixture. The IT raster baseline (`glyph-scene.raster-idle-it.txt:18`) correctly carries `Condizioni`. The new State C IT fixture copied the Status HUD from the EN baseline (`glyph-scene.raster-idle.txt:18` has `Conditions`) rather than the IT baseline. Z05-INV-02b *doesn't catch this* because it asserts byte-identity A_it ↔ B_it (both IT) — it has no opinion on C_it. The Z05-INV-01b triplet asserts only frame columns {0, 68, 95}, not content columns 69..94.
   - **Concrete fix:** Quick task — update `glyph-scene.glyph-idle-z05.it.txt:17` cols 71..82 from `Conditions` → `Condizioni  ` (pad to preserve 96-col width); re-run `Z05-FX-03` to regenerate the snapshot; consider extending Z05-INV-02b to a triplet `A_it ↔ B_it ↔ C_it` so future regressions are caught. Same fixture row 1 should also read `TURNO 2/5` (matching `raster-idle-it.txt`) instead of `ROUND 3 · TURN 2/5` (EN) — second locale leak on the same fixture.

---

## Detailed Findings

### Pillar 1 — Copy / Tone (3/4)

**Method:** Cross-grid string inspection on the 6 relevant fixtures + UI-SPEC §5.1 string table.

**Strengths:**
- Combat-log canonical sample `⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing` is byte-identical between `glyph-scene.raster-idle.txt:20` (EN) and `glyph-scene.raster-idle-it.txt:20` (IT) — UI-SPEC §5.1 declared this "(same — keywords ASCII)", and the fixtures honor it.
- Label-separator `─── z=0.5 idle infill ──────────────────────────────` is non-localized literal across all 3 State-A fixtures (EN/IT/DE) and a shorter variant in State C — matches §3 "constant: `─── z=0.5 idle infill ──────────────────`" intent.
- Overlay panel header is correctly localized: `┌─[ SHEET · BIO ]` in `raster-overlay-open.en.txt:19`, `┌─[ SCHEDA · BIO ]` in `raster-overlay-open.it.txt:19`. Footer row 23 also localized: `R1: scroll=navigate` (EN) vs `R1: scroll=naviga` (IT).
- Empty-state token `—` (em-dash U+2014) declared in §5.1; no fixture currently exercises it, but `idle-infill-layer.ts` (Phase 4a) is the binding contract per §5.1 "see `STATS_STRIP_WIDTH`".

**Weaknesses (warnings):**
- **WR-UI-01 (Locale leak C IT row 17 + row 1):** `glyph-scene.glyph-idle-z05.it.txt:17` has `Conditions` (EN) at cols 71..82 instead of `Condizioni` (IT). Same fixture row 1 has `ROUND 3 · TURN 2/5` (EN) instead of `TURNO 2/5` (IT, per `raster-idle-it.txt:2`). The Status HUD right column appears to have been copy-pasted from the canonical EN baseline rather than the IT baseline. **Test coverage gap:** Z05-INV-02b only asserts byte-identity A_it ↔ B_it for cols 69..95 rows 3..20; it does NOT extend to C_it, so this regression passed CI. See "Priority Fix 3" above for the concrete remediation.

**Score rationale:** 3/4 not 2/4 because the leak is on a single fixture, not a systemic copy contract failure; the rest of the localization story is clean.

---

### Pillar 2 — Visuals / Mockup Fidelity (4/4)

**Method:** Python codepoint-count probe across all 6 fixtures (24 rows × 96 codepoints each); visual order check rows 18→19→20; overlay panel header position verification at row 18 cols 4..14.

**Evidence:**
- All 6 fixtures pass `len(row) == 96` for all 24 rows (no surrogate-pair regressions, no trailing-whitespace drift).
- Visual order per UI-SPEC §6.1: row 18 starts with `───` (label) ✓, row 19 starts with `⚔` (combat-log) ✓, row 20 starts with `raster` / `glyph` (stats) ✓.
- Overlay panel header `┌─[ SHEET · BIO ]` lands at `raster-overlay-open.en.txt:19` cols 4..18 exactly (Z05-INV-04 asserts this on cols 4..14 prefix; my probe extends the assertion through col 18 — clean).
- The mid-mount transition (State D) is correctly NOT a fixture — it's a timing assertion (LMT-DD-07a/b/c/d), matching UI-SPEC §6.4 "Not a visual fixture — a behavioral assertion".

**No findings.** This pillar is the strongest pass in the phase.

---

### Pillar 3 — Color / Contrast (4/4)

**Method:** Accent-glyph distribution count across z=0.5 rows in State A (EN+IT) and State C (IT).

**Evidence (per-row accent inventory):**

| Fixture | Row 18 (label) | Row 19 (combat-log / stats) | Row 20 (stats / empty) |
|---------|----------------|------------------------------|-------------------------|
| `glyph-scene.raster-idle.txt` (A_en) | `⚔=0 ▶=1 [Q]=0 ───=11` | `⚔=1 ▶=0 [Q]=0 ───=0` | `⚔=0 ▶=0 [Q]=1 ───=0` |
| `glyph-scene.raster-idle-it.txt` (A_it) | `⚔=0 ▶=1 [Q]=0 ───=11` | `⚔=1 ▶=0 [Q]=0 ───=0` | `⚔=0 ▶=0 [Q]=1 ───=0` |
| `glyph-scene.glyph-idle-z05.it.txt` (C_it) | `⚔=0 ▶=1 [Q]=0 ───=7` | `⚔=0 ▶=0 [Q]=1 ───=0` | `⚔=0 ▶=0 [Q]=0 ───=0` |

- UI-SPEC §4 reserves accent for 3 z=0.5-owned glyphs: `⚔` (combat-log leader), `───` (label-separator), `[Q]` (quick-action chip). Per-row distribution matches: `⚔` only on combat-log row, `[Q]` only on stats row, `───` only on label row. ✓
- The `▶` on row 18 belongs to the Status HUD (cols 72+) and is owned by z=1, NOT z=0.5 — UI-SPEC §4 correctly attributes it ("`▶` cursor in Status HUD column right, owned by z=1 — z=0.5 must NOT introduce new `▶`"). No z=0.5 row introduces a new `▶` glyph. ✓
- 60/30/10 distribution is structurally N/A on G2 (single phosphor shade per container — Even Hub SDK has no per-element color control). The "accent" surface is glyph-class-based, not color-based, and the discipline holds.

**No findings.**

---

### Pillar 4 — Typography (4/4)

**Method:** UI-SPEC §3 character-class audit; check for body/symbol mixing inside numeric runs.

**Evidence:**
- Body class (ASCII alnum + punctuation) cleanly carries data: `Thorin`, `Goblin Brute`, `400×200`, `8 fps`, `240k`, `45/68`. The `×` in `400×200` is U+00D7 (multiplication sign), classified as ASCII-punctuation-adjacent and used consistently in all 3 width-bearing fixtures (raster stats strip).
- Symbol class (box-drawing + dingbats) carries frame + indicators: `╔ ╗ ╚ ╝ ║ ═ ╠ ╣ ╦ ╩ ┌ ┐ └ ┘ ─ │ ⚔ ▶ ⌁ → ·`. No mixing inside numeric runs: `45/68` is body-only, `▓▓░░ 2/4` correctly transitions symbol→body→symbol→body at cell boundaries.
- Firmware monospace assumption preserved — every fixture asserts `len(row) == 96` codepoints, which only holds if every glyph is single-width. Multi-codepoint emoji (e.g., flag sequences) would fail; the project correctly avoids them.

**No findings.**

---

### Pillar 5 — Spacing / Alignment (2/4)

**Method:** Empirical cross-state column-equality probe (Python) + UI-SPEC §2 prose reconciliation.

**Strengths:**
- Frame columns {0, 68, 95} are byte-identical across A_en ↔ B_en ↔ A_it ↔ B_it ↔ C_it for all 22 frame-bearing rows of col 68 + all 24 rows of cols 0 and 95. The one expected exception (col 68 on rows 1 and 22 carries footer text, not frame) is correctly excluded by `FRAME_ROWS_BY_COL` in the test (`z05-state-machine-fixtures.test.ts:78-82`).
- Frame corners `╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩` at rows {0, 2, 21, 23} pinned correctly across all states.
- INV-1 char-precision width holds at 96 cells × 24 rows for all 6 fixtures (no rounding drift).

**Weaknesses (warnings):**
- **WR-UI-02 (UI-SPEC §2 spacing token table cites wrong columns):** §2 declares `right-stop (z=0.5) = col 70` and `content-width = 66 cells (col 4 → col 69 inclusive)`. The actual divider `║` sits at **col 68** (verified across all 6 fixtures); content stops at col 67; content-width is 64. The test file's own header comment (`z05-state-machine-fixtures.test.ts:21-26`) flags this as a "PLAN deviation" — but the correction was applied to the test code, not back-propagated to UI-SPEC §2. New contributors reading the UI-SPEC will get the wrong column numbers. See "Priority Fix 2" above.

**Score rationale:** 2/4 not 3/4 because §2 is the spacing-token authoritative table and the prose is materially incorrect; the underlying alignment IS char-precise, but the spec that documents the alignment isn't. This is an INV-1 invariant-prose drift that the project's own pre-bump checklist (CLAUDE.md "Pre-bump checklist" §5: "every reference exists as a heading") doesn't catch — it checks `§N.M` cross-refs, not column-number internal consistency.

---

### Pillar 6 — Consistency w/ Design Contract (2/4)

**Method:** UI-SPEC §10 locale-width-budget table reconciliation against fixture bytes (cols 4..67 stripped).

**Evidence (measured widths vs spec'd widths):**

| Element | UI-SPEC §10 says | A_en fixture | A_it fixture | C_it fixture (glyph) | Drift |
|---------|-----------------|--------------|--------------|----------------------|-------|
| Label-separator (literal, `═ 40`) | 40 cells | **52 cells** | **52 cells** | 40 cells | A_en/A_it OVER spec by 12 |
| Combat-log canonical sample | 53 cells | 53 cells | 53 cells | n/a (omitted in glyph) | ✓ |
| Stats strip canonical sample (`═ 60`) | 60 cells | **54 cells** | **54 cells** | **51 cells** | A UNDER spec by 6; C UNDER spec by 9 |

**Specifically:**
- A_en row 18 label body: `─── z=0.5 idle infill ──────────────────────────────` is **52 cells**, not 40. The spec literal in §3 + §10 is `─── z=0.5 idle infill ──────────────────` (16 dashes after `infill ` = 40 cells). The fixture has 28 trailing dashes → 52 cells.
- A_en row 20 stats body: `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q]` is **54 cells**. UI-SPEC §3 says stats is `= 60 cells literal (computed; see STATS_STRIP_WIDTH in idle-infill-layer.ts)` — the actual literal in the fixture is 54, and §10 then asserts "Stats strip canonical sample: 60 cells" which contradicts.
- C_it row 18 glyph label: 40 cells — matches spec. C_it row 19 glyph stats: 51 cells — does NOT match spec's "60 cells (padded)".

**Possible explanations:**
1. UI-SPEC §3+§10 numbers were derived from an earlier draft of `idle-infill-layer.ts` that has since changed; the fixtures track the current code, the spec doesn't.
2. The fixtures were hand-authored to match the §7.4 reference mockup in Specs.md (which has slightly different widths), not the §10 table.
3. The widths in §3+§10 are *intended budget caps* not *exact widths*, but the spec phrasing uses `=` not `≤`.

**Score rationale:** 2/4. The design contract is internally inconsistent: §3 says `Stats strip … = 60 cells literal` and §10 says `Stats strip canonical sample 60 cells (pass)` — but the canonical sample listed verbatim in §5.1 is `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick` which is 60 cells WITH the trailing ` Quick`, and the fixture only carries the `[Q]` prefix (54 cells). Either §5.1's sample is correct and the fixture is missing ` Quick`, or §5.1 should drop ` Quick` and §3/§10 should re-derive widths. This is the kind of "contract bytes vs implementation bytes" gap INV-1 is supposed to prevent.

**Why not lower:** the state machine semantics (single flush per transition, `_suspendedZ05` reference round-trip, toast carve-out under race) are all asserted in 4 LMT-DD-07 sub-tests with concrete count expectations — that portion of the contract is iron-clad.

---

## Cross-Pillar Observations (informational)

### A. State-machine race coverage is exceptional

Phase 14 introduced 4 sibling sub-tests (LMT-DD-07a/b/c/d) covering distinct behavioral contracts: atomicity, no-transient-state, suspended-z05 reference-equality round-trip, and toast carve-out under race. The split was applied in response to review WR-04. This is the gold standard for state-machine assertions — when a future regression breaks one contract, the failing test will be unambiguous. The pattern should be cited by future phases that introduce new bundle ops.

### B. The Specs.md §7.4 reference mockup at line 1392 contains its own width drift

A quick spot-check of Specs.md §7.4 (line 1392) shows the same label-separator literal padded to a different width than UI-SPEC §10 declares. This is a downstream effect of the same warning #1 — Specs.md / UI-SPEC §10 / fixture bytes form a 3-way disagreement on the literal width. INV-3 atomic doc-coherence ("Specs.md + README.md + showcase must update in the same commit") was satisfied for the *version bump*, but the *width literals* were not re-derived consistently. Suggest a Phase-14.1 quick fix: extract `LABEL_SEPARATOR_CONTENT` and `STATS_STRIP_WIDTH` from `idle-infill-layer.ts` into the canonical single source of truth, and update Specs.md §7.4 + UI-SPEC §3/§10 + fixture authoring docs from that single point.

### C. ADR-0001 Amendment 1 is the cleanest ADR amendment in the repo

The amendment preserves all 5 original Decision Drivers verbatim, adds 5 "Consistency check vs original Option A" line items, and explicitly justifies "Why amend instead of new ADR". The Phase 14 ratification paragraph (line 111) adds full file-path traceability for the fixtures + tests + UI-SPEC. This is the model future amendments should follow.

---

## Registry Safety

`components.json` does not exist in this repo (no shadcn — confirmed by `ls -la` + UI-SPEC §1 explicit "shadcn N/A — no DOM emitted by g2-app"). UI-SPEC §11 lists no third-party registry. The only "registry" is `@evenrealities/even_hub_sdk@0.0.10` which is the hardware SDK polyfill (already vetted via `oq-inv2-4-hub-polyfill-via-evenrealities-sdk` per CLAUDE.md memory). **Registry audit: 0 third-party blocks checked, no flags. Section structurally not applicable.**

---

## Files Audited

| Path | Role | Audit Outcome |
|------|------|---------------|
| `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md` | Design contract (the baseline) | §2 + §3 + §10 column / width numbers DRIFT from fixtures — see Pillar 5 + 6 |
| `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-CONTEXT.md` | Phase scope | Confirms 3-strip MVP scope + 1 Hz cadence + INV-1 fixtures + ADR-0001 amend-in-place — read-only reference |
| `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-VERIFICATION.md` | Verification report | 5/5 SCs passed — read-only reference; my findings do NOT regress any of these (they are spec-prose findings, not implementation findings) |
| `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-REVIEW.md` | Code review report | 4 WR fixed atomically; 7 INFO deferred — read-only reference |
| `packages/shared-render/src/fixtures/raster-overlay-open.it.txt` | State B IT fixture | 96×24 char-precision ✓, locale-correct (`SCHEDA · BIO`, `R1: scroll=naviga`) ✓ |
| `packages/shared-render/src/fixtures/raster-overlay-open.en.txt` | State B EN fixture | 96×24 ✓, panel header `┌─[ SHEET · BIO ]` ✓, Z05-INV-04 anchors verified empirically |
| `packages/shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt` | State C IT fixture | 96×24 ✓; **locale leak** on row 17 (`Conditions` instead of `Condizioni`) + row 1 (`ROUND 3 · TURN 2/5` instead of `TURNO 2/5`) — see Pillar 1 / Priority Fix 3 |
| `packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt` | State A EN baseline (pre-existing, frozen Phase 14) | Reference; label-width 52 (spec says 40), stats-width 54 (spec says 60) |
| `packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt` | State A IT baseline (pre-existing, frozen Phase 14) | Reference; same width drift as A_en |
| `packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt` | Pre-Phase-14 glyph baseline | Read-only — Phase 14 added the `-z05` variant rather than replacing this |
| `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` | Cross-state INV-1 invariant suite | 10 tests, all green; the file's own header comment correctly documents the col 68 vs col 71 PLAN deviation (the same one I flag in Pillar 5) |
| `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (lines 470-585) | LMT-DD-07a/b/c/d race-coverage | 4 tests, all green; cleanest race-coverage pattern in the repo |
| `Specs.md` §7.2 + §7.3 + §7.4 + §7.4c (lines 1291, 1328, 1359, 1962) | Canonical spec sections | §7.4 line 1392 label-separator width also drifts from §10 — see Observation B |
| `docs/architecture/0001-layered-ui-model.md` (Amendment 1, lines 83-111) | ADR amendment | Cleanest amendment in the repo — see Observation C |
| `CLAUDE.md` (INV-1..5) | Project invariants | INV-1 satisfied at the byte level; INV-3 satisfied for the version bump; INV-1 *prose* coherence is what fails in Pillars 5+6 |

---

## Auditor Notes

- **No screenshots.** Hardware target is Even Realities G2 glasses; no dev server can render this UI on a desktop browser. The visual contract IS the ASCII fixture set, which I read directly. Standard CLI-screenshot path (npx playwright) does not apply.
- **Findings are spec-prose drifts, not implementation defects.** The 3 fixtures ship correct INV-1 width × height; the 14 tests assert real cross-state invariants and pass. The warnings are about UI-SPEC numbers that don't match what the fixtures actually contain — a documentation coherence problem, not a rendering problem.
- **Non-blocking by request.** Per the audit objective: "This audit is advisory — non-blocking. The phase has already passed code-review + verification." All 3 warnings can be resolved by a single Phase-14.1 quick task (UI-SPEC §2/§3/§10 reconciliation + State C IT locale-leak fix + extending Z05-INV-02b to a triplet). Recommended sequencing: bundle with Phase 15 setup so the Specs.md / UI-SPEC reconciliation is atomic per INV-3.

---

_Audited: 2026-05-17 · Auditor: gsd-ui-auditor (Claude Opus 4.7 [1M]) · Stance: adversarial, hardware-AR adapted rubric_
