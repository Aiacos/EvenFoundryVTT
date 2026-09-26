# Release

Dalla v0.13.0 ([ADR-0019](Decisioni-Architetturali)) ci sono **quattro** cose da distribuire, ognuna con il suo workflow:

| Artefatto | Per chi | Workflow |
|---|---|---|
| **zip del modulo** `evenfoundryvtt.zip` (+ `module.json`) — **senza** `g2/` | GM (manifest Foundry / The Forge) | `foundry-module-release.yml` |
| **`evenfoundryvtt.ehpk`** — l'app «FoundryVTT G2 HUD» | giocatori, tramite Even Hub (gruppo beta, poi store) | `foundry-module-release.yml` (asset della release) · `evenhub-pack.yml` (validazione) |
| **app web** su GitHub Pages `/app/` (+ la documentazione di `docs/`) | la pagina aperta dal QR in modalità sviluppatore | `pages.yml` |
| **relay** `evf-relay` (Cloudflare Worker) | tutti: è dove si incontrano scheda e occhiali | `relay-deploy.yml` |

L'app degli occhiali è **un solo bundle** (`packages/g2-app/dist`) per `.ehpk` e Pages; non è più nello zip del modulo perché Foundry ≥ 14.361 serve l'HTML dei moduli come `text/plain`. Flusso: **GitFlow + Changesets**.

**Versioni**: la v0.12.0 è uscita come modulo **v0.2.x**; la v0.13.0 arriva con il prossimo *minor* del modulo (linea 0.3.0), con `g2-app` *minor* e `relay` 0.1.0. **Migrazione** dalla v0.12: i vecchi collegamenti non valgono più; ogni giocatore collega di nuovo gli occhiali dal proprio Foundry ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)). Gli utenti «(G2)» rimasti nel mondo si possono cancellare.

## 🚀 Dal changeset al tag

1. Ogni PR aggiunge un changeset: `pnpm changeset` (il gate 7 lo verifica con `pnpm changeset:status`). Versioni indipendenti per pacchetto, nessuna pubblicazione npm (pre-1.0, `privatePackages.tag: false` in `.changeset/config.json`).
2. Le feature confluiscono in `develop`; `develop` → `main` per il rilascio.
3. A ogni push su `main`, `.github/workflows/release.yml` (`changesets/action`) apre o aggiorna la PR **chore(release): version packages**, che consuma i changeset e aggiorna versioni e `CHANGELOG.md`.
4. **Senza intervento umano**: nello stesso run di `release.yml` il job `gates` esegue la CI (`ci.yml`, riutilizzabile) sul commit della PR *chore(release): version packages*; il job `publish` registra il check `quality-gates`, unisce proprio quel commit ed esegue `pnpm release:tag` (`scripts/release-tag.mjs`): legge la versione da `packages/foundry-module/package.json`, crea e pubblica il tag `v<versione>` (idempotente) e avvia `foundry-module-release.yml` con `gh workflow run` — un tag pubblicato col token predefinito non avvierebbe da solo il workflow.
5. Dopo la release lo stesso run **riallinea `develop`**: porta `sync/main-to-develop` sulla cima di `main`, apre la PR *chore(release): sync main into develop*, la verifica con la CI e la unisce. Solo un conflitto reale la lascia aperta per una persona.

Tag manuale, se serve:

```bash
git tag v0.3.0
git push origin v0.3.0
```

## 🚀 Zip del modulo e `.ehpk`

`.github/workflows/foundry-module-release.yml` (tag `v*.*.*` o avvio manuale con input `tag`):

1. valida il formato del tag `vMAJOR.MINOR.PATCH[-prerelease]`;
2. `pnpm install --frozen-lockfile --ignore-scripts`;
3. `pnpm --filter @evf/foundry-module build` → `dist/module.js`;
4. `pnpm --filter @evf/g2-app build` → `packages/g2-app/dist`, poi `node scripts/check-relay-origin.mjs --bundle packages/g2-app/dist` (whitelist = relay predefinito, permesso `camera`, niente `/join` né socket.io nel bundle);
5. aggiorna in `module.json` la `version` e l'URL `download` legato alla versione e **aggiunge la versione ai nomi dei file** (`dist/module-<ver>.js`, `styles/pair-g2-<ver>.css`): Foundry mette in cache il JavaScript dei moduli, e senza nome nuovo i client continuerebbero a eseguire la versione vecchia;
6. allinea la `version` di `packages/g2-app/app.json` a quella del pacchetto g2-app e crea `evenfoundryvtt.ehpk` da `packages/g2-app/dist`;
7. assembla l'albero di release: `module.json` + `dist/` + `lang/` + `templates/` + `styles/`, poi `node scripts/check-module-assets.mjs release-tree` verifica che ogni percorso citato da `module.json` esista;
8. crea `evenfoundryvtt.zip` senza sourcemap e **fallisce se contiene ancora `g2/`**;
9. note di rilascio dai `CHANGELOG.md` di `foundry-module` (e di `g2-app`, se presente);
10. crea la GitHub Release (i tag con `-` sono pre-release) e carica `module.json` + `evenfoundryvtt.zip` + `evenfoundryvtt.ehpk`.

| Campo di `module.json` | URL |
|---|---|
| `manifest` (stabile) | `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` |
| `download` (per versione) | `https://github.com/Aiacos/EvenFoundryVTT/releases/download/v<X.Y.Z>/evenfoundryvtt.zip` |

**Build locale prima del tag:**

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build          # tsup → dist/
pnpm --filter @evf/g2-app build                  # → packages/g2-app/dist
node scripts/check-relay-origin.mjs --bundle packages/g2-app/dist
```

## 🚀 Relay e GitHub Pages

- **`relay-deploy.yml`** — a ogni merge su `main` che tocca `packages/relay/**` (o avvio manuale): test del relay, `wrangler deploy`, poi controllo di `/health` sull'indirizzo di produzione. Senza i segreti Cloudflare si limita ai test e a un avviso. L'indirizzo pubblicato deve coincidere con `DEFAULT_RELAY_URL` e con la whitelist del `.ehpk`.
- **`pages.yml`** — a ogni push su `main`: costruisce l'app (con il controllo del relay), la documentazione di `docs/` con Jekyll e pubblica tutto su GitHub Pages, con l'app in `/app/` (`https://aiacos.github.io/EvenFoundryVTT/app/`, la pagina del QR) e l'informativa privacy in `privacy.html`.

## 🚀 Passi una tantum del maintainer

1. **Cloudflare**: relay già pubblicato sul sottodominio `workers.dev` `evf-relay` (se cambia, aggiorna insieme `DEFAULT_RELAY_URL` e la whitelist di `app.json`); token API (*Edit Cloudflare Workers*) nei segreti del repository `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; avvia **Relay Deploy**.
2. **GitHub** › *Settings* › *Pages* › *Source* = **GitHub Actions**.
3. **Portale Even Hub**: carica il `.ehpk` della release come build, crea un **gruppo beta** con i giocatori del tavolo, URL dell'informativa privacy = `https://aiacos.github.io/EvenFoundryVTT/privacy.html`; poi invia per la revisione.

Dettagli: [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md) (sezione *Relay and Pages*).

## 🚀 Pacchetto Even Hub

Il `.ehpk` è **la distribuzione per i giocatori**: l'app installata ha il relay in whitelist, il permesso `camera` per «Scansiona QR» e sopravvive al telefono bloccato.

- `.github/workflows/evenhub-pack.yml` lo costruisce e lo valida a ogni push su `main` (`npx --yes @evenrealities/evenhub-cli@0.1.14 pack packages/g2-app/app.json packages/g2-app/dist … -o evenfoundryvtt.ehpk`); `foundry-module-release.yml` ne allega uno nuovo a ogni release.
- `app.json` (nome **FoundryVTT G2 HUD**) deve avere la **stessa versione** del pacchetto g2-app, una `description`, un'`icon`, `min_app_version` e `min_sdk_version`; la whitelist di rete contiene solo `https://` e `wss://evf-relay.evf-relay.workers.dev` (niente wildcard).

### Tre modi di caricare l'app: non confonderli

| | **Even Hub (gruppo beta / store)** | **QR in modalità sviluppatore** | **`.ehpk` di prova sul portale** |
|---|---|---|---|
| Per chi | giocatori | sviluppo e prove rapide | prove del pacchetto |
| Carica | il `.ehpk` installato | la pagina di GitHub Pages `/app/` (dal QR di Foundry) o il server Vite (`pnpm dev:glasses`, `evenhub qr`) | il bundle impacchettato |
| Telefono bloccato | **sopravvive** | l'app si ferma: reinquadra il QR | sopravvive |
| Scadenza | nessuna | nessuna | i caricamenti di prova **scadono** → *«versione di prova scaduta»* |

Doc Even Hub ([CLI](https://hub.evenrealities.com/docs/reference/cli)): *«Scan the QR code with the Even Realities App on your phone. Your app loads on the glasses with hot reload support.»* Durante lo sviluppo: `npx @evenrealities/evenhub-cli qr --url http://<IP-LAN>:5173` (telefono e computer sulla stessa rete), oppure `pnpm dev:glasses` ([Debug e simulatore](Debug-e-Simulatore)).

### Niente submission automatica

La CLI Even Hub espone solo `login` / `init` / `pack` / `qr`: **nessun comando** `publish` / `submit` / `upload`, `login` è interattivo e la submission è un **caricamento manuale sul portale** seguito da una **revisione manuale** (INV-2). L'API privata della CLI non ha un endpoint di caricamento e non va usata. Checklist completa: [`docs/release/evenhub.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/release/evenhub.md).

### Icona

Even Hub vuole un'icona **in scala di grigi** con **primo piano e sfondo separati** (il colore viene rifiutato; deve restare leggibile). Il repository contiene un **d20** stilizzato, rigenerabile:

```bash
python3 assets/generate-icon.py   # → assets/icon/{icon,icon-foreground,icon-background}.png (512 × 512, grigi)
```

Sul portale si caricano `assets/icon/icon-foreground.png` + `assets/icon/icon-background.png`; `icon.png` composto va nel `.ehpk` (campo `icon` di `app.json`).

## 📚 Wiki

La sorgente di questa wiki è [`docs/wiki/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/docs/wiki), versionata con il codice e rivista nelle PR. `.github/workflows/wiki-sync.yml`, a ogni push su `main` che tocca `docs/wiki/**` (o avvio manuale):

1. valida i link con `node scripts/check-wiki-links.mjs docs/wiki` (pagine esistenti, file e immagini presenti, nessuna pagina orfana rispetto a Home e `_Sidebar`);
2. copia la cartella nel repository `<repo>.wiki.git` con `rsync --delete` (eliminare un file elimina la pagina) e fa commit e push.

Prerequisito una tantum: il repository della wiki esiste solo dopo aver creato la prima pagina dal web (*Wiki → Create the first page*); fino ad allora il job si limita a un avviso.

Convenzioni: nomi file `Nome-Pagina.md` in una cartella piatta, link tra pagine nella forma `[testo]` + `(Nome-Pagina)`, senza `.md`, immagini in `images/`, link ai file del repository con URL GitHub completi.

## 📚 Vedi anche

- Guida completa (EN): [`docs/release/foundry-module.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/release/foundry-module.md)
- [Contribuire](Contribuire) · [Test e qualità](Test-e-Qualita)
