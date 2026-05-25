---
phase: quick-260525-oao
plan: 01
subsystem: ci/release/tooling
tags: [gitflow, ci, release-automation, changesets, biome, inv-3]
dependency_graph:
  requires: []
  provides: [gitflow-ci-triggers, release-automation, biome-autofix-precommit]
  affects: [.github/workflows/ci.yml, .github/workflows/release.yml, scripts/release-tag.mjs, package.json, .husky/pre-commit, Specs.md, README.md, docs/showcase/index.html]
tech_stack:
  added: [changesets/action@v1, gh workflow run (workflow_dispatch)]
  patterns: [GitFlow (feature/* -> develop -> main), Changesets Version-PR model, idempotent tag creation]
key_files:
  created:
    - .github/workflows/release.yml
    - scripts/release-tag.mjs
  modified:
    - .github/workflows/ci.yml
    - package.json
    - .husky/pre-commit
    - Specs.md
    - README.md
    - docs/showcase/index.html
decisions:
  - "GITHUB_TOKEN cannot trigger on:push:tags recursively — gh workflow run (workflow_dispatch) used as workaround, no PAT needed"
  - "Idempotency: tag-already-exists check before git tag to survive re-runs"
  - "cancel-in-progress: false on release concurrency group — half-cancelled tag push is worse than queueing"
  - "biome-ignore lint/suspicious/noConsole on all console.log in release-tag.mjs — intentional CLI progress output"
metrics:
  duration: "~20 min"
  completed: "2026-05-25"
  tasks: 3
  files: 8
---

# Quick Task 260525-oao: GitFlow + Automated Release Pipeline

**One-liner:** GitFlow branch model + Changesets Version-PR automated release via `release.yml` + `release-tag.mjs` with idempotent tag creation and `gh workflow run` dispatch of `foundry-module-release.yml`; Biome auto-fix pre-commit; INV-3-coherent §11.5.6 rewrite across Specs + README + showcase.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CI triggers + release.yml + release-tag.mjs + package.json script | `ca41cbf` | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/release-tag.mjs`, `package.json` |
| 2 | Pre-commit Biome auto-fix + re-stage | `be35295` | `.husky/pre-commit` |
| 3 | INV-3 GitFlow branch-strategy narrative | `e1831a6` | `Specs.md`, `README.md`, `docs/showcase/index.html` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome CI gate failures in release-tag.mjs**
- **Found during:** Task 1 verification
- **Issue:** `scripts/release-tag.mjs` used `console.log` (flagged by `lint/suspicious/noConsole` in Biome CI strict mode) and had unsorted imports + unquoted strings (format violations). Biome `ci` exited 1.
- **Fix:** Applied `biome check --write` to auto-fix format and import order. Added `// biome-ignore lint/suspicious/noConsole: intentional release-script progress output` on each `console.log` call (5 suppressions). Removed one unnecessary `biome-ignore` on `console.error` (which is not flagged by the rule). Final `biome ci` exits 0.
- **Files modified:** `scripts/release-tag.mjs`
- **Commit:** `ca41cbf`

**2. [Rule 3 - Blocking] pnpm cannot find biome binary in worktree (no node_modules)**
- **Found during:** Task 1 commit attempt
- **Issue:** The git worktree has no local `node_modules/` directory. The pre-commit hook runs `pnpm biome check --staged` which fails with "Command biome not found" because pnpm doesn't resolve binaries from the main repo's `node_modules` without a local install.
- **Fix:** Ran `pnpm install --frozen-lockfile --ignore-scripts` in the worktree root to link binaries from the pnpm store. This is a one-time worktree setup step; the lockfile is unchanged.
- **Files modified:** None (worktree setup only)
- **Commit:** Not tracked (infrastructure setup)

## Verification Results

All plan verification commands passed:

```
yaml-ok (ci.yml + release.yml)
node-check-ok (release-tag.mjs)
script-ok: node scripts/release-tag.mjs (package.json)
develop-trigger-ok (ci.yml branches: [main, develop])
changesets-action-ok (release.yml)
dispatch-target-ok (release-tag.mjs)
sh-n-ok (.husky/pre-commit)
biome-write-staged-ok
git-update-index-ok
commitlint-untouched-ok
GitFlow in Specs.md
Version-PR in Specs.md
2026-05-25 (tooling) in Specs.md changelog
GitFlow in README.md
GitFlow chip in showcase
old trunk-based prose removed
html-ok (docs/showcase/index.html)
```

## Known Stubs

None — all changes are complete implementations (CI config, release script, hook, docs).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surfaces beyond what the plan's threat model already covers (T-rel-01..04 all addressed).

## Self-Check: PASSED

- `.github/workflows/release.yml`: FOUND
- `scripts/release-tag.mjs`: FOUND
- `ca41cbf` (Task 1): present in `git log`
- `be35295` (Task 2): present in `git log`
- `e1831a6` (Task 3): present in `git log`
- INV-3: Specs.md + README.md + docs/showcase/index.html in same commit `e1831a6`
- No spec version bump (v0.9.13 unchanged)
