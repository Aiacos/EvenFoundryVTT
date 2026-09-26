# Even Hub packaging (`.ehpk`) — the player distribution

Since [ADR-0019](../architecture/0019-relay-pairing-player-projector.md) the glasses app
**FoundryVTT G2 HUD** reaches players as an Even Hub package. It no longer ships inside the
Foundry module (Foundry ≥ 14.361 serves module HTML as `text/plain`). The installed app
talks only to the fixed relay `wss://evf-relay.evf-relay.workers.dev`, which is exactly what a
store package allows: one origin-complete whitelist, no wildcards. It survives the phone
lock, which a QR-sideloaded page does not.

One bundle (`packages/g2-app/dist`), three ways to load it:

| Way | For | Loads | Survives phone lock |
|---|---|---|---|
| **Even Hub package** (beta group, then store) | players | the `.ehpk` installed in the Even Realities App | **yes** (Beta/Released only) |
| **GitHub Pages** `https://aiacos.github.io/EvenFoundryVTT/app/` | developers/testers (developer mode → Scan QR on the pairing QR) | the page the pairing QR opens | no |
| **Vite dev server** on the LAN | development (`pnpm wizard`, `pnpm dev:glasses`) | this checkout | no |

---

## 🚀 Build and pack

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/g2-app build                          # vite → packages/g2-app/dist
node scripts/check-relay-origin.mjs --bundle packages/g2-app/dist   # CI Gate 10: relay-only contract
npx @evenrealities/evenhub-cli@0.1.14 pack packages/g2-app/app.json packages/g2-app/dist --sdk-ver 0.0.16 -o evenfoundryvtt.ehpk
```

Verified locally on 2026-09-25: the packer prints
`min_app_version 2.2.10 (SDK 0.0.16, --sdk-ver)` and writes a **212 KB** `evenfoundryvtt.ehpk`.
`app.json` `version` must equal `packages/g2-app/package.json` (`pnpm version-packages` syncs
it through `scripts/sync-app-json.mjs`).

### What CI does

- **`evenhub-pack.yml`** (every push to `main`): builds, runs the relay-origin check, syncs
  the `app.json` version, packs with the same command (the `--sdk-ver` is read from
  `packages/g2-app/package.json`) and uploads `evenfoundryvtt.ehpk` as a build artifact
  (90-day retention).
- **`foundry-module-release.yml`** (every release tag): the same build + pack, attached to the
  GitHub Release next to `module.json` and `evenfoundryvtt.zip`
  ([foundry-module.md](foundry-module.md)). Take the portal upload from there.
- **`pages.yml`** (every push to `main`): publishes the same `dist/` under `/app/` on GitHub
  Pages, next to the docs and the privacy page.

---

## ⚙️ Manifest (`packages/g2-app/app.json`)

| Field | Value | Note |
|---|---|---|
| `package_id` | `io.github.aiacos.foundryvtt` | reverse-domain, lowercase, no hyphens |
| `edition` | `202601` | exact |
| `name` | `FoundryVTT G2 HUD` | ≤ 20 chars, must not contain "Even" |
| `version` | synced from `g2-app/package.json` | semver, no `v` |
| `min_sdk_version` | `0.0.16` | the pinned SDK ([firmware matrix](../firmware-compatibility.md)) |
| `min_app_version` | **omitted** | stamped by the packer from the SDK floor: **2.2.10** |
| `description` / `icon` | present | `icon.png` from `assets/icon/` (see below) |
| `entrypoint` | `index.html` | in `packages/g2-app/dist/` |
| `permissions[network].whitelist` | `https://evf-relay.evf-relay.workers.dev`, `wss://evf-relay.evf-relay.workers.dev` | = `DEFAULT_RELAY_URL`; CI Gate 10 fails on drift |
| `permissions[camera]` | declared | in-app **Scan QR** of the pairing QR; the photo is decoded on the phone |
| `supported_languages` | `["it","en"]` | |

A self-hosted relay is **not** reachable from the packaged app (it is not in the whitelist):
self-hosters use the sideloaded page ([runbook](../runbook.md#-relay-and-pages)).

---

## 🚀 Portal flow: Draft → Test → Submitted → Released

Process from hub.evenrealities.com/docs (reference/app-submission, test/beta-testing):

1. **Account**: sign in at `https://hub.evenrealities.com/login` with the Even account
   (*"Can I publish without a developer account? No."*). Upload is manual in the portal; the
   CLI has no upload command.
2. **Draft**: create the app, upload `evenfoundryvtt.ehpk` from the latest GitHub Release as
   a build, fill the listing: icon (below), screenshots from the simulator, description,
   release notes (1–3 lines per language), **privacy policy URL**
   `https://aiacos.github.io/EvenFoundryVTT/privacy.html` ([`docs/privacy.md`](../privacy.md):
   covers the network and camera permissions and names the relay domain).
3. **Test**: a **private build** runs only on your own glasses and *"doesn't pass the
   5-minute lock test"*. A **beta build** is mandatory before review: create a **beta
   group** with the table's players (they install it from Even Hub as testers). This is how
   players get the app until it is listed.
4. **Submitted**: the reviewer installs the beta build. Approve → **Released** (*"Publicly
   listed in the store. No rollback."*); reject → back to Draft with notes. No timeline is
   documented; updates are fix-forward.
5. **Price**: *"TBD. No paid distribution yet."* Practical package size ≈ 10 MB (we are at
   212 KB).

### Review checklist

- [ ] **5-minute lock test on a Beta build**: pair, lock the phone for 5 minutes, unlock →
      the HUD is back without re-pairing (*"the only mode that behaves identically to a
      Released app … Skip it and you'll fail"*).
- [ ] **Root double-tap exits** (`shutDownPageContainer(1)`); `FOREGROUND_ENTER` /
      `FOREGROUND_EXIT` / `ABNORMAL_EXIT` handled; another app launches after exit.
- [ ] **Permission denial path**: deny the camera → **Enter code** with the 16-character code
      still pairs.
- [ ] **Core flow on glasses + ring only**: actions menu, cursor, back, long press only as an
      extra.
- [ ] **Hardware geometry**: image containers only on the 2 × 2 grid of 288 × 144 tiles from
      (0, 0). The real host rejects off-grid tiles (white glasses) while the simulator accepts
      them (finding `d97b12e`, 2026-07-07).
- [ ] **Manifest**: fields as above, `version` = package version, whitelist = relay,
      `camera` declared; online `package_id` check
      `npx @evenrealities/evenhub-cli@0.1.14 pack packages/g2-app/app.json packages/g2-app/dist --sdk-ver 0.0.16 -c`
      (after `evenhub login`).
- [ ] **Build clean**: no sourcemaps; `?demo` / `?debug` surfaces stay opt-in.
- [ ] **Relay live**: `curl https://evf-relay.evf-relay.workers.dev/health` → `ok` before
      submitting (the reviewer pairs against the production relay).

---

## 🧪 Dev loop: QR sideload, not a portal trial

Two ways to get a build onto the glasses without the store. Confusing them produces the
Even Realities App's **"trial version expired"** (*"versione di prova scaduta"*) error:

| | **QR sideload** (dev) | **`.ehpk` portal trial upload** |
|---|---|---|
| Tool | `pnpm wizard`, `pnpm dev:glasses`, `evenhub qr`, or the pairing QR | Even Hub developer portal |
| Loads | Vite dev server on the LAN, or the Pages `/app/` page | the packaged bundle |
| Expiry | **none** (dies on phone lock) | **trial uploads expire** |

The "trial version expired" error is **observed** on portal uploads, not stated in Even's
docs; a fresh upload restarts it. For players use the beta build instead.

**Developer mode on the phone** (hub.evenrealities.com/docs/get-started/quickstart/hardware):
*"There is no toggle. Signing in to the web hub flips your account to developer"* — sign in
once at `https://hub.evenrealities.com/login`, force-quit and reopen the Even Realities App,
then **Even Hub → Scan QR**. A QR-loaded app stops when the phone backgrounds it, and
*"some permission prompts are skipped"*.

```bash
pnpm wizard                                  # demo HUD scenes on the LAN + QR (no Foundry)
pnpm wizard --mode build                     # same, serving the production bundle
pnpm dev:glasses                             # live pairing against your Foundry (+ --local-relay)
npx @evenrealities/evenhub-cli qr --url http://<LAN-IP>:<port>/?demo=tour   # by hand
```

`pnpm dev:glasses` prints the QR of this checkout's app on the LAN: scan it in developer mode
(**Even Hub → Scan QR**), then type in the app the code that **Connect G2 glasses** (Alt+G)
shows in Foundry — or run `pnpm dev:glasses --code XXXX-XXXX-XXXX-XXXX` and one scan pairs.
Don't type URLs in the Even App's manual link field: it caps the length and capitalises the
first letter (the Even Hub docs list manual links in Dev Preview as a known issue). By hand,
Vite must listen on the LAN (`vite --host 0.0.0.0`; `pnpm --filter … dev -- --host` does
**not** forward the flag). `bash scripts/wizard.sh --help` lists every flag.

---

## 🔬 Why submission is manual

Verified against `hub.evenrealities.com/docs/reference/{cli,app-submission}` (2026-05-31):
the CLI exposes only `login`, `init`, `qr` and `pack`. `evenhub login` is interactive, and
submission is a manual upload to the Even Hub developer portal with review. If a
non-interactive submit command ever ships, wire the gated step stubbed at the bottom of
`evenhub-pack.yml` (it expects an `EVENHUB_TOKEN` secret).

---

## 🎨 App icon

Even Hub wants a **greyscale** icon with a **separate foreground and background** (colour
is rejected; it must stay legible). The repo ships a stylised d20:

```bash
python3 assets/generate-icon.py   # → assets/icon/{icon,icon-foreground,icon-background}.png (512 × 512)
```

Upload `assets/icon/icon-foreground.png` + `assets/icon/icon-background.png` on the portal;
the composite `icon.png` is what `app.json` `icon` bundles into the `.ehpk`.
