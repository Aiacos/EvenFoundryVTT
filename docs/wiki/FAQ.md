# FAQ

## 💡 Domande dei giocatori

**Devo installare qualcosa sul telefono?**
La **Even Realities App** e, dentro, l'app **FoundryVTT G2 HUD** da Even Hub (gruppo beta finché non è nello store). Sul telefono non accedi a Foundry: tocchi «Scansiona QR» una volta ([Installazione](Installazione), [Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)).

**Devo avere Foundry aperto per giocare con gli occhiali?**
Sì: la scheda di Foundry che ha mostrato il QR trasmette il tuo personaggio ed esegue le azioni a tuo nome. Può stare in background o su un altro dispositivo (tablet, portatile). Se la chiudi gli occhiali mostrano *Foundry del giocatore chiuso* e si ricollegano da soli quando la riapri. Chi non ha un dispositivo può farsi collegare gli occhiali dal GM ([Collegare per un giocatore](Abilitare-i-Giocatori)).

**Posso tirare i dadi dagli occhiali?**
Attacchi e incantesimi sì: li tira Foundry. Le **prove richieste dal GM** no: Foundry non ha un gestore per il tiro remoto, quindi tiri il d20 sul tavolo e premi *Fatto* ([Gesti e comandi](Gesti-e-Comandi)).

**Perché la mappa è nera intorno al mio token?**
Perché mostra solo quello che il tuo personaggio vede: fuori dal raggio visivo (12 celle se il token non ne ha uno) o dietro i muri resta nero ([Mappa](Mappa)).

**Gli occhiali fanno suoni o vibrano?**
No: la G2 non ha altoparlante. Ogni conferma è visiva ([device APIs](https://hub.evenrealities.com/docs/build/device-apis)).

**Come esco dall'app?**
Doppio tap sulla radice. È una regola di Even Hub.

**La pressione lunga non fa niente.**
Serve la Even App ≥ 2.2.9. Tutte le scorciatoie sono comunque raggiungibili con tap → *Azioni* → *Opzioni…*.

**In che lingua è la HUD?**
Segue la lingua di Foundry (IT o EN); puoi forzarla dalla pagina del telefono o dal menu *Lingua*. La scelta resta sul telefono.

## 💡 Domande dei GM

**Serve un server, Docker o un bridge?**
No. Basta il modulo ([Installazione](Installazione)); il relay che unisce scheda e occhiali è gestito dal progetto (e si può ospitare da sé: [Rete e relay](HTTPS-e-Rete)).

**Serve HTTPS o un indirizzo pubblico per Foundry?**
No, dalla v0.13.0: il telefono non si collega mai a Foundry. Serve solo che il browser del giocatore raggiunga il relay; funziona anche un Foundry `http://` in LAN e The Forge senza configurazioni ([Rete e relay](HTTPS-e-Rete)).

**Gli altri giocatori possono leggere i dati dei miei occhiali?**
No. Il canale va dalla scheda del giocatore al relay, non passa dagli altri client, ed è cifrato AES-256-GCM con la chiave del dispositivo: nemmeno il relay lo legge ([Scollegare e sicurezza](Revoca-e-Sicurezza)).

**Cambio computer o browser: perdo il collegamento?**
Sì, il collegamento vive nel browser che ha mostrato il QR. Dal nuovo browser apri *Collega occhiali G2* e inquadra il nuovo QR (30 secondi); dal vecchio puoi premere **Scollega**.

**Nel mondo ci sono ancora utenti «&lt;Giocatore&gt; (G2)» della v0.12: servono?**
No. Dalla v0.13.0 non si usano più: puoi cancellarli da *User Management*.

**midi-qol è obbligatorio?**
No. Senza midi-qol l'attacco pubblica la scheda dell'attività e i tiri restano manuali; con midi-qol la sequenza attacco → danni → tiro salvezza → effetto è automatica.

**Funziona con le regole 2024?**
Sì: PHB 2014 e PHB 2024 tramite `core.modernRules` di dnd5e.

## 💡 Domande tecniche

**Perché un relay e non un collegamento diretto a Foundry?**
Un'app Even Hub raggiunge solo indirizzi fissi in whitelist, senza wildcard ([networking](https://hub.evenrealities.com/docs/build/networking)), quindi non può raggiungere il Foundry di chiunque; Foundry ≥ 14.361 non serve più le pagine HTML dei moduli; i giocatori non possono creare utenti; i giochi privati di The Forge chiedono un login. Il relay ha un indirizzo fisso e mette d'accordo tutto questo ([ADR-0019](Decisioni-Architetturali)).

**Perché le immagini e non il testo firmware?**
Il font firmware non ha dimensioni né i simboli D&D ([Renderer a pixel](Renderer-Pixel)).

**La voce / l'AI?**
Rimosse nella v0.12.0; potranno tornare come client del canale diretto con un nuovo ADR. EvenAI nativo non ha API per gli sviluppatori.

## 📚 Vedi anche

- [Glossario](Glossario) · [Risoluzione problemi](Risoluzione-Problemi)
