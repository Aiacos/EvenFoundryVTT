# Rete e relay

Dalla v0.13.0 **il telefono non si collega mai a Foundry** ([ADR-0019](Decisioni-Architetturali)). Occhiali e scheda di Foundry si incontrano su un **relay**: tutti e due aprono una connessione in **uscita** verso lo stesso indirizzo fisso. Per questo **non serve più HTTPS pubblico** per Foundry, né reverse proxy, né porte aperte.

## 🏗️ Cosa deve raggiungere cosa

| Da | Verso | Serve |
|---|---|---|
| la scheda di Foundry del giocatore (browser) | `wss://evf-relay.evf-relay.workers.dev` | sì: è l'unico requisito di rete per Foundry |
| l'app sul telefono | `wss://evf-relay.evf-relay.workers.dev` | sì (l'app Even Hub ha solo questo indirizzo in whitelist) |
| il telefono | il server Foundry | **no** |
| il server Foundry | il relay | **no**: la connessione parte dal browser, non dal server |

Il relay è un Cloudflare Worker con un Durable Object per stanza: una connessione per ruolo (`projector` / `glasses`), messaggi fino a 1 MiB, al massimo 60 messaggi al secondo, **nessun dato salvato**. Vede solo buste cifrate ([Scollegare e sicurezza](Revoca-e-Sicurezza)). Salute: `https://evf-relay.evf-relay.workers.dev/health` → `ok`.

## ⚙️ Dove funziona

- **Foundry self-hosted** in LAN, anche `http://192.168.x.x:30000`: il telefono non lo deve raggiungere. Su una pagina `http://` che non sia `localhost` il browser nasconde la crittografia WebCrypto: il modulo usa allora una sua implementazione software verificata (vedi sotto) e funziona lo stesso; HTTPS resta consigliato.
- **Foundry dietro reverse proxy / Tailscale / TLS nativo**: nessuna configurazione in più.
- **The Forge**, anche con **gioco privato** e *User Manager* attivo o no: funziona **senza configurazioni**. Il telefono non passa dal login di The Forge; l'arte della scena la carica la scheda del giocatore, che è già dentro il gioco ([Mappa](Mappa)).
- Foundry **v13 e v14**.

Quando il browser non raggiunge il relay, la finestra *Collega occhiali G2* lo dice subito (**«Questo browser non raggiunge il relay»**, con **Come risolvere** e **Riprova**) e non mostra un QR che non funzionerebbe. Cause tipiche: firewall o proxy aziendale che blocca i WebSocket o il dominio `workers.dev`, estensioni del browser, rete senza Internet.

## ⚙️ Impostazioni avanzate del modulo

Due impostazioni per browser (`scope: 'client'`), da lasciare ai valori predefiniti salvo sviluppo o self-hosting:

| Impostazione | Predefinito | Uso |
|---|---|---|
| **Relay (avanzato)** | `wss://evf-relay.evf-relay.workers.dev` | un relay tuo o di sviluppo; il QR lo porta agli occhiali |
| **Pagina dell'app occhiali (avanzato)** | `https://aiacos.github.io/EvenFoundryVTT/app/` | la pagina aperta dal QR; solo per chi ospita l'app da sé. **Non** metterci l'indirizzo LAN di `pnpm dev:glasses`: quel comando stampa già il suo QR |

Se una delle due non è al valore predefinito, la finestra *Collega occhiali G2* lo dice in cima, con il pulsante **«Ripristina predefinito»** (rimette il valore e mostra un nuovo QR). Un indirizzo `http://` in LAN è segnalato in rosso: *«Il QR apre una pagina http:// della rete locale (un server di sviluppo, es. «pnpm dev:glasses»): funziona solo finché quel server è acceso»*. **Hai seguito il wizard della v0.3.0 o v0.3.1?** Ti faceva impostare proprio quell'indirizzo, e ogni QR di Foundry apriva una pagina morta appena spegnevi il server: premi **«Ripristina predefinito»**.

## 🔐 Pagine `http://` e cifratura

Il browser espone la crittografia WebCrypto (`crypto.subtle`, `crypto.randomUUID`) solo nei **contesti sicuri**: pagine `https://` e `http://localhost` / `127.0.0.1`. Su `http://192.168…` (un Foundry in LAN, o l'app servita da `pnpm dev:glasses`) mancano, e fino alla v0.3.2 il collegamento falliva con *«Codice non valido»*. Ora il canale carica, solo in quel caso, un'implementazione software degli stessi algoritmi (AES-256-GCM, HKDF-SHA256, SHA-256 da `@noble/ciphers` e `@noble/hashes` 2.4.0, verificate da cure53): i messaggi sul filo sono identici, quindi un lato con WebCrypto parla con uno senza. La riga di avvio della pagina sul telefono lo dice: `secure no · crypto fallback`. Dettagli: [ADR-0019](Decisioni-Architetturali) (emendamento 2) e [Scollegare e sicurezza](Revoca-e-Sicurezza).

## 📦 Self-hosting del relay

Il relay è il pacchetto [`packages/relay`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/packages/relay) (nessun segreto né variabile):

```bash
CLOUDFLARE_API_TOKEN=… pnpm --filter @evf/relay deploy   # → https://evf-relay.<account>.workers.dev
pnpm --filter @evf/relay dev                             # oppure wrangler dev in locale → http://localhost:8787
```

Poi metti `wss://evf-relay.<account>.workers.dev` in **Relay (avanzato)**. Limite: l'app installata da Even Hub raggiunge **solo** il relay in whitelist nel suo `app.json` (niente wildcard); un relay tuo funziona con la versione web aperta dal QR (modalità sviluppatore) o con un `.ehpk` costruito da te con la whitelist cambiata. Un relay locale `ws://` funziona solo con un Foundry `http://`: una pagina `https://` non può aprire `ws://`.

## 🧪 Verifica GO/NO-GO

```bash
# Solo controlli software (senza telefono)
pnpm --filter @evf/validation-harness validate:relay:skip-hardware
# Completo: controlli software + checklist interattiva sì/no (telefono, G2, R1)
pnpm --filter @evf/validation-harness validate:relay
# Un relay diverso (tuo, o wrangler dev)
RELAY_URL=ws://127.0.0.1:8787 pnpm --filter @evf/validation-harness validate:relay:skip-hardware
```

Controlli: `health`, `cors`, `room-roundtrip` (andata e ritorno in una stanza casuale, con il tempo misurato) e `oversize` (informativo). Codici di uscita: `0` GO · `1` NO-GO · `2` saltato · `3` errore d'uso. Le prove finiscono in `docs/perf/phase-0/adr-0019-relay-<ISO>.json`, solo i verdetti (mai URL o id di stanza).

## 📚 Vedi anche

- [Risoluzione problemi](Risoluzione-Problemi) · runbook: [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md)
