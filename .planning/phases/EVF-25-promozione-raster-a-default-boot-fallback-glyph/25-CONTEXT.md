# Phase 25: Promozione Raster a Default Boot + Fallback Glyph - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous) — grey area resolved with user

<domain>
## Phase Boundary

La UI raster (canvas) è il substrato di boot di default; il path glyph/text è il fallback BLE-degraded; il guard `?hud=raster` è rimosso (INV-4 dead-code rule); il switch di modalità (canvas ↔ glyph) è atomico.

NOTA: il canvas è GIÀ il boot di default da Phase 20 (memoria progetto `phase20-canvas-default-boot-decision`). Questo phase formalizza: (a) rimozione del PoC isolato `?hud=raster` ora che il path canvas reale è il default, (b) formalizzazione della glyph path come fallback BLE-degraded via `RasterController.setBleVerdict('glyph')` → `LayerManager.setRenderMode('glyph')` atomico, (c) backward-compat byte-identica della glyph fixture suite.

INV-2 re-verify era una dipendenza Phase 19 (completata). INV-3 doc coherence (Specs §7 / README / showcase) è il phase 26 dedicato — NON in scope qui (solo codice).
</domain>

<decisions>
## Implementation Decisions

### D-25.1 — Rimuovere il PoC raster isolato [USER-DECIDED]
Eliminare il trigger `?hud=raster` e il PoC entry path: `hud/boot-hud-raster-poc.ts` + il Branch A-raster trigger in `internal/launch.ts` (e i file PoC-only `hud/hud-poc-page.ts`, `hud/hud-live-render.ts` SE non riusati dal path canvas reale). **Preservare SOLO gli helper genuinamente riusati** dal path canvas di produzione (CanvasStatusHudLayer / HudDeltaDriver / buildHudRasterPageSchema / container-registry / buildHudTiles, ecc.). INV-4 zero dead code pieno: nessun file/funzione PoC irraggiungibile lasciato in tree. Aggiornare/rimuovere i test che coprono SOLO il PoC; i test che coprono helper riusati restano (adattati al path reale).

**Procedura sicura:** prima di rimuovere ogni simbolo PoC, fare grep repo-wide per confermare zero consumer non-PoC; se un helper è riusato, NON rimuoverlo (estrarlo se necessario). Documentare i simboli rimossi.

### D-25.2 — Canvas default boot senza guard (success criterion #1)
`boot-engine-core.ts` monta `CanvasStatusHudLayer` (canvas mode) come default; `_flushPage()` emette `buildHudRasterPageSchema()` alla prima startup SENZA `?hud=raster`. La status-page text-container 3-container NON è più lo schema di boot di default (diventa il fallback glyph).

### D-25.3 — Glyph come fallback BLE-degraded, switch atomico (success criterion #3)
`RasterController.setBleVerdict('glyph')` attiva `LayerManager.setRenderMode('glyph')`, che esegue un `bundle([])` atomico portando al 3-container text-schema. La sequenza canvas→glyph è testata end-to-end con ZERO frame intermedio a schema misto (atomicità). Riusa l'infrastruttura esistente: `layer-types.ts` `setBleVerdict`, `engine/map-mode-toggle.ts`, RasterController.

### D-25.4 — Glyph fallback byte-identica pre-v0.10.0 (success criterion #4)
La HUD glyph in modalità BLE-degraded deve essere byte-identica al comportamento pre-v0.10.0: le ~60 ASCII fixture INV-1 esistenti passano INVARIATE (validazione backward-compat). NON modificare le glyph fixture; se una cambia, è un bug di regressione da fermare e segnalare.

### D-25.5 — No new handlers, gates green (success criterion #5)
`pnpm test` + `pnpm typecheck` + `pnpm lint:ci` tutti verdi; socketlib count resta 17 (nessun nuovo handler — milestone read-path + render only). NOTA: esiste un errore lint pre-esistente in `deploy/sync-app-whitelist.mjs` (useTemplate) fuori scope da Phase 21 — NON è introdotto da questo phase; se blocca `lint:ci`, segnalarlo come pre-esistente (decidere col chiamante se fixarlo qui o lasciarlo a phase 26).

### D-25.6 — Docs out of scope (INV-3 → Phase 26)
Specs.md §7 / README / showcase NON sono toccati in questo phase. La coerenza INV-3 è il phase 26 dedicato. Questo phase è codice-only (promotion + PoC removal + glyph fallback formalization).
</decisions>

<code_context>
## Existing Code Insights

- `packages/g2-app/src/hud/boot-hud-raster-poc.ts` — PoC entry (runs INSTEAD of bootEngine on `?hud=raster`). Primary removal target.
- `packages/g2-app/src/hud/hud-poc-page.ts`, `hud/hud-live-render.ts` — PoC support; check reuse before removal.
- `packages/g2-app/src/internal/launch.ts` — Branch A-raster `?hud=raster` trigger (imports bootHudRasterPoc ~line 47, routes ~line 146). Remove the trigger; launch keeps the real bootEngine path.
- `packages/g2-app/src/internal/boot-engine-core.ts` — mounts CanvasStatusHudLayer + HudDeltaDriver; canvas default. Ensure no ?hud=raster gate remains; _flushPage emits buildHudRasterPageSchema by default.
- `packages/g2-app/src/engine/layer-types.ts` (setBleVerdict), `engine/map-mode-toggle.ts`, RasterController — glyph fallback switch infra (D-25.3).
- `packages/g2-app/src/engine/container-registry.ts` — buildHudRasterPageSchema (canvas) vs default glyph schema.
- INV-1 glyph fixtures (~60 ASCII) in shared-render — MUST stay byte-identical (D-25.4).
- Pre-existing lint error: deploy/sync-app-whitelist.mjs (out of scope; flag, don't silently fix).

## Removed-symbol candidates (verify reuse via grep before deletion)
- bootHudRasterPoc / BootHudRasterPocOpts (boot-hud-raster-poc.ts)
- hud-poc-page.ts exports, hud-live-render.ts exports (if PoC-only)
- launch.ts ?hud=raster branch + import
</code_context>

<specifics>
## Specific Ideas

Success criteria (ROADMAP):
1. boot-engine-core mounts CanvasStatusHudLayer (canvas) as default; _flushPage emits buildHudRasterPageSchema on first startup without ?hud=raster.
2. ?hud=raster guard removed; PoC paths removed (D-25.1) — INV-4 no unreachable code without @deprecated TSDoc (here: fully removed).
3. setBleVerdict('glyph') → setRenderMode('glyph') → atomic bundle([]) → 3-container text-schema; canvas→glyph switch tested e2e, zero mixed-schema intermediate frame.
4. Glyph BLE-degraded byte-identical to pre-v0.10.0 — ~60 INV-1 ASCII fixtures pass unchanged.
5. pnpm test + typecheck + lint:ci all green; socketlib count == 17.

Requirement ID: RPROMO-02.
</specifics>

<deferred>
## Deferred Ideas

- INV-3 doc coherence (Specs §7 / README / showcase) → Phase 26.
- Pre-existing deploy/sync-app-whitelist.mjs lint error → decide separately; not introduced here.
- @deprecate-instead-of-remove alternative for the PoC → not chosen (D-25.1 = remove).
</deferred>
