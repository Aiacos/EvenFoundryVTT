# Phase 19: ADR-0013 Amendment 1 + Canvas Compositor Core - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure/architecture phase — design decisions already locked by the corrected v0.10.0 plan + INV-2 round; no open grey areas)

<domain>
## Phase Boundary

Scrivere e ratificare **ADR-0013 Amendment 1** (il contratto architetturale del compositor canvas) e implementare il substrato fondamentale — `CanvasCompositor`, interfaccia `CanvasLayer`, schema-pagina a 5 container, `LayerManager.renderMode` con selettore `_flushPage()` — **senza alcun cambiamento visibile alla UI**. La glyph/text path resta **byte-identica** a oggi. Nessun layer canvas reale viene ancora renderizzato (quello è Phase 20).
</domain>

<decisions>
## Implementation Decisions

Tutte le decisioni architetturali di questa fase sono **già lockate** a monte (ricerca `.planning/research/SUMMARY.md` + correzione INV-2 2026-06-05 + ADR-0013). Il planner le tratta come vincoli, non da rivedere:

### Geometria raster (INV-2 verificata 2026-06-05, `hub.evenrealities.com/docs/guides/display`)
- Image-container G2: **max 4 per pagina, ognuno 20–200px largo × 20–100px alto** → superficie raster **400×200 (4 tile 200×100), NON 576×288**. Il full-screen raster è impossibile.
- `HUD_TILE_GEOMETRY` impostata a **200×100** (4 tile, regione 400×200); il **posizionamento** dei tile nei 576×288 è **parametrizzato** (default da decidere in Phase 20 quando si renderizza contenuto visibile — qui solo parametrizzato, nessuna UI).
- SC su hardware reale (regione 400×200 + capture-container renderizzano su G2): `human_needed` sotto ADR-0005 Branch A (no hardware fisico disponibile).

### Compositor model (Option B, dalla ricerca ARCHITECTURE.md)
- **Per-layer `OffscreenCanvas` → composite via `drawImage`** in z-order su un master 400×200; `CanvasCompositor` possiede il master e consegna l'RGBA a `buildHudTiles`/`pushHudTiles` esistenti.
- `LayerManager` resta orchestratore (non renderer); ogni `CanvasLayer` espone `paint(ctx)` / dirty-tracking; supporto cache statica per-layer (usata davvero in Phase 20).

### Capture-invariant + budget (re-mapping canvas)
- Capture via un **text container full-screen `hud-capture` con `isEventCapture:1`** dietro i 4 image-tile (l'esempio first-app dei doc usa un text container 576×288 come capture). NON un container zero-size (non documentato).
- Budget-mode canvas a **budget fisso (5 container: 4 image-tile 200×100 + 1 text capture)**; i `CanvasLayer` dichiarano `getContainerCount() = {image:0, text:0}`; `_assertContainerBudget()` non deve dare falsi `capture_invariant_violated`.

### Push & schema
- `updateImageRawData` **non ammette invii concorrenti** → `_compositeAndPush()` **serializza** i 4 push (await ciascuno).
- **Schema-pagina FISSO**: cambio pannello (Phase 21+) avviene via `updateImageRawData` sui tile esistenti, NON `rebuildPageContainer` (che darebbe flicker, "all state lost").

### Modalità & fallback
- `LayerManager.renderMode: 'canvas' | 'glyph'`; `_flushPage()` seleziona lo schema-pagina (canvas: `buildHudRasterPageSchema()` 5-container; glyph: schema text esistente) e se invocare `_compositeAndPush()`.
- In modalità `'glyph'` il comportamento è **byte-identico a oggi** (fallback BLE-degraded, ADR-0005 Branch A) — zero regressioni sui 2668+ test esistenti.

### Sequenza (ADR prima dell'impl)
- **ADR-0013 Amendment 1 deve essere scritto e ratificato PRIMA** di qualunque merge dell'implementazione del compositor (success criterion #1).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/g2-app/src/engine/layer-manager.ts` + `layer-types.ts` — `LayerManager` (ordered Map<ZIndex, Layer>, `bundle()` atomico, `_assertContainerBudget()`, capture-invariant INV-5, `_flushPage()` con TODO già anticipato per lo schema-selector).
- `packages/g2-app/src/hud/{hud-canvas-renderer,hud-raster-frame,hud-poc-page}.ts` — pattern canvas→dither→tile→push (la PoC; da generalizzare a 200×100/400×200).
- `packages/g2-app/src/raster/map-base-layer.ts` — z=0 layer con mode-routing raster/glyph + `RasterController` (modello per renderMode).
- `packages/g2-app/src/hud/hud-live-render.ts` — loop on-data-change (riuso Phase 20+).

### Established Patterns
- ADR atomico INV-3; commit atomici GSD; Vitest (canvas text NON testabile in happy-dom → testare logica pura + geometria, non il draw).
- CI Gate 8 socketlib count = 17 da preservare (questa fase è render-only, nessun handler socketlib).

### Integration Points
- `_flushPage()` in `LayerManager` è il punto di innesto dello schema-selector canvas/glyph.
- `buildHudTiles`/`pushHudTiles` esistenti consumano l'RGBA del compositor (geometria da portare a 200×100).
</code_context>

<specifics>
## Specific Ideas

ADR-0013 Amendment 1 deve documentare verbatim i 5 punti del success criterion #1 (geometria 400×200/200×100, push serializzato, schema fisso, compositor Option B, capture-container full-screen text, budget-mode canvas, renderMode, `_flushPage` selector). Citare la verifica INV-2 del 2026-06-05 (`hub.evenrealities.com/docs/guides/display`) e la memory `g2-image-container-hard-limits`.
</specifics>

<deferred>
## Deferred Ideas

- Rendering di contenuto visibile (status HUD su canvas, font VT323, chrome pre-baked) → Phase 20.
- Posizionamento on-screen definitivo della regione 400×200 + se lo status HUD sta dentro il composite o in una striscia text nel margine → decisione UI di Phase 20.
- Generalizzazione `raster-worker` map+HUD condiviso → v2 (RGEN-01).
</deferred>
