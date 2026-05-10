# Phase 0 — Deferred / Out-of-Scope Items

Items discovered during execution that are out-of-scope for the current plan and must be addressed by another plan or operational follow-up.

## Discovered during Plan 02 execution (2026-05-10)

### 1. Pre-existing untracked Plan 03 hardware test scaffolds in working tree

**Found:** Before staging Task 1 commit, `git status` showed two untracked files in `tests/phase-0/`:
- `tests/phase-0/10-0-7-dle-sustained.ts`
- `tests/phase-0/10-0-8-queue-depth.ts`

Plus modified files:
- `tests/phase-0/package.json` — added `upng-js: 2.1.0` to devDependencies
- `tests/phase-0/pnpm-lock.yaml` — corresponding lockfile entries for `upng-js` + `pako`

**Source:** Not created by Plan 02 execution (this executor). Likely leftover from a prior abandoned Plan 03 attempt or a parallel orchestrator wave.

**Decision for Plan 02:** Out of scope. NOT staged explicitly in Plan 02 commit. However:

**ACTUAL OUTCOME:** Plan 02 Task 1 commit (`15e9922`) ended up containing 9 files instead of the 4 explicitly staged. The 5 extra files (`10-0-7-dle-sustained.ts`, `10-0-8-queue-depth.ts`, `10-0-9-palette-calibration.ts`, `package.json` mod, `pnpm-lock.yaml` mod) entered HEAD despite `git diff --cached --name-only` reporting only the 4 Plan 02 files immediately before `git commit`. Root cause: the global gitleaks pre-commit hook does not auto-stage; most likely a parallel orchestrator wave (Plan 03 executor) staged files concurrently during the moment between my `git diff --cached` check and `git commit`. No destructive `git reset --hard` was used to "undo" — that would have lost concurrent work. Instead the commit is left as-is + documented here.

**Action item for Plan 03 executor:** the three `10-0-{7,8,9}-*.ts` files + `upng-js` dep + `pnpm-lock.yaml` updates are NOW IN HEAD as part of commit `15e9922`. Plan 03 should:
- Verify those 3 files match Plan 03's expected design (likely yes — file paths match D-08 1-file-per-Specs-section convention)
- NOT re-create them in Plan 03 task commits
- Mark them as "previously committed during Plan 02 fat-commit deviation" in Plan 03 SUMMARY

### 2. Pre-existing `.planning/config.json` modification

**Found:** `git status` shows `M .planning/config.json` modified before Plan 02 started.

**Source:** Not created by Plan 02. Likely orchestrator setup (auto/parallel chain flag).

**Decision for Plan 02:** Out of scope. NOT touched by any Plan 02 commit.
