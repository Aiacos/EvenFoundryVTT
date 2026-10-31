# Contributing to EvenFoundryVTT (EVF)

EVF is a solo-developer-driven project (DM/PO/sole-developer + Claude Code). External contributions welcome but expect long review cycles.

## Quick Start

```bash
# Prerequisites
node --version    # MUST be 24.x (see .nvmrc)
corepack enable
corepack prepare pnpm@10.33.4 --activate

# Install
pnpm install

# Verify your environment
pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status
# All MUST exit 0 — this is the Phase 1 self-test
```

## Workflow

### 1. Branch from `develop`

EVF uses **GitFlow + Changesets** (CLAUDE.md P9): features branch from `develop`, PRs target
`develop`, releases go `develop` → `main` through `release.yml`. Before you start, read
[`TODO.md`](TODO.md) (open work), and keep it, [`SECURITY.md`](SECURITY.md) and
[`CHANGELOG.md`](CHANGELOG.md) updated in the same PR (CLAUDE.md P12).

```bash
git checkout develop
git pull
git checkout -b feat/your-thing
```

### 2. Make your change

- Follow the existing code style (Biome enforces — `pnpm format` to auto-fix)
- TypeScript strict + 6 flags active (`tsconfig.base.json`) — no `// @ts-ignore` without justification
- Public APIs documented with JSDoc/TSDoc (INV-4)
- `// TODO` MUST include `(#issueNumber)` or `(ADR-NNNN)` reference (CI gate 5)

### 3. Test locally

```bash
# Fast feedback (per save)
pnpm test:watch

# Full suite (before commit)
pnpm test:coverage

# Lint + typecheck before commit
pnpm lint && pnpm typecheck
```

### 4. Add a Changeset (REQUIRED for PRs)

If your PR changes ANY package under `packages/*`:

```bash
pnpm changeset
# Answer prompts: which packages, bump type (major|minor|patch|none), summary
```

Commit the generated `.changeset/*.md` alongside your code. CI gate 6 fails PRs that change packages without a changeset.

Packages are `private: true` and versioned independently by Changesets; nothing is published to npm — `release.yml` versions, tags and ships the module zip + `.ehpk` (D-1.12 + ADR-0008).

### 5. Commit using Conventional Commits

Format: `<type>(<scope>): <subject>` (D-1.14)

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Build, deps, config |
| `test` | Tests only |
| `refactor` | Code change with no behavior change |
| `perf` | Performance improvement |
| `style` | Formatting, white space |
| `ci` | CI pipeline change |

Scope (optional, enforced by `commitlint.config.js`): a package (`g2-app`, `foundry-module`, `shared-protocol`, `shared-render`, `validation-harness`, `e2e`, `relay`), an area (`release`, `ci`, `docs`, `constitution`) or `*` (cross-cutting).

Examples:

- `feat(foundry-module): add GM-client projector for sealed envelopes`
- `fix(relay): close the room when both peers leave`
- `chore: bump pnpm to 10.33.4`
- `fix(g2-app): correct Status HUD column alignment`

The `commit-msg` Husky hook validates locally; CI re-validates the PR title server-side (T-01-04 defense).

### 6. Push + Open PR

Before that, every local commit already ran `.husky/pre-commit` (Biome on the staged files,
`pnpm typecheck`, `vitest related --run`) and `commit-msg` (commitlint) — CLAUDE.md P14.

CI (`.github/workflows/ci.yml`, job `quality-gates`) then runs:

1. `pnpm install --frozen-lockfile` — lockfile drift detection
2. `pnpm biome ci .` — lint + format (read-only)
3. `pnpm typecheck` — TS strict per package
4. `pnpm test:coverage` — Vitest with coverage thresholds (80% workspace-wide); with `CI` set
   Vitest writes no snapshot, so it is also the snapshot-drift gate (locally:
   `CI=true pnpm test:coverage`; never `--update=false`, Vitest 4 reads it as «update»)
5. `// TODO` discipline grep — every TODO needs `(#N)` or `(ADR-N)`
6. `pnpm changeset:status` — a changeset for every changed package (PRs only)
7. Changesets cover the shipped module — a bump of g2-app / shared-* must also bump the module
8. Single-workflow-origin guard (ADR-0011) — `activity.use(` only under `packages/foundry-module/src/write-path/`
9. socketlib confinement (ADR-0016) — no socketlib outside `packages/foundry-module`
10. g2-app build + relay-only contract (ADR-0019) — `scripts/check-relay-origin.mjs --bundle packages/g2-app/dist`
11. Relay end-to-end — `wrangler dev` + real glasses session + real projector + the bundle in Chromium + `validate:relay`
12. Wiki links, tracking files (`TODO.md` / `SECURITY.md` / `CHANGELOG.md`), module runtime assets,
    Even Hub manifest (`app.json` version + icon), ShellCheck on `scripts/*.sh`, actionlint on
    `.github/workflows/`

Plus a parallel job: PR title commitlint validation.

All gates green = ready for merge. Squash-merge is the default (PR title becomes commit subject — Conventional Commits enforced).

## Project Architecture

- `Specs.md` — canonical source of truth
- `README.md` + `docs/showcase/index.html` — projections of Specs (must stay coherent — INV-3)
- `docs/architecture/` — ADRs governing architectural choices (read these before making structural changes)
- `specs/NNN-*/` — Spec Kit features (spec → plan → tasks); constitution in `.specify/memory/constitution.md`

## Project Invariants (NON-NEGOTIABLE)

See [Specs.md §0.1](./Specs.md):

- **INV-1 Layout integrity** — character-perfect ASCII layout, snapshot-tested via `@evf/shared-render`
- **INV-2 Online cross-validation** — every technical claim cites canonical upstream
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update in same commit
- **INV-4 Code quality** — Biome + TS strict + Vitest coverage gate enforced in CI; zero dead code; `// TODO` requires `(#issue)` or `(ADR-NNNN)`

INV-5 (Gesture Determinism) ratifies in Phase 6.

## Questions?

Open an issue. Solo developer = sometimes slow but always responsive eventually.
