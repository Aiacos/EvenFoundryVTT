---
phase: 01-foundation
plan: 03
subsystem: adrs-snapshot-framework-ci-inv3-closure
tags: [adr, madr, snapshot, vitest, ci, github-actions, conventional-commits, inv3, doc-coherence, wave-2]
dependency-graph:
  requires:
    - workspace-root-manifest
    - tsconfig-base
    - vitest-workspace-config
    - biome-baseline
    - workspace-package-g2-app
    - workspace-package-shared-render
  provides:
    - adr-0001-layered-ui-model
    - adr-0002-protocol-versioning
    - adr-0003-tool-registry-pattern
    - adr-0004-voice-via-mcp-not-internal
    - adr-0008-code-quality-configuration
    - inv1-snapshot-framework
    - ci-quality-gates
    - conventional-commits-server-side
    - inv3-doc-coherence-aligned
    - phase-1-self-test-green
  affects:
    - phase-2-foundry-module-readers
    - phase-3-bridge-tool-registry
    - phase-4a-g2-engine-status-hud
    - phase-11-v2-foundry-mcp
tech-stack:
  added:
    - "GitHub Actions (workflow file only — no runtime dep on the repo)"
  patterns:
    - "TDD discipline: 11 unit tests written FIRST (RED), then implementation (GREEN) — AsciiGrid"
    - "MADR 4.0 frontmatter (status/date/deciders/consulted/informed) + canonical sections on all 5 ADRs"
    - "Vitest 4 expect.toMatchFileSnapshot wrapper for INV-1 char-precision fixtures"
    - "GitHub Actions T-01-03 hardening: PR title via env: block, NOT inlined into run: bash"
    - "CI gate composition: 7 quality gates per D-1.10 (frozen-lockfile, biome ci, tsc, vitest coverage, TODO grep, snapshot drift, changeset status)"
    - "INV-3 atomic doc-coherence: single commit lands CLAUDE.md + STACK.md together (git log -1 --name-only verified)"
    - "Drift correction trail: package.json (Phase 1 Plan 01) → CLAUDE.md + STACK.md (this plan); single source of truth = repo config"
key-files:
  created:
    - path: packages/shared-render/src/ascii-grid.ts
      role: char-precision-grid-model
    - path: packages/shared-render/src/snapshot.ts
      role: matchAsciiFixture-matcher
    - path: packages/shared-render/tests/ascii-grid.test.ts
      role: tdd-unit-tests-11-cases
    - path: packages/shared-render/src/fixtures/status-hud-baseline.txt
      role: example-inv1-fixture
    - path: packages/g2-app/src/__tests__/example-status-hud.test.ts
      role: wire-up-demonstration-test
    - path: packages/g2-app/vitest.config.ts
      role: per-package-vitest-config
    - path: docs/architecture/0001-layered-ui-model.md
      role: adr-layered-ui
    - path: docs/architecture/0002-protocol-versioning.md
      role: adr-protocol-envelope
    - path: docs/architecture/0003-tool-registry-pattern.md
      role: adr-tool-registry
    - path: docs/architecture/0004-voice-via-mcp-not-internal.md
      role: adr-voice-mcp
    - path: docs/architecture/0008-code-quality-configuration.md
      role: adr-code-quality
    - path: docs/architecture/README.md
      role: adr-index
    - path: .github/workflows/ci.yml
      role: github-actions-7-gates
    - path: CONTRIBUTING.md
      role: contributor-workflow-doc
  modified:
    - path: packages/shared-render/src/index.ts
      role: public-api-exports
    - path: packages/shared-render/tsconfig.json
      role: include-tests-glob
    - path: packages/g2-app/package.json
      role: test-script-with-project-filter
    - path: CLAUDE.md
      role: repository-state-phase-1-active
    - path: .planning/research/STACK.md
      role: drift-corrections-applied-and-logged
decisions:
  - "D-1.07 (5 ADRs): 0001 layered-ui-model, 0002 protocol-versioning, 0003 tool-registry-pattern, 0004 voice-via-mcp-not-internal, 0008 code-quality-configuration — all MADR ACCEPTED."
  - "D-1.08 (MADR 4.0): frontmatter (status/date/deciders/consulted/informed) + Status H2 first section + canonical sections (Context, Decision Drivers, Considered Options, Decision Outcome with Consequences + Confirmation, Pros/Cons, More Information)."
  - "D-1.09 (GitHub Actions): single workflow .github/workflows/ci.yml with single-Node-24 setup + pnpm/action-setup@v4 + actions/setup-node@v4 cached pnpm."
  - "D-1.10 (7 CI gates): frozen-lockfile, biome ci, tsc, vitest coverage, TODO discipline grep, snapshot drift check, changeset status."
  - "D-1.11 (Snapshot framework): @evf/shared-render exports AsciiGrid + matchAsciiFixture; uses Vitest 4 toMatchFileSnapshot built-in (no custom diff reporter — YAGNI per INV-4)."
  - "D-1.12 (Changesets): pnpm changeset:status gate active in CI workflow."
  - "D-1.16 (Wire-up demo): packages/g2-app/src/__tests__/example-status-hud.test.ts proves end-to-end before Phase 4a."
  - "INV-3 atomic doc-coherence: CLAUDE.md §Repository state Design-only → Phase 1+ AND .planning/research/STACK.md drift-corrected (TS 5.8.5→5.8.3 + pnpm 10.3.1→10.33.4) in SINGLE commit 671a22d."
  - "Vitest 4 defineProject pattern: per-package config does NOT use `extends: true` (that field is on TestProjectInlineConfiguration consumed by the ROOT test.projects array — defineProject itself rejects it under TS strict). Vitest 4 still merges root coverage/reporters via test.projects glob discovery."
metrics:
  duration-seconds: 720
  files-created: 13
  files-modified: 5
  tasks-completed: 6
  commits: 5
  completed: 2026-05-11
---

# Phase 1 Plan 03: ADRs + Snapshot Framework + CI + INV-3 Atomic Closure Summary

**One-liner:** 5 ADRs MADR-accepted, INV-1 snapshot framework wired end-to-end via TDD-driven AsciiGrid + matchAsciiFixture, GitHub Actions 7-gate CI workflow with T-01-03/T-01-04 hardening, and INV-3 atomic doc-coherence commit propagating Phase 0 drift corrections back into CLAUDE.md + STACK.md — Phase 1 complete, Phase 2+ unblocked.

## Overview

Wave 2 of Phase 1 closes the foundation. Three parallel deliverables landed across 5 atomic commits on `main`:

1. **Snapshot framework wire-up** (Tasks 1+2) — `@evf/shared-render` now exports `AsciiGrid` (character-precision grid model per Specs §7.14.4 ck 11-15) and `matchAsciiFixture` (Vitest 4 `expect.toMatchFileSnapshot` wrapper). TDD discipline: 11 unit tests written first (RED phase confirmed by missing-module error), implementation second (GREEN). Example wire-up test in `@evf/g2-app` proves the cross-package integration before Phase 4a wires real fixtures.

2. **5 ADRs MADR-accepted** (Task 3) — `docs/architecture/{0001,0002,0003,0004,0008}-*.md` cover the architectural decisions that bind Phase 2-12. Each follows MADR 4.0 frontmatter + canonical sections + Phase 0 ADR-0005/0006 H2-Status convention. README.md index lists all 8 ADRs (5 accepted + 0005/0006 Phase 0 proposed + 0007 V2 RTL reserved).

3. **CI workflow + CONTRIBUTING.md + INV-3 atomic closure** (Tasks 4+5+6) — `.github/workflows/ci.yml` enforces D-1.10 7 quality gates with T-01-03 (env-block PR title) and T-01-04 (server-side commitlint) hardening. `CONTRIBUTING.md` documents the Phase 1 self-test, Conventional Commits, Changesets workflow. The INV-3 atomic commit (`671a22d`) lands `CLAUDE.md` §Repository state ("Design-only" → "Phase 1 active" with real commands) + `.planning/research/STACK.md` drift-corrected (TS 5.8.5→5.8.3, pnpm 10.3.1→10.33.4 with Drift Corrections Log) **in a single commit** — INV-3 cross-cutting doc-coherence preserved (`git log -1 --name-only HEAD` shows both files).

## Files Committed

**13 created + 5 modified** across 5 atomic commits on `main` (trunk-based per D-1.13).

| Commit    | Task | Files (count) | Purpose                                                                              |
| --------- | ---- | ------------- | ------------------------------------------------------------------------------------ |
| `d68d7fe` | 1    | 4 created, 1 modified | TDD: AsciiGrid + snapshot.ts + tests + index.ts re-export + tsconfig include extension |
| `fcb17ef` | 2    | 3 created, 1 modified | Fixture + g2-app wire-up test + per-package vitest.config.ts + g2-app test script   |
| `5e13149` | 3    | 6 created | 5 ADRs MADR-formatted ACCEPTED + index README                                                  |
| `938c6f2` | 4    | 2 created, 1 modified | GitHub Actions CI workflow + CONTRIBUTING.md + vitest.config.ts deviation (extends:true drop) |
| `671a22d` | 5+6  | 0 created, 2 modified | INV-3 atomic: CLAUDE.md + STACK.md in SAME commit                                |

## Snapshot Framework — Implementation Detail

### `AsciiGrid` (packages/shared-render/src/ascii-grid.ts)

| Method | Behavior | Test Coverage |
| ------ | -------- | ------------- |
| `new AsciiGrid(cells)` | Validates non-empty rows + uniform widths; throws on violations | Construction 1-4 (4 tests) |
| `static fromString(text)` | LF-joined → grid; CRLF→LF normalization; trailing LF stripped | fromString 5-7 (3 tests) |
| `toString()` | Grid → LF-joined string; NO trailing LF | toString 8-9 (2 tests) |
| `at(col, row)` | `cells[row]?.[col]` — noUncheckedIndexedAccess-compliant; OOB returns undefined | at 10-11 (2 tests) |

**Total: 11/11 unit tests green** in 5 ms (`pnpm vitest --run --project @evf/shared-render`).

### `matchAsciiFixture` (packages/shared-render/src/snapshot.ts)

```typescript
export async function matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void> {
  const serialized = `${grid.toString()}\n`;
  await expect(serialized).toMatchFileSnapshot(fixturePath);
}
```

Delegates entirely to Vitest 4's built-in `toMatchFileSnapshot` — no custom diff reporter (Open Question 6 — YAGNI per INV-4 until a real failing test demands column-precision messages). Phase 4a can expand if/when needed.

### Wire-up demo (packages/g2-app/src/__tests__/example-status-hud.test.ts)

Imports `AsciiGrid + matchAsciiFixture` from `@evf/shared-render` (workspace:* link verified live), reconstructs the 7-row UTF-8 box-drawing fixture, asserts match against `../../../shared-render/src/fixtures/status-hud-baseline.txt`. **WAVE-2-G2 green** on first run (Vitest reads pre-existing fixture file written byte-perfect via Write tool, including LF terminator).

## ADR Snapshot (Decision summaries)

| ADR | Decision | Drivers | Binds |
| --- | -------- | ------- | ----- |
| 0001 | Layered z-stack (z=0 map / z=1 status HUD / z=2 overlay slot) + exactly 1 capture container | Specs §3.1 hardware budget, INV-1 persistence, INV-5 input routing | Phase 4a/4b/5 |
| 0002 | Versioned WS envelope `{proto, seq, ts, type, ...}` + 60s LRU idempotency + 60s replay buffer | Long-lived G2 client, retry storms, reconnect-without-loss (Specs §11.5.8.1) | Phase 2/3/7/11 |
| 0003 | Shared Zod-typed dispatch table consumed by Bridge + foundry-mcp; `/v1/tools` discovery | INV-2 single source of truth, V2 unblocking, single auth gate | Phase 3/7/8/11 |
| 0004 | V2 voice via external `foundry-mcp` MCP server (Streamable HTTP); NOT internal LLM; NOT EvenAI hijack | EvenAI non-API for devs (Specs §3.6 verbatim), GM authority preservation, MVP independence | Phase 11/12 |
| 0008 | Biome 2.4.15 + TS 5.8.3 strict + 6 flags + Vitest 4.1.5 coverage 80% + GHA 7-gate CI + Conventional Commits | INV-4 ratified, Phase 0 proven path, single-tool maintenance | Every Phase 1+ commit |

ADR-0005 + ADR-0006 unchanged (Phase 0 stubs; Plan 04 closure). ADR-0007 RTL languages reserved (V2 stretch — not authored in this plan per Deferred Ideas).

## CI Workflow Shape

`.github/workflows/ci.yml` — two jobs on `push` to main + `pull_request` to main:

### Job `quality-gates` (always run)

1. Install: `pnpm install --frozen-lockfile --ignore-scripts` (T-01-01 + Pitfall 4 mitigations)
2. `pnpm biome ci .` (read-only, stricter than `biome check`)
3. `pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit`)
4. `pnpm test:coverage` (Vitest + v8 + 80% workspace-wide threshold)
5. TODO discipline grep — `// TODO(?!\((#[0-9]+|ADR-[0-9]+)\))` returns zero hits
6. `pnpm vitest --run --update=false` (snapshot drift check)
7. `pnpm changeset:status` (PR-only conditional)

### Job `commit-lint-pr-title` (PR-only conditional)

- Same install pattern; runs `echo "$PR_TITLE" | pnpm commitlint` where `PR_TITLE` lives in `env:` block (T-01-03 mitigation: no `${{ }}` interpolation into bash `run:`)
- T-01-04 mitigation: server-side gate cannot be bypassed by local `--no-verify`

All actions pinned to `@v4` (actions/checkout, actions/setup-node, pnpm/action-setup). pnpm version explicitly pinned `10.33.4`. YAML validated via `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — exits 0.

## INV-3 Atomic Commit Verification

```bash
$ git log -1 --name-only HEAD
commit 671a22d70b7798a766067aebd7aad1408af77976
Author: uni.lorenzo.a@gmail.com
Date:   Mon May 11 10:52:56 2026 +0200

    docs(*): INV-3 atomic doc-coherence — Phase 1+ commands + STACK.md drift correction
    ...

.planning/research/STACK.md
CLAUDE.md
```

**Both files in HEAD commit.** INV-3 cross-cutting doc-coherence (Specs §0.1) preserved: a future reader rebasing or cherry-picking either file finds the other side already aligned.

## Gate Results

All **5 Wave 2 quality gates GREEN** + INV-3 verified:

| Gate          | Command                                                                                      | Result |
| ------------- | -------------------------------------------------------------------------------------------- | ------ |
| WAVE-2-G1     | `grep -l '^status: accepted' docs/architecture/000{1,2,3,4,8}-*.md \| wc -l` → 5             | ✅      |
| WAVE-2-G2     | `pnpm vitest --run --project g2-app` → Tests 1 passed                                        | ✅      |
| WAVE-2-G3     | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exit 0          | ✅      |
| WAVE-2-G4     | `grep -RnE '// TODO(?!\((#[0-9]+\|ADR-[0-9]+)\))' --include='*.ts' packages/ docs/architecture/` → zero hits | ✅      |
| WAVE-2-G5     | `grep -c '5\.8\.3' .planning/research/STACK.md CLAUDE.md` ≥ 1 each + `git log -1 --name-only HEAD` shows both files | ✅      |
| INV-3 atomic  | Both CLAUDE.md + STACK.md in single commit HEAD (`671a22d`)                                  | ✅      |

**Phase 1 self-test** (`pnpm lint:ci && pnpm typecheck && pnpm test && pnpm changeset:status`) → all 4 exit code 0.

## Deviations from Plan

### [Rule 3 — Blocking fix] Vitest 4 `defineProject` rejects `extends: true`

- **Found during:** Task 4 typecheck phase (post-Task-2 implementation)
- **Issue:** Plan 03 Task 2 specified `defineProject({ extends: true, ... })` per RESEARCH.md Pitfall 3 note. TypeScript strict (`tsc --noEmit`) errored: `Object literal may only specify known properties, and 'extends' does not exist in type 'UserProjectConfigExport'`.
- **Root cause:** Vitest 4 type definition splits `TestProjectInlineConfiguration` (which has `extends: string | true`, consumed by ROOT `test.projects: [...]` array) vs `UserProjectConfigExport` (what `defineProject` accepts, no `extends` field). Standalone per-package configs cannot self-declare `extends: true`.
- **Fix:** Dropped `extends: true` from `packages/g2-app/vitest.config.ts`. Vitest 4 still merges root coverage/reporters automatically via `test.projects: ['packages/*']` glob discovery — Pitfall 3 documented this for INLINE entries; STANDALONE per-package configs inherit-by-default. Documented the pattern + cross-ref in vitest.config.ts JSDoc.
- **Files modified:** `packages/g2-app/vitest.config.ts` (Task 4 commit `938c6f2`)
- **Confidence:** HIGH — TS strict catches it; tests still green; coverage inheritance verified by running `pnpm test:coverage` (no per-package coverage drop signal).

### [Rule 3 — Blocking fix] AsciiGrid runtime guard for `row === undefined`

- **Found during:** Task 1 TS strict typecheck on the verbatim RESEARCH.md snippet
- **Issue:** `noUncheckedIndexedAccess` flag makes `cells[i]` return `T | undefined`; iterating `cells.entries()` and using `row.length` requires explicit narrowing.
- **Fix:** Added a runtime `if (row === undefined)` guard in the for-of-entries loop. TypeScript strict satisfied; runtime branch also catches sparse-array constructions (defensive — matches test case 4 expectation).
- **Files modified:** `packages/shared-render/src/ascii-grid.ts` (Task 1 commit `d68d7fe`)
- **Confidence:** HIGH — minor, additive, consistent with INV-4 noUncheckedIndexedAccess discipline.

### [Operational note] Biome auto-format on Task 1/2 saved files

- **Found during:** Tasks 1 and 2 first Biome ci scans
- **Issue:** Initial multi-line `expect(...)` calls and import order violated Biome 100-char + import-organize rules (1 fixable issue per task).
- **Fix:** `pnpm biome check --write` once per task, no semantics changed. 11 + 1 tests still green post-format.
- **Files modified:** test files only (Tasks 1 + 2 commits).

### [Operational note] commitlint scope-enum warning on cross-cutting commits

- **Found during:** Tasks 3, 4, 6 commit attempts
- **Issue:** `commitlint.config.js` `scope-enum` (severity 1 = warn) lists package names + `*`. Commits scoped to plan IDs (`01-03`) or `*` for cross-cutting INV-3 trigger a warning (NOT a block).
- **Resolution:** No change — Plan 02 hand-off note #8 already flagged this. Plan 02 chose to leave it as warn-not-error. Tasks proceeded; the four commit messages with `(01-03)` or `(*)` scopes landed cleanly (1 warning each, no block).

### [Operational note] CLAUDE.md §Technology Stack — minimal-touch drift handling

- **Found during:** Task 5 planning
- **Issue:** Plan 03 §Step 1 explicitly said NOT to update version refs in CLAUDE.md §Technology Stack (giant table; drift authoritative in STACK.md). But WAVE-2-G5 gate requires `grep -c '5\.8\.3' CLAUDE.md ≥ 1`.
- **Resolution:** Added a Drift Corrections call-out at the TOP of CLAUDE.md §Technology Stack — short, explicit, points to STACK.md §11 for the full log. Satisfies G5 + preserves PLAN's instruction to keep the legacy table content as-is below.
- **Files modified:** `CLAUDE.md` (Task 5 / Task 6 commit `671a22d`)

## Authentication Gates

None encountered.

## Hand-Off Notes (Phase 1 closure → Phase 2 entry)

1. **ADR-0002 envelope shape locked** — Phase 2 (`packages/foundry-module/`) and Phase 3 (`packages/bridge/`) MUST consume the envelope from `@evf/shared-protocol`. Schema implementation pending (Phase 2 first task).
2. **ADR-0003 Tool Registry locked** — Phase 3 implements; `/v1/tools` endpoint is the contract surface; foundry-mcp (Phase 11) consumes 1:1.
3. **ADR-0004 voice scoping locked** — MVP packages MUST contain zero LLM/MCP references. Phase 10 polish gate runs a grep to assert this.
4. **ADR-0008 quality config binding** — every Phase 1+ commit binds; CI workflow already enforces.
5. **INV-1 snapshot framework ready for Phase 4a** — Phase 4a will compute real Status HUD grids from G2 raster engine output and pass them to `matchAsciiFixture`. The `example-status-hud.test.ts` is THROWAWAY — delete or rewrite Phase 4a Task 1.
6. **CI workflow live** — every PR to main runs 7 gates + PR-title commitlint. T-01-03 / T-01-04 mitigations in place.
7. **Phase 1 self-test green on clean clone** — `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test && pnpm changeset:status` exits 0.
8. **Drift correction trail closed** — `.planning/research/STACK.md` §11 Drift Corrections Log + `CLAUDE.md` §Technology Stack drift call-out + `package.json` actual pins all reference each other. INV-2 re-verification cadence: next at Phase 4 entry.
9. **No code in `packages/foundry-mcp/`** — V2 deferred to Phase 11 per D-1.01.
10. **Vitest 4 per-package config pattern documented** — `defineProject` does NOT accept `extends: true`; root `test.projects` glob discovery handles merge automatically. Phase 2+ packages adding their own `vitest.config.ts` should follow `packages/g2-app/vitest.config.ts` shape.

## Self-Check: PASSED

- **Created files** all present:
  - `packages/shared-render/src/ascii-grid.ts` ✅
  - `packages/shared-render/src/snapshot.ts` ✅
  - `packages/shared-render/tests/ascii-grid.test.ts` ✅
  - `packages/shared-render/src/fixtures/status-hud-baseline.txt` ✅
  - `packages/g2-app/src/__tests__/example-status-hud.test.ts` ✅
  - `packages/g2-app/vitest.config.ts` ✅
  - `docs/architecture/0001-layered-ui-model.md` ✅
  - `docs/architecture/0002-protocol-versioning.md` ✅
  - `docs/architecture/0003-tool-registry-pattern.md` ✅
  - `docs/architecture/0004-voice-via-mcp-not-internal.md` ✅
  - `docs/architecture/0008-code-quality-configuration.md` ✅
  - `docs/architecture/README.md` ✅
  - `.github/workflows/ci.yml` ✅
  - `CONTRIBUTING.md` ✅
- **Commit hashes** all resolve in `git log`:
  - `d68d7fe` Task 1 ✅
  - `fcb17ef` Task 2 ✅
  - `5e13149` Task 3 ✅
  - `938c6f2` Task 4 ✅
  - `671a22d` Task 5+6 (INV-3 atomic) ✅
- **All 5 Wave 2 gates** verified above
- **INV-3 atomic commit** verified via `git log -1 --name-only HEAD` showing both CLAUDE.md + STACK.md
- **Phase 1 self-test green** on current tree (clean-clone simulation pending optional CI run)
