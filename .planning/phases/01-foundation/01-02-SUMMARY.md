---
phase: 01-foundation
plan: 02
subsystem: monorepo-packages
tags: [monorepo, pnpm, workspace, validation-harness, fold-in, wave-1]
dependency-graph:
  requires:
    - workspace-root-manifest
    - tsconfig-base
    - vitest-workspace-config
    - biome-baseline
  provides:
    - workspace-package-g2-app
    - workspace-package-bridge
    - workspace-package-foundry-module
    - workspace-package-shared-protocol
    - workspace-package-shared-render
    - workspace-package-validation-harness
    - phase-0-fold-in-complete
    - repo-root-aware-evidence-writer
  affects:
    - phase-1-plan-03-adrs-snapshot-ci
    - phase-0-plan-04-hardware-execution
    - all-future-phases-2-13
tech-stack:
  added:
    - "vite@8.0.11 (g2-app devDep)"
    - "tsup@8.5.1 (bridge + foundry-module devDep)"
    - "zod@4.4.3 (shared-protocol + validation-harness dep)"
    - "csv-stringify@6.5.2 (validation-harness dep)"
    - "upng-js@2.1.0 (validation-harness dep)"
    - "vitest@4.1.5 (shared-render devDep — workspace visibility)"
  patterns:
    - "Per-package tsconfig.json extends ../../tsconfig.base.json (5 LOC each)"
    - "workspace:* protocol for internal deps (g2-app/bridge/foundry-module → shared-protocol+render)"
    - "Source-package pattern for shared-protocol+shared-render (main/types -> ./src/index.ts, consumers transpile)"
    - "Hardware vs software test split: scripts/ tsx-executable | tests/ Vitest-runnable (RESEARCH Open Question 1)"
    - "Pitfall 8 mitigation: fileURLToPath + 4-level-up + EVF_REPO_ROOT env override for repo-root evidence writes"
    - "Package test script delegates to root vitest with --project filter (Pitfall 3 — projects config root-only)"
key-files:
  created:
    - path: packages/g2-app/{package.json,tsconfig.json,vite.config.ts,src/index.ts,README.md}
      role: g2-app-scaffold
    - path: packages/bridge/{package.json,tsconfig.json,src/index.ts,README.md}
      role: bridge-scaffold
    - path: packages/foundry-module/{package.json,tsconfig.json,src/index.ts,README.md}
      role: foundry-module-scaffold
    - path: packages/shared-protocol/{package.json,tsconfig.json,src/index.ts,README.md}
      role: shared-protocol-scaffold
    - path: packages/shared-render/{package.json,tsconfig.json,src/index.ts,README.md}
      role: shared-render-scaffold
    - path: packages/validation-harness/{package.json,tsconfig.json,README.md}
      role: validation-harness-package-manifest
    - path: packages/validation-harness/tests/path-resolution.test.ts
      role: pitfall-8-smoke-test
  modified:
    - path: vitest.config.ts
      role: re-enable-test.projects-packages-glob
    - path: biome.jsonc
      role: remove-stale-tests-phase-0-exclusion
    - path: packages/validation-harness/src/lib/output.ts
      role: repo-root-aware-path-resolution
    - path: packages/validation-harness/scripts/*.ts (8 files)
      role: import-path-rewrite-shared-to-src-lib
  moved:
    - from: tests/phase-0/_shared/{schemas,output,stats,branch-decision,hub}.ts
      to: packages/validation-harness/src/lib/{schemas,output,stats,branch-decision,hub}.ts
    - from: tests/phase-0/{10-0-*.ts, midiqol-config-probe.ts, run-all.ts}
      to: packages/validation-harness/scripts/{...}.ts
    - from: tests/phase-0/upng-js.d.ts
      to: packages/validation-harness/upng-js.d.ts
    - from: tests/phase-0/midiqol-probe-module/
      to: packages/validation-harness/foundry-modules/midiqol-probe-module/
  deleted:
    - path: tests/phase-0/{package.json,tsconfig.json,README.md,.gitignore,pnpm-lock.yaml}
      reason: workspace inheritance — package files redundant
    - path: tests/phase-0/  (entire directory)
      reason: gate G4 — fold-in complete
    - path: tests/  (parent directory, empty after fold-in)
      reason: housekeeping
decisions:
  - "D-1.01 (5 packages + 1 fold-in): all 6 @evf/* private workspace pkgs at 0.1.0-alpha.0 with extends ../../tsconfig.base.json"
  - "D-1.02 (Phase 0 D-15 fold-in): tests/phase-0/ → packages/validation-harness/ complete; tests/ dir entirely removed"
  - "Pitfall 8 mitigation: output.ts computes REPO_ROOT via fileURLToPath + path.resolve('../../../..') with EVF_REPO_ROOT env override priority"
  - "RESEARCH Open Question 1 honored: hardware scripts stay in scripts/ (tsx-executable) NOT tests/ (Vitest-bound); only software smoke in tests/"
  - "Pitfall 3 mitigation (Vitest projects config root-only): package test script delegates 'vitest --run --project @evf/validation-harness --root ../..' so sub-package invocation works"
  - "shared-render keeps zero internal deps; added vitest@4.1.5 as devDep for workspace visibility (pnpm m ls discoverability)"
metrics:
  duration-seconds: 607
  files-created: 25
  files-modified: 11
  files-moved-via-git: 16
  files-deleted: 6
  tasks-completed: 3
  commits: 3
  completed: 2026-05-11
---

# Phase 1 Plan 02: Workspace Packages + Validation-Harness Fold-In Summary

**One-liner:** 6 monorepo `@evf/*` workspace packages scaffolded (5 new + validation-harness folded from `tests/phase-0/`) with workspace:* linkage, repo-root-aware evidence writer (Pitfall 8 mitigation), and all 5 Wave 1 gates green.

## Overview

Wave 1 of Phase 1: materialize the 6 monorepo packages declared by D-1.01 + D-1.02. **Task 1** scaffolded the 5 new packages (`g2-app`, `bridge`, `foundry-module`, `shared-protocol`, `shared-render`) with minimal placeholder `src/index.ts` exports — no application code yet. **Task 2** performed the Phase 0 D-15 fold-in: `tests/phase-0/_shared/` → `packages/validation-harness/src/lib/`, the 8 hardware scripts → `scripts/`, the Foundry mini-module → `foundry-modules/`, the `upng-js.d.ts` ambient declaration to package top-level, with import-path rewrites and the critical Pitfall 8 path-resolution fix in `output.ts`. **Task 3** added `tests/path-resolution.test.ts` as the smoke test asserting evidence writes target the repo-root regardless of cwd.

All file moves used `git mv` to preserve history. The original `tests/phase-0/` directory (and its `tests/` parent) are entirely removed at end of Wave 1 (gate G4). Wave 0 deferred items closed: `vitest.config.ts` `test.projects: ['packages/*']` re-enabled; `biome.jsonc` `!tests/phase-0/**/*` exclusion removed.

## Files Committed

**25 created + 11 modified + 16 moved + 6 deleted** across 3 atomic commits on `main`.

| Commit    | Task | Summary                                                                                                                                      |
| --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `e5641cc` | 1    | 21 files (5 packages × {package.json, tsconfig.json, README.md, src/index.ts} + g2-app/vite.config.ts) + vitest.config.ts re-enable          |
| `0fa1364` | 2    | 16 file moves (Phase 0 fold-in) + 3 new validation-harness files (package.json, tsconfig.json, README.md) + biome.jsonc + output.ts rewrite |
| `b67a029` | 3    | tests/path-resolution.test.ts (4 test cases) + package.json test script fix                                                                   |

## Package Public Surface

| Package                    | name                      | version          | private | type   | deps (workspace + external)                                                              | scripts                                                                                                                    |
| -------------------------- | ------------------------- | ---------------- | ------- | ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/g2-app`          | `@evf/g2-app`             | `0.1.0-alpha.0`  | ✅      | module | `@evf/shared-protocol` + `@evf/shared-render` (workspace:*) + `vite@8.0.11` (devDep)     | `build`, `dev`, `typecheck`                                                                                                |
| `packages/bridge`          | `@evf/bridge`             | `0.1.0-alpha.0`  | ✅      | module | `@evf/shared-protocol` (workspace:*) + `tsup@8.5.1` (devDep)                             | `build`, `dev`, `typecheck`                                                                                                |
| `packages/foundry-module`  | `@evf/foundry-module`     | `0.1.0-alpha.0`  | ✅      | module | `@evf/shared-protocol` (workspace:*) + `tsup@8.5.1` (devDep)                             | `build`, `typecheck`                                                                                                       |
| `packages/shared-protocol` | `@evf/shared-protocol`    | `0.1.0-alpha.0`  | ✅      | module | `zod@4.4.3`                                                                              | `typecheck`                                                                                                                |
| `packages/shared-render`   | `@evf/shared-render`      | `0.1.0-alpha.0`  | ✅      | module | `vitest@4.1.5` (peerDep + devDep)                                                        | `typecheck`                                                                                                                |
| `packages/validation-harness` | `@evf/validation-harness` | `0.1.0-alpha.0`  | ✅      | module | `zod@4.4.3` + `csv-stringify@6.5.2` + `upng-js@2.1.0`                                    | `typecheck`, `test`, `validate:all`, `validate:all:skip-hardware`, `validate:r1-timing`, `validate:image-format`, `validate:ble-multi-env`, `validate:dle-sustained`, `validate:queue-depth`, `validate:palette-calibration`, `validate:midiqol-probe` |

## Phase 0 Fold-In Mapping (D-1.02 / Phase 0 D-15)

| Was (Phase 0)                                          | Is now (Phase 1+)                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `tests/phase-0/_shared/schemas.ts`                     | `packages/validation-harness/src/lib/schemas.ts`                               |
| `tests/phase-0/_shared/output.ts`                      | `packages/validation-harness/src/lib/output.ts` (rewritten — Pitfall 8 fix)   |
| `tests/phase-0/_shared/stats.ts`                       | `packages/validation-harness/src/lib/stats.ts`                                 |
| `tests/phase-0/_shared/branch-decision.ts`             | `packages/validation-harness/src/lib/branch-decision.ts`                       |
| `tests/phase-0/_shared/hub.ts`                         | `packages/validation-harness/src/lib/hub.ts`                                   |
| `tests/phase-0/10-0-1-r1-timing.ts`                    | `packages/validation-harness/scripts/10-0-1-r1-timing.ts`                      |
| `tests/phase-0/10-0-2-image-format.ts`                 | `packages/validation-harness/scripts/10-0-2-image-format.ts`                   |
| `tests/phase-0/10-0-3-ble-multi-env.ts`                | `packages/validation-harness/scripts/10-0-3-ble-multi-env.ts`                  |
| `tests/phase-0/10-0-7-dle-sustained.ts`                | `packages/validation-harness/scripts/10-0-7-dle-sustained.ts`                  |
| `tests/phase-0/10-0-8-queue-depth.ts`                  | `packages/validation-harness/scripts/10-0-8-queue-depth.ts`                    |
| `tests/phase-0/10-0-9-palette-calibration.ts`          | `packages/validation-harness/scripts/10-0-9-palette-calibration.ts`            |
| `tests/phase-0/midiqol-config-probe.ts`                | `packages/validation-harness/scripts/midiqol-config-probe.ts`                  |
| `tests/phase-0/run-all.ts`                             | `packages/validation-harness/scripts/run-all.ts`                               |
| `tests/phase-0/upng-js.d.ts`                           | `packages/validation-harness/upng-js.d.ts`                                     |
| `tests/phase-0/midiqol-probe-module/`                  | `packages/validation-harness/foundry-modules/midiqol-probe-module/`            |
| `tests/phase-0/package.json` (Phase 0 sub-pkg)         | DELETED — inherits from root workspace                                         |
| `tests/phase-0/tsconfig.json`                          | DELETED — replaced by `packages/validation-harness/tsconfig.json` (extends base) |
| `tests/phase-0/README.md`                              | DELETED — replaced by `packages/validation-harness/README.md` (updated content) |
| `tests/phase-0/.gitignore` + `pnpm-lock.yaml` + `node_modules/` | DELETED — workspace consolidation                                       |

All `git mv` operations preserved file history (similarity scores ranged 63–100%; some files showed `RM` rather than pure `R` because of import-path rewrites + Pitfall 8 changes — `git log --follow` still traces back).

## Pitfall 8 — Repo-Root-Aware Path Resolution

After fold-in, `output.ts` lives at `packages/validation-harness/src/lib/output.ts` — 4 levels deep from repo root. The naive `path.resolve("docs/perf/phase-0")` (cwd-relative) would silently write to `packages/validation-harness/docs/perf/phase-0/` when scripts are invoked from anywhere other than repo root.

**Rewrite snippet** (added to `output.ts`):

```typescript
import { fileURLToPath } from "node:url";

/**
 * Pure helper exposed for unit testing (Pitfall 8 smoke test).
 * EVF_REPO_ROOT env var takes priority (CI / sandbox); otherwise walk 4 levels up.
 */
export function computeRepoRoot(env: NodeJS.ProcessEnv, currentDir: string): string {
  const override = env["EVF_REPO_ROOT"];
  if (override !== undefined && override !== "") return override;
  return path.resolve(currentDir, "..", "..", "..", "..");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = computeRepoRoot(process.env, __dirname);

export const OUTPUT_DIR = path.join(REPO_ROOT, "docs", "perf", "phase-0");
```

The smoke test (`tests/path-resolution.test.ts`) exercises both branches: default 4-level-up walk + `EVF_REPO_ROOT` override (+ edge cases for empty-string handling).

## Gate Results

All **5 Wave 1 quality gates GREEN** on final post-Task-3 verification:

| Gate      | Command                                                                                                  | Exit | Status |
| --------- | -------------------------------------------------------------------------------------------------------- | ---- | ------ |
| WAVE-1-G1 | `pnpm m ls 2>&1 \| grep -cE '^@evf/'` → 6                                                                | 0    | ✅     |
| WAVE-1-G2 | `pnpm -r exec tsc --noEmit`                                                                              | 0    | ✅     |
| WAVE-1-G3 | `pnpm --filter @evf/validation-harness test`                                                             | 0    | ✅     |
| WAVE-1-G4 | `test ! -d tests/phase-0`                                                                                | 0    | ✅     |
| WAVE-1-G5 | `pnpm vitest --run --project @evf/validation-harness tests/path-resolution.test.ts`                      | 0    | ✅     |

Wave 1 path-resolution test: **4 test cases / 4 passed / 0 failed / 0 skipped** in 195 ms.

## Deviations from Plan

### [Rule 3 — Blocking fix] shared-render workspace visibility via vitest devDep

- **Found during:** Task 1 verification
- **Issue:** `pnpm m ls` did not list `@evf/shared-render` because the package declared only `peerDependencies` (vitest) with no `dependencies` or `devDependencies` — pnpm omits zero-dep packages from the default workspace listing. Wave 1 gate G1 ("6 workspace packages visible") wording was at risk.
- **Fix:** Added `vitest@4.1.5` to `devDependencies` of `packages/shared-render/package.json` (mirroring the peerDep). This declares the actual usage (Plan 03 will write code that imports types from vitest), causes pnpm to list the package by default, and does not change the consumer story (consumers still use the peerDep contract).
- **Files modified:** `packages/shared-render/package.json` (Task 2 commit `0fa1364`)
- **Confidence:** HIGH — pure additive, zero risk to downstream consumers.

### [Rule 3 — Blocking fix] Package test script Vitest `projects` root-only config

- **Found during:** Task 3 first attempt to run `pnpm --filter @evf/validation-harness test`
- **Issue:** Vitest 4 errored with `"No projects were found"` when invoked from the package directory because the root `vitest.config.ts` declares `test.projects: ['packages/*']`, and that glob is resolved relative to the cwd that started vitest — sub-package cwd resolves to `packages/validation-harness/packages/*` (empty).
- **Fix:** Updated `packages/validation-harness/package.json` `test` script from `vitest --run` to `vitest --run --project @evf/validation-harness --root ../..` so the sub-package invocation delegates to the workspace root config. Documents Pitfall 3 (RESEARCH §11) for Plan 03 future use.
- **Files modified:** `packages/validation-harness/package.json` (Task 3 commit `b67a029`)
- **Confidence:** HIGH — pattern works on both `pnpm --filter` and direct `cd packages/validation-harness && pnpm test`.

### [Operational note] Biome auto-format on 15 Phase 0 files post-fold-in

- **Found during:** Task 2 commit attempt
- **Issue:** Phase 0 files used `"double"` quotes; root `biome.jsonc` mandates `'single'` quotes. After fold-in, those files entered Biome's scope (which previously excluded `tests/phase-0/**`), causing the pre-commit hook to fail with format errors.
- **Fix:** Ran `pnpm biome check --write packages/validation-harness/` once; canonical format applied to 15 files (quote style + import organize). All logic preserved verbatim — only cosmetic style.
- **Files modified:** 8 scripts + 5 src/lib + 1 d.ts + 1 README (Task 2 commit `0fa1364`)
- **Confidence:** HIGH — Biome's safe-fix mode; tsc remained green; 4 path-resolution tests still pass.

### [Operational note] Commitlint header length + body line length adjustments

- **Found during:** Task 1 first commit attempt
- **Issue:** Initial header was 106 chars (> 100); body lines exceeded 100 chars per `body-max-line-length`.
- **Fix:** Shortened header (`feat(01-02): scaffold 5 monorepo packages`) and wrapped body lines to ≤100 chars. No content lost.

### [Operational note] scope-enum warning, not error

- **Observation:** `commitlint.config.js` declares `scope-enum` at severity `1` (warn) — the `01-02` scope used in commit messages is NOT in the enum list (which holds package names), but produces only a warning, no block. Plan 03 may consider whether to extend the enum to include phase-plan IDs `NN-NN`.

## Authentication Gates

None encountered.

## Hand-Off Notes for Plan 03 (Wave 2)

1. **`@evf/shared-render` ready to fill** with `src/ascii-grid.ts` + `src/snapshot.ts` + `src/fixtures/status-hud-baseline.txt`. The package's `main`/`types` already point at `./src/index.ts` so consumers will import via `import { matchAsciiFixture } from '@evf/shared-render'` once exports land.
2. **`@evf/g2-app` ready for example test** — `packages/g2-app/src/__tests__/example-status-hud.test.ts` can import `@evf/shared-render` via workspace:* link. To run a g2-app test, the package needs a `test` script following the same pattern as validation-harness: `"test": "vitest --run --project @evf/g2-app --root ../.."`.
3. **ADRs to write** (Plan 03): `docs/architecture/0001-layered-ui-model.md`, `0002-protocol-versioning.md`, `0003-tool-registry-pattern.md`, `0004-voice-via-mcp-not-internal.md`, `0008-code-quality-configuration.md` — all 5 MADR-formatted following Phase 0 `0005`/`0006` style.
4. **CI workflow** (Plan 03): the 5 Wave 1 gates above all need to be wired into `.github/workflows/ci.yml`. Additionally: WAVE-0 gates G1–G6 still apply (biome ci, tsc, vitest, changeset status, commitlint).
5. **Phase 0 Plan 04 unblocked**: hardware scripts now run via `pnpm --filter @evf/validation-harness validate:all` (or `validate:all:skip-hardware` for Pattern 3 software smoke). Evidence still writes to repo-root `docs/perf/phase-0/` — Pitfall 8 covered.
6. **STACK.md + CLAUDE.md drift correction** (still pending — Wave 2 Plan 03 closure per Wave 0 hand-off note #7): update from TypeScript 5.8.5 → 5.8.3 and pnpm 10.3.1 → 10.33.4 with `Re-verified ✓ 2026-05-11` line per INV-2.
7. **CLAUDE.md §Repository state** update from "Design-only" → "Phase 1+" is the INV-3 atomic commit Plan 03 will include alongside ADRs + CI.
8. **`commitlint` scope-enum**: optionally add `01-01`, `01-02`, etc., or change `scope-enum` severity from `1`(warn) to `0` (off) to silence the warning. Not blocking.

## Self-Check: PASSED

- **Created files** verified via `find packages/{g2-app,bridge,foundry-module,shared-protocol,shared-render,validation-harness} -type f`: all 25 created files present
- **Commit hashes** `e5641cc`, `0fa1364`, `b67a029` all resolve in `git log --oneline`
- **All 5 Wave 1 gates** re-verified post-Task-3
- **Workspace install** clean: `pnpm install` exit 0 with 7 workspace projects (1 root + 6 packages)
- **No untracked target files**: `git status --short` clean after Task 3 commit
- **`tests/` directory completely absent** (Phase 0 fold-in path complete)
- **Wave 0 deferred items closed**: `vitest.config.ts test.projects` re-enabled + `biome.jsonc tests/phase-0` exclusion removed
