# Scollegare e sicurezza

Tra gli occhiali e la scheda di Foundry che li trasmette c'è un **relay** gestito dal progetto. Il relay inoltra messaggi che **non può leggere**: ogni messaggio è una **busta sigillata** AES-256-GCM con una chiave che hanno solo gli occhiali e quel browser ([ADR-0019](Decisioni-Architetturali)).

## 🔐 Cosa non esiste più

Dalla v0.13.0 il telefono **non accede mai a Foundry**: niente utenti «(G2)», niente password, nessun login, nessun cookie di Foundry sul telefono. Il GM non custodisce chiavi per conto dei giocatori.

## 🔐 Chiavi e segreti

| Segreto | Dove vive | Chi lo può leggere |
|---|---|---|
| **Chiave del dispositivo** (AES-256, 32 byte) | sul telefono e nell'impostazione `scope: 'client'` (memoria del browser) di chi ha mostrato il QR | solo il telefono e quel browser |
| **Stanza del relay** (id casuale da 128 bit) | negli stessi due posti | il relay la vede per instradare, ma non ha la chiave |
| **Codice di 16 caratteri** | nella finestra *Collega occhiali G2* | chi lo legge: stanza e chiave derivano dal codice (HKDF-SHA256), per questo è monouso e scade in 5 minuti |

Il QR porta il codice (da cui derivano stanza e chiave) nel **frammento dell'URL** (`#c=…`), che il browser non invia mai al server. Il collegamento **non** va sul server di Foundry né agli altri client: nessuna impostazione del mondo, nessun flag utente.

## 🔐 Cosa vede chi

| Chi | Vede |
|---|---|
| **Il relay** | id della stanza, orari e dimensioni dei messaggi — **mai il contenuto** |
| **Il server Foundry e gli altri client** | niente del canale degli occhiali: il traffico parte dalla scheda del giocatore verso il relay |
| **Gli occhiali** | il **proprio** personaggio, il combattimento, il registro e la scena **filtrati**: niente sussurri né tiri ciechi, niente token nascosti, porte segrete mostrate come muri, PF solo per sé e per gli alleati |

Ogni busta usa un IV casuale da 96 bit e `from>to` come dati autenticati; un `ts` nel testo cifrato limita il replay a **120 s**. Dettagli: [Protocollo](Protocollo).

## 🔐 Cosa possono fare gli occhiali

- Solo azioni per il **personaggio collegato**: a ogni richiesta la scheda ricontrolla dal vivo che il suo utente ne sia ancora proprietario (`forbidden_actor` altrimenti, con audit).
- Ogni azione passa da `dispatchTool` nella **sola** scheda che trasmette quegli occhiali (un Web Lock per dispositivo: una scheda per browser, [ADR-0011](Decisioni-Architetturali)) e lascia un messaggio di audit nascosto, solo GM, marcato `flags.evf.audit`.
- Le azioni hanno **i permessi di chi trasmette**: niente che il giocatore non possa già fare in Foundry. I passaggi solo-GM (per esempio i danni ai PNG) passano dal socket GM di midi-qol.

## 🔐 Scollegare

1. Nella finestra **Collega occhiali G2** › **Occhiali collegati a questo browser** premi **Scollega** accanto agli occhiali → conferma *Dimenticare questi occhiali?*.
2. Se gli occhiali sono collegati ricevono un messaggio sigillato `{t:'revoked'}` e tornano a **S10** con *OCCHIALI SCOLLEGATI DA FOUNDRY*; il browser dimentica stanza e chiave.
3. Se erano offline, la console registra `[EVF] could not notify <id> of the revocation`: il collegamento è comunque dimenticato, e gli occhiali non trovano più nessuno nella stanza.

**Telefono perso?** Scollega dal browser che lo aveva collegato: senza quel browser la chiave sul telefono non serve a niente.

**Sul telefono:** *Diagnostica* → **Dimentica associazione** cancella stanza e chiave locali.

## 🔐 Rotazione e QR monouso

- Al primo `hello` la scheda risponde con `welcome.rotate = { room, key }`: stanza e chiave nuove, inviate sigillate con quelle vecchie; entrambe le parti passano alla nuova stanza.
- Un QR (o codice) non usato scade dopo **5 minuti**.

## 📚 Vedi anche

- [Architettura](Architettura) · [Protocollo](Protocollo)
- Relay: [`packages/relay/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/packages/relay/README.md)
