# Risoluzione problemi

Tre pezzi possono guastarsi: l'**app sul telefono**, il **relay** e la **scheda di Foundry** che trasmette gli occhiali (il projector: quella che ha mostrato il QR). Parti sempre dalla pagina sul telefono o dalla schermata degli occhiali: dicono già la causa.

## 🐞 Sintomo → causa → soluzione

| Sintomo | Causa | Soluzione |
|---|---|---|
| Nella finestra *Collega occhiali G2*: **«Questo browser non raggiunge il relay»** (Relay ✗), niente QR | il browser non apre `wss://evf-relay.evf-relay.workers.dev`: firewall o proxy aziendale, estensione che blocca i WebSocket, rete senza Internet; con un relay locale `ws://`, pagina di Foundry in `https://` | cambia rete o sblocca il dominio, disattiva l'estensione, poi **Riprova**; per un relay di sviluppo usa un Foundry `http://` ([Rete e relay](HTTPS-e-Rete)) |
| Occhiali: **▲ Offline · Foundry del giocatore chiuso** | la scheda di Foundry che ha collegato questi occhiali non è aperta | riapri Foundry **in quel browser**: gli occhiali si ricollegano da soli, senza toccare niente |
| Occhiali: **Relay non raggiungibile** | il telefono non raggiunge il relay (niente rete, rete che blocca i WebSocket) | controlla la rete del telefono; l'app riprova da sola (tap = *riprova ora*) |
| Occhiali: **Telefono in background** | la Even App è andata in background (telefono bloccato, cambio app) | niente: la sessione si ricollega quando l'app torna in primo piano. Con la versione web caricata da QR, dopo un blocco dello schermo reinquadra il QR |
| **QR scaduto** (*Il QR è scaduto senza essere usato.*) | sono passati 5 minuti | **Nuovo QR** |
| Il QR è già stato usato, o il codice non funziona | QR e codice sono monouso: dopo il primo collegamento stanza e chiave cambiano | **Collega altri occhiali** per un nuovo QR |
| *Codice non valido: 16 caratteri…* | meno o più di 16 caratteri, o caratteri che non fanno parte del codice | copia il codice sotto il QR (*Copia codice*); trattini e maiuscole non contano. Solo questo errore dice *Codice non valido*: gli altri hanno il loro messaggio |
| Telefono: *Codice già usato su questo telefono* (… *genera un nuovo QR in Foundry* se non sei associato, … *l'associazione attuale resta valida* se lo sei) | hai riaperto (o riscansionato) un QR o un link che questo telefono ha già usato | se gli occhiali sono già collegati non serve niente: l'app ha tenuto l'associazione che funziona. Per un nuovo collegamento: **Nuovo QR** / **Collega altri occhiali** |
| Telefono: *Nessuna risposta al codice: QR scaduto, annullato o già usato — genera un nuovo QR in Foundry.* · occhiali (S10): **NESSUNA RISPOSTA AL CODICE · GENERA UN NUOVO QR** | per 5 minuti nessuna scheda di Foundry ha risposto al codice: QR scaduto o già usato da un altro telefono, scheda di Foundry chiusa, oppure orologi sfasati (vedi sotto) | **Nuovo QR** in Foundry, poi **Scansiona QR** o il codice sul telefono |
| Telefono: *codice in attesa di risposta da Foundry…* · occhiali: **Codice in attesa di Foundry** | il codice è salvato ma la scheda di Foundry non ha ancora risposto | tieni aperta la scheda di Foundry che mostra il QR finché la finestra dice **«Occhiali collegati»**; dopo 5 minuti senza risposta il codice viene cancellato |
| Telefono: *QR di una versione vecchia del modulo: aggiorna EvenFoundryVTT in Foundry.* | il QR è nel formato `#evf=` del modulo 0.3.0 | aggiorna il modulo (il GM, da *Gestisci moduli*), poi **Nuovo QR** |
| Telefono: *Collegamento non riuscito: <messaggio>* | un errore imprevisto durante il collegamento (il messaggio è quello tecnico) | riprova con **Collega di nuovo**; se si ripete, manda uno screenshot con la riga di avvio (vedi *Dove guardare*) |
| Telefono: *L'app non si è avviata: <messaggio>* | l'app è fallita all'avvio | chiudi e riapri l'app; se si ripete, segnala il messaggio e la riga di avvio |
| Telefono fermo su **Non collegato** con una vecchia associazione | associazione di un tentativo fallito o di un Foundry che non c'è più | apri **Collega di nuovo** (si apre da sola quando non sei collegato) e inquadra un nuovo QR: non serve più *Dimentica associazione* |
| Occhiali: **Personaggio non disponibile** · telefono: *Foundry non trova il tuo personaggio…* | la scheda di Foundry ha rifiutato il collegamento: il personaggio è stato eliminato (`actor_missing`) o non è più tuo (`forbidden_actor`) | controllalo in Foundry (proprietà) o collega un personaggio tuo; l'app riprova ogni 30 s |
| Occhiali: **Presi da un'altra app** · telefono: *un'altra app ha preso questa associazione…* | un'altra copia dell'app (un'altra pagina aperta dal QR, un altro telefono con la stessa associazione) si è collegata al posto di questa | tocca **Riconnetti** sul telefono che vuoi usare; l'app non riprova da sola, per non contendersi il collegamento |
| Finestra *Collega occhiali G2*, sotto il QR: *Messaggio degli occhiali rifiutato: orologi di telefono e PC sfasati (oltre 2 minuti)* | i messaggi valgono 2 minuti: data e ora di telefono o PC sono sbagliate | imposta data e ora automatiche su entrambi, poi **Nuovo QR** |
| … *Messaggio degli occhiali rifiutato: chiave diversa* | il telefono usa il codice di un altro QR (vecchio, o di un'altra finestra) | **Collega di nuovo** sul telefono con il QR mostrato adesso |
| … *Messaggio degli occhiali rifiutato: formato non valido* | app e modulo di versioni diverse | aggiorna il modulo e l'app alla stessa release |
| … **Relay non collegato: questa scheda non raggiunge il relay** | la scheda ha perso il relay dopo aver mostrato il QR | controlla la rete del PC; la scheda si ricollega da sola |
| In cima alla finestra: *Il QR apre una pagina http:// della rete locale…* (o *Il QR non apre la pagina predefinita…*, *Relay diverso da quello predefinito…*) | **«Pagina dell'app occhiali (avanzato)»** o **«Relay (avanzato)»** non sono al valore predefinito — per esempio l'indirizzo LAN che il wizard `pnpm dev:glasses` della v0.3.0/0.3.1 faceva impostare | **«Ripristina predefinito»**: rimette il valore e mostra un nuovo QR ([Rete e relay](HTTPS-e-Rete)) |
| Ho chiuso la finestra prima di inquadrare il QR | — | niente: il QR resta valido per 5 minuti con la scheda aperta; riapri la finestra per rivederlo |
| «Scansiona QR» non scatta la foto / *Fotocamera non disponibile* | permesso della fotocamera negato alla Even App, o pagina caricata in Developer Mode senza fotocamera | digita il codice sotto il QR (o incolla il link intero) nel campo **Codice**, oppure riattiva il permesso nelle impostazioni del telefono |
| *Nessun QR nella foto (4032×3024 · image/jpeg · …)* | QR troppo piccolo o mosso nella foto: da 30 cm il QR normale occupa ~13 % della foto e si legge circa 4 volte su 10 | premi **«Ingrandisci QR»** nella finestra (circa il doppio), tieni il telefono a 15–20 cm così che il QR riempia circa metà della foto, tieni fermo — o digita il codice |
| *Foto non leggibile (image/heic)* | il telefono ha restituito un formato di foto che la pagina non decodifica | digita il codice sotto il QR e segnala il formato mostrato |
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

**Sul telefono** — pagina *G2 HUD · Connessione*: **Stato** con causa e conto alla rovescia, **Relay**, **Foundry** (chi trasmette), **Latenza**; *Diagnostica* mostra la versione del modulo, gli errori recenti e il log di debug. In fondo a *Connessione* e a *Prima configurazione* c'è la **riga di avvio** `app 0.4.2 · secure yes · crypto webcrypto · link code · relay evf-relay.evf-relay.workers.dev` (esempio, nessun segreto): `secure no · crypto fallback` = pagina `http://` (funziona, [Rete e relay](HTTPS-e-Rete)); `link none` dopo lo Scan QR = il codice non è arrivato alla pagina (digitalo); `link used` = QR già usato su questo telefono; `link invalid` = il link non conteneva un codice valido di 16 caratteri (digitalo); `link legacy` = QR del modulo 0.3.0. Per il log completo metti `?debug=1` in fondo a **«Pagina dell'app occhiali (avanzato)»** (poi **«Ripristina predefinito»**).

**Nella finestra *Collega occhiali G2*** — sotto il QR lo stato dal vivo (relay, occhiali nella stanza, ultimo messaggio rifiutato); in basso lo stato di ogni occhiali: *online* · *in attesa degli occhiali* · *relay non raggiungibile*.

**Nel browser che trasmette** (F12) — messaggi con prefisso `[EVF]`:

| Messaggio | Significato |
|---|---|
| `[EVF] relay <url> unreachable: …` | controllo del relay fallito all'apertura della finestra |
| `[EVF] projector: rejected a frame for <id> (auth)` | busta con chiave sbagliata o vecchia: collega di nuovo |
| `[EVF] projector: malformed message for <id>` | app e modulo di versioni diverse: aggiorna entrambi |
| `[EVF] projector: denied … no longer owns actor …` | proprietà del personaggio persa |
| `[EVF] projector: failed to push to a G2 device` | invio fallito, di solito transitorio |
| `[EVF] could not reset the appUrl setting` / `relayUrl` | **«Ripristina predefinito»** non è riuscito: cambia il valore a mano in *Configura impostazioni* |

**Audit** — ogni azione lascia un messaggio nascosto, solo GM, con `flags.evf.audit`:

```js
game.messages.contents.filter((m) => m.flags?.evf?.audit).slice(-20)
  .forEach((m) => console.log(m.flags.evf.audit));
```

**Il relay** — `https://evf-relay.evf-relay.workers.dev/health` deve rispondere `ok`; `pnpm --filter @evf/validation-harness validate:relay:skip-hardware` lo verifica da riga di comando ([Debug e simulatore](Debug-e-Simulatore)).

## 📚 Vedi anche

- Runbook completo (EN): [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md)
- [Debug e simulatore](Debug-e-Simulatore) · [FAQ](FAQ)
