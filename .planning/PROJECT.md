# EvenFoundryVTT (EVF)

> **Single Source of Truth**: questo PROJECT.md è una proiezione GSD-friendly di [`Specs.md`](../Specs.md) (v0.9.13, ~4250+ righe). La spec resta canonica per ogni claim tecnico, hardware, API, mockup, decision; PROJECT.md riassume il contesto operativo per il workflow GSD. Per disciplina **INV-3 (doc coherence)**, ogni cambio cross-cutting tocca PROJECT.md, Specs.md, README.md, showcase nello stesso commit.

## What This Is

Un plugin che proietta una sessione di **D&D 5e** ospitata su **FoundryVTT** direttamente sugli occhiali AR **Even Realities G2** (576×288, 4-bit greyscale phosphor green), guidato da gesture dell'anello **Even R1**. Il giocatore non distoglie mai lo sguardo dal tavolo fisico — scheda PG, combat tracker, mappa rasterizzata, log e spellbook appaiono come HUD glanceable in stile Alien Nostromo / VFD / CRT verde, mentre miniature, mappe di carta e DM umano restano al centro dell'esperienza. Il sistema è **deterministico nel core MVP** (ogni azione è gesture esplicita); voice/AI è una stretch V2 opzionale via MCP server, mai dipendenza.

**v0.9.11 MVP shipped (software-complete) 2026-05-17.** V2 optional surface (foundry-mcp + voice UX + ACT-04 partial + STRETCH-06 flag-gated) inclusa nello stesso ciclo. Hardware-pending verification (35 SC) parcheggiata sotto ADR-0005 Branch A.

**v0.9.12 Quick Wins shipped 2026-05-17** — 2 phases, 8/8 plans, 9/9 v1 REQ-IDs Resolved. Phase 14 (z=0.5 idle infill) ratified; Phase 15 (Deepgram Keyterm) integrated. Workspace tests 2626/2626, CI Gate 8 socketlib count = 17 preserved, zero new hardware-pending SCs added.

**v0.9.13 Sheet Data Completion + Polish shipped 2026-05-18** — 3 phases, 7/7 plans, 9/9 v1 REQ-IDs Resolved. Phase 16 (Sheet Main tab abilities end-to-end), Phase 17 (Sheet Skills tab + Main tab senses passives), Phase 18 (Phase-14.1 spec-drift polish + Specs.md v0.9.13 INV-3 atomic milestone close). Workspace tests 2668/2668 (+122 across milestone), CI Gate 8 socketlib count = 17 preserved end-to-end, zero new hardware-pending SCs added.

## Core Value

**Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.** Tutto il resto (fps, raster vs glyph, voice V2, multi-player) è subordinato a questo principio: se una decisione di design forza il giocatore a guardare il telefono o un laptop, è sbagliata.

## Current State

- **Software**: v0.9.11 MVP + v0.9.12 Quick Wins + v0.9.13 Sheet Data Completion all shipped — 20 phases (0–18), 86 plans, **2668 workspace tests passing** across monorepo (`packages/g2-app`, `packages/bridge`, `packages/foundry-module`, `packages/foundry-mcp`, `packages/shared-protocol`, `packages/shared-render`, `packages/validation-harness`). v0.9.13 closed Sheet Main + Skills tab data wiring (Phase 16 abilities + Phase 17 skills) and Phase-14.1 spec-drift polish (Phase 18).
- **Hardware verification**: deferred — 35 success criteria across Phases 4a/4b/5/6/7/8/9/10/12/13 marked `human_needed` under ADR-0005 PROVISIONAL Branch A. v0.9.12 + v0.9.13 added zero new SCs. Closure path: `pnpm --filter @evf/validation-harness validate:all` once Even Hub access + G2 + R1 + consenting DM available.
- **Spec**: `Specs.md` v0.9.13 (~4250+ righe; §7.4c z=0.5 layer + §3.6 EvenAI + Sheet Main/Skills data binding all ratified). ADR-0001 Amendment 1 RATIFIED; INV-3 atomic commits `3a0c5cf` (Phase 14) + `dc161d6` (Phase 15) + `d68d7f2` (Phase 16) + `c208d24` (Phase 17) + `df4ea02` (Phase 18 + milestone close).
- **Carry to next milestone**: minimal — Spells tab DC binding (primed by `abilities.<k>.dc` field) deferred to future Sheet polish cycle; Inventory/Bio/Feats tab data-binding polish out of scope; half-prof narrative glyph (`◐` half-tone) deferred per INV-1 width budget.
- **CI gates**: 7 quality gates green on every PR (Biome lint, TypeScript strict, Vitest coverage, INV-1..5 verification suite via `inv:all`, no-SSE grep gate, **17**-socketlib-handler invariant (Phase 13 → preserved through v0.9.13), INV-3 atomic doc coherence).

## Next Milestone Goals (post-v0.9.13)

After v0.9.13 shipped, likely candidates:

1. **Hardware UAT closure** (when Even Hub access becomes available) — execute 35 software-complete SCs against real G2 + R1 hardware; close ADR-0005 PROVISIONAL → ACCEPTED with empirical evidence.
2. **MCP polish / V2 hardening** — auth flow, multi-client semantics, error UX in `foundry-mcp`. Out of MVP; was Phase 11 follow-up.
3. **Picovoice Rhino edge classifier** — conditional on SC-12-01 hardware test measuring Claude Desktop intent-identification latency p50 > 800ms. Not measurable without hardware.
4. **Cloud rewrite / multi-tenancy** — stretch (would unlock multi-DM, multi-world, hosted SaaS). Phase 13 deferred topics.

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

### Validated (v0.9.12 Quick Wins — shipped 2026-05-17)

Full traceability and final outcomes archived to [`milestones/v0.9.12-REQUIREMENTS.md`](milestones/v0.9.12-REQUIREMENTS.md).

#### Raster Pipeline Extension
- ✓ **INFILL-01..05** — z=0.9.5 idle content infill: layer formalized in §7.4c + ADR-0001 Amendment 1 + 3 dynamic text containers + differential demolish on overlay mount + INV-1 fixtures — v0.9.12 (Phase 14, commit `3a0c5cf`)

#### Voice Recognition Quality
- ✓ **VOICE-06..09** — Deepgram Keyterm Prompting + Entity-Pack Integration: Nova-3 `keyterm` parameter wired; static `SPELL_KEYTERMS` (70 SRD × IT/EN) + dynamic `EntityPackCache` union; locale-aware cross-lingual; debounce 250ms + drain-then-restart mutex hot-update via `/internal/delta` — v0.9.12 (Phase 15, commit `dc161d6`)

### Validated (v0.9.13 Sheet Data Completion + Polish — shipped 2026-05-18)

Full traceability and final outcomes archived to [`milestones/v0.9.13-REQUIREMENTS.md`](milestones/v0.9.13-REQUIREMENTS.md).

#### Character Sheet — Data Binding
- ✓ **SHEET-05..07** — Sheet Main tab abilities end-to-end: `CharacterSnapshotSchema.abilities` 6 sub-objects × `{value, mod, save, proficient, dc}` + `extractAbilities` reader + `renderMainTab` data binding + `formatAbilityValue`/`formatAbilityMod` helpers + 4 INV-1 fixtures byte-updated — v0.9.13 (Phase 16, commit `d68d7f2`)
- ✓ **SHEET-08..10** — Sheet Skills tab + Main tab senses passives: `CharacterSnapshotSchema.skills` 18 keys × `{total, ability, proficient, passive}` + `extractSkills` reader + `SKILL_DEFAULT_ABILITY` map + dynamic `renderSkillsTab` (replacing hardcoded `DEFAULT_SKILLS`) + `SKILL_NAMES` 3-locale i18n + Main tab senses line PP/PI/IND surfacing + 5 INV-1 fixtures — v0.9.13 (Phase 17, commit `c208d24`)

#### Doc-Coherence Polish
- ✓ **INFILL-14.1-A..C** — Phase-14.1 spec-drift polish: archived 14-UI-SPEC §2 col-anchors reconciled (col 70 → col 67, content-width 66 → 64) + §10 width-budget re-derived from runtime literals + IT locale leak fix in `glyph-scene.glyph-idle-z05.it.txt` rows 1/5/7/9/12/17 + Z05-INV-02b-triade test extension — v0.9.13 (Phase 18, commit `df4ea02`)

### Active

(No active milestone — v0.9.13 closed cleanly 2026-05-18. Next milestone opens via `/gsd-new-milestone`.)

**Likely candidates for v0.9.14** (not committed; user-confirmed scope pending):
- **Skill Check + Saving Throw write path** — mirror of Phase 8 (manual action UX) for skill/save rolls. `skill_check` in `bridge/src/routes/tools-dispatch.ts:80` is still a stub; `evf.rollSkill` + `evf.rollAbilitySave` socketlib handlers absent (would bump CI Gate 8 17 → 18 or 19). Gesture wiring (scroll-tap "tira abilità" hint in Skills tab fixture) currently disconnected from backend. Toast result feedback missing.
- **Spells tab DC binding** — primed by Phase 16 `abilities.<k>.dc` field; Spells tab itself not yet data-bound.

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

- **Stato**: software-complete MVP + 2 atomic milestones (v0.9.12 Quick Wins + v0.9.13 Sheet Data Completion). Codebase live, monorepo pnpm workspace, 7 packages, CI green su 7 quality gates, **2668 test passanti** (post-v0.9.13), INV-1..5 verification suite implementata e operativa via `inv:all` orchestrator. Cross-validazione upstream: **5 round** INV-2 originali (v0.9.6 → v0.9.7 → v0.9.8 → v0.9.9 → v0.9.10 → v0.9.11) **+ 3 INV-2 re-checks** (2026-05-14 image-API · 2026-05-17 EvenAI native API + Deepgram keyterm · 2026-05-18 dnd5e 5.3.3 abilities + skills schema).
- **Ecosistema target**: FoundryVTT v13.347+ (verified v14), dnd5e 5.3.x mandatory (Activity system). v12 NON supportato.
- **Hardware verificato**: Even G2 (576×288 4-bit, 4-mic array, no speaker, plugin gira nel WebView dell'Even Realities App sul telefono — codice servito da server HTTP separato), Even R1 (BLE, gestures tap/scroll/long-press, biometrics, ~4 days battery, IP68).
- **Architettura 4-boundary** ratificata e implementata: G2 (display+sensori) ↔ Even Realities App phone (WebView host) ↔ Bridge service (Node.js Fastify + ws) ↔ Foundry VTT + dnd5e ↔ V2: MCP client.
- **3-hop deployment** operativo: plugin host URL (server statico) + Even Realities App phone (WebView) + bridge URL (REST/WS verso Foundry).
- **Linguaggi sviluppo**: TypeScript strict, Vitest, Biome (lint+format), pnpm workspaces, Docker Compose. Repo monorepo.
- **Stack raster pipeline implementato**: `image-q` v4.0.0 (FS/Atkinson/Bayer dither) + `upng-js` v2.1.0 (4-bit indexed PNG) + `xxhash-wasm` v1.x (delta hash) + custom RLE 4-bit. Bundle ~90 KB gzipped, validated against software performance targets.
- **MCP transport** (V2): stdio + Streamable HTTP implementati, no-SSE grep gate verifica via CI.
- **Foundry write architecture**: single-workflow-origin per ADR-0011 (`socketlib.executeAsGM` ONLY, no parallel paths). **17**-socketlib-handler invariant verified via CI Gate 8 (Phase 13 bump 14 → 17 for ACT-04 reactions; preserved through v0.9.12 + v0.9.13 because both Quick Wins + Sheet Data milestones are pure read-path or doc-coherence extensions).

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
| **ADR-0011 single-workflow-origin** | Tutto via `socketlib.executeAsGM` — no parallel write paths, no nesting | ✓ Ratified Phase 7 (14 handlers); Phase 13 bump 14 → 17 (ACT-04 reactions); preserved through v0.9.12 + v0.9.13 via read-path-only milestones — CI Gate 8 invariant |
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
*Last updated: 2026-05-18 after v0.9.13 Sheet Data Completion + Polish milestone shipped + archived (Phase 16 abilities · Phase 17 skills · Phase 18 spec-drift polish + Specs.md v0.9.13 INV-3 atomic milestone close `df4ea02`).*
