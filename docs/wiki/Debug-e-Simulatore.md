# Debug e simulatore

Ogni funzione deve essere **osservabile e pilotabile senza occhiali** (principio P5). Le superfici di debug sono solo per lo sviluppo e **falliscono chiuse**: senza i parametri esatti qui sotto il percorso di produzione non cambia.

## 🐞 Parametri della pagina

Parsati in modo rigoroso da `packages/g2-app/src/debug/flags.ts`:

| Parametro | Effetto |
|---|---|
| `?demo=<scenario>` | demo offline (non contatta mai il relay), implica il debug |
| `?demo=tour` | tutte le 12 schermate in sequenza |
| `?dwell=<ms>` | avanzamento automatico del tour ogni `ms` (≥ 1000); senza, si avanza con un doppio tap vero |
| `?debug=1` | canale di debug + `window.__evf` sull'app reale collegata tramite il relay |

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

`dispatch` valida l'argomento (l'input della console non è fidato) e restituisce `false` se non c'è il bridge dell'SDK Even Hub (`EvenAppBridge`, cioè fuori dalla Even App o dal simulatore).

## 🧪 Occhiali veri: `pnpm wizard` e `pnpm dev:glasses`

`scripts/wizard.sh` prepara tutto e mostra il QR da inquadrare con la Even Realities App:
controlla il toolchain, trova l'IP di rete e una porta libera, apre la porta nel firewall
(chiede conferma, la richiude all'uscita), avvia l'app sulla LAN e disegna il QR ufficiale.

| Comando | Cosa fa |
|---|---|
| `pnpm wizard` | tour delle 12 schermate demo, cambio ogni 6 s (nessun Foundry, nessun relay) |
| `pnpm wizard --scene combat-my-turn` | una sola schermata, per provare i gesti |
| `pnpm wizard --mode build` | serve il bundle di produzione (`packages/g2-app/dist`, gli stessi byte del `.ehpk` e di GitHub Pages) |
| `pnpm dev:glasses` (= `--mode live`) | collegamento vero con il **tuo** Foundry: serve l'app di questo checkout sulla LAN, controlla il relay e ne stampa il QR: inquadralo in Developer Mode, poi digita nell'app il codice che mostra **«Collega occhiali G2»** (Alt+G) — oppure `--code XXXX-XXXX-XXXX-XXXX` e basta una scansione. Non digitare URL nel campo link manuale della Even App: tronca e mette la maiuscola |
| `pnpm dev:glasses --local-relay` | avvia anche il relay in locale (`wrangler dev`); solo con un Foundry `http://` (una pagina `https://` non apre `ws://`) — imposta **«Relay (avanzato)»** all'indirizzo stampato |
| `pnpm wizard --debug` | aggiunge `?debug=1` (log nella console della Developer Mode) |

Il relay da solo: `pnpm --filter @evf/relay dev` (`wrangler dev` → `http://localhost:8787`).

Sul telefono, la prima volta: accedi una volta a `hub.evenrealities.com/login` (l'account
diventa sviluppatore, non c'è un interruttore), chiudi e riapri l'app, poi **Even Hub →
Scan QR**. Un'app caricata da QR si ferma quando il telefono la manda in background:
dopo un blocco dello schermo va inquadrato di nuovo il QR (l'app installata da Even Hub no).

## 🧪 Simulatore Even Hub: `sim:check`

`packages/g2-app/scripts/sim-check.ts` guida il **tour demo reale dentro il simulatore ufficiale** e controlla cosa arriva al display:

1. avvia Vite (salvo `--url`);
2. lancia `evenhub-simulator <url>?demo=tour --automation-port <porta>`;
3. aspetta `EVF_READY`, poi per ogni marcatore `EVF_SCENE i/n nome layout` salva lo screenshot in `packages/g2-app/.sim-artifacts/`, verifica pixel accesi nelle cinque zone e i pixel di separazione a x = 144 / 432 / 288 (confini delle zone e taglio fra le tile) **identici tra le scene** (INV-1), prova l'input reale sulle liste (`down` deve cambiare il display) e avanza con `double_click`;
4. fallisce se la console del simulatore contiene `[uncaught]` o `[unhandledrejection]`.

```bash
cd packages/g2-app
WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000 \
  pnpm sim:check -- --sim "npx -y @evenrealities/evenhub-simulator@0.9.5"
```

Le variabili `WAYLAND_DISPLAY` / `XDG_RUNTIME_DIR` servono quando il comando parte da una shell senza sessione grafica (per esempio un agente o SSH): usa i valori della tua sessione desktop. Opzioni: `--url`, `--port` (default 9898), `--vite-port` (default 5173), `--sim` (oppure `$EVF_SIMULATOR`), `--timeout` (default 60000 ms). Validato con **evenhub-simulator 0.9.5**.

**Linux senza display (server, CI):** il simulatore è un'app GTK. Installa `xvfb libgtk-3-0 libglib2.0-0 libgdk-pixbuf2.0-0`, avvialo con `xvfb-run -a` e esporta **prima** queste variabili, altrimenti il simulatore si chiude con errori glycin-loaders / GdkPixbuf:

```bash
export XDG_DATA_DIRS=/usr/share:/usr/local/share:/home/linuxbrew/.linuxbrew/share
export GDK_PIXBUF_MODULE_FILE=/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache
export GSK_RENDERER=cairo
export LIBGL_ALWAYS_SOFTWARE=1
pnpm sim:check -- --sim "xvfb-run -a npx -y @evenrealities/evenhub-simulator@0.9.5"
```

Il simulatore **non** riproduce tutti i limiti dell'hardware: accetta tile immagine a qualunque offset (il vero host rifiuta quelle fuori dalla griglia 288 × 144) e non mostra i problemi di banda BLE. Un passaggio nel simulatore non sostituisce la prova sugli occhiali (sezione *GO/NO-GO hardware* qui sotto).

**Codici di uscita:** `0` passa · `1` fallisce · `2` simulatore non disponibile (saltato: un display o un simulatore mancante non fa mai fallire la CI software).

## 🧪 Test end-to-end sul relay

La sessione vera degli occhiali (`DirectSession`) contro un relay vero e un projector finto che parla il protocollo sigillato reale: codice → rotazione → nuova stanza → online → asset della mappa → `invoke` → projector assente e di ritorno.

```bash
pnpm --filter @evf/relay dev &                                   # relay locale su :8787
EVF_RELAY_URL=ws://127.0.0.1:8787 pnpm vitest --run packages/g2-app/src/direct/relay.e2e.test.ts
```

Senza `EVF_RELAY_URL` il test è saltato. La CI lo esegue a ogni push (passo *Relay end-to-end*, con `wrangler dev` e poi `validate:relay`) ([Test e qualità](Test-e-Qualita)).

## 🧪 GO/NO-GO hardware

Pattern *defer-hardware*: i controlli che richiedono occhiali veri sono script in `packages/validation-harness`, eseguibili con `--skip-hardware`, e non bloccano mai la CI.

```bash
pnpm --filter @evf/validation-harness validate:relay:skip-hardware   # relay: salute, CORS, stanza, dimensioni
pnpm --filter @evf/validation-harness validate:relay                 # + checklist sì/no su telefono, G2 e R1
pnpm --filter @evf/validation-harness validate:all:skip-hardware     # tutte le verifiche Phase 0 senza hardware
pnpm --filter @evf/validation-harness inv:all                        # suite degli invarianti
```

`RELAY_URL` (facoltativo) punta a un altro relay. Le prove finiscono in `docs/perf/phase-0/` (`adr-0019-relay-<ISO>.json`, solo i verdetti — mai URL, id di stanza o chiavi). Dettagli dei controlli: [Rete e relay](HTTPS-e-Rete).

## 🐞 Debug dal lato Foundry

Nel browser che trasmette (il projector) i log hanno il prefisso `[EVF]`; ogni azione lascia un audit `flags.evf.audit`. Comandi utili: [Risoluzione problemi](Risoluzione-Problemi).

## 📚 Vedi anche

- [Test e qualità](Test-e-Qualita)
- Automazione del simulatore: [hub.evenrealities.com/docs](https://hub.evenrealities.com/docs)
