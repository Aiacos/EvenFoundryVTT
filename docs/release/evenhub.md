# Even Hub packaging (`.ehpk`, secondary)

Since v0.12.0 the glasses app is distributed by **QR sideload**. Foundry serves it from
the module folder (`/modules/evenfoundryvtt/g2/index.html`), and the Even Realities App
loads it from the pairing QR ([ADR-0016](../architecture/0016-direct-foundry-streaming.md)).
Players don't need the `.ehpk`.

The `.ehpk` is kept for two reasons: it validates the manifest and build on every merge,
and it keeps the door open for a future Even Hub listing. A packaged build can't replace
the sideload. Its network whitelist is fixed in `app.json` (origin-complete, no
wildcards) and doesn't bypass CORS, so it can't reach an arbitrary user's Foundry
(ADR-0016, Considered Options B).

---

## ⏱️ Testing on the glasses: QR, not a portal trial

Two paths get the app onto the glasses. Confusing them produces the Even Realities App's
**"trial version expired"** (*"versione di prova scaduta"*) error:

| | **QR sideload** (dev + real use) | **`.ehpk` portal upload** |
|---|---|---|
| Tool | `evenhub qr` or the pairing QR → scan with the Even Realities App | Even Hub developer portal |
| Loads | the page Foundry serves (`/modules/evenfoundryvtt/g2/`), or the Vite dev server | the packaged bundle |
| Expiry | **none** | **trial uploads expire** |
| Permanent install | — | only after a portal submission Even approves |

Even docs (`hub.evenrealities.com/docs/reference/cli`): *"Scan the QR code with the Even
Realities App on your phone. Your app loads on the glasses with hot reload support."*
Dev loop: `pnpm --filter @evf/g2-app dev`, then
`npx @evenrealities/evenhub-cli qr --url http://<LAN-IP>:5173` (phone and machine on the
same LAN). If you must re-test through the portal, pack a **fresh** `.ehpk` and upload
it again: a new upload restarts the trial window (the expiry is a portal policy, not a
property of the file).

---

## 🚀 What CI does (every push to `main`)

`.github/workflows/evenhub-pack.yml`:

1. `pnpm --filter @evf/g2-app build` → **`packages/foundry-module/g2/`** (the same output
   that ships in the module zip). It fails if `index.html` is missing.
2. Syncs `app.json` `version` from `packages/g2-app/package.json` (Changesets-managed).
3. Packs and validates:
   `npx --yes @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/foundry-module/g2 -o evenfoundryvtt.ehpk`.
4. Uploads `evenfoundryvtt.ehpk` as a build artifact (90-day retention).

`foundry-module-release.yml` runs the same sync + pack on every release tag and attaches
`evenfoundryvtt.ehpk` to the GitHub Release next to `module.json` and `evenfoundryvtt.zip`
([foundry-module.md](foundry-module.md)).

Local equivalent, from `packages/g2-app/`:

```bash
pnpm --filter @evf/g2-app build
npx @evenrealities/evenhub-cli pack app.json ../foundry-module/g2 -o evenfoundryvtt.ehpk
```

---

## 🔬 Why submission is manual

Verified against `hub.evenrealities.com/docs/reference/{cli,app-submission}` (2026-05-31):
the CLI exposes only `login`, `init`, `qr` and `pack`. `evenhub login` is interactive,
and submission is a manual upload to the Even Hub developer portal with review. If a
non-interactive submit command ever ships, wire the gated step stubbed at the bottom of
`evenhub-pack.yml` (it expects an `EVENHUB_TOKEN` secret).

---

## ⚙️ Manifest (`packages/g2-app/app.json`)

| Field | Value | Note |
|---|---|---|
| `package_id` | `io.github.aiacos.foundryvtt` | reverse-domain, lowercase |
| `edition` | `202601` | exact |
| `name` | `FoundryVTT G2 HUD` | ≤ 20 chars |
| `version` | synced from `g2-app/package.json` | semver, no `v` |
| `min_app_version` | required by the packer | minimum Even Realities App version |
| `description` / `icon` | required for a listing | `icon.png` from `assets/icon/` (see below) |
| `min_sdk_version` | `0.0.14` | long-press, `menuObject`, 100 ms image pacing ([firmware matrix](../firmware-compatibility.md)) |
| `entrypoint` | `index.html` | must exist in `packages/foundry-module/g2/` |
| `permissions[0].whitelist` | `https://foundry.REPLACE-WITH-YOUR-ORIGIN.example` | placeholder. A packaged build reaches **only** this Foundry origin. |
| `supported_languages` | `["it","en"]` | |

Before a portal submission, replace the whitelist placeholder with your Foundry origin
and run the online `package_id` check:
`npx @evenrealities/evenhub-cli pack app.json ../foundry-module/g2 -c`.

---

## ✅ Pre-submission checklist

Hand-ported from the bridge-era checklist (verified 2026-07-05 against the Even Hub
packaging reference) onto the sideload-first model:

- [ ] **`app.json` fields valid**: `package_id` reverse-domain, lowercase, no hyphens, every
      segment starts with a letter; `edition` = `202601`; `name` ≤ 20 chars; `version` semver
      and **equal to `packages/g2-app/package.json`** (local packs reject a mismatch);
      `min_app_version` and `min_sdk_version` (≥ 0.0.14 for review) present; `description` and
      `icon` present; `entrypoint` = `index.html`; `supported_languages` ⊂
      `{en,de,fr,es,it,zh,ja,ko}`.
- [ ] **Whitelist = your Foundry origin**: replace the placeholder with the origin-complete
      HTTPS origin (no wildcards). The whitelist is an Even-level check and does **not**
      bypass CORS; the packaged build only talks to that one Foundry.
- [ ] **Build output clean**: `pnpm --filter @evf/g2-app build` produced
      `packages/foundry-module/g2/index.html`; no sourcemaps; no demo/debug surfaces enabled
      by default (`?demo` / `?debug` stay opt-in).
- [ ] **Hardware geometry**: image containers only on the 2 × 2 grid of 288 × 144 tiles from
      (0, 0). The real host rejects `rebuildPageContainer` with off-grid image tiles (white
      glasses) while the simulator accepts them (hardware finding `d97b12e`, 2026-07-07).
- [ ] **Lifecycle**: root double-tap → `shutDownPageContainer(1)`; `FOREGROUND_ENTER` /
      `FOREGROUND_EXIT` / `ABNORMAL_EXIT` handled (app-submission QA).
- [ ] **`package_id` availability**: `npx @evenrealities/evenhub-cli pack app.json ../foundry-module/g2 -c`
      (online, after `evenhub login`).
- [ ] **Fresh `.ehpk`** packed from the current build (or taken from the latest Release).

## 📤 Manual submission steps

1. Take `evenfoundryvtt.ehpk` from the latest GitHub Release or `Even Hub Pack` run, or
   pack it locally (above).
2. `npx @evenrealities/evenhub-cli login -e you@example.com`, then open the Even Hub
   developer portal.
3. Upload the `.ehpk`, complete the listing (icon below) and submit for review.
4. After Even Realities approves it, the app is available to G2 users.

## 🎨 App icon

Even Hub wants a **greyscale** icon with a **separate foreground and background** (colour
is rejected; it must stay legible). The repo ships a stylised d20:

```bash
python3 assets/generate-icon.py   # → assets/icon/{icon,icon-foreground,icon-background}.png (512 × 512)
```

Upload `assets/icon/icon-foreground.png` + `assets/icon/icon-background.png` on the portal;
the composite `icon.png` is what `app.json` `icon` bundles into the `.ehpk`.
