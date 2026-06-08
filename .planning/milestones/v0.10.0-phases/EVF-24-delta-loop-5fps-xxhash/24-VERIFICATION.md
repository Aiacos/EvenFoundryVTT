---
phase: 24-delta-loop-5fps-xxhash
verified: 2026-06-08T11:55:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "HUD idle near-zero BLE bandwidth su G2 fisico"
    expected: "Con una scena statica (nessun delta), dopo il primo frame nessun tile viene rispedito via BLE; al cambio di un singolo dato (es. HP), solo il tile/i tile interessati vengono aggiornati"
    why_human: "Il throughput BLE è misurabile solo su hardware fisico (ADR-0005 Branch A). In happy-dom il compositor restituisce RGBA zero → hashes identici → zero push (D-24.3 semantics), ma non si può osservare la banda BLE reale"
---

# Phase 24: Delta Loop ~5fps xxhash — Verification Report

**Phase Goal:** La HUD raster è guidata da un loop ~5fps con delta sub-tile xxhash; solo i tile CHANGED vengono re-encodati/spediti; la HUD idle ha banda BLE quasi-zero.
**Verified:** 2026-06-08T11:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sub-tile hashing 200×100 (4 tile); solo i tile CHANGED re-encodati/spediti; zero push in idle dopo il primo frame | ✓ VERIFIED | `hud-delta-driver.ts` linea 304–317: loop per-tile h32Raw, `if changed.length===0 return` (D-24.3). DL-01 (1/4 changed → 1 push), DL-02 (0 changed → 0 push), first-frame (4 push unconditional) tutti verdi. |
| 2 | Debounce CONFIGURABILE, default 100ms; eventi ravvicinati collassati in un singolo render cycle | ✓ VERIFIED | `DEFAULT_MIN_REDRAW_INTERVAL_MS = 100` (riga 61); DL-03 (3 eventi → 1 cycle); DL-04 (50ms custom: 49ms no-fire, 50ms fire). Override D-24.1 documentato in JSDoc e 24-CONTEXT.md. |
| 3 | Test di simulazione: 1/4 tile modificato → 1 `updateImageRawData`; 0 modificati → 0 chiamate | ✓ VERIFIED | DL-01 e DL-02 in `hud-delta-driver.test.ts` passano (9/9 test verdi, run indipendente confermato). |
| 4 | Suite completa passa (geometria, debounce, dirty-tracking, zero-push-idle) senza regressione Phases 20–23 | ✓ VERIFIED | 239 file, 3304 test, exit 0. INV-1 golden fixture intatta (hud-raster-frame.ts non modificato in Phase 24). |
| 5 | Chrome statico (pre-baked ImageBitmap) non genera tile CHANGED tra frame consecutivi senza dati dinamici mutati | ✓ VERIFIED | DL-05: due cicli identici → 0 push sul secondo. Hashing dei PNG bytes garantisce determinismo per input identici (D-24.5). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/g2-app/src/engine/hud-delta-driver.ts` | HudDeltaDriver class + DEFAULT_MIN_REDRAW_INTERVAL_MS=100 + HudDeltaDriverOpts | ✓ VERIFIED | Esiste, 323 righe, export const=100, classe completa con start/stop/runFirstFrame/_schedule/_runCycle, JSDoc su ogni public API (INV-4) |
| `packages/g2-app/src/engine/hud-delta-driver.test.ts` | DL-01..DL-06 + first-frame + default-interval (9 test) | ✓ VERIFIED | 443 righe; 9 test tutti verdi; DL-07 CR-01 (idempotency) incluso come test bonus |
| `packages/g2-app/src/engine/layer-manager.ts` | HudDeltaDriver injection + naive driver rimosso | ✓ VERIFIED | `_deltaDriver` field (riga 128), `runFirstFrame()+start()` in `_flushPage` (righe 669–676), `driver.stop()` in `disposeSubscriptions` (riga 730) |
| `packages/g2-app/src/internal/boot-engine-core.ts` | HudDeltaDriver costruito e iniettato in LayerManager | ✓ VERIFIED | `new HudDeltaDriver({compositor, bridge, wsEvents: wsEventBus})` (riga 622), passato come 4° arg a `new LayerManager` (riga 623) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hud-delta-driver.ts` | `xxhash-wasm` | `await xxhash()` lazy-singleton + `h32Raw(tile.bytes)` | ✓ WIRED | Righe 33, 178, 231, 308: init once in start()/runFirstFrame(); h32Raw su Uint8Array |
| `hud-delta-driver.ts` | `hud-poc-page.ts#pushHudTiles` | push selettivo tile CHANGED only | ✓ WIRED | Riga 320: `await pushHudTiles(this._opts.bridge, changed)` nel ramo `changed.length > 0` |
| `hud-delta-driver.ts` | WS event bus | `subscribe('character.delta'\|'combat.turn'\|'combat.state')` | ✓ WIRED | `DELTA_CHANNELS` riga 50; loop riga 193–196; verifica: Open Q1 risolto (`combat.delta` NON esiste — canali corretti sono `combat.turn`/`combat.state`) |
| `layer-manager.ts` | `hud-delta-driver.ts` | `driver.runFirstFrame()+start()` in `_flushPage`; `driver.stop()` in `disposeSubscriptions` | ✓ WIRED | Righe 669–676 e 730 |
| `boot-engine-core.ts` | `hud-delta-driver.ts` | `new HudDeltaDriver({compositor, bridge, wsEvents})` → 4° arg LayerManager | ✓ WIRED | Righe 622–623 |

### INV-4 Naive Driver Removal

| Symbol | Expected | Status | Evidence |
|--------|----------|--------|----------|
| `_startDeltaRecomposite` | Rimosso (zero riferimenti) | ✓ VERIFIED | `grep -rnE "_startDeltaRecomposite|_stopDeltaRecomposite|_deltaRecompositeUnsub" packages/g2-app/src` → 0 risultati |
| `_stopDeltaRecomposite` | Rimosso (zero riferimenti) | ✓ VERIFIED | Id. sopra |
| `_deltaRecompositeUnsub` | Rimosso (zero riferimenti) | ✓ VERIFIED | Id. sopra |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 9 test DL (01–07 + first-frame + default-interval) tutti verdi | `vitest --run hud-delta-driver.test.ts` | 9/9 passed | ✓ PASS |
| DL-07 a/b/c/d/e (integrazione LayerManager) tutti verdi | `vitest --run layer-manager.test.ts` (grep DL-07) | 5/5 passed | ✓ PASS |
| Suite completa senza regressione | `pnpm test -- --run` | 239 files, 3304 tests, exit 0 | ✓ PASS |
| Typecheck pulito | `tsc --noEmit` | exit 0 | ✓ PASS |
| Biome clean sui file modificati | `biome check hud-delta-driver.ts layer-manager.ts boot-engine-core.ts hud-delta-driver.test.ts` | 0 errors, 0 fixes | ✓ PASS |
| DEFAULT_MIN_REDRAW_INTERVAL_MS = 100 (non 200) | `grep "DEFAULT_MIN_REDRAW_INTERVAL_MS = 100" hud-delta-driver.ts` | match riga 61 | ✓ PASS |
| Promise.all assente (CM-01) | `grep "Promise.all" hud-delta-driver.ts` | nessun match | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RPROMO-01 | 24-01, 24-02 | HUD raster driven by ~5fps delta loop con xxhash sub-tile, solo tile CHANGED spediti, idle quasi-zero BLE | ✓ SATISFIED | HudDeltaDriver implementato, wired in LayerManager+boot, 9 DL test verdi, 3304 suite green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `hud-delta-driver.ts` | 230 | `biome-ignore lint/style/noNonNullAssertion` (×3) | ℹ️ Info | Eccezioni documentate con rationale (buildHudTiles contract, start() init guarantee). Non sono stub — sono guard per `noUncheckedIndexedAccess` con commento esplicativo. |
| `hud-delta-driver.ts` | 269 | `console.warn('[EVF]...')` | ℹ️ Info | Path legittimo di error-surfacing per `_runCycle` rejections (WR-01), non un TODO. |

Nessun `TBD`, `FIXME`, o `XXX` non referenziato nei file modificati da Phase 24.

### Human Verification Required

#### 1. HUD Idle Near-Zero BLE Bandwidth su G2 Fisico

**Test:** Con una scena D&D 5e statica aperta su FoundryVTT (nessun aggiornamento di combat o character), avviare il modulo con il bridge connesso al G2. Monitorare il traffico BLE (es. via log bridge o BLE sniffer) per almeno 30 secondi dopo il primo frame.

**Expected:** Dopo il primo frame iniziale (4 tile push), zero ulteriori `updateImageRawData` vengono spediti finché i dati non cambiano. Al cambiamento di un singolo dato (es. HP ridotto di 1), solo il tile/i tile che contengono quella visualizzazione vengono aggiornati (non tutti e 4).

**Why human:** Il throughput BLE è misurabile solo su hardware fisico. Il comportamento software zero-push-on-idle è verificato dai test DL-02 e DL-05, ma la conferma che questo si traduce in banda BLE quasi-zero su G2 reale richiede osservazione hardware diretta. Classificato `human_needed` per ADR-0005 Branch A.

---

## Gaps Summary

Nessun gap software. Tutti i must-have software di RPROMO-01 sono verificati nel codebase.

L'unico item rimanente è la verifica hardware della banda BLE quasi-zero su G2 fisico, che è una `human_needed` attesa per ADR-0005 Branch A (già documentata in `24-VALIDATION.md` Manual-Only Verifications).

---

_Verified: 2026-06-08T11:55:00Z_
_Verifier: Claude (gsd-verifier)_
