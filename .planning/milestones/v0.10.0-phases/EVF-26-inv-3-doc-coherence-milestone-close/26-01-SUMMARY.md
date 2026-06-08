---
phase: 26-inv-3-doc-coherence-milestone-close
plan: "01"
subsystem: docs
tags: [inv-3, inv-1, inv-2, specs, readme, showcase, v0.10.0, raster, canvas-compositor, glyph-fallback]

requires:
  - phase: 25-promozione-raster-a-default-boot-fallback-glyph
    provides: "raster default boot wired in code; glyph fallback path established; 3295 tests green"

provides:
  - "Specs.md v0.10.0 header + boot-splash + changelog stanza (Phases 19-25 summary + INV-2 re-verified 2026-06-08)"
  - "§7.2 CanvasCompositor raster substrate paragraph (DEFAULT path doc)"
  - "§7.4 Glyph Fallback Mode subsection wrapping the 27px mockup (INV-1 contract preserved)"
  - "README.md v0.10.0 badges + canvas compositor pillar + roadmap phases 19-25 + 3295 tests"
  - "showcase v0.10.0 stat + footer update; raster default description"
  - "INV-3 atomic commit: exactly Specs.md + README.md + docs/showcase/index.html"

affects: [next milestone planning, inv-3 gate future phases]

tech-stack:
  added: []
  patterns:
    - "INV-3 atomic doc-coherence: 3 projection files updated in one commit for every cross-cutting change"
    - "CanvasCompositor raster = default path; glyph/text = BLE-degraded fallback — documented in §7.2 + §7.4"

key-files:
  created: []
  modified:
    - "Specs.md — v0.10.0 header, §7.2 raster substrate paragraph, §7.4 Glyph Fallback Mode subsection, §7.12 boot-splash version, changelog stanza v0.10.0"
    - "README.md — version badges, canvas compositor pillar, roadmap phases 19-25, 3295 tests, v0.10.0 milestone shipped"
    - "docs/showcase/index.html — stat v0.10.0 + 3295 tests + raster default; footer date + description"

key-decisions:
  - "INV-3 atomic commit contains exactly 3 doc files (Specs.md + README.md + showcase) with zero application code"
  - "§7.4 mockup 27px wrapped in 'Glyph Fallback Mode — BLE-degraded path' subsection — preserved (not deleted), INV-1 glyph contract"
  - "§7.2 new paragraph makes raster CanvasCompositor the explicitly documented DEFAULT substrate; glyph is BLE-degraded fallback"
  - "Boot-splash §7.12 version bumped to v0.10.0 (INV-3 pre-bump checklist: badge = header = showcase = boot-splash)"
  - "inv:all ran full suite (not :skip-inv2) — all 5 invariants green"

patterns-established:
  - "Raster default / glyph fallback: documented in §7.2 and labeled in §7.4 subsection for future spec edits"

requirements-completed: [RINV-03]

duration: 35min
completed: 2026-06-08
---

# Phase 26 Plan 01: INV-3 Doc Coherence Milestone Close (v0.10.0) Summary

**Atomic INV-3 commit upgrades Specs.md/README.md/showcase to v0.10.0, documents the CanvasCompositor raster substrate as the default rendering path, and wraps the §7.4 glyph mockup in a "Glyph Fallback Mode — BLE-degraded path" subsection (INV-1 contract preserved).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-08T12:00:00Z
- **Completed:** 2026-06-08T14:31:09Z
- **Tasks:** 3
- **Files modified:** 3 doc files

## Accomplishments

- Specs.md bumped v0.9.15 → v0.10.0 (header + §7.12 boot-splash + changelog stanza); §7.2 raster substrate paragraph + §7.4 Glyph Fallback Mode subsection added; all INV-2 re-verified 2026-06-08 no-drift logged
- README.md updated to v0.10.0 (badges, canvas compositor pillar replacing glyph-grid description, roadmap phases 19-25, 3295 tests, v0.10.0 milestone entry)
- showcase updated to v0.10.0 (stat + footer); INV-3 atomic commit with exactly 3 doc files verified; `inv:all` ALL GREEN (INV-1 glyph+raster; INV-3 all 5 sites v0.10.0)

## Task Commits

1. **Task 1: Specs.md edits** — (part of INV-3 atomic commit `9020d70`)
2. **Task 2: README + showcase edits** — (part of INV-3 atomic commit `9020d70`)
3. **Task 3: inv:all + atomic INV-3 commit** — `9020d70` (docs)

**Plan metadata:** separate docs commit (this SUMMARY)

## Files Created/Modified

- `/home/aiacos/workspace/EvenFoundryVTT/Specs.md` — v0.10.0 header + §7.12 boot-splash; §7.2 CanvasCompositor raster substrate paragraph; §7.4 Glyph Fallback Mode subsection; changelog stanza v0.10.0 (Phases 19-25 + INV-2 Re-verified 2026-06-08)
- `/home/aiacos/workspace/EvenFoundryVTT/README.md` — version badges v0.10.0; canvas compositor pillar; roadmap phases 19-25; 3295 tests; v0.10.0 milestone shipped; INV-2 re-verify 2026-06-08 logged
- `/home/aiacos/workspace/EvenFoundryVTT/docs/showcase/index.html` — stat v0.10.0 + 3295 workspace tests + canvas compositor raster default; footer date + description updated

## Decisions Made

- **Boot-splash §7.12 version bump:** `inv:all` INV-3 check found the boot-splash mockup still at v0.9.15 (Specs line 2676). Updated to v0.10.0 per pre-bump checklist (badge = header = showcase = boot-splash = all v0.10.0). This was an auto-deviation Rule 1 (blocking: inv:all was red).
- **inv:all ran full suite:** INV-2 network step was reachable; `inv:all` (not `:skip-inv2`) ran and returned ALL GREEN. No note needed.
- **Spec line count updated to ~4500:** Specs.md grew with the new §7.2 paragraph + §7.4 subsection + changelog stanza; updated README doc reference from ~4400 to ~4500 lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Boot-splash mockup §7.12 still at v0.9.15**
- **Found during:** Task 3 (inv:all run)
- **Issue:** `inv:all` INV-3 check reported version mismatch — Specs.md boot-splash `v0.9.15` while header + README + showcase were at `v0.10.0`. Pre-bump checklist (CLAUDE.md) requires all 5 sites coherent.
- **Fix:** Updated `║ EVENFOUNDRYVTT  v0.9.15 ║` → `║ EVENFOUNDRYVTT  v0.10.0 ║` in the §7.12 boot-splash ASCII mockup (Specs.md line 2676).
- **Files modified:** `Specs.md`
- **Verification:** `inv:all` re-run → INV-3 green, all 5 sites v0.10.0.
- **Committed in:** `9020d70` (INV-3 atomic commit, filed together with the planned doc changes)

---

**Total deviations:** 1 auto-fixed (Rule 1 — blocking bug caught by inv:all)
**Impact on plan:** Fix necessary for INV-3 coherence. No scope creep.

## Issues Encountered

None beyond the boot-splash version drift detected and fixed by inv:all.

## Known Stubs

None — this is a doc-only plan. No application code stubs introduced.

## Threat Flags

None — doc-only changes; no new network endpoints, auth paths, or schema changes.

## Self-Check

- [x] Specs.md v0.10.0 header: `grep -n "v0.10.0" Specs.md` → line 9 (header) + line 4117 (changelog stanza)
- [x] Glyph Fallback Mode subsection: `grep -n "Glyph Fallback Mode" Specs.md` → lines 1337 + 1375
- [x] INV-2 Re-verified line: `grep -n "Re-verified ✓ 2026-06-08" Specs.md` → line 4127
- [x] ASCII mockup preserved: `grep -c "╔═══" Specs.md` → 20 (unchanged)
- [x] INV-3 commit has exactly 3 files: `git show --stat 9020d70` → README.md, Specs.md, docs/showcase/index.html
- [x] inv:all ALL GREEN (INV-1 glyph+raster; INV-2; INV-3; INV-4; INV-5)
- [x] `grep -c "v0.9.15" docs/showcase/index.html` → 0 (old version fully bumped)
- [x] `grep -c "v0.10.0" README.md` → 19 (badge + body)

## Self-Check Result: PASSED

## Next Phase Readiness

- v0.10.0 milestone is fully closed (code in Phases 19-25 + doc coherence in Phase 26)
- All 27 phases software-complete
- Hardware UAT path: `pnpm --filter @evf/validation-harness validate:all` (pending Even Hub access + G2 + R1)
- Next milestone: hardware UAT or new feature phases

---
*Phase: 26-inv-3-doc-coherence-milestone-close*
*Completed: 2026-06-08*
