# Runbook — EvenFoundryVTT (relay pairing)

What to check when the glasses won't connect or stop updating, and how to operate the
shared pieces (relay, GitHub Pages, Even Hub build). Since ADR-0019 the phone never talks
to Foundry ([ADR-0019](architecture/0019-relay-pairing-player-projector.md)). Four pieces
can fail:

1. **the glasses app**: **FoundryVTT G2 HUD** in the Even Realities App WebView (Even Hub
   install, or the GitHub Pages page `/app/` in developer mode).
2. **the relay**: `wss://evf-relay.evf-relay.workers.dev`, a Cloudflare Worker with one Durable
   Object per room ([`packages/relay`](../packages/relay/README.md)). It forwards sealed
   frames and stores nothing.
3. **the projector**: the `evenfoundryvtt` module in the Foundry tab that showed the QR (the
   player's, or a GM's for a player without a device). It reads dnd5e data, runs every
   action through `dispatchTool` and streams the HUD.
4. **the network path of the projector tab** to the relay (firewall, proxy, CSP).

Upgrading from v0.12 (module ≤ 0.2.x): the "(G2)" users, GM enablement and the
Foundry-served `g2/` page are gone. Every pair of glasses must be connected once more
([setup guide](setup-guide.md)).

---

## 🏗️ What talks to what

```
[G2] ⇄ BLE ⇄ [Even App WebView: FoundryVTT G2 HUD]
                    │ wss://evf-relay.evf-relay.workers.dev/r/<room>?role=glasses
                    ▼
             [relay: Worker + Durable Object "room"] ── opaque AES-256-GCM frames, nothing stored
                    ▲
                    │ wss://…/r/<room>?role=projector
             [projector: the Foundry tab that paired (player, or GM for a player without a device)]
```

| Step | Who | Failure shows up as |
|---|---|---|
| Relay check | pairing window → `GET /health` | window: *This browser cannot reach the relay* + **How to fix** |
| Pairing | QR / 16-char code → room + key | phone: *That is not an EvenFoundryVTT pairing QR* / *Invalid code* |
| Room join | both ends open `/r/<room>` | phone: *relay not reachable*, retry with backoff 1 → 30 s |
| `peer-up` → `hello` → `welcome` | projector tab present in the room | glasses: *Player's Foundry closed* (`no-projector`), link kept open |
| Live updates | projector hooks → sealed pushes | stale sheet/map; the phone page goes offline (S12) |

---

## 🐞 Diagnose from the phone

- **Status line:** *Connected* / *Connecting…* / *Offline*, with the cause:
  - *the Foundry tab that paired these glasses is closed* (HUD: *Player's Foundry closed*):
    open Foundry in that browser; it reconnects by itself, no countdown.
  - *relay not reachable*: the phone has no internet or the relay is down (check
    [health](#-relay-and-pages)).
  - *app in background*: expected; the page reconnects on foreground re-entry.
- **Relay / Foundry / Character / GM:** confirms the relay origin in use, the Foundry user
  whose tab projects, the paired character and the world's GM.
- **Latency:** ping → pong through the relay and the projector.
- **Diagnostics ▸** (IT: *Diagnostica*): module version, recent errors (newest first), the
  debug log, and **Forget pairing**.
- **Reconnect** reopens the relay socket. **Disconnect** stops the session and keeps the
  credentials.

---

## 🐞 Diagnose from Foundry (projector tab)

### Pairing window

**Connect G2 glasses** (Players list right-click, **Alt+G**, or *Configure Settings* ›
*EvenFoundryVTT*):

- **Relay:** checked on open. *This browser cannot reach the relay `<url>`* means the tab
  cannot open the relay (firewall, proxy, extension, CSP). **Try again** re-checks.
- **Glasses connected to this browser:** each pairing with its character, status
  (*online* · *waiting for the glasses* · *relay unreachable*), last contact and
  **Disconnect**. Pairings live in a hidden client-scope setting of **this browser**: another
  browser or computer doesn't see them.

### Browser console (F12 on the projector tab)

| Message | Meaning |
|---|---|
| `[EVF] relay <url> unreachable: …` | The relay health check failed from this tab. |
| `[EVF] relay: another projector took over this device — standing by` | A newer projector socket joined the same room (another browser with the same pairing). This tab stops reconnecting. |
| `[EVF] projector: rejected a frame for <device> (…)` | Wrong or old key (an old QR, a stale pairing). Connect again. |
| `[EVF] projector: malformed message for <device>` | Protocol mismatch: update the module and the app so both come from the same release. |
| `[EVF] projector lock for <device> failed` | Web Locks error; the tab could not become the projector. Reload it. |
| `[EVF] map picture skipped (<src>): …` | Scene art could not be loaded or downsized in the tab (CORS, missing file). The glasses fall back to the schematic map. |
| `[EVF] projector: failed to push to a G2 device` | Send failed; usually transient. |
| `[EVF] could not notify <device> of the revocation` | The glasses were offline during **Disconnect**; the pairing is forgotten anyway. |

Only **one tab per browser** projects a device (Web Lock); other tabs of the same browser
wait and take over when it closes.

### Audit log

Every action that runs through `dispatchTool` (attack, cast, use item, end turn…) writes
a GM-only hidden chat message flagged `flags.evf.audit`
([ADR-0011](architecture/0011-foundry-write-path-single-workflow-origin.md)):

```js
game.messages.contents
  .filter((m) => m.flags?.evf?.audit)
  .slice(-20)
  .forEach((m) => console.log(m.flags.evf.audit));
```

Each entry holds `tool`, `payload`, `idempotencyKey` (the request `rid`), `actorId`,
`result`, `timestamp` and `bearer_id`. `bearer_id` is a hash of the device principal
`g2:<deviceId>`, never a secret.

---

## 🚀 Relay and Pages

Operator tasks for the shared infrastructure. The production relay origin is
`DEFAULT_RELAY_URL` in `packages/shared-protocol/src/direct/relay.ts`
(`wss://evf-relay.evf-relay.workers.dev`), and it must match the `.ehpk` whitelist in
`packages/g2-app/app.json` (CI Gate 10, `scripts/check-relay-origin.mjs`).

### One-time setup (maintainer)

1. **Cloudflare:** the project's account uses the workers.dev subdomain **`evf-relay`** (first
   deploy 2026-09-26 with `npx wrangler login` + `npx wrangler deploy` in `packages/relay`). If
   the relay ever moves, change `DEFAULT_RELAY_URL` **and** both whitelist entries in
   `packages/g2-app/app.json` in the same commit (CI Gate 10 checks they match).
2. **Secrets:** create an API token (template *Edit Cloudflare Workers*) and add the repo
   secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. **Deploy:** *Actions → Relay Deploy → Run workflow* (`.github/workflows/relay-deploy.yml`;
   it also runs on every merge to `main` touching `packages/relay/`). Without the secrets the
   job tests the relay and only warns. With them it runs `wrangler deploy` and checks
   `/health` of the production origin.
4. **GitHub Pages:** *Settings › Pages › Build and deployment › Source* = **GitHub Actions**.
   `.github/workflows/pages.yml` then publishes `docs/` plus the glasses app under `/app/`
   (`https://aiacos.github.io/EvenFoundryVTT/app/`, the page the pairing QR opens) and the
   privacy page (`…/privacy.html`) on every merge to `main`.

### Verify

```bash
curl https://evf-relay.evf-relay.workers.dev/health            # → ok
RELAY_URL=wss://evf-relay.evf-relay.workers.dev pnpm --filter @evf/validation-harness validate:relay:skip-hardware
curl -sI https://aiacos.github.io/EvenFoundryVTT/app/ | head -1   # → HTTP/2 200
```

`validate:relay` checks health, CORS, a room round-trip (with RTT) and, informationally, the 1 MiB
frame cap (exit `0` GO · `1` NO-GO · `2` skipped · `3` usage error). The full run (`validate:relay`, needs a TTY, phone, G2) adds the
manual checklist **G1** (relay reachable from a Forge v14 private game tab and from
self-hosted v13/v14) and **G2** (store/private-build whitelist, camera QR decode on iOS and
Android, credentials survive app kill + 5-minute lock). Evidence goes to `docs/perf/phase-0/`.

### Quota monitoring

The relay runs on the Cloudflare **free plan**: 100 000 requests/day; outgoing WebSocket
messages are free, incoming ones count 20 : 1 as requests. Idle rooms cost nothing
(WebSocket Hibernation). Watch *Cloudflare dashboard → Workers & Pages → evf-relay →
Metrics* (requests, errors, Durable Object usage) and log the measured requests per session
as gate **G3**. Hitting the daily limit shows as *relay not reachable* for everyone until the
daily reset: move to the paid plan or ask heavy tables to self-host.

### Self-hosting a relay

```bash
pnpm --filter @evf/relay dev                                   # wrangler dev → http://localhost:8787
CLOUDFLARE_API_TOKEN=… pnpm --filter @evf/relay deploy          # → https://evf-relay.<your-subdomain>.workers.dev
```

Then set **Relay (advanced)** (`relayUrl`, client scope) in the module settings of the
projector browser to `wss://…` and reload. The QR carries the override to the glasses, so
**pair with the QR, not the code** (the code always means the default relay). A self-hosted
relay works only with the **sideloaded** app (developer mode → Scan QR, or `pnpm dev:glasses`):
the Even Hub build whitelists only the default relay. An `https://` Foundry page cannot open
`ws://`; use `wss://` or an `http://` Foundry for a LAN relay.

---

## 🔐 Disconnect

1. In the browser that paired: **Connect G2 glasses** → **Disconnect** next to the glasses →
   confirm.
2. The module sends a sealed `{t:'revoked'}` and forgets the pairing. The glasses go back to
   the "not paired" screen (S10).
3. If the glasses were offline, the console logs `could not notify … of the revocation`. The
   pairing is forgotten anyway; the glasses show *Player's Foundry closed* until the player
   uses **Forget pairing** or connects again.

Lost phone: disconnect right away. The relay room dies with the key; nothing else to revoke.

## 🔐 Connect again

Connect again when you changed browser or computer, cleared browser data, changed the
character, or the glasses stay on *Player's Foundry closed* with the tab open (the pairing is
missing in this browser). Open **Connect G2 glasses** in the browser that will project during
play and scan the new QR. If the phone is stuck on old credentials, use *Diagnostics* →
**Forget pairing** first.

---

## 🐞 Common errors and recovery

| Symptom | Diagnosis | Recovery |
|---|---|---|
| Pairing window: *cannot reach the relay* | Firewall, proxy, extension or CSP blocks `evf-relay.evf-relay.workers.dev`; or the relay is down | `curl https://evf-relay.evf-relay.workers.dev/health` from that network. Allow the origin, change network, or self-host a relay (above). |
| *Player's Foundry closed* although Foundry is open | Open in a different browser/profile than the one that paired, or the tab is suspended | Use the pairing browser, bring the tab to the front, or connect again from this browser. |
| Glasses stop on phone lock | App sideloaded from the QR in developer mode | Install **FoundryVTT G2 HUD** from Even Hub (beta/store). |
| Even App says *"trial version expired"* | A portal trial upload expired | Beta build or re-scan in developer mode; see [release/evenhub.md](release/evenhub.md). |
| Relay Deploy green but `/health` fails | Secrets missing (job warned and skipped) or subdomain ≠ `evf-relay` | Add the secrets; align `DEFAULT_RELAY_URL` + `app.json` with the real subdomain. |
| `/app/` returns 404 | Pages source not set to GitHub Actions, or `pages.yml` not run yet | Set the source, then *Actions → Pages → Run workflow*. |
| White glasses with a modified build; fine in the simulator | Image tiles off the 2 × 2 grid of 288 × 144: the real host rejects `rebuildPageContainer` | Keep images on (0,0) (288,0) (0,144) (288,144) ([firmware matrix](firmware-compatibility.md)). |
| Sheet updates, map frozen or schematic | BLE throughput low (map ≤ 1 fps, 100 ms pacing), or scene art not loadable in the tab | Move the phone closer; check `[EVF] map picture skipped` in the console. |
| Actions return `forbidden_actor` / `actor_missing` | Wrong or deleted character | Connect again with an existing character you own. |
| Attack posts a card but no rolls | midi-qol not active: vanilla `activity.use()` only posts the card | Enable midi-qol for full automation. |

---

## 📚 See also

- [Setup guide](setup-guide.md) · [Firmware compatibility](firmware-compatibility.md) · [Privacy](privacy.md)
- [ADR-0019](architecture/0019-relay-pairing-player-projector.md) · [ADR-0011](architecture/0011-foundry-write-path-single-workflow-origin.md)
- [`packages/relay/README.md`](../packages/relay/README.md) — relay wire contract
- [Even Hub packaging](release/evenhub.md) · [Module release](release/foundry-module.md)
- [G2 sheet UX](design/g2-sheet-ux.html) — S10 not paired · S11 connecting · S12 offline ([screenshots](design/img/))
- [`packages/foundry-module/README.md`](../packages/foundry-module/README.md) — security model
