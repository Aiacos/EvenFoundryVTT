# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.9.11 — MVP

**Shipped:** 2026-05-17
**Phases:** 15 | **Plans:** 71 | **Sessions:** Multi-session autonomous (~7 calendar days)
**Branch:** `gsd/v0.9.11-milestone`
**Stats:** 442 commits · ~99,642 LOC TypeScript · 2,097 tests passing

### What Was Built

- **MVP software-complete (48/48 v1 REQ-IDs)** — Player pairs G2 to Foundry, navigates panels via R1 ring gestures, executes cast/attack/use/move/AoE-template-placement end-to-end through `socketlib.executeAsGM` (single-workflow-origin per ADR-0011). Phase 0 (Validation Gates) → Phase 10 (Polish & Field Test MVP).
- **Layered raster pipeline operational** — z=0 raster (4-bit dithered 400×200, `image-q` + `upng-js` + `xxhash-wasm` hot path) + z=1 persistent Status HUD + z=1.5 toast queue (FIFO + `[+N]` squash) + z=2 overlay slot. INV-1 ASCII snapshot fixtures binding every state.
- **V2 OPZIONALE surface shipped early** — `foundry-mcp` Phase 11 (Streamable HTTP, 4 MCP resources with WS deltas, Claude Desktop config), Phase 12 voice UX tuning (GM-Agent prompt + IT↔EN STT spell-name lookup), Phase 13 ACT-04 reaction execution + STRETCH-06 portrait (flag-gated). Originally planned as post-MVP; user opted to bundle in one milestone for momentum.
- **Verification infrastructure** — INV-1..5 verification suite operational via `inv:all` single-command orchestrator. CI gates 7 quality dimensions (Biome lint, TS strict, Vitest coverage, INV-1..5, no-SSE grep, 14-socketlib-handler invariant, INV-3 atomic doc coherence).
- **5 ADRs + amendments ratified** — 0001 layered model, 0005 PROVISIONAL Branch A `human_needed` carry, 0006 raster lib stack, 0008 code quality config, 0009 panel API + Amendment 1 differential demolish, 0011 single-workflow-origin (NEW; ratified Phase 7).

### What Worked

- **`defer-hardware-tests` carry pattern.** Established at Phase 4a closure, applied uniformly through Phases 4b/5/6/7/8/9/10/12/13. Unlocked autonomous workflow execution where >50% of success criteria are hardware-dependent. Without it the milestone would have blocked indefinitely on Even Hub access. The pattern requires honest book-keeping (35 SCs tracked) but pays for itself many times over.
- **Autonomous batch execution (Phases 5–10).** Single autonomous run closed 6 phases on 2026-05-16/17 without human intervention. The 13-week MVP estimate from Specs.md compressed to 7 calendar days actual — ~13× ratio. Driven by extensive pre-execution design (~4,250 lines Specs.md) that pre-eliminated ambiguity normally requiring iteration.
- **INV-2 (online cross-validation) preventing decision drift.** Re-verified canonical sources at every milestone boundary (6 rounds total: v0.9.6→v0.9.11). EvenAI proprietary non-API status re-confirmed 2026-05-17 via 6-source check. Specs.md technical claims have NOT silently rotted because the discipline forced re-verification.
- **ADR-0005 PROVISIONAL Branch A as architectural device.** Marked 35 success criteria `human_needed` without blocking workflow — explicit, documented, audit-trail-friendly. This is the keystone that enabled "software-complete MVP" as a meaningful milestone state.
- **`pnpm` monorepo + Changesets + Biome.** Zero dual-tooling friction; CI gates ran fast and uniformly. The decision to skip ESLint+Prettier in favor of Biome paid off — single config, ~10× faster, ESM-first.

### What Was Inefficient

- **REQUIREMENTS.md checkbox staleness.** During autonomous Phase 5-10 batch closure, traceability table was updated but checkbox markers in the v1 list were not flipped. Required explicit cleanup at milestone close (43 checkboxes flipped). For v0.9.12, consider adding a phase-close hook that flips traceability + checkbox state atomically.
- **PROJECT.md footer date frozen at 2026-05-10.** PROJECT.md was never advanced during 7 days of execution. Same root cause as above — autonomous closure prioritizes execution artifacts (PLAN/SUMMARY/STATE) over the "long-lived" docs (PROJECT.md, ROADMAP.md). Worked around at milestone close but inelegant.
- **Quick-task status field unreliable.** Two completed quick-tasks (`20260517-spell-lookup-foundry-derived`, `260513-l12-fix-applicationv2-referenceerror-in-foun`) had `SUMMARY.md` present but SDK reported `status: unknown / missing`. Known SDK quirk (`reference_roadmap_analyzer_quirk.md` in memory). Resulted in noise at audit-open close step.
- **Auto-generated MILESTONES.md accomplishments were noisy.** SDK `milestone.complete` extracted one-liners using regex-style field parser; many SUMMARY.md files use `One-liner:\n<content on next line>` structure that confuses the extractor. Had to manually overwrite the accomplishments section. Worth opening an issue upstream against `gsd-sdk summary-extract`.
- **STATE.md `Current focus` line went stale (Phase 4b reference) after Phases 5-10 closed.** Surfaced this at session-start orientation. Caught and fixed at milestone close, but a stale focus pointer is a smell for any onboarding human.

### Patterns Established

- **`defer-hardware-tests` carry pattern.** Now project convention. Documented in memory (`feedback_defer_hardware.md`). Should be the first reflex when a phase has any `human_needed` SCs.
- **ADR PROVISIONAL with explicit branch decision.** ADR-0005 introduced the `PROVISIONAL-{ACCEPTED|REVISIT} Branch {A|B|C}` schema. Enables provisional architectural decisions with documented re-validation triggers. Worth promoting to a project-wide ADR pattern.
- **INV-2 6-source parallel WebFetch.** Pre-milestone-bump re-verification is the discipline. Worth codifying as a `/pre-bump-check` skill — automate the `≥4 parallel WebFetch on independent domains` mandate.
- **Single-workflow-origin (ADR-0011).** All Foundry writes via `socketlib.executeAsGM` ONLY. 14-handler count invariant verified via CI Gate 8. Pattern: enforce architectural invariants via grep-able count rather than convention.
- **INV-3 atomic doc-coherence commit.** Spec + README + showcase + ADR all bump together or not at all. Phase 10 Plan 04 (commit `bcb4e91`) is the canonical example for boot-splash v0.9.11→v0.9.12. Pattern works; preserve it.
- **Phase 13 minimal scope.** When V2 stretch surface grows, reject sprawl by shipping a discriminating subset. Memory: `feedback_phase_13_minimal.md`.

### Key Lessons

1. **Document-state hygiene needs a phase-close hook**, not retroactive cleanup. REQUIREMENTS.md and PROJECT.md should auto-evolve at phase boundaries, not at milestone close.
2. **Pre-execution design > iteration during execution.** The 13× plan-to-actual compression came from the ~4,250-line Specs.md investing weeks of design work BEFORE autonomous execution. Phase 0 (Validation Gates) gating discipline paid for itself.
3. **PROVISIONAL ADRs unblock autonomous work** when full validation isn't possible. ADR-0005 Branch A was the keystone enabling software-complete MVP as a meaningful state.
4. **Invariants verified via CI grep gates are stronger than convention.** The 14-socketlib-handler count and the no-SSE grep gate are simple but mechanical; they cannot rot quietly the way "we agreed not to do X" can.
5. **SDK tooling quirks need memory entries.** Two quick-tasks reported wrong status; this was caught only because memory had `reference_roadmap_analyzer_quirk.md`. Future quirks: write them down immediately.
6. **Milestone close benefits from explicit naming + numbering.** The v0.9.11 milestone YAML field was literally `name: milestone` — renamed to `MVP` at close. v0.9.12 should ship with a clear name from day one.

### Cost Observations

- Model mix: predominantly Opus 4.6/4.7 (per autonomous + balanced model_profile in config.json); Sonnet usage primarily in research/synthesizer subagents.
- Sessions: multi-session autonomous (3+ /gsd-autonomous runs documented in STATE.md: 2026-05-15 Phase 4a, 2026-05-16 Phase 7+9, 2026-05-17 Phase 10+13).
- Notable: 442 commits in 7 days = ~63 commits/day. Atomic-commit discipline maintained throughout (no monster squash-commits).

---

## Cross-Milestone Trends

*Updated after each subsequent milestone.*

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.9.11 | Multi-session autonomous | 15 | Established `defer-hardware-tests` carry pattern; ratified INV-5; ADR-0005 PROVISIONAL Branch A schema; ADR-0011 single-workflow-origin |

### Cumulative Quality

| Milestone | Tests | Coverage | LOC TypeScript | ADRs Accepted |
|-----------|-------|----------|----------------|---------------|
| v0.9.11 | 2,097 | (Vitest --coverage gate 80%) | ~99,642 | 6 (0001, 0005 PROVISIONAL, 0006, 0008, 0009 + Amd1, 0011) |

### Top Lessons (Verified Across Milestones)

*(To be filled as more milestones ship.)*
