---
title: EvenFoundryVTT — Requirements, Architecture & Execution Plan
created: 2026-05-09
updated: 2026-05-18
status: draft
tags: [project, foundry, even-g2, even-r1, rpg, d&d, voice-ai, ar]
---

# EvenFoundryVTT — Project Specification (v0.10.0)

## 0. Executive Summary

**EvenFoundryVTT** porta una sessione di D&D 5e su FoundryVTT direttamente sugli occhiali AR **Even Realities G2**, controllata dall'**anello R1**.

**MVP**: HUD glanceable sul G2 (mappa + scheda PG + combat tracker + log + spellbook + inventory), navigazione e azione gesture-driven via R1 (tap, swipe-up, swipe-down, double-tap), tutto sincronizzato in real-time con FoundryVTT tramite un Bridge service. Le azioni di gioco (attacco, cast, use item) si eseguono **manualmente**: scroll fino allo spell/arma → tap → conferma target.

**Stretch (V2)** — modulo opzionale: **AI vocale** che traduce frasi naturali in azioni Foundry (es. *"lancio palla di fuoco sui goblin"* → cast Fireball + targets + save). Architettura prevista: **MCP server** (`foundry-mcp`) che espone i tool Foundry secondo Model Context Protocol; consumabile da qualunque client LLM compatibile (Claude Desktop oggi, future app domani). Il G2 e il bridge non integrano AI direttamente — restano deterministici.

**Stato**: design only. Nessuna riga di codice scritta. Hardware target già verificato (G2 + R1 sono prodotti commerciali Even Realities, vedi §3 e §13).

---

## 0.1 Project Invariants (NON-NEGOTIABLE)

Quattro invarianti governano l'intero progetto. Ogni decisione di design, ogni PR, ogni audit deve poterli verificare. Sono **vincoli vincolanti**, non linee guida.

### INV-1 · Layout Integrity — formattazione e layout sempre dinamici, sempre perfetti

Il layout HUD su G2 (4-bit greyscale 576×288 ≈ 96×24 char @ 6×12 mono, vedi §7.3) **non può mai essere disallineato per nessun motivo**, in nessuno stato, con nessun contenuto.

- **Dinamico**: il layout si adatta a contenuto variabile (HP `7` vs `70` vs `700`, nomi PG da 4 a 16 caratteri, slot count 0-9, condizioni 0-N, durate concentrazione, lingue lunghe come "Concentrazione" vs "Concentration") **mantenendo le stesse coordinate di riferimento** dei frame ASCII e delle colonne.
- **Sempre perfetto**: corner glyphs (`┌ ┐ └ ┘ ╔ ╗ ╚ ╝`), verticali (`│ ║`), divisori (`├ ┤ ╠ ╣ ─ ═`) **devono allinearsi a colonna esatta** in ogni stato — boot, MAIN_MAP, ogni overlay, ogni tab dello Sheet, modal, toast, loading, error, edge case `⚠ SYNC LOST`. Zero off-by-one tollerati.
- **Mai disallineato**: la spec, i mockup, i test snapshot e il rendering runtime devono coincidere al carattere. Le regole concrete sono in §7.1a "Layout Integrity Invariants".

**Verifica**: §7.14.4 checklist 11-15 (snapshot a contenuto estremo) + Phase 4 layer-engine test suite.

### INV-2 · Online Cross-Validation — tutto verificato contro upstream

Ogni claim tecnico (API surface, hardware spec, library version, pricing, protocol shape, gesture mapping, formato dati) deve essere **citabile da una sorgente upstream canonica** e **re-verificato periodicamente** contro la documentazione online corrente.

- **Sorgenti canoniche** (non aggregator/blog/AI summary):
  - Even Realities — `hub.evenrealities.com/docs/*` + `evenrealities.com/smart-ring` + `support.evenrealities.com/specs`
  - FoundryVTT — `foundryvtt.com/api/*` + `github.com/foundryvtt/dnd5e` (system.json + module/*)
  - dnd5e wiki — `github.com/foundryvtt/dnd5e/wiki`
  - MCP — `modelcontextprotocol.io/specification/*`
  - socketlib — `github.com/farling42/foundryvtt-socketlib`
  - MidiQOL — `gitlab.com/tposney/midi-qol`
  - Vendor pricing — solo dalla pagina ufficiale del vendor (Deepgram, AssemblyAI, ecc.), mai da fonti terze
  - Library stack — npm registry + GitHub repo ufficiale
- **Cadenza minima di re-verify**: pre-Phase 0 GO/NO-GO, pre-major-bump (v0.X → v0.X+1), pre-implementation-kickoff. WebFetch in parallelo (≥4 agenti, fan-out su domini indipendenti) è il pattern standard (vedi changelog v0.9.6/v0.9.7/v0.9.8).
- **Drift policy**: ogni drift trovato → classificato CRITICAL / IMPORTANT / NICE-TO-HAVE → fixato in PR dedicato → annotato nel changelog con la riga `Re-verified ✓` o `Drift: ...` **in modo esplicito**, mai implicito.
- **Hedge esplicito**: quando upstream e fonti terze divergono (es. Deepgram pricing v0.9.7), la spec deve dire **quale fonte ha autorità** e **quale è l'approccio runtime** (es. "leggere live da pricing API anziché hard-code").

**Verifica**: §3 + §4 + §13 References. Ogni claim qui ha un URL upstream o è marcato `(target Phase 0 validation)`.

### INV-3 · Documentation Coherence — sempre aggiornata e coerente

La documentazione (`Specs.md` + `README.md` + `docs/showcase/index.html` + futuri ADR) deve essere **sempre coerente con sé stessa** e **sempre aggiornata** rispetto allo stato corrente del progetto. Non esiste uno stato "documentazione stale" tollerato.

- **Single Source of Truth**: `Specs.md` è canonica. README e showcase sono **proiezioni derivate** che devono restare allineate (numero di versione, claim hardware, fps target, tab count Sheet, pipeline stage count, phase count, cross-check round count, ecc.).
- **Atomicità per-cambio**: ogni modifica che tocca un claim trasversale (versione, fps, phase numerotomi, tab count, library version) **deve aggiornare tutte le proiezioni nello stesso commit**. Non si committano stati intermedi incoerenti.
- **Cross-reference integrity**: nessun broken cross-ref `§X.Y` tollerato. Phase 1 cleanup (vedi changelog v0.9.1/v0.9.2/v0.9.4) è un pattern: pre-bump audit cerca cross-ref morti e li fixa.
- **Changelog discipline**: ogni bump di versione documenta cosa è cambiato e PERCHÉ. Le rationale sono load-bearing per il futuro auditor.
- **Stale guard**: prima di un audit major, scan delle parole sentinel (es. "TBD", "v12", "Approach C hybrid", numeri vecchi di phase) — se compaiono fuori dal changelog, sono drift.
- **Coherence vs progress**: in conflitto, vince la coerenza. Meglio una versione bumpata pulita che un mix half-updated.

**Verifica**: pre-bump checklist (manuale, fino a quando non scriviamo una CI rule):
1. README badge versione = `Specs.md` versione = showcase versione
2. README hardware bullets = §3 hardware spec
3. README phase table = §10 phase list (count + weeks)
4. Showcase stats = §3 + §10 + changelog count rounds
5. Cross-ref scan: `grep -nE '§[0-9]+\.[0-9]+' Specs.md` → ogni reference esiste

### INV-4 · Code Quality — pulito, ottimizzato, documentato, zero codice morto

Il codice (quando inizierà ad esistere, post-Phase 0) deve essere **sempre pulito, ottimizzato e documentato**. **Nessun codice morto, nessun codice irraggiungibile**, nessun TODO non tracciato, nessuna funzione orfana.

- **Cleanliness**:
  - Naming intenzionale (no `data`, `tmp`, `helper2`, `doStuff`); ogni nome esprime intento.
  - Funzioni piccole, single-purpose; complessità ciclomatica ≤ 10 (lint rule).
  - Niente magic number — costanti named in `shared-render/constants.ts` o in scope locale con commento WHY.
  - Stile uniforme via **Biome** (formatter + linter); CI fail su violazioni.
  - Niente commented-out code committato. Se serve preservazione storica → git log.
- **Optimization**:
  - Hot path identificati (raster pipeline §7.4b.4 stage 1-9, layered render, BLE flush) → benchmark coverage in CI (regression gate).
  - Object/buffer pooling dove rilevante (tile buffers, byte arrays per BLE chunk) — vedi §11.5.7.1 fps gain quantification.
  - Niente premature optimization in cold path; **deciderlo via profiler**, non via gut feel.
  - Worker boundaries esplicite (raster pipeline gira in `OffscreenCanvas` worker, mai sul main thread G2).
- **Documentation in-code**:
  - Public API: **JSDoc/TSDoc** completo (params, return, throws, since-version, cross-ref a §spec).
  - Private complexity: comment WHY (non WHAT — il nome dice WHAT). Esempi: invarianti algoritmiche, vincoli hardware (es. "BLE chunk ≤ 244 byte payload, vedi §3.3"), workaround firmware.
  - Module-level header: scopo, dipendenze, cross-ref §spec.
  - **No documentation rot tolerated** — INV-3 si applica ai commenti: se il codice cambia, i commenti che lo descrivono cambiano nello stesso commit.
- **Dead/unreachable code — ZERO**:
  - **Lint enforced** (Biome `noUnusedVariables`, `noUnusedImports`, `noUselessFragments`, TypeScript `noUnusedLocals`/`noUnusedParameters` — CI fail, non warn).
  - **Coverage gate**: Phase 4+ richiede branch coverage ≥ 80% per i moduli core (renderer, layer engine, BLE chunker). Branch non coperti → o test, o cancellazione.
  - Feature flag dimenticati (es. `if (false)`, `if (DEBUG_OLD_PIPELINE)`) → CI grep blocker prima del bump.
  - `// TODO` senza tracker (issue/ADR link) → CI fail. Pattern obbligatorio: `// TODO(#issue-N): <reason>` o `// TODO(ADR-NNNN): <reason>`.
  - Funzioni esportate senza usage interno né external API doc → unused-export lint.
  - Backwards-compat shims: scadenza esplicita (es. `// DEPRECATED removed-in v0.10`) — il codice è cancellato a quella versione, non lasciato indefinitamente.
- **Refactor discipline** (post-MVP cycle):
  - Ogni cycle (=phase) include 5% budget refactor. La regola "boy scout": chi tocca un modulo lo lascia più pulito di come l'ha trovato.
  - Refactor atomici (no mix con feature). Un commit = un'intenzione.

**Verifica**:
- CI: Biome lint + TypeScript strict + Vitest coverage gate + grep blockers (`TODO\b(?!\()`, `if \(false\)`, `console\.log` non-test).
- Phase 10 polish gate: dead-code scan finale + bundle-size review (target G2 panel bundle ≤ 200 KB gz).
- Pre-bump checklist (manual finché CI non lo copre): `pnpm lint && pnpm typecheck && pnpm test --coverage && grep -rE 'TODO\b(?!\()' src/` → tutti zero.

> **Stato attuale (2026-05-10)**: nessuna riga di codice scritta. INV-4 è **ratificato in spec ora**, applicato al primo commit di Phase 1 (monorepo skeleton). Configurazioni concrete (Biome rules, TS config, CI gate definitions) sono in **ADR-0008 Code Quality Configuration** (placeholder, redatto in Phase 1).

---

## 1. Vision & Goals

### 1.1 Vision

Il giocatore di ruolo **non distoglie mai lo sguardo dalla scena fisica** (mappa di carta, miniature, altri giocatori). Tutto ciò che oggi richiede laptop o tablet — scheda personaggio, combat tracker, mappa digitale, tiri di dado — appare proiettato come **HUD glanceable in basso/laterale** sul G2, esattamente come un monitor "in volo" davanti a lui. L'azione è guidata da **gesture R1** (tap, swipe-up, swipe-down, double-tap) sui chip di navigazione e sui bottoni quick-action.

**Modello UI** (ispirato a Foundry desktop): la **mini-mappa è il layer di base sempre visibile**; una **scheda di stato compatta del PG** è ancorata a destra in modo permanente (HP, AC, action economy, slot, condizioni); le altre viste (Sheet completa, Combat tracker, Log, Spellbook, Inventory, Clarify) si aprono come **overlay** sopra la mappa, dismissibili con tap R1. Niente cambio "pagina" hard — è una sola UI con layer impilati, esattamente come una sessione Foundry classica davanti al monitor.

**V2 vision (opzionale)**: integrazione AI vocale tramite MCP server. Il giocatore dice *"lancio palla di fuoco"* e un client LLM (es. Claude Desktop) chiama gli stessi tool che il G2 chiama via bridge. Il sistema rimane deterministico nel core; la voce è un additivo.

### 1.2 Obiettivi Primari (MVP)

- ✅ Visualizzazione real-time scheda personaggio (HP, AC, stats, slot incantesimi, condizioni)
- ✅ Combat tracker con turno corrente, iniziativa, effetti
- ✅ Mini-mappa text-based centrata sul player token
- ✅ Log eventi sintetico, spellbook e inventory consultabili
- ✅ Navigazione gesture-based via R1 (tap, swipe-up, swipe-down, double-tap)
- ✅ **Esecuzione azioni base manuali**: aprire Spellbook → scroll allo spell → tap-cast → confermare target via R1 scroll+tap

### 1.3 Obiettivi Secondari (v2)

- ⏳ Multi-target intelligente
- ⏳ Reaction handling automatico (Shield, Counterspell)
- ⏳ Notifiche push (turno, concentrazione, HP critici)
- ⏳ Sync biometrici R1 → atmosfera narrativa (HR alto in combat → audio cue)
- ⏳ **Voice/AI control via MCP server** (modulo opzionale, vedi §5.7) — push-to-talk via Quick Action (over-scroll: swipe-up al top), frase naturale → tool MCP → azione Foundry. Architettura plug-and-play: qualunque client MCP-compatibile può guidare il sistema.

### 1.4 Non-Goals (fuori MVP)

- ❌ Lato GM — il DM continua a usare laptop tradizionale
- ❌ Rendering 3D scene complete su G2
- ❌ Multiplayer sync tra più paia di G2 (un giocatore per istanza)
- ❌ Sostituzione del DM umano (qualunque AI futura è strumento, non arbitro)
- ❌ Integrazione D&D Beyond diretta (passa via Foundry come single source of truth)
- ❌ AI vocale **nel MVP** — è esplicitamente opzionale e differita a V2 via MCP server (§5.7). MVP funziona al 100% senza alcun LLM.

---

## 2. System Architecture

### 2.1 Component Diagram

```
                  MVP (deterministico, sempre attivo)
─────────────────────────────────────────────────────────────────

┌──────────────────────┐      ┌──────────────────────┐
│  Even Realities G2   │      │   Even R1 Ring       │
│  (display 576×288    │◄────►│   (BLE gestures +    │
│   greyscale verde)   │ BLE  │   biometrics)        │
└──────────┬───────────┘      └──────────┬───────────┘
           │ WebView (smartphone Even App)
           ▼
┌─────────────────────────────────────────────────────┐
│           EvenFoundryVTT G2 App (HTML/JS plugin)        │
│  • Layered UI: map base + status HUD + overlays     │
│  • R1 event handler (tap/swipe-up/swipe-down/2-tap) │
│  • Plugin panels: sheet, combat, log, spell, inv    │
└──────────┬──────────────────────────────────────────┘
           │ HTTPS / WebSocket (CORS-allowed)
           ▼
┌─────────────────────────────────────────────────────┐
│           Bridge Service (Node.js, homelab)         │
│  ┌─────────────────────────────────────────────┐    │
│  │  REST/WS API — auth token, rate limit       │    │
│  │  State cache + delta diff                   │    │
│  │  Tool registry (cast_spell, weapon_attack…) │    │
│  └─────────────────────────────────────────────┘    │
└──────────┬──────────────────────────────────────────┘
           │ Foundry-side socket
           ▼
┌─────────────────────────────────────────────────────┐
│       FoundryVTT (host computer / homelab)          │
│  ┌─────────────────────────────────────────────┐    │
│  │ evenfoundryvtt Foundry module                   │    │
│  │  - Read: actor, combat, scene, tokens       │    │
│  │  - Write: activity.use(), set targets       │    │
│  │  - Hooks: updateActor/Combat/Token,         │    │
│  │    createChatMessage, dnd5e.* lifecycle     │    │
│  ├─────────────────────────────────────────────┤    │
│  │ deps: socketlib, midi-qol (opt.),           │    │
│  │ dnd5e ≥ 5.x (Activity system)               │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘


              V2 OPTIONAL (modulo separato, plug-in)
─────────────────────────────────────────────────────────────────

           ┌─ qualunque MCP client ─────────────┐
           │  Claude Desktop · Claude Code ·    │
           │  future LLM apps con MCP support   │
           └────────────────┬───────────────────┘
                            │ MCP (stdio | SSE)
                            ▼
              ┌─────────────────────────────────┐
              │   foundry-mcp                   │
              │   (standalone MCP server)       │
              │   Tools: cast_spell, attack,    │
              │   use_item, place_template,     │
              │   set_targets, skill_check…     │
              │   Resources: actor, scene, log  │
              └────────────────┬────────────────┘
                               │ HTTPS to bridge (auth token)
                               ▼
                       [ Bridge above ]
```

Il blocco V2 è completamente disaccoppiato: si avvia/spegne separatamente, non è dipendenza del MVP. Auth condivisa con il bridge tramite player token. STT può essere built-in nel client MCP (es. Claude Desktop voice mode) o esterno.

### 2.2 Data Flow

**Read path (HUD aggiornato in real-time, MVP)**:

```
Foundry hook → evenfoundryvtt module → bridge WS push → G2 app delta-render
```

Latenza target: **<500 ms p95**, **<1 s p99**.

**Write path manuale (MVP)**:

```
Player gesture R1 → G2 panel action (es. tap su Spellbook → spell → cast)
  → bridge POST /v1/action/use-activity
  → Foundry module: activity.use() / MidiQOL workflow
  → chat card + dice roll → hook → HUD update
```

Latenza target end-to-end: **<400 ms p50**, **<1 s p99**.

**Write path vocale (V2 opzionale, via MCP)**:

```
Player parla → MCP client (es. Claude Desktop) capture audio + STT
  → LLM tool call (cast_spell, weapon_attack, …)
  → MCP server foundry-mcp riceve tool call
  → POST /v1/action/use-activity al Bridge (stesso endpoint del MVP)
  → Foundry → hook → HUD G2 aggiornato
```

Latenza target end-to-end (V2): dipende dal client MCP scelto. Tipicamente **~1.5–3 s p50** in base a STT+LLM provider.

### 2.3 Trust & Authority

- **Single source of truth**: FoundryVTT. Ogni stato deriva dal mondo Foundry.
- **GM mantiene controllo**: ogni azione AI passa dal sistema Activity di Foundry, quindi è soggetta a regole, hooks, modifier, advantage/disadvantage. Il GM può sempre annullare.
- **Player permission boundary**: il bridge si autentica come l'utente del player; può operare solo su attori posseduti. Per applicare danni a NPC si usa `socketlib.executeAsGM` o `MidiQOL.completeActivityUse({ asUser: gmUserId })`.

---

## 3. Hardware & Platform Constraints (Verified)

### 3.1 Even G2 Display (verificato su `hub.evenrealities.com/docs/guides/display` + `/guides/device-apis`)

| Parametro | Valore |
|---|---|
| Risoluzione per occhio | **576 × 288 px** (monoculare, lo stesso frame su entrambi) |
| Profondità colore | **4-bit greyscale**, 16 livelli di verde |
| Containers per pagina | **max 4 image + 8 altri** (text/list) |
| Event capture | esattamente **1 container con `isEventCapture: 1`** |
| Image container size | **20–200 px W × 20–100 px H** (⚠️ NO full-screen image). **Caveat**: image container non può essere inviato durante creazione iniziale — serve placeholder + `updateImageRawData` post-create |
| Text container | fino a 1.000 char (2.000 con `textContainerUpgrade`), wrap automatico. Full-screen container tipico ~400–500 char visibili |
| List container | **max 20 item × 64 char** ciascuno, no styling per-item, **no in-place updates** |
| Layout | coordinate assolute pixel da top-left, no CSS/DOM/flex |
| Storage | nessun localStorage/sessionStorage (sandbox iframe) |
| **Microphone array** | **4-mic direzionali**, voice pickup ~3 m a 60-70 dB, ~2 m a 45-60 dB. Single audio stream esposto agli app dev come **PCM 16 kHz s16le mono** (§3.5). Codec BLE raw = LC3 (decoded by Hub SDK). Source: `evenrealities.com/smart-glasses` + `hub.evenrealities.com/docs/guides/device-apis` |
| **Audio output / speaker** | ❌ **NESSUNO**. G2 non ha speaker, bone-conduction o uscita audio. Verbatim hub.evenrealities.com/docs/guides/device-apis: *"no audio output, no arbitrary pixel drawing, no camera"*. Verbatim buyer guide: *"Even G2 also omits cameras and speakers"*. **Implicazione**: tutti i feedback "vocali" del nostro sistema devono essere visivi (toast HUD §7.15.2, status update §7.4) |
| **Camera** | ❌ assente (intentional privacy/form-factor design Even Realities) |
| **IMU** | ✅ esposto via `imuControl(isOpen, reportFrq)` con report pacing P100–P1000. Non usato MVP, riserva V2 (head-tracking pings) |

**Implicazioni design** (correzioni rispetto a v0.1):

- La mini-mappa **non può** essere un'unica immagine 576×288. Soluzione: **text grid + glyph unicode** (vedi §7) con un piccolo image container (≤200×100) opzionale per "you-are-here".
- 8 container non-image è abbondante per testo strutturato a colonne.
- Il vincolo "1 solo capture" non impedisce overlay: il **focus di input** si sposta tra layer (mappa ↔ overlay) tramite state machine. Una sola UI, layer impilati.

**Container budget allocato per la "main page"** (vedi §7) — aggiornato post-v0.7 raster-default:

| Layer | Containers (raster MVP default) | Containers (glyph fallback) |
|---|---|---|
| Frame top (header) | 1 text | 1 text |
| Frame bottom (footer + breadcrumb) | 1 text | 1 text |
| Map base | **4 image** (raster 2×2 tile, §7.4b.3) | 1 text (glyph grid) |
| Persistent Status HUD (corner card) | 1-2 text (summary + bars) | 1-2 text |
| Overlay panel content (quando aperto) | 1-2 text + 0-1 list | 1-2 text + 0-1 list |
| Boot splash / Voice modal (modo modal full-screen) | usano page separata | usano page separata |
| **Totale main page** | **4-7 text, 4 image** ✓ entro budget | **5-8 text, 0 image** ✓ entro budget |

**Margine raster**: 1-4 text container liberi per polish. **Image budget pieno** (4/4 usati per mappa). Allocazione dinamica documentata in §7.5.8 — quando Sheet/Combat-target overlay è aperto, 1 tile mappa viene drop temporaneo per liberare un image slot per portrait (3 tile + 1 portrait, restored at close).
**Margine glyph**: 0-3 text container liberi. Image container slot tutti **completamente liberi** per portrait/icone (vantaggio glyph mode, vedi §7.4b.7).

### 3.2 Even R1 Ring (verificato su evenrealities.com/smart-ring + support.evenrealities.com/specs)

| Parametro | Valore |
|---|---|
| Connessione | BLE → smartphone Even App → G2 |
| Gesture | set canonico Even Hub (`guides/input-events`): **press / double-press / swipe-up / swipe-down** — quattro eventi discreti, **nessun long-press / nessun input duration-based** (re-verified 2026-05-31, ADR-0012). Il R1 espone lo **stesso set di 4 gesture degli occhiali**. La pagina prodotto `/smart-ring` cita "tap, scroll, long-press" come marketing, ma la doc dev canonica vince |
| Biometria | HR, HRV, SpO₂, respiratory rate, skin temp, sleep, calorie, passi |
| Materiali | zirconia ceramica + **medical-grade stainless steel** lining, anti-fingerprint coating |
| Resistenza | IP68 (50 m / 30 min) |
| Batteria | ~4 giorni, ricarica completa ~90 min |
| Range operativo | -10 °C a 45 °C |
| Disponibilità API | gestures espongono eventi al plugin tramite Even App |

**Mapping gesture → azione** (proposta):

| Gesture R1 | Azione |
|---|---|
| Tap singolo (press) | conferma / espandi elemento focus / azione primaria del panel |
| Tap doppio (double-press) | **EXIT** root-page (`bridge.shutDownPageContainer(1)`) sulla mappa · close/back sugli overlay |
| Swipe-up | scroll su contenuto pagina; **al top boundary = over-scroll** → apri **Quick Action menu** (§7.13a) |
| Swipe-down | scroll giù contenuto pagina |

> **Over-scroll = invocazione Quick Action** (ADR-0012). Non esiste un quinto gesture: il menu si apre quando il layer in focus riceve uno `swipe-up` mentre è già al proprio top boundary. I layer non scrollabili sono sempre "al top", quindi un singolo `swipe-up` apre il menu. Cambio pagina/overlay non avviene più via swipe laterale (l'hardware non espone swipe dx/sx): la navigazione tra panel passa dal Quick Action menu.

### 3.3 Networking (verificato su `hub.evenrealities.com/docs/guides/networking`)

| Parametro | Valore |
|---|---|
| Protocolli | **fetch / XMLHttpRequest / WebSocket** |
| Whitelist | ogni dominio outbound deve essere in `app.json` `network.whitelist`. **Una entry per origin completo** (`https://api.example.com`) — **bare hostnames e wildcards NON supportati** |
| HTTPS | **obbligatorio in produzione**; HTTP solo in local development |
| CORS | enforced lato browser (gate indipendente dal whitelist Even). Il bridge **deve** rispondere con `Access-Control-Allow-Origin` e — per richieste non-simple — preflight `204 No Content` con `Allow-Methods` + `Allow-Headers` |
| Payload max | non documentato — assumere best-effort, comprimere |
| Storage | non documentato localStorage |

**Implicazione**: il **Bridge service è obbligatorio** (anche solo come reverse-proxy CORS-friendly) — non è più "optional" come nella v0.1.

### 3.4 Foundry VTT (verificato su github.com/foundryvtt/dnd5e)

- **Versione minima**: Foundry **v13.347** (richiesto da dnd5e 5.x), **v14 verified**. Sistema **dnd5e ≥ 5.x** (Activity system obbligatorio). **v12 NON è più supportato** da dnd5e 5.0.x in poi (verificato su `system.json` upstream 2026-05).
- **Activity system**: ogni item espone `item.system.activities` (Collection di PseudoDocument).
- **Trigger azione**: `activity.use(usage, dialog, message)` — passa `dialog: { configure: false }` per fast-forward.
- **Classi attività** (12 totali, dnd5e 5.3.x): `AttackActivity`, `DamageActivity`, `CastActivity`, `SaveActivity`, `HealActivity`, `UtilityActivity`, `EnchantActivity`, `SummonActivity`, `CheckActivity`, `ForwardActivity`, `TransformActivity`, e `OrderActivity` (semi-privata, usata internamente per Group Actor — non documentata nella wiki ufficiale).
- **AoE**: `AbilityTemplate.fromActivity(activity)` ritorna **`AbilityTemplate[] | null`** (array — alcune attività multi-target emettono più template). Ogni elemento estende `MeasuredTemplate`. Il client deve iterare l'array.
- **Targeting v13**: `Token#setTarget` non accetta più parametro `user` — il bridge deve agire come l'utente del player; **`TokenLayer#setTargets(tokens)`** (singolare `Token`, NON `Tokens`) per multi-target.
- **Hooks chiave per write path**: `dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.preRollAttackV2` / `dnd5e.rollAttackV2` / `dnd5e.postRollAttackV2`, `dnd5e.preRollDamageV2` / `dnd5e.rollDamageV2`, `dnd5e.preCreateActivityTemplate`. **Nota dnd5e 5.x**: i pre-roll moderni sono i **V2** (V1 deprecati). Future-proof: usare V2 ovunque.
- **Permission boundaries**: un player può eseguire `activity.use()` solo su actor posseduto. Per azioni GM-side, forward via `socketlib.executeAsGM`.
- **i18n / Localization** (verificato su `foundryvtt.com/api/classes/foundry.helpers.Localization.html`): `game.i18n` (istanza `Localization`) espone `lang` (current BCP-47 code, es. `"it"`, `"en"`), `defaultLanguage`, `localize(key)`, `format(key, data)`, `has(key)`. Setting core: `core.language`. Modules registrano cataloghi via `manifest.languages: [{lang, name, path}]`. dnd5e ufficialmente fornisce IT + EN + altri. **Strategia evenfoundryvtt**: la lingua iniziale viene **dedotta da `game.i18n.lang`** al boot; runtime override possibile dal G2 senza cambiare il setting Foundry server-side (vedi §7.16).

### 3.5 G2 SDK Audio Surface (verificato su `hub.evenrealities.com/docs/guides/device-apis` + `BxNxM/even-dev` simulator)

Il G2 espone **mic capture** agli app di terze parti. È l'unica capability audio disponibile (no output, no TTS).

**API**:

```js
// Start capture
bridge.audioControl(true);

// Stop capture
bridge.audioControl(false);

// Receive PCM frames
bridge.onEvenHubEvent((event) => {
  if (event.audioEvent?.audioPcm) {
    // event.audioEvent.audioPcm = ArrayBuffer / Uint8Array
    // Format: PCM 16 kHz, signed 16-bit little-endian, MONO
  }
});
```

**Format esposto agli app**: PCM 16 kHz · s16le · 1 canale (verbatim hub.evenrealities.com/docs/guides/device-apis).

**Pipeline interna** (informativa, non manipolabile dall'app):

```
G2 4-mic array → BLE (LC3 codec, BT 4.2+) → Even Realities App phone
                                                    │
                                                    ├─ Hub SDK decode LC3
                                                    ▼
                                          PCM 16 kHz s16le mono
                                                    │
                                                    ▼
                                          event.audioEvent.audioPcm  →  app dev (WebView)
```

LC3 raw è il codec BLE Audio (verificato su `github.com/even-realities/EvenDemoApp` cmd `0x0E` activate mic + `0xF1` LC3 reception). L'app dev **non vede LC3** — riceve già PCM decompresso.

**Limitazioni documentate**:

- **No audio output**: l'API è unidirezionale (input only). Nessun TTS, nessun beep, nessun feedback acustico.
- **No transcript on-glasses**: il PCM non è pre-processato da STT firmware; arriva grezzo.
- **No event type "voice"** in `bridge.onEvenHubEvent` event taxonomy (§3.4 analog: solo `CLICK_EVENT` / `DOUBLE_CLICK_EVENT` / `SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT` / `FOREGROUND_*` / `ABNORMAL_EXIT_EVENT` — verbatim `hub.evenrealities.com/docs/guides/input-events`).
- **Chunk size / buffering**: non documentato upstream (Phase 0 §10.0.4 measure).
- **Concorrenza con EvenAI nativo**: aprire `audioControl(true)` mentre l'utente attiva "Hey Even" → comportamento non documentato (Phase 0 test → §10.0.4 esteso).

**Implicazione architetturale per evenfoundryvtt**:

- **Voice control è hardware-fattibile** sul nostro stack: cattura PCM → STT cloud (§4.5) → tool MCP (§5.7).
- L'audio capture **non gira sul G2 firmware** ma sul WebView dell'Even Realities App sul telefono (vedi §3.7). Latenza BLE già contabilizzata.
- Phase 0 §10.0.4 (Test Audio Capture) è **già nel roadmap V2** — nessun cambio.

### 3.6 G2 Native AI Features (NOT integrable as developer)

Il G2 ha **feature AI nativa** controllata da Even Realities. Tutte sono **opaque agli app dev** (no API, no events, no transcript subscription).

| Feature | Cosa fa | Activation | Processing | API per dev? |
|---|---|---|---|---|
| **EvenAI** ("Hey Even") | Q&A, weather, currency, multi-turn conversation, 22+ lingue | wake word "Hey Even" o TouchPad | "Even LLM" proprietario, cloud via paired phone (verbatim `evenrealities.com/ai-glasses`: *"connect to your phone's internet connection to access the AI engine"*) | ❌ |
| **Translate** | Real-time translation, **33-35 lingue** display sui lens | manuale via app | cloud-only (verbatim `evenrealities.com/translation-glasses`: *"translation requires internet access through our app, as it uses the cloud to translate your conversation in real-time"*) | ❌ |
| **Conversate** | Trascrive conversation → AI summary nell'app | manuale | cloud STT + LLM | ❌ |
| **Teleprompt** | Ambient script display | manuale | local | ❌ (display feature, non AI) |
| **QuickNote / dictation** | (G1, non G2 confirmed) | — | — | — |

**Verbatim limitations** (cross-validated):

- `hub.evenrealities.com/docs/guides/input-events`: nessun event type `voice`, `transcript`, `aiResponse` — only touch+lifecycle (vedi §3.5 tassonomia).
- `hub.evenrealities.com/docs/guides/device-apis`: nessuna API per invocare EvenAI o subscribe transcript.
- `evenrealities.com/ai-glasses`: ChatGPT è **G1-only** (footnote `*Even G1 only`); G2 usa "Even LLM" proprietario non-API.

**Implicazione architetturale per evenfoundryvtt**:

- **AI on-glasses è IMPOSSIBILE per la nostra app** — non è una scelta di design, è un vincolo di piattaforma.
- La nostra V2 voice/AI strategy **deve restare external** — è esattamente il pattern §5.7 `foundry-mcp` (LLM gira nel client MCP esterno; il G2 vede solo il risultato come toast/status update). Confermato architettonicamente corretto.
- **Nessuna dipendenza** da EvenAI nativo: non è dependable surface (proprietary, non-versioned, no SLA dev).
- **Nessun conflitto UX desiderato**: il nostro `[L]ong-press` apre il nostro Quick Action, non "Hey Even" (l'utente può comunque triggerare EvenAI parallelamente — è una feature OS-level che non blocca i plugin).

**Phase 15 mitigation (v0.9.12):** Lo status quo è stato **re-verified ✓ 2026-05-17** con una passata INV-2 su 6 domini canonici Even Realities (`hub.evenrealities.com/docs/{getting-started/overview,guides/device-apis,guides/input-events}`, `github.com/even-realities/EvenDemoApp`, `evenrealities.com/ai-glasses`, community Zenn.dev) — evidenze in `.planning/quick/20260517-voice-intent-research/RESEARCH.md` §1. **Nessuna apertura developer di EvenAI**: zero transcript subscription, zero intent hook, zero wake-word API, zero audio-enhancement API. La pipeline Phase 12 (Deepgram Nova-3 + Claude Desktop MCP) resta l'unica architettura praticabile con SDK pubblico. La mitigazione Phase 15 (chiusa 2026-05-17) non aggira il vincolo §3.6 — **estende** Deepgram Nova-3 Multilingual con il parametro `keyterm` (Deepgram learn article: **+625% entity-recall lift** su vocabolario esoterico tipo Bigby's Hand, Counterspell, Vrock), seedato dall'unione dei 70 spell SRD statici (`SPELL_KEYTERMS`) e del vocabolario dinamico Foundry-derived (entity-pack: items/weapons/armor/NPCs/monsters). L'architettura voice resta invariata; `keyterm` è un parametro, non un nuovo sistema. **Picovoice Rhino** edge-classifier (latency p50 ~200ms via Speech-to-Intent on-device, supporta IT) resta deferito condizionalmente all'esito di SC-12-01 (hardware test: se p50 misurato > 800ms, valutare ADR follow-up; ad oggi non misurabile senza hardware, carry-forward sotto ADR-0005 Branch A). Vedi §5.2 per il dettaglio bridge-side.

### 3.7 Plugin Execution Model (verificato su `hub.evenrealities.com/docs/getting-started/overview` + `github.com/BxNxM/even-dev` + `github.com/brianmatzelle/even-realities-g2-glasses`)

Verbatim upstream Even Hub: *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."*

Verbatim simulator README: *"G2 plugins are web apps where **your code runs on a server**, the iPhone Even App loads it in a WebView, and relays display/input over BLE to the glasses."*

**Conseguenza architettura evenfoundryvtt** — **3 hop deployment** (correzione v0.9.11 vs v0.9.10):

```
┌──────────────────────┐  BLE LC3 audio + display ops  ┌──────────────────────────────┐
│  Even G2 (firmware)  │ ◀────────────────────────────▶│  Even Realities App (phone)  │
│  • Display 576×288   │                               │  • WebView host                │
│  • 4-mic array       │                               │  • Hub SDK runtime (bridge.*)  │
│  • Touchpads + IMU   │                               │  • Per-app phone settings UI   │
│  • EvenOS (closed)   │                               │     (vedi §7.14.7)             │
└──────────────────────┘                               └──────┬───────────────────────┘
                                                              │ HTTPS GET (load WebView)
                                                              ▼
                                                       ┌──────────────────────────────┐
                                                       │  Plugin host (server)        │
                                                       │  evenfoundryvtt-g2/index.html│
                                                       │  + JS bundle                  │
                                                       └──────┬───────────────────────┘
                                                              │ HTTPS / WSS (game state)
                                                              ▼
                                                       [ Bridge service §5.2 ]
                                                       [ Foundry VTT §3.4 ]
                                                       [ MCP client (V2) §5.7 ]
```

**Punti chiave**:

- **Il codice plugin è servito da un server HTTP**, NON bundlato nell'Even Realities App. Il manifest (`app.json`) dichiara una URL → WebView phone fetcha quella URL → JS gira nel WebView.
- **Due URL distinte nel deployment**:
  - **Plugin host URL** (es. `https://evenfoundryvtt.example/g2/`) — serve l'HTML+JS del plugin. Statico, CDN-friendly, zero state.
  - **Bridge URL** (es. `https://homelab.lan:8910` o tunnel `https://br.evenfoundryvtt.example`) — endpoint REST/WS dinamico verso Foundry (§4.2). Configurato runtime via §7.14.7.
- **Local dev**: usare l'IP della LAN della macchina dev (verbatim simulator: *"use your machine's local network IP, not localhost"*) — `localhost` non risolve dal phone WebView.
- **Network whitelist** (§3.3) è enforced sul WebView del telefono. **Entrambi** plugin host URL e bridge URL devono essere in `app.json` whitelist (origin completo, no wildcards).
- **Audio mic** (§3.5) arriva al WebView in PCM 16 kHz mono già decoded.
- **Nessun "on-glasses LLM"** disponibile (§3.6 vincolo).

### 3.8 Plugin Configuration Surface (Even Realities App)

Verbatim upstream `support.evenrealities.com`: *"You can configure each widget individually through the Even App."* La Even Realities App **espone una settings UI per-plugin** sul telefono (analog Conversate / Translate / Teleprompt / Even AI hanno tutte un loro settings panel). evenfoundryvtt usa questo canale per le **connection-bootstrap settings** che richiedono input testuale (impossibile sul G2 — no keyboard, vincolo §3.1).

**Settings esposte nell'Even Realities App per il plugin evenfoundryvtt** (vedi mockup §7.14.7):

| Campo | Tipo | Esempio | Note |
|---|---|---|---|
| Bridge URL | URL string | `https://homelab.lan:8910` | Endpoint REST/WS verso Foundry. HTTPS prod, HTTP solo dev. Whitelist app.json richiesta. |
| Auth token | password (paste) | `evf_a3b2c1...` | Bearer 24h dal Foundry module §11.5.4. Copiato dal DM nel PairModal Foundry e **incollato** dal player (la piattaforma Even Hub non espone fotocamera/QR-scan alle app — vedi §7.14.7.3). |
| Player / character | enum (post-handshake) | `Thorin (multi)` | Lista popolata via bridge `/v1/actor` dopo connessione. Selezione via tap sul phone. |
| World identifier (opt) | string | `homebrew-2024` | Auto-detected via handshake; override manuale se più world condivisi. |
| Connection profile | enum | `homelab / cloud / dev` | Multi-profile per chi gioca su più server (es. Linux homelab + remote VPS). |
| Auto-connect at G2 wear | boolean | `true` | Se G2 indossato e profilo selezionato → connect automatico, no input richiesto. |

**Storage**: queste settings vivono nel **phone-side persistent storage** del plugin (managed dall'Even Realities App, non dal nostro codice). Sopravvivono al kill del WebView, all'app restart, al G2 reboot. Vengono resettate solo a uninstall plugin o factory-reset Even Realities App.

**Discovery & bootstrap flow** (worked example §7.14.7.2):

1. User installa l'app EVF via Even Hub. **Dev**: `evenhub qr` genera un QR che codifica l'**URL del plugin-host** (verbatim CLI reference: *"deployment involves scanning a QR code with the Even Realities App on your phone"* — il QR carica l'app, NON un token). **Prod**: `evenhub pack` → `.ehpk` → review manuale sul portale → install dall'app store dentro l'Even Realities App.
2. Plugin host URL diventa available in Even Realities App.
3. User apre il plugin → Even Realities App carica WebView → plugin detecta first-run (no settings) → mostra **on-phone setup wizard** (HTML form rendered nel WebView phone-side, **non** sul G2).
4. User incolla bridge URL + auth token (il token è **copiato** dal PairModal del Foundry module; nessuno scan QR — la piattaforma non espone fotocamera alle app, §3.1).
5. Plugin chiama handshake `GET /v1/actor` → riceve lista character → user seleziona → settings persistite.
6. User mette G2 → plugin auto-connecta con settings persistite → render HUD (§7.4).

**Verbatim quote pertinente** (`support.evenrealities.com/User-guide`): *"go to 'Setting - Notification' to select which app you want notifications in the glasses, and go to 'Setting - Dashboard' to organize your dashboard"* — conferma il pattern "Setting - <plugin name>" come surface standard.

---

## 4. APIs & Dependencies

### 4.1 Foundry Module API (esposta dal modulo `evenfoundryvtt`)

```javascript
game.modules.get('evenfoundryvtt').api = {
  // Read
  getCharacterState(actorId): CharacterState
  getCombatState(): CombatState
  getSceneViewport(tokenId, opts): SceneViewport
  getEventLog(limit): Event[]
  subscribeUpdates(callback): UnsubscribeFn

  // Write (gated by user permissions)
  useActivity(actorId, itemId, activityId, opts): UsageResult
  setTargets(tokenIds[]): void
  placeTemplate(activityId, point, opts): TemplateId
  rollSkill(actorId, skill, opts): Roll
  applyDamage(tokenId, amount, type): void  // requires GM forward via socketlib

  // Voice/AI helpers
  describeActorCapabilities(actorId): ActorCapabilities  // tools menu for LLM
  describeSceneSnapshot(): SceneSnapshot                  // visible tokens, ranges

  // i18n (vedi §7.16)
  getLocale(): { foundry: string, override: string | null, effective: string, available: string[] }
  setLocale(code: string | null): void   // null = clear override, fallback to foundry locale
  subscribeLocale(cb: (effective: string) => void): UnsubscribeFn
}
```

### 4.2 Bridge REST + WebSocket Surface

```
GET  /v1/actor/:id                  → full character state (auth: player token)
GET  /v1/scene                      → current scene viewport
GET  /v1/combat                     → combat tracker
GET  /v1/log?limit=20               → event log
POST /v1/voice                      → multipart audio (V2 ONLY — vedi §5.7 MCP server)
POST /v1/action/use-activity        → typed action call (bypass STT)
POST /v1/action/set-targets         → token IDs
WS   /v1/stream                     → push delta updates (state, events)
```

Auth: bearer token per-player, derivato dal Foundry user. Rate limit: 10 req/s per token, audio max 30 s.

### 4.3 Even G2 SDK Surface (used)

| Capability | API |
|---|---|
| Page lifecycle | `onPageLoad`, `onPageUnload` |
| Container CRUD | `createTextContainer`, `createImageContainer`, `createListContainer`, `updateText`, `updateImageRawData`, `updateList` |
| Event capture | `isEventCapture: 1` su un container, riceve `onTap`, `onScroll`, `onLongPress` |
| Audio | **`bridge.audioControl(true \| false)`** + `event.audioEvent.audioPcm` → **PCM 16 kHz s16le mono** (verificato §3.5). Mic input only — no audio output (G2 has no speaker, vedi §3.1) |
| Networking | `fetch`, `WebSocket` (whitelist obbligatoria) |

### 4.4 Even R1 Ring SDK

Eventi ring espressi al plugin via Even App:

| Evento | Payload |
|---|---|
| `r1.tap` | `{ count: 1\|2, timestamp }` |
| `r1.scroll` | `{ direction: "up"\|"down"\|"left"\|"right", magnitude }` |
| `r1.longPress` | `{ phase: "start"\|"end", duration_ms }` |
| `r1.biometrics` | `{ hr, hrv, spo2, ts }` (low-frequency push) |

⚠️ La superficie esatta degli eventi R1 nel SDK Even Hub è il set canonico a 4 gesture (`press / double-press / swipe-up / swipe-down`, `guides/input-events`, ADR-0012); il design non assume più alcun long-press. **Validation con SDK reale = milestone 0.**

### 4.5 STT (Speech-to-Text) — V2 opzionale

> Non richiesto dal MVP. Solo se si abilita il modulo voice (§5.7).
>
> **Hardware feasibility (RESOLVED v0.9.10)**: l'input audio è disponibile **direttamente dal G2** via `bridge.audioControl()` → PCM 16 kHz s16le mono (vedi §3.5). Nessun hardware aggiuntivo richiesto. STT cloud o self-hosted gira nel **bridge service** (§5.2) o nel **client MCP** (§5.7) — il G2 non vede mai un LLM (vincolo §3.6: AI nativa Even è non-API, deve essere external).

**Default cloud**: AssemblyAI Universal-Streaming, P50 ~250–310 ms (median ~307 ms), **$0.0025/min** ($0.15/h — verificato 2026-05 su `assemblyai.com/pricing`).
**Alternativa cloud**: Deepgram Nova-3, **TTFT <300 ms**. Pricing 2026-05 (verificato direct su `deepgram.com/pricing`):
  - Nova-3 **Monolingual streaming PAYG $0.0048/min** (~$0.29/h) · Growth tier **$0.0042/min** (~12% saving) · pre-recorded PAYG $0.0077/min · Growth $0.0065/min
  - Nova-3 **Multilingual streaming PAYG $0.0058/min** · Growth $0.0050/min — utile per sessioni in italiano se il modello English-only di AssemblyAI non basta
  - Alcune fonti terze (blog, comparison) citano $0.0077/min anche per streaming — è il prezzo **pre-recorded**, non streaming. **Pin del prezzo a build-time**: leggere live da pricing API o fissare contratto Growth per stabilità — non hard-code in spec.
**Locale**: distil-whisper-large-v3 via faster-whisper, ~300–600 ms su GPU desktop.

Nota: se il client MCP scelto è Claude Desktop o equivalente, lo STT è già integrato — non serve componente esterno. Il modulo `foundry-mcp` non implementa STT, lo delega al client.

### 4.6 LLM (Voice agent) — V2 opzionale

> Non richiesto dal MVP. Lo strato LLM vive **fuori** dal sistema EvenFoundryVTT: è il client MCP che il giocatore sceglie.

**Compatibili**: qualunque LLM client che parli MCP — Claude Desktop, Claude Code, future app supportate. Anthropic Claude Sonnet/Opus offrono streaming tool use più maturo a oggi; GPT-5 e altri seguiranno con supporto MCP.

### 4.7 MCP (Model Context Protocol) — V2 opzionale

Il modulo opzionale **`foundry-mcp`** (§5.7) implementa Model Context Protocol per esporre i tool Foundry a qualunque client LLM compatibile.

**Trasporti**: **stdio** (per client locali come Claude Desktop) e **Streamable HTTP** (per client remoti, spec MCP 2025-03-26+). HTTP+SSE è **deprecato** dal 2025-03-26 ma resta retrocompat-only per server legacy.
**Tool exposed**: `cast_spell`, `weapon_attack`, `use_item`, `skill_check`, `move_token`, `place_template`, `set_targets`, `clarify`. (Mappano 1:1 ai tool del Tool Registry bridge §5.3.)
**Resources exposed**: `actor://{id}`, `scene://current`, `combat://current`, `log://recent`.

Spec: https://modelcontextprotocol.io/. SDK ufficiali in TypeScript e Python.

**Nota schema**: la spec MCP definisce tools con **JSON Schema sul wire**. Il TS SDK (server-side) usa **Zod / Standard Schema** che viene serializzato a JSON Schema in fase di registrazione tool — il developer scrive Zod, il client riceve JSON Schema standard.

### 4.8 Dependency: socketlib, MidiQOL

- **socketlib** (https://github.com/farling42/foundryvtt-socketlib) — pattern: `const socket = socketlib.registerModule("evenfoundryvtt"); socket.register("handlerName", fn); await socket.executeAsGM("handlerName", ...args)`. NON è static — registra il modulo per ottenere l'instance. Altri metodi: `executeAsUser`, `executeForAllGMs`, `executeForOtherGMs`, `executeForEveryone`, `executeForOthers`, `executeForUsers`.
- **MidiQOL** (https://gitlab.com/tposney/midi-qol) — wrapper full-flow attack→damage→save→effect. Forte raccomandazione per ridurre LOC nel modulo.

---

## 5. Components

### 5.1 Foundry Module — `evenfoundryvtt`

**Responsabilità**:

- Espone API read/write descritta in §4.1
- Gestisce hooks Foundry e dnd5e per produrre delta events
- Mantiene WebSocket persistente verso Bridge (autenticato)
- Implementa caching locale per evitare hammer su Actor.update

**Files (proposti)**:

```
modules/evenfoundryvtt/
├─ module.json
├─ scripts/
│  ├─ init.js                # registrazione hooks, settings
│  ├─ api.js                 # superficie game.modules.get(...).api
│  ├─ readers/
│  │   ├─ character.js
│  │   ├─ combat.js
│  │   ├─ scene.js
│  │   └─ log.js
│  ├─ writers/
│  │   ├─ use-activity.js    # wrapper su activity.use()
│  │   ├─ targets.js
│  │   └─ template.js        # AbilityTemplate AoE
│  ├─ bridge-client.js       # WS verso bridge, auth, retry
│  └─ describer.js           # genera tool schema per LLM
├─ styles/
└─ lang/en.json, lang/it.json
```

### 5.2 Bridge Service

**Responsabilità**:

- Reverse-proxy CORS-friendly per il G2 (deve emettere `Access-Control-Allow-Origin`)
- Cache stato (Redis o in-memory LRU)
- Orchestra GM Agent (voice pipeline)
- Auth token per-player

**Stack proposto**:

- **Runtime**: Node.js 22 + Fastify (alternativa: Bun + Hono)
- **WS**: ws nativo, fanout per-utente
- **Cache**: Redis (opzionale per MVP; in-memory ok)
- **Deploy**: Docker Compose, stessa rete del Foundry homelab
- **Observability**: pino logs + Prometheus metrics

**Phase 15 — Deepgram Keyterm Prompting (v0.9.12, chiuso 2026-05-17)**: il builder di URL della sessione Deepgram (`packages/bridge/src/voice/deepgram-stt.ts`) ora accetta un `keytermProvider: () => string[]` invocato lazily a ogni `connect()` e appende un parametro query `keyterm=<URL-encoded>` per elemento. Il provider di default in `server.ts` step 10 chiude su `EntityPackCache` e ritorna `buildKeytermList(SPELL_KEYTERMS, entityCache.get())` — unione static (70 incantesimi SRD × IT+EN = 140 candidati) + dynamic (entity-pack Foundry-derived: items/weapons/armor/NPCs/monsters via canale push `/internal/delta`, vedi §11.5.5 Tier 1). **`DEEPGRAM_KEYTERM_LIMIT = 100`** (cap documentato Deepgram); su overflow si tronca prima l'entity-pack dinamico (CONTEXT D-04) per proteggere il lift di recall sul vocabolario SRD canonico. Hot-update: `KeytermRefresher` con debounce 250ms + drain-then-restart mutex su `EntityPackCache.onChange()` — la lista keyterm è osservabile telemetricamente via `event=keyterm.refreshed` ma il refresh in-stream non è supportato dal protocollo WS Deepgram, quindi il refresh diventa effettivo al prossimo `connect()` (sessioni Deepgram sono short-lived per-utterance, SLA VOICE-09 ≤ 5 min soddisfatto). Failure modes: empty-cache → one-shot warn `keyterm.empty-entity-cache` (reset on recovery); close codes 1007/1008/4xxx → retry-with-`sanitizeKeyterms` (strip ASCII control chars; Unicode letter-safe per IT spell names) → fallback baseline Phase 12 byte-for-byte (DGKT-04 regression-safe). Plan refs: `15-01..05-PLAN.md`.

### 5.3 Tool Registry (parte del Bridge — sempre attivo)

Indipendentemente dal canale (R1 manual o MCP voice), il Bridge espone una **lista canonica di tool** che eseguono azioni Foundry:

```typescript
type Tool =
  | { name: "cast_spell"; input: { spell_id, slot_level, targets, concentration_drop? } }
  | { name: "weapon_attack"; input: { weapon_id, target_id, action_type: "action"|"bonus"|"reaction", advantage?: "auto"|"yes"|"no" } }
  | { name: "use_item"; input: { item_id, consumable: boolean } }
  | { name: "skill_check"; input: { skill, dc_hint? } }
  | { name: "move_token"; input: { destination: {x,y}|string, trigger_oa: "auto" } }
  | { name: "place_template"; input: { activity_id, point: {x,y} } }
  | { name: "set_targets"; input: { token_ids: string[] } }
  | { name: "clarify"; input: { question, options: array } }   // usato solo via MCP voice
```

**Chi chiama questi tool**:

- **MVP**: il G2 app stesso, in risposta a gesture R1 (es. tap su Spellbook overlay → tap su Fireball → conferma target). La traduzione gesture→tool è deterministica, gestita dal panel.
- **V2 opzionale**: il MCP server `foundry-mcp` (§5.7) li espone all'LLM client, che li invoca dopo aver interpretato la voce.

In entrambi i casi il Bridge esegue lo stesso codice — single source of truth per le azioni.

### 5.4 G2 App — `EvenFoundryVTT`

Vedi §7 per UI dettagliata.

**Modello UI**: una sola "main page" con **3 layer**:

1. **Map base layer** — sempre disegnato, sempre visibile (eccetto modal full-screen)
2. **Persistent Status HUD** — corner card destra, sempre visibile in gameplay
3. **Overlay slot** — un panel modulare alla volta sopra la mappa (Sheet, Combat, Log, Spellbook, Inventory, Action confirm)

Pagine separate solo per: `Boot` (setup iniziale, MVP) e `QuickAction` (modal full-screen aperto via over-scroll — swipe-up al top boundary, MVP). `VoiceModal` solo V2 — non incluso nel MVP file layout.

**File layout** (panel-based, modulare):

```
g2-app/
├─ app.json                       # whitelist, manifest, capability declaration
├─ index.html                     # entrypoint plugin
├─ src/
│  ├─ core/
│  │   ├─ app.js                  # orchestrator, layer composition
│  │   ├─ state-store.js          # observable state, delta apply
│  │   ├─ event-router.js         # routes R1+G2 events to active layer
│  │   ├─ frame-painter.js        # bezel + header + footer
│  │   ├─ capability.js           # negotiate with bridge at boot
│  │   └─ telemetry.js            # frame timing, latency, errors
│  ├─ layers/
│  │   ├─ layer-manager.js        # z-order, capture ownership
│  │   ├─ map-base/               # base map layer
│  │   │   ├─ index.js
│  │   │   ├─ render.js
│  │   │   └─ events.js
│  │   ├─ status-hud/             # persistent corner card
│  │   │   ├─ index.js
│  │   │   ├─ render.js
│  │   │   └─ subscribe.js
│  │   └─ overlay-slot/           # dynamic panel mount point
│  │       ├─ index.js
│  │       ├─ stack.js            # backstack/dismiss management
│  │       └─ animations.js       # blink, scroll-in
│  ├─ panels/                     # PLUGIN: each panel is a self-contained module
│  │   ├─ _registry.js            # auto-discovers panels in this folder
│  │   ├─ _panel-api.js           # base interface contract
│  │   ├─ sheet/
│  │   │   ├─ manifest.json       # id, title, size, data deps
│  │   │   ├─ render.js
│  │   │   └─ events.js
│  │   ├─ combat/
│  │   ├─ log/
│  │   ├─ spellbook/
│  │   └─ inventory/
│  │   # (voice/ e clarify/ NON nel MVP — vivono nel client MCP V2 §5.7)
│  ├─ providers/                  # PLUGIN: swappable services
│  │   ├─ bridge-ws/              # default WS client
│  │   ├─ bridge-http/            # fallback polling
│  │   └─ ring-r1/                # R1 event source
│  ├─ render/                     # primitives shared by panels
│  │   ├─ hp-bar.js
│  │   ├─ glyph-grid.js           # unicode map renderer (glyph mode)
│  │   ├─ list.js
│  │   ├─ chip.js                 # nav chips footer
│  │   ├─ box.js                  # ASCII border boxes
│  │   ├─ image-tile.js           # raster tile container update (Layer 1)
│  │   ├─ dither.js               # FS / Atkinson / Bayer dither
│  │   ├─ subtile-delta.js        # 20×20 sub-tile delta encoding (Layer 2)
│  │   ├─ rle.js                  # custom RLE for 4-bit greyscale (Layer 4)
│  │   ├─ static-cache.js         # background dirty-flag tracking (Layer 3)
│  │   └─ adaptive-fps.js         # frame rate state machine (Layer 6)
│  ├─ pages/
│  │   ├─ boot.js                 # standalone page (MVP)
│  │   ├─ main.js                 # layered gameplay page (MVP)
│  │   ├─ quick-action.js         # modal over-scroll menu (MVP)
│  │   └─ voice-modal.js          # full-screen PTT (V2 only — not in MVP build)
│  └─ config/
│      ├─ schema.json             # versioned settings schema
│      └─ defaults.json
└─ assets/
    └─ icons/                     # max 200×100, 4-bit greyscale PNG
```

**Punti chiave per modularità**:

- I panel in `src/panels/*` sono **plugin auto-discovered** — aggiungere `src/panels/spellbook/manifest.json` registra il panel senza toccare core.
- I provider (`src/providers/*`) sono interface-based — swap WS↔HTTP↔offline-mock senza modificare panel.
- Ogni layer (`map-base`, `status-hud`, `overlay-slot`) gestisce le proprie subscription ed eventi, non c'è coupling diretto tra layer.

### 5.5 R1 Integration

Layer JS dentro G2 app che traduce eventi R1 in azioni applicative. Vedi §3.2 per mapping. Long-press emette anche feedback haptic se il SDK lo supporta.

---

### 5.6 Modular & Future-Proof Architecture

Principio guida: **ogni componente cambiabile dal mondo esterno è un plugin con un contratto**. SDK Even cambia? Si aggiorna `providers/g2-sdk-vXX`. Esce un anello R2? Si aggiunge `providers/ring-r2`. dnd5e v6 ridisegna activity? Si pinna `foundry-adapter@v5` e si scrive `foundry-adapter@v6` in parallelo. Niente breaking change a cascata.

#### 5.6.1 Boundary Map (chi parla con chi)

```
        ┌────────────────────────────────┐
        │         G2 APP CORE            │
        │  state-store · layer-manager   │
        └───┬────────┬────────┬──────────┘
            │        │        │
            ▼        ▼        ▼
       ┌────────┐┌──────┐┌──────────┐
       │ panels ││layers││providers │   ← plugin slots
       └────────┘└──────┘└──────────┘
                              │
                              ▼  protocol v1
        ┌────────────────────────────────┐
        │       BRIDGE (services)        │
        │  ┌──────────────────────────┐  │
        │  │   GM Agent kernel         │ │
        │  │  - tools/* (registry)    │  │   ← plugin slot
        │  │  - providers/stt/* / llm/*│ │   ← plugin slot
        │  └──────────────────────────┘  │
        └───────────────┬────────────────┘
                        │  foundry-adapter
                        ▼
        ┌────────────────────────────────┐
        │  FOUNDRY MODULE evenfoundryvtt     │
        │  - readers/* / writers/*       │   ← plugin slots
        │  - dnd5e-binding (versioned)   │
        └────────────────────────────────┘
```

Ogni freccia è un **contratto versionato**. Ogni "plugin slot" ha un'interfaccia minima documentata.

#### 5.6.2 Plugin Contracts

**Panel** (G2 app):

```typescript
interface PanelManifest {
  id: string;                       // "sheet", "combat", "spellbook"
  version: string;                  // semver
  title: string;
  size: "panel" | "modal";          // panel = covers map area; modal = full-screen
  dataSubscriptions: string[];      // ["actor.*", "combat.turn"]
  capabilities: string[];           // ["text.long", "list.20"]
}

interface Panel {
  manifest: PanelManifest;
  render(state: AppState): ContainerSpec[];
  handleEvent(ev: G2Event | R1Event): PanelAction | null;
  onOpen(ctx): void;
  onClose(ctx): void;
}
```

**Tool** (GM Agent):

```typescript
interface Tool {
  name: string;                     // "cast_spell", "weapon_attack"
  description: string;              // for LLM
  inputSchema: JSONSchema;
  preconditions(state): boolean;    // is action legal right now?
  execute(input, ctx): Promise<Result>;
}
```

**Provider** (STT, LLM, Bridge transport):

```typescript
interface STTProvider {
  id: string;                       // "assemblyai", "deepgram", "distil-whisper-local"
  startStream(audioStream): AsyncIterator<TranscriptChunk>;
  capabilities: { streaming: bool; languages: string[]; latencyP50_ms: number };
}

interface LLMProvider {
  id: string;                       // "anthropic-sonnet-4-6", "openai-gpt5-2", "local-llama-3.3"
  toolCall(messages, tools, opts): AsyncIterator<LLMEvent>;
  capabilities: { streaming: bool; toolCallStreaming: bool; maxContextTokens: number };
}
```

**Foundry Adapter** (versioned per dnd5e major):

```typescript
interface FoundryAdapter {
  dnd5eVersion: string;             // "5.x", "6.x"
  resolveActivity(actorId, intent): Activity;
  useActivity(activity, opts): UsageResult;
  setTargets(tokenIds): void;
  placeAoETemplate(activity, point): TemplateId;
}
```

#### 5.6.3 Capability Negotiation (handshake)

Al boot del G2 plugin, primo messaggio inviato al bridge:

```json
{
  "msg": "hello",
  "protocol": "1.0",
  "client": { "name": "evenfoundryvtt-g2", "version": "0.3.0" },
  "device": {
    "type": "even-g2",
    "displayResolution": [576, 288],
    "colorDepth": 4,
    "containerLimits": { "image": 4, "text": 8 },
    "ringPaired": true,
    "ringCapabilities": ["tap", "scroll", "longPress"]
  }
}
```

Il bridge risponde con:

```json
{
  "msg": "welcome",
  "protocol": "1.0",
  "server": { "version": "0.3.0" },
  "session": { "token": "...", "playerId": "...", "actorId": "..." },
  "negotiated": {
    "transport": "ws",
    "updateRate_ms": 200,
    "compression": "json-delta",
    "panelsAvailable": ["sheet", "combat", "log", "spellbook", "inventory"]
  }
}
```

Il client adatta in base a quello che il server offre — se `clarify` non è disponibile, l'overlay non viene mai chiamato; se il server dichiara protocol 1.1, il client può usare feature opzionali in modo retrocompatibile.

#### 5.6.4 Protocol Versioning Policy

- **Semver** (`major.minor.patch`).
- **Patch**: bug fix, payload identici → forward+backward compatible.
- **Minor**: campi additivi, mai rimozione → backward compatible.
- **Major**: breaking → richiede negoziazione `accept-versions`. Il bridge **mantiene il vecchio adapter per ≥1 ciclo major** (es. `v1` rimane attivo durante `v2`).
- Tutti i payload hanno un campo `protocol` esplicito; client e server validano allo handshake.

#### 5.6.5 Settings & Configuration Schema

`config/schema.json` è uno **JSON Schema versionato**. Ogni feature ha settings con default + range + descrizione. La UI Foundry settings è generata dal schema (no hard-coding). Migrazione settings tra versioni via `migrations/0001_init.js`, `0002_add_voice_provider.js`...

**Hot-reload**: cambio setting nel modulo Foundry → push `config.update` event al bridge → bridge re-inietta config nei panel attivi senza disconnettere il G2.

**i18n**: schema `i18n.override` + `i18n.fallback` definiti in §7.16.7. Override è **device-local** (LRU per-device, non world-scope) — non passa tramite il flusso `config.update` Foundry → bridge → panel, ma è gestito direttamente sul G2 via `[N]` Quick Action (vedi §7.16.3).

#### 5.6.6 Telemetry & Observability

Ogni componente emette **structured events** (`pino` JSON):

| Event | Da | Quando |
|---|---|---|
| `frame.render` | G2 app | ogni redraw, con `duration_ms`, `containers_count` |
| `event.input` | G2 app | ogni R1/G2 gesture, con `target_layer` |
| `panel.open` / `panel.close` | overlay-slot | con `panel_id`, `latency_to_render_ms` |
| `bridge.ws.send` / `recv` | bridge client | con `payload_bytes`, `delta_keys` |
| `stt.chunk` | STT provider | con `provider`, `latency_first_word_ms` |
| `llm.tool_call` | GM Agent | con `model`, `tool`, `latency_first_token_ms`, `tool_args_complete_ms` |
| `foundry.activity_use` | Foundry adapter | con `activity_id`, `latency_ms`, `outcome` |
| `error.*` | qualunque | con `component`, `code`, `recovered` |

Bridge espone `/metrics` Prometheus + `/healthz` + `/readyz`. Logs vanno in `journald` o file rotato.

#### 5.6.7 Test Strategy (test pyramid)

- **Unit** (~70%): renderer puri (input state → ContainerSpec), parser tool args, schema validators
- **Contract** (~20%): mock bridge ↔ G2, mock Foundry ↔ adapter (replay payload reali)
- **Integration** (~7%): bridge end-to-end con Foundry test world headless
- **E2E** (~3%): G2 simulator + bridge + Foundry, scripted scenari (Esempio A/B/C §8)

Ogni panel ha **fixture state** in `panels/<id>/__fixtures__/*.json` per snapshot test del rendering. Cambio mockup ASCII = update fixture, non riscrittura test.

#### 5.6.8 Update Strategy

| Cambio | Strategia |
|---|---|
| G2 app (cliente plugin) | versioning manifest `app.json`; fetch nuova versione via Even App; rollback automatico se boot crash >2× |
| Bridge | blue/green deploy via Docker Compose; `/readyz` smoke check; rollback `docker compose pull && up -d` versione precedente |
| Foundry module | semver + migrazioni in `migrations/`; backup world prima di major; documentazione changelog |
| Provider STT/LLM | swap via setting bridge `provider.stt = "deepgram"`; nessun restart del G2 |
| dnd5e major bump | `foundry-adapter` parallelo (v5 + v6 coesistono); negoziazione adapter al ws connect |

#### 5.6.9 Backward Compatibility Promise (MVP+)

Per ogni release:

- ✅ I payload `protocol: 1.x` sono leggibili da client `protocol: 1.x` (qualunque minor)
- ✅ I settings schema migrano automaticamente da N a N+1
- ✅ Le tool definitions LLM sono additive (mai rimuovere tool, deprecare con warning per ≥1 minor cycle)
- ✅ Foundry adapter pinning: ogni release del modulo dichiara `dnd5eCompatible: ["5.x", "6.x"]`

#### 5.6.10 Folder & Repository Layout

Monorepo (raccomandato):

```
evenfoundryvtt/
├─ packages/
│  ├─ foundry-module/           # il modulo Foundry (separately publishable)
│  ├─ bridge/                   # service Node.js
│  ├─ g2-app/                   # plugin Even Hub
│  ├─ foundry-mcp/              # V2 opzionale: MCP server (§5.7)
│  ├─ shared-protocol/          # tipi + schema condivisi (TypeScript)
│  └─ shared-render/            # primitive ASCII (box, glyph-grid) condivise
├─ docs/
│  ├─ architecture/             # ADR (Architecture Decision Records)
│  ├─ api/                      # API reference autogenerata
│  └─ runbooks/
├─ scripts/
└─ .github/workflows/           # CI: lint, type-check, test, build, release
```

Tooling consigliato: **pnpm workspaces** + **TypeScript** (anche per il G2 plugin) + **Vitest** + **Biome** (lint/format) + **Changesets** (release).

ADR (Architecture Decision Record) per ogni decisione strutturale: `docs/architecture/0001-layered-ui-model.md`, `0002-protocol-versioning.md`, `0003-tool-registry-pattern.md`, `0004-voice-via-mcp-not-internal.md`. Markdown, una pagina ciascuno, mai retroattivamente modificati (solo "superseded by NNNN").

---

### 5.7 `foundry-mcp` — V2 Optional Module (MCP Server)

> **Status**: non parte del MVP. Sviluppato dopo Phase 10 quando il MVP è stabile e field-tested.

**Scopo**: esporre i tool Foundry secondo Model Context Protocol così che qualunque client LLM compatibile (Claude Desktop, Claude Code, future app) possa guidare il VTT vocalmente. Disaccoppia totalmente l'AI dal core EvenFoundryVTT — un upgrade plug-in.

#### 5.7.1 Architettura

```
┌──────────────────────┐
│  MCP Client          │  Claude Desktop, Claude Code, ChatGPT con MCP, …
│  (built-in STT/UI)   │
└──────────┬───────────┘
           │ MCP protocol (stdio o Streamable HTTP)
           ▼
┌──────────────────────────────────────────┐
│  foundry-mcp                             │
│  - Tool list mirror del Bridge §5.3       │
│  - Resources: actor/scene/combat/log     │
│  - Auth: bearer token (player session)   │
│  - Stateful per session (context cache)  │
└──────────┬───────────────────────────────┘
           │ HTTPS to Bridge (stesso endpoint del MVP)
           ▼
   [ Bridge → Foundry ]
```

#### 5.7.2 Tool Surface MCP

Ogni tool del Tool Registry (§5.3) viene esposto come MCP tool con JSON Schema completo. Esempio per `cast_spell`:

```json
{
  "name": "cast_spell",
  "description": "Cast a prepared spell at one or more targets, or as an area effect template. Verifies action economy, slot availability, and concentration before execution.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spell_id": { "type": "string", "description": "Foundry item.id of the spell" },
      "slot_level": { "type": "integer", "minimum": 1, "maximum": 9 },
      "targets": {
        "oneOf": [
          { "type": "array", "items": { "type": "string" }, "description": "Token UUIDs" },
          { "type": "object", "properties": { "x": {}, "y": {}, "shape": {}, "radius_ft": {} } }
        ]
      },
      "concentration_drop": { "type": "boolean", "default": false }
    },
    "required": ["spell_id", "slot_level"]
  }
}
```

#### 5.7.3 Resource Surface MCP

```
actor://current             → CharacterState JSON (HP, AC, slots, conditions, action economy)
actor://current/items       → list of weapons/spells/consumables with stats
scene://current             → SceneSnapshot (visible tokens, distances, terrain)
combat://current            → CombatState (initiative, current turn, effects)
log://recent?limit=20       → last N events
```

Le risorse sono **read-only**, fetch on-demand dal client LLM per costruire context al system prompt.

#### 5.7.4 Auth & Session

Il client MCP riceve all'avvio (configurazione) un `BRIDGE_TOKEN` (bearer per-player). Il server `foundry-mcp` lo usa per autenticarsi al bridge. Una sessione MCP = una sessione player. Nessuna escalation di privilegi rispetto al MVP — l'MCP non può fare nulla che il Bridge non permetta già.

#### 5.7.5 Deploy

- **Locale (default)**: `npm install -g foundry-mcp` → configurare in `claude_desktop_config.json`:
  ```json
  {
    "mcpServers": {
      "foundry": {
        "command": "foundry-mcp",
        "env": { "BRIDGE_URL": "http://homelab:8910", "BRIDGE_TOKEN": "..." }
      }
    }
  }
  ```
- **Remoto (homelab)**: container Docker che espone SSE; il client MCP-remote lo monta.

#### 5.7.6 Voice UI sul G2

Anche con MCP attivo, il **G2 app non integra LLM**. Lo schermo del G2 mostra solo i risultati delle azioni eseguite (toast banner come §7.10 State 3). Il push-to-talk è gestito dal client MCP (es. Claude Desktop è già aperto sul telefono o laptop).

Un'evoluzione futura potrebbe far sì che il G2 catturi audio e lo invii al client MCP via SSE — ma è oltre lo scope di questa specifica.

#### 5.7.7 Test & Forward Compat

- Tool definitions in JSON Schema versionato → backward compat additiva
- Client MCP eterogenei testati: Claude Desktop, Claude Code, MCP Inspector
- L'aggiunta di un tool al Bridge non rompe i client vecchi (additive)
- La rimozione richiede deprecation cycle di ≥1 minor MCP version

---

## 6. Data Models

(invariati rispetto a v0.1, riportati per completezza con aggiunte per write-path)

### 6.1 Character State

```json
{
  "actorId": "abc123",
  "name": "Thorin",
  "class": "Fighter", "level": 5,
  "hp": { "current": 45, "max": 68, "temp": 10 },
  "ac": 18, "speed": 30,
  "stats": { "str": 16, "dex": 14, "con": 15, "int": 10, "wis": 12, "cha": 13 },
  "passives": { "perception": 14, "insight": 11, "investigation": 10 },
  "conditions": [{ "name": "Concentrating", "duration": 3 }],
  "resources": {
    "spellSlots": { "1": [true, true, false, false], "2": [true, false] },
    "classFeatures": {
      "secondWind": { "current": 1, "max": 1 },
      "actionSurge": { "current": 1, "max": 1 }
    }
  },
  "_comment_resources": "Class-specific resources sotto classFeatures. Esempi per altre classi: ki (Monk), rage (Barbarian), bardicInspiration (Bard), wildShape (Druid), channelDivinity (Cleric/Paladin), sorceryPoints (Sorcerer), arcanaeRecovery (Wizard).",
  "actionEconomy": { "action": false, "bonus": false, "reaction": false, "movement": 30 },
  "timestamp": 1715256840
}
```

### 6.2 Combat State

```json
{
  "active": true, "turn": 2, "round": 3,
  "combatants": [
    { "id": "c1", "name": "Goblin Archer", "initiative": 18,
      "hp": { "current": 5, "max": 15 }, "ac": 13,
      "isPlayer": false, "visible": true, "tokenId": "tok-g1" },
    { "id": "c2", "name": "Thorin", "initiative": 15,
      "hp": { "current": 45, "max": 68 }, "ac": 18,
      "isPlayer": true, "isCurrent": true }
  ],
  "effects": [{ "combatantId": "c2", "name": "Bless", "remainingRounds": 7, "concentrationOwner": "c-lyra" }]
}
```

### 6.3 Scene Snapshot (read context per LLM)

```json
{
  "sceneId": "scene123",
  "playerToken": { "id": "t1", "x": 800, "y": 800 },
  "fovRadius": 60,
  "visibleTokens": [
    { "id": "t2", "name": "Goblin Archer", "type": "humanoid",
      "position": { "x": 1000, "y": 500 }, "distance_ft": 35,
      "hp_estimate": "wounded", "hostile": true },
    { "id": "t3", "name": "Goblin Brute", "type": "humanoid",
      "position": { "x": 1100, "y": 800 }, "distance_ft": 40,
      "hp_estimate": "fresh", "hostile": true }
  ]
}
```

### 6.4 Action Result

```json
{
  "ok": true,
  "activityUsed": "fireball.cast",
  "targets": ["tok-g1", "tok-g2", "tok-g3"],
  "rolls": [
    { "type": "damage", "formula": "8d6", "total": 28, "type_dmg": "fire" },
    { "type": "save", "target": "tok-g1", "dc": 15, "result": 9, "passed": false }
  ],
  "appliedDamage": { "tok-g1": 28, "tok-g2": 14, "tok-g3": 28 },
  "narrationCue": "Three goblins burst into flame; the archer shrieks and falls.",
  "timestamp": 1715256900
}
```

### 6.5 Event Log Entry (invariato)

```json
{
  "id": "evt456", "type": "roll", "timestamp": 1715256835,
  "actor": "Thorin",
  "data": { "rollType": "attack", "target": "Goblin Archer",
            "result": 23, "critical": false,
            "damage": { "total": 12, "type": "slashing" } }
}
```

---

## 7. UI/UX — "Monitor HUD" Aesthetic (Layered Model)

### 7.1 Design Language

Il G2 rende **verde monocromatico 4-bit**. Trattiamo questa limitazione come feature: estetica **HUD militare / VFD / CRT verde / Alien Nostromo**. La sessione sembra un **monitor a fosfori verdi che galleggia davanti al giocatore**, con bezel ASCII, font monospace, cursori che lampeggiano.

**Principi UI**:

- **Mappa = base layer permanente** (sempre visibile, è il mondo di gioco — come il canvas Foundry desktop)
- **Status HUD = corner persistente** (HP/AC/azioni/slot/condizioni — sempre visibile)
- **Tutti gli altri panel = popup/finestre fluttuanti** sopra la mappa (Sheet con i suoi 6 tab interni, Combat, Log, Spellbook, Inventory, Map ctrl, Quick Action) — esattamente lo stesso pattern delle finestre Foundry desktop: aprire un panel = aprire una finestra; chiuderla = tap-doppio (close/back)
- **Window chrome coerente**: ogni popup ha frame `┌─...─┐ │ │ └─...─┘` con titolo nel header
- **Frame ASCII coerente** (page frame + status divider)
- **Nessun riempimento di sfondo** — solo bordi e testo
- **Glyph bar** invece di barre grafiche: `███████░░░ 70%`
- **Cursor `▶`** per indicare focus
- **Blink `_` underscore** per attesa input
- **Layout integrity** (vedi INV-1 §0.1 + §7.1a) — formattazione **dinamica e sempre perfetta**, **mai disallineata in nessun caso**: corner glyphs, divisori e colonne si allineano al carattere in ogni stato e con ogni contenuto.

### 7.1a Layout Integrity Invariants (INV-1 concrete rules)

> Implementazione concreta di INV-1 (§0.1). Ogni regola è verificabile via snapshot test (vedi §7.14.4 checklist 11-15) e applicata dal layer engine, **mai a mano nei mockup**.

#### 7.1a.1 Frame integrity (corner & divider alignment)

- **Corner & verticale** (`┌ ┐ └ ┘ ┤ ├ ┬ ┴ ┼ │` + variant doppia `╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬ ║`): la **stessa colonna fisica** dal top al bottom della finestra. Layer engine emette `frame(width, height)` — il chiamante non scrive corner a mano.
- **Divisori orizzontali** (`─ ═`): **estensione esatta** dalla colonna del primo verticale a quella dell'ultimo. Sempre stessi caratteri di intersezione (`├ ┤ ╠ ╣`) ai bordi.
- **Mixing single/double**: regole esplicite — bezel page = `╔ ╗ ╚ ╝ ║ ═` (double); panel popup = `┌ ┐ └ ┘ │ ─` (single). Mai mischiare nello stesso frame.

#### 7.1a.2 Variable-content discipline (the "HP=7 vs 700" problem)

Ogni cella di contenuto ha un **width budget al build time**. Il layer engine taglia o pad **deterministicamente**, mai best-effort.

| Tipo di campo | Strategia | Esempio (budget=4) |
|---|---|---|
| Numerico | right-align, leading space-pad | `   7` · `  70` · ` 700` · `9999` |
| Numerico con max noto | progress glyph + valore | `███▓░ 7/10` (budget barra fisso) |
| Testo identificativo | left-align, truncate suffix `…` | `Thorin Mountainforge` (16) → `Thorin Mounta…` (14) |
| Testo enumerato (cond/feat) | left-align, truncate prefix se serve coda | `Bless (7r)` |
| Time/duration | format normalizzato | `7r` · `1m` · `1h` (mai `7 rounds`) |

**Truncation marker**: sempre `…` (U+2026), **mai** `...`. Position: suffix per testi liberi, prefix per liste right-aligned.

#### 7.1a.3 Column alignment (multi-column rows)

- Quando una row contiene N colonne (es. Status HUD: `HP <bar> <num> <delta>`), le **colonne sono fixed-grid** definite a top-of-panel, non a content-driven.
- Ogni colonna ha: `width`, `align` (`left | right | center`), `pad-char` (default ` `), `overflow` (`truncate | ellipsis | scroll-marquee` — `marquee` solo in V2).
- **Mai allineamento a tab `\t`** — il G2 mono non garantisce stop tabulati uniformi cross-firmware.

#### 7.1a.4 Tab strip & menu equal-width

- Pattern tab strip: `[ XXX ]` (inactive) ↔ `[▶XXX ]` (active) — **stessa larghezza**, swap leading-space ↔ `▶` (vedi §7.5.1). Tab label trunc a budget fisso (4 char) per garantirlo.
- Quick Action menu list: ogni voce **stessa larghezza** = larghezza modal − padding. Voci shorter → space-padded a destra.

#### 7.1a.5 Status HUD invariants

Il corner card `~28×21 char` (vedi §7.3) ha **layout fisso indipendente dal contenuto**:

- Header: `<NAME ≤8> <CLASS ≤8>` — entrambi truncate. PG con nome lungo → suffix `…`.
- Bar lines: glyph bar **larghezza fissa** (8 caratteri di `█▓░`); il valore numerico segue con budget fisso `4/4` o `nn/nn`.
- Conditions: max 4 visibili; overflow → `+N` (es. `Bless (7r) Conc … +2`).
- Slot tracker: 3 livelli max visibili; overflow → side panel via Sheet → Spells.

**Garantito**: il corner card occupa **sempre le stesse coordinate** (col 70-95, row 1-21). Mai shrink, mai grow.

#### 7.1a.6 Multi-byte & glyph width safety

- Tutti i glyph in uso (box-drawing, block elements, arrows, dice, status icons) sono **width-1** in monospace G2. Lista canonica: §7.4a.1 Glyph Dictionary + design-token glossary in `shared-render`.
- **Vietati**: emoji policroma, glyph CJK, zero-width joiner, combining marks. Se serve un'icona non in dictionary → estensione esplicita del dictionary, mai inline ad-hoc.
- **Numeri**: solo ASCII `0-9`. Niente `①②③` o full-width.

#### 7.1a.7 Render contract (engine vs view)

- Un panel/view **non costruisce stringhe ASCII concatenate**. Costruisce un albero `Box { children: Box[] | TextRun }` tipato; il layer engine fa il layout finale.
- Stati error/loading/disconnected (`⚠ SYNC LOST`, `⌁ R1 DISC`) usano **gli stessi box** del normale, con content swappato — mai layout alternativi.
- Snapshot fixture per ogni view (`/test/snapshots/<view>.<state>.txt`) committate nel repo. CI fail se diff non zero (vedi §7.14.4 ck 11-15).

#### 7.1a.8 Edge cases che hanno rotto layout in altri progetti (and we forbid here)

| Trap | Regola |
|---|---|
| Numeri che crescono di una cifra mid-session | budget pre-allocato sempre; mai relayout in-place |
| Nomi PG con accenti / non-ASCII | normalize NFC + width-check; rifiuta nomi che eccedono budget al boot |
| Conditions list crescente | max-4 + `+N`; mai overflow visivo |
| Concentration timer countdown | format `<n>r` width-2 padded; mai `1 round left` |
| Frame mid-update (raster tile delta) | layer engine garantisce frame chrome non shifta durante delta tile (z=0 raster ≠ z=1 chrome) |
| Tab strip che cresce con un tab nuovo | tab count fisso 6; nuovo tab = ADR + bump spec, mai aggiunta runtime |
| Localizzazione IT con stringhe più lunghe | catalogo i18n con `max-width` per chiave; fallback EN se IT eccede |

**Verifica**: §7.14.4 ck 11-15 + Phase 4 task `layer-engine layout invariants test suite`.

### 7.2 Layered Rendering Model

Una sola "main page" runtime con **4 layer** (z-order dal basso):

```
z=0    Map base layer        (always rendered)
z=0.5  Idle Content Infill   (rendered ONLY when no z=2 overlay is active — v0.9.12 §7.4c)
z=1    Persistent Status HUD (always rendered, except modal)
z=2    Overlay slot          (mounted on demand: 0 or 1 panel at a time)
```

| Layer | Visibilità | Capture? | Note |
|---|---|---|---|
| Map base | sempre (eccetto modal full-screen) | sì, default | scroll=pan, tap=ping, long=quick |
| **Idle Content Infill** | **solo quando z=2 NON è montato** | **mai** | **read-only · auto-demolished su `open(panel/modal)` · auto-reborn su `close()` · vedi §7.4c** |
| Status HUD | sempre (eccetto modal full-screen) | mai | read-only |
| Overlay panel size=`panel` | quando aperto | sì, sottrae alla mappa | scroll=naviga, tap=action, long=close (o panel-action contestuale, vedi §7.14.2) |
| Overlay panel size=`modal` | quando aperto | sì, copre tutto | full-screen, status nascosto (es. Voice/Clarify) |

**Capture transition** (state machine):

```
            ┌─ open(panel) ──→ overlay-slot active   (z=0.5 demolished)
   map-base ┤                                       ↓
            └─ no overlay  ←── close() ─────────────┘  (z=0.5 reborn)
```

**z=0.5 invariants** (binding for §7.4c implementation):

- z=0.5 NEVER captures input — z=0 (map) or z=2 (overlay) owns capture; z=0.5 is render-only.
- z=0.5 reads from store but never writes — read-only by contract, same as z=1.
- z=0.5 reuses text/list containers from the 8-budget pool; **never** consumes image container budget (which stays exclusive to z=0 raster tiles per §7.4b.3).
- z=0.5 mount/demolish is **atomic with z=2 open/close**: no intermediate frame where both are visible. The event router emits the swap as a single render frame.
- INV-1 layout-integrity: the column boundaries of z=0 and z=1 are **identical** in both states (overlay-open vs overlay-closed). z=0.5 lives strictly inside the z=0 map-area column range; no chars cross the z=1 boundary.

Manager: `core/event-router.js` → routing event al layer top-of-stack che ha `isEventCapture=1`. The router also owns z=0.5 lifecycle (subscribes to `overlay_mounted` / `overlay_dismissed` from `core/state-store.js`).

**Substrato di rendering predefinito — CanvasCompositor raster (v0.10.0):**

Dal milestone v0.10.0 il **percorso di rendering default** è il substrato canvas composited:

- **z=1 Status HUD** e **z=2 overlay panels** sono disegnati su `OffscreenCanvas` tramite `CanvasCompositor` con font pixel VT323 e chrome statico pre-baked, poi inviati al G2 come 4 sub-tile PNG 4-bit (200×100 ciascuno, regione effettiva 400×200 px) via `updateImageRawData`. Il compositor opera in z-order crescente con dirty-skip: un tile non viene rispedito se il suo xxhash h32 è invariato rispetto al frame precedente. Il loop delta gira a ~5 fps (intervallo minimo 100 ms), con idle near-zero bandwidth quando la scena non cambia.
- **Percorso glyph/text (fallback BLE-degraded):** quando `view.map.mode = "glyph"` è attivo (impostato dal giocatore via Quick Action `[M] Map ctrl` oppure forzato dal verdetto BLE-degraded al boot), il rendering torna al path text-container SDK: lo schema di pagina usa 3 container (header/footer/status-hud) invece di 5 (4 image tile + 1 hud-capture). Il contratto layout glyph è descritto in §7.4b.7 e il mockup INV-1 è nella subsection "Glyph Fallback Mode" in §7.4.
- **Invariante:** la scelta del substrato non modifica la z-stack logica (4 layer) né le regole di cattura input. In canvas mode il container `hud-capture` (id=4, `isEventCapture:1`, 576×288) intercetta i gesture R1; in glyph mode il container `map-capture` (id=7) svolge lo stesso ruolo. Il contratto INV-1 si verifica separatamente per le due suite: `inv:all` esegue sia la glyph suite (fixture ASCII) che la raster suite (hash PNG tile SHA-256 committati in `status-hud.raster-hash.json`).

### 7.3 Canvas Allocation (576×288 ≈ 96×24 char @ 6×12 mono)

**Approssimazione**: il G2 usa font firmware-defined; le metriche reali vanno verificate in Phase 0. I mockup assumono ~96 char × 24 row come riferimento di layout.

```
       0         10        20        30        40        50        60        70        80     90 95
       ┌─────────────────────────────────────────────────────────────────────────────────────────┐
   0   │ HEADER  (1 row)                                                                         │
       ├──────────────────────────────────────────────────────────────────────┬──────────────────┤
   1   │                                                                      │                  │
   2   │                                                                      │   STATUS HUD     │
   3   │                                                                      │   (corner card)  │
       │              MAP BASE LAYER                                          │   ~28×21 char    │
       │              (text grid — ~66×21 char  ·  raster 2×2 = 400×200 px)   │                  │
       │                                                                      │   z=1            │
       │              z=0  ALWAYS RENDERED                                    │   read-only      │
       │                                                                      │                  │
       │              [ overlay slot mounts here ]                            │                  │
       │              z=2  on demand                                          │                  │
       │              ─────────────────────────────────────────               │                  │
       │              IDLE CONTENT INFILL                                     │                  │
       │              z=0.5  rendered ONLY when z=2 NOT mounted               │                  │
  21   │              (combat log · quick prompts · stats — §7.4c)            │                  │
       ├──────────────────────────────────────────────────────────────────────┴──────────────────┤
  22   │ FOOTER (chips + R1 hint)                                                                │
  23   │                                                                                         │
       └─────────────────────────────────────────────────────────────────────────────────────────┘
```

**z=0.5 placement**: occupa le ultime ~3 row del map-area (idle state). Quando un overlay z=2 viene montato, z=0.5 è demolito e quelle row tornano disponibili al z=2 layout. Vedi §7.4c per il contratto completo.

### 7.4 Default View — Character Status Sheet (27px grid)

> **HUD-27PX redesign (v0.9.14, 2026-06-05):** The default always-on glasses view is now the **full-width Character Status Sheet**, NOT the raster map. The G2 LVGL font has a **fixed 27px line height** (no font control per SDK). Screen: 576×288 px → ~10 rows max; full-width line ≈ ~50 chars (variable-width, measured by `@evenrealities/pretext`). The old 28×21 corner card was designed for a ~12px/24-row grid — text appeared ~2.25× too big on real glasses ("scritte troppo grandi"). This section describes the new default view. The raster/glyph map mode is a **DEFERRED gesture-opened overlay** (see §7.4 "Map mode — DEFERRED" below and ADR-0001 Amendment 2).

#### Glyph Fallback Mode — BLE-degraded path (INV-1 contract)

> **Contesto v0.10.0:** questo è il percorso di rendering di **fallback BLE-degraded** (o path glyph esplicito via `view.map.mode = "glyph"`). Il substrato di rendering **default** dal milestone v0.10.0 è il canvas `CanvasCompositor` raster descritto in §7.2. Il mockup qui sotto è il contratto INV-1 per il path text-container SDK; NON va cancellato — è la spec del fallback glyph e rimane il contratto di snapshot per la glyph suite di `inv:all`.

#### Status-default view (27px grid) — IMPLEMENTED (v0.9.14, 8-row layout v0.9.15)

The always-on default view (glyph/text path) is the Character Status Sheet — 8 rows × ~50 chars, full-width 576px:

```
Dante Lanzulli            Lv10 —
────────────────────────────────────────────
PF ██████████ 41/63   CA 16   VEL —
Turno —   Round —   [—]
Cond: concentrato, benedetto
────────────────────────────────────────────
Slot 1●●●○  2●●○  3●○
TS morte  ○○○ / ○○○
```

**Lettura (8 righe):**

- **Riga 0**: nome personaggio · `Lv{N}` · classe (placeholder `—` finché non wired)
- **Riga 1**: divisore `────` (full-width)
- **Riga 2**: `{hpLabel} {barra HP} {cur}/{max}   {acLabel} {ac}   {velLabel} {vel}`
  - HP bar: 10 glifi `█▓░`; CA e VEL da snapshot; VEL placeholder `—` (campo non ancora in CharacterSnapshot)
- **Riga 3**: `Turno —   Round —   [—]` — placeholder `—` finché non wired (turn/round non in snapshot)
- **Riga 4**: `Cond: {condizioni, ...}` — lista condizioni attive; troncata con `…+N` se troppo larga per 576px
- **Riga 5**: divisore `────`
- **Riga 6**: `Slot {1●●●○  2●●○  ...}` — spell slot (livelli da snapshot); `●` = disponibile, `○` = usato
- **Riga 7**: `TS morte  ●●○ / ○○○` (IT) / `Death saves  ●●○ / ○○○` (EN) — tiri salvezza dalla morte

> **Nota (j0t-05):** la riga R1 gesture hint (`R1: ^v scorri  tap ping  oo menu`) è stata RIMOSSA dal corpo del foglio stato: 9×27=243px supera h=234px del container status-hud (id6), causando overflow nel footer. L'hint R1 è già nel footer container (id5) via `renderContextChip` / hud-chrome — ridondante nel corpo. Layout finale: 8×27=216px ≤ 234px — nessun overflow.

**Width budget (INV-1):** ogni riga è misurata con `getTextWidth()` da `@evenrealities/pretext` e troncata con `…` se supera 576px. Il test `WIDTH-ASSERTION` in `status-hud-renderer.test.ts` fallisce la build se qualsiasi riga supera il budget.

**Data-gap placeholder (HUD-27PX):** `CharacterSnapshot` non porta ancora classe, velocità, o turno/round. Questi campi renderizzano come `—` con marcatori `// TODO(HUD-27PX): wire <field>`. La veridicità del dato è prioritaria rispetto alla completezza visiva.

**Locales:** tutti i label (PF/HP, CA/AC, VEL/SPD, Turno/Turn, TS morte/Death saves, Cond:/Cond:) sono in `HUD_WIDTH_BUDGETS` (i18n-budgets.ts) con chiavi `hud27_*`. MVP canonical: IT; fallback: EN; third: DE.

**Containerizzazione (27px grid):**

| Container | ID | x | y | w | h | Note |
|-----------|----|---|---|---|---|------|
| header | 4 | 0 | 0 | 576 | 27 | 1 riga header |
| status-hud | 6 | 0 | 27 | 576 | 234 | 8 righe × 27px=216px ≤ 234px — **base visibile** |
| footer | 5 | 0 | 261 | 576 | 27 | 1 riga footer |
| map-capture | 7 | 0 | 27 | 576 | 234 | PRESERVATO per map-mode DEFERRED |
| z05-* | 8-10 | 0 | 189/216/243 | 576 | 27 | PRESERVATI per idle-infill DEFERRED |

**Seguono deferred feature**:
- Map-mode gesture-opened (Phase 20 / GEST-01)
- Wiring di classe, velocità, turno/round in CharacterSnapshot
- Overlay 27px density rework (tutti i pannelli attuali usano ancora la griglia 12px — "g2-app UI 27px density rework" come fase dedicata)

#### Map mode (gesture-opened) — DEFERRED (future phase)

> **Nota:** prima di v0.9.14, la mappa raster/glyph era il layer base z=0 della default view. Dal v0.9.14 la mappa è un overlay aperto via gesture — non la base di default. Vedi ADR-0001 Amendment 2.
>
> **Mode selector** (DEFERRED — Phase 20): la mappa supporterà due rendering mode mutuamente esclusivi, selezionabili via Quick Action `[M] Map ctrl`:
>
> - **`raster`** — canvas Foundry rasterizzato 4-bit greyscale, 4 image container 2×2 = **400×200 px effective**. Pipeline §7.4b.4.
> - **`glyph` (FALLBACK)** — text-based glyph synthesis. Pipeline §7.4a. Mockup §7.4b.7.

#### Default view in **RASTER mode** (MVP — DEFERRED, was pre-v0.9.14 default)

Stato di default (nessun overlay aperto). La mappa cattura input.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · raster                ROUND 3 · TURN 2/5                ⌁ R1 92%   ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║                                                                      ║ THORIN  F3/W5    ║
║   ┌─[ tile 1 · 200×100 ]──────┬─[ tile 2 · 200×100 ]──────┐         ║ ──────────────── ║
║   │ Foundry canvas — upper L  │ Foundry canvas — upper R  │         ║ HP ████████░░    ║
║   │ Floyd-Steinberg dither    │ Floyd-Steinberg dither    │         ║    45/68  +10t   ║
║   │ 4-bit greyscale verde     │ 4-bit greyscale verde     │         ║ AC 18  SPD 30    ║
║   │                           │                           │         ║                  ║
║   │ texture, lighting, walls  │ texture, lighting, walls  │         ║ Act ░  Bns ░  R░ ║
║   │ rendered fedeli a Foundry │ rendered fedeli a Foundry │         ║ Move 30/30       ║
║   ├─[ tile 3 · 200×100 ]──────┼─[ tile 4 · 200×100 ]──────┤         ║                  ║
║   │ Foundry canvas — lower L  │ Foundry canvas — lower R  │         ║ Slots            ║
║   │                           │                           │         ║   1° ▓▓░░ 2/4    ║
║   │                           │                           │         ║   2° ▓░░  1/3    ║
║   │                           │                           │         ║   3° ░░   0/2    ║
║   │                           │                           │         ║                  ║
║   │                           │                           │         ║ Conditions       ║
║   └───────────────────────────┴───────────────────────────┘         ║  ▶ Bless (7r)    ║
║   ─── z=0.5 idle infill ──────────────────────────────────────────── ║    Concentr.     ║
║   ⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing              ║                  ║
║   raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick       ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   mode: ▶RASTER (toggle GLYPH)   [sheet] [combat]…  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Lettura**:

- **Header** (top, 1 row text container): nome scena · indicatore mode · round/turno · batteria R1
- **Map area** (left): **4 image container** 200×100 ciascuno, tiled 2×2, totale **400×200 px effective**, contenuto = canvas Foundry rasterizzato + ditherato (vedi §7.4b.4 pipeline)
- **Status HUD** (right, ~28 char × 21 row, text container — DEFERRED: questo era il layout pre-v0.9.14. Dal v0.9.14, il default è il full-width status sheet §7.4 sopra): scheda mini sempre visibile (HP/AC/azioni/slot/condizioni)
- **Footer** (bottom, 1-2 row text container): hint gesture + mode toggle + chip nav overlay
- **Refresh rate**: **5 fps standard event-based** (token movement, template placement, scene change), **8 fps burst** durante combat attivo, **15 fps aspirational** se Phase 0 conferma Layer 2+5 unlock. Idle 0.3 fps heartbeat (Layer 6 adaptive). Strategia stratificata in §7.4b.6.1.

**Vincolo hardware** (§3.1): l'image container max è **200×100 px** e ne sono disponibili **4 per pagina**. **400×200 = massimo teorico possibile** sul G2. Una versione "full-screen 576×288 raster" non è fisicamente realizzabile con l'hardware attuale.

### 7.4a Map Rendering Pipeline

La pipeline **glyph mode** (§7.4b.7 fallback alternativa) sintetizza la mappa da dati semantici invece di rasterizzare il canvas Foundry. Usata quando `view.map.mode = "glyph"` o quando Phase 0 GO/NO-GO branch C (§10.0.5) forza glyph-only. Per il **raster mode default MVP** vedi §7.4b.4. Tre stadi della glyph synthesis:

#### Stadio 1 — Estrazione Foundry-side (modulo `evenfoundryvtt`)

Il modulo Foundry ascolta gli hook canvas e produce uno `SceneSnapshot` (definito in §6.3):

| Hook Foundry | Estratto |
|---|---|
| `canvasReady` | scene grid (size, type), background bounds, walls, doors |
| `updateToken` | posizioni, facing, hidden flag per ogni token |
| `updateScene` | lighting baseline, fog reset |
| `createMeasuredTemplate` / `updateMeasuredTemplate` | shape, position, radius dei template AoE |
| `sightRefresh` | maschera FoW per-player (visibili / explored / unseen) |
| `controlToken` | quale token è focus per la camera |

Payload tipico: **2-5 KB JSON**, niente pixel.

#### Stadio 2 — Trasformazione Bridge

Il bridge converte coordinate world → coordinate cella **player-centric**:

```
cell.x = floor((token.x − playerToken.x) / sceneGridSize) + (cols/2)
cell.y = floor((token.y − playerToken.y) / sceneGridSize) + (rows/2)
```

Per ogni cella nel viewport (~66×21 char, ~30 ft radius):

1. **FoW gate**: cella visibile? sì → render normale; explored ma non visibile → `▒` desaturato; unseen → `·`
2. **Terrain glyph**: classifica via wall/tile data → `░` floor, `▒` rough, `▓` wall, `~` water, `≡` door
3. **Token overlay**: se un token occupa la cella, sostituisci il glyph con quello del token (vedi §7.4a.4 dictionary)
4. **Template overlay**: se cella è dentro un MeasuredTemplate attivo, prepend/replace con marker effetto (`✦` per Fireball, `═` per linea, ecc.)

Output: stringa di ~66×21 char + metadata (tooltip token, distanze).

#### Stadio 3 — G2 client rendering

Una `updateText()` su un singolo container. Il client mantiene cache dell'ultimo frame, applica diff cell-by-cell, e fa update solo delle linee toccate. Token muove di 1 cella → 2-3 linee, non l'intera grid.

#### 7.4a.1 Glyph Dictionary

| Categoria | Glyph | Note |
|---|---|---|
| **Terreno** | `░` floor · `▒` rough/difficult · `▓` wall · `~` water · `≡` door · `·` FoW unseen · ` ` empty | Densità glyph = lighting tier |
| **Player (tu)** | `@` + facing arrow `▶◀▲▼` adiacente | Sempre `@`, sempre uppercase |
| **Party allies** | iniziale uppercase: `L` Lyra, `K` Kael, `T` Thorin | 1 char, univoche per nome |
| **Nemici comuni** | iniziale lowercase + numero: `g1` `g2` `g3` (goblin), `o1` `o2` (orc) | 2 char, numerati per disambig |
| **Boss / elite** | uppercase singleton: `D` dragon, `B` boss generico | "Pesanti" visivamente |
| **NPC neutri** | `n1` `n2` `n3` lowercase | 2 char |
| **Hidden / sospetto** | `?` | Token visto-ma-non-identificato |
| **Effetti AoE** | `✦` sphere (Fireball) · `▒` cone (Burning Hands) · `═` line (Lightning) · `◯` outline area · `*` epicentro | Statico vs blink (vedi §7.4a.3) |
| **Bersaglio attivo** | wrap `[g1]` o blink alternato | Quando un token è targeted |
| **Crosshair self** | `+` discreto sotto `@` | Solo in modalità "map controls" |

#### 7.4a.2 Token rendering rules

- Un token = un singolo glyph (1 char) o glyph+numero (2 char). Mai più di 2 char per cella.
- Tokens che occupano > 1 cella (size=`large` o `huge`): glyph nel center, bordo `·` nelle celle adiacenti occupate.
- Token sovrapposti (improbabile in D&D 5e ma possibile): mostra il "top" della stack, sotto-glyph fluttuano nel tooltip side-panel (non implementato MVP).
- Facing: arrow adiacente solo per il player (`@▶`); per altri token il facing non è mostrato sulla grid (occupa troppo spazio) ma è leggibile tramite tap → tooltip.

#### 7.4a.3 Effetti / template

Un MeasuredTemplate Foundry → cluster di celle marker. Esempio Fireball:

```
input:  { type: "sphere", center: {x:1080, y:670}, radius_ft: 20 }
        playerToken: {x: 800, y: 800}, sceneGridSize: 100, gridUnit: 5 ft

calcolo:
  centerCell = (cols/2 + (1080-800)/100, rows/2 + (670-800)/100)
             = (33+2.8, 11-1.3) ≈ (36, 10)
  raggio celle = ceil(20 ft / 5 ft) = 4

output (cluster di ✦ disegnati nelle celle a distanza ≤ 4):
                ✦ ✦ ✦ ✦
              ✦ ✦ ✦ ✦ ✦ ✦
              ✦ ✦ * ✦ ✦ ✦   ← * = epicentro
              ✦ g1✦ g2✦ ✦   ← token sotto effetto: glyph token + ✦ background blink
                ✦ ✦ ✦ ✦
```

**Animazione**: il client G2 alterna 2 frame ogni ~500 ms — `✦` filled vs `◇` outline — finché il template è attivo. Su firmware verde 4-bit è la sola forma di motion realisticamente disponibile (no sprite engine, solo `updateText` periodico). Adatto a Fireball pulsante; non adatto a movimenti continui.

#### 7.4a.4 Fog of War & lighting

- **Visibility**: bridge usa `CanvasVisibility.testVisibility(point, {object: playerToken})` di Foundry per ogni cella nel viewport
- **Tier**: la classificazione bright/dim/dark di Foundry (`token.detectionModes`) viene mappata su 3 densità glyph:
  - bright → glyph pieno (`▓` wall, `▒` floor)
  - dim → glyph medio (`░` floor)
  - dark/unseen → `·` o blank
- **Memory**: celle "explored ma non viste in questo momento" (Foundry `explored: true, visible: false`) → glyph desaturato (`░` invece di `▒`)

#### 7.4a.5 Update strategy

- Hook Foundry → push WS al bridge → push WS al G2 **solo per delta**
- Bridge mantiene cache server-side dell'ultimo snapshot per sessione player
- Payload delta tipico: `{ "patch": [{"row": 5, "col": 12, "char": "g1"}, {...}] }` — 1-3 KB per token-move
- Frame budget: target **<50 ms** dal hook Foundry al render G2 finale, **<10 KB/sec** di traffic medio in combat

#### 7.4a.6 Worked example

Input parziale (dal modulo Foundry):

```json
{
  "playerToken": { "id":"t-thorin", "x":800, "y":800, "facing":90 },
  "sceneGridSize": 100,
  "viewport": { "cellsW": 30, "cellsH": 15 },
  "walls": [
    { "from":[1300,500], "to":[1500,500] },
    { "from":[1500,500], "to":[1500,800] }
  ],
  "tokens": [
    { "id":"t-thorin", "x":800, "y":800, "isPlayer":true },
    { "id":"t-lyra",   "x":600, "y":800, "name":"Lyra" },
    { "id":"t-g1",     "x":900, "y":600, "name":"Goblin" },
    { "id":"t-g2",     "x":1700,"y":850, "name":"Goblin" }
  ],
  "templates": []
}
```

Bridge calcola, glyph synthesis, output text:

```
Row 7:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Row 8:  ░░░░░░░░░░g1░░░░░░░░░░░░░░░░░░
Row 9:  ░░░░░░░░░░░░░░░░░░░░▓▓▓▓░░░░░░
Row 10: ░░░░░░░░░░░░░░░░░░░░▓  ▓░░g2░░
Row 11: ░░░░L░░░░░░░░░░@▶░░░░▓▓▓▓░░░░░░
```

Quel `Row 11` ha 3 token + facing arrow + 4 muri + ~22 floor cells, costo render `<5 ms` JS + `<1 KB` text container update.

---

### 7.4b Map View Mode — Glyph or Raster (user-selectable)

> **Decisione di design v0.7** (flipped): la mappa supporta **due mode esclusivi** selezionabili dall'utente:
> - **Raster mode** (DEFAULT MVP): canvas Foundry streamato, fedele al canvas reale, max risoluzione hardware (400×200 px). Default mockup in §7.4. Pipeline §7.4b.4.
> - **Glyph mode** (FALLBACK ALTERNATIVA): glyph synthesis text-based, low-bandwidth, mockup §7.4b.7. Pipeline §7.4a.
>
> I due mode si escludono a vicenda nello stesso layout (per massimizzare l'area mappa in entrambi). Il setting `view.map.mode = "raster" | "glyph"` (default `"raster"`) è hot-swappable senza riavvio. Switch via Quick Action `[M] Map ctrl`.

#### 7.4b.1 Razionale del mode selector (vs hybrid)

Una versione precedente di questa spec (v0.5) proponeva un layout "ibrido" (glyph grid + piccola raster thumbnail). Scartato in v0.6 per due motivi:

1. **Ognuno dei due mode merita la massima area possibile**: dividere lo spazio penalizza entrambi.
2. **L'utente sceglie in base alla sessione**: campagne con battle map ricche di mood/lore beneficiano del raster fedele a Foundry; campagne tattiche-veloci o low-bandwidth (mobile hotspot) beneficiano del glyph grid leggero. Setting toggleable in qualunque momento.

#### 7.4b.2 Inspirazione — "Doom on exotic devices"

L'approccio raster è ispirato direttamente al filone di porting di Doom su display monocromatici/low-color tramite framebuffer streaming + dithering:

| Esempio | Display | Tecnica chiave |
|---|---|---|
| **DOOM on a watch** ([jborza, 2020](https://jborza.com/post/2020-11-20-doom-on-a-watch/)) | 240×150 monochrome smartwatch | Doom rendered su PC, scaled+dithered, streamed via serial. Floyd-Steinberg + ordered dithering combinati |
| **fbDOOM** ([maximevince](https://github.com/maximevince/fbDOOM), [stoffera](https://github.com/stoffera/fbdoom)) | Linux framebuffer | Direct framebuffer write, palette quantization |
| **rp2040_doom_1b** ([meadiode](https://github.com/meadiode/rp2040_doom_1b)) | RP2040 + EL display 320×256 1-bit | Bayer pattern + blue noise dither, frame rate 15 fps |
| **Atari ST 16-color port** ([Tom's Hardware](https://www.tomshardware.com/video-games/retro-gaming/doom-slithers-and-dithers-its-way-with-a-16-color-atari-st-port)) | 16-color palette | 16-color palette quantization (perfetto match con il nostro 4-bit greyscale 16 livelli) |
| **Ditherpunk** ([surma.dev](https://surma.dev/things/ditherpunk/)) | qualunque mono | Trattazione definitiva dei dithering algorithms — riferimento canonico |

**Il pattern**: stato di gioco runs su hardware capable, viene **rasterizzato + ditherato server-side**, i frame compressi sono streamati al display constrainted via canale lento. Esattamente il nostro caso (Foundry capable → Bridge transform → BLE constrained → G2 4-bit).

#### 7.4b.3 Approach D — Maximum Raster (canonical)

Quando `view.map.mode = "raster"`, dedichiamo **tutti e 4 gli image container** alla mappa, tiled in **2×2 grid**:

| Tile | Posizione canvas | Dimensioni | Contenuto |
|---|---|---|---|
| 1 | top-left | 200×100 | upper-left quadrant del viewport canvas |
| 2 | top-right | 200×100 | upper-right quadrant |
| 3 | bottom-left | 200×100 | lower-left quadrant |
| 4 | bottom-right | 200×100 | lower-right quadrant |

**Effective resolution**: **400×200 px**. È il massimo teorico estraibile dall'hardware G2 con 4 image container ciascuno limitato a 200×100. Tutti i container `image` slot sono usati: nessuno disponibile per portrait/icone (ma in raster mode non servono — la rasterizzazione mostra già tutto).

Il viewport Foundry catturato è dimensionato 2:1 width:height come il target (es. 800×400 → resize → 400×200). Tipicamente centrato sul player token con ~50 ft di raggio (coverage doppia rispetto al glyph mode da ~30 ft, perché la rasterizzazione mostra detail visivo che il glyph non può).

#### 7.4b.4 Streaming Pipeline (Foundry → 4-bit dithered → G2)

Ispirato direttamente al pattern Doom-on-watch ([jborza ditto](https://jborza.com/post/2020-11-20-doom-on-a-watch/)). Step deterministici, ognuno con budget di tempo:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. CAPTURE        canvas.app.renderer.extract.pixels(viewport)         │
│                    → Uint8Array RGBA (es. 800×400×4 bytes)              │
│                    budget: 30-80 ms (PIXI extract è caro)               │
├─────────────────────────────────────────────────────────────────────────┤
│  2. RESAMPLE       Lanczos-3 resize → 400×200 RGBA                       │
│                    budget: 10-20 ms (web worker, off-main-thread)       │
├─────────────────────────────────────────────────────────────────────────┤
│  3. GREYSCALE      per pixel:  Y = 0.299·R + 0.587·G + 0.114·B          │
│                    → 400×200 Uint8Array (0-255)                         │
│                    budget: 2-5 ms                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  4. QUANTIZE+DITHER  algoritmo selezionabile (§7.4b.5):                 │
│                       Floyd-Steinberg (default) | Atkinson | Bayer 8×8  │
│                    → 400×200 Uint8Array (0-15) [4-bit values]           │
│                    budget: 5-15 ms                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  5. TILE           split 400×200 → 4 tiles (200×100 each)               │
│                    + per-tile hash (xxHash) per change detection        │
│                    budget: <1 ms                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  6. DELTA          confronta hash con frame precedente per tile         │
│                    invia solo i tile cambiati (tipico: 1-2 di 4)        │
│                    budget: <1 ms                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  7. ENCODE         per ogni tile cambiato:                              │
│                    a. pack 4-bit (2 px/byte) → raw 10 KB / tile         │
│                    b. PNG indexed-palette → 3-5 KB / tile (-50%)        │
│                    c. opzionale: RLE custom per regioni uniformi (-20%) │
│                    budget: 2-5 ms / tile                                │
├─────────────────────────────────────────────────────────────────────────┤
│  8. WIRE           WS frame: { tile_id, hash, bytes }                   │
│                    homelab → phone (WiFi) <50 ms                        │
│                    phone → G2 BLE: 50-150 ms / tile                     │
├─────────────────────────────────────────────────────────────────────────┤
│  9. APPLY          G2 firmware: updateImageRawData(tileN, bytes)         │
│                    budget: firmware-dependent (verificare Phase 0)      │
└─────────────────────────────────────────────────────────────────────────┘

Total per full frame (4 tile cambiati): ~250-450 ms
Total per delta frame (1 tile cambiato): ~120-200 ms
Sustained frame rate naïve baseline: 1-3 fps. Con Layer 1-6 (§7.4b.6.1): 5 fps std / 15 stretch.
```

#### 7.4b.5 Dithering algorithm — comparison & recommendation

| Algoritmo | Quality | Speed | Estetica | Use case |
|---|---|---|---|---|
| **Floyd-Steinberg** | preserva detail, fedele a foto | medio | "fotografica" naturale | **default** — battle map ricche, lighting sfumato |
| **Atkinson** (75% error diffusion) | high-contrast, perde detail in shadow/light | medio | "Mac classic / retro CRT" — molto evocativa | toggle "retro mode" — campaign noir, dungeon |
| **Bayer 8×8** (ordered) | pattern visibile, no detail loss | fast | "retro VGA" pattern regolare | fallback per CPU costretta, very low-end |
| **Blue noise** | high-quality, no patterning | slow | natural-looking, no artifacts | aspirational — usato nel rp2040_doom_1b se computazionalmente sostenibile |

**Default**: **Floyd-Steinberg** ([Wikipedia](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering)) — bit-shift friendly (divisor 16), buon detail preservation, standard de-facto per quantizzare foto ([turbodither comparison](https://www.turbodither.com/learn/floyd-steinberg-vs-atkinson)).

**Setting esposto** all'utente in `config.schema.json`:

```json
"view.map.raster.ditherAlgorithm": {
  "type": "string",
  "enum": ["floyd-steinberg", "atkinson", "bayer8", "blue-noise"],
  "default": "floyd-steinberg",
  "description": "Algoritmo di dithering per raster mode"
}
```

#### 7.4b.6 Bandwidth & Frame Rate Budget

Approach D pieno (4 tile, 1 fps):

| Operazione | Bytes | Tempo |
|---|---|---|
| Capture + resample | — | 40-100 ms |
| Quantize + dither (FS) | — | 5-15 ms |
| Encode 4 tiles PNG | 16 KB total | 8-20 ms |
| WS send | 16 KB | <50 ms |
| BLE push 4 tiles | 16 KB / 200 kbps | ~640 ms |
| **Total full frame** | **16 KB** | **~700-800 ms** |

Approach D delta (1 tile changed):

| Op | Bytes | Tempo |
|---|---|---|
| Capture + resample + dither | — | 50-130 ms |
| Encode 1 tile + diff 3 hashes | 4 KB | 5 ms |
| BLE push 1 tile | 4 KB / 200 kbps | ~160 ms |
| **Total delta** | **4 KB** | **~220-300 ms** |

**Conclusion (naïve baseline, pre-Layer)**: 1-3 fps event-based fattibile **senza ottimizzazioni**. Vedi §7.4b.6.1 per la **strategia layered** (6 layer cumulative) che porta il target a **5 fps standard / 15 fps aspirational**. **Battery drain stimato halve sessione G2** (4h → ~2h) con raster mode attivo continuo (mitigato da Layer 3 static cache + Layer 6 adaptive fps).

#### 7.4b.6.1 Frame Rate Target — 15 fps via layered optimizations

**Target v0.9** (revisione user-driven): **15 fps obiettivo aspirational**, **5 fps standard accettabile minimum**. Strategia stratificata che sblocca progressivamente fps via ottimizzazioni cumulative.

##### 7.4b.6.1.1 Math di base (perché il default Approach D è limitante)

Senza ottimizzazioni, su BLE 200 kbps real-world:
- 1 tile 200×100 PNG ~3-5 KB → 120-200 ms BLE → 5-8 fps max single-tile
- 4 tile full frame ~16 KB → 640 ms BLE → 1.5 fps max

Per 15 fps (66 ms budget per frame): payload max ~1.5 KB/frame. **Serve riduzione 10×** rispetto al baseline naïve.

##### 7.4b.6.1.2 Strategia layered — 6 ottimizzazioni cumulative

Ogni layer aggiunge speedup. Applicate insieme convergono verso 15 fps.

**Layer 1 — Per-tile delta hashing (BASE MVP)**:

Compute xxHash di ogni tile. Push solo tile cambiati. Tipico battle map → 1-2 tile cambiano per frame (token muove in 1 quadrante).

```
Effetto:  4-tile baseline (16 KB) → 1-2 tile (4-8 KB)
Speedup:  2-4× → 3-6 fps senza altre opt
Costo:    xxHash ~5 µs / tile, trascurabile
Fase:     Phase 4 MVP (default)
```

**Layer 2 — Sub-tile delta encoding**:

Subdividi ogni tile 200×100 in **sub-tile 20×20 px** → 50 sub-tile per tile, 200 totali. Hash per sub-tile. Push solo sub-tile cambiati.

```
Sub-tile size:    20×20 px
Sub-tile per tile: 10×5 = 50 (tile 200×100)
Total sub-tile:    200 (4 tile × 50)
Raw size each:     20×20 × 4-bit / 8 = 50 bytes
RLE compressed:    20-40 bytes typical (battle map uniform regions)
```

Token move tipico: sprite ~25×25 px → 4-9 sub-tile cambiati → ~80-360 bytes per frame.

```
Effetto:  1-tile delta (4 KB) → 4-9 sub-tile (200-400 bytes) — 10-20× reduction
Speedup:  cumulativo + Layer 1 → 15-25 fps achievable per single-token-move scenarios
Costo:    50 hash/tile, ~250 µs total + RLE encode 0.5 ms / sub-tile
Fase:     Phase 4 MVP (target standard 5 fps) — Phase 13 stretch (15 fps target)
```

**Vincolo**: richiede G2 firmware support per **partial image container update** (`updateImageRegion(container_id, x, y, w, h, bytes)` o equivalente). Se firmware accetta solo `updateImageRawData` full-tile, sub-tile delta dà solo CPU saving, non BLE. **Test specifico in §10.0.6 (Test Partial-Update API)**.

**Layer 3 — Static layer caching**:

Distingui **background statico** (walls, floor texture, decorazioni) da **foreground dinamico** (token, AoE template).

```
Frame N:    composite = static_background + dynamic_foreground
Frame N+1:  static identico → no recompute, no push (cached)
            dynamic_foreground varia → recompute solo dynamic
```

Bridge tracks `staticDirty` flag — set true solo su scene change, walls modificati, lighting change. Idle gameplay: 95% dei frame sono "static-clean", solo dynamic recomputed.

```
Effetto:  riduce CPU ~70% (no dither su zone statiche)
          BLE inalterato (delta già lo gestisce a Layer 1+2)
Speedup:  capture+dither time ~50ms → ~15ms per frame (web worker parallelizza)
Costo:    bookkeeping (dirty flags), ~1 KB stato per scene
Fase:     Phase 4 MVP optimization (riduce battery)
```

**Layer 4 — Custom RLE for 4-bit greyscale**:

Battle map ha grandi regioni uniform (floor, walls). Run-Length Encoding su 4-bit values:

```
Naïve raw:        50 bytes / sub-tile uniformly
RLE (3-byte runs): {value:4bit, count:12bit} → tipico 5-15 bytes / sub-tile uniform
Mixed regions:    25-40 bytes / sub-tile (1.5-2× compression)
```

Per sub-tile uniformly colored (es. tutto floor `░`): 50 bytes → 2 bytes (`{value=2, count=400}`) — **25× reduction**.

```
Effetto:  payload sub-tile shrink 1.5-25× depending on content
          Average battle map: 2-3× compression
Speedup:  cumulativo Layer 1+2+3 → 8-12 sub-tile change-typical → 200 bytes → 8 ms BLE @ 200 kbps
Costo:    encode ~1 ms / sub-tile, decode firmware-side da verificare
Fase:     Phase 4 MVP — **custom RLE 4-bit** (§11.5.7), no library; Phase 13 advanced compression open question (Brotli, fflate?) post-field-test
```

**Layer 5 — BLE 4.2+ Data Length Extension (DLE)**:

BLE 4.x default ATT MTU = 23 bytes (20 byte payload effettivi). DLE — **introdotta in BT 4.2** ed ereditata da BLE 5.x — estende il PDU a 251 byte → ATT payload **244 byte**. Throughput sale da ~200 kbps a ~700-1000 kbps real-world. La label "5.x" è imprecisa storicamente (è 4.2+) ma resta utile come marker di feature comune nei device moderni.

```
Phase 0 §10.0.7 (Test BLE 5.x DLE) deve verificare:
  - G2 firmware DLE supportato?
  - Phone Android supporta DLE (Android 6.0+ generale OK)
  - MTU negotiated effective?

Effetto:  bandwidth 3.5-5× se supportato
Speedup:  Layer 1+2+3+4 + DLE = budget 1.5 KB/frame → easy fit in 66 ms
Costo:    nessuno (negotiated automaticamente al connect)
Fase:     Phase 4 detection + opt-in, Phase 13 mandatory per 15 fps target
```

**Layer 6 — Adaptive frame rate**:

Variabile in base a scene activity:

| Stato | fps target | Trigger |
|---|---|---|
| Idle (no token move ≥3s) | **0.3 fps heartbeat** | timer |
| Slow gameplay (~1 move / 2s) | **3-5 fps event-based** | sub-tile change detect |
| Active combat (tokens, templates moving) | **8-15 fps burst** | sustained changes |
| Scene transition (storm) | **0.5-2 fps** | full frame, all-tiles changed |

```
Effetto:  battery → halve drain (idle 0.3 fps invece di sustained 5)
Speedup:  perception → smooth durante combat, no spreco quando inutile
Costo:    state machine in bridge (~50 LOC)
Fase:     Phase 4 MVP (default behavior)
```

##### 7.4b.6.1.3 Performance budget combinato

**Scenario A — Single token move (95% gameplay)**:

```
Layer 1: identifica 1 tile cambiato (gli altri 3 cached)
Layer 2: identifica 4-6 sub-tile cambiati nel tile
Layer 4: RLE compress 4-6 sub-tile → ~150-250 bytes
Layer 5: BLE 5.x @ 700 kbps → 250 bytes / 87.5 KB/s = 3 ms transmit
Capture+dither (Layer 3 cached static): ~15 ms web worker parallel
Total per frame: ~25 ms → 40 fps theoretical, 15 fps comfortably sustainable ✓
```

**Scenario B — 3 token simultaneous move (active combat)**:

```
Layer 1: 2-3 tile cambiati
Layer 2: 12-20 sub-tile cambiati (3 token × 4-6 sub-tile each)
Layer 4: RLE → ~600-1000 bytes
Layer 5: BLE 5.x → 6-10 ms transmit
Capture+dither: ~25 ms (more area to process)
Total: ~45 ms → 22 fps theoretical, 15 fps sustained ✓
```

**Scenario C — Scene transition (rare)**:

```
Layer 1: 4 tile changed (full)
Layer 4: RLE → 4-8 KB
Layer 5: BLE 5.x → 60-115 ms transmit
Capture+dither: ~50 ms
Total: ~150 ms → 6 fps for ~1 second during transition
Adaptive (Layer 6) accepts the dip; user perceives "loading"
```

**Scenario D — BLE 4.x only (Phase 0 reveals no DLE)**:

```
Layer 1+2+3+4 active, Layer 5 NO
BLE 200 kbps → 250 bytes = 10 ms transmit
But with full-tile fallback (no partial update API): 1 tile = 2 KB compressed
                                                    → 80 ms transmit → 8-10 fps
Realistic worst-case sustained: 5-8 fps ← matches user-stated minimum
```

##### 7.4b.6.1.4 Decisione design v0.9

| Target | Standard fps | Aspiration fps | Pre-condizioni Phase 0 |
|---|---|---|---|
| **MVP Phase 4** | **5 fps event-based** | **8 fps burst** | Layer 1+3+4+6 sempre. Layer 2 SE partial-update API. Layer 5 SE DLE detected. |
| **Phase 13 stretch** | **8-10 fps event-based** | **15 fps burst** | TUTTI 6 layer + DSN raster opt-in |
| **Worst case (Layer 5 fail)** | **3 fps standard** | **5 fps burst** | Solo Layer 1+3+4+6, glyph fallback prominente |

**Standard 5 fps è il minimum committed**. **15 fps è il target** che richiede confluenza di Phase 0 favorable (DLE) + sub-tile partial update API + RLE efficacia ≥2× su scene reale.

##### 7.4b.6.1.5 Phase 0 estensione test (per validare 15 fps fattibilità)

Aggiunto a §10.0:
- `10.0.6` Test partial-update API: `updateImageRegion(...)` o equivalent supportato? Se sì → Layer 2 unlock
- `10.0.7` Test DLE BLE 5.x effective MTU + sustained throughput a 244-byte payload
- `10.0.8` Test G2 firmware queue concurrent updates: ≥10 update/sec senza coda back-pressure?
- `10.0.9` Test compositional latency: tempo da `updateImageRawData` chiamata a pixel visibile su display

#### 7.4b.7 Mockup glyph mode (FALLBACK ALTERNATIVA)

Mostrato quando `view.map.mode = "glyph"`. Usato come fallback se BLE bandwidth fallisce sostenuto, canvas extract fallisce, o utente preferisce l'aspetto retro/CRT.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti · glyph                 ROUND 3 · TURN 2/5                ⌁ R1 92%   ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║      N                                                               ║ THORIN  F3/W5    ║
║   ┌────────────────────────────────────────────────────────────┐     ║ ──────────────── ║
║   │ ░░░░▒▒▒▒░░░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ │     ║ HP ████████░░    ║
║   │ ░░░░░░░░░░░g1░░░░░░░▓                          ▓░░░░░░░ │     ║    45/68  +10t   ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓   barile                 ▓░░░░░░░ │     ║ AC 18  SPD 30    ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓                          ▓░░g2░░░ │     ║                  ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓   tavolo                 ▓░░░░░░░ │     ║ Act ░  Bns ░  R░ ║
║   │ ░░░░L░░░░░░░░@▶░░░░░▓                          ▓░░░░░░░ │     ║ Move 30/30       ║
║   │ ░░░░░░░░░░░░░░░░░░░░▓                          ▓░░░░░░░ │     ║                  ║
║   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │     ║ Slots            ║
║   └────────────────────────────────────────────────────────────┘     ║   1° ▓▓░░ 2/4    ║
║                                                                      ║   2° ▓░░  1/3    ║
║   @ YOU ▶ E   L Lyra   g1 Goblin Archer   g2 Goblin Brute            ║   3° ░░   0/2    ║
║   ░ floor  ▒ rough  ▓ wall      1 cell = 5 ft        Zoom 1×         ║                  ║
║                                                                      ║ Conditions       ║
║                                                                      ║  ▶ Bless (7r)    ║
║                                                                      ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=pan  tap=ping  long=quick   mode: ▶GLYPH (toggle RASTER)   [sheet] [combat]…  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Lettura**:

- **Header**: nome scena · `glyph` mode label · round/turno · batteria R1
- **Map area** (left, ~66 char × 21 row): glyph synthesis text-based, terreno `░▒▓`, token come lettere/digit, walls `▓`, doors `≡`. Pipeline §7.4a (no canvas extract, no BLE image push)
- **Status HUD** (right): identico a raster mode
- **Footer**: indicatore mode + toggle gesture

**Vantaggio glyph mode**:
- 0 BLE image bandwidth (solo text container update)
- 0 canvas extract CPU su Foundry
- Funziona anche con `updateImageRawData` non disponibile
- Sessione G2 più lunga (no battery hit per dithering)

**Svantaggio**: non mostra texture/lighting reale; informazione semantica (token/walls) ma non visuale (decorazioni Foundry)

Il footer espone il toggle `mode: ▶GLYPH (toggle RASTER)` — switch via Quick Action `[M] Map ctrl` → submenu mode.

#### 7.4b.8 Server topology — dove gira la pipeline

Due opzioni:

**A. Player client estrae** ✦ DECISIONE MVP: **default Phase 4**:
- Modulo Foundry connesso del player chiama `canvas.app.renderer.extract` ad ogni evento
- Push WS al bridge → BLE al G2
- Pro: 0 infrastruttura aggiuntiva, no extra Foundry session, deploy minimo
- Contro: sessione Foundry del player consuma CPU; il GM-host paga il rendering (accettabile in single-player MVP)

**B. Bridge headless Foundry session** ✦ V2 stretch (Phase 13):
- Bridge ospita sessione Puppeteer/Playwright dedicata che si autentica come player virtuale
- La sessione headless rende il canvas, estrae i frame, li ditthera
- Push diretto BLE
- Pro: separation of concerns, scalabile a multi-player, GM non vede impact
- Contro: 1 sessione browser headless extra per player (~150 MB RAM), complessità auth virtuale

**Decisione v0.8**: **MVP usa Option A**. Setting `bridge.raster.serverTopology = "player-extract"` (default). Switch a `"headless-bridge"` arriva con Phase 13 multi-player support.

**Trigger per migration ad Option B**: quando >2 G2 simultanei sul bridge, OPPURE feedback field-test che CPU player è impactata in modo percepibile.

#### 7.4b.9 Open Questions Phase 0

1. **`updateImageRawData` formato esatto**: PNG? Raw 4-bit packed? Endianness?
2. **BLE MTU effettivo phone↔G2** — determina se PNG (compresso) o raw (ATT-friendly chunks) è più efficiente
3. **Concurrent text + image updates**: c'è coda firmware? Latenza extra?
4. **Display refresh rate G2**: anche se invio 5 fps, il display può mostrarli?
5. **Battery test**: misurare il drain reale 1h raster-on vs raster-off

#### 7.4b.10 Decisione MVP (v0.7 flipped — v0.9 layered)

- **MVP (Phase 0-10)**: **raster mode = DEFAULT** (Approach D Maximum Raster, 400×200 px, §7.4 mockup). Pipeline §7.4b.4 + **strategia 6-layer §7.4b.6.1** implementate in **Phase 4** (target 5 fps standard / 15 fps stretch). Phase 0 valida `updateImageRawData` (§10.0.2) + partial-update API (§10.0.6) + DLE BLE 5.x (§10.0.7) come precondizioni — failure su §10.0.2 blocca raster MVP; failure su §10.0.6 o §10.0.7 degrada da 15 fps stretch a 5 fps standard sustained.
- **Glyph mode = fallback alternative** parallelo al MVP. Stessa codebase, stesso engine, mode selector via Quick Action `[M] Map ctrl`. Implementazione pipeline §7.4a in **Phase 4** insieme al raster (basso costo aggiuntivo, riusa SceneSnapshot già esistente per data binding).
- **Setting**: `view.map.mode = "raster" | "glyph"` (default `"raster"`). Switch via Quick Action menu, hot-swappable senza riavvio.
- **Risk mitigation**: se Phase 0 rivela `updateImageRawData` non funzionale o BLE bandwidth insufficiente, fallback automatico a glyph-only MVP (degrade gracefully). Raster slitta a Phase 13 stretch nella worst-case scenario.
- **Field-test driven priority order**: glyph-as-fallback > raster-default > advanced raster (Dice So Nice integration, sheet portrait, token portrait — restano Phase 13).

---

### 7.4c Idle Content Infill — z=0.5 layer (v0.9.12)

> **Status:** ratified v0.9.12 (2026-05-14) — extension to ADR-0001 layered model. Binds Phase 4a (engine + layer manager) and Phase 4b (overlay slot lifecycle).

#### 7.4c.1 Motivazione

Nel default view §7.4 (raster mode, no overlay), la 4-tile mappa 2×2 = 400×200 px **occupa solo le righe centrali** del map area (~13 row su 21 disponibili nel text grid §7.3). Le **~3 righe sotto i tile** (e simmetricamente in glyph mode quando il glyph grid non riempie tutte le 21 righe) restano **visivamente vuote** quando nessun overlay z=2 è montato.

Il vincolo hardware §3.1 (max **4** image container, **8** text/list container, **1** capture container) preclude di:
- aggiungere un 5° image container (limite ferreo upstream — `hub.evenrealities.com/docs/guides/device-apis`, INV-2 re-verified 2026-05-14)
- ingrandire un container 200×100 oltre i suoi limiti (stesso vincolo upstream)
- spingere a un singolo full-screen 576×288 raster (verbatim *"no arbitrary pixel drawing"* — stesso doc)

→ L'unica strada **INV-compatible** per ridurre lo spazio visivamente vuoto è **occupare le row idle con text/list container** che leggono dallo state-store e si auto-demoliscono quando z=2 si attiva.

#### 7.4c.2 Contratto

Un nuovo layer `z=0.5` definito tra `z=0` (map) e `z=1` (status HUD):

| Proprietà | Valore |
|---|---|
| Z-order | tra `z=0` e `z=1` |
| Visibilità | **solo quando z=2 NON è montato** (panel o modal entrambi escludono z=0.5) |
| Capture | **mai** — read-only (z=0 owns capture in this state, NOT z=0.5) |
| Container budget | 1-3 text/list container dal pool 8-budget §3.1 |
| Container types | text container (single-line) o list container (multi-row) |
| State source | sottoscrive `core/state-store.js` slices `combat.recentEvents`, `ui.quickActions`, `render.stats` |
| Lifecycle | auto-mount su `overlay_dismissed`, auto-demolish su `overlay_mounted` |
| INV-1 | layout del mockup §7.4 cambia char-precision tra idle (z=0.5 visible) e overlay-open (z=2 visible). z=0 e z=1 column boundaries identici tra i due stati. |

#### 7.4c.3 Contenuto canonico (MVP)

Tre text container in idle state, dall'alto verso il basso (riga 17, 18, 19 del map area §7.4 mockup):

| Container | Contenuto | Fonte state-store |
|---|---|---|
| **#1 Combat log strip** (1 row) | Ultimo evento di combattimento risolto: *"⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing"* — formato `{actor} → {target} · {outcome} · {numbers}` | `combat.recentEvents[0]` (LIFO ring buffer, last 5 events) |
| **#2 Quick prompts strip** (1 row, label-line) | Etichetta separatore con scope visivo + indicator: *"─── z=0.5 idle infill ────────────────"* | constant (literal) |
| **#3 Stats strip** (1 row) | Render stats live: *"raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick"* — formato `{mode} {res} · {pipeline} · {ble_throughput} · {fps_observed} · {quick_action_chip}` | `render.stats` (subscribed to pipeline §7.4b.4 frame events) |

> **Note**: la quick-prompts row è la label di separazione visiva (vedi mockup §7.4); le prompts effettive `[1]Cast [2]Move [3]Atk …` restano nel footer R1-hint row 22-23 (§7.3) per coerenza con i pattern §7.13a. Discreto, NON intrusivo.

#### 7.4c.4 State machine (extended capture transition)

```
       overlay_dismissed              overlay_mounted (panel|modal)
              │                                      │
              ▼                                      ▼
    ┌─ map-base (z=0)                    ┌─ map-base (z=0, capture migrates)
    │  capture: z=0                      │  capture: z=2
    │  z=0.5 mounted ✓                   │  z=0.5 DEMOLISHED ✗
    │  z=1 visible                       │  z=1 visible (eccetto modal full-screen)
    │  z=2 NOT mounted                   │  z=2 mounted (panel|modal)
    └─                                   └─
```

**Atomicità**: il `layer-manager` emette `(unmount z=0.5) + (mount z=2)` come singola transazione di render frame; non esistono frame intermedi con entrambi visibili. Stesso per la transizione inversa.

**Race condition (vedi §11.5.8 failure modes)**: se un `overlay_mounted` event arriva mid-render durante un z=0.5 update, il layer-manager **aborts** il z=0.5 update e procede direttamente al z=2 mount. Equivalente di una preemption.

#### 7.4c.5 INV-1 compliance — char-precision tra stati

Il mockup §7.4 (idle, z=0.5 visibile) e i mockup degli overlay (§7.5 Sheet, §7.6 Combat, ecc., z=2 visibile) devono mostrare:

- Colonna `║` a sinistra: stessa posizione (col 0)
- Colonna `║` centrale (tra map-area e status-HUD): stessa posizione (col 70)
- Colonna `║` a destra: stessa posizione (col 89)
- Le 3 row in fondo al map-area che ospitano z=0.5 in idle, in overlay-open contengono content del z=2 panel (vedi §7.5+ mockup) — stessa larghezza col 0..70.

INV-1 §7.1a sub-rule **#11 (corner alignment)** e **#13 (tab strip equal-width)** restano garantite dalla `Box{children}` render contract (no string concat) — implementazione gating in `@evf/shared-render` `AsciiGrid` snapshot tests (Phase 4a).

#### 7.4c.6 Container budget impact per stato

| Stato | Image | Text/list | Capture | Note |
|---|---|---|---|---|
| MAIN_MAP raster idle (`z=0 + z=0.5 + z=1`) | 4 (2×2 raster) | 5+3 = 8 (Header + Status HUD + Footer + 3 z=0.5) | 1 (z=0) | At-cap; safe — text/list budget exhausted |
| MAIN_MAP raster + overlay-open panel (`z=0 + z=1 + z=2`) | 4 (or 3 degraded if portrait-tile per §7.5) | 5+1-3 = 6-8 (Header + Status HUD + Footer + overlay text/list) | 1 (z=2) | Within budget; varies by overlay content |
| MAIN_MAP raster + overlay-open modal (`z=2 only` — z=0/0.5/1 hidden) | up to 4 | up to 8 | 1 (z=2) | Modal owns full budget; e.g. Voice/Clarify §7.10 |
| MAIN_MAP glyph idle (`z=0 + z=0.5 + z=1`) | 0 | 5+3 = 8 (same as raster) | 1 (z=0) | Glyph mode is text-grid based; z=0.5 still applies symmetrically |

#### 7.4c.7 Phase mapping

| Phase | Work |
|---|---|
| Phase 4a | Layer manager implements z=0.5 lifecycle; `core/event-router.js` subscribes to `overlay_mounted` / `overlay_dismissed`. Initial mount/demolish + atomicity guarantees. |
| Phase 4b | Per-overlay tests assert z=0.5 demolish on every `open()`, reborn on every `close()`. INV-1 snapshot fixtures cover both states (raster idle + raster + sheet-open). |
| Phase 5 | Panel Plugin System contract documents that mounting a panel triggers z=0.5 demolish (no panel-level opt-out — it's a layer-manager invariant, not a panel decision). |
| Phase 7 | Combat-log strip subscribes to MidiQOL `completeActivityUse` chain output (or vanilla `activity.use()` fallback) — same data path as §7.4 raster combat indicators. |

#### 7.4c.8 Open Questions

- **OQ7.4c.1** — il framerate del z=0.5 stats strip è event-based (su frame emit del pipeline §7.4b.4) o tick-based (es. ogni 500 ms)? Default proposto: event-based (lower BLE pressure, more accurate); confermare in Phase 4a benchmark.
- **OQ7.4c.2** — z=0.5 in glyph mode è un dato puramente cosmetico o aggiunge informazione che il glyph grid non già mostra? Proposta: in glyph mode il combat-log strip è ridondante (il glyph already shows token deltas), quindi z=0.5 in glyph mode degrada a solo stats-strip (1 row) + label-strip (1 row); 1 row libera per altre feature future.

---

### 7.5 Overlay — Sheet (size=`panel`, multi-tab in stile Foundry)

Aperto via chip `[sheet]` o quick-action menu. Replica il più fedelmente possibile la **scheda personaggio Foundry dnd5e v5.x** (supporta sia ruleset **PHB 2014** che **PHB 2024 / One D&D** via setting `core.modernRules`, vedi §11.5.1): stessa struttura header → vitals → abilità+saves → skills → features → bio. Stessi dati, stessa iconografia (mappata a Unicode), stesse decorazioni (box drawing, dividers, banner).

Status HUD a destra **resta visibile** (è la "scheda mini" sempre presente; la Sheet overlay è la versione "deep dive").

#### 7.5.1 Tab Navigation

La Sheet contiene **6 tab interni** (specchio dei tab Foundry: Attributes, Skills, Inventory, Spells, Features, Biography). Ordine fisso nella tab strip:

```
[ MAIN ]─[ SKILLS ]─[ INV ]─[ SPELLS ]─[ FEATS ]─[ BIO ]
```

L'ordine privilegia le viste **frequentemente usate in combat** (Inv e Spells subito dopo Main/Skills) prima di Feats e Bio (deep-dive narrativo).

| Gesto R1 | Effetto |
|---|---|
| Tap singolo | Cicla tab successivo (Main → Skills → Inv → Spells → Feats → Bio → Main) |
| Scroll su/giù | Naviga contenuto del tab corrente |
| Tap doppio | Chiudi Sheet (torna a map base) |
| Long-press | Apri Quick Action menu |

Indicatore tab corrente: `[▶XXX ]` (▶ sostituisce lo spazio interno). Le altre voci restano `[ XXX ]`. Larghezza tab preservata grazie al trick spazio↔▶, così la strip non shift-ta mai.

#### 7.5.2 Tab 1 — Main (default all'apertura)

Replica header + vitals + abilities + saves + senses Foundry.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[▶MAIN ]─[ SKILLS ]─[ INV ]─[ SPELLS ]─[ FEATS ]─[ BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │ ┌──────────┐  THORIN OAKENSHIELD                                │   ║ ──────────────── ║
║ │ │ portrait │  Mountain Dwarf · Soldier        XP ▰▰▰▰▰▰▰▱▱▱     │   ║ HP ████████░░    ║
║ │ │ image    │  Fighter (Champ) 3 / Wizard 5    34000/48000 (8)   │   ║    45/68  +10t   ║
║ │ │ 100×60   │                                                    │   ║ AC 18  SPD 30    ║
║ │ └──────────┘                                                    │   ║                  ║
║ │                                                                 │   ║ Act ░  Bns ░  R░ ║
║ │  ♥ HP    ████████████░░░  45/68    +10 temp                     │   ║ Move 30/30       ║
║ │  ⛨ AC 18    ⚡ INIT +2    ⚔ SPD 30 ft    ★ INSP ░    ◈ PROF +3  │   ║                  ║
║ │                                                                 │   ║ Slots            ║
║ │  ┌── ABILITIES ──────────┐  ┌── SAVING THROWS ──────┐           │   ║   1° ▓▓░░ 2/4    ║
║ │  │ STR  16  +3            │ │ ◉ STR  +5    DEX  +2  │           │   ║   2° ▓░░  1/3    ║
║ │  │ DEX  14  +2            │ │ ◉ CON  +4    INT  +0  │           │   ║   3° ░░   0/2    ║
║ │  │ CON  15  +2            │ │   WIS  +1    CHA  +1  │           │   ║                  ║
║ │  │ INT  10  +0            │ └────────────────────────┘           │   ║ Conditions       ║
║ │  │ WIS  12  +1            │                                      │   ║  ▶ Bless (7r)    ║
║ │  │ CHA  13  +1            │  Hit Dice  3/3 d10 + 3/5 d6           │   ║    Concentr.     ║
║ │  └────────────────────────┘                                      │   ║                  ║
║ │                                                                 │   ║                  ║
║ │  Senses    Darkvision 60 ft · pPer 14 · pIns 11 · pInv 10        │   ║                  ║
║ │  Lang      Common · Dwarvish                                     │   ║                  ║
║ │  Tools     Smith's tools · Brewer's supplies                     │   ║                  ║
║ │  Resist    poison        Immun  --        Vuln  --               │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=next tab  scroll=content  tap×2=close  long=quick   [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Iconografia Unicode** (mapping Foundry → ASCII):

| Foundry icon | Glyph | Significato |
|---|---|---|
| heart | `♥` | HP |
| shield | `⛨` | AC |
| boot/swirl | `⚡` | Initiative |
| running | `⚔` | Speed |
| star | `★` | Inspiration |
| diamond | `◈` | Proficiency Bonus |
| filled circle | `◉` | Proficient (skill/save) |
| star-double | `★` | Expertise (skill) |
| empty circle | `○` | Untrained |
| dice d20 | `⚀` | Rollable |
| pip filled | `▰` / empty `▱` | XP / progress bars |
| spell slot used | `▓` / unused `░` | Slot tracker |

#### 7.5.3 Tab 2 — Skills (full list 18 skill)

Replica esattamente la lista skill Foundry, raggruppata per ability score, con prof markers e modifier. Scrollable.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[ MAIN ]─[▶SKILLS ]─[ INV ]─[ SPELLS ]─[ FEATS ]─[ BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │  ◉ proficient · ★ expertise · ○ untrained                       │   ║ ──────────────── ║
║ │                                                                 │   ║ HP ████████░░    ║
║ │   STR  ◉ Athletics             +6   ⚀                           │   ║    45/68  +10t   ║
║ │                                                                 │   ║ AC 18  SPD 30    ║
║ │   DEX  ○ Acrobatics            +2   ⚀                           │   ║                  ║
║ │        ○ Sleight of Hand       +2   ⚀                           │   ║ Act ░  Bns ░  R░ ║
║ │        ○ Stealth               +2   ⚀                           │   ║ Move 30/30       ║
║ │                                                                 │   ║                  ║
║ │   INT  ○ Arcana                +0   ⚀                           │   ║ Slots            ║
║ │        ○ History               +0   ⚀                           │   ║   1° ▓▓░░ 2/4    ║
║ │        ○ Investigation         +0   ⚀                           │   ║   2° ▓░░  1/3    ║
║ │        ○ Nature                +0   ⚀                           │   ║   3° ░░   0/2    ║
║ │        ○ Religion              +0   ⚀                           │   ║                  ║
║ │                                                                 │   ║ Conditions       ║
║ │   WIS  ◉ Animal Handling       +4   ⚀                           │   ║  ▶ Bless (7r)    ║
║ │        ○ Insight               +1   ⚀                           │   ║    Concentr.     ║
║ │        ◉ Medicine              +4   ⚀                           │   ║                  ║
║ │        ○ Perception            +1   ⚀                           │   ║                  ║
║ │        ○ Survival              +1   ⚀                           │   ║                  ║
║ │                                                                 │   ║                  ║
║ │   CHA  ○ Deception             +1   ⚀                           │   ║                  ║
║ │   ▼ scroll for more · R1 scroll-tap = roll skill                │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=next tab  scroll=skill  qa=quick                    [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

Tap sulla skill highlighted → tira via `actor.rollSkill(skillId)` → result appare in Log overlay.

#### 7.5.4 Tab 3 — Inventory (full Foundry inventory layout)

Replica fedele del tab Inventory di Foundry: **currency strip**, sezioni **EQUIPPED / CONSUMABLES / EQUIPMENT / CONTAINER**, peso e encumbrance bar. **Tap** su un item apre le **Action Options** (use / equip / unequip → chiama `item.use()` o toggle `equipped: true/false`); over-scroll (swipe-up al top) apre il Quick Action menu (ADR-0012).

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[ MAIN ]─[ SKILLS ]─[▶INV ]─[ SPELLS ]─[ FEATS ]─[ BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │  ◈ Currency  PP 0   GP 45   EP 0   SP 12   CP 8                 │   ║ ──────────────── ║
║ │  ⚖ Carried   47.5 / 240 lb     ▰▰▰▱▱▱▱▱▱▱  20%                  │   ║ HP ████████░░    ║
║ │                                                                 │   ║    45/68  +10t   ║
║ │  ◆ EQUIPPED                                                     │   ║ AC 18  SPD 30    ║
║ │   ⚔ Longsword          versatile (1d8 / 1d10)  slashing         │   ║                  ║
║ │      proficient · attuned                                       │   ║ Act ░  Bns ░  R░ ║
║ │   ⚔ Handaxe            1d6 slashing · thrown 20/60              │   ║ Move 30/30       ║
║ │   ⛨ Chain Mail         AC 16 · disadv stealth                   │   ║                  ║
║ │   ⛨ Shield             +2 AC                                    │   ║ Slots            ║
║ │                                                                 │   ║   1° ▓▓░░ 2/4    ║
║ │  ◆ CONSUMABLES                                                  │   ║   2° ▓░░  1/3    ║
║ │    Potion of Healing  ×3   2d4+2 HP · 1 action                  │   ║   3° ░░   0/2    ║
║ │    Potion of Climbing ×1   +20 climb spd · 1 action             │   ║                  ║
║ │    Holy Water         ×2   2d6 radiant · 1 action               │   ║ Conditions       ║
║ │                                                                 │   ║  ▶ Bless (7r)    ║
║ │  ◆ EQUIPMENT                                                    │   ║    Concentr.     ║
║ │    Rope (50 ft hempen)         5 lb                             │   ║                  ║
║ │    Torch                  ×4   1 lb each                        │   ║                  ║
║ │    Bedroll                     7 lb                             │   ║                  ║
║ │    Rations (1 day)        ×7   2 lb each                        │   ║                  ║
║ │                                                                 │   ║                  ║
║ │  ◆ CONTAINER · Bag of Holding (500 lb)                          │   ║                  ║
║ │    Crystal goblet  1 lb · gold trim · 50 gp                     │   ║                  ║
║ │  ▼ scroll · tap = use/equip                                     │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=next tab  scroll=item  long=use/equip                [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Differenza rispetto all'overlay standalone Inventory (§7.9)**: il panel standalone è **condensato per quick-access in combat** (solo equipped + consumibili in primo piano, scroll-to-use rapido). Questo Sheet tab è il **deep-dive completo** con currency, encumbrance, container nesting, item descriptions. I due coesistono — il giocatore sceglie il livello di dettaglio.

#### 7.5.5 Tab 4 — Spells (full Foundry spellbook layout)

Replica fedele del tab Spells di Foundry: **header spellcasting** (DC, atk mod, prepared count), **filter bar**, sezioni **CANTRIPS** + **L1, L2, L3...** con slot tracker per livello, indicatori prepared/known/at-will. **Tap** su uno spell apre le **Action Options** (cast / target / opzioni); over-scroll (swipe-up al top) apre il Quick Action menu (ADR-0012).

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[ MAIN ]─[ SKILLS ]─[ INV ]─[▶SPELLS ]─[ FEATS ]─[ BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │  Spellcasting  Wizard 5 (multi)              Save DC 14         │   ║ ──────────────── ║
║ │  Spell Atk  +6     Mod  INT +3 · Prof +3 · Prepared 5/8         │   ║ HP ████████░░    ║
║ │                                                                 │   ║    45/68  +10t   ║
║ │  Filter [▶ALL]  Prepared · Cantrips · Concentration · Ritual    │   ║ AC 18  SPD 30    ║
║ │                                                                 │   ║                  ║
║ │  ◇ CANTRIPS  ────── (at-will)                                   │   ║ Act ░  Bns ░  R░ ║
║ │   ◉ Fire Bolt        action  120 ft  V·S    1d10 fire           │   ║ Move 30/30       ║
║ │   ◉ Mage Hand        action  30 ft   V·S    util · 1 min        │   ║                  ║
║ │   ◉ Light            action  touch   V·M    bright 20ft / 1hr   │   ║ Slots            ║
║ │                                                                 │   ║   1° ▓▓░░ 2/4    ║
║ │  ◇ LEVEL 1   slots ▓▓░░  2/4 used                               │   ║   2° ▓░░  1/3    ║
║ │   ◉ Shield           reaction  self     V·S      +5 AC vs hit   │   ║   3° ░░   0/2    ║
║ │   ◉ Magic Missile    action    120 ft   V·S      3×1d4+1 force  │   ║                  ║
║ │     Mage Armor       action    touch    V·S·M    AC 13+DEX/8h   │   ║ Conditions       ║
║ │     Detect Magic     action    self     V·S      ritual · 10min │   ║  ▶ Bless (7r)    ║
║ │                                                                 │   ║    Concentr.     ║
║ │  ◇ LEVEL 2   slots ▓░░   1/3 used                               │   ║                  ║
║ │   ◉ Misty Step       bonus     30 ft    V        teleport       │   ║                  ║
║ │     Mirror Image     action    self     V·S      3 duplicates   │   ║                  ║
║ │                                                                 │   ║                  ║
║ │  ◇ LEVEL 3   slots ░░    0/2 used                               │   ║                  ║
║ │   ▶ Fireball         action    150 ft   V·S·M    8d6 fire 20ft  │   ║                  ║
║ │     Counterspell     reaction  60 ft    S        block ≤3rd     │   ║                  ║
║ │  ▼ scroll · tap = cast                                           │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=next tab  scroll=spell  long=cast                    [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Iconografia spell** (mapping Foundry icons → Unicode):

| Foundry indicator | Glyph | Significato |
|---|---|---|
| prepared spell | `◉` | Spell preparato (può essere castato) |
| unprepared known spell | (vuoto) | Conosciuto ma non preparato |
| at-will (cantrip) | `◉` always | Cantrip — sempre castabile |
| concentration | `≀` | Spell richiede concentration |
| ritual | `R` | Castabile come ritual |
| section divider | `◇ LEVEL N` | Header di livello slot |
| slot used | `▓` | Slot consumato |
| slot available | `░` | Slot libero |
| current focus | `▶` | Cursor sullo spell selezionato |

**Differenza rispetto all'overlay standalone Spellbook (§7.8)**: stesso pattern dell'Inventory — overlay standalone è quick-cast in combat, Sheet tab è deep-dive con DC, atk mod, components, descrizioni complete.

#### 7.5.6 Tab 5 — Feats (Class features + Race + Background + Feats)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[ MAIN ]─[ SKILLS ]─[ INV ]─[ SPELLS ]─[▶FEATS ]─[ BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │  ◆ CLASS · Fighter (Champion) L3                                │   ║ ──────────────── ║
║ │  ▶ Fighting Style: Defense                                      │   ║ HP ████████░░    ║
║ │      +1 AC while wearing armor                                  │   ║    45/68  +10t   ║
║ │    Second Wind        ░  bonus · 1d10+3 HP · 1/short rest        │   ║ AC 18  SPD 30    ║
║ │    Action Surge       ░  (no action) · 1 extra action · 1/short  │   ║                  ║
║ │    Improved Critical     crit on 19-20 (Champion L3)            │   ║ Act ░  Bns ░  R░ ║
║ │    [unlocked at Ftr5]    Extra Attack — 2 atk per Action         │   ║ Move 30/30       ║
║ │    [unlocked at Ftr9]    Indomitable — reroll failed save 1×    │   ║                  ║
║ │                                                                 │   ║ Slots            ║
║ │  ◆ CLASS · Wizard (School of Evocation) L5                      │   ║   1° ▓▓░░ 2/4    ║
║ │    Spellcasting (L1)     INT prepared caster, ritual            │   ║   2° ▓░░  1/3    ║
║ │    Arcane Recovery   ░   short rest · slots ≤ ⌈5/2⌉=3 levels    │   ║   3° ░░   0/2    ║
║ │    Sculpt Spells (L2)    auto: protect allies from own AoE      │   ║                  ║
║ │    [unlocked at Wiz6]    Potent Cantrip — partial dmg on save    │   ║ Conditions       ║
║ │                                                                 │   ║  ▶ Bless (7r)    ║
║ │  ◆ RACE · Mountain Dwarf                                        │   ║    Concentr.     ║
║ │    Darkvision 60 ft                                             │   ║                  ║
║ │    Dwarven Resilience    adv vs poison · resist poison          │   ║                  ║
║ │    Dwarven Combat Train  battleaxe · handaxe · lighthammer · w  │   ║                  ║
║ │    Stonecunning          +2× prof on stone-related History       │   ║                  ║
║ │    Dwarven Armor Training light + medium armor proficiency     │   ║                  ║
║ │                                                                 │   ║                  ║
║ │  ◆ BACKGROUND · Soldier                                         │   ║                  ║
║ │    Military Rank — lower NPCs salute, accommodate               │   ║                  ║
║ │                                                                 │   ║                  ║
║ │  ◆ FEATS                                                        │   ║                  ║
║ │    Great Weapon Master   −5 atk, +10 dmg with heavy weapons      │   ║                  ║
║ │    Tough                 +2 max HP per level                    │   ║                  ║
║ │  ▼ scroll · tap on item = use feature                            │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=next tab  scroll=feature  long=use                   [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

Le voci con `░` accanto sono **usabili** (resource pool: Second Wind, Action Surge, Arcane Recovery). Long-press le attiva via `activity.use()`. Le voci `[unlocked at ...]` sono visibili ma disabilitate (preview di feature future per la classe).

#### 7.5.7 Tab 6 — Bio (Background details, personality, backstory)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SHEET                     ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─[ MAIN ]─[ SKILLS ]─[ INV ]─[ SPELLS ]─[ FEATS ]─[▶BIO ]───────┐   ║ THORIN  F3/W5    ║
║ │  Age 142          Height 4'8"          Weight 168 lb            │   ║ ──────────────── ║
║ │  Eyes brown       Hair black           Skin tan                 │   ║ HP ████████░░    ║
║ │  Alignment Lawful Good                                          │   ║    45/68  +10t   ║
║ │  Deity Moradin                                                  │   ║ AC 18  SPD 30    ║
║ │                                                                 │   ║                  ║
║ │  ◇ Personality Traits                                           │   ║ Act ░  Bns ░  R░ ║
║ │    "I face problems head-on; a simple, direct solution          │   ║ Move 30/30       ║
║ │     is best."                                                   │   ║                  ║
║ │                                                                 │   ║ Slots            ║
║ │  ◇ Ideal      Loyalty — my allies define me                     │   ║   1° ▓▓░░ 2/4    ║
║ │  ◇ Bond       I'd die to recover an ancient relic of my faith   │   ║   2° ▓░░  1/3    ║
║ │  ◇ Flaw       I'd rather eat my armor than admit I'm wrong      │   ║   3° ░░   0/2    ║
║ │                                                                 │   ║                  ║
║ │  ◇ Backstory                                                    │   ║ Conditions       ║
║ │    Thorin grew up in the deep halls of Khaz-Modan, where his    │   ║  ▶ Bless (7r)    ║
║ │    clan tended the forges of Moradin. After the orc raid that   │   ║    Concentr.     ║
║ │    destroyed his home village, he took up the warhammer of      │   ║                  ║
║ │    his fallen father and swore vengeance...                     │   ║                  ║
║ │  ▼ scroll for more · tap×2 = close                               │   ║                  ║
║ └─────────────────────────────────────────────────────────────────┘   ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=cycle tab  scroll=text  tap×2=close                  [▶sheet] [combat] [log] …    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

#### 7.5.8 Mapping a Foundry data model

Ogni campo della Sheet legge da `actor.system` di dnd5e:

| Field G2 | dnd5e source |
|---|---|
| Class banner | `actor.system.details.race`, `actor.system.classes.<className>` |
| XP bar | `actor.system.details.xp.value` / `xp.max` |
| HP / AC / Init / Speed | `actor.system.attributes.hp`, `.ac`, `.init`, `.movement.walk` |
| Inspiration | `actor.system.attributes.inspiration` |
| Prof Bonus | `actor.system.attributes.prof` |
| Abilities | `actor.system.abilities.<str/dex/...>.value`, `.mod`, `.proficient` |
| Saves | `actor.system.abilities.<x>.save` (con prof markers) |
| Hit Dice | `actor.system.attributes.hd.value` / `.max` |
| Skills | `actor.system.skills.<athletics/...>.total`, `.proficient` (**0 / 0.5 / 1 / 2** = none / half-prof Jack-of-All-Trades / proficient / expertise — vedi `CONFIG.DND5E.proficiencyLevels`) |
| Senses | `actor.system.attributes.senses`, `actor.system.skills.prc.passive` ecc. |
| Languages / Tools / Resist | `actor.system.traits.languages`, `.toolProf`, `.dr`, `.di`, `.dv` |
| **Currency** | `actor.system.currency.{pp,gp,ep,sp,cp}` |
| **Encumbrance** | `actor.system.attributes.encumbrance.value`, `.max`, `.pct` |
| **Equipped weapons** | `actor.items.filter(i => i.type === "weapon" && i.system.equipped)` |
| **Equipped armor** | `actor.items.filter(i => i.type === "equipment" && i.system.equipped && i.system.armor)` |
| **Consumables** | `actor.items.filter(i => i.type === "consumable")` con `system.uses.value/max` |
| **Containers** | `actor.items.filter(i => i.type === "container")` + nested items via `item.system.contents` |
| **Spellcasting class** | `actor.system.attributes.spellcasting`, `actor.system.attributes.spelldc`, `.spellmod` |
| **Spell slots** | `actor.system.spells.spell{1..9}.value` / `.max`, `actor.system.spells.pact` |
| **Spells (cantrips + leveled)** | `actor.items.filter(i => i.type === "spell")`; per-spell: `system.level`, `system.method` (string: `"spell"`/`"atwill"`/`"innate"`/`"pact"`/`"ritual"` — **dnd5e ≥5.1, sostituisce `system.preparation.mode`**), `system.prepared` (numero: `0`=non prep, `1`=prep, `2`=always — **sostituisce `system.preparation.prepared`**), `system.activation`, `system.range`, `system.components`, `system.damage`, `system.save` |
| **Filter prepared** | `actor.items.filter(i => i.type === "spell" && (i.system.prepared >= 1 \|\| i.system.method === "atwill" \|\| i.system.method === "innate"))` |
| Features | `actor.items.filter(i => i.type === "feat" \|\| i.type === "class" \|\| i.type === "race" \|\| i.type === "background" \|\| i.type === "subclass")` |
| Bio | `actor.system.details.biography.value` (HTML — strippare a plain) |
| Personality | `actor.system.details.trait`, `.ideal`, `.bond`, `.flaw` |

**Strategia portrait image (decisione v0.8 — risolve image container budget conflict)**: Foundry espone `actor.img` (URL al portrait). Bridge fa fetch + resize a 100×60 + dither 4-bit (riusa pipeline §7.4b.4 con Floyd-Steinberg) → image container.

**Allocazione dinamica image container** (max 4 per pagina, vincolo §3.1):

| Stato | Tile mappa | Sheet portrait | Token portrait | Totale |
|---|---|---|---|---|
| MAIN_MAP raster mode (default) | 4 (2×2) | — | — | 4 |
| SHEET overlay aperto, raster mode | **3 (degraded — drop bottom-right tile)** | 1 (top-right of overlay) | — | 4 |
| COMBAT overlay con target highlighted | 3 (degraded) | — | 1 (target detail) | 4 |
| MAIN_MAP glyph mode (fallback) | 0 (text-only) | — | — | 0 |

**Quando Sheet o Combat-target overlay è aperto in raster mode**: il tile bottom-right (200×100 in basso-destra del map area) viene **temporaneamente sostituito** dal portrait container. Il map raster mostra solo 3 tile per quel tempo (degradazione visibile dell'angolo bottom-right). Restoration al close overlay.

**In glyph mode**: tutti gli image container rimangono liberi, portrait sempre disponibile + un container di "spare" per future feature.

**Feature flag**: `sheet.portrait.enabled` (default off finché Phase 0 non valida `updateImageRawData`).

### 7.6 Overlay — Combat (size=`panel`)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ COMBAT                    ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─── COMBAT TRACKER ─────────────────────────────────────────────┐   ║ THORIN  F3/W5    ║
║ │  18  ▶ GOBLIN ARCHER     HP ████░░░░  5/15  AC 13   30ft NE  ✕ │   ║ ──────────────── ║
║ │  15  ▶ THORIN  ◀ YOU     HP ████████ 45/68  AC 18    --      ★ │   ║ HP ████████░░    ║
║ │  13    GOBLIN BRUTE      HP ████████ 11/15  AC 14   40ft E   ✕ │   ║    45/68  +10t   ║
║ │  11    LYRA   (party)    HP █████████ 32/32 AC 14   10ft W   ★ │   ║ AC 18  SPD 30    ║
║ │   8    SHADOW HOUND      HP ███████░ 18/22  AC 12   55ft N   ✕ │   ║                  ║
║ │                                                                │   ║ Act ░  Bns ░  R░ ║
║ │  Active effects:                                               │   ║ Move 30/30       ║
║ │   · Bless    on Thorin, Lyra      (7 rounds left · conc Lyra)  │   ║                  ║
║ │   · Hunter's Mark  on Goblin Archer (Lyra)                     │   ║ Slots            ║
║ │                                                                │   ║   1° ▓▓░░ 2/4    ║
║ │  Quick:  [ A ]ttack    [ S ]pell    [ I ]tem    [ M ]ove        │   ║   2° ▓░░  1/3    ║
║ └────────────────────────────────────────────────────────────────┘   ║   3° ░░   0/2    ║
║                                                                      ║                  ║
║                                                                      ║ Conditions       ║
║                                                                      ║  ▶ Bless (7r)    ║
║                                                                      ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=initiative  tap=quick  long=quick    [sheet] [▶combat] [log] [spell] [inv]    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.7 Overlay — Log (size=`panel`)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ LOG                       ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─── EVENT LOG ──── [ALL] Rolls Damage Status Chat ──────────────┐   ║ THORIN  F3/W5    ║
║ │  T+00:01  THORIN     ⚔ Longsword  vs Goblin Archer             │   ║ ──────────────── ║
║ │             → 23 vs AC 13   HIT     12 slashing                │   ║ HP ████████░░    ║
║ │  T+00:00  THORIN     ✦ Second Wind (bonus)        +9 HP        │   ║    45/68  +10t   ║
║ │  T-00:12  GOB ARCHER ⚔ Shortbow   vs Thorin                    │   ║ AC 18  SPD 30    ║
║ │             → 14 vs AC 18   MISS                               │   ║                  ║
║ │  T-00:30  LYRA       ✧ Bless [slot 1] on Thorin, Lyra          │   ║ Act ░  Bns ░  R░ ║
║ │             CONCENTRATING                                      │   ║ Move 30/30       ║
║ │  T-00:45  ── ROUND 3 begins ──                                 │   ║                  ║
║ │  T-01:10  THORIN     Athletics vs DC 14    → 17  PASS          │   ║ Slots            ║
║ │  T-01:45  GOB BRUTE  ⚔ Scimitar  vs Lyra                       │   ║   1° ▓▓░░ 2/4    ║
║ │             → 19 vs AC 14   HIT      8 slashing                │   ║   2° ▓░░  1/3    ║
║ │  T-02:20  PERCEPTION passive 14 — footprint spotted            │   ║   3° ░░   0/2    ║
║ │  ▼ scroll for older                                            │   ║                  ║
║ └────────────────────────────────────────────────────────────────┘   ║ Conditions       ║
║                                                                      ║  ▶ Bless (7r)    ║
║                                                                      ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=history  tap=detail  long=quick      [sheet] [combat] [▶log] [spell] [inv]    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.8 Overlay — Spellbook (size=`panel`)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ SPELLBOOK                 ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─── SPELLBOOK · prepared 5/5 ───────────────────────────────────┐   ║ THORIN  F3/W5    ║
║ │  CANTRIPS                                                      │   ║ ──────────────── ║
║ │   ◉ Fire Bolt        action  120 ft   1d10 fire                │   ║ HP ████████░░    ║
║ │   ◉ Mage Hand        action  30 ft    util                     │   ║    45/68  +10t   ║
║ │                                                                │   ║ AC 18  SPD 30    ║
║ │  L1   slots ▓▓░░  2/4                                          │   ║                  ║
║ │   ◉ Shield           reaction  self   +5 AC vs hit             │   ║ Act ░  Bns ░  R░ ║
║ │   ◉ Magic Missile    action    120 ft 3×1d4+1 force            │   ║ Move 30/30       ║
║ │                                                                │   ║ Slots            ║
║ │  L2   slots ▓░░   1/3                                          │   ║   1° ▓▓░░ 2/4    ║
║ │   ◉ Misty Step       bonus     30 ft  teleport                 │   ║   2° ▓░░  1/3    ║
║ │                                                                │   ║   3° ░░   0/2    ║
║ │  L3   slots ░░    0/2   ← available                            │   ║                  ║
║ │   ▶ Fireball         action  150 ft   8d6 fire  20-ft sphere   │   ║ Conditions       ║
║ │     Counterspell     reaction  60 ft  block spell ≤ 3rd        │   ║  ▶ Bless (7r)    ║
║ └────────────────────────────────────────────────────────────────┘   ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=spell  tap=cast  long=quick          [sheet] [combat] [log] [▶spell] [inv]    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.9 Overlay — Inventory (size=`panel`)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti  ▶ INVENTORY                 ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║ ┌─── INVENTORY · 47/120 lb ──────────────────────────────────────┐   ║ THORIN  F3/W5    ║
║ │  EQUIPPED                                                      │   ║ ──────────────── ║
║ │   ⚔ Longsword          1d8 slashing  versatile (1d10)          │   ║ HP ████████░░    ║
║ │   ⚔ Handaxe            1d6 slashing  thrown 20/60              │   ║    45/68  +10t   ║
║ │   ⛨ Chain Mail         AC 16  disadv stealth                   │   ║ AC 18  SPD 30    ║
║ │   ⛨ Shield             +2 AC                                   │   ║                  ║
║ │                                                                │   ║ Act ░  Bns ░  R░ ║
║ │  CONSUMABLES                                                   │   ║ Move 30/30       ║
║ │   ▶ Potion of Healing  ×3    2d4+2 HP        1 action          │   ║                  ║
║ │     Potion of Climbing ×1    +20 climb spd   1 action          │   ║ Slots            ║
║ │     Holy Water         ×2    2d6 radiant     1 action          │   ║   1° ▓▓░░ 2/4    ║
║ │                                                                │   ║   2° ▓░░  1/3    ║
║ │  CARRIED                                                       │   ║   3° ░░   0/2    ║
║ │     Rope (50 ft)   Torch ×4   Bedroll   Rations ×7   45 gp     │   ║                  ║
║ │  ▼ scroll for more                                             │   ║ Conditions       ║
║ └────────────────────────────────────────────────────────────────┘   ║  ▶ Bless (7r)    ║
║                                                                      ║    Concentr.     ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=item  tap=use  long=quick            [sheet] [combat] [log] [spell] [▶inv]    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.10 Voice Overlay (size=`modal`, full-screen) — **V2 OPZIONALE**

> **Non parte del MVP**. La voice UI vive nel client MCP (§5.7) — l'LLM non è on-glasses (vincolo §3.6). Tuttavia la **cattura audio sul G2 è hardware-fattibile** (verificato v0.9.10, vedi §3.5): il G2 ha 4-mic e SDK espone `audioControl()` → PCM 16 kHz s16le mono al plugin nel WebView del telefono. Architettura V2: G2 mic → plugin WebView → bridge `/v1/voice` (§4.2) → STT cloud (§4.5) → tool MCP → toast risultato sul G2. **Audio output non disponibile** (G2 no speaker §3.1) → tutto il feedback è visivo (toast HUD §7.15.2, status update §7.4).

Mostrato dopo l'apertura del Quick Action menu via over-scroll (swipe-up al top). Sostituisce temporaneamente la vista di base (status HUD nascosta — focus totale sull'azione vocale).

**State 1 — Listening**:

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                                ◉  ASCOLTO  ◉                                              ║
║                                                                                           ║
║                       ▁▂▃▅▇▇▇▅▃▂▁▁▂▃▅▇▇▇▆▄▂▁                                              ║
║                                                                                           ║
║                       "vedo i goblin in avvicinamento_                                    ║
║                        lancio palla di fuoco                                              ║
║                        e li brucio"                                                       ║
║                                                                                           ║
║                                                                                           ║
║                              R1 release = invia                                           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**State 2 — Thinking**:

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                              ⟳  GM AGENT THINKING  ⟳                                      ║
║                                                                                           ║
║                       Intent  : cast Fireball                                             ║
║                       Targets : 3 goblins in 20-ft sphere                                 ║
║                       Slot    : 3rd (3 available)                                         ║
║                                                                                           ║
║                       Confidence: ████████░░  82%                                         ║
║                                                                                           ║
║                              [ Confirm ▶ ]   [ Cancel ✕ ]                                 ║
║                                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

**State 3 — Executing**: torna alla main view; il risultato appare come **toast banner** sopra la mappa per ~3 sec, status HUD aggiornato in tempo reale (HP, slot consumati). Il dettaglio finisce nel Log overlay.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti                              ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║                                                                      ║ THORIN  F3/W5    ║
║   ┌─── ✦ FIREBALL [slot 3] cast ─────────────────────────────┐       ║ ──────────────── ║
║   │   Template @ (1050,650)  affected: g1 g2 g3              │       ║ HP ████████░░    ║
║   │   8d6 fire = 28 damage                                   │       ║    45/68  +10t   ║
║   │   g1 DEX  9 vs DC 15  FAIL  → 28 hp                      │       ║ AC 18  SPD 30    ║
║   │   g2 DEX 17 vs DC 15  PASS  → 14 hp                      │       ║                  ║
║   │   g3 DEX  4 vs DC 15  FAIL  → 28 hp                      │       ║ Act ▓  Bns ░  R░ ║
║   │   ✔ slot 3 used   (auto-dismiss 3s)                      │       ║ Move 30/30       ║
║   └──────────────────────────────────────────────────────────┘       ║                  ║
║                                                                      ║ Slots            ║
║      [ map continues underneath, status updated ]                    ║   1° ▓▓░░ 2/4    ║
║                                                                      ║   2° ▓░░  1/3    ║
║                                                                      ║   3° ▓░░  1/3 ◀  ║
║                                                                      ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: scroll=pan  tap=ping  long=quick            [sheet] [combat] [log] [spell] [inv]     ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.11 Clarify Overlay (size=`modal`) — **V2 OPZIONALE**

> **Non parte del MVP**. Usato solo quando l'AI MCP chiede disambiguazione; nel MVP il giocatore seleziona target manualmente via R1 scroll+tap dentro Combat overlay.

Quando l'AI ha bassa confidenza o il bersaglio è ambiguo. Modal full-screen perché richiede scelta esplicita.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                              ⚠  CLARIFY                                                   ║
║                                                                                           ║
║                       "attacco il goblin con la spada"                                    ║
║                                                                                           ║
║                       Quale goblin?                                                       ║
║                                                                                           ║
║                       ▶ [ 1 ] Goblin Archer    30 ft NE   HP ████░░  5/15                 ║
║                         [ 2 ] Goblin Brute     40 ft E    HP ████████ 11/15               ║
║                         [ 3 ] Hobgoblin        55 ft N    HP ██████░ 12/18                ║
║                                                                                           ║
║                              R1 scroll=select  tap=confirm  long=cancel                   ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.12 Boot Splash (page indipendente, prima del main)

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                              EVENFOUNDRYVTT  v0.10.0                                          ║
║                              ─────────────────                                            ║
║                                                                                           ║
║                              [ ✓ ] G2 display 576×288                                     ║
║                              [ ✓ ] R1 ring paired (92%)                                   ║
║                              [ ⟳ ] Bridge ws://homelab:8910                               ║
║                              [   ] Foundry sync                                           ║
║                              [   ] Character: Thorin                                      ║
║                                                                                           ║
║                              loading_                                                     ║
║                                                                                           ║
║                              protocol 1.0 · panels available: 5                           ║
║                                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

### 7.13a Quick Action Menu (MVP — over-scroll entry point)

Apparso su **over-scroll (swipe-up al top boundary del layer in focus)**, ADR-0012. Selezione via scroll, conferma via tap.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                           ║
║                              ◈  QUICK ACTION                                              ║
║                                                                                           ║
║                       ▶ [ S ]  Sheet                                                      ║
║                         [ C ]  Combat tracker                                             ║
║                         [ L ]  Event log                                                  ║
║                         [ B ]  Spellbook                                                  ║
║                         [ I ]  Inventory                                                  ║
║                         [ A ]  Attack (current target)                                    ║
║                         [ M ]  Map controls                                               ║
║                         [ N ]  laNguage  (Foundry: it · override: —)                      ║
║                         [ X ]  Cancel                                                     ║
║                                                                                           ║
║                              R1 scroll=select  tap=open  tap×2=cancel                     ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

Risolve il vincolo "chip-bar non può catturare input direttamente" (solo 1 container ha capture per pagina): l'over-scroll apre questa list-modal che cattura input correttamente. Vedi §7.14 per state machine completo.

### 7.14 Complete Navigation Map & Button Audit

> **Garanzia**: ogni schermata raggiungibile e chiudibile, ogni gesto R1 mappato esplicitamente. Verificato 10 volte (vedi §7.14.4).

#### 7.14.1 State Machine Diagram

```
                              APP STARTUP
                                  │
                                  ▼
                        ┌──────────────────┐
                        │   BOOT  (§7.12)  │
                        │  capability      │
                        │  handshake       │
                        └────────┬─────────┘
                                 │ auto-transition
                                 │ (handshake complete)
                                 ▼
        ┌────────────────────────────────────────────────────────┐
        │              MAIN_MAP  (§7.4)                          │ ◀── HOME
        │  Map base layer (z=0)                                  │     always
        │  Persistent Status HUD (z=1)                           │     reachable
        │  capture: map base                                     │
        └────────────────────────┬───────────────────────────────┘
                                 │ over-scroll (↑ at top)
                                 ▼
                       ┌──────────────────────┐
                       │ QUICK_ACTION (§7.13a)│
                       │   list-modal          │
                       │  scroll  = highlight  │
                       │  tap     = open       │
                       │  tap×2   = cancel     │
                       └──┬──┬──┬──┬──┬──┬──┬──┘
                          │  │  │  │  │  │  │
                         [S][C][L][B][I][M][X]
                          │  │  │  │  │  │  └─→ cancel → MAIN_MAP
                          │  │  │  │  │  └────→ MAP CTRL submenu (mode/zoom/center)
                          │  │  │  │  └───────→ INV (§7.9)
                          │  │  │  └──────────→ SPLBK (§7.8)
                          │  │  └─────────────→ LOG (§7.7)
                          │  └────────────────→ COMBAT (§7.6)
                          └───────────────────→ SHEET (§7.5)
                                                  │
                                                  │ internal tab cycle (tap)
                                                  ▼
                          ┌─────────────────────────────────────┐
                          │ SHEET tabs:                          │
                          │ [▶MAIN]→[SKILLS]→[INV]→[SPELLS]      │
                          │       →[FEATS]→[BIO]→ cycle          │
                          └─────────────────────────────────────┘

         ALL OVERLAYS (size=panel)
         ┌──────────────────────────────────────┐
         │ tap×2 (double-tap) → close → MAIN_MAP│
         │ over-scroll → reopen QUICK_ACTION    │
         │   (allows jumping to another overlay │
         │    without going back to map first)  │
         └──────────────────────────────────────┘

  ─────────────────────────────────────────────────────────────────
                    V2 OPTIONAL (foundry-mcp loaded)
  ─────────────────────────────────────────────────────────────────

  External MCP client (Claude Desktop, Claude Code, etc.) captures
  audio + runs LLM tool call via foundry-mcp → bridge → Foundry.
  Result appears on G2 as a transient TOAST BANNER over MAIN_MAP
  (auto-dismiss after 3 sec). No on-device modal in V2 default.

  Future (post-V2, deferred):
   - VOICE modal (§7.10) — only if G2 hosts audio capture directly
   - CLARIFY modal (§7.11) — only if AI needs on-device disambig
```

#### 7.14.2 Button Mapping per Schermata

| Schermata | Tap singolo | Tap doppio | Scroll su/giù | Over-scroll (↑ al top) |
|---|---|---|---|---|
| **BOOT** | — | — | — | — |
| **MAIN_MAP** | ping cella sotto cursore | **EXIT** root (`shutDownPageContainer(1)`) | pan mappa | apri **Quick Action** |
| **QUICK_ACTION** | attiva opzione highlighted | cancel → MAIN_MAP | cicla highlight | (già al top: no-op) |
| **SHEET** (qualunque tab) | **cicla tab** Main→Skills→Inv→Spells→Feats→Bio | close → MAIN_MAP | naviga contenuto del tab | apri **Quick Action** |
| **COMBAT** | cicla quick-action `[A][S][I][M]` (tap su highlight = esegui su target) | close → MAIN_MAP | cicla iniziativa (target select) | apri **Quick Action** |
| **LOG** | espandi dettaglio evento highlighted | close → MAIN_MAP | scroll storia (older/newer) | apri **Quick Action** |
| **SPELLBOOK** | **Action Options** sullo spell highlighted (cast / target) | close → MAIN_MAP | cicla spell | apri **Quick Action** |
| **INVENTORY** | **Action Options** sull'item highlighted (use / equip) | close → MAIN_MAP | cicla item | apri **Quick Action** |
| **MAP CTRL submenu** | seleziona azione (toggle mode / zoom / center) | cancel → MAIN_MAP | cicla opzione | apri **Quick Action** |
| *VOICE (V2)* | cancel recording | — | — | — |
| *CLARIFY (V2)* | confirm option | cancel → MAIN_MAP | cicla option | apri **Quick Action** |

**Regola di consistenza** (ADR-0012):
- **Tap doppio = EXIT/back** — sulla root (MAIN_MAP) chiama `bridge.shutDownPageContainer(1)` (exit dialog); negli overlay chiude e torna a MAIN_MAP; nei modal cancella.
- **Over-scroll (swipe-up al top boundary) = apri Quick Action** — da MAIN_MAP e da ogni overlay; cross-overlay senza tornare alla mappa.
- **Scroll = navigazione** — pan mappa, lista item, storia eventi.
- **Tap = primary** — cicla opzione/tab oppure esegue l'azione primaria del panel (Action Options su Spellbook/Inventory).

#### 7.14.3 Combat Overlay Quick-Action `[A][S][I][M]`

Dentro Combat overlay, tap cicla l'highlight tra le 4 quick-action:

| Quick-action | Effetto al tap sull'highlight |
|---|---|
| `[A]ttack` | esegue attacco con weapon main-hand su target highlighted (scroll seleziona target prima) |
| `[S]pell` | apre **SPELLBOOK** overlay (cross-navigation, mantiene combat target) |
| `[I]tem` | apre **INVENTORY** overlay |
| `[M]ove` | entra in **map control mode**: scroll = direzione, tap = commit move, tap×2 = cancel |

#### 7.14.4 Verification Checklist (10×)

| # | Check | Stato |
|---|---|---|
| 1 | BOOT esce automaticamente verso MAIN_MAP dopo handshake. Nessun input richiesto. | ✓ |
| 2 | Ogni overlay (Sheet/Combat/Log/Spellbook/Inventory) raggiungibile da MAIN_MAP via Quick Action menu. | ✓ |
| 3 | Ogni overlay si chiude via tap-doppio → torna a MAIN_MAP. | ✓ |
| 4 | Nessuna schermata è dead-end. Da qualunque overlay c'è sempre un percorso a MAIN_MAP (tap-doppio diretto, oppure Quick Action → cancel). | ✓ |
| 5 | Status HUD persistente visibile durante MAIN_MAP e tutti gli overlay `size=panel`. | ✓ |
| 6 | Status HUD nascosto durante modal `size=modal` (Quick Action, V2 Voice/Clarify) — focus totale sull'azione. | ✓ |
| 7 | Sheet 6 tab tutti raggiungibili via cycle (tap singolo) — nessuno isolato. | ✓ |
| 8 | Quick Action menu cancellabile via tap-doppio senza side effects. | ✓ |
| 9 | Over-scroll (swipe-up al top boundary) apre Quick Action da ogni schermata; tap = azione primaria del panel (vedi tabella §7.14.2). | ✓ |
| 10 | Cross-overlay navigation (es. da Combat → Spellbook senza passare da MAIN_MAP) supportata via over-scroll → Quick Action → tap nuova destinazione. | ✓ |
| 11 | **INV-1 Layout integrity — corner alignment**: snapshot test verifica che `┌ ┐ └ ┘` (e variant doppia) di ogni overlay siano sulla **stessa colonna** dal top al bottom in ogni stato (idle/loading/error/disconnect). Diff atteso = 0. | ✓ |
| 12 | **INV-1 Layout integrity — variable-content stress**: snapshot test con HP `7` / `70` / `700` / `7000`, nome PG `4ch` / `8ch` / `16ch` / `20ch` (truncate `…`), conditions `0` / `4` / `7` (overflow `+N`) — Status HUD occupa sempre col 70-95 row 1-21. | ✓ |
| 13 | **INV-1 Layout integrity — tab strip equal-width**: ogni tab dello Sheet (Main/Skills/Inv/Spells/Feats/Bio) ha **stessa larghezza char-count** in entrambi gli stati `[ XXX ]`/`[▶XXX ]`; toggle non shifta gli adiacenti. | ✓ |
| 14 | **INV-1 Layout integrity — i18n stress**: snapshot test con catalogo IT ed EN per ogni view; stringhe IT più lunghe rispettano `max-width` per chiave; fallback EN se eccede; layout invariato. | ✓ |
| 15 | **INV-1 Layout integrity — layer-engine contract**: nessun panel costruisce stringhe ASCII concatenate; tutti emettono `Box`/`TextRun` tree (lint check) — la spec §7.1a.7 è verificabile via static analysis. | ✓ |

#### 7.14.5 Edge Cases

| Caso | Comportamento |
|---|---|
| Bridge disconnesso | MAIN_MAP mostra `⚠ SYNC LOST` in header. Last cached state preservato in read-only. Quick Action disabilita opzioni write (cast, use, attack); apribili solo Sheet/Log per consultazione. |
| Foundry offline (server) | Stesso del bridge disconnesso. |
| R1 ring disconnesso | Header mostra `⌁ R1 DISC`. Input bloccato (no fallback su gesture G2 native nel MVP). Boot ritorna a setup ring pairing. |
| Nessun character selezionato | Boot blocca su prompt setup; richiede selezione character via Foundry settings server-side (no UI G2 in MVP). |
| Crash overlay (errore render) | App ritorna a MAIN_MAP automaticamente; log error event in `error.*` telemetry; toast banner notifica utente. |
| BLE saturato (raster mode) | Frame skip: priorità a state delta > raster delta. Toast warning se p99 latency > 3 sec. |

#### 7.14.6 Settings UI — Tre superfici di configurazione

**Decisione MVP**: nessun input testuale sul G2 (no virtual keyboard, vincolo hardware §3.1). Le configurazioni vivono su **tre superfici distinte**, ognuna con un ruolo netto:

| # | Surface | Cosa vive qui | Esempi | Storage |
|---|---|---|---|---|
| 1 | **Foundry world settings** (server-side) | Settings world-scope condivise tra tutti i giocatori | dither algo default, polling rate, voice provider preferito V2, dual-edition `core.modernRules`, dnd5e config | `world.settings` Foundry, hot-reload via `config.update` event (§5.6.5) |
| 2 | **Even Realities App phone settings** (per-plugin) | Connection bootstrap + identità device — input testuale necessario | Bridge URL, auth token (paste/QR), player/character selection, connection profile, auto-connect | Phone persistent storage managed dall'Even Realities App (§3.8). Vedi mockup §7.14.7 |
| 3 | **G2 device-local runtime overrides** (gesture-only) | Toggle binari/enum gesture-friendly che NON richiedono testo | Mode toggle glyph↔raster (`[M]` Map ctrl), Language override (`[N]`), eventuali futuri toggle V2 | LRU localStorage WebView phone, device-scoped (§11.5.5) |

**Regole di assegnazione** (decision tree per dove mettere una nuova setting):

```
Need text/URL/secret input? ──yes──▶ Even Realities App settings (#2)
              │
              no
              ▼
Affects all players in the world? ──yes──▶ Foundry world settings (#1)
              │
              no (per-device runtime preference)
              ▼
Gesture-friendly toggle on G2? ──yes──▶ G2 device-local override (#3)
              │
              no (rare combo)
              ▼
       Even Realities App settings (#2 fallback)
```

**Implicazioni di INV-3 (doc coherence)**: ogni nuova setting deve essere documentata nella superficie che ospita, con cross-ref. Non duplicare; se serve in due posti, usare `#2 phone-side` come canonical.

#### 7.14.7 Phone-Side Configuration UI (Even Realities App)

> Surface canonica per **connection-bootstrap settings** (§3.8). HTML form renderizzato nel WebView del plugin sul telefono — **non** sul G2 — quando l'utente apre l'app evenfoundryvtt dall'Even Realities App. Risolve il chicken-and-egg "G2 senza tastiera, ma serve URL+token per connettersi a Foundry".

##### 7.14.7.1 Mockup wizard first-run (phone WebView)

```
┌───────────────────────────────────────────────────────────────────┐
│  EvenFoundryVTT — Setup                                       ✕   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Welcome. Connect your G2 to a Foundry VTT session.               │
│                                                                   │
│  ─────────────────────────────────────────────────────────────    │
│                                                                   │
│  STEP 1 / 3 · Connection profile                                  │
│                                                                   │
│  ◉ Homelab (LAN)        ○ Cloud bridge        ○ Local dev         │
│                                                                   │
│  Bridge URL                                                       │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │ https://homelab.lan:8910                                │      │
│  └─────────────────────────────────────────────────────────┘      │
│  ⓘ HTTPS in production. Domain must be in app.json whitelist.    │
│                                                                   │
│  ─────────────────────────────────────────────────────────────    │
│                                                                   │
│  STEP 2 / 3 · Auth token                                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │ evf_•••••••••••••••••••••••••                          │      │
│  └─────────────────────────────────────────────────────────┘      │
│                                                                   │
│  [ Paste from clipboard ]                                         │
│                                                                   │
│  i  Copy the token in Foundry: Settings -> EvenFoundryVTT ->      │
│     "Pair a G2 device", then paste it here (24h validity).        │
│                                                                   │
│  ─────────────────────────────────────────────────────────────    │
│                                                                   │
│  STEP 3 / 3 · Character                                           │
│                                                                   │
│  ✓ Connected to "Homebrew 2024" · paired as user "aiacos"         │
│                                                                   │
│  Your characters (scoped to your Foundry user — ADR-0014):        │
│  ◉ Artemis            (Ranger 10)                                 │
│  ○ Dante Lanzulli     (Wizard 10)                                 │
│  ○ Karius Frede       (Paladin 10)                                │
│  ○ Shin               (Rogue 10)                                  │
│                                                                   │
│  ☑ Auto-connect when G2 is worn                                   │
│                                                                   │
│  ─────────────────────────────────────────────────────────────    │
│                                                                   │
│              [ Back ]              [ Save & connect ▶ ]           │
└───────────────────────────────────────────────────────────────────┘
```

**Note di rendering** (questo è il phone WebView, NON G2):

- Layout responsive standard (no constraint 96×24 char). Può usare HTML/CSS/flex normale.
- Stile coerente con resto del plugin (phosphor-green su sfondo scuro) per continuità visiva con il G2 HUD, ma free-form.
- Testo input via tastiera virtuale del phone (iOS/Android native).
- **Nessuno scan QR**: la piattaforma Even Hub non espone API fotocamera/QR-scan alle app (canonica `hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*). Il token si trasferisce via **copia** (PairModal Foundry) → **incolla** (questo wizard). Resta disponibile la tastiera virtuale per l'inserimento manuale.

##### 7.14.7.2 Worked example bootstrap (zero → connesso)

1. **User**: installa l'app EVF via Even Hub (dev: `evenhub qr` → l'Even Realities App carica l'**URL del plugin-host**; prod: install dall'app store Even Hub dopo review del `.ehpk`).
2. **User**: apre "EvenFoundryVTT" dalla home dell'Even App → WebView fetcha plugin URL.
3. **Plugin**: detect first-run (`localStorage["evf:bridge_url"] == null`) → render setup wizard §7.14.7.1.
4. **User**: seleziona profilo "Homelab", incolla `https://homelab.lan:8910`.
5. **User (DM)**: apre Foundry sul desktop, va in **Settings → EvenFoundryVTT module → "Pair a G2 device"** → genera token 24h → il PairModal mostra **bridge URL + token copiabili** (token nascosto di default, con toggle Mostra/Copia).
6. **User**: copia il token dal PairModal e lo **incolla** nel wizard sul phone (tap "Paste from clipboard").
7. **Plugin**: chiama `GET /v1/characters` con bearer → bridge risponde con la lista **filtrata agli attori di cui l'utente accoppiato è OWNER** (ADR-0014: niente più roster globale).
8. **User**: seleziona "Shin", checkbox "Auto-connect when G2 worn".
9. **Plugin**: persiste settings phone-side, dismissa wizard, mostra status "Pronto. Indossa il G2 per iniziare".
10. **User**: indossa G2 → Even Realities App detecta wear (via `bridge.onWear`) → riapre plugin auto → handshake completo → render HUD §7.4.

**Latenza target end-to-end** primo setup: ≤90 sec dall'apertura dell'app (post-install) al primo HUD on-glasses.

##### 7.14.7.3 Foundry module — pair-G2 flow

Per chiudere il loop, il modulo Foundry `evenfoundryvtt` espone in **Settings UI Foundry desktop**:

```
Foundry — Game Settings → Module Settings → EvenFoundryVTT
─────────────────────────────────────────────────────────
[ Pair a G2 device ▼ ]

When clicked:
  1. Generate opaque bearer token (32 byte random, 24h TTL)
  2. Persist token in user's foundry profile (server-side); the
     bridge_url + world are provisioned to the bridge with the token
  3. Display the credentials as COPYABLE TEXT (no QR — the Even Hub
     platform exposes no camera/QR-scan API to apps):
       Bridge URL : https://homelab.lan:8910   [ Copy ]
       Token      : ••••••••••••••••••••••••   [ Reveal ] [ Copy ]
     (token masked by default; revealed only on explicit Reveal)
  4. Countdown shows remaining TTL; Refresh regenerates with 60s grace
  5. Log pairing event in module event-log (audit trail)

Existing pairings:
  • iPhone Lorenzo · Thorin · paired 2026-05-08 · expires 2026-05-09
    [ Revoke ]
  • iPhone Lyra · Lyra Brightleaf · paired 2026-05-09 · expires 2026-05-10
    [ Revoke ]
```

Auth token in §11.5.4: il bearer è trasferito via **copia (PairModal Foundry) → incolla (wizard phone)**. Il QR-provisioning è irrealizzabile perché la piattaforma Even Hub non espone fotocamera/QR-scan alle app (`hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*). Per compromesso sicurezza il token è **nascosto di default** nel PairModal con toggle Mostra/Copia; non viene mai loggato. Il foundry-module mantiene un registro pairing per revoca.

##### 7.14.7.4 Edge cases

| Caso | Comportamento |
|---|---|
| Bridge URL irraggiungibile | Wizard step 3 mostra "❌ Cannot reach bridge — check URL and network whitelist". Step Save disabilitato. |
| Token expired/revoked | Plugin runtime mostra `⌁ AUTH EXPIRED` in header HUD G2 + toast on phone "Re-pair from Foundry". Auto-reopen wizard al prossimo open plugin. |
| Token whitelist mismatch | Foundry bridge restituisce 403 → wizard mostra "Token not authorized for this world. Re-pair from Foundry." |
| Multi-device same character | Foundry module registra pairing distinte; nessun conflitto. Però **HP/state** sono shared → due G2 mostrano stessa view. |
| Clipboard non disponibile (permission denied) | Fallback: il token resta selezionabile nel PairModal per copia manuale; inserimento manuale via tastiera virtuale sempre disponibile. |
| User cambia phone | Re-installa l'app via Even Hub, re-incolla bridge URL + token dal PairModal Foundry. Settings phone-side perse. Foundry pairings storiche revocabili da DM. |
| G2 viene tolto durante sessione | `bridge.onWear(false)` → plugin entra in "standby" mode (nessuna BLE op), auto-resume on wear. Settings preservate. |

---

### 7.15 Dice & Roll Result Display

#### 7.15.1 Due approcci

Due opzioni per mostrare risultati di tiri (skill check, attack roll, damage, save):

**Approccio A — Result Toast (raccomandato MVP)**: pop-up compatto in basso-centro che mostra il risultato finale con icone, niente animazione 3D. Auto-dismiss in 3 sec.

**Approccio B — Dice So Nice raster stream (V2 stretch)**: cattura l'animazione 3D del plugin [Dice So Nice!](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) di Foundry, downsample + dither + stream a image container come sequenza di frame.

#### 7.15.2 Approach A — Result Toast (MVP)

Mockup:

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║ MAP · Sala Banchetti                              ROUND 3 · TURN 2/5            ⌁ R1 92%  ║
╠══════════════════════════════════════════════════════════════════════╦══════════════════╣
║                                                                      ║ THORIN  F3/W5    ║
║                          ┌──── 🎲 ROLL RESULT ─────┐                 ║ ──────────────── ║
║   ░░░░▒▒▒▒░░░░░░░░░     │                          │ ░░░░░░░░       ║ HP ████████░░    ║
║   ░░░░░░░░░░g1░░░░░     │  ⚔  THORIN  attacks     │ ░░░░░░░░       ║    45/68  +10t   ║
║   ░░░░░░░░░░░░░░░░     │     Goblin Archer        │ ░░░░░░░░       ║ AC 18  SPD 30    ║
║   ░░░░░░░@▶░░░░░░░     │                          │ ░░g2░░░░       ║                  ║
║   ░░░L░░░░░░░░░░░░     │  ⚀ d20 + 5 = 23  vs AC 13│ ░░░░░░░░       ║ Act ▓  Bns ░  R░ ║
║   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │  ───────────────────────  │ ▓▓▓▓▓▓▓▓       ║ Move 30/30       ║
║                         │  ✔  HIT                  │                 ║                  ║
║   @ YOU ▶ E             │                          │                 ║ Slots            ║
║                         │  ⚔ damage 1d8 + 3 = 12  │                 ║   1° ▓▓░░ 2/4    ║
║                         │     slashing             │                 ║   2° ▓░░  1/3    ║
║                         │                          │                 ║   3° ░░   0/2    ║
║                         │  auto-dismiss 3 sec      │                 ║                  ║
║                         └──────────────────────────┘                 ║                  ║
╠══════════════════════════════════════════════════════════════════════╩══════════════════╣
║ R1: tap=dismiss  scroll=hold  long=quick                  [sheet] [combat] [log] [spell]  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

Caratteristiche:

- **Posizione**: centro basso, sopra la mappa, sotto il status HUD
- **Dimensioni**: ~30 char × 8 row (~180×96 px)
- **Contenuto**:
  - Riga 1: icona azione + actor + verb + target (`⚔ THORIN attacks Goblin Archer`)
  - Riga 2: formula tiro + risultato + DC/AC (`⚀ d20 + 5 = 23 vs AC 13`)
  - Divider
  - Riga 3: outcome (`✔ HIT`, `✕ MISS`, `⚆ CRIT`, `⚇ FUMBLE`, `✔ PASS`, `✕ FAIL`)
  - Riga 4: damage formula (se applicabile) + tipo
  - Footer: timer auto-dismiss
- **Container**: 1 text container (full ASCII), capture passa al toast finché visibile
- **Tap = dismiss precoce**, **scroll = pause auto-dismiss** (utile per leggere durante azioni rapide), **long = Quick Action**

**Latency MVP**: <200 ms da chat-card hook a toast visibile sul G2.

#### 7.15.3 Approach B — Dice So Nice raster stream (V2 stretch)

[Dice So Nice!](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) renderizza dadi 3D fisicamente animati via Three.js sopra il canvas Foundry. È pesante ma molto suggestivo. Per portarlo sul G2:

##### Pipeline (riusa §7.4b.4 raster pipeline)

```
1. Foundry hook diceSoNiceRollStart fired
   → bridge inizia capture sequence

2. ogni 200 ms (5 fps) per ~2 sec totali:
   - canvas.app.renderer.extract da DSN canvas overlay
   - resize 200×100, greyscale, Floyd-Steinberg dither
   - tile 200×100 (1 image container)
   - encode PNG indexed-palette (~3 KB / frame)
   - push WS → BLE → updateImageRawData

3. hook diceSoNiceRollComplete fired
   → bridge invia frame finale + risultato come Toast (Approach A)
   → image container clear

Total: 10 frames × 3 KB = 30 KB / roll ≈ 6 KB/s for 2 sec
BLE budget: OK (sotto 25 KB/s real-world)
```

##### Verifica fattibilità

| Aspetto | Status |
|---|---|
| Foundry expose DSN render layer? | ✓ DSN ha `game.dice3d.show()` API e canvas dedicato (verificare in Phase 0 esatto path) |
| DSN hooks per start/complete? | ✓ `diceSoNiceRollStart`, `diceSoNiceRollComplete` documentati |
| BLE bandwidth per 5 fps × 2 sec? | ✓ ~6 KB/s rientra nel budget |
| G2 image container update rate sostenibile? | ⚠ Open question Phase 0 (firmware queue?) |
| Battery cost per roll | ⚠ Stimato ~3-5% drain extra per ora di gameplay con DSN attivo |
| Dithering preserve dice readability? | ⚠ Da test empirico — i dadi 3D hanno texture e numeri piccoli |

##### Decisione

- **MVP**: Approach A (toast). Funziona sempre, nessuna dipendenza da DSN, latency minima.
- **Phase 13 V2 stretch**: Approach B opt-in via setting `view.diceSoNice.enabled` (default off). Field-test guidato; abbandonato se Phase 0 verifica rivela problemi (firmware queue, illeggibilità dadi).
- **Compatibilità**: Approach B coesiste con Approach A — il Toast appare sempre con il risultato finale; l'animazione 3D è additiva. Disabilitare DSN streaming non rompe nulla.

---

### 7.13 Interaction Model (riassunto)

> **Riferimento canonico**: la mappatura completa di tutti i gesti R1 per ogni schermata vive in **§7.14.2 Button Mapping per Schermata**. La sezione che segue è un riassunto di alto livello.

**Regole macro** (in ordine di priorità):

1. **Tap doppio = "indietro"**: chiude qualsiasi overlay/modal e torna a MAIN_MAP.
2. **Long-press = context-sensitive**:
   - in MAIN_MAP → apre **Quick Action menu** (§7.13a)
   - in overlay panel → esegue azione del panel (cast, use, equip, ecc.)
   - in modal → cancel/dismiss
3. **Tap singolo = primary cycle**: cicla tab (Sheet), opzione (Quick Action), quick-action (Combat), o attiva l'item highlighted (Spellbook/Inventory).
4. **Scroll = navigazione**: pan mappa, lista item, storia eventi, opzioni modal.

**Footer chip-bar**: visualizza il panel attivo (es. `[▶sheet] [combat] [log] [spell] [inv]`) come breadcrumb **read-only** — non è un'area di tap perché solo 1 container ha capture. Per cambiare panel: tap-doppio per uscire → over-scroll (swipe-up al top) per Quick Action → tap nuovo panel. Cross-overlay rapido: over-scroll dentro un overlay apre Quick Action senza chiudere prima.

Per il dettaglio per-schermata e la verifica di reachability, vedere **§7.14**.

---

### 7.16 Localization & Internationalization (i18n)

> Predisposizione **multilingua dal MVP**, con sorgente di verità Foundry e override runtime sul G2. Implementa l'eccezione user-side §7.14.6 #2 e l'INV-3 (doc coherence — i cataloghi seguono la stessa disciplina della spec).

#### 7.16.1 Architettura — 3 layer

```
        ┌────────────────────────────────────────────────────────────┐
  z=0   │  Foundry locale  (game.i18n.lang, source of truth)         │
        │  • dnd5e ufficiale: en/de/es/fr/it/ja/ko/pl/pt-BR/ru/zh-CN  │
        │  • setting Foundry: core.language                          │
        └──────────────┬─────────────────────────────────────────────┘
                       │ broadcast at boot + on change
                       ▼
        ┌────────────────────────────────────────────────────────────┐
  z=1   │  Bridge i18n service                                        │
        │  • catalogs proxied: dnd5e + evenfoundryvtt + plugin panels │
        │  • normalized BCP-47 codes                                  │
        └──────────────┬─────────────────────────────────────────────┘
                       │ WS push: { foundry, available[] }
                       ▼
        ┌────────────────────────────────────────────────────────────┐
  z=2   │  G2 i18n runtime                                           │
        │  • effective = override ?? foundry  (LRU per-device)        │
        │  • render via t(key, vars) — no string concat in views      │
        │  • [N] Language Quick Action → choose override             │
        └────────────────────────────────────────────────────────────┘
```

**Single source of truth**: i cataloghi vivono in Foundry (dnd5e + module languages). Il G2 **non porta cataloghi propri** — li riceve dal bridge al boot. Aggiornare un termine = aggiornare il catalogo Foundry, niente sync drift G2-side.

#### 7.16.2 Locale resolution (boot + runtime)

1. **Boot**: bridge legge `game.i18n.lang` dal modulo Foundry → push handshake `{ locale: { foundry: "it", available: ["en","it","de",…] } }` al G2.
2. **G2 carica override** da LRU storage (chiave `i18n.override`, default `null`).
3. **Effective locale** = `override ?? foundry`. Tutte le `t(key)` usano questo.
4. **User toggle**: `[N]` Quick Action → list-modal con `available[]` → tap → setLocale → re-render.
5. **Foundry GM cambia `core.language`** durante la sessione → push event → se override è `null`, hot-reload UI; se override esiste, mantiene override e mostra hint footer `🌐 it (DM:en)`.

#### 7.16.3 Quick Action — `[N] Language` submenu

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                              ◈  LANGUAGE                                                   ║
║                                                                                           ║
║                       ▶ [ • ]  Auto (Foundry: it)                                         ║
║                         [ ◦ ]  English        (en)                                        ║
║                         [ ◦ ]  Italiano       (it)                                        ║
║                         [ ◦ ]  Deutsch        (de)                                        ║
║                         [ ◦ ]  Español        (es)                                        ║
║                         [ ◦ ]  Français       (fr)                                        ║
║                         [ X ]  Cancel                                                     ║
║                                                                                           ║
║                              R1 scroll=select  tap=apply  long=cancel                     ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

- `[ • ]` indica selezione effettiva (Auto = nessun override, segue Foundry).
- Lista filtrata da `available[]` — solo locale che il modulo Foundry o dnd5e supportano (no fallback a inglese mascherato).
- Switch è **hot-reload** — re-render senza riavvio. Layout invariato (vedi INV-1 §0.1 + §7.1a.2: stringhe IT più lunghe rispettano `max-width` per chiave; fallback EN se eccede).

#### 7.16.4 String-table contract (per chi scrive panel)

- Ogni view (`src/panels/*/view.js`) usa `t("ns.key", vars)` — **mai** literal in lingua.
- Naming chiavi: `<panel>.<element>.<sub>` (es. `combat.tracker.round`, `sheet.tab.spells`).
- Cataloghi vivono in `lang/<bcp47>.json` del modulo Foundry `evenfoundryvtt` (registrati via `manifest.languages`).
- Override per dnd5e: termini riusati direttamente da `dnd5e.*` (es. `DND5E.SpellLevel1` → "1° livello" / "1st Level"). No duplicazione.
- **Width budget per chiave** (vedi §7.1a.2): ogni chiave ha `_max` pair (es. `combat.tracker.round_max: 12`). Build step (Phase 4 task) verifica per ogni locale `string.length ≤ _max`. Fallback EN se viola.
- **Numeri/date**: format via `Intl.NumberFormat` / `Intl.DateTimeFormat` con `effective` locale, **mai** concat manuale.

#### 7.16.5 Locale set MVP

| Locale | Status MVP | Source |
|---|---|---|
| `en` | ✓ canonical (fallback ovunque) | dnd5e built-in + evenfoundryvtt strings |
| `it` | ✓ MVP target | dnd5e community (verificare upstream) + evenfoundryvtt strings |
| `de`, `es`, `fr`, `pt-BR` | ⏳ best-effort (Foundry/dnd5e ufficiali) | dnd5e ufficiale, evenfoundryvtt fallback EN |
| altri (`ja`, `ko`, `zh-CN`, `pl`, `ru`) | ⏳ V2 stretch | dnd5e ufficiale, evenfoundryvtt comunity contribution |

**Verifica upstream** (INV-2): la lista `dnd5e` ufficiale è citata da `github.com/foundryvtt/dnd5e/tree/master/lang` — re-checkare in pre-Phase 0.

#### 7.16.6 Edge cases

| Caso | Comportamento |
|---|---|
| Foundry locale = lingua non in `available[]` | bridge fallback EN, log warning, hint footer `⚠ locale unsupported, fallback en` |
| Override = lingua scomparsa (catalogo rimosso da Foundry) | clear override automatico, fallback a foundry locale + toast notify |
| Stringa missing in catalogo locale | fallback EN per quella key (no UI broken); telemetry event `i18n.missing` |
| Stringa eccede `_max` width budget | truncate `…` + telemetry event `i18n.overflow`; layout INV-1 garantito |
| Switch durante overlay aperto | re-render in-place, mantiene focus; nessuna chiusura panel |
| RTL languages (Arabic, Hebrew) | NON supportate MVP (G2 firmware monospace LTR-only); marcato V2 stretch + ADR-0007 |

**Verifica**: §7.14.4 ck 14 (i18n stress test).

#### 7.16.7 Settings schema (estensione §5.6.5)

```json
{
  "i18n": {
    "override": {
      "type": ["string", "null"],
      "default": null,
      "description": "BCP-47 locale code, null = inherit Foundry game.i18n.lang",
      "scope": "device-local",
      "available_source": "bridge.i18n.available"
    },
    "fallback": {
      "type": "string",
      "default": "en",
      "description": "Catch-all when key missing in effective locale"
    }
  }
}
```

Settings i18n sono **device-local** (LRU per-device, non world-scope) — ogni paio di occhiali può avere override diverso pur condividendo lo stesso world Foundry.

---

## 8. Voice Interaction — Worked Examples (V2 OPZIONALE)

> **Non parte del MVP**. Questi esempi descrivono il comportamento atteso quando il modulo `foundry-mcp` (§5.7) è attivo e il giocatore usa un client MCP (es. Claude Desktop) come push-to-talk frontale. I tool chiamati sono gli stessi del Tool Registry §5.3 — nel MVP sono invocati manualmente dal G2 panel; in V2 dall'LLM via MCP.

### 8.1 Esempio A — Fireball su gruppo

**Player** (Quick Action via over-scroll → Voice): *"Vedo un grosso gruppo di goblin in avvicinamento, mi preparo ad attaccarli con palla di fuoco e brucio quei bastardi."*

**STT output** (`~250 ms`): testo plain.

**Scene context iniettato nel system prompt**:
- Player: Thorin (Fighter Champion L3 / Wizard L5 — multiclass total L8, prof +3, caster level 5 sblocca slot 3° per Fireball)
- Visible tokens: 3 goblin a (1050, 650), (1080, 680), (1100, 660) — grouping detectato (raggio 15 ft)
- Spell slots disponibili: 3rd × 3, 2nd × 2, 1st × 4
- Action economy: action libera

**LLM tool call** (Sonnet 4.6, ~600 ms):

```json
{
  "tool": "cast_spell",
  "input": {
    "spell_id": "spell.fireball",
    "slot_level": 3,
    "targets": { "type": "template", "x": 1080, "y": 670, "shape": "sphere", "radius_ft": 20 },
    "concentration_drop": false
  }
}
```

**Bridge esegue su Foundry** (`~150 ms`):

```javascript
const item = actor.items.get(spell_id);
const activity = item.system.activities.find(a => a.type === "cast");
const template = await AbilityTemplate.fromActivity(activity);
template.document.updateSource({ x: 1080, y: 670 });
const placed = await template.document.parent.createEmbeddedDocuments("MeasuredTemplate", [template.document]);
const inside = MeasuredTemplate.getTokensInTemplate(placed[0]);
await MidiQOL.completeActivityUse(activity, {
  targetUuids: inside.map(t => t.uuid),
  consume: { spellSlot: 3 }
});
```

**Foundry chat card** generata, dadi tirati, save risolti, danni applicati. **Hooks** triggerano update a tutti i client incluso `evenfoundryvtt`.

**G2 mostra Voice State 3** (Executing) con i risultati streaming, poi torna a Combat HUD aggiornato.

**Latency totale target**: ~1.2 s.

### 8.2 Esempio B — Dual-wield Action + Bonus Action

**Player** (Quick Action via over-scroll → Voice): *"Sono circondato da due nemici a destra e sinistra: attacco con la spada corta lo skeleton a sinistra cercando di perforargli il cuore, e con la scimitarra il goblin a destra per tagliargli la gola."*

**Scene context**:
- Player: Thorin (Rogue/Fighter, dual-wielder, light weapons OK)
- Thorin position: (800, 800)
- Visible tokens entro 5 ft: skeleton a (770, 800) (W, ~5ft), goblin a (830, 800) (E, ~5ft)
- Equipped: Shortsword (main), Scimitar (off-hand) — entrambe armi **Light**, requisito TWF
- Action economy: Action + Bonus disponibili
- **Two-Weapon Fighting Style** (PHB p.72, NON un feat — il feat è "Dual Wielder"). Senza questo Fighting Style, l'attacco bonus action **NON aggiunge il modificatore** alla damage del off-hand
- ⚠ Nota gameplay: Thorin in §7.5.6 ha Fighting Style **Defense**, non TWF — quindi nell'esempio l'off-hand scimitar damage è puro `1d6` senza STR mod. Per riprodurre l'esempio con TWF style attivo serve retraining

**LLM tool call** (chained, due call sequenziali):

```json
[
  {
    "tool": "weapon_attack",
    "input": {
      "weapon_id": "wpn.shortsword",
      "target_id": "tok.skeleton",
      "action_type": "action",
      "advantage": "auto",
      "narrative_intent": "pierce the heart"
    }
  },
  {
    "tool": "weapon_attack",
    "input": {
      "weapon_id": "wpn.scimitar",
      "target_id": "tok.goblin",
      "action_type": "bonus",
      "advantage": "auto",
      "narrative_intent": "slash the throat"
    }
  }
]
```

**Bridge esegue 2 activity.use() in sequenza**:

```javascript
for (const call of toolCalls) {
  const item = actor.items.get(call.input.weapon_id);
  const activity = item.system.activities.find(a => a.type === "attack");
  await MidiQOL.completeActivityUse(activity, {
    targetUuids: [call.input.target_id],
    midiOptions: {
      workflowOptions: { autoRollAttack: true, autoFastForward: true }
    }
  });
}
```

**Note di gameplay**: il "narrative_intent" è solo flavor — il sistema D&D 5e non modella critici-precisi-al-cuore; il critico è già parte del d20. L'intent va in chat narrativa per il GM.

**G2 Voice State 3** mostra le due righe sequenziali:

```
SHORTSWORD vs Skeleton    → 18 vs AC 13  HIT  → 7 piercing
SCIMITAR (bonus) vs Goblin → 22 vs AC 14  HIT  → 6 slashing
```

**Latency**: ~1.5 s totale (un tool-call streaming, due activity.use sequenziali).

### 8.3 Esempio C — Ambiguity con clarify

**Player**: *"colpisco il goblin con l'arco"*

**Scene**: 3 goblin visibili, Thorin ha sia Shortbow che Longbow.

**LLM tool call**:

```json
{
  "tool": "clarify",
  "input": {
    "question": "Quale goblin e quale arco?",
    "options": [
      { "id": "g1+sb", "label": "Goblin Archer (NE 30ft) con Shortbow" },
      { "id": "g1+lb", "label": "Goblin Archer (NE 30ft) con Longbow" },
      { "id": "g2+sb", "label": "Goblin Brute (E 40ft) con Shortbow" },
      { "id": "g2+lb", "label": "Goblin Brute (E 40ft) con Longbow" }
    ]
  }
}
```

**G2** mostra **Clarify Overlay (§7.11)**. R1 scroll seleziona, tap conferma. Selezione re-iniettata come secondo turn LLM o eseguita direttamente.

---

## 9. Privacy & Security

- **Audio** non lascia mai la LAN nel modello "homelab" (STT locale via distil-whisper). Default cloud richiede consenso esplicito.
- **Auth** bridge: token bearer per-player, derivato dalla sessione Foundry (rotazione 24 h).
- **Rate limit**: 10 req/s per token; audio max 30 s per request.
- **CORS**: bridge whitelista solo l'origin del plugin G2.
- **Secrets**: API key STT/LLM solo in `.env` del bridge, mai esposte al G2.
- **Foundry permission boundary**: il bridge non può impersonare il GM. Operazioni GM-only vanno via `socketlib.executeAsGM` con audit log.
- **Biometrics R1**: HR/HRV restano sul ring/smartphone del giocatore; non vengono mai spedite al bridge senza opt-in esplicito.

---

## 10. Roadmap (Aggiornata v0.9 — 15 fps target + dual-edition support)

> **MVP** = Phase 0–10 (HUD + R1 + manual action) → **13 settimane** (Week 0 + Week 1-13 implementation). **V2 opzionale** = Phase 11+ (voice via MCP + stretch features) → 14-16 weeks.

### 10.0 Phase 0 Validation Protocol — gating tests

Phase 0 è la **bottiglia critica**: senza queste validazioni il design Phase 1+ è speculativo. Ogni test produce un **GO/NO-GO + metric misurato**, alimenta una decisione binaria.

#### 10.0.1 Test R1 SDK Events

**Procedura**:
1. Even Hub developer access ottenuto (timeline stimata: 1-2 settimane request → grant)
2. Plugin sample che logga ogni evento R1 ricevuto via callback al G2 plugin
3. User esegue gesture sequence: 1× tap singolo (press), 1× tap doppio (double-press), swipe-up 3 click, swipe-down 3 click
4. Verifica events ricevuti corrispondono mapping table §3.2

**GO/NO-GO criteria**:
- ✓ tap singolo / tap doppio distinguibili (eventi discreti `CLICK_EVENT` / `DOUBLE_CLICK_EVENT`)
- ✓ swipe direction (up/down) e magnitude (click count) — `SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT`
- ⓘ **Long-press RITIRATO (ADR-0012)**: non è un gesture hardware (`guides/input-events`, no input duration-based) — nessun criterio timing ≥500 ms. L'invocazione Quick Action è **over-scroll** (swipe-up al top boundary), che non richiede alcuna soglia temporale.
- ✗ **BLOCKING**: nessun evento R1 → R1 non utilizzabile, falla design completo (in worst case → fallback a gesture sul G2 nativo se disponibili, altrimenti project halt)

#### 10.0.2 Test `updateImageRawData` Format

**Procedura**:
1. Test plugin che chiama `updateImageRawData(containerId, bytes)` con 3 formati noti su image container 200×100:
   - **Format A**: PNG indexed-palette 4-bit greyscale, ~3-5 KB
   - **Format B**: Raw bytes packed 4-bit big-endian (10,000 bytes = 200×100×4/8)
   - **Format C**: Raw bytes packed 4-bit little-endian (10,000 bytes)
2. Pattern test: gradiente verticale 0→15 + checkerboard 8×8 → identifica orientation, packing, endianness
3. Visual verification on real G2 display

**GO/NO-GO criteria**:
- ✓ at least 1 format renders correctly → identifies actual API → proceed Phase 4 raster
- ⚠ partial (visual artifacts come bit-shift, mirror, scrambled): tweak pipeline + document workaround
- ✗ **BLOCKING per Phase 4 raster**: nessun format renders → glyph-only MVP, raster a Phase 13 stretch

#### 10.0.3 Test BLE Bandwidth Real-World

**Procedura**:
1. Bridge produce stream of 4 KB tile ogni 100 ms (target theoretical 320 kbps sostained)
2. G2 plugin logga `t_send_request` (ricezione WS) e `t_apply_complete` (post-`updateImageRawData`)
3. Run sostained 1 minute
4. Compute: median latency / tile, p95, p99, total throughput KB/s

**GO/NO-GO criteria**:
- ✓ ≥200 kbps sustained (≥25 KB/s) → target raster 5 fps standard committed (§7.4b.6.1); 15 fps stretch se anche §10.0.6 + §10.0.7 ✓
- ⚠ 100-200 kbps → reduced raster mode: single tile, 0.5-1 fps + glyph fallback prominent
- ✗ <100 kbps **BLOCKING per raster MVP**: glyph-only, raster a Phase 13

#### 10.0.4 Test Audio Capture (V2 only)

**Procedura** (solo se V2 voice native su G2 considerato):
1. Plugin sample chiama `startAudioCapture` (API Even Hub)
2. Log: codec format, sample rate, channels, latenza dal speak to first byte received
3. 30s di parlato verifica integrità

**GO/NO-GO criteria** (V2 only — Phase 13 stretch):
- ✓ PCM 16k mono ≤200 ms latency → V2 voice native fattibile
- ⚠ formato non standard / latency >500 ms → V2 voice solo via MCP client (Claude Desktop, etc.)
- ✗ no audio capture → V2 voice solo via external MCP client

#### 10.0.5 GO/NO-GO Decision Tree

```
                  Phase 0 results
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ALL ✓ (10.0.1+   PARTIAL          BLOCKING
    10.0.2+10.0.3)  (one or more       (10.0.1 fail
        │            ⚠ warnings)        OR 10.0.2+
        │                │              10.0.3 both ✗)
        ▼                ▼               │
    BRANCH A         BRANCH B           ▼
    (full MVP)       (degraded)      BRANCH C
        │                │           (glyph-only)
        ▼                ▼               │
    Phase 4 implements:                  ▼
                                     Phase 4:
    • Raster default 400×200         • Glyph only
      4-tile 2×2 + Layer 1+3+4+6    • No raster pipeline
      → 5 fps standard               • Image containers free
      Layer 2 unlock se §10.0.6 ✓     for portrait/icons
      Layer 5 unlock se §10.0.7 ✓   • Project ships glyph MVP
      → 15 fps stretch achievable    • Raster slips to Phase 13
    • Glyph fallback parallel
    • Sheet portrait OK
    • DSN raster Phase 13
                     │
                     ▼
                 BRANCH B specifics:
                 • If 10.0.2 ⚠: workaround dither
                 • If 10.0.3 ⚠: 1-tile @ 0.5 fps mode
                   only (200×100 effective)
                 • Glyph remains primary fallback
```

Decisione Phase 0 → Phase 1 commencement deve essere documentata in `docs/architecture/0005-phase-0-validation-results.md` (ADR) prima di scrivere codice applicativo.

#### 10.0.6 Test Partial-Update API (Layer 2 sub-tile unlock)

**Procedura**:
1. Cercare API `updateImageRegion(container_id, x, y, w, h, bytes)` o varianti nel SDK Even Hub
2. Se non documentata, esperimento: chiamare `updateImageRawData` con bytes che rappresentano solo un sub-region (con alpha mask se supportato)
3. Misurare se G2 aggiorna solo la regione o re-renderizza l'intero container

**GO/NO-GO criteria**:
- ✓ partial-update supportato → **Layer 2 sub-tile delta encoding** unlock → 15 fps target raggiungibile
- ✗ solo full-image update → Layer 2 dà solo CPU saving, BLE non beneficia → 5-8 fps cap

#### 10.0.7 Test BLE 5.x DLE (Data Length Extension) — Layer 5

**Procedura**:
1. Negoziare ATT MTU al connect — log effective MTU
2. Push 244-byte payload sustained per 30s
3. Confronta throughput vs baseline 23-byte MTU

**GO/NO-GO criteria**:
- ✓ MTU ≥244 byte negotiated, throughput ≥700 kbps → **Layer 5 DLE unlock** → 15 fps target sostenibile
- ⚠ MTU ~64-100 → throughput ~400 kbps → 8-10 fps target
- ✗ no DLE, MTU 23 → 200 kbps baseline → 3-5 fps cap

#### 10.0.8 Test Concurrent Updates Queue

**Procedura**:
1. Push 10 `updateImageRawData` calls back-to-back (no delay)
2. Misurare timestamp di apply per ogni call
3. Verifica se firmware processa in parallelo o serializza con coda

**GO/NO-GO criteria**:
- ✓ Queue depth ≥4 senza drop, processing parallelo → 15 fps achievable per multi-tile
- ⚠ Serializzazione lineare → 1 update / 50ms = 20 fps cap se solo 1 tile
- ✗ drop o crash > 5 update / sec → cap rigido a 4-5 fps

#### 10.0.9 Test Display Refresh Latency

**Procedura**:
1. Push immagine "WHITE", record `t_send`
2. Push immagine "BLACK", record `t_apply`
3. Visual check / camera high-speed: misura `t_pixel_visible`
4. Confronta `t_apply` vs `t_pixel_visible` — è la latency display refresh

**GO/NO-GO criteria**:
- ✓ <30 ms display-to-eye → smooth animation perceptible
- ⚠ 30-60 ms → bordeline per 15 fps perception
- ✗ >100 ms → cap percettivo a 5-8 fps anche se firmware accetta più

#### 10.0.10 P2 Deferred Validations (post-MVP)

| Validation | Phase | Note |
|---|---|---|
| MidiQOL `completeItemUse`/`completeActivityUse` signature | Phase 7 | Validare contro versione installata; ipotizzare config object con `targetUuids` + `asUser` |
| Pathfinder 2e adapter feasibility | Phase 13 V2 | PF2e activity model ≠ dnd5e; richiede design separato — research dedicato 1 settimana |
| Italian↔English STT spell name lookup | Phase 12 V2 | Test reale con Claude Desktop voice mode, lookup table fuzzy come fallback |
| dnd5e v6.x migration | Phase 13 V2 | Pinned a v5.x in MVP; v6.x adapter parallelo come exercise of forward-compat |
| 15 fps stretch (post-Phase 0) | Phase 13 V2 | Solo se Phase 0 BLE ≥1 Mbps + custom RLE + DLE BLE 5.x; vedi §7.4b.6.1 |

### Phase 0 — Validation (Week 0)
- [ ] Even Hub SDK access verificato, plugin sample funzionante su G2 reale
- [ ] **Test §10.0.1 R1 ring eventi confermati nel SDK** (gesture map: press, double-press, swipe-up, swipe-down)
- [ ] **Test §10.0.3 BLE bandwidth real-world** (1 minute sustained, p95/p99 latency)
- [ ] **Test §10.0.2 `updateImageRawData` formato verificato** (PNG vs raw 4-bit packed; **precondizione CRITICAL per Phase 4 raster mode (MVP default)** + Phase 13 Sheet portrait + Phase 13 dice raster)
- [ ] **Test §10.0.5 GO/NO-GO Decision Tree**: documenta esito Phase 0 in ADR-0005 prima di Phase 1
- [ ] **Test §10.0.6 partial-update API** (Layer 2 sub-tile delta unlock)
- [ ] **Test §10.0.7 BLE 5.x DLE** (Layer 5 bandwidth unlock)
- [ ] **Test §10.0.8 concurrent updates queue** (multi-tile feasibility)
- [ ] **Test §10.0.9 display refresh latency** end-to-end
- [ ] **Container budget per page validato** in pratica (4 image + 8 text simultanei)
- [ ] Foundry test world v13 + dnd5e 5.x + personaggio sample
- [ ] MidiQOL installato in test world
- [ ] Decisione: monorepo `pnpm + TypeScript + Vitest + Biome`

### Phase 1 — Foundation (Week 1-2)
- [ ] **Monorepo skeleton**: `packages/foundry-module`, `bridge`, `g2-app`, `shared-protocol`, `shared-render`
- [ ] **Shared protocol**: TypeScript types per tutti i payload (CharacterState, CombatState, Tool, Panel)
- [ ] **CI**: lint, type-check, test, build (`.github/workflows/`)
- [ ] **ADR-0001** layered UI model · **ADR-0002** protocol versioning · **ADR-0003** plugin registry pattern · **ADR-0004** voice via MCP not internal
- [ ] **Versioned config schema**: `config/schema.json` + migrazione `0001_init`

### Phase 2 — Foundry Module Core (Week 2-3)
- [ ] `module.json`, `init.js`, settings UI generata da schema
- [ ] **Foundry adapter `dnd5e@5.x`** (versionato, swap-friendly per futuro v6)
- [ ] Readers modulari: `readers/character.js`, `combat.js`, `scene.js`, `log.js`
- [ ] WS server-side endpoint con **handshake capability** (§5.6.3)
- [ ] Test contract: payload reali registrati come fixture per replay

### Phase 3 — Bridge Service Skeleton (Week 3-4)
- [ ] Fastify + WS, auth token, REST `/v1/actor/*`, `/v1/scene`, `/v1/combat`
- [ ] **Tool registry** completo (cast_spell, weapon_attack, use_item, skill_check, move_token, place_template, set_targets) — chiamabile via REST
- [ ] CORS-correct, whitelist domain G2 plugin
- [ ] `/healthz`, `/readyz`, `/metrics` Prometheus
- [ ] Docker compose deploy homelab

### Phase 4 — G2 App Core + Layered Engine + Map Modes (Week 4-7)
- [ ] **Core**: `app.js`, `state-store.js`, `event-router.js`, `frame-painter.js`, `capability.js`
- [ ] **Layer manager** con z-order e capture transition (§7.2)
- [ ] **Persistent Status HUD** (mockup §7.4 right side, sempre visibile)
- [ ] **Map base layer — RASTER MODE (default MVP)** (§7.4 mockup + §7.4b.4 pipeline + §7.4b.6.1 layered optimizations):
  - [ ] Foundry canvas extract via `canvas.app.renderer.extract.pixels()` (Server topology Option A)
  - [ ] Resize bilineare/Lanczos a 400×200 (web worker off-main-thread, **`OffscreenCanvas` GPU-accelerated**)
  - [ ] Greyscale conversion + Floyd-Steinberg dither (default; Atkinson + Bayer 8×8 selezionabili) — **library: `image-q` v4.0.0** (vedi §11.5.7)
  - [ ] Tile 400×200 → 4 image container 200×100 ciascuno, 2×2 layout
  - [ ] **Layer 1 — Per-tile xxHash + delta encoding** (push solo tile cambiati) — **library: `xxhash-wasm` v1.x** (vedi §11.5.7)
  - [ ] **Layer 3 — Static layer caching** (background dirty flag, recompute solo dynamic)
  - [ ] **Layer 4 — Custom RLE** for 4-bit greyscale uniform regions
  - [ ] **Layer 6 — Adaptive frame rate** state machine (idle 0.3 / slow 3-5 / active 8-15 / storm 0.5-2 fps)
  - [ ] **Layer 2 — Sub-tile delta** (20×20 px sub-tile, 50/tile, 200 total) — **conditional su Phase 0 §10.0.6 partial-update API**
  - [ ] **Layer 5 — BLE 5.x DLE detection** + opt-in — **conditional su Phase 0 §10.0.7 BLE DLE test**
  - [ ] PNG indexed-palette encode 4-bit (size target 1-3 KB / tile post-RLE) — **library: `upng-js` v2.1.0** (vedi §11.5.7)
  - [ ] WS push al G2 plugin → `updateImageRawData` (full-tile fallback) o `updateImageRegion` (sub-tile partial)
  - [ ] Frame rate target: **5 fps standard event-based, 8 fps burst** (BLE 4.x worst case); **15 fps burst** se Layer 2+5 unlock
- [ ] **Map base layer — GLYPH MODE (fallback alternative)** (§7.4b.7 mockup + §7.4a pipeline):
  - [ ] Glyph synthesis from SceneSnapshot (player-centric coordinate transform)
  - [ ] FoW + lighting tier mapping
  - [ ] Token glyph dictionary (player `@`, party uppercase, enemies lowercase+digit, AoE `✦`/`═`/`◯`)
  - [ ] Template effect 2-frame blink animation (filled vs outline ogni 500 ms)
- [ ] **Mode toggle** Quick Action `[M] Map ctrl` → submenu raster/glyph; setting `view.map.mode` hot-swappable
- [ ] **Render primitives**: `hp-bar.js`, `glyph-grid.js`, `box.js`, `chip.js`, `image-tile.js`, `dither.js` (FS+Atkinson+Bayer implementations)
- [ ] Boot splash (mockup §7.12) con capability negotiation
- [ ] **Test**:
  - [ ] Snapshot fixture per default view raster (mocked image bytes)
  - [ ] Snapshot fixture per glyph view
  - [ ] Smoke test full pipeline (Foundry canvas → tile → BLE) headless

### Phase 5 — Panel Plugin System + Read-Only Panels (Week 6-8)
- [ ] **Panel API contract** (§5.6.2): `_panel-api.js`, `_registry.js` auto-discovery
- [ ] Panel `sheet` Foundry-like multi-tab 6 tab (mockup §7.5) — ordine Main → Skills → Inv → Spells → Feats → Bio:
  - [ ] Tab Main (header + vitals + abilities + saves + senses, §7.5.2)
  - [ ] Tab Skills (full 18 skill list con prof markers, §7.5.3)
  - [ ] Tab Inventory (currency, encumbrance, equipped, consumables, container nesting, §7.5.4)
  - [ ] Tab Spells (header spellcasting, filter bar, slot tracker, prepared/known, §7.5.5)
  - [ ] Tab Feats (class+race+background+feats, §7.5.6)
  - [ ] Tab Bio (personality + backstory, §7.5.7)
  - [ ] Tab cycling via tap R1 (§7.5.1)
  - [ ] Iconografia Unicode mapping Foundry (§7.5.2 table + §7.5.5 spell icons)
  - [ ] Data binding diretto a `actor.system.*` (§7.5.8 mapping table esteso con currency/spells/items)
- [ ] Panel `combat` (mockup §7.6) — quick actions [A][S][I][M] (no [V] in MVP)
- [ ] Panel `log` (mockup §7.7)
- [ ] Panel `inventory` standalone quick-access (mockup §7.9, condensato per combat)
- [ ] Panel `spellbook` standalone quick-access (mockup §7.8, condensato per combat)
- [ ] **Map base layer rendering pipeline** (§7.4a): glyph synthesis, FoW, lighting tiers, template effetti animati
- [ ] **Dice result Toast** (§7.15.2 Approach A) — pop-up con d20 + outcome + damage
- [ ] **Test**: aggiungere un panel-mock in 5 minuti senza toccare core

### Phase 6 — R1 Integration + Event Plumbing (Week 7-8)
- [ ] Provider `ring-r1` con event source (press/double-press/swipe-up/swipe-down)
- [ ] Routing R1 events → layer top-of-stack
- [ ] **Quick Action menu** su over-scroll (swipe-up al top boundary) (mockup §7.14)
- [ ] **Telemetry**: log frame timing, gesture latency

### Phase 7 — Foundry Module Write Path (Week 8-9)
- [ ] Writer `use-activity.js` wrapper su `activity.use({ configure: false })`
- [ ] Writer `targets.js` v13-compatibile (per-user)
- [ ] Writer `template.js` AoE via `AbilityTemplate.fromActivity`
- [ ] **socketlib integration** per GM forward (NPC damage)
- [ ] **MidiQOL integration** opzionale (con fallback vanilla)
- [ ] Test manuale end-to-end: Shortsword attack via REST → Foundry chat card

### Phase 8 — Manual Action UX (Week 9-10)
- [ ] Spellbook tap-to-cast: scroll spell → tap → target picker via R1 scroll su Combat overlay → confirm tap
- [ ] Inventory tap-to-use: scroll item → tap → automatic effect
- [ ] Combat overlay quick actions: `[A]ttack [S]pell [I]tem [M]ove`
- [ ] Toast banner risultato azione (mockup §7.10 State 3 — riusato senza voice)
- [ ] Action economy widget: tracking visivo Action/Bonus/Reaction usate

### Phase 9 — Action Economy & Edge Cases (Week 10-11)
- [ ] Action/Bonus/Reaction enforcement (precondition tool)
- [ ] Concentration drop handling
- [ ] Multi-attack (Fighter Extra Attack)
- [ ] Spell slot consumption + auto-suggest highest available
- [ ] Reaction prompt UI (Shield, Counterspell quando si è bersagli)

### Phase 10 — Polish & Field Test MVP (Week 11-13)
- [ ] Error recovery: bridge disconnect, Foundry restart, network blip
- [ ] Offline mode UI ("sync lost", buffered events)
- [ ] **Latency profiling** — verificare target <400 ms p50 manuale
- [ ] **Field test** sessione D&D reale 4h con DM consenziente
- [ ] Documentation: README, setup guide, video demo, runbook ops

────────────────────────────────────────────────────────────────────
            FINE MVP — sotto inizia la V2 OPZIONALE
────────────────────────────────────────────────────────────────────

### Phase 11 — V2 `foundry-mcp` Server (Week 14-15)
- [ ] Setup package `foundry-mcp` con TypeScript MCP SDK
- [ ] Tools MCP: mirror del Tool Registry §5.3 con JSON Schema completo
- [ ] Resources MCP: `actor://current`, `scene://current`, `combat://current`, `log://recent`
- [ ] Auth bearer token verso bridge (riusa lo stesso meccanismo MVP)
- [ ] Test con MCP Inspector
- [ ] Test con Claude Desktop: `cast Fireball` da prompt naturale → eseguito
- [ ] Distribuzione: `npm publish` + Docker container per SSE remoto

### Phase 12 — V2 Voice UX Tuning (Week 15-16)
- [ ] System prompt template per il GM Agent (context injection scene+actor)
- [ ] Esempi worked-out §8 verificati end-to-end con Claude Desktop
- [ ] **Esempio A** (Fireball gruppo) end-to-end ✓
- [ ] **Esempio B** (dual-wield Action+Bonus) end-to-end ✓
- [ ] **Esempio C** (clarify ambiguity) end-to-end ✓
- [ ] Italian↔English spell name lookup robusto

### Phase 13 — V2 Stretch (post-V2 MVP)
- [ ] Reaction handling automatico via MCP tool
- [ ] Proactive tips (LLM legge contesto e suggerisce)
- [ ] Biometrics R1 → narrative cues (HR alto in combat)
- [ ] Multi-player support (più G2 → un bridge, ognuno con propria sessione MCP)
- [ ] **Foundry adapter `dnd5e@6.x`** parallelo (esercizio di forward-compat)
- [ ] Pathfinder 2e adapter (riusa stesso layered UI engine)
- [ ] **Sheet portrait image** (§7.5 portrait 100×60): fetch `actor.img` URL → resize → Floyd-Steinberg dither → image container in Sheet Main tab; feature flag `sheet.portrait.enabled`
- [ ] **Token portrait** in Combat target detail (riuso pipeline §7.4b.4 con FS dither)
- [ ] **Dice So Nice raster stream** (§7.15.3 Approach B): cattura DSN canvas → 5 fps × 2 sec → image container; opt-in via setting `view.diceSoNice.enabled`; coesiste con Toast §7.15.2 sempre attivo
- [ ] **Bridge headless Foundry session** (§7.4b.8 Server topology Option B): Puppeteer/Playwright per scaling multi-player; default MVP usa Option A (player client extract), B come optimization
- [ ] **Advanced dither algorithms**: blue noise, Atkinson "retro CRT" mode (oltre Floyd-Steinberg default)

### Cross-cutting (continuo)

- ✦ **ADR per ogni decisione strutturale**, mai retroattivamente modificati
- ✦ **Changelog automatico** (`Changesets`) per ogni package
- ✦ **Coverage** unit ≥70%, contract ≥90% sui boundary
- ✦ **Telemetry dashboards** Grafana (sample queries pronte)

---

## 11. Risk Assessment (Aggiornato)

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| R1 ring SDK eventi non documentati | High | Medium | Phase 0 validation; il set canonico è press/double-press/swipe-up/swipe-down (ADR-0012), nessun long-press da validare |
| LLM tool-call ambiguity (target sbagliato) | High | Medium | Schema `clarify` + confirmation overlay sotto soglia confidenza 90% |
| Latency > 3 s rovina UX | Medium | Medium | Streaming tool use, scene context pre-cached, STT cloud edge |
| MidiQOL breaking changes | Medium | Medium | Pin version, fallback a vanilla activity.use() chain |
| Foundry v13 targeting cambia comportamento | Medium | Low | Test su v12 + v13, design per-user bridge |
| Even Hub G2 SDK rotture | High | Medium | Stick API documentate, monitoraggio changelog |
| Costo API LLM/STT (sessione 4h) | Low | Medium | Stima: 4h × ~30 req/h × ~$0.005 STT + $0.02 LLM = ~$3/sessione cloud |
| Privacy audio cloud | High | Low | Default opt-in, locale come prima opzione |
| GM perde controllo (azione AI sbagliata) | High | Low | Activity passa per Foundry rules; GM può sempre annullare via chat |
| Battery R1 / G2 sessione lunga | Low | Medium | R1 4 giorni OK; G2 — verificare con field test |

---

## 11.5 Project-level Decisions Log (v0.8)

Decisioni minori risolte in v0.8 oltre P0/P1/P2:

### 11.5.1 D&D edition target

- **Decisione**: **dual-support** D&D 5e PHB 2014 **AND** PHB 2024 ("One D&D" / 5.5e). Entrambe edition supportate al lancio.
- **Implementazione**: dnd5e v5.x espone `core.modernRules` setting; quando `false` (default 2014) usa formule e features 2014; quando `true` (2024) usa il nuovo set. Il modulo `evenfoundryvtt` legge il setting e adatta:
  - **Mockup data binding** (§7.5.8): legge `actor.system.*` paths che sono identici in entrambe edition (la dnd5e maintainer team garantisce schema cross-compatible).
  - **Iconografia / glyph** (§7.5.2): 2014 e 2024 usano stessa visual taxonomy (HP, AC, ecc.) — niente differenza display side.
  - **Class features** (§7.5.6 esempi): se il PG usa subclass 2024 (Cleric Domain rinnovati, Fighter Champion riprogettato in 2024) il modulo legge da `actor.items` di tipo `class`/`subclass` e mostra i feature corretti per quella edition.
  - **Spell list** (§7.5.5): 2024 spell list ridotto ~40 spell + nuove cantrips. Modulo legge `actor.items` filter spell — content matches edition.
- **Test coverage**: Phase 5 (Sheet implementation) include test sia con world 2014 che 2024 per ogni mockup.
- **Rationale**: PHB 2014 ha base installata massima (2014-2024 = 10 anni di sessioni); PHB 2024 è la nuova baseline going-forward. Spec mockup esemplificativi usano 2014 nomenclatura (Thorin Fighter Champion L5: Indomitable L9, Action Surge L2, Improved Critical L3) ma il modulo deve renderizzare correttamente entrambe.

### 11.5.2 License

- **Decisione**: **MIT** per tutti i package monorepo (`foundry-module`, `bridge`, `g2-app`, `foundry-mcp`, `shared-protocol`, `shared-render`).
- **Rationale**: Foundry community convention favors MIT/Apache 2.0 per packages. MIT è più permissivo, incentiva fork/contribution, niente vincoli on derivatives. Dipendenze (MidiQOL MIT, socketlib MIT) compatibili.

### 11.5.3 Bridge deployment topology

- **Decisione MVP**: **Docker Compose homelab default**. Bridge gira su same LAN del Foundry server (latency network ≤5 ms tipico). Phone Even App si collega via WiFi locale.
- **Stretch**: Cloud deploy (Railway, Fly.io, Render) per accesso remoto. Cloudflare Tunnel o ngrok per esporre homelab via tunnel sicuro.
- **Rationale**: homelab è il setup tipico Foundry (single-DM, 4-6 player). Cloud è opzionale per chi non ha port-forwarding o gioca remoto.

### 11.5.4 Authentication scheme

- **Decisione**: **Bearer token opaco per-player**, generato server-side dal modulo Foundry. Token derivato da `user.id + secret + timestamp`, hash HMAC-SHA256, expiry 24h con refresh automatico.
- **Authorization per-attore (ADR-0014, 2026-06-15)**: il bearer è **legato a uno specifico Foundry `User`** scelto dal DM al pairing (non più solo world-scoped). L'insieme degli attori leggibili = gli attori di cui quell'utente è **OWNER** (`actor.testUserPermission(user,'OWNER')`), calcolato live lato Foundry. Il bridge applica la membership su **ogni** path di lettura: REST `GET /v1/character/:actorId` (+ snapshot cache) → 404 se non autorizzato, `characters-list` filtrata, pin `actorId` dell'handshake WS → close 4400. **Fail-closed**: bearer senza `userId` (legacy) o utente non risolvibile → insieme vuoto → richiede re-pairing. Chiude la falla T8 (un player poteva leggere la scheda di qualsiasi attore). Vedi `docs/architecture/0014-bearer-actor-authorization.md`.
- **Provisioning** (v0.9.13 corretto, INV-2 re-verified 2026-06-03): il bearer è trasferito via **copia (PairModal Foundry desktop) → incolla (wizard phone)** (vedi §7.14.7.3). Il QR-provisioning della v0.9.11 era irrealizzabile: la piattaforma Even Hub **non espone fotocamera/QR-scan alle app** (`hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*) e `evenhub qr` codifica l'URL del plugin-host, non un token. Compromesso sicurezza: nel PairModal il token è **nascosto di default** con toggle Mostra/Copia, mai loggato; il pairing resta auditable e revocabile dal DM-side.
- **Lifecycle**:
  1. DM genera il pairing in Foundry Settings → EvenFoundryVTT → "Pair a G2 device" — il PairModal **seleziona il `User` Foundry** per quel device (ADR-0014) e mostra `bridge_url` + `token` copiabili (24h TTL); `world`/`internal_secret`/`userId` sono provisioned al bridge col token
  2. Player installa l'app via Even Hub (§3.8), apre il wizard e **incolla** bridge URL + token → settings persistite
  3. Plugin G2 chiama `/v1/handshake` con `Authorization: Bearer <token>` al boot
  4. Bridge verifica con modulo Foundry: token valido? non revocato? user permission ≥ Player? + ottiene l'insieme `authorizedActorIds` (attori OWNER dell'utente legato) e lo applica su ogni lettura per-attore (ADR-0014)
  5. Se OK, bridge restituisce session metadata (character list, world id) → boot splash → main HUD
  6. Token rotation a 24h (silent refresh in background); revoca dal Foundry module pairing registry
- **Rationale**: opaque token è più semplice di JWT per single-tenant homelab. JWT come future option se multi-tenant cloud deploy. Il copy/paste è l'unico pattern realizzabile per il phone-side bootstrap (nessuna app può scansionare un QR — niente fotocamera).

### 11.5.5 Storage backend

**Quattro tier di storage**, con ruoli distinti (v0.9.11 aggiunto tier #4 phone-side):

- **Tier 1 — Bridge-side runtime (MVP)**: **In-memory LRU cache** nel bridge (Node.js `Map` con TTL). State per-session, dura quanto la sessione del player.
- **Tier 2 — Bridge-side persistente (Stretch Phase 13)**: Redis quando multi-player e/o si vuole persistenza tra restart bridge.
- **Tier 3 — Even Realities App phone settings (per-plugin, MVP)**: storage gestito dall'host Even Realities App per il plugin evenfoundryvtt — sopravvive a kill WebView, app restart, G2 reboot. Reset solo su uninstall plugin o factory-reset. Chiavi (vedi §3.8 + §7.14.7): `bridge_url`, `auth_token`, `character_id`, `world_id`, `connection_profile`, `auto_connect_on_wear`. **Sorgente di verità per le connection-bootstrap settings** (input testuale impossibile sul G2). Persistenza phone-side garantita dall'host, non dal nostro codice.
- **Tier 4 — G2 device-local runtime (MVP)**: piccolo store key-value sull'Even Hub WebView (`localStorage` o IndexedDB se disponibile) per **gesture-only runtime overrides**. Chiavi: `view.map.mode` (§7.4b), `i18n.override` (§7.16), eventuali UI prefs future. Quota tipica ≤5 KB. Wiped on app reinstall.

**Decision tree** "dove va questa setting?": vedi §7.14.6 tabella + flowchart.

**Rationale**:
- Tier 1 (bridge in-memory) è zero-config, sufficiente per single-player MVP.
- Tier 2 (Redis) è natural upgrade path per scale/multi-player.
- Tier 3 (phone settings) **canonical per le bootstrap credentials** — l'unica superficie con tastiera del sistema. Isolata per-device: due paia di occhiali sullo stesso world possono avere connection profile diversi (es. homelab via LAN, cloud via tunnel) senza interferire.
- Tier 4 (G2 device-local) è isolato per design — un dispositivo non condiziona altri device dello stesso world Foundry.

**Conflict resolution** quando la stessa logical setting esiste su più tier (raro): Tier 3 phone wins per connection-bootstrap; Tier 4 G2 wins per gesture overrides; Tier 1/2 bridge è invisibile lato user.

### 11.5.6 Branch strategy

- **Decisione**: GitFlow — `develop` è il branch di integrazione permanente; feature branch `feature/*` partono da `develop` e vi rientrano via PR; `develop -> main` via PR di release. CI green + PR required prima di ogni merge (anche self-review). I milestone branch GSD diventano feature branch su `develop`.
- **Releases**: modello Changesets "Version-PR". Push su `main` → `changesets/action@v1` apre/aggiorna una PR "Version Packages" che bumpa le versioni per-package e consuma i changeset; al merge (zero changeset residui) lo step `publish` crea+pusha il tag `v<version>` (derivato da `@evf/foundry-module`) e dispatcha `foundry-module-release.yml`. Nessun `npm publish` (pre-1.0, privatePackages tag:false). Nota: un tag pushato col GITHUB_TOKEN di default NON triggera altri workflow → il dispatch usa `gh workflow run` (workflow_dispatch), nessun PAT aggiuntivo.

### 11.5.7 Raster pipeline library stack (v0.9.3)

Verified via library research (Q2 2026): le librerie open source coprono tutto il pipeline §7.4b.4 senza necessità di scrivere quantization/dithering/PNG-encode da zero. **Bundle target Foundry module: ~90 KB gzipped totali** (well within hygiene).

#### Option A — Foundry module (browser, default MVP)

```json
{
  "dependencies": {
    "image-q": "^4.0.0",
    "upng-js": "^2.1.0",
    "xxhash-wasm": "^1.1.0"
  }
}
```

> **Pinning convention**: in package.json caret-range (`^1.1.0`) per accettare patch + minor compatibili. Nelle tabelle/prosa la stessa libreria viene citata come "v1.x" (semver compat band). Le due forme sono equivalenti.

| Stage | Library | Note |
|---|---|---|
| 1. Canvas extract | (built-in PIXI) | `canvas.app.renderer.extract.pixels()` — no library |
| 2. Resize 400×200 | (`OffscreenCanvas`) | `imageSmoothingQuality: 'high'` GPU-accelerated, no JS lib |
| 3. Greyscale | trivial inline | `Y = 0.299·R + 0.587·G + 0.114·B`, ~10 LOC |
| 4. Quantize + dither | **image-q** v4.0.0 | MIT, ~60 KB gzip tree-shaken. Supporta **Floyd-Steinberg, Atkinson, Bayer, Stucki, Jarvis, Burkes, Sierra, Riemersma**. Custom palette = 16 step greyscale ramp. ([npm](https://www.npmjs.com/package/image-q) · [GitHub](https://github.com/ibezkrovnyi/image-quantization)) |
| 5. Tile split 200×100 | inline | `Uint8Array.subarray()`, ~20 LOC |
| 6. Sub-tile hash | **xxhash-wasm** v1.x | MIT, **3.9 KB min / 1.3 KB gzip** WASM inline. ([npm](https://www.npmjs.com/package/xxhash-wasm)) |
| 7. RLE 4-bit | custom | ~30 LOC, no library needed (no mature 4-bit-nibble RLE on npm) |
| 8. PNG indexed-palette 4-bit | **upng-js** v2.1.0 | MIT, ~25 KB gzip. Bit-depth 1/2/4/8/16 supportato — esattamente il G2 wire format. ([npm](https://www.npmjs.com/package/upng-js) · [GitHub](https://github.com/photopea/UPNG.js)) |
| 9. WS push | native WebSocket | no library |

**WebWorker compat**: image-q + upng-js + xxhash-wasm tutti worker-safe (no DOM dep). Stage 3-8 in `Worker` con `Transferable` ArrayBuffer → main thread libero per Foundry PIXI loop.

#### Option B — Bridge service (Node.js, V2 stretch / multi-player)

```json
{
  "dependencies": {
    "sharp": "^0.34.5",
    "upng-js": "^2.1.0",
    "xxhash-wasm": "^1.1.0"
  },
  "optionalDependencies": {
    "image-q": "^4.0.0"
  }
}
```

| Stage | Library | Note |
|---|---|---|
| Resize + greyscale + quantize + dither + 8bpp palette PNG | **sharp** v0.34.5 | Apache-2.0, libvips native binding. **Sharp PNG output è sempre 8 o 16 bpp** (`bitdepth` 1/2/4 esiste solo per TIFF). Pipeline: `sharp.greyscale().resize(400,200).png({palette:true,colours:16,dither:1.0,effort:7})` produce **8-bit indexed PNG** con Floyd-Steinberg + palette 16 colori; per ottenere il **4-bit indexed PNG** target G2 wire format serve **post-pass via `upng-js` con `depth:4`**. ([npm](https://www.npmjs.com/package/sharp) · [docs](https://sharp.pixelplumbing.com/api-output#png)) |
| Atkinson / Bayer dither (sharp non li supporta) | **image-q** fallback | optional dep — usato solo se utente seleziona quei dither algorithms |
| Sub-tile hash + PNG re-encode | **xxhash-wasm** + **upng-js** | uniformi al codice Option A |

#### Decisioni di design

- **image-q supply-chain note**: npm `image-q@4.0.0` esiste, ma il **repo GitHub `ibezkrovnyi/image-quantization` non ha tag 4.x pushed** — l'ultimo tag è `v2.1.2` (2023-10) e l'ultima release tag è `image-q@3.0.4` (2021). Mismatch npm↔git → valutare **pin-by-hash in `pnpm-lock.yaml`** o fork interno per stabilità supply-chain. Verifica al momento del lock: 2026-05-10.
- **Skip jimp**: maintained ma **non supporta** Floyd-Steinberg/Atkinson custom palette né 4-bit indexed PNG output. Plugin `@jimp/plugin-dither` solo Bayer 565. **Insufficient per requirement**.
- **Skip ditherjs / floyd-steinberg / digidither**: tutti abbandonati >5 anni. Red flag.
- **Skip pngjs / fast-png**: pngjs solo 8-bit; fast-png decode-only su 4-bit. **Wrong shape**.
- **Pako / fflate** non necessari: PNG encoder fa già DEFLATE sul payload; doppio compress = wasted bytes.

#### ADR-0006 placeholder

Documentare in `docs/architecture/0006-raster-pipeline-library-stack.md` la scelta image-q+upng-js+xxhash-wasm dopo Phase 0 confirmation. Trade-off principali: vs. roll-our-own (image-q ~60 KB vs. ~5-10 KB custom impl ma alta complessità debug), vs. server-side sharp solo (Option B forza Puppeteer dependency).

### 11.5.7.1 Performance impact dello stack — fps gain quantificato

**Domanda**: usare image-q + upng-js + xxhash-wasm + OffscreenCanvas migliora performance/fps rispetto a rolling our own?

**Risposta breve**: **sì, ~30-50% reduction su compute time per frame**, particolarmente xxhash (5-10× più veloce) e OffscreenCanvas resize (3-5× via GPU). Su BLE-bound scenarios il guadagno fps è marginale (BLE è il bottleneck), ma il guadagno è significativo su:

- **Burst capability** (più headroom compute → più tempo per BLE in burst)
- **Battery drain** (meno CPU = meno mAh)
- **Code reliability** (production-tested, no edge cases da debuggare)

#### Benchmark per-stage stimato (Foundry module browser, single token-move scenario)

| Stage | Custom JS rolling-own | Stack librerie | Speedup |
|---|---|---|---|
| 1. Capture | 30-80 ms (PIXI extract, identical) | 30-80 ms | — |
| 2. Resize 800×400 → 400×200 | 30-50 ms (custom bilinear in JS) | **5-10 ms** (OffscreenCanvas GPU) | **3-5×** |
| 3. Greyscale | 2-5 ms (inline) | 2-5 ms (inline) | — |
| 4. Quantize + Floyd-Steinberg dither | 10-25 ms (well-optimized custom) | **5-15 ms** (image-q TypedArrays) | 1.5-2× |
| 5. Tile split | <1 ms | <1 ms | — |
| 6. Sub-tile xxHash (200 tile) | 5-10 ms (custom murmur/FNV in JS) | **0.5-1 ms** (xxhash-wasm WASM ~1 GB/s) | **5-10×** |
| 7. Custom RLE 4-bit | 2-5 ms (same custom impl) | 2-5 ms | — |
| 8. PNG indexed-palette encode (4 tile) | 20-50 ms (custom — bug-prone) | **5-15 ms** (upng-js production-tested) | **2-3×** |
| 9. WS push | <1 ms | <1 ms | — |
| **TOTALE compute / frame** | **~100-225 ms** | **~50-130 ms** | **~30-50% faster** |

#### Impatto fps reale (con BLE bandwidth come gating)

```
Total frame budget = compute + BLE transmit + display refresh
Compute (lib stack): ~50-130 ms
BLE transmit (1-tile delta @ 200 kbps): ~80-160 ms
Display refresh: ~20-50 ms (target §10.0.9)
─────────────────────────────────────────────
Frame total con stack: ~150-340 ms = 3-7 fps sustained, 8-12 fps burst
Frame total senza stack: ~200-435 ms = 2-5 fps sustained, 5-8 fps burst

NB: numeri assumono Layer 1+3+4+6 attivi (default Phase 4).
Layer 2 (sub-tile delta) + Layer 5 (BLE DLE 5.x) — quando unlocked
da Phase 0 §10.0.6 + §10.0.7 — aggiungono tier:
  • Layer 2 → riduce BLE da ~80-160 ms a ~20-40 ms per frame
    (push solo sub-tile cambiati invece di tile interi)
  • Layer 5 → triplica/quintuplica bandwidth → BLE da ~80 ms a ~16-25 ms
  • Combined: ~50 ms total frame → 15-20 fps achievable
```

**Conclusione fps**:
- **Sustained**: ~3-7 fps con stack vs ~2-5 fps senza → **30-40% fps gain**
- **Burst (single small change, BLE bandwidth headroom)**: ~8-12 fps con stack vs ~5-8 fps senza → **50-60% fps gain**
- **15 fps target**: con stack librerie + Layer 2 partial-update + Layer 5 DLE BLE 5.x → fattibile. **Senza stack**: praticamente impossibile per il compute alone esaurirebbe il budget 66 ms/frame.

Il **vero unlock** delle librerie è **xxhash-wasm + upng-js**: skippano i due step più costosi del custom path (hash 200 sub-tile + PNG encode 4-bit con palette). Senza queste librerie, le strategie Layer 1+2 §7.4b.6.1.2 sono CPU-bound prima ancora di toccare BLE.

#### Memory footprint

| Componente | RAM steady-state |
|---|---|
| image-q quantizer + dither buffers | ~2-3 MB peak (400×200×4 byte + paletta) |
| upng-js encoder buffers | ~1 MB peak (4 tile compressi) |
| xxhash-wasm | ~50 KB (WASM module + state) |
| Sub-tile hash array (200 entries × 8 byte) | ~1.6 KB |
| Last-frame cache (per delta) | ~80 KB (400×200 pixels @ 4-bit) |
| **Totale** | **~3-5 MB browser tab** |

Comparable a un singolo image asset Foundry; trascurabile per browser moderno.

#### Raccomandazione

**Adopt stack librerie come baseline Phase 4** — è una **precondizione per il target 15 fps stretch** (compute alone esaurirebbe il budget 66 ms/frame senza WASM hash + GPU resize). Per il **5 fps standard committed** è "nice-to-have ma molto raccomandato": senza stack si scriverebbero ~500-1000 LOC di FS dither + PNG indexed-palette encoder con edge case sottili da debuggare. Il 30-50% compute saving libera anche headroom per Layer 5 BLE DLE quando disponibile, e ~50% di battery drain in meno.

### 11.5.8 Failure modes & recovery (v0.9.4)

Comportamento atteso in scenari di degrado o crash. Documenta le decisioni implicite.

#### 11.5.8.1 Bridge / Foundry server crash mid-session

- **G2 client**: alla perdita WS heartbeat (>5 s no ping), entra in **offline mode**: header mostra `⚠ SYNC LOST` + timestamp ultimo state. Cached state preservato read-only.
- **Quick Action menu**: opzioni write disabilitate (cast/use/attack greyed out con tooltip "offline"). Sheet/Combat/Log restano consultabili sul cached state.
- **Reconnect**: client tenta reconnect ogni 2 s con exponential backoff fino a 30 s. Al reconnect, handshake completo §5.6.3, full state refresh.
- **State replay**: bridge mantiene un **replay buffer** (last 60 s di delta) — al reconnect il client riprende dal sequence number ultimo confermato; se gap >60 s, full snapshot.

#### 11.5.8.2 BLE bandwidth degraded <50 kbps (worse than worst-case)

- Phase 0 §10.0.3 misura. Se <50 kbps real-world:
  - **Glyph mode forzato** automaticamente (no raster, BLE budget ridotto)
  - Sub-tile delta disabled (Layer 2)
  - Adaptive fps Layer 6 → 0.3 fps idle, 1-2 fps active
  - Toast banner notifica utente "low bandwidth mode"

#### 11.5.8.3 R1 ring battery dies mid-session

- Header mostra `⌁ R1 DISC`
- G2 plugin mostra modal "R1 disconnected — riconnetti per continuare"
- Nessun input ricevibile finché R1 non si riconnette (no fallback a G2 native gestures nel MVP — limit hardware §3.2)
- State session preservato; user re-pairs R1 → resume

#### 11.5.8.4 image-q / upng-js worker crash o OOM

- Web Worker isolation: crash worker non kills G2 plugin
- Main thread riceve `error` event → fallback a glyph mode automatico per quel frame
- Toast warning "raster pipeline error, fallback glyph"
- Se crash persistente (3 retry consecutive), force `view.map.mode = "glyph"` permanently per la sessione

#### 11.5.8.5 G2 firmware queue saturation

- Phase 0 §10.0.8 misura queue depth. Se firmware drops update >5/sec:
  - Adaptive fps cap a quel rate
  - Frame skip se nuovo frame arriva prima che il previous abbia completato `updateImageRawData`

#### 11.5.8.6 z=0.5 idle-infill / z=2 overlay-mount race (v0.9.12)

- **Scenario**: un text container `update` per z=0.5 (combat-log strip / stats strip / quick prompts) parte e nello stesso tick arriva un `overlay_mounted` event (utente apre il sheet).
- **Failure mode evitato**: i due update arrivano in ordine non deterministico al firmware G2 → frame intermedio con z=0.5 ancora visibile + parte del z=2 sovrapposto → INV-1 violation.
- **Mitigazione**:
  - Il `layer-manager` (Phase 4a) serializza le mutations su un coda single-threaded (`renderQueue`)
  - `overlay_mounted` enqueue `(unmount-all-z=0.5-containers) + (mount-z=2)` come singolo bundle atomico (vedi §7.4c.4)
  - Se un z=0.5 `update` è già in-flight al firmware quando l'`overlay_mounted` arriva, il manager **non aspetta** l'ack: emette comunque l'unmount + mount. Il firmware applica gli update in ordine FIFO; il flicker intermedio è di durata < 1 frame BLE (~80 ms) e visivamente impercettibile.
  - Snapshot test (Phase 4a): assert che ogni `overlay_mounted` produce esattamente 1 frame finale con i container z=2 visibili e 0 container z=0.5 visibili.

---

## 12. Open Questions

### 12.A — Hardware / SDK validation (Phase 0 CRITICAL)

1. **R1 SDK API surface esatta**: quali eventi sono effettivamente esposti al plugin G2 (press/double-press/swipe-up/swipe-down confermati da `guides/input-events`, ma binding esatto SDK?). Validation con accesso developer Even Hub.
2. **`updateImageRawData` formato esatto**: PNG indexed-palette? Raw 4-bit packed? Endianness? Packing nibble order? **Gating per Phase 4 raster mode** (default MVP post-v0.7).
3. **BLE bandwidth real-world G2**: misurare phone↔G2 effective MTU + sustained throughput. Target ≥200 kbps per Phase 4. Se <100 kbps, fallback obbligato a glyph-only.
4. **Frame rate sostenibile** (vedi §7.4b.6.1): **5 fps standard committed** (Layer 1+3+4+6 sempre attivi), **15 fps aspirational** richiede tutti 6 layer + Phase 0 §10.0.6 + §10.0.7 ✓. Worst case BLE 4.x no DLE: 5-8 fps cap. Phase 0 deve quantificare il bandwidth reale per assegnare branch A/B/C.
5. ~~**Concurrent text + image container updates**~~ — **RESOLVED via §10.0.8** (Test Concurrent Updates Queue).
6. ~~**Display refresh rate G2**~~ — **RESOLVED via test §10.0.9** (Test Display Refresh Latency).
7. **Battery test reale**: drain raster-on continuo 1h vs raster-off, e DSN streaming on vs off (Phase 13).
8. **Layer 4 RLE effectiveness su battle map reali**: testare compression ratio per scenari rappresentativi (forest, dungeon stone, urban, sea) — claim 1.5-25× richiede validation empirica.
9. **Layer 3 static-vs-dynamic classification correctness**: come distinguere reliably scene change da lighting flicker / token shadow movement? False-positive rompe delta detection.
10. **PIXI canvas extract under load**: `canvas.app.renderer.extract.pixels()` mentre il player gioca — blocca UI Foundry del player o gira off-thread? Reclassificato come **Phase 4 internal performance test** (no Phase 0 dedicated slot; va misurato durante development pipeline raster).

### 12.B — Foundry / dnd5e API (validation pre-Phase 2)

11. **MidiQOL `completeItemUse` signature**: documentation GitLab non estratta direttamente; validare contro versione installata effettiva. La spec usa il pattern noto ma da confermare in Phase 7.
12. **MidiQOL `completeActivityUse` signature**: validare se diversa da `completeItemUse`. Deferred a §10.0.10 P2 row 1.
13. **dnd5e v6.x roadmap**: Activity system stabile? Eventuali breaking change in `system.method`/`system.prepared` schema?
14. **PIXI v7 vs v8 in Foundry v14+**: quando Foundry upgraderà PIXI v8 (rotture API), il pipeline raster step 1 (`canvas.app.renderer.extract.pixels`) richiederà rewrite. Tracking issue: nessuna timeline ufficiale.
15. **Multi-attack feature** (Fighter Extra Attack): il flow `Action` deve gestire 2+ attacchi automatici — capire se passare per `attack.rollAttack({ count: 2 })` o looping client-side. dnd5e attack activity API da testare in Phase 7.

### 12.C — Voice/AI (V2 only — Phase 11+)

16. **Concentration drop**: tradurre "lascia Bless e lancia Hold Person" in due tool call ordinate o un tool call con `concentration_drop: true`? Design del Tool Registry §5.3.
17. **Italiano vs Inglese STT**: combat e nomi spell sono in inglese standard D&D; speech player è italiano. Verificare LLM mapping "palla di fuoco" → `spell.fireball` robusto. Lookup table fuzzy locale come pre-step.
18. **Modalità "spectator"** (non player turn): AI ascolta passivamente per info on-demand?
19. ~~**Audio capture su G2**~~ — **RESOLVED v0.9.10** in §3.5: `bridge.audioControl(true|false)` + `event.audioEvent.audioPcm` → PCM 16 kHz s16le mono. Codec BLE raw = LC3 (decoded by Hub SDK). 4-mic array, single audio stream esposto al plugin WebView. Latenza hardware da misurare empiricamente in §10.0.4 (chunk size + buffering — non documentati upstream). **Native EvenAI integration: NOT POSSIBLE for dev apps** (§3.6 — proprietary, no API, no transcript subscription). V2 voice deve usare STT esterno (cloud §4.5 o self-hosted) + LLM via MCP §5.7.

### 12.D — Design decisions (resolved)

20. ~~**GO/NO-GO Phase 4 raster fallback gate**~~ — **RESOLVED v0.8** in §10.0.5 decision tree (Branch A/B/C).
21. ~~**Image container budget conflict**~~ — **RESOLVED v0.8** in §7.5.8 portrait section (allocazione dinamica: 3 tile + 1 portrait quando Sheet/Combat-target overlay aperto).
22. ~~**Server topology default**~~ — **RESOLVED v0.8** in §7.4b.8 (MVP = Option A player-extract; Option B → Phase 13 stretch).
23. ~~**Multi-player priority**~~ — **RESOLVED v0.8** in §10 Phase 13 V2 stretch (single-player first, multi-player post-field-test).
24. **D&D edition target** — RESOLVED §11.5.1 v0.9 update (**dual-support PHB 2014 AND PHB 2024** via setting `core.modernRules`; entrambe edition supportate al lancio).
25. **License** — RESOLVED §11.5.2 (MIT all packages).
26. **Bridge deployment** — RESOLVED §11.5.3 (Docker Compose homelab MVP, cloud stretch).
27. **Authentication** — RESOLVED §11.5.4 (bearer opaque token 24h, JWT future).
28. **Storage** — RESOLVED §11.5.5 (in-memory LRU MVP, Redis stretch).

---

## 13. References

### Even Realities
- G2 Display Guide — https://hub.evenrealities.com/docs/guides/display
- G2 Networking Guide — https://hub.evenrealities.com/docs/guides/networking
- G2 Design Guidelines — https://hub.evenrealities.com/docs/guides/design-guidelines
- G2 Device APIs — https://hub.evenrealities.com/docs/guides/device-apis (audioControl + IMU + device info)
- G2 Input Events — https://hub.evenrealities.com/docs/guides/input-events (CLICK / DOUBLE_CLICK / SCROLL_TOP / SCROLL_BOTTOM / FOREGROUND lifecycle — no voice events)
- Even Hub Overview — https://hub.evenrealities.com/docs/getting-started/overview ("App logic runs on the phone; the glasses handle display rendering")
- Even AI features — https://www.evenrealities.com/ai-glasses (EvenAI proprietary "Even LLM", "Hey Even" wake word, 22+ langs)
- Translation Glasses — https://www.evenrealities.com/translation-glasses (33-35 langs, cloud-only)
- Smart Glasses product — https://www.evenrealities.com/smart-glasses (4-mic array spec)
- Conversate — https://support.evenrealities.com/hc/en-us/articles/14273795154319-Conversate
- Even Hub Simulator (BxNxM/even-dev) — https://github.com/BxNxM/even-dev (audioControl + audioPcm verbatim; "your code runs on a server, the iPhone Even App loads it in a WebView")
- EvenDemoApp (BLE protocol) — https://github.com/even-realities/EvenDemoApp (cmd 0x0E mic activate, 0xF1 LC3 reception)
- TS+Vite starter template — https://github.com/brianmatzelle/even-realities-g2-glasses (server-hosted plugin pattern)
- Even Realities App User Guide — https://support.evenrealities.com/hc/en-us/articles/14301335051023-User-guide ("configure each widget individually through the Even App")
- Even Realities App settings category — https://support.evenrealities.com/hc/en-us/categories/13493252271887-Even-Realities-APP
- Dashboard widget management — https://support.evenrealities.com/hc/en-us/articles/14269247458319-Dashboard
- R1 Smart Ring product — https://www.evenrealities.com/products/r1
- G2+R1 announcement (Wareable) — https://www.wareable.com/wearable-tech/even-realities-g2-smart-glasses-r1-ring-controller-announcement
- CES 2026 award — https://www.ces.tech/ces-innovation-awards/2026/even-realities-g2-display-smart-glasses-and-r1-companion-ring/

### FoundryVTT & dnd5e
- dnd5e source — https://github.com/foundryvtt/dnd5e
- Activity classes — https://github.com/foundryvtt/dnd5e/tree/5.3.x/module/documents/activity
- `Activity#use()` — https://github.com/foundryvtt/dnd5e/blob/5.3.x/module/documents/activity/mixin.mjs (line 177)
- `AttackActivity#rollAttack()` — https://github.com/foundryvtt/dnd5e/blob/5.3.x/module/documents/activity/attack.mjs (line 85)
- `Item5e#use()` — https://github.com/foundryvtt/dnd5e/blob/5.3.x/module/documents/item.mjs (line 711)
- Activities wiki — https://github.com/foundryvtt/dnd5e/wiki/Activities
- Hooks wiki — https://github.com/foundryvtt/dnd5e/wiki/Hooks
- AbilityTemplate — https://github.com/foundryvtt/dnd5e/blob/5.3.x/module/canvas/ability-template.mjs
- Foundry Module Development — https://foundryvtt.com/article/module-development/
- Foundry Sockets — https://foundryvtt.wiki/en/development/api/sockets
- Foundry Permissions — https://foundryvtt.com/article/users/
- v13 targeting change — https://github.com/foundryvtt/foundryvtt/issues/10613
- Foundry Localization API — https://foundryvtt.com/api/classes/foundry.helpers.Localization.html
- dnd5e language catalogs — https://github.com/foundryvtt/dnd5e/tree/master/lang
- Foundry localization guide — https://foundryvtt.com/article/localization/

### Foundry Bridges & Automation
- socketlib — https://github.com/farling42/foundryvtt-socketlib
- MidiQOL — https://gitlab.com/tposney/midi-qol
- foundryvtt-rest-api — https://github.com/ThreeHats/foundryvtt-rest-api
- Foundry API Bridge — https://foundryvtt.com/packages/foundry-api-bridge

### Voice / AI Stack (V2 OPZIONALE)
- **Model Context Protocol (spec)** — https://modelcontextprotocol.io/
- **MCP servers reference** — https://github.com/modelcontextprotocol/servers
- **Anthropic MCP docs** — https://docs.anthropic.com/en/docs/agents-and-tools/mcp
- **MCP TypeScript SDK** — https://github.com/modelcontextprotocol/typescript-sdk
- AssemblyAI Universal-Streaming — https://www.assemblyai.com/blog/introducing-universal-streaming
- Deepgram Nova-3 — https://transcriber.talkflowai.com/blog/deepgram-nova-3-review-benchmarks-pricing
- OpenAI Realtime — https://openai.com/index/introducing-gpt-realtime/
- faster-whisper — https://github.com/SYSTRAN/faster-whisper
- distil-whisper-large-v3 — https://huggingface.co/distil-whisper/distil-large-v3
- Anthropic streaming — https://docs.anthropic.com/en/docs/build-with-claude/streaming
- LM Council 2026 benchmarks — https://lmcouncil.ai/benchmarks
- Northflank STT 2026 — https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks

### Raster Pipeline Libraries (verificate v0.9.3, vedi §11.5.7)
- **image-q** (quantize + dither: FS, Atkinson, Bayer, Stucki, Jarvis, Burkes, Sierra, Riemersma) — https://www.npmjs.com/package/image-q · https://github.com/ibezkrovnyi/image-quantization
- **upng-js** (4-bit indexed-palette PNG encode/decode by Photopea) — https://www.npmjs.com/package/upng-js · https://github.com/photopea/UPNG.js
- **xxhash-wasm** (3.9 KB min, sub-tile hashing) — https://www.npmjs.com/package/xxhash-wasm · https://github.com/jungomi/xxhash-wasm
- **sharp** (Node libvips, Option B bridge) — https://www.npmjs.com/package/sharp · https://sharp.pixelplumbing.com/

### Raster Streaming & Dithering (Doom-on-exotic-devices pattern)
- **DOOM on a watch (jborza, 2020)** — https://jborza.com/post/2020-11-20-doom-on-a-watch/ — streaming + dithering reference architecture
- **fbDOOM Linux framebuffer** — https://github.com/maximevince/fbDOOM e https://github.com/stoffera/fbdoom
- **rp2040_doom_1b (Bayer + blue noise)** — https://github.com/meadiode/rp2040_doom_1b
- **Atari ST 16-color Doom port** — https://www.tomshardware.com/video-games/retro-gaming/doom-slithers-and-dithers-its-way-with-a-16-color-atari-st-port
- **Ditherpunk (surma.dev)** — https://surma.dev/things/ditherpunk/ — guida canonica al dithering
- **Floyd-Steinberg dithering (Wikipedia)** — https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering
- **Atkinson dithering** — https://beyondloom.com/blog/dither.html
- **Floyd-Steinberg vs Atkinson comparison** — https://www.turbodither.com/learn/floyd-steinberg-vs-atkinson
- **Image Dithering algorithms (Tanner Helland)** — https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html

### Dice So Nice (Foundry plugin)
- **Dice So Nice! plugin** — https://gitlab.com/riccisi/foundryvtt-dice-so-nice
- **Foundry packages catalog** — https://foundryvtt.com/packages/dice-so-nice

---

## Changelog

- **2026-06-18 (v0.10.0 — feature 001: unified view selection + single connection profile + composited FPS badge + D&D-sheet restyle)** — Spec Kit feature `001-foundry-g2-hud`. Quattro deliverable UX, nessun cambio di superficie upstream (badge/fps/phase/hardware/library invariati → nessun bump, README/showcase ricevono solo note coerenti per INV-3). **(D1) Connessione "direct link" unica:** collassate le 4 sorgenti di config (wizard / env dev / default implicito `localhost:8910` / `.env.local`) in un solo profilo; resolver `is-dev-no-auth.resolveBridgeUrl` (saved `bridgeUrl` → override dev esplicitamente gated → `''`). **Rimosso il default implicito `localhost`** (causa del bug "bridge irraggiungibile" sul telefono). Decisione: si persiste **solo `bridgeUrl`**, il **token resta in memoria** e viene riacquisito dal wizard a ogni avvio (T-02-01 confermato; il contratto "token in kv" NON adottato). **(D2) Selezione vista unificata:** rimosso il dropdown mode (off/streaming/actor); il selettore "Personaggio / Ruolo" guadagna una voce sintetica **"Party"** in cima. `toPlayerViewRequest` (puro, unit-tested): Party → `streaming`, un PG → `actor` (+ re-pin scheda). Wire `client_player_view{mode,actorId?}` invariato; default boot = Party. **(D3) Restyle scheda D&D + icon-dictionary:** nuovo `panels/icon-dictionary.ts` come **unica fonte** per glyph + canvas (consolida `ITEM_GLYPHS`/`PROF_GLYPHS`/`SLOT_*`/vitals — glyph byte-identici, fixtures INV-1 invariate); chrome canvas a doppia cornice + bracket d'angolo + header rule; vitali Main (CA/INI/VEL) disegnati come icone via `drawIcon`. **(D4) Badge FPS composited:** FPS estratto dalla card PF/CA/LV in un badge piccolo (font 13px) all'angolo scelto da `EVF_FPS_CORNER` (build-time `VITE_EVF_FPS_CORNER`, default `bottom-right`, invalido → default), geometria pura `fpsBadgeRect`, cede sotto la card quando condividono il top-right. ADR-0015 §(D) aggiunto; runbook `docs/release/evenhub.md` (pairing direct-link + `VITE_EVF_FPS_CORNER`) e `deploy/.env.example` aggiornati. Test g2-app verdi (pure-logic + INV-1 width-invariance HP 7/700·nome lungo·overflow condizioni·IT/EN + badge 4 angoli). Gate UAT manuale: screenshot simulatore dei 6 tab (richiede deploy live).
- **2026-06-15 (v0.10.0 — security: ADR-0014 bearer↔Foundry-user binding + per-actor read authz)** — Chiusura della falla **T8** (cross-player character data disclosure) emersa dalla review full-codebase del 2026-06-14: un player autenticato poteva leggere la scheda di *qualsiasi* attore (i bearer erano world-scoped, non actor-scoped). **Decisione [ADR-0014]:** il bearer è legato a uno specifico Foundry `User` al pairing; l'insieme leggibile = attori OWNER di quell'utente (`testUserPermission(user,'OWNER')`, calcolato live lato Foundry); enforcement bridge-side su **ogni** path (REST `/v1/character/:actorId` + snapshot cache → 404, `characters-list` filtrata, pin `actorId` handshake WS → close 4400); **fail-closed** (bearer legacy senza `userId` → re-pairing). Implementato in `shared-protocol` (`userId` required + `authorizedActorIds` nel push), `foundry-module` (PairModal user-picker, `validateToken`/`getCharacterSnapshot`/`listCharacters` ownership-aware), `bridge` (4 enforcement points + cache). Doc: §11.5.4 riscritta; ADR-0014 indicizzato in `docs/architecture/README.md`. Test full suite 3582 verdi. No version bump (security detail interno, nessuna superficie badge/fps/phase) → README/showcase invariati.
- **2026-06-08 (v0.10.0 — milestone: substrato raster CanvasCompositor come rendering default)** — Chiusura del milestone v0.10.0 (Phases 19–25). Bump v0.9.15 → v0.10.0. Doc-only (INV-3 atomic commit: Specs §7 + README + showcase).
  - **Phase 19 — ADR-0013 Amendment 1 + CanvasCompositor core** (Phases EVF-19, 4 piani): ratificato ADR-0013 Amendment 1 (substrato canvas compositor). `CanvasCompositor` implementa z-order compositing con dirty-skip su `OffscreenCanvas`; `CanvasLayer` interface + `isCanvasLayer` guard aggiunti additivamente a `layer-types.ts`; `buildHudRasterPageSchema()` (5 container: 4 image tile 200×100 + 1 `hud-capture` text isEventCapture:1); `LayerManager.renderMode = 'canvas' | 'glyph'` (default `'glyph'` — promozione a v0.10.0). `HUD_TILE_GEOMETRY` = 200×100/tile, 400×200/regione (INV-2 verified `hub.evenrealities.com/docs/guides/display`). Glyph path byte-identico pre/post.
  - **Phase 20 — Status HUD su canvas + font VT323 + INV-1 raster baseline** (EVF-20, 5 piani): `CanvasStatusHudLayer` renderizza la HUD (z=1) su canvas con font pixel VT323 (`@fontsource/vt323`, fallback `16px monospace`); chrome statico pre-baked in `ImageBitmap` al mount; `_dirty` gate — `paint()` invocato solo su `character.delta`. Contratto INV-1 raster stabilito: `inv:all` esegue glyph suite (fixture ASCII) + raster suite (SHA-256 PNG tile hash in `status-hud.raster-hash.json`); FALSE-PASS guard implementato (IS-09d). `hud-capture` (id=4, 576×288) vs `map-capture` (id=7, 576×234) — architettura dual-container ratificata (fallback FALLBACK rispetto al rename proposto). 3179 workspace test.
  - **Phase 21 — Character sheet su canvas + dati main-tab** (EVF-21, 5 piani): pannello `CanvasSheetLayer` (z=2 overlay) con 6 tab (Main/Skills/Inventory/Spells/Features/Bio) renderizzati su canvas VT323; navigazione gesture preservata byte-identica al glyph path; portrait greyscale-dithered in slot 3 (100×60). Schema esteso: `CharacterSnapshotSchema` + `extractClass` / `extractInitiativeModifier` / `extractWalkSpeed` reader helpers; tab Main wired con classe, Ini, velocità reali. ~26 literal downstream aggiornati.
  - **Phase 22 — Features + Biography schema extension** (EVF-22, 3 piani): `CharacterSnapshotSchema` esteso con `feats[]` (array di `{name, description}`) e `biography` (stringa plain-text strip da HTML); reader `extractFeats` + `extractBiography` nel `foundry-module`. Tab Features e Biography della scheda raster mostrano dati reali. Gap CR-BIO-2 chiuso (block-level tag → spazio separatore, assertion allineata). 558/558 foundry-module test green.
  - **Phase 23 — Combat tracker su canvas + AC combattente** (EVF-23, 3 piani): `CanvasCombatLayer` (z=2 overlay) con finestra scorrevole a 5 combattenti, highlight turno corrente (fillRect inverso), HP e AC reali da `CombatSnapshot`; `extractAc` reader aggiunto. 13/13 must-have verified.
  - **Phase 24 — Delta loop ~5fps xxhash** (EVF-24, 2 piani): `HudDeltaDriver` guida il rendering canvas a ~5 fps (intervallo minimo configurabile, default 100 ms); sub-tile hashing 200×100 con xxhash h32 — solo i tile CHANGED re-encodati/spediti; idle near-zero bandwidth (0 push se 0 hash cambiati). Debounce configurabile: 3 eventi ravvicinati → 1 cycle.
  - **Phase 25 — Promozione raster a default boot + fallback glyph** (EVF-25, 3 piani): `boot-engine-core.ts` monta canvas mode come default (`setRenderMode('canvas')`); guard `?hud=raster` rimosso (INV-4 dead-code rule); 5 file PoC eliminati; `setBleVerdict('glyph')` attiva `setRenderMode('glyph')` + schema 3-container atomico. ~60 fixture INV-1 glyph preservate byte-identiche. 3295/3295 workspace test green.
  - **INV-1 raster contract:** il contratto INV-1 raster è ora formalmente stabilito con hash PNG tile SHA-256 committati; `inv:all` verde su entrambe le suite (glyph + raster).
  - **§7.2:** paragrafo "Substrato di rendering predefinito — CanvasCompositor raster" aggiunto (questo documento). §7.4: mockup 27px avvolto nella subsection "Glyph Fallback Mode — BLE-degraded path" (INV-1 contract, non cancellato).
  - **INV-2 Re-verified ✓ 2026-06-08 — no drift** (milestone è architettura di rendering interna, nessun nuovo claim upstream; 4 WebFetch paralleli su domini canonici): G2 display 576×288 4-bit confermato; execution model phone WebView confermato; gestures press/double-press/swipe-up/swipe-down confermati; no speaker/no camera confermati; dnd5e latest release-5.3.3 confermato.
  - **Bump v0.9.15 → v0.10.0.**

- **2026-06-05 (v0.9.15 — j0t-05: flush status-view schema + 8-row sheet)** — Fix di due artefatti residui dopo il boot real-pairing (j0t tasks precedenti). **Bump v0.9.14 → v0.9.15.**
  - **Bug 1 — "Text" ghosting/overlap (PRIMARY):** `LayerManager._flushPage()` usava `buildBaseTextContainers()` (7 text + 4 image = 11 container), re-dichiarando `map-capture` (id7, stessa rect identica di `status-hud` id6) e `z05-*` (ids 8-10) dopo ogni bundle. Il G2 host renderizzava questi container sovrapposti come placeholder "Text", oscurando il foglio stato. **Fix:** `_flushPage()` ora usa `buildStatusViewTextContainers()` (3 container: header id4, footer id5, status-hud id6; 0 image; `containerTotalNum:3`) — identico schema della boot page (`buildBootPageSchema()`). `map-capture` e `z05-*` restano nel registry per il map-mode DEFERRED (Phase 20) ma NON vengono dichiarati nel flush di default.
  - **Bug 2 — overflow 234px + hint duplicato:** `SHEET_ROWS=9` → 9×27=243px > h=234px del container `status-hud` (id6) → il 9° riga (R1 hint) trabocca nel footer strip; e il footer (id5) mostra già l'hint R1 via `renderContextChip` / hud-chrome → duplicato. **Fix:** `SHEET_ROWS=8`, riga R1 hint rimossa dal corpo del foglio. 8×27=216px ≤ 234px — nessun overflow.
  - **INV-3 coerenza:** §7.4 mockup aggiornato da 9 a 8 righe (riga R1 rimossa); tabella container nota `9 righe` → `8 righe × 27px=216px ≤ 234px`; nota j0t-05 aggiunta. Changelog aggiornato.
  - **Test delta:** `Test 8b` in `layer-manager.test.ts` aggiornato a 3-container status-view schema (da 11-container); `NEW_HUD_ROWS=9→8` + `SHR27-P8` aggiornato in `status-hud-renderer.test.ts`; 5 fixture INV-1 rigenerati a 8 righe (rimossa riga R1). Suite g2-app **1435 test GREEN**.

- **2026-06-05 (v0.9.14 — HUD-27PX: full-width 27px status sheet as default glasses view)** — Fix per "scritte troppo grandi": il font G2 LVGL ha altezza riga fissa 27px, non ~12px come il vecchio layout assumeva. **Bump v0.9.13 → v0.9.14.**
  - **Root cause:** il renderer `StatusHudRenderer` e la geometria container in `container-registry.ts` erano progettati per una griglia 12px/24-righe (28 char × 21 righe). Sul G2 reale il testo appariva ~2.25× troppo grande, overlappato, e clippato.
  - **Fix:** `status-hud-renderer.ts` riscritto per emettere 9 righe full-width (~50 chars, ~576px misurate da `@evenrealities/pretext`) al posto della vecchia corner card 28×21. La vista di default è ora il Character Status Sheet (non la mappa raster). Geometria container aggiornata (27px/riga: header h=27, footer y=261 h=27, status-hud x=0 w=576 y=27 h=234). Boot skip di `finalizeIdleRender` per la default view (mappa + idle-infill non dipinte di default, preservate per il deferred map-mode gesture toggle).
  - **Layout approvato (9 righe):** nome+Lv · divisore · HP bar+cur/max+CA+VEL · Turno/Round · Cond: · divisore · Slot · TS morte · R1 hint. Data-gap: classe/velocità/turno renderizzati come `—` con TODO(HUD-27PX) marker.
  - **Width budget (INV-1):** ogni riga misurata con `getTextWidth()` da `@evenrealities/pretext`; WIDTH-ASSERTION test fallisce la build su overflow. `pxTruncate` tronca con `…` se necessario.
  - **DEFERRED:** tutti i pannelli overlay + real map-mode toggle → fase dedicata "g2-app UI 27px density rework" (Phase 20+). I container map-capture + z05-* sono preservati nel registry per il deferred map-mode.
  - **INV-3 coerenza:** Specs.md §7.4 + ADR-0001 Amendment 2 + README.md + docs/showcase/index.html aggiornati nello stesso commit (questo).
  - **INV-2 note:** nessuna claim hardware nuova — la rimisurazione 27px/~50 chars cita il finding esistente da `@evenrealities/pretext` (stessa libreria installata e verificata precedentemente).
  - **Test delta:** +33 nuovi test (`SHR27-*` in `status-hud-renderer.test.ts`); fixture INV-1 aggiornate (`status-hud.loading.txt`, `hp-overflow.txt`, `conditions-overflow.txt`, `sync-lost.{it,en}.txt`); suite g2-app **1401 → 1434** test (pre-Task2 → Task3 finale, inclusi +33 SHR27 + aggiustamenti SHL-3 + IB key-count +6). TypeScript strict + Biome lint:ci clean.
  - **Code:** `packages/g2-app/src/status-hud/status-hud-renderer.ts` · `status-hud-layer.ts` · `engine/container-registry.ts` · `internal/boot-engine-core.ts` · `status-hud/i18n-budgets.ts` (+6 chiavi `hud27_*`). Dipendenza `@evenrealities/pretext@0.1.4` aggiunta come devDependency.
  - **Quick task:** `.planning/quick/260605-j0t-redesign-the-g2-hud-for-the-real-27px-fo/260605-j0t-PLAN.md`.

- **2026-06-03 (PAIR-EHUB-01 — pairing reale = install via Even Hub + paste del token; QR-scan ritirato)** — Correzione di design/piattaforma applicata nello stesso PR su codice + doc (INV-3). **No spec version bump** (correzione coerente, no nuovi claim hardware/library/fps/phase/locale).
  - **Root cause (confermata):** il QR-pairing assunto in v0.9.11 era irrealizzabile. La piattaforma Even Hub **non espone fotocamera/QR-scan alle app** e l'app gira nel WebView del telefono; il PairModal nascondeva inoltre il token (mai reso come testo), quindi il DM non poteva passarlo al player. Path reale: install via Even Hub (dev `evenhub qr` = carica l'URL del plugin-host; prod `.ehpk` → review portale → store) + **paste manuale** del token.
  - **Codice:** `PairModal` rimuove la generazione QR (dropped `qrcode`/`@types/qrcode` da `@evf/foundry-module`) e mostra **bridge URL + token copiabili** (token mascherato di default con toggle Reveal/Copy — compromesso sicurezza documentato); il wizard g2-app `step2-token` rimuove il dead-code QR-scan (`hub.camera`/`_probeCameraApi`/`scan_qr_btn`, INV-4) lasciando paste/clipboard + inserimento manuale. i18n riallineata (rimosso `evf.pair.qr.scan_instruction`; aggiunte `evf.pair.copy.*`, IT primario + EN). Test aggiornati; suite verde.
  - **Doc:** §3.8, §7.14.7.1–7.14.7.3, §11.5.4 riscritte sul flusso install-via-Even-Hub + paste; mockup wizard step 2 riallineato a colonna (INV-1, paste-only); ADR-0005 §OQ-INV2-4 risolto.
  - **Re-verified ✓ 2026-06-03 (INV-2):** `hub.evenrealities.com/docs/guides/device-apis` — *"no camera (there is none)"* (nessuna API fotocamera/QR-scan per le app); `hub.evenrealities.com/docs/reference/cli` — `evenhub qr` codifica l'URL del dev-server (carica l'app, non un token); distribuzione prod via `evenhub pack` → `.ehpk` → review manuale del portale.

- **2026-05-31 (INV-2 full validation round — hub.evenrealities.com/docs/*)** — Whole-development re-verification against the canonical Even Hub developer docs (overview · getting-started/architecture · guides/{display,device-apis,page-lifecycle,input-events,networking,design-guidelines} · reference/packaging). **No spec version bump** (validation + drift log; coherent corrections scheduled to dedicated v0.9.14 work per the §0 drift policy "fixato in PR dedicato").
  - **Re-verified ✓ (no change):** execution model (app logic in phone WebView, glasses = display + native scroll only); container budget 4 image + 8 other = 12 max; exactly one `isEventCapture:1`; canvas 576×288 4-bit greyscale; **image container 20–200 × 20–100 px** (canonical doc CONFIRMS Specs §3.1's 200×100 — supersedes the 2026-05-14 simulator-`index.d.ts` note that suggested 288×144; the docs are authoritative ⇒ our 200×100 tiles are correct); audio PCM 16 kHz s16le mono via `audioControl(true|false)` + `audioEvent`; `imuControl`; `getDeviceInfo`/`getUserInfo`; `getLocalStorage`/`setLocalStorage`; explicit "no audio output, no camera, greyscale only, no animations, no programmatic scroll position"; `shutDownPageContainer(0=immediate, 1=confirm)`; lifecycle events `FOREGROUND_ENTER_EVENT(4)`/`FOREGROUND_EXIT_EVENT(5)`/`ABNORMAL_EXIT_EVENT(6)` via `onEvenHubEvent`; **`setBackgroundState`/`onBackgroundRestore` confirmed ABSENT** (validates v0.9.14 LIFE phase scoping); networking full-origin whitelist (no wildcards), HTTPS-required, CORS not bypassed by whitelist, **WebSocket cannot set request headers from the WebView** (validates the 2026-05-30 audio-stream `?token=` query-param fix, task 260530-x2b).
  - **Drift: R1 long-press gesture — IMPORTANT.** Canonical `guides/input-events` + `getting-started/overview` + `guides/design-guidelines` now state the COMPLETE gesture set is **press / double-press / swipe-up / swipe-down only** (`CLICK_EVENT(0)`, `DOUBLE_CLICK_EVENT(3)`, `SCROLL_TOP_EVENT(1)`, `SCROLL_BOTTOM_EVENT(2)`) — *"Long-press is not a supported gesture on the Even G2 or Even R1 … No duration-based input exists in the API."* This contradicts the prior INV-2 round (changelog 2026-05-?? "tap scroll long-press 1:1 Re-verified ✓") and the project's `[ASSUMED — SC-06-01 pending]` long-press≥500 ms hypothesis (§3.2 / §10.0.1). Impact: the Quick-Action menu invocation (`quick-action-long-press-dispatcher`, NAV-02, §7.14.4 ck 7) is built on a gesture the hardware does not deliver. **Fix scheduled (dedicated, hardware-gated):** redesign Quick-Action invocation onto a supported gesture (candidate: `double-press`) + retire `long-press` from the `R1Gesture` union + update §3.2/§7.14.4 mockups + showcase atomically (INV-3) → tracked as **GEST-01** (REQUIREMENTS v2). Not hotfixed into the Phase 19 release PR (deep multi-file + spec change; on-glasses behavior already `human_needed` per ADR-0005). **Update 2026-05-31 — DESIGN LOCKED [ADR-0012]:** the earlier `double-press` candidate is rejected (`double-tap` is reserved for the root-exit `shutDownPageContainer(1)`, LIFE-03/EXIT-01). Quick-Action invocation moves to **over-scroll (swipe-up at the focused layer's top boundary)**; per-panel context actions remap (`inventory`/`spellbook` Action Options → `tap`; `template-placement` cancel → `double-tap`). Implementation is the dedicated **Phase 20** effort (input/lifecycle), executed via the GSD phase flow. See `docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md`.
  - **Drift: `packages/g2-app/app.json` MISSING — IMPORTANT.** `reference/packaging` requires an Even Hub manifest (`package_id`, `edition: "202601"`, `entrypoint`, `permissions[]` incl. `network.whitelist` of origin-complete bridge + plugin-host URLs, `supported_languages`) for the WebView to load the plugin and reach the bridge. The g2-app has none ⇒ cannot run on real Even Hub / hardware yet. **Fix scheduled:** author `app.json` with the deployment origins → tracked as **DIST-EHUB-01** (REQUIREMENTS v2). Deployment-specific origins + hardware-gated ⇒ not in the Phase 19 release PR.

- **2026-05-31 (tooling — Release & Distribution + README Installation docs)** — Phase 19 closes the full CI/CD release pipeline (REL-01..05). **No spec version bump** (solo tooling/distribuzione — nessun cambio a hardware/library/fps/phase/locale claims).
  - **REL-01 regression**: inline comments in `foundry-module-release.yml` assert the `module.json` manifest-URL contract and `evenfoundryvtt.zip` upload remain intact.
  - **REL-02 (`build-bridge-ghcr` job)**: builds `deploy/bridge.Dockerfile` (multi-stage `node:24-alpine`) and pushes `ghcr.io/aiacos/evf-bridge:<version>` + `:latest` to GHCR on every release tag dispatch. Auth via `GITHUB_TOKEN` (no PAT). Per-job permissions (`packages: write` scoped to this job only; `contents: read`). GHCR lowercase-owner guard via `tr [:upper:] [:lower:]` step output.
  - **REL-03 (`build-g2app-zip` job)**: runs `pnpm --filter @evf/g2-app build`, zips `dist/` as `g2-app-dist.zip` (working-dir `packages/g2-app` so archive paths are `dist/...` not nested), uploads to GitHub Release via `gh release upload --clobber`. Depends on `release` job (race-condition guard).
  - **REL-04 (Changesets release notes)**: replaces `--generate-notes` with CHANGELOG.md extraction — Node one-liner regex extracts the `## <version>` section from `foundry-module` + `bridge` + `g2-app` CHANGELOG.md files (aggregated, `---` separated); `test -f` guard falls back to `--generate-notes` on first release before Changesets has written CHANGELOG.md.
  - **REL-05 (README Installation section)**: `## Installation` section added covering all 3 components — (1) Foundry Module via manifest URL `releases/latest/download/module.json`; (2) Bridge via `docker pull ghcr.io/aiacos/evf-bridge:latest` + Docker Compose from `deploy/docker-compose.yml`; (3) G2 App via `g2-app-dist.zip` from GitHub Release → serve `dist/` from HTTPS static host. Env contract points to `deploy/.env.example` + `docs/release/bridge.md` runbook.
  - **`docs/release/bridge.md`** (new): operator runbook documenting GHCR image location, one-time first-push private→public visibility flip, `docker pull` + optional compose `image:` substitution, required env vars (`EVF_INTERNAL_SECRET` via `openssl rand -base64 32` + `EVF_PLUGIN_HOST_URL` origin-complete no-wildcards).
  - **INV-3 coerenza**: README.md + Specs.md + docs/showcase/index.html aggiornati nello stesso commit.
  - **Re-verified ✓ (n/a — internal tooling/distribution change, no upstream claim)**: nessuna claim tecnica su hardware/library/fps upstream modificata; versioni librerie invariate.

- **2026-05-25 (tooling — GitFlow + automated release)** — Branch strategy migrata da trunk-based a GitFlow; pipeline di release automatizzata via Changesets + GitHub Actions. **No spec version bump** (solo tooling/workflow — nessun cambio a version, fps, fase, librerie, locale).
  - **CI triggers estesi a `develop`**: `.github/workflows/ci.yml` ora esegue su `push + pull_request` per `[main, develop]`; tutti gli 8 gate di qualità (Biome, typecheck, coverage, TODO discipline, snapshot drift, changeset-status, ADR-0011 guard, SKT-02 probe) e il job `commit-lint-pr-title` rimangono invariati.
  - **Nuovo `release.yml`**: modello Changesets "Version-PR" — su ogni push a `main`, `changesets/action@v1` apre/aggiorna una PR "Version Packages" se ci sono changeset non consumati; al merge, lo step `publish` esegue `pnpm run release:tag`.
  - **`scripts/release-tag.mjs`**: legge la versione da `packages/foundry-module/package.json`, crea+pusha il tag `v<version>` in modo **idempotente** (skip se il tag esiste già), poi dispatcha `foundry-module-release.yml` via `gh workflow run -f tag=v<version>`. Rationale del dispatch esplicito: un tag pushato col GITHUB_TOKEN di default NON triggera `on: push: tags` in altri workflow (GitHub anti-loop protection) → `workflow_dispatch` funziona col token di default perché è user-initiated, non ricorsivo. Nessun PAT aggiuntivo richiesto.
  - **Pre-commit hook aggiornato**: `.husky/pre-commit` ora esegue `pnpm biome check --write --staged --no-errors-on-unmatched` (auto-fix in place) seguito da `git update-index --again` per re-stagiare i fix nella commit corrente. `.husky/commit-msg` (commitlint) invariato.
  - **INV-3 coerenza**: §11.5.6 + README.md + docs/showcase/index.html aggiornati nello stesso commit.
  - **Re-verified ✓ (n/a — internal tooling change, no upstream claim)**: nessuna claim tecnica su hardware/library upstream modificata; versioni librerie invariate.

- **2026-05-18 (v0.9.13 SHIPPED — Sheet Data Completion + Polish)** — Three software-only phases close end-to-end the v1 Character Sheet panel data wiring (Main + Skills tabs) plus the Phase-14.1 spec-prose drift carry-forward. **Bump v0.9.12 → v0.9.13.**
  - **Phase 16 — Sheet Main tab abilities end-to-end** (commits `1336417` → `d68d7f2`). `CharacterSnapshotSchema.abilities` REQUIRED — 6 sub-objects (str/dex/con/int/wis/cha) each `{value, mod, save, proficient, dc}`; `AbilitiesSchema` uses `z.strictObject` (6 keys frozen by canonical D&D 5e rules), inner `AbilityScoreSchema` uses `z.object` (forward-compat for sibling fields). `extractAbilities` reader helper reads `save.value` (dnd5e prep-time computed total) NOT recomputed from `mod + prof` — magic items / racial save bonuses / feats would diverge under recomputation. Reader coerces dnd5e raw `proficient: 0|0.5|1|2` to strict boolean (half-prof 0.5 → false for Main tab boolean). `renderMainTab` data binding replacing 14 cells of `—` placeholder with formatted values via `formatAbilityValue` + `formatAbilityMod` helpers; renderer proficient glyph is data-driven (`profGlyph(prof)` returns `◉` or `○`). 4 INV-1 fixtures byte-updated (`sheet.main.{2014.it,2024.it,2014.en,2014.de}.txt`). SHEET-05/06/07 closed. **INV-2 cross-checked ✓ 2026-05-18**: `github.com/foundryvtt/dnd5e@release-5.3.3` `module/data/actor/templates/common.mjs` + dnd5e wiki Roll-Formulas (`@abilities.*.value / .mod / .save.value / .dc / .proficient`).
  - **Phase 17 — Sheet Skills tab + Main tab senses passives** (commits `d2e0403` → `c208d24`). `CharacterSnapshotSchema.skills` REQUIRED — 18 sub-objects keyed by dnd5e short code (acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur) each `{total, ability, proficient, passive}`; `proficient` modelled as closed `z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])` (NOT boolean — Skills tab needs the full glyph spectrum, Main tab is binary). `extractSkills` reader helper reads `total` directly (dnd5e prep-time computed) and PRESERVES `proficient: 0|0.5|1|2` verbatim (explicit difference from Phase 16's boolean coercion). `SKILL_DEFAULT_ABILITY` 18-key map encoded canonical D&D 5e default-ability driver per skill. `passive` read directly from dnd5e (NOT recomputed via `10 + total` — Observant feat / magic items / half-prof / tool-proficiency interactions may diverge from the naive formula). `renderSkillsTab` dynamic `SKILL_KEYS.map`-driven lookup replacing the 60-LOC `DEFAULT_SKILLS` hardcoded array; `SKILL_NAMES` static i18n map (18 keys × 3 locales it/en/de); `PASSIVE_ABBR` const (`PP/PI/IND` IT · `PP/INS/INV` EN · `WN/EIN/NCH` DE); half-prof (0.5) rounds UP to `◉` per UI-SPEC §3 (rationale: half-prof still adds the proficiency bonus, so "proficient-ish" is more honest than "untrained"). `renderMainTab` row 17 senses line populated with passive Perception/Insight/Investigation replacing the remaining `Sensi  —` placeholder. 5 INV-1 fixtures (`sheet.skills.it.txt` byte-identical post-swap + new `sheet.skills.en.txt` regenerated from BASE consumer + 4 `sheet.main.*` row-17 byte-updates). SHEET-08/09/10 closed. **INV-2 cross-checked ✓ 2026-05-18**: dnd5e 5.3.x canonical `actor.system.skills.<key>.{total, ability, proficient, bonuses, passive}` schema confirmed against `github.com/foundryvtt/dnd5e@release-5.3.3`.
  - **Phase 18 — Phase-14.1 spec-drift polish** (this commit). Three UI-REVIEW WR-UI findings from Phase 14 closed: (1) **WR-UI-02** archived `14-UI-SPEC.md` §2 spacing-token table col-anchors corrected (`right-stop` col 70 → col 67; `content-width` 66 cells → 64 cells; central-divider `║` note added — divider sits at col 68 not col 71 as some older mockups show); frame-corner enumeration {0, 71, 95} → {0, 68, 95}. (2) **WR-UI-01** archived `14-UI-SPEC.md` §10 width-budget table re-derived from `idle-infill-layer.ts` runtime literals (Option (a) doc-fix per UI-REVIEW Priority Fix 1, lower-risk than re-padding fixtures): label-separator 40 → 52 cells (raster) / 40 cells (glyph); stats strip 60 → 54 cells (raster) / 51 cells (glyph). (3) **WR-UI-03** IT locale leak in `glyph-scene.glyph-idle-z05.it.txt` Status HUD column fixed — original plan acknowledged 2 leaks (rows 1 + 17: TURNO 2/5 vs ROUND 3 · TURN 2/5; Condizioni vs Conditions); the new `Z05-INV-02b-triade` test (A_it ↔ B_it ↔ C_it byte-identity cols 69..95 rows 3..20) surfaced 4 additional IT-locale leaks (rows 5: PF vs HP; row 7: CA 18 VEL 30 vs AC 18 SPD 30; row 9: Az. vs Act; row 12: Slot vs Slots) — all fixed atomically per deviation Rule 2. Triade test exempts row 20 cols 89..93 `[GLY]` glyph-mode marker (UI-SPEC §6.3 — legitimate C-state-only indicator, NOT a locale leak). INFILL-14.1-A/B/C closed.
  - **Quality gates:** CI Gate 8 socketlib handler count = **17** preserved end-to-end across the milestone (read-only Sheet read-path extensions in Phases 16+17; doc-only + 1 fixture + 1 test in Phase 18 — no new socketlib handlers). Workspace tests **2559 → 2668** (+109 tests across milestone: Phase 16 +89, Phase 17 +22, Phase 18 +1 triade). All INV-1..5 verification suites green. TypeScript strict + Biome lint:ci clean. **No spec version drift** — re-derived numbers cited live against `packages/g2-app/src/status-hud/idle-infill-layer.ts` and `packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt`.
  - **Hardware verification:** 35 SCs from v0.9.11 carry under ADR-0005 PROVISIONAL Branch A unchanged (no new hardware-pending SCs this milestone — software-only).
  - **Out of scope (carried forward):** RTL languages (ADR-0007), Spells tab DC binding (primed by `abilities.dc` from Phase 16; deferred to a future Sheet polish cycle), STRETCH-01..05/07/08 (carried forward unchanged from v0.9.11 per Phase 13 minimal scope), Picovoice Rhino edge classifier (conditional on hardware SC-12-01 p50 > 800ms — not measurable without hardware).
  - **Plans**: 16-01 / 16-02 / 16-03 (abilities) · 17-01 / 17-02 / 17-03 (skills) · 18 (single INV-3 atomic — Phase 14.1 polish + milestone close).
- **2026-05-17 (v0.9.12 Phase 15 closed — Deepgram Keyterm Prompting + Entity-Pack Integration)** — Voice STT quality lift per requirements VOICE-06..09 (4 / 4 software-only). **What landed:** `SPELL_KEYTERMS` data exported from `@evf/shared-protocol` (70 SRD entries × IT + EN, drift-proof against foundry-mcp `SPELL_LOOKUP` via SKT-02 1:1 mapping test); `buildKeytermList()` pure function in `@evf/bridge` — union of static SRD vocab + dynamic Foundry entity-pack snapshot; static-wins on conflict (CONTEXT D-01); entity-pack truncated first when union exceeds **`DEEPGRAM_KEYTERM_LIMIT = 100`** (CONTEXT D-04); `createDeepgramStt` extended with `keytermProvider: () => string[] | KeytermProviderResult` callback (lazy on each `connect()`); URL builder appends one `keyterm=<URL-encoded>` query param per element (VOICE-06 + VOICE-08); `EntityPackCache.onChange()` synchronous subscription API; `KeytermRefresher` orchestrator (trailing-edge debounce 250ms + drain-then-restart mutex via `_inFlight` flag) wires cache pushes → adapter `refreshKeyterm()` invalidation signal (VOICE-09; next `connect()` picks up fresh list via lazy provider — Deepgram WS protocol does NOT support mid-stream keyterm hot-swap, RESEARCH.md §2 Option C); failure modes: empty-cache → one-shot `keyterm.empty-entity-cache` warn (closure-local flag, reset-on-recovery — one warn per empty-streak); close codes `[1007, 1008]` + range `4000-4999` → retry-once-with-`sanitizeKeyterms` (ASCII control chars stripped, Unicode letter-safe for IT spell names é/è/à/ô/ñ — preserves recall lift) → fallback to no-keyterm baseline URL (Phase 12 byte-for-byte preserved); end-to-end integration test (INT-01..03) exercises cache push → debounce → connect → URL contains new keyterms. **INV-2 re-verified ✓ 2026-05-17**: Deepgram Nova-3 Multilingual `keyterm` parameter, **+625% entity-recall lift** on esoteric D&D 5e terms (Bigby's Hand, Counterspell, Vrock), and EvenAI native API closure verified on 6 canonical Even Realities domains — full evidence in `.planning/quick/20260517-voice-intent-research/RESEARCH.md` §1 + §2. **Invariants preserved**: `socketlib.registerComplexHandler` count = **17** (CI Gate 8 — refresh path uses existing `/internal/delta` multiplex via `handleEntityPackEnvelope`; no new socketlib handler registered); Phase 12 baseline byte-for-byte when `keytermProvider` is absent or returns `[]` (DGKT-04 + DGKT-06 byte-for-byte URL `.toBe(DEEPGRAM_URL)`); all 35 hardware-pending SCs carry forward unchanged under ADR-0005 Branch A — Phase 15 is **software-only** (no new hardware-pending SCs). **Test delta**: +65 new/extended tests across `@evf/bridge` voice + cache + `@evf/shared-protocol` packages (bridge 261→300; workspace 2559→2624). **Picovoice Rhino edge-classifier deferral**: still conditional on SC-12-01 hardware p50 > 800ms (not measurable without hardware; carry forward under ADR-0005 Branch A — RESEARCH.md §2 Option B). **Plans**: 15-01 (SPELL_KEYTERMS + buildKeytermList) · 15-02 (createDeepgramStt keytermProvider + server.ts step 10) · 15-03 (EntityPackCache.onChange + KeytermRefresher) · 15-04 (sanitizer + empty-cache warn + retry-fallback + INT) · 15-05 (this INV-3 atomic doc-coherence closure). Phase 15 closed: `.planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-VERIFICATION.md`. No spec version bump; v0.9.12 stays at 2026-05-14 baseline.
- **2026-05-17 (v0.9.12 Phase 14 ratification)** — z=0.5 Idle Content Infill layer ratified end-to-end per requirements INFILL-01..05. **INFILL-01** layer formalized in §7.2 layered model + state machine (unchanged from 2026-05-14 entry; Phase 14 confirms). **INFILL-02** 3 dynamic text containers (combat-log · z=0.5 label · stats strip) verified via existing `packages/g2-app/src/status-hud/idle-infill-layer.ts` (Phase 4a) + 3 new INV-1 fixtures (`raster-overlay-open.it.txt` · `raster-overlay-open.en.txt` · `glyph-scene.glyph-idle-z05.it.txt`) locked in `packages/shared-render/src/fixtures/`. **INFILL-03** auto-demolish atomicity verified via differential-demolish (Phase 4b `LayerManager.bundle()`) + new LMT-DD-07 race-coverage test in `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`. **INFILL-04** ADR-0001 Amendment 1 ratification stanza added (status row: ACCEPTED + AMENDED + RATIFIED Phase 14). **INFILL-05** INV-1 fixtures + cross-state column-equality invariants (Z05-INV-01..04) verified — frame chars at cols {0, 71, 95} and rows {0, 2, 21, 23} byte-identical across State A (raster idle) ↔ State B (overlay-open) ↔ State C (glyph-idle-z05). No spec version bump; v0.9.12 stays at 2026-05-14 baseline. INV-3 atomic commit covers ADR + Specs + README + showcase + planning state.
- **2026-05-14 (v0.9.12)** — Idle Content Infill layer (z=0.5) + INV-2 spot-check re-verification of image-API constraint.
  - **Audit method (INV-2 spot-check)**: 6 WebFetch tentate, **2 sorgenti convergenti** sulla canonical hardware-API constraint (`hub.evenrealities.com/docs/guides/device-apis` verbatim *"no arbitrary pixel drawing, no audio output, no camera"* + `hub.evenrealities.com/docs/getting-started/overview` execution model + display specs invariati). 1 source HTTP 404 (`support.evenrealities.com/specs` — path deprecated/spostato), 2 source SPA-empty (reference/api + guides/quickstart — React root non-WebFetch-reachable). **Drift verdict: NEUTRO** — broad constraint "no arbitrary pixel drawing" holds; specifico numero `200×100` non visibile sulla canonical primaria fetch 2026-05-14, classificato come **INV-2 follow-up** (non blocker). Full evidence: `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md`.
  - **NEW §7.4c Idle Content Infill — z=0.5 layer** — nuovo layer tra `z=0` (map) e `z=1` (status HUD), rendered **solo quando z=2 non è montato**. Risolve la richiesta utente "no spazi vuoti nel raster mode" senza challengiare il container budget (4 image hard-capped). Usa 3 text/list container (combat log strip · z=0.5 label · stats strip) dal pool 8-budget §3.1, **auto-demolished su overlay_mounted, auto-reborn su overlay_dismissed**. Sub-sezioni: 7.4c.1 motivazione · 7.4c.2 contratto · 7.4c.3 contenuto canonico MVP · 7.4c.4 state machine (extended capture transition) · 7.4c.5 INV-1 compliance · 7.4c.6 container budget per stato · 7.4c.7 phase mapping (Phase 4a/4b/5/7) · 7.4c.8 open questions.
  - **§7.2 Layered Rendering Model esteso** — da 3 layer (z=0/1/2) a **4 layer** (z=0/0.5/1/2). State machine capture-transition aggiornata con `z=0.5 demolished` su `open(panel|modal)` e `z=0.5 reborn` su `close()`. Invarianti z=0.5 esplicitati: never captures input, never writes state, reuses text/list pool (mai image pool), atomic mount/demolish con z=2.
  - **§7.3 Canvas Allocation** — schema ASCII aggiornato con annotazione `z=0.5 rendered ONLY when z=2 NOT mounted` nelle ultime ~3 row del map area.
  - **§7.4 Default View RASTER mockup aggiornato** — le 3 row in fondo al map area (precedentemente blank/stats) ora mostrano il z=0.5 infill content: combat-log strip `⚔ Thorin → Goblin Brute · hit AC 14 · 15 dmg slashing` + label `─── z=0.5 idle infill ───` + stats strip `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick`. INV-1 char-precision verificata (90 char per row matching col-70 boundary tra z=0 e z=1).
  - **§11.5.8.6 NEW failure mode** — z=0.5 idle-infill / z=2 overlay-mount race condition + mitigation strategy. Layer-manager serializza mutations su single-threaded `renderQueue`; `overlay_mounted` enqueue `(unmount-all-z=0.5) + (mount-z=2)` come singolo bundle atomico. Snapshot test (Phase 4a) gate per zero-flicker invariance.
  - **ADR-0001 amended** — Status `ACCEPTED` (2026-05-11) → `ACCEPTED + AMENDED 2026-05-14`: z=0.5 layer extension noted in §Amendments section. La decisione originale (Option A layered z-stack con single capture container) resta in vigore; z=0.5 è additiva, non sostitutiva. Container budget statement (4 image + 8 text/list + 1 capture) confermato fresh contro upstream canonical (INV-2 spot-check 2026-05-14).
  - **README.md + showcase**: aggiornati versione + nota z=0.5 idle infill layer + cross-check round count unchanged (×5 — spot-check non è full audit round).
  - **Bump v0.9.11 → v0.9.12**.
- **2026-05-10 (v0.9.11)** — Online cross-check round 5: plugin distribution model corrected + Even Realities App phone-side settings UI surface formalized (Foundry connection bootstrap).
  - **Audit method (INV-2)**: 3 WebFetch + 1 WebSearch su `support.evenrealities.com/User-guide`, `hub.evenrealities.com/docs/getting-started/{overview,first-app}`, GitHub `BxNxM/even-dev` + `brianmatzelle/even-realities-g2-glasses`. **2 sorgenti convergenti** sul pattern phone-hosted-WebView-loading-server-served-code, **2 sorgenti convergenti** sul "Setting - <plugin>" UI pattern in Even Realities App.
  - **CRITICAL drift fix §3.7 Plugin Execution Model** — v0.9.10 diceva *"App logic runs on the phone"* (corretto ma incompleto). v0.9.11 corregge a **3-hop deployment**: il codice plugin è **servito da un server HTTP separato** (plugin host URL), l'Even Realities App **fetcha** quella URL nel WebView phone, da cui parte il traffico verso il bridge. Verbatim simulator README: *"G2 plugins are web apps where your code runs on a server, the iPhone Even App loads it in a WebView, and relays display/input over BLE."* Diagramma aggiornato con plugin host URL distinto da bridge URL. Aggiunta nota dev workflow: *"use your machine's local network IP, not localhost"* per phone WebView.
  - **NEW §3.8 Plugin Configuration Surface (Even Realities App)** — formalizza che l'Even Realities App espone una **settings UI per-plugin** sul telefono (verbatim user guide: *"configure each widget individually through the Even App"*). evenfoundryvtt usa questo canale per le connection-bootstrap settings che richiedono input testuale (impossibile sul G2 — no keyboard, vincolo §3.1). Tabella 6-row con i campi user-facing: bridge URL, auth token, player/character, world id, connection profile, auto-connect on wear. Storage = phone persistent (managed dall'host, sopravvive a kill/restart/reboot). Bootstrap flow worked example (zero → connesso) in §7.14.7.2.
  - **§7.14.6 Settings UI riscritta** — ora riconosce **3 superfici** distinte invece di 2: (1) Foundry world settings server-side, (2) **Even Realities App phone settings** [NEW canonical per text-input], (3) G2 device-local gesture overrides. Decision-tree flowchart per assegnare nuove settings al tier giusto. Il vecchio dualismo "Foundry world / G2 device-local" lasciava un buco implicito (dove vive il bridge URL pre-Foundry-connect?) — ora chiuso.
  - **NEW §7.14.7 Phone-Side Configuration UI (Even Realities App)** — 4 sub-sezioni:
    - 7.14.7.1 mockup wizard first-run (HTML form 3-step nel WebView phone, NON sul G2): Connection profile + Bridge URL → Auth token (QR scan or paste) → Character selection + auto-connect.
    - 7.14.7.2 worked example bootstrap step-by-step (10-step, latency target ≤90s end-to-end primo setup).
    - 7.14.7.3 Foundry module pair-G2 flow: Settings UI Foundry desktop → "Pair a G2 device" button → genera bearer 24h + QR payload `{bridge_url, token, world, expires}` → audit trail pairings registry con revoca per-device.
    - 7.14.7.4 edge cases: bridge unreachable, token expired, whitelist mismatch, multi-device same character, QR scan camera permission denied, phone change, G2 wear off mid-session.
  - **§11.5.4 Authentication scheme** esteso — bearer token ora **paired via QR scan** (non solo paste manuale). Riduce attack surface (no token in clipboard non sicura) e rende auditable il pairing dal DM-side. Lifecycle aggiornato: DM/player genera QR in Foundry Settings → player scansiona dall'Even Realities App → settings persistite. Paste manuale resta fallback per accessibility.
  - **§11.5.5 Storage backend** ora **4 tier** invece di 3:
    - Tier 1 bridge in-memory LRU (MVP)
    - Tier 2 bridge Redis (Phase 13 stretch)
    - Tier 3 **NEW Even Realities App phone settings** — canonical per connection-bootstrap, sopravvive a kill/restart/reboot, reset solo su uninstall plugin. Chiavi: `bridge_url`, `auth_token`, `character_id`, `world_id`, `connection_profile`, `auto_connect_on_wear`.
    - Tier 4 G2 device-local LRU (gesture overrides only)
    Conflict resolution policy aggiunta: Tier 3 phone wins per bootstrap; Tier 4 G2 wins per gesture; Tier 1/2 bridge invisible lato user.
  - **§13 References** — 4 nuove sorgenti aggiunte: brianmatzelle TS+Vite starter template, Even Realities App User Guide, Even Realities App settings category, Dashboard widget management.
  - **README.md + showcase**: aggiornati versione + cross-check round 4 → 5 + nota plugin distribution model (server-hosted) + phone-side settings UI surface.
  - **Bump v0.9.10 → v0.9.11**.
- **2026-05-10 (v0.9.10)** — Online cross-check round 4: G2 audio surface + native AI integration (RESOLVED §12.C item 19) + plugin execution model.
  - **Audit method (INV-2 in atto)**: 8 WebFetch + 2 WebSearch in parallelo contro sorgenti canoniche Even Realities (`hub.evenrealities.com/docs/*`, `evenrealities.com/{ai-glasses,smart-glasses,translation-glasses}`, `support.evenrealities.com`, `github.com/BxNxM/even-dev`, `github.com/even-realities/EvenDemoApp`). 4 sorgenti convergenti su mic/PCM, 5 sorgenti convergenti su EvenAI no-API.
  - **§3.1 Even G2 Display ESTESO** — aggiunte 4 righe hardware finora implicite:
    - **4-mic array direzionale** (single audio stream esposto come PCM 16 kHz s16le mono) — verbatim `evenrealities.com/smart-glasses`
    - **No speaker / no audio output** confermato esplicitamente — verbatim `hub.evenrealities.com/docs/guides/device-apis`: *"no audio output, no arbitrary pixel drawing, no camera"*. **Implicazione**: tutti i feedback "vocali" della nostra UI devono restare visivi (toast §7.15.2)
    - **No camera** (intentional Even Realities design)
    - **IMU** esposto via `imuControl(isOpen, reportFrq)` con pacing P100–P1000 (riserva V2 head-tracking)
  - **NEW §3.5 G2 SDK Audio Surface** — documenta `bridge.audioControl(true|false)` + `event.audioEvent.audioPcm` → PCM 16 kHz s16le mono, verbatim verificato. Pipeline interna G2 4-mic → BLE LC3 → Hub SDK decode → PCM al plugin WebView. Limitazioni esplicite: input only (no TTS/output), no event type "voice" in event taxonomy, chunk size non documentato (Phase 0 §10.0.4).
  - **NEW §3.6 G2 Native AI Features (NOT integrable)** — documenta EvenAI / Translate / Conversate / Teleprompt come feature native cloud-backed **opaque** agli app dev. Tabella 4-row con activation, processing location, API status (tutto ❌). Verbatim citazioni: ChatGPT è G1-only (G2 usa "Even LLM" proprietario non-API), translation cloud-only ("uses the cloud to translate your conversation in real-time"), zero voice/transcript events nell'input event taxonomy. **Conferma architetturale**: la nostra V2 voice strategy via `foundry-mcp` (§5.7) è **vincolo di piattaforma**, non scelta di design — AI on-glasses è IMPOSSIBILE per qualunque dev third-party.
  - **NEW §3.7 Plugin Execution Model** — verbatim `hub.evenrealities.com/docs/getting-started/overview`: *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Diagramma flow G2 ↔ Even Realities App phone (WebView host) ↔ bridge ↔ Foundry. Conseguenze esplicite: network whitelist enforced sul WebView phone, audio mic decoded a PCM lato phone (non LC3 raw all'app), no on-glasses LLM disponibile.
  - **§4.3 SDK Surface — riga Audio aggiornata**: era *"`startAudioCapture`/`stopAudioCapture` (verificare codec — assumere PCM 16k)"*; ora **`bridge.audioControl()` + `event.audioEvent.audioPcm` PCM 16 kHz s16le mono** verificato §3.5, con nota "no audio output (G2 no speaker §3.1)".
  - **§4.5 STT V2** — aggiunto callout "Hardware feasibility RESOLVED v0.9.10": input audio disponibile direttamente dal G2, no hardware aggiuntivo richiesto. STT cloud o self-hosted gira nel bridge service o client MCP, mai sul G2.
  - **§7.10 Voice Overlay V2** — aggiornato preamble: la cattura audio sul G2 è **hardware-fattibile** (verificato), AI/LLM resta external (vincolo §3.6). Architettura V2 esplicita: G2 mic → plugin WebView → bridge `/v1/voice` → STT cloud → tool MCP → toast risultato sul G2.
  - **§12.C item 19 RESOLVED** — "Audio capture su G2" chiusa con cross-ref §3.5 (formato confermato) + §3.6 (EvenAI non integrabile) + §10.0.4 (chunk size + buffering empirici Phase 0).
  - **§13 References ESTESO** — 8 nuove sorgenti Even Realities aggiunte: device-apis, input-events, getting-started/overview, ai-glasses, translation-glasses, smart-glasses, Conversate support article, BxNxM/even-dev simulator, EvenDemoApp BLE protocol.
  - **README.md + showcase**: aggiornati versione + cross-check round (×3 → ×4) + nota "G2 audio surface verified, AI on-glasses non integrable".
  - **Bump v0.9.9 → v0.9.10**.
- **2026-05-10 (v0.9.9)** — Project Invariants (INV-1/2/3/4) + Layout Integrity rules + i18n predisposition + Code Quality discipline.
  - **NEW §0.1 Project Invariants (NON-NEGOTIABLE)** — eleva quattro regole trasversali a vincoli vincolanti:
    - **INV-1 Layout Integrity** — formattazione e layout sempre dinamici, sempre perfetti, mai disallineati. Concretato in §7.1a (8 sub-rules verificabili: frame integrity, variable-content discipline, column alignment, tab strip equal-width, status HUD invariants, multi-byte safety, render contract Box/TextRun, edge-case forbidden list).
    - **INV-2 Online Cross-Validation** — ogni claim tecnico cita upstream canonico (Even Hub, foundryvtt.com/api, dnd5e wiki, MCP spec, vendor pricing pages). Cadenza re-verify minima (pre-Phase-0 / pre-bump / pre-impl). Drift policy CRITICAL/IMPORTANT/NICE-TO-HAVE + changelog discipline. Upstream-vs-fonti-terze hedge esplicito.
    - **INV-3 Documentation Coherence** — Specs/README/showcase sempre allineati per-commit; cross-ref integrity; pre-bump checklist (5-step manual, future CI).
    - **INV-4 Code Quality** — codice sempre pulito, ottimizzato, documentato; **zero codice morto o irraggiungibile** tollerato. Biome + TS strict + Vitest coverage gate; JSDoc/TSDoc su public API; `// TODO(#N)` o `// TODO(ADR-NNNN)` obbligatorio; hot-path benchmarks gate regression; deprecated removal scheduling. ADR-0008 Code Quality Configuration (placeholder, Phase 1).
  - **NEW §7.1a Layout Integrity Invariants** — 8 sub-rules concrete che implementano INV-1: corner alignment, HP=7-vs-700 problem, fixed-grid columns, tab equal-width, Status HUD coordinate freeze (col 70-95 row 1-21), monochrome glyph dictionary canonical, render contract `Box{children}` (vietate string concat), 7 edge-case traps esplicitati come forbidden.
  - **NEW §7.16 Localization & Internationalization** — predisposizione i18n MVP:
    - 3-layer architecture: Foundry locale (source of truth) → Bridge i18n service → G2 runtime override
    - Boot resolution: `effective = override ?? game.i18n.lang`
    - Quick Action `[N] Language` submenu (gesture-friendly, lista chiusa da `available[]`)
    - String-table contract: `t(key, vars)` only, mai literal in lingua, `_max` width budget per chiave (linkato a INV-1 §7.1a.2)
    - Locale set MVP: `en` (canonical fallback) + `it` (target) + `de/es/fr/pt-BR` (best-effort) + others V2
    - Edge cases: missing keys, overflow truncate, RTL marked V2 stretch + ADR-0007
    - Settings schema (estensione §5.6.5): `i18n.override` device-local, `i18n.fallback` default `en`
  - **§3.4 Foundry**: aggiunto bullet `i18n / Localization` con `game.i18n` API verificata su `foundryvtt.com/api/classes/foundry.helpers.Localization.html`.
  - **§4.1 Module API**: aggiunto `getLocale()` / `setLocale(code)` / `subscribeLocale(cb)`.
  - **§5.6.5 Settings**: nota i18n device-local (non passa via `config.update` Foundry → bridge).
  - **§7.13a Quick Action**: aggiunta entry `[N] laNguage` + indicator inline `Foundry: it · override: —`.
  - **§7.14.4 Verification Checklist**: estesa da 10 a **15 check** — 11 (corner alignment), 12 (variable-content stress HP/name/cond), 13 (tab strip equal-width), 14 (i18n stress IT vs EN width budget), 15 (lint check Box/TextRun no string-concat).
  - **§7.14.6 Settings UI**: ora 2 eccezioni user-side G2 — `[M]` map mode + `[N]` language. Esplicitato che entrambe sono **device-local runtime overrides** (LRU §11.5.5), isolate dai settings world-scope Foundry.
  - **§13 References**: aggiunti Foundry Localization API + dnd5e language catalogs + Foundry localization guide.
  - **README.md + docs/showcase/index.html**: aggiornati per riflettere v0.9.9 + invariants + i18n (INV-3 doc coherence applicata in atomico).
  - **Bump v0.9.8 → v0.9.9**.
- **2026-05-10 (v0.9.8)** — Online cross-check round 3 (independent re-verify, confirms v0.9.7).
  - **Audit**: 8 WebFetch in parallelo contro fonti canoniche, **zero CRITICAL / zero IMPORTANT drift** rispetto a v0.9.7. Tutti i claim §3 + §4 confermati esatti contro upstream 2026-05.
  - **NICE-TO-HAVE enrichment** (4 dettagli upstream non in v0.9.7, non drift ma utili a implementatori):
    - **§3.1 G2 display** — aggiunto caveat "image container non può essere inviato durante creazione iniziale (placeholder + `updateImageRawData` post-create)" e "full-screen text container ~400-500 char visibili" e "list container no in-place updates" (specifica upstream esplicita su `hub.evenrealities.com/docs/guides/display`).
    - **§3.2 R1 ring** — aggiunti "medical-grade stainless steel + anti-fingerprint coating" + range operativo "-10 °C a 45 °C" (da `evenrealities.com/smart-ring`).
    - **§3.3 G2 networking** — aggiunto vincolo CRITICO "una entry per origin completo, NO bare hostnames NO wildcards" + "HTTPS obbligatorio in produzione, HTTP solo dev locale" + "preflight 204 con Allow-Methods+Allow-Headers per richieste non-simple" (da `hub.evenrealities.com/docs/guides/networking`).
    - **§4.5 Deepgram pricing** — completato hedge v0.9.7 con i due tier mancanti: **Growth Monolingual streaming $0.0042/min** (12% saving) + **Multilingual streaming PAYG $0.0058/min** / Growth $0.0050/min (rilevante per sessioni italiane). Risolto il mistery delle fonti terze: $0.0077/min è il prezzo pre-recorded, fonti terze confondevano i tier.
  - **Re-verified ✓ (no change)**: G2 display 576×288 4-bit / 4 image+8 other / isEventCapture exact, R1 gesture "tap scroll long-press" 1:1, dnd5e 5.3.3 min 13.347 verified 14, 12 activity classes, MCP stdio+Streamable HTTP (HTTP+SSE deprecato 2024-11-05), AssemblyAI $0.15/h, TokenLayer.setTargets(targetIds, {mode}), socketlib 7 execute* methods.
  - **Audit method**: 8 WebFetch parallel, source-of-truth diretto (no aggregator/blog). Confirms previous audit v0.9.7 reliability.
  - **Bump v0.9.7 → v0.9.8**.
- **2026-05-10 (v0.9.7)** — Online cross-check round 2 (3 IMPORTANT residual + bulk re-verify).
  - **Re-verified (no change, claim ancora corretto contro upstream 2026-05)**:
    - G2 display §3.1 — `hub.evenrealities.com/docs/guides/display` conferma 576×288 / 4-bit / 4 image+8 other / `isEventCapture: 1` exact / 20-200×20-100 / 1000 (2000 upgrade) char text / 20×64 list ✓
    - G2 networking §3.3 — `hub.evenrealities.com/docs/guides/networking` conferma fetch+XHR+WS, app.json whitelist, CORS critico (page caveat: "Adding domain to app.json does NOT override CORS") ✓
    - R1 hardware §3.2 — `evenrealities.com/smart-ring` conferma BLE / IP68 50m·30min / ~4 giorni / ~90 min ricarica / zirconia + stainless steel / HR+HRV+SpO₂+skin temp+steps+calories+sleep ✓
    - dnd5e 5.x §3.4 — `github.com/foundryvtt/dnd5e/blob/master/system.json` conferma version 5.3.3, compatibility minimum 13.347, verified 14 ✓
    - dnd5e activities §3.4 — `module/documents/activity/_module.mjs` conferma 12 activity classes (Attack, Cast, Check, Damage, Enchant, Forward, Heal, Order, Save, Summon, Transform, Utility — escluso ActivityMixin che è il base mixin, non activity) ✓
    - Foundry v13 targeting §3.4 — `foundryvtt.com/api/classes/foundry.canvas.layers.TokenLayer.html` conferma classe `TokenLayer` (singolare) con `setTargets(targetIds: string[]|Set<string>, options?: { mode?: "replace"|"acquire"|"release" })` ✓
    - socketlib §4.8 — `github.com/farling42/foundryvtt-socketlib` conferma `socketlib.registerModule(id) → socket.register(name, fn) → socket.executeAsGM(name, ...args)`, plus `executeAsUser`/`executeForAllGMs`/`executeForOtherGMs`/`executeForEveryone`/`executeForOthers`/`executeForUsers` ✓
    - MCP transports §4.7 — `modelcontextprotocol.io/specification/2025-03-26/basic/transports` conferma stdio + Streamable HTTP, HTTP+SSE 2024-11-05 deprecato (retrocompat-only) ✓
    - AssemblyAI §4.5 — `assemblyai.com/pricing` conferma Universal-Streaming $0.15/h ✓
    - BLE 4.2 DLE §7.4b.6.1.2 — multiple sources (TI BLE-Stack docs, Punch Through, Novel Bits) confermano DLE da BT 4.2, PDU 251 byte, ATT MTU 247, payload utile 244 byte (251 − 4 L2CAP − 3 ATT) ✓
  - **IMPORTANT residual fixes (drift v0.9.6 trovati in questa passata)**:
    - **§3.2 R1 gesture terminology**: v0.9.6 aveva inserito nota "terminologia ufficiale Even: tap, swipe, press; spec usa scroll/long-press come sinonimi". **Falso**: la pagina ufficiale `evenrealities.com/smart-ring` cita testualmente "tap, scroll, long-press gestures" — non c'è remap, terminologia coincide. Nota riformulata in conferma 1:1 (no swipe/press, sono allucinazione cross-check precedente).
    - **§3.2 reference URL**: era `evenrealities.com/products/r1` (page d'acquisto, sparse di specs). Updated a `evenrealities.com/smart-ring` + `support.evenrealities.com/specs` (le due pagine che contengono i numeri citati).
    - **§4.5 Deepgram Nova-3 pricing**: v0.9.6 aveva fissato "streaming $0.0077/min". Direct fetch attuale da `deepgram.com/pricing` mostra Nova-3 Mono **streaming PAYG $0.0048/min** / pre-recorded PAYG $0.0077/min. Fonti terze (brasstranscripts, smallest.ai, costbench) citano ancora $0.0077/min anche per streaming → **contraddizione tra source-of-truth e blog**. Probabilmente listing change recente o tier confusion in fonti terze. Soluzione: hedge esplicito + raccomandazione di leggere live da pricing API anziché hard-code.
  - **Audit method**: 7 WebFetch/WebSearch in parallelo contro upstream sources (Even Hub × 2, Even smart-ring page, foundryvtt.com API v13, github.com/foundryvtt/dnd5e source + wiki, modelcontextprotocol.io, assemblyai.com, deepgram.com, multiple BLE references). 90%+ dei claim re-verificati esatti; 3 IMPORTANT residui patchati. **Zero CRITICAL** in questa passata — la rivalida v0.9.6 aveva già intercettato i drift maggiori.
  - **Bump v0.9.6 → v0.9.7**.
- **2026-05-10 (v0.9.6)** — Online cross-check rivalidazione (4 CRITICAL + 9 IMPORTANT).
  - **CRITICAL drift fixes (errori materiali rispetto al 2026-05 upstream state)**:
    - **§3.4 Foundry minimum version** — era "v12 testato, v13 raccomandato". **Falso**: dnd5e 5.x richiede `minimum: v13.347` / `verified: v14`. v12 non più supportato da dnd5e 5.0.x. Aggiornato.
    - **§4.7 + §5.7.1 MCP transports** — era "stdio + SSE (per client remoti)". **Obsoleto** dal 2025-03-26: la spec MCP definisce ora **stdio + Streamable HTTP**. HTTP+SSE legacy deprecato. Aggiornato + nota retrocompat.
    - **§11.5.7 Option B sharp** — claim "produce 4-bit indexed PNG one-call" **errato**. Sharp PNG output è sempre 8/16 bpp; `bitdepth` 1/2/4 esiste solo per TIFF. Pipeline corretta: `sharp → palette 8bpp → upng-js depth:4` post-pass. Tabella riscritta.
    - **§8.2 worked example MidiQOL signature** — `completeActivityUse(activity, { targetUuids, workflowOptions })` **errata struttura nesting**. Firma corretta: `{ targetUuids, midiOptions: { workflowOptions } }`. Il `workflowOptions` è nidificato dentro `midiOptions`. Esempio aggiornato.
  - **IMPORTANT precision fixes**:
    - **§3.2 R1 gesture terminology** — terminologia ufficiale Even Realities è "tap, swipe, press"; spec usa "scroll/long-press" come sinonimi (nota equivalenza aggiunta).
    - **§3.4 v13 targeting** — `TokensLayer#setTargets` corretto a **`TokenLayer#setTargets`** (singolare `Token`).
    - **§3.4 hooks** — aggiunti i moderni **`preRollAttackV2`/`preRollDamageV2`** (V1 deprecati in dnd5e 5.x).
    - **§3.4 attività** — `OrderActivity` annotata come "semi-privata, Group Actor internal" — non documentata wiki ufficiale.
    - **§4.5 AssemblyAI prezzo** — era "$0.005/min". Reale **$0.0025/min** ($0.15/h) — sovrastima ~2× corretta.
    - **§4.5 Deepgram Nova-3** — era "P50 ~500 ms, $0.0043/min". Reale **TTFT <300 ms**; **streaming $0.0077/min** ($0.0043/min è il tier batch separato).
    - **§7.4b.6.1.2 Layer 5 BLE DLE** — "BLE 5.x DLE" → **"BT 4.2+ DLE"** (DLE introdotta in 4.2, ereditata in 5.x). Label "5.x" mantenuta come marker convenzionale.
    - **§11.5.7 image-q supply-chain note** — npm `image-q@4.0.0` esiste ma repo GitHub ha tag massimo `v2.1.2` (2023-10). Aggiunta nota su pin-by-hash o fork interno.
    - **§4.7 MCP TS SDK** — chiarita distinzione spec-level (JSON Schema sul wire) vs SDK-level (Zod/Standard Schema serializzato a JSON Schema).
  - **Internal consistency fixes (post-cross-check, 3 inconsistenze residue investigate)**:
    - **§3.1 container budget table** — drift obsoleto post-v0.7 (raster default MVP). Riga "Map base = 1 text" + "0 image, container liberi" era corretto SOLO per glyph mode. Riscritta tabella in due colonne (raster MVP / glyph fallback): raster = 4 text + 4 image (saturato); glyph = 5-8 text + 0 image (image budget libero). Nota allocazione dinamica §7.5.8 mantenuta.
    - **PG d'esempio "Thorin" — riallineamento math (Wizard 3 → Wizard 5)**: il mockup aveva "Wizard 3 (multi)" ma slot 3° presenti, prepared 5/8, Fireball, prof +3 — combinazione **matematicamente impossibile in 5e** (Wizard 3 ha 4/2 slot max, no 3°, prep 6 max). Cambio a **Fighter (Champion) L3 / Wizard L5** (multiclass total L8): ora coerente con prof +3, slot 4/3/2 (1°/2°/3°), prepared 5/8, Fireball castable. Modifiche:
      - §7.5.2 banner Tab Main → "Fighter (Champ) 3 / Wizard 5", XP 34000/48000 (era 6500/14000 di L5), Hit Dice "3/3 d10 + 3/5 d6"
      - Status HUD corner card (14 mockup): "THORIN F3/W5" (era "Ftr5"), slot 1°×4/2°×3/3°×2 (era 4/2/3 inverso)
      - §7.5.5 Tab Spells: "Wizard 5 (multi)", LEVEL 2 slots 1/3, LEVEL 3 slots 0/2
      - §7.5.6 Tab Feats: rimosso Extra Attack (sblocca Ftr5, ora Ftr3), aggiunta sezione "CLASS · Wizard (Evocation) L5" con Spellcasting+Arcane Recovery+Sculpt Spells. Aggiornato `[unlocked at Ftr5/9/Wiz6]` per chiarire feature future
      - §7.8 Spellbook overlay: L2 slots 1/3, L3 slots 0/2
      - §8.1 worked example: Thorin nota classe corretta a "Fighter L3 / Wizard L5"
    - **§13 references URL r1**: agente affbcd30 aveva segnalato 404 su `evenrealities.com/products/r1` — verifica diretta WebFetch ritorna **HTTP 200 valido** (page title "Buy Even R1 Smart Ring | Select Size & Purchase"). Falso allarme, nessuna modifica necessaria.
  - **Audit method**: 4 agenti web in parallelo (Even hardware, Foundry/dnd5e API, MCP/socketlib/MidiQOL, libs/STT/BLE) cross-checking contro upstream sorgenti ufficiali (hub.evenrealities.com, GitHub foundryvtt/dnd5e 5.3.x, modelcontextprotocol.io, npm registry, AssemblyAI/Deepgram pricing). 90%+ dei claim confermati ✓; documentati i drift critici. Plus 3 inconsistenze interne investigate (1 falso allarme, 2 fix applicati).
  - **Bump v0.9.5 → v0.9.6**.
- **2026-05-10 (v0.9.5)** — Final audit polish (5 IMPORTANT items).
  - **Line 3093 stale "TBD §10.0.9"**: §10.0.9 ora definito (Display Refresh Latency test) → "TBD" → "(target §10.0.9)".
  - **§12.A item 10 PIXI extract under load**: era "Test in §10.0 dedicated TBD" senza slot esistente. Reclassificato come **Phase 4 internal performance test** (non Phase 0 dedicated).
  - **§11.5.7 xxhash-wasm pinning consistency**: aggiunta nota convention `^1.1.0` (package.json) ↔ `v1.x` (prosa) sono equivalenti semver-compat. Rimuove confusione lettore.
  - **§11.5.7.1 wording softening**: "precondizione realistica per 5 fps standard" → "precondizione per 15 fps stretch; nice-to-have raccomandato per 5 fps standard". Allineato con §7.4b.6.1.4 worst-case che dice 3-5 fps achievable senza Layer 5.
  - **§11.5.7.1 fps numbers scope annotation**: aggiunta nota esplicita che "3-7 fps sustained / 8-12 fps burst" assume Layer 1+3+4+6 only; Layer 2+5 unlocks aggiungono ulteriore tier (15-20 fps achievable). Evita reader perception di regression vs target 5/15.
  - **Bump v0.9.4 → v0.9.5**.
  - **Audit summary post-v0.9.5**: documento internamente coerente, 0 CRITICAL pending. 5 NICE-TO-HAVE polish (footer cross-refs, ADR rename) deferred — non bloccano implementation kickoff.
- **2026-05-10 (v0.9.4)** — Performance benchmark + failure modes + audit fixes.
  - **§11.5.7.1 NEW Performance impact dello stack — fps gain quantificato**: risposta esplicita alla domanda "le librerie migliorano fps?". Benchmark per-stage stimato (custom JS vs library stack):
    - Compute totale: ~100-225 ms (custom) vs **~50-130 ms (lib stack)** — **30-50% reduction**
    - Resize OffscreenCanvas GPU: 3-5× speedup
    - xxhash-wasm: 5-10× speedup (WASM ~1 GB/s)
    - upng-js PNG encode: 2-3× speedup
  - **fps reali post-stack**:
    - Sustained: ~3-7 fps con stack vs ~2-5 senza → **30-40% gain**
    - Burst: ~8-12 fps con stack vs ~5-8 senza → **50-60% gain**
    - **15 fps target**: fattibile SOLO con stack + Layer 2 + Layer 5; senza stack è infattibile (compute esaurirebbe budget 66 ms/frame)
    - Memory footprint: ~3-5 MB tab — trascurabile
  - **§11.5.8 NEW Failure modes & recovery**: documenta comportamento atteso in degrado/crash:
    - Bridge/Foundry crash → offline mode + replay buffer 60s
    - BLE <50 kbps → glyph mode forzato automatico
    - R1 battery dies → modal reconnect (no fallback gesture G2 native nel MVP)
    - image-q/upng-js worker crash → automatic glyph fallback (3 retry threshold)
    - G2 firmware queue saturation → adaptive fps cap + frame skip
  - **CRITICAL audit fixes (post-v0.9.3)**:
    - Line 342 §5.7.2 broken cross-ref `§5.6.2` → **§5.3** (Tool Registry)
    - Line 1064 §7.4a opening: stale "almeno nel MVP" (contradiceva raster-default v0.7) → riformulato per riflettere glyph come fallback
  - **IMPORTANT audit fixes**:
    - Phase 0 §10.0.2 checkbox: ora formattato `Test §10.0.2 ...` per simmetria con .1/.3/.5/.6/.7/.8/.9
    - Line 1427 Layer 4 RLE TBD: risolto a "custom RLE 4-bit MVP, Phase 13 advanced compression open"
  - **Bump v0.9.3 → v0.9.4**.
- **2026-05-10 (v0.9.3)** — Library stack research + minor audit fixes.
  - **§11.5.7 NEW Raster Pipeline Library Stack**: ricerca verificata Q2 2026 sulle librerie open source per il pipeline §7.4b.4. Risultato:
    - **Option A (Foundry module browser)**: `image-q` v4.0.0 (quantize + 8 dither algorithms incl. Floyd-Steinberg/Atkinson/Bayer) + `upng-js` v2.1.0 (4-bit indexed PNG) + `xxhash-wasm` v1.x (sub-tile hash) + custom RLE 4-bit (~30 LOC). **Bundle ~90 KB gzipped**, all worker-safe.
    - **Option B (Bridge Node.js)**: `sharp` v0.34.5 (libvips one-call full pipeline, FS dither only) + `upng-js` + `xxhash-wasm` + optional `image-q` per Atkinson/Bayer fallback.
    - Skip motivati: jimp (no FS/Atkinson custom palette, no 4-bit indexed), ditherjs/floyd-steinberg/digidither (abbandonati >5 anni), pngjs/fast-png (wrong bit-depth shape).
    - Updated Phase 4 task list con cross-ref a §11.5.7 per ogni layer.
    - ADR-0006 placeholder per la decisione finale post-Phase 0.
  - **§13 References**: nuovo cluster "Raster Pipeline Libraries" con npm + GitHub links per le 4 librerie.
  - **Audit fixes (post-v0.9.2 review)**:
    - L2658 §10.0.3 GO/NO-GO: `§7.4b.6.1.4` (sub-section non esistente) → `§7.4b.6.1`
    - Phase 0 task list: aggiunti checkbox espliciti per `Test §10.0.1 R1 SDK eventi` e `Test §10.0.3 BLE bandwidth real-world` (erano impliciti)
  - **Bump v0.9.2 → v0.9.3**.
- **2026-05-10 (v0.9.2)** — Second audit pass: phase week timeline + V2 boundary leaks + numbering collisions.
  - **CRITICAL fixes**:
    - **Phase weeks shifted +1 downstream** dopo Phase 4 4-7 expansion in v0.9.1: Phase 5 (5-6→6-8), Phase 6 (6-7→7-8), Phase 7 (7-8→8-9), Phase 8 (8-9→9-10), Phase 9 (9-10→10-11), Phase 10 (10-12→11-13), Phase 11 (13-14→14-15), Phase 12 (14-15→15-16). MVP totale: 12 weeks → **13 weeks** (header roadmap aggiornato).
    - §4.2 Bridge REST surface: `POST /v1/voice` annotato come **(V2 ONLY)** — era leak MVP scope.
    - §7.2 layered table: `long=close/voice` → `long=close (o panel-action contestuale, vedi §7.14.2)` — eliminato voice leak.
    - §8.3 worked example: `Action overlay (§7.8)` → `Clarify Overlay (§7.11)` — §7.8 è Spellbook, broken cross-ref.
    - Phase 0 task: `precondizione per Phase 13 raster` → `precondizione CRITICAL per Phase 4 raster mode (MVP default)` — raster è MVP da v0.7, era stale.
    - Phase 0 expanded with 5 nuovi checkbox espliciti per §10.0.5/.6/.7/.8/.9 (era implicito che servissero).
  - **IMPORTANT fixes**:
    - §12.A item 5 marked RESOLVED via §10.0.8 (Test Concurrent Updates Queue).
    - §12.A item 6 (Display refresh) — già RESOLVED in v0.9.1 ✓.
    - §12.B/C/D renumbered to eliminate collision: §12.A items 1-10 (was 1-7), §12.B 11-15 (was 8-11), §12.C 16-19 (was 12-16), §12.D 20-28 (was 17-25).
    - §12.B aggiunto MidiQOL `completeActivityUse` (item 12) + cross-ref a §10.0.10 P2 Deferred.
  - **Bump v0.9.1 → v0.9.2**.
- **2026-05-10 (v0.9.1)** — Critical-review pass post-v0.9: cross-reference + frame-rate consistency.
  - **CRITICAL drift fixes**:
    - Phase 4 task list cross-refs §10.0.7/.8 (wrong) → **§10.0.6/.7** (Layer 2 + Layer 5 unlock tests)
    - §7.4b.6.1 Layer 2 vincolo cite §10.0.2 (wrong) → **§10.0.6**
    - §7.4b.6.1 Layer 5 prose cite §10.0.3 (wrong) → **§10.0.7**
    - §7.4 default view ASCII footer "1 fps event-based" → **"5 fps standard / 15 stretch"**
    - §7.4 default view "Refresh rate: 1-2 fps" prose → **"5 fps standard, 8 fps burst, 15 fps aspirational, 0.3 idle (Layer 6 adaptive)"**
  - **IMPORTANT consistency fixes**:
    - §7.4b.6 conclusion relabeled "naïve baseline (pre-Layer)" + forward ref to §7.4b.6.1
    - §7.4b.4 step summary 1-3 fps annotated as "naïve" with forward ref to layered strategy
    - §10.0.3 GO/NO-GO: "1-3 fps confermato" → "5 fps standard committed"
    - §10.0.5 Branch A: "1-3 fps" → "5 fps std + Layer 1+3+4+6, 15 fps stretch via Layer 2+5"
    - §12.A item 4: rewritten to v0.9 commitment (5 fps committed, 15 aspirational)
    - §12.A item 6: marked RESOLVED via §10.0.9 test
    - §12.D item 21: updated D&D dual-support wording
    - §7.5 intro: added cross-ref to §11.5.1 dual-edition support
    - §5.4 file layout: added 6 new render primitives (image-tile, dither, subtile-delta, rle, static-cache, adaptive-fps)
    - **§10 Phase 4 weeks**: 4-6 → **4-7** (added 6 layer scope) — total MVP weeks recomputed
    - §7.4b.10 decisione MVP: added bullet for 6-layer strategy + Phase 0 dependency map; relabeled "(v0.7 flipped, v0.9 layered)"
    - §12.A: added 3 new open questions (Layer 4 RLE effectiveness, Layer 3 static classification, PIXI extract under load)
  - **Bump v0.9 → v0.9.1**.
- **2026-05-10 (v0.9)** — 15 fps target via 6-layer optimization stack + dual-edition D&D support.
  - **§7.4b.6.1 riprogettato**: target frame rate cambiato da "1-3 fps MVP" a "**5 fps standard / 15 fps aspirational**". Strategia stratificata in **6 layer cumulative**:
    - **Layer 1**: per-tile delta hashing (xxHash) — Phase 4 base
    - **Layer 2**: sub-tile delta encoding 20×20 px (50 sub-tile/tile, 200 total) — conditional su partial-update API
    - **Layer 3**: static layer caching (background dirty flag) — riduce CPU 70%
    - **Layer 4**: custom RLE per 4-bit greyscale uniform regions — 1.5-25× compression
    - **Layer 5**: BLE 5.x DLE detection + opt-in — 3.5-5× bandwidth se supportato
    - **Layer 6**: adaptive frame rate state machine — battery friendly
  - **Performance budget combinato** documentato per 4 scenari: single token move (15 fps achievable), 3-token combat (15 fps sustained), scene transition (graceful 6 fps dip), BLE 4.x worst-case (5-8 fps cap).
  - **§10.0 Phase 0 estesa con 4 nuovi test** per validate 15 fps fattibilità:
    - §10.0.7 Test partial-update API (Layer 2 unlock)
    - §10.0.8 Test BLE 5.x DLE (Layer 5 unlock)
    - §10.0.9 Test concurrent updates queue
    - §10.0.10 Test display refresh latency
  - **§10 Phase 4 expanded**: tutti i 6 layer come task espliciti, conditional unlock per Layer 2 e 5 in base a Phase 0 results.
  - **§11.5.1 D&D edition target ESTESA**: ora **dual-support** PHB 2014 **AND** PHB 2024 (non più "2014 primary, 2024 compat"). Setting `core.modernRules` distingue. Test coverage Phase 5 include entrambe edition. Phase 5 sub-task per testare ogni mockup con world 2014 e 2024.
  - **Bump v0.8 → v0.9**.
- **2026-05-10 (v0.8)** — Phase 0 validation protocol + P0/P1/P2 design decisions resolved.
  - **§10.0 Phase 0 Validation Protocol (NEW)**:
    - §10.0.1 Test R1 SDK Events — procedure + GO/NO-GO criteria
    - §10.0.2 Test `updateImageRawData` Format — 3 formati di test (PNG indexed, raw 4-bit BE, raw 4-bit LE)
    - §10.0.3 Test BLE Bandwidth Real-World — 1 minuto sustained, p95/p99
    - §10.0.4 Test Audio Capture (V2 only)
    - §10.0.5 GO/NO-GO Decision Tree — Branch A (full MVP) / B (degraded) / C (glyph-only). Decision documented in ADR-0005 prima di Phase 1
    - §10.0.6 P2 Deferred Validations table (MidiQOL, PF2e, Italian STT, dnd5e v6.x, 15 fps stretch — assigned to specific phases)
  - **P1 design decisions risolte**:
    - **§7.4b.8 Server topology**: MVP = Option A (player-extract). Option B (headless Puppeteer) → Phase 13 stretch when multi-player.
    - **§7.5.8 Image container budget conflict**: allocazione dinamica — 4 tile mappa di default; quando Sheet/Combat-target overlay è aperto, 3 tile + 1 portrait (degradazione bottom-right tile, restored at close).
    - **§7.4b.6.1 15 fps target**: 1-3 fps event-based confermato MVP. 15 fps fattibile **SOLO** se Phase 0 conferma BLE ≥1 Mbps + DLE BLE 5.x + custom RLE compression — ambition non target garantito; default Phase 13 stretch è 5-8 fps burst.
    - **Multi-player**: Phase 13 V2 stretch confermato (single-player first → field-test → multi).
  - **§11.5 Project-level Decisions (NEW)**: edition target (D&D 5e 2014 primary), license (MIT), deployment (Docker Compose homelab + cloud stretch), authentication (bearer opaque token 24h rotation), storage (in-memory LRU MVP / Redis stretch), branch strategy (trunk-based + Changesets).
  - **§12 Open Questions cleanup**: marked resolved (12.D items 17-20 + new 21-25). Remaining open: empirical Phase 0 measurements (12.A), Foundry/dnd5e API empirical validations (12.B), V2 voice-specific (12.C).
  - **Bump v0.7.1 → v0.8**.
- **2026-05-10 (v0.7.1)** — Critical-review pass: D&D 5e + Foundry/dnd5e + MCP/socketlib + internal consistency.
  - **Tier 1 (rompevano il flip v0.7 della v0.7)**:
    - §7.4b decisione callout (line ~1192) era ancora "Glyph default MVP, Raster Phase 13" — flippato a "Raster default MVP, Glyph fallback"
    - §3.2 R1 mapping table: long-press era "PTT vocale" (v0.3 stale) — ora "apri Quick Action menu"
    - Capability handshake `panelsAvailable` listava `voice`/`clarify` (V2-only) — rimossi, ora MVP-coerente
    - Boot splash "panels available: 7" → 5 (sheet/combat/log/spellbook/inventory)
    - §5.4 file layout `voice-modal.js` come page MVP — flagged V2 only, aggiunto `quick-action.js` per MVP
    - §7.13a heading "sostituisce Voice modal del MVP" (auto-contraddittorio) → "MVP — long-press R1 entry point"
  - **Tier 2 (Foundry/dnd5e/MCP/socketlib API accuracy)**:
    - `AbilityTemplate.fromActivity()` ritorna **array** `AbilityTemplate[] | null`, non un singolo MeasuredTemplate (correzione §3.4)
    - Skills `proficient` valori sono **0 / 0.5 / 1 / 2** (none / half / proficient / expertise) non 0/1/2 — half-prof per Jack of All Trades + Remarkable Athlete
    - **dnd5e ≥ 5.1 ha deprecato** `item.system.preparation.{mode,prepared}` → ora `item.system.method` (string) + `item.system.prepared` (numerico). Spec §7.5.8 mapping table aggiornata
    - **socketlib API corretta**: pattern `socket = socketlib.registerModule(id); socket.register(name, fn); socket.executeAsGM(name, args)` — NON `socketlib.executeAsGM` static
  - **Tier 3 (D&D 5e PHB/SRD accuracy)**:
    - Bless duration: era "1 turn left" — corretto a **"7 rounds left · conc Lyra"** (Bless è 1-minute concentration = 10 rounds)
    - Status HUD condition "Blessed" → "Bless (7r)" (è uno spell effect, non condition PHB)
    - §7.5.6 Indomitable rimosso da Fighter L5 sheet (Indomitable è feature **L9**, non L5) — annotato `[unlocked at L9]`
    - §7.5.6 Action Surge: "free, 1 extra action" → "(no action), 1 extra action" — 5e non ha "free actions"
    - §7.5.6 Mountain Dwarf Armor Training: "medium armor proficiency" → "**light + medium** armor proficiency" (PHB)
    - §7.5.5 Wizard 3 multiclass spellcasting: spell DC 13 → **14**, atk +5 → **+6** (Total L8 = prof +3, era off-by-one)
    - §8.2 Two-Weapon Fighting "feat" → "Fighting Style" (PHB p.72; il feat è "Dual Wielder"). Aggiunta nota su Defense fighting style → no STR mod su scimitar damage
    - §6.1 `ki` rimossa per Fighter (Ki è Monk-specific) → schema generico `classFeatures` con `secondWind`/`actionSurge`
  - **Aggiunta §7.4b.6.1 Frame rate target analysis**: risposta esplicita alla domanda "15 fps fattibile?". Conclusione: **NO sustained con Approach D 400×200** sul BLE attuale; possibile in burst su Phase 13 con DLE BLE 5.x + RLE compression custom. MVP target 1-3 fps event-based.
  - **§12 Open Questions completamente ristrutturato**: 4 cluster (12.A Hardware/SDK Phase 0, 12.B Foundry/dnd5e, 12.C Voice/AI V2, 12.D Design decisions pending), 20 question esplicite (era 7 generiche). Tutti i gating Phase 0 marcati CRITICAL.
  - **Bump v0.7 → v0.7.1**.
- **2026-05-09 (v0.7)** — Raster mode promoted to MVP default (swap with glyph).
  - **§7.4 Default View riscritto**: ora mostra **raster mode** come default MVP (era glyph). Esplicitato il mode selector `view.map.mode = "raster" | "glyph"` con default `"raster"`. Vincolo hardware 400×200 px max documentato esplicitamente (non è "full-screen" — è il massimo possibile con 4 image container 200×100).
  - **§7.4b.7 ora mostra glyph mode** come fallback alternativa (era raster mode mockup, spostato in §7.4 default).
  - **§7.4b.10 decisione flipped**: MVP = raster (Approach D Maximum Raster), glyph = fallback parallelo. Phase 0 `updateImageRawData` validation diventa **CRITICAL precondition**.
  - **§10 Phase 4 espanso** (Week 4-5 → Week 4-6): include implementazione completa pipeline raster (canvas extract → resize → FS dither → tile → encode → BLE push) + pipeline glyph fallback in parallelo. Dither algorithms FS/Atkinson/Bayer con FS default. Mode toggle via Quick Action `[M] Map ctrl`. Tutti gli step della pipeline 9-step §7.4b.4 dettagliati come task.
  - **§10 Phase 13 ridotto**: rimosso "Raster map streaming" (ora MVP). Restano: Sheet portrait, token portrait, Dice So Nice raster, bridge headless Foundry, advanced dither algorithms.
  - Risk mitigation esplicita: se Phase 0 rivela `updateImageRawData` non funzionale → degrade graceful a glyph-only MVP.
  - Bump v0.6.1 → v0.7. Boot splash + roadmap header aggiornati.
- **2026-05-09 (v0.6.1)** — Critical-review consistency pass.
  - **§7.13 Interaction Model** ridotto a sintesi di alto livello che rimanda a §7.14 come riferimento canonico (eliminava duplicazione + contenuto stale: scroll dx/sx in pan, chip-bar interactivity, "open question §7.13" self-reference, "long=voice" come default).
  - **§7.6 Combat overlay**: rimosso quick-action `[V]oice` (era V2-only, fuori scope MVP). Quick-actions MVP corrette: `[A][S][I][M]`.
  - **Footer hint "long=voice"** sostituito ovunque con **"long=quick"** (8 occorrenze: §7.2 layered table, §7.4 default view, §7.6 combat, §7.7 log, §7.8 spellbook, §7.9 inventory, §7.10 voice state-3 underlying view).
  - **§10 Phase 0**: aggiunte validazioni Phase 0 mancanti — `updateImageRawData` formato (precondizione per Phase 13 raster + Sheet portrait + Dice So Nice) e container budget pratico.
  - **§10 Phase 5**: espanso Sheet con 6 sub-task (era 4) — aggiunti Tab Inventory + Tab Spells, fixate references rinumerate (Feats 7.5.6, Bio 7.5.7, Mapping 7.5.8). Combat panel quick-actions aggiornate `[A][S][I][M]`. Aggiunto Dice Toast §7.15.2 task.
  - **§10 Phase 13**: raster streaming bullet aggiornato — Approach D Maximum Raster (era Approach C hybrid), 400×200 px effective (era 100×60), pipeline 9-step §7.4b.4 (era generico). Aggiunto Dice So Nice raster stream task.
- **2026-05-09 (v0.6)** — Mode selector + Sheet 6-tab + Navigation map + Dice display + Doom-style raster pipeline.
  - **§7.4b** riscritto: rimosso "hybrid raccomandato" → introdotto **mode selector user-side** (`view.map.mode = "glyph" | "raster"`), i due mode si escludono per massimizzare area
  - **§7.4b.2 inspirazione Doom-on-exotic-devices**: citati DOOM on a watch (jborza), fbDOOM, rp2040_doom_1b, Atari ST port, Ditherpunk
  - **§7.4b.3 Approach D Maximum Raster**: 4-tile 2×2 = 400×200 px effective (massimo teorico hardware G2)
  - **§7.4b.4 streaming pipeline 9 step** (capture→resample→greyscale→quantize→tile→delta→encode→wire→apply) con budget di tempo per step
  - **§7.4b.5 dithering algorithm comparison**: Floyd-Steinberg default + Atkinson "retro" + Bayer 8×8 fast + blue noise aspirational
  - **§7.5 Sheet expanded a 6 tab**: nuovo ordine **Main → Skills → Inv → Spells → Feats → Bio**
  - **§7.5.4 Tab Inv (NUOVO)**: replica fedele tab Inventory Foundry con currency strip, encumbrance bar, sezioni EQUIPPED/CONSUMABLES/EQUIPMENT/CONTAINER, container nesting
  - **§7.5.5 Tab Spells (NUOVO)**: replica fedele tab Spells Foundry con header spellcasting (DC/atk/prepared count), filter bar, slot tracker per livello, indicatori prepared/known/at-will
  - Renumbering: 7.5.4 Feats → 7.5.6, 7.5.5 Bio → 7.5.7, 7.5.6 Mapping → 7.5.8 (esteso con Inv/Spells/Currency/Containers data binding)
  - Tab strip uniformata: pattern `[ XXX ]` ↔ `[▶XXX ]` (stessa larghezza, swap leading-space↔▶)
  - **§7.14 Complete Navigation Map (NUOVA)**: state machine ASCII completo con tutti gli screen, button mapping per ogni schermata, **verification checklist 10×** (every screen reachable + closable), edge cases (bridge down, R1 disc, ecc.)
  - **§7.15 Dice & Roll Result Display (NUOVA)**: Approach A Toast pop-up (MVP) — mockup completo; Approach B Dice So Nice raster stream (V2 stretch) — pipeline riusa §7.4b.4
  - §7.1 design language clarified: tutti i panel sono popup/finestre fluttuanti come Foundry desktop
  - §13 references esteso: Doom ports + Ditherpunk + dithering algorithms + Dice So Nice
  - Bump: v0.5 → v0.6
- **2026-05-09 (v0.5)** — Map rendering pipeline + Foundry-like Sheet + raster streaming feasibility.
  - Aggiunto: **§7.4a Map Rendering Pipeline** — 3-stage extract/transform/render, glyph dictionary completo (terreno, token, effetti, target), token rendering rules, AoE template animation 2-frame blink, FoW & lighting tier mapping, update strategy con delta diff, worked example data→glyphs
  - Aggiunto: **§7.4b Raster Streaming Feasibility** — analisi 3 approcci (single image, tiled, hybrid), conversion pipeline Foundry canvas → 4-bit greyscale dithered, bandwidth math (BLE bottleneck), performance/battery cost, mockup hybrid concept con scene-overview thumbnail in corner, open questions Phase 0, decisione: differito a Phase 13 V2 stretch
  - Riscritto: **§7.5 Sheet overlay completamente** in stile Foundry dnd5e v5.x — multi-tab interno (Main/Skills/Feats/Bio), iconografia Unicode mappata da Foundry icons (♥⛨⚡⚔★◈◉○★⚀▰▱▓░), portrait via image container 100×60 (feature flag), data model mapping table verso `actor.system.*`
  - Aggiornato §10 roadmap: Phase 5 esplicita Sheet multi-tab + data binding; Phase 13 aggiunge raster streaming + token portrait image
  - Bump: v0.4 → v0.5
- **2026-05-09 (v0.4)** — Voice/AI deferred to optional V2 module via MCP server.
  - Cambiato: **MVP non include voice/AI**. Le azioni Foundry sono eseguite manualmente via R1 (tap, scroll su panel) — flow deterministico.
  - Aggiunta: **§5.7 `foundry-mcp`** — modulo opzionale standalone che espone i tool Foundry secondo Model Context Protocol; consumabile da qualunque client LLM (Claude Desktop, Claude Code, futuro). Auth condivisa con bridge.
  - Riformulato: **§5.3 → Tool Registry** (parte del Bridge, sempre attivo); §5.3 vecchia "GM Agent" rimossa — il LLM vive nel client MCP, non dentro il Bridge.
  - Marcato V2 OPZIONALE: §4.5 STT, §4.6 LLM, §7.10 Voice modal, §7.11 Clarify modal, §8 Voice examples
  - Aggiunto: **§7.13a Quick Action Menu** — long-press R1 nel MVP apre una list-modal per scelta panel/azione (sostituisce il long-press → Voice modal della v0.3)
  - Riorganizzato §10 Roadmap: Phase 0–10 = MVP (12 settimane), Phase 11–13 = V2 opzionale post-MVP (MCP server + voice tuning + stretch)
  - Aggiunto: §13 References — MCP spec, SDK, server registry
  - Rimosso: panel `voice/` e `clarify/` da `src/panels/` MVP
  - Aggiunta: ADR-0004 voice via MCP not internal
- **2026-05-09 (v0.3)** — Layered UI model + Modular architecture.
  - Cambiato: **mappa = base layer permanente**, **status HUD = corner card sempre visibile**, altre viste come **overlay panel** sopra la mappa (modello Foundry desktop)
  - Aggiunta: **§5.6 Modular & Future-Proof Architecture** completa — boundary map, plugin contracts (Panel/Tool/Provider/FoundryAdapter), capability negotiation handshake, protocol versioning policy, settings hot-reload, telemetry contracts, test pyramid, update strategy, backward compat promise, monorepo layout, ADR convention
  - Riscritto: **§7 UI/UX completamente** con il nuovo modello layered
  - Aggiunti mockup nuovi: §7.4 Default view (map+HUD), §7.5 Sheet overlay, §7.6 Combat overlay, §7.7 Log overlay, §7.8 Spellbook overlay (NEW), §7.9 Inventory overlay (NEW), §7.10 Voice 3-state aggiornato (toast banner), §7.11 Clarify modal, §7.12 Boot splash con capability info, §7.13 Interaction model esplicito
  - Aggiunta: §3.1 container budget allocation table per main page
  - Aggiunta: §5.4 G2 App file layout panel-based (panels/, providers/, layers/)
  - Riorganizzato: roadmap da 10 a 11 phase con focus modularità (Phase 1 Foundation = monorepo+ADR, Phase 5 Panel Plugin System)
  - Aggiunta: cross-cutting checklist (ADR, changelog, coverage, dashboards)
- **2026-05-09 (v0.2)** — Riscrittura completa.
  - Aggiunto: integrazione **R1 ring** (SDK gesture map, mapping → azioni)
  - Aggiunto: **GM Agent** — pipeline STT → LLM tool calling → Foundry execution
  - Aggiunto: write-side Foundry API (Activity system, MidiQOL, AbilityTemplate)
  - Corretto: limiti **image container 200×100** → mini-mappa text-grid
  - Corretto: limiti **list container 20×64**
  - Aggiunto: design language **Monitor HUD** (bezel ASCII, frame coerente)
  - Aggiunto: **mockup ASCII** completi per ogni pagina (Sheet, Combat, Map, Log, Voice, Action, Boot)
  - Aggiunto: **esempi vocali** worked-out (Fireball gruppo, dual-wield, clarify)
  - Aggiunto: privacy & security section
  - Esteso: roadmap da 5 a 10 phase con milestone Voice + R1
  - Esteso: risk assessment con voci R1 SDK, LLM ambiguity, costi cloud
  - Esteso: open questions per validazione futura
- **2026-05-09 (v0.1)** — Documento iniziale, scope MVP, technical constraints G2 + Foundry read-side
