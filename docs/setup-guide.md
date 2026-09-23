# Setup Guide — EvenFoundryVTT

How to get a D&D 5e character from Foundry onto the G2 glasses. There is **one** thing to
install, the Foundry module. It also serves the glasses app. You don't need a bridge,
Docker or a second server
([ADR-0016](architecture/0016-direct-foundry-streaming.md)). Glasses belong to the
players: the GM enables them once, then each player pairs from their own Foundry
([ADR-0017](architecture/0017-player-owned-glasses-hybrid-projector.md)).

> **Coming from the bridge era (module ≤ v0.1.55)?** Stop and remove the `evf-bridge`
> container, update the module, and re-pair every pair of glasses. Bearer tokens and the
> bridge URL no longer exist.

**Canonical references:** [ADR-0016](architecture/0016-direct-foundry-streaming.md) ·
[ADR-0017](architecture/0017-player-owned-glasses-hybrid-projector.md) ·
[`docs/design/g2-sheet-ux.html`](design/g2-sheet-ux.html) (glasses screens S10–S12) ·
[`docs/design/g2-thirds-layout.md`](design/g2-thirds-layout.md) §Associazione e connessione
(pairing flow, phone/Foundry mocks P01–P03) · [`packages/foundry-module/README.md`](../packages/foundry-module/README.md).

---

## 🎲 How it works in 30 seconds

```
player's (or GM's) browser (Foundry, module = projector) ──shows QR──▶ player's phone (Even Realities App)
        ▲                                                   │ loads https://<foundry>/modules/evenfoundryvtt/g2/index.html
        └──── Foundry server relays module.evenfoundryvtt ◀──┘ (same origin, AES-GCM sealed)
```

1. **Once**, the GM presses **Enable glasses for players**: the module creates a Foundry
   user **"&lt;Player&gt; (G2)"** per player and seals its password for that player's
   public key (ECDH P-256).
2. The player opens **Pair my glasses** in their own Foundry, picks a character and gets a
   QR (valid 5 min, single use). The GM can also pair on a player's behalf.
3. The player scans the QR with the Even Realities App. The glasses app opens already
   connected. While the player's Foundry is open, **their client is the projector**
   (actions run as that player); otherwise an online GM holding the device key takes over.

---

## 🥽 Prerequisites

| Component | Required | Notes |
|---|---|---|
| **FoundryVTT** | v13.347+ (v14 verified) | Self-hosted or hosted. v12 is not supported (dnd5e Activity system). |
| **dnd5e system** | ≥ 5.3.3 | PHB 2014 and PHB 2024 both work (`core.modernRules`). |
| **midi-qol** | optional | Full attack → damage → save automation when active; vanilla `activity.use()` otherwise. |
| **Valid HTTPS** | required | Foundry must be reachable **from the phone** over a certificate the phone trusts (see below). |
| **A projector online** | required during play | The player's own Foundry client, or else a GM browser holding the device key, computes dnd5e data and executes actions. |
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

## ⚙️ Enable the players (GM, once)

As GM: *Game Settings* → *Configure Settings* → *EvenFoundryVTT* → **Pair G2 glasses**
(IT: **Associa occhiali G2**; menu key `pairG2`) → section *Players' glasses* →
**Enable glasses for players** (or **Enable** next to one player). For each player the
module creates the user **"&lt;Player&gt; (G2)"** (role Player, ownership mirrored from the
player) with a random password sealed for the player's public key. **Regenerate password**
(e.g. after a lost phone) forces that player to pair again. A player who has never opened
the world with the module active has no public key yet: pair on their behalf (below).

## 🕹️ Pair my glasses (player)

1. In **your own** Foundry: *Configure Settings* → *EvenFoundryVTT* → **Pair my glasses**,
   or right-click your own name in the *Players* list. The entry appears once the GM has
   enabled you.
2. Pick the character → **Generate QR**. Your browser creates the device key, seals it for
   every GM (so a GM can take over when you are offline) and shows the QR.
3. Scan it (next section).

## ⚙️ Pair on a player's behalf (GM)

For players who don't have Foundry open.

1. As GM: **Pair G2 glasses** from *Configure Settings* → *EvenFoundryVTT*, or right-click a
   player in the *Players* list → **Pair G2 glasses** (player preselected).
2. Pick the **Player** and the **Character**, then press **Generate new QR**.
3. The window (mock P01) shows:
   - the **QR**. It works once and expires after **5 minutes**. After that it is hidden
     and the credentials are rotated.
   - the **manual code** (16 characters, e.g. `7QK3-MX9P-2HRA-C4TE`) under the QR.
   - three checks: **valid HTTPS · module served · socket active**. All three must be ✓.
   - the **paired devices**, with their last contact and a **Revoke** button.
4. The module creates or refreshes the user **"&lt;Player&gt; (G2)"**: role Player, owner of
   that character only. Don't delete it by hand. Use **Revoke**.

> **Where the keys live.** With the GM-direct flow the device key is stored in the browser
> of the GM who paired (client-scoped setting). With self-service pairing the player's
> browser seals the key for every GM's public key, so any GM browser can be the fallback.

---

## 🕹️ Connect (player)

1. Open the **Even Realities App** and **scan the QR** shown in Foundry.
2. The app loads the glasses page. It saves the credentials, removes them from the URL,
   logs in as the "(G2)" user and says hello to the projector.
3. The glasses show **Connecting** (S11), then the D&D-sheet HUD (S1): portrait, header
   (AC, HP, turn) and square map on top, ability page and context panel below.

   ![Glasses after pairing: exploration screen](design/img/sheet-explore.png)
4. On the first connection the projector **rotates** the device key (and, when a GM
   answers, the password), so the QR you scanned stops working.

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
| double tap | **exits the app** (`shutDownPageContainer(1)`) | back one level |
| long press (extra) | shortcuts menu | shortcuts menu |

Long press is never the only way to reach a function. The gesture model is
[ADR-0012](architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md) (Amendment 2:
the menu opens on tap from the base view).

---

## 🔐 Revoke or re-pair

- **Revoke:** in *Pair G2 glasses* → **Revoke** next to the device → confirm. The glasses
  receive a sealed `revoked` message and go back to the "not paired" screen (S10). Then
  the "(G2)" user is deleted and the key is forgotten.
- **Re-pair:** the player presses **Pair my glasses** again, or the GM runs the pairing
  again for the same player. The module refreshes the same
  "(G2)" user (it is tagged by player), creates a new key and shows a new QR.
- **On the phone:** *Diagnostics* → **Forget pairing** removes the local credentials.

---

## 🐞 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Glasses stuck on *Connecting*, phone says **"no GM connected"** | No projector answered within 8 s: the player's Foundry is closed **and** no online GM holds the device key | Open Foundry as the player, or have a GM join. For GM-direct pairings the key lives only in the browser that paired: open the world there, or re-pair. |
| Even App says **"trial version expired"** | You are running a `.ehpk` uploaded to the Even Hub portal as a trial; trial uploads expire | Use the QR (pairing or `evenhub qr`), which never expires. See [release/evenhub.md](release/evenhub.md). |
| Phone page doesn't load / blank after scanning | Self-signed or invalid certificate, or HTTP URL | Use a trusted certificate (Let's Encrypt, Tailscale, reverse proxy). The pair dialog must show ✓ **valid HTTPS**. |
| QR opens `localhost` or a LAN IP | The GM opened Foundry from a local address | Open Foundry from its public HTTPS URL, then press **Generate new QR**. |
| ✗ **module served** in the pair dialog | `g2/` missing from the module folder (dev build without `build:g2`) | Reinstall the release zip, or run `pnpm --filter @evf/foundry-module build:all`. |
| ✗ **socket active**, or connection drops after a few seconds | Proxy doesn't forward the WebSocket upgrade | Add the `Upgrade` / `Connection` headers (nginx) and check `routePrefix` matches the proxied path. |
| *"credentials rejected"*, back to the first-setup page | Pairing revoked, QR already used, or code expired | Ask the GM to **Generate new QR** and scan again. |
| *"app in background"* | The Even App went to the background (phone locked, app switched) | Nothing to do. The session reconnects when the app returns to the foreground. |
| Map frozen, or schematic map instead of the scene art | Weak BLE (the map is ≤ 1 fps with 100 ms image pacing), or the scene has no background image | Move the phone closer to the glasses. The schematic map is the planned fallback. |
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
- [ADR-0016](architecture/0016-direct-foundry-streaming.md) — why there is no bridge.
- [ADR-0017](architecture/0017-player-owned-glasses-hybrid-projector.md) — player-owned glasses and the hybrid projector.
- [Project wiki](wiki/Home.md) (Italian) — the same steps by audience.
- [G2 sheet UX](design/g2-sheet-ux.html) — glasses HUD design and screens.
- [G2 thirds layout](design/g2-thirds-layout.md) — superseded glasses layout; pairing flow and phone/Foundry mocks P01–P03 still current.
- [Firmware compatibility](firmware-compatibility.md) — SDK / Even App versions.
