# Phase 19: Release & Distribution — Research

**Researched:** 2026-05-31
**Domain:** GitHub Actions CD pipeline — GitHub Releases, GHCR Docker, Changesets release notes, README INV-3
**Confidence:** HIGH (all existing files read directly; GitHub Actions patterns verified against official GitHub docs and action repos)

---

## Summary

Phase 19 is largely NOT greenfield. The foundry-module release pipeline is already fully implemented and functionally complete for REL-01. Three workflows exist: `ci.yml` (7 gates, untouched), `release.yml` (Changesets Version-PR model), and `foundry-module-release.yml` (builds module, patches module.json, zips, creates GitHub Release + uploads assets). The README already has a "Quick install" section for the foundry-module manifest URL.

The delta to close all 5 requirements is:

1. **REL-01**: Complete (delta = minor release notes improvement for REL-04 coherence only).
2. **REL-02**: New `bridge-ghcr-release` job in `foundry-module-release.yml` (or a new workflow file) — currently zero GHCR machinery exists.
3. **REL-03**: New g2-app build + zip + upload job — currently zero g2-app artifact machinery exists.
4. **REL-04**: Replace `--generate-notes` (auto-commit-based) with a CHANGELOG.md-sourced body using Changesets-produced content. Changesets already creates per-package CHANGELOG.md on version-bump; the release creation step just needs to read it.
5. **REL-05**: Add `## Installation` section to README covering all 3 components (foundry-module already has "Quick install", bridge and g2-app have nothing); update Specs.md + showcase in the same INV-3 atomic commit.

**Primary recommendation:** Extend `foundry-module-release.yml` with two additional jobs (`build-bridge-ghcr` + `build-g2app-zip`) triggered by the same `workflow_dispatch` input or tag push, and replace `--generate-notes` with a CHANGELOG.md extraction step. Add README `## Installation` section and close with INV-3 atomic commit.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | foundry-module GitHub Release: `module.json` + `evenfoundryvtt.zip` attached; Foundry "Install Module" manifest-URL installable | Fully implemented in `foundry-module-release.yml`. Delta: release-notes sourcing (tied to REL-04) |
| REL-02 | bridge GHCR push: `ghcr.io/aiacos/evf-bridge:<version>` + `:latest`; `docker pull` works from any machine | No workflow exists. New job needed: `docker/login-action@v4` + `docker/metadata-action@v6` + `docker/build-push-action@v7`, `permissions: packages: write` |
| REL-03 | g2-app Vite dist zip `g2-app-dist.zip` attached to GitHub Release | No workflow job exists. `pnpm --filter @evf/g2-app build` + `zip -r g2-app-dist.zip packages/g2-app/dist/` + `gh release upload` |
| REL-04 | GitHub Release page auto-populated with Changesets changelog release notes (no manual copy-paste) | Currently `--generate-notes` (commit-history auto-notes, NOT Changesets). Must replace with CHANGELOG.md extraction after `pnpm changeset version` runs |
| REL-05 | README "Installation" section — all 3 components, INV-3 coherent with Specs.md + showcase | README has "Quick install" for foundry-module only. Bridge docker + g2-app static sections missing. INV-3 atomic commit required |

</phase_requirements>

---

## Existing vs Missing Inventory (per requirement)

| Req | Existing (VERIFIED) | Missing (gap to close) |
|-----|---------------------|------------------------|
| REL-01 | `foundry-module-release.yml` builds module, patches `module.json` (version + download URL), zips runtime assets, creates GitHub Release, uploads `module.json` + `evenfoundryvtt.zip`. `module.json` `manifest` field already set to `/releases/latest/download/module.json`. | Release notes body is `--generate-notes` (GitHub commit-history auto). REL-04 will improve this. No functional gap for REL-01 itself. |
| REL-02 | `deploy/bridge.Dockerfile` — multi-stage `node:24-alpine` builder + runner, already correct shape. Docker Compose uses `build: context: ..` (local build only, no GHCR pull). | No workflow job for GHCR push. `foundry-module-release.yml` has `permissions: contents: write` only — needs `packages: write` added. No `docker/login-action`, `docker/metadata-action`, `docker/build-push-action` steps. |
| REL-03 | `packages/g2-app/vite.config.ts` — `pnpm --filter @evf/g2-app build` produces `packages/g2-app/dist/` with `index.html`, `wizard.html`, and `assets/`. `dist/` already exists in dev (wizard assets present). | No workflow job builds g2-app or zips it. No `g2-app-dist.zip` exists in any release workflow. |
| REL-04 | `release.yml` uses `changesets/action@v1` — when "Version Packages" PR is merged and no changesets remain, `pnpm changeset version` has already written per-package `CHANGELOG.md` files. `foundry-module-release.yml` uses `gh release create --generate-notes` (GitHub auto-notes from commits, NOT Changesets content). | No `CHANGELOG.md` files exist yet in any package (first `changeset version` run will create them). GitHub Release body must be replaced: read `packages/foundry-module/CHANGELOG.md`, extract the section for the released version, pass as `--notes-file` or `--notes`. |
| REL-05 | README `## Quick install` (line 14–24) covers foundry-module manifest URL. `docs/release/foundry-module.md` is a detailed operator runbook. `deploy/README.md` covers bridge Docker Compose local build. `deploy/.env.example` documents all required env vars. | No `## Installation` section in README for bridge (`docker pull ghcr.io/aiacos/evf-bridge`) or g2-app (static zip extraction + HTTPS host). Specs.md + showcase must be updated in the same INV-3 atomic commit when Installation section is added. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| foundry-module build + zip | CI (GitHub Actions) | — | Compilation + packaging is a CI-time concern; no runtime involvement |
| bridge Docker image build + GHCR push | CI (GitHub Actions) | GHCR (registry) | Image is a deployment artifact; registry is the distribution layer |
| g2-app Vite bundle zip | CI (GitHub Actions) | GitHub Release (storage) | Static build artifact; end user serves it from HTTPS host |
| GitHub Release creation + notes | CI (GitHub Actions) | Changesets (content source) | Release is the distribution point; notes sourced from Changesets CHANGELOG.md |
| README Installation section | Documentation | Specs.md + showcase (INV-3) | Cross-cutting user-facing doc; INV-3 requires coherence across all three |
| Version-of-truth for release tag | `packages/foundry-module/package.json` | Changesets (`changeset version`) | `release-tag.mjs` reads this file; Changesets bumps it on "Version Packages" PR merge |

---

## Standard Stack

### Core — CI/CD GitHub Actions

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `docker/login-action` | `v4` (v4.2.0 — 2026-05-22) [VERIFIED: github.com/docker/login-action/releases] | Authenticate to GHCR | Official Docker GitHub Action; handles GITHUB_TOKEN auth to ghcr.io |
| `docker/metadata-action` | `v6` (v6.1.0 — 2026-05-22) [VERIFIED: github.com/docker/metadata-action/releases] | Generate Docker tags + labels from git tags | Produces `ghcr.io/aiacos/evf-bridge:<version>` + `:latest` automatically from semver tags |
| `docker/build-push-action` | `v7` (v7.2.0 — 2026-05-21) [VERIFIED: github.com/docker/build-push-action/releases] | Multi-arch Docker build + push | Official build + push action; uses buildx for layer caching |
| `docker/setup-buildx-action` | `v4` (v4.1.0) [VERIFIED: github.com/docker/setup-buildx-action/releases (via API)] | Enable Docker BuildKit / buildx | Required prerequisite for `build-push-action` layer caching |
| `actions/checkout@v4` | v4 | Already in use across all workflows | [VERIFIED: already used in ci.yml, release.yml, foundry-module-release.yml] |
| `gh` CLI | pre-installed on `ubuntu-latest` | `gh release upload`, `gh release create` | Already used in `foundry-module-release.yml`; no install step needed |
| `zip` | pre-installed on `ubuntu-latest` | Create `g2-app-dist.zip` | Already used in `foundry-module-release.yml` for `evenfoundryvtt.zip`; same tool |

**No new npm packages are needed for Phase 19.** All work is GitHub Actions YAML + README + Specs.md edits.

### Already Installed (no changes)

| Tool | Version | Status |
|------|---------|--------|
| `changesets/action@v1` | v1 | Already in `release.yml` |
| `pnpm/action-setup@v4` | v4 | Already in all workflows |
| `actions/setup-node@v4` | v4 | Already in all workflows |

---

## Package Legitimacy Audit

No new npm packages are introduced in Phase 19. This section is intentionally empty.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
push to main (no changesets left after Version-PR merge)
       │
       ▼
[release.yml — changesets/action]
  pnpm changeset version (writes CHANGELOG.md per package)
  pnpm run release:tag
       │
       ▼
[scripts/release-tag.mjs]
  reads packages/foundry-module/package.json → version
  git tag v<version>
  git push origin v<version>
  gh workflow run foundry-module-release.yml -f tag=v<version>
       │
       ▼
[foundry-module-release.yml (workflow_dispatch: tag=v<version>)]
  ├─ job: release-foundry-module (EXISTS)
  │    build module → patch module.json → zip → gh release create → upload assets
  │
  ├─ job: build-bridge-ghcr (NEW for REL-02)
  │    docker login ghcr.io → metadata (tags: v<ver>+latest) → build-push
  │
  └─ job: build-g2app-zip (NEW for REL-03)
       pnpm build g2-app → zip dist/ → gh release upload g2-app-dist.zip

REL-04: gh release create step switches from --generate-notes to --notes-file <extracted CHANGELOG.md section>
REL-05: README ## Installation section added in INV-3 atomic commit (Specs.md + showcase same commit)
```

### Recommended Project Structure (no new dirs needed)

The existing file layout is sufficient. New files:

```
.github/workflows/
  foundry-module-release.yml   # MODIFIED: add build-bridge-ghcr + build-g2app-zip jobs + REL-04 notes fix
  release.yml                   # UNMODIFIED (Changesets Version-PR model works correctly)
  ci.yml                        # UNMODIFIED (7 gates untouched)
scripts/
  release-tag.mjs               # UNMODIFIED (already dispatches foundry-module-release.yml)
README.md                       # MODIFIED: add ## Installation section (REL-05)
Specs.md                        # MODIFIED: changelog stanza + Installation references (INV-3)
docs/showcase/index.html        # MODIFIED: coherence update (INV-3)
```

### Pattern 1: GHCR Multi-Stage Image Push

**What:** Build `deploy/bridge.Dockerfile` (multi-stage, already correct) and push to `ghcr.io/aiacos/evf-bridge`.
**When to use:** On every release tag dispatch.

```yaml
# Source: docs.github.com/en/actions/publishing-packages/publishing-docker-images (verified 2026-05-31)
build-bridge-ghcr:
  runs-on: ubuntu-latest
  permissions:
    contents: read
    packages: write
  steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v4

    - name: Log in to GHCR
      uses: docker/login-action@v4
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Docker metadata
      id: meta
      uses: docker/metadata-action@v6
      with:
        images: ghcr.io/${{ github.repository_owner }}/evf-bridge
        flavor: |
          latest=auto
        tags: |
          type=semver,pattern={{version}},value=${{ inputs.tag }}
          type=semver,pattern={{major}}.{{minor}},value=${{ inputs.tag }}

    - name: Build and push
      uses: docker/build-push-action@v7
      with:
        context: .
        file: deploy/bridge.Dockerfile
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

**Critical detail:** `github.repository_owner` is `Aiacos` (mixed case). GHCR requires lowercase image names. Use `${{ github.repository_owner }}` directly — GitHub stores it correctly for image resolution, but test with lowercase if issues arise. The safer pattern is `${{ github.repository_owner | lower }}` which is not valid YAML expression syntax; instead, use a step to compute it: `echo "OWNER=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> $GITHUB_ENV`.

### Pattern 2: g2-app Vite Build + Zip

**What:** Run `pnpm --filter @evf/g2-app build` (produces `packages/g2-app/dist/`) then zip and upload.
**When to use:** On every release tag dispatch, after GitHub Release is created.

```yaml
# Source: existing foundry-module-release.yml pattern (zip command at line 118)
build-g2app-zip:
  needs: release-foundry-module   # GitHub Release must exist before upload
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 10.33.4
    - uses: actions/setup-node@v4
      with:
        node-version: 24
    - name: Install deps
      run: pnpm install --frozen-lockfile --ignore-scripts
    - name: Build g2-app
      run: pnpm --filter @evf/g2-app build
    - name: Create g2-app-dist.zip
      run: zip -r g2-app-dist.zip packages/g2-app/dist/ -x "*.map"
    - name: Upload g2-app-dist.zip to GitHub Release
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        TAG: ${{ inputs.tag }}
      run: gh release upload "$TAG" g2-app-dist.zip --clobber
```

**Zip layout note:** `zip -r g2-app-dist.zip packages/g2-app/dist/` produces paths like `packages/g2-app/dist/index.html`. The end user extracts and serves the `dist/` directory. The installation instruction in the README must be clear: extract the zip, navigate to the `packages/g2-app/dist/` directory (or rename it), and serve via HTTPS. A cleaner alternative: `cd packages/g2-app && zip -r ../../g2-app-dist.zip dist/ -x "*.map"` so zip contains paths like `dist/index.html` — simpler for end-user extraction.

### Pattern 3: Changesets Release Notes Extraction (REL-04)

**What:** Replace `gh release create --generate-notes` with a CHANGELOG.md-sourced body.
**Why:** Changesets generates per-package CHANGELOG.md files when `pnpm changeset version` runs (in `release.yml`). These entries are the canonical, human-curated release notes. `--generate-notes` only generates commit-history notes (verbose, not curated).

**Key prerequisite:** `pnpm changeset version` must have already run (and produced CHANGELOG.md files) BEFORE `release-tag.mjs` creates the tag. This is already the case — the Changesets Version-PR flow runs `pnpm changeset version` in `release.yml`, then the merged PR triggers another push to main, which runs `release:tag`. By that point, CHANGELOG.md exists.

```bash
# In foundry-module-release.yml: extract version section from CHANGELOG.md
# Source: changesets/action src/run.ts pattern (verified 2026-05-31)
node -e "
  const fs = require('node:fs');
  const version = process.env.VERSION;
  const log = fs.readFileSync('packages/foundry-module/CHANGELOG.md', 'utf-8');
  // Each version section starts with '## <version>'
  const pattern = new RegExp('## ' + version.replace(/\./g, '\\\\.') + '[\\\\s\\\\S]*?(?=## |$)');
  const match = log.match(pattern);
  if (!match) { console.error('No CHANGELOG entry for', version); process.exit(1); }
  fs.writeFileSync('/tmp/release-notes.md', match[0].trim());
" && gh release create "$TAG" \
  --title "$TAG" \
  --notes-file /tmp/release-notes.md \
  $PRERELEASE_FLAG
```

**Fallback:** If CHANGELOG.md doesn't exist yet (first release, before Changesets has run), fall back to `--generate-notes`. Add a `test -f packages/foundry-module/CHANGELOG.md` guard.

**Multi-package aggregation:** REL-04 says "aggregated from the Changesets changelog across the released packages." All packages use `"@changesets/cli/changelog"` provider (from `.changeset/config.json`). The simplest implementation: aggregate `foundry-module` + `bridge` + `g2-app` CHANGELOG.md sections into one release notes file. Alternative: foundry-module section only (since it's the primary user-facing release artifact). The planner should decide; either satisfies REL-04.

### Pattern 4: Top-level `permissions` split vs per-job

**What:** `foundry-module-release.yml` currently has a top-level `permissions: contents: write`. Adding GHCR push requires `packages: write`. Adding it top-level grants it to all jobs. **Safe approach:** move permissions to per-job level with minimum grants.

```yaml
# Top-level: remove or keep minimal
permissions: {}   # deny-all default

jobs:
  release-foundry-module:
    permissions:
      contents: write    # gh release create + upload
  build-bridge-ghcr:
    permissions:
      contents: read     # checkout
      packages: write    # GHCR push
  build-g2app-zip:
    permissions:
      contents: write    # gh release upload
```

### Anti-Patterns to Avoid

- **Double-trigger on GHCR:** `foundry-module-release.yml` triggers on `push: tags` AND `workflow_dispatch`. The `release-tag.mjs` uses `workflow_dispatch` precisely because `push:tags` from GITHUB_TOKEN doesn't fire. If the bridge job is in the same workflow file, it fires once via `workflow_dispatch` only — no double-fire risk. [VERIFIED: release.yml header comment explains this explicitly]
- **Hardcoded image tag in bridge docker-compose.yml:** The existing `docker-compose.yml` uses `build: context: ..` (always builds locally). After Phase 19, the compose file should optionally support `image: ghcr.io/aiacos/evf-bridge:<version>` as an alternative. Do NOT break the local build path — it's the primary dev workflow.
- **Zip path confusion for g2-app:** If `zip -r g2-app-dist.zip packages/g2-app/dist/` is used, the extracted directory is nested. Prefer `cd packages/g2-app && zip -r ../../g2-app-dist.zip dist/` to match end-user expectations (extract → get `dist/` directly).
- **Missing `needs: release-foundry-module` on g2-app zip job:** Both g2-app and bridge jobs must depend on the GitHub Release existing. The `release-foundry-module` job creates it; downstream jobs must `needs: release-foundry-module` to avoid race conditions on `gh release upload`.
- **GHCR first-push visibility:** New GHCR packages default to private. After the first push, the package owner must manually set visibility to `public` in GitHub → Packages → evf-bridge → Package settings → Change visibility. Document this in the release runbook. [VERIFIED: github.com/packages registry docs]
- **Version mismatch: module.json vs package.json:** `module.json` has `version: "0.1.0"` but `packages/foundry-module/package.json` has `version: "0.1.0-alpha.0"`. The workflow correctly reads version from the tag (not from module.json), patches module.json during the build step. Changesets will bump `packages/foundry-module/package.json` when the Version-PR is merged. The tag comes from `package.json` version, and module.json is patched at release time — this is correct and no change needed.
- **`release.yml` `publish` step and CHANGELOG.md timing:** `changesets/action` runs `pnpm changeset version` first (creates CHANGELOG.md), then runs `pnpm run release:tag`. The CHANGELOG.md files are committed to main by Changesets before `release:tag` runs. So when `foundry-module-release.yml` checks out the commit at that tag, the CHANGELOG.md is present. [VERIFIED: Changesets action src/run.ts flow confirmed via WebFetch]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker tag generation | Custom bash to produce `:latest` + `:1.2.3` | `docker/metadata-action@v6` with `flavor: latest=auto` + `type=semver` | Handles prerelease detection, latest suppression, multi-tag output automatically |
| GHCR auth | Manual `docker login` with stored secrets | `docker/login-action@v4` with `GITHUB_TOKEN` | Handles token refresh, registry-specific quirks; no PAT needed |
| Changelog extraction | Custom regex per version format | Node one-liner using `## VERSION` section split | Simple enough to inline; Changesets format is predictable |
| Docker layer caching | None | `cache-from: type=gha` + `cache-to: type=gha,mode=max` | GitHub Actions cache; free, dramatically faster rebuilds |

**Key insight:** The GitHub Actions Docker ecosystem (`docker/*`) handles all the hard parts of GHCR push. The existing `foundry-module-release.yml` pattern (gh CLI for release + upload) already handles Foundry module perfectly — replicate the pattern for g2-app.

---

## Common Pitfalls

### Pitfall 1: GHCR Package Visibility Defaults to Private

**What goes wrong:** First `docker push` to `ghcr.io/aiacos/evf-bridge` creates the package as private. `docker pull ghcr.io/aiacos/evf-bridge:latest` fails for unauthenticated users with 403.
**Why it happens:** GHCR inherits the repository visibility setting only for existing packages. New packages created via Actions default to private (security-first default).
**How to avoid:** After the first release, navigate GitHub → Profile → Packages → evf-bridge → Package settings → Change visibility to Public. Document this as a one-time post-first-release step in `docs/release/foundry-module.md` (or a new `docs/release/bridge.md`).
**Warning signs:** `docker pull` returns `unauthorized: authentication required` or `denied: denied` for a user who is not logged in.

### Pitfall 2: `needs:` Job Ordering + GitHub Release Race Condition

**What goes wrong:** `build-bridge-ghcr` and `build-g2app-zip` both try to use the GitHub Release (for `gh release upload`). If they run in parallel before `release-foundry-module` creates the release, `gh release upload` fails with "release not found".
**Why it happens:** GitHub Actions parallel jobs have no ordering guarantee without explicit `needs:`.
**How to avoid:** Add `needs: release-foundry-module` to both new jobs. The bridge GHCR push does NOT need the GitHub Release (it pushes to GHCR), but having it `needs: release-foundry-module` for consistency is fine. The g2-app zip upload absolutely needs it.
**Warning signs:** `gh release upload: release not found for tag vX.Y.Z`.

### Pitfall 3: GITHUB_TOKEN Recursive Trigger — ALREADY SOLVED

**What goes wrong:** `release-tag.mjs` pushes a git tag using GITHUB_TOKEN. GitHub suppresses the `on: push: tags` trigger when GITHUB_TOKEN creates the push. So `foundry-module-release.yml` would never fire via tag push from CI.
**Why it's already solved:** The existing `release-tag.mjs` uses `gh workflow run foundry-module-release.yml -f tag=v<version>` (workflow_dispatch). `workflow_dispatch` from GITHUB_TOKEN does fire. [VERIFIED: release.yml header comment + release-tag.mjs header comment, both explain this explicitly]
**Impact on Phase 19:** The new jobs are in the same workflow file; they receive the same `inputs.tag` via `workflow_dispatch`. No change to the trigger mechanism needed.

### Pitfall 4: `docker/metadata-action` Image Name Must Be Lowercase

**What goes wrong:** `ghcr.io/Aiacos/evf-bridge` fails (GHCR requires lowercase path components). GitHub's `${{ github.repository_owner }}` returns `Aiacos` (mixed case, as registered).
**Why it happens:** GHCR image names are case-sensitive and must be lowercase.
**How to avoid:** In the workflow, compute the lowercase owner:
```yaml
- name: Lowercase owner
  id: lower
  run: echo "owner=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"
# Then use: ghcr.io/${{ steps.lower.outputs.owner }}/evf-bridge
```
Or use `${{ github.repository }}` in lowercase as the image path since GitHub auto-lowercases repository paths in GHCR contexts. [VERIFIED: GHCR docs requirement for lowercase, confirmed 2026-05-31 via official GitHub docs]

### Pitfall 5: CHANGELOG.md Not Present on First Release

**What goes wrong:** If the first real release tag is cut before `pnpm changeset version` has been run (e.g., a manual tag), CHANGELOG.md doesn't exist and the extraction step fails.
**Why it happens:** Changesets only writes CHANGELOG.md when `changeset version` is invoked (via the Version-PR flow). The pending `.changeset/*.md` files exist but are not yet aggregated.
**How to avoid:** Guard the CHANGELOG.md extraction step:
```bash
if test -f "packages/foundry-module/CHANGELOG.md"; then
  # extract + use --notes-file
else
  echo "No CHANGELOG.md — falling back to --generate-notes"
  gh release create "$TAG" --generate-notes ...
fi
```

### Pitfall 6: `docker-compose.yml` `image:` vs `build:` Conflict

**What goes wrong:** If `docker-compose.yml` is updated to reference `ghcr.io/aiacos/evf-bridge:latest`, local dev builds break because the image hasn't been pushed yet and `docker pull` fails for private/first-release.
**Why it happens:** The compose file has dual use (local dev + homelab deploy).
**How to avoid:** Keep `build:` in the primary `docker-compose.yml`. Add an optional `docker-compose.prod.yml` override that substitutes `image: ghcr.io/aiacos/evf-bridge:<version>` for `build:` — users who want to pull instead of build can use `-f docker-compose.prod.yml`. Do NOT modify `docker-compose.yml` in a way that removes the local `build:` path.

### Pitfall 7: INV-3 Coherence — README + Specs.md + Showcase Must Be One Commit

**What goes wrong:** README Installation section is added, but Specs.md or showcase isn't updated in the same commit. INV-3 gates hard on this.
**Why it happens:** REL-05 feels like "just a README edit," but CLAUDE.md INV-3 is clear.
**How to avoid:** The final plan task for REL-05 must be a single commit touching README.md + Specs.md (changelog stanza, version bump if applicable) + `docs/showcase/index.html` (any cross-cutting claim update). Use the Phase 14–18 pattern: "INV-3 atomic commit."
**Warning signs:** CI git diff shows README changed without Specs.md and showcase in the same commit.

---

## Code Examples

### REL-02: GHCR Push Job (verified pattern)

```yaml
# Source: docs.github.com/en/actions/publishing-packages/publishing-docker-images (verified 2026-05-31)
# Action versions: docker/login-action@v4 (v4.2.0), docker/metadata-action@v6 (v6.1.0),
#                  docker/build-push-action@v7 (v7.2.0), docker/setup-buildx-action@v4 (v4.1.0)
build-bridge-ghcr:
  needs: release-foundry-module
  runs-on: ubuntu-latest
  permissions:
    contents: read
    packages: write
  steps:
    - uses: actions/checkout@v4

    - name: Lowercase owner
      id: lower
      run: echo "owner=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v4

    - name: Log in to GHCR
      uses: docker/login-action@v4
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Docker metadata
      id: meta
      uses: docker/metadata-action@v6
      with:
        images: ghcr.io/${{ steps.lower.outputs.owner }}/evf-bridge
        flavor: latest=auto
        tags: |
          type=semver,pattern={{version}},value=${{ inputs.tag }}
          type=semver,pattern={{major}}.{{minor}},value=${{ inputs.tag }}

    - name: Build and push bridge image
      uses: docker/build-push-action@v7
      with:
        context: .
        file: deploy/bridge.Dockerfile
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### REL-03: g2-app zip + upload (verified pattern)

```yaml
# Source: existing foundry-module-release.yml zip+upload pattern (verified in file, lines 115-151)
build-g2app-zip:
  needs: release-foundry-module
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 10.33.4
    - uses: actions/setup-node@v4
      with:
        node-version: 24
    - name: Install dependencies
      run: pnpm install --frozen-lockfile --ignore-scripts
    - name: Build g2-app
      run: pnpm --filter @evf/g2-app build
    - name: Create g2-app-dist.zip
      working-directory: packages/g2-app
      run: zip -r ../../g2-app-dist.zip dist/ -x "*.map"
    - name: Upload g2-app-dist.zip to GitHub Release
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        TAG: ${{ inputs.tag }}
      run: gh release upload "$TAG" g2-app-dist.zip --clobber
```

### REL-04: CHANGELOG.md extraction for release notes

```bash
# Source: changesets/action src/run.ts pattern (verified 2026-05-31 via WebFetch)
# Run after pnpm install, before gh release create
extract_release_notes() {
  local version="$1"
  local changelog="packages/foundry-module/CHANGELOG.md"
  if ! test -f "$changelog"; then
    echo "" # empty → caller uses --generate-notes fallback
    return
  fi
  # Node one-liner: extract the ## <version> section
  node -e "
    const fs = require('node:fs');
    const ver = process.env.VERSION;
    const log = fs.readFileSync('$changelog', 'utf-8');
    const escaped = ver.replace(/\./g, '\\\\.');
    const m = log.match(new RegExp('## ' + escaped + '[\\\\s\\\\S]*?(?=\\n## |$)'));
    if (!m) { console.error('No CHANGELOG entry for ' + ver); process.exit(1); }
    fs.writeFileSync('/tmp/release-notes.md', m[0].trim());
  " && echo "/tmp/release-notes.md"
}
```

### REL-05: README Installation section structure

The README currently has `## Quick install` (foundry-module only). Replace or supplement with:

```markdown
## Installation

### 1. Foundry Module

In Foundry → **Setup** → **Add-on Modules** → **Install Module** → paste Manifest URL:

```
https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
```

Foundry auto-installs `socketlib` and `midi-qol` (required), and requires dnd5e ≥ 5.3.3.

### 2. Bridge (Docker)

```bash
docker pull ghcr.io/aiacos/evf-bridge:<version>
```

Or via Docker Compose:
```yaml
# In deploy/.env: set EVF_INTERNAL_SECRET + EVF_PLUGIN_HOST_URL
docker compose -f deploy/docker-compose.yml up -d
```

See [`deploy/.env.example`](deploy/.env.example) for required environment variables.

### 3. G2 App (static HTTPS host)

Download `g2-app-dist.zip` from the [GitHub Release](https://github.com/Aiacos/EvenFoundryVTT/releases/latest) and serve the extracted `dist/` directory via any HTTPS static host (nginx, Caddy, GitHub Pages, Cloudflare Pages). Set `EVF_PLUGIN_HOST_URL` in the bridge env file to match.
```

---

## GitFlow + Changesets Release Pipeline (current state)

This section documents the existing pipeline to prevent misunderstanding during planning.

**Current flow (VERIFIED from release.yml, release-tag.mjs, foundry-module-release.yml):**

1. Developer merges feature branch → develop (standard GitFlow).
2. Developer opens PR: develop → main (per GitFlow release cycle).
3. On PR merge to main: `release.yml` fires `changesets/action@v1`.
4. If unconsumed `.changeset/*.md` files exist: Changesets opens/updates a "Version Packages" PR that bumps per-package versions + consumes changesets → writes `CHANGELOG.md` per package.
5. User merges "Version Packages" PR → main. Now `release.yml` fires again, finds no changesets → runs `pnpm run release:tag`.
6. `release-tag.mjs` reads `packages/foundry-module/package.json` version, creates + pushes `v<version>` tag, dispatches `foundry-module-release.yml` via `gh workflow run`.
7. `foundry-module-release.yml` runs (triggered by `workflow_dispatch`): builds module, patches module.json, zips, creates GitHub Release (currently `--generate-notes`), uploads assets.

**GitFlow branch state (verified 2026-05-31):** `develop` is 55 commits ahead of `main`. The GitFlow PR (#1 "Version Packages" open per MEMORY.md) is the pending step between develop→main integration and actual release tag creation. Phase 19 implements the machinery; the user triggers the actual release by merging that PR.

**No double-fire risk:** `foundry-module-release.yml` also has `on: push: tags` but GITHUB_TOKEN-created tag pushes don't trigger it (suppressed by GitHub). Only `workflow_dispatch` fires. The new jobs in the same workflow file benefit from this automatically.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `--generate-notes` (commit history) | CHANGELOG.md extraction from Changesets | REL-04 (this phase) | Human-curated release notes instead of raw commit list |
| Local-only Docker build (`build:` in compose) | + GHCR push for distribution | REL-02 (this phase) | End users can `docker pull` instead of cloning and building |
| No g2-app artifact | g2-app-dist.zip on GitHub Release | REL-03 (this phase) | End users can serve plugin without cloning repo |
| HTTP+SSE MCP transport | Streamable HTTP | spec rev 2025-06-18 | Not Phase 19 scope — already correct in foundry-mcp |

**Deprecated/outdated:**
- `--generate-notes` in `foundry-module-release.yml`: replaced by Changesets CHANGELOG.md extraction (REL-04).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `changesets/action@v1` `publish` step (running `release:tag`) triggers `createGithubReleases` but our `release:tag` is not an npm publish — the action may not call `createRelease` since no packages are actually published to npm. Release creation happens instead in `foundry-module-release.yml`. | REL-04 | Low: the plan already routes release creation through `foundry-module-release.yml`, not through the Changesets action's internal release logic. |
| A2 | `pnpm changeset version` writes CHANGELOG.md before `release-tag.mjs` fires. The Changesets action commits the version bump (including CHANGELOG.md) to main before the publish step runs. | REL-04 | Medium: if CHANGELOG.md isn't present at tag time, the extraction step fails. The fallback guard (`test -f CHANGELOG.md`) mitigates this. |
| A3 | `docker/build-push-action@v7` is compatible with `ubuntu-latest` (currently `ubuntu-24.04`) and Docker BuildKit without additional OS-level setup. | REL-02 | Low: GitHub-hosted runners include Docker and BuildKit; this is the standard pattern per official docs. |

---

## Open Questions

1. **Aggregation scope for REL-04 release notes**
   - What we know: `.changeset/config.json` manages `@evf/foundry-module`, `@evf/bridge`, `@evf/g2-app`, `@evf/shared-protocol`, etc. independently. Each may get a separate CHANGELOG.md entry.
   - What's unclear: Should REL-04 aggregate ALL changed packages' changelogs, or just `foundry-module`? The GitHub Release is tied to the tag which is tied to `foundry-module` version only.
   - Recommendation: Start with `foundry-module` + `bridge` + `g2-app` CHANGELOG sections concatenated (the three user-facing packages). `shared-protocol` and `shared-render` are internal; their changelogs need not appear in the user-facing release notes.

2. **`docker-compose.prod.yml` for GHCR pull flow**
   - What we know: Homelab users currently run `docker compose up --build` (local build). After Phase 19, they could optionally `docker pull ghcr.io/aiacos/evf-bridge:<version>` instead.
   - What's unclear: Should Phase 19 add a `docker-compose.prod.yml` override? Or just document `image:` substitution in the runbook?
   - Recommendation: Document as a `# To use pre-built image, replace build: with image:` comment in `docker-compose.yml`. A separate file is overkill for v0.9.14 scope.

3. **Version pinning in README Installation section**
   - What we know: The bridge `docker pull` URL must include a version tag. But `latest` is also produced by `docker/metadata-action`.
   - What's unclear: Should the README say `docker pull ghcr.io/aiacos/evf-bridge:latest` or `docker pull ghcr.io/aiacos/evf-bridge:<version>`?
   - Recommendation: Use `:latest` in the README (user-facing) and mention version-pinned tags are available on the releases page. The `docker-compose.yml` image reference (if added) should use the version tag for reproducibility.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + BuildKit | REL-02 GHCR push | ✓ (GitHub-hosted runner ubuntu-latest) | 24.x | — |
| `gh` CLI | REL-01 + REL-03 release upload | ✓ (pre-installed on ubuntu-latest) | 2.x | — |
| `zip` | REL-01 + REL-03 | ✓ (pre-installed on ubuntu-latest) | system | — |
| `pnpm` 10.33.4 | REL-01 + REL-03 build | ✓ (installed via action in all workflows) | 10.33.4 | — |
| Node 24 LTS | REL-01 + REL-02 + REL-03 | ✓ (`.nvmrc=24`) | 24.x | — |
| GITHUB_TOKEN | GHCR push + release creation | ✓ (automatic in GitHub Actions) | — | — |
| `packages: write` permission | REL-02 GHCR push | Needs to be declared in workflow | — | — |

**Missing dependencies with no fallback:** None — all tooling is available on GitHub-hosted runners.

**Manual one-time post-release step:** GHCR package visibility must be set to Public after the first push (GitHub UI — not automatable via GITHUB_TOKEN).

---

## Validation Architecture

Tests for this phase are primarily integration-level (workflow YAML validity) and documentation-level (INV-3 coherence). No new Vitest unit tests are needed — the workflow is CI infrastructure, not application code.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | foundry-module GitHub Release has correct assets | manual smoke | `gh release view <tag> --json assets` | ❌ (post-release CLI check) |
| REL-02 | Bridge GHCR image pullable | manual smoke | `docker pull ghcr.io/aiacos/evf-bridge:latest` | ❌ (post-release Docker check) |
| REL-03 | g2-app-dist.zip attached to release | manual smoke | `gh release view <tag> --json assets` | ❌ (post-release CLI check) |
| REL-04 | Release notes contain Changesets content | manual inspect | GitHub Release page inspection | ❌ (visual check) |
| REL-05 | README Installation section present + INV-3 coherent | automated | `grep -n "## Installation" README.md` + `pnpm test` | ❌ Wave 0 |

**Wave 0 gaps:**
- INV-3 coherence check: no new test file needed (existing `inv:all` suite covers INV-3 cross-file coherence)
- YAML linting: GitHub Actions validates workflow YAML on push — no local pre-check needed
- Workflow dry-run: not automatable without pushing (manual gate via `workflow_dispatch` on a test tag)

### Sampling Rate

- Per task commit: `pnpm test` + `pnpm lint:ci` + `pnpm typecheck` (no new test files, but ensures INV-4 is preserved)
- Per wave merge: full suite + manual verification of workflow YAML syntax via `gh workflow view`
- Phase gate: INV-3 atomic commit verified (same-commit update of README + Specs.md + showcase)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | n/a (no new auth surface) |
| V3 Session Management | No | n/a |
| V4 Access Control | Yes (GHCR) | `permissions: packages: write` scoped to build job only; GITHUB_TOKEN |
| V5 Input Validation | Yes (tag format) | Tag regex validation already in `foundry-module-release.yml` line 75 |
| V6 Cryptography | No | GITHUB_TOKEN is the credential; not hand-rolled |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tag injection in workflow_dispatch `tag` input | Tampering | Tag regex validation already in place: `^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$` (line 75 foundry-module-release.yml) |
| GITHUB_TOKEN scope creep | Elevation of Privilege | Per-job permissions declared at minimum scope; `packages: write` only on bridge job |
| Secrets baked into Docker image | Information Disclosure | `deploy/bridge.Dockerfile` already correct: T-03-17 comment confirms no build args for secrets |

---

## Sources

### Primary (HIGH confidence)
- `foundry-module-release.yml` — read directly; full content inventoried
- `release.yml` — read directly; Changesets Version-PR model confirmed
- `scripts/release-tag.mjs` — read directly; workflow_dispatch rationale confirmed
- `packages/foundry-module/module.json` — read directly; manifest + download URL pattern confirmed
- `deploy/bridge.Dockerfile` — read directly; multi-stage node:24-alpine confirmed
- `packages/g2-app/vite.config.ts` — read directly; `outDir: 'dist'` confirmed
- `deploy/docker-compose.yml` — read directly; `build: context: ..` (no GHCR pull) confirmed
- `.changeset/config.json` — read directly; `privatePackages.tag: false` (no npm publish) confirmed
- `README.md` — read directly; "Quick install" section for foundry-module only confirmed

### Secondary (MEDIUM confidence)
- `docs.github.com/en/actions/publishing-packages/publishing-docker-images` — verified 2026-05-31; `permissions: packages: write` + GITHUB_TOKEN for GHCR confirmed [CITED: docs.github.com]
- `github.com/docker/login-action/releases` → v4.2.0 confirmed [VERIFIED: github.com/docker/login-action]
- `github.com/docker/build-push-action/releases` → v7.2.0 confirmed [VERIFIED: github.com/docker/build-push-action]
- `github.com/docker/metadata-action/releases` → v6.1.0 confirmed [VERIFIED: github.com/docker/metadata-action]
- `docker/setup-buildx-action` releases API → v4.1.0 confirmed [VERIFIED: GitHub API]
- `changesets/action` source (`src/run.ts`) → reads CHANGELOG.md, uses `getChangelogEntry(changelog, version)` as release body [CITED: github.com/changesets/action]

### Tertiary (LOW confidence)
- GHCR first-push private-by-default behavior — inferred from registry docs; one-time manual step required [ASSUMED until first push confirms]

---

## Metadata

**Confidence breakdown:**
- REL-01 (foundry-module): HIGH — workflow fully implemented and verified
- REL-02 (bridge GHCR): HIGH — standard GHA pattern, verified against official docs; Dockerfile already correct
- REL-03 (g2-app zip): HIGH — identical pattern to existing foundry-module zip step
- REL-04 (Changesets notes): MEDIUM-HIGH — Changesets CHANGELOG.md writing confirmed; extraction pattern is a Node one-liner with well-understood format
- REL-05 (README INV-3): HIGH — gap confirmed (no bridge/g2-app installation docs), INV-3 pattern well-established from Phases 14–18

**Research date:** 2026-05-31
**Valid until:** 2026-07-31 (GitHub Actions action versions may change; re-verify `docker/*` action versions before execution)
