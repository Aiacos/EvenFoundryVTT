# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: design](https://img.shields.io/badge/status-design--only-yellow)](#status)
[![spec: v0.9.8](https://img.shields.io/badge/spec-v0.9.8-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)

---

## What is it?

**EvenFoundryVTT** projects a glanceable HUD of a FoundryVTT D&D session directly onto Even Realities G2 AR glasses (576×288 4-bit greyscale display), driven by gestures from the Even R1 smart ring. Imagine a phosphor-green tactical HUD — *Alien Nostromo / VFD / CRT* — floating in your field of view while the real table, miniatures, and human DM stay center stage.

| Pillar | What it gives you |
|---|---|
| **Map base layer** | Live Foundry canvas, rasterized + Floyd-Steinberg dithered into 4-bit green, 400×200 px effective. Glyph fallback (text grid) when bandwidth is thin. |
| **Persistent Status HUD** | HP / AC / action economy / spell slots / conditions, always in the corner — never hidden by overlays. |
| **Overlay panels** | Sheet (6 tabs: Main / Skills / Inventory / Spells / Feats / Bio), Combat tracker, Event log, Spellbook, Inventory — all stacked over the map like Foundry desktop windows. |
| **R1 gesture control** | tap = cycle • double-tap = back to map • scroll = navigate • long-press = Quick Action menu. |
| **Manual MVP** | Cast / attack / use are explicit: scroll to spell → tap → confirm target. No surprises. |
| **Optional V2 voice** | A standalone `foundry-mcp` server exposes Foundry tools via Model Context Protocol — drive the table from Claude Desktop, Claude Code, or any MCP client. AI never lives inside the core. |

## Architecture (one-liner)

```
[ G2 glasses ]  ←BLE→  [ Even App ]  ←HTTPS/WS→  [ Bridge (Node.js) ]  ←socket→  [ Foundry VTT + dnd5e ]
       ↑                                              │
       │                                              └─ optional: foundry-mcp ←MCP→ Claude Desktop
       └─ R1 ring (gestures + biometrics)
```

Three boundaries, three contracts, every plugin slot versioned. dnd5e v6 lands? swap the `foundry-adapter`, no cascade.

## Highlights

- **15 fps stretch / 5 fps committed** on a 4-bit greyscale BLE-bound display, via a 6-layer pipeline (delta hash · sub-tile encoding · static caching · custom RLE · BLE 4.2+ DLE · adaptive frame rate).
- **Doom-on-exotic-devices** rendering pattern (Floyd-Steinberg / Atkinson / Bayer 8×8 selectable; library stack `image-q` + `upng-js` + `xxhash-wasm` benchmarked at ~30-50% compute reduction over rolling-our-own).
- **Dual D&D edition support** — both PHB 2014 and PHB 2024 ("One D&D") via `core.modernRules` setting, sourced live from `actor.system.*`.
- **No mocks at the boundary** — Foundry is the single source of truth, every action goes through `Activity#use()` / MidiQOL workflow, GM keeps full veto power.
- **Phase 0 gating** — every hardware assumption (R1 events, image API format, BLE bandwidth, partial-update API, DLE) has a written GO/NO-GO test before code lands.

## Status

**Design only.** Not a single line of application code yet. The current artifact is the **3-thousand-line spec** in [`Specs.md`](Specs.md) — verified end-to-end against upstream documentation across **3 cross-check rounds** (changelog at the bottom of the spec).

The spec covers requirements, hardware constraints (Even Hub display + networking + R1 product page), Foundry/dnd5e API surface, data models, full UI/UX with ASCII mockups, the 6-layer raster pipeline, the optional MCP voice module, a 13-week MVP roadmap with Phase 0 validation protocol, risk register, library stack research, and failure modes.

## Roadmap snapshot

| Phase | Weeks | Deliverable |
|---|---|---|
| 0 | Week 0 | Hardware/SDK validation (R1 events · `updateImageRawData` format · BLE bandwidth · partial-update API · DLE) |
| 1 | 1-2 | Monorepo skeleton · shared protocol · CI · ADR-0001-04 |
| 2 | 2-3 | Foundry module: readers + WS server + capability handshake |
| 3 | 3-4 | Bridge: REST + WS + tool registry + Docker |
| 4 | 4-7 | G2 app: layered UI engine + raster pipeline (6 layers) + glyph fallback + boot splash |
| 5 | 6-8 | Panel plugin system + Sheet (6 tabs) + Combat / Log / Spellbook / Inventory |
| 6 | 7-8 | R1 integration + Quick Action menu + telemetry |
| 7 | 8-9 | Foundry write path: `activity.use()` + targets + AoE templates + socketlib |
| 8 | 9-10 | Manual action UX (tap-to-cast / use / attack) |
| 9 | 10-11 | Action economy enforcement + reactions |
| 10 | 11-13 | Polish + 4-hour field test |
| **— end MVP —** | | |
| 11 | 14-15 | V2: `foundry-mcp` MCP server |
| 12 | 15-16 | V2: voice UX tuning + IT↔EN spell name mapping |
| 13 | post | V2 stretch: reaction bot, dnd5e 6.x, PF2e adapter, portrait images, Dice So Nice raster |

## Hardware

- **Even Realities G2** smart glasses — 576 × 288 px monocular, 4-bit greyscale (16 levels of green), 4 image + 8 other containers per page, 200 × 100 max image size. *([Even Hub display guide](https://hub.evenrealities.com/docs/guides/display))*
- **Even Realities R1** smart ring — BLE, gestures (tap, scroll, long-press) + biometrics (HR / HRV / SpO₂ / skin temp), zirconia ceramic + medical-grade stainless steel, IP68 50 m / 30 min, ~4 days battery. *([Even smart ring page](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.x (Activity system mandatory). *([dnd5e](https://github.com/foundryvtt/dnd5e))*

## Stack

- **Bridge**: Node.js 22 + Fastify + ws + Redis (optional) + Docker Compose
- **G2 app**: HTML/JS plugin (Even Hub WebView), TypeScript build, `image-q` + `upng-js` + `xxhash-wasm` for raster pipeline (browser-side), `OffscreenCanvas` GPU resize
- **Foundry module**: `dnd5e` 5.x adapter, `socketlib`, optional `MidiQOL`
- **MCP** (optional V2): `@modelcontextprotocol/sdk` (TypeScript), exposes Foundry tools/resources to any MCP client
- **Tooling**: pnpm workspaces · Vitest · Biome · Changesets

## Documentation

- **[`Specs.md`](Specs.md)** — single source of truth (v0.9.8, ~3500 lines, fully cross-checked against upstream docs)
- **[`docs/showcase/index.html`](docs/showcase/index.html)** — interactive feature showcase (HTML5/JS, animated)
- *Coming with implementation*: ADR-0001 layered UI · ADR-0002 protocol versioning · ADR-0003 plugin registry · ADR-0004 voice via MCP · ADR-0005 Phase 0 results · ADR-0006 raster library stack

## Inspiration

- **DOOM on a watch** ([jborza](https://jborza.com/post/2020-11-20-doom-on-a-watch/)) — streaming + dithering reference architecture
- **rp2040_doom_1b** ([meadiode](https://github.com/meadiode/rp2040_doom_1b)) — Bayer + blue noise on EL display
- **Ditherpunk** ([surma.dev](https://surma.dev/things/ditherpunk/)) — canonical dithering treatment
- **FoundryVTT desktop** — windowed UI pattern, persistent character mini-card

## License

MIT — all packages of the future monorepo (`foundry-module`, `bridge`, `g2-app`, `foundry-mcp`, `shared-protocol`, `shared-render`).

## Author

Lorenzo (a.k.a. **Aiacos**) — `uni.lorenzo.a@gmail.com`

> *"The player never looks away from the table."*
