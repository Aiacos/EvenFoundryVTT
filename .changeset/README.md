# Changesets

EVF uses [Changesets](https://github.com/changesets/changesets) for **independent per-package semver** versioning (D-1.12).

## Workflow

1. Make your change in a feature branch
2. Run `pnpm changeset` — answer prompts:
   - Which packages changed? (space to select)
   - Bump type per package? (`major | minor | patch | none`)
   - Summary (1 line, becomes CHANGELOG.md entry)
3. Commit the generated `.changeset/{kebab-name}.md` alongside your code
4. PR CI validates `pnpm changeset:status --since=main` (D-1.10 gate 7)
5. On merge to `main`, `pnpm changeset version` is run (manually for now;
   automation deferred to Phase 13) — bumps `package.json` versions + writes `CHANGELOG.md`

## Pre-1.0 Policy

All packages are `0.1.0-alpha`. **No npm publish** until v1.0
(`access: restricted` + every `packages/*/package.json` has `"private": true`).

## Bump Type Guide

| Type    | When                                                   |
| ------- | ------------------------------------------------------ |
| `major` | Breaking API change (only meaningful post-1.0)         |
| `minor` | New feature, backwards compatible                      |
| `patch` | Bugfix, no API change                                  |
| `none`  | Internal refactor, doc-only — CHANGELOG entry, no bump |

## Cross-package coupling

`updateInternalDependencies: "patch"` — when package A bumps and package B
depends on A via `workspace:*`, package B gets an automatic patch bump.
For pre-1.0 alpha this is safe; revisit at v1.0.
