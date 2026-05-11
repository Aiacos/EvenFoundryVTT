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

### 1. Branch from `main`

EVF uses **trunk-based development** (Specs §11.5.6 + ADR-0008 + D-1.13). Feature branches live <24h. No long-lived `develop` or `release` branches.

```bash
git checkout main
git pull
git checkout -b feat/your-thing
```

### 2. Make your change

- Follow the existing code style (Biome enforces — `pnpm format` to auto-fix)
- TypeScript strict + 5 flags active (`tsconfig.base.json`) — no `// @ts-ignore` without justification
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

Commit the generated `.changeset/*.md` alongside your code. CI gate 7 fails PRs that change packages without a changeset.

Pre-1.0 policy: all packages are `0.1.0-alpha.0` and `private: true` — `pnpm changeset publish` is intentionally not run (D-1.12 + ADR-0008).

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

Scope: package name (`g2-app`, `bridge`, etc.) OR plan ID (`02-01`, `01-03`) OR `*` (cross-cutting).

Examples:

- `feat(bridge): add Tool Registry dispatch table`
- `docs(02-01): plan Foundry module readers`
- `chore: bump pnpm to 10.33.4`
- `fix(g2-app): correct Status HUD column alignment`

The `commit-msg` Husky hook validates locally; CI re-validates the PR title server-side (T-01-04 defense).

### 6. Push + Open PR

CI runs 7 quality gates (D-1.10):

1. `pnpm install --frozen-lockfile` — lockfile drift detection
2. `pnpm biome ci .` — lint + format (read-only)
3. `pnpm typecheck` — TS strict per package
4. `pnpm test:coverage` — Vitest with coverage thresholds (80% workspace-wide)
5. `// TODO` discipline grep — every TODO needs `(#N)` or `(ADR-N)`
6. Snapshot drift check (`vitest --run --update=false`)
7. `pnpm changeset:status --since=main` — changeset declared if package changed

Plus a parallel job: PR title commitlint validation.

All gates green = ready for merge. Squash-merge is the default (PR title becomes commit subject — Conventional Commits enforced).

## Project Architecture

- `Specs.md` — canonical source of truth (~4040 lines)
- `README.md` + `docs/showcase/index.html` — projections of Specs (must stay coherent — INV-3)
- `docs/architecture/` — ADRs governing architectural choices (read these before making structural changes)
- `.planning/` — GSD workflow planning artifacts (PLAN.md, SUMMARY.md, etc.)

## Project Invariants (NON-NEGOTIABLE)

See [Specs.md §0.1](./Specs.md):

- **INV-1 Layout integrity** — character-perfect ASCII layout, snapshot-tested via `@evf/shared-render`
- **INV-2 Online cross-validation** — every technical claim cites canonical upstream
- **INV-3 Documentation coherence** — `Specs.md` + `README.md` + `docs/showcase/index.html` update in same commit
- **INV-4 Code quality** — Biome + TS strict + Vitest coverage gate enforced in CI; zero dead code; `// TODO` requires `(#issue)` or `(ADR-NNNN)`

INV-5 (Gesture Determinism) ratifies in Phase 6.

## Questions?

Open an issue. Solo developer = sometimes slow but always responsive eventually.
