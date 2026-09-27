# Collegare i tuoi occhiali

Colleghi gli occhiali **dal tuo Foundry**, in meno di 30 secondi, senza chiedere niente al GM. La tua scheda di Foundry diventa il **projector** dei tuoi occhiali: legge il tuo personaggio ed esegue le azioni a tuo nome. Il telefono non accede mai a Foundry ([Architettura](Architettura)).

## 🕹️ In tre passi

1. **In Foundry** apri **«Collega occhiali G2»** in uno di questi modi:
   - tasto destro sul **tuo nome** nella lista *Giocatori* (in basso a sinistra) › **Collega occhiali G2**;
   - la scorciatoia **Alt+G** (modificabile in *Configura controlli*);
   - *Configura impostazioni* › *EvenFoundryVTT* › **Collega occhiali G2**.
2. La finestra mostra **subito** il QR e il codice di 16 caratteri. Il personaggio è già scelto (quello assegnato, altrimenti il primo che possiedi); se ne hai più di uno, cambialo dal menu *Personaggio*.
3. **Sul telefono** apri **FoundryVTT G2 HUD** e tocca **«Scansiona QR»** — oppure, senza fotocamera, **«Inserisci codice»** e digita il codice (con o senza trattini, es. `7QK3-MX9P-2HRA-C4TE`) → **Collega**.

Gli occhiali mostrano **Collegamento** (S11) e poi la scheda (S1); in Foundry la finestra passa da sola a **«Occhiali collegati»** e compare la notifica *Occhiali G2 collegati: &lt;personaggio&gt;*.

> In modalità sviluppatore puoi anche inquadrare il QR con l'app **Even Realities** (*Even Hub → Scan QR*): apre la versione web dell'app con il collegamento già dentro ([Installazione](Installazione)). Se il telefono resta su **«G2 HUD · Prima configurazione»**, digita lì il codice nel campo **«Codice»**; se invece mostra *G2 HUD · Connessione* (un'associazione vecchia), usa la scheda **«Collega di nuovo»**: la finestra lo ricorda sotto il codice.

## 🔐 Regole del QR

- **Scade dopo 5 minuti** (conto alla rovescia *Scade tra* nella finestra); poi **Nuovo QR**.
- **Chiudere la finestra non annulla il QR**: resta valido per i suoi 5 minuti finché la scheda di Foundry è aperta; riaprendo la finestra rivedi lo stesso QR.
- **Monouso**: appena gli occhiali si collegano, stanza e chiave cambiano e il QR (e il codice) non valgono più.
- Se in cima alla finestra compare **«Questo browser non raggiunge il relay»**, il QR non viene mostrato: segui **Come risolvere** e premi **Riprova** ([Rete e relay](HTTPS-e-Rete)).
- Se in cima compare un avviso sulla **pagina dell'app** o sul **relay** (per esempio *«Il QR apre una pagina http:// della rete locale…»*), premi **«Ripristina predefinito»**: il QR torna ad aprire la pagina giusta.
- Sotto il QR la finestra dice cosa vede, dal vivo: **Relay collegato** · **In attesa degli occhiali…** / **Occhiali nella stanza** e, se serve, perché ha rifiutato l'ultimo messaggio degli occhiali (*orologi di telefono e PC sfasati*, *chiave diversa*, *formato non valido*: [Risoluzione problemi](Risoluzione-Problemi)).
- **Un QR già usato non rompe niente**: se lo stesso telefono riapre un QR (o un link) che ha già usato, l'app lo ignora (*«Codice già usato su questo telefono»*) e tiene l'associazione che funziona.

## 🕹️ Durante il gioco

- **Tieni aperta la scheda di Foundry** che ha mostrato il QR: è lei che trasmette il personaggio. Può stare in un'altra finestra o in background.
- Il collegamento resta **in quel browser**: ogni volta che lo apri su Foundry, gli occhiali si ricollegano **da soli**. Se chiudi Foundry, gli occhiali mostrano **«Foundry del giocatore chiuso»** e aspettano senza fare niente; riaprilo e riparte.
- Con due schede di Foundry aperte nello stesso browser ne trasmette una sola; se la chiudi, subentra l'altra.
- Da un **altro computer** (o un altro browser) gli occhiali non si collegano: lì non c'è il collegamento. Ricollegali da lì con un nuovo QR.

## ⚙️ «Occhiali collegati a questo browser»

La parte bassa della finestra elenca gli occhiali collegati da questo browser:

| Stato | Significato |
|---|---|
| **online** | occhiali collegati adesso |
| **in attesa degli occhiali** | la scheda è pronta, gli occhiali non sono collegati (spenti, app chiusa, telefono in background) |
| **relay non raggiungibile** | questo browser non raggiunge il relay |

Accanto a ogni voce: l'ultimo contatto (*ora*, *N min fa*, *mai collegati*) e **Scollega**, che avvisa gli occhiali e dimentica il collegamento ([Scollegare e sicurezza](Revoca-e-Sicurezza)). **Collega altri occhiali** mostra un nuovo QR.

## ⚙️ La pagina sul telefono

Dopo il collegamento l'app mostra **G2 HUD · Connessione**:

| Voce | Cosa dice |
|---|---|
| **Stato** | *Collegato* / *Collegamento…* / *Non collegato*, con la causa (*la scheda di Foundry che ha collegato questi occhiali è chiusa*, *relay non raggiungibile*, *app in background*, *codice in attesa di risposta da Foundry*, *Foundry non trova il tuo personaggio*, *un'altra app ha preso questa associazione*) e «riprovo tra N s» |
| **Relay · Foundry · PG · GM** | il relay, il mondo e l'utente Foundry che trasmette, il personaggio, il GM |
| **Latenza** | andata e ritorno ping → pong attraverso il relay |
| **Lingua** | *Segui Foundry* · *Italiano* · *English* |
| **Mappa** · **Arte mappa** | *Casella 6/8/12 px*, *Pixel ×1/×2/×3*, *Segui il mio token* ([Mappa](Mappa)) |
| **Scheda** | *Pagina scheda automatica* |
| Pulsanti | **Riconnetti** · **Disconnetti** · **Diagnostica** (versione del modulo, errori recenti, log di debug, **Dimentica associazione**) |
| **Collega di nuovo** | **Scansiona QR** e il campo **Codice**, come alla prima configurazione; si apre da sola quando non sei collegato, così un'associazione vecchia non è mai un vicolo cieco |
| Riga in fondo | `app <versione> · secure yes/no · crypto webcrypto/fallback · link none/code/invalid/legacy/used · relay <host>`: senza segreti, da mandare in uno screenshot se chiedi aiuto |

Le preferenze restano sul telefono e non modificano mai le impostazioni del mondo.

## 🐞 Se qualcosa non va

- *Foundry del giocatore chiuso* → riapri Foundry nel browser che ha mostrato il QR.
- *Relay non raggiungibile* → rete del telefono o del computer ([Rete e relay](HTTPS-e-Rete)).
- Il QR non si legge → avvicinati finché il QR riempie la foto, oppure digita il codice (maiuscole o minuscole, con o senza trattini; il campo accetta anche il link intero incollato); QR scaduto → **Nuovo QR**.
- *Nessuna risposta al codice* → il QR era scaduto, già usato o la scheda di Foundry chiusa: **Nuovo QR** in Foundry, poi **Collega di nuovo** sul telefono.

Tabella completa: [Risoluzione problemi](Risoluzione-Problemi).
