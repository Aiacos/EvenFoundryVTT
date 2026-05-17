---
phase: 01-foundation
plan: 01
subsystem: tooling-foundation
tags: [monorepo, pnpm, typescript, biome, vitest, changesets, commitlint, husky, wave-0]
dependency-graph:
  requires: []
  provides:
    - workspace-root-manifest
    - pinned-tool-versions
    - typescript-strict-base
    - biome-lint-format-baseline
    - vitest-workspace-config
    - changesets-pre1-policy
    - conventional-commits-enforcement
  affects: [phase-1-plan-02-packages, phase-1-plan-03-adrs-ci, all-future-waves]
tech-stack:
  added:
    - typescript@5.8.3
    - "@biomejs/biome@2.4.15"
    - vitest@4.1.5
    - "@vitest/coverage-v8@4.1.5"
    - happy-dom@20.9.0
    - "@playwright/test@1.59.1"
    - "@changesets/cli@2.31.0"
    - tsx@4.21.0
    - "@types/node@25.6.2"
    - "@commitlint/cli@^19.0.0 (resolved 19.8.1)"
    - "@commitlint/config-conventional@^19.0.0 (resolved 19.8.1)"
    - "husky@^9.0.0 (resolved 9.1.7)"
    - "pnpm@10.33.4 (packageManager pin)"
    - "Node 24 LTS (.nvmrc; runtime requires >=24)"
  patterns:
    - "Exact pinned versions (no ^/~) for build/lint/test toolchain (T-01-01 mitigation)"
    - "Vitest 4 test.projects API (NOT deprecated vitest.workspace.ts)"
    - "TS strict + 5 critical flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes, noUnusedLocals, noUnusedParameters, noImplicitOverride)"
    - "Biome recommended + 4 strict rules (noExplicitAny warn, noConsole warn-with-test-allowlist, noUnusedImports error, noUnusedVariables error)"
    - "Changesets pre-1.0 triple-gate (access:restricted + privatePackages.tag:false + per-pkg private:true Wave 1)"
    - "Conventional Commits enforced locally via Husky commit-msg + pre-commit biome staged"
key-files:
  created:
    - path: package.json
      role: workspace-root-manifest
    - path: pnpm-workspace.yaml
      role: package-glob
    - path: pnpm-lock.yaml
      role: deterministic-install-pin
    - path: .nvmrc
      role: node-version-pin
    - path: .npmrc
      role: pnpm-strictness-defaults
    - path: .gitignore
      role: ignore-build-cache-secrets
    - path: .gitattributes
      role: lf-line-endings-INV-1
    - path: .editorconfig
      role: editor-consistency
    - path: tsconfig.base.json
      role: strict-TS-base
    - path: biome.jsonc
      role: lint-format-config
    - path: vitest.config.ts
      role: test-runner-workspace-config
    - path: .changeset/config.json
      role: independent-semver-pre1-policy
    - path: .changeset/README.md
      role: workflow-documentation
    - path: commitlint.config.js
      role: conventional-commits-rules
    - path: .husky/commit-msg
      role: git-hook-commitlint
    - path: .husky/pre-commit
      role: git-hook-biome-staged
  modified:
    - path: .gitignore
      role: extend-with-pnpm-store-husky-changeset-cache
decisions:
  - "D-1.03 Pinned versions verified live npm 2026-05-11: TS 5.8.3, pnpm 10.33.4 (latest-10), Biome 2.4.15, Vitest 4.1.5, Changesets 2.31.0, tsx 4.21.0, @types/node 25.6.2, happy-dom 20.9.0, @playwright/test 1.59.1 — all match Phase 0 drift-corrected pins."
  - "D-1.04 tsconfig.base.json lifted from tests/phase-0/tsconfig.json (Phase 0 proven green) with noEmit at base."
  - "D-1.05 Biome recommended + 4 strict rules + 2 overrides (test files allow console; .txt fixtures excluded from formatter for INV-1 char-precision)."
  - "D-1.06 Vitest 4 test.projects API used (NOT deprecated workspace.ts). Coverage v8 with 80% thresholds workspace-wide. Per-package tiering deferred to Phase 4a per RESEARCH Open Question 2."
  - "D-1.12 Changesets independent semver; access:restricted; privatePackages.tag:false (triple-gate against accidental publish — Pitfall 5)."
  - "D-1.13 Trunk-based: baseBranch:main in changeset config."
  - "D-1.14 commitlint scope-enum severity 1 (warn) per RESEARCH Open Question 4 — allows phase plan-ID scopes (NN-NN) without false errors; subject-case disabled for Italian commits."
  - "D-1.15 Node 24 LTS via .nvmrc; engines.node >=24.0.0."
metrics:
  duration-seconds: 480
  files-created: 16
  files-modified: 1
  tasks-completed: 3
  commits: 3
  completed: 2026-05-11
---

# Phase 1 Plan 01: Tooling Foundation Summary

**One-liner:** Workspace root scaffolded with pinned-version pnpm+TypeScript+Biome+Vitest+Changesets+commitlint+Husky toolchain; all 6 Wave 0 quality gates green on greenfield install.

## Overview

Wave 0 of Phase 1: atomic installation of the EVF monorepo **tooling foundation** before any application code lands. 14 files in 3 atomic commits delivered the complete dev/build/test/format/lint/version/commit-message infrastructure. No `packages/*` members exist yet — Wave 1 (Plan 02) populates them, inheriting from this base.

The plan **lifted from `tests/phase-0/tsconfig.json`** the strict TypeScript config (already proven green in Phase 0 hardware validation), promoted it to `tsconfig.base.json` with `noEmit` at base level so each package opts into emit independently.

## Files Committed

**16 root-level files + 1 lockfile** across 3 atomic commits on `main` (trunk-based per D-1.13).

| Commit    | Files                                                                                                                                                                                                | Purpose                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `5096129` | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `.npmrc`, `.gitignore` (modified), `.gitattributes`, `.editorconfig`                                                                | Task 1: workspace manifest + pinned devDeps + line-ending policy                |
| `e448e0d` | `tsconfig.base.json`, `biome.jsonc`, `vitest.config.ts`, `.changeset/config.json`, `.changeset/README.md`                                                                                            | Task 2: strict TS + lint + test + version config                                |
| `06819bf` | `commitlint.config.js`, `.husky/commit-msg`, `.husky/pre-commit`                                                                                                                                     | Task 3: Conventional Commits enforcement + staged-files lint hook                |

## Pinned Versions Used

All versions verified live against npm registry on **2026-05-11** before pinning (T-01-01 mitigation; mirrors Phase 0 Plan 01 §Pinned Versions Used discipline).

| Package                              | Pinned     | Live latest (2026-05-11) | Drift? | Note                                                                  |
| ------------------------------------ | ---------- | ------------------------ | ------ | --------------------------------------------------------------------- |
| typescript                           | `5.8.3`    | `6.0.3`                  | by design | TS 6.0.3 only days old; D-1.03 specifies conservative pin on 5.8.x   |
| pnpm                                 | `10.33.4`  | `11.0.9` (latest-10 = `10.33.4`) | no  | `latest-10` dist-tag (LTS-track for monorepo stability)              |
| @biomejs/biome                       | `2.4.15`   | `2.4.15`                 | no    | exact match                                                          |
| vitest                               | `4.1.5`    | `4.1.5`                  | no    | co-bump with `@vitest/coverage-v8`                                   |
| @vitest/coverage-v8                  | `4.1.5`    | `4.1.5`                  | no    | exact match                                                          |
| happy-dom                            | `20.9.0`   | `20.9.0`                 | no    | exact match                                                          |
| @playwright/test                     | `1.59.1`   | `1.59.1`                 | no    | exact match (Phase 4+ use; pre-installed for early CI baseline)      |
| @changesets/cli                      | `2.31.0`   | `2.31.0`                 | no    | exact match                                                          |
| tsx                                  | `4.21.0`   | `4.21.0`                 | no    | exact match                                                          |
| @types/node                          | `25.6.2`   | `25.6.2`                 | no    | exact match                                                          |
| @commitlint/cli                      | `^19.0.0`  | `21.0.0`                 | by design | RESEARCH §11 specifies `^19.0.0`; resolved to `19.8.1`               |
| @commitlint/config-conventional      | `^19.0.0`  | `21.0.0`                 | by design | matches `@commitlint/cli` major                                      |
| husky                                | `^9.0.0`   | `9.1.7`                  | by design | resolved to `9.1.7` (Husky 9 modern API)                             |

**No "ghost versions"** (i.e., versions that don't exist on npm) — every pin is resolvable. Phase 0 Plan 01 caught 2 ghost pins (TS 5.8.5, pnpm 10.3.1); this plan inherits the drift correction.

## Gate Results

All **6 Wave 0 quality gates GREEN** on final post-commit verification:

| Gate         | Command                                          | Exit  | Status |
| ------------ | ------------------------------------------------ | ----- | ------ |
| WAVE-0-G1    | `rm -rf node_modules && pnpm install --frozen-lockfile` | 0   | ✅     |
| WAVE-0-G2    | `pnpm biome ci .`                                | 0     | ✅     |
| WAVE-0-G3    | `pnpm tsc --noEmit -p tsconfig.base.json`        | 0     | ✅     |
| WAVE-0-G4    | `node_modules/.bin/vitest --run`                 | 0     | ✅     |
| WAVE-0-G5    | `pnpm changeset status`                          | 0     | ✅     |
| WAVE-0-G6 (good) | `echo "feat(g2-app): test" \| pnpm commitlint`  | 0 | ✅     |
| WAVE-0-G6 (bad)  | `echo "bad" \| pnpm commitlint`                 | 1 | ✅ (rejected as expected) |

G4 note: vitest run via `pnpm` wrapper hides true exit code (always 0); the real exit is observed via direct `node_modules/.bin/vitest` invocation. CI in Wave 2 must use the direct binary OR rely on Vitest's own non-zero propagation through pnpm — to be confirmed in Plan 03.

## Deviations from Plan

### [Rule 3 — Blocking fix] Vitest 4 `test.projects` glob requires non-empty match

- **Found during:** Task 2 G4 verification
- **Issue:** Vitest 4 errors fatally (exit 1) when `test.projects: ['packages/*']` resolves to **zero** directories. Wave 0 by definition has no `packages/*` members — Wave 1 (Plan 02) creates them.
- **Fix:** Commented out `test.projects: ['packages/*']` in `vitest.config.ts` with an explicit `WAVE 0 DEVIATION` comment block referencing this SUMMARY. Added `passWithNoTests: true` as belt-and-suspenders for the zero-test case once packages exist but contain no test files yet. Wave 1 Plan 02 MUST uncomment `projects` once the first package directory lands.
- **Files modified:** `vitest.config.ts` (Task 2 commit `e448e0d`)
- **Confidence:** HIGH — D-1.06 still honored (Vitest 4 modern API used); the temporary comment is documented and time-bounded.

### [Rule 3 — Blocking fix] Biome 2.4 `useBiomeIgnoreFolder` rule + design-asset exclusions

- **Found during:** Task 2 G2 first run
- **Issue 1 (rule):** Biome 2.4 emits `lint/suspicious/useBiomeIgnoreFolder` warning when ignore globs end in `/**` (folder-only) instead of `/**/*` (file-leaf). 9 warnings raised on initial config.
- **Fix 1:** Changed all folder-exclusion globs from `!**/dir/**` to `!**/dir/**/*` per Biome 2 rule.
- **Issue 2 (scope):** Biome `ci` scans entire workspace by default. Pre-existing design assets (`docs/showcase/index.html`, `Specs.md`, `README.md`, `.planning/`, `tests/phase-0/` — all Phase 0 outputs out of Wave 0 scope) failed with format/lint errors.
- **Fix 2:** Added explicit `!docs/**/*`, `!Specs.md`, `!README.md`, `!LICENSE`, `!.planning/**/*`, `!tests/phase-0/**/*`, `!**/.husky/**/*` exclusions. **Wave 1 Plan 02** brings `tests/phase-0/` into `packages/validation-harness/` and lint scope automatically.
- **Files modified:** `biome.jsonc` (Task 2 commit `e448e0d`)

### [Rule 3 — Blocking fix] Biome auto-format on `vitest.config.ts`

- **Found during:** Task 2 G2 first run
- **Issue:** `vitest.config.ts` initial multi-line array literal violated Biome 100-char line-width threshold inverted (Biome wanted single-line). 1 error: `File content differs from formatting output`.
- **Fix:** Ran `pnpm biome check --write vitest.config.ts` once; canonical format applied. Single-line `exclude: [...]` adopted.
- **Files modified:** `vitest.config.ts` (Task 2 commit `e448e0d`)

### [Operational note] Husky init overwrote `prepare` script

- **Found during:** Task 3 `pnpm husky init`
- **Issue:** `pnpm husky init` rewrites `"prepare": "husky"` overwriting the `"prepare": "husky || true"` Pitfall 4 grace.
- **Fix:** Re-edited `package.json` to restore `|| true`. Documented in commit message.
- **Files modified:** `package.json` (Task 3 commit `06819bf`)

### [Environmental note] Node v26 in PATH, .nvmrc pins 24 LTS

- **Found during:** Task 1 pre-install env check
- **Issue:** Local Node is `v26.0.0` (latest), not `24.x` LTS.
- **Resolution:** `engines.node: ">=24.0.0"` is satisfied by v26 (no install failure). `.nvmrc=24` remains as **documental LTS pin** — when `nvm use` is invoked, it activates Node 24 (D-1.15 honored). No CI impact: Wave 2 GitHub Actions workflow uses `node-version-file: .nvmrc` per RESEARCH §11.
- **Files modified:** none (no fix required; behaviour is by design).

### [Environmental note] `corepack` not installed; pnpm via Homebrew

- **Found during:** Task 1 install step
- **Issue:** `corepack enable` step from PLAN cannot run (binary missing on this host).
- **Resolution:** Homebrew-installed `pnpm@10.33.4` is already on PATH and matches `packageManager` field. The `packageManager` field remains for **other contributors using Corepack** (industry standard 2025+). No functional impact.

## Authentication Gates

None encountered.

## Hand-Off Notes for Plan 02 (Wave 1)

1. **Uncomment `test.projects`** in `vitest.config.ts` once the first `packages/*` directory lands. The deviation comment block tags exactly the line to revert.
2. **`tsconfig.base.json` is ready for per-package `extends`** via `"extends": "../../tsconfig.base.json"` (RESEARCH §11 §Per-package tsconfig.json example).
3. **Biome scope expands automatically** when `packages/*` members appear — the existing `!tests/phase-0/**/*` exclusion will need removal when `tests/phase-0/` is **deleted** (D-15 fold-in path completes); replace with default `packages/*` glob scan.
4. **Changesets workflow ready:** every Wave 1 PR adding a package should include a `.changeset/{name}.md` declaring the initial `0.1.0-alpha.0` bump.
5. **`packages/` directory is intentionally absent**: Wave 0 cannot create empty directories meaningfully under git; Wave 1 creates each package as it lands.
6. **`commitlint` scope-enum** already lists all 7 expected Wave 1 packages (`g2-app`, `bridge`, `foundry-module`, `shared-protocol`, `shared-render`, `validation-harness`, `foundry-mcp`). No changes needed when packages land.
7. **STACK.md + CLAUDE.md drift correction (Wave 2 Plan 03 closure):** these files still cite TypeScript 5.8.5 + pnpm 10.3.1. Update to 5.8.3 + 10.33.4 with `Re-verified ✓ 2026-05-11` line per INV-2 discipline. Atomic with `CLAUDE.md` §Repository state update to "Phase 1+".

## Self-Check: PASSED

- 16 created files exist on filesystem ✅
- All 3 commit hashes resolve in `git log` ✅
- All 6 Wave 0 gates re-verified post-commit ✅
- No untracked target files remaining (only pre-existing `.planning/STATE.md M` from orchestrator state-tracking) ✅
- `pnpm-lock.yaml` committed (3031 lines) ✅
