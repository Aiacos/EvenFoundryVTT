# EvenFoundryVTT

> Play **Dungeons & Dragons 5e** on **FoundryVTT** through **Even Realities G2** AR glasses, controlled with the **Even R1** smart ring — keep your eyes on the table, not on a laptop.

[![status: v0.9.13 shipped](https://img.shields.io/badge/status-v0.9.13%20shipped-brightgreen)](#status)
[![spec: v0.9.13](https://img.shields.io/badge/spec-v0.9.13-blue)](Specs.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)
[![dnd5e: 5.x](https://img.shields.io/badge/dnd5e-5.3.x-red)](https://github.com/foundryvtt/dnd5e)
[![Foundry: v13.347+](https://img.shields.io/badge/foundry-v13.347%2B-orange)](https://foundryvtt.com)
[![i18n: ready](https://img.shields.io/badge/i18n-ready-brightgreen)](Specs.md#716-localization--internationalization-i18n)

---

## Installation

EvenFoundryVTT has three components. Install them in order:

### 1. Foundry Module

In Foundry → **Setup** → **Add-on Modules** → **Install Module** → paste this **Manifest URL**:

```
https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
```

Same URL works on **The Forge** (Bazaar → *+ Install Module from a Manifest*). Foundry will auto-install `socketlib`, `midi-qol`, and require dnd5e ≥ 5.3.3.

> **Note:** the manifest URL only works once a GitHub Release exists. If install fails with *"Failed to fetch package manifest"*, no release has been published yet — see [`docs/release/foundry-module.md`](docs/release/foundry-module.md) for cutting a release. Until then, install in dev mode by symlinking `packages/foundry-module/` into your Foundry `Data/modules/evenfoundryvtt/` folder (then run `pnpm --filter @evf/foundry-module build`).

### 2. Bridge (Docker)

Pull the pre-built image from GitHub Container Registry:

```bash
docker pull ghcr.io/aiacos/evf-bridge:latest
```

Version-pinned tags (e.g. `ghcr.io/aiacos/evf-bridge:0.1.0`) are listed on the
[Releases page](https://github.com/Aiacos/EvenFoundryVTT/releases).

Or run via Docker Compose (builds locally from source — recommended for homelab):

```bash
cd deploy/
cp .env.example .env
# Edit .env:
#   EVF_INTERNAL_SECRET=$(openssl rand -base64 32)
#   EVF_PLUGIN_HOST_URL=https://your-g2app-host.example.com
docker compose up -d
```

See [`deploy/.env.example`](deploy/.env.example) for the full env-var contract and
[`docs/release/bridge.md`](docs/release/bridge.md) for the GHCR first-push visibility
note (one-time manual step required after the first release).

### 3. G2 App (static HTTPS host)

Download `g2-app-dist.zip` from the
[GitHub Release](https://github.com/Aiacos/EvenFoundryVTT/releases/latest),
extract, and serve the `dist/` directory from any HTTPS static host (nginx, Caddy,
GitHub Pages, Cloudflare Pages):

```bash
unzip g2-app-dist.zip
# Serve dist/ via your preferred HTTPS host, e.g.:
npx serve dist/
# or: cp -r dist/ /var/www/evf-g2app/
```

Set `EVF_PLUGIN_HOST_URL` in `deploy/.env` to the origin of your static host
(e.g. `https://g2app.yourdomain.com`). The bridge uses this value for CORS — it
must be an exact origin-complete URL (no wildcards, per Specs.md §3.3).

(The Compose project is named `evenfoundryvtt`; the container is `evf-bridge`.)

### 4. Testing on G2 — dev mode vs the `.ehpk`

Two different paths — don't confuse them (uploading an `.ehpk` as a "trial version" is
what produces the Even app's **"trial version expired"** error):

- **Dev mode (no expiry, hot reload)** — the right tool for iterating. Run the dev server
  and load it on the glasses via QR:
  ```bash
  pnpm --filter @evf/g2-app dev        # vite dev server on :5173
  pnpm --filter @evf/g2-app dev:qr     # QR for http://<LAN-IP>:5173 — scan in the Even app
  ```
  Phone + machine on the same LAN; the app hot-reloads on every save. Verbatim Even docs:
  *"Your app loads on the glasses with hot reload support."*
- **`.ehpk` (for shipping / short-lived private test)** — a portal trial upload **expires**.
  Regenerate a fresh bundle (CI also attaches one to every Release):
  ```bash
  pnpm --filter @evf/g2-app pack:ehpk  # → packages/g2-app/evenfoundryvtt.ehpk
  ```
  A **permanent** install only comes from a portal submission Even approves.

Full runbook: [`docs/release/evenhub.md`](docs/release/evenhub.md) ·
wiki: [Testing & Distribution](https://github.com/Aiacos/EvenFoundryVTT/wiki/Testing-and-Distribution).

### Simulator Testing (local dev loop)

One-command EvenHub simulator dev/test harness — no real glasses required:

```bash
pnpm sim start               # bridge (no-auth) + seed fixtures + vite + EvenHub simulator
pnpm sim start --actor 6KWxQXAiJgz4zKlS   # select Dante as the rendered PC
pnpm sim shot /tmp/glasses.png            # capture a 576x288 glasses screenshot
pnpm sim stop                             # tear down all three services
```

Full documentation: **[`docs/simulator-testing.md`](docs/simulator-testing.md)**

### Self-Hosting

The complete end-to-end deployment guide lives at
**[`docs/self-hosting.md`](docs/self-hosting.md)**.

The stack is: Foundry module → bridge (Docker Compose) → plugin host (static HTTPS, Caddy) →
G2 glasses (Even Realities App WebView). Each self-hoster must build their own `.ehpk` with
their own bridge + plugin-host HTTPS origins baked in — the Even Hub WebView enforces the
network whitelist at runtime with no wildcards (Specs.md §3.3). Portal submission is manual
(Even Hub CLI has no `publish`/`submit` command; INV-2, re-verified 2026-05-31).

---

## In one sentence

**EvenFoundryVTT is a bridge between FoundryVTT and the Even Realities G2 AR glasses.** The D&D 5e player wears the glasses, drives the panels with the R1 ring, and sees their character sheet / combat tracker / map / log right in their field of view — without ever looking away from the table, the DM, the other players. The Foundry-side module reads game state and pushes it to the glasses; a Node.js bridge handles reverse-proxy duties with bearer auth and idempotency; the player pastes the bearer token into the phone-side wizard to pair.

### What's done today (v0.9.13 shipped — 20/20 phases software-complete)

- ✓ **Full MVP end-to-end** — Phase 0 → 13 (v0.9.11 MVP) + Phase 14 (z=0.5 idle infill) + Phase 15 (Deepgram Keyterm) shipped 2026-05-17 + Phase 16 (Sheet abilities) + Phase 17 (Sheet skills) + Phase 18 (Phase-14.1 polish) shipped 2026-05-18. 9/9 v1 REQ-IDs from the v0.9.13 milestone Resolved (6 SHEET + 3 INFILL-14.1).
- ✓ **G2 ↔ Foundry pairing** via copyable bearer token from the GM settings (PairModal shows bridge URL + token; token masked by default with Reveal/Copy), pasted into the phone wizard — bearer 24h, per-pair internal_secret, timing-safe-equal on every secret comparison. No QR scan: the Even Hub platform exposes no camera/QR-scan API to apps.
- ✓ **Foundry state reads** (PC, combat, scene, event log, entity-pack of items/weapons/armor/NPCs/monsters) with real-time push via the `/internal/delta` WebSocket multiplex.
- ✓ **Production-ready bridge** — Fastify + Docker Compose + `/healthz` / `/readyz` / `/metrics` Prometheus + RFC-compliant idempotency-key middleware + full Tool Registry MVP.
- ✓ **Setup wizard** in vanilla TS on the phone (3-step: bridge URL → token → PC) + Even Realities App per-plugin settings.
- ✓ **Full layered UI rendering** — 4-bit greyscale raster + glyph fallback + z=0.5 idle content infill (NEW v0.9.12) + persistent Status HUD + overlay panels (6-tab Sheet, Combat tracker, Inventory, Spellbook, Log). **Character sheet Main + Skills tabs fully data-bound from dnd5e (NEW v0.9.13)** — ability scores · saving throws with `◉`/`○` proficiency markers · 18 skills with `○`/`◉`/`★` glyphs (half-prof 0.5 rounds up to `◉`) · senses line passives (Perception/Insight/Investigation).
- ✓ **Foundry write path** — `activity.use()` via socketlib `executeAsGM` (single-workflow-origin, ADR-0011), 17 socketlib handlers registered (CI Gate 8 invariant preserved end-to-end through v0.9.13 — both Sheet phases are pure read-path extensions), `MidiQOL.completeActivityUse` when present.
- ✓ **Action economy enforcement** — Action / Bonus / Reaction, spell slot consumption, concentration handling, multi-attack tracker, reaction passive notifications, death saves, AoE templates.
- ✓ **Manual action UX** — tap-to-cast / attack / use, Quick Action menu, action-result toast queue (FIFO + squash).
- ✓ **i18n** — IT + EN catalogs + on-glasses language override (Quick Action `[N] Language`); build-time width-budget validation (INV-1).
- ✓ **R1 integration** — gesture routing (tap / swipe-up / swipe-down / double-tap), INV-5 Gesture Determinism ratified.
- ✓ **Voice (V2 OPTIONAL shipped)** — `foundry-mcp` Streamable HTTP server, Deepgram Nova-3 Multilingual STT with Keyterm Prompting (+625% recall on esoteric names like Bigby's Hand, Counterspell), vocabulary union of static SRD (70 × IT + EN = 140) + dynamic Foundry-derived entity-pack, hot-updated via WS delta (250 ms debounce + drain-then-restart mutex).
- ✓ **Quality** — **2668 workspace tests** green, coverage ≥80% in the critical packages, TypeScript strict, Biome lint clean, 7 CI gates green on every PR, INV-1..5 verification suite (`inv:all`) + INV-3 atomic doc-coherence enforced.

### Milestones shipped

- **v0.9.11 MVP (2026-05-17).** Phases 0–13. Full MVP end-to-end software-complete, 35 hardware-pending SCs under ADR-0005 Branch A.
- **v0.9.12 Quick Wins (2026-05-17).** Phases 14–15. Raster z=0.5 idle content infill + Deepgram Keyterm Prompting / Entity-Pack Integration. 2 phases, 8/8 plans, 9/9 v1 REQ-IDs Resolved. Software-only.
- **v0.9.13 (2026-05-18) — Sheet Data Completion + Polish.** Character sheet Main + Skills tabs fully data-bound; Phase-14.1 spec-drift polish closes 3 advisory UI-REVIEW findings. Workspace tests **2668/2668** green. 3 phases (16–18), 7 plans, 9/9 v1 REQ-IDs closed. Software-only — zero new hardware-pending SCs.

### What's NOT done yet (deferred beyond v0.9.13)

- ✗ **Hardware UAT** — 35 success criteria across Phases 4a/4b/5/6/7/8/9/10/12/13 flagged `human_needed` under ADR-0005 PROVISIONAL Branch A. Software-complete; they need **Even Hub developer access + G2 + R1 + a consenting DM** for end-to-end on-device verification. Closure path: `pnpm --filter @evf/validation-harness validate:all`.
- ✗ **Picovoice Rhino edge classifier** — conditional on SC-12-01 (Claude Desktop latency p50 > 800 ms). Not measurable without hardware.
- ✗ **MCP polish / V2 hardening** — auth flow, multi-client semantics, error UX in `foundry-mcp`. Phase 11 follow-up; deferred.

---

## What is it?

**EvenFoundryVTT** projects a glanceable HUD of a FoundryVTT D&D session directly onto Even Realities G2 AR glasses (576×288 4-bit greyscale display), driven by gestures from the Even R1 smart ring. Imagine a phosphor-green tactical HUD — *Alien Nostromo / VFD / CRT* — floating in your field of view while the real table, miniatures, and human DM stay center stage.

| Pillar | What it gives you |
|---|---|
| **Map base layer** | Live Foundry canvas, rasterized + Floyd-Steinberg dithered into 4-bit green, 400×200 px effective (hardware max — 4 image containers × 200×100). Glyph fallback (text grid) when bandwidth is thin. |
| **Idle Content Infill (z=0.5)** | **NEW v0.9.12** — text strips that fill the otherwise-empty rows below the raster tiles when no overlay is active (combat log mini · z=0.5 label · stats: mode / fps / BLE). Auto-demolished when an overlay opens, auto-reborn when it closes. INV-1 layout-preserving. See [§7.4c](Specs.md). Ratified Phase 14 (2026-05-17). |
| **Persistent Status HUD** | HP / AC / action economy / spell slots / conditions, always in the corner — never hidden by overlays. |
| **Overlay panels** | Sheet (6 tabs: Main / Skills / Inventory / Spells / Feats / Bio), Combat tracker, Event log, Spellbook, Inventory — all stacked over the map like Foundry desktop windows. |
| **R1 gesture control** | tap = cycle/primary • double-tap = exit (root) / close (panel) • swipe = navigate • over-scroll (swipe-up at top) = Quick Action menu. |
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
- **Setup happens on the phone** — Foundry connection bootstrap (bridge URL, auth token, character pick) lives in the **Even Realities App** per-plugin settings UI (verified upstream `support.evenrealities.com`: *"configure each widget individually through the Even App"*). The app is installed via Even Hub (dev: `evenhub qr` loads the plugin-host URL into the Even app; prod: `.ehpk` → portal review → store), then the player **pastes** the bearer token copied from the Foundry desktop PairModal — there is no QR scan, because the Even Hub platform exposes no camera/QR-scan API to apps (`hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*). The G2 stays keyboardless. See [§3.8 / §7.14.7](Specs.md).
- **No mocks at the boundary** — Foundry is the single source of truth, every action goes through `Activity#use()` / MidiQOL workflow, GM keeps full veto power.
- **Phase 0 gating** — every hardware assumption (R1 events, image API format, BLE bandwidth, partial-update API, DLE, audio chunk size) has a written GO/NO-GO test before code lands.

## Project Invariants (non-negotiable)

Four rules govern every PR, every audit, every release. They are constraints, not guidelines. See **[§0.1 of `Specs.md`](Specs.md)** for the formal definition.

| # | Invariant | One-line rule |
|---|---|---|
| **INV-1** | **Layout integrity** | Formatting and layout are **dynamic and always perfect** — frame corners, dividers and columns align to the character in every state, every content, every locale. **Never misaligned for any reason.** Verified by snapshot tests (§7.14.4 ck 11–15) and by the `Box` / `TextRun` render contract (§7.1a.7). |
| **INV-2** | **Online cross-validation** | Every technical claim cites a canonical upstream source (Even Hub, foundryvtt.com/api, dnd5e wiki, MCP spec, vendor pricing pages). Re-verified before each version bump and Phase 0 GO/NO-GO. Drift is classified, fixed, and logged in the changelog. The current spec is the result of **5 consecutive cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11), a v0.9.12 INV-2 spot-check (2026-05-14, image-API constraint, drift NEUTRO), a v0.9.12 Phase 15 INV-2 re-check (2026-05-17, EvenAI native API closure + Deepgram `keyterm`), and a **v0.9.13 INV-2 cross-check** (2026-05-18, dnd5e 5.3.3 abilities + skills schema re-verified on `github.com/foundryvtt/dnd5e@release-5.3.3` + wiki Roll-Formulas). |
| **INV-3** | **Documentation coherence** | `Specs.md` (canonical), `README.md` and `docs/showcase/index.html` are **always coherent** and updated **in the same commit** for any change touching cross-cutting claims (version, fps target, phase count, hardware spec, library version, locale set). No half-updated states. |
| **INV-4** | **Code quality** | Code is **clean, optimized, documented** — and **zero dead or unreachable code** is tolerated. Biome + TypeScript strict + Vitest coverage gate enforce it in CI. `// TODO` without an issue/ADR link is a CI failure. JSDoc/TSDoc on every public API. Hot-path benchmarks gate regressions. See §0.1 INV-4. |

## Status

**All 20 phases (0 → 18) software-complete; hardware UAT pending Even Hub developer access.** v0.9.11 MVP (Phases 0–13) + v0.9.12 Quick Wins (Phases 14–15) both shipped 2026-05-17; v0.9.13 Sheet Data Completion + Polish (Phases 16–18) shipped 2026-05-18 — 86 plans total, **2668 workspace tests passing**, 7 CI gates green. The current artifact is the **~4400-line spec** in [`Specs.md`](Specs.md) — verified end-to-end against upstream documentation across **5 cross-check rounds** (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11) plus a v0.9.12 INV-2 spot-check (2026-05-14, image-API constraint re-verified, drift NEUTRO), a v0.9.12 Phase 15 INV-2 re-check (2026-05-17, EvenAI native API closure + Deepgram `keyterm` capability re-verified on 6 canonical Even Realities domains, status quo confirmed), and a v0.9.13 INV-2 cross-check (2026-05-18, dnd5e 5.3.3 canonical abilities + skills schema re-verified on `github.com/foundryvtt/dnd5e@release-5.3.3` + dnd5e wiki Roll-Formulas), with four **non-negotiable Project Invariants** ratified in §0.1 and a `z=0.5` Idle Content Infill layer (§7.4c) that fills previously-empty raster-mode rows without violating the 4-image hardware budget. Phase 14 ratified end-to-end 2026-05-17 — INV-1 fixtures + cross-state column equality + LMT-DD-07 race coverage. Phase 15 closed end-to-end 2026-05-17 — Deepgram Keyterm Prompting + Entity-Pack Integration, VOICE-06..09 software-complete. Phases 16–18 closed 2026-05-18 — Sheet Main tab abilities + Skills tab modifiers + Phase-14.1 spec-drift polish; socketlib handler count = **17** preserved end-to-end through v0.9.13 (CI Gate 8 invariant + both Sheet phases are pure read-path extensions). The 35 hardware-pending success criteria carry forward unchanged under ADR-0005 PROVISIONAL Branch A; closure path is `pnpm --filter @evf/validation-harness validate:all` once Even Hub access + G2 + R1 + a consenting DM are available.

The spec covers requirements, hardware constraints (Even Hub display + networking + audio + native AI limits + R1 product page), Foundry/dnd5e API surface (with `game.i18n` Localization API), data models, full UI/UX with ASCII mockups, layout integrity rules (§7.1a), i18n architecture with on-glasses language toggle (§7.16), G2 audio surface (§3.5), plugin execution model and 3-hop server-hosted distribution (§3.7), Even Realities App phone-side configuration UI for connection bootstrap (§3.8 / §7.14.7), the 6-layer raster pipeline, the optional MCP voice module, a 13-week MVP roadmap with Phase 0 validation protocol, risk register, library stack research, and failure modes.

## Roadmap snapshot

| Phase | Status | Deliverable |
|---|---|---|
| 0 | ✅ v0.9.11 | Hardware/SDK validation (R1 events · `updateImageRawData` format · BLE bandwidth · partial-update API · DLE) — ADR-0005 PROVISIONAL Branch A |
| 1 | ✅ v0.9.11 | Monorepo skeleton · shared protocol · CI · ADR-0001..04 + 0008 |
| 2 | ✅ v0.9.11 | Foundry module: readers + WS server + capability handshake + token-paste pairing |
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
| **— v0.9.13 Sheet Data Completion + Polish —** | | |
| 16 | ✅ v0.9.13 | Sheet Ability Scores (CharacterSnapshotSchema.abilities + character-reader.ts wiring + renderMainTab data binding) |
| 17 | ✅ v0.9.13 | Sheet Skills Tab (CharacterSnapshotSchema.skills + character-reader.ts wiring + renderSkillsTab modifiers + proficiency glyphs) |
| 18 | ✅ v0.9.13 | Phase-14.1 spec-drift polish (UI-SPEC §2/§10 reconcile + IT locale leak fix + Z05-INV-02b triade extension; single INV-3 atomic commit) |

## Hardware

- **Even Realities G2** smart glasses — 576 × 288 px monocular, 4-bit greyscale (16 levels of green), 4 image + 8 other containers per page, 200 × 100 max image size. **4-mic directional array** (single audio stream PCM 16 kHz s16le mono via `bridge.audioControl()`), **no speaker / no audio output** (visual-only feedback), no camera. *([Even Hub overview](https://hub.evenrealities.com/docs/getting-started/overview) · [display guide](https://hub.evenrealities.com/docs/guides/display) · [device APIs](https://hub.evenrealities.com/docs/guides/device-apis))*
- **Even Realities R1** smart ring — BLE, gestures (press, double-press, swipe-up, swipe-down) — the same 4-gesture set as the glasses (input-events canonical) — + biometrics (HR / HRV / SpO₂ / skin temp), zirconia ceramic + medical-grade stainless steel, IP68 50 m / 30 min, ~4 days battery. *([Even smart ring page](https://www.evenrealities.com/smart-ring))*
- **FoundryVTT** ≥ v13.347 (v14 verified) + **dnd5e** ≥ 5.3.x (Activity system mandatory). *([dnd5e](https://github.com/foundryvtt/dnd5e))*

## Stack

- **Bridge**: Node.js 24 LTS + Fastify 5 + `ws` 8 + Redis (optional, Phase 13 stretch) + Docker Compose
- **G2 app**: HTML/JS plugin (Even Hub WebView), TypeScript build, `image-q` + `upng-js` + `xxhash-wasm` for raster pipeline (browser-side), `OffscreenCanvas` GPU resize
- **Foundry module**: `dnd5e` 5.x adapter, `socketlib`, optional `MidiQOL`
- **MCP** (optional V2): `@modelcontextprotocol/sdk` (TypeScript), exposes Foundry tools/resources to any MCP client
- **Tooling**: pnpm workspaces · Vitest · Biome · Changesets · GitFlow (`feature/* → develop → main`, automated Changesets-driven releases)

## Documentation

- **[`Specs.md`](Specs.md)** — single source of truth (v0.9.13, ~4400 lines, fully cross-checked against upstream docs across 5 rounds + v0.9.12 spot-check + v0.9.12 Phase 15 INV-2 re-verification 2026-05-17 + v0.9.13 INV-2 cross-check 2026-05-18 on dnd5e 5.3.3 schema)
- **[`docs/showcase/index.html`](docs/showcase/index.html)** — interactive feature showcase (HTML5/JS, animated)
- **[`.planning/milestones/`](.planning/milestones/)** — milestone archives: `v0.9.11-ROADMAP.md` + `v0.9.11-REQUIREMENTS.md` + `v0.9.11-phases/` (15 phase dirs) · `v0.9.12-ROADMAP.md` + `v0.9.12-REQUIREMENTS.md` + `v0.9.12-phases/` (2 phase dirs). v0.9.13 phases (16–18) live under `.planning/phases/` until next cleanup cycle.
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
