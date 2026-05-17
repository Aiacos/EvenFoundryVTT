# Phase 1: Foundation — Research

**Researched:** 2026-05-11
**Domain:** Monorepo scaffold (pnpm 10 workspaces · Biome 2 · TypeScript 5.8 strict · Vitest 4 · Changesets 2 · GitHub Actions) + MADR ADR framework + INV-1 ASCII snapshot framework + INV-4 code quality gates from commit 1.
**Confidence:** **HIGH** — tutte le decisioni sono già locked in CONTEXT.md (D-1.01..D-1.16); la research si è concentrata sul *come* implementare, verificando ogni pin contro npm registry il 2026-05-11 e le API dei tool contro docs ufficiali. Drift `image-q` di pacchetto rimane LOW-MEDIUM (immutato da Phase 0).

## Summary

Phase 1 è un **scaffold pulito su greenfield**: 5 packages pnpm (`g2-app`, `bridge`, `foundry-module`, `shared-protocol`, `shared-render`) + 1 fold-in (`validation-harness` da `tests/phase-0/`) + tooling workspace-wide + 5 nuovi MADR ADR + snapshot framework wired-in. Le 16 D-1.* in CONTEXT.md fissano tutte le scelte; la research focalizza la *forma* dei file: shape di `pnpm-workspace.yaml`, `biome.jsonc` overrides, `vitest.config.ts` con `projects` (NOTA: `workspace`/`vitest.workspace.ts` è **deprecato dal Vitest 3.2** — confermato live su vitest.dev), `.changeset/config.json` con `privatePackages` per pre-1.0 no-publish, MADR 4.0 frontmatter, e l'API `expect.toMatchFileSnapshot()` di Vitest 4 (built-in, async, perfetto per fixture `.txt` character-precision).

Drift critico **confermato** rispetto a `STACK.md` + `CLAUDE.md`: TypeScript `5.8.5` **non esiste** su npm (latest 5.8 stable è `5.8.3`); pnpm `10.3.1` **non esiste** (latest-10 dist-tag è `10.33.4`). Phase 0 Plan 01 deviation è canonical — Phase 1 chiusura DEVE allineare STACK.md + CLAUDE.md (INV-3 atomic commit). Drift addizionale scoperto **oggi 2026-05-11**: pnpm `latest` (no dist-tag suffix) è **11.0.9** (major nuovo). MVP resta su `latest-10: 10.33.4` per stabilità (CLAUDE.md cita `pnpm@10`).

Biome 2 **NON ha commit-lint plugin nativo**: serve `@commitlint/cli` + `@commitlint/config-conventional` + Husky (o Lefthook) per il commit-msg hook. CI può usare `wagoid/commitlint-github-action` su PR title.

**Primary recommendation:** Implementare in 3 wave atomiche (vedi §Architecture Patterns / Pattern 5):
1. **Wave 0 (tooling foundation):** root `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json` + `biome.jsonc` + `vitest.config.ts` + `.nvmrc` + `.changeset/config.json` + corepack pin.
2. **Wave 1 (packages + fold-in):** scaffold dei 5 packages nuovi (`src/index.ts` + per-package `tsconfig.json` + `package.json` minimale) + promozione `tests/phase-0/` → `packages/validation-harness/` (rimozione del package.json/tsconfig duplicati, paths update in writers).
3. **Wave 2 (ADR + snapshot + CI + closure):** 5 ADR MADR-formatted + `shared-render/src/{ascii-grid,snapshot}.ts` + esempio fixture `status-hud-baseline.txt` + esempio test in `g2-app` + `.github/workflows/ci.yml` + `CONTRIBUTING.md` + INV-3 atomic commit (STACK.md + CLAUDE.md drift correction + CLAUDE.md §Repository state update da "Design-only" a "Phase 1+ commands").

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package Structure**
- **D-1.01 [Workspace packages]:** **5 packages + 1 fold-in promotion.**
  - `packages/g2-app/` — browser bundle (Vite 8 → Even Realities App WebView)
  - `packages/bridge/` — Node 24 service (Fastify + ws + Tool Registry)
  - `packages/foundry-module/` — Foundry module (compiled to ESM)
  - `packages/shared-protocol/` — TypeScript types + Zod schemas (single source of truth)
  - `packages/shared-render/` — ASCII snapshot fixtures + INV-1 layout integrity testing utilities
  - `packages/validation-harness/` — promoted from `tests/phase-0/` per Phase 0 D-15; Vitest 4-compatible
  - `packages/foundry-mcp/` — **NOT in Phase 1**, deferred to Phase 11 (V2 OPZIONALE)
- **D-1.02 [tests/phase-0/ fold-in]:** Promote `tests/phase-0/*.ts` to `packages/validation-harness/{src,tests}/` during Phase 1. Re-use `_shared/` utilities as `src/` lib. Convert tsx-direct scripts to Vitest test files. Original `tests/phase-0/` directory removed at end of Phase 1. Hardware execution can still target `packages/validation-harness/` after promotion — paths in evidence files just update.

**Build/Lint/Test Toolchain**
- **D-1.03 [Pinned versions]:** TypeScript `5.8.3` (NOT 5.8.5 per Phase 0 deviation), tsx `4.21.0`, Zod `4.4.3`, Vite `8.0.11`, Vitest `4.1.5`, `@vitest/coverage-v8` `4.1.5`, happy-dom `20.9.0`, `@playwright/test` `1.59.1`, Biome `2.4.15`, pnpm `10.33.4` (NOT 10.3.1 per Phase 0 deviation), Changesets `2.31.0`, tsup `8.5.1`, Node `24.x` LTS (`.nvmrc`).
  - **STACK.md drift correction needed:** `.planning/research/STACK.md` + `CLAUDE.md` still cite TypeScript@5.8.5 + pnpm@10.3.1 — must be corrected in Phase 1 closure for INV-2 alignment.
- **D-1.04 [tsconfig.base.json]:** Strict mode + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `moduleResolution: bundler`. Per-package tsconfig.json extends base with package-specific paths/outDir.
- **D-1.05 [Biome 2.4.15 config]:** Extends `recommended` rule set. Additional strict rules: `noExplicitAny` (warn), `noUnusedImports` (error), `noConsole` (warn — test allowlist via `// biome-ignore` directive). Format: 2-space indent, single quotes, trailing comma `all`, semicolons `always`.
- **D-1.06 [Vitest coverage thresholds]:** v8 provider. Coverage gates: **≥80% lines/branches/functions on core**, **≥90% on boundary**. Per-package config via workspace mode.

**ADR Framework**
- **D-1.07 [Phase 1 ADRs to land]:** 5 placeholders as ACCEPTED documents:
  - `docs/architecture/0001-layered-ui-model.md` — z=0/1/2 layer model, single capture container
  - `docs/architecture/0002-protocol-versioning.md` — WS envelope `{proto, seq, ts, type, …}`, semver protocol, idempotency keys, replay buffer 60s LRU
  - `docs/architecture/0003-tool-registry-pattern.md` — shared MVP gestures + V2 MCP, Zod-validated inputs, `/v1/tools` discovery
  - `docs/architecture/0004-voice-via-mcp-not-internal.md` — V2 voice = `foundry-mcp` server (NOT internal LLM)
  - `docs/architecture/0008-code-quality-configuration.md` — Biome rules, TS strict flags, CI gate definitions, `// TODO` discipline
  - **Already exist (Phase 0):** ADR-0005, ADR-0006.
  - **V2 stretch:** ADR-0007 (RTL languages) — NOT in Phase 1.
- **D-1.08 [ADR format]:** **MADR** (Markdown Architecture Decision Records). Frontmatter: `status`, `date`, `deciders`, `consulted`, `informed`. Sections: Context, Decision, Consequences, Pros & Cons of Options, More Information.

**CI Gates + Snapshot Framework**
- **D-1.09 [CI provider]:** **GitHub Actions** — single workflow `.github/workflows/ci.yml`, single-Node-24 setup.
- **D-1.10 [CI quality gates]:** Fail build on: frozen-lockfile install · `biome ci .` warn/err · `tsc --noEmit` per package · Vitest coverage <threshold · `// TODO` without `(#\d+)|(ADR-\d+)` · snapshot drift with `--update=never` · changeset status when PR changes packages.
- **D-1.11 [Snapshot framework]:** `shared-render` owns the infrastructure:
  - `src/ascii-grid.ts` — character-precision grid model (width/height/char[][]) per INV-1 §7.14.4 ck 11-15
  - `src/fixtures/` — ASCII fixture files plain `.txt` (LF, no BOM, no trailing whitespace)
  - `src/snapshot.ts` — Vitest snapshot serializer with column-misalignment reporting
  - Consumed by `packages/g2-app/src/**/*.test.ts` via `import { matchAsciiFixture } from '@evf/shared-render'`

**Versioning + Change Management**
- **D-1.12 [Changesets policy]:** **Independent per-package semver** (NOT fixed/lockstep). Initial `0.1.0-alpha`. PR workflow: developer adds `.changeset/{description}.md`. `pnpm changeset publish` NOT used pre-1.0.
- **D-1.13 [Branch strategy]:** **Trunk-based development** per Specs §11.5.6. Feature branches <24h. No long-lived branches.

**Repository Operations**
- **D-1.14 [Conventional commits]:** Format `<type>(<scope>): <subject>` — type ∈ {feat, fix, docs, chore, test, refactor, perf, style, ci}, scope ∈ {package-name | NN-NN | * for cross-cutting}. Enforce via Biome 2 commit lint plugin (or Husky pre-commit hook).
- **D-1.15 [Node version pinning]:** `.nvmrc` = `24`. Docker base: `node:24-alpine`.
- **D-1.16 [Snapshot framework wire-up demonstration]:** Phase 1 includes ONE example INV-1 snapshot test in `packages/g2-app/src/__tests__/example-status-hud.test.ts` referencing `packages/shared-render/src/fixtures/status-hud-baseline.txt` to **prove end-to-end** before Phase 4a wires real cases. Throwaway — superseded by Phase 4a.

### Claude's Discretion

All decisions auto-selected from "recommended" per `--auto` mode. Implementation flexibility remains in:
- Exact Biome rule customization beyond `recommended` + the 4 strict rules above
- Per-package vitest.config.ts setup details (env per package: `happy-dom` for g2-app, `node` for bridge/foundry-module/validation-harness)
- ADR-0001..0004 + 0008 body content depth
- GitHub Actions workflow caching strategy
- Snapshot serializer implementation language (pure TS vs leveraging `expect.toMatchFileSnapshot`)

### Deferred Ideas (OUT OF SCOPE)

None — Phase 1 scope is tightly defined by ROADMAP success criteria + CLAUDE.md Technology Stack.

Future-tracked informational items (NOT Phase 1):
- ADR-0007 (RTL languages) — V2 stretch
- ADR template format refinement — MADR chosen, may evolve
- Turbo remote cache or other monorepo accelerators — pnpm 10 caching sufficient for MVP

</user_constraints>

---

<phase_requirements>
## Phase Requirements

Phase 1 è **strutturale** — nessun REQ-ID di v1 atterra direttamente qui (REQUIREMENTS.md tabella Traceability conferma "Phase 1: 0 REQ-IDs"). Phase 1 abilita downstream REQ via infrastruttura.

| ID | Descrizione | Research Support |
|----|-------------|------------------|
| — (structural) | INV-4 enforced from commit 1: TS strict, Biome lint, Vitest coverage, // TODO discipline, JSDoc/TSDoc on public APIs | §Standard Stack + §Common Pitfalls (pitfall TS strict combinatorial) + §Validation Architecture + CI gates in §Code Examples |
| — (structural) | INV-1 snapshot framework wired for Phase 4a consumption (DISP-03, I18N-04 downstream) | §Code Examples / Snapshot framework — ASCII grid model + `expect.toMatchFileSnapshot()` Vitest 4 built-in API |
| — (structural) | Foundation for Phase 2+ FOUN-01, CONN-01..05 (require shared-protocol package + WS envelope ADR-0002) | §Standard Stack (Zod for shared-protocol) + §Architecture Patterns Pattern 2 (Tool Registry shared MVP/V2) |
| — (structural) | Foundation for Phase 3 FOUN-02 (Bridge skeleton) | §Standard Stack (Fastify 5 + ws + Zod) + ADR-0002 envelope |
| — (structural) | Foundation for Phase 4a MAP-01..04 (raster libs already in STACK.md, consumed by g2-app) | §Standard Stack g2-app row + ADR-0006 (Phase 0 output, untouched in Phase 1) |
| — (structural) | INV-3 doc coherence: STACK.md + CLAUDE.md drift correction (TS 5.8.5→5.8.3, pnpm 10.3.1→10.33.4) atomic in Phase 1 closure | §Common Pitfalls / Pitfall 7 — Version drift discovery + §Open Questions |

**Note:** REQ-ID `MIDIQ-01` è già code-complete in Phase 0 Plan 02 ma evidence pending Phase 0 Plan 04 chiusura — NON è un Phase 1 ID, ma `validation-harness` fold-in (D-1.02) preserva il probe code.

</phase_requirements>

---

## Standard Stack

> Tutte le versioni verificate live contro `npm view <pkg> dist-tags` il **2026-05-11**. Pin matrix è la stessa di CLAUDE.md §Technology Stack con le 2 drift correction Phase 0 applicate.

### Core (workspace root)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **pnpm** | **10.33.4** | Package manager + workspaces | `latest-10` dist-tag verificato 2026-05-11. NOTA: `latest` overall è ora `11.0.9` (major nuovo). MVP resta su 10 per stabilità (CLAUDE.md cita `pnpm@10`). Pin via Corepack (`"packageManager": "pnpm@10.33.4"` in root `package.json`) per build riproducibili in Docker. |
| **TypeScript** | **5.8.3** | Type-safe authoring across all packages | Latest 5.8 stable. **5.8.5 non esiste** su npm (Phase 0 Plan 01 deviation, confermato oggi). 6.0.3 è `latest` ma molto recente — Phase 1 stay su 5.8.x per ecosystem catch-up (vedi §State of the Art). |
| **Biome** | **2.4.15** | Lint + format (replaces ESLint + Prettier) | Single binary, ~10× faster, TS-aware. CLI: `biome ci` (read-only) per CI, `biome check --write` per dev. |
| **Vitest** | **4.1.5** | Unit + integration test runner | Native ESM, TS first-class, v8 coverage provider. `expect.toMatchFileSnapshot()` API built-in (chiave per snapshot framework). |
| **`@vitest/coverage-v8`** | **4.1.5** | Coverage provider | Sempre co-bump con Vitest (stessa minor). v8 faster vs istanbul. |
| **happy-dom** | **20.9.0** | DOM env for g2-app tests | Faster than jsdom for simple WebView shape. Per-package env via `vitest.config.ts` projects[]. |
| **`@playwright/test`** | **1.59.1** | E2E (Phase 4+ only) | Phase 1 installa solo come devDep workspace; setup E2E reale è Phase 4. |
| **`@changesets/cli`** | **2.31.0** | Versioning + changelog | Independent per-package semver (D-1.12). Pre-1.0 no-publish via `privatePackages` config + `"private": true` in pkg.json. |
| **`tsx`** | **4.21.0** | TS execution per dev scripts | Replaces `ts-node`. Già usato in `tests/phase-0/`. |
| **`tsup`** | **8.5.1** | Bundle bridge + (V2 future) foundry-mcp | Bridge Phase 3, Phase 1 installa solo come devDep nei rispettivi package. |
| **`@types/node`** | **25.6.2** | Node type defs (matches Node 24 runtime) | Workspace root devDep, shared by bridge + validation-harness + foundry-module. |

### Supporting (per-package devDeps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vite** | **8.0.11** | Dev server + bundler for `g2-app` | Phase 4a inizia a usarlo davvero. Phase 1 installa il devDep + minimal `vite.config.ts`. |
| **Zod** | **4.4.3** | Runtime schema validation | `shared-protocol` runtime dep; importato anche da `validation-harness` (già in Phase 0). |
| **`csv-stringify`** | **6.5.2** | CSV evidence output (validation-harness) | Già in `tests/phase-0/package.json`, segue il fold-in. |
| **`upng-js`** | **2.1.0** + ambient `.d.ts` | Image format probe (validation-harness 10-0-2) | Già in `tests/phase-0/`. `upng-js.d.ts` resta come ambient module declaration nel package post-fold. |
| **`commitlint`** + `@commitlint/config-conventional` | latest | Conventional Commits enforcement | Biome 2 **NON ha commit-lint nativo** (verificato live). Serve `@commitlint/cli` + Husky `commit-msg` hook. CI alternativa: `wagoid/commitlint-github-action` su PR title. |
| **`husky`** | latest | Git hooks manager | Pre-commit (`pnpm biome check --staged-only` + commitlint commit-msg). Alternativa: Lefthook (Go binary, no post-install npm). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pnpm 10.33.4 | pnpm 11.0.9 (latest overall) | Major nuovo, ecosistema (corepack, action-setup) ancora warming. MVP stay su 10. Re-evaluate Phase 13. |
| TypeScript 5.8.3 | TypeScript 6.0.3 (latest) | 6.0 nuovissimo. Vitest/Biome/tsup ancora non testati contro 6.x in produzione. Conservative pin a 5.8.3; re-evaluate al boundary Phase 4 entry. |
| `vitest.config.ts` con `test.projects` | `vitest.workspace.ts` | **DEPRECATO dal Vitest 3.2** (verificato live su vitest.dev/guide/workspace 2026-05-11). Usare solo `projects: ['packages/*']` field nel `vitest.config.ts` root. |
| Husky | Lefthook | Lefthook (Go) è ~3× più veloce, no `prepare` script post-install. MVP usa Husky per maturità ecosystem + esempi più diffusi. Lefthook è acceptable swap. |
| `commitlint` | Biome 2 commit-lint plugin | **NON ESISTE** (verificato Biome docs + 2026 search). D-1.14 cita "Biome 2 commit lint plugin OR Husky" come fallback; in pratica solo Husky+commitlint disponibile. |
| Husky + commitlint local | `wagoid/commitlint-github-action` on PR title | CI-only è più semplice ma manca feedback locale. **Raccomandazione:** ENTRAMBI — Husky locale + CI action su PR title (double-gate INV-4). |
| MADR full template (with explanations) | MADR minimal | Per ADR-0001..0004 (architettura nuova) → full template. ADR-0008 (config concretization) può essere minimal. |
| MADR pure markdown | log4brains tooling | log4brains compatibility con MADR 4.0 unclear; pure markdown evita lock-in. ADRs sono read-only post-acceptance comunque. |
| GitHub Actions cache strategy: `pnpm/action-setup` built-in `cache: true` | Custom `actions/cache@v4` keyed on `hashFiles('pnpm-lock.yaml')` | Built-in cache è sufficiente per MVP (single-Node-24). Custom solo se Turbo remote cache entra (Phase 13). |

**Installation (workspace root, Wave 0):**
```bash
# Corepack pin (reproducible across machines + Docker)
corepack enable
corepack prepare pnpm@10.33.4 --activate

# Workspace devDeps (pnpm add -Dw = devDep at workspace root)
pnpm add -Dw \
  typescript@5.8.3 \
  @biomejs/biome@2.4.15 \
  vitest@4.1.5 \
  @vitest/coverage-v8@4.1.5 \
  @changesets/cli@2.31.0 \
  tsx@4.21.0 \
  @types/node@25.6.2 \
  happy-dom@20.9.0 \
  @playwright/test@1.59.1 \
  husky@latest \
  @commitlint/cli@latest \
  @commitlint/config-conventional@latest
```

**Version verification (run before committing root `package.json`):**
```bash
for pkg in typescript @biomejs/biome vitest @vitest/coverage-v8 @changesets/cli tsx @types/node happy-dom @playwright/test pnpm; do
  echo "$pkg: $(npm view "$pkg" version) (published $(npm view "$pkg" time.modified))"
done
```
Documentare la verifica nel commit message della Wave 0 atomic commit per INV-2 traceability (analogous a Phase 0 Plan 01 SUMMARY § "Pinned Versions Used").

---

## Architecture Patterns

### Recommended Project Structure

```
evenfoundryvtt/                       # Wave 0 root
├── package.json                       # private:true, "packageManager":"pnpm@10.33.4", workspace devDeps
├── pnpm-workspace.yaml                # packages: ['packages/*']
├── tsconfig.base.json                 # strict + 5 flags + bundler resolution
├── biome.jsonc                        # extends recommended + 4 strict rules + overrides[]
├── vitest.config.ts                   # test.projects: ['packages/*'] (NOT vitest.workspace.ts)
├── commitlint.config.js               # extends @commitlint/config-conventional + EVF scope rules
├── .changeset/
│   ├── config.json                    # privatePackages: {version:true, tag:false}
│   └── README.md
├── .nvmrc                             # "24"
├── .gitignore                         # node_modules, dist, coverage, .turbo, *.local.json
├── .husky/
│   ├── pre-commit                     # pnpm biome check --staged
│   └── commit-msg                     # pnpm commitlint --edit "$1"
├── .github/
│   └── workflows/
│       └── ci.yml                     # quality gates (Wave 2)
├── CONTRIBUTING.md                    # Wave 2 — Conventional Commits + Changesets workflow
├── CLAUDE.md                          # updated Wave 2 — §Repo state Phase 1+ commands
├── README.md                          # untouched in Phase 1 (Specs.md projection)
├── Specs.md                           # canonical SoT (untouched in Phase 1 unless INV-3 cycle)
├── docs/
│   ├── architecture/                  # ADRs
│   │   ├── 0001-layered-ui-model.md           # NEW Wave 2
│   │   ├── 0002-protocol-versioning.md        # NEW Wave 2
│   │   ├── 0003-tool-registry-pattern.md      # NEW Wave 2
│   │   ├── 0004-voice-via-mcp-not-internal.md # NEW Wave 2
│   │   ├── 0005-phase0-go-no-go.md            # exists (Phase 0 stub)
│   │   ├── 0006-raster-pipeline-library-stack.md # exists (Phase 0 stub)
│   │   ├── 0008-code-quality-configuration.md # NEW Wave 2
│   │   └── README.md                          # index — cita 0001-0008 + future
│   ├── showcase/                      # untouched
│   └── perf/phase-0/                  # untouched (paths still valid post fold-in)
├── packages/
│   ├── g2-app/
│   │   ├── package.json               # name:"@evf/g2-app", private:true, "version":"0.1.0-alpha"
│   │   ├── tsconfig.json              # extends "../../tsconfig.base.json", outDir:"dist"
│   │   ├── vite.config.ts             # minimal scaffold — Phase 4a fills real config
│   │   ├── src/
│   │   │   ├── index.ts               # placeholder export
│   │   │   └── __tests__/
│   │   │       └── example-status-hud.test.ts  # D-1.16 snapshot wire-up demo
│   │   └── README.md                  # "Phase 4a placeholder"
│   ├── bridge/
│   │   ├── package.json               # name:"@evf/bridge", private:true
│   │   ├── tsconfig.json              # extends base + lib:["ES2023"]
│   │   ├── src/
│   │   │   └── index.ts               # placeholder
│   │   └── README.md                  # "Phase 3 placeholder"
│   ├── foundry-module/
│   │   ├── package.json               # name:"@evf/foundry-module", private:true
│   │   ├── module.json                # Foundry manifest (Phase 2 fills compatibility/relationships)
│   │   ├── tsconfig.json              # extends base
│   │   ├── src/
│   │   │   └── index.ts               # placeholder
│   │   └── README.md                  # "Phase 2 placeholder"
│   ├── shared-protocol/
│   │   ├── package.json               # name:"@evf/shared-protocol", "main":"./src/index.ts", types→source
│   │   ├── tsconfig.json              # extends base
│   │   ├── src/
│   │   │   ├── index.ts               # re-export all
│   │   │   └── even-hub.d.ts          # ambient declarations (Phase 1 minimal — Phase 4a expands)
│   │   └── README.md
│   ├── shared-render/
│   │   ├── package.json               # name:"@evf/shared-render", workspace:* consumers
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ascii-grid.ts          # D-1.11 character-precision grid model
│   │   │   ├── snapshot.ts            # D-1.11 matchAsciiFixture matcher
│   │   │   └── fixtures/
│   │   │       └── status-hud-baseline.txt    # D-1.16 example fixture
│   │   ├── tests/
│   │   │   └── ascii-grid.test.ts     # smoke test grid mutation API
│   │   └── README.md                  # explains INV-1 ck 11-15 enforcement
│   └── validation-harness/            # FOLDED FROM tests/phase-0/ (D-1.02)
│       ├── package.json               # name:"@evf/validation-harness", private:true
│       ├── tsconfig.json              # extends base (NOT standalone like Phase 0)
│       ├── upng-js.d.ts               # carried forward
│       ├── src/
│       │   └── lib/
│       │       ├── schemas.ts         # was _shared/schemas.ts
│       │       ├── output.ts          # was _shared/output.ts (paths: still docs/perf/phase-0/)
│       │       ├── stats.ts           # was _shared/stats.ts
│       │       ├── branch-decision.ts # was _shared/branch-decision.ts
│       │       └── hub.ts             # was _shared/hub.ts
│       ├── tests/                     # Vitest-runnable now
│       │   ├── 10-0-1-r1-timing.test.ts            # was 10-0-1-r1-timing.ts (wrapped in describe/it)
│       │   ├── 10-0-2-image-format.test.ts
│       │   ├── 10-0-3-ble-multi-env.test.ts
│       │   ├── 10-0-7-dle-sustained.test.ts
│       │   ├── 10-0-8-queue-depth.test.ts
│       │   ├── 10-0-9-palette-calibration.test.ts
│       │   ├── midiqol-config-probe.test.ts
│       │   └── run-all.ts             # kept as tsx script (or rewired as Vitest --filter)
│       ├── foundry-modules/
│       │   └── midiqol-probe-module/  # stays as-is (Foundry-side artifact, not Vitest-runnable)
│       └── README.md                  # updated: "Run via `pnpm test --filter @evf/validation-harness`"
└── tests/
    └── phase-0/                       # DELETED Wave 1 (after fold-in verified)
```

### Pattern 1: Workspace Boundary by Runtime Target

**What:** Ogni package dichiara il runtime target nel proprio `package.json` `engines` + `vitest.config.ts` `environment`. Tre target distinti:
- **Browser/WebView:** `g2-app` → `environment: 'happy-dom'`, build target ES2022 (Safari WKWebView baseline).
- **Node 24 LTS:** `bridge`, `foundry-mcp` (futuro), `validation-harness` → `environment: 'node'`.
- **Foundry-ESM:** `foundry-module` → `environment: 'happy-dom'` per unit test che esercitano API Foundry mockate (Phase 2 reale), `target: ES2022` per emit ESM consumable da Foundry runtime.

**When to use:** Workspace polyglot per target diversi sotto un solo tooling. Standard pattern (Vite + Vitest convergono su `test.projects` array, vedi §State of the Art).

**Example:** vedi `vitest.config.ts` in §Code Examples.

### Pattern 2: Single Source of Truth via `shared-protocol`

**What:** Zod schemas vivono SOLO in `packages/shared-protocol/src/`. Tutti i package consumer importano `from '@evf/shared-protocol'` via `workspace:*` protocol. Static types + runtime validators co-defined.

**When to use:** ADR-0002 (WS envelope) e ADR-0003 (Tool Registry) richiedono questo. Anche `validation-harness` ne beneficierà dopo fold-in (oggi ha schemi locali in `_shared/schemas.ts` — Phase 1 NON deve duplicarli in shared-protocol; sono Phase-0-specific evidence schemas, restano in validation-harness lib).

**Example:**
```typescript
// packages/shared-protocol/src/envelope.ts
import { z } from 'zod';
export const DeltaFrame = z.object({
  proto: z.literal('1.0'),
  seq: z.number().int().nonnegative(),
  ts: z.number().int().positive(),
  type: z.enum(['delta', 'event', 'heartbeat', 'snapshot-needed']),
  path: z.string().optional(),
  value: z.unknown().optional(),
  prev_seq: z.number().int().nonnegative().optional(),
});
export type DeltaFrame = z.infer<typeof DeltaFrame>;

// packages/bridge/package.json (Phase 3 fills consumer)
{ "dependencies": { "@evf/shared-protocol": "workspace:*" } }
```

### Pattern 3: ASCII Snapshot via Built-In `toMatchFileSnapshot` + Custom Matcher

**What:** Vitest 4 fornisce **`expect(value).toMatchFileSnapshot(filepath)`** built-in (verificato live su vitest.dev/api/expect 2026-05-11). Per INV-1 ck 11-15 wrappare con custom matcher `matchAsciiFixture(grid, fixturePath)` che:
1. Serializza grid in stringa con LF + no trailing whitespace.
2. Confronta con file `.txt` sotto `packages/shared-render/src/fixtures/`.
3. Su mismatch, riporta **diff char-precision + colonna del primo disallineamento** (essenziale per INV-1 ck 11 — corner alignment).

**When to use:** Tutti i panel snapshot test (Phase 4a inizia consumer reale). Phase 1 produce solo l'esempio di wire-up (D-1.16).

**Example:** vedi §Code Examples / Snapshot framework.

### Pattern 4: ADR-Per-Architectural-Decision con MADR 4.0

**What:** Ogni decisione strutturale è uno `docs/architecture/NNNN-kebab-title.md` con MADR frontmatter + sezioni canoniche. ADRs sono **immutabili post-acceptance** — modifiche via "superseded by NNNN" (Specs §5.6.10 prescription + MADR convention).

**When to use:** D-1.07 lista i 5 ADR Phase 1. Format D-1.08 = MADR. Cross-refs interni a `[ADR-NNNN](./NNNN-title.md)` style; ROADMAP/PHASE entry-gate citations sempre includono ADR number per traceability (pattern Phase 0 D-16).

**Example:** vedi §Code Examples / MADR template.

### Pattern 5: 3-Wave Atomic Plan Structure (informational, planner-facing)

**What:** Suggested plan decomposition per minimizzare incoerenze intermedie:
- **Wave 0 — Tooling foundation (atomic):** root `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json` + `biome.jsonc` + `vitest.config.ts` + `.nvmrc` + `.changeset/config.json` + `commitlint.config.js` + Husky `.husky/{pre-commit,commit-msg}` + `.gitignore`. Verification: `pnpm install` → green; `pnpm biome ci .` → green su file vuoti; `tsc --noEmit -p tsconfig.base.json` → green.
- **Wave 1 — Packages + fold-in (atomic per package, parallel possible):** 5 new packages scaffolded + validation-harness folded. Verification: `pnpm install` → all workspaces linked; `pnpm tsc --noEmit -r` → green; `tests/phase-0/` directory removed; `pnpm test --filter @evf/validation-harness --run` → smoke (same exit codes 0/2 Pattern 3 di Phase 0).
- **Wave 2 — ADR + snapshot + CI + INV-3 closure (atomic):** 5 ADR MADR docs + `shared-render/{ascii-grid,snapshot}.ts` + example fixture + example test + `.github/workflows/ci.yml` + `CONTRIBUTING.md` + STACK.md drift correction + CLAUDE.md §Repository state update. Verification: full CI dry-run locally (`pnpm biome ci . && pnpm tsc --noEmit -r && pnpm test --coverage --run`); example snapshot test passes; INV-3 doc-coherence check (STACK.md + CLAUDE.md aligned con phase 0 reality).

**When to use:** Discrezione planner — può scegliere wave parallelism, ma il **3-wave order è raccomandato** perché:
- Wave 1 dipende da Wave 0 (per-package tsconfig extends `../../tsconfig.base.json`)
- Wave 2 dipende da Wave 1 (snapshot test sample importa da `@evf/shared-render` workspace package)
- INV-3 closure DEVE essere atomic con il resto della Wave 2 (CLAUDE.md cita "When code starts landing (Phase 1+), update this file" — quel momento è Wave 2 chiusura).

### Anti-Patterns to Avoid

- **Mixed import-extension policy in monorepo TS source:** Con `moduleResolution: bundler` puoi scrivere `./foo`, `./foo.ts`, o `./foo.js`. Raccomandazione: **stick to `./foo.js`** (anche se file è `.ts`) per matchare la sintassi che bundler vede a runtime. Se mixi, Biome `useImportExtensions` lint rule è in conflitto e il codebase si fa confuso. Lock decision in ADR-0008.
- **`vitest.workspace.ts`:** Deprecato Vitest 3.2+. Usare solo `test.projects` in `vitest.config.ts` root. Riferimenti online vecchi (pre-Q4 2025) ancora citano il workspace file — ignorare.
- **`shamefully-hoist=true` per "comodità":** distrugge l'invariante pnpm e nasconde dipendenze non dichiarate. Mai impostare. Se un tool si lamenta, è il tool che ha una dichiarazione `dependencies` rotta da fixare.
- **`access: public` in .changeset/config.json + private packages:** D-1.12 dice no-publish pre-1.0. Setting `access: restricted` + `"private": true` in ogni `packages/*/package.json` + `privatePackages: { "version": true, "tag": false }` evita publish accidentale.
- **TODO discipline grep eseguito sui file generated/dist:** Il pattern deve escludere `dist/`, `coverage/`, `node_modules/`, `.changeset/`. Usare `--include` whitelist invece di `--exclude` blacklist.
- **Biome `--write` in CI:** USA `biome ci .` (read-only). `biome check --write` è dev-only. CI deve fallire, non auto-fixare.
- **TS `composite: true` + project refs in MVP monorepo:** Aggiunge complessità (build order) per benefit (incremental compile) marginale su 5 packages piccoli. Pattern Specs.md §5.6.10 non lo prescrive. Defer Phase 13.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File-based snapshot comparison | Custom `fs.readFile` + string diff helper | `expect(value).toMatchFileSnapshot(path)` Vitest 4 built-in | Native API, async-aware, integrated with `--update` flag, no edge cases to maintain. |
| Conventional Commits parsing | Regex `^(feat|fix|...)\(([^)]+)\): (.+)$` | `@commitlint/cli` + `@commitlint/config-conventional` | Maturo (used da Angular/Vue/Nuxt), supporta breaking-change footer, `BREAKING CHANGE:`, scope hierarchy, multi-line bodies. |
| Git hooks bash | Hand-write `.git/hooks/pre-commit` | `husky` (or `lefthook`) | Husky installa hook in `.husky/` versionato, gestito dal package manager. Hand-rolled hooks non sopravvivono a `git clone`. |
| ADR template | Inventare struttura | **MADR 4.0** templates da github.com/adr/madr | 4 varianti (full/minimal/bare/bare-minimal), frontmatter standardizzato, tooling community (markdownlint). |
| ASCII grid char-precision diff | Custom `String.prototype` slicing | `shared-render/ascii-grid.ts` model (planner builds) + `toMatchFileSnapshot` | Grid model serializza una sola volta; serializer è canonical. Hand-rolled diff perde "diff colonna X riga Y" reporting. |
| pnpm workspace deps version sync | Manual `find packages -name package.json -exec ...` | `pnpm changeset version` | Changesets calcola bumps + scrive CHANGELOG.md per package automaticamente. |
| GitHub Actions pnpm cache | Custom `actions/cache@v4` + manual pnpm store path | `pnpm/action-setup@v4` with `cache: true` | Built-in cache strategy verificata live su github.com/pnpm/action-setup. Custom solo se Turbo remote cache. |
| TODO discipline grep regex | Inventare lookahead | `grep -RnE '// TODO(?!\([#A-Z])' --include='*.ts'` | Standard pattern, copia da Phase 0 (`grep -RE 'TODO\b(?!\()'`). Test in CI shell PRIMA del merge — Bash extended regex vs GNU grep behavior. |
| TS strict flag interaction discovery | Trial-and-error per package | Lift `tests/phase-0/tsconfig.json` verbatim a `tsconfig.base.json` | Phase 0 ha **già provato** strict + 5 flags green su 14 file. Niente da scoprire. |

**Key insight:** **Phase 1 è 95% "lift and document"** — l'unico contenuto net-new sono i 5 ADR (testo + decisione process) e il snapshot serializer (~50 LOC TypeScript). Tutto il resto è scaffold di tool dove la "scelta" è già fatta in CONTEXT.md/STACK.md e l'implementazione è la shape canonica dei file di config.

---

## Common Pitfalls

### Pitfall 1: TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` combo
**What goes wrong:** Array/Map/Record access ritorna `T | undefined`; ogni `for (let i = 0; i < arr.length; i++) arr[i].foo` diventa errore di compilazione. `exactOptionalPropertyTypes` rifiuta `obj.maybe = undefined` quando dichiarato `maybe?: string` — devi usare `delete obj.maybe`.
**Why it happens:** I due flag sono ortogonali ma additivi nel rigore. Pattern legacy `arr[i]!` (non-null assert) maschera il bug invece di gestirlo (Phase 0 Plan 03 Deviation #4 — `sorted[0]!` rifattorizzato a guard esplicita).
**How to avoid:**
- Quando inizializzi un nuovo file, scrivi prima il guard (`const first = arr[0]; if (first === undefined) return ...;`) poi usa `first` type-narrowed.
- Per `Record<K, V>` con accesso pattern ripetuto, considera Map con `.get()` che è semanticamente `V | undefined` always.
- Per oggetti optional, decidi UNA convention: o `delete obj.x` o `obj.x = undefined` (con type `x?: T | undefined` esplicito). Lock in ADR-0008.
**Warning signs:** `// @ts-ignore` o `as` cast in PR diff. Lint regola `noNonNullAssertion` (Biome `correctness/noNonNullAssertion` warn) cattura.

### Pitfall 2: `moduleResolution: bundler` + Node CJS interop in `bridge`
**What goes wrong:** Bundler resolution funziona per Vite (g2-app), tsup (bridge), e Vitest. Ma se `bridge` consuma una CJS-only lib (raro in 2026 ma esiste — vedi `prom-client` storica), serve `esModuleInterop: true` e attenzione a default import vs namespace import.
**Why it happens:** TS `bundler` non emette codice — assume che il bundler risolverà. Quando runtime è Node ESM puro (no bundler) le ambiguità default vs namespace esplodono a runtime.
**How to avoid:**
- `bridge` runtime è ESM via `tsup` bundle (Phase 3). Phase 1 imposta `tsconfig.json` con `module: "esnext"` + `moduleResolution: "bundler"`, ma documenta in ADR-0008 che `bridge` build path è `tsup → ESM single-file`.
- Aggiungi `"type": "module"` in ogni `packages/*/package.json` da subito — evita drift verso CJS accidentale.
- Se Phase 3 trova edge case (e.g., un dep CJS-only), aggiunge `--cjs-interop` flag a tsup; documenta in ADR-0008 superseded section.
**Warning signs:** `Cannot use import statement outside a module` runtime error → manca `"type": "module"`. `default is not a function` → CJS interop bug.

### Pitfall 3: Vitest workspace `projects[]` env inheritance gotcha
**What goes wrong:** `projects: ['packages/*']` carica ogni `packages/*/vitest.config.ts` se esiste, altrimenti applica root config. MA **"None of the configuration options are inherited from the root-level config file" unless you explicitly set `extends: true`** (verbatim vitest.dev). Risultato: per-package `vitest.config.ts` SENZA `extends: true` perde coverage + reporters settings root.
**Why it happens:** Vitest 4 design: ogni project è isolato di default, root config solo per "global" features (coverage + reporters live solo a root-level).
**How to avoid:**
- Root `vitest.config.ts` definisce `test.projects: ['packages/*']` + coverage settings.
- Per-package `vitest.config.ts` (quando serve env override come `happy-dom`) usa `defineProject()` da `vitest/config` + `extends: true` esplicito.
- Coverage threshold (`80% core / 90% boundary`) vive **solo nel root config**; non duplicare per-package.
**Warning signs:** Coverage report missing per un package, o reporter output inconsistente — il package ha override locale senza `extends: true`.

### Pitfall 4: Husky `prepare` script + CI install
**What goes wrong:** Husky 9+ usa `prepare: "husky"` in `package.json`. In CI `pnpm install --frozen-lockfile` esegue `prepare` script, che fallisce se `.git/` manca (es. Docker shallow clone, GitHub Actions actions/checkout default `fetch-depth: 1` è OK ma submodule scenarios no).
**Why it happens:** `prepare` deve installare git hooks; se non c'è git dir, husky errora.
**How to avoid:**
- In CI usa `pnpm install --frozen-lockfile --ignore-scripts` + setup-node action prima.
- Oppure aggiungi check in `prepare` script: `prepare: "husky || true"` (silenzioso in CI).
- Alternativa moderna: `lefthook` (no `prepare` script — installato come Go binary, gestito da `lefthook install` esplicito).
**Warning signs:** CI fail con `husky: command not found` → manca `--ignore-scripts` o `prepare` non gracefully skips.

### Pitfall 5: Changesets `privatePackages` config drift pre-1.0
**What goes wrong:** D-1.12 dice "no publish pre-1.0", ma se ogni `packages/*/package.json` non ha `"private": true`, un developer disattento può eseguire `pnpm changeset publish` e tentare un push npm — failed con `403` su scope `@evf` non registrato, MA il `pnpm changeset version` ha già bumpato i CHANGELOG.md.
**Why it happens:** Changesets default `access: restricted` blocca publish, ma `version` bump avviene comunque. Se hai dimenticato `"private": true` su un package, il bump è "valido".
**How to avoid:**
- Wave 1 task: ogni `packages/*/package.json` includa `"private": true` + `"version": "0.1.0-alpha"`.
- `.changeset/config.json`: `privatePackages: { "version": true, "tag": false }` per consentire CHANGELOG.md per private packages senza publish.
- CI gate: `pnpm changeset status --since=main` falisce se PR cambia un package senza changeset.md (D-1.10 #7).
**Warning signs:** Un package `version` cambia ma CHANGELOG.md è vuoto, o `pnpm changeset publish` esce con codice 0 senza npm push (silent success).

### Pitfall 6: ASCII fixture line-ending + trailing whitespace
**What goes wrong:** INV-1 ck 11 (corner alignment) richiede diff = 0. Una fixture committed da editor Windows-default produce CRLF; il test runtime Linux produce LF; diff esplode su tutti i righi. Trailing whitespace in fixture (tab finale) match-mismatch su test che genera output senza trailing.
**Why it happens:** Git auto-conversion (`core.autocrlf`) può silenziosamente convertire fixture in CRLF su Windows. Editor "show whitespace off" nasconde trailing space.
**How to avoid:**
- `.gitattributes` esplicito: `packages/shared-render/src/fixtures/*.txt text eol=lf`.
- Snapshot serializer normalizza ad LF + strip trailing whitespace **prima** di confronto.
- Editor config: `.editorconfig` root con `end_of_line = lf`, `trim_trailing_whitespace = true`, `charset = utf-8` (no BOM).
- Wave 0 include `.editorconfig` + `.gitattributes`.
**Warning signs:** CI verde su Linux, fail locale su Windows dev machine. Diff output con `\r` literal visibile.

### Pitfall 7: STACK.md / CLAUDE.md version drift (recurring)
**What goes wrong:** Phase 0 ha scoperto TS 5.8.5 + pnpm 10.3.1 non esistono. Phase 1 deve corregere — ma se la correzione non è atomica con un cross-validation round (INV-2), un terzo bump in Phase 4+ rinasce con drift fresh.
**Why it happens:** Training data + AI "memoria" cita versioni che esistevano in qualche snapshot. Senza verifica live, claim non verificato si propaga.
**How to avoid:**
- Phase 1 closure (Wave 2) include esplicito "verify-and-pin" task: `npm view <pkg> version` per ogni pin in STACK.md, commit con line "Re-verified ✓ 2026-05-11" o "Drift: foo X→Y".
- CLAUDE.md §Pre-bump checklist step 6 ratifica questo come gate manuale → CI gate Phase 2+ via custom workflow `version-drift-check.yml` (out-of-scope Phase 1 ma proposta).
**Warning signs:** Verifica live mostra `404` o `not found` per una versione citata. Pattern Phase 0 (TS 5.8.5, pnpm 10.3.1) si ripete.

### Pitfall 8: Validation harness path drift after fold-in
**What goes wrong:** `tests/phase-0/_shared/output.ts` scrive a path relativo `docs/perf/phase-0/{file}` assumendo `cwd = repo-root`. Dopo fold-in, se Vitest esegue da `packages/validation-harness/` come cwd, il path diventa `packages/validation-harness/docs/perf/phase-0/` (sbagliato).
**Why it happens:** Phase 0 README dice "real evidence under repo-root docs/perf/phase-0/ when Plan 04 runs scripts from repo root" — Phase 1 fold-in deve preservare quel contract.
**How to avoid:**
- Modificare `validation-harness/src/lib/output.ts` per risolvere path via `path.resolve(import.meta.dirname, '../../../../docs/perf/phase-0/')` (4 livelli su da `lib/` a repo-root).
- Oppure: `process.env.EVF_REPO_ROOT` fallback con default = `process.cwd()` se non set, + CI/Vitest config injecta `EVF_REPO_ROOT` esplicito.
- Aggiungere smoke test `validation-harness/tests/path-resolution.test.ts` che verifica writer path target.
**Warning signs:** Phase 0 Plan 04 execution emette evidence in wrong directory; OR `docs/perf/phase-0/.gitignore` line `docs/` (existing) ora cattura repo-root `docs/` (wrong scope).

---

## Code Examples

> Tutti gli esempi sono pattern raccomandati derivati da docs ufficiali o da `tests/phase-0/` esistente. Sintassi precisa è discrezione planner / executor — questi sono shape templates.

### Root `package.json` (Wave 0)
```json
{
  "name": "evenfoundryvtt",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.33.4",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10"
  },
  "scripts": {
    "lint": "biome check .",
    "lint:ci": "biome ci .",
    "format": "biome check --write .",
    "typecheck": "tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit",
    "test": "vitest --run",
    "test:watch": "vitest",
    "test:coverage": "vitest --run --coverage",
    "changeset": "changeset",
    "changeset:status": "changeset status --since=main",
    "prepare": "husky || true"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.15",
    "@changesets/cli": "2.31.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@playwright/test": "1.59.1",
    "@types/node": "25.6.2",
    "@vitest/coverage-v8": "4.1.5",
    "happy-dom": "20.9.0",
    "husky": "^9.0.0",
    "tsx": "4.21.0",
    "typescript": "5.8.3",
    "vitest": "4.1.5"
  }
}
```

### `pnpm-workspace.yaml` (Wave 0)
```yaml
# Source: pnpm.io/pnpm-workspace_yaml (verified 2026-05-11)
packages:
  - 'packages/*'
```

Optional supplemental file `.npmrc` (Wave 0):
```ini
# Strict by default — INV-4 wants dependency rigor
shamefully-hoist=false
# Avoid auto-install peer deps (force explicit declaration)
auto-install-peers=false
# Allow workspace:* protocol (default true in pnpm 10, explicit for clarity)
link-workspace-packages=true
```

### `tsconfig.base.json` (Wave 0) — lifted from `tests/phase-0/tsconfig.json` + adjustments
```jsonc
{
  // Source: TypeScript handbook (verified 2026-05-11) + tests/phase-0/tsconfig.json (Phase 0 proven)
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "types": [],  // each package opts in via its own tsconfig.json types[]

    // INV-4 strict mode (verbatim Phase 0)
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    // ESM hygiene
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,

    // No emit at base level — each package decides
    "noEmit": true
  }
}
```

Per-package `tsconfig.json` (esempio `packages/g2-app/tsconfig.json`):
```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["happy-dom", "@evf/shared-protocol"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### `biome.jsonc` (Wave 0)
```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "**",
      "!**/dist/**",
      "!**/node_modules/**",
      "!**/coverage/**",
      "!**/.changeset/**",
      "!**/pnpm-lock.yaml"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsole": { "level": "warn", "options": { "allow": ["error", "warn"] } }
      },
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "overrides": [
    {
      "includes": ["packages/*/tests/**", "packages/*/**/__tests__/**"],
      "linter": {
        "rules": {
          "suspicious": {
            "noConsole": "off"
          }
        }
      }
    },
    {
      "includes": ["packages/shared-render/src/fixtures/**/*.txt"],
      "formatter": { "enabled": false }
    }
  ]
}
```

### `vitest.config.ts` (Wave 0) — Vitest 4 modern API
```typescript
// Source: vitest.dev/guide/workspace (verified 2026-05-11)
// NOTE: vitest.workspace.ts is DEPRECATED since Vitest 3.2 — use test.projects only
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // D-1.06 thresholds — root-level only (per-package not supported per vitest docs)
      thresholds: {
        // Core (lib/utils/business logic) — applied workspace-wide as baseline
        lines: 80,
        branches: 80,
        functions: 80,
        // Boundary packages override via include/exclude or separate `--coverage.thresholds.*`
        // For Phase 1 (zero app code), thresholds apply when packages reach the boundary
      },
      include: ['packages/*/src/**'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/__tests__/**',
        'packages/*/dist/**',
      ],
    },
  },
});
```

Per-package `packages/g2-app/vitest.config.ts` (only if env override needed):
```typescript
import { defineProject } from 'vitest/config';

export default defineProject({
  extends: true,  // CRITICAL: inherit root config (Pitfall 3)
  test: {
    name: 'g2-app',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
```

### `.changeset/config.json` (Wave 0)
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
  "privatePackages": {
    "version": true,
    "tag": false
  }
}
```

### `commitlint.config.js` (Wave 0)
```javascript
// Source: commitlint.js.org/guides/getting-started (verified 2026-05-11)
// Node 24 requires .mjs OR "type":"module" in package.json — root has "type":"module" so .js works
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'test', 'refactor', 'perf', 'style', 'ci'],
    ],
    // Scope is optional but if present, accept package names OR plan-id NN-NN OR '*'
    'scope-enum': [
      1,  // warn, not error — until all phase NN-NN scopes are enumerated
      'always',
      [
        'g2-app', 'bridge', 'foundry-module', 'shared-protocol',
        'shared-render', 'validation-harness', 'foundry-mcp',
        '*',
      ],
    ],
    'subject-case': [0],  // disable case enforcement (Italian commits allowed)
  },
};
```

### `.husky/commit-msg` (Wave 0)
```bash
#!/usr/bin/env sh
pnpm commitlint --edit "$1"
```

### `.husky/pre-commit` (Wave 0)
```bash
#!/usr/bin/env sh
pnpm biome check --staged --no-errors-on-unmatched
```

### `.github/workflows/ci.yml` (Wave 2) — quality gates per D-1.10
```yaml
# Source: github.com/pnpm/action-setup (verified 2026-05-11)
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # changeset status --since=main needs full history

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --ignore-scripts

      # D-1.10 gate 2: Biome lint + format
      - name: Biome CI
        run: pnpm biome ci .

      # D-1.10 gate 3: TS strict per package
      - name: TypeScript typecheck
        run: pnpm typecheck

      # D-1.10 gate 4: Vitest coverage
      - name: Vitest with coverage
        run: pnpm test:coverage

      # D-1.10 gate 5: // TODO discipline
      - name: TODO discipline grep
        run: |
          if grep -RnE '// TODO(?!\((#[0-9]+|ADR-[0-9]+)\))' \
              --include='*.ts' --include='*.tsx' --include='*.js' \
              packages/ docs/architecture/ 2>/dev/null; then
            echo "::error::Found // TODO without (#issue) or (ADR-NNNN) reference"
            exit 1
          fi

      # D-1.10 gate 6: snapshot drift (Vitest fails when --update=never finds mismatch)
      - name: Snapshot drift check (--update=never default)
        run: pnpm vitest --run --update=false
        # NOTE: vitest 4 default is --update=false; explicit for documentation

      # D-1.10 gate 7: changeset status (PR only)
      - name: Changeset status
        if: github.event_name == 'pull_request'
        run: pnpm changeset:status

  commit-lint-pr-title:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.4 }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - name: Lint PR title
        run: echo "${{ github.event.pull_request.title }}" | pnpm commitlint
```

### `packages/shared-render/src/ascii-grid.ts` (Wave 2) — D-1.11 + INV-1 ck 11-15
```typescript
/**
 * Character-precision grid model for INV-1 layout integrity testing.
 * Source: Specs.md §7.14.4 ck 11-15 + §7.1a Layout Integrity Invariants.
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */

/** Character cell (string of length 1 by convention; ASCII-only enforced by serializer). */
export type Cell = string;

/** Rectangular character grid, immutable. Serializes to LF-joined string for fixtures. */
export class AsciiGrid {
  /** Cell rows; each row has exactly `width` cells. */
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
  readonly width: number;
  readonly height: number;

  constructor(cells: ReadonlyArray<ReadonlyArray<Cell>>) {
    this.height = cells.length;
    if (this.height === 0) throw new Error('AsciiGrid: zero rows not allowed');
    const firstRow = cells[0];
    if (firstRow === undefined) throw new Error('AsciiGrid: undefined first row');
    this.width = firstRow.length;
    for (const [i, row] of cells.entries()) {
      if (row.length !== this.width) {
        throw new Error(`AsciiGrid: row ${i} has ${row.length} cells, expected ${this.width}`);
      }
    }
    this.cells = cells;
  }

  /** Build from LF-joined string; trims trailing whitespace per line, NOT trailing rows. */
  static fromString(text: string): AsciiGrid {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    // Strip trailing blank line if file ends with \n
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const rows = lines.map((line) => [...line]);
    return new AsciiGrid(rows);
  }

  /** Serialize to LF-joined string; NO trailing newline (caller adds if needed). */
  toString(): string {
    return this.cells.map((row) => row.join('')).join('\n');
  }

  /** Get cell at (col, row). Returns undefined for out-of-bounds per INV-4 noUncheckedIndexedAccess. */
  at(col: number, row: number): Cell | undefined {
    return this.cells[row]?.[col];
  }
}
```

### `packages/shared-render/src/snapshot.ts` (Wave 2) — custom matcher
```typescript
/**
 * INV-1 layout integrity matcher. Wraps Vitest 4's `expect.toMatchFileSnapshot()` with
 * char-precision column-misalignment reporting per Specs.md §7.14.4 ck 11.
 *
 * Source: vitest.dev/api/expect (toMatchFileSnapshot verified built-in 2026-05-11).
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */
import { expect } from 'vitest';
import { AsciiGrid } from './ascii-grid.js';

/**
 * Assert that `grid` matches the fixture at `fixturePath`.
 * On mismatch, includes first-diff column/row in the assertion message.
 */
export async function matchAsciiFixture(
  grid: AsciiGrid,
  fixturePath: string,
): Promise<void> {
  // Serialize with trailing LF for consistent file content
  const serialized = grid.toString() + '\n';
  await expect(serialized).toMatchFileSnapshot(fixturePath);
  // NOTE: For richer diff (column-misalignment reporting per INV-1 ck 11), planner can
  // implement a custom expect.extend matcher that pre-diffs and throws with detailed message
  // BEFORE delegating to toMatchFileSnapshot. Phase 4a will exercise this for real;
  // Phase 1 ships the minimal version above to prove wire-up (D-1.16).
}
```

### `packages/shared-render/src/fixtures/status-hud-baseline.txt` (Wave 2 — D-1.16 example)
```
┌──────────────┐
│ HP   42/42   │
│ AC   16      │
│ Action  ●    │
│ Bonus   ●    │
│ React   ○    │
└──────────────┘
```
*(Exactly 16 char wide × 7 rows, LF line-endings, no trailing whitespace, no BOM. Placeholder content — Phase 4a writes the real fixtures per §7.5 / §7.3 mockups.)*

### `packages/g2-app/src/__tests__/example-status-hud.test.ts` (Wave 2 — D-1.16 wire-up)
```typescript
/**
 * THROWAWAY example test — proves shared-render snapshot framework wires through end-to-end.
 * Phase 4a replaces this with real Status HUD render tests.
 * @see D-1.16
 */
import { describe, it } from 'vitest';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';

describe('Status HUD snapshot wire-up (D-1.16 example)', () => {
  it('matches baseline fixture', async () => {
    // Phase 1 placeholder: hand-construct the grid that matches the fixture
    const grid = AsciiGrid.fromString(
      [
        '┌──────────────┐',
        '│ HP   42/42   │',
        '│ AC   16      │',
        '│ Action  ●    │',
        '│ Bonus   ●    │',
        '│ React   ○    │',
        '└──────────────┘',
      ].join('\n'),
    );
    await matchAsciiFixture(
      grid,
      // path relative to test file
      '../../../shared-render/src/fixtures/status-hud-baseline.txt',
    );
  });
});
```

### MADR 4.0 ADR template (Wave 2 — applies to ADR-0001..0004 + 0008)
```markdown
---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-NNNN: {short title, problem-solution shape}

## Context and Problem Statement

{2-3 sentences. Why is a decision required? What's the problem? Reference Specs.md §NN.}

## Decision Drivers

- {driver 1 — e.g., hardware constraint, performance target, INV-N}
- {driver 2}

## Considered Options

- **Option A**: {short description}
- **Option B**: {short description}
- **Option C**: {short description}

## Decision Outcome

Chosen option: **"Option X"**, because {1-2 sentence justification grounded in drivers + project invariants}.

### Consequences

- ✅ {positive consequence — what we gain}
- ✅ {positive consequence}
- ⚠️ {negative consequence — what we accept}
- ⚠️ {negative consequence}

### Confirmation

{How we verify this decision is being upheld. CI gate? Code-review checklist? Snapshot test? Phase entry gate?}

## Pros and Cons of the Options

### Option A
- ✅ Good, because {argument}
- ⚠️ Neutral, because {argument}
- ❌ Bad, because {argument}

### Option B
- ✅ Good, because {argument}
- ❌ Bad, because {argument}

### Option C
- ✅ Good, because {argument}
- ❌ Bad, because {argument}

## More Information

- Specs.md §{cross-references}
- Related ADRs: [ADR-MMMM](./MMMM-title.md)
- Phase entry-gate citations: Phase {N} {goal}
```

### Concrete ADR content seeds (planner expands; HIGH-confidence research-backed claims)

**ADR-0001 layered-ui-model decision seed:**
- Chosen: Layered z-stack (z=0 map / z=1 status HUD persistent / z=2 overlay panel slot) with **exactly 1 capture container** at any time (migrates as overlays open/close).
- Drivers: G2 container budget (max 4 image + 8 text + 1 `isEventCapture: 1`, Specs §3.1). INV-1 §7.1a status HUD persistence. Foundry desktop UI parity (mappa + scheda destra + overlay).
- Confirmation: Specs.md §7.14.4 ck 1-15 verification suite + INV-1 snapshot tests via shared-render.
- Sources: Specs.md §2.1 / §5.4 / §7.2 / §7.14.4; research ARCHITECTURE.md Pattern 1.

**ADR-0002 protocol-versioning decision seed:**
- Chosen: WS envelope `{ proto: "1.0", seq, ts, type, path?, value?, prev_seq? }`, semver per-protocol independent of package version. Idempotency keys (UUID per write action) deduped by bridge on 60s LRU. Replay buffer 60s ring.
- Drivers: long-lived G2 client (no atomic upgrade), capability handshake on connect (research §2.4 + §2.5), prevent double-`activity.use()` on retried POST (research §2.2 idempotency gap).
- Confirmation: Phase 3 (bridge) integration test for retry-dedupe; Phase 7 (write path) end-to-end double-tap stress test.
- Sources: Specs.md §4 / §5.3 / §11.5.8.1; research ARCHITECTURE.md §2.4 cross-cutting concerns.

**ADR-0003 tool-registry-pattern decision seed:**
- Chosen: Shared Zod-typed dispatch table (`cast_spell`, `weapon_attack`, `use_item`, `skill_check`, `move_token`, `place_template`, `set_targets`) callable from MVP R1 gestures AND V2 MCP tools. `/v1/tools` discovery endpoint serves canonical list.
- Drivers: V2 unblocking (Specs §5.7.2 — MCP tools mirror bridge registry 1:1, zero re-impl). Single source of truth for action surface = single auth gate.
- Confirmation: Phase 3 bridge test that `/v1/tools` enumerates all registered; Phase 11 (V2) MCP server passes Inspector with same tool list.
- Sources: Specs.md §5.3 / §5.7.2; research ARCHITECTURE.md Pattern 2.

**ADR-0004 voice-via-mcp-not-internal decision seed:**
- Chosen: V2 voice = external MCP server (`packages/foundry-mcp`, Phase 11) consuming Tool Registry. NO internal LLM; NO EvenAI native integration.
- Drivers: EvenAI nativo è "non-API per dev" (verbatim Specs.md §3.6); GM authority must remain unchallenged; LLM choice is user-side (Claude Desktop, any MCP client). Decoupling is architectural, not aesthetic.
- Confirmation: Phase 11 entry gate verifies that bridge bearer auth is unchanged (no new auth surface for MCP); no `packages/bridge` code change required to enable MCP path.
- Sources: Specs.md §3.6 (EvenAI non-API verbatim) / §5.7 / §11.5; research ARCHITECTURE.md §2.3.

**ADR-0008 code-quality-configuration decision seed:**
- Chosen: Biome 2.4.15 `recommended` + 4 strict rules (D-1.05) + TS 5.8.3 strict + 5 flags (D-1.04) + Vitest 4.1.5 coverage 80% core / 90% boundary (D-1.06) + GitHub Actions 7-gate CI (D-1.10) + Conventional Commits via commitlint+Husky+wagoid CI action (D-1.14).
- Drivers: INV-4 ratifies "zero dead/unreachable code tolerated"; need automation, not aspiration.
- Confirmation: CI on every PR. Pre-commit hook on every commit. `// TODO(#N|ADR-N)` grep gate. Phase 10 polish dead-code-scan final gate.
- Sources: Specs.md §0.1 INV-4; this RESEARCH.md §Standard Stack; CLAUDE.md §Technology Stack.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vitest.workspace.ts` file | `vitest.config.ts` with `test.projects: ['packages/*']` | Vitest 3.2 (Q2 2025) | Old approach DEPRECATED. Phase 1 MUST use new API. |
| `ts-node` for TS execution | `tsx` | 2023-2024 | `tsx` is Node 22+ native loader-friendly; `ts-node` ESM story stuck. Already adopted in Phase 0. |
| ESLint + Prettier | Biome | 2024-2026 | Single binary, 10× faster, single config. INV-4 locked. |
| `pngjs` 8-bit only | `upng-js` 2.1.0 (4-bit indexed) | Specs.md §11.5.7 settled | For Phase 4a raster pipeline; Phase 1 just installs `upng-js` ambient `.d.ts` in `validation-harness` (Phase 0 carry-forward). |
| MCP HTTP+SSE transport | MCP Streamable HTTP | 2025-03-26 (spec rev 2025-06-18) | V2 only (Phase 11). Not Phase 1, but ADR-0004 must reference correctly. |
| `pnpm@10.3.1` and `typescript@5.8.5` in STACK.md/CLAUDE.md | **Don't exist on npm registry** — correct to `pnpm@10.33.4` + `typescript@5.8.3` | 2026-05-10 (Phase 0 Plan 01 discovery) | Phase 1 closure (Wave 2) MUST land the doc correction (INV-3 atomic). |
| Husky `prepare` script | `husky || true` (graceful CI skip) OR `lefthook` | Husky 9.x guidance | Avoids CI fail on shallow clone (Pitfall 4). |

**Deprecated/outdated:**
- `vitest.workspace.ts` — still works but deprecated; Phase 1 NOT to introduce.
- `ts-node` — replaced by `tsx`. Phase 0 already on tsx 4.21.0.
- `vitest@<4.0` `expect.toMatchSnapshot()` for files — replaced by `expect.toMatchFileSnapshot()` in v3+ (built-in, async).

---

## Open Questions

1. **`upng-js` ambient `.d.ts` location post-fold-in**
   - What we know: Phase 0 ships `tests/phase-0/upng-js.d.ts` standalone — picked up by `tsconfig.json` `include: ["**/*.ts"]` globbing.
   - What's unclear: post-fold, the file location is `packages/validation-harness/upng-js.d.ts` (top-level). Does the per-package tsconfig still globbing-include `*.d.ts`? Or should it move to `src/types/upng-js.d.ts`?
   - Recommendation: keep at `packages/validation-harness/upng-js.d.ts` + add explicit `"include": ["src/**/*", "tests/**/*", "*.d.ts"]` in per-package `tsconfig.json`. Smoke-test with `pnpm tsc --noEmit --filter @evf/validation-harness`.

2. **Vitest coverage threshold per-package vs workspace-wide**
   - What we know: D-1.06 says "core 80% / boundary 90%". Vitest 4 coverage thresholds are root-level only (verbatim vitest.dev/guide/workspace).
   - What's unclear: How to differentiate "core" vs "boundary" code without per-package threshold config?
   - Recommendation: Approach A — single workspace-wide threshold at 80%, with `boundary` packages (shared-protocol, shared-render) having higher coverage *de facto* via their nature (smaller surface, easier to cover). Approach B — multiple vitest invocations in CI (one per coverage tier). Phase 1 ship A (simpler); revisit in Phase 4a when real coverage data exists.

3. **Husky vs Lefthook final decision**
   - What we know: D-1.14 cites "Husky pre-commit hook" as fallback. Lefthook is acceptable swap (Anti-pattern §State of the Art).
   - What's unclear: Single-developer MVP doesn't benefit much from Lefthook's parallelism; Husky's npm-postinstall pattern is more familiar.
   - Recommendation: Phase 1 ship Husky. Document in ADR-0008 "may swap to Lefthook in Phase 13 if multi-developer workflow demands speed".

4. **`commit-msg` Husky hook in CI vs local-only**
   - What we know: commitlint can run locally via Husky `commit-msg` AND in CI via `wagoid/commitlint-github-action` on PR title.
   - What's unclear: PR title vs individual commit messages — Conventional Commits typically lints commits, but squash-merge makes PR title the canonical.
   - Recommendation: BOTH. Husky `commit-msg` lints individual commits (developer feedback). CI lints PR title (gate on merge — squash uses PR title). Documented in `CONTRIBUTING.md`.

5. **STACK.md correction granularity**
   - What we know: Phase 1 closure (Wave 2) must align STACK.md + CLAUDE.md to TS 5.8.3 + pnpm 10.33.4.
   - What's unclear: Is this a single-commit INV-3 atomic, or split between STACK.md (Phase 0 closure) and CLAUDE.md (Phase 1 closure)?
   - Recommendation: Single atomic commit at Phase 1 Wave 2 closure. Touches STACK.md + CLAUDE.md + (potentially) README.md if version cited there. Specs.md unchanged (pinning is in STACK.md / CLAUDE.md, not Specs.md).

6. **Snapshot serializer column-misalignment reporting depth**
   - What we know: D-1.16 ships minimal `matchAsciiFixture()` — wraps `toMatchFileSnapshot`. Phase 4a wires real cases.
   - What's unclear: Should Phase 1 ship the full column-precision diff reporter, or defer to Phase 4a?
   - Recommendation: Phase 1 ships minimal (delegate to `toMatchFileSnapshot` diff). Phase 4a expands when real fixture failures demand it (YAGNI per INV-4 "no dead/unreachable code" — don't ship reporter logic before a test exercises it). Document in ADR-0001 Confirmation section.

---

## Validation Architecture

> `workflow.nyquist_validation = true` per `.planning/config.json` — sezione inclusa.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + `@vitest/coverage-v8` 4.1.5 |
| Config file | `vitest.config.ts` (root) + per-package `vitest.config.ts` only when env override needed |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test:coverage` |
| Phase 1 self-test | `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status` |

### Phase Requirements → Test Map

Phase 1 è strutturale — i "requirements" sono **gates di tooling** non REQ-IDs. Le verifiche assicurano che l'infrastruttura supporti i REQ-IDs downstream.

| Gate ID | Behavior | Test Type | Automated Command | File Exists? |
|---------|----------|-----------|-------------------|--------------|
| WAVE-0-G1 | `pnpm install` succeeds on clean clone | smoke | `rm -rf node_modules && pnpm install --frozen-lockfile` | ❌ Wave 0 |
| WAVE-0-G2 | Biome config valid + lints empty/scaffold files green | unit | `pnpm biome ci .` | ❌ Wave 0 |
| WAVE-0-G3 | TypeScript base config strict + all flags green | unit | `pnpm tsc --noEmit -p tsconfig.base.json` | ❌ Wave 0 |
| WAVE-0-G4 | Vitest config loads + 0 tests runs green | smoke | `pnpm vitest --run` (exits 0 with "no tests found") | ❌ Wave 0 |
| WAVE-0-G5 | Changesets config valid | unit | `pnpm changeset status` | ❌ Wave 0 |
| WAVE-0-G6 | Commitlint config loads + validates good/bad commit messages | unit | `echo "feat(g2-app): test" \| pnpm commitlint` (exit 0) AND `echo "bad message" \| pnpm commitlint` (exit 1) | ❌ Wave 0 |
| WAVE-1-G1 | All 6 packages link via workspace:* | smoke | `pnpm install && pnpm ls --depth=0` shows 6 workspace packages | ❌ Wave 1 |
| WAVE-1-G2 | Per-package TS extends base + green | unit | `pnpm -r exec tsc --noEmit` | ❌ Wave 1 |
| WAVE-1-G3 | validation-harness Vitest discovers folded tests | smoke | `pnpm test --filter @evf/validation-harness --run` (exit 0 OR 2 per Pattern 3 skip uniform) | ❌ Wave 1 |
| WAVE-1-G4 | tests/phase-0/ directory removed | smoke | `[ ! -d tests/phase-0 ]` | ❌ Wave 1 |
| WAVE-1-G5 | validation-harness writer paths still target repo-root `docs/perf/phase-0/` | unit | `pnpm test --filter @evf/validation-harness tests/path-resolution.test.ts` | ❌ Wave 1 |
| WAVE-2-G1 | All 5 new ADRs exist + MADR frontmatter | smoke | `grep -l '^status: accepted' docs/architecture/000{1,2,3,4,8}-*.md \| wc -l` returns 5 | ❌ Wave 2 |
| WAVE-2-G2 | Example snapshot test green | unit | `pnpm test --filter @evf/g2-app src/__tests__/example-status-hud.test.ts --run` | ❌ Wave 2 |
| WAVE-2-G3 | CI workflow `.github/workflows/ci.yml` valid YAML + actionable | smoke | `actionlint .github/workflows/ci.yml` (optional) | ❌ Wave 2 |
| WAVE-2-G4 | `// TODO` discipline grep finds zero violations | unit | (CI gate 5 inline command above) | ❌ Wave 2 (CI workflow) |
| WAVE-2-G5 | INV-3 doc coherence: STACK.md + CLAUDE.md align to TS 5.8.3 + pnpm 10.33.4 | manual | `grep -E '(5\.8\.5\|5\.8\.3)' .planning/research/STACK.md CLAUDE.md` then `grep -E '(10\.3\.1\|10\.33\.4)'` | ❌ Wave 2 |

### Sampling Rate
- **Per task commit:** `pnpm lint:ci && pnpm tsc --noEmit` (fast, <30s on 6 packages with hot caches)
- **Per wave merge:** `pnpm test:coverage && pnpm changeset:status` (full suite + version gate)
- **Phase gate:** Full CI workflow green on a clean PR before `/gsd:verify-work` (replays the same gates locally first)

### Wave 0 Gaps
- [ ] `vitest.config.ts` root file — required for any test to run. Phase 0 had per-test-script tsx execution; Phase 1 introduces Vitest.
- [ ] `commitlint.config.js` — never existed.
- [ ] `.husky/{pre-commit,commit-msg}` — never existed; Husky `prepare` script in root `package.json`.
- [ ] `.gitattributes` for `*.txt` fixtures LF eol enforcement (Pitfall 6).
- [ ] `.editorconfig` for line-ending + trailing-whitespace consistency (Pitfall 6).
- [ ] Framework install (Wave 0 atomic): `pnpm add -Dw vitest@4.1.5 @vitest/coverage-v8@4.1.5 happy-dom@20.9.0 @commitlint/cli @commitlint/config-conventional husky` (rest already in CLAUDE.md matrix).

*(Phase 1 builds the test infrastructure itself — Wave 0 is the framework install; Waves 1+2 then exercise it.)*

---

## Sources

### Primary (HIGH confidence)
- `npm view typescript dist-tags` (2026-05-11) → `latest: 6.0.3`, plus `5.8.3` in 5-series. **5.8.5 does not exist.** Verified live.
- `npm view pnpm dist-tags` (2026-05-11) → `latest: 11.0.9`, `latest-10: 10.33.4`. **10.3.1 does not exist.** Verified live.
- `npm view @biomejs/biome dist-tags` (2026-05-11) → `latest: 2.4.15`.
- `npm view vitest dist-tags` (2026-05-11) → `latest: 4.1.5`, `beta: 5.0.0-beta.2`.
- `npm view @changesets/cli dist-tags` (2026-05-11) → `latest: 2.31.0`.
- [vitest.dev/guide/workspace](https://vitest.dev/guide/workspace) — `vitest.workspace.ts` DEPRECATED since 3.2; use `test.projects` array.
- [vitest.dev/api/expect](https://vitest.dev/api/expect.html) — `expect.toMatchFileSnapshot()` built-in, async, file-based fixture comparison.
- [biomejs.dev/reference/configuration](https://biomejs.dev/reference/configuration/) — `biome.jsonc` schema, `overrides[]`, `linter.rules.recommended`.
- [biomejs.dev/reference/cli](https://biomejs.dev/reference/cli/) — `biome ci` read-only for CI; `biome check --write` for dev; `--error-on-warnings` opt-in.
- [adr.github.io/madr/](https://adr.github.io/madr/) — MADR 4.0 release 2024-09-17, 4 template variants, frontmatter schema.
- [commitlint.js.org/guides/getting-started](https://commitlint.js.org/guides/getting-started.html) — `@commitlint/cli` + `@commitlint/config-conventional` minimal setup; Node 24 requires `.mjs` or `type:module`.
- [github.com/pnpm/action-setup](https://github.com/pnpm/action-setup) — `pnpm/action-setup@v4` with `cache: true` is canonical CI install.
- [pnpm.io/pnpm-workspace_yaml](https://pnpm.io/pnpm-workspace_yaml) — `packages: ['packages/*']` glob pattern, catalog/catalogs support.
- [typescriptlang.org/tsconfig#noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig#noUncheckedIndexedAccess) — flag semantics + combo interactions.
- Specs.md v0.9.11 §5.6.10 (monorepo layout), §11.5.6 (trunk-based + Changesets), §0.1 INV-1/2/3/4, §7.14.4 ck 11-15 (INV-1 verification checklist), §11.5.7 (raster lib stack — informs shared-render rationale).
- `tests/phase-0/tsconfig.json` (locally verified Phase 0 strict TS green) — lifted verbatim to `tsconfig.base.json`.
- `.planning/phases/00-validation-gates/00-01-SUMMARY.md` (Phase 0 Plan 01 SUMMARY — drift discovery + ADR template precedent).

### Secondary (MEDIUM confidence)
- [github.com/changesets/changesets/blob/main/docs/automating-changesets.md](https://github.com/changesets/changesets/blob/main/docs/automating-changesets.md) — `changeset status --since=main` CI pattern; pre-1.0 private packages config (`privatePackages: { version:true, tag:false }`).
- WebSearch "Biome 2 commit lint conventional commits 2026" (2026-05-11) — confirmed: **no native Biome commit-lint plugin**; Husky+commitlint or Lefthook are standard.
- [biomejs.dev/recipes/git-hooks/](https://biomejs.dev/recipes/git-hooks/) — Biome 4 pre-commit hooks available via `biomejs/pre-commit` repository.
- ARCHITECTURE.md §2.4 (WS envelope) + §2.5 (plugin contracts) + §6 (build order critique) — informs ADR-0002 + ADR-0003 seed content.

### Tertiary (LOW confidence — needs validation)
- log4brains MADR 4.0 compatibility — unclear from official MADR docs (only mentions markdownlint as official tooling recommendation). Phase 1 stays on pure markdown to avoid lock-in.
- Lefthook alternative install in Docker base image — viable but unverified for our Node 24 alpine context. MVP stay on Husky.
- Validation-harness `path.resolve()` 4-level-up pattern — works in theory; needs Wave 1 smoke test (Pitfall 8 + Open Question 8).

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every pin verified live against npm registry 2026-05-11; deviations from STACK.md (TS, pnpm) are positive corrections grounded in registry truth.
- Architecture: **HIGH** — patterns lifted from existing Phase 0 scaffold (already proven green) + Vitest/Biome/Changesets/MADR docs verified live.
- Pitfalls: **MEDIUM-HIGH** — Pitfalls 1+2+3+6+8 grounded in tool docs or empirical Phase 0 evidence; Pitfalls 4+5+7 grounded in pattern recognition (commonly reported in 2024-2026 monorepo migrations).
- ADR seeds: **HIGH** for ADR-0001..0004 (verbatim Specs.md + research ARCHITECTURE.md); **MEDIUM** for ADR-0008 (synthesizes D-1.04..D-1.10 + research recommendations — planner may expand).

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days for stable; npm registry verified, no fast-moving dep involved — TS 6.0 stabilization is the only watch item but Phase 1 doesn't depend on it).

**Files referenced (absolute paths):**
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/phases/01-foundation/01-CONTEXT.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/PROJECT.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/ROADMAP.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/REQUIREMENTS.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/STATE.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/research/STACK.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/research/ARCHITECTURE.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/phases/00-validation-gates/00-CONTEXT.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/phases/00-validation-gates/00-01-SUMMARY.md`
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/Specs.md` (§0.1, §5.6.10, §7.14.4, §11.5.6, §11.5.7, INV-1/2/3/4)
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/CLAUDE.md` (§Technology Stack, §Project Invariants)
- `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/tests/phase-0/` (entire directory — fold-in source)
