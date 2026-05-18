# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: v0.9.12 shipped](https://img.shields.io/badge/status-v0.9.12%20shipped%20(17%2F17%20phases%20software--complete)-brightgreen)](#status)
[![spec: v0.9.12](https://img.shields.io/badge/spec-v0.9.12-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)
[![i18n: ready](https://img.shields.io/badge/i18n-ready-brightgreen)](Specs.md#716-localization--internationalization-i18n)

---

## Quick install (Foundry desktop / The Forge)

In Foundry → **Setup** → **Add-on Modules** → **Install Module** → paste this **Manifest URL**:

```
https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
```

Same URL works on **The Forge** (Bazaar → *+ Install Module from a Manifest*). Foundry will auto-install `socketlib`, `midi-qol`, and require dnd5e ≥ 5.3.3.

> **Note:** the manifest URL only works once a GitHub Release exists. If install fails with *"Failed to fetch package manifest"*, no release has been published yet — see [`docs/release/foundry-module.md`](docs/release/foundry-module.md) for cutting a release. Until then, install in dev mode by symlinking `packages/foundry-module/` into your Foundry `Data/modules/evenfoundryvtt/` folder (then run `pnpm --filter @evf/foundry-module build`).

---

## In una frase

**EvenFoundryVTT è un ponte tra Foundry VTT e gli occhiali AR Even Realities G2.** Il giocatore di D&D 5e indossa gli occhiali, controlla i pannelli con l'anello R1, e vede la sua scheda PG / combat tracker / mappa / log direttamente nel campo visivo — senza mai distogliere lo sguardo dal tavolo, dal master, dagli altri giocatori. Il modulo gira sul lato Foundry (legge stato e lo manda agli occhiali); un bridge Node.js fa da reverse-proxy con auth bearer e idempotency; un'app companion sul telefono gestisce il pairing.

### Cosa fa oggi (v0.9.12 shipped — 17/17 phases software-complete)

- ✓ **MVP completo end-to-end** — Phase 0 → 13 (v0.9.11 MVP) + Phase 14 (z=0.5 idle infill) + Phase 15 (Deepgram Keyterm) shipped 2026-05-17. 9/9 v1 REQ-IDs della milestone v0.9.12 Resolved (5 INFILL + 4 VOICE).
- ✓ **Pairing G2 ↔ Foundry** via QR code dalle impostazioni master, bearer 24h, internal_secret per coppia, timing-safe-equal su tutti i confronti segreti.
- ✓ **Lettura stato Foundry** (PG, combat, scena, eventi log, entity-pack di items/weapons/armor/NPCs/monsters) con push real-time via WebSocket `/internal/delta` multiplex.
- ✓ **Bridge production-ready** — Fastify + Docker Compose + `/healthz`/`/readyz`/`/metrics` Prometheus + idempotency-key middleware RFC-compliant + Tool Registry MVP completo.
- ✓ **Wizard di setup** vanilla TS sul telefono (3-step: bridge URL → token → PG) + Even Realities App per-plugin settings.
- ✓ **Rendering layered UI completo** — raster 4-bit greyscale + glyph fallback + z=0.5 idle content infill (NEW v0.9.12) + Status HUD persistente + overlay panels (Sheet 6 tab, Combat tracker, Inventory, Spellbook, Log).
- ✓ **Foundry write path** — `activity.use()` via socketlib `executeAsGM` (single-workflow-origin, ADR-0011), 17 socketlib handler registered (CI Gate 8 invariant preservato attraverso v0.9.12), `MidiQOL.completeActivityUse` quando presente.
- ✓ **Action economy enforcement** — Action / Bonus / Reaction, spell slot consumption, concentration handling, multi-attack tracker, reaction passive notifications, death saves, AoE templates.
- ✓ **Manual action UX** — tap-to-cast / attack / use, Quick Action menu, action-result toast queue (FIFO + squash).
- ✓ **i18n** — IT + EN catalogs + on-glasses language override (Quick Action `[N] Language`); width-budget validation a build-time (INV-1).
- ✓ **R1 integration** — gesture routing (tap / scroll / long-press / double-tap), INV-5 Gesture Determinism ratificato.
- ✓ **Voice (V2 OPZIONALE shipped)** — `foundry-mcp` Streamable HTTP server, Deepgram Nova-3 Multilingual STT con Keyterm Prompting (+625% recall su nomi esotici come Bigby's Hand, Counterspell), vocabolario static SRD (70 × IT + EN = 140) + dynamic entity-pack Foundry-derived con hot-update WS delta (debounce 250ms + drain-then-restart mutex).
- ✓ **Quality** — **2626 test workspace** verdi, coverage ≥80% nei pacchetti critici, TypeScript strict, Biome lint clean, 7 CI gates green su ogni PR, INV-1..5 verification suite (`inv:all`) + INV-3 atomic doc-coherence enforced.

### Cosa NON fa ancora

- ✗ **Hardware UAT** — 35 success criteria attraverso le Phase 4a/4b/5/6/7/8/9/10/12/13 marcati `human_needed` sotto ADR-0005 PROVISIONAL Branch A. Software-complete; richiedono **accesso Even Hub developer + G2 + R1 + DM consenziente** per la verifica end-to-end on-device. Closure path: `pnpm --filter @evf/validation-harness validate:all`.
- ✗ **Picovoice Rhino edge classifier** — condizionale su SC-12-01 (latenza Claude Desktop p50 > 800ms). Non misurabile senza hardware.
- ✗ **Phase-14.1 spec-drift cleanup** (~20 min) — UI-SPEC §2 col 71→68, §10 width budgets, locale leak in `glyph-scene.glyph-idle-z05.it.txt` row 1/17. Real defect è solo il locale leak; il resto è spec-prose drift.

---

## What is it?

**EvenFoundryVTT** projects a glanceable HUD of a FoundryVTT D&D session directly onto Even Realities G2 AR glasses (576×288 4-bit greyscale display), driven by gestures from the Even R1 smart ring. Imagine a phosphor-green tactical HUD — *Alien Nostromo / VFD / CRT* — floating in your field of view while the real table, miniatures, and human DM stay center stage.

| Pillar | What it gives you |
|---|---|
| **Map base layer** | Live Foundry canvas, rasterized + Floyd-Steinberg dithered into 4-bit green, 400×200 px effective (hardware max — 4 image containers × 200×100). Glyph fallback (text grid) when bandwidth is thin. |
| **Idle Content Infill (z=0.5)** | **NEW v0.9.12** — text strips that fill the otherwise-empty rows below the raster tiles when no overlay is active (combat log mini · z=0.5 label · stats: mode / fps / BLE). Auto-demolished when an overlay opens, auto-reborn when it closes. INV-1 layout-preserving. See [§7.4c](Specs.md). Ratified Phase 14 (2026-05-17). |
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
- **Deepgram Keyterm Prompting on esoteric D&D 5e terms** (v0.9.12 Phase 15, closed 2026-05-17) — the Deepgram Nova-3 Multilingual session URL now ships a `keyterm=` query param per element of the union of static SRD spells (70 entries × IT + EN) AND the live Foundry-derived entity-pack (items / weapons / armor / NPCs / monsters). Documented **+625% entity-recall lift** on esoteric terms like Bigby's Hand, Counterspell, Vrock (Deepgram learn docs — re-verified ✓ 2026-05-17 alongside the canonical EvenAI no-API constraint, 6 canonical Even Realities domains, evidence in [`.planning/quick/20260517-voice-intent-research/RESEARCH.md`](.planning/quick/20260517-voice-intent-research/RESEARCH.md) §1). Hot-update via existing `/internal/delta` channel — `socketlib.registerComplexHandler` count stays exactly **17** (Phase 13 invariant + CI Gate 8 preserved). Cap **`DEEPGRAM_KEYTERM_LIMIT = 100`** — entity-pack truncated first on overflow; Phase 12 baseline preserved byte-for-byte when `keytermProvider` absent. See [§3.6 / §5.2](Specs.md).
- **Setup happens on the phone** — Foundry connection bootstrap (bridge URL, auth token, character pick) lives in the **Even Realities App** per-plugin settings UI (verified upstream `support.evenrealities.com`: *"configure each widget individually through the Even App"*). Pairing is a **QR scan** from the Foundry desktop module, never a manual token copy-paste. The G2 stays keyboardless — no virtual keyboard, ever. See [§3.8 / §7.14.7](Specs.md).
- **No mocks at the boundary** — Foundry is the single source of truth, every action goes through `Activity#use()` / MidiQOL workflow, GM keeps full veto power.
- **Phase 0 gating** — every hardware assumption (R1 events, image API format, BLE bandwidth, partial-update API, DLE, audio chunk size) has a written GO/NO-GO test before code lands.

## Project Invariants (non-negotiable)

Four rules govern every PR, every audit, every release. They are constraints, not guidelines. See **[§0.1 of `Specs.md`](Specs.md)** for the formal definition.

| # | Invariant | One-line rule |
|---|---|---|
| **INV-1** | **Layout integrity** | Formatting and layout are **dynamic and always perfect** — frame corners, dividers and columns align to the character in every state, every content, every locale. **Never misaligned for any reason.** Verified by snapshot tests (§7.14.4 ck 11–15) and by the `Box` / `TextRun` render contract (§7.1a.7). |
| **INV-2** | **Online cross-validation** | Every technical claim cites a canonical upstream source (Even Hub, foundryvtt.com/api, dnd5e wiki, MCP spec, vendor pricing pages). Re-verified before each version bump and Phase 0 GO/NO-GO. Drift is classified, fixed, and logged in the changelog. The current spec is the result of **5 consecutive cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11) plus a **v0.9.12 INV-2 spot-check** re-verifying the image-API constraint against canonical (2026-05-14, drift verdict NEUTRO). |
| **INV-3** | **Documentation coherence** | `Specs.md` (canonical), `README.md` and `docs/showcase/index.html` are **always coherent** and updated **in the same commit** for any change touching cross-cutting claims (version, fps target, phase count, hardware spec, library version, locale set). No half-updated states. |
| **INV-4** | **Code quality** | Code is **clean, optimized, documented** — and **zero dead or unreachable code** is tolerated. Biome + TypeScript strict + Vitest coverage gate enforce it in CI. `// TODO` without an issue/ADR link is a CI failure. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions. See §0.1 INV-4. |

## Status

**All 17 phases (0 → 15) software-complete; hardware UAT pending Even Hub developer access.** v0.9.11 MVP (Phases 0–13) + v0.9.12 Quick Wins (Phases 14–15) both shipped 2026-05-17 — 79 plans, **2626 workspace tests passing**, 7 CI gates green. The current artifact is the **~4380-line spec** in [`Specs.md`](Specs.md) — verified end-to-end against upstream documentation across **5 cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11) plus a v0.9.12 INV-2 spot-check (2026-05-14, image-API constraint re-verified, drift NEUTRO) and a v0.9.12 Phase 15 INV-2 re-check (2026-05-17, EvenAI native API closure + Deepgram `keyterm` capability re-verified on 6 canonical Even Realities domains, status quo confirmed), with four **non-negotiable Project Invariants** ratified in §0.1 and a new `z=0.5` Idle Content Infill layer (§7.4c) that fills previously-empty raster-mode rows without violating the 4-image hardware budget. Phase 14 ratified end-to-end 2026-05-17 — INV-1 fixtures + cross-state column equality + LMT-DD-07 race coverage. Phase 15 closed end-to-end 2026-05-17 — Deepgram Keyterm Prompting + Entity-Pack Integration, VOICE-06..09 software-complete; socketlib handler count = 17 preserved (Phase 13 invariant + CI Gate 8). The 35 hardware-pending success criteria carry forward unchanged under ADR-0005 PROVISIONAL Branch A; closure path is `pnpm --filter @evf/validation-harness validate:all` once Even Hub access + G2 + R1 + a consenting DM are available.

The spec covers requirements, hardware constraints (Even Hub display + networking + audio + native AI limits + R1 product page), Foundry/dnd5e API surface (with `game.i18n` Localization API), data models, full UI/UX with ASCII mockups, layout integrity rules (§7.1a), i18n architecture with on-glasses language toggle (§7.16), G2 audio surface (§3.5), plugin execution model and 3-hop server-hosted distribution (§3.7), Even Realities App phone-side configuration UI for connection bootstrap (§3.8 / §7.14.7), the 6-layer raster pipeline, the optional MCP voice module, a 13-week MVP roadmap with Phase 0 validation protocol, risk register, library stack research, and failure modes.

## Roadmap snapshot

| Phase | Status | Deliverable |
|---|---|---|
| 0 | ✅ v0.9.11 | Hardware/SDK validation (R1 events · `updateImageRawData` format · BLE bandwidth · partial-update API · DLE) — ADR-0005 PROVISIONAL Branch A |
| 1 | ✅ v0.9.11 | Monorepo skeleton · shared protocol · CI · ADR-0001..04 + 0008 |
| 2 | ✅ v0.9.11 | Foundry module: readers + WS server + capability handshake + QR pairing |
| 3 | ✅ v0.9.11 | Bridge: REST + WS + tool registry + Docker + bearer auth + Prometheus |
| 4a | ✅ v0.9.11 | G2 app: layered UI engine + raster pipeline (6 layers) + glyph fallback + Status HUD; ADR-0009 ACCEPTED |
| 4b | ✅ v0.9.11 | Overlay panel API + toast queue + boot errors + death-saves + concentration-drop; ADR-0009 Amd 1 |
| 5 | ✅ v0.9.11 | Panel plugin system + Sheet (6 tabs) + Combat / Log / Spellbook / Inventory + dual-edition + i18n |
| 6 | ✅ v0.9.11 | R1 integration + Quick Action menu + INV-5 Gesture Determinism ratified |
| 7 | ✅ v0.9.11 | Foundry write path: `activity.use()` via socketlib executeAsGM single-workflow-origin (ADR-0011); 14-handler invariant |
| 8 | ✅ v0.9.11 | Manual action UX (tap-to-cast / use / attack + action-result toasts + Quick-action bar) |
| 9 | ✅ v0.9.11 | Action economy enforcement + reactions + slot consumption + concentration handling |
| 10 | ✅ v0.9.11 | Polish + INV-1..5 verification suite + WsReconnect + PerfProbe — **MVP SOFTWARE-COMPLETE** |
| **— end MVP —** | | |
| 11 | ✅ v0.9.11 | V2: `foundry-mcp` MCP server (Streamable HTTP + 4 resources + Claude Desktop config) |
| 12 | ✅ v0.9.11 | V2: voice UX tuning (GM-Agent prompt + IT↔EN STT spell-name lookup) |
| 13 | ✅ v0.9.11 | V2 stretch: ACT-04 reaction execution + STRETCH-06 portrait (flag-gated); 7 STRETCH items carry forward |
| **— v0.9.12 Quick Wins —** | | |
| 14 | ✅ v0.9.12 | Raster z=0.5 Idle Content Infill (INV-1 fixtures + ADR-0001 Amd 1 RATIFIED + INV-3 atomic 3a0c5cf) |
| 15 | ✅ v0.9.12 | Deepgram Keyterm Prompting + Entity-Pack Integration (Nova-3 keyterm wired + static/dynamic union + hot-update; INV-3 atomic dc161d6) |

## Hardware

- **Even Realities G2** smart glasses — 576 × 288 px monocular, 4-bit greyscale (16 levels of green), 4 image + 8 other containers per page, 200 × 100 max image size. **4-mic directional array** (single audio stream PCM 16 kHz s16le mono via `bridge.audioControl()`), **no speaker / no audio output** (visual-only feedback), no camera. *([Even Hub display guide](https://hub.evenrealities.com/docs/guides/display) · [device APIs](https://hub.evenrealities.com/docs/guides/device-apis))*
- **Even Realities R1** smart ring — BLE, gestures (tap, scroll, long-press) + biometrics (HR / HRV / SpO₂ / skin temp), zirconia ceramic + medical-grade stainless steel, IP68 50 m / 30 min, ~4 days battery. *([Even smart ring page](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.x (Activity system mandatory). *([dnd5e](https://github.com/foundryvtt/dnd5e))*

## Stack

- **Bridge**: Node.js 24 LTS + Fastify 5 + `ws` 8 + Redis (optional, Phase 13 stretch) + Docker Compose
- **G2 app**: HTML/JS plugin (Even Hub WebView), TypeScript build, `image-q` + `upng-js` + `xxhash-wasm` for raster pipeline (browser-side), `OffscreenCanvas` GPU resize
- **Foundry module**: `dnd5e` 5.x adapter, `socketlib`, optional `MidiQOL`
- **MCP** (optional V2): `@modelcontextprotocol/sdk` (TypeScript), exposes Foundry tools/resources to any MCP client
- **Tooling**: pnpm workspaces · Vitest · Biome · Changesets

## Documentation

- **[`Specs.md`](Specs.md)** — single source of truth (v0.9.12, ~4380 lines, fully cross-checked against upstream docs across 5 rounds + v0.9.12 spot-check + v0.9.12 Phase 15 INV-2 re-verification 2026-05-17)
- **[`docs/showcase/index.html`](docs/showcase/index.html)** — interactive feature showcase (HTML5/JS, animated)
- **[`.planning/milestones/`](.planning/milestones/)** — milestone archives: `v0.9.11-ROADMAP.md` + `v0.9.11-REQUIREMENTS.md` + `v0.9.11-phases/` (15 phase dirs) · `v0.9.12-ROADMAP.md` + `v0.9.12-REQUIREMENTS.md` + `v0.9.12-phases/` (2 phase dirs).
- **[`docs/architecture/`](docs/architecture/)** — 10 ADRs ACCEPTED: 0001 layered UI (Amendment 1 RATIFIED 2026-05-17 con z=0.5) · 0002 protocol versioning · 0003 tool-registry pattern · 0004 voice via MCP (not internal) · 0005 Phase 0 GO/NO-GO PROVISIONAL Branch A · 0006 raster pipeline library stack · 0008 code-quality configuration · 0009 layer-manager contract (Amendment 1 toast-cohabit) · 0010 panel-plugin registry · 0011 Foundry write-path single-workflow-origin. ADR-0007 reserved (RTL → V2 stretch).

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
