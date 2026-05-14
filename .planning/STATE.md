---
gsd_state_version: 1.0
milestone: v0.9.11
milestone_name: milestone
status: planning
stopped_at: context exhaustion at 75% (2026-05-13)
last_updated: "2026-05-13T12:57:52.551Z"
last_activity: 2026-05-13
progress:
  total_phases: 15
  completed_phases: 4
  total_plans: 17
  completed_plans: 17
  percent: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-10)

**Core value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica.
**Current focus:** Phase 03 — bridge-service-skeleton

## Current Position

Phase: 4a
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-13 — Completed quick task 260513-l12: fix ApplicationV2 ReferenceError in foundry-module for Foundry v13+

Progress: [█████████░░] 85%

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Average duration: 12.33 min
- Total execution time: 74 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0 | 3 | 43 min | 14 min |
| 1 | 3 | 30 min | 10 min |
| 02 | 5 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**

- 2026-05-11 — Phase 1 Plan 03 (Wave 2 — ADRs + snapshot framework + CI + INV-3 atomic closure): ~12 min, 13 files created + 5 modified, 5 commits (d68d7fe / fcb17ef / 5e13149 / 938c6f2 / 671a22d INV-3 atomic), all 5 WAVE-2-G1..G5 gates green + INV-3 verified (CLAUDE.md + STACK.md in single commit HEAD). TDD on AsciiGrid (11 unit tests RED-then-GREEN). 5 MADR ADRs ACCEPTED (0001-0004 + 0008). GHA workflow with 7 quality gates + T-01-03/T-01-04 hardening. Deviations: Vitest 4 defineProject rejects extends:true (Rule 3 — TS strict catches it; dropped from per-package config; Vitest 4 merges root via test.projects glob automatically); AsciiGrid runtime guard for row===undefined (Rule 3 — noUncheckedIndexedAccess); Biome auto-format on test files (cosmetic).
- 2026-05-11 — Phase 1 Plan 02 (Wave 1 packages + validation-harness fold-in): ~10 min, 25 files created + 11 modified + 16 moved via git mv + 6 deleted, 3 commits (e5641cc / 0fa1364 / b67a029), all 5 WAVE-1-G1..G5 gates green; tests/phase-0/ entirely removed; Pitfall 8 path-resolution fix (fileURLToPath + EVF_REPO_ROOT) with 4-test smoke suite. Deviations: shared-render vitest devDep added for workspace visibility (Rule 3); package test script delegates to root vitest with --project filter (Pitfall 3 — Rule 3); Biome auto-formatted 15 Phase 0 files post-fold-in (cosmetic).
- 2026-05-11 — Phase 1 Plan 01 (Wave 0 tooling foundation): ~8 min, 16 files, 3 commits (5096129 / e448e0d / 06819bf), all 6 WAVE-0-G1..G6 gates green; vitest test.projects deviation documented (Wave 1 re-enables); Biome `useBiomeIgnoreFolder` rule + design-asset exclusions auto-fixed (Rule 3).
- 2026-05-10 — Phase 0 Plan 03 (6 hardware test scripts pre-grant scaffold): ~25 min, 9 files, 3 commits (15e9922 absorbed Task 1 / 3b2578d Task 2 / 8670b0c fix-up), tsc green at exit 0, smoke run all 6 → exit 2 (Pattern 3 skip uniform).
- 2026-05-10 — Phase 0 Plan 02 (MidiQOL probe + run-all orchestrator): 11 min, 6 files, 2 task commits (15e9922 / c1c82e5), tsc green at exit 0, smoke run exits 2 (within plan-acceptable 0/2 range).
- 2026-05-10 — Phase 0 Plan 01 (test infrastructure scaffolding): 7 min, 16 files, 3 commits (40732fe / f301aaf / 96f4c85), type-check green at exit 0.

*Updated after each plan completion.*
| Phase 02-foundry-module-core-pairing-ui P02 | ~60 min | 2 tasks | 12 files |

## Quick Tasks Completed

| Date       | Slug                                                  | Commit    | Notes                                                                                |
|------------|-------------------------------------------------------|-----------|--------------------------------------------------------------------------------------|
| 2026-05-11 | `260511-kqh-fix-ci-coverage-gate-exclude-phase-2-pla` | `2800995` | CI green restored: coverage.include narrowed to `.{ts,tsx}` + 4 placeholder index.ts excludes + `validation-harness/src/lib/**` excluded. Migration policy documented. ~10 min. |
| 2026-05-13 | `260513-l12-fix-applicationv2-referenceerror-in-foun` | `3fee9dd` | Foundry v13+ runtime fix: `ApplicationV2` no longer a bare global — added `const { ApplicationV2 } = foundry.applications.api;` destructure in PairModal.ts; replaced ambient `declare class ApplicationV2` with `declare namespace foundry.applications.api { class ApplicationV2 }` (modeled actual v13 shape, removed unused `declare class Application`); migrated 19 `vi.stubGlobal('ApplicationV2', …)` calls across 4 test files to namespace-shape stub. Unblocks `registerSettings` (init hook was aborting on `ReferenceError`). |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Phase 0 (pre-planning): Specs.md v0.9.11 §10 plan adopted verbatim with 4 research-SUMMARY adjustments (Phase 0 scope expansion, monolithic Plugin Host phase split into Phase 4a + Phase 4b, CONN pulled forward to Phase 2, INV-5 ratification at Phase 6, Phase 10 field-test extension).
- Phase 0 (pre-planning): MidiQOL declared *required* for MVP (`relationships.requires` in module.json) — without `autoFastForward` mode, manual writes stall on chat-card buttons.
- Phase 0 (pre-planning): Phase 4a + 4b combined carry 6 of 17 research pitfalls — highest risk concentration; allocated 4 weeks split into 4a (weeks 4-5) + 4b (weeks 6-7) instead of a single monolithic 4-week phase.
- Phase 0 (pre-planning): Single-workflow-origin discipline option A (`socketlib.executeAsGM` only; player client never invokes `activity.use()` directly) — locked for Phase 7 (research Pitfall 6).
- Phase 0 Plan 01 deviation: TypeScript pinned at `5.8.3` (latest 5.8 stable on npm) instead of plan-cited `5.8.5` — `5.8.5` does not exist on npm registry. STACK.md and CLAUDE.md "TypeScript 5.8.5" references should be corrected to `5.8.3` in next INV-3 cross-cutting commit.
- Phase 0 Plan 01 deviation: pnpm tooling at `10.33.4` (latest-10 dist-tag) instead of cited `10.3.1` (does not exist on npm). Affects only global tooling, not committed package.json.
- Phase 0 Plan 02 decision: REQ MIDIQ-01 production module declaration (`relationships.requires.midi-qol` in `evfoundryvtt` `module.json`) shape proven via probe mini-module — Phase 2 production module inherits identically. Probe code complete; evidence emission pending operational execution against Foundry test world (Plan 04 closure step).
- Phase 0 Plan 02 decision: T-00-02 read-only contract enforced by literal grep gate (`grep -c "game.settings.set" probe.js` MUST return 0) instead of relying on code review — verifiable in CI.
- Phase 0 Plan 02 decision: explicit per-branch `process.exit(0/1/2)` calls (instead of ternary expression) so static literal greps for each exit code all match — accommodates plan-defined acceptance gates and future CI grep checks.
- Phase 0 Plan 03 decision: upng-js@2.1.0 ambient module declaration moved to standalone `tests/phase-0/upng-js.d.ts` since inline `declare module` was rejected by TypeScript with TS2665 ("Invalid module name in augmentation. Module 'upng-js' resolves to an untyped module"). Standalone .d.ts files are picked up by tsconfig include='**/*.ts' globbing.
- Phase 0 Plan 03 decision: skip-case payloads use `1` for all `z.number().int().positive()` schema fields (sessions, samples_per_gesture, duration_sec, initial_mtu_bytes, iterations) — semantic "no measurement performed" sentinel; the `verdict: "skipped"` field carries the operational signal. Avoids 0-rejection by Zod's `positive()` constraint.
- Phase 0 Plan 03 decision: Task 1 deliverables (10-0-7/8/9 + package.json upng-js add) bundled into Plan 02 commit `15e9922` due to parallel Wave 1 execution sharing the `tests/phase-0/` working tree. Plan 04 closure must reference 3 commits for full Plan 03 history (15e9922 + 3b2578d + 8670b0c). Documented in 00-03-SUMMARY.md Deviations §5.
- Phase 0 Plan 03 decision: `tests/phase-0/.gitignore` extended with `docs/` to exclude runtime evidence written when scripts execute with cwd=tests/phase-0/ (smoke testing); real evidence under repo-root `docs/perf/phase-0/` when Plan 04 runs scripts from repo root.
- Phase 1 Plan 01 decision (D-1.03 D-1.15): TS 5.8.3, pnpm 10.33.4, Biome 2.4.15, Vitest 4.1.5, Changesets 2.31.0, Node 24 LTS pinned exactly (T-01-01 mitigation); ghost-version drift from STACK.md/CLAUDE.md (5.8.5/10.3.1) still pending Wave 2 closure.
- Phase 1 Plan 01 decision (D-1.06): Vitest 4 test.projects API used; temporarily commented during Wave 0 (zero packages exist; Vitest 4 errors on empty glob); Wave 1 re-enables. `passWithNoTests: true` added as safeguard.
- Phase 1 Plan 01 decision (D-1.14): commitlint scope-enum severity 1 (warn) per RESEARCH OQ4 — allows phase plan-ID scopes (NN-NN) until regex-pattern plugin lands; subject-case disabled for Italian commits.
- Phase 1 Plan 02 decision (D-1.01 honored): 6 @evf/* private workspace packages scaffolded (g2-app, bridge, foundry-module, shared-protocol, shared-render + validation-harness folded from tests/phase-0/) at version 0.1.0-alpha.0; foundry-mcp deliberately omitted (V2 OPZIONALE Phase 11).
- Phase 1 Plan 02 decision (D-1.02 / Phase 0 D-15): tests/phase-0/ folded into packages/validation-harness/ via git mv (history-preserving); tests/ parent dir also removed. Hardware scripts stay tsx-executable in scripts/ (RESEARCH Open Question 1 — NOT converted to Vitest).
- Phase 1 Plan 02 decision (Pitfall 8): validation-harness/src/lib/output.ts computes REPO_ROOT via fileURLToPath(import.meta.url) + 4-level-up walk, with EVF_REPO_ROOT env override priority. Smoke test (tests/path-resolution.test.ts) asserts both branches. Evidence writes still target repo-root docs/perf/phase-0/ regardless of cwd.
- Phase 1 Plan 02 deviation: package test script uses `vitest --run --project @evf/validation-harness --root ../..` so sub-package invocation resolves the root projects config (Pitfall 3 — Vitest 4 projects glob only resolved from cwd). Plan 03 g2-app test script must follow same pattern.
- Phase 1 Plan 03 decision (D-1.07 honored): 5 MADR ADRs ACCEPTED — 0001 layered-ui-model (z=0 map / z=1 status HUD / z=2 overlay + single capture container; binds Phase 4a/4b/5), 0002 protocol-versioning (WS envelope + 60s LRU idempotency + 60s replay buffer; binds Phase 2/3/7/11), 0003 tool-registry-pattern (Zod-typed shared dispatch table consumed by Bridge + foundry-mcp; binds Phase 3/7/8/11), 0004 voice-via-mcp-not-internal (Streamable HTTP only; HTTP+SSE deprecated 2025-03-26; binds Phase 11/12), 0008 code-quality-configuration (Biome+TS+Vitest+7-gate CI + Conventional Commits; binds every Phase 1+ commit).
- Phase 1 Plan 03 decision (D-1.11 honored): @evf/shared-render exports AsciiGrid (char-precision grid, noUncheckedIndexedAccess compliant) + matchAsciiFixture (Vitest 4 expect.toMatchFileSnapshot wrapper). TDD discipline: 11 unit tests RED-then-GREEN. Example INV-1 wire-up test in g2-app proves end-to-end before Phase 4a.
- Phase 1 Plan 03 decision (D-1.09 + D-1.10): GitHub Actions workflow .github/workflows/ci.yml with 7 quality gates (frozen-lockfile + ignore-scripts, biome ci, typecheck, test:coverage, TODO discipline grep, snapshot drift, changeset:status PR-only) + parallel commit-lint-pr-title job. T-01-03 hardening: PR title via env: block, NOT inlined in run: bash. T-01-04 hardening: server-side commitlint cannot be bypassed by local --no-verify.
- Phase 1 Plan 03 decision (INV-3 atomic closure): single commit 671a22d propagated drift correction back to docs layer — CLAUDE.md §Repository state "Design-only" → "Phase 1 active" + STACK.md TS 5.8.5→5.8.3 + pnpm 10.3.1→10.33.4 + Drift Corrections Log §11. `git log -1 --name-only HEAD` shows both CLAUDE.md + STACK.md (INV-3 verified).
- Phase 1 Plan 03 deviation: Vitest 4 `defineProject` rejects `extends: true` under TS strict (UserProjectConfigExport type does not include the field — only TestProjectInlineConfiguration consumed by ROOT test.projects array does). Dropped from per-package vitest.config.ts; Vitest 4 still merges root coverage/reporters via test.projects glob discovery automatically (Rule 3).
- [Phase 02-foundry-module-core-pairing-ui]: PairModalData extends Record<string, unknown> to satisfy ApplicationV2 covariant return type
- [Phase 02-foundry-module-core-pairing-ui]: internalSecret included in QR payload for Plan 05 /internal/delta POST auth (H-1 fix)

### Pending Todos

(none — Phase 1 complete; Phase 2 entry is the next planning step)

### Blockers/Concerns

- **Phase 0 hardware access dependency:** Even Hub developer access required for §10.0.1-10.0.9 tests. Timeline estimate: 1-2 weeks request → grant. Tracks to Phase 0 entry.
- **Phase 0 Branch A/B/C decision gates everything:** §10.0.5 binary decision tree must produce ADR-0005 before Phase 1 applicative code. Branch C (glyph-only) would defer raster pipeline to Phase 13 stretch and reshape Phase 4a/4b scope significantly.
- **Research-flagged Phase 7 open questions (Specs §12.B q.11-12, q.15):** MidiQOL `completeActivityUse` signature + Fighter Extra Attack route (`activity.use({count: 2})` vs client-loop) need empirical verification — gate on Phase 7 entry.

## Deferred Items

Items acknowledged and carried forward from project init:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| V2 | VOICE-01..05 (voice/AI via MCP) | Phase 11-12 | Init 2026-05-10 |
| V2 | ACT-04 (reaction execution) | Phase 13 | Init 2026-05-10 |
| V2 stretch | STRETCH-01..08 (multi-player, headless Foundry, DSN raster, dnd5e v6, PF2e, portraits, biometrics, cloud SaaS) | Phase 13 | Init 2026-05-10 |

## Session Continuity

Last session: 2026-05-13T12:57:52.545Z
Stopped at: context exhaustion at 75% (2026-05-13)
Resume file: None
