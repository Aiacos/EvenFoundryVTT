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

## Pre-existing lint errors across ~36 files (out of scope for Plan 14-01)

**Discovered during:** Phase 14 Plan 01 Task 3 (CI quality gates)
**Files:** ~36 files across `packages/bridge`, `packages/foundry-mcp`, `packages/foundry-module`, `packages/g2-app/src/{engine,internal,panels}`, `packages/validation-harness` (see full list via `pnpm lint:ci`).
**Errors:** mix of `lint/suspicious/noConsole` and Biome formatter `lineWidth` mismatches.
**Severity:** 1 error + 255 warnings (blocks `pnpm lint:ci`).

**Root cause (provenance):** all entries pre-date Plan 14-01. `spell-pack-reader.ts` (commit `fbaac3c`), validation-harness scripts (commits `0fa1364`, `2044df0`), and various g2-app + bridge files predate the v0.9.12 milestone open. None of them are touched by Plan 14-01 changes.

**Why deferred:** Plan 14-01 `<files_modified>` lists ONLY 3 new fixture files (`raster-overlay-open.{it,en}.txt` + `glyph-scene.glyph-idle-z05.it.txt`) and 1 new test file (`packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts`). Per the executor scope-boundary rule, only issues DIRECTLY caused by the current task's changes get auto-fixed. The new fixtures + new test file are themselves lint-clean (`pnpm exec biome ci` on each = OK).

**Verification of Plan 14-01 cleanliness:**
- `pnpm exec biome ci packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` → 1 file checked, no errors.
- `.txt` fixtures are ignored by Biome configuration (intentional — fixtures are not code).

**Suggested fix:** quick task `chore: workspace-wide biome auto-fix + console allowlist for validation-harness scripts` — would resolve all 36+ files in one batch via `pnpm format` + scoped Biome config exceptions for validation-harness scripts. Could be folded into Phase 14 Plan 03 (the v0.9.12 INV-3 atomic commit).

**Impact on Plan 14-01 success criteria:** the 3 task-level CI gates that bind Plan 14-01 are GREEN:
- (a) `pnpm --filter @evf/g2-app exec vitest run src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` → 7/7 pass.
- (b) `pnpm exec biome ci packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts` → clean.
- (c) `grep -c "^  it(" .../z05-state-machine-fixtures.test.ts` → 7 (matches expected).

The workspace-wide `pnpm lint:ci` failure is the same pre-existing concern documented above for Plan 14-02. Plan 14-01 deliverable is met; the broader CI lint:ci gate remains blocked on the prior concerns.

## Pre-existing branch coverage gap (out of scope for Plan 14-03)

**Discovered during:** Phase 14 Plan 03 Task 3 (INV-3 atomic commit CI gates).

**Status:** Confirmed pre-existing (verified by stashing Plan 14-03 changes and re-running `pnpm test:coverage` — identical 77.84% branch coverage before and after Plan 14-03 edits).

**Issue:** `pnpm test:coverage` exits 1 because branch coverage is 77.84% (2751/3534) which is below the global 80% threshold in `vitest.config.ts`. Statements 87.45%, Functions 86.26%, Lines 88.32% — only branches falls short.

**Why deferred:** Plan 14-03 is a documentation-only ratification plan. The only code change is a 1-line auto-format on `packages/foundry-module/src/readers/spell-pack-reader.ts:168` (multi-line function signature, semantic-neutral). Plan 14-03 introduces NO new branches and removes NONE. The coverage gap predates Wave 1 of Phase 14 and cannot be remedied by a doc-coherence commit. Per executor scope-boundary rule.

**Test suite health (orthogonal to coverage):** `pnpm test --run` exits 0 with **2554/2554 tests passing across 176 test files**. No test failures, no regressions.

**Suggested resolution:** future quick task `chore: backfill branch coverage to 80% threshold` — identify the top files with branch coverage below threshold (raster-worker.ts at 0% covers ~250 uncovered lines alone), add test cases. Should be a self-contained PR.

## Folded into Plan 14-03 INV-3 atomic commit (RESOLVED)

**Action:** `packages/foundry-module/src/readers/spell-pack-reader.ts:168` reformatted via `pnpm exec biome format --write` — single-line `export function registerSpellPackReader(emit: ...): () => void {` broken to multi-line per Biome `lineWidth: 100`. Semantic-neutral; no behavior change.

**Result:** `pnpm lint:ci` now exits 0 (the single ERROR is gone). The 255 noConsole + noNonNullAssertion + useLiteralKeys WARNINGS remain — they are not blocking (warnings don't fail CI) and fall under separate pre-existing concerns above.

## UI-REVIEW Deferred Items (advisory, non-blocking) — 2026-05-17

From `14-UI-REVIEW.md` audit (overall 19/24, 0 blockers):

1. **UI-SPEC §10 width-budget drift** — `label=40 cells` dichiarato, fixture A_en/A_it ne hanno 52; `stats=60 cells` dichiarato, fixture ne hanno 54. Riconciliare §3+§10 con `idle-infill-layer.ts` o ripaddare le fixture.
2. **UI-SPEC §2 colonne sbagliate per divider** — §2 dice `║` a col 71, `right-stop col 70`, `content-width 66`; reality col 68. Patch `right-stop col 67`, `content-width 64`. (Già flagged dal Plan 14-01 reconciliation.)
3. **Locale leak in `glyph-scene.glyph-idle-z05.it.txt`** — row 17 has `Conditions` (EN) invece di `Condizioni`; row 1 has `ROUND 3 · TURN 2/5` (EN) invece di `TURNO 2/5`. Estendere Z05-INV-02b a triade IT (A_it↔B_it↔C_it). Real implementation defect.

Suggested resolution: standalone quick task Phase-14.1 (3 file: UI-SPEC + Specs.md §7.4 line 1392 + fixture). Single INV-3 atomic commit. Estimated effort: ~20 min.
