# Decisioni architetturali (ADR)

Gli ADR sono in formato MADR 4.0 in [`docs/architecture/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/docs/architecture). I numeri 0016–0018 erano 0012–0014 sul ramo dello streaming diretto: sono stati rinumerati nel port su `develop` (v0.12.0), dove 0012–0015 esistevano già. Un ADR accettato non si riscrive: si supera o si emenda con un ADR nuovo che lo cita. Indice ufficiale: [`docs/architecture/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/README.md).

## 🏗️ Decisioni in vigore

| ADR | Decisione in una riga | Stato |
|---|---|---|
| [ADR-0018](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md) | HUD a scheda D&D in cinque zone, zone A–D disegnate da un renderer a pixel in TypeScript puro; mappa = arte originale della scena pixelata e ditherata Floyd–Steinberg, maschera di visione, segni vettoriali sopra | accettato |
| [ADR-0017](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0017-player-owned-glasses-hybrid-projector.md) | Occhiali dei giocatori: abilitazione una tantum del GM, associazione self-service dal Foundry del giocatore, chiavi ECDH P-256, projector ibrido (client del giocatore se online, altrimenti un GM) | accettato |
| [ADR-0016](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0016-direct-foundry-streaming.md) | Streaming diretto Foundry → G2: app servita dal modulo e caricata con QR sideload, utente «(G2)», buste AES-GCM sul relay `module.evenfoundryvtt`; bridge, Docker e `foundry-mcp` rimossi | accettato (emendato da 0017, 0018) |
| [ADR-0012](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md) | Modello dei gesti R1: tap, doppio tap, swipe su/giù, nessun input a durata; menu col tap dalla vista base (emendamento 2); doppio tap sulla radice ⇒ uscita `shutDownPageContainer(1)`; gestori del ciclo di vita | accettato (canonico; implementato da 0018) |
| [ADR-0011](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0011-foundry-write-path-single-workflow-origin.md) | Write path con origine unica: ogni mutazione passa da `dispatchTool`; solo `src/write-path/` chiama `activity.use()` (gate CI 8) | accettato (emendato da 0017: l'origine è il projector eletto; l'emendamento 2 «esecuzione del giocatore via poller» è superato da 0017) |
| [ADR-0008](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0008-code-quality-configuration.md) | Qualità del codice: Biome 2, TypeScript strict, copertura Vitest, gate CI, Conventional Commits | accettato |
| [ADR-0003](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0003-tool-registry-pattern.md) | Registro dei tool condiviso tra gesti MVP e futuri client | accettato (emendato da 0016: `foundry-mcp` rimosso) |

## 🏗️ Decisioni superate o aperte

| ADR | Decisione in una riga | Stato |
|---|---|---|
| [ADR-0015](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0015-player-view-map-capture.md) | Cattura della mappa dalla vista giocatore (canvas del browser, headless) | superato da 0016 (mappa dai dati del documento) |
| [ADR-0014](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0014-bearer-actor-authorization.md) | Bearer legato all'utente Foundry + autorizzazione per attore | superato da 0017 (custodia ECDH per dispositivo; il controllo di proprietà per attore resta) |
| [ADR-0013](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0013-hud-raster-rendering.md) | HUD raster sugli occhiali (sostrati canvas / ibrido / showcase) | superato da 0018 (renderer; i fatti hardware restano validi) |
| [ADR-0010](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0010-panel-plugin-registry.md) | Registro dei pannelli sovrapposti | superato da 0018 |
| [ADR-0009](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0009-layer-manager-contract.md) | Contratto del layer manager | superato da 0018 |
| [ADR-0006](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0006-raster-pipeline-library-stack.md) | Pipeline raster con `image-q` / `xxhash-wasm` | superato da 0018 |
| [ADR-0005](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0005-phase0-go-no-go.md) | GO/NO-GO della Phase 0 (raster vs glifi) | proposto (verdetto hardware in sospeso) |
| [ADR-0004](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0004-voice-via-mcp-not-internal.md) | Voce tramite MCP, non LLM interno né EvenAI | superato da 0016 (la voce può tornare con un nuovo ADR) |
| [ADR-0002](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0002-protocol-versioning.md) | Busta WS del bridge, versioni, idempotenza, replay | superato in parte da 0016 |
| [ADR-0001](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0001-layered-ui-model.md) | UI a livelli z=0/1/2 | superato da 0018 |
| ADR-0007 | riservato alle lingue RTL (V2) | non scritto |

## 📚 Documenti collegati

- Indice del design: [`docs/design/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/design/README.md) · specifica UX: [`docs/design/g2-sheet-ux.html`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/design/g2-sheet-ux.html)
- Invarianti: [`docs/architecture/INVARIANTS.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/INVARIANTS.md) · [Test e qualità](Test-e-Qualita)
- [Architettura](Architettura)
