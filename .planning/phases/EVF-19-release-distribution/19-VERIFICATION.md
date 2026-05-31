---
phase: 19-release-distribution
verified: 2026-05-31T01:30:00Z
status: human_needed
score: 5/5 must-haves verified (automated checks)
overrides_applied: 0
human_verification:
  - test: "Install Foundry module from published manifest URL"
    expected: "Foundry's 'Install Module' dialog accepts https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json and installs the module with socketlib + midi-qol as required dependencies"
    why_human: "Requires a published GitHub Release and a running Foundry VTT instance; no release tag exists yet"
  - test: "docker pull ghcr.io/aiacos/evf-bridge:<version> from any machine"
    expected: "Pull succeeds without authentication, producing a runnable bridge container that passes /healthz"
    why_human: "Requires a published GHCR package + the one-time private→public visibility flip (documented in docs/release/bridge.md §2); no image has been pushed yet"
  - test: "Download g2-app-dist.zip from GitHub Release and serve it"
    expected: "Zip extracts to dist/ containing index.html + wizard.html + assets/; serving via any HTTPS static host produces a functional g2-app plugin"
    why_human: "Requires a published GitHub Release; no release has been cut yet"
  - test: "Inspect GitHub Release page release notes"
    expected: "Release body shows human-curated Changesets changelog content (## <version> section), not a raw commit list"
    why_human: "Requires a real release dispatch + Changesets CHANGELOG.md files having been written by 'pnpm changeset version'; visual inspection of the GitHub Release page"
  - test: "GHCR first-push private-to-public visibility flip"
    expected: "After the first release that pushes the bridge image, owner navigates GitHub → Packages → evf-bridge → Package settings → Change visibility → Public; subsequent docker pull works unauthenticated"
    why_human: "One-time manual GitHub UI step; not automatable via GITHUB_TOKEN (documented in docs/release/bridge.md §2)"
---

# Phase 19: Release & Distribution Verification Report

**Phase Goal:** End users can install and run the entire EVF system from publicly-published CI-built artifacts without manual build steps
**Verified:** 2026-05-31T01:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On a version-tag release dispatch, CI attaches module.json + evenfoundryvtt.zip to the GitHub Release (REL-01 regression-protected) | VERIFIED | `release` job steps: build foundry-module, patch module.json, zip, `gh release upload ... module.json evenfoundryvtt.zip --clobber`; inline comment asserts manifest URL contract `/releases/latest/download/module.json` |
| 2 | On a version-tag release dispatch, CI builds deploy/bridge.Dockerfile and pushes ghcr.io/<owner>/evf-bridge:<version> + :latest | VERIFIED | `build-bridge-ghcr` job: `docker/build-push-action@v7` with `file: deploy/bridge.Dockerfile`, `docker/metadata-action@v6` with `latest=auto` + semver tags; `steps.lower.outputs.owner` guard for GHCR lowercase path |
| 3 | On a version-tag release dispatch, CI builds g2-app and attaches g2-app-dist.zip to the GitHub Release | VERIFIED | `build-g2app-zip` job: `pnpm --filter @evf/g2-app build` + `zip -r ../../g2-app-dist.zip dist/` (from `working-directory: packages/g2-app`) + `gh release upload "$TAG" g2-app-dist.zip --clobber` |
| 4 | GitHub Release body is sourced from foundry-module CHANGELOG.md version section, with --generate-notes fallback when no CHANGELOG.md exists | VERIFIED | `Extract release notes from CHANGELOG.md` step: `test -f packages/foundry-module/CHANGELOG.md` guard, node one-liner with escaped-version regex + `\n##` lookahead, aggregates bridge + g2-app sections; `notes_file` output drives `--notes-file` vs `--generate-notes` branch |
| 5 | README has `## Installation` section documenting all 3 components (foundry-module manifest URL, bridge GHCR docker pull, g2-app static host g2-app-dist.zip), coherent with Specs.md + showcase per INV-3 | VERIFIED | `grep -c '^## Installation' README.md` = 1; `releases/latest/download/module.json` present; `ghcr.io/aiacos/evf-bridge` present (2×); `g2-app-dist.zip` present (2×); Specs.md changelog stanza for Phase 19 REL-01..05 with explicit "No spec version bump" line; docs/showcase/index.html updated with Phase 19 distribution note; commit `23fe555` atomically touches README.md + Specs.md + docs/showcase/index.html |

**Score:** 5/5 truths verified (automated checks)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/foundry-module-release.yml` | 3-job release pipeline (REL-01..04) | VERIFIED | 369 lines; YAML parses cleanly; 3 jobs present: `release`, `build-bridge-ghcr`, `build-g2app-zip` |
| `deploy/bridge.Dockerfile` | Multi-stage node:24-alpine (unchanged by Phase 19) | VERIFIED | Last modified in Phase 3 commit `5935cab`; Phase 19 only references it via `file: deploy/bridge.Dockerfile` in the workflow — no Dockerfile edits |
| `docs/release/bridge.md` | GHCR operator runbook + first-push visibility step | VERIFIED | File exists; `ghcr.io/aiacos/evf-bridge` (9 occurrences); `visibility` keyword (4 occurrences); `EVF_INTERNAL_SECRET` + `deploy/.env` (6 occurrences); Section 2 "One-time first-push visibility step (REQUIRED)" |
| `README.md` | `## Installation` section with 3 components | VERIFIED | 1 `## Installation` heading (replaced former `## Quick install`); all 3 artifact references present; pointer to `deploy/.env.example` + `docs/release/bridge.md` |
| `Specs.md` | Phase 19 changelog stanza | VERIFIED | Stanza at line ~4052 begins "2026-05-31 (tooling — Release & Distribution + README Installation docs)" with explicit "No spec version bump" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `foundry-module-release.yml :: build-bridge-ghcr` | `deploy/bridge.Dockerfile` | `docker/build-push-action@v7 file: input` | WIRED | `grep -c 'deploy/bridge.Dockerfile'` = 2 (once as comment, once as `file:` value) |
| `foundry-module-release.yml :: build-g2app-zip` | GitHub Release asset `g2-app-dist.zip` | `gh release upload` | WIRED | `gh release upload "$TAG" g2-app-dist.zip --clobber` present in `build-g2app-zip` job |
| `foundry-module-release.yml :: release` | `packages/foundry-module/CHANGELOG.md` | node section-extraction + `--notes-file` | WIRED | `test -f packages/foundry-module/CHANGELOG.md` guard + node one-liner + `echo "notes_file=..." >> "$GITHUB_OUTPUT"` → `--notes-file "$NOTES_FILE"` branch |
| `README.md :: ## Installation` | `ghcr.io/aiacos/evf-bridge` | docker pull instruction (REL-02 artifact) | WIRED | `ghcr.io/aiacos/evf-bridge:latest` present in README Bridge section |
| `README.md :: ## Installation` | `g2-app-dist.zip` GitHub Release asset | static-host instruction (REL-03 artifact) | WIRED | `g2-app-dist.zip` in README G2 App section (2 occurrences) |
| `README.md :: ## Installation` | `releases/latest/download/module.json` | manifest-URL instruction (REL-01 artifact) | WIRED | `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` present in README Foundry Module section |

---

### Data-Flow Trace (Level 4)

Not applicable — Phase 19 is CI infrastructure (workflow YAML) and documentation only. No dynamic data rendering components introduced.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Workflow YAML valid | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/foundry-module-release.yml'))"` | exit 0 | PASS |
| All 3 jobs present and correctly nested | `python3 verify jobs presence and needs` | `release`, `build-bridge-ghcr` (needs: release), `build-g2app-zip` (needs: release) | PASS |
| Per-job permissions (least privilege) | Python inspection | `release`: `contents: write`; `build-bridge-ghcr`: `contents: read + packages: write`; `build-g2app-zip`: `contents: write`; no top-level permissions grant | PASS |
| No PAT used (GITHUB_TOKEN only) | `grep -c 'secrets.PAT\|secrets.GHCR' ...` | 0 | PASS |
| Pinned Docker action versions | grep for @v4/@v6/@v7 | `setup-buildx-action@v4`, `login-action@v4`, `metadata-action@v6`, `build-push-action@v7` — all pinned | PASS |
| GHCR lowercase owner guard | `grep -c "tr '\[:upper:\]' '\[:lower:\]'"` | 1 | PASS |
| `test -f` CHANGELOG guard present | `grep -cE 'test -f.*CHANGELOG'` | 3 (foundry-module, bridge, g2-app guards each) | PASS |
| `--generate-notes` fallback retained | `grep -c 'generate-notes'` | 3 | PASS |
| bridge.Dockerfile unchanged by Phase 19 | `git log --follow -- deploy/bridge.Dockerfile` | Last modified `5935cab` (Phase 3); not in any Phase 19 commit | PASS |
| INV-3 atomic commit | `git show --name-only 23fe555` | README.md + Specs.md + docs/showcase/index.html in one commit | PASS |
| No version bump (README still v0.9.13) | `grep -c 'v0.9.13' README.md` | 16 (unchanged from pre-phase baseline) | PASS |
| socketlib registerComplexHandler count = 17 | `grep -n 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts | wc -l` | 17 | PASS |
| 2859 tests pass | `npx vitest run` | 197 test files / 2859 tests passed | PASS |
| No TBD/FIXME/XXX in Phase 19 files | grep | 0 matches in workflow YAML, README, bridge.md | PASS |
| `latest=auto` in metadata-action | `grep -c 'latest=auto'` | 2 | PASS |
| `evf-bridge` image name | `grep -c 'evf-bridge'` | 2 (in workflow) | PASS |
| `g2-app-dist.zip` upload | `grep -c 'g2-app-dist.zip'` | 7 | PASS |
| `pnpm --filter @evf/g2-app build` | `grep -c '...'` | 1 | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` exist for Phase 19. Phase 19 is CI infrastructure + documentation only; no runnable entry points changed. Live pipeline probes require a published release tag (deferred to human verification).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REL-01 | 19-01 | foundry-module GitHub Release: module.json + evenfoundryvtt.zip via manifest URL | SATISFIED | `release` job: module build + patch + zip + `gh release upload module.json evenfoundryvtt.zip --clobber`; manifest `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` in module.json |
| REL-02 | 19-01 | bridge GHCR push: ghcr.io/aiacos/evf-bridge:<version> + :latest | SATISFIED | `build-bridge-ghcr` job with `docker/build-push-action@v7`, metadata semver tags, lowercase guard, GITHUB_TOKEN auth, `packages:write` permission |
| REL-03 | 19-01 | g2-app Vite dist zip `g2-app-dist.zip` attached to GitHub Release | SATISFIED | `build-g2app-zip` job: `pnpm --filter @evf/g2-app build` + zip from `packages/g2-app` working-directory + `gh release upload` |
| REL-04 | 19-01 | GitHub Release page auto-populated with Changesets changelog release notes | SATISFIED | CHANGELOG extraction step aggregates foundry-module + bridge + g2-app sections; `test -f` guard + `--generate-notes` fallback; `--notes-file` branch on found |
| REL-05 | 19-02 | README "Installation" section — 3 components, INV-3 coherent | SATISFIED | `## Installation` (1 heading); all 3 artifact names/URLs; env contract + runbook pointers; INV-3 atomic commit `23fe555`; Specs.md stanza + showcase update |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| README.md | 156 | `// TODO` referenced inside INV-4 table explanation (documentation text, not code) | INFO | Not a code debt marker — this is a quoted snippet explaining the `// TODO requires (#issue)` rule in the invariant table. No action needed. |

No actionable anti-patterns found. Zero TBD/FIXME/XXX markers. No stubs. No orphaned artifacts.

---

### Human Verification Required

**All automated checks pass.** The following items cannot be verified without a published release tag and running hardware (ADR-0005 carry pattern).

#### 1. Foundry Module Install via Manifest URL (REL-01 live smoke)

**Test:** Open a running Foundry VTT instance, go to Setup → Add-on Modules → Install Module, paste `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`
**Expected:** Foundry resolves the manifest, shows `evenfoundryvtt` in the install dialog, and installs the module with `socketlib` and `midi-qol` as required dependencies
**Why human:** Requires a published GitHub Release (none exists yet); manifest URL 404s until the first `foundry-module-release.yml` run completes

#### 2. Bridge Docker Image Pull (REL-02 live smoke)

**Test:** From any machine with Docker: `docker pull ghcr.io/aiacos/evf-bridge:latest` then `docker run --rm -e EVF_INTERNAL_SECRET=test -p 8910:8910 ghcr.io/aiacos/evf-bridge:latest`
**Expected:** Pull succeeds without authentication (requires public package visibility); container starts and responds 200 to `curl localhost:8910/healthz`
**Why human:** Requires (a) a published release that pushed the image, and (b) the one-time manual GHCR visibility flip documented in `docs/release/bridge.md §2`

#### 3. GHCR First-Push Private → Public Visibility Flip (REL-02 operational)

**Test:** After the first real `build-bridge-ghcr` CI run, navigate GitHub → Profile → Packages → `evf-bridge` → Package settings → Change visibility → Public
**Expected:** `docker pull ghcr.io/aiacos/evf-bridge:latest` succeeds from an unauthenticated machine
**Why human:** Not automatable via `GITHUB_TOKEN` (GitHub UI-only step); must be done once after first push

#### 4. g2-app Static Serve from g2-app-dist.zip (REL-03 live smoke)

**Test:** Download `g2-app-dist.zip` from the GitHub Release page, `unzip g2-app-dist.zip`, verify `dist/index.html` + `dist/wizard.html` + `dist/assets/` are present, serve `dist/` from any HTTPS static host
**Expected:** Browser loads the g2-app plugin at the served URL; no console errors from missing assets
**Why human:** Requires a published GitHub Release; no release has been cut yet

#### 5. GitHub Release Notes Content Inspection (REL-04 live smoke)

**Test:** After a release dispatch that includes Changesets-written CHANGELOG.md files, open the GitHub Release page at `https://github.com/Aiacos/EvenFoundryVTT/releases`
**Expected:** Release body shows the `## <version>` section from `packages/foundry-module/CHANGELOG.md` (human-curated Changesets prose), not a raw commit-by-commit list
**Why human:** Requires both a published release AND `pnpm changeset version` having run to produce CHANGELOG.md files; visual inspection required

---

### Gaps Summary

No automated gaps found. All 5 must-have truths are VERIFIED by static analysis. The 5 human verification items listed above are legitimately `human_needed` per ADR-0005 Branch A (live release / hardware gate pattern): none can be verified without an actual published release tag. The pipeline is fully armed and statically correct.

**Pre-conditions for closing human_needed items:**
1. Merge the "Version Packages" PR (GitFlow PR #1, open per MEMORY.md) into `main`
2. The `release.yml` Changesets action will run `pnpm changeset version` (creating CHANGELOG.md files) then dispatch `foundry-module-release.yml`
3. After CI completes: verify all 5 items above manually
4. Flip GHCR package visibility to Public (one-time)

---

_Verified: 2026-05-31T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
