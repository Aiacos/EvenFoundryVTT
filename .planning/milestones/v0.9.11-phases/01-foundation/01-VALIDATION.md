---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 1 is meta-validation: the deliverable IS the tooling infrastructure. The "tests" are mostly tooling smoke tests + 1 example snapshot test demonstrating the framework wire-up.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.5` + `@vitest/coverage-v8` `4.1.5` (per CONTEXT.md D-1.03) |
| **Config file** | `vitest.config.ts` (root) using Vitest 4 `test.projects: ['packages/*']` API (NOT deprecated `vitest.workspace.ts`) |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test:coverage` |
| **Phase 1 self-test** | `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status` (this IS the Phase 1 acceptance gate) |
| **Estimated runtime** | ~30s lint+typecheck on 6 packages cold; ~5s test (only the example fixture); full suite <2 min total |

---

## Sampling Rate

- **Per task commit:** `pnpm lint:ci && pnpm tsc --noEmit -p tsconfig.base.json` — fast (<30s with hot cache); type-check root + Biome lint root scaffold files
- **Per wave merge:** `pnpm test:coverage && pnpm changeset:status --since=main` — full suite + version gate
- **Phase gate** (before `/gsd:verify-work`): clean clone → `rm -rf node_modules && pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage` ALL green AND CI workflow `.github/workflows/ci.yml` valid (actionlint) AND INV-3 doc coherence verified
- **Max feedback latency:** 30s for type-check / 2 min for full suite

---

## Per-Task Verification Map

> Phase 1 task IDs assigned by planner. This map covers WAVE-N-GN gate IDs from RESEARCH.md Validation Architecture table (lines 1135-1152).

| Task ID | Plan | Wave | Gate ID | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|---------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-XX-XX | 01 | 0 | WAVE-0-G1 | T-01-01 | pnpm-lock.yaml committed, deterministic install | smoke | `rm -rf node_modules && pnpm install --frozen-lockfile` exit 0 | ❌ W0 | ⬜ pending |
| 01-XX-XX | 01 | 0 | WAVE-0-G2 | — | Biome config validates, no rule mis-configurations | unit | `pnpm biome ci .` exit 0 | ❌ W0 | ⬜ pending |
| 01-XX-XX | 01 | 0 | WAVE-0-G3 | — | tsconfig.base.json strict + 4 critical flags green | unit | `pnpm tsc --noEmit -p tsconfig.base.json` exit 0 | ❌ W0 | ⬜ pending |
| 01-XX-XX | 01 | 0 | WAVE-0-G4 | — | Vitest config loads + 0 tests runs green | smoke | `pnpm vitest --run` exit 0 (no tests found exits cleanly) | ❌ W0 | ⬜ pending |
| 01-XX-XX | 01 | 0 | WAVE-0-G5 | — | Changesets config valid (no malformed `.changeset/config.json`) | unit | `pnpm changeset status` exit 0 | ❌ W0 | ⬜ pending |
| 01-XX-XX | 01 | 0 | WAVE-0-G6 | T-01-02 | Commitlint validates good + rejects bad messages | unit | `echo "feat(g2-app): test" \| pnpm commitlint` exit 0 AND `echo "bad message" \| pnpm commitlint` exit 1 | ❌ W0 | ⬜ pending |
| 01-XX-XX | 02 | 1 | WAVE-1-G1 | — | All 6 packages link via `workspace:*` protocol | smoke | `pnpm install && pnpm ls --depth=0` shows 6 workspace pkgs | ❌ W1 | ⬜ pending |
| 01-XX-XX | 02 | 1 | WAVE-1-G2 | — | Per-package tsconfig.json extends base, all green | unit | `pnpm -r exec tsc --noEmit` exit 0 across all packages | ❌ W1 | ⬜ pending |
| 01-XX-XX | 02 | 1 | WAVE-1-G3 | — | validation-harness Vitest discovers folded tests; Pattern 3 skip uniform | smoke | `pnpm test --filter @evf/validation-harness --run` exit 0 OR 2 (skip pattern) | ❌ W1 | ⬜ pending |
| 01-XX-XX | 02 | 1 | WAVE-1-G4 | — | Original `tests/phase-0/` directory removed post fold-in | smoke | `[ ! -d tests/phase-0 ]` exit 0 | ❌ W1 | ⬜ pending |
| 01-XX-XX | 02 | 1 | WAVE-1-G5 | — | Writer paths still target repo-root `docs/perf/phase-0/` | unit | `pnpm test --filter @evf/validation-harness tests/path-resolution.test.ts` exit 0 | ❌ W1 | ⬜ pending |
| 01-XX-XX | 03 | 2 | WAVE-2-G1 | — | All 5 new ADRs exist with MADR frontmatter `status: accepted` | smoke | `grep -l '^status: accepted' docs/architecture/000{1,2,3,4,8}-*.md \| wc -l` returns 5 | ❌ W2 | ⬜ pending |
| 01-XX-XX | 03 | 2 | WAVE-2-G2 | — | Example INV-1 snapshot test green | unit | `pnpm test --filter @evf/g2-app src/__tests__/example-status-hud.test.ts --run` exit 0 | ❌ W2 | ⬜ pending |
| 01-XX-XX | 03 | 2 | WAVE-2-G3 | T-01-03 | CI workflow valid YAML + no shell injection vectors | smoke | `actionlint .github/workflows/ci.yml` exit 0 (or `yq` validation if actionlint not avail) | ❌ W2 | ⬜ pending |
| 01-XX-XX | 03 | 2 | WAVE-2-G4 | — | `// TODO` discipline gate active in CI | unit | Run inline grep `grep -RE '// TODO(?!.*\\((#\\d+\|ADR-\\d+)\\))' packages/ \|\| true` returns 0 hits | ❌ W2 | ⬜ pending |
| 01-XX-XX | 03 | 2 | WAVE-2-G5 | — | INV-3 doc coherence: STACK.md + CLAUDE.md align to actual pinned versions (TS 5.8.3 + pnpm 10.33.4) | manual | `grep -c '5\.8\.3' .planning/research/STACK.md CLAUDE.md` ≥ 1 each; `grep -c '10\.33\.4'` ≥ 1 each | ❌ W2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Threat refs (preliminary, planner finalizes per `<threat_model>` requirement step 5.55):**
- **T-01-01 (Medium):** Dependency confusion / typosquatting — pnpm install pulls compromised package. Mitigation: `pnpm-lock.yaml` committed + reviewed; `frozen-lockfile` in CI; private registry not needed for OSS deps; verify all pinned versions exist on npm (Phase 0 found 2 drift signals).
- **T-01-02 (Low):** Commit message metadata leakage. Mitigation: commitlint config rejects messages with bearer tokens / credentials patterns. Not a real attack vector but defense-in-depth.
- **T-01-03 (Medium):** GitHub Actions workflow shell injection via untrusted input (PR title, branch name). Mitigation: actionlint validation; no `${{ github.event.pull_request.title }}` in `run:` blocks; pinned action versions (`@v4` with explicit major).

---

## Wave 0 Requirements

> Wave 0 = tooling foundation atomic install. All files greenfield.

- [ ] Root `package.json` — `private: true`, `packageManager: pnpm@10.33.4`, dev-deps install (vitest, @vitest/coverage-v8, happy-dom, @commitlint/cli, @commitlint/config-conventional, husky, biome, typescript, tsx)
- [ ] `pnpm-workspace.yaml` — `packages: [packages/*]`
- [ ] `.nvmrc` — `24`
- [ ] `tsconfig.base.json` — strict + noUnusedLocals + noUnusedParameters + noUncheckedIndexedAccess + exactOptionalPropertyTypes; `moduleResolution: bundler`
- [ ] `biome.jsonc` — extends recommended + custom strict rules per D-1.05
- [ ] `vitest.config.ts` (root) — uses `test.projects: ['packages/*']` Vitest 4 API; coverage thresholds 80% lines/branches/functions, 90% on `boundary` paths
- [ ] `.changeset/config.json` — independent semver, `access: restricted`, `baseBranch: main`, no publish hooks
- [ ] `.changeset/README.md` — workflow doc
- [ ] `commitlint.config.js` — extends `@commitlint/config-conventional`; allow scope = package name or `NN-NN` plan ID or `*`
- [ ] `.husky/commit-msg` — runs `pnpm commitlint --edit "$1"`
- [ ] `.husky/_/*` — Husky scaffold (auto-generated by `husky install`)
- [ ] `.gitattributes` — `*.txt eol=lf` for INV-1 fixtures; `* text=auto eol=lf` baseline (Pitfall 6 — line endings)
- [ ] `.editorconfig` — `[*] insert_final_newline = true; trim_trailing_whitespace = true; charset = utf-8; end_of_line = lf` (Pitfall 6)
- [ ] `.gitignore` — `node_modules/ dist/ coverage/ .changeset/__cache__/ *.tsbuildinfo`

---

## Wave 1 Requirements

> Wave 1 = 6 packages (5 new + 1 fold-in promotion from tests/phase-0/).

For each of `g2-app`, `bridge`, `foundry-module`, `shared-protocol`, `shared-render`:
- [ ] `packages/{name}/package.json` — name `@evf/{name}`, version `0.1.0-alpha.0`, dependencies via `workspace:*` where appropriate
- [ ] `packages/{name}/tsconfig.json` — `extends: ../../tsconfig.base.json`, package-specific `outDir` + `rootDir`
- [ ] `packages/{name}/src/index.ts` — minimal export stub (e.g., `export const PACKAGE_NAME = '@evf/{name}';`)
- [ ] `packages/{name}/README.md` — purpose + later-phase consumers

For `packages/validation-harness/` (fold-in from `tests/phase-0/`):
- [ ] `packages/validation-harness/package.json` — `@evf/validation-harness@0.1.0-alpha.0` (inherits workspace deps)
- [ ] `packages/validation-harness/tsconfig.json` — extends base
- [ ] `packages/validation-harness/src/lib/{schemas,output,stats,branch-decision,hub}.ts` (moved from `tests/phase-0/_shared/`)
- [ ] `packages/validation-harness/tests/*.test.ts` OR `packages/validation-harness/scripts/*.ts` (planner decides per RESEARCH Open Question 1)
- [ ] `packages/validation-harness/foundry-modules/midiqol-probe-module/` (moved from `tests/phase-0/midiqol-probe-module/`)
- [ ] `packages/validation-harness/upng-js.d.ts` (moved as-is per RESEARCH Open Question 1 recommendation)
- [ ] `packages/validation-harness/README.md` — describes hardware vs software tests, post-grant operational workflow
- [ ] **DELETE** `tests/phase-0/` (entire directory) after fold-in verified — original `package.json`, `tsconfig.json`, `node_modules/`, all .ts files

---

## Wave 2 Requirements

> Wave 2 = ADRs + snapshot framework + CI + INV-3 atomic closure.

- [ ] `docs/architecture/0001-layered-ui-model.md` — MADR full template; content seeded from RESEARCH ADR-0001 seed
- [ ] `docs/architecture/0002-protocol-versioning.md` — same
- [ ] `docs/architecture/0003-tool-registry-pattern.md` — same
- [ ] `docs/architecture/0004-voice-via-mcp-not-internal.md` — same
- [ ] `docs/architecture/0008-code-quality-configuration.md` — same
- [ ] `docs/architecture/README.md` — index referencing all 8 ADRs (0001-0006 + 0008; 0007 RTL deferred)
- [ ] `packages/shared-render/src/ascii-grid.ts` — character-precision grid model
- [ ] `packages/shared-render/src/fixtures/status-hud-baseline.txt` — example fixture, LF line endings
- [ ] `packages/shared-render/src/snapshot.ts` — `matchAsciiFixture()` helper using Vitest 4 `expect.toMatchFileSnapshot()`
- [ ] `packages/g2-app/src/__tests__/example-status-hud.test.ts` — wire-up demonstration
- [ ] `.github/workflows/ci.yml` — install → biome → typecheck → vitest → grep-todo → changeset-status
- [ ] `CONTRIBUTING.md` — Conventional Commits + Changesets workflow + how-to-run-tests
- [ ] **UPDATE** `CLAUDE.md` §Repository state from "Design-only" to Phase 1+ with real commands (INV-3 atomic commit)
- [ ] **UPDATE** `.planning/research/STACK.md` — drift correction TS 5.8.5→5.8.3 + pnpm 10.3.1→10.33.4 + `Re-verified ✓ 2026-05-11` line per INV-2 discipline (atomic with CLAUDE.md update)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| INV-3 doc coherence at Phase 1 closure | (cross-cutting) | Human review of CLAUDE.md + STACK.md cross-references | Visual diff of `git show HEAD` shows CLAUDE.md §Repository state + STACK.md drift correction in same commit |
| GitHub Actions CI green on first PR | (cross-cutting) | Real CI run can only happen on a remote with secrets — first PR after main push | Push to remote, open PR, verify CI passes; if first run, troubleshoot caching/env in CI workflow |
| MADR ADR content depth | (D-1.07) | Subjective — content should be "complete placeholder", not 1-liner stub | Human review of each ADR markdown body — does it explain Context, Decision, Consequences clearly? |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING tooling
- [ ] Wave 1 covers all 6 packages + tests/phase-0/ removal
- [ ] Wave 2 covers all 5 ADRs + snapshot framework + CI + INV-3 closure
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 30s for type-check / 2 min for full suite
- [ ] `nyquist_compliant: true` set in frontmatter once all 3 waves land green

**Approval:** pending (set to `approved YYYY-MM-DD` after Wave 0+1+2 complete with `pnpm test:coverage` green AND `actionlint` valid AND INV-3 doc coherence verified)
