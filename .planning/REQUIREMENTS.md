# Requirements: EvenFoundryVTT (EVF)

**Defined:** 2026-05-10
**Core Value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Source:** [Specs.md](../Specs.md) v0.9.11 §1.2/§1.3/§1.4 + research SUMMARY adversarial gap-hunt.

## v1 Requirements

48 requirement totali — 41 derivate da Specs.md + 7 nuove dalla research SUMMARY (3 vector adversarial gap hunt).

### Display & HUD

- [ ] **DISP-01**: HUD persistente con status PG (HP/AC/azioni/slot/condizioni) sempre visibile in corner card
- [ ] **DISP-02**: Layout layered (z=0 mappa, z=1 status HUD, z=2 overlay panel) con esattamente 1 capture container
- [ ] **DISP-03**: Layout integrity garantita per tutti gli stati (INV-1, snapshot test §7.14.4 ck 11–15)
- [ ] **DEATH-01**: Death saves status HUD durante HP=0 (3-strike tracker visivo, momento viscerale 5e). *Adversarial gap Vector A.*
- [ ] **TOAST-01**: Toast queue/stack design (max 2 visibili FIFO 3s, overflow squash to "+N more"). *Adversarial gap Vector C — Fireball + 8 saves overflows naive impl.*
- [ ] **BOOT-01**: Boot error states ortogonali (handshake failed / version mismatch / no character / bridge unreachable / token expired). *Adversarial gap Vector C — spec mockup happy-path only.*

### Map Rendering

- [ ] **MAP-01**: Raster pipeline 4-bit greyscale dithered (4 image container 2×2 = 400×200 px effective) — DEFAULT MVP (subordinate a Phase 0 GO/NO-GO)
- [ ] **MAP-02**: Glyph mode fallback (text grid 96×24 char) — alternativa user-selectable runtime
- [ ] **MAP-03**: 6-layer optimization stack (delta hash · sub-tile encoding · static caching · custom RLE · BLE 4.2+ DLE · adaptive frame rate)
- [ ] **MAP-04**: 5 fps standard committed / 15 fps aspirational (subordinate a §10.0.3, §10.0.6, §10.0.7)
- [ ] **MAP-05**: Mode toggle runtime via Quick Action `[M] Map ctrl` (raster ↔ glyph, hot-swappable)

### Character Sheet

- [ ] **SHEET-01**: 6 tab Foundry-faithful (Main / Skills / Inventory / Spells / Feats / Bio) navigabili via tap-cycle
- [ ] **SHEET-02**: Data binding live verso `actor.system.*` dnd5e 5.x (tutto via Foundry hooks, no polling)
- [ ] **SHEET-03**: Dual-edition support (PHB 2014 + PHB 2024 via `core.modernRules` setting)
- [ ] **SHEET-04**: Tab strip equal-width per INV-1 (`[ XXX ]` ↔ `[▶XXX ]`, swap leading-space ↔ ▶)

### Combat & Action

- [ ] **COMB-01**: Combat tracker con turno corrente, iniziativa, effetti, durate concentrazione
- [ ] **COMB-02**: Action economy widget (action / bonus / reaction / move) con enforcement client-side
- [ ] **COMB-03**: Quick-action bar `[A][S][I][M]` su Combat overlay
- [ ] **CONC-01**: Concentration drop confirm modal su cast di spell concentration mentre già concentrato. *Adversarial gap Vector A — currently undefined in spec, 5e core.*
- [ ] **MULTI-01**: Multi-attack action tracker (`Atk 1/2`, `Atk 2/2`) per Fighter Extra Attack L5+. *Adversarial gap — Specs §12.B q.15 currently flagged open.*
- [ ] **REACT-01**: Reaction *passive notification toast* (Shield / Counterspell / Opportunity Attack — display-only, no execution). *Adversarial gap Vector A — execution stays V2 ACT-04.*
- [ ] **ACT-01**: Manual cast/attack/use via R1 (scroll allo spell/item → tap → confirm target)
- [ ] **ACT-02**: AoE template placement via `AbilityTemplate.fromActivity()` (array iteration per multi-template)
- [ ] **ACT-03**: GM-side actions forwarded via `socketlib.executeAsGM` (single-workflow-origin discipline option A)

### Navigation & Input

- [ ] **NAV-01**: R1 gesture model: tap = cycle, double-tap = back, scroll = navigate, long-press = Quick Action
- [ ] **NAV-02**: Quick Action menu (`[S][C][L][B][I][A][M][N][X]`) — list-modal full-screen, scroll=select, tap=open, long=cancel
- [ ] **NAV-03**: Cross-overlay reachability + closability (verification checklist 15×, §7.14.4 ck 1–15)
- [ ] **NAV-04**: Boot splash → handshake → main HUD flow con capability negotiation

### Foundry Integration

- [ ] **FOUN-01**: Foundry module `evenfoundryvtt` espone read API (`getCharacterState`, `getCombatState`, `getSceneViewport`, `getEventLog`, `subscribeUpdates`)
- [ ] **FOUN-02**: Bridge service Node.js (Fastify + ws + Docker Compose) come reverse-proxy CORS-friendly + auth bearer 24h
- [ ] **FOUN-03**: Write path via `activity.use()` + MidiQOL workflow (GM veto power preserved, no nesting)
- [ ] **FOUN-04**: `TokenLayer.setTargets()` v13 multi-target (singolare `Token`, no `Tokens`)
- [ ] **MIDIQ-01**: MidiQOL config check al boot — verificare `autoFastForward` mode attivo. Senza, manual write stalla su chat-card buttons. Declare MidiQOL **required** in `module.json` `relationships.requires`. *Adversarial gap Vector B — Specs §12.B q.11–12 open.*

### i18n / Localization

- [ ] **I18N-01**: Locale auto-detected da `game.i18n.lang` al boot (3-layer arch: Foundry SoT → Bridge → G2 runtime)
- [ ] **I18N-02**: Runtime override via Quick Action `[N] Language` (device-local, non tocca world settings)
- [ ] **I18N-03**: Catalogi forniti da Foundry (dnd5e + module `evenfoundryvtt`) — G2 ships no strings
- [ ] **I18N-04**: Width-budget per chiave + fallback EN se eccede (INV-1 i18n stress, ck 14)
- [ ] **I18N-05**: MVP target IT + EN canonical; best-effort DE / ES / FR / PT-BR

### Connection Bootstrap (Phone-Side)

- [ ] **CONN-01**: Phone setup wizard nell'Even Realities App WebView (3-step: profile/URL → token → character). *Render phone-side, NOT G2.*
- [ ] **CONN-02**: Bridge URL + auth token persistente phone-side (Tier 3 storage §11.5.5, sopravvive a kill/restart/reboot)
- [ ] **CONN-03**: Pair-G2 flow Foundry-desktop-side: bottone "Pair a G2 device" in module Settings → genera bearer 24h + QR payload `{bridge_url, token, world, expires}`
- [ ] **CONN-04**: Auto-connect on G2 wear (Even Realities App detecta wear via SDK → riapre plugin)
- [ ] **CONN-05**: Bearer token rotation 24h (silent refresh) + revoke registry DM-side per device

## v2 Requirements

Deferred to V2 release (Phase 11+, OPZIONALE). Tracked but not in MVP roadmap.

### Voice / AI

- **VOICE-01**: Audio capture via `bridge.audioControl()` → PCM 16 kHz s16le mono al plugin (input only, no TTS — G2 no speaker)
- **VOICE-02**: Modulo opzionale `foundry-mcp` espone tool Foundry via Model Context Protocol (stdio + Streamable HTTP, no HTTP+SSE)
- **VOICE-03**: Compatible con Claude Desktop / qualunque MCP client (MCP TS SDK 1.29.0)
- **VOICE-04**: STT esterno (Deepgram Nova-3 Multilingual / AssemblyAI Universal-Streaming / self-hosted Whisper) — mai on-glasses
- **VOICE-05**: Output sempre visivo (toast §7.15.2 + status HUD update) — nessun feedback acustico possibile

### Reaction Execution

- **ACT-04**: Reaction *execution* flow (Shield consume reaction slot + +5 AC; Counterspell ability check; Opportunity Attack via Ready Action) — passive notification è REACT-01 v1, execution è v2

### Stretch (Phase 13)

- **STRETCH-01**: Multi-player sync (4× G2 simultanei sullo stesso world)
- **STRETCH-02**: Server-side canvas extract (headless Foundry su bridge, Option B §7.4b.8)
- **STRETCH-03**: Biometric narrative cues (R1 HR / HRV → audio cue or HUD ambient)
- **STRETCH-04**: dnd5e v6.x adapter (quando ships)
- **STRETCH-05**: PF2e adapter
- **STRETCH-06**: Portrait images (Sheet + Token portrait)
- **STRETCH-07**: Dice So Nice raster stream (Approach B §7.15.3)
- **STRETCH-08**: Multi-tenant cloud SaaS

## Out of Scope

Esplicitamente esclusi. Documentati per prevenire scope creep. Riferimenti a Specs.md §1.4 + research FEATURES.md anti-feature catalog.

| Feature | Reason |
|---------|--------|
| Lato GM (DM glasses) | Il DM continua a usare laptop tradizionale; EVF è player-side only — vincolo §1.4 |
| Rendering 3D scene complete | Vincolo hardware G2 (4-bit greyscale, 200×100 max image) — §3.1 |
| Multi-G2 simultaneous sync (MVP) | Single-player MVP; multi-player → Phase 13 stretch — §1.4 + §11.5.1 |
| AI replacing/arbitrating DM | Violates Core Value; AI è strumento, non arbitro — §1.4 |
| D&D Beyond direct integration | Foundry è single source of truth; passa via Foundry — §1.4 |
| Voice/AI nel MVP | Esplicitamente differita V2 via MCP server — §1.4 |
| Audio output al user | G2 hardware no speaker (verbatim `hub.evenrealities.com/docs/guides/device-apis`: "no audio output") — §3.1 |
| Native EvenAI hijack | Proprietary feature, non-API per dev (verbatim verificato §3.6) |
| RTL languages (Arabic, Hebrew) | G2 firmware monospace LTR-only — V2 stretch + ADR-0007 |
| Multi-tenant cloud SaaS | Phase 13 stretch; MVP è single-tenant homelab Docker Compose — §11.5.3 |
| Fully on-glasses execution | Plugin gira nel WebView phone, non firmware G2 (verbatim simulator README) — §3.7 |
| Touch input on G2 frame | R1 ring è il primary input; G2 native touchpad fallback non MVP — §3.2 |
| Camera-based gesture recognition | G2 has no camera (verbatim) — §3.1 |
| Biometric narrative as MVP | R1 biometrics → atmosphere è V2 stretch STRETCH-03 |
| Foundry write ops bypassing GM authority | Architectural invariant: tutto via `socketlib.executeAsGM` + MidiQOL workflow — ACT-03 |
| Inline rich-text rules/spell tooltips | Vincolo container budget (max 8 text), wikitext expansion saturerebbe — §3.1 |
| Custom 3D dice on glasses | DSN raster stream è V2 stretch STRETCH-07 |
| In-glasses chat input/typing | No keyboard; chat is read-only on G2 (Log overlay §7.7) |
| Push notifications for non-game events | Out of game scope |
| Color-coded UI | G2 monochrome (16 levels green only) — §3.1 |
| OAuth login | Bearer 24h sufficiente per single-tenant MVP; OAuth è future option — §11.5.4 |
| Web app (mobile companion app) | The Even Realities App on phone IS the companion; nessun secondo canale |

## Traceability

Riempita durante roadmap creation. Empty initially — `gsd-roadmapper` mappa ogni requirement a esattamente una phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(populated by roadmapper in Step 8)_ | _phase N_ | _Pending_ |

**Coverage:**
- v1 requirements: **48** total (Display 6 · Map 5 · Sheet 4 · Combat 6 · Nav 4 · Foundry 5 · i18n 5 · Conn 5 + Action 3 outside main = 48)
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 48 ⚠️ (will be 0 after Step 8)

---

*Requirements defined: 2026-05-10 — derived from Specs.md v0.9.11 §1.2/§1.3/§1.4 + research SUMMARY 7 adversarial gaps*
*Last updated: 2026-05-10 after initialization*
