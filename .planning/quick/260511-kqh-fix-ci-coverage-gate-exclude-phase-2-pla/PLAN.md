---
quick_id: 260511-kqh
slug: fix-ci-coverage-gate-exclude-phase-2-pla
date: 2026-05-11
created: 2026-05-11T12:55:00Z
flags: []
type: quick
status: complete
target_branch: main
implementation_commit: 2800995
---

# Quick Task: Fix CI coverage gate (exclude Phase 2+ placeholders)

## Problem

GitHub Actions `quality-gates` job (workflow `CI`, file `.github/workflows/ci.yml`) failing on consecutive pushes to `main` (runs 25660888757, 25670196688). All 16 tests pass; only the **Vitest with coverage** step fails because the global 80% threshold isn't met.

Coverage report at fail time:

| Metric    | Actual  | Threshold |
|-----------|---------|-----------|
| Lines     | 18.97%  | 80%       |
| Branches  | 17.64%  | 80%       |
| Functions | 29.62%  | 80%       |

## Root cause

`vitest.config.ts` had `coverage.include: ['packages/*/src/**']` which captured:

1. **4 placeholder `index.ts` files** (single `export const PACKAGE_NAME = ...` for future-phase packages):
   - `packages/bridge/src/index.ts` — Phase 3
   - `packages/foundry-module/src/index.ts` — Phase 2
   - `packages/g2-app/src/index.ts` — Phase 4a
   - `packages/shared-protocol/src/index.ts` — Phase 2
2. **`packages/validation-harness/src/lib/*`** — utilities (branch-decision/hub/output/schemas/stats) exercised only by `packages/validation-harness/scripts/*` hardware tests, which require Even Hub access + Phase 0 closure to run.
3. **`packages/*/src/fixtures/*.txt`** — incidental non-code files (e.g. `shared-render/src/fixtures/status-hud-baseline.txt`) swept up by `**`.

`shared-render` (the only package shipping real behavior in Phase 1) scored 95-100% on its own files, but was averaged down by the unmeasurable placeholders.

The in-file comment (`"For Phase 1 (zero app code), thresholds apply when packages reach the boundary"`) acknowledged the design intent but the implementation didn't enforce it.

## Fix (Approach A, user-selected)

Single change to `vitest.config.ts`:

1. **Narrow `include`** to `packages/*/src/**/*.{ts,tsx}` — excludes `.txt`/`.md` fixtures incidentally captured by `**`.
2. **Explicit excludes** for the 4 placeholder `index.ts` files, each tagged with the Phase that lifts the exclusion when logic lands.
3. **Exclude `packages/validation-harness/src/lib/**`** with rationale comment pointing to Phase 0 closure as the unblock.
4. **Migration policy** documented in file header:
   > When a package gains executable logic, its exclude entry below is removed AND tests must bring its file-level coverage to ≥80% in the same PR.

Threshold (lines/branches/functions = 80%) stays unchanged — applies to what passes include/exclude filters.

## Verification

Local (pre-push):
- `pnpm test:coverage` → 96%/91.66%/100%/95% (measuring shared-render only, all above gates), 16/16 tests pass.
- `pnpm typecheck` exit 0.
- `pnpm biome ci .` exit 0 (137 pre-existing warnings unchanged, no new ones).
- `pnpm vitest --run --update=false` (snapshot drift) → 16/16 pass.

GitHub CI:
- Run 25671568784 on commit `2800995` → conclusion `success`. All 5 gates green (Biome CI, TypeScript typecheck, Vitest with coverage, TODO discipline grep, Snapshot drift check). commit-lint-pr-title correctly skipped (push event, not PR).

## Notes on robustness scope

User requested "deve essere robusto" (must be robust). This fix addresses the immediate coverage gate breakage. Three orthogonal robustness improvements were identified but **deferred** to keep this task atomic:

- **`concurrency: { group, cancel-in-progress }`** on the CI workflow — would cancel superseded runs when new pushes land, saving runner minutes and giving faster feedback. Worth a separate quick task.
- **Branch protection on `main`** — would require PRs (preventing the "direct push to main makes main red" pattern that triggered this fix). GitHub-side setting, not a workflow change.
- **Per-file coverage thresholds** via `perFile: true` — would catch regressions in individual files even when aggregate looks fine. Reasonable to enable once Phase 2+ packages start shipping real code.

These are tracked as candidates for a follow-up `/gsd-quick` if/when the user wants to harden further.

## Files modified

- `vitest.config.ts` — coverage policy revision (commit `2800995` on main, rebased into milestone branch)
- `.planning/quick/260511-kqh-fix-ci-coverage-gate-exclude-phase-2-pla/PLAN.md` (this file)
- `.planning/quick/260511-kqh-fix-ci-coverage-gate-exclude-phase-2-pla/SUMMARY.md` (sibling)
- `.planning/STATE.md` — "Quick Tasks Completed" table updated

## Cross-references

- CI workflow: `.github/workflows/ci.yml` (D-1.09)
- Coverage gate: D-1.10 #4 (one of 7 quality gates)
- Coverage thresholds: D-1.06
- Previous green-restoration pattern: see commit `2044df0` (runner path fix), discovered in the same `/gsd-autonomous --only 0` session that surfaced this CI failure.
