# Contribuire

## 🧹 Preparare l'ambiente

```bash
nvm use                                  # Node 24 (.nvmrc)
corepack enable                          # pnpm 10.33.4 (packageManager)
pnpm install --frozen-lockfile
pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
```

Tutti i comandi a 0 = repository sano.

## 🧹 Flusso dei branch (GitFlow)

- `main` — rilasci. `develop` — integrazione.
- Lavora su `feature/<nome>` partendo da `develop`, apri la PR verso `develop`.
- `develop` → `main` porta al rilascio (PR *Version Packages*, [Release](Release)).
- Un `develop` rosso si ripara prima di nuove feature.

## 🧹 Messaggi di commit

[Conventional Commits](https://www.conventionalcommits.org/), verificati da commitlint (hook `commit-msg` in locale, job `commit-lint-pr-title` sul titolo della PR). Configurazione: `commitlint.config.js`.

| Regola | Valori |
|---|---|
| **tipo** (obbligatorio) | `feat` · `fix` · `docs` · `chore` · `test` · `refactor` · `perf` · `style` · `ci` |
| **scope** (facoltativo, avviso se diverso) | `g2-app` · `foundry-module` · `shared-protocol` · `shared-render` · `validation-harness` · `*` |
| maiuscole nel soggetto | libere (commit in italiano ammessi) |

Esempi:

```
feat(g2-app): arte originale pixelata nella mappa
fix(foundry-module): elezione del projector quando il GM cambia
docs(*): wiki e showcase per ADR-0017
```

## 🧹 Checklist della PR

- [ ] test nello stesso commit del cambio di comportamento; test di regressione per ogni bug (P2);
- [ ] `pnpm lint:ci && pnpm typecheck && pnpm test:coverage` verdi; per display o input anche `sim:check` ([Debug e simulatore](Debug-e-Simulatore));
- [ ] changeset aggiunto (`pnpm changeset`);
- [ ] documentazione aggiornata nello stesso commit: per cambi trasversali `Specs.md` + `README.md` + showcase insieme (INV-3); guide d'uso in `docs/` e in questa wiki (P7);
- [ ] nuove decisioni architetturali → nuovo ADR in `docs/architecture/`;
- [ ] ogni titolo `##` nei documenti inizia con un'emoji della mappa P11;
- [ ] niente segreti, percorsi locali, output di build o file temporanei (P8).

## 🧹 Modificare la wiki

1. Modifica i file in `docs/wiki/` (non dal web: la wiki di GitHub viene sovrascritta dallo specchio).
2. `node scripts/check-wiki-links.mjs docs/wiki` deve stampare `wiki links OK`.
3. Apri la PR; dopo il merge su `main` il workflow *Wiki Sync* pubblica.

## 📚 Vedi anche

- [Test e qualità](Test-e-Qualita) · [Decisioni architetturali](Decisioni-Architetturali)
