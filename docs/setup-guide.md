# Setup Guide — EvenFoundryVTT

How to get a D&D 5e character from Foundry onto the G2 glasses. The GM installs **one**
Foundry module; each player installs the **FoundryVTT G2 HUD** app from Even Hub and
scans one QR. There is no GM setup, no extra Foundry user and no Foundry login on the
phone ([ADR-0019](architecture/0019-relay-pairing-player-projector.md)).

> **Coming from v0.12 (module ≤ 0.2.x)?** The glasses app no longer ships inside the
> module and the "(G2)" users are gone. Update the module, install **FoundryVTT G2 HUD**
> on the phone and connect every pair of glasses once more (below). You can delete the
> old "&lt;Player&gt; (G2)" users from *User Management*.

**Canonical references:** [ADR-0019](architecture/0019-relay-pairing-player-projector.md) ·
[`packages/relay/README.md`](../packages/relay/README.md) ·
[`docs/design/g2-sheet-ux.html`](design/g2-sheet-ux.html) (glasses screens S10–S12) ·
[`packages/foundry-module/README.md`](../packages/foundry-module/README.md) ·
[privacy](privacy.md).

---

## 🎲 How it works in 30 seconds

```
player's Foundry tab (module = projector) ⇄ wss://evf-relay.evf-relay.workers.dev ⇄ phone (FoundryVTT G2 HUD) ⇄ BLE ⇄ G2
                    └──────────── AES-256-GCM sealed end to end: the relay only forwards ciphertext ────────────┘
```

1. The player opens **Connect G2 glasses** (IT: **Collega occhiali G2**) in their own
   Foundry. The window shows a QR and a 16-character code right away.
2. The player scans it with the **FoundryVTT G2 HUD** app. The phone never logs into
   Foundry: it joins a private relay room with a key only the two ends know.
3. From then on **that Foundry tab is the projector**: it reads the character, combat,
   chat log and scene, runs the actions chosen on the glasses, and streams the HUD through
   the relay. The glasses reconnect by themselves whenever that browser has Foundry open.

---

## 🥽 Prerequisites

| Component | Required | Notes |
|---|---|---|
| **FoundryVTT** | v13.347+ (v14 verified) | Self-hosted (HTTP or HTTPS, LAN or public) or **The Forge**. v12 is not supported (dnd5e Activity system). |
| **dnd5e system** | ≥ 5.3.3 | PHB 2014 and PHB 2024 both work (`core.modernRules`). |
| **midi-qol** | optional | Full attack → damage → save automation when active; vanilla `activity.use()` otherwise. |
| **Relay reachable from the Foundry tab** | required | The browser that shows the QR must open `wss://evf-relay.evf-relay.workers.dev`. The pairing window checks it for you. |
| **The player's Foundry tab open** | required during play | That tab is the projector. A GM tab can stand in for a player without a device (below). |
| **Even Realities G2 + R1** | current firmware | Paired to the phone with the standard Even setup. |
| **Even Realities App** | ≥ 2.2.10 | Floor stamped by SDK 0.0.16 ([firmware matrix](firmware-compatibility.md)). |

You **don't** need a public HTTPS address, a reverse proxy, port forwarding, socketlib or
any GM enablement: the phone never talks to Foundry, only to the relay.

---

## 📦 Install the module (GM, once)

1. **Foundry** → *Setup* → *Add-on Modules* → *Install Module* → Manifest URL:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

   **The Forge:** *Bazaar* → *Install Module from a Manifest* → the same URL.
2. Launch the world and enable **EvenFoundryVTT** under *Manage Modules*.
3. Optional: install and enable **midi-qol** (the module lists it under `recommends`).

That's all the GM does. Nothing to enable per player.

## 📦 Install the glasses app (player, once)

On the phone, install **FoundryVTT G2 HUD** from Even Hub in the Even Realities App.
Until the app is listed in the store, the maintainer invites the table's players to the
**beta group**: accept the invite, then install it from Even Hub like any other app. The
installed app keeps running when the phone locks.

---

## 🕹️ Connect your glasses (player)

1. In **your own** Foundry, open **Connect G2 glasses** in the fewest clicks:
   - right-click **your name** in the *Players* list › **Connect G2 glasses**, or
   - press **Alt+G** (rebindable in *Configure Controls*), or
   - *Game Settings* › *Configure Settings* › *EvenFoundryVTT* › **Connect G2 glasses**.
2. The window opens ready: your character is preselected (the assigned one, else the first
   you own), the relay is checked and the **QR** plus a **16-character code**
   (e.g. `7QK3-MX9P-2HRA-C4TE`) are shown. Both expire after **5 minutes** and work once.
3. On the phone open **FoundryVTT G2 HUD** › **Scan QR** (IT: **Scansiona QR**) and take a
   photo with the QR filling most of the frame. No camera, or camera permission denied? Type
   the code (with or without dashes, any case) in the **Code** field — it also takes the whole
   pairing link, pasted.
4. The window switches to **Glasses connected · &lt;character&gt;** by itself, and the
   glasses show **Connecting** (S11), then the D&D-sheet HUD (S1): portrait, header (AC,
   HP, turn) and square map on top, ability page and context panel below.

   ![Glasses after pairing: exploration screen](design/img/sheet-explore.png)

**Keep that Foundry tab open while you play.** The pairing is stored in **this browser**:
next session, just open Foundry there and the glasses reconnect by themselves. On the first
connection the room and key rotate, so the QR you scanned stops working.

The phone shows the **Connection** page: status, relay, Foundry, character, latency,
language, map options, **Reconnect**, **Disconnect** and **Diagnostics**.

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

## 🕹️ Connect for a player without a device (GM)

For a player who has glasses but no computer at the table:

1. As GM, right-click **that player** in the *Players* list › **Connect G2 glasses** (their
   assigned character is preselected; the picker lists every character, so you can choose another).
2. The player scans the QR (or types the code) with **FoundryVTT G2 HUD**.
3. **Your** GM tab is now their projector: keep it open during play. The pairing lives in
   your browser, and actions still run only for that character.

---

## 🔐 Disconnect or reconnect

- **Disconnect:** open **Connect G2 glasses** in the browser that paired → list
  **Glasses connected to this browser** (status *online* / *waiting for the glasses* /
  *relay unreachable*) → **Disconnect** → confirm. The glasses receive a sealed `revoked`
  message and go back to the "not paired" screen (S10).
- **On the phone:** *Diagnostics* → **Forget pairing** removes the local credentials.
- **New browser, cleared browser data, other character, lost phone:** disconnect (if the old
  browser is still there) and connect again — a new QR, a new room and a new key.

---

## 🐞 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Pairing window: **"This browser cannot reach the relay `wss://…`"** (IT: *Questo browser non raggiunge il relay*) with **How to fix** | A corporate/school firewall, proxy or browser extension blocks `evf-relay.evf-relay.workers.dev`, or a Content-Security-Policy on your Foundry host forbids outbound WebSockets | Try another network or browser, allow `https://evf-relay.evf-relay.workers.dev` and `wss://evf-relay.evf-relay.workers.dev`, then **Try again**. Advanced: run your own relay and set **Relay (advanced)** in the module settings ([runbook](runbook.md#-relay-and-pages); works only with the QR opened in developer mode, because the store app reaches only the default relay). |
| Glasses/phone: **"Player's Foundry closed"** (IT: *Foundry del giocatore chiuso*) | The Foundry tab that paired these glasses is not open (closed, logged out, other computer) | Open Foundry in that browser. The glasses reconnect by themselves, nothing to scan. |
| Phone: **"relay not reachable"** | The phone has no internet, or the relay is down | Check the phone's connection. The app retries with backoff (1 → 30 s). |
| QR hidden, **"The QR expired unused"** | 5 minutes passed, or the QR was already used | **New QR**. |
| **Scan QR**: *No QR found in the photo* | QR too small or blurred in the photo (screen moiré) | Move closer so the QR fills the frame, hold still, or type the 16-character code under the QR. |
| **Scan QR**: *camera not available* / *no photo received* | Camera permission refused, or a sideloaded page without camera access | Type the code under the QR (or paste the whole link) in the **Code** field, or allow the camera for the Even Realities App in the phone settings. |
| Two Foundry tabs open, only one updates the glasses | By design: one tab per browser projects a device (Web Lock); the others wait | Nothing to do. Closing the projecting tab hands over to the next one. |
| Glasses stop when the phone locks | You opened the app by scanning the Foundry QR in **developer mode** (a sideloaded page) | Install **FoundryVTT G2 HUD** from Even Hub (beta or store): the installed app survives the lock. |
| Even App says **"trial version expired"** | A portal *trial* upload expired | Install the beta/store build, or re-scan the QR in developer mode ([release/evenhub.md](release/evenhub.md)). |
| **The Forge** game | — | Works as is, private or public, User Manager on or off: nothing to configure. |
| Map frozen, or schematic map instead of the scene art | Weak BLE (the map is ≤ 1 fps with 100 ms image pacing), or the scene art could not be loaded in the projector tab | Move the phone closer to the glasses. The schematic map is the planned fallback; the projector console logs `[EVF] map picture skipped (…)`. |
| Action fails with `forbidden_actor` / `actor_missing` | The character was deleted or you no longer own it | Connect again and pick the right character. |

For deeper diagnosis see the [runbook](runbook.md).

---

## 🧪 Developer and tester setup

**Try the app without Even Hub (developer mode).** Sign in once at
`https://hub.evenrealities.com/login` with your Even account (that turns the account into a
developer account; there is no toggle), force-quit and reopen the Even Realities App, then
**Even Hub → Scan QR** and scan the QR of the Foundry pairing window. It opens the hosted app
page (`https://aiacos.github.io/EvenFoundryVTT/app/`) already paired. A sideloaded page
**dies when the phone locks**: fine for development, not for a session — players use the
Even Hub app.

**Work on the code** (commands from the workspace `package.json` files):

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build          # tsup → packages/foundry-module/dist/module.js
ln -s "$PWD/packages/foundry-module" "<FoundryData>/Data/modules/evenfoundryvtt"   # dev install
pnpm lint:ci && pnpm typecheck && pnpm test:coverage

pnpm wizard                                      # demo HUD scenes on the LAN + QR, no Foundry needed
pnpm dev:glasses                                 # this checkout's app on the LAN against YOUR Foundry
RELAY_URL=wss://evf-relay.evf-relay.workers.dev pnpm --filter @evf/validation-harness validate:relay:skip-hardware
```

`pnpm dev:glasses` (= `scripts/wizard.sh --mode live`) serves the app on the LAN, checks the
relay and prints its QR: scan it in developer mode, then type in the app the code that
**Connect G2 glasses** (Alt+G) shows — or pass it with `--code XXXX-XXXX-XXXX-XXXX` and one
scan pairs. Add
`--local-relay` to run the relay locally with `wrangler dev` (only with an `http://` Foundry:
an HTTPS page cannot open `ws://` on the LAN). `bash scripts/wizard.sh --help` lists every flag.

---

## 📚 See also

- [Runbook](runbook.md) — diagnosis, relay and Pages operation, self-hosting a relay.
- [ADR-0019](architecture/0019-relay-pairing-player-projector.md) — why the phone never logs into Foundry.
- [Even Hub packaging](release/evenhub.md) — the `.ehpk`, beta group and store review.
- [Project wiki](wiki/Home.md) (Italian) — the same steps by audience.
- [G2 sheet UX](design/g2-sheet-ux.html) — glasses HUD design and screens.
- [Firmware compatibility](firmware-compatibility.md) — SDK / Even App versions.
- [Privacy](privacy.md) — what the relay and the app see.
