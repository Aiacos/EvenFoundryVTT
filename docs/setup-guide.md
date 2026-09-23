# Setup Guide — EvenFoundryVTT

How to get a D&D 5e character from Foundry onto the G2 glasses. There is **one** thing to
install, the Foundry module. It also serves the glasses app. You don't need a bridge,
Docker or a second server
([ADR-0012](architecture/0012-direct-foundry-streaming.md)).

**Canonical references:** [ADR-0012](architecture/0012-direct-foundry-streaming.md) ·
[`docs/design/g2-thirds-layout.md`](design/g2-thirds-layout.md) §Associazione e connessione
(mocks P01–P03, M09–M11) · [`packages/foundry-module/README.md`](../packages/foundry-module/README.md).

---

## 🎲 How it works in 30 seconds

```
GM browser (Foundry, module = projector) ──shows QR──▶ player's phone (Even Realities App)
        ▲                                                   │ loads https://<foundry>/modules/evenfoundryvtt/g2/index.html
        └──── Foundry server relays module.evenfoundryvtt ◀──┘ (same origin, AES-GCM sealed)
```

1. The GM opens **Pair G2 glasses** in Foundry and picks a player and a character.
2. The module creates a Foundry user **"&lt;Player&gt; (G2)"** and shows a QR (valid 5 min, single use).
3. The player scans the QR with the Even Realities App. The glasses app opens already connected.

---

## 🥽 Prerequisites

| Component | Required | Notes |
|---|---|---|
| **FoundryVTT** | v13.347+ (v14 verified) | Self-hosted or hosted. v12 is not supported (dnd5e Activity system). |
| **dnd5e system** | ≥ 5.3.3 | PHB 2014 and PHB 2024 both work (`core.modernRules`). |
| **midi-qol** | optional | Full attack → damage → save automation when active; vanilla `activity.use()` otherwise. |
| **Valid HTTPS** | required | Foundry must be reachable **from the phone** over a certificate the phone trusts (see below). |
| **A GM browser online** | required during play | The module in the GM client computes dnd5e data and executes actions. |
| **Even Realities G2 + R1** | current firmware | Paired to the phone with the standard Even setup. |
| **Even Realities App** | ≥ 2.2.9 | Needed for the long-press shortcuts menu ([firmware matrix](firmware-compatibility.md)). |

socketlib is **no longer needed**.

### 🔐 HTTPS reachable from the phone

The Even Realities App loads the glasses page from Foundry's own origin, and the phone
WebView **rejects self-signed certificates**. A plain `http://192.168.x.x:30000` LAN
address does not work. Pick one of these:

| Option | How | Notes |
|---|---|---|
| **Reverse proxy + Let's Encrypt** | Caddy, nginx or Traefik in front of Foundry on a public DNS name | Follow [foundryvtt.com/article/nginx](https://foundryvtt.com/article/nginx/). The proxy **must forward the WebSocket upgrade** (`Upgrade` / `Connection: upgrade` headers; Caddy does it by default). Set `proxySSL: true` and `proxyPort: 443` in Foundry's `options.json`. |
| **Tailscale** | `tailscale serve` / `tailscale cert` on the Foundry host | Valid `*.ts.net` certificate. The phone must be on the same tailnet. |
| **Foundry native TLS** | `sslCert` / `sslKey` in `options.json` ([foundryvtt.com/article/configuration](https://foundryvtt.com/article/configuration/)) | Use a real certificate (e.g. Let's Encrypt via DNS challenge), not a self-signed one. |

**routePrefix:** if Foundry runs under a path (`routePrefix: "foundry"` →
`https://host/foundry/`), you don't need to do anything extra. The QR URL includes the
prefix (`foundry.utils.getRoute`) and the g2-app build uses relative paths.

> **Open Foundry from the public URL when you pair.** The QR is built from the address in
> the GM's browser bar. If the GM is on `http://localhost:30000`, the QR points to
> `localhost` and the phone cannot open it.

---

## 📦 Install the module

1. **Foundry** → *Setup* → *Add-on Modules* → *Install Module* → Manifest URL:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

2. Launch the world and enable **EvenFoundryVTT** under *Manage Modules*.
3. Optional: install and enable **midi-qol** (the module lists it under `recommends`).

The release zip already contains the glasses app under `g2/`. Foundry serves it at
`https://<foundry>[/<prefix>]/modules/evenfoundryvtt/g2/index.html`.

---

## ⚙️ Pair the glasses (GM)

1. As GM: *Game Settings* → *Configure Settings* → *EvenFoundryVTT* → **Pair G2 glasses**
   (IT: **Associa occhiali G2**; menu key `pairG2`).
2. Pick the **Player** and the **Character**, then press **Generate new QR**.
3. The window (mock P01) shows:
   - the **QR**. It works once and expires after **5 minutes**. After that it is hidden
     and the credentials are rotated.
   - the **manual code** (16 characters, e.g. `7QK3-MX9P-2HRA-C4TE`) under the QR.
   - three checks: **valid HTTPS · module served · socket active**. All three must be ✓.
   - the **paired devices**, with their last contact and a **Revoke** button.
4. The module creates or refreshes the user **"&lt;Player&gt; (G2)"**: role Player, owner of
   that character only. Don't delete it by hand. Use **Revoke**.

> **The keys stay in this browser.** Device keys are stored only in the browser of the GM
> who paired (client-scoped setting). Pair from the browser the GM will use during play.

---

## 🕹️ Connect (player)

1. Open the **Even Realities App** and **scan the QR** shown in Foundry.
2. The app loads the glasses page. It saves the credentials, removes them from the URL,
   logs in as the "(G2)" user and says hello to the GM projector.
3. The glasses show **Connecting** (M10), then the thirds HUD (M01): character sheet on
   the left, pixel map in the centre, context on the right.
4. On the first connection the GM client **rotates** the password and key, so the QR
   you scanned stops working.

The phone screen shows the **Connection** page (mock P02): status, server, user,
character, GM, latency, language, map pixel size, *Follow my token*, *Auto Combat page*,
**Reconnect**, **Disconnect** and **Diagnostics**.

### Manual code fallback

Use this when the QR can't be scanned, or when the app opens without saved credentials
(mock P03):

1. On the phone, open `https://<foundry>[/<prefix>]/modules/evenfoundryvtt/g2/index.html`
   in the Even Realities App.
2. Pick the **"&lt;Player&gt; (G2)"** user. The list is read from the same Foundry server.
3. Type the **16-character code** shown under the QR (with or without dashes) → **Connect**.

The code follows the same rules as the QR: single use, valid for 5 minutes.

### Gestures

| Gesture (R1 or temple touchpad) | At the root | In lists |
|---|---|---|
| tap | opens **Actions** | confirms |
| swipe up / down | scrolls log / initiative | moves the `▶` cursor |
| double tap | **exits the app** | back one level |
| long press (extra) | shortcuts menu | shortcuts menu |

Long press is never the only way to reach a function.

---

## 🔐 Revoke or re-pair

- **Revoke:** in *Pair G2 glasses* → **Revoke** next to the device → confirm. The glasses
  receive a sealed `revoked` message and go back to the "not paired" screen (M09). Then
  the "(G2)" user is deleted and the key is forgotten.
- **Re-pair:** run the pairing again for the same player. The module refreshes the same
  "(G2)" user (it is tagged by player), creates a new key and shows a new QR.
- **On the phone:** *Diagnostics* → **Forget pairing** removes the local credentials.

---

## 🐞 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Glasses stuck on *Connecting*, phone says **"no GM connected"** | No GM browser is in the world, or the active GM is not the one who paired | Open the world as GM **in the browser that paired**. Keys live only there. If another GM is the active GM (`game.users.activeGM`), re-pair from that GM's browser. |
| Phone page doesn't load / blank after scanning | Self-signed or invalid certificate, or HTTP URL | Use a trusted certificate (Let's Encrypt, Tailscale, reverse proxy). The pair dialog must show ✓ **valid HTTPS**. |
| QR opens `localhost` or a LAN IP | The GM opened Foundry from a local address | Open Foundry from its public HTTPS URL, then press **Generate new QR**. |
| ✗ **module served** in the pair dialog | `g2/` missing from the module folder (dev build without `build:g2`) | Reinstall the release zip, or run `pnpm --filter @evf/foundry-module build:all`. |
| ✗ **socket active**, or connection drops after a few seconds | Proxy doesn't forward the WebSocket upgrade | Add the `Upgrade` / `Connection` headers (nginx) and check `routePrefix` matches the proxied path. |
| *"credentials rejected"*, back to the first-setup page | Pairing revoked, QR already used, or code expired | Ask the GM to **Generate new QR** and scan again. |
| *"app in background"* | The Even App went to the background (phone locked, app switched) | Nothing to do. The session reconnects when the app returns to the foreground. |
| Map column shows text glyphs (`▓▒░@`) | Two map frames in a row failed (weak BLE) | It recovers by itself once the link is stable. |
| Action fails with `forbidden_actor` / `actor_missing` | The character was deleted or ownership changed | Re-pair and choose the right character. |

For deeper diagnosis see the [runbook](runbook.md).

---

## 🧪 Developer setup

Commands verified against the workspace `package.json` files:

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build:all     # g2-app → packages/foundry-module/g2/, then tsup → dist/module.js
ln -s "$PWD/packages/foundry-module" "<FoundryData>/Data/modules/evenfoundryvtt"   # dev install
pnpm lint:ci && pnpm typecheck && pnpm test:coverage

# GO/NO-GO sideload check against your Foundry (see runbook)
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware
```

`packages/foundry-module/g2/` is build output and is git-ignored. Rebuild it after every
g2-app change (`pnpm --filter @evf/g2-app build`) and reload the phone page.

---

## 📚 See also

- [Runbook](runbook.md) — diagnosis, revoke, re-pair, the sideload harness.
- [ADR-0012](architecture/0012-direct-foundry-streaming.md) — why there is no bridge.
- [G2 thirds layout](design/g2-thirds-layout.md) — glasses, phone and Foundry mocks.
- [Firmware compatibility](firmware-compatibility.md) — SDK / Even App versions.
