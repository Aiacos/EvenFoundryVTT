# Phase 24: Delta Loop ~5fps xxhash - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous) — grey areas resolved with user

<domain>
## Phase Boundary

La HUD raster è guidata da un loop guidato-da-eventi con delta sub-tile xxhash; solo i tile CHANGED vengono re-encodati/spediti via `pushHudTiles`; la HUD idle ha banda BLE quasi-zero. Sostituisce il driver delta naive minimale già cablato in Phase 20 (memoria progetto: Phase 24 = "replace naive driver with xxhash").

Region raster = 400×200 composta da 4 tile da 200×100 (geometria stabilita dal compositor Phase 19). xxhash hashing per-tile decide quali re-encodare.
</domain>

<decisions>
## Implementation Decisions

### D-24.1 — Loop event-driven + debounce configurabile, default 100ms [USER-DECIDED — override del literal 200ms]
Il render parte SOLO su `character.delta` / `combat.delta` (e `combat.state`/`combat.turn` se applicabile), NON su un tick costante. I delta ravvicinati sono collassati (debounce) in un singolo render cycle. **Il debounce è CONFIGURABILE** (opzione/costante esposta), **default 100ms** — questo SOSTITUISCE il valore letterale `MIN_REDRAW_INTERVAL_MS = 200` citato nel success criterion #2 del ROADMAP. Rationale utente: 100ms dà più reattività; gli eventi delta sono comunque infrequenti, quindi l'fps effettivo resta basso e la HUD idle ha zero cicli. Mantenere il nome `MIN_REDRAW_INTERVAL_MS` ma renderlo un default configurabile (es. via opzione del costruttore/driver), default 100.

**Nota verifica:** la must-have NON è "== 200ms" ma "il debounce è configurabile, default 100ms; delta ravvicinati collassati in un solo ciclo".

### D-24.2 — xxhash variant: h32 [USER-DECIDED]
Hash sub-tile via `xxhash-wasm` **h32** (pinned in stack: xxhash-wasm 1.1.0). Sufficiente per 4 tile da 200×100×4 byte; collisioni trascurabili per delta-detection frame-to-frame; footprint/overhead minore di h64.

### D-24.3 — Zero-push-on-idle (success criterion #1)
In HUD idle (nessun delta) zero tile vengono respinti dopo il primo frame. Con il modello event-driven (D-24.1) questo è naturale: nessun evento → nessun ciclo → nessun hash → nessun push. Il primo frame stabilisce gli hash baseline dei 4 tile.

### D-24.4 — TileDelta geometry 200×100 ×4 (success criterion #1)
Istanza `TileDelta` parametrizzata con geometria 200×100 per i 4 tile della regione 400×200. Solo i tile con hash cambiato → `updateImageRawData`/`pushHudTiles` (serializzati).

### D-24.5 — Static chrome determinism (success criterion #5)
Il chrome statico pre-baked via `ImageBitmap` (Phase 20) NON genera mai tile CHANGED tra frame consecutivi senza dati dinamici mutati — la bitmap statica è deterministica per input identici (stesso RGBA → stesso hash). Questa è una proprietà da verificare con un test, non nuovo codice di rendering.

### D-24.6 — Replace naive driver, no regressions (success criterion #4)
Sostituire il driver delta-recompose naive di Phase 20 con il delta xxhash. Nessuna regressione sui test canvas esistenti (Phases 20–23).
</decisions>

<code_context>
## Existing Code Insights

- The naive delta-recompose driver wired in Phase 20 (the "minimal delta-recompose driver" per project memory `phase20-canvas-default-boot-decision`) — locate it in g2-app engine; this phase replaces its tile-diff with xxhash sub-tile hashing.
- `xxhash-wasm` 1.1.0 — pinned dep; async init (`await xxhash()` returns {h32, h64}). h32 per D-24.2. Note WASM init is async — initialize once at driver setup.
- The compositor / CanvasCompositor (Phase 19) produces the 400×200 raster region; tile geometry 200×100 ×4 already established.
- `pushHudTiles` / `updateImageRawData` — the BLE send path (container-registry image slots 0-3). Serialized sends.
- CanvasStatusHudLayer (Phase 20) + CanvasCharacterSheetPanel (21) + CanvasCombatTrackerPanel (23) — the layers composed into the region; their character.delta/combat.delta subscriptions are the events that should trigger the debounced render.
- INV-1 raster baseline (Phase 20 `inv:all` raster suite) — must not regress; tile hashing must be deterministic for identical RGBA.
- Test approach (criterion 3): spy on bridge mock updateImageRawData; synthetic RGBA with 1/4 tiles changed → exactly 1 call; 0 changed → 0 calls.
</code_context>

<specifics>
## Specific Ideas

Success criteria (ROADMAP), as amended by D-24.1:
1. `TileDelta` (200×100 ×4) sub-tile hashing; only changed-hash tiles re-encoded + sent via `pushHudTiles`; zero tiles pushed on idle after first frame.
2. Debounce collapses near-simultaneous deltas into a single render cycle — debounce CONFIGURABLE, **default 100ms** (D-24.1, overrides literal 200ms).
3. Sim test: synthetic RGBA, 1/4 tiles changed → exactly 1 updateImageRawData (spy on bridge mock); 0 changed → 0 calls.
4. `pnpm test` passes with delta-loop suite (parametrized geometry, debounce, dirty-tracking, zero-push-on-idle) — no regression on Phases 20–23 canvas tests.
5. Static pre-baked chrome never produces CHANGED tiles between frames without mutated dynamic data (deterministic hash for identical input).

Requirement ID: RPROMO-01.
</specifics>

<deferred>
## Deferred Ideas

- Raster promotion to default boot is Phase 25 (canvas is already default boot since Phase 20, but the ?hud=raster guard removal + glyph-fallback formalization is Phase 25).
- Additional 6-layer BLE optimizations beyond xxhash sub-tile delta (custom RLE, DLE, adaptive frame rate) are NOT in this phase's scope per criteria.
</deferred>
