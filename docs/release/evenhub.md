# Even Hub publishing runbook (g2-app plugin)

How the EvenFoundryVTT G2 plugin (`packages/g2-app`) is packaged and submitted to the
Even Hub. Closes **DIST-EHUB-01**.

## Testing on the glasses — dev mode vs the `.ehpk` (the "trial version expired" trap)

There are **two different ways** to get the plugin onto the G2, and conflating them is the
cause of the *"trial version expired"* error in the Even app.

| | **Dev mode** (for iterating) | **`.ehpk` upload** (for shipping) |
|---|---|---|
| Tool | `evenhub qr` → scan with the Even app | Even Hub developer **portal** upload |
| What loads | Your **live dev server** (`http://<LAN-IP>:5173`), with **hot reload** | The packaged `.ehpk` bundle |
| Expiry | **None** — reloads as long as the dev server runs | **Trial builds EXPIRE** (a private/test upload is time-limited) → *"versione di prova scaduta"* |
| Use it for | Day-to-day development + on-device testing | Final submission for review, or a short-lived private test |

> Verbatim, `hub.evenrealities.com/docs/reference/cli`: *"Scan the QR code with the Even
> Realities App on your phone. Your app loads on the glasses with **hot reload** support."*
> The CLI README adds: *"For development mode with the Even app, the `qr` command is the only
> command you need."* The `.ehpk` is for distribution, **not** for day-to-day testing.

### Fix for "versione di prova scaduta"

1. **For ongoing testing, stop uploading `.ehpk` trials — use dev mode instead** (no expiry):
   ```bash
   pnpm --filter @evf/g2-app dev        # vite dev server on :5173 (bind to 0.0.0.0 for LAN)
   pnpm --filter @evf/g2-app dev:qr     # prints a QR for http://<LAN-IP>:5173 — scan in the Even app
   ```
   The phone must be on the **same LAN** as your machine; the app hot-reloads on every save.
2. **If you must re-test via an uploaded trial, regenerate a FRESH `.ehpk` and re-upload** — a
   new upload resets the trial window. The `.ehpk` carries no expiry itself; the limit is a
   portal-side trial policy, so a stale upload simply needs replacing:
   ```bash
   pnpm --filter @evf/g2-app pack:ehpk  # fresh build + pack → packages/g2-app/evenfoundryvtt.ehpk
   ```
   CI also attaches a fresh `evenfoundryvtt.ehpk` to **every GitHub Release**
   (`foundry-module-release.yml`), so the latest release asset is always current.
3. The **permanent** install (no expiry) only comes from a **portal submission that Even
   approves** — see *Manual submission steps* below.

## Pairing / install — the direct link (Feature 001 D1)

There is **no QR pairing** (the glasses have no camera). Connecting the plugin is **install +
paste**, one canonical "direct link" to the bridge that fronts Foundry/Forge:

1. Install the plugin in the Even Hub app (dev mode `qr`, or an approved `.ehpk`).
2. On first launch the pairing wizard asks for the **bridge URL** (the public HTTPS origin of
   your bridge, e.g. `https://evf-bridge.example`) and the **non-expiring (campaign-long) access
   token** (issued by the Foundry module's self-service pairing flow), then the character.
3. The plugin connects and auto-reconnects on drop. The **`bridgeUrl` is the persisted profile**;
   the **token is held in memory only** (never persisted — T-02-01) and is re-entered/confirmed
   on relaunch.

There is **no implicit `localhost` default** any more (Feature 001 D1 removed it — it was the
on-phone "unreachable bridge" trap). For local dev you may set `VITE_EVF_DEV_BRIDGE_URL` (+
`VITE_EVF_NO_AUTH`) via the gitignored `.env.local` — see `packages/g2-app/.env.local.example`.

## g2-app build-time config (`VITE_*`)

The g2-app reads a few build-time options from Vite env vars (`VITE_` prefix). These are
baked into the bundle at `pnpm --filter @evf/g2-app build`; change them and rebuild.

| Var | Domain | Default | Effect |
|---|---|---|---|
| `VITE_EVF_FPS_CORNER` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` | `bottom-right` | Corner of the composited FPS badge (z=1 status layer). Invalid/absent → `bottom-right`. Toggled live by the `[F] FPS` quick action; this var only chooses where it sits. |

> The deploy template carries the un-prefixed `EVF_FPS_CORNER` in `deploy/.env.example`
> (the operator-facing name); set `VITE_EVF_FPS_CORNER` to the same value when building the
> g2-app bundle. The connection profile (`bridgeUrl` + token) is **not** a build var — it is
> pasted once into the running plugin (install + paste; no camera/QR).

## What the CI/CD does automatically (maximum possible automation)

Two automated paths produce the submission-ready `.ehpk`:

1. **Every push to `main`** — `.github/workflows/evenhub-pack.yml`:
   builds `g2-app` → syncs `app.json` `version` from `packages/g2-app/package.json` →
   `evenhub pack` → uploads `evenfoundryvtt.ehpk` as a **build artifact** (90-day retention).
2. **Every tagged release** — `.github/workflows/foundry-module-release.yml` (`build-g2app-zip`
   job): same build + pack, then attaches `evenfoundryvtt.ehpk` as a **permanent GitHub
   Release asset** alongside `module.json`, `evenfoundryvtt.zip`, and `g2-app-dist.zip`.

So the latest submission-ready `.ehpk` is always one download away — either the workflow run
or, for releases, `https://github.com/Aiacos/EvenFoundryVTT/releases/latest`.

## Why submission is NOT fully automated (INV-2, re-verified 2026-05-31)

Re-verified against `hub.evenrealities.com/docs/reference/{cli,app-submission}`, the live
`evenhub --help` of **CLI 0.1.13** (latest), AND the CLI source (`main.js`):

- The Even Hub CLI exposes only `login`, `init`, `pack`, `qr` — **there is no
  `publish`/`submit`/`deploy`/`upload` command** (confirmed in 0.1.13 `--help`).
- `evenhub login` takes only `-e/--email`; the password is prompted **interactively** — no
  documented token / env-var / non-interactive login for CI.
- App-submission doc verbatim: *"Every app submitted to Even Hub goes through a **manual
  review**."* Submission is a **manual upload to the developer portal**, review/approval-gated.

### Private API surface found in the CLI (NOT used — documented for completeness)

The CLI talks to a private REST API at `https://hub.evenrealities.com/api/v1/…`
(overridable via `EVENHUB_BASE_URL` / `EVENHUB_API_URL`, extra headers via `EVENHUB_API_HEADERS`):

- `POST /api/v1/auth/login {email, password}` → access/refresh tokens (header `X-Even-Authorization`).
- `POST /api/v1/auth/refresh`, `GET /api/v1/auth/self_check`.
- `POST /api/v1/apps/check {package_id}` (the `pack -c` availability check — **needs auth**).

A non-interactive login is therefore *technically* possible, **but there is NO documented app
upload/submit endpoint** (none in the CLI, none in the docs), and any use of this private API
would be unsupported, fragile, possibly against ToS, and still review-gated. We deliberately do
**not** build CI on it. The day Even ships a real CI submit command + token, enable the gated
step stubbed at the bottom of `build-g2app-zip` in `foundry-module-release.yml` (and in
`evenhub-pack.yml`) — it expects an `EVENHUB_TOKEN` secret; no other change needed.

## One-time prerequisites before the first submission

### Deploy bridge + plugin host over HTTPS (Caddy)

The Even Hub WebView requires **HTTPS with a valid cert** (self-signed is rejected on the
phone), so the bridge and the static plugin host must be served over real HTTPS origins.
A turnkey Caddy reverse proxy (auto Let's Encrypt) is provided:

```bash
# 1. real, publicly-resolvable hostnames + secret in deploy/.env
cp deploy/.env.example deploy/.env
#    set EVF_INTERNAL_SECRET (openssl rand -base64 32),
#        EVF_BRIDGE_HOST=evf-bridge.yourdomain.net,
#        EVF_PLUGIN_HOST=evf-plugin.yourdomain.net,
#        EVF_PLUGIN_HOST_URL=https://evf-plugin.yourdomain.net   (bridge CORS)
# 2. build the plugin host, then bring up bridge + Caddy
pnpm --filter @evf/g2-app build
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.https.yml up -d --build
```

DNS A records for both hostnames must point at the host, with ports **80 + 443** reachable.
**No public IP / homelab?** Front Caddy with a tunnel instead of opening ports:
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
or **Tailscale Funnel** (`tailscale funnel 443`) — both give a valid HTTPS hostname without
port-forwarding. Use that hostname as `EVF_PLUGIN_HOST` / `EVF_BRIDGE_HOST`.

### Then sync the manifest + verify

1. **Whitelist** — derive `app.json` → `permissions[0].whitelist` from those hostnames
   (origin-complete, no wildcards — the WebView enforces it at runtime):
   ```bash
   node deploy/sync-app-whitelist.mjs       # reads deploy/.env → writes the two https origins
   ```
2. **Verify `min_app_version`** (`2.0.0` placeholder) against your target Even Realities App
   version, and `package_id` availability (online, after `evenhub login`):
   `npx @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/g2-app/dist -c`.
3. **Repackage** with the real whitelist: `pnpm --filter @evf/g2-app pack:ehpk`.

## Manual submission steps

1. Download `evenfoundryvtt.ehpk` from the latest `Even Hub Pack` workflow run (or build
   locally: `pnpm --filter @evf/g2-app build && npx @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/g2-app/dist -o evenfoundryvtt.ehpk`).
2. Log in to the Even Hub developer portal.
3. Upload the `.ehpk`, complete the listing metadata, and submit for review.
4. After approval the plugin is available to Even Hub G2 users.

## Manifest field notes (`app.json`)

| Field | Value | Constraint |
|-------|-------|------------|
| `package_id` | `io.github.aiacos.foundryvtt` | reverse-domain, lowercase, no hyphens, ≥2 segments, each segment starts with a letter |
| `edition` | `202601` | exact |
| `name` | `FoundryVTT G2 HUD` | ≤20 chars (avoid "Even") |
| `version` | synced from `g2-app/package.json` | semver, no `v` prefix |
| `min_app_version` / `min_sdk_version` | `2.0.0` / `0.0.10` | both required; SDK floor `0.0.10` |
| `entrypoint` | `index.html` | must exist at the build-output root. `vite.config.ts` uses `root: 'src'` + `outDir: '../dist'` so the entry emits as `dist/index.html` (not `dist/src/index.html`) — keeping the canonical `index.html` entrypoint. |
| `supported_languages` | `["it","en"]` | from `en,de,fr,es,it,zh,ja,ko` |

## Canonical Even Hub references (INV-2)

Authoritative upstream for the packaging pipeline. Re-verify against these before any
change (INV-2); aggregator/blog/AI-summary sources are not authoritative.

| Topic | Canonical URL | Used for |
|-------|---------------|----------|
| Execution model + dev workflow | <https://hub.evenrealities.com/docs/getting-started/overview> | *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* — 5-step workflow (write → preview → test → **pack** → submit). |
| CLI reference | <https://hub.evenrealities.com/docs/reference/cli> | Commands `login` / `init` / `qr` / `pack` only — **no `publish`/`submit`/`upload`** (portal submit is manual). `evenhub pack app.json dist -o myapp.ehpk` (`-c` = online `package_id` availability check). |
| Packaging | <https://hub.evenrealities.com/docs/reference/packaging> | `.ehpk` format + manifest field rules. |
| App submission & QA | <https://hub.evenrealities.com/docs/reference/app-submission> | Manual portal upload + review/approval gate (why the CD stops at the artifact). |
| Device APIs | <https://hub.evenrealities.com/docs/guides/device-apis> | Hardware envelope + `network` whitelist enforcement that the manifest `permissions` declares. |

npm tooling: `@evenrealities/evenhub-cli` (used by `.github/workflows/evenhub-pack.yml`),
`@evenrealities/evenhub-simulator` (local preview — `evenhub-simulator http://localhost:5173`),
`@evenrealities/even_hub_sdk` (plugin SDK; the g2-app types live in
`packages/g2-app/src/types/even-hub.d.ts`).
