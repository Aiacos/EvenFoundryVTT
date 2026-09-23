# Release

Dalla v0.10.0 l'unico artefatto di release è lo **zip del modulo Foundry**, che contiene anche l'app degli occhiali in `g2/` ([ADR-0012](Decisioni-Architetturali)). Flusso: **GitFlow + Changesets**.

## 🚀 Dal changeset al tag

1. Ogni PR aggiunge un changeset: `pnpm changeset` (il gate 7 lo verifica con `pnpm changeset:status`). Versioni indipendenti per pacchetto, nessuna pubblicazione npm (pre-1.0, `privatePackages.tag: false` in `.changeset/config.json`).
2. Le feature confluiscono in `develop`; `develop` → `main` per il rilascio.
3. A ogni push su `main`, `.github/workflows/release.yml` (`changesets/action`) apre o aggiorna la PR **Version Packages**, che consuma i changeset e aggiorna versioni e `CHANGELOG.md`.
4. Quando la PR *Version Packages* viene unita, lo stesso workflow esegue `pnpm release:tag` (`scripts/release-tag.mjs`): legge la versione da `packages/foundry-module/package.json`, crea e pubblica il tag `v<versione>` (idempotente) e avvia `foundry-module-release.yml` con `gh workflow run` — un tag pubblicato col token predefinito non avvierebbe da solo il workflow.

Tag manuale, se serve:

```bash
git tag v0.10.0
git push origin v0.10.0
```

## 🚀 Zip del modulo

`.github/workflows/foundry-module-release.yml` (tag `v*.*.*` o avvio manuale con input `tag`):

1. valida il formato del tag `vMAJOR.MINOR.PATCH[-prerelease]`;
2. `pnpm install --frozen-lockfile --ignore-scripts`;
3. `pnpm --filter @evf/foundry-module build` → `dist/module.js`;
4. `pnpm --filter @evf/g2-app build` → `packages/foundry-module/g2/` (fallisce se manca `g2/index.html`);
5. aggiorna in `module.json` la `version` e l'URL `download` legato alla versione;
6. assembla l'albero di release: `module.json` + `dist/` + **`g2/`** + `lang/` + `templates/` + **`styles/`**, poi `node scripts/check-module-assets.mjs release-tree` verifica che ogni percorso citato da `module.json` (`esmodules`, `styles`, `languages`) esista;
7. crea `evenfoundryvtt.zip` senza sourcemap e verifica che contenga `g2/index.html`;
8. note di rilascio dai `CHANGELOG.md` di `foundry-module` (e di `g2-app`, se presente);
9. crea la GitHub Release (i tag con `-` sono pre-release) e carica `module.json` + `evenfoundryvtt.zip`.

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

`.github/workflows/evenhub-pack.yml` costruisce e valida un `.ehpk` a ogni push su `main` (`npx --yes @evenrealities/evenhub-cli pack packages/g2-app/app.json packages/foundry-module/g2 -o evenfoundryvtt.ehpk`). Serve a validare manifest e build; i giocatori **non** ne hanno bisogno, perché l'app si carica con il QR sideload. Dettagli: [`docs/release/evenhub.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/release/evenhub.md).

## 📚 Wiki

La sorgente di questa wiki è [`docs/wiki/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/docs/wiki), versionata con il codice e rivista nelle PR. `.github/workflows/wiki-sync.yml`, a ogni push su `main` che tocca `docs/wiki/**` (o avvio manuale):

1. valida i link con `node scripts/check-wiki-links.mjs docs/wiki` (pagine esistenti, file e immagini presenti, nessuna pagina orfana rispetto a Home e `_Sidebar`);
2. copia la cartella nel repository `<repo>.wiki.git` con `rsync --delete` (eliminare un file elimina la pagina) e fa commit e push.

Prerequisito una tantum: il repository della wiki esiste solo dopo aver creato la prima pagina dal web (*Wiki → Create the first page*); fino ad allora il job si limita a un avviso.

Convenzioni: nomi file `Nome-Pagina.md` in una cartella piatta, link tra pagine nella forma `[testo]` + `(Nome-Pagina)`, senza `.md`, immagini in `images/`, link ai file del repository con URL GitHub completi.

## 📚 Vedi anche

- Guida completa (EN): [`docs/release/foundry-module.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/release/foundry-module.md)
- [Contribuire](Contribuire) · [Test e qualità](Test-e-Qualita)
