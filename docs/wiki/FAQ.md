# FAQ

## 💡 Domande dei giocatori

**Devo installare qualcosa sul telefono?**
Solo la **Even Realities App**. L'app degli occhiali la carica Foundry quando inquadri il QR ([Associare i tuoi occhiali](Associare-i-tuoi-Occhiali)).

**Devo avere Foundry aperto per giocare con gli occhiali?**
No. Se ce l'hai aperto, il tuo client fa da projector e le azioni partono a tuo nome; se no, fa da riserva un GM online che ha la chiave dei tuoi occhiali ([Architettura](Architettura)).

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
No, dalla v0.10.0. Basta il modulo ([Installazione](Installazione)).

**Perché serve HTTPS valido anche in LAN?**
La WebView del telefono rifiuta i certificati autofirmati e Foundry v14 accetta la sessione solo dal cookie di prima parte ([HTTPS e rete](HTTPS-e-Rete)).

**Gli altri giocatori possono leggere i dati dei miei occhiali?**
No. Foundry inoltra i messaggi a tutti, ma sono cifrati AES-256-GCM con la chiave del dispositivo ([Revoca e sicurezza](Revoca-e-Sicurezza)).

**Cambio computer come GM: perdo le associazioni?**
Con l'associazione self-service (ADR-0013) no: i giocatori sigillano la chiave del dispositivo per ogni GM, e un browser GM nuovo fa da riserva dopo aver pubblicato la propria chiave pubblica. Per i dispositivi associati dal GM con il flusso della v0.10 iniziale, le chiavi vivono solo nel browser che ha associato: riassocia.

**Posso cancellare l'utente «(G2)» da User Management?**
Meglio di no: usa **Revoca**, che avvisa gli occhiali e pulisce i metadati.

**midi-qol è obbligatorio?**
No. Senza midi-qol l'attacco pubblica la scheda dell'attività e i tiri restano manuali; con midi-qol la sequenza attacco → danni → tiro salvezza → effetto è automatica.

**Funziona con le regole 2024?**
Sì: PHB 2014 e PHB 2024 tramite `core.modernRules` di dnd5e.

## 💡 Domande tecniche

**Perché non un'app Even Hub normale (`.ehpk`)?**
La whitelist di rete di un'app pacchettizzata è fissa per build, senza wildcard, e non aggira il CORS: non può raggiungere il Foundry di chiunque ([networking](https://hub.evenrealities.com/docs/build/networking), [ADR-0012](Decisioni-Architetturali)).

**Perché le immagini e non il testo firmware?**
Il font firmware non ha dimensioni né i simboli D&D ([Renderer a pixel](Renderer-Pixel)).

**La voce / l'AI?**
Rimosse nella v0.10.0; potranno tornare come client del canale diretto con un nuovo ADR. EvenAI nativo non ha API per gli sviluppatori.

## 📚 Vedi anche

- [Glossario](Glossario) · [Risoluzione problemi](Risoluzione-Problemi)
