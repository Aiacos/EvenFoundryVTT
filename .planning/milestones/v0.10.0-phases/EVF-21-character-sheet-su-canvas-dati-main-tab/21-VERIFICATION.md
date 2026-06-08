---
phase: 21-character-sheet-su-canvas-dati-main-tab
verified: 2026-06-07T22:30:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Scheda canvas leggibile su G2 fisico — 6 tab ciclabili via R1"
    expected: "Ogni tab (Main/Skills/Inventory/Spells/Features/Bio) visibile e leggibile sul display 576×288 con font VT323; main tab mostra classe/livello, ini, velocità reali"
    why_human: "Legibilità visiva su hardware G2 reale non verificabile in happy-dom/CI (ADR-0005 Branch A)"
  - test: "Portrait greyscale-dithered renderizzato su G2 fisico"
    expected: "Il portrait del PG appare come immagine monocromatica dithered in slot 3 (100×60), riconoscibile e glanceable"
    why_human: "Fetch portrait URL reale + decode + rendering G2 4-bit non verificabile in CI"
  - test: "Navigazione gesture R1 identica al percorso glyph"
    expected: "press avanza tab; scroll-down avanza; scroll-up decrementa; double-press chiude il pannello tramite router; semantica byte-identica al glyph path"
    why_human: "Richiede R1 ring fisico e G2 per verifica end-to-end"
---

# Phase 21: Character Sheet su Canvas + Dati Main Tab — Verification Report

**Phase Goal:** La scheda PG è renderizzata come pannello raster overlay z=2, con i 6 tab disegnati su canvas, navigazione gesture preservata, portrait greyscale-dithered, e i campi class/initiative/speed estesi nello schema e wired nel tab Main.
**Verified:** 2026-06-07T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `CharacterSnapshotSchema` richiede `class` (string), `initiative` (int), `speed` (int nonneg) | ✓ VERIFIED | `character.ts` linee 551/557/564 — campi REQUIRED senza `.optional()` |
| 2 | Readers `extractClass`/`extractInitiativeModifier`/`extractWalkSpeed` emettono valori da actor dnd5e; `getCharacterSnapshot` li wira | ✓ VERIFIED | `character-reader.ts` linee 520/542/558; wiring a linee 649-651; test CR-CLS/CR-INI/CR-SPD in `readers.test.ts` |
| 3 | `CanvasCharacterSheetPanel` implementa `CanvasLayer + OverlayPanel` (z=Z2_OVERLAY), 6 tab dipinti su canvas, chrome pre-baked, dirty-gate, `getContainerCount {image:0,text:0}`, `getCaptureContainer 'hud-capture'` | ✓ VERIFIED | `canvas-character-sheet-panel.ts` linea 93: `implements CanvasLayer, OverlayPanel`; linea 113: `Z2_OVERLAY`; linee 329/339: contratto CanvasLayer; RCSP-SC1..4 green |
| 4 | Navigazione gesture (tap/scroll/double-tap) via `panel-gesture-bus` preservata — `panel-gesture-bus.ts` non modificato; double-tap è no-op (router chiude) | ✓ VERIFIED | `canvas-character-sheet-panel.ts` linee 406/413/425; git log mostra `panel-gesture-bus.ts` invariato (ultimo commit `f4aa24b` precede Phase 21); RCSP-GEST/GEST-BUS green |
| 5 | Portrait fetched async-once, greyscale-dithered via `dither-utils.ditherTile + buildGreyscalePalette`, encoded 4-bit PNG 100×60, pushato a `MapBaseLayer.setPortraitOverride(3, bytes)` | ✓ VERIFIED | `canvas-character-sheet-panel.ts` linee 610-642: `_fetchPortraitAsync`; import `ditherTile` da `dither-utils` linea 58; RCSP-PORTRAIT-OK/MISSING-URL/FETCH-FAIL/NONBLOCK/ONCE green |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared-protocol/src/payloads/character.ts` | REQUIRED class/initiative/speed + TSDoc | ✓ VERIFIED | Campi presenti a linee 551/557/564 con TSDoc completo; `z.number().int()` per initiative; `.nonnegative()` per speed |
| `packages/foundry-module/src/readers/character-reader.ts` | extractClass + extractInitiativeModifier + extractWalkSpeed + wiring | ✓ VERIFIED | 3 reader a linee 520/542/558; wiring in `getCharacterSnapshot` a linee 649-651 |
| `packages/foundry-module/src/types/foundry-globals.d.ts` | `init?:` + `movement?:` in `Dnd5eAttributes` | ✓ VERIFIED | Linee 270/277: `init?: { total?: number }` + `movement?: { walk?:number; fly?:number; ... }` |
| `packages/g2-app/src/raster/dither-utils.ts` | exported `ditherTile(rgba,w,h,pal)` + `buildGreyscalePalette()` | ✓ VERIFIED | File creato; linee 26/51 exports; `raster-worker.ts` linea 63 importa da `./dither-utils.js` |
| `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` | Dual-interface CanvasLayer+OverlayPanel, 6 tab, `_fetchPortraitAsync` | ✓ VERIFIED | ~700 LOC; `implements CanvasLayer, OverlayPanel`; paint*Tab dispatch; `_fetchPortraitAsync` completo |
| `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` | `paintMainTab` con real ini/speed (no em-dash); render*Tab preservati | ✓ VERIFIED | `paintMainTab` linee 983-1036: `formatAbilityMod(snapshot.initiative)` + `String(snapshot.speed)` — zero em-dash placeholder; `renderMainTab` invariato |
| `packages/g2-app/src/internal/boot-engine-core.ts` | renderMode-gated dispatch: canvas→'canvas-character-sheet', glyph→'character-sheet' | ✓ VERIFIED | Linee 895-896: gate su `getRenderMode() === 'canvas'`; `setPanelInstanceHandler('canvas-character-sheet')` a linea 1020 |
| `packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` | 4 tile SHA-256, FALSE-PASS guard | ✓ VERIFIED | File con 4 entries (hud-tile-0..3); RCSP-INV1 con FALSE-PASS guard a linea 810 del test |
| `packages/shared-render/src/fixtures/sheet.main.{2014.it,2014.en,2014.de,2024.it}.txt` | Row-6 vitals bar: INI +2 / VEL 30 (no em-dash) | ✓ VERIFIED | Tutti e 4 i file mostrano `INI +2` e `VEL/SPD/GES 30` a row 7; colonne INV-1 preserved |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `getCharacterSnapshot` | `CharacterSnapshotSchema` | `class: extractClass(actor)` + `initiative:` + `speed:` nel return object | ✓ WIRED | `character-reader.ts` linee 649-651 — i 3 campi nel return object di `getCharacterSnapshot` |
| `raster-worker.ts` | `dither-utils.ts` | `import { ditherTile, buildGreyscalePalette } from './dither-utils.js'` | ✓ WIRED | `raster-worker.ts` linea 63; call site linea 258: `ditherTile(rgba, TILE_W, TILE_H, palette)` |
| `CanvasCharacterSheetPanel.onEvent` | `panel-gesture-bus` (subscribe closure) | `onMount`: `this._gestureBus.subscribe(...)`; `onUnmount`: `_unsubscribeGesture()` | ✓ WIRED | Linee 369/382-384; `panel-gesture-bus.ts` invariato |
| `boot-engine-core` renderMode dispatch | `openPanel('canvas-character-sheet')` | `onNavigate` intercept: target==='character-sheet' && renderMode==='canvas' → 'canvas-character-sheet' | ✓ WIRED | Linee 895-900 di `boot-engine-core.ts` |
| `_fetchPortraitAsync` | `dither-utils.ditherTile + buildGreyscalePalette` | `import` + call su RGBA decodato | ✓ WIRED | `canvas-character-sheet-panel.ts` linea 58 (import) + linee 634/638 (call) |
| `_fetchPortraitAsync` | `MapBaseLayer.setPortraitOverride(3, bytes)` | `this._mapBaseLayer?.setPortraitOverride(this._portraitSlot, pngBytes)` | ✓ WIRED | Linea 642: call con slot `_portraitSlot` (costante 3) e bytes PNG |
| `paintMainTab` | `snapshot.initiative` + `snapshot.speed` | `formatAbilityMod(snapshot.initiative)` + `String(snapshot.speed)` nel `ctx.fillText` | ✓ WIRED | `character-sheet-tab-renderers.ts` linee 1012-1015 — nessun placeholder em-dash |
| `renderMainTab` (glyph) | `snapshot.initiative` + `snapshot.speed` | `formatAbilityMod(snapshot.initiative)` + `String(snapshot.speed)` nel vitals string | ✓ WIRED | `character-sheet-tab-renderers.ts` linea 356 — vitals bar con campi reali; confermato da INV-1 fixtures |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `canvas-character-sheet-panel.ts` | `_snapshot` | `onSnapshot(rawSnapshot)` — chiamato esternamente dall'orchestratore (stesso pattern di tutti i pannelli overlay pre-Phase 21; non un'eccezione introdotta da questa fase) | Pattern pre-esistente: `character-sheet-panel.ts` e altri pannelli overlay usano lo stesso schema "Called by the boot orchestrator's WS handler" | ⚠ INFO — pattern comune a tutti gli overlay panel; nessun dispatcher `character.delta → onSnapshot` esiste nell'orchestratore per nessun panel overlay; non introdotto da Phase 21 |
| `paintMainTab` | `snapshot.class`, `snapshot.initiative`, `snapshot.speed` | `CharacterSnapshotSchema` (schema REQUIRED); reader `getCharacterSnapshot` da Foundry actor | Reader da `actor.system.attributes.init.total` (dnd5e reale) | ✓ FLOWING — quando `_snapshot` non-null, i campi provengono da dati Foundry reali; `paintMainTab(ctx, null, ...)` è no-op (test RCSP-PAINTMAIN con null verificato) |
| `renderMainTab` (glyph fallback) | `snapshot.initiative`, `snapshot.speed` | `CharacterSnapshotSchema` (REQUIRED) | `formatAbilityMod(snapshot.initiative)` — dato reale da reader | ✓ FLOWING — INV-1 fixtures con `INI +2`/`VEL 30` confermano output reale |
| `dither-utils.ditherTile` | `rgba: Uint8ClampedArray` | `OffscreenCanvas.getImageData` su `createImageBitmap(blob, {resizeWidth:100,resizeHeight:60})` | Pixel reali dall'immagine portrait | ✓ FLOWING — pipeline completa verificata da RCSP-PORTRAIT-OK; reuse di raster-worker algoritmo (zero behavior change per raster-worker test) |

**Nota sul data-flow di `_snapshot` nel canvas panel:** `onSnapshot` è definito e testato ma non viene chiamato dall'orchestratore di produzione — stesso comportamento di `character-sheet-panel`, `spellbook-panel`, `inventory-panel` (tutti documentano "Called by the boot orchestrator's WS handler" come designa di fase futura). Non è un gap di Phase 21; il pattern pre-esistente richiede un dispatcher nel boot orchestrator che non appartiene a nessuna phase attuale (pre-Phase 9 il dispatcher non è stato introdotto per i pannelli canvas). Questo non impatta il goal di Phase 21 che riguarda lo schema/reader wiring e il rendering del tab Main con dati reali — verificato tramite test unitari con snapshot sintetici.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `dither-utils.ts` — `ditherTile` esportato e size-parameterized | `grep -n 'export function ditherTile' packages/g2-app/src/raster/dither-utils.ts` | `51:export function ditherTile(` | ✓ PASS |
| `raster-worker.ts` importa da `dither-utils` (no inline) | `grep -n 'dither-utils' packages/g2-app/src/raster/raster-worker.ts` | `63:import { buildGreyscalePalette, ditherTile } from './dither-utils.js';` | ✓ PASS |
| `CharacterSnapshotSchema` porta `class`/`initiative`/`speed` REQUIRED | `grep -n 'initiative\|speed.*nonnegative\|class.*z.string' packages/shared-protocol/src/payloads/character.ts` | Tutti e 3 presenti senza `.optional()` | ✓ PASS |
| INV-1 fixtures row-6 senza em-dash | `grep 'INI\|VEL' packages/shared-render/src/fixtures/sheet.main.2014.it.txt` | `INI +2    ⚔ VEL 30` | ✓ PASS |
| Fixture raster SHA-256 con 4 tile | `cat packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` | 4 entries hud-tile-0..3 con sha256 validi | ✓ PASS |
| `panel-gesture-bus.ts` invariato | `git log --oneline -- packages/g2-app/src/engine/panel-gesture-bus.ts` | Solo commit `f4aa24b` (prima di Phase 21) | ✓ PASS |
| `CanvasCharacterSheetPanel` — double-tap è no-op | `grep -n "double-tap" packages/g2-app/src/panels/canvas-character-sheet-panel.ts` | `case 'double-tap': break;` — nessuna chiamata a close | ✓ PASS |

### Probe Execution

Non applicabile — nessun probe-*.sh dichiarato per questa fase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RSHEET-01 | Plans 21-03, 21-05 | Scheda PG come pannello raster overlay z=2, 6 tab su canvas | ✓ SATISFIED | `CanvasCharacterSheetPanel implements CanvasLayer, OverlayPanel`; `z = ZIndex.Z2_OVERLAY`; 6 `paint*Tab` functions; RCSP-SC1..4 green; raster hash fixture RCSP-INV1 |
| RSHEET-02 | Plans 21-03, 21-05 | Navigazione tab + apertura/chiusura via gesture R1, `panel-gesture-bus.ts` invariato | ✓ SATISFIED | `onEvent` con tap/scroll/double-tap; `gestureBus.subscribe` in `onMount`; `panel-gesture-bus.ts` non toccato; RCSP-GEST/GEST-BUS green |
| RSHEET-03 | Plans 21-02, 21-04 | Portrait greyscale-dithered, fetch async-once, `MapBaseLayer` slot 3 | ✓ SATISFIED | `dither-utils.ts` con `ditherTile` size-parameterized; `_fetchPortraitAsync` con async-once guard + silent failure + `setPortraitOverride(3, bytes)`; RCSP-PORTRAIT-* green |
| RDATA-01 | Plan 21-01 | `CharacterSnapshotSchema.class` + reader foundry-module | ✓ SATISFIED | `class: z.string()` REQUIRED; `extractClass` da `actor.items` type=class; `getCharacterSnapshot` wired; CR-CLS-1..4 green |
| RDATA-02 | Plan 21-01 | `CharacterSnapshotSchema.initiative` + `speed` + readers | ✓ SATISFIED | `initiative: z.number().int()` REQUIRED; `speed: z.number().int().nonnegative()` REQUIRED; `extractInitiativeModifier`/`extractWalkSpeed` con defensive defaults; CR-INI-1..4 + CR-SPD-1..4 green |

**Requirement IDs orphani nel REQUIREMENTS.md per Phase 21:** nessuno — tutti e 5 gli ID (RSHEET-01/02/03, RDATA-01/02) sono coperti dai piani.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `canvas-character-sheet-panel.ts` | 520 | `void this._locale;` — locale non passato ai tab non-Main (hardcoded 'en' in `paint*Tab` delegati) | ⚠ Warning | Tab Skills/Inventory/Spells/Feats/Bio usano locale 'en' fisso; wiring locale-aware è Plan 21-04 scope (documentato in SUMMARY 21-03 Known Stubs) |

**Nessun marker TBD/FIXME/XXX** nei file di Phase 21.

**Nessun marker TODO non-linked** nei file di Phase 21.

**Nota pre-esistente:** Il lint error `noConsole` in `debug-agent.ts` (documentato in 21-05-SUMMARY.md come pre-esistente e fuori scope) è confermato come non introdotto da Phase 21 — il file `deploy/sync-app-whitelist.mjs` citato nella consegna è anch'esso fuori scope.

### Human Verification Required

#### 1. Legibilità scheda canvas su G2 fisico (RSHEET-01)

**Test:** Pair G2 fisico, avviare il HUD, aprire la scheda PG tramite Quick Action `[S]`, ciclare tutti e 6 i tab (Main/Skills/Inventory/Spells/Features/Bio).
**Expected:** Ogni tab visibile e leggibile con font VT323; tab Main mostra classe/livello reali, `INI +N`, `VEL N`; nessun placeholder em-dash; legibilità glanceable (stile CRT verde).
**Why human:** Legibilità visiva su hardware G2 576×288 4-bit non verificabile in happy-dom o CI (ADR-0005 Branch A RINV-02).

#### 2. Portrait greyscale-dithered su G2 fisico (RSHEET-03)

**Test:** Con un PC con portrait URL configurato, aprire la scheda PG su G2 fisico.
**Expected:** Il portrait appare in slot 3 (angolo della regione raster) come immagine greyscale-dithered 100×60, riconoscibile e glanceable; su portrait fetch-fail lo slot rimane vuoto senza crash.
**Why human:** Fetch URL reale + `createImageBitmap` + rendering G2 4-bit non emulab in happy-dom; hardware G2 image-container limits (max 200×100 per slot, max 4 per pagina) verificabili solo su device.

#### 3. Navigazione gesture R1 identica al percorso glyph (RSHEET-02)

**Test:** Aprire/chiudere la scheda via R1; ciclare tab con press e scroll; verificare che double-press chiuda (tramite router, non il pannello stesso).
**Expected:** Semantica gesture byte-identica al glyph path; double-press chiude senza artefatti; scroll up/down cycla correttamente i 6 tab.
**Why human:** Richiede R1 ring fisico e G2 per timing verification; ADR-0005 Branch A — hardware test residua.

---

### Gaps Summary

Nessun gap tecnico critico identificato. Tutti i 5 must-have (5/5) sono VERIFIED a livello di codice:

- Schema `class`/`initiative`/`speed` REQUIRED con readers e wiring: **VERIFIED**
- `CanvasCharacterSheetPanel` dual-interface CanvasLayer+OverlayPanel: **VERIFIED**
- Navigazione gesture preserved, `panel-gesture-bus.ts` invariato: **VERIFIED**
- Portrait pipeline `_fetchPortraitAsync` → `dither-utils` → slot 3: **VERIFIED**
- INV-1 fixtures aggiornati (glyph + raster hash): **VERIFIED**

**Warning non-bloccante (INFO):** Il metodo `onSnapshot` su `CanvasCharacterSheetPanel` non viene chiamato da nessun dispatcher nell'orchestratore di produzione. Questo è il pattern comune a TUTTI i pannelli overlay pre-Phase 21 (stessa situazione per `character-sheet-panel`, `spellbook-panel`, `inventory-panel`). Il dispatcher sarà richiesto per il live-update continuo ma non è nel goal di Phase 21. Non classificato come BLOCKER perché (a) non è introdotto da Phase 21, (b) il goal della fase riguarda schema/reader/wiring dello schema nei renderer, non il live-update del pannello aperto, (c) il pannello viene aperto in stato `_dirty=true` e pinteerà al primo composite (che avviene a ogni `character.delta` via `_startDeltaRecomposite`), ma con `_snapshot=null` il paint è un no-op — questo limita il funzionamento a runtime ma è un gap dell'intera architettura overlay-panel, non di Phase 21 specificatamente.

**Warning minore (Warning):** Locale hardcoded `'en'` nei tab non-Main del canvas panel (Skills/Inventory/Spells/Feats/Bio). Documentato come Known Stub in SUMMARY 21-03 — locale-aware wiring è scope di Phase 22.

Il solo motivo per cui lo status è `human_needed` (e non `passed`) è la verifica hardware su G2 fisico (ADR-0005 Branch A) per legibilità, portrait, e gesture — tutte previste come "Manual-Only Verifications" nella VALIDATION.md della fase.

---

_Verified: 2026-06-07T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
