# Phase 14 — Deferred Items

## Pre-existing lint error in `spell-pack-reader.ts` (out of scope for Plan 14-02)

**Discovered during:** Phase 14 Plan 02 Task 2 (CI quality gates)
**File:** `packages/foundry-module/src/readers/spell-pack-reader.ts:168`
**Rule:** Biome formatter — `File content differs from formatting output`
**Severity:** error (blocks `pnpm lint:ci`)

**Root cause (provenance):** introduced by commit `fbaac3c` *"feat(quick-spell-lookup): Task 1 — SpellPackEntry schema + spell-pack-reader + module wiring"* — pre-dates the v0.9.12 milestone open. The single-line function signature on line 168 violates Biome's `lineWidth` formatter rule and should be broken into a multi-line form (Biome auto-fix available via `pnpm format`).

**Why deferred:** Phase 14 Plan 02 explicitly modifies ONLY `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (per `<files_modified>` frontmatter). The lint error in `spell-pack-reader.ts` is in a different package (`foundry-module`), is not caused by Plan 14-02 changes, and falls under the executor scope-boundary rule (only auto-fix issues DIRECTLY caused by the current task's changes).

**Suggested fix:** quick task `chore: format spell-pack-reader.ts (Biome line-width)` — single `pnpm format` run on the file resolves it (1-line diff). Could be folded into Phase 14 Plan 03 (the v0.9.12 INV-3 atomic commit) if the planner wants to keep the milestone lint-clean.

**Impact on Plan 14-02 success criteria:** the four CI gates listed in Task 2 are partially passing — typecheck, test suite, and grep gates are green; lint:ci fails due to this pre-existing issue, NOT due to Plan 14-02 changes. The LMT-DD-07 test itself is green and the layer-manager file is lint-clean. Plan 14-02 deliverable is met; the broader CI lint:ci gate is blocked on a separate concern.
