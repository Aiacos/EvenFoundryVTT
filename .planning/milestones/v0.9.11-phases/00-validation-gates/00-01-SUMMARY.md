---
phase: 00-validation-gates
plan: 01
subsystem: validation-harness
tags: [phase-0, scaffold, tdd-foundation, adr-template, evidence-pipeline]
dependency-graph:
  requires: []
  provides:
    - tests/phase-0/_shared/schemas.ts (Zod EvidenceMeta + AnyResult discriminated union)
    - tests/phase-0/_shared/output.ts (writeJsonEvidence + writeCsvEvidence)
    - tests/phase-0/_shared/branch-decision.ts (deriveBranch + DEFAULT_THRESHOLDS hardcoded)
    - tests/phase-0/_shared/stats.ts (percentile R-7 + hartiganDipTest + ci95)
    - tests/phase-0/_shared/hub.ts (loadHub + isHubAvailable env-only credential)
    - docs/architecture/0005-phase0-go-no-go.md (ADR-5 stub PROPOSED)
    - docs/architecture/0006-raster-pipeline-library-stack.md (ADR-6 stub PROPOSED)
    - docs/perf/phase-0/ (evidence directory + README + calibration methodology)
  affects:
    - Plan 00-02 (MidiQOL probe will import _shared/schemas.ts MidiQolConfigResult + writeJsonEvidence)
    - Plan 00-03 (hardware tests will import _shared/{schemas,output,stats,branch-decision,hub}.ts)
    - Plan 00-04 (closure populates ADR-5 verdict + ADR-6 conditional content)
tech-stack:
  added:
    - typescript@5.8.3 (devDep — pinned, plan asked 5.8.5 which does not exist on npm)
    - tsx@4.21.0 (devDep — verified npm view)
    - zod@4.4.3 (devDep — verified npm view)
    - "@types/node@25.6.2 (devDep — verified npm view)"
    - csv-stringify@6.5.2 (devDep — verified npm view)
    - pnpm@10.33.4 (global, plan asked 10.3.1 which does not exist on npm)
  patterns:
    - "Zod discriminated union for evidence schemas (schema_version: 1 versioned)"
    - "Writer accepts only Zod-validated payloads (compile-time + runtime guarantee no auth fields leak)"
    - "Hardcoded thresholds in branch-decision.ts DEFAULT_THRESHOLDS (D-09/D-10/D-12) — no env vars, no runtime overrides"
    - "Env-only credential pattern (process.env.EVEN_HUB_TOKEN, never inline) — T-00-04 mitigation"
    - "ADR template stubs with TBD placeholders — Plan 04 fills empirical verdict + per-test rationale rows"
key-files:
  created:
    - tests/phase-0/package.json
    - tests/phase-0/tsconfig.json
    - tests/phase-0/.gitignore
    - tests/phase-0/README.md
    - tests/phase-0/pnpm-lock.yaml
    - tests/phase-0/_shared/schemas.ts
    - tests/phase-0/_shared/output.ts
    - tests/phase-0/_shared/stats.ts
    - tests/phase-0/_shared/branch-decision.ts
    - tests/phase-0/_shared/hub.ts
    - docs/perf/phase-0/.gitkeep
    - docs/perf/phase-0/README.md
    - docs/perf/phase-0/calibration/.gitkeep
    - docs/perf/phase-0/calibration/methodology.md
    - docs/architecture/0005-phase0-go-no-go.md
    - docs/architecture/0006-raster-pipeline-library-stack.md
  modified: []
decisions:
  - "TypeScript pinned at 5.8.3 (latest 5.8 stable) instead of plan-requested 5.8.5 (drift: 5.8.5 does not exist on npm). Documented in tests/phase-0/README.md Pinned Versions section."
  - "pnpm installed at 10.33.4 (latest v10) instead of plan-cited 10.3.1 (drift: 10.3.1 does not exist on npm; latest-10 dist-tag = 10.33.4). Plan does not pin pnpm in package.json, so this affects only the global tool used to install."
  - "ADR-0005 + ADR-0006 restructured Status from inline bold to dedicated H2 ## Status section so plan acceptance grep `## Status` matches. Content equivalent — moved 'will move to ACCEPTED at closure' note into ## Status block."
metrics:
  duration: "7 minutes (commit 40732fe @ 23:06:16 → commit 96f4c85 @ 23:13:11, 2026-05-10)"
  tasks: 3
  files: 16
  completed: 2026-05-10
---

# Phase 0 Plan 01: Test Infrastructure Scaffolding Summary

Greenfield Phase 0 validation harness scaffolding — 16 files committed across 3 atomic tasks, type-check green at exit 0, zero hardware dependencies, zero secrets committed. Foundation for Plans 02 (MidiQOL probe) and 03 (hardware-bound tests) which can now both proceed in parallel against stable `_shared/` interfaces.

## Tasks Completed

| Task | Name | Commit | Files Created |
|------|------|--------|---------------|
| 1 | Scaffold tests/phase-0/ package + TS config + .gitignore + README | `40732fe` | tests/phase-0/{package.json, tsconfig.json, .gitignore, README.md} |
| 2 | Create _shared/ utilities (schemas + output + stats + branch-decision + hub) | `f301aaf` | tests/phase-0/_shared/{schemas, output, stats, branch-decision, hub}.ts + tests/phase-0/pnpm-lock.yaml |
| 3 | Scaffold docs/perf/phase-0/ + ADR-5/6 template stubs | `96f4c85` | docs/perf/phase-0/{README, .gitkeep, calibration/methodology.md, calibration/.gitkeep} + docs/architecture/{0005-phase0-go-no-go, 0006-raster-pipeline-library-stack}.md |

## Pinned Versions Used (verbatim, INV-2 traceability)

| Package | Version Used | Verified Source | Plan-requested | Status |
|---------|--------------|-----------------|----------------|--------|
| `typescript` | `5.8.3` | `npm view typescript versions` (2026-05-10) | `5.8.5` | **DEVIATED** — 5.8.5 does not exist on npm; 5.8.3 is latest 5.8 stable |
| `tsx` | `4.21.0` | `npm view tsx@4.21.0` | `4.21.0` | exact match |
| `zod` | `4.4.3` | `npm view zod@4.4.3` | `4.4.3` | exact match |
| `@types/node` | `25.6.2` | `npm view @types/node@25.6.2` | `25.6.2` | exact match |
| `csv-stringify` | `6.5.2` | `npm view csv-stringify@6.5.2` | `6.5.2` | exact match |
| `pnpm` (global) | `10.33.4` | `npm view pnpm dist-tags → latest-10: 10.33.4` | `10.3.1` | **DEVIATED** — 10.3.1 does not exist; using latest v10 |

## Build Verification

```bash
$ cd tests/phase-0 && pnpm install
... (pnpm-lock.yaml committed)
Done in 1.4s using pnpm v10.33.4

$ pnpm exec tsc --noEmit
$ echo $?
0
```

Type-check green under `strict: true` + `noUnusedLocals: true` + `noUnusedParameters: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` (CLAUDE.md INV-4 mandate).

## Threshold Values Hardcoded (D-12 verifiability gate)

In `tests/phase-0/_shared/branch-decision.ts`:

```typescript
export const DEFAULT_THRESHOLDS: Thresholds = {
  branch_a:           { p50_min_kbps: 200, p95_min_kbps: 150, p99_min_kbps: 100 },
  branch_b:           { p99_min_kbps: 100, p50_min_kbps: 150, envs_required: 2 },
  branch_c_trigger:   { p99_max_kbps: 100 },
  borderline_pct:     5,
};
```

These constants are **NOT** environment-driven, NOT runtime-overrideable. ADR-0005 cites `deriveBranch()` + `DEFAULT_THRESHOLDS` as the canonical algorithm — researcher cannot tune Branch verdict post-hoc. Per D-12: "strict numeric, no discretion".

Queue depth tier mapping in same file:
```typescript
deriveQueueDepthTier(measuredMaxQueue):
  ≤2  → A
  =3  → B (adaptive fps Layer 6 + warning chip)
  ≥4  → C automatic degrade
```

Per D-10 strict tier mapping.

## ADR Stubs Status

| ADR | File | Status | Closure Plan |
|-----|------|--------|--------------|
| 0005 | `docs/architecture/0005-phase0-go-no-go.md` | **PROPOSED** | Plan 04 fills Branch Verdict + Per-Test Verdict rows + Cross-Reference paths to actual evidence files |
| 0006 | `docs/architecture/0006-raster-pipeline-library-stack.md` | **PROPOSED** | Plan 04 selects Branch A/B path (commits image-q+upng-js+xxhash-wasm) OR Branch C path (declares raster moot) per ADR-0005 verdict |

ADR-0005 sections present: Status, Context, Branch Verdict, Threshold Table, Per-Test Verdict, Consequences, Companion Files, Cross-References, Sources (D-13 composite structure). Cross-References cite Phases 1, 4a, 4b, 6, 7 by name (D-16).

ADR-0006 documents BOTH conditional paths (Branch A/B with pinned versions + drift signal note, AND Branch C glyph-only deferred to Phase 13) per D-14.

## Truths Upheld (cross-ref to PLAN must_haves)

- ✅ Test harness scaffold exists at `tests/phase-0/` with package.json + tsconfig.json + README.md
- ✅ Shared utilities exist in `tests/phase-0/_shared/` (5 files)
- ✅ Branch decision helper enforces D-12 strict-numeric thresholds with ±5% borderline auto-downgrade (`borderline_pct: 5` constant + `deriveBranch()` deterministic logic)
- ✅ Output writer emits Zod-validated JSON + CSV with filename pattern `{test_id}-{env?}-{ISO8601}.json` to `docs/perf/phase-0/`
- ✅ Evidence directories exist with `.gitkeep` + README explaining naming convention
- ✅ ADR-0005 + ADR-0006 stubs exist as templates pronti per Phase 0 closure population
- ✅ TypeScript strict type-check passes: `cd tests/phase-0 && pnpm exec tsc --noEmit` → exit 0

## Threat Model Status

| ID | Mitigation Implemented |
|----|------------------------|
| T-00-01 | `EvidenceMeta` Zod schema omits ALL auth/bearer/credentials/secret fields. Discriminated union refuses non-conformant payloads at compile-time AND runtime. README has `## Never Commit Secrets` section. |
| T-00-04 | `_shared/hub.ts` reads `process.env.EVEN_HUB_TOKEN` ONLY (never accepts inline). `tests/phase-0/.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, `*.secret.json`, `*.local.json`. |

`grep -rEi 'bearer|password|secret' tests/phase-0/_shared/` returns ONLY env-var references and threat-model comments — zero hardcoded credentials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] TypeScript 5.8.5 not available on npm registry**
- **Found during:** Task 1 (`pnpm install` would fail with E404)
- **Issue:** Plan + CLAUDE.md cite `typescript@5.8.5` but `npm view typescript versions` shows latest 5.8 stable is `5.8.3` (5.8.5 does not exist; only `5.8.0-dev.20250218`, `5.8.1-rc`, `5.8.2`, `5.8.3` exist in the 5.8 series)
- **Fix:** Pinned `typescript@5.8.3` in `tests/phase-0/package.json` (latest 5.8 stable). Documented deviation in `tests/phase-0/README.md` "Pinned Versions" section with explicit note for INV-2 traceability.
- **Files modified:** `tests/phase-0/package.json`, `tests/phase-0/README.md`
- **Commit:** `40732fe` (Task 1)
- **Upstream impact:** `STACK.md` and CLAUDE.md "TypeScript 5.8.5" pin should be corrected to `5.8.3` in next cross-cutting INV-3 commit (Phase 0 closure or later). Logged for downstream.

**2. [Rule 3 - Blocker] pnpm 10.3.1 not available on npm registry**
- **Found during:** Task 1 prep (`npm install -g pnpm@10.3.1` returns E404)
- **Issue:** Plan does not pin pnpm in `package.json` but CLAUDE.md cites `pnpm 10.3.1` as "latest". Actual `latest-10` dist-tag = `10.33.4` (verified `npm view pnpm dist-tags`).
- **Fix:** Installed `pnpm@10.33.4` globally for build verification. Plan-level `package.json` does NOT pin pnpm (no `"packageManager"` field in this scaffold; will be added in Phase 1 monorepo skeleton via corepack). Therefore deviation is in tooling-only, not in committed package.json content.
- **Files modified:** none (global tool, not in repo)
- **Commit:** N/A (pre-Task 1 prep)
- **Upstream impact:** `STACK.md` "pnpm 10.3.1" pin should be corrected to `10.33.4` (or current latest-10) in next INV-3 cycle.

**3. [Rule 3 - Acceptance gate fix] ADR-0005/0006 Status header structure**
- **Found during:** Task 3 verification
- **Issue:** Plan acceptance criteria require grep `## Status` heading present. Initial draft used `**Status:** PROPOSED` inline-bold pattern (RFC 2119 ADR convention) which does NOT match the grep.
- **Fix:** Restructured both ADRs to have dedicated `## Status` H2 section with content "PROPOSED — template stub..." Plus removed redundant "## Status Resolution at Phase 0 Closure" and trailing italics in ADR-0005. Content semantically equivalent; passes acceptance grep.
- **Files modified:** `docs/architecture/0005-phase0-go-no-go.md`, `docs/architecture/0006-raster-pipeline-library-stack.md`
- **Commit:** `96f4c85` (Task 3)

**4. [Rule 1 - Bug] hartiganDipTest non-null assertions under noUncheckedIndexedAccess**
- **Found during:** Task 2 implementation
- **Issue:** Plan code example used `sorted[0]!` and `sorted[n-1]!` non-null assertions to suppress `noUncheckedIndexedAccess` errors. Works at compile-time but is type-unsafe (a runtime change to the function entry guard could pass `samples.length < 4` check but still produce undefined access).
- **Fix:** Extracted `first` and `last` as type-narrowed `const` with explicit `if (first === undefined || last === undefined) return ...;` guard before the loop. Added `range === 0` guard to prevent NaN division. Logic equivalent, type-safe under strict.
- **Files modified:** `tests/phase-0/_shared/stats.ts` (vs plan code example)
- **Commit:** `f301aaf` (Task 2)

### Auth Gates Encountered

None — no authentication required for any Plan 01 task (greenfield scaffolding only).

## Hand-off to Plan 02 + Plan 03

Both Plan 02 (MidiQOL probe) and Plan 03 (hardware-bound test scripts) depend ONLY on:
- `tests/phase-0/_shared/schemas.ts` exports (`MidiQolConfigResult`, `BleMultiEnvResult`, `R1TimingResult`, etc.)
- `tests/phase-0/_shared/output.ts` exports (`writeJsonEvidence`, `writeCsvEvidence`)
- `tests/phase-0/_shared/branch-decision.ts` exports (`deriveBranch`, `deriveQueueDepthTier`, `DEFAULT_THRESHOLDS`)
- `tests/phase-0/_shared/stats.ts` exports (`percentile`, `hartiganDipTest`, `ci95`)
- `tests/phase-0/_shared/hub.ts` exports (`loadHub`, `isHubAvailable`, `HubBridge` type)

All exports have stable signatures + Zod-validated runtime contracts. Plan 02 and Plan 03 can now proceed **in parallel**.

## Self-Check: PASSED

Verifications performed (all passed):
- All 16 declared files exist at expected paths
- All 3 task commits present in `git log`: `40732fe`, `f301aaf`, `96f4c85`
- `cd tests/phase-0 && pnpm exec tsc --noEmit` exits 0
- All `must_haves.truths` from PLAN frontmatter satisfied
- All `must_haves.artifacts.contains` patterns grep-match
- Threshold constants `p50_min_kbps: 200`, `p95_min_kbps: 150`, `p99_min_kbps: 100`, `borderline_pct: 5` literal-match in source
- ADR-0005 contains all 9 H2 sections per D-13 composite structure
- ADR-0005 cross-references cite Phase 1, 4a, 4b, 6, 7 per D-16
- ADR-0006 documents both Branch A/B path AND Branch C path per D-14
- No bearer token, Even Hub URL, or secret committed (gitleaks pre-commit hook ran clean on all 3 commits)
- `tests/phase-0/.gitignore` excludes `.env*` and `*.secret.json`
