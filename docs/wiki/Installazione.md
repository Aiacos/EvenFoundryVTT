# Installazione (GM)

C'è **una sola cosa** da installare: il modulo Foundry **EvenFoundryVTT**. Serve anche l'app per gli occhiali, quindi non ci sono server, container o secondi domini ([ADR-0016](Decisioni-Architetturali)).

## 🥽 Requisiti

| Componente | Richiesto | Note |
|---|---|---|
| **FoundryVTT** | ≥ v13.347 (v14 verificato) | v12 non è supportato (sistema Activity di dnd5e) |
| **Sistema dnd5e** | ≥ 5.3.3 | PHB 2014 e PHB 2024 (`core.modernRules`) |
| **midi-qol** | facoltativo (consigliato) | automazione completa attacco → danni → tiro salvezza → effetto; senza, `activity.use()` pubblica solo la scheda dell'attività |
| **HTTPS valido** | obbligatorio | Foundry raggiungibile **dal telefono** con un certificato che il telefono accetta ([HTTPS e rete](HTTPS-e-Rete)) |
| **Un projector online** | durante il gioco | il client del giocatore, oppure un GM ([Architettura](Architettura)) |
| **Even Realities G2 + R1** | firmware aggiornato | associati al telefono con la procedura Even standard |
| **Even Realities App** | ≥ 2.2.9 | per la pressione lunga ([compatibilità](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/firmware-compatibility.md)) |

socketlib **non serve più** dalla v0.10.0.

## 📦 Installare il modulo

1. **Foundry** → *Setup* → *Add-on Modules* → *Install Module* → **Manifest URL**:

   ```
   https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json
   ```

   Su **The Forge**: *Bazaar* → *Install Module from a Manifest* → stesso URL.
2. Avvia il mondo e attiva **EvenFoundryVTT** in *Manage Modules*.
3. Facoltativo: installa e attiva **midi-qol** (il modulo lo elenca tra i `recommends`).

Il pacchetto contiene già l'app degli occhiali nella cartella `g2/`. Foundry la serve a:

```
https://<foundry>[/<routePrefix>]/modules/evenfoundryvtt/g2/index.html
```

## ⚙️ Dopo l'installazione

1. Verifica HTTPS e WebSocket: [HTTPS e rete](HTTPS-e-Rete).
2. Abilita i giocatori (una volta) o associa gli occhiali per loro: [Abilitare i giocatori](Abilitare-i-Giocatori).
3. La finestra di associazione mostra tre verifiche — **HTTPS valido · modulo servito · socket attivo** — più **indirizzo pubblico**: tutte devono essere ✓.

## 🧪 Installazione di sviluppo

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build:all   # g2-app → packages/foundry-module/g2/, poi tsup → dist/module.js
ln -s "$PWD/packages/foundry-module" "<FoundryData>/Data/modules/evenfoundryvtt"
```

`packages/foundry-module/g2/` è output di build (ignorato da git): ricostruiscilo dopo ogni modifica alla g2-app (`pnpm --filter @evf/g2-app build`) e ricarica la pagina sul telefono.

## 📚 Vedi anche

- Guida completa in inglese: [`docs/setup-guide.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/setup-guide.md)
- Distribuzione del modulo: [Release](Release)
