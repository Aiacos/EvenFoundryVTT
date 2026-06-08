# Requirements: EvenFoundryVTT — Milestone v0.10.0 "Raster UI Substrate"

**Defined:** 2026-06-05
**Core Value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica — e ora l'intera UI è renderizzata come immagini raster compositate, con full controllo tipografico, non più subordinata al font fisso 27px dell'SDK.

> Anchor: ADR-0013 (+ Amendment 1 da scrivere) · `.planning/TODO-hud-raster.md` · `.planning/research/SUMMARY.md` (2026-06-05). Decisioni locked dall'utente 2026-06-05: compositing su canvas unico (forzato dai 4 image-container); render mix statico+dinamico; estendere subito schema feats/bio; **delta loop + promozione a default INCLUSI** in v0.10.0; xxhash delta DEVE precedere la promozione (vincolo BLE).
>
> **⚠ Correzione INV-2 (verificata 2026-06-05 su `hub.evenrealities.com/docs/guides/display`):** gli image-container G2 sono **max 4 per pagina, ognuno 20–200px largo × 20–100px alto**. Quindi la superficie raster è **400×200 (4 tile 200×100), NON 576×288** — lo schermo pieno non è riempibile di immagini (il simulatore NON applica i limiti hardware, per questo il PoC 288×144 passava). Architettura corretta: **UNA regione raster condivisa 400×200**, i 4 image-tile fissi nello schema-pagina, contenuto (mappa/scheda/turni/status compositati nel nostro canvas) cambiato via `updateImageRawData` (flicker-free; `rebuildPageContainer` darebbe flicker). `updateImageRawData` **non ammette invii concorrenti** → i 4 tile vanno serializzati. Capture-invariant via un container TEXT (può essere full-screen) con `isEventCapture:1` dietro i tile. Margine schermo residuo (oltre i 400×200) = vuoto/green o striscia text. OffscreenCanvas/Worker/FontFace non sono documentati → assunzioni WebView con fallback main-thread.

## v1 Requirements

Requirements for milestone v0.10.0. Each maps to exactly one roadmap phase.

### Raster Compositor (RAST) — *fondamento; tutto il resto dipende da qui*

- [ ] **RAST-01**: `LayerManager` composita i layer su un singolo canvas **400×200** (regione raster condivisa) — ogni layer disegna sulla propria `OffscreenCanvas`, il compositor le combina in z-order via `drawImage`, e consegna l'RGBA master alla pipeline `buildHudTiles`/`pushHudTiles` come **4 tile 200×100** → `updateImageRawData` **serializzati** (no invii concorrenti). Lo schema-pagina dei 4 image-container è FISSO; il cambio pannello ri-renderizza gli stessi tile (flicker-free), niente `rebuildPageContainer` per-frame. (Geometria/posizionamento esatto dei tile nei 576×288 = decisione del compositor/UI phase; baseline 2×2 = 400×200.)
- [ ] **RAST-02**: La capture-invariant (INV-5) è preservata in modalità canvas tramite un container testo **full-screen (576×288)** con `isEventCapture:1` (`hud-capture`) **dietro** i 4 image-tile (l'esempio first-app dei doc usa un text container 576×288 come capture; lo zero-size NON è documentato), così le gesture R1 continuano a essere instradate mentre i 4 image-tile renderizzano.
- [ ] **RAST-03**: L'audit del budget container opera in modalità canvas a budget fisso (5 container: 4 image-tile + 1 capture) senza falsi `capture_invariant_violated` / budget-overflow durante mount/destroy/bundle.
- [ ] **RAST-04**: Il path glyph/text coesiste invariato — un flag `renderMode: 'canvas' | 'glyph'` seleziona lo schema-pagina e se invocare il compositor; in modalità glyph i layer text sono byte-identici a oggi (fallback BLE-degraded, ADR-0005 Branch A). Lo switch di modalità è atomico (`bundle`).
- [ ] **RAST-05**: **ADR-0013 Amendment 1** ratifica il compositor model (per-layer OffscreenCanvas → drawImage), la re-mappatura capture-container, la budget-mode canvas, la coesistenza glyph e il selettore di schema in `_flushPage` — scritto PRIMA dell'implementazione.

### Render Substrate & Fonts (RFONT)

- [ ] **RFONT-01**: Il font pixel **VT323** (`@fontsource/vt323`, self-hosted ~10KB WOFF2) è caricato nel contesto canvas/Worker con una **fallback chain** try/catch a `monospace` di sistema (incertezza `self.fonts` su WKWebView Worker iOS 16); il font è risolto prima della prima frame.
- [x] **RFONT-02**: Il chrome statico (cornici, label, tab strip, sfondi) è **pre-bakato una volta** in cache `ImageBitmap` e compositato sotto il contenuto dinamico a ogni frame (mix statico+dinamico), senza re-render per-frame del chrome.
- [x] **RFONT-03**: I dati dinamici (HP, slot, turni, condizioni) re-renderizzano **solo il proprio layer** su `character.delta` / `combat.delta` riusando `hud-live-render.ts`, poi ricompositano — non si ridisegna l'intero canvas se solo un layer cambia.

### Raster Character Sheet (RSHEET)

- [x] **RSHEET-01**: La scheda PG è renderizzata come **pannello raster overlay z=2** sulla mappa, con i 6 tab (Main · Skills · Inventory · Spells · Features · Biography) disegnati su canvas con densità glanceable (controllo tipografico nostro, non i ~10 righe del 27px SDK).
- [x] **RSHEET-02**: La navigazione tab + apertura/chiusura del pannello scheda funzionano via gesture R1 (press/double-press/scroll, no long-press) sulla scheda raster, preservando la semantica gesture esistente (`panel-gesture-bus`).
- [x] **RSHEET-03**: L'**immagine portrait** del personaggio è renderizzata (greyscale-dithered) dentro la scheda, dimensionata per la glanceability, fetch async-una-volta (riusa l'infra portrait-override di `MapBaseLayer`).

### Raster Combat Tracker (RCOMB)

- [x] **RCOMB-01**: Il combat tracker / turni è renderizzato come **pannello raster overlay z=2** sulla mappa (ordine iniziativa, highlight turno corrente, HP, concentrazione, quick-action bar), preservando il comportamento gesture esistente (finestra scorrevole 5 combattenti).

### Sheet Data Extension (RDATA) — *estese atomicamente coi rispettivi renderer*

- [x] **RDATA-01**: `CharacterSnapshotSchema` porta `class` (+ reader `foundry-module`) — il tab Main mostra classe/livello reali.
- [x] **RDATA-02**: `CharacterSnapshotSchema` porta `initiative` + `speed` (+ reader) — surfacciati nel tab pertinente al posto di placeholder.
- [x] **RDATA-03**: `CharacterSnapshotSchema` porta `feats[]` (`{category, name, isOrigin, description}`) dal reader `foundry-module` (`actor.items` filtrati) — il tab Features mostra feat reali invece della fixture `DEFAULT_FEATS` hardcoded.
- [x] **RDATA-04**: `CharacterSnapshotSchema` porta `biography` (personality/ideal/bond/flaw/backstory) dal reader — il tab Biography mostra bio reale invece del testo hardcoded.
- [x] **RDATA-05**: `CombatantSchema` porta `ac` (+ read path nel combat reader) — il combat tracker mostra l'AC reale invece del placeholder `' --'`.

### Delta Loop & Promotion (RPROMO) — *delta DEVE precedere la promozione (vincolo BLE)*

- [x] **RPROMO-01**: La HUD raster è guidata da un loop **~5fps con delta sub-tile xxhash** (riusa `RasterController`) + debounce, così solo i tile **CHANGED** vengono ri-encodati/spediti; HUD idle ≈ banda BLE quasi-zero.
- [x] **RPROMO-02**: La **regione raster 400×200** (4 tile + 1 capture/background text container) è il **substrato di boot di default** (sostituisce la status-page text-container); la HUD glyph/text resta il **fallback BLE-degraded** (degrade automatico sotto soglia banda per ADR-0005 Branch A). Nota: lo schermo non è interamente raster — il residuo oltre i 400×200 è il capture/background text container.

### Quality Contracts (RINV)

- [x] **RINV-01**: **Contratto INV-1 raster** — snapshot deterministici via **hash dei byte PNG dei tile** prodotti da input RGBA sintetico (NON canvas text, non-deterministico/untestabile in happy-dom); le funzioni pure di content-logic (`formatConditions`, `formatSlots`, …) testate a parte; `inv:all` separa glyph vs raster. ✅ Phase 20 Plan 02
- [ ] **RINV-02**: **INV-2 — geometria tile corretta (verificata 2026-06-05)**: il cap ufficiale è **200×100 per image-container, max 4 → regione 400×200**; il 288×144 del PoC è respinto (passava solo in sim, che non applica i limiti). Il piano è già corretto a 200×100/400×200. Verifica hardware residua su G2 reale (`human_needed` sotto ADR-0005 Branch A): che la regione 400×200 a 4 tile renderizzi correttamente e che il pattern capture-container (text full-screen con `isEventCapture:1` dietro i tile) funzioni e instradi le gesture.
- [ ] **RINV-03**: **INV-3 doc coherence** — `Specs.md` §7 (layout raster-HUD) + `README.md` + `docs/showcase/index.html` aggiornati atomicamente nello stesso commit; i mockup ASCII 27px stantii riconciliati (annotati come path glyph-fallback).

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Raster pipeline generalization

- **RGEN-01** (TODO-hud-raster #7): generalizzare `raster-worker` (oggi map-only) così map + HUD condividano un worker — entrambi usano la stessa geometria **400×200 / tile 200×100** (il full-screen raster non è possibile, cap 4 image-container); offload del tiling/encode fuori dal main thread.

### Standalone raster action panels

- **RACT-01**: pannelli raster dedicati per Action Options / spellbook / inventory action (oggi tab dentro la scheda); valutare overlay raster autonomi se la densità lo richiede.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Generalizzazione `raster-worker` map+HUD condiviso (TODO #7) | Il map worker resta separato per v0.10.0; il compositor HUD usa la propria geometria 400×200 (stessa famiglia 200×100). Generalizzazione = v2 (RGEN-01). |
| Map live-data wiring oltre lo stato attuale | La mappa resta il base layer com'è; questo milestone non aggiunge nuovi canali scene/map. |
| Pannelli raster standalone (spellbook/inventory/action-options) | Restano tab dentro la scheda raster; overlay raster autonomi = v2 (RACT-01). |
| v0.9.14 Release & Distribution (REL/LIFE/REND/LOC) | PARCHEGGIATO al pivot raster; ripreso in un milestone successivo (vedi sezione Parked). |
| DE-locale + Tier-4 polish | Parcheggiati con v0.9.14. |

## Parked — Milestone v0.9.14 "Release & Distribution + deferred hardening"

Avviato 2026-05-30, sospeso 2026-06-05 al pivot verso la UI raster. Da riprendere in un milestone successivo. Requirements (REL-01..05, LIFE-01..04, REND-01..03, LOC-01) conservati nell'archivio git (commit `4f2bfc4^` e antecedenti) e nel changelog; non attivi in v0.10.0.

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RAST-01 | Phase 19 | Pending |
| RAST-02 | Phase 19 | Pending |
| RAST-03 | Phase 19 | Pending |
| RAST-04 | Phase 19 | Pending |
| RAST-05 | Phase 19 | Pending |
| RFONT-01 | Phase 20 | Pending |
| RFONT-02 | Phase 20 | Complete |
| RFONT-03 | Phase 20 | Complete |
| RINV-01 | Phase 20 | Resolved |
| RSHEET-01 | Phase 21 | Complete |
| RSHEET-02 | Phase 21 | Complete |
| RSHEET-03 | Phase 21 | Complete |
| RDATA-01 | Phase 21 | Complete |
| RDATA-02 | Phase 21 | Complete |
| RDATA-03 | Phase 22 | Complete |
| RDATA-04 | Phase 22 | Complete |
| RCOMB-01 | Phase 23 | Complete |
| RDATA-05 | Phase 23 | Complete |
| RPROMO-01 | Phase 24 | Complete |
| RPROMO-02 | Phase 25 | Complete |
| RINV-02 | Phase 19 | Pending |
| RINV-03 | Phase 26 | Pending |
