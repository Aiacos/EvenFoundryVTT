# Phase 1: Foundation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (--auto mode: all gray areas auto-selected, recommended options auto-chosen)

<domain>
## Phase Boundary

Phase 1 stand-uppa il **monorepo skeleton EVF** così ogni fase successiva (2-10 MVP + V2 OPZIONALE 11-13) ha uno scaffold stabile: lint/format/test/build/CI + ADR framework + versioned config schema + binding invariants. **Niente codice applicativo** ancora — solo infrastruttura di sviluppo + 5 ADR placeholders + snapshot test framework wired-in.

Specifically Phase 1 delivers:
- 5 packages pnpm workspace: `g2-app` (browser bundle), `bridge` (Node service), `foundry-module` (Foundry module), `shared-protocol` (types + Zod schemas), `shared-render` (snapshot fixtures + ASCII renderer) + 1 fold-in: `validation-harness` (from `tests/phase-0/` promotion per Phase 0 D-15)
- `tsconfig.base.json` strict (consumed by all packages via `extends`)
- `biome.jsonc` lint+format rules
- `vitest.config.ts` workspace-wide
- `.changeset/config.json` for semver
- GitHub Actions CI with quality gates (Biome, TS strict, Vitest coverage, snapshot tests, TODO discipline)
- 5 ADR placeholders: ADR-0001 (layered-ui-model), ADR-0002 (protocol-versioning), ADR-0003 (tool-registry-pattern), ADR-0004 (voice-via-mcp-not-internal), ADR-0008 (code-quality-config). NOTE: ADR-0005 + ADR-0006 already exist (Phase 0 stubs). ADR-0007 (RTL languages) is V2 stretch.
- Snapshot test framework in `shared-render` consumed by `g2-app` Vitest suite — INV-1 layout integrity foundation

Phase 1 does NOT deliver: app functionality, Foundry hooks, BLE/Hub integration, raster pipeline (those are Phase 2+ work).

</domain>

<decisions>
## Implementation Decisions

### Package Structure

- **D-1.01 [Workspace packages]:** **5 packages + 1 fold-in promotion.**
  - `packages/g2-app/` — browser bundle (Vite 8 → Even Realities App WebView)
  - `packages/bridge/` — Node 24 service (Fastify + ws + Tool Registry)
  - `packages/foundry-module/` — Foundry module (compiled to ESM)
  - `packages/shared-protocol/` — TypeScript types + Zod schemas (single source of truth)
  - `packages/shared-render/` — ASCII snapshot fixtures + INV-1 layout integrity testing utilities (consumed by g2-app + future panels)
  - `packages/validation-harness/` — promoted from `tests/phase-0/` per Phase 0 D-15; Vitest 4-compatible
  - `packages/foundry-mcp/` — **NOT in Phase 1**, deferred to Phase 11 (V2 OPZIONALE)
- **D-1.02 [tests/phase-0/ fold-in]:** Promote `tests/phase-0/*.ts` to `packages/validation-harness/{src,tests}/` during Phase 1. Re-use `_shared/` utilities as `src/` lib. Convert tsx-direct scripts to Vitest test files (executable via `pnpm test`). Original `tests/phase-0/` directory removed at end of Phase 1 (per D-15 plan). HARDWARE EXECUTION can still target `packages/validation-harness/` after promotion — paths in evidence files just update.

### Build/Lint/Test Toolchain (versions verified live in Phase 0)

- **D-1.03 [Pinned versions]:** TypeScript `5.8.3` (NOT 5.8.5 per Phase 0 deviation finding — version doesn't exist on npm registry), tsx `4.21.0`, Zod `4.4.3`, Vite `8.0.11`, Vitest `4.1.5`, `@vitest/coverage-v8` `4.1.5`, happy-dom `20.9.0`, `@playwright/test` `1.59.1`, Biome `2.4.15`, pnpm `10.33.4` (NOT 10.3.1 per Phase 0 deviation), Changesets `2.31.0`, tsup `8.5.1`, Node `24.x` LTS (`.nvmrc`).
  - **STACK.md drift correction needed (deferred Phase 1):** `.planning/research/STACK.md` and `CLAUDE.md` still cite TypeScript@5.8.5 + pnpm@10.3.1 — should be updated to 5.8.3 + 10.33.4 per Phase 0 Plan 01 SUMMARY drift report. Phase 1 closure must address this for INV-2 alignment.
- **D-1.04 [tsconfig.base.json]:** Strict mode + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `moduleResolution: bundler`. Per-package tsconfig.json extends base with package-specific paths/outDir.
- **D-1.05 [Biome 2.4.15 config]:** Extends `recommended` rule set. Additional strict rules: `noExplicitAny` (warn), `noUnusedImports` (error), `noConsole` (warn — test allowlist via `// biome-ignore` directive). Format: 2-space indent, single quotes, trailing comma `all`, semicolons `always`.
- **D-1.06 [Vitest coverage thresholds]:** v8 provider. Coverage gates: **≥80% lines/branches/functions on core** (lib/utils/business logic), **≥90% on boundary** (parsers, validators, protocol). Per-package config in `vitest.config.ts` via workspace mode.

### ADR Framework

- **D-1.07 [Phase 1 ADRs to land]:** 5 placeholders written as ACCEPTED-status documents (not just stubs — populated content per locked research):
  - `docs/architecture/0001-layered-ui-model.md` — z=0 map / z=1 status / z=2 overlay; exactly 1 capture container; corner-card persistence
  - `docs/architecture/0002-protocol-versioning.md` — WS envelope `{proto, seq, ts, type, ...}`, semver protocol, idempotency keys, replay buffer 60s LRU
  - `docs/architecture/0003-tool-registry-pattern.md` — shared between MVP gestures + V2 MCP, Zod-validated tool inputs, `/v1/tools` discovery endpoint
  - `docs/architecture/0004-voice-via-mcp-not-internal.md` — V2 voice = `foundry-mcp` MCP server (NOT internal LLM); rationale = native EvenAI non-API + GM authority preserved
  - `docs/architecture/0008-code-quality-configuration.md` — Biome rules, TS strict flags, CI gate definitions, // TODO discipline (`(#issue)` or `(ADR-NNNN)`)
  - **Already from Phase 0:** ADR-0005 (Branch A/B/C decision — stub, populated Phase 0 closure), ADR-0006 (raster pipeline lib stack — stub, conditional content).
  - **V2 stretch:** ADR-0007 (RTL languages) — placeholder NOT written in Phase 1; lands when V2 work begins.
- **D-1.08 [ADR format]:** MADR (Markdown Architecture Decision Records) — structured + tooling support + semver of decisions. Frontmatter: `status: accepted | proposed | superseded | deprecated`, `date`, `deciders`, `consulted`, `informed`. Sections: Context, Decision, Consequences, Pros & Cons of Options, More Information.

### CI Gates + Snapshot Framework

- **D-1.09 [CI provider]:** **GitHub Actions** — single workflow `.github/workflows/ci.yml` with matrix-free single-Node-24 setup. Free for OSS, native pnpm support, no additional infra. (Alternatives: GitLab CI not needed for OSS MVP; Circle CI = paid tier for cache parallelism; self-hosted runner = overkill pre-1.0.)
- **D-1.10 [CI quality gates]:** Fail the build on:
  1. `pnpm install --frozen-lockfile` non-zero (lockfile drift)
  2. `pnpm biome ci .` any warning OR error (Biome 2 `biome ci` is stricter than `biome check`)
  3. `pnpm tsc --noEmit -p .` per package (TS strict + all flags)
  4. `pnpm vitest --coverage` coverage below threshold (80% core / 90% boundary)
  5. Grep for `// TODO` without `(#\d+)` or `(ADR-\d+)` reference: `grep -RE '// TODO(?!.*\((#\d+|ADR-\d+)\))' packages/ src/` (INV-4 enforcement)
  6. Snapshot tests run with `--update=never` — any drift fails the build (INV-1 enforcement via shared-render)
  7. `pnpm changeset status --since=main` if PR doesn't include a `.changeset/*.md` for changed package(s)
- **D-1.11 [Snapshot framework]:** **`shared-render` package** owns the snapshot infrastructure:
  - `src/ascii-grid.ts` — character-precision grid model (width/height/char[][]) per INV-1 §7.14.4 ck 11-15
  - `src/fixtures/` — ASCII fixture files in plain `.txt` format (CHAR-PERFECT, line-endings LF only)
  - `src/snapshot.ts` — Vitest snapshot serializer that diffs char-precision; reports column-misalignment specifically
  - Consumed by `packages/g2-app/src/**/*.test.ts` via `import { matchAsciiFixture } from '@evf/shared-render'`
  - Fixture format: pure text, line-ending LF, NO trailing whitespace, NO BOM

### Versioning + Change Management

- **D-1.12 [Changesets policy]:** **Independent per-package semver** (NOT fixed/lockstep). Initial version `0.1.0-alpha` for all 6 packages. PR workflow: developer adds `.changeset/{description}.md` declaring bump type per package (`major | minor | patch | none`). `pnpm changeset version` bumps + writes per-package `CHANGELOG.md`. `pnpm changeset publish` (NOT used pre-1.0; MVP doesn't publish to npm).
- **D-1.13 [Branch strategy]:** **Trunk-based development** per Specs §11.5.6 — main is always shippable. Feature branches short-lived (< 24h). No long-lived develop/release branches pre-1.0. Single developer MVP, multi-dev policy revisit at v1.0.

### Repository Operations

- **D-1.14 [Conventional commits]:** Format: `<type>(<scope>): <subject>` where type ∈ {feat, fix, docs, chore, test, refactor, perf, style, ci} and scope ∈ {package-name | NN-NN | * for cross-cutting}. Examples: `feat(bridge): add Tool Registry dispatch table`, `docs(02-01): plan Foundry module readers`, `chore: bump pnpm to 10.33.4`. Enforce via Biome 2 commit lint plugin (or Husky pre-commit hook).
- **D-1.15 [Node version pinning]:** `.nvmrc` = `24` (Active LTS "Krypton" per nodejs.org). Docker base image: `node:24-alpine` for bridge + foundry-mcp containers.
- **D-1.16 [Snapshot framework wire-up demonstration]:** Phase 1 includes a single example INV-1 snapshot test in `packages/g2-app/src/__tests__/example-status-hud.test.ts` referencing `packages/shared-render/src/fixtures/status-hud-baseline.txt` to **prove the framework works end-to-end** before Phase 4a wires it for real. This test is throwaway — superseded by Phase 4a real implementations.

### Claude's Discretion (--auto mode log)

All decisions auto-selected from the "recommended" option per `--auto` mode rules. Areas where downstream planner/executor has implementation flexibility:
- Exact Biome rule customization beyond `recommended` + the 4 strict rules above
- Per-package vitest.config.ts setup details (test environment per package: `happy-dom` for g2-app, `node` for bridge, `node` for foundry-module)
- ADR-0001..0004 + 0008 body content depth (planner decides what's "complete" placeholder content)
- GitHub Actions workflow caching strategy (pnpm store cache vs Turbo remote cache — both compatible with pnpm@10.33.4)
- Snapshot serializer implementation language (pure TS vs leveraging Vitest's `expect.toMatchSnapshot` infrastructure)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs.md (canonical SoT)
- `Specs.md §0.1` — INV-1, INV-2, INV-3, INV-4 (binding rules — INV-4 enforced from Phase 1 commit 1)
- `Specs.md §5.6.10` — Monorepo layout (5 packages + foundry-mcp deferred V2)
- `Specs.md §7.14.4` ck 11-15 — INV-1 layout integrity verification checklist (snapshot tests)
- `Specs.md §11.5.6` — Trunk-based development + Changesets per-package semver
- `Specs.md §11.5.7` — Raster pipeline lib stack (informs shared-render snapshot architecture)
- `Specs.md §0.1 INV-4` — `// TODO` requires `(#issue)` or `(ADR-NNNN)`, JSDoc/TSDoc on public API

### Project Planning
- `.planning/PROJECT.md` — Constraints (TypeScript strict + Biome lint/format + Vitest coverage gate; CI fail su // TODO senza issue-link)
- `.planning/REQUIREMENTS.md` — Phase 1 = structural (no REQ-IDs land here, foundation for all downstream)
- `.planning/ROADMAP.md` §Phase 1 — 5 success criteria
- `.planning/STATE.md` — current position, Phase 0 partial completion status, blockers
- `.planning/phases/00-validation-gates/00-CONTEXT.md` — Phase 0 decisions including D-02 partial-parallel, D-15 validation harness promotion path

### Research
- `.planning/research/STACK.md` — pinned versions for all tooling (note: TS 5.8.5 → 5.8.3 + pnpm 10.3.1 → 10.33.4 drift corrections per Phase 0 Plan 01 SUMMARY)
- `.planning/research/ARCHITECTURE.md` — 5-tier 3-hop deployment (informs package boundaries)
- `.planning/research/SUMMARY.md` — recommended stack rationale

### CLAUDE.md (project memory)
- `CLAUDE.md` §Technology Stack — full Phase 1 install matrix verbatim
- `CLAUDE.md` §Project Invariants — INV-1/2/3/4 enforcement specifics
- `CLAUDE.md` §Repository state — "Design-only" → updated to "Phase 1+" once monorepo lands (per CLAUDE.md instruction "When code starts landing (Phase 1+), update this file with real build/lint/test commands")

### Phase 0 Outputs (carry forward)
- `tests/phase-0/` → `packages/validation-harness/` (D-15 promotion path)
- `docs/architecture/0005-phase0-go-no-go.md` + `docs/architecture/0006-raster-pipeline-library-stack.md` — already exist (Phase 0 stubs); Phase 1 ADR template format MUST match these

### To Be Created (Phase 1 outputs)
- `package.json` (root) — pnpm workspace manifest
- `pnpm-workspace.yaml` — `packages: [packages/*]`
- `tsconfig.base.json` — strict + all flags
- `biome.jsonc` — lint+format rules
- `vitest.config.ts` (workspace) + per-package configs
- `.changeset/config.json` + `.changeset/README.md`
- `.nvmrc` (`24`)
- `.github/workflows/ci.yml` — CI gates
- `packages/{g2-app,bridge,foundry-module,shared-protocol,shared-render}/package.json + tsconfig.json + src/index.ts`
- `packages/validation-harness/` (folded from tests/phase-0/)
- `docs/architecture/0001-layered-ui-model.md` + `0002-protocol-versioning.md` + `0003-tool-registry-pattern.md` + `0004-voice-via-mcp-not-internal.md` + `0008-code-quality-configuration.md`
- `packages/shared-render/src/fixtures/status-hud-baseline.txt` (example INV-1 fixture)
- `packages/g2-app/src/__tests__/example-status-hud.test.ts` (example snapshot test wire-up)
- `Dockerfile.bridge` (under `deploy/`)
- `CONTRIBUTING.md` (root) — describes Conventional Commits + Changesets workflow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 0 outputs)
- `tests/phase-0/_shared/{schemas,output,stats,branch-decision,hub}.ts` — ALL these become `packages/validation-harness/src/lib/{schemas,output,stats,branch-decision,hub}.ts` after fold-in
- `tests/phase-0/midiqol-config-probe.ts` + `10-0-*.ts` — become `packages/validation-harness/tests/` Vitest files
- `tests/phase-0/midiqol-probe-module/` — moves to `packages/validation-harness/foundry-modules/midiqol-probe-module/` (or stays as-is since it's a Foundry-side artifact, not Vitest-runnable)
- `tests/phase-0/tsconfig.json` — superseded by inheritance from `tsconfig.base.json` post-Phase-1
- `tests/phase-0/package.json` — DELETED post fold-in (validation-harness inherits root pnpm workspace)

### Established Patterns
- **Phase 0 ADR-0005 + ADR-0006 templates** — Phase 1 ADR-0001..0004 + 0008 MUST follow same MADR-like structure (sections: Status, Context, Decision, Consequences, etc.)
- **TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes** — already proven viable in tests/phase-0 (tsc --noEmit green). Lift verbatim to tsconfig.base.json.
- **Pattern 3 skip uniformity** (Phase 0 D-08) — capability-negotiation skip when external dep unavailable; consumed by g2-app + bridge in later phases for Hub/Foundry unavailability handling

### Integration Points
- **packages/validation-harness/** — Phase 1 fold-in target; once landed, all Phase 0 measurement evidence still goes to `docs/perf/phase-0/` (paths unchanged in writers)
- **packages/shared-render/** — Phase 4a (G2 raster engine) + Phase 5 (panels) heavy consumers
- **packages/shared-protocol/** — Phase 2 (Foundry readers) + Phase 3 (bridge) + Phase 4a (G2 client) all import; single source of truth for WS protocol envelope per ADR-0002
- **CI workflow** — wire to fail at Phase 1 PR merge; Phase 2+ work merges through this gate

</code_context>

<specifics>
## Specific Ideas

- **CLAUDE.md update at Phase 1 closure (INV-3 atomic commit):** When Phase 1 lands the monorepo skeleton, `CLAUDE.md` §Repository state section MUST update from "Design-only" to "Phase 1+: monorepo active; build/test/lint commands available" with real commands. Per CLAUDE.md self-instruction line 8: *"When code starts landing (Phase 1+), update this file with real build/lint/test commands."* Phase 1 closure plan must include this in its INV-3 atomic commit.
- **STACK.md drift fix:** Phase 0 Plan 01 SUMMARY flagged TypeScript 5.8.5 doesn't exist (pinned 5.8.3 used) + pnpm 10.3.1 doesn't exist (pinned 10.33.4 used). Phase 1 must update `.planning/research/STACK.md` + `CLAUDE.md` §Technology Stack to reflect actual pinned versions, with `Re-verified ✓ 2026-05-11` line per INV-2 discipline.
- **Snapshot fixture format**: pure text `.txt` with character-precision; NO `.snap` Vitest auto-generated format (those have ASCII-art mangling risks). The example wire-up in D-1.16 demonstrates the pattern future panel work will replicate.
- **Validation harness promotion (D-15)**: not just a file move — tsconfig extends base, package.json minimal (inherits root deps), README updated to reference `pnpm test` from root. Original `tests/phase-0/package.json` + `tsconfig.json` + `node_modules/` all REMOVED at fold-in completion.

</specifics>

<deferred>
## Deferred Ideas

None — Phase 1 scope is tightly defined by ROADMAP success criteria + CLAUDE.md Technology Stack section.

Future-tracked items (informational, NOT in Phase 1):
- ADR-0007 (RTL languages) — V2 stretch, lands when V2 work begins (Phase 11+)
- ADR template format refinement — MADR chosen, may evolve based on usage; not blocking
- Turbo remote cache or other monorepo accelerators — pnpm 10 caching sufficient for MVP; revisit if CI time >5min

### Auto-mode Selection Log

Per `--auto` mode rules, the following gray areas were auto-selected and each question auto-resolved to the recommended option (first option / explicitly marked "Recommended"):

```
[auto] Selected all gray areas: Package Structure, Build/Lint/Test Toolchain, ADR Framework, CI Gates + Snapshot Framework, Versioning + Change Management, Repository Operations.

[auto] [Package Structure] Q: "5 packages + foundry-mcp or all 6 in Phase 1?" → Selected: "5 packages + foundry-mcp deferred Phase 11" (Research/STACK.md + Specs.md §5.6.10 lockdown)
[auto] [Package Structure] Q: "Validation harness fold-in path?" → Selected: "Folded into packages/validation-harness/ per Phase 0 D-15"
[auto] [Build/Lint/Test] Q: "TypeScript version?" → Selected: "5.8.3 (drift-corrected from 5.8.5 per Phase 0 Plan 01)"
[auto] [Build/Lint/Test] Q: "pnpm version?" → Selected: "10.33.4 (drift-corrected from 10.3.1 per Phase 0 Plan 01)"
[auto] [Build/Lint/Test] Q: "Coverage threshold strategy?" → Selected: "80% core / 90% boundary (matches research/STACK.md + INV-4)"
[auto] [ADR Framework] Q: "Which ADRs land in Phase 1?" → Selected: "5 ADRs (0001-0004 + 0008); ADR-0005/0006 already exist; 0007 is V2 stretch"
[auto] [ADR Framework] Q: "ADR format?" → Selected: "MADR (Markdown Architecture Decision Records) — structured + tooling support"
[auto] [CI Gates] Q: "CI provider?" → Selected: "GitHub Actions (free OSS + native pnpm)"
[auto] [CI Gates] Q: "Snapshot framework architecture?" → Selected: "shared-render package owns ASCII fixture loader + Vitest snapshot serializer"
[auto] [Versioning] Q: "Changesets policy?" → Selected: "Independent per-package semver, initial 0.1.0-alpha, no publish pre-1.0"
[auto] [Versioning] Q: "Branch strategy?" → Selected: "Trunk-based per Specs §11.5.6"
[auto] [Repository Ops] Q: "Commit convention?" → Selected: "Conventional Commits + Biome 2 commit lint plugin OR Husky"
[auto] [Repository Ops] Q: "Node version pinning?" → Selected: ".nvmrc=24 + Docker node:24-alpine base"
```

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-11 via --auto mode*
