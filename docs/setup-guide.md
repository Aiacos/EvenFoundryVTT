# Setup Guide — EvenFoundryVTT

End-to-end installation walkthrough: Foundry module → Bridge service → Plugin host → Even Realities App
configuration → R1 ring pairing. Five steps, hardware + software prerequisites listed.

**Canonical reference:** `Specs.md` §3 (hardware), §5 (bridge), §3.7 (3-hop deployment), §11.5.4 (auth).

---

## Prerequisites

Before starting, confirm you have all of the following:

| Component | Required version | Notes |
|-----------|-----------------|-------|
| **FoundryVTT** | v13.347+ (verified v14) | Self-hosted or The Forge. v12 is **not supported** (Activity system requirement). |
| **dnd5e system** | ≥ 5.3.3 | Install/update from Foundry's system browser. PHB 2014 + PHB 2024 both supported via `core.modernRules`. |
| **pnpm** | 10.33.4 | `corepack enable && corepack prepare pnpm@10.33.4 --activate` |
| **Node.js** | 24.x LTS ("Krypton") | Pin via `.nvmrc`; `nvm use 24` or `fnm use`. |
| **Docker + Compose** | any recent stable | Used to run the Bridge service container. |
| **Even Realities G2** glasses | current firmware | Paired to your phone via the Even Realities App. |
| **Even Realities R1** ring | current firmware | Paired to G2 via Bluetooth (standard Even setup). |
| **Even Realities App** | latest (iOS or Android) | The phone app that loads the plugin WebView and relays BLE to G2. |

> **Network constraint (Even Hub §3.3):** the Even Realities App enforces an `app.json` domain
> whitelist. You must provide **origin-complete URLs** (scheme + host + port, no wildcards).
> Wildcard origins (e.g. `*` or `https://*`) are forbidden and will cause the plugin to fail
> loading. Keep both your plugin-host URL and your bridge URL minimal and exact.

---

## Step 1: Install the Foundry module

In Foundry → **Setup** → **Add-on Modules** → **Install Module** → paste this **Manifest URL**:

```
https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
```

Foundry will auto-install the required dependencies declared in `relationships.requires`:

- **socketlib** (latest, Foundry module — **not on npm**; Foundry handles the install prompt)
- **midi-qol** (optional but recommended; enables full attack → damage → save → effect flow)

dnd5e ≥ 5.3.3 must already be installed as the active game system.

> **No GitHub Release yet?** Install in dev mode: symlink `packages/foundry-module/` into
> `<Foundry Data>/modules/evenfoundryvtt/`, then run:
> ```bash
> pnpm --filter @evf/foundry-module build
> ```
> See `docs/release/foundry-module.md` for cutting a proper release.

After install, **enable** the `evenfoundryvtt` module in your World settings and **restart** Foundry.

---

## Step 2: Run the Bridge service

The Bridge is a Node.js (Fastify + ws) service that sits between the Even Realities App and your
Foundry instance. Run it via Docker Compose (recommended for homelab):

```bash
# Clone the repo if not already done
git clone https://github.com/Aiacos/EvenFoundryVTT.git
cd EvenFoundryVTT

# Copy and edit the env file
cp deploy/.env.example deploy/.env
# Edit deploy/.env — set FOUNDRY_WS_URL, BRIDGE_PORT, BEARER_REGISTRY_PATH

# Start the bridge (and optional nginx plugin host)
docker compose -f deploy/docker-compose.yml up -d bridge
```

Key environment variables (`deploy/.env`):

| Variable | Example | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `8910` | Port the bridge listens on (Fastify) |
| `FOUNDRY_WS_URL` | `ws://192.168.1.50:30000` | WebSocket URL to your running Foundry instance |
| `BEARER_REGISTRY_PATH` | `/data/bearers.json` | Persistent path for paired device tokens |
| `BRIDGE_LOG_LEVEL` | `info` | Pino log level (`trace` \| `debug` \| `info` \| `warn` \| `error`) |

Verify the bridge is running:

```bash
curl http://localhost:8910/healthz
# Expected: 200 OK with JSON { "status": "ok", "version": "..." }
```

> **CORS whitelist:** the bridge only allows the plugin-host origin. Set `PLUGIN_HOST_ORIGIN` in
> `deploy/.env` to the **exact** origin of your plugin host (e.g. `https://my-plugin-host.example.com`).
> Never use a wildcard — this would expose bearer tokens to arbitrary origins (Even Hub constraint §3.3,
> `CLAUDE.md §Constraints`).

---

## Step 3: Host the plugin (g2-app)

The plugin is a static web app (Vite bundle) served over HTTPS. The Even Realities App loads it in
a phone WebView.

```bash
# Build the production bundle
pnpm --filter @evf/g2-app build
# Output: packages/g2-app/dist/
```

Serve `packages/g2-app/dist/` via any static HTTPS host:

- **Caddy** (recommended for homelab auto-HTTPS via Let's Encrypt):
  ```bash
  docker compose -f deploy/docker-compose.yml up -d plugin-host
  ```
- **Cloudflare Pages / Vercel / any CDN**: drag-and-drop or CI-deploy the `dist/` folder.
- **Local dev only**: `vite preview` (HTTP, phone WebView requires HTTPS in production).

The plugin-host URL (e.g. `https://evf-plugin.example.com`) is what you paste into the
Even Realities App in Step 4.

> **`app.json` whitelist (mandatory):** before deploying, update `packages/g2-app/public/app.json`
> so the `domainWhiteList` array contains **only** the exact origin of your bridge (e.g.
> `"https://bridge.example.com:8910"`). No wildcards. See Specs.md §3.3.

---

## Step 4: Configure the Even Realities App

1. Open the **Even Realities App** on your phone.
2. Navigate to **Plugins** → tap the **+** button to add a new plugin.
3. Enter the **Plugin URL**: the HTTPS URL of your plugin host (Step 3).
4. In the plugin's **Settings** UI (loaded from the WebView):
   - **Bridge URL**: your bridge's HTTPS/WSS URL (e.g. `https://bridge.example.com:8910`)
   - Leave the **Bearer token** field empty for now — you will paste it during pairing in Step 5.
5. Save. The app will fetch the plugin and display the EvenFoundryVTT boot splash on the G2.

---

## Step 5: Pair G2 → Foundry (self-service, copy-and-paste)

Pairing is **self-service** — every user pairs their own device, no QR scan (the Even Hub
platform exposes no camera/QR-scan API to apps). Each user does this once per device:

1. In Foundry, open **Settings** → **Module Settings** → **EvenFoundryVTT** →
   **"Pair a G2 device"** (available to all users, not just the GM — a non-GM player can pair
   standalone without a GM online).
2. Foundry shows a **non-expiring (campaign-long) bearer token** as **copyable text**
   (Specs.md §11.5.4). Click **Reveal**/**Copy**.
3. On the phone, open the Even Realities App → EvenFoundryVTT plugin wizard and **paste** the
   token into the bearer-token field.
4. Save. The token is stored securely on the phone.
5. The G2 boot splash should advance past `[ ⟳ ] Bridge` to `[ ✓ ] Foundry sync` and then load
   your character's HUD.

> **Token lifetime:** the bearer token is **non-expiring (campaign-long)** — it never times out
> mid-session. You only need to re-pair (re-copy and re-paste) if you explicitly revoke the
> token via the procedure in `docs/runbook.md §Revoke a bearer token`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| *"Failed to fetch package manifest"* | No GitHub Release published yet | Install in dev mode (symlink + build, see Step 1 note). |
| *WebSocket handshake fails* | Bridge bearer mismatch or wrong CORS origin | Check `BEARER_REGISTRY_PATH` is writable; check `PLUGIN_HOST_ORIGIN` matches your plugin-host URL exactly (no trailing slash). |
| *`⚠ SYNC LOST` persists after pairing* | Bridge unreachable from phone's network | Confirm bridge URL is accessible from the phone (not `localhost` — use the homelab LAN IP or public URL). See `docs/runbook.md`. |
| *MidiQOL auto-fast-forward off* | MidiQOL Workflow setting not configured | Foundry → Settings → MidiQOL → Workflow → "Auto fast-forward" → enable. Required for full attack → damage → effect flow. |
| *G2 shows blank screen after boot* | No character linked to token | Ensure the logged-in Foundry player owns at least one Actor token in the active scene. |
| *Even App WebView shows "Not allowed"* | Plugin URL not in `app.json` whitelist | Re-check that `domainWhiteList` in `packages/g2-app/public/app.json` contains the exact bridge origin (no wildcards). Rebuild + redeploy. |
| *Bridge `/healthz` returns 503* | Bridge not ready (Foundry WS not connected) | Check `/readyz` for readiness; confirm `FOUNDRY_WS_URL` is reachable from inside the Docker container. |

---

## See also

- `docs/runbook.md` — day-to-day operations, bearer revoke, metrics.
- `docs/firmware-compatibility.md` — Even Hub SDK and hardware compatibility matrix.
- `Specs.md §3` — hardware constraints canonical (G2 display, R1 ring, BLE, audio).
- `Specs.md §3.7` — 3-hop deployment architecture.
- `Specs.md §11.5.4` — bearer auth + self-service copy-and-paste pairing protocol.
