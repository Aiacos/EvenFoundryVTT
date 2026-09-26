# Installazione

Due cose da installare: il **modulo Foundry** (una volta, il GM) e l'**app «FoundryVTT G2 HUD»** sul telefono (ogni giocatore con gli occhiali). Non ci sono server da gestire: il relay che li unisce è gestito dal progetto ([Rete e relay](HTTPS-e-Rete), [ADR-0019](Decisioni-Architetturali)).

## 🥽 Requisiti

| Componente | Richiesto | Note |
|---|---|---|
| **FoundryVTT** | ≥ v13.347 (v13 e v14) | self-hosted o **The Forge**, anche giochi privati; v12 non è supportato (sistema Activity di dnd5e) |
| **Sistema dnd5e** | ≥ 5.3.3 | PHB 2014 e PHB 2024 (`core.modernRules`) |
| **midi-qol** | facoltativo (consigliato) | automazione completa attacco → danni → tiro salvezza → effetto; senza, `activity.use()` pubblica solo la scheda dell'attività |
| **Relay raggiungibile** | dal browser del giocatore | la scheda di Foundry deve poter aprire `wss://evf-relay.evf-relay.workers.dev`; **non** serve HTTPS pubblico per Foundry ([Rete e relay](HTTPS-e-Rete)) |
| **Scheda di Foundry aperta** | durante il gioco | quella del giocatore che ha collegato gli occhiali (o del GM che li ha collegati per lui) |
| **Even Realities G2 + R1** | firmware aggiornato | associati al telefono con la procedura Even standard |
| **Even Realities App** | ≥ 2.2.9 | per la pressione lunga ([compatibilità](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/firmware-compatibility.md)) |

socketlib non serve.

## 📦 Il modulo (GM)

1. **Foundry** → *Setup* → *Add-on Modules* → *Install Module* → **Manifest URL**:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

   Su **The Forge**: *Bazaar* → *Install Module from a Manifest* → stesso URL.
2. Avvia il mondo e attiva **EvenFoundryVTT** in *Manage Modules*.
3. Facoltativo: installa e attiva **midi-qol** (il modulo lo elenca tra i `recommends`).

Non c'è altro da configurare: niente utenti da creare, niente giocatori da abilitare. Ogni giocatore collega i propri occhiali dal proprio Foundry ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)).

## 📦 L'app degli occhiali (giocatori)

L'app si chiama **FoundryVTT G2 HUD** ed è distribuita da **Even Hub**:

- **finché non è nello store**: il maintainer aggiunge il tuo account Even Realities al **gruppo beta** del tavolo; l'app compare nella Even Realities App e si installa come le altre;
- **dopo la revisione**: si installa dallo store di Even Hub.

L'app installata sopravvive al telefono bloccato e salva il collegamento: la prima volta tocchi **«Scansiona QR»** (serve il permesso della fotocamera) o **«Inserisci codice»**, poi non devi più fare niente.

## 🧪 Sviluppo e prova senza store

Con l'**app Even Realities in modalità sviluppatore** puoi usare l'app senza installarla: inquadra il **QR mostrato da Foundry** con *Even Hub → Scan QR*. Il QR apre la pagina pubblicata su GitHub Pages (`https://aiacos.github.io/EvenFoundryVTT/app/`) con il collegamento già dentro. Un'app caricata da QR si ferma quando il telefono va in background: dopo un blocco dello schermo va inquadrato di nuovo.

Dal repository:

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build          # tsup → packages/foundry-module/dist/module.js
ln -s "$PWD/packages/foundry-module" "<FoundryData>/Data/modules/evenfoundryvtt"
pnpm dev:glasses                                 # app di questo checkout sulla LAN + controllo del relay
```

`pnpm dev:glasses` stampa il QR dell'app di questo checkout sulla LAN: inquadralo, poi digita nell'app il codice che mostra **«Collega occhiali G2»** (Alt+G) — o passalo con `--code` e basta una scansione. Dettagli: [Debug e simulatore](Debug-e-Simulatore).

## 📚 Vedi anche

- Guida completa in inglese: [`docs/setup-guide.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/setup-guide.md)
- Distribuzione del modulo e dell'app: [Release](Release)
