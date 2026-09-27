# Glossario

Un solo nome per ogni concetto, lo stesso sugli occhiali, in Foundry e nei documenti (principio P3).

## 🏷️ Termini

| Termine | Significato |
|---|---|
| **G2** | occhiali AR Even Realities: display 576 × 288 px verde a 16 livelli, niente altoparlante né fotocamera ([device APIs](https://hub.evenrealities.com/docs/build/device-apis)) |
| **R1** | anello smart Even Realities: tap, doppio tap, swipe su/giù; pressione lunga come extra ([anello](https://www.evenrealities.com/smart-ring)) |
| **Even Realities App** (Even App) | app sul telefono che associa G2 e R1 ed esegue le app degli occhiali nella sua WebView |
| **Even Hub** | piattaforma e SDK per le app degli occhiali ([hub.evenrealities.com](https://hub.evenrealities.com/docs)) |
| **FoundryVTT G2 HUD** | nome dell'app degli occhiali su Even Hub (pacchetto `packages/g2-app`, un solo bundle per `.ehpk`, GitHub Pages `/app/` e Vite) |
| **QR in modalità sviluppatore** | la Even Realities App (*Even Hub → Scan QR*) apre la pagina del QR come app degli occhiali, senza installarla; si ferma quando il telefono va in background |
| **Modulo** / `evenfoundryvtt` | il modulo Foundry: projector, collegamento, readers, write path |
| **Projector** | la scheda di Foundry che ha mostrato il QR (di solito del giocatore, oppure del GM per chi non ha un dispositivo): trasmette il personaggio ed esegue le azioni; una sola per browser (Web Lock) |
| **Relay** | inoltro WebSocket a stanze (`packages/relay`, `wss://evf-relay.evf-relay.workers.dev`) dove si incontrano projector e occhiali; inoltra buste cifrate senza leggerle |
| **Stanza** | id casuale da 128 bit che projector e occhiali condividono sul relay; cambia al primo collegamento |
| **Busta sigillata** | `{evf, to, from, iv, ct}`: messaggio cifrato AES-256-GCM con la chiave del dispositivo |
| **Chiave del dispositivo** | chiave AES-256 condivisa tra occhiali e projector; ruota al primo collegamento |
| **Collega occhiali G2** | la finestra del modulo (tasto destro sul proprio nome, **Alt+G** o *Configura impostazioni*) che mostra QR e codice; aprirla è già collegare |
| **Scansiona QR** / campo **Codice** | i due modi, sulla pagina del telefono, di leggere il collegamento: in *Prima configurazione*, oppure nella scheda **Collega di nuovo** della pagina *Connessione* (la finestra di Foundry lo ricorda sotto il codice) |
| **Codice** | 16 caratteri `XXXX-XXXX-XXXX-XXXX` in alternativa al QR; stanza e chiave derivano dal codice |
| **Scollega** | dimentica gli occhiali nel browser che li trasmette e li avvisa (S10) |
| **Collega di nuovo** | scheda della pagina *Connessione* del telefono con **Scansiona QR** e il codice; si apre da sola quando non sei collegato |
| **Ripristina predefinito** | pulsante della finestra *Collega occhiali G2* che rimette al valore predefinito «Pagina dell'app occhiali» o «Relay» e mostra un nuovo QR |
| **Codice già usato** | un QR o link che quel telefono ha già usato (anche dopo *Scollega* o *Dimentica associazione*): l'app lo ignora, lo dice sul telefono e tiene l'associazione che funziona |
| **Annulla QR** | pulsante sotto il QR nella finestra *Collega occhiali G2*: il QR e il codice smettono subito di funzionare (chiudere la finestra non li annulla) |
| **Riga di avvio** | riga in fondo alla pagina del telefono, `app · secure · crypto · link · relay`, senza segreti: dice se la pagina è un contesto sicuro e se il codice è arrivato |
| **Contesto sicuro** | pagina `https://` o `localhost`: solo lì il browser offre WebCrypto; altrove il canale usa il fallback software |
| **Foundry del giocatore chiuso** | stato offline degli occhiali quando la scheda che li trasmette non è aperta; si ricollegano da soli |
| **Scheda da tavolo G2** | il layout della HUD in cinque zone A–E |
| **Zona A–E** | Ritratto · Intestazione · Mappa · Scheda · Contesto |
| **Pannello contesto** | zona E, l'unica che risponde ai gesti |
| **Economia d'azione** | ● Azione · ▲ Bonus · ◆ Reazione + movimento |
| **Pagina automatica** | la zona D passa da sola a *Tiri salvezza · Abilità* o *Tiri contro la morte* |
| **Arte originale pixelata** | la mappa: sfondo, tile e token della scena ridotti a blocchi e ditherati |
| **Dimensione del pixel** | lato del blocco della mappa: 1, 2 o 3 (default 2) |
| **Maschera di visione** | nero fuori dal raggio visivo del proprio token (default 12 celle) |
| **`dispatchTool`** | la pipeline del modulo che esegue ogni azione (write path, ADR-0011) |
| **midi-qol** | modulo Foundry facoltativo per l'automazione completa di attacchi e tiri salvezza |
| **Defer-hardware** | pattern: le verifiche hardware sono script GO/NO-GO che non bloccano la CI |
| **INV-1 … INV-6** | invarianti del progetto ([Test e qualità](Test-e-Qualita)) |
| **P1 … P11** | principi della Costituzione ingegneristica |

## 📚 Vedi anche

- [FAQ](FAQ) · [Leggere la HUD](Leggere-la-HUD)
