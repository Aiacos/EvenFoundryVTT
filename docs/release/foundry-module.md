# Foundry Module Release & Distribution

How to publish EvenFoundryVTT to GitHub Releases, and how users install it on Foundry or
The Forge. Since v0.10.0 the module zip is the **only** release artefact. It also carries
the glasses app under `g2/` ([ADR-0016](../architecture/0016-direct-foundry-streaming.md)).

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

Releases follow GitFlow + Changesets: merge the *Version Packages* PR, then tag.

```bash
git tag v0.10.0
git push origin v0.10.0
```

The workflow runs on `v*.*.*` tags (or `workflow_dispatch` with a `tag` input):

1. Validates the tag format `vMAJOR.MINOR.PATCH[-prerelease]`.
2. `pnpm install --frozen-lockfile --ignore-scripts`.
3. Builds the module: `pnpm --filter @evf/foundry-module build` → `dist/module.js`
   (bundles `@evf/shared-protocol` + `qrcode`).
4. Builds the g2-app **into the module**: `pnpm --filter @evf/g2-app build` →
   `packages/foundry-module/g2/`. It fails if `g2/index.html` is missing.
5. Patches `module.json` `version` and the pinned `download` URL.
6. Assembles `module.json` + `dist/` + **`g2/`** + `lang/` + `templates/` and zips them as
   `evenfoundryvtt.zip` (sourcemaps excluded). It fails if `g2/index.html` is not in the zip.
7. Builds the release notes from the `packages/foundry-module/CHANGELOG.md` entry, plus the
   `packages/g2-app/CHANGELOG.md` entry when there is one. On a first release it falls back
   to `--generate-notes`.
8. Creates the GitHub Release if it is missing (tags with `-` are marked pre-release) and
   uploads `module.json` + `evenfoundryvtt.zip` with `--clobber`.

There is no GHCR bridge image and no standalone `g2-app-dist.zip` any more.

**Re-run:** *Actions → Foundry Module Release → Run workflow* with the tag. It is
idempotent: an existing release is reused and assets are overwritten.

---

## 📦 End-user installation

**Foundry:** *Setup* → *Add-on Modules* → *Install Module* → Manifest URL
`https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json`.

**The Forge:** *Bazaar* → *+ Install Module from a Manifest* → the same URL.

Foundry extracts the zip to `Data/modules/evenfoundryvtt/` and serves the glasses app at
`https://<foundry>[/<prefix>]/modules/evenfoundryvtt/g2/index.html`. Foundry must be on
valid HTTPS for the phone. Next steps: [setup guide](../setup-guide.md).

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

Every call goes through `dispatchTool` in the GM client
([ADR-0011](../architecture/0011-foundry-write-path-single-workflow-origin.md)). CI gate 8
rejects `activity.use(` anywhere outside `packages/foundry-module/src/write-path/`.

---

## 🧪 Local build before tagging

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build:all     # g2-app → g2/, then tsup → dist/

cd packages/foundry-module
mkdir -p release-tree
cp module.json release-tree/ && cp -r dist g2 lang templates release-tree/
(cd release-tree && zip -r ../evenfoundryvtt.zip . -x "*.map")
unzip -Z1 evenfoundryvtt.zip | grep -x 'g2/index.html'   # must print the entry
rm -rf release-tree evenfoundryvtt.zip                    # keep the tree clean
```

For quick iteration, symlink `packages/foundry-module/` into
`<FoundryData>/Data/modules/evenfoundryvtt/` instead of zipping.

---

## 📚 Sources

- [Foundry VTT — Introduction to Module Development](https://foundryvtt.com/article/module-development/) (manifest fields, static module files, `module.<id>` socket relay)
- [League of Foundry Developers — FoundryVTT-Module-Template](https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template) (`releases/latest/download/module.json` pattern)
- [Even Hub packaging](evenhub.md) — the secondary `.ehpk` artefact
