# Roadmap: EvenFoundryVTT (EVF)

## Milestones

- ✅ **v0.9.11 MVP** — Phases 0–13 (shipped 2026-05-17). Full details: [`milestones/v0.9.11-ROADMAP.md`](milestones/v0.9.11-ROADMAP.md)
- ✅ **v0.9.12 Quick Wins** — Phases 14–15 (shipped 2026-05-17 · 2 phases · 8/8 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.12-ROADMAP.md`](milestones/v0.9.12-ROADMAP.md)
- ✅ **v0.9.13 Sheet Data Completion + Polish** — Phases 16–18 (shipped 2026-05-18 · 3 phases · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 0 new hardware-pending SCs). Full details: [`milestones/v0.9.13-ROADMAP.md`](milestones/v0.9.13-ROADMAP.md)
- ⏸️ **v0.9.14 Release & Distribution + deferred hardening** — PARKED 2026-06-05 (Phases 19–22 dirs cleared; will be re-roadmapped when resumed). Requirements: REL-01..05, LIFE-01..04, REND-01..03, LOC-01.
- 🚧 **v0.10.0 Raster UI Substrate** — Phases 19–26 (in progress · opened 2026-06-05)

## Phases

<details>
<summary>✅ v0.9.11 MVP (Phases 0–13) — SHIPPED 2026-05-17 · 71/71 plans · 2,097 tests · 48/48 v1 REQ-IDs software-complete</summary>

MVP scope = Phase 0 → 10. V2 OPZIONALE = Phase 11 → 13 (shipped early). Full details in archive.

- [x] **Phase 0: Validation Gates** (4/4 plans) — ADR-0005 PROVISIONAL Branch A `human_needed` for hardware-pending SCs
- [x] **Phase 1: Foundation** (3/3) — monorepo + Biome + TS strict + Vitest + ADRs 0001–0008
- [x] **Phase 2: Foundry Module Core + Pairing UI** (5/5) — module.json + readers + WS handshake + locale + QR pairing
- [x] **Phase 3: Bridge Service Skeleton** (5/5) — Fastify + ws + bearer + Tool Registry + healthz/readyz/metrics
- [x] **Phase 4a: G2 Engine + Raster + Status HUD** (6/6) — layered raster pipeline + persistent status HUD; ADR-0009 ACCEPTED
- [x] **Phase 4b: Overlay Slot + Map Mode + Adversarial UI** (6/6) — overlay panel API + toast queue + boot errors + death-saves + concentration-drop; ADR-0009 Amendment 1
- [x] **Phase 5: Panel Plugin System + Read-Only Panels** (6/6) — 6-tab Sheet + Combat tracker + Log/Inv/Spellbook + dual-edition + i18n
- [x] **Phase 6: R1 Integration + Quick Action + INV-5** (4/4) — R1 routing + Quick Action menu; **INV-5 Gesture Determinism ratified**
- [x] **Phase 7: Foundry Module Write Path** (6/6) — socketlib.executeAsGM single-workflow-origin; ADR-0011 ACCEPTED; 14-handler invariant
- [x] **Phase 8: Manual Action UX** (5/5) — tap-to-cast + tap-to-use + Quick-action bar + action-result toasts
- [x] **Phase 9: Action Economy & Edge Cases** (5/5) — Action/Bonus/Reaction enforcement + slot consumption + concentration handling
- [x] **Phase 10: Polish & Field Test MVP** (5/5) — WsReconnect + PerfProbe + INV-1..5 verification suite + 5 MVP docs · **MVP SOFTWARE-COMPLETE**
- [x] **Phase 11: V2 `foundry-mcp` Server** *(OPZIONALE)* (4/4) — MCP SDK 1.29.0 + Streamable HTTP + 4 resources + Claude Desktop config
- [x] **Phase 12: V2 Voice UX Tuning** *(OPZIONALE)* (3/3) — GM-Agent prompt + worked examples + IT↔EN STT spell-name lookup
- [x] **Phase 13: V2 Stretch** *(OPZIONALE)* (4/4) — ACT-04 reaction execution + STRETCH-06 portrait (flag-gated); 7 STRETCH items deferred

</details>

<details>
<summary>✅ v0.9.12 Quick Wins (Phases 14–15) — SHIPPED 2026-05-17 · 8/8 plans · 9/9 v1 REQ-IDs · software-only</summary>

Two atomic software-only phases shipped end-to-end. Zero new hardware-gated SCs (35 `human_needed` SCs carry from v0.9.11 under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = 17 preserved end-to-end. Full details in archive.

- [x] **Phase 14: Raster z=0.5 Idle Content Infill** (3/3 plans) — z=0.5 layer ratified via INV-1 fixtures + ADR-0001 Amendment 1 + INV-3 atomic commit 3a0c5cf
- [x] **Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration** (5/5 plans) — Nova-3 `keyterm` parameter wired; static SPELL_KEYTERMS + dynamic EntityPackCache union; debounce 250ms + mutex hot-update via `/internal/delta`; INV-3 atomic commit dc161d6

</details>

<details>
<summary>✅ v0.9.13 Sheet Data Completion + Polish (Phases 16–18) — SHIPPED 2026-05-18 · 7/7 plans · 9/9 v1 REQ-IDs · software-only · 2668 workspace tests</summary>

Three software-only phases completed the Character Sheet panel's data wiring (Main + Skills tabs) and closed the Phase-14.1 spec-prose drift carry-forward. Zero new hardware-gated SCs (35 `human_needed` SCs from v0.9.11 carry under ADR-0005 Branch A unchanged). CI Gate 8 socketlib handler count = **17 preserved end-to-end** — both Sheet phases are pure read-path extensions, no new socketlib handlers. Each phase closed with a single INV-3 atomic commit.

- [x] **Phase 16: Sheet Ability Scores (Main tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.abilities` + `extractAbilities()` + `renderMainTab()` data binding + 4 INV-1 fixtures — INV-3 atomic commit `d68d7f2`
- [x] **Phase 17: Sheet Skills Tab (Skills tab data wiring)** (3/3 plans) — `CharacterSnapshotSchema.skills` + `extractSkills()` + `renderSkillsTab()` dynamic + SKILL_NAMES 3-locale + senses passives + 5 INV-1 fixtures — INV-3 atomic commit `c208d24`
- [x] **Phase 18: Phase-14.1 Spec-Drift Polish** (1/1 plan) — Z05-INV-02b-triade + IT fixture locale-leak fix + archived 14-UI-SPEC §2/§10 reconciled — INV-3 atomic milestone-close commit `df4ea02`

</details>

### 🚧 v0.10.0 Raster UI Substrate (In Progress)

**Milestone Goal:** Sostituire il substrato di rendering della UI HUD da text-container 27px a immagini raster compositate su una regione raster condivisa 400×200 → dither → 4 tile 200×100 → push serializzato ai 4 image-container SDK, con full controllo tipografico, scheda PG a 6 tab, combat tracker, delta loop ~5fps e promozione a boot di default. **(INV-2 2026-06-05: image-container G2 = max 4 × ≤200×100 → 400×200, lo schermo pieno non è raster; vedi memory `g2-image-container-hard-limits`.)**

- [x] **Phase 19: ADR-0013 Amendment 1 + Canvas Compositor Core** ✅ (5/5 software must-haves; hardware-render SC human_needed per ADR-0005 Branch A) — ADR scritto prima dell'impl (geometria 400×200 / 4 tile 200×100 ratificata, push serializzato, schema-pagina fisso) · `CanvasCompositor` (regione 400×200) + `CanvasLayer` + `buildHudRasterPageSchema()` (5 container: 4 image-tile 200×100 + 1 text capture full-screen `isEventCapture:1`) · `LayerManager` `renderMode` + `_flushPage()` mode-selector + `_compositeAndPush()` (serializza i 4 `updateImageRawData`) + fixed-budget assertion · glyph path byte-identico; NESSUNA UI change (RAST-01..05, RINV-02)
- [ ] **Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline** — `CanvasStatusHudLayer` (z=1) · `@fontsource/vt323` con fallback-chain try/catch · chrome statico pre-baked via `ImageBitmap` · dati dinamici re-render only-on-delta · INV-1 raster contract (hash tile PNG da RGBA sintetico) + `inv:all` distingue glyph/raster suite; `map-capture` → `hud-capture` rename (RFONT-01..03, RINV-01)
- [ ] **Phase 21: Character Sheet su Canvas + Dati Main-tab** — `CanvasCharacterSheetPanel` z=2 · 6 tab su canvas (Main · Skills · Inventory · Spells · Features · Biography) · navigazione gesture preservata · portrait greyscale-dithered · `class`+`initiative`+`speed` schema+reader (RSHEET-01..03, RDATA-01..02)
- [ ] **Phase 22: Features + Biography Schema Extension** — `feats[]` + `biography` in `CharacterSnapshotSchema` + `extractFeats()` + `extractBiography()` readers in `foundry-module` · Features + Biography tab wired su dati reali al posto delle fixture hardcoded (RDATA-03..04)
- [ ] **Phase 23: Combat Tracker su Canvas + Combatant AC** — `CanvasCombatTrackerPanel` z=2 (5-row window · current-turn highlight · HP · concentrazione · quick-action bar) · `CombatantSchema.ac` + reader · gesture preservate (RCOMB-01, RDATA-05)
- [ ] **Phase 24: Delta Loop ~5fps xxhash** — loop `~5fps` + debounce 200ms + `TileDelta` sub-tile xxhash con geometria 200×100 · solo tile CHANGED vengono re-encodati/spediti (serializzati) · HUD idle ≈ banda BLE quasi-zero (RPROMO-01)
- [ ] **Phase 25: Promozione Raster a Default Boot + Fallback Glyph** — `boot-engine-core.ts` switched a canvas-default · `?hud=raster` guard rimosso (INV-4 dead-code rule) · `renderMode: 'glyph'` attivato da `RasterController.setBleVerdict('glyph')` con switch atomico via `bundle([])` · prerequisiti: delta (Phase 24) + INV-2 re-verify (Phase 19) + capture-container sim test + INV-3 §7 (Phase 26) (RPROMO-02)
- [ ] **Phase 26: INV-3 Doc Coherence Milestone Close** — `Specs.md §7` raster-HUD substrate section + ASCII mockup glyph-fallback migration + `README.md` Rendering section + `docs/showcase/index.html` stats · commit atomico INV-3 (RINV-03)


## Phase Details

### Phase 19: ADR-0013 Amendment 1 + Canvas Compositor Core
**Goal**: Il contratto architetturale del compositor è scritto e ratificato, la geometria hardware dei tile è verificata contro la doc canonica, e il substrato `CanvasCompositor` + interfaccia `CanvasLayer` + schema-pagina 5-container sono implementati — senza alcun cambiamento visibile alla UI (la glyph path è byte-identica).
**Depends on**: Nothing (prima deliverable del milestone)
**Requirements**: RAST-01, RAST-02, RAST-03, RAST-04, RAST-05, RINV-02
**Success Criteria** (what must be TRUE):
  1. ADR-0013 Amendment 1 è presente su disco e ratificato, descrivendo: geometria **regione raster 400×200 / 4 tile 200×100** (cap hardware INV-2), `updateImageRawData` **serializzato** (no invii concorrenti), **schema-pagina fisso** (cambio pannello via updateImageRawData, non rebuildPageContainer), compositor model Option B (per-layer OffscreenCanvas + drawImage), capture-container = text container full-screen `hud-capture` con `isEventCapture:1` dietro i tile, budget-mode canvas (fixed 5 container, `getContainerCount()` returns `{image:0, text:0}` per canvas layer), `renderMode: 'canvas' | 'glyph'`, selettore `_flushPage()` — scritto PRIMA di qualunque merge dell'implementazione
  2. INV-2 geometria già verificata (2026-06-05, `hub.evenrealities.com/docs/guides/display`: image max 4 × 20–200×20–100px → 400×200). La costante `HUD_TILE_GEOMETRY` è impostata a 200×100 (4 tile, regione 400×200); il posizionamento dei tile nei 576×288 è parametrizzato. SC hardware reale residua (regione 400×200 + capture-container renderizzano su G2): `human_needed` per ADR-0005 Branch A
  3. `pnpm test` passa con tutte le 2668+ test esistenti byte-identiche (zero regressioni sulla glyph path); i test di `CanvasCompositor` verificano: composite z-order, dirty/clean layer skip, `deactivate()`, `_compositeAndPush()` chiamato dopo `_flushPage` in modalità canvas
  4. `buildHudRasterPageSchema()` produce uno schema con `containerTotalNum: 5`, 4 image container (`hud-tile-0..3`) e 1 text container (`hud-capture`, `isEventCapture: 1`) — verificato in test unitari; `LayerManager` in canvas mode passa la budget-assertion senza `capture_invariant_violated`
  5. `LayerManager.renderMode` può essere impostato a `'canvas'` o `'glyph'`; in modalità `'glyph'` il comportamento di `_flushPage()` è identico a oggi (3 container text, glyph path byte-identica — verificabile via test)
**Plans**: 4 plans (3 waves)
- [ ] 19-01-PLAN.md — ADR-0013 Amendment 1 (canvas compositor contract, RAST-05)
- [ ] 19-02-PLAN.md — HUD_TILE_GEOMETRY 288×144 → 200×100 / 400×200 migration (RINV-02)
- [ ] 19-03-PLAN.md — CanvasCompositor + CanvasLayer + buildHudRasterPageSchema (RAST-01, RAST-02)
- [ ] 19-04-PLAN.md — LayerManager renderMode + _flushPage selector + _compositeAndPush + canvas budget (RAST-03, RAST-04, RAST-01)
**UI hint**: no

### Phase 20: Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline
**Goal**: La status HUD (z=1) è renderizzata su canvas con font pixel VT323 e chrome statico pre-baked, il contratto INV-1 raster (hash PNG tile) è stabilito, e `inv:all` distingue la glyph suite dalla raster suite.
**Depends on**: Phase 19 (CanvasCompositor + CanvasLayer interface)
**Requirements**: RFONT-01, RFONT-02, RFONT-03, RINV-01
**Success Criteria** (what must be TRUE):
  1. `@fontsource/vt323` è installato; `hud-font-loader.ts` carica il font nel Worker/canvas context via `FontFace` + `self.fonts.add(face)` con una fallback-chain `try/catch` a `'16px monospace'` — il font è risolto prima della prima frame, e il fallback è testato esplicitamente
  2. Il chrome statico (cornici, label, tab strip, sfondi) è pre-bakato una volta in `ImageBitmap` cache durante il mount del layer; render successivi ri-usano il bitmap via GPU blit senza re-draw del chrome (verificabile: il `paint()` del chrome-layer è invocato una volta sola per session finché lo stato statico non cambia)
  3. `CanvasStatusHudLayer.paint()` viene invocato solo quando il layer è `isDirty()` (dopo un `character.delta`); frame senza delta non triggerano re-paint né re-push (verificabile via spy sul compositor)
  4. `inv:all` mostra due suite distinte: "glyph suite" (fixture ASCII esistenti, validano la BLE-degraded fallback path) e "raster suite" (hash SHA-256 o xxhash dei byte PNG tile prodotti da un RGBA sintetico canonico passato a `buildHudTiles()`); entrambe devono essere verdi per `inv:all` a passare
  5. Il rename `'map-capture'` → `'hud-capture'` è propagato in tutti i siti (container-registry, MapBaseLayer, LayerManager assertion, test) senza regressioni
**Plans**: 5 plans (3 waves)
- [x] 20-01-PLAN.md — VT323 font loader + async attachCanvas signature (RFONT-01) ✅
- [ ] 20-02-PLAN.md — Raster INV-1 contract: synthetic RGBA → buildHudTiles → SHA-256 fixture (RINV-01)
- [ ] 20-03-PLAN.md — CanvasStatusHudLayer: chrome pre-bake + dirty-gate (RFONT-02, RFONT-03)
- [ ] 20-04-PLAN.md — inv:all glyph + raster suite split with FALSE-PASS guard (RINV-01)
- [ ] 20-05-PLAN.md — canvas boot default + map-capture→hud-capture reconciliation (RFONT-02, RFONT-03, RINV-01)
**UI hint**: yes

### Phase 21: Character Sheet su Canvas + Dati Main-tab
**Goal**: La scheda PG è renderizzata come pannello raster overlay z=2, con i 6 tab disegnati su canvas, navigazione gesture preservata, portrait greyscale-dithered, e i campi `class`/`initiative`/`speed` estesi nello schema e wired nel tab Main.
**Depends on**: Phase 20 (CanvasStatusHudLayer pattern established, font loader, INV-1 raster baseline)
**Requirements**: RSHEET-01, RSHEET-02, RSHEET-03, RDATA-01, RDATA-02
**Success Criteria** (what must be TRUE):
  1. Il tab Main della scheda su canvas mostra classe/livello reali (da `CharacterSnapshotSchema.class` + reader `foundry-module`), iniziativa e velocità reali (da `CharacterSnapshotSchema.initiative` + `speed` + readers) al posto dei placeholder `—`
  2. Un utente può aprire la scheda raster da ogni stato HUD, navigare tra i 6 tab (Main · Skills · Inventory · Spells · Features · Biography) via gesture scroll del R1 ring, e chiudere la scheda via double-press — le semantiche gesture sono byte-identiche al path glyph esistente (`panel-gesture-bus` non modificato)
  3. L'immagine portrait del personaggio è renderizzata all'interno della scheda canvas (fetch async-una-volta, greyscale-dithered via `image-q`, dimensionata per glanceability) — riusa l'infra portrait-override di `MapBaseLayer`; su fetch-fail il campo è omesso senza errori
  4. I renderer glyph/text esistenti (`render*Tab() -> string`) per i 6 tab sono preservati intatti per il fallback BLE-degraded; i nuovi `paint*Tab(ctx, bounds)` canvas sono ADDITIVE (dual-output pattern, nessuna cancellazione)
  5. `pnpm test` passa con test di regressione per `CharacterSnapshotSchema.class`/`initiative`/`speed` (schema + reader) e per `CanvasCharacterSheetPanel.paint()` (tab-switch, portrait missing, gesture-bus unchanged)
**Plans**: TBD
**UI hint**: yes

### Phase 22: Features + Biography Schema Extension
**Goal**: `CharacterSnapshotSchema` porta `feats[]` e `biography` con reader nel `foundry-module`; i tab Features e Biography della scheda raster mostrano dati reali invece delle fixture hardcoded.
**Depends on**: Phase 21 (CanvasCharacterSheetPanel must exist to consume new fields)
**Requirements**: RDATA-03, RDATA-04
**Success Criteria** (what must be TRUE):
  1. `CharacterSnapshotSchema.feats` è un array `FeatEntry[]` (con `{category, name, isOrigin, description}`) validato da Zod; `extractFeats()` nel reader `foundry-module` filtra `actor.items` per categoria feat e popola il campo; il tab Features della scheda raster mostra i feat reali del personaggio, non la fixture `DEFAULT_FEATS` hardcoded
  2. `CharacterSnapshotSchema.biography` porta i campi personality/ideal/bond/flaw/backstory dal reader; il tab Biography della scheda raster mostra la bio reale del personaggio, non il testo hardcoded
  3. L'estensione schema è atomica con i renderer: schema + reader `foundry-module` + tab canvas Feats + tab canvas Bio sono tutti in scope di questo phase (nessuna finestra di stato intermedio con schema esteso ma renderer non aggiornato)
  4. I downstream tests che costruiscono `CharacterSnapshot` literals nelle suite g2-app/bridge/foundry-mcp sono aggiornati con i nuovi campi opzionali (nessuna regressione di compilazione TypeScript strict)
  5. `pnpm test` passa con test di schema (FeatEntry validation, empty feats array, biography omitted → empty string fallback), test reader (mock actor.items → extractFeats output), e test renderer (tab Features paint con dati reali vs vuoti)
**Plans**: TBD
**UI hint**: yes

### Phase 23: Combat Tracker su Canvas + Combatant AC
**Goal**: Il combat tracker è renderizzato come pannello raster overlay z=2 con la finestra scorrevole a 5 combattenti, highlight turno corrente, HP e AC reali, e le gesture di navigazione preservate.
**Depends on**: Phase 21 (CanvasCombatTrackerPanel pattern established by CanvasCharacterSheetPanel)
**Requirements**: RCOMB-01, RDATA-05
**Success Criteria** (what must be TRUE):
  1. Il combat tracker raster mostra per ogni combattente nella finestra: nome, HP corrente/max, ordine iniziativa, indicatore di concentrazione, e `ac` reale (da `CombatantSchema.ac` + reader `foundry-module`) al posto del placeholder `' --'`
  2. La finestra scorrevole a 5 combattenti funziona via gesture scroll del R1 ring; il combattente di turno corrente è evidenziato con contrasto full; il tracker si aggiorna automaticamente su `combat.delta`
  3. La gesture di apertura/chiusura del pannello combat tracker su canvas è semanticamente identica alla version glyph (la chiusura via double-press è preservata); `PanelGestureBus` e `panel-router.ts` non sono modificati
  4. `CombatantSchema.ac` è esteso con Zod + reader nel `foundry-module`; l'estensione è atomica con il renderer (schema + reader + canvas panel in scope di questo phase)
  5. `pnpm test` passa con test `CanvasCombatTrackerPanel` (scroll window, current-turn highlight, ac rendering, missing-ac fallback) e test `CombatantSchema.ac` (schema validation + reader mock)
**Plans**: TBD
**UI hint**: yes

### Phase 24: Delta Loop ~5fps xxhash
**Goal**: La HUD raster è guidata da un loop ~5fps con delta sub-tile xxhash; solo i tile CHANGED vengono re-encodati/spediti; la HUD idle ha banda BLE quasi-zero.
**Depends on**: Phase 20 (CanvasStatusHudLayer must exist), Phase 23 (all raster panels must be wired before delta governs them)
**Requirements**: RPROMO-01
**Success Criteria** (what must be TRUE):
  1. Un'istanza `TileDelta` con geometria 200×100 (i 4 tile della regione raster 400×200) è usata per hashing sub-tile; solo i tile con hash cambiato vengono re-encodati e spediti via `pushHudTiles` (serializzati); in HUD idle (nessun `character.delta` né `combat.delta`) zero tile vengono respinti dopo il primo frame
  2. Il loop rispetta un `MIN_REDRAW_INTERVAL_MS = 200` (debounce) — eventi `character.delta` ravvicinati vengono collassati in un singolo render cycle, non spediti individualmente
  3. Un test di simulazione dimostra che per un RGBA sintetico con 1 tile modificato su 4, solo 1 `updateImageRawData` viene chiamato (verificabile via spy sul bridge mock); per 0 tile modificati, 0 `updateImageRawData` vengono chiamati
  4. `pnpm test` passa con la suite delta-loop (geometria parametrizzata, debounce, dirty-tracking, zero-push-on-idle) senza regressione sui test canvas esistenti (Phases 20–23)
  5. Il chrome statico (pre-baked via `ImageBitmap`, Phase 20) non genera mai tile CHANGED tra frame consecutivi senza dati dinamici mutati — la bitmap statica è deterministica per input identici
**Plans**: TBD
**UI hint**: no

### Phase 25: Promozione Raster a Default Boot + Fallback Glyph
**Goal**: La UI raster è il substrato di boot di default; il path glyph/text è il fallback BLE-degraded; il `?hud=raster` guard è rimosso (INV-4 dead-code rule); il switch di modalità è atomico.
**Depends on**: Phase 24 (delta loop must precede promotion — BLE constraint), Phase 19 (INV-2 re-verify must be complete), Phase 26 is a parallel INV-3 gate (promotion PR and doc PR can be sequenced, but INV-3 §7 coherence must be committed before or in the same atomic commit as promotion)
**Requirements**: RPROMO-02
**Success Criteria** (what must be TRUE):
  1. `boot-engine-core.ts` monta `CanvasStatusHudLayer` (canvas mode) come default; la status-page text-container 3-container non è più il schema di boot (verificabile: `_flushPage()` emette `buildHudRasterPageSchema()` su prima startup senza `?hud=raster`)
  2. Il guard `?hud=raster` è rimosso; tutti i percorsi PoC isolati (`boot-hud-raster-poc.ts` o equivalenti) sono o rimossi o chiaramente annotati come `@deprecated glyph-fallback-only` + refactored in dead-code-safe naming (INV-4: nessun codice irraggiungibile senza TSDoc `@deprecated`)
  3. `RasterController.setBleVerdict('glyph')` attiva `LayerManager.setRenderMode('glyph')`, che esegue un `bundle([])` atomico e porta il sistema al 3-container text-schema; l'intera sequenza è testata end-to-end (canvas → glyph switch, zero frame intermedio con schema misto)
  4. La HUD glyph in modalità BLE-degraded è byte-identica al comportamento pre-v0.10.0 (le ~60 ASCII fixture INV-1 esistenti passano invariate — validazione della backward-compatibility del fallback)
  5. `pnpm test` + `pnpm typecheck` + `pnpm lint:ci` passano tutti; CI Gate 8 socketlib count rimane a 17 (nessun nuovo handler — questo milestone è read-path + render only)
**Plans**: TBD
**UI hint**: no

### Phase 26: INV-3 Doc Coherence Milestone Close
**Goal**: `Specs.md §7`, `README.md` e `docs/showcase/index.html` sono aggiornati atomicamente in un singolo commit INV-3 per riflettere il substrato raster come default, con i mockup ASCII ricondotti alla sezione "Glyph Fallback Mode".
**Depends on**: Phase 25 (comportamento finalizzato — la doc descrive l'output stabile e definitivo)
**Requirements**: RINV-03
**Success Criteria** (what must be TRUE):
  1. Un commit atomico singolo aggiorna `Specs.md §7.2` (nuovo paragrafo raster substrate + `CanvasCompositor` model), `Specs.md §7.4` (ASCII mockup esistente spostato in subsection "Glyph Fallback Mode — BLE-degraded path", chiaramente labeled), `README.md` sezione Rendering (rimossa la stat "10 rows × 50 chars", aggiunta descrizione canvas compositor), e `docs/showcase/index.html` (stats aggiornati) — il commit NON tocca codice applicativo
  2. I mockup ASCII in `Specs.md §7` NON sono cancellati — sono annotati come path BLE-degraded e spostati in subsection, preservando la loro funzione come spec per il fallback glyph
  3. `grep -n "10 rows × 50 chars\|27px SDK\|text-container.*status" README.md docs/showcase/index.html` restituisce 0 match (o i match rimasti sono esplicitamente in contesto "glyph fallback")
  4. Il changelog di `Specs.md` registra il bump di versione v0.9.x → v0.10.0 con stanza che riassume il milestone: compositor model, 6-tab raster sheet, combat tracker raster, delta loop, promozione a default, INV-1 raster contract
  5. `pnpm inv:all` (dopo Phase 25) è verde su entrambe le suite (glyph + raster); il commit INV-3 è l'atto di chiusura del milestone v0.10.0
**Plans**: TBD
**UI hint**: no


## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0. Validation Gates | v0.9.11 | 4/4 | Complete | 2026-05-10 |
| 1. Foundation | v0.9.11 | 3/3 | Complete | 2026-05-11 |
| 2. Foundry Module Core + Pairing UI | v0.9.11 | 5/5 | Complete | 2026-05-11 |
| 3. Bridge Service Skeleton | v0.9.11 | 5/5 | Complete | 2026-05-12 |
| 4a. G2 Engine + Raster + Status HUD | v0.9.11 | 6/6 | Complete | 2026-05-13 |
| 4b. Overlay Slot + Map Mode + Adversarial UI | v0.9.11 | 6/6 | Complete | 2026-05-14 |
| 5. Panel Plugin System + Read-Only Panels | v0.9.11 | 6/6 | Complete | 2026-05-14 |
| 6. R1 Integration + Quick Action + INV-5 | v0.9.11 | 4/4 | Complete | 2026-05-15 |
| 7. Foundry Module Write Path | v0.9.11 | 6/6 | Complete | 2026-05-15 |
| 8. Manual Action UX | v0.9.11 | 5/5 | Complete | 2026-05-16 |
| 9. Action Economy & Edge Cases | v0.9.11 | 5/5 | Complete | 2026-05-16 |
| 10. Polish & Field Test MVP | v0.9.11 | 5/5 | Complete | 2026-05-17 |
| 11. V2 foundry-mcp Server | v0.9.11 | 4/4 | Complete | 2026-05-17 |
| 12. V2 Voice UX Tuning | v0.9.11 | 3/3 | Complete | 2026-05-17 |
| 13. V2 Stretch | v0.9.11 | 4/4 | Complete | 2026-05-17 |
| 14. Raster z=0.5 Idle Content Infill | v0.9.12 | 3/3 | Complete | 2026-05-17 |
| 15. Deepgram Keyterm + Entity-Pack | v0.9.12 | 5/5 | Complete | 2026-05-17 |
| 16. Sheet Ability Scores | v0.9.13 | 3/3 | Complete | 2026-05-18 |
| 17. Sheet Skills Tab | v0.9.13 | 3/3 | Complete | 2026-05-18 |
| 18. Phase-14.1 Spec-Drift Polish | v0.9.13 | 1/1 | Complete | 2026-05-18 |
| 19. ADR-0013 Amendment 1 + INV-2 Re-verify + Canvas Compositor Core | v0.10.0 | 0/? | Not started | - |
| 20. Status HUD su Canvas + Font VT323 + INV-1 Raster Baseline | v0.10.0 | 0/5 | Planned | - |
| 21. Character Sheet su Canvas + Dati Main-tab | v0.10.0 | 0/? | Not started | - |
| 22. Features + Biography Schema Extension | v0.10.0 | 0/? | Not started | - |
| 23. Combat Tracker su Canvas + Combatant AC | v0.10.0 | 0/? | Not started | - |
| 24. Delta Loop ~5fps xxhash | v0.10.0 | 0/? | Not started | - |
| 25. Promozione Raster a Default Boot + Fallback Glyph | v0.10.0 | 0/? | Not started | - |
| 26. INV-3 Doc Coherence Milestone Close | v0.10.0 | 0/? | Not started | - |

---
*Last updated: 2026-06-05 — v0.10.0 roadmap Phases 19–26 created. v0.9.14 parked (phases cleared). Prior: 2026-05-18 v0.9.13 ARCHIVED.*
