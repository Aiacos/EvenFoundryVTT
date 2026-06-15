# EvenFoundryVTT — Self-Hosting Guide

End-to-end guide for deploying your own EvenFoundryVTT stack so you can project a
FoundryVTT D&D 5e session onto your Even Realities G2 glasses.

> **Detailed component runbooks** — this guide covers the integration path. For deeper
> per-component detail, see:
> [`docs/release/bridge.md`](release/bridge.md) ·
> [`docs/release/evenhub.md`](release/evenhub.md) ·
> [`docs/release/foundry-module.md`](release/foundry-module.md) ·
> [`deploy/README.md`](../deploy/README.md)

---

## Overview — the 4-component stack

```
[ G2 glasses ]  ←BLE→  [ Even Realities App ]  ←HTTPS/WS→  [ Bridge (Node.js) ]  ←socket→  [ Foundry VTT ]
                             (phone WebView)                   ↑
                                                   plugin-host (static HTTPS)
                                                   serves the g2-app bundle
```

Four components, each deployed separately:

| Component | What it is | Deployment |
|-----------|-----------|------------|
| **Foundry module** (`evenfoundryvtt`) | Reads game state + pushes to bridge via `/internal/delta` | Install via Foundry manifest URL |
| **Bridge** (`@evf/bridge`) | Node.js Fastify service: REST + WS + auth | Docker Compose (homelab) |
| **Plugin host** (static) | Serves the built `g2-app/dist/` bundle | Docker Compose (Caddy) or any HTTPS static host |
| **G2 app** (`@evf/g2-app`) | Phone WebView plugin: HUD engine + wizard | Even Hub dev mode (personal) or portal (public) |

**Deployment model:** single-tenant Docker Compose homelab (Specs.md §11.5.3). The Even Hub
network whitelist is enforced at runtime — every `app.json` must list your exact HTTPS origins
with no wildcards (Specs.md §3.3, §3.7). This means **each self-hoster must build their own
`.ehpk`** with their own bridge + plugin-host origins baked in (see Step 3).

---

## Prerequisites

- **Docker + Compose v2** (ships with Docker Desktop or Docker Engine ≥20.10)
- **`openssl`** (for secret generation — usually pre-installed on Linux/macOS)
- **Node 24 LTS** + **`corepack`** enabled (`corepack enable pnpm`) — needed to build the g2-app
- **A publicly-resolvable domain + HTTPS** — or a Cloudflare Tunnel / Tailscale Funnel for
  homelab (no public IP needed). Both give a valid HTTPS hostname without port-forwarding.
  *LAN/dev alternative: skip HTTPS; use the Even Hub dev-mode QR path (Step 4a).*
- **FoundryVTT** ≥ v13.347 (v14 recommended) running a world with **dnd5e ≥ 5.3.3**

---

## Step 1 — Clone + configure `deploy/.env`

```bash
git clone https://github.com/Aiacos/EvenFoundryVTT.git
cd EvenFoundryVTT

cp deploy/.env.example deploy/.env
```

Open `deploy/.env` and fill in the required values — see
[`deploy/.env.example`](../deploy/.env.example) for the full contract:

```bash
# Required: 32-byte random secret (bridge refuses to start without this)
EVF_INTERNAL_SECRET=$(openssl rand -base64 32)

# CORS allow-list origin (= the plugin-host URL where g2-app will be served)
EVF_PLUGIN_HOST_URL=https://evf-plugin.yourdomain.net

# HTTPS hostnames (DNS A records → this host; ports 80+443 reachable)
# These become the app.json network whitelist after sync-app-whitelist.mjs
EVF_BRIDGE_HOST=evf-bridge.yourdomain.net
EVF_PLUGIN_HOST=evf-plugin.yourdomain.net
```

> **No public IP?** Use Cloudflare Tunnel (`cloudflared tunnel`) or Tailscale Funnel
> (`tailscale funnel 443`) to get a valid HTTPS hostname. Set that hostname as
> `EVF_BRIDGE_HOST` / `EVF_PLUGIN_HOST`.

> **LAN/dev only?** You can skip the HTTPS setup for now and use the Even Hub dev-mode QR
> path (Step 4a). In that case set `EVF_PLUGIN_HOST_URL=http://localhost:5173`.

---

## Step 2 — Boot the bridge + plugin host

### HTTPS deployment (Caddy auto-Let's-Encrypt — recommended)

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.https.yml up -d --build
```

This starts the **bridge** (port 8910 internally, exposed via Caddy) and **Caddy** (ports 80 +
443) which auto-provisions Let's Encrypt certificates for `EVF_BRIDGE_HOST` and
`EVF_PLUGIN_HOST`. The plugin-host static files are built and served by Caddy once the g2-app
`dist/` directory exists (build it in Step 3 first, then restart).

Health check:

```bash
curl https://<EVF_BRIDGE_HOST>/healthz
# → {"status":"ok"}
```

### LAN/dev alternative (no HTTPS, no Caddy)

```bash
docker compose up -d --build
```

This runs the bridge only on `http://localhost:8910`. See [`deploy/README.md`](../deploy/README.md)
for the full ops reference (endpoints, smoke test, dev-mode debug overrides).

---

## Step 3 — Build + pack the g2-app for YOUR origins

The app.json network whitelist is enforced at runtime by the Even Hub WebView — it must list
your exact HTTPS origins (no wildcards, Specs.md §3.3). The committed `app.json` ships
placeholder values (`REPLACE-WITH-YOUR-ORIGIN.example`); you must sync them with your real
origins before packing.

### 3a. Build the plugin bundle

```bash
corepack pnpm --filter @evf/g2-app build
# → packages/g2-app/dist/index.html  (and other assets)
```

### 3b. Sync the whitelist into app.json

```bash
node deploy/sync-app-whitelist.mjs
# Reads EVF_BRIDGE_HOST + EVF_PLUGIN_HOST from deploy/.env
# Writes https://<EVF_BRIDGE_HOST> + https://<EVF_PLUGIN_HOST> into
#   packages/g2-app/app.json → permissions[0].whitelist
# Exits 1 if the env vars are missing or still *.example.com
```

> **Do NOT commit the modified app.json** — it now contains your private origin hostnames.
> Restore to the placeholder state with `git checkout packages/g2-app/app.json` after packing.

### 3c. Pack the .ehpk

```bash
corepack pnpm --filter @evf/g2-app pack:ehpk
# Runs: vite build && npx --yes @evenrealities/evenhub-cli pack app.json dist -o evenfoundryvtt.ehpk
# → packages/g2-app/evenfoundryvtt.ehpk  (your personalized bundle)
```

The resulting `evenfoundryvtt.ehpk` contains the vite-built app + your origins in the
whitelist. **Do not commit this file** — it contains your private origins and is build output.

---

## Step 4 — Install on physical glasses

There are two separate paths. Choose based on your goal:

### Path A — Personal / dev testing (recommended, no expiry)

Run the Vite dev server and load it on the glasses via the Even Hub dev-mode QR.
**No portal, no review, no expiry, hot reload on every save.**

```bash
# Terminal 1: dev server (binds to 0.0.0.0 so the phone can reach it on the LAN)
corepack pnpm --filter @evf/g2-app dev
# → http://0.0.0.0:5173  (access from phone via http://<machine-LAN-IP>:5173)

# Terminal 2: print the QR for the Even app
corepack pnpm --filter @evf/g2-app dev:qr
# → QR code for http://<LAN-IP>:5173 — scan in the Even Realities App
```

Your phone must be on the **same LAN** as the dev machine. The plugin loads with hot reload —
every file save updates the glasses immediately. Verbatim Even Hub docs: *"Your app loads on
the glasses with hot reload support."*

See [`docs/release/evenhub.md`](release/evenhub.md) for details on the dev mode vs .ehpk
distinction and the "trial version expired" trap.

### Path B — Public distribution (manual portal upload, review-gated)

The Even Hub CLI (`login` / `init` / `qr` / `pack`) has **no `publish`/`submit`/`upload`
command** — this is confirmed against the live CLI 0.1.13 `--help` and the Even Hub
documentation (re-verified 2026-05-31, INV-2). Submission is a **manual upload to the Even
Hub developer portal**, followed by a review/approval gate.

Steps:
1. Build + sync + pack (Step 3 above) to produce `packages/g2-app/evenfoundryvtt.ehpk`.
2. Log in to the [Even Hub developer portal](https://hub.evenrealities.com).
3. Upload the `.ehpk`, complete the listing metadata, submit for review.
4. After approval the plugin is available in Even Hub for G2 users.

> **"Trial version expired" trap:** uploading an `.ehpk` as a portal trial is time-limited
> by Even Hub's portal policy. For ongoing personal testing always use **Path A (dev mode)**
> — it does not expire. If you must re-test via a portal trial, regenerate a fresh `.ehpk`
> and re-upload (a fresh upload resets the trial window). See
> [`docs/release/evenhub.md`](release/evenhub.md).

---

## Step 5 — Install + configure the Foundry module

### Install

In Foundry → **Setup** → **Add-on Modules** → **Install Module** → paste the manifest URL:

```
https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
```

Same URL works on **The Forge** (Bazaar → *+ Install Module from a Manifest*).
Foundry will auto-prompt to install `socketlib` and `midi-qol` (required dependencies).
Requires **dnd5e ≥ 5.3.3**.

See [`docs/release/foundry-module.md`](release/foundry-module.md) for the full distribution
runbook (GitHub Release workflow, re-publish, re-install).

### Configure the EVF Bridge

In Foundry → **Settings** → **Configure Settings** → open the **EVF Bridge Configuration**
dialog (listed under EvenFoundryVTT):

| Setting | Value |
|---------|-------|
| **Bridge URL** | Your bridge origin: `https://evf-bridge.yourdomain.net` |
| **Bridge Internal Secret** | The `EVF_INTERNAL_SECRET` from `deploy/.env` |

Click **Save**. The module now knows how to reach your bridge.

### Pair the player

The module registers a 24-hour bearer token for the player:

1. Open the **EVF Pair** dialog (Settings → EvenFoundryVTT → Pair).
2. Copy the displayed bearer token.
3. On the phone (in the Even Realities App → EvenFoundryVTT plugin wizard), paste the token
   into Step 2 of the wizard.

> **No QR scan path:** the Even Hub platform exposes no camera or QR-scan API to dev apps
> (`hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*). Pairing
> is paste-only. See `docs/release/foundry-module.md` for the full pairing flow.

---

## Step 6 — Pick your character + see the HUD

In the phone wizard, **Step 3** shows your available player characters from the Foundry world.
Select your PC. The wizard saves the actor ID and sends it to the bridge on WS connect.

On successful connection:

1. The bridge looks up the latest `character.delta` snapshot for your selected actor.
2. It pushes it to your WS session immediately on connect.
3. The G2 glasses HUD renders your PC: name, HP bar, AC, action economy, spell slots.

The HUD stays live as the game progresses — combat tracker updates, HP changes, and action
economy tick in real time via the `/internal/delta` push from the Foundry module.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bridge exits immediately | `EVF_INTERNAL_SECRET` missing or empty | Set it in `deploy/.env` (`openssl rand -base64 32`) |
| `/readyz` returns 503 | Secret missing from running container | Confirm `env_file: .env` in `docker-compose.yml` resolves |
| Foundry pushes fail (401) | Module secret ≠ bridge secret | Open EVF Bridge Configuration, re-enter `EVF_INTERNAL_SECRET` |
| Glasses show placeholder "Text" | Bridge not sending data on connect | Check bridge is reachable; verify `/v1/characters` returns your roster |
| "trial version expired" | Uploaded `.ehpk` portal trial expired | Switch to **Path A dev mode** (no expiry); re-upload a fresh `.ehpk` for portal |
| `sync-app-whitelist.mjs` exits 1 | `EVF_BRIDGE_HOST`/`EVF_PLUGIN_HOST` missing or `*.example.com` | Fill real hostnames in `deploy/.env` before running sync |
| app.json whitelist error at runtime | Whitelist not synced before pack | Run `node deploy/sync-app-whitelist.mjs` then `corepack pnpm --filter @evf/g2-app pack:ehpk` |

### Per-component runbooks

| Component | Runbook |
|-----------|---------|
| Bridge (Docker, ops endpoints, smoke test) | [`docs/release/bridge.md`](release/bridge.md) |
| G2 app (Even Hub CLI, dev mode, portal) | [`docs/release/evenhub.md`](release/evenhub.md) |
| Foundry module (GitHub Release, Forge install) | [`docs/release/foundry-module.md`](release/foundry-module.md) |
| Full test stack (Foundry-in-Docker) | [`deploy/README.md`](../deploy/README.md) |
