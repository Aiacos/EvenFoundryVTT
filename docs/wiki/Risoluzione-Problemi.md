# Risoluzione problemi

Tre pezzi possono guastarsi: la **pagina sul telefono**, il **server Foundry** (HTTPS, file statici, relay socket) e il **projector** (il client del giocatore o del GM che risponde agli occhiali). Parti sempre dalla pagina sul telefono: dice già la causa.

## 🐞 Sintomo → causa → soluzione

| Sintomo | Causa | Soluzione |
|---|---|---|
| Occhiali fermi su **Collegamento**, poi *Nessun GM connesso* | nessun projector ha risposto entro 8 s: il giocatore non ha Foundry aperto **e** nessun GM online ha la chiave del dispositivo | apri Foundry come giocatore, oppure fai entrare un GM. Con il flusso del GM (ADR-0012) la chiave vive solo nel browser che ha associato: apri il mondo **da quel browser** o riassocia da quello del GM attivo |
| Pagina bianca o errore di certificato dopo la scansione | certificato autofirmato, scaduto, o URL `http://` | certificato valido (Let's Encrypt, Tailscale, reverse proxy) — [HTTPS e rete](HTTPS-e-Rete) |
| Il QR apre `localhost` o un IP di rete locale | chi ha generato il QR ha aperto Foundry da un indirizzo locale | riapri Foundry dall'indirizzo pubblico HTTPS e genera un nuovo QR (verifica *indirizzo pubblico*) |
| ✗ **modulo servito** | manca la cartella `g2/` (build di sviluppo senza `build:g2`, o proxy che non inoltra `/modules`) | reinstalla lo zip della release, oppure `pnpm --filter @evf/foundry-module build:all` |
| ✗ **socket attivo**, o la connessione cade dopo pochi secondi | il proxy non inoltra l'upgrade WebSocket | aggiungi gli header `Upgrade` / `Connection`, controlla che `routePrefix` coincida con il percorso inoltrato |
| Si collega, poi *Foundry non risponde* ogni minuto circa | il proxy chiude i WebSocket inattivi | alza il timeout di lettura del proxy |
| *credenziali rifiutate*, torna alla prima configurazione | associazione revocata, QR già usato o scaduto (5 min), password rigenerata dal GM | riassocia ([Associare i tuoi occhiali](Associare-i-tuoi-Occhiali)) |
| *ASSOCIAZIONE REVOCATA DAL GM* (S10) | il GM ha revocato il dispositivo | chiedi una nuova associazione |
| *Telefono in background* / *app in background* | la Even App è andata in background (telefono bloccato, cambio app) | niente: la sessione si ricollega quando l'app torna in primo piano |
| Offline con *Riprovo tra N s (tentativo K)* | rete instabile: riprova con attesa crescente da 1 s a 30 s; dopo 2 pong persi la pagina va offline | tap = *riprova ora*; controlla rete e HTTPS |
| Scheda aggiornata ma mappa ferma | banda BLE bassa (la mappa è ≤ 1 fps, un'immagine ogni ≥ 100 ms) | avvicina il telefono agli occhiali |
| Mappa schematica invece dell'arte | la scena non ha sfondo o l'immagine non si carica | è la riserva prevista ([Mappa](Mappa)) |
| Azione con errore `forbidden_actor` | la richiesta riguardava un altro attore | gli occhiali agiscono solo per il personaggio associato |
| `actor_missing` al collegamento | il personaggio associato è stato eliminato | riassocia con un personaggio esistente |
| L'attacco pubblica la scheda ma non tira | midi-qol non attivo: `activity.use()` pubblica solo la scheda | attiva midi-qol per l'automazione completa |
| Nessuna pressione lunga | Even App < 2.2.9 | aggiorna l'app; ogni scorciatoia è comunque raggiungibile con tap → *Opzioni…* |

## 🐞 Dove guardare

**Sul telefono** — pagina *G2 HUD · Connessione*: **Stato** con causa e conto alla rovescia, **GM** (chi fa da projector), **Latenza**; *Diagnostica* mostra la versione di Foundry, gli errori recenti e il log di debug.

**Nel browser del projector** (F12) — messaggi con prefisso `[EVF]`:

| Messaggio | Significato |
|---|---|
| `[EVF] projector: rejected envelope from <id> (authentication failed)` | il dispositivo usa una chiave vecchia o sconosciuta: riassocia |
| `[EVF] projector: malformed message from <id>` | g2-app e modulo di versioni diverse: aggiorna il modulo |
| `[EVF] projector: password rotation failed …` | la rotazione non è riuscita; le credenziali restano valide |
| `[EVF] projector: failed to push to a G2 device` | invio fallito, di solito transitorio |

Controlli rapidi nella console:

```js
game.users.activeGM?.name                        // GM attivo
game.settings.get('evenfoundryvtt', 'g2Devices') // metadati pubblici dei dispositivi (nessuna chiave)
game.socket.connected                            // relay disponibile
```

**Audit** — ogni azione lascia un messaggio nascosto, solo GM, con `flags.evf.audit`:

```js
game.messages.contents.filter((m) => m.flags?.evf?.audit).slice(-20)
  .forEach((m) => console.log(m.flags.evf.audit));
```

## 📚 Vedi anche

- Runbook completo (EN): [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md)
- [Debug e simulatore](Debug-e-Simulatore) · [FAQ](FAQ)
