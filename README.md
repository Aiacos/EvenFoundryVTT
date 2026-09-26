# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: v0.13.0](https://img.shields.io/badge/status-v0.13.0%20relay%20pairing-brightgreen)](#-status)
[![spec: v0.13.0](https://img.shields.io/badge/spec-v0.13.0-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#%EF%B8%8F-license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)
[![Even Hub SDK: 0.0.16](https://img.shields.io/badge/even__hub__sdk-0.0.16-lightgrey)](https://hub.evenrealities.com/docs)

---

## 💡 In one sentence

**EvenFoundryVTT streams your D&D character from your own Foundry tab to the G2 glasses** — no GM step, no extra Foundry user, no password on the phone: open **Connect G2 glasses** in Foundry, scan the QR with the **FoundryVTT G2 HUD** app, and a **D&D-sheet HUD** — portrait, AC shield, HP box, ability scores, a square tactical map — stays in your field of view while one context panel follows the action ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)).

## 📦 Installation

There are two pieces: the **Foundry module** (for everyone at the table) and the **glasses app** (for each player with G2 glasses).

1. **Foundry module** → *Setup* → *Add-on Modules* → *Install Module* → Manifest URL:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

   Same URL works on **The Forge** (Bazaar → *+ Install Module from a Manifest*). Requires Foundry ≥ v13.347 (v14 verified) and dnd5e ≥ 5.3.3; `midi-qol` is optional (full attack → damage → save automation when present). Enable the module in your world — nothing else to configure: no GM enablement, no users to create.
2. **Glasses app — FoundryVTT G2 HUD**, one bundle, three ways to load it:
   - **Even Hub package** (players): install **FoundryVTT G2 HUD** from Even Hub — through the maintainer's **beta group** until the store listing is approved. The installed app survives the phone lock; this is the path for real play.
   - **GitHub Pages** (developer-mode phones): the pairing QR opens `https://aiacos.github.io/EvenFoundryVTT/app/` when scanned with the Even Realities App › *Scan QR* in Developer Mode (a sideloaded page stops when the phone locks — a developer tool).
   - **Vite dev on the LAN** (contributors): `pnpm dev:glasses` — see [Try it on the glasses](#-try-it-on-the-glasses).

**Requirements:** the phone never talks to your Foundry, so Foundry needs **no public HTTPS** (an `http://` LAN Foundry works) and there is no Forge setting to change — self-hosted and The Forge (private games too), Foundry v13 and v14. The player's Foundry tab and the glasses app must both reach the relay `wss://evf-relay.evf-relay.workers.dev`; the pairing window checks it and shows «Relay ✗» with a fix link if it is blocked.

> **Upgrading from v0.2.x (ADR-0016/0017)?** Pairings made before v0.13.0 must be redone once: open **Connect G2 glasses** and scan the new QR. The old «&lt;Player&gt; (G2)» users are no longer used — the GM may delete them. The glasses app no longer ships inside the module zip.
>
> **Upgrading from v0.1.x (bridge era, ≤ `v0.1.55`)?** Also remove the `evf-bridge` container / Docker Compose stack and the static G2 app host.

### Releases and the Even Hub package

Each GitHub Release (tag `vX.Y.Z`, cut by `scripts/release-tag.mjs` → `foundry-module-release.yml`) ships `module.json` + `evenfoundryvtt.zip` plus the Even Hub **`.ehpk`** of the glasses app. `pages.yml` publishes the same app build at `/app/` on GitHub Pages; `relay-deploy.yml` deploys the relay (`packages/relay`). Full guides: [`docs/release/foundry-module.md`](docs/release/foundry-module.md) · [`docs/release/evenhub.md`](docs/release/evenhub.md) · wiki [Release](https://github.com/Aiacos/EvenFoundryVTT/wiki/Release). Don't hand out a portal **trial upload**: those expire; players get the app through the Even Hub beta group, then the store (a listing needs a manual portal submission — the Even Hub CLI has no submit command). Privacy policy: [`docs/privacy.md`](docs/privacy.md).

## 🕹️ Usage

| Who | Where | What |
|---|---|---|
| Player | own Foundry → *Players* list → right-click **your own name** → **Connect G2 glasses** (or **Alt+G**, or *Configure Settings* → *EvenFoundryVTT*) | opening the window **is** pairing: your character is preselected (assigned, else first owned), the relay is checked, a QR + 16-character code appear at once (valid 5 min, single use) |
| Player | **FoundryVTT G2 HUD** on the phone → **Scan QR** (or **Enter code**) | the glasses connect to your Foundry tab; the window switches to «Glasses connected · &lt;character&gt;» by itself |
| GM (optional) | *Players* list → right-click **any player** → **Connect G2 glasses** | pairs glasses for a player without a device of their own; the GM's tab then projects for them |
| Player | R1 ring / temple touchpad | tap = actions · swipe = move cursor · double-tap = back (exit at root) — see [Controls](#-controls--r1-ring--g2-touchpad) |

**Your Foundry tab is the projector:** the tab that showed the QR reads your character, sends the scene art and runs your actions as you ([ADR-0011](docs/architecture/0011-foundry-write-path-single-workflow-origin.md)). The pairing is stored in **this browser** and reconnects by itself whenever it has Foundry open; the window lists «Glasses connected to this browser» with their status (online · waiting for the glasses · relay unreachable) and a **Disconnect** button. If you close Foundry the glasses say «Player's Foundry closed» and come back on their own when the tab reopens. Step-by-step guides (Italian): **[project wiki](https://github.com/Aiacos/EvenFoundryVTT/wiki)**.

## 🕹️ Controls — R1 ring / G2 touchpad

Four gestures drive everything (canonical model: [ADR-0012](docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md), Amendment 2 — the menu opens on **tap**; implemented by [ADR-0018](docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md)). All input lands on the context panel (zone E); the other zones update by themselves.

| Physical gesture | SDK event | At the base view | In a list (actions, targets, spells, …) |
|---|---|---|---|
| **Press** (tap) | `CLICK_EVENT (0)` | open the **Actions** menu | confirm the highlighted entry |
| **Swipe up / down** | `SCROLL_TOP_EVENT (1)` / `SCROLL_BOTTOM_EVENT (2)` | scroll the log | move the ▶ cursor |
| **Double-press** | `DOUBLE_CLICK_EVENT (3)` | **exit** (`shutDownPageContainer(1)`) | back / cancel |
| Long-press *(optional)* | `LONG_PRESS_EVENT (9)`, SDK ≥ 0.0.14, Even App ≥ 2.2.9 | shortcuts menu — every entry is also reachable by tap | — |

GM roll requests switch the sheet to *Saves & Skills* and tell you to roll the physical d20; at 0 HP the sheet shows death saves.

## 🧪 Try it on the glasses

```bash
pnpm wizard                      # demo scenes on your LAN + QR (no Foundry needed)
pnpm dev:glasses                 # live pairing with YOUR Foundry: app from this checkout on the LAN + relay check
pnpm dev:glasses --local-relay   # …and the relay too (wrangler dev) — http:// Foundry only
pnpm --filter @evf/relay dev     # the relay alone (wrangler dev)
```

`pnpm dev:glasses` prints the QR of this checkout's app on the LAN: scan it, then type in the app the code that **Connect G2 glasses** (Alt+G) shows (or pass it with `--code` and one scan pairs). On the phone: sign in once at [hub.evenrealities.com/login](https://hub.evenrealities.com/login) (that enables Developer Mode), reopen the Even Realities App, then **Even Hub → Scan QR**. Details: [`docs/release/evenhub.md`](docs/release/evenhub.md).

## 👓 UX / UI design

The HUD reads like the paper 5e sheet and D&D Beyond (**"Scheda da tavolo G2"**): five fixed zones on the 576 × 288 canvas — four pixel-drawn zones and one firmware-text panel, the only one that takes input. The page uses the **hardware-proven 2×2 grid of 288 × 144 image tiles** (the real G2 host rejects image tiles at off-grid offsets, which the simulator accepts): the 576 × 144 top band (portrait · header · map) is rendered once and split at x = 288 into two tiles, the sheet is the tile at (0, 144), and the context panel is text at the bottom-right — 3 / 4 image + 4 / 8 text containers ([Specs §7.0](Specs.md)).

| Zone | Area | Shows |
|---|---|---|
| A · Portrait | 144 × 144, top-left (tile 1) | actor image → token → class emblem, dimmed at 0 HP |
| B · Header | 288 × 144, top-centre (across tiles 1–2) | AC shield, HP box + temp + bar, INIT · SPD · PROF, ● Action ▲ Bonus ◆ Reaction + movement, conditions, ▲ YOUR TURN |
| C · Map | 144 × 144, top-right (tile 2) | the scene's **original art** (background, tiles, token art) pixelated and dithered to 16 greens, darkness outside your token's sight, vector markers on top; centred on your token, ≤ 1 fps |
| D · Sheet | 288 × 144, bottom-left (tile 3) | Abilities · Saves & Skills pages; death saves at 0 HP |
| E · Context | 288 × 144, bottom-right (firmware text) | log, initiative, actions, targets, spells, results, reactions |

![Exploration — abilities page, log in the context panel](docs/design/img/sheet-explore.png)
*Exploration (S1): abilities page, recent log in the context panel.*

![Combat, your turn — action economy, YOUR TURN chip, initiative](docs/design/img/sheet-combat-my-turn.png)
*Combat, your turn (S2): action economy and ▲ TUO TURNO in the header, initiative in the context panel.*

![GM roll request — Saves & Skills page, "roll the d20 on the table"](docs/design/img/sheet-saves.png)
*GM roll request (S8): the sheet flips to Saves & Skills; you roll the physical d20.*

Real simulator screenshots (all 12 screens in [`docs/design/img/`](docs/design/img/)). The full design — brief, principles, zones and SDK budget, visual language, gestures, edge cases — is **[`docs/design/g2-sheet-ux.html`](docs/design/g2-sheet-ux.html)**; the executable INV-1 contract is the per-zone pixel fixtures in `packages/shared-render/src/fixtures/sheet.*.txt`.

## 🏗️ Architecture

```
[ G2 glasses ] ⇄ BLE ⇄ [ Even App — FoundryVTT G2 HUD ] ⇄ wss ⇄ [ relay ] ⇄ wss ⇄ [ player's Foundry tab = PROJECTOR ]
                         .ehpk · GitHub Pages /app/ · Vite    opaque room,       evenfoundryvtt module: dnd5e readers ·
                                                              sealed frames      dispatchTool write path · pairing · map art
```

**The phone never logs into Foundry** ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)). The player's own Foundry tab — the one that showed the QR — is the **projector**: it reads the character, composes the map inputs and is the only client that executes that device's actions ([ADR-0011](docs/architecture/0011-foundry-write-path-single-workflow-origin.md)). Phone and projector meet in a random room on an **opaque relay** (`packages/relay`: a Cloudflare Worker with one Durable Object per room, `wss://evf-relay.evf-relay.workers.dev`) that forwards AES-256-GCM sealed frames, caps size and rate, and stores nothing. ADR-0019 supersedes the Foundry-served page and Foundry-socket transport of [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md) (its sealed envelope and projector role stay) and all of [ADR-0017](docs/architecture/0017-player-owned-glasses-hybrid-projector.md) ("(G2)" users, GM enablement, ECDH custody, election). Why: Foundry ≥ 14.361 serves module HTML as `text/plain`, players cannot create users, Forge private games gate every path behind a Forge login, and an Even Hub store app can only reach fixed whitelisted origins ([research](specs/004-relay-pairing/research.md)).

## ✨ Highlights

- **One QR, no GM** — the player opens **Connect G2 glasses** in their own Foundry and scans the QR with the app; no Foundry user, password or HTTPS setup for the phone. Works on Foundry v13 and v14, self-hosted and The Forge.
- **Private by design** — the relay only sees **AES-256-GCM sealed** frames (room id, timing and sizes, never content); the per-device key lives only on the phone and in the projector browser; the QR is single-use (room and key rotate on first connect). [Privacy policy](docs/privacy.md).
- **Reads like your character sheet** — AC shield, HP box, ability boxes and proficiency circles drawn by our own pixel renderer and bitmap fonts (the firmware font has no D&D glyphs); pages switch automatically (Saves & Skills on a GM roll request, death saves at 0 HP).
- **Installable from Even Hub** — **FoundryVTT G2 HUD** is one bundle shipped as an Even Hub package (survives the phone lock; in-app «Scan QR» with the phone camera, or «Enter code»), on GitHub Pages and as a Vite dev server ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)).
- **Pixelated original map** — the projector loads the scene art (background, tiles, token art — Forge CDN art included) in its own tab, downsizes it and sends each picture once; the phone block-downsamples it (pixel size 1/2/3, default 2), Floyd–Steinberg dithers it to 16 greens, blacks out what your token can't see (12 cells when the token has no sight radius) and draws crisp markers on top; one square 144 × 144 image centred on your token, sent only when it changes (≤ 1 fps), paced to the SDK's 100 ms image limit ([ADR-0018](docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md)).
- **Battle-tested Foundry calls** — fixes found live on real Foundry/dnd5e in the v0.9.14 → v0.11 line are kept: `Activity#use(usage, dialog, message)` with `configure: false` in the *dialog* argument (no 10 s hang), null temp HP, dnd5e 5.1 spell preparation, zero-quantity items, bounded audit log, skill checks.
- **Dual D&D edition** — PHB 2014 and PHB 2024 via `core.modernRules`.
- **IT + EN** — follows Foundry's language, overridable from the phone page or the glasses menu.

## 🛡️ Invariants & principles

Four non-negotiable invariants ([`Specs.md` §0.1](Specs.md)) — **INV-1** layout integrity · **INV-2** online cross-validation · **INV-3** documentation coherence · **INV-4** code quality — plus the Engineering Constitution (P1–P11) in [`CLAUDE.md`](CLAUDE.md).

## 📊 Status

**v0.13.0 — relay pairing, the player's tab projects.** The phone no longer logs into Foundry: pairing is one QR from the player's own Foundry tab, traffic goes through an opaque end-to-end-sealed relay, and the glasses app is an Even Hub package (plus GitHub Pages and a Vite dev loop) on Even Hub SDK 0.0.16 ([ADR-0019](docs/architecture/0019-relay-pairing-player-projector.md)). The HUD is the D&D-sheet layout on our pixel renderer ([ADR-0018](docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md)). v0.12.0 (Foundry-served page, «(G2)» users, [ADR-0016](docs/architecture/0016-direct-foundry-streaming.md)/[ADR-0017](docs/architecture/0017-player-owned-glasses-hybrid-projector.md)) and the bridge era (v0.9.14 → v0.11.0, releases up to `v0.1.55`) are kept in git and in the [`Specs.md`](Specs.md) changelog. Hardware and live checks follow the defer-hardware pattern: `pnpm --filter @evf/validation-harness validate:relay` (relay health, CORS, room round-trip, oversize; manual checklist for relay reachability from a Forge / self-hosted tab and for the Even Hub build). Planning uses Spec Kit — this feature is [`specs/004-relay-pairing/`](specs/004-relay-pairing/).

## 🗺️ Roadmap

| Milestone | Status | Scope |
|---|---|---|
| v0.9.11 → v0.9.13 | ✅ shipped | MVP, quick wins, sheet data (bridge-based) |
| v0.9.14 → v0.11.0 | ✅ shipped, superseded | bridge-era raster HUD substrates, bearer pairing, player-view map capture — releases up to `v0.1.55` |
| v0.12.0 | ✅ shipped, partly superseded | direct Foundry → G2 streaming, D&D-sheet HUD on the 2×2 tile grid, pixelated original-art map — release `v0.2.0` (Foundry-served page and «(G2)» users superseded by ADR-0019) |
| **v0.13.0** | 🚧 current | relay pairing: player's Foundry tab = projector, one QR, opaque sealed relay, Even Hub package + GitHub Pages + `pnpm dev:glasses` |
| next | planned | Even Hub beta → store listing; hardware UAT on G2 + R1; relay quota measured on real sessions; skill/save rolls from the glasses; voice/MCP only via a new ADR |

## 🥽 Hardware

- **Even Realities G2** — 576 × 288 px, 4-bit greyscale green; ≤ 4 image (20–288 × 20–144 each, on the (0,0)-anchored grid on real hardware) + ≤ 8 text/list containers per page; 4-mic array; no speaker, no camera. *([display](https://hub.evenrealities.com/docs/build/display) · [device APIs](https://hub.evenrealities.com/docs/build/device-apis))*
- **Even Realities R1** — BLE ring: press, double-press, swipe up/down; long-press only as an optional extra (SDK ≥ 0.0.14, Even App ≥ 2.2.9). *([ring](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.3 — no public HTTPS needed (the phone never reaches Foundry).

## 🧰 Stack

- **G2 app**: TypeScript + Vite 8, `@evenrealities/even_hub_sdk` 0.0.16, `@evenrealities/pretext` (pixel text budgets), `upng-js` (4-bit PNG), `jsqr` (in-app QR scan); map pixelation + Floyd–Steinberg dither in plain TypeScript
- **Foundry module**: dnd5e 5.x readers + write path, optional MidiQOL, `qrcode`
- **Relay**: `@evf/relay` — Cloudflare Worker + Durable Objects (WebSocket Hibernation), `wrangler`
- **Shared**: `@evf/shared-protocol` (Zod schemas + WebCrypto sealed envelope, pairing payload v2), `@evf/shared-render` (4-bit pixel renderer + bitmap fonts, INV-1 fixtures)
- **Tooling**: pnpm workspaces · Vitest · Biome · TypeScript strict · Changesets · GitFlow

## 📚 Documentation

- **[Project wiki](https://github.com/Aiacos/EvenFoundryVTT/wiki)** (Italian) — player, GM and developer guides; source in [`docs/wiki/`](docs/wiki/)
- [`Specs.md`](Specs.md) — canonical specification (v0.13.0)
- [`docs/design/g2-sheet-ux.html`](docs/design/g2-sheet-ux.html) — D&D-sheet HUD design (zones, principles, gestures, 12 screens)
- [`docs/design/g2-thirds-layout.md`](docs/design/g2-thirds-layout.md) — superseded thirds layout (history)
- [`docs/architecture/`](docs/architecture/) — ADRs 0001–0019 (current: 0011 write path · 0012 R1 gestures · 0016 sealed envelope + projector role · 0018 D&D-sheet HUD · **0019 relay pairing**; 0017 superseded by 0019; index with statuses in [`docs/architecture/README.md`](docs/architecture/README.md))
- [`specs/`](specs/) — Spec Kit features (`004-relay-pairing` is the current one; `003-direct-streaming` the v0.12.0 port)
- [`docs/privacy.md`](docs/privacy.md) — privacy policy of the FoundryVTT G2 HUD app
- [`docs/setup-guide.md`](docs/setup-guide.md) · [`docs/runbook.md`](docs/runbook.md) · [`docs/showcase/index.html`](docs/showcase/index.html)

## 🎨 Inspiration

- **DOOM on a watch** ([jborza](https://jborza.com/post/2020-11-20-doom-on-a-watch/)) · **Ditherpunk** ([surma.dev](https://surma.dev/things/ditherpunk/)) · **FoundryVTT desktop** persistent character card

## ⚖️ License

MIT — every package in the monorepo (`foundry-module`, `g2-app`, `relay`, `shared-protocol`, `shared-render`, `validation-harness`).

## 👤 Author

Lorenzo (a.k.a. **Aiacos**) — `uni.lorenzo.a@gmail.com`

> *"The player never looks away from the table."*
