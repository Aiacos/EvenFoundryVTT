---
phase: 25-promozione-raster-a-default-boot-fallback-glyph
verified: 2026-06-08T11:45:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Avviare il modulo Foundry su G2 fisico senza view.map.mode='glyph' persistito e verificare che la HUD raster (4 tile 200×100, regione 400×200) si renderizzi correttamente sugli occhiali"
    expected: "La HUD mostra i 4 tile canvas come substrato di boot default; nessun artefatto; gesture R1 sull'isEventCapture funzionano"
    why_human: "Verifica hardware su G2 reale — ADR-0005 Branch A; il simulatore non applica i limiti hardware (200×100 per tile, max 4 image container); la resa visiva non è verificabile programmaticamente"
  - test: "Simulare BLE degradato (o impostare view.map.mode='glyph' via DevTools/localStorage) e verificare che la HUD passi al fallback glyph text-container su G2 fisico"
    expected: "La HUD mostra il layout 3-container text (header/footer/status-hud); l'isEventCapture usa map-capture come provider; le gesture funzionano correttamente"
    why_human: "Verifica hardware su G2 reale del path glyph-fallback — ADR-0005 Branch A; il comportamento software è stato testato in vitest ma la renderizzazione effettiva sugli occhiali richiede hardware test"
---

# Phase 25: Promozione Raster a Default Boot + Fallback Glyph — Verification Report

**Phase Goal:** La UI raster è il substrato di boot di default; il path glyph/text è il fallback BLE-degraded; il `?hud=raster` guard è rimosso (INV-4 dead-code rule); il switch di modalità è atomico.
**Verified:** 2026-06-08T11:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `boot-engine-core.ts` monta canvas mode come default; status-page 3-container NON è lo schema di boot | VERIFIED | `layerManager.setRenderMode('canvas')` a step 7 (line 644); `_flushPage()` emette `buildHudRasterPageSchema()` in canvas mode (layer-manager.ts:657); test CR-01a passa (renderMode='canvas', canvasStatusHud montato) |
| SC-2 | Guard `?hud=raster` rimosso; tutti i PoC isolati rimossi (INV-4, nessun codice irraggiungibile) | VERIFIED | `bootHudRasterPoc`, `params.get('hud')`, `hudMode==='raster'` branch: grep-zero in launch.ts. 5 file PoC eliminati (`boot-hud-raster-poc.ts`, `hud-poc-page.ts`, `hud-live-render.ts` + 2 test). 10 grep-zero guards su tutti i simboli PoC in packages/. |
| SC-3 | `setBleVerdict('glyph')` (boot-time via effectiveVerdict) attiva `setRenderMode('glyph')` + `bundle([])` atomico → 3-container text-schema; sequenza testata e2e | VERIFIED | step 9d in boot-engine-core: `if (effectiveVerdict === 'glyph') { layerManager.setRenderMode('glyph'); }`. LMT-ATOMIC-01: 1 solo `rebuildPageContainer` (atomico), `containerTotalNum=BOOT_CONTAINER_TOTAL(3)`, `textObject.length=3`, `imageObject.length=0`. CR-01b/CR-01c: boot con `storedMapMode='glyph'` → renderMode='glyph', layer set corretto montato, schema 3-container. |
| SC-4 | HUD glyph in BLE-degraded byte-identica al pre-v0.10.0 (~60 fixture INV-1 pass invariate) | VERIFIED | `git status --porcelain packages/shared-render/src/fixtures/` = 0 (nessuna fixture modificata). 98 fixture totali, 0 delta. |
| SC-5 | `pnpm test` + `pnpm typecheck` + lint changed-files puliti; socketlib count == 17 | VERIFIED | `pnpm test`: 3295/3295 passed (239 files), exit 0. `pnpm typecheck`: exit 0. `biome check` su 5 file modificati: exit 0. `pnpm --filter @evf/foundry-module test`: 562/562 passed; FM-ISM-W9-09 (socketlib count 17) incluso. Lint:ci ha 2 pre-existing `useTemplate` errors in `deploy/sync-app-whitelist.mjs` e `foundry-mcp/mcp-inspector-smoke.test.ts` — NON introdotti da Phase 25 (documentati D-25.5). |

**Score:** 5/5 truths verified

---

### Deferred Items

Items non ancora soddisfatti ma trattati esplicitamente in fasi successive del milestone.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Verifica hardware G2 reale: regione 400×200 (4 tile 200×100) renderizza correttamente e capture-container instradia gesture | Ongoing per ADR-0005 Branch A | REQUIREMENTS.md RINV-02: "SC hardware residua su G2 reale (`human_needed` sotto ADR-0005 Branch A)" — deferred da Phase 19; non è un deliverable di Phase 25 |
| 2 | INV-3 doc coherence: Specs.md §7 / README / showcase aggiornati atomicamente per raster default boot | Phase 26 | ROADMAP Phase 26: "INV-3 Doc Coherence Milestone Close — Specs.md §7 raster-HUD substrate section … commit atomico INV-3 (RINV-03)" |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/g2-app/src/hud/push-hud-tiles.ts` | Extracted `pushHudTiles` production module (CM-01 serialized tile-push) | VERIFIED | Esiste; `export async function pushHudTiles` presente (1 match); 0 riferimenti a `hud-poc`; TSDoc con `@see` ADR-0013 Amendment 1 |
| `packages/g2-app/src/hud/push-hud-tiles.test.ts` | 5 test isolati per pushHudTiles (empty-array, success×2, warn, CM-01 seriale) | VERIFIED | Esiste; 5 `it('` test; 15 `expect`; tutti passano in suite |
| `packages/g2-app/src/internal/boot-engine-core.ts` (step 9d wire) | `setRenderMode('glyph')` keyed su `effectiveVerdict` | VERIFIED | `if (effectiveVerdict === 'glyph') { layerManager.setRenderMode('glyph'); }` a line 702-704; commento `D-25.3 / RPROMO-02` presente (2 match) |
| `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (LMT-ATOMIC-01) | Test e2e canvas→glyph atomico | VERIFIED | Describe block `LMT-ATOMIC-01` presente; asserzioni: `toHaveBeenCalledTimes(1)`, `containerTotalNum===BOOT_CONTAINER_TOTAL`, `textObject.length===3`, `imageObject.length===0`, `updateImageRawData` non chiamato |
| `packages/g2-app/src/internal/launch.ts` | `bootEngine` unconditional, nessun `?hud=raster` branch | VERIFIED | `bootHudRasterPoc` grep: 0; `params.get('hud')` grep: 0; `hud=raster` grep: 0; `deps.bootEngine(` grep: ≥1 |
| `packages/g2-app/src/__tests__/boot-engine-glyph-fallback-mount.test.ts` | 3 test CR-01 (canvas mount, glyph mount, glyph flush) | VERIFIED | Esiste; 3 test passano (CR-01a, CR-01b, CR-01c) — aggiunto come fix del code review |

**File PoC eliminati:**

| File | Status |
|------|--------|
| `packages/g2-app/src/hud/boot-hud-raster-poc.ts` | DELETED (confermato) |
| `packages/g2-app/src/hud/hud-poc-page.ts` | DELETED (confermato) |
| `packages/g2-app/src/hud/hud-live-render.ts` | DELETED (confermato) |
| `packages/g2-app/src/hud/hud-poc-page.test.ts` | DELETED (confermato) |
| `packages/g2-app/src/hud/hud-live-render.test.ts` | DELETED (confermato) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/layer-manager.ts` | `hud/push-hud-tiles.ts` | `import { pushHudTiles }` | WIRED | `grep -c "from '../hud/push-hud-tiles.js'" layer-manager.ts` → 1 |
| `engine/hud-delta-driver.ts` | `hud/push-hud-tiles.ts` | `import { pushHudTiles }` | WIRED | `grep -c "from '../hud/push-hud-tiles.js'" hud-delta-driver.ts` → 1 |
| `boot-engine-core.ts` step 9d | `LayerManager.setRenderMode` | `if (effectiveVerdict === 'glyph') { layerManager.setRenderMode('glyph'); }` | WIRED | Line 702-704; copre sia BLE-probe (step 9) sia persisted-override (step 9b) |
| `launch.ts` no-auth branch | `bootEngine` | `deps.bootEngine(…)` unconditional | WIRED | Nessun `hudMode` if/else; singola chiamata diretta |
| `layer-manager.test.ts` LMT-ATOMIC-01 | `setRenderMode('glyph') + bundle([])` | Spy su `rebuildPageContainer` | WIRED | Test asserta call count=1, schema glyph, no `updateImageRawData` |

---

### Data-Flow Trace (Level 4)

Non applicabile in questa fase: nessun componente di rendering React/Vue/Svelte. I path di dati sono verificati tramite test unitari e d'integrazione (LMT-ATOMIC-01, CR-01a/b/c).

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite workspace completa verde | `corepack pnpm test` | 3295/3295 passed, exit 0 | PASS |
| Typecheck pulito | `corepack pnpm typecheck` | exit 0 | PASS |
| Biome su file modificati | `biome check` su 5 file | exit 0, no fixes | PASS |
| socketlib count == 17 | `pnpm --filter @evf/foundry-module test` | 562/562, FM-ISM-W9-09 green | PASS |
| INV-1 fixtures byte-identiche | `git status --porcelain packages/shared-render/src/fixtures/` | 0 righe | PASS |
| Canvas default boot intatto | `grep -c "setRenderMode('canvas')" boot-engine-core.ts` | 1 | PASS |
| 10 grep-zero PoC symbols | grep-rEl su packages/ | 0 file matchati | PASS |
| CR-01 glyph fallback mount | `vitest run boot-engine-glyph-fallback-mount.test.ts` | 3/3 passed | PASS |
| LMT-ATOMIC-01 atomicità | `vitest run layer-manager.test.ts` | 60/60 passed | PASS |

---

### Probe Execution

Nessun probe script convenzionale dichiarato per questa fase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RPROMO-02 | 25-01, 25-02, 25-03 | Regione raster 400×200 è substrato di boot default; HUD glyph/text resta fallback BLE-degraded | SATISFIED | SC-1..SC-5 tutti verificati; REQUIREMENTS.md tabella: `RPROMO-02 | Phase 25 | Complete` |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `boot-engine-core.ts` | 673, 871, 988, 1018, 1064, 1109 | `TODO(ADR-NNNN)` o `TODO(SC-NN)` | Info | Tutti hanno issue-link valido (ADR-0009, ADR-0005, ADR-0010, SC-10-01, SC-10-02) — INV-4 compliant |

Nessun `TBD`, `FIXME`, `XXX` senza issue-link nei file modificati da Phase 25. Nessun stub/placeholder/return null nei path modificati.

---

### Human Verification Required

#### 1. Raster Default Boot su G2 Fisico (SC-1 hardware)

**Test:** Avviare la sessione FoundryVTT con il modulo abilitato su G2 fisico. Non impostare `view.map.mode='glyph'`. Aprire una sessione D&D 5e con un attore.
**Expected:** La HUD raster (4 tile canvas 200×100, regione 400×200) si renderizza sugli occhiali come substrato di boot default. Nessun artefatto visivo. Le gesture R1 (press, double-press, swipe) funzionano tramite il container `isEventCapture:1`.
**Why human:** Verifica hardware su G2 reale — ADR-0005 Branch A. Il simulatore non applica i limiti hardware (max 4 image container, 200×100 per tile). La resa visiva e il routing gesture su device fisico non sono verificabili programmaticamente.

#### 2. Glyph Fallback su G2 Fisico (SC-3/SC-4 hardware)

**Test:** Impostare `view.map.mode='glyph'` tramite Even Hub kv store (o simulare BLE degradato). Riavviare il boot. Verificare la HUD.
**Expected:** La HUD mostra il layout glyph 3-container (header id4 + footer id5 + status-hud id6). Il provider capture è `map-capture` (da `MapBaseLayer` z=0). Le gesture sono instradata correttamente. La resa è byte-identica al comportamento pre-v0.10.0 (stessa struttura testo, stesso posizionamento).
**Why human:** ADR-0005 Branch A — hardware test. Il comportamento software è verificato dai test CR-01b/CR-01c, ma la resa effettiva su vetro degli occhiali e il corretto instradamento delle gesture in glyph mode richiedono device fisico.

---

### Gaps Summary

Nessun gap bloccante. Tutti i 5 Success Criteria del ROADMAP sono verificati nel codebase.

I due item `human_needed` sono attesi e documentati:
- **Hardware UAT raster/glyph su G2 fisico:** deferred per ADR-0005 Branch A (presente dall'inizio del milestone, non è un gap introdotto da Phase 25).
- **INV-3 doc coherence (Specs.md/README/showcase):** esplicitamente delegato a Phase 26 (RINV-03).

---

_Verified: 2026-06-08T11:45:00Z_
_Verifier: Claude (gsd-verifier)_
