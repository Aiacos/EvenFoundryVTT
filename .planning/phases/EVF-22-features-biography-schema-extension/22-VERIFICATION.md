---
phase: 22-features-biography-schema-extension
verified: 2026-06-08T01:50:00Z
status: human_needed
score: 5/5 must-haves verified
gaps_resolved:
  - truth: "pnpm test passa con test di schema, reader e renderer (criterio 5 del ROADMAP)"
    status: resolved
    reason: "Gap chiuso: CR-BIO-2 allineato al comportamento corretto WR-03 (block-level tag → spazio separatore). Assertion aggiornata da 'Hix' a 'Hi x'. Full suite ora verde: 558/558 foundry-module + workspace exit 0 (3263 test)."
    artifacts:
      - path: "packages/foundry-module/src/readers/readers.test.ts"
        issue: "linea 1390 aggiornata a expect(result.backstory).toBe('Hi x') con commento esplicativo block-vs-inline (commit gap-closure)"
human_verification:
  - test: "Feats e Bio tab leggibili + scroll bio su G2 fisico + R1"
    expected: "I feat reali del personaggio appaiono nel tab Features; la biografia reale appare nel tab Biography; lo scroll R1 avanza il contenuto della bio; il testo è glanceable alla risoluzione 576×288"
    why_human: "Nessun hardware G2 in CI (ADR-0005 Branch A); il simulatore non verifica legibilità né risposta gesture su hardware reale"
---

# Phase 22: Features + Biography Schema Extension — Verification Report

**Phase Goal:** `CharacterSnapshotSchema` porta `feats[]` e `biography` con reader nel `foundry-module`; i tab Features e Biography della scheda raster mostrano dati reali invece delle fixture hardcoded.
**Verified:** 2026-06-08T01:50:00Z (gap closed same day)
**Status:** human_needed (all 5 software must-haves verified; hardware UAT deferred per ADR-0005 Branch A)
**Re-verification:** Gap closure applied directly — CR-BIO-2 assertion synced to WR-03 behavior; full suite re-run green

---

## Goal Achievement

### Observable Truths (da ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `CharacterSnapshotSchema.feats` e `extractFeats()` reader wired; tab Features mostra dati reali (non DEFAULT_FEATS) | VERIFIED | `FeatEntrySchema` line 480, `feats: z.array(FeatEntrySchema).optional()` line 665 in `character.ts`; `extractFeats()` line 551 in `character-reader.ts`; `feats: extractFeats(actor)` line 761; `snapshot.feats ?? []` line 754 in renderers; `DEFAULT_FEATS` count=0 |
| 2 | `CharacterSnapshotSchema.biography` e `extractBiography()` reader wired; tab Biography mostra bio reale (non hardcoded) | VERIFIED | `BiographySnapshotSchema` line 534, `biography: BiographySnapshotSchema.optional()` line 672; `extractBiography()` line 591; `biography: extractBiography(actor)` line 762; `snapshot.biography?.personality ?? ''` line 925 in renderers |
| 3 | Estensione atomica: schema 22-01 + reader 22-02 + renderer 22-03 tutti in scope | VERIFIED | Commit TDD RED→GREEN documentati per tutti e 3 i piani: `1d2155b/d70d10a`, `13eadde/75fce05`, `5e57c82/4a4616d`, `588023f/6f3d310`; tutti presenti in `git log` |
| 4 | Downstream literals TS strict compilano senza regressioni (feats/biography OPTIONAL) | VERIFIED | OPTIONAL design (`D-22.1`); typecheck `pnpm --filter @evf/shared-protocol exec tsc --noEmit` exit 0; nessuna literal downstream aggiornata forzatamente |
| 5 | `pnpm test` passa con test schema, reader e renderer (CS-FE-*, CS-BIO-*, CR-FT-*, CR-BIO-*, CSTR-FEAT-*, RCSP-BIO-*) | VERIFIED | Gap chiuso: `CR-BIO-2` allineato al comportamento WR-03 (`'Hix'` → `'Hi x'`); full suite verde — 558/558 foundry-module, workspace exit 0 (3263 test). |

**Score: 4/5** truths verified

---

## Root Cause dell'unico fallimento

**WR-03** (commit `ef3468e`) ha aggiornato correttamente `stripHtml` in entrambe le implementazioni (foundry-module + g2-app) per sostituire i tag block-level con uno spazio prima di strippare. Questo previene la fusione di parole adiacenti (`<p>Hello</p><p>world</p>` → `Hello world` invece di `Helloworld`).

Il test `CR-BIO-2` usa `'<h2>Hi</h2><strong>x</strong>'` come input. Con la nuova implementazione:
1. `<h2>Hi</h2>` → ` Hi ` (spazio iniettato attorno al tag block-level)
2. `<strong>x</strong>` → `x` (tag inline, strippato senza spazio)
3. Collasso spazi + trim → `'Hi x'`

Il test afferma `'Hix'` (comportamento pre-WR-03). Il REVIEW-FIX.md ha applicato WR-03 ma non ha aggiornato questo test, e ha dichiarato erroneamente "Full suite confirmed green".

**Fix richiesto:** Una singola linea — `readers.test.ts:1390`: cambiare `toBe('Hix')` in `toBe('Hi x')`.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared-protocol/src/payloads/character.ts` | FeatEntrySchema, BiographySnapshotSchema, optional fields on CharacterSnapshotSchema | VERIFIED | Lines 480, 534, 665, 672 — tutti presenti e sostanziali |
| `packages/shared-protocol/src/payloads/character.test.ts` | CS-FE-* e CS-BIO-* tests | VERIFIED | 11 test (CS-FE-1..6, CS-BIO-1..5) tutti documentati e presenti |
| `packages/foundry-module/src/readers/character-reader.ts` | extractFeats(), extractBiography(), wired into getCharacterSnapshot() | VERIFIED | Lines 551, 591, 761-762 — implementazione sostanziale con null-safety completa |
| `packages/foundry-module/src/types/foundry-globals.d.ts` | FoundryItem.system.type/description + Dnd5eDetails.{trait,...} ambient types | VERIFIED | `trait?: string` line 295; `type?: {` line 645 — import-free (Pitfall 6 compliant) |
| `packages/foundry-module/src/readers/readers.test.ts` | CR-FT-* e CR-BIO-* tests | PARTIAL | 10 test presenti; CR-BIO-2 fallisce su assertion stale post-WR-03 |
| `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` | renderFeatsTab/renderBioTab consume snapshot data; DEFAULT_FEATS rimosso | VERIFIED | `snapshot.feats` line 754; `snapshot.biography?.personality` line 925; DEFAULT_FEATS count=0; FeatDef.category widened to string (line 693) |
| `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` | Tab-aware onEvent scroll; _scrollOffset passato a paint*Tab; isAtTopBoundary unchanged | VERIFIED | `_scrollOffset--` line 450; `Math.min(_scrollOffset+1, MAX_SCROLL_OFFSET)` line 459; `return this._scrollOffset === 0` line 488; paintFeatsTab/paintBioTab con `this._scrollOffset` lines 591/594 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CharacterSnapshotSchema` | `FeatEntrySchema` / `BiographySnapshotSchema` | `z.array(FeatEntrySchema).optional()` / `BiographySnapshotSchema.optional()` | VERIFIED | Lines 665-672 in character.ts |
| `getCharacterSnapshot()` | `extractFeats()` / `extractBiography()` | `feats: extractFeats(actor)` / `biography: extractBiography(actor)` | VERIFIED | Lines 761-762 in character-reader.ts |
| `extractBiography()` | `actor.system.details.trait` | `personality: details.trait as string` | VERIFIED | Line 605 — mapping corretto `trait` (non `personality`) |
| `renderFeatsTab` | `snapshot.feats` | `snapshot.feats ?? []` mapping | VERIFIED | Line 754 in character-sheet-tab-renderers.ts |
| `renderBioTab` | `snapshot.biography` | `snapshot.biography?.personality ?? ''` etc. | VERIFIED | Lines 925-929 |
| `CanvasCharacterSheetPanel.onEvent` | `_scrollOffset` | bio/feats tab-aware scroll increment/decrement | VERIFIED | Lines 448-463; MAX_SCROLL_OFFSET=200 ceiling applicato |
| `_paintActiveTab` | `paintFeatsTab/paintBioTab` | `this._scrollOffset` passato come parametro | VERIFIED | Lines 591, 594 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `renderFeatsTab` | `snapshot.feats` | `extractFeats(actor)` ← `actor.items.contents` filter | Si — filtra `type==='feat'` da actor.items Foundry live | FLOWING |
| `renderBioTab` | `snapshot.biography` | `extractBiography(actor)` ← `actor.system.details.{trait,ideal,bond,flaw,biography}` | Si — legge campi dnd5e reali; HTML-stripped backstory | FLOWING |
| `paintFeatsTab` | `scrollOffset` | `this._scrollOffset` da `CanvasCharacterSheetPanel` | Si — gestito da gesture tab-aware | FLOWING |
| `paintBioTab` | `scrollOffset` | `this._scrollOffset` da `CanvasCharacterSheetPanel` | Si — stesso cursore | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| FeatEntrySchema esporta da @evf/shared-protocol index | `grep "FeatEntrySchema" packages/shared-protocol/src/index.ts` | Line 54: trovato | PASS |
| BiographySnapshotSchema esporta da index | `grep "BiographySnapshotSchema" packages/shared-protocol/src/index.ts` | Line 47: trovato | PASS |
| DEFAULT_FEATS rimosso | `grep -c "DEFAULT_FEATS" character-sheet-tab-renderers.ts` | 0 | PASS |
| `details.trait` (non `.personality`) in extractBiography | `grep "details.trait" character-reader.ts` | Line 605 | PASS |
| isAtTopBoundary invariante | `grep "return this._scrollOffset === 0"` | Line 488 | PASS |
| CR-BIO-2 test assertion | `pnpm --filter @evf/foundry-module test --run -t "CR-BIO-2"` | FAIL — expected `'Hix'`, received `'Hi x'` | FAIL |
| Workspace typecheck | implicito da commit history + SUMMARY exit 0 claims | Non ri-eseguito ma dichiarato exit 0 in tutti e 3 i SUMMARY | PASS (trust) |

---

## Probe Execution

Step 7c: SKIPPED — nessun file `scripts/*/tests/probe-*.sh` dichiarato nei piani di questa fase.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RDATA-03 | 22-01, 22-02, 22-03 | CharacterSnapshotSchema porta feats[]; reader extractFeats(); tab Features reali | SATISFIED — parzialmente bloccato da CR-BIO-2 non correlato | FeatEntrySchema line 480; extractFeats line 551; snapshot.feats line 754; REQUIREMENTS.md `[x] RDATA-03` |
| RDATA-04 | 22-01, 22-02, 22-03 | CharacterSnapshotSchema porta biography; reader extractBiography(); tab Bio reale | SATISFIED — test CR-BIO-2 ha assertion stale (test nel scope RDATA-04) | BiographySnapshotSchema line 534; extractBiography line 591; snapshot.biography lines 925-929; REQUIREMENTS.md `[x] RDATA-04` |

**Note:** REQUIREMENTS.md segna già `[x]` sia RDATA-03 che RDATA-04. La traceability table li mappa entrambi a Phase 22 con status `Complete`. Il fallimento CR-BIO-2 è conseguenza di un mismatch test-assertion introdotto dal post-review fix WR-03, non di una regressione funzionale.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `readers.test.ts` | 1390 | Assertion stale `toBe('Hix')` dopo WR-03 ha cambiato comportamento `stripHtml` | WARNING | 1 test fallisce nella suite; non indica un difetto funzionale ma un test non sincronizzato col behavior intenzionale |

**Debt markers:** Nessun `TODO`, `FIXME`, `TBD`, o `XXX` trovato nei file modificati dalla fase.

---

## Human Verification Required

### 1. Legibilità Feats e Biography su G2 fisico + scroll R1

**Test:** Avviare la sessione D&D su Foundry con un personaggio che ha feat e biografia compilati. Con gli occhiali G2 indossati, navigare al tab Features (gesture press/scroll R1) e verificare che i feat reali del personaggio appaiano. Poi navigare al tab Biography e scorrere il testo con scroll-down R1.
**Expected:** I feat reali (non fixture hardcoded) appaiono nel tab Features con corretta annotazione `[Origine]` per gli origin feat. La bio mostra i campi personality/ideal/bond/flaw e il backstory; lo scroll R1 avanza il contenuto riga per riga. Il testo è leggibile alla risoluzione 576×288 4-bit greyscale.
**Why human:** Nessun hardware G2/R1 in CI (ADR-0005 Branch A). Il simulatore riproduce layout ma non verifica legibilità percettiva su hardware reale né latenza gesture fisica.

---

## Gaps Summary

**1 gap bloccante** (test suite rotta):

Il fix WR-03 (commit `ef3468e`) ha correttamente aggiornato `stripHtml` in entrambe le implementazioni per iniettare uno spazio prima dei tag block-level HTML, evitando la fusione di parole. Tuttavia il test `CR-BIO-2` in `readers.test.ts:1390` usa `'<h2>Hi</h2><strong>x</strong>'` come input — `<h2>` è un block-level tag — e l'assertion `toBe('Hix')` riflette il vecchio comportamento pre-WR-03. Con il nuovo `stripHtml`, il risultato corretto è `'Hi x'`, ma l'assertion non è stata aggiornata.

**Fix:** una singola linea in `readers.test.ts`:
```
// riga 1390: cambiare
expect(result.backstory).toBe('Hix');
// in
expect(result.backstory).toBe('Hi x');
```

Il REVIEW-FIX.md dichiara erroneamente "Full suite confirmed green post-fix" — la suite **non** era verde dopo il commit `ef3468e`.

Tutti gli altri must-have della fase (schema Zod, reader logic, renderer data wiring, scroll tab-aware, rimozione DEFAULT_FEATS, isAtTopBoundary invariante) sono **VERIFIED** nel codebase.

---

_Verified: 2026-06-08T01:50:00Z_
_Verifier: Claude (gsd-verifier)_
