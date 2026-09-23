# Associare i tuoi occhiali

Gli occhiali si collegano a Foundry come un utente dedicato **«&lt;Giocatore&gt; (G2)»**, proprietario solo del tuo personaggio. Ci sono tre strade: scegli la prima che puoi usare.

| Strada | Quando | Chi agisce |
|---|---|---|
| **A · Da solo, dal tuo Foundry** | hai Foundry aperto sul tuo computer o tablet | tu |
| **B · Con il QR del GM** | non hai Foundry aperto, oppure la strada A non è disponibile | il GM mostra il QR, tu lo inquadri |
| **C · Codice manuale** | non riesci a inquadrare il QR | tu digiti 16 caratteri |

In tutti i casi serve che Foundry sia raggiungibile dal telefono in **HTTPS valido** ([HTTPS e rete](HTTPS-e-Rete)).

## 🕹️ A · Associazione self-service (ADR-0013)

Prerequisito: il GM ha fatto **una volta** l'abilitazione dei giocatori ([Abilitare i giocatori](Abilitare-i-Giocatori)).

1. Nel **tuo** Foundry apri **«Associa i miei occhiali»**: da *Configure Settings* (Configura impostazioni) → *EvenFoundryVTT*, oppure clic destro sul **tuo** nome nella lista **Giocatori**. La voce compare solo dopo che il GM ti ha abilitato.
2. Nella finestra **«EvenFoundryVTT · I miei occhiali G2»** scegli il personaggio e premi **Genera QR**: il tuo browser genera la chiave del dispositivo e mostra il QR.
3. Sul telefono apri la **Even Realities App** e **inquadra il QR**.
4. L'app degli occhiali salva le credenziali, le toglie dall'indirizzo, accede come «(G2)» e saluta il projector. Gli occhiali mostrano **Collegamento** (S11), poi la scheda (S1).
5. Al primo collegamento la chiave del dispositivo viene **ruotata**: il QR che hai inquadrato non funziona più (monouso).

Cosa succede dietro le quinte: la password dell'utente «(G2)» ti arriva **sigillata per la tua chiave pubblica** (ECDH P-256 → HKDF → AES-GCM), quindi solo il tuo browser la può aprire. Il tuo browser, a sua volta, sigilla la chiave del dispositivo per ogni GM, così un GM può fare da riserva quando non sei online ([Architettura](Architettura)).

Messaggi possibili nella finestra:

| Messaggio | Significato |
|---|---|
| *Il GM non ha ancora abilitato gli occhiali per te* | chiedi al GM «Abilita occhiali per i giocatori» |
| *L'accesso degli occhiali attende il browser del GM* | la password arriva appena un GM è collegato: tieni Foundry aperto |
| *Non possiedi un personaggio da mostrare sugli occhiali* | chiedi al GM la proprietà del personaggio |

> Quando il tuo Foundry è aperto, **sei tu il projector** dei tuoi occhiali: le azioni partono dal tuo client e le schede in chat mostrano il tuo nome. Quando lo chiudi, subentra il GM.

## 🕹️ B · Con il QR del GM

1. Il GM apre **«Associa occhiali G2»** (menu *Configura impostazioni* → *EvenFoundryVTT*, oppure clic destro sul tuo nome nella lista *Giocatori*), sceglie te e il personaggio e preme **Genera QR**.
2. Inquadri il QR con la **Even Realities App**.
3. Il QR **scade dopo 5 minuti** e vale **una sola associazione**: al primo collegamento password e chiave vengono ruotate. La finestra del GM passa a **«Occhiali collegati»**.

## 🕹️ C · Codice manuale

Serve quando la fotocamera non collabora, o quando l'app si apre senza credenziali salvate (schermata *Prima configurazione*).

1. Nella Even Realities App apri `https://<foundry>[/<prefisso>]/modules/evenfoundryvtt/g2/index.html`.
2. Scegli l'utente **«&lt;Giocatore&gt; (G2)»** (la lista è letta dallo stesso server Foundry).
3. Digita il **codice di 16 caratteri** mostrato sotto il QR (con o senza trattini, es. `7QK3-MX9P-2HRA-C4TE`) → **Collega**.

Il codice segue le stesse regole del QR del GM: monouso, 5 minuti. Nell'associazione self-service si usa il QR.

## ⚙️ La pagina sul telefono

Dopo l'associazione il telefono mostra la pagina **G2 HUD · Connessione**:

| Voce | Cosa dice |
|---|---|
| **Stato** | *Collegato* / *Collegamento…* / *Non collegato*, con causa e «riprovo tra N s (tent. K)» |
| **Server · Utente · PG · GM** | il mondo, l'utente «(G2)», il personaggio e chi fa da projector |
| **Latenza** | andata e ritorno ping → pong attraverso Foundry |
| **Lingua** | *Segui Foundry* · *Italiano* · *English* |
| **Mappa** · **Arte mappa** | dimensione delle caselle (*Casella 6/8/12 px*), dimensione del pixel dell'arte (*Pixel ×1/×2/×3*), *Segui il mio token* ([Mappa](Mappa)) |
| **Scheda** | *Pagina scheda automatica* |
| Pulsanti | **Riconnetti** · **Disconnetti** · **Diagnostica** (versione Foundry, errori recenti, log di debug, **Dimentica associazione**) |

Le preferenze restano sul telefono e non modificano mai le impostazioni del mondo.

## 🐞 Se qualcosa non va

- *credenziali rifiutate* → QR già usato, scaduto o revocato: rifai l'associazione.
- *nessun GM connesso* → nessun projector risponde (né il tuo client né un GM con la chiave).
- Pagina bianca → certificato non valido.

Tabella completa: [Risoluzione problemi](Risoluzione-Problemi).
