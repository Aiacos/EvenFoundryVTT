# Even Hub packaging (`.ehpk`, secondary)

Since v0.10.0 the glasses app is distributed by **QR sideload**. Foundry serves it from
the module folder (`/modules/evenfoundryvtt/g2/index.html`), and the Even Realities App
loads it from the pairing QR ([ADR-0012](../architecture/0012-direct-foundry-streaming.md)).
Players don't need the `.ehpk`.

The `.ehpk` is kept for two reasons: it validates the manifest and build on every merge,
and it keeps the door open for a future Even Hub listing. A packaged build can't replace
the sideload. Its network whitelist is fixed in `app.json` (origin-complete, no
wildcards) and doesn't bypass CORS, so it can't reach an arbitrary user's Foundry
(ADR-0012, Considered Options B).

---

## 🚀 What CI does (every push to `main`)

`.github/workflows/evenhub-pack.yml`:

1. `pnpm --filter @evf/g2-app build` → **`packages/foundry-module/g2/`** (the same output
   that ships in the module zip). It fails if `index.html` is missing.
2. Syncs `app.json` `version` from `packages/g2-app/package.json` (Changesets-managed).
3. Packs and validates:
   `npx --yes @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/foundry-module/g2 -o evenfoundryvtt.ehpk`.
4. Uploads `evenfoundryvtt.ehpk` as a build artifact (90-day retention).

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
| `min_sdk_version` | `0.0.14` | long-press, `menuObject`, 100 ms image pacing ([firmware matrix](../firmware-compatibility.md)) |
| `entrypoint` | `index.html` | must exist in `packages/foundry-module/g2/` |
| `permissions[0].whitelist` | `https://foundry.REPLACE-WITH-YOUR-ORIGIN.example` | placeholder. A packaged build reaches **only** this Foundry origin. |
| `supported_languages` | `["it","en"]` | |

Before a portal submission, replace the whitelist placeholder with your Foundry origin
and run the online `package_id` check:
`npx @evenrealities/evenhub-cli pack app.json ../foundry-module/g2 -c`.
