# Revoca e sicurezza

Foundry inoltra i messaggi dei moduli a **tutti** i client collegati ([module development](https://foundryvtt.com/article/module-development/)). Per questo niente viaggia in chiaro: ogni messaggio tra occhiali e projector è **sigillato** e gli altri client vedono solo testo cifrato.

## 🔐 Gli utenti «(G2)»

- Un utente per giocatore: **«&lt;Giocatore&gt; (G2)»**, ruolo **Giocatore**, mai Trusted, Assistente o GM.
- Proprietario **solo** del personaggio associato (con ADR-0017 la proprietà è rispecchiata da quella del giocatore).
- Marcato `flags.evenfoundryvtt.g2For = <idGiocatore>`: ripetere l'associazione aggiorna lo stesso utente.
- **Non cancellarlo** da *User Management*: resterebbero i metadati del dispositivo. Usa **Revoca**.

## 🔐 Chiavi e segreti

| Segreto | Dove vive | Chi lo può leggere |
|---|---|---|
| **Chiave del dispositivo** (AES-256, 32 byte) | sul telefono e nell'archivio `scope: 'client'` del browser projector | solo telefono e projector; con ADR-0017 anche i GM, tramite copie sigillate per la loro chiave pubblica |
| **Password dell'utente «(G2)»** | sul telefono; con ADR-0017 sigillata per la chiave pubblica del giocatore in un record del mondo | solo il browser del giocatore (e il GM che l'ha generata) |
| **Chiave privata ECDH** P-256 di ogni client | archivio `scope: 'client'` di quel browser | nessun altro |
| **Chiave pubblica ECDH** | flag utente `flags.evenfoundryvtt.pub` | tutti (è pubblica) |
| **Metadati dei dispositivi** | impostazione del mondo `g2Devices` | tutti: utente, giocatore, attore, etichetta, orari — **nessuna chiave** |

Il QR porta utente, password e chiave nel **frammento dell'URL** (`#evf=…`), che il browser non invia mai al server.

## 🔐 Cosa vedono gli altri

| Chi | Vede |
|---|---|
| Altri giocatori e client | solo buste cifrate `{evf, to, from, iv, ct}` sul relay `module.evenfoundryvtt` |
| Il server Foundry | le stesse buste cifrate + i normali accessi dell'utente «(G2)» |
| Gli occhiali | il **proprio** personaggio, il combattimento, il registro e la scena **filtrati**: niente sussurri né tiri ciechi, niente token nascosti, porte segrete mostrate come muri, PF solo per sé e per gli alleati |

Ogni busta è AES-256-GCM con IV casuale da 96 bit e `from>to` come dati autenticati: una busta reindirizzata a un altro dispositivo non si apre. Un `ts` nel testo cifrato limita il replay a **120 s**. Dettagli: [Protocollo](Protocollo).

## 🔐 Cosa possono fare gli occhiali

- Solo azioni per il **personaggio associato**: `actor_id` viene forzato e un attore diverso è rifiutato (`forbidden_actor`).
- Ogni azione passa da `dispatchTool` sul **solo client eletto projector** ([ADR-0011](Decisioni-Architetturali), emendato da ADR-0017) e lascia un messaggio di audit nascosto, solo GM, marcato `flags.evf.audit`.
- Dal client del giocatore le azioni hanno **i permessi del giocatore**: niente che quel giocatore non possa già fare in Foundry. I passaggi solo-GM (per esempio i danni ai PNG) passano dal socket GM di midi-qol.

## 🔐 Revocare un dispositivo

1. GM: **Associa occhiali G2** → **Dispositivi associati** → **Revoca** accanto al dispositivo → **Conferma revoca**.
2. Il modulo invia agli occhiali un messaggio sigillato `{t:'revoked'}`, elimina l'utente «(G2)» e dimentica la chiave. Gli occhiali tornano a **S10** con *ASSOCIAZIONE REVOCATA DAL GM*.
3. Se il dispositivo era offline, la console del GM registra `[EVF] could not notify <id> of revocation`: l'utente viene eliminato comunque e il prossimo accesso fallisce con *credenziali rifiutate*.

**Telefono perso?** Revoca subito. Con ADR-0017 puoi anche **rigenerare la password** dell'utente «(G2)» ([Abilitare i giocatori](Abilitare-i-Giocatori)).

**Sul telefono:** *Diagnostica* → **Dimentica associazione** cancella le credenziali locali.

## 🔐 Rotazione e QR monouso

- Al primo `hello` il projector ruota le credenziali e le invia sigillate con la vecchia chiave in `welcome.rotate`; la vecchia chiave è accettata ancora per 60 s.
- Se il projector è il **client di un giocatore**, ruota solo la **chiave del dispositivo**: la password può cambiarla solo un GM (ADR-0017).
- Un QR non usato scade dopo **5 minuti** (associazione dal GM).

## 📚 Vedi anche

- [Architettura](Architettura) · [Protocollo](Protocollo)
- Modello di sicurezza del modulo: [`packages/foundry-module/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/packages/foundry-module/README.md)
