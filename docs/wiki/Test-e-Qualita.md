# Test e qualità

Qualità = invarianti (vincolanti) + Costituzione ingegneristica (P1–P11) + gate CI che le fanno rispettare in modo meccanico.

## 🛡️ Invarianti

| | Nome | In breve |
|---|---|---|
| **INV-1** | Integrità del layout | ogni layout è allineato al pixel in ogni stato, contenuto e lingua; i contenuti variabili (PF `7` vs `700`, nomi lunghi, IT vs EN) hanno un budget di larghezza deciso in build. Contratto eseguibile: le 76 fixture `sheet.*.txt` ([Renderer a pixel](Renderer-Pixel)) |
| **INV-2** | Verifica online | ogni affermazione tecnica cita una fonte canonica (hub.evenrealities.com, foundryvtt.com, github.com/foundryvtt/dnd5e, …); aggregatori e blog non valgono. Il drift si registra nel changelog di `Specs.md` |
| **INV-3** | Coerenza della documentazione | `Specs.md` + `README.md` + showcase si aggiornano **nello stesso commit** per ogni cambio trasversale |
| **INV-4** | Qualità del codice | niente codice morto, `// TODO` solo con `(#issue)` o `(ADR-NNNN)`, TSDoc su ogni API pubblica |
| **INV-5** | Determinismo dei gesti | ogni gesto produce **una sola** chiamata: `toGestureEvent` → riduttore puro della zona E |
| **INV-6** | Autorità del GM | ogni mutazione passa da `dispatchTool` su **un solo client per dispositivo alla volta — il projector eletto** (il client del giocatore se online, altrimenti il GM attivo); solo `src/write-path/` può chiamare `activity.use()` |

Testo completo: `Specs.md` §0.1 e [`docs/architecture/INVARIANTS.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/INVARIANTS.md).

## 🛡️ Costituzione ingegneristica (P1–P11)

| | Principio | Regola chiave |
|---|---|---|
| P1 | 💎 Qualità del codice | TypeScript strict, schemi Zod come unica fonte dei tipi sul filo, errori mai inghiottiti |
| P2 | 🧪 Test | ogni cambio di comportamento con i suoi test; ogni bug con un test di regressione; test deterministici |
| P3 | 👓 Coerenza UX | stesso linguaggio visivo e stessa grammatica dei gesti ovunque; stringhe IT + EN |
| P4 | ⚡ Prestazioni | budget come contratti; benchmark per i percorsi caldi |
| P5 | 🐞 Auto-debug | tutto pilotabile senza occhiali (`?demo=`, `__evf`, `sim:check`) |
| P6 | 🔬 Ricerca SDK | verifica sulla fonte canonica prima di usare un'API |
| P7 | 📚 Documentazione | codice + test + documentazione nello stesso commit; comandi copiabili e provati |
| P8 | 🧹 Igiene del repo | niente file morti, segreti, output di build o file temporanei |
| P9 | 🚀 CI/CD | ogni principio controllabile ha un gate; mai `--no-verify` |
| P10 | 🤖 Subagenti | deleghe parallele con brief autosufficienti, risultati verificati |
| P11 | 🏷️ Icone dei capitoli | ogni titolo `##` inizia con un'emoji della mappa canonica in `CLAUDE.md` |

## 🧪 Comandi

```bash
pnpm lint:ci          # biome ci . (sola lettura)
pnpm typecheck        # tsc strict su tutti i pacchetti
pnpm test             # vitest --run
pnpm test:coverage    # vitest con copertura v8
pnpm --filter @evf/validation-harness inv:all   # suite degli invarianti
```

**Copertura**: soglia **80 %** su righe, rami e funzioni (`vitest.config.ts`), una base minima, non un obiettivo. Piramide: unità → integrazione (sessione g2-app ↔ projector con round-trip di buste sigillate su un socket finto) → snapshot INV-1 → simulatore.

## 🚀 Gate della CI

`.github/workflows/ci.yml`, job **quality-gates** (push e PR su `main` e `develop`):

| # | Gate | Cosa blocca |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile --ignore-scripts` | lockfile non allineato |
| 2 | `pnpm biome ci .` | lint o formattazione |
| 3 | `pnpm typecheck` | errori di tipo |
| 4 | `pnpm test:coverage` | test rossi o copertura < 80 % |
| 5 | disciplina dei `// TODO` | `// TODO` senza `(#NN)` o `(ADR-NNNN)` |
| 6 | `pnpm vitest --run --update=false` | snapshot o fixture non aggiornati |
| 7 | `pnpm changeset:status` (solo PR, non sulla PR *Version Packages*) | PR senza changeset |
| 8 | guardia ADR-0011 | `activity.use(` fuori da `packages/foundry-module/src/write-path/` |
| 9 | confinamento socketlib (ADR-0012) | uso di socketlib fuori da `packages/foundry-module` |
| 10 | build della g2-app in `foundry-module/g2` (ADR-0012) | build che non emette `packages/foundry-module/g2/index.html` |

Job **commit-lint-pr-title** (solo PR): il titolo della PR passa da commitlint. In locale, Husky esegue Biome sui file in stage (pre-commit) e commitlint sul messaggio (commit-msg). Il workflow **Wiki Sync** valida i link della wiki con `node scripts/check-wiki-links.mjs docs/wiki` ([Release](Release)).

## 📚 Vedi anche

- [Debug e simulatore](Debug-e-Simulatore) · [Contribuire](Contribuire)
- Costituzione completa: [`CLAUDE.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/CLAUDE.md)
