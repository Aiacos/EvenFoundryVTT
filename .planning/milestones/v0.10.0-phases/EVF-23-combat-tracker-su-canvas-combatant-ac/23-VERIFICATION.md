---
phase: 23-combat-tracker-su-canvas-combatant-ac
verified: 2026-06-08T06:23:30Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Aprire il combat tracker con G2+R1 in canvas mode: verificare che la finestra 5-combattenti scorra correttamente e che il combattente del turno corrente sia evidenziato in full-contrast (fillRect inverso)"
    expected: "5 righe visibili; la riga del turno corrente mostra un band bianco con testo in colore di sfondo; scorrimento su/giu con R1 swipe funziona"
    why_human: "Il comportamento visivo del highlight (inverted fillRect) e la leggibilità su display fisico 4-bit greyscale non sono verificabili via grep o test unit"
  - test: "Verificare che l'AC reale appaia nella terza colonna di ogni riga combattente (es. '15' per AC 15, ' --' per combattente non linkato)"
    expected: "AC numerico a 3 caratteri right-justified per combattenti con actor linkato; ' --' per non-linkati"
    why_human: "La leggibilità del valore AC su display G2 a 576x288 4-bit non è verificabile senza hardware fisico"
  - test: "Verificare il comportamento del double-press R1 sul combat tracker canvas: il pannello si chiude via panel-router (ADR-0012), non via logica interna al pannello"
    expected: "Il pannello si chiude; nessuna modifica a _scrollOffset; nessun errore"
    why_human: "L'integrazione del bus di gestures con il router a runtime richiede test su hardware fisico o simulatore live"
---

# Phase 23: Combat Tracker su Canvas — Verification Report

**Phase Goal:** Il combat tracker è renderizzato come pannello raster overlay z=2 con la finestra scorrevole a 5 combattenti, highlight turno corrente, HP e AC reali, e le gesture di navigazione preservate.
**Verified:** 2026-06-08T06:23:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CombatantSchema.ac: optional int nonneg field | VERIFIED | `combat.ts:79` — `ac: z.number().int().nonnegative().optional()` present; 5 RDATA-05 schema tests (AC-1..5) in `combat.test.ts:91` |
| 2 | Existing Combatant literals senza `ac` parsano ancora (backward-compat) | VERIFIED | Campo `.optional()`: zero downstream literal update richiesto; confermato da full suite 3290/3290 pass |
| 3 | getCombatSnapshot popola `ac` da `actor.system.attributes.ac.value` (null-safe) | VERIFIED | `combat-reader.ts:36,89,100` — `extractCombatantAc` + conditional spread `...(acVal !== undefined ? { ac: acVal } : {})` |
| 4 | Combattente con actor null → `ac` undefined (no key) | VERIFIED | Reader test R2 `'ac' in combatant === false`; 562/562 foundry-module tests pass |
| 5 | CanvasCombatTrackerPanel implementa CanvasLayer + OverlayPanel (id `canvas-combat-tracker`, z=Z2_OVERLAY) | VERIFIED | `canvas-combat-tracker-panel.ts:126,142,145` — `implements CanvasLayer, OverlayPanel`; `id = 'canvas-combat-tracker'`; `z = ZIndex.Z2_OVERLAY` |
| 6 | Finestra scorrevole 5 combattenti via `computeWindow`; `isAtTopBoundary() === (_scrollOffset === 0)` | VERIFIED | `canvas-combat-tracker-panel.ts:620-621` — `return this._scrollOffset === 0` verbatim; `renderCombatTrackerContent` importato e chiamato a `paint():408,635` |
| 7 | Delta `combat.turn` con nuovo currentCombatantId → `_scrollOffset = 0` + `_dirty = true` (auto-follow) | VERIFIED | `canvas-combat-tracker-panel.ts:705` — `this._scrollOffset = 0`; test RCOMB-AUTOFOL in suite (1580/1580 g2-app pass) |
| 8 | AC reale via `renderCombatantRow` condiviso; fallback `' --'` per ac undefined | VERIFIED | `combat-tracker-panel.ts:296` — `c.ac !== undefined ? _rjust(String(c.ac), 3) : ' --'`; vecchio literal-only rimosso (count = 0) |
| 9 | onMount si iscrive a `combat.turn` + `combat.state`; onUnmount disiscrizione idempotente (T-23-03) | VERIFIED | `canvas-combat-tracker-panel.ts:522-525` — subscribe a COMBAT_TURN_DELTA_TYPE e COMBAT_STATE_DELTA_TYPE; `_unsubscribeCombat` array iterato in onUnmount con null/clear guards |
| 10 | Boot dispatch gate: `combat-tracker` → `canvas-combat-tracker` quando renderMode === `canvas` | VERIFIED | `boot-engine-core.ts:904` — ternario chained: `target === 'combat-tracker' && layerManager.getRenderMode() === 'canvas' ? 'canvas-combat-tracker' : target` |
| 11 | `setPanelInstanceHandler('canvas-combat-tracker')` inietta wsEventBus + quickActionHandler | VERIFIED | `boot-engine-core.ts:1356` — handler inietta `tracker.setWsEventBus` + `tracker.setQuickActionHandler` |
| 12 | PanelGestureBus e panel-router.ts NON modificati (D-23.5) | VERIFIED | `git diff --quiet` → GUARD-PASS; confermato dalla verifica in tempo reale |
| 13 | Payload malformato in `_onCombatDelta` droppato senza stato change (T-23-01) | VERIFIED | `canvas-combat-tracker-panel.ts:695` — `CombatSnapshotSchema.safeParse(raw)`; test RCOMB-T2301 in suite |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared-protocol/src/payloads/combat.ts` | CombatantSchema.ac optional field | VERIFIED | Riga 79: `ac: z.number().int().nonnegative().optional()` |
| `packages/shared-protocol/src/payloads/combat.test.ts` | RDATA-05 schema tests | VERIFIED | `describe('CombatantSchema.ac (RDATA-05)')` a riga 91, 5 test cases |
| `packages/foundry-module/src/readers/combat-reader.ts` | extractCombatantAc + wiring | VERIFIED | Funzione a riga 36; 3 occorrenze (definizione + 2 call site); conditional spread a riga 100 |
| `packages/foundry-module/src/readers/readers.test.ts` | RDATA-05 reader tests | VERIFIED | `describe('ac extraction (RDATA-05)')` a riga 1680 |
| `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts` | CanvasCombatTrackerPanel dual-interface | VERIFIED | 785 righe (min 200); `canvas-combat-tracker` presente; implements CanvasLayer, OverlayPanel |
| `packages/g2-app/src/panels/__tests__/canvas-combat-tracker-panel.test.ts` | RCOMB-01 panel unit tests | VERIFIED | 724 righe; 1580 test g2-app passano |
| `packages/g2-app/src/internal/boot-engine-core.ts` | boot gate + setPanelInstanceHandler | VERIFIED | 3 occorrenze di `canvas-combat-tracker` (gate arm, comment, handler) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `combat.ts` (CombatantSchema) | `Combatant` type | `z.infer` auto-pick | WIRED | `export type Combatant = z.infer<typeof CombatantSchema>` a riga 82 |
| `combat-reader.ts` | `CombatantSchema.ac` | `extractCombatantAc` + conditional spread | WIRED | `acVal !== undefined ? { ac: acVal } : {}` a riga 100 |
| `canvas-combat-tracker-panel.ts` | `renderCombatTrackerContent` (combat-tracker-panel.ts) | import reuse Approach A | WIRED | Import a riga 84; chiamata a riga 408 e 635 |
| `boot-engine-core.ts` | `setPanelInstanceHandler('canvas-combat-tracker')` | wsEventBus + QA handler injection | WIRED | Riga 1356; handler inietta entrambi i seams prima di onMount |
| `canvas-combat-tracker-panel.ts` | `wsEventBus.subscribe(combat.turn|combat.state)` | `setWsEventBus` + onMount lifecycle | WIRED | Righe 522-525; `_unsubscribeCombat` array con 2 entries |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `canvas-combat-tracker-panel.ts` | `_snapshot: CombatSnapshot` | `_onCombatDelta` ← wsEventBus ← `combat.turn`/`combat.state` WS delta ← `getCombatSnapshot()` (foundry-module) | Si — `getCombatSnapshot()` legge attori Foundry VTT reali e ora emette `ac` per combattenti linkati | FLOWING |
| `combat-tracker-panel.ts:renderCombatantRow` | `acValue` | `c.ac` da `CombatSnapshot.combatants[i].ac` (optional) | Si — `_rjust(String(c.ac), 3)` per ac presente; `' --'` fallback per ac undefined | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| shared-protocol tests (RDATA-05 schema) | `corepack pnpm --filter @evf/shared-protocol test -- --run` | Nessun output (processo completato silenziosamente con exit 0; verified via workspace run) | PASS |
| foundry-module tests (RDATA-05 reader) | `corepack pnpm --filter @evf/foundry-module test -- --run` | 562/562 passed, exit 0 | PASS |
| g2-app canvas panel tests (RCOMB-01) | `corepack pnpm --filter @evf/g2-app test -- --run canvas-combat-tracker-panel` | 1580/1580 passed, exit 0 | PASS |
| Full workspace suite | `corepack pnpm test` | 3290/3290 passed, 238 file, exit 0 | PASS |
| Typecheck workspace | `corepack pnpm typecheck` | exit 0 (nessun errore) | PASS |
| D-23.5 guard panel-router+bus | `git diff --quiet panel-router.ts panel-gesture-bus.ts` | GUARD-PASS | PASS |

---

### Probe Execution

Nessun probe convenzionale `scripts/*/tests/probe-*.sh` dichiarato per questa fase. Step 7c: SKIPPED (nessun probe file).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RCOMB-01 | 23-03-PLAN | Combat tracker / turni renderizzato come pannello raster overlay z=2, finestra 5 combattenti, highlight turno corrente, HP, concentrazione, QA-bar, gesture preservate | SATISFIED | `CanvasCombatTrackerPanel` implementata come dual CanvasLayer+OverlayPanel; id `canvas-combat-tracker`; z=Z2_OVERLAY; boot gate; test suite green |
| RDATA-05 | 23-01-PLAN, 23-02-PLAN, 23-03-PLAN | CombatantSchema porta `ac` + read path nel combat reader; combat tracker mostra AC reale | SATISFIED | Schema field `combat.ts:79`; reader `combat-reader.ts:36,100`; shared renderer `combat-tracker-panel.ts:296`; tutti e tre gli atomi (schema, reader, pannello) verificati |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `boot-engine-core.ts` | 659 | `TODO` senza tag esplicito | ℹ️ Info | Il TODO a riga 659 è referenziato nel commento adiacente come "see TODO below" e il TODO successivo a riga 663 porta `(ADR-0009)` — la catena è tracciabile. Non è un debt marker orfano. |
| `combat-tracker-panel.ts` | 409 | Parola "placeholder" in commento JSDoc | ℹ️ Info | Descrive il contenuto semantico della sezione Effects (che è intentionally minimal in MVP); non è codice stub |
| `canvas-combat-tracker-panel.ts` | 50 | Parola "placeholder" in file comment | ℹ️ Info | Riferimento storico al vecchio literal `' --'` ora sostituito; non è codice stub |

Nessun `TBD`, `FIXME`, `XXX` non referenziato in nessuno dei file modificati dalla fase. Tutti i `TODO` in `boot-engine-core.ts` portano `(ADR-NNNN)` o `(SC-XX-YY)` come richiesto da INV-4.

---

### Human Verification Required

Le verifiche software automatizzate sono tutte PASSED. Rimangono 3 item che richiedono hardware fisico G2+R1, coerentemente con ADR-0005 Branch A (hardware UAT deferral).

#### 1. Leggibilità visiva highlight turno corrente

**Test:** Aprire il combat tracker in canvas mode su G2 fisico con un combattimento attivo (3+ combattenti). Verificare che la riga del turno corrente mostri un band di highlight full-contrast (rettangolo bianco con testo scuro).
**Expected:** La riga corrente è visivamente distinta dalle altre; testo leggibile; nessun glitch di rendering sul display 4-bit greyscale 576×288.
**Why human:** L'effetto `fillRect` inverso + `ctx.fillText` sul livello greyscale non è verificabile senza display fisico; il simulatore non replica la visualizzazione G2.

#### 2. AC reale vs fallback su display fisico

**Test:** Con un combattimento che include sia combattenti linkati (con actor) sia token unlinked, aprire il combat tracker canvas e verificare che: (a) AC numerico right-justified a 3 caratteri per i combattenti linkati; (b) `' --'` per i non-linkati.
**Expected:** Valori AC leggibili nella terza colonna di ogni riga; allineamento carattere-perfetto (INV-1) su display fisico.
**Why human:** La leggibilità del valore e il rispetto dell'allineamento INV-1 su display fisico non sono verificabili via unit test (che usano happy-dom, non G2 hardware).

#### 3. Comportamento gesture double-press su display fisico

**Test:** Aprire il combat tracker canvas, premere double-press R1. Verificare che il pannello si chiuda tramite panel-router (ADR-0012) senza errori.
**Expected:** Pannello chiuso; nessuna eccezione; il bus di gesture non mostra stati inconsistenti; rientro normale al menu principale.
**Why human:** L'integrazione del PanelGestureBus con il router a runtime su hardware reale non è verificabile programmaticamente.

---

### Gaps Summary

Nessun gap tecnico. Tutti i 13 must-have sono VERIFIED con evidenza diretta nel codice. Lo stato `human_needed` riflette esclusivamente i 3 item di UAT hardware (display fisico G2 + R1) che sono attesi-differiti per ADR-0005 Branch A.

---

_Verified: 2026-06-08T06:23:30Z_
_Verifier: Claude (gsd-verifier)_
