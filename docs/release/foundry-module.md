# Foundry Module Release & Distribution

Operator runbook for publishing EvenFoundryVTT to GitHub Releases and how end
users install it on Foundry desktop or The Forge.

---

## 1. The two URLs that matter

The Foundry release flow rests on two URL patterns inside `module.json`:

| Field | URL | Purpose |
|---|---|---|
| `manifest` | `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` | **Stable.** Foundry desktop + The Forge poll this URL to detect updates. Always points to the most recent release thanks to GitHub's `/latest/` redirect. |
| `download` | `https://github.com/Aiacos/EvenFoundryVTT/releases/download/v<X.Y.Z>/evenfoundryvtt.zip` | **Version-pinned.** Tells Foundry exactly which zip to fetch for *this* version. Patched per release by the workflow — never use `/latest/` here (it would break older clients still on an older version). |

Both URLs become real assets attached to the GitHub Release by
`.github/workflows/foundry-module-release.yml`.

---

## 2. Publishing a new release

End-to-end, the operator workflow is:

1. **Bump version** in `packages/foundry-module/module.json` (optional — the
   workflow will overwrite it from the tag, but keeping main in sync is good
   hygiene).

2. **Add a Changeset** (the workspace uses `@changesets/cli`) and commit it on
   `main`:

   ```bash
   pnpm changeset
   # describe the change; choose `minor`/`patch` per semver
   git add .changeset/*.md packages/foundry-module/module.json
   git commit -m "release: foundry-module v<X.Y.Z>"
   git push
   ```

3. **Tag and push** matching the version (the workflow accepts
   `vMAJOR.MINOR.PATCH[-prerelease]`):

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **Create the GitHub Release** on that tag:
   - Open `https://github.com/Aiacos/EvenFoundryVTT/releases/new`
   - Select tag `v0.2.0`
   - Write release notes (paste relevant `.changeset` summaries — or auto-generate)
   - Click **Publish release**

5. **Workflow runs.** It will:
   - install dependencies (`pnpm install --frozen-lockfile --ignore-scripts`)
   - build the module bundle (`pnpm --filter @evf/foundry-module build` →
     `dist/module.js` with `@evf/shared-protocol` + `qrcode` bundled in)
   - patch `module.json` with `version = 0.2.0` and the version-pinned
     `download` URL
   - assemble the release tree (`module.json` + `dist/` + `lang/` + `templates/`)
   - zip it as `evenfoundryvtt.zip` (sourcemaps excluded from runtime zip)
   - `gh release upload` both `module.json` and `evenfoundryvtt.zip` to the
     release

6. **Verify** the release page now has two attached assets:
   - `module.json`
   - `evenfoundryvtt.zip`

The manifest URL `…/releases/latest/download/module.json` now resolves to the
new `module.json` automatically.

---

## 3. End-user installation

### Foundry desktop / self-hosted

1. Launch Foundry → **Setup** → **Add-on Modules** → **Install Module**
2. In the **Manifest URL** field paste:
   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```
3. Click **Install**.

Foundry downloads the version-pinned zip from the `download` field of that
manifest, extracts to `Data/modules/evenfoundryvtt/`, and adds the module to
the world's module list.

### The Forge

1. In **The Forge Bazaar**, scroll to the bottom: **Add-on Modules** → 
   **+ Install Module from a Manifest**.
2. Paste the same manifest URL:
   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```
3. Click **Install**.

The Forge's Bazaar polls the same manifest URL as Foundry desktop. When a
new release is published, the Forge surfaces the update in its **Modules** tab
within ~24h (or immediately on manual refresh).

### Required modules (auto-resolved)

`module.json` declares these `relationships.requires` — Foundry's installer
prompts the user to install them automatically:

- `socketlib` — GM-side `executeAsGM` dispatch.
- `midi-qol` — attack → damage → save → effect workflow. **See §5 for why MidiQOL is a soft
  dependency at runtime.**

And the required system:

- `dnd5e` >= 5.3.3 (PHB 2014 + PHB 2024 dual-edition support).

---

## 4. Re-publishing a release (corrections)

If a release ships with a bug and you need to ship a hotfix:

```bash
# 1. Fix on main, push commits
# 2. Bump version (semver patch)
# 3. Tag + GitHub Release as in §2

git tag v0.2.1
git push origin v0.2.1
# create the GitHub Release on v0.2.1
```

The workflow always patches the manifest with the tag's version. Foundry
desktop + The Forge will detect the new version on their next poll.

**Avoid editing or deleting published releases** — the version-pinned download
URL becomes part of the auto-update history for users who already have v0.2.0
installed. If you must, the workflow re-runs idempotently via `gh release
upload --clobber`.

---

## 5. MidiQOL: soft vs hard dependency

MidiQOL is declared in `module.json` as `relationships.requires`. This means
Foundry installs it alongside EvenFoundryVTT, which is the recommended UX.

But the actual runtime dependency is *behavioral, not API-level*: when our
Phase 07+ write path calls `activity.use()` (dnd5e API), Foundry fires the
`dnd5e.preUseActivity` hook. If MidiQOL is installed, **it listens on that
hook** and runs its full attack → damage → save → effect workflow. Our code
never imports `MidiQOL`. We never call `MidiQOL.completeActivityUse()` directly.

Implications:
- If MidiQOL is uninstalled, EvenFoundryVTT still loads cleanly — `activity.use()`
  runs the dnd5e baseline workflow without MidiQOL enhancements (no auto-targets,
  no auto-damage application, no MidiQOL-specific automations).
- The `module.json` `requires` clause is for **good defaults**, not a hard
  runtime gate. A user could remove MidiQOL from their world manually; the
  bridge dispatch still works.

This is why the Phase 0 MidiQOL "config probe" is treated as **advisory, not
blocking**: the probe verifies MidiQOL config is sensible, but the real test
is behavioral — does an `activity.use()` triggered via the bridge reach
MidiQOL's listener and produce the expected chat-card sequence? That's a
Phase 07 integration test, not a Phase 0 gate.

---

## 6. Local testing before publishing

Build the zip locally as a sanity check before tagging:

```bash
pnpm --filter @evf/foundry-module build

# Manually run the same patch the workflow does:
node -e '
  const m = require("./packages/foundry-module/module.json");
  m.version = "0.2.0-test";
  m.download = "https://example.test/evenfoundryvtt.zip";
  require("fs").writeFileSync("packages/foundry-module/module.json", JSON.stringify(m, null, 2) + "\n");
'

# Assemble + zip:
cd packages/foundry-module
mkdir -p release-tree
cp module.json release-tree/
cp -r dist release-tree/
cp -r lang release-tree/
cp -r templates release-tree/
cd release-tree && zip -r ../evenfoundryvtt.zip . -x "*.map" && cd ..
unzip -l evenfoundryvtt.zip

# Then point Foundry's "Manifest URL" install at a file:// or local HTTP path
# pointing at the local module.json. After verifying, revert the module.json
# patch (or restore from git).
```

The CI workflow runs the exact same sequence non-interactively.

---

## 7. Sources

The conventions documented here come from:

- [Foundry VTT — Introduction to Module Development](https://foundryvtt.com/article/module-development/) (manifest field semantics)
- [Foundry VTT Community Wiki — Package Manifest+](https://foundryvtt.wiki/en/development/manifest-plus)
- [Foundry VTT Community Wiki — Package Releases and Version History](https://foundryvtt.wiki/en/development/guides/releases-and-history)
- [League of Foundry Developers — FoundryVTT-Module-Template](https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template) (CI/CD pattern + `releases/latest/download/module.json` trick)
- [The Forge — Module Management & Bazaar polling](https://forums.forge-vtt.com/t/how-are-module-updates-handled/18100)
- [dnd5e Hooks reference](https://github.com/foundryvtt/dnd5e/wiki/Hooks) — `dnd5e.preUseActivity` confirms MidiQOL's Hook-based interception model.
