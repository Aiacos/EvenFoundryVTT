# Glossario

Un solo nome per ogni concetto, lo stesso sugli occhiali, in Foundry e nei documenti (principio P3).

## 🏷️ Termini

| Termine | Significato |
|---|---|
| **G2** | occhiali AR Even Realities: display 576 × 288 px verde a 16 livelli, niente altoparlante né fotocamera ([device APIs](https://hub.evenrealities.com/docs/build/device-apis)) |
| **R1** | anello smart Even Realities: tap, doppio tap, swipe su/giù; pressione lunga come extra ([anello](https://www.evenrealities.com/smart-ring)) |
| **Even Realities App** (Even App) | app sul telefono che associa G2 e R1 e carica la pagina degli occhiali nella sua WebView |
| **Even Hub** | piattaforma e SDK per le app degli occhiali ([hub.evenrealities.com](https://hub.evenrealities.com/docs)) |
| **QR sideload** | la Even App inquadra un QR con un URL e carica quella pagina come app degli occhiali |
| **g2-app** | l'app degli occhiali (pacchetto `packages/g2-app`), servita da Foundry in `/modules/evenfoundryvtt/g2/` |
| **Modulo** / `evenfoundryvtt` | il modulo Foundry: projector, associazione, readers, write path, e contenitore della g2-app |
| **Utente «(G2)»** | utente Foundry dedicato «&lt;Giocatore&gt; (G2)», ruolo Giocatore, proprietario solo del personaggio |
| **Projector** | il client Foundry che risponde agli occhiali: il client del giocatore se online, altrimenti il GM attivo con la chiave del dispositivo |
| **Elezione** | la regola che sceglie il projector per ogni dispositivo; solo l'eletto esegue `invoke` |
| **Relay** | l'inoltro Foundry dei messaggi `module.evenfoundryvtt` a tutti i client |
| **Busta sigillata** | `{evf, to, from, iv, ct}`: messaggio cifrato AES-256-GCM con la chiave del dispositivo |
| **Chiave del dispositivo** | chiave AES-256 condivisa tra occhiali e projector; ruota al primo collegamento |
| **Chiave pubblica / privata** | coppia ECDH P-256 di ogni client (ADR-0013); la pubblica è in `flags.evenfoundryvtt.pub` |
| **Abilitazione** | passo una tantum del GM che crea gli utenti «(G2)» dei giocatori |
| **Associazione** | collegare un paio di occhiali a un personaggio (self-service, dal GM o con codice manuale) |
| **Codice manuale** | 16 caratteri `XXXX-XXXX-XXXX-XXXX` in alternativa al QR |
| **Revoca** | eliminazione di un dispositivo associato e del suo utente «(G2)» |
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
