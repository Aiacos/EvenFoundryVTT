# Risoluzione problemi

Tre pezzi possono guastarsi: l'**app sul telefono**, il **relay** e la **scheda di Foundry** che trasmette gli occhiali (il projector: quella che ha mostrato il QR). Parti sempre dalla pagina sul telefono o dalla schermata degli occhiali: dicono già la causa.

## 🐞 Sintomo → causa → soluzione

| Sintomo | Causa | Soluzione |
|---|---|---|
| Nella finestra *Collega occhiali G2*: **«Questo browser non raggiunge il relay»** (Relay ✗), niente QR | il browser non apre `wss://evf-relay.aiacos.workers.dev`: firewall o proxy aziendale, estensione che blocca i WebSocket, rete senza Internet; con un relay locale `ws://`, pagina di Foundry in `https://` | cambia rete o sblocca il dominio, disattiva l'estensione, poi **Riprova**; per un relay di sviluppo usa un Foundry `http://` ([Rete e relay](HTTPS-e-Rete)) |
| Occhiali: **▲ Offline · Foundry del giocatore chiuso** | la scheda di Foundry che ha collegato questi occhiali non è aperta | riapri Foundry **in quel browser**: gli occhiali si ricollegano da soli, senza toccare niente |
| Occhiali: **Relay non raggiungibile** | il telefono non raggiunge il relay (niente rete, rete che blocca i WebSocket) | controlla la rete del telefono; l'app riprova da sola (tap = *riprova ora*) |
| Occhiali: **Telefono in background** | la Even App è andata in background (telefono bloccato, cambio app) | niente: la sessione si ricollega quando l'app torna in primo piano. Con la versione web caricata da QR, dopo un blocco dello schermo reinquadra il QR |
| **QR scaduto** (*Il QR è scaduto senza essere usato.*) | sono passati 5 minuti | **Nuovo QR** |
| Il QR è già stato usato, o il codice non funziona | QR e codice sono monouso: dopo il primo collegamento stanza e chiave cambiano | **Collega altri occhiali** per un nuovo QR |
| *Codice non valido* | meno o più di 16 caratteri | copia il codice sotto il QR (*Copia codice*); trattini e maiuscole non contano |
| «Scansiona QR» non scatta la foto | permesso della fotocamera negato alla Even App | usa **«Inserisci codice»**, oppure riattiva il permesso nelle impostazioni del telefono |
| *Nessun QR nella foto* / *Questo non è un QR di associazione EvenFoundryVTT* | foto sfocata o QR sbagliato | inquadra tutto il QR della finestra *Collega occhiali G2* |
| **Due schede** di Foundry aperte: una sola trasmette | per ogni occhiali trasmette una sola scheda per browser (Web Lock) | normale; se chiudi quella attiva subentra l'altra. In console: `[EVF] relay: another projector took over this device — standing by` |
| Occhiali non si collegano da un altro computer | il collegamento vive nel browser che ha mostrato il QR | usa quel browser, oppure collegali di nuovo dal nuovo |
| **The Forge** | — | funziona **senza configurazioni**, anche con gioco privato e *User Manager* attivo: il telefono non passa da The Forge |
| *OCCHIALI SCOLLEGATI DA FOUNDRY* (S10) | qualcuno ha premuto **Scollega** | collega di nuovo ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)) |
| Scheda aggiornata ma mappa ferma | banda BLE bassa (la mappa è ≤ 1 fps, un'immagine ogni ≥ 100 ms) | avvicina il telefono agli occhiali |
| Mappa schematica invece dell'arte | la scena non ha sfondo, oppure la scheda non riesce a caricare l'immagine (`[EVF] map picture skipped …` in console) | è la riserva prevista ([Mappa](Mappa)) |
| Azione con errore `forbidden_actor` | chi trasmette non è più proprietario del personaggio | chiedi al GM la proprietà, o collega un personaggio tuo |
| `actor_missing` al collegamento | il personaggio collegato è stato eliminato | collega di nuovo con un personaggio esistente |
| L'attacco pubblica la scheda ma non tira | midi-qol non attivo: `activity.use()` pubblica solo la scheda | attiva midi-qol per l'automazione completa |
| La Even App dice *«versione di prova scaduta»* | `.ehpk` caricato sul portale come prova: i caricamenti di prova scadono | usa la build del gruppo beta, oppure il QR in modalità sviluppatore ([Release](Release)) |
| Occhiali bianchi con una build modificata, ma nel simulatore funziona | tile immagine fuori dalla griglia 288 × 144: il vero host rifiuta `rebuildPageContainer`, il simulatore no | tieni le immagini sulla griglia 2 × 2 da (0, 0) ([Renderer a pixel](Renderer-Pixel)) |
| Nessuna pressione lunga | Even App < 2.2.9 | aggiorna l'app; ogni scorciatoia è comunque raggiungibile con tap → *Opzioni…* |

## 🐞 Dove guardare

**Sul telefono** — pagina *G2 HUD · Connessione*: **Stato** con causa e conto alla rovescia, **Relay**, **Foundry** (chi trasmette), **Latenza**; *Diagnostica* mostra la versione del modulo, gli errori recenti e il log di debug.

**Nella finestra *Collega occhiali G2*** — lo stato di ogni occhiali: *online* · *in attesa degli occhiali* · *relay non raggiungibile*.

**Nel browser che trasmette** (F12) — messaggi con prefisso `[EVF]`:

| Messaggio | Significato |
|---|---|
| `[EVF] relay <url> unreachable: …` | controllo del relay fallito all'apertura della finestra |
| `[EVF] projector: rejected a frame for <id> (auth)` | busta con chiave sbagliata o vecchia: collega di nuovo |
| `[EVF] projector: malformed message for <id>` | app e modulo di versioni diverse: aggiorna entrambi |
| `[EVF] projector: denied … no longer owns actor …` | proprietà del personaggio persa |
| `[EVF] projector: failed to push to a G2 device` | invio fallito, di solito transitorio |

**Audit** — ogni azione lascia un messaggio nascosto, solo GM, con `flags.evf.audit`:

```js
game.messages.contents.filter((m) => m.flags?.evf?.audit).slice(-20)
  .forEach((m) => console.log(m.flags.evf.audit));
```

**Il relay** — `https://evf-relay.aiacos.workers.dev/health` deve rispondere `ok`; `pnpm --filter @evf/validation-harness validate:relay:skip-hardware` lo verifica da riga di comando ([Debug e simulatore](Debug-e-Simulatore)).

## 📚 Vedi anche

- Runbook completo (EN): [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md)
- [Debug e simulatore](Debug-e-Simulatore) · [FAQ](FAQ)
