---
slug: pairmodal-no-qr-token
status: resolved
trigger: "non mi fa vedere nessun QR e nessun token"
created: 2026-06-03
updated: 2026-06-03
---

# Debug: PairModal non mostra QR né token

## Symptoms

- **Expected behavior**: Aprendo il Pair modal (Foundry → Settings → Module Settings → EvenFoundryVTT → "Abbina un dispositivo G2") deve apparire il codice QR di pairing (e il relativo token, codificato nel QR) da scansionare con l'app Even Realities / inserire nel wizard del g2-app.
- **Actual behavior**: il modal non mostra alcun QR né alcun token (contenuto vuoto / non renderizzato).
- **Error messages**: nessun errore segnalato dall'utente a schermo; sospetta eccezione Handlebars `Missing helper: "eq"` in console del browser (DA CONFERMARE nei devtools).
- **Timeline**: regressione introdotta dal commit `e5b4a3f` "fix(foundry-module): PairModal uses ApplicationV2 HandlebarsApplicationMixin (v13+ render)". Il path precedente non passava da questo template Handlebars.
- **Reproduction**: aprire il Pair modal da Module Settings su installazione (anche pulita).

## Current Focus

- hypothesis: Il template `packages/foundry-module/templates/pair-modal.hbs` usa l'helper Handlebars `eq` (`{{#unless (eq state "empty")}}` ecc., righe 29/32/58/66/73) che Foundry NON registra di default → al render `HandlebarsApplicationMixin` lancia `Missing helper: "eq"` e il render fallisce in ogni stato → modal vuoto, nessun QR.
- test: Verificare in console browser l'eccezione al render del modal; oppure confermare via API Foundry (foundryvtt.com/api/.../handlebars) che `eq` non è tra gli helper registrati.
- expecting: Eccezione "Missing helper: eq" / lista helper Foundry senza `eq`.
- next_action: RISOLTO — fix applicato.
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-06-03 — Verificato su `foundryvtt.com/api/modules/foundry.applications.handlebars.html`: gli helper registrati da Foundry sono `checked, concat, disabled, editor, formGroup, formInput, getTemplate, ifThen, initialize, loadTemplates, localize, numberFormat, numberInput, object, radioBoxes, renderTemplate, selectOptions`. **`eq` NON è presente** (né `ne`/`gt`). [ROOT CAUSE PRIMARIA]
- timestamp: 2026-06-03 — `grep registerHelper` su `packages/foundry-module/src`: nessuna registrazione custom di `eq`. Quindi il template usa un helper inesistente.
- timestamp: 2026-06-03 — `pair-modal.hbs` usa `(eq state ...)` alle righe 29, 32, 58, 66, 73.
- timestamp: 2026-06-03 — [SECONDARIA] Empty state senza pulsante per generare il primo bearer: in stato `empty` la regione QR è interamente nascosta (`{{#unless (eq state "empty")}}`) e la tabella mostra solo testo informativo; non esiste `data-action="new-code"`/`refresh` → su install pulita il DM non può MAI generare il primo codice dal modal. (PairModal.ts `_computeState` ritorna `empty` se `listBearers()` è vuoto; nessuna auto-generazione.)
- timestamp: 2026-06-03 — [SECONDARIA] `pair-modal.hbs` riga 61 `data-expires="{{expiresAtMs}}"` ma `_prepareContext` ritorna `expiresIso`, NON `expiresAtMs` → countdown non parte (legge `data-expires` come numero epoch ms).
- timestamp: 2026-06-03 — [SECONDARIA] `pair-modal.hbs` riga 56 `{{i18n.expiresIn}}` e riga 133 `{{i18n.close}}` ma `buildI18n()` non definisce le chiavi `expiresIn`/`close`. Nel lang la chiave esistente è `evf.pair.qr.expires_in` (placeholder `{time}`); manca del tutto una chiave `close`.
- timestamp: 2026-06-03 — `PairModal.test.ts` copre solo `_prepareContext` (layer dati), mai il render Handlebars reale → nessuno di questi problemi era coperto (buco di test).

## Eliminated

(nessuna ipotesi eliminata)

## Proposed Fix (pre-investigazione, da validare nel loop)

1. **eq helper**: rimuovere `eq` dal template passando flag booleani precalcolati da `_prepareContext` (`isEmpty`, `isExpired`, `isRefreshNeeded`, `isPairing`, `showQr`) — coerente col pattern esistente di i18n pre-risolto. (Alternativa: registrare un helper `eq` globale in `init`.)
2. **Empty state**: aggiungere pulsante `data-action="new-code"` ("Genera codice di abbinamento") visibile nello stato empty.
3. **Countdown**: aggiungere `expiresAtMs: entry.expiresAt` al contesto e usarlo in `data-expires`.
4. **i18n**: aggiungere `expiresIn` (→ `evf.pair.qr.expires_in`) e `close` a `buildI18n()` + chiave `evf.pair.modal.close` in `it.json`/`en.json`.
5. **Test**: aggiungere render reale del template (o assert che il contesto copra tutte le chiavi referenziate dal template) per chiudere il buco.

## Files in scope

- packages/foundry-module/src/pair/PairModal.ts
- packages/foundry-module/templates/pair-modal.hbs
- packages/foundry-module/lang/it.json
- packages/foundry-module/lang/en.json
- packages/foundry-module/src/pair/PairModal.test.ts

## Resolution

- **root_cause**: `pair-modal.hbs` usava l'helper Handlebars `eq` (es. `{{#unless (eq state "empty")}}`) che Foundry VTT non registra di default → `HandlebarsApplicationMixin` lanciava `Missing helper: "eq"` ad ogni render → modal vuoto, nessun QR né token visibile.
- **fix**: (1) Tutti gli usi di `(eq state "X")` nel template rimossi; `_prepareContext` ora esporta i flag booleani precalcolati `isEmpty`, `isExpired`, `isRefreshNeeded`, `isPairing`, `showQr` — il template usa solo `{{#if flag}}`. (2) Aggiunto pulsante `data-action="new-code"` nella sezione empty-state per permettere la generazione del primo bearer su install pulita. (3) `_prepareContext` ora include `expiresAtMs: entry.expiresAt` (epoch ms); il template usa `data-expires="{{expiresAtMs}}"` → countdown funzionante. (4) `buildI18n()` include `expiresIn` (→ `evf.pair.qr.expires_in`) e `close` (→ `evf.pair.modal.close`); chiave `evf.pair.modal.close` aggiunta a `it.json` ("Chiudi") e `en.json` ("Close"). (5) Test aggiornati: asserzioni su tutti i flag booleani, su `expiresAtMs`, e sui due i18n-key mancanti; aggiunto test per il binding del pulsante new-code nello stato empty.
- **verification**: `pnpm typecheck` → 0 errori; `biome ci` su file modificati → exit 0 (solo 1 `info` pre-esistente sul costruttore stub); `pnpm test` → 2873/2873 passed, 197 test file.
- **files_changed**:
  - `packages/foundry-module/templates/pair-modal.hbs` — rimosso `eq`, sostituito con flag booleani; aggiunta sezione empty-state con CTA
  - `packages/foundry-module/src/pair/PairModal.ts` — aggiunto `isEmpty/isExpired/isRefreshNeeded/isPairing/showQr/expiresAtMs` al contesto; aggiunto `expiresIn` e `close` a `buildI18n()`; interfaccia `PairModalData` aggiornata; JSDoc aggiornato
  - `packages/foundry-module/lang/it.json` — aggiunto `evf.pair.modal.close: "Chiudi"`; aggiornato `emptyBody` per l'empty-state CTA
  - `packages/foundry-module/lang/en.json` — aggiunto `evf.pair.modal.close: "Close"`; aggiornato `emptyBody`
  - `packages/foundry-module/src/pair/PairModal.test.ts` — aggiunto suite `boolean flags`, `expiresAtMs`, regression test per `expiresIn`/`close` i18n key, test empty-state new-code button
