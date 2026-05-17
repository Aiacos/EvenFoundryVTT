# EvenFoundryVTT (EVF)

> **Single Source of Truth**: questo PROJECT.md è una proiezione GSD-friendly di [`Specs.md`](../Specs.md) (v0.9.11, ~4250 righe). La spec resta canonica per ogni claim tecnico, hardware, API, mockup, decision; PROJECT.md riassume il contesto operativo per il workflow GSD. Per disciplina **INV-3 (doc coherence)**, ogni cambio cross-cutting tocca PROJECT.md, Specs.md, README.md, showcase nello stesso commit.

## What This Is

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**v0.9.11 MVP shipped (software-complete) 2026-05-17.** V2 optional surface (foundry-mcp + voice UX + ACT-04 partial + STRETCH-06 flag-gated) inclusa nello stesso ciclo. Hardware-pending verification (35 SC) parcheggiata sotto ADR-0005 Branch A.

## Core Value

**Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

## Current State

- **Software**: v0.9.11 MVP shipped 2026-05-17 — 15 phases, 71 plans, 2,097 tests passing, ~99,642 LOC TypeScript across monorepo workspace (`packages/g2-app`, `packages/bridge`, `packages/foundry-module`, `packages/foundry-mcp`, `packages/shared-protocol`, `packages/shared-render`, `packages/validation-harness`).
- **Hardware verification**: deferred — 35 success criteria across Phases 4a/4b/5/6/7/8/9/10/12/13 marked `human_needed` under ADR-0005 PROVISIONAL Branch A. Closure path: `pnpm --filter @evf/validation-harness validate:all` once Even Hub access + G2 + R1 + consenting DM available.
- **Spec**: `Specs.md` v0.9.11 (~4250 righe). Boot-splash mockup §7.12 already bumped to v0.9.12 in Phase 10 Plan 04 (INV-3 atomic, commit `bcb4e91`); full Specs.md bump v0.9.11→v0.9.12 will happen during the v0.9.12 milestone (probable carry from quick-task `20260514-raster-dynamic-infill`).
- **Carry to v0.9.12**: 1 genuinely pending quick task (z=0.5 idle infill layer spec bump). Will become a v0.9.12 requirement during `/gsd-new-milestone`.
- **CI gates**: 7 quality gates green on every PR (Biome lint, TypeScript strict, Vitest coverage, INV-1..5 verification suite via `inv:all`, no-SSE grep gate, 14-socketlib-handler invariant, INV-3 atomic doc coherence).

## Current Milestone: v0.9.12 Quick Wins

**Goal:** Land two high-value software-only improvements that build on v0.9.11 MVP — without requiring Even Hub hardware access.

**Target features:**
- **Raster z=0.5 idle content infill layer** — carry-forward from quick-task `20260514-raster-dynamic-infill` (PLAN already scoped as v0.9.11→v0.9.12 spec bump). Fills previously-empty raster-mode map-area rows when no z=2 overlay is mounted; auto-demolishes on overlay mount. ADR-0001 amendment, INV-1 fixture coverage for transition states.
- **Deepgram Keyterm Prompting integration** — voice STT quality boost (+625% entity recall per research). Seeds keyterm vocabulary from BOTH the 70-spell SRD subset (static) AND the newly-shipped entity-pack Foundry vocabulary (dynamic — items/weapons/armor/NPCs/monsters). Locale-aware IT+EN feed for cross-lingual STT robustness.

**Key context:**
- Scope explicitly excludes hardware validation (no Even Hub access this cycle) — 35 SC `human_needed` from v0.9.11 carry forward under ADR-0005 PROVISIONAL Branch A unchanged.
- Research phase skipped — both features have pre-existing research artifacts (`raster-dynamic-infill` quick-task PLAN with INV-2 cross-check; `20260517-voice-intent-research` RESEARCH.md).
- Phase numbering continues from v0.9.11 (last phase = 13 → v0.9.12 starts at Phase 14).
- Synergy: the entity-pack pipeline shipped 2026-05-17 (quick-task `260517-k2g`) becomes a dynamic vocabulary source for the Deepgram Keyterm work — value > sum of parts.

## Requirements

### Validated (v0.9.11 MVP)

All 48 v1 REQ-IDs software-complete. Full traceability and final outcomes archived to [`.planning/milestones/v0.9.11-REQUIREMENTS.md`](milestones/v0.9.11-REQUIREMENTS.md).

#### Display & HUD
- ✓ **DISP-01** HUD persistente con status PG — v0.9.11 (Phase 4a)
- ✓ **DISP-02** Layout layered z=0/1/2 con 1 capture container — v0.9.11 (Phase 4a)
- ✓ **DISP-03** Layout integrity INV-1 per ogni stato — v0.9.11 (Phase 4a)
- ✓ **DEATH-01** Death saves status HUD — v0.9.11 (Phase 4b)
- ✓ **TOAST-01** Toast queue/stack FIFO + squash — v0.9.11 (Phase 4b)
- ✓ **BOOT-01** Boot error states ortogonali — v0.9.11 (Phase 4b)

#### Map Rendering
- ✓ **MAP-01..05** Raster pipeline 4-bit dithered + glyph fallback + 6-layer opt + fps targets + runtime toggle — v0.9.11 (Phase 4a/4b)

#### Character Sheet
- ✓ **SHEET-01..04** 6-tab Foundry-faithful + data binding + dual-edition + tab strip equal-width — v0.9.11 (Phase 5)

#### Combat & Action
- ✓ **COMB-01..03** Combat tracker + action economy + Quick-action bar — v0.9.11 (Phase 5/9)
- ✓ **CONC-01** Concentration drop modal — v0.9.11 (Phase 4b)
- ✓ **MULTI-01** Multi-attack tracker — v0.9.11 (Phase 7)
- ✓ **REACT-01** Reaction passive notification — v0.9.11 (Phase 7)
- ✓ **ACT-01..03** Manual cast/attack/use + AoE template + socketlib.executeAsGM — v0.9.11 (Phase 7/8)

#### Navigation & Input
- ✓ **NAV-01..04** Gesture model + Quick Action menu + cross-overlay reach + boot flow — v0.9.11 (Phase 4a/6)

#### Foundry Integration
- ✓ **FOUN-01..04** Read API + Bridge + write path via activity.use() + multi-target — v0.9.11 (Phase 2/3/7)
- ✓ **MIDIQ-01** MidiQOL config probe — v0.9.11 (Phase 0 code-complete, evidence pending)

#### i18n / Localization
- ✓ **I18N-01..05** Locale auto-detect + runtime override + Foundry catalogs + width-budget + IT/EN+best-effort — v0.9.11 (Phase 2/4a/5)

#### Connection Bootstrap
- ✓ **CONN-01..05** Phone wizard + persistent token + QR pairing + auto-connect + token rotation — v0.9.11 (Phase 2)

### V2 OPZIONALE (shipped early in v0.9.11)

- ✓ **VOICE-01..05** Audio capture + foundry-mcp + Claude Desktop + STT external + visual output — v0.9.11 (Phase 11-12)
- ✓ **ACT-04** Reaction execution (Shield/Counterspell + OA partial via Ready Action) — v0.9.11 (Phase 13, flag-gated)
- ✓ **STRETCH-06** Sheet portrait — v0.9.11 (Phase 13, flag-gated)

### V2 Stretch (Deferred)

- **STRETCH-01..05, 07, 08**: Multi-player sync · headless Foundry · biometric narrative · dnd5e v6 adapter · PF2e adapter · DSN raster stream · Multi-tenant cloud SaaS — all explicitly deferred to post-v0.9.11 milestones per Phase 13 minimal scope decision.

### Active (v0.9.12)

#### Raster Pipeline Extension
- [ ] **INFILL-01**: z=0.5 Idle Content Infill layer formalized in layered model (Specs.md §7.2 amendment)
- [ ] **INFILL-02**: 3 dynamic text containers (combat-log mini · z=0.5 label · stats strip) populating empty raster-mode rows when no overlay
- [ ] **INFILL-03**: Auto-demolish on z=2 overlay mount (no race condition; differential demolish via existing LayerManager.bundle())
- [ ] **INFILL-04**: ADR-0001 amendment formalizing z=0.5 layer (consistent with single-capture-container premise; no semantic change to z=0/1/2)
- [ ] **INFILL-05**: INV-1 fixtures for idle-fill states + overlay-mount transitions

#### Voice Recognition Quality
- [ ] **VOICE-06**: Deepgram Keyterm Prompting integration in `deepgram-stt.ts` (Phase 12 enhancement)
- [ ] **VOICE-07**: Keyterm vocabulary fed from static spell list (70 SRD) + dynamic entity-pack (Foundry-derived items/weapons/armor/NPCs/monsters)
- [ ] **VOICE-08**: Locale-aware keyterm (IT + EN both included; cross-lingual STT robustness)
- [ ] **VOICE-09**: Keyterm hot-update via WS delta (when entity-pack or spell-pack changes, keyterm list refreshes; same `/internal/delta` channel)

### Out of Scope

- **Lato GM** — il DM continua a usare laptop tradizionale; il G2 plugin è player-side only.
- **Rendering 3D scene** complete su G2 — vincolo hardware (4-bit greyscale, 200×100 max image container).
- **Multi-player sync** tra più paia di G2 — single-player MVP, multi-player è STRETCH-01 deferred.
- **Sostituzione del DM umano** — qualunque AI futura è strumento, non arbitro.
- **Integrazione D&D Beyond diretta** — passa via Foundry come single source of truth.
- **AI vocale come MVP-mandatory** — V2 optional surface shipped in v0.9.11 ma il core MVP funziona al 100% senza alcun LLM.
- **Audio output al user** — G2 non ha speaker; tutto il feedback resta visivo.
- **Native EvenAI hijack** — feature proprietaria Even Realities, non-API per dev (verbatim verificato §3.6, re-verified 2026-05-17 6-source INV-2 round).
- **RTL languages** (Arabic, Hebrew) — V2 stretch, ADR-0007 reserved. G2 firmware monospace LTR-only.
- **Multi-tenant cloud SaaS** — STRETCH-08 deferred; MVP è single-tenant homelab Docker Compose.

## Context

- **Stato**: software-complete MVP. Codebase live (~99,642 LOC TS), monorepo pnpm workspace, 7 packages, CI green su 7 quality gates, 2,097 test passanti, INV-1..5 verification suite implementata e operativa via `inv:all` orchestrator. Cross-validazione upstream completata in **6 round** INV-2 (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11).
- **Ecosistema target**: FoundryVTT v13.347+ (verified v14), dnd5e 5.3.x mandatory (Activity system). v12 NON supportato.
- **Hardware verificato**: Even G2 (576×288 4-bit, 4-mic array, no speaker, plugin gira nel WebView dell'Even Realities App sul telefono — codice servito da server HTTP separato), Even R1 (BLE, gestures tap/scroll/long-press, biometrics, ~4 days battery, IP68).
- **Architettura 4-boundary** ratificata e implementata: G2 (display+sensori) ↔ Even Realities App phone (WebView host) ↔ Bridge service (Node.js Fastify + ws) ↔ Foundry VTT + dnd5e ↔ V2: MCP client.
- **3-hop deployment** operativo: plugin host URL (server statico) + Even Realities App phone (WebView) + bridge URL (REST/WS verso Foundry).
- **Linguaggi sviluppo**: TypeScript strict, Vitest, Biome (lint+format), pnpm workspaces, Docker Compose. Repo monorepo.
- **Stack raster pipeline implementato**: `image-q` v4.0.0 (FS/Atkinson/Bayer dither) + `upng-js` v2.1.0 (4-bit indexed PNG) + `xxhash-wasm` v1.x (delta hash) + custom RLE 4-bit. Bundle ~90 KB gzipped, validated against software performance targets.
- **MCP transport** (V2): stdio + Streamable HTTP implementati, no-SSE grep gate verifica via CI.
- **Foundry write architecture**: single-workflow-origin per ADR-0011 (`socketlib.executeAsGM` ONLY, no parallel paths). 14-socketlib-handler invariant verified via CI Gate 8.

## Constraints

- **Hardware G2**: 576×288 4-bit greyscale, 4 image + 8 text/list container per pagina, 1 container con `isEventCapture: 1`, image max 200×100 px, no speaker, no camera. — *Vincolo Even Realities, non negoziabile.*
- **Hardware R1**: BLE → smartphone Even App → G2; gesture solo `tap / scroll / long-press`; nessun input testuale possibile. — *Hardware Even Realities.*
- **Plugin execution model**: il codice plugin è servito da un server HTTP separato; l'Even Realities App lo carica nel WebView phone. Il G2 firmware NON esegue il nostro codice. — *Verbatim simulator README.*
- **Network**: HTTPS obbligatorio in prod; ogni dominio outbound deve essere in `app.json` whitelist (origin completo, no wildcards). — *Vincolo Even Hub.*
- **BLE bandwidth**: target ≥200 kbps sustained; <100 kbps blocca raster MVP (degrade a glyph-only). — *Phase 0 §10.0.3.*
- **D&D edition**: dual-support PHB 2014 + PHB 2024 via `core.modernRules`. Implementato MVP. — *§11.5.1.*
- **License**: MIT su tutti i package del monorepo. — *§11.5.2.*
- **Deployment MVP**: Docker Compose homelab single-tenant; cloud è STRETCH-08 deferred. — *§11.5.3.*
- **Auth**: bearer opaque 24h, paired via QR scan dal modulo Foundry desktop. — *§11.5.4.*
- **Tooling fissato**: TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su `// TODO` senza issue-link. — *INV-4 §0.1.*

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Project Invariants ratificati (INV-1..5) | Layout integrity + online cross-validation + doc coherence + code quality + gesture determinism come vincoli vincolanti | ✓ Ratificati; INV-1..5 verification suite operativa via `inv:all` |
| Raster come default MVP, glyph come fallback | Faithful al canvas Foundry; max area sull'hardware G2; Doom-on-exotic-devices pattern | ✓ Software-validated; hardware perf gating |
| 6-layer optimization stack per fps | 5 fps committed achievable senza tutti i layer; 15 fps stretch richiede DLE+partial-update API | ✓ Implementato Phase 4a; hardware tuning gated under ADR-0005 Branch A |
| MVP manuale, voice/AI V2 opzionale via MCP | EvenAI nativo è non-API per dev (§3.6 re-verified 2026-05-17) → V2 deve essere external MCP; MVP deterministico per ridurre rischio | ✓ V2 surface shipped in v0.9.11 (Phase 11-12) |
| Settings 3-superficie (Foundry world / Even App phone / G2 device-local) | G2 non ha tastiera; bootstrap deve vivere phone-side; world settings restano canoniche per game state | ✓ Implementato Phase 2 |
| QR pairing per bearer token | Riduce attack surface (no clipboard non sicura); audit trail DM-side; revoca per-device | ✓ Implementato Phase 2 |
| 13-week MVP (Phase 0 → 10) + V2 (Phase 11 → 13) | Phase 0 gating su validation hardware; Phase 4 è il pezzo a maggior rischio (raster pipeline) | ✓ Compressed to 7-day actual via autonomous workflow |
| Plugin code server-hosted (3-hop deployment) | Verbatim simulator: code on server, WebView fetcha. Implica CDN-friendly + 2 origin in whitelist | ✓ Architettura operativa |
| Library stack `image-q` + `upng-js` + `xxhash-wasm` | 30-50% compute reduction vs custom; 90 KB gz; worker-safe | ✓ Ratified in ADR-0006; hardware perf TBD |
| Trunk-based development + Changesets | Single-developer MVP, no long-lived branches; semver per package | ✓ Phase 1 + Changesets operative |
| **ADR-0011 single-workflow-origin** | Tutto via `socketlib.executeAsGM` — no parallel write paths, no nesting | ✓ Ratified Phase 7; 14-socketlib-handler invariant on CI |
| **ADR-0005 PROVISIONAL Branch A — `human_needed` carry pattern** | Hardware-pending verification non blocca workflow software; documentation-first esplicita | ✓ Established as project-wide convention; 35 SC parcheggiati |
| **ADR-0009 Amendment 1 — differential demolish rule** | Toast queue (z=1.5) + overlay panel (z=2) cohabitation senza race condition su mount | ✓ Phase 4b Wave-0 |
| **Defer-hardware-tests carry pattern** | Phases 4a/4b/5/6/7/8/9/10/12/13 all closed via `human_needed` carry; never block autonomous on hardware UAT | ✓ Established convention |
| **Phase 13 minimal scope (ACT-04 + 1 stretch only)** | Reject sprawling V2 stretch; ship discriminating subset (REACT execution + portrait) | ✓ Ratified at Phase 13 close |

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
*Last updated: 2026-05-17 after v0.9.12 Quick Wins milestone started (raster z=0.5 + Deepgram Keyterm scope)*
