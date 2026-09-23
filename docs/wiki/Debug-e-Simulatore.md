# Debug e simulatore

Ogni funzione deve essere **osservabile e pilotabile senza occhiali** (principio P5). Le superfici di debug sono solo per lo sviluppo e **falliscono chiuse**: senza i parametri esatti qui sotto il percorso di produzione non cambia.

## 🐞 Parametri della pagina

Parsati in modo rigoroso da `packages/g2-app/src/debug/flags.ts`:

| Parametro | Effetto |
|---|---|
| `?demo=<scenario>` | demo offline (non contatta mai Foundry), implica il debug |
| `?demo=tour` | tutte le 12 schermate in sequenza |
| `?dwell=<ms>` | avanzamento automatico del tour ogni `ms` (≥ 1000); senza, si avanza con un doppio tap vero |
| `?debug=1` | canale di debug + `window.__evf` sull'app reale collegata a Foundry |

Scenari (`packages/g2-app/src/demo/scenarios.ts`): `explore` (S1) · `combat-my-turn` (S2) · `actions` (S3) · `target` (S4) · `spells` (S5) · `result` (S6) · `reaction` (S7) · `saves` (S8) · `dying` (S9) · `unpaired` (S10) · `connecting` (S11) · `offline` (S12). Vedi [Schermate](Schermate).

```bash
pnpm --filter @evf/g2-app dev          # server Vite
pnpm --filter @evf/g2-app dev:demo     # Vite + apre /?demo=tour
```

## 🐞 `window.__evf`

Installato **solo** con `?debug=1` o `?demo=…` (`src/debug/devtools.ts`); altrimenti non esiste:

```js
__evf.state()            // { app, display, scenario? } — stato dell'app e testo mostrato sugli occhiali
__evf.events(20)         // ultimi 20 eventi del canale di debug
__evf.dispatch('down')   // inietta un gesto: 'tap' | 'double' | 'up' | 'down' | { menu: id }
```

`dispatch` valida l'argomento (l'input della console non è fidato) e restituisce `false` se non c'è un bridge degli occhiali.

## 🧪 Simulatore Even Hub: `sim:check`

`packages/g2-app/scripts/sim-check.ts` guida il **tour demo reale dentro il simulatore ufficiale** e controlla cosa arriva al display:

1. avvia Vite (salvo `--url`);
2. lancia `evenhub-simulator <url>?demo=tour --automation-port <porta>`;
3. aspetta `EVF_READY`, poi per ogni marcatore `EVF_SCENE i/n nome layout` salva lo screenshot in `packages/g2-app/.sim-artifacts/`, verifica pixel accesi nelle cinque zone e i pixel di separazione a x = 144 / 432 / 288 **identici tra le scene** (INV-1), prova l'input reale sulle liste (`down` deve cambiare il display) e avanza con `double_click`;
4. fallisce se la console del simulatore contiene `[uncaught]` o `[unhandledrejection]`.

```bash
cd packages/g2-app
WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 \
  pnpm sim:check -- --sim "npx -y @evenrealities/evenhub-simulator@0.9.5"
```

Le variabili `WAYLAND_DISPLAY` / `XDG_RUNTIME_DIR` servono quando il comando parte da una shell senza sessione grafica (per esempio un agente o SSH): usa i valori della tua sessione desktop. Opzioni: `--url`, `--port` (default 9898), `--vite-port` (default 5173), `--sim` (oppure `$EVF_SIMULATOR`), `--timeout` (default 60000 ms). Validato con **evenhub-simulator 0.9.5**.

**Codici di uscita:** `0` passa · `1` fallisce · `2` simulatore non disponibile (saltato: un display o un simulatore mancante non fa mai fallire la CI software).

## 🧪 GO/NO-GO hardware

Pattern *defer-hardware*: i controlli che richiedono occhiali veri sono script in `packages/validation-harness`, eseguibili con `--skip-hardware`, e non bloccano mai la CI.

```bash
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload
pnpm --filter @evf/validation-harness validate:all:skip-hardware   # tutte le verifiche Phase 0 senza hardware
pnpm --filter @evf/validation-harness inv:all                      # suite degli invarianti
```

Le prove finiscono in `docs/perf/phase-0/` (per il sideload: `adr-0012-direct-sideload-<ISO>.json`, solo i verdetti — mai URL, credenziali o payload del QR). Dettagli dei controlli: [HTTPS e rete](HTTPS-e-Rete).

## 🐞 Debug dal lato Foundry

Nel browser del projector i log hanno il prefisso `[EVF]`; ogni azione lascia un audit `flags.evf.audit`. Comandi utili: [Risoluzione problemi](Risoluzione-Problemi).

## 📚 Vedi anche

- [Test e qualità](Test-e-Qualita)
- Automazione del simulatore: [hub.evenrealities.com/docs](https://hub.evenrealities.com/docs)
