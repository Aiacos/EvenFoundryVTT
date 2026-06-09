---
slug: pairing-evenhub-install
status: resolved
trigger: "il pairing del modulo foundry non funziona in quel modo, è richiesto che installo l'app su Even Hub. documentati bene ... leggi tutte le documentazioni in maniera esaustiva e correggi"
created: 2026-06-03
updated: 2026-06-03
---

# Debug: pairing reale = install app su Even Hub + paste token (NON QR-scan)

## Symptoms

- **Expected**: il giocatore mette l'app EVF sugli occhiali **installandola via Even Hub** (dev: `evenhub qr` → URL plugin-host; prod: `.ehpk` → portale → app store nell'app Even Realities), poi apre l'app → wizard → URL bridge + **incolla** il token generato dal modulo Foundry → sceglie il personaggio. Il modulo Foundry deve **mostrare token (e bridge URL) copiabili**.
- **Actual**: il design assume "scansiona il QR del PairModal con l'app Even Realities". Il PairModal **nasconde il token** (mai reso come testo) e mostra solo "Scan with Even Realities App". Il wizard ha un bottone "Scansiona QR" che dipende da `hub.camera`. Nessuno dei due funziona → pairing impossibile.
- **Error**: nessun errore runtime; fallimento di design/piattaforma.
- **Timeline**: assunzione di design pre-Phase-0; ADR-0005 §OQ-INV2-4 (HIGH) aveva già segnalato il rischio `hub.camera`.
- **Reproduction**: aprire il PairModal (token non visibile); aprire il wizard step2 (il bottone scan QR non compare perché `hub.camera` è undefined) → impossibile completare il pairing senza un token leggibile.

## Current Focus

- hypothesis: La piattaforma Even Hub NON espone fotocamera/QR-scan alle app → il provisioning del bearer via QR è irrealizzabile. Il path reale è: install via Even Hub + **paste manuale** del token. Il PairModal va corretto per **rivelare/copiare** token+bridge URL; il path QR-scan del wizard è codice morto (INV-4); i doc che descrivono il QR-pairing vanno riallineati alla realtà (INV-2/INV-3).
- test: confermato via 4 fonti (vedi Evidence).
- expecting: —
- next_action: APPLICARE il fix completo (codice + doc) — decisioni bloccate sotto.
- reasoning_checkpoint:
- tdd_checkpoint:

## DECISIONS (LOCKED by user 2026-06-03)

1. **Ambito = COMPLETO**: fix funzionale (codice) + riallineamento documentazione canonica, in un'unica passata coerente (INV-3). Un solo PR.
2. **QR nel PairModal = RIMOSSO**: niente più QR. Il PairModal mostra **bridge URL + token come testo copiabile**, token **nascosto di default con toggle "mostra/copia"** (compromesso sicurezza). È l'unico path che funziona (nessuna app può scansionare un QR — niente fotocamera).

## Evidence

- timestamp: 2026-06-03 — [CANONICA INV-2] hub.evenrealities.com/docs/guides/device-apis: *"no camera (there is none)"*. Nessuna API di QR-scan esposta alle app. L'app gira nel WebView del telefono (overview: *"App logic runs on the phone; the glasses handle display rendering"*).
- timestamp: 2026-06-03 — [CANONICA INV-2] `evenhub qr` (cli reference) genera un QR che codifica l'**URL del dev-server**, scansionato dall'app Even Realities host per *caricare l'app* con hot reload. NON è un QR di token. Distribuzione prod: `evenhub pack` → `.ehpk` → portale → review manuale → app store.
- timestamp: 2026-06-03 — [REPO ADR] docs/architecture/0005-phase0-go-no-go.md §OQ-INV2-4 (HIGH): la wizard usa `hub.setItem/getItem/removeItem/eventBus/camera` che NON esistono nel simulatore canonico (solo `flutterBridge.callHandler`). Open question da risolvere.
- timestamp: 2026-06-03 — [REPO CODE] packages/g2-app/src/hub-polyfill.ts: imposta `camera: undefined` di proposito; il wizard degrada gracefully. → il bottone scan QR non compare MAI su hardware reale.
- timestamp: 2026-06-03 — [REPO CODE] packages/g2-app/src/wizard/steps/step2-token.ts: bottone "Scansiona QR" + `_probeCameraApi()` via `hub.camera.requestAccess()/scanQRCode()`; il path è dead code. Token comunque atteso come stringa semplice (no JSON.parse del payload PairModal).
- timestamp: 2026-06-03 — [REPO CODE] packages/foundry-module/src/pair/PairModal.ts buildQrPayload → QR codifica {bridge_url, token, internal_secret, world, expires}; commento "Token is NEVER rendered in HTML". NESSUN consumatore del QR in tutto il repo. i18n evf.pair.qr.scan_instruction = "Scan with Even Realities App" / "Scansiona con l'app Even Realities".
- timestamp: 2026-06-03 — [REPO CODE] g2-app packaging ESISTE: app.json (package_id io.github.aiacos.foundryvtt, edition 202601, supported_languages it/en, network whitelist placeholder), script pack:ehpk + dev:qr, .github/workflows/evenhub-pack.yml, docs/release/evenhub.md (dev qr vs portale .ehpk; nessun comando submit → manuale).
- timestamp: 2026-06-03 — [REPO CODE] bridge valida il token via socketlib `evf.validateToken` verso Foundry (token-cache.ts). Path token→Foundry corretto e funzionante con paste.
- timestamp: 2026-06-03 — [REPO DOCS] Specs.md §3.8 L495, §7.14.7.2 L2884 ("install QR evenfoundryvtt-g2/install"), §7.14.7.3 L2880/2888-2889 ("QR scan via getUserMedia", "tap 📷 Scan QR"), §11.5.4 L2926/L3704 ("provisioned/paired via QR scan"); README L108 ("pairing via QR code"); docs/showcase/index.html L676/697-698 ("QR pair, never paste"); docs/release/foundry-test-stack.md §4.2 ("paste the bearer token (or scan the QR)") → tutti contraddicono la realtà di piattaforma.

## Eliminated

(nessuna)

## Proposed Fix (da validare nel loop / scope da confermare con l'utente)

### Fix funzionale (sblocca davvero il pairing)
1. **PairModal**: mostrare **token + bridge URL come testo copiabile** (con pulsanti Copy), così il DM li passa al giocatore per il paste nel wizard. Il QR resta opzionale/decorativo (non è machine-scannable dall'app). Aggiornare i18n: scan_instruction → istruzione di copia/paste. Mantenere il token nascosto-by-default con toggle "mostra/copia" (compromesso sicurezza).
2. **Wizard step2-token.ts**: rimuovere il path QR-scan (`hub.camera`, `_probeCameraApi`, `scan_qr_btn`) — dead code, INV-4. Lasciare paste/clipboard + input manuale.

### Riallineamento doc (INV-3 coherence, INV-2 sourcing)
3. **Specs.md**: §3.8/§7.14.7.2/§7.14.7.3/§11.5.4 + changelog — sostituire il QR-provisioning con: install via Even Hub (dev qr = URL app; prod .ehpk/portale/store) + paste del token. Aggiungere sezione "user install flow".
4. **README.md**: "pairing via QR code" → paste; chiarire install via Even Hub.
5. **docs/showcase/index.html**: "QR pair, never paste" → realtà (paste; install via Even Hub).
6. **docs/release/foundry-test-stack.md** §4.2: togliere "or scan the QR".
7. **ADR-0005 §OQ-INV2-4**: risolvere — `hub.camera` confermato inesistente → QR-scan rimosso.

## Files in scope

- packages/foundry-module/src/pair/PairModal.ts + templates/pair-modal.hbs + lang/{it,en}.json
- packages/g2-app/src/wizard/steps/step2-token.ts + i18n-catalog.ts (+ test)
- Specs.md (+ changelog), README.md, docs/showcase/index.html
- docs/release/foundry-test-stack.md, docs/architecture/0005-phase0-go-no-go.md

## Resolution

- **root_cause**: La piattaforma Even Hub non espone API fotocamera/QR-scan alle app (canonica `hub.evenrealities.com/docs/guides/device-apis`: *"no camera (there is none)"*; l'app gira nel WebView del telefono). Il QR-pairing assunto in v0.9.11 era quindi irrealizzabile, e il PairModal nascondeva il token (mai reso come testo) impedendo al DM di passarlo al player. Il path reale è: install dell'app via Even Hub (dev `evenhub qr` = carica l'URL del plugin-host; prod `.ehpk` → review portale → store) + **paste manuale** del token nel wizard.
- **fix**: PairModal rimuove la generazione QR (dropped `qrcode`/`@types/qrcode`) e mostra bridge URL + token come testo copiabile (token mascherato di default con toggle Reveal/Copy); il wizard g2-app step2 rimuove il dead-code QR-scan (`hub.camera`/`_probeCameraApi`/`scan_qr_btn`, INV-4). i18n riallineata (rimosso `evf.pair.qr.scan_instruction`, aggiunte `evf.pair.copy.*`, IT+EN). Documentazione canonica riallineata (Specs §3.8/§7.14.7.x/§11.5.4 + changelog, README, showcase, foundry-test-stack, ADR-0005 §OQ-INV2-4 risolto). Changeset patch su @evf/foundry-module + @evf/g2-app.
- **verification**: `pnpm typecheck` exit 0; `pnpm lint:ci` (biome ci) exit 0, clean; `pnpm test` 2874/2874 verde; `changeset status` → entrambi i package a patch; i18n keys complete (parità IT/EN, nessuna chiave mancante template↔lang); INV-1 mockup wizard step 2 riallineato a colonna; INV-3 README/Specs/showcase coerenti.
- **files_changed**:
  - packages/foundry-module/src/pair/PairModal.ts
  - packages/foundry-module/templates/pair-modal.hbs
  - packages/foundry-module/src/pair/PairModal.test.ts
  - packages/foundry-module/lang/{it,en}.json
  - packages/foundry-module/package.json (rimosso qrcode/@types/qrcode; aggiunto @types/node)
  - packages/foundry-module/tsconfig.json (types: ["node"])
  - packages/g2-app/src/wizard/steps/step2-token.ts (+ .test.ts)
  - packages/g2-app/src/wizard/i18n-catalog.ts
  - packages/g2-app/src/wizard/wizard.ts
  - packages/g2-app/src/wizard/wizard-init.test.ts
  - packages/g2-app/src/types/even-hub.d.ts
  - packages/g2-app/src/hub-polyfill.ts
  - Specs.md, README.md, docs/showcase/index.html
  - docs/release/foundry-test-stack.md, docs/architecture/0005-phase0-go-no-go.md
  - .changeset/pairing-evenhub-install.md
