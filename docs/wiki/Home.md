# EvenFoundryVTT — Wiki

> Gioca a **Dungeons & Dragons 5e** su **FoundryVTT** con gli occhiali AR **Even Realities G2** e l'anello **Even R1**: la scheda del tuo personaggio resta nel campo visivo, lo sguardo resta sul tavolo.

## 🎲 Cos'è

EvenFoundryVTT è **un modulo Foundry** che fa due cose:

1. legge la sessione D&D 5e (personaggio, combattimento, registro, scena) dentro Foundry;
2. serve l'**app per gli occhiali**, che la Even Realities App carica sul telefono inquadrando un QR.

Non c'è un server da installare: niente Docker, niente bridge. Foundry serve la pagina, inoltra i messaggi cifrati e un client Foundry (il tuo, oppure quello del GM) fa da **projector**, cioè calcola i dati della scheda ed esegue le azioni ([Architettura](Architettura)).

## 💡 Il giro in 30 secondi

![Esplorazione: ritratto, scudo CA, box PF, mappa quadrata, caratteristiche e registro](images/sheet-explore.png)

*S1 · Esplorazione — screenshot reale dal simulatore Even Hub, 576 × 288 px.*

- **In alto**: ritratto (A), intestazione con scudo **CA**, box **PF**, INIZ · VEL · COMP ed economia d'azione (B), mappa quadrata centrata sul tuo token (C).
- **In basso**: la scheda con le caratteristiche o i tiri salvezza e le abilità (D) e il **pannello contesto** (E), l'unica zona che risponde ai gesti.
- **Con l'anello**: tap = azioni · swipe = sposta il cursore · doppio tap = indietro/esci · pressione lunga = scorciatoie.

## 📚 Da dove partire

| Sei… | Leggi |
|---|---|
| **Giocatore** con gli occhiali | [Guida rapida](Guida-Rapida-Giocatore) → [Associare i tuoi occhiali](Associare-i-tuoi-Occhiali) → [Leggere la HUD](Leggere-la-HUD) → [Gesti e comandi](Gesti-e-Comandi) → [Mappa](Mappa) → [Schermate](Schermate) |
| **Game Master** | [Installazione](Installazione) → [HTTPS e rete](HTTPS-e-Rete) → [Abilitare i giocatori](Abilitare-i-Giocatori) → [Revoca e sicurezza](Revoca-e-Sicurezza) → [Risoluzione problemi](Risoluzione-Problemi) |
| **Sviluppatore** | [Architettura](Architettura) → [Protocollo](Protocollo) → [Renderer a pixel](Renderer-Pixel) → [Debug e simulatore](Debug-e-Simulatore) → [Test e qualità](Test-e-Qualita) → [Release](Release) → [Contribuire](Contribuire) |
| Hai una domanda | [FAQ](FAQ) · [Glossario](Glossario) · [Decisioni architetturali](Decisioni-Architetturali) · [Changelog](Changelog) |

## 🥽 Cosa serve

- **Even Realities G2** + **R1**, associati al telefono con la Even Realities App ([hub.evenrealities.com](https://hub.evenrealities.com/docs)).
- **FoundryVTT** ≥ v13.347 (v14 verificato) con **dnd5e** ≥ 5.3.3, raggiungibile dal telefono in **HTTPS valido** ([HTTPS e rete](HTTPS-e-Rete)).
- Il modulo **EvenFoundryVTT** installato dal manifest ([Installazione](Installazione)).

## 📊 Stato

**v0.12.0 — streaming diretto.** La verifica sull'hardware reale (sideload via QR, persistenza dei cookie, ritmo della mappa via BLE) segue il pattern *defer-hardware*: il software è verificato dai test e dal simulatore ufficiale, l'hardware con `validate:direct-sideload` ([Debug e simulatore](Debug-e-Simulatore)). Novità: [Changelog](Changelog).

## ⚖️ Licenza

MIT. Sorgente e issue: [github.com/Aiacos/EvenFoundryVTT](https://github.com/Aiacos/EvenFoundryVTT).
