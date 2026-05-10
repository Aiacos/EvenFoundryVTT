# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: design](https://img.shields.io/badge/status-design--only-yellow)](#status)
[![spec: v0.9.11](https://img.shields.io/badge/spec-v0.9.11-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)
[![i18n: ready](https://img.shields.io/badge/i18n-ready-brightgreen)](Specs.md#716-localization--internationalization-i18n)

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
- **i18n ready from MVP** — locale auto-detected from Foundry (`game.i18n.lang`), runtime override directly from the glasses via `[N] Language` Quick Action. Device-local override never touches the world setting. See [§7.16](Specs.md).
- **Voice control hardware-feasible** (V2 OPZIONALE) — the G2 4-mic array streams **PCM 16 kHz s16le mono** to plugins via `bridge.audioControl()` (verified upstream `hub.evenrealities.com/docs/guides/device-apis`). STT/LLM run **off-glasses** via the bridge or an MCP client — the G2 has no speaker (visual-only feedback) and the native EvenAI is opaque to dev apps. See [§3.5 / §3.6](Specs.md).
- **Setup happens on the phone** — Foundry connection bootstrap (bridge URL, auth token, character pick) lives in the **Even Realities App** per-plugin settings UI (verified upstream `support.evenrealities.com`: *"configure each widget individually through the Even App"*). Pairing is a **QR scan** from the Foundry desktop module, never a manual token copy-paste. The G2 stays keyboardless — no virtual keyboard, ever. See [§3.8 / §7.14.7](Specs.md).
- **No mocks at the boundary** — Foundry is the single source of truth, every action goes through `Activity#use()` / MidiQOL workflow, GM keeps full veto power.
- **Phase 0 gating** — every hardware assumption (R1 events, image API format, BLE bandwidth, partial-update API, DLE, audio chunk size) has a written GO/NO-GO test before code lands.

## Project Invariants (non-negotiable)

Four rules govern every PR, every audit, every release. They are constraints, not guidelines. See **[§0.1 of `Specs.md`](Specs.md)** for the formal definition.

| # | Invariant | One-line rule |
|---|---|---|
| **INV-1** | **Layout integrity** | Formatting and layout are **dynamic and always perfect** — frame corners, dividers and columns align to the character in every state, every content, every locale. **Never misaligned for any reason.** Verified by snapshot tests (§7.14.4 ck 11–15) and by the `Box` / `TextRun` render contract (§7.1a.7). |
| **INV-2** | **Online cross-validation** | Every technical claim cites a canonical upstream source (Even Hub, foundryvtt.com/api, dnd5e wiki, MCP spec, vendor pricing pages). Re-verified before each version bump and Phase 0 GO/NO-GO. Drift is classified, fixed, and logged in the changelog. The current spec is the result of **5 consecutive cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11). |
| **INV-3** | **Documentation coherence** | `Specs.md` (canonical), `README.md` and `docs/showcase/index.html` are **always coherent** and updated **in the same commit** for any change touching cross-cutting claims (version, fps target, phase count, hardware spec, library version, locale set). No half-updated states. |
| **INV-4** | **Code quality** | Code is **clean, optimized, documented** — and **zero dead or unreachable code** is tolerated. Biome + TypeScript strict + Vitest coverage gate enforce it in CI. `// TODO` without an issue/ADR link is a CI failure. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions. See §0.1 INV-4. |

## Status

**Design only.** Not a single line of application code yet. The current artifact is the **~4250-line spec** in [`Specs.md`](Specs.md) — verified end-to-end against upstream documentation across **5 cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11), with four **non-negotiable Project Invariants** ratified in §0.1.

The spec covers requirements, hardware constraints (Even Hub display + networking + audio + native AI limits + R1 product page), Foundry/dnd5e API surface (with `game.i18n` Localization API), data models, full UI/UX with ASCII mockups, layout integrity rules (§7.1a), i18n architecture with on-glasses language toggle (§7.16), G2 audio surface (§3.5), plugin execution model and 3-hop server-hosted distribution (§3.7), Even Realities App phone-side configuration UI for connection bootstrap (§3.8 / §7.14.7), the 6-layer raster pipeline, the optional MCP voice module, a 13-week MVP roadmap with Phase 0 validation protocol, risk register, library stack research, and failure modes.

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

- **Even Realities G2** smart glasses — 576 × 288 px monocular, 4-bit greyscale (16 levels of green), 4 image + 8 other containers per page, 200 × 100 max image size. **4-mic directional array** (single audio stream PCM 16 kHz s16le mono via `bridge.audioControl()`), **no speaker / no audio output** (visual-only feedback), no camera. *([Even Hub display guide](https://hub.evenrealities.com/docs/guides/display) · [device APIs](https://hub.evenrealities.com/docs/guides/device-apis))*
- **Even Realities R1** smart ring — BLE, gestures (tap, scroll, long-press) + biometrics (HR / HRV / SpO₂ / skin temp), zirconia ceramic + medical-grade stainless steel, IP68 50 m / 30 min, ~4 days battery. *([Even smart ring page](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.x (Activity system mandatory). *([dnd5e](https://github.com/foundryvtt/dnd5e))*

## Stack

- **Bridge**: Node.js 22 + Fastify + ws + Redis (optional) + Docker Compose
- **G2 app**: HTML/JS plugin (Even Hub WebView), TypeScript build, `image-q` + `upng-js` + `xxhash-wasm` for raster pipeline (browser-side), `OffscreenCanvas` GPU resize
- **Foundry module**: `dnd5e` 5.x adapter, `socketlib`, optional `MidiQOL`
- **MCP** (optional V2): `@modelcontextprotocol/sdk` (TypeScript), exposes Foundry tools/resources to any MCP client
- **Tooling**: pnpm workspaces · Vitest · Biome · Changesets

## Documentation

- **[`Specs.md`](Specs.md)** — single source of truth (v0.9.11, ~4250 lines, fully cross-checked against upstream docs across 5 rounds)
- **[`docs/showcase/index.html`](docs/showcase/index.html)** — interactive feature showcase (HTML5/JS, animated)
- *Coming with implementation*: ADR-0001 layered UI · ADR-0002 protocol versioning · ADR-0003 plugin registry · ADR-0004 voice via MCP · ADR-0005 Phase 0 results · ADR-0006 raster library stack · ADR-0007 RTL deferred to V2 · ADR-0008 code quality configuration

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
