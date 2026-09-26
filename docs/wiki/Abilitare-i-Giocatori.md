# Collegare gli occhiali per un giocatore (GM)

Dalla v0.13.0 **non c'è niente da abilitare**: ogni giocatore collega i propri occhiali dal proprio Foundry, senza il GM ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali), [ADR-0019](Decisioni-Architetturali)). Il GM interviene solo per chi **non ha un dispositivo con Foundry** al tavolo.

> Fino alla v0.12 il GM creava gli utenti «&lt;Giocatore&gt; (G2)» con il pulsante *Abilita occhiali per i giocatori*. Quel passaggio non esiste più: gli utenti «(G2)» rimasti nel mondo si possono cancellare da *User Management*.

## 🕹️ Collegare per conto di un giocatore

1. Come GM, tasto destro sul **giocatore** nella lista *Giocatori* › **Collega occhiali G2** (il suo personaggio assegnato è già scelto). In alternativa **Alt+G** o *Configura impostazioni* › *EvenFoundryVTT*, poi scegli il personaggio dal menu *Personaggio*.
2. Il giocatore, sul suo telefono, apre **FoundryVTT G2 HUD** → **«Scansiona QR»** e inquadra il QR sul tuo schermo (oppure **«Inserisci codice»**).
3. La finestra passa a **«Occhiali collegati»**.

Da quel momento **la tua scheda di Foundry** è il projector di quegli occhiali: tienila aperta durante il gioco. Il collegamento vive nel tuo browser e compare nella tua lista **«Occhiali collegati a questo browser»**, dove puoi anche **Scollegarlo**.

## 🏗️ Chi trasmette cosa

| Chi ha mostrato il QR | Chi deve avere Foundry aperto | Le azioni partono a nome di |
|---|---|---|
| il giocatore (dal suo Foundry) | il giocatore, nel browser che ha mostrato il QR | il giocatore, con i suoi permessi |
| il GM (per conto del giocatore) | il GM, nel browser che ha mostrato il QR | il GM |

Non c'è più un GM «di riserva» automatico: risponde solo la scheda che ha mostrato il QR. Se è chiusa, gli occhiali mostrano **«Foundry del giocatore chiuso»** e si ricollegano da soli quando la riapri ([Architettura](Architettura)).

## 📚 Vedi anche

- [Scollegare e sicurezza](Revoca-e-Sicurezza) · [Risoluzione problemi](Risoluzione-Problemi)
- [ADR-0019](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0019-relay-pairing-player-projector.md)
