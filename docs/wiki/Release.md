# Release

Dalla v0.12.0 l'artefatto di release è lo **zip del modulo Foundry**, che contiene anche l'app degli occhiali in `g2/` ([ADR-0016](Decisioni-Architetturali)); ogni release allega anche il pacchetto Even Hub `evenfoundryvtt.ehpk` costruito dalla stessa cartella `g2/`. Niente immagine Docker, niente `g2-app-dist.zip`. Flusso: **GitFlow + Changesets**.

**Versioni**: l'ultima release basata sul bridge è la **v0.1.55** del modulo (più la pre-release `g2-app-v0.11.0`); la prima dopo il port è la **v0.2.0** (modifica incompatibile prima della 1.0 ⇒ *minor*). **Migrazione** per chi usava il bridge: spegni e rimuovi il container `evf-bridge`, aggiorna il modulo, poi riassocia ogni paio di occhiali dal pannello *Associa occhiali G2* o dalla lista *Giocatori* (i vecchi token bearer non esistono più).

## 🚀 Dal changeset al tag

1. Ogni PR aggiunge un changeset: `pnpm changeset` (il gate 7 lo verifica con `pnpm changeset:status`). Versioni indipendenti per pacchetto, nessuna pubblicazione npm (pre-1.0, `privatePackages.tag: false` in `.changeset/config.json`).
2. Le feature confluiscono in `develop`; `develop` → `main` per il rilascio.
3. A ogni push su `main`, `.github/workflows/release.yml` (`changesets/action`) apre o aggiorna la PR **chore(release): version packages**, che consuma i changeset e aggiorna versioni e `CHANGELOG.md`.
4. **Senza intervento umano**: nello stesso run di `release.yml` il job `gates` esegue la CI (`ci.yml`, riutilizzabile) sul commit della PR *chore(release): version packages*; il job `publish` registra il check `quality-gates`, unisce proprio quel commit ed esegue `pnpm release:tag` (`scripts/release-tag.mjs`): legge la versione da `packages/foundry-module/package.json`, crea e pubblica il tag `v<versione>` (idempotente) e avvia `foundry-module-release.yml` con `gh workflow run` — un tag pubblicato col token predefinito non avvierebbe da solo il workflow.

Tag manuale, se serve:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## 🚀 Zip del modulo

`.github/workflows/foundry-module-release.yml` (tag `v*.*.*` o avvio manuale con input `tag`):

1. valida il formato del tag `vMAJOR.MINOR.PATCH[-prerelease]`;
2. `pnpm install --frozen-lockfile --ignore-scripts`;
3. `pnpm --filter @evf/foundry-module build` → `dist/module.js`;
4. `pnpm --filter @evf/g2-app build` → `packages/foundry-module/g2/` (fallisce se manca `g2/index.html`);
5. aggiorna in `module.json` la `version` e l'URL `download` legato alla versione e **aggiunge la versione ai nomi dei file** (`dist/module-<ver>.js`, `styles/pair-g2-<ver>.css`): Foundry mette in cache il JavaScript dei moduli, e senza nome nuovo i client continuerebbero a eseguire la versione vecchia; poi allinea la `version` di `packages/g2-app/app.json` a quella del pacchetto g2-app e crea `evenfoundryvtt.ehpk`;
6. assembla l'albero di release: `module.json` + `dist/` + **`g2/`** + `lang/` + `templates/` + **`styles/`**, poi `node scripts/check-module-assets.mjs release-tree` verifica che ogni percorso citato da `module.json` (`esmodules`, `styles`, `languages`) esista;
7. crea `evenfoundryvtt.zip` senza sourcemap e verifica che contenga `g2/index.html`;
8. note di rilascio dai `CHANGELOG.md` di `foundry-module` (e di `g2-app`, se presente);
9. crea la GitHub Release (i tag con `-` sono pre-release) e carica `module.json` + `evenfoundryvtt.zip` + `evenfoundryvtt.ehpk`.

| Campo di `module.json` | URL |
|---|---|
| `manifest` (stabile) | `https://github.com/Aiacos/EvenFoundryVTT/releases/latest/download/module.json` |
| `download` (per versione) | `https://github.com/Aiacos/EvenFoundryVTT/releases/download/v<X.Y.Z>/evenfoundryvtt.zip` |

**Build locale prima del tag:**

```bash
pnpm install --frozen-lockfile
pnpm --filter @evf/foundry-module build:all     # g2-app → g2/, poi tsup → dist/
```

## 🚀 Pacchetto Even Hub (secondario)

I giocatori **non** hanno bisogno del `.ehpk`: l'app si carica con il **QR sideload** servito dal modulo ([Installazione](Installazione)). Il pacchetto serve a validare manifest e build e per un futuro listing su Even Hub.

- `.github/workflows/evenhub-pack.yml` lo costruisce e lo valida a ogni push su `main` (`npx --yes @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/foundry-module/g2 -o evenfoundryvtt.ehpk`); `foundry-module-release.yml` ne allega uno nuovo a ogni release.
- `app.json` deve avere la **stessa versione** del pacchetto g2-app (per i pacchetti locali), una `description`, un'`icon` e `min_app_version`; per la revisione serve `min_sdk_version` ≥ 0.0.14.

### Due strade diverse: non confonderle

| | **QR (sviluppo e uso reale)** | **`.ehpk` caricato sul portale** |
|---|---|---|
| Strumento | `evenhub qr` → scansione con la Even Realities App | caricamento sul **portale sviluppatori** Even Hub |
| Carica | la pagina servita da Foundry (`/modules/evenfoundryvtt/g2/`) o il server Vite di sviluppo | il bundle impacchettato |
| Scadenza | **nessuna** | i caricamenti di prova **scadono** → *«versione di prova scaduta»* |
| Installazione permanente | — | solo dopo una **submission approvata** da Even Realities |

Doc Even Hub ([CLI](https://hub.evenrealities.com/docs/reference/cli)): *«Scan the QR code with the Even Realities App on your phone. Your app loads on the glasses with hot reload support.»* Per provare sugli occhiali usa sempre il QR: `npx @evenrealities/evenhub-cli qr --url http://<IP-LAN>:5173` (telefono e computer sulla stessa rete) durante lo sviluppo, oppure il QR dell'associazione per l'app servita da Foundry. Se devi per forza ripetere una prova col portale, rigenera un `.ehpk` nuovo e ricaricalo: un nuovo caricamento fa ripartire la finestra di prova (la scadenza è una regola del portale, non del file).

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
