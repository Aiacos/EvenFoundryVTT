---
quick_id: 260511-kqh
slug: fix-ci-coverage-gate-exclude-phase-2-pla
date: 2026-05-11
completed: 2026-05-11T13:00:00Z
status: complete
implementation_commit: 2800995
ci_run: 25671568784
ci_conclusion: success
duration_minutes: ~10
---

# Summary: Fix CI coverage gate

## Outcome

`main` restored to green. CI run `25671568784` on commit `2800995` passed all 5 gates (Biome CI, TypeScript typecheck, **Vitest with coverage**, TODO discipline grep, Snapshot drift check).

## What changed

`vitest.config.ts` coverage section:

| Before                              | After                                                 |
|-------------------------------------|-------------------------------------------------------|
| `include: ['packages/*/src/**']`    | `include: ['packages/*/src/**/*.{ts,tsx}']`           |
| Generic excludes (test files, dist) | + Explicit excludes for 4 placeholder `index.ts` + `validation-harness/src/lib/**` |
| Inline comment promising "Phase 1 boundary policy" without implementing | Migration policy documented in file header with explicit rule for re-inclusion |

## Coverage now

Measured: shared-render only (the one package shipping behavior).

| Metric    | Result | Gate |
|-----------|--------|------|
| Lines     | 95%    | 80%  |
| Branches  | 91.66% | 80%  |
| Functions | 100%   | 80%  |
| Statements| 96%    | —    |

When Phase 2 lands and `shared-protocol/src/index.ts` ships real Zod schemas, the exclude entry for that file must be removed in the same PR, and Phase 2 tests must bring its coverage to ≥80%. Same rule applies to the other 3 placeholders as Phase 3/4a deliverables land.

## Commits

| Branch       | SHA        | Subject                                                          |
|--------------|------------|------------------------------------------------------------------|
| `main`       | `2800995`  | fix(*): coverage gate excludes Phase 2+ placeholders…           |
| milestone    | (rebased)  | same content, planning artifacts added on top                    |

## Verification chain

1. Local `pnpm test:coverage` → 96/91.66/100/95 ≥ 80% ✓
2. Local `pnpm typecheck` → exit 0 ✓
3. Local `pnpm biome ci .` → exit 0 (warnings unchanged) ✓
4. Local `pnpm vitest --run --update=false` → 16/16, no snapshot drift ✓
5. Pushed to `origin/main`
6. CI run 25671568784 → conclusion `success` ✓

## Deferred (mentioned in PLAN.md but out of scope)

- Workflow `concurrency` cancel-in-progress (separate quick task candidate)
- Branch protection on `main` requiring PR review (GitHub-side setting)
- `perFile: true` thresholds (worth enabling when Phase 2+ ships)

## Cross-cutting impact

None. Specs.md/README.md/showcase don't reference coverage policy specifics — no INV-3 doc sync needed. ADR-0008 (D-1.06 coverage thresholds) remains accurate at the threshold level (80%); only include/exclude semantics changed, which weren't part of the ADR's commitments.
