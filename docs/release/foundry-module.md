# Foundry Module Release & Distribution

How to publish EvenFoundryVTT to GitHub Releases, and how users install it on Foundry or
The Forge. A release carries two artefacts built from the same commit
([ADR-0019](../architecture/0019-relay-pairing-player-projector.md)):

- the **module zip** `evenfoundryvtt.zip` (+ `module.json`) for Foundry and The Forge. It no
  longer contains the glasses app: Foundry ≥ 14.361 serves module HTML as `text/plain`, so
  the `g2/` folder of v0.12 is gone;
- the **Even Hub package** `evenfoundryvtt.ehpk` (FoundryVTT G2 HUD), built from
  `packages/g2-app/dist`, which the maintainer uploads to the Even Hub portal for the beta
  group and the store ([evenhub.md](evenhub.md)).

Two more workflows run on `main` outside the release: **Relay Deploy** (`relay-deploy.yml`,
the Cloudflare relay) and **Pages** (`pages.yml`, docs + the hosted app `/app/` the pairing
QR opens). See the [runbook](../runbook.md#-relay-and-pages).

**Versions.** The last bridge-era release is module **v0.1.55**. The direct-streaming
(Foundry-served app) line is **v0.2.x**. The relay-pairing release is the next minor
(**v0.3.0**, breaking before 1.0: every pair of glasses must be connected again).

**Migrating from v0.2.x.** Update the module from the manifest URL, install
**FoundryVTT G2 HUD** from Even Hub on each phone, and connect every pair of glasses again
from **Connect G2 glasses** (Players list right-click or Alt+G). The "(G2)" users of v0.2.x
are no longer used and can be deleted. From the bridge era (≤ v0.1.55) also remove the
`evf-bridge` container.

---

## 🎲 The two URLs that matter

| Field in `module.json` | URL | Purpose |
|---|---|---|
| `manifest` | `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` | **Stable.** Foundry and The Forge poll it for updates (GitHub's `/latest/` redirect). |
| `download` | `https://github.com/Aiacos/EvenFoundryVTT/releases/download/v<X.Y.Z>/evenfoundryvtt.zip` | **Version-pinned.** Patched per release by the workflow. Never use `/latest/` here. |

Both files are uploaded as release assets by
`.github/workflows/foundry-module-release.yml`.

---

## 🚀 Publishing a release

Releases follow GitFlow + Changesets and are **hands-off** after a merge to `main`:

1. `release.yml` (`changesets/action`) opens or updates the PR
   *chore(release): version packages* that consumes the changesets.
2. In the same run, the `gates` job executes the reusable CI workflow (`ci.yml`) on the
   PR's head commit; the `publish` job reports it as the required `quality-gates` check,
   merges **exactly that commit** (`--match-head-commit`) and runs `pnpm release:tag`
   (`scripts/release-tag.mjs`) on the merged `main`: it reads the
   version from `packages/foundry-module/package.json`, pushes the tag `v<version>`
   (idempotent) and dispatches `foundry-module-release.yml`.
3. `foundry-module-release.yml` publishes the GitHub Release with `module.json` +
   `evenfoundryvtt.zip` + `evenfoundryvtt.ehpk`. Foundry and **The Forge** pick the update up from the
   manifest URL `…/releases/latest/download/module.json` — no manual step.

4. After the release, the same run **back-merges `main` into `develop`**: it points
   `sync/main-to-develop` at `main`, opens the PR *chore(release): sync main into develop*,
   runs the reusable CI on that commit and merges it. Only a real conflict leaves the PR
   open (error annotation in the run) for a human.

Rule: a changeset that bumps `@evf/g2-app`, `@evf/shared-protocol` or `@evf/shared-render` must
also bump `@evf/foundry-module` — the release tag follows the module version, and the app
reaches players only as the `.ehpk` attached to that release (CI gate
`scripts/check-changeset-module.mjs`). `@evf/relay` is deployed by `relay-deploy.yml` on
merge, independently of releases.

Why the pipeline verifies and merges by itself: PRs opened by `github-actions[bot]` can
sit in *action required* before their own CI starts, and a merge or tag pushed with the
default `GITHUB_TOKEN` never triggers other `on: push` workflows (GitHub anti-recursion
rule) — `workflow_call` and `workflow_dispatch` do. No PAT is required. Manual tag, if ever needed:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow runs on `v*.*.*` tags (or `workflow_dispatch` with a `tag` input):

1. Validates the tag format `vMAJOR.MINOR.PATCH[-prerelease]`.
2. `pnpm install --frozen-lockfile --ignore-scripts`.
3. Builds the module: `pnpm --filter @evf/foundry-module build` → `dist/module.js`
   (bundles `@evf/shared-protocol` + `qrcode`).
4. Builds the glasses app: `pnpm --filter @evf/g2-app build` → `packages/g2-app/dist`,
   then `node scripts/check-relay-origin.mjs --bundle packages/g2-app/dist` (whitelist =
   `DEFAULT_RELAY_URL`, `camera` declared, no Foundry `/join` or socket.io in the bundle).
5. Patches `module.json` `version` and the pinned `download` URL, and **version-stamps**
   the esmodule and stylesheet filenames (`dist/module-<ver>.js`,
   `styles/pair-g2-<ver>.css`): Foundry caches module JavaScript, so without a new filename
   clients keep running the old build. Syncs `packages/g2-app/app.json` `version` from the
   g2-app package and packs `evenfoundryvtt.ehpk` from `packages/g2-app/dist`.
6. Assembles `module.json` + `dist/` + `lang/` + `templates/` + `styles/` and zips them as
   `evenfoundryvtt.zip` (sourcemaps excluded). It fails if the zip still contains `g2/`.
7. Builds the release notes from the `packages/foundry-module/CHANGELOG.md` entry, plus the
   `packages/g2-app/CHANGELOG.md` entry when there is one. On a first release it falls back
   to `--generate-notes`.
8. Creates the GitHub Release if it is missing (tags with `-` are marked pre-release) and
   uploads `module.json` + `evenfoundryvtt.zip` + `evenfoundryvtt.ehpk` with `--clobber`.

There is no GHCR bridge image and no standalone `g2-app-dist.zip` any more (both removed with
the bridge, ADR-0016), and no `g2/` in the module zip (ADR-0019).

**Re-run:** *Actions → Foundry Module Release → Run workflow* with the tag. It is
idempotent: an existing release is reused and assets are overwritten.

---

## 📦 End-user installation

**Foundry:** *Setup* → *Add-on Modules* → *Install Module* → Manifest URL
`https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`.

**The Forge:** *Bazaar* → *+ Install Module from a Manifest* → the same URL.

Foundry extracts the zip to `Data/modules/evenfoundryvtt/`. No HTTPS, proxy or GM setup is
needed: players install **FoundryVTT G2 HUD** from Even Hub and connect from their own
Foundry. Next steps: [setup guide](../setup-guide.md).

### Dependencies declared in `module.json`

- **System:** `dnd5e` ≥ 5.3.3 (`relationships.systems`).
- **Recommended:** `midi-qol` (`relationships.recommends`). It is optional.
- **socketlib:** no longer required.

---

## ⚙️ MidiQOL at runtime

The write-path handlers check at runtime whether MidiQOL is active:

- **MidiQOL active:** handlers call `MidiQOL.completeActivityUse` with advantage and
  explicit targets, so attack → damage → save → effect runs headless.
- **MidiQOL absent:** handlers fall back to vanilla `activity.use()`. This posts the
  activity card, and the rolls stay manual.

Every call goes through `dispatchTool` in the projector tab (the player's own Foundry client)
([ADR-0011](../architecture/0011-foundry-write-path-single-workflow-origin.md)). CI gate 8
rejects `activity.use(` anywhere outside `packages/foundry-module/src/write-path/`.

---

## 🧪 Local build before tagging

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build        # tsup → packages/foundry-module/dist/
pnpm --filter @evf/g2-app build                 # vite → packages/g2-app/dist (for the .ehpk)

cd packages/foundry-module
mkdir -p release-tree
cp module.json release-tree/ && cp -r dist lang templates styles release-tree/
node ../../scripts/check-module-assets.mjs release-tree   # every esmodule/style/lang path exists
(cd release-tree && zip -r ../evenfoundryvtt.zip . -x "*.map")
rm -rf release-tree evenfoundryvtt.zip                    # keep the tree clean
```

For quick iteration, symlink `packages/foundry-module/` into
`<FoundryData>/Data/modules/evenfoundryvtt/` instead of zipping. Pack the `.ehpk` with the
command in [evenhub.md](evenhub.md#-build-and-pack).

---

## 📚 Sources

- [Foundry VTT — Introduction to Module Development](https://foundryvtt.com/article/module-development/) (manifest fields, static module files)
- [Foundry VTT 14.361 release notes](https://foundryvtt.com/releases/14.361) (module HTML served as `text/plain` — why `g2/` left the zip)
- [League of Foundry Developers — FoundryVTT-Module-Template](https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template) (`releases/latest/download/module.json` pattern)
- [Even Hub packaging](evenhub.md) — the `.ehpk` player distribution
