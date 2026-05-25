---
phase: quick-260525-oao
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - scripts/release-tag.mjs
  - package.json
  - .husky/pre-commit
  - Specs.md
  - README.md
  - docs/showcase/index.html
autonomous: true
requirements: [GITFLOW-CI, GITFLOW-RELEASE, GITFLOW-PRECOMMIT, GITFLOW-INV3]
must_haves:
  truths:
    - "CI runs on push and PR for both main and develop branches"
    - "On push to main, a release workflow runs Changesets Version-PR + (on merge with no changesets) a publish step that creates/pushes the v<version> tag and dispatches the existing foundry-module-release workflow"
    - "The publish/tag step is idempotent — does nothing if v<version> tag already exists"
    - "Pre-commit auto-fixes staged files with Biome and re-stages the fixes into the commit"
    - "Specs.md 11.5.6 + README + showcase describe the GitFlow model coherently (INV-3), in the same commit, with a changelog entry"
  artifacts:
    - path: ".github/workflows/release.yml"
      provides: "Changesets Version-PR + tag-and-dispatch release automation on main"
      contains: "changesets/action@v1"
    - path: "scripts/release-tag.mjs"
      provides: "Idempotent tag creation + gh workflow_dispatch of foundry-module-release.yml"
      contains: "foundry-module-release.yml"
    - path: ".husky/pre-commit"
      provides: "Biome auto-fix + re-stage pre-commit hook"
      contains: "biome check --write"
  key_links:
    - from: ".github/workflows/release.yml"
      to: "scripts/release-tag.mjs"
      via: "publish: pnpm run release:tag"
      pattern: "release:tag"
    - from: "scripts/release-tag.mjs"
      to: ".github/workflows/foundry-module-release.yml"
      via: "gh workflow run (workflow_dispatch -f tag=v<version>)"
      pattern: "foundry-module-release\\.yml"
    - from: "scripts/release-tag.mjs"
      to: "packages/foundry-module/package.json"
      via: "read .version then v<version> tag"
      pattern: "foundry-module/package\\.json"
---

<objective>
Adopt the GitFlow + automated-release tooling decided in the interactive Q&A: CI triggers on `develop` as well as `main`; a new `release.yml` runs the Changesets "Version-PR" model on `main` and, on merge, creates the `v<version>` tag and dispatches the existing `foundry-module-release.yml`; the pre-commit hook auto-fixes and re-stages with Biome; and the branch-strategy narrative is brought INV-3-coherent across Specs.md / README / showcase in a single commit.

Purpose: Move from manual trunk-based tagging to an automated GitFlow release pipeline without duplicating the existing packaging workflow and without introducing a new PAT secret.
Output: Edited `ci.yml`, new `release.yml` + `scripts/release-tag.mjs` + root `package.json` script, edited `.husky/pre-commit`, and INV-3-coherent branch-strategy prose across the three doc projections.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Exact current state extracted from the repo. Use these directly — no exploration needed. -->

.github/workflows/ci.yml — CURRENT triggers (lines 5-9), DO NOT touch any job/step below:
  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]
- `quality-gates` job has 8 gates (Biome CI, typecheck, coverage, TODO grep, snapshot, changeset-status, ADR-0011 guard, SKT-02 probe). Gate 7 (Changeset status, lines 62-64) is gated `if: github.event_name == 'pull_request'` and runs `pnpm changeset:status` (`changeset status --since=main`). LEAVE AS-IS.
- `commit-lint-pr-title` job is PR-only. LEAVE AS-IS.

.github/workflows/foundry-module-release.yml — EXISTING release packaging workflow. DO NOT duplicate its logic. It already accepts `workflow_dispatch` with input `tag` (lines 30-35) and an internal branch `if workflow_dispatch -> TAG=inputs.tag` (line 69). It builds the module, patches module.json, zips, creates the GitHub Release + uploads assets. We only DISPATCH it.

.changeset/config.json — `baseBranch: main`, `commit: false`, `access: restricted`, `privatePackages: { version: true, tag: false }`. Pre-1.0, private packages → NO npm publish.

packages/foundry-module/package.json — name `@evf/foundry-module`, version `0.1.0-alpha.0`. This version is the release-tag source → tag = `v0.1.0-alpha.0` form. NOTE: foundry-module-release.yml validates `vMAJOR.MINOR.PATCH[-prerelease]` (regex `^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$`), so prerelease tags ARE accepted.

Root package.json scripts (lines 11-22): includes `"changeset": "changeset"`, `"changeset:status": "changeset status --since=main"`, `"prepare": "husky || true"`. devDeps include `@changesets/cli@2.31.0`, `husky@^9`, `@biomejs/biome@2.4.15`. `packageManager: pnpm@10.33.4`.

.husky/pre-commit — CURRENT (2 lines):
  #!/usr/bin/env sh
  pnpm biome check --staged --no-errors-on-unmatched

.husky/commit-msg — `pnpm commitlint --edit "$1"`. LEAVE UNTOUCHED.

Specs.md §11.5.6 — CURRENT (lines 3733-3736), heading `### 11.5.6 Branch strategy`, two bullets:
  - **Decisione**: trunk-based development con `main` come default branch. Feature branches short-lived (<=1 settimana). PR required + 1 review (anche self-review) + CI green prima del merge.
  - **Releases**: tag semver per ogni package via Changesets. CI publishing automatico su `main` push tag.

Specs.md `## Changelog` starts at line 4050. Newest entry on top is `- **2026-05-18 (v0.9.13 SHIPPED ...)**`. Changelog convention: top-level bullet `- **<date> (<scope>)** — <summary>.` with nested sub-bullets. Drift policy (§0.1 line 51): annotate with `Re-verified ✓` or `Drift: ...`. NO version bump required for this change (purely branch-strategy narrative — no version/fps/phase/library/locale change).

README.md — has NO explicit trunk-based prose. Branch tooling appears only as a chip at line 156: `- **Tooling**: pnpm workspaces · Vitest · Biome · Changesets`. The branch-strategy mention to add/adjust is a short narrative line near that tooling context.

docs/showcase/index.html — NO explicit branch-strategy prose; only a `<span class="chip">Changesets</span>` at line 1012 inside the tech-chips block (lines 1007-1024). INV-3 coherence here = the Changesets chip stays and a sibling chip reflecting the GitFlow/automated-release flow is added, consistent with chip markup style — no structural rewrite.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend CI triggers to develop + add release.yml + release-tag.mjs + package.json script</name>
  <files>.github/workflows/ci.yml, .github/workflows/release.yml, scripts/release-tag.mjs, package.json</files>
  <action>
TASK A — Edit `.github/workflows/ci.yml` lines 6-9 ONLY: change `push.branches` from `[main]` to `[main, develop]` and `pull_request.branches` from `[main]` to `[main, develop]`. Do NOT modify any job, step, gate, `if:` condition, or the `commit-lint-pr-title` job. Gate 7 changeset-status keeps `if: github.event_name == 'pull_request'` and `--since=main` (changesets accumulate on develop; PRs into develop still compare against main, which is correct — the Version-PR consumes them only when merged to main).

TASK B — Create `.github/workflows/release.yml`:
- `name: Release`.
- `on: push: branches: [main]`.
- `permissions: contents: write` and `pull-requests: write` (Changesets action opens/updates the Version PR).
- `concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }` so overlapping main pushes don't race the tag step (do NOT cancel-in-progress — a half-cancelled tag push is worse than queueing).
- Single job `release` on `ubuntu-latest`. Steps in order: `actions/checkout@v4` with `fetch-depth: 0` (full history + tags needed for idempotent tag check); `pnpm/action-setup@v4` with `version: 10.33.4`; `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: pnpm`; run `pnpm install --frozen-lockfile --ignore-scripts`.
- Then `changesets/action@v1` with `version: pnpm changeset version` and `publish: pnpm run release:tag`, and `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. NO `npm publish` (pre-1.0, privatePackages tag:false per .changeset/config.json). When unconsumed changesets exist, the action opens/updates a "Version Packages" PR and the publish step does NOT run; when that PR is merged (no changesets left), the action runs `publish` (release:tag).
- Add a top-of-file comment block explaining the locked GitHub Actions gotcha: a tag pushed using the default GITHUB_TOKEN does NOT trigger `on: push: tags` in foundry-module-release.yml (GitHub suppresses recursive workflow runs from the default token). Therefore release-tag.mjs explicitly dispatches that workflow via `gh workflow run` (workflow_dispatch DOES fire with the default token). No PAT secret is introduced.

Create `scripts/release-tag.mjs` (Node ESM, runnable via `node scripts/release-tag.mjs` — repo is `"type": "module"`):
- Read `packages/foundry-module/package.json`, parse `.version`, compute `const tag = "v" + version`.
- Configure git author for the tag in CI: `git config user.name "github-actions[bot]"` and `git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`.
- Idempotency: check whether the tag already exists with `git rev-parse -q --verify "refs/tags/${tag}"` (or `git tag --list ${tag}`); if it exists, log `Tag ${tag} already exists — skipping.` and exit 0.
- Otherwise: `git tag ${tag}`, `git push origin ${tag}`, then `gh workflow run foundry-module-release.yml -f tag=${tag}` to trigger the existing packaging workflow (workflow_dispatch fires with the default token). Use `node:child_process` `execFileSync` with argv arrays (NO shell string interpolation of the tag value) and `stdio: "inherit"`. Let any non-idempotent failure throw (non-zero exit) so the workflow surfaces it.
- Add a header comment restating the GITHUB_TOKEN-cannot-trigger-workflows rationale.

Add to root `package.json` `scripts`: `"release:tag": "node scripts/release-tag.mjs"`. Place it adjacent to the existing `changeset` / `changeset:status` entries. Do not reorder or alter other scripts.
  </action>
  <verify>
    <automated>python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/release.yml')); print('yaml-ok')" && node --check scripts/release-tag.mjs && node -e "const p=require('./package.json'); if(!p.scripts['release:tag']) process.exit(1); console.log('script-ok')" && grep -qE "main, ?develop|- develop" .github/workflows/ci.yml && grep -q "changesets/action@v1" .github/workflows/release.yml && grep -q "foundry-module-release.yml" scripts/release-tag.mjs && pnpm changeset:status</automated>
  </verify>
  <done>ci.yml triggers on [main, develop] for both push and PR with all 8 gates + commit-lint job unchanged; release.yml parses as YAML, uses changesets/action@v1 with publish: pnpm run release:tag, has contents:write + pull-requests:write + concurrency guard; scripts/release-tag.mjs passes node --check, is idempotent on existing tag, configures git bot user, and dispatches foundry-module-release.yml; package.json has release:tag script; pnpm changeset:status still runs.</done>
</task>

<task type="auto">
  <name>Task 2: Pre-commit Biome auto-fix + re-stage</name>
  <files>.husky/pre-commit</files>
  <action>
TASK C — Edit `.husky/pre-commit` so Biome auto-fixes staged files and the fixes re-enter the commit. Keep the `#!/usr/bin/env sh` shebang. Replace the single command with two lines:
1. `pnpm biome check --write --staged --no-errors-on-unmatched` — auto-fixes (lint + format) the staged files in place.
2. `git update-index --again` — re-stages the already-tracked files Biome just modified, pulling the fixes into the commit. (`update-index --again` refreshes the index entries for paths already in the index — exactly the set Biome touched via `--staged`; it does not stage new untracked files, which is correct.)
Do NOT touch `.husky/commit-msg` (commitlint stays untouched). Keep the file a valid POSIX sh script (no bashisms). Confirm the re-stage mechanism actually re-adds Biome-modified files: after `--write`, the modified files are tracked + already in the index from the staging that triggered the hook, so `git update-index --again` updates their staged blob to the fixed content.
  </action>
  <verify>
    <automated>sh -n .husky/pre-commit && grep -q "biome check --write --staged" .husky/pre-commit && grep -q "git update-index --again" .husky/pre-commit && grep -q "commitlint" .husky/commit-msg</automated>
  </verify>
  <done>.husky/pre-commit is valid sh (sh -n passes), runs `pnpm biome check --write --staged --no-errors-on-unmatched` then `git update-index --again`; .husky/commit-msg unchanged (still runs commitlint).</done>
</task>

<task type="auto">
  <name>Task 3: INV-3 coherent GitFlow branch-strategy narrative (Specs + README + showcase, same commit)</name>
  <files>Specs.md, README.md, docs/showcase/index.html</files>
  <action>
TASK D — Update the branch-strategy narrative across all three INV-3 projections in this one task (executor commits them together).

1. Specs.md §11.5.6 (lines 3733-3736): rewrite the two bullets to describe GitFlow + automated release. Keep the `### 11.5.6 Branch strategy` heading. New content (Italian, matching surrounding prose):
   - **Decisione**: GitFlow — `develop` è il branch di integrazione permanente; feature branch `feature/*` partono da `develop` e vi rientrano via PR; `develop -> main` via PR di release. CI green + PR required prima di ogni merge (anche self-review). I milestone branch GSD diventano feature branch su `develop`.
   - **Releases**: modello Changesets "Version-PR". Push su `main` -> `changesets/action@v1` apre/aggiorna una PR "Version Packages" che bumpa le versioni per-package e consuma i changeset; al merge (zero changeset residui) lo step `publish` crea+pusha il tag `v<version>` (derivato da `@evf/foundry-module`) e dispatcha `foundry-module-release.yml`. Nessun `npm publish` (pre-1.0, privatePackages tag:false). Nota: un tag pushato col GITHUB_TOKEN di default NON triggera altri workflow -> il dispatch usa `gh workflow run` (workflow_dispatch), nessun PAT aggiuntivo.

2. Add a Changelog entry at the TOP of the `## Changelog` section (line 4050), above the `2026-05-18 (v0.9.13 ...)` entry, following the exact convention. Top bullet: `- **2026-05-25 (tooling — GitFlow + automated release)** — Branch strategy migrata da trunk-based a GitFlow ...`. Nested sub-bullets describing: CI triggers extended to `develop`; new `release.yml` Version-PR model + `scripts/release-tag.mjs` idempotent tag + `gh workflow run` dispatch of `foundry-module-release.yml` (the GITHUB_TOKEN-no-recursive-trigger rationale); pre-commit Biome `--write` auto-fix + `git update-index --again` re-stage; INV-3 coherence (§11.5.6 + README + showcase same commit). State explicitly: **No spec version bump** (purely branch-strategy/release-flow narrative — no version/fps/phase-count/library/locale change). Add a `Re-verified ✓ (n/a — internal tooling change, no upstream claim)` style note to satisfy the §0.1 drift-annotation convention.

3. README.md: near the Tooling line (line 156) add or adjust a concise branch-strategy/release note coherent with §11.5.6 — a one-line mention that the repo uses GitFlow (`feature/* -> develop -> main`) with automated Changesets-driven releases. Match README's existing terse bullet/prose style; do NOT introduce version/phase/hardware claims. If any `trunk-based` mention exists in README, update it to GitFlow.

4. docs/showcase/index.html: keep the `<span class="chip">Changesets</span>` (line 1012). Add a sibling chip in the same tech-chips block (lines 1007-1024) reflecting the flow, e.g. `<span class="chip">GitFlow</span>` (and/or `Automated release`), matching the exact chip markup/indent. No structural rewrite, no version/stat changes elsewhere.

All four edits land in the SAME commit (INV-3 hard gate). Do NOT change any version string, fps target, phase count, library version, or locale set anywhere.
  </action>
  <verify>
    <automated>grep -q "GitFlow" Specs.md && grep -qE "Version-PR|Version Packages|changesets/action" Specs.md && grep -q "2026-05-25 (tooling" Specs.md && grep -qiE "gitflow|develop" README.md && grep -qE "GitFlow|Automated release" docs/showcase/index.html && ! grep -qF "trunk-based development con" Specs.md && python3 -c "import html.parser; p=html.parser.HTMLParser(); p.feed(open('docs/showcase/index.html').read()); print('html-ok')"</automated>
  </verify>
  <done>Specs.md §11.5.6 describes GitFlow + Changesets Version-PR + tag-and-dispatch; the old trunk-based prose is gone; a 2026-05-25 tooling changelog entry exists at the top of the Changelog with the GITHUB_TOKEN rationale and "No spec version bump" note; README mentions GitFlow/develop near the Tooling line; showcase has a GitFlow/Automated-release chip alongside Changesets; no version/fps/phase/library/locale string changed; all three projections edited in one commit (INV-3).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI runner → GitHub API | Default GITHUB_TOKEN performs tag push + workflow_dispatch; scoped to this repo. |
| push event → workflow trigger | A tag pushed with the default token cannot recursively trigger `on: push: tags` (GitHub anti-loop protection). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rel-01 | Elevation of Privilege | release.yml token scope | mitigate | Use default `secrets.GITHUB_TOKEN` with explicit `permissions: contents: write, pull-requests: write` only; NO new PAT secret, no broader scope. |
| T-rel-02 | Tampering | release-tag.mjs git/gh calls | mitigate | `execFileSync` with argv arrays (tag value never interpolated into a shell string); tag derived from a versioned in-repo file, not external input. |
| T-rel-03 | Denial of Service | overlapping main pushes racing the tag step | mitigate | `concurrency` group with `cancel-in-progress: false` queues runs; tag step is idempotent (skip if tag exists). |
| T-rel-04 | Repudiation | release-tag.mjs partial run leaves tag without packaged release | mitigate | Tag push immediately followed by `gh workflow run`; idempotent re-run (skip-if-exists tag + re-runnable workflow_dispatch) recovers cleanly. |
| T-rel-SC | Tampering | npm/pip/cargo installs | accept | No new package-manager installs in this plan (only YAML/script/doc edits); existing pinned deps unchanged. No legitimacy gate required. |
</threat_model>

<verification>
- `python3 -c "import yaml; yaml.safe_load(...)"` parses both ci.yml and release.yml.
- `node --check scripts/release-tag.mjs` passes; `sh -n .husky/pre-commit` passes.
- `pnpm changeset:status` still runs (changeset config untouched).
- All 8 CI gates and the commit-lint-pr-title job in ci.yml are byte-unchanged except the two trigger lines.
- INV-3: §11.5.6 + README + showcase + a changelog entry all updated together; no version/fps/phase/library/locale drift.
- foundry-module-release.yml is NOT modified (its packaging logic is reused via workflow_dispatch).
</verification>

<success_criteria>
- CI triggers on push + PR for both `main` and `develop`; gate logic untouched.
- `release.yml` runs the Changesets Version-PR model on `main` and, on Version-PR merge, runs `release:tag` which idempotently creates+pushes `v<version>` and dispatches `foundry-module-release.yml` using only the default token.
- Pre-commit auto-fixes with Biome and re-stages the fixes into the commit.
- Branch-strategy narrative is GitFlow-coherent across Specs.md / README / showcase with a changelog entry, in one commit, with no spec-version bump.
- Out of scope respected: no develop branch creation, no git push to origin, no branch-protection, no changeset consumption, no version bump.
</success_criteria>

<output>
Create `.planning/quick/260525-oao-adottare-gitflow-branch-develop-release-/260525-oao-SUMMARY.md` when done.
</output>
