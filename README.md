# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: v0.10.0](https://img.shields.io/badge/status-v0.10.0%20direct%20streaming-brightgreen)](#-status)
[![spec: v0.10.0](https://img.shields.io/badge/spec-v0.10.0-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#%EF%B8%8F-license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)
[![Even Hub SDK: 0.0.15](https://img.shields.io/badge/even__hub__sdk-0.0.15-lightgrey)](https://hub.evenrealities.com/docs)

---

## 💡 In one sentence

**EvenFoundryVTT streams your D&D character straight from Foundry to the G2 glasses** — no server to install, no URL to type: the GM shows a QR code in Foundry, you scan it with the Even Realities App, and a **D&D-sheet HUD** — portrait, AC shield, HP box, ability scores, a square tactical map — stays in your field of view while one context panel follows the action.

## 📦 Installation

There is **one** thing to install: the Foundry module. It also serves the glasses app.

1. **Foundry** → *Setup* → *Add-on Modules* → *Install Module* → Manifest URL:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

   Requires dnd5e ≥ 5.3.3; `midi-qol` is optional (full attack → damage → save automation when present).
2. Foundry must be reachable from the phone over **valid HTTPS** (Let's Encrypt, Tailscale, a reverse proxy — self-signed LAN certificates are rejected by the phone WebView). See [`docs/setup-guide.md`](docs/setup-guide.md).
3. Enable the module in your world.

> Developing? Symlink `packages/foundry-module/` into `Data/modules/evenfoundryvtt/` and run `pnpm --filter @evf/g2-app build && pnpm --filter @evf/foundry-module build`.

## 🕹️ Usage

| Who | Where | What |
|---|---|---|
| GM | Foundry sidebar → *Players* → right-click a player → **Pair G2 glasses** (or *Configure Settings* → *EvenFoundryVTT*) | player + character preselected → a QR appears (valid 5 min, single use); the dialog turns to *Glasses connected* on success |
| Player | Even Realities App → **scan the QR** | the glasses app opens already connected to that character |
| Player | R1 ring / temple touchpad | tap = actions · swipe = move cursor · double-tap = back (exit at root) · long-press = shortcuts menu |

The module creates a dedicated Foundry user **"&lt;Player&gt; (G2)"** (Player role, owner of that character only) and a per-device encryption key. Revoke any device from the same dialog. A **manual code** fallback is shown under the QR.

## 👓 UX / UI design

The HUD reads like the paper 5e sheet and D&D Beyond (**"Scheda da tavolo G2"**): five fixed zones on the 576 × 288 canvas, four pixel-drawn images and one firmware-text panel — the only one that takes input.

| Zone | Area | Shows |
|---|---|---|
| A · Portrait | 144 × 144, top-left | actor image → token → class emblem, dimmed at 0 HP |
| B · Header | 288 × 144, top-centre | AC shield, HP box + temp + bar, INIT · SPD · PROF, ● Action ▲ Bonus ◆ Reaction + movement, conditions, ▲ YOUR TURN |
| C · Map | 144 × 144, top-right | square map centred on your token, 12 px cells, ≤ 1 fps |
| D · Sheet | 288 × 144, bottom-left | Abilities · Saves & Skills pages; death saves at 0 HP |
| E · Context | 288 × 144, bottom-right | log, initiative, actions, targets, spells, results, reactions |

![Exploration — abilities page, log in the context panel](docs/design/img/sheet-explore.png)
*Exploration (S1): abilities page, recent log in the context panel.*

![Combat, your turn — action economy, YOUR TURN chip, initiative](docs/design/img/sheet-combat-my-turn.png)
*Combat, your turn (S2): action economy and ▲ TUO TURNO in the header, initiative in the context panel.*

![GM roll request — Saves & Skills page, "roll the d20 on the table"](docs/design/img/sheet-saves.png)
*GM roll request (S8): the sheet flips to Saves & Skills; you roll the physical d20.*

Real simulator screenshots (all 12 screens in [`docs/design/img/`](docs/design/img/)). The full design — brief, principles, zones and SDK budget, visual language, gestures, edge cases — is **[`docs/design/g2-sheet-ux.html`](docs/design/g2-sheet-ux.html)**; the executable INV-1 contract is the per-zone pixel fixtures in `packages/shared-render/src/fixtures/sheet.*.txt`.

## 🏗️ Architecture

```
[ G2 glasses ] ⇄ BLE ⇄ [ Even App WebView — page served by Foundry: /modules/evenfoundryvtt/g2/ ]
                                  │ same-origin HTTPS: /join + socket.io
                                  ▼
                          [ Foundry server ] ── relays module.evenfoundryvtt (AES-GCM sealed)
                                  │
                                  ▼
            [ GM browser — evenfoundryvtt module = projector ]
              dnd5e readers · write path (activity.use / MidiQOL) · pairing
```

No bridge, no Docker, no extra origin. Decision record: **[ADR-0012](docs/architecture/0012-direct-foundry-streaming.md)**. A GM client must be online (it computes dnd5e derived data and executes actions — [ADR-0011](docs/architecture/0011-foundry-write-path-single-workflow-origin.md)).

## ✨ Highlights

- **Zero infrastructure** — the glasses app is shipped inside the Foundry module and QR-sideloaded; same-origin means no CORS, no whitelist, no cookies blocked (works on Foundry v13 and v14).
- **Private by design** — Foundry relays module messages to every client, so every payload is **AES-256-GCM sealed** with a per-device key that lives only in the GM browser and on the phone; the QR is single-use (password + key rotate on first connect).
- **Reads like your character sheet** — AC shield, HP box, ability boxes and proficiency circles drawn by our own pixel renderer and bitmap fonts (the firmware font has no D&D glyphs); pages switch automatically (Saves & Skills on a GM roll request, death saves at 0 HP).
- **Pixelated map** — built on the phone from compact scene data (grid, walls, lights, visible tokens, background), 4-bit greyscale, one square 144 × 144 image centred on your token, sent only when it changes (≤ 1 fps), paced to the SDK's 100 ms image limit.
- **Dual D&D edition** — PHB 2014 and PHB 2024 via `core.modernRules`.
- **IT + EN** — follows Foundry's language, overridable from the phone page or the glasses menu.

## 🛡️ Invariants & principles

Four non-negotiable invariants ([`Specs.md` §0.1](Specs.md)) — **INV-1** layout integrity · **INV-2** online cross-validation · **INV-3** documentation coherence · **INV-4** code quality — plus the Engineering Constitution (P1–P11) in [`CLAUDE.md`](CLAUDE.md).

## 📊 Status

**v0.10.0 — direct streaming.** The Node bridge, the `foundry-mcp` server and Docker Compose were removed (ADR-0012); the G2 app was redesigned around the D&D-sheet layout ("Scheda da tavolo G2", UX round 2) on Even Hub SDK 0.0.15. Hardware verification (QR sideload, cookie persistence, BLE map pacing) follows the defer-hardware pattern: `pnpm --filter @evf/validation-harness validate:direct-sideload`.

Previous milestones (v0.9.11 MVP → v0.9.13 sheet data) are archived under [`.planning/milestones/`](.planning/milestones/).

## 🗺️ Roadmap

| Milestone | Status | Scope |
|---|---|---|
| v0.9.11 → v0.9.13 | ✅ archived | MVP, quick wins, sheet data (bridge-based) |
| **v0.10.0** | 🚧 current | direct Foundry → G2 streaming, D&D-sheet HUD, one-scan pairing |
| next | planned | hardware UAT on G2 + R1, voice/MCP as a client of the direct channel (new ADR) |

## 🥽 Hardware

- **Even Realities G2** — 576 × 288 px, 4-bit greyscale green; ≤ 4 image (≤ 288×144 each) + ≤ 8 text/list containers per page; 4-mic array; no speaker, no camera. *([display](https://hub.evenrealities.com/docs/build/display) · [device APIs](https://hub.evenrealities.com/docs/build/device-apis))*
- **Even Realities R1** — BLE ring: press, double-press, swipe up/down, long-press (SDK ≥ 0.0.14, Even App ≥ 2.2.9). *([ring](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.3, reachable over HTTPS.

## 🧰 Stack

- **G2 app**: TypeScript + Vite 8, `@evenrealities/even_hub_sdk` 0.0.15, `socket.io-client` 4.8, `@evenrealities/pretext` (pixel text budgets), `image-q` (dithering)
- **Foundry module**: dnd5e 5.x readers + write path, optional MidiQOL, `qrcode`
- **Shared**: `@evf/shared-protocol` (Zod schemas + WebCrypto sealed envelope), `@evf/shared-render` (4-bit pixel renderer + bitmap fonts, INV-1 fixtures)
- **Tooling**: pnpm workspaces · Vitest · Biome · TypeScript strict · Changesets · GitFlow

## 📚 Documentation

- [`Specs.md`](Specs.md) — canonical specification (v0.10.0)
- [`docs/design/g2-sheet-ux.html`](docs/design/g2-sheet-ux.html) — D&D-sheet HUD design (zones, principles, gestures, 12 screens)
- [`docs/design/g2-thirds-layout.md`](docs/design/g2-thirds-layout.md) — superseded thirds layout (history); its pairing flow and phone mocks P01–P03 are still current
- [`docs/architecture/`](docs/architecture/) — ADRs (0012 direct streaming is the latest)
- [`docs/setup-guide.md`](docs/setup-guide.md) · [`docs/runbook.md`](docs/runbook.md) · [`docs/showcase/index.html`](docs/showcase/index.html)

## 🎨 Inspiration

- **DOOM on a watch** ([jborza](https://jborza.com/post/2020-11-20-doom-on-a-watch/)) · **Ditherpunk** ([surma.dev](https://surma.dev/things/ditherpunk/)) · **FoundryVTT desktop** persistent character card

## ⚖️ License

MIT — every package in the monorepo (`foundry-module`, `g2-app`, `shared-protocol`, `shared-render`, `validation-harness`).

## 👤 Author

Lorenzo (a.k.a. **Aiacos**) — `uni.lorenzo.a@gmail.com`

> *"The player never looks away from the table."*
