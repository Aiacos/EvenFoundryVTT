---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0008: Code Quality Configuration — Biome 2 + TS strict + Vitest coverage + CI gates + Conventional Commits

## Status

**ACCEPTED** — 2026-05-11. Binds every Phase 1+ commit. Concretizes INV-4 (Specs §0.1).

## Context and Problem Statement

INV-4 (Specs §0.1) ratifies "clean, optimized, documented, **zero dead/unreachable code** tolerated", with Biome + TypeScript strict + Vitest coverage gate enforced in CI; `// TODO` requires `(#issue)` or `(ADR-NNNN)`; JSDoc/TSDoc on every public API; hot-path benchmarks gate regressions. INV-4 binds from Phase 1 commit 1, but the *concrete* configuration (which Biome rules, which TS flags, what coverage threshold, which CI gates) needed a single-source decision document so downstream phases don't re-litigate.

## Decision Drivers

- INV-4 explicit ratification — automation, not aspiration (Specs §0.1)
- Phase 0 already proved TS strict + 5 flags green on 14 files (`tests/phase-0/`); lift verbatim
- Single tool for lint+format (Biome) — avoid two-tool ESLint+Prettier maintenance burden
- Coverage threshold concrete enough to gate but not so high it blocks legitimate scaffolding work
- Conventional Commits enforce-able locally + server-side (defense-in-depth against `--no-verify` bypass)

## Considered Options

- **Option A**: Biome 2.4.15 (`recommended` + 4 strict rules: noExplicitAny warn, noUnusedImports error, noUnusedVariables error, noConsole warn-with-test-allowlist) + TS 5.8.3 strict + 5 flags (noUnusedLocals, noUnusedParameters, noImplicitOverride, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, exactOptionalPropertyTypes — 6 actually) + Vitest 4.1.5 coverage 80% lines/branches/functions workspace-wide + GitHub Actions 7-gate CI + Conventional Commits via commitlint+Husky local + wagoid CI action server-side
- **Option B**: ESLint + Prettier + Jest + custom CI scripts (legacy)
- **Option C**: Biome only, no TS strict flags beyond `strict: true` baseline

## Decision Outcome

**Chosen: Option A — full stack as locked in CONTEXT.md D-1.03..D-1.10 + D-1.14.**

Justification: Option A is INV-4 made concrete. Phase 0 already proved every component works green. Single binary (Biome) means single config, single CI invocation, ~10× perf vs ESLint+Prettier. The 5 strict TS flags catch real bug classes (off-by-one in `arr[i]`, undefined optional chain, missing override) at compile time — Phase 0 stats.ts refactor (`sorted[0]!` → guard) was driven by exactly these flags.

Option B is the original sin we're avoiding. Option C leaves bugs at runtime that strict flags catch at compile time.

### Consequences

- Good: One config file per concern (`biome.jsonc`, `tsconfig.base.json`, `vitest.config.ts`, `commitlint.config.js`) — maintainable
- Good: CI gate is 7 checks but ~3-5 min total wall time (single-Node-24, pnpm cache)
- Good: Pre-commit feedback loop fast (Biome `--staged` on staged files only)
- Good: INV-4 enforced from commit 1 of Phase 1 — no quality debt accumulates
- Neutral/Risk: Coverage threshold workspace-wide at 80% (lines/branches/functions) may fail spuriously on packages with high glue-code ratio. Per-package tiering deferred to Phase 4a when real coverage data exists (RESEARCH Open Question 2). If a package needs override, document in this ADR's Superseded section with rationale.
- Neutral/Risk: `// TODO` discipline grep is shell-fragile (Bash extended regex vs GNU grep); CI workflow uses tested pattern (RESEARCH §Don't Hand-Roll line 391). Failure mode: false positive on edge case. Mitigated by inline `// biome-ignore` escape hatches.
- Neutral/Risk: Husky `commit-msg` is bypassable via `--no-verify` locally — server-side CI commitlint on PR title is the binding gate (T-01-04 mitigation in Plan 03 threat model).

### Confirmation

- Every PR runs `.github/workflows/ci.yml` 7 quality gates — frozen-lockfile, biome ci, tsc, vitest coverage, TODO grep, snapshot drift, changeset status
- Pre-commit hook runs `pnpm biome check --staged` (fast feedback)
- `commit-msg` hook runs `pnpm commitlint --edit "$1"` (local feedback)
- Phase 10 polish gate: dead-code scan via `pnpm biome check . | grep noUnusedX | wc -l` MUST return 0
- Phase 1 self-test: `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status` exits 0 on clean clone

## Pros and Cons of the Options

### Option A — Biome 2 + TS strict + Vitest 4 + 7-gate CI + Conventional Commits

- Good: Single-config-per-concern; INV-4 made concrete; Phase 0 proven path
- Good: Fast CI (~3-5 min); fast pre-commit (~1 s)
- Neutral: Workspace-wide coverage threshold (no per-package tiering yet) — defer to Phase 4a

### Option B — ESLint + Prettier + Jest + custom CI

- Bad: Two tools, two configs, ~10× slower; original sin

### Option C — Biome only, baseline TS strict

- Bad: Loses the 5 flags that catch real bugs at compile time; INV-4 partially enforced only

## More Information

- Specs.md §0.1 INV-4 (binding rule)
- CONTEXT.md D-1.03..D-1.06, D-1.09, D-1.10, D-1.14 (lock the values)
- RESEARCH.md §Standard Stack (verified versions), §Code Examples (config snippets), §Common Pitfalls 1+3+4+5+6+7
- Pinned versions (verified 2026-05-11): TypeScript 5.8.3, Biome 2.4.15, Vitest 4.1.5, @vitest/coverage-v8 4.1.5, pnpm 10.33.4, @commitlint/cli ^19.0.0, husky ^9.0.0, Node 24 LTS
- Related ADRs: [ADR-0001](./0001-layered-ui-model.md), [ADR-0002](./0002-protocol-versioning.md), [ADR-0003](./0003-tool-registry-pattern.md)
- Phase entry-gate citations: every Phase 1+ commit binds to this ADR
- Sources: Specs.md §0.1; CONTEXT.md D-1.03..D-1.16; RESEARCH.md (npm registry verifications 2026-05-11)
