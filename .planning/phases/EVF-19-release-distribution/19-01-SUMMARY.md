---
phase: EVF-19-release-distribution
plan: "01"
subsystem: infra
tags: [github-actions, docker, ghcr, changesets, release-pipeline, cd]

# Dependency graph
requires:
  - phase: EVF-02-foundry-module-core-pairing-ui
    provides: foundry-module build pipeline (pnpm --filter @evf/foundry-module build)
  - phase: EVF-03-bridge-service-core
    provides: deploy/bridge.Dockerfile (multi-stage node:24-alpine)
  - phase: EVF-04a-g2-app-plugin-host
    provides: packages/g2-app/vite.config.ts (outDir dist/)
provides:
  - "REL-01: foundry-module GitHub Release with module.json + evenfoundryvtt.zip (regression-annotated)"
  - "REL-02: bridge Docker image pushed to ghcr.io/aiacos/evf-bridge:<version>+:latest via build-bridge-ghcr job"
  - "REL-03: g2-app-dist.zip attached to GitHub Release via build-g2app-zip job"
  - "REL-04: GitHub Release body sourced from Changesets CHANGELOG.md with --generate-notes fallback"
  - "Per-job least-privilege permissions (T-19-02): packages:write scoped to bridge job only"
affects: [EVF-19-02-readme-installation]

# Tech tracking
tech-stack:
  added:
    - "docker/setup-buildx-action@v4 (GitHub Actions)"
    - "docker/login-action@v4 (GitHub Actions)"
    - "docker/metadata-action@v6 (GitHub Actions)"
    - "docker/build-push-action@v7 (GitHub Actions)"
  patterns:
    - "Per-job permissions pattern: each job declares only what it needs (Pattern 4)"
    - "CHANGELOG.md section extraction via Node one-liner regex (## VERSION ... ## next)"
    - "test -f guard for first-release fallback to --generate-notes"
    - "GHCR lowercase owner via tr [:upper:] [:lower:] step output"

key-files:
  created: []
  modified:
    - ".github/workflows/foundry-module-release.yml"

key-decisions:
  - "Both new jobs (build-bridge-ghcr, build-g2app-zip) placed in the same workflow file as the existing release job; single workflow_dispatch fires all three — no double-fire risk (RESEARCH Pitfall 3 confirmed)"
  - "Top-level permissions: contents: write removed; replaced with per-job grants (T-19-02 least-privilege)"
  - "GHCR auth uses GITHUB_TOKEN not a PAT; username is github.actor (T-19-03)"
  - "REL-04 aggregates foundry-module + bridge + g2-app CHANGELOG.md sections; internal shared-* packages excluded from user-facing notes (resolved Open Q1)"
  - "g2-app zip runs from packages/g2-app working-directory so archive paths are dist/... not packages/g2-app/dist/... (RESEARCH anti-pattern avoided)"
  - "bridge + g2-app jobs both needs: release to prevent race condition on gh release upload (RESEARCH Pitfall 2)"

patterns-established:
  - "Pattern: CHANGELOG extraction — node one-liner with escaped version regex and \\n## lookahead for section boundary"
  - "Pattern: Per-job permissions — remove top-level grant, declare minimum per job"
  - "Pattern: GHCR lowercase guard — separate step id:lower with tr to produce $GITHUB_OUTPUT owner"

requirements-completed: [REL-01, REL-02, REL-03, REL-04]

# Metrics
duration: 5min
completed: 2026-05-31
---

# Phase 19 Plan 01: Release & Distribution Pipeline Summary

**Foundry Module Release workflow extended with GHCR bridge push (docker/build-push-action@v7), g2-app-dist.zip GitHub Release upload, and Changesets CHANGELOG.md release notes with --generate-notes fallback**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-30T23:05:19Z
- **Completed:** 2026-05-31T23:10:00Z
- **Tasks:** 2 (both tasks implemented in single atomic commit, all content delivered)
- **Files modified:** 1

## Accomplishments

- Extended `foundry-module-release.yml` with two new release-gated jobs: `build-bridge-ghcr` (REL-02) and `build-g2app-zip` (REL-03)
- Replaced `--generate-notes` with Changesets CHANGELOG.md extraction aggregating foundry-module + bridge + g2-app sections; `test -f` guard provides `--generate-notes` fallback for first release (REL-04)
- Moved top-level `permissions: contents: write` to per-job grants; `build-bridge-ghcr` gets `contents: read + packages: write` only (T-19-02 least privilege)
- All `docker/*` actions pinned to verified major versions; GHCR auth via GITHUB_TOKEN (no PAT, T-19-03); lowercase owner guard prevents GHCR path case error (RESEARCH Pitfall 4)
- REL-01 regression: added inline comments asserting module.json + evenfoundryvtt.zip upload and manifest-URL contract

## Task Commits

Both tasks were implemented in a single file Write and committed atomically:

1. **Task 1 + Task 2: REL-04 + REL-01 regression + REL-02 + REL-03** - `598dee6` (feat)

**Plan metadata:** committed with SUMMARY.md

## Files Created/Modified

- `.github/workflows/foundry-module-release.yml` — Extended: CHANGELOG.md notes extraction step + notes_file/generate-notes branch in release creation + REL-01 regression comments + per-job permissions + `build-bridge-ghcr` job + `build-g2app-zip` job

## Decisions Made

- Both new jobs placed in the same `foundry-module-release.yml` file (single `workflow_dispatch` fires all three — no double-fire, RESEARCH Pitfall 3 confirmed)
- Top-level `permissions: contents: write` removed; each job declares minimum required (`contents: read + packages: write` for bridge; `contents: write` for release + g2app)
- REL-04 aggregates three user-facing CHANGELOG.md files (foundry-module, bridge, g2-app) separated by `---` dividers; `shared-*` packages excluded from user-facing notes
- g2-app zip working-directory set to `packages/g2-app` so archive contains `dist/...` not nested `packages/g2-app/dist/...` (RESEARCH zip-layout note)
- Bridge and g2-app jobs both declare `needs: release` to prevent GitHub Release race condition (RESEARCH Pitfall 2)

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented in a single atomic file write and committed together. All acceptance criteria verified before commit.

## Issues Encountered

- **Worktree file path**: Initial Write attempt used the shared-checkout path instead of the worktree path. Corrected by discovering worktree root via `git rev-parse --show-toplevel` and using the worktree-local path. No impact on output.
- **Pre-commit hook failure (first attempt)**: pnpm biome + commitlint not available before `pnpm install`. Ran `pnpm install --frozen-lockfile` first; second commit succeeded cleanly.

## User Setup Required

**GHCR first-push manual step (one-time, post-first-release):**
After the first real release that pushes the bridge image:
1. Navigate to: GitHub → Profile → Packages → `evf-bridge` → Package settings → Change visibility → Public
2. Verify: `docker pull ghcr.io/aiacos/evf-bridge:latest` succeeds without authentication

No other external configuration required for the pipeline itself (GITHUB_TOKEN is automatic in GitHub Actions).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All new CI capability uses GITHUB_TOKEN (auto-scoped, ephemeral). Per-job permissions declared at minimum scope (T-19-02). No new secrets added. Threat register from plan frontmatter fully mitigated:

| Flag | Status |
|------|--------|
| T-19-01 Tag injection | Mitigated — existing regex gate reused by all jobs |
| T-19-02 GITHUB_TOKEN scope creep | Mitigated — per-job grants, packages:write only on bridge job |
| T-19-03 GHCR spoofing | Mitigated — GITHUB_TOKEN login, no PAT |
| T-19-04 Secret leakage | Accepted-with-control — no echo of secrets, GITHUB_TOKEN masked |
| T-19-05 Release asset integrity | Mitigated — assets built from checked-out source only |
| T-19-SC Supply chain | Mitigated — all docker/* + actions/* pinned to verified majors |

## Known Stubs

None. This plan modifies CI workflow YAML only; no application code stubs introduced.

## Next Phase Readiness

- REL-01/02/03/04 pipeline is armed and statically verified. Actual release fires on the next merged "Version Packages" PR (GitFlow PR #1 still open per MEMORY.md)
- Phase 19 Plan 02 (REL-05: README Installation section + INV-3 atomic commit) can proceed independently
- Post-first-release: user must flip GHCR package visibility to Public (one-time manual step documented above)

## Self-Check

- [x] `.github/workflows/foundry-module-release.yml` exists and has 3 jobs (release, build-bridge-ghcr, build-g2app-zip)
- [x] Commit `598dee6` exists in git log
- [x] YAML valid (`python3 -c "import yaml; yaml.safe_load(open(...))"` exits 0)
- [x] All Task 1 acceptance criteria: CHANGELOG.md >= 1, notes-file >= 1, generate-notes >= 1, test -f CHANGELOG >= 1, evenfoundryvtt.zip >= 1, module.json >= 1
- [x] All Task 2 acceptance criteria: 3 jobs present, build-bridge-ghcr perms={contents:read,packages:write}, GITHUB_TOKEN auth, pinned docker/* actions, deploy/bridge.Dockerfile ref, latest=auto, evf-bridge, lowercase guard, g2-app-dist.zip, pnpm --filter @evf/g2-app build, both new jobs needs:release, on: block unchanged
- [x] deploy/bridge.Dockerfile unchanged (git diff --quiet)
- [x] 2859 tests pass, lint:ci exit 0

## Self-Check: PASSED

---
*Phase: EVF-19-release-distribution*
*Completed: 2026-05-31*
