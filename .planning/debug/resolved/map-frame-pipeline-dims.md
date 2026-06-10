---
slug: map-frame-pipeline-dims
status: resolved
trigger: "Testare la mappa con frame di scena reali: nessun frame_pixels ha mai potuto renderizzare — FramePixelsSchema max 288×144 vs raster-worker che esige esattamente 400×200."
created: 2026-06-10
updated: 2026-06-10
---

# Debug: pipeline frame scena — contraddizione dimensionale schema/worker

## Goal
Spingere frame di scena reali (mappa dungeon) attraverso la catena Foundry→bridge→g2-app e vederli renderizzati sugli occhiali del sim.

## Root cause (catena di 2 difetti + 1 gap architetturale)

### RC-1 — Contraddizione dimensionale (il bug, fixato)
`FramePixelsSchema` limitava width≤288 / height≤144 (bound SDK-polyfill OQ-INV2-4 del 2026-05-14, superseded dall'INV-2 re-verification 2026-06-05) mentre `raster-worker.ts` — aggiornato dalla correzione geometrica Phase 19 / ADR-0013 Amendment 1 — rigetta qualunque frame ≠ 400×200 esatti ("unexpected frame dims"). Le due metà erano mutuamente esclusive: NESSUN payload valido era processabile. Il fallimento era invisibile (il worker risponde `error` nella RasterResponse, il chiamante risolve la promise senza log — scoperto con TEMP-DIAG, poi rimosso).

**Fix (3 package):**
- `shared-protocol/payloads/frame.ts`: bounds → 20–400 × 20–200 (regione raster canonica ADR-0013 Amendment 1), docs aggiornate con la storia del bound.
- `foundry-module/canvas-extractor.ts`: emette SEMPRE esattamente 400×200 — center-crop sorgenti più grandi, letterbox-pad nero opaco sorgenti più piccole (byte copy puro, niente OffscreenCanvas — coerente col rationale Option B).
- `g2-app/scene-input.ts`: `padFrameToCanonical` — difesa consumer-side: frame in-bounds ma sottodimensionati vengono centrati su 400×200 nero opaco prima di `requestFrame`.
- Test aggiornati: FP-1..8 (shared-protocol), CE-2/5/6 (foundry-module), SI-2 + SR-9 (g2-app).

### Gap architetturale (DOCUMENTATO, prossima fase — NON fixato qui)
In canvas mode il percorso scena legacy (RasterController → worker → push su `map-tile-0..3`, id numerici 0-3) scrive sugli stessi id delle `hud-tile-0..3` della pagina HUD raster. Risultato live-verificato: la mappa COPRE l'HUD; al successivo delta con contenuto cambiato l'`HudDeltaDriver` riprende SOLO le tile il cui hash interno cambia (schermo ibrido: tile-0 status line + tile 1-3 mappa). I due driver non si conoscono (zero-push-on-idle confronta coi propri hash, non con lo schermo). La soluzione di design è la direzione del milestone raster-UI: mappa come CanvasLayer z=0 nel compositor + status HUD "corner card" non opaco full-frame (oggi `canvas-status-hud-layer` riempie tutto il 400×200 di nero → una mappa z=0 sarebbe invisibile sotto). Da pianificare come fase (es. "Mappa su canvas substrate").

### Note collaterali
- `[M] Mappa` nel Quick Action menu è uno stub no-op dichiarato ("Phase 7 stub", boot-engine-core:957-961).
- `root-exit-dispatcher` presuppone top layer id 'map-base' a root — in canvas mode a root `getTopLayer()` è null → l'exit double-tap a root non scatta in canvas mode (verificare nella fase mappa-canvas).

## Verification (live sim 2026-06-10, PID fresco, protocollo rispettato)
- Frame dungeon 400×200 generato (2 stanze, corridoio, griglia, 3 token) → `POST /internal/delta type=frame_pixels` → **mappa ditherata visibile sugli occhiali** (screenshot `/tmp/evf-shots/61-map-on-glasses-zoom.png`; hash schermo 787913e52f ≠ root).
- Convivenza: delta hp 13 → tile-0 ripresa dall'HUD (`PF 13/63`), tile 1-3 ancora mappa (`63-hud-reclaim-zoom.png`) — gap di convivenza confermato e documentato.
- Gate: typecheck 0 · lint:ci 0 errori · 3331/3331 test workspace · changeset `fix-frame-pixels-canonical-400x200`.

## Files changed
- packages/shared-protocol/src/payloads/frame.ts (+ frame.test.ts)
- packages/foundry-module/src/canvas-extractor.ts (+ canvas-extractor.test.ts)
- packages/g2-app/src/scene-input.ts (+ __tests__/scene-input.test.ts, __tests__/scene-renderer-smoke.test.ts)
- .changeset/fix-frame-pixels-canonical-400x200.md
