# Abilitare i giocatori (GM)

Dalla v0.12 gli occhiali sono **dei giocatori** ([ADR-0017](Decisioni-Architetturali)): il GM li abilita **una volta**, poi ogni giocatore si associa da solo dal proprio Foundry. Il GM può comunque associare gli occhiali per conto di un giocatore, ed è la strada da usare per chi non ha Foundry aperto.

## 💡 Perché serve il GM (una volta)

In Foundry solo chi ha il ruolo di **GM** (o assistente GM) gestisce gli utenti e le loro password: *«gamemasters and assistant gamemasters can configure any user they want»*, mentre un giocatore *«can only open your own user configuration»* ([foundryvtt.com/article/users](https://foundryvtt.com/article/users/), verificato il 2026-09-23). Serve inoltre un utente dedicato «(G2)» per ogni giocatore, perché lo stesso utente non può essere collegato due volte in contemporanea (issue Foundry #14728).

## ⚙️ Abilitazione una tantum

1. Come GM apri la finestra **«Associa occhiali G2»** (*Configure Settings* → *EvenFoundryVTT*); nella sezione **«Occhiali dei giocatori»** premi **Abilita occhiali per i giocatori** (tutti insieme) oppure **Abilita** accanto a un singolo giocatore.
2. Per ogni giocatore il modulo crea un utente **«&lt;Giocatore&gt; (G2)»** con ruolo **Giocatore** e una password casuale.
3. La **proprietà degli attori** dell'utente «(G2)» viene rispecchiata da quella del giocatore (il client GM la aggiorna quando cambia un attore).
4. La password viene **sigillata per la chiave pubblica** del giocatore (ECDH P-256 → HKDF → AES-GCM) e salvata in un record pubblico del mondo: solo il browser di quel giocatore la può aprire.

Il giocatore procede poi con **«Associa i miei occhiali»** ([Associare i tuoi occhiali](Associare-i-tuoi-Occhiali)).

**Stato per giocatore.** La sezione elenca ogni giocatore con lo stato: *non abilitato* · *abilitato* · *associato* · *online*; *in attesa che il giocatore apra Foundry* finché il suo browser non ha pubblicato la chiave pubblica.

**Rigenerare la password.** **Rigenera password** accanto a un giocatore abilitato (per esempio dopo un telefono perso): la nuova password viene sigillata di nuovo per il giocatore, che **deve associare di nuovo gli occhiali**. È l'unico momento in cui la password cambia; la chiave del dispositivo invece ruota a ogni associazione.

> La chiave pubblica di un giocatore la genera e la pubblica il **suo** browser, nei propri flag utente (`flags.evenfoundryvtt.pub`); la chiave privata non lascia mai quel browser. Un giocatore che non ha mai aperto il mondo con il modulo attivo non ha ancora una chiave: per lui usa l'associazione per conto (sotto).

## 🕹️ Associare per conto di un giocatore

È la sezione **«Associa per conto di un giocatore (senza Foundry dal suo lato)»** della finestra **«Associa occhiali G2»**.

1. Apri la finestra in uno di questi modi:
   - *Game Settings* → *Configure Settings* → *EvenFoundryVTT* → **Associa occhiali G2** (EN *Pair G2 glasses*);
   - clic destro sul giocatore nella lista **Giocatori** in basso a sinistra → **Associa occhiali G2** (giocatore già selezionato).
2. Scegli **Giocatore** e **Personaggio** → **Genera QR**.
3. La finestra mostra:
   - il **QR** — vale una sola associazione e **scade dopo 5 minuti** (poi viene nascosto e le credenziali ruotano);
   - il **codice manuale** di 16 caratteri (pulsante **Copia codice manuale**);
   - le **Verifiche di connessione**: *HTTPS valido · modulo servito · socket attivo* (+ *indirizzo pubblico*), con **Ricontrolla**;
   - i **Dispositivi associati**: utente, personaggio, *ultimo contatto N s fa* / *mai connesso*, *in linea* / *non in linea*, pulsante **Revoca**.
4. Il giocatore inquadra il QR. Al primo collegamento la finestra passa a **«Occhiali collegati»** e appare la notifica *Occhiali G2 collegati · &lt;personaggio&gt;*. **Associa altri occhiali** riparte da capo.

L'utente «(G2)» ha ruolo **Giocatore** ed è proprietario **solo** del personaggio scelto; è marcato `flags.evenfoundryvtt.g2For = <idGiocatore>`, quindi ripetere l'associazione aggiorna lo stesso utente. Non cancellarlo a mano: usa **Revoca** ([Revoca e sicurezza](Revoca-e-Sicurezza)).

## 🏗️ Chi fa da projector

| Giocatore | GM | Chi risponde agli occhiali |
|---|---|---|
| online (Foundry aperto) | qualsiasi | il **client del giocatore**: le azioni partono a suo nome |
| offline | online, con la chiave del dispositivo | il **GM attivo** (riserva) |
| offline | assente | nessuno: gli occhiali mostrano *Nessun GM connesso* (S12) |

Il GM riceve la chiave del dispositivo perché il browser del giocatore la **sigilla per la chiave pubblica di ogni GM**: qualunque browser GM che abbia pubblicato la propria chiave può fare da riserva, anche uno nuovo. Dettagli: [Architettura](Architettura).

## 📚 Vedi anche

- [Revoca e sicurezza](Revoca-e-Sicurezza) · [Risoluzione problemi](Risoluzione-Problemi)
- [ADR-0017](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0017-player-owned-glasses-hybrid-projector.md)
