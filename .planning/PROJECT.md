# EvenFoundryVTT (EVF)

> **Single Source of Truth**: questo PROJECT.md è una proiezione GSD-friendly di [`Specs.md`](../Specs.md) (v0.9.11, ~4250 righe). La spec resta canonica per ogni claim tecnico, hardware, API, mockup, decision; PROJECT.md riassume il contesto operativo per il workflow GSD. Per disciplina **INV-3 (doc coherence)**, ogni cambio cross-cutting tocca PROJECT.md, Specs.md, README.md, showcase nello stesso commit.

## What This Is

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

## Core Value

**Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

## Requirements

### Validated

(None yet — design-only project, ship to validate)

### Active

#### Display & HUD
- [ ] **DISP-01**: HUD persistente con status PG (HP/AC/azioni/slot/condizioni) sempre visibile in corner card
- [ ] **DISP-02**: Layout layered (z=0 mappa, z=1 status HUD, z=2 overlay panel)
- [ ] **DISP-03**: Layout integrity garantita per tutti gli stati (INV-1, snapshot test §7.14.4 ck 11–15)

#### Map Rendering
- [ ] **MAP-01**: Raster pipeline 4-bit greyscale dithered (4 image container 2×2 = 400×200 px effective) — DEFAULT MVP
- [ ] **MAP-02**: Glyph mode fallback (text grid 96×24 char) — alternativa user-selectable
- [ ] **MAP-03**: 6-layer optimization stack (delta hash · sub-tile encoding · static caching · custom RLE · BLE 4.2+ DLE · adaptive frame rate)
- [ ] **MAP-04**: 5 fps standard committed / 15 fps aspirational
- [ ] **MAP-05**: Mode toggle runtime via Quick Action `[M] Map ctrl`

#### Character Sheet
- [ ] **SHEET-01**: 6 tab Foundry-faithful (Main / Skills / Inventory / Spells / Feats / Bio)
- [ ] **SHEET-02**: Data binding live verso `actor.system.*` dnd5e 5.x
- [ ] **SHEET-03**: Dual-edition support (PHB 2014 + PHB 2024 via `core.modernRules`)
- [ ] **SHEET-04**: Tab strip equal-width (INV-1 layout integrity)

#### Combat & Action
- [ ] **COMB-01**: Combat tracker con turno corrente, iniziativa, effetti, durate concentrazione
- [ ] **COMB-02**: Action economy widget (action / bonus / reaction / move) con enforcement
- [ ] **COMB-03**: Quick-action bar `[A][S][I][M]` su Combat overlay
- [ ] **ACT-01**: Manual cast/attack/use via R1 (scroll → tap → confirm target)
- [ ] **ACT-02**: AoE template placement via `AbilityTemplate.fromActivity()`
- [ ] **ACT-03**: GM-side actions forwarded via `socketlib.executeAsGM`
- [ ] **ACT-04**: Reaction handling (Shield, Counterspell) — V2

#### Navigation & Input
- [ ] **NAV-01**: R1 gesture model: tap = cycle, double-tap = back, scroll = navigate, long-press = Quick Action
- [ ] **NAV-02**: Quick Action menu (`[S][C][L][B][I][A][M][N][X]`) — list-modal full-screen
- [ ] **NAV-03**: Cross-overlay reachability + closability (verification checklist 15×, §7.14.4)
- [ ] **NAV-04**: Boot splash → handshake → main HUD flow

#### Foundry Integration
- [ ] **FOUN-01**: Foundry module `evenfoundryvtt` espone read API (character/combat/scene/log)
- [ ] **FOUN-02**: Bridge service Node.js (Fastify + ws + Docker) come reverse-proxy CORS-friendly
- [ ] **FOUN-03**: Write path via `activity.use()` + MidiQOL workflow (GM veto power preserved)
- [ ] **FOUN-04**: `TokenLayer.setTargets()` v13 multi-target

#### i18n / Localization
- [ ] **I18N-01**: Locale auto-detected da `game.i18n.lang` al boot
- [ ] **I18N-02**: Runtime override via Quick Action `[N] Language` (device-local, non tocca world settings)
- [ ] **I18N-03**: Catalogi forniti da Foundry (dnd5e + module) — G2 ships no strings
- [ ] **I18N-04**: Width-budget per chiave + fallback EN (INV-1 i18n stress)
- [ ] **I18N-05**: MVP target: IT + EN; best-effort: DE/ES/FR/PT-BR

#### Connection Bootstrap (Phone-Side)
- [ ] **CONN-01**: Phone setup wizard nell'Even Realities App (3-step: profile/URL → token → character)
- [ ] **CONN-02**: Bridge URL + auth token persistente phone-side (Tier 3 storage §11.5.5)
- [ ] **CONN-03**: Pair-G2 flow Foundry-desktop-side: bottone "Pair a G2 device" → QR 24h
- [ ] **CONN-04**: Auto-connect on G2 wear (Even Realities App detecta wear via SDK)
- [ ] **CONN-05**: Bearer token rotazione 24h + revoke registry DM-side

#### Voice / AI (V2 OPZIONALE)
- [ ] **VOICE-01**: Audio capture via `bridge.audioControl()` → PCM 16 kHz s16le mono al plugin
- [ ] **VOICE-02**: Modulo opzionale `foundry-mcp` espone tool Foundry via Model Context Protocol
- [ ] **VOICE-03**: Compatible con Claude Desktop / qualunque MCP client
- [ ] **VOICE-04**: STT esterno (cloud Deepgram / AssemblyAI o self-hosted whisper) — mai on-glasses
- [ ] **VOICE-05**: Output sempre visivo (toast + status update) — G2 no speaker

### Out of Scope

- **Lato GM** — il DM continua a usare laptop tradizionale; il G2 plugin è player-side only.
- **Rendering 3D scene** complete su G2 — vincolo hardware (4-bit greyscale, 200×100 max image container).
- **Multi-player sync** tra più paia di G2 — single-player MVP, multi-player è Phase 13 V2 stretch.
- **Sostituzione del DM umano** — qualunque AI futura è strumento, non arbitro.
- **Integrazione D&D Beyond diretta** — passa via Foundry come single source of truth.
- **AI vocale nel MVP** — esplicitamente differita a V2 via MCP server. MVP funziona al 100% senza alcun LLM.
- **Audio output al user** — G2 non ha speaker; tutto il feedback resta visivo.
- **Native EvenAI hijack** — feature proprietaria Even Realities, non-API per dev (verbatim verificato §3.6); usare nostro stack STT/MCP esterno.
- **RTL languages** (Arabic, Hebrew) — V2 stretch, ADR-0007. G2 firmware monospace LTR-only.
- **Multi-tenant cloud SaaS** — Phase 13 stretch; MVP è single-tenant homelab Docker Compose.

## Context

- **Stato**: design-only, zero righe di codice applicativo. Artifact corrente = `Specs.md` v0.9.11 (~4250 righe) + `README.md` + `docs/showcase/index.html`. Cross-validazione upstream completata in **5 round** consecutivi (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11).
- **Ecosistema target**: FoundryVTT v13.347+ (verified v14), dnd5e 5.3.x mandatory (Activity system). v12 NON supportato.
- **Hardware verificato**: Even G2 (576×288 4-bit, 4-mic array, no speaker, plugin gira nel WebView dell'Even Realities App sul telefono — codice servito da server HTTP separato), Even R1 (BLE, gestures tap/scroll/long-press, biometrics, ~4 days battery, IP68).
- **Architettura 4-boundary**: G2 (display+sensori) ↔ Even Realities App phone (WebView host) ↔ Bridge service (Node.js) ↔ Foundry VTT + dnd5e ↔ optional V2: MCP client.
- **3-hop deployment**: plugin host URL (server statico) + Even Realities App phone (WebView) + bridge URL (REST/WS verso Foundry).
- **Linguaggi sviluppo**: TypeScript strict, Vitest, Biome (lint+format), pnpm workspaces, Docker Compose. Repo monorepo.
- **Stack raster pipeline**: `image-q` v4.0.0 (FS/Atkinson/Bayer dither) + `upng-js` v2.1.0 (4-bit indexed PNG) + `xxhash-wasm` v1.x (delta hash) + custom RLE 4-bit. Bundle ~90 KB gzipped.
- **MCP transport** (V2): stdio + Streamable HTTP (HTTP+SSE deprecato dal 2025-03-26).

## Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image max 200×100 px, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture solo `tap / scroll / long-press`; nessun input testuale possibile. — *Hardware Even Realities.*
- **Plugin execution model**: il codice plugin è servito da un server HTTP separato; l'Even Realities App lo carica nel WebView phone. Il G2 firmware NON esegue il nostro codice. — *Verbatim simulator README.*
- **Network**: HTTPS obbligatorio in prod; ogni dominio outbound deve essere in `app.json` whitelist (origin completo, no wildcards). — *Vincolo Even Hub.*
- **BLE bandwidth**: target ≥200 kbps sustained; <100 kbps blocca raster MVP (degrade a glyph-only). — *Phase 0 §10.0.3.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Setting MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment MVP**: Docker Compose homelab single-tenant; cloud è stretch Phase 13. — *§11.5.3.*
- **Auth**: bearer opaque 24h, paired via QR scan dal modulo Foundry desktop. — *§11.5.4.*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Project Invariants ratificati (INV-1/2/3/4) | Layout integrity + online cross-validation + doc coherence + code quality come vincoli vincolanti, non guideline | — Pending (binding da Phase 1) |
| Raster come default MVP, glyph come fallback | Faithful al canvas Foundry; max area sull'hardware G2; Doom-on-exotic-devices pattern | — Pending validation Phase 0 |
| 6-layer optimization stack per fps | 5 fps committed achievable senza tutti i layer; 15 fps stretch richiede DLE+partial-update API | — Pending Phase 0 §10.0.6/§10.0.7 |
| MVP manuale, voice/AI V2 opzionale via MCP | EvenAI nativo è non-API per dev (§3.6) → V2 deve essere external MCP; MVP deterministico per ridurre rischio | ✓ Confermato architetturalmente |
| Settings 3-superficie (Foundry world / Even App phone / G2 device-local) | G2 non ha tastiera; bootstrap deve vivere phone-side; world settings restano canoniche per game state | ✓ Confermato v0.9.11 |
| QR pairing per bearer token | Riduce attack surface (no clipboard non sicura); audit trail DM-side; revoca per-device | ✓ Confermato v0.9.11 |
| 13-week MVP (Phase 0 → 10) + V2 (Phase 11 → 13) | Phase 0 gating su validation hardware; Phase 4 è il pezzo a maggior rischio (raster pipeline) | — Pending |
| Plugin code server-hosted (3-hop deployment) | Verbatim simulator: code on server, WebView fetcha. Implica CDN-friendly + 2 origin in whitelist | ✓ Verificato v0.9.11 |
| Library stack `image-q` + `upng-js` + `xxhash-wasm` | 30-50% compute reduction vs custom; 90 KB gz; worker-safe | — Pending Phase 0 ADR-0006 |
| Trunk-based development + Changesets | Single-developer MVP, no long-lived branches; semver per package | — Pending Phase 1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

**Specs.md drift policy** (project-specific): se PROJECT.md e Specs.md divergono su un claim tecnico, **Specs.md vince** (è la fonte canonica). Aggiornare PROJECT.md per riallinearsi e committare insieme (INV-3).

---
*Last updated: 2026-05-10 after initialization (derived from Specs.md v0.9.11)*
