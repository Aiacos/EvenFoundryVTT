# @evf/validation-harness

EVF validation harness — Phase 0 hardware/SDK validation tests + future re-validation entry point.

**Status:** Folded from `tests/phase-0/` during Phase 1 (D-1.02 / Phase 0 D-15). Phase 0 hardware-bound tests remain operational; the closure step (Phase 0 Plan 04) executes them against real hardware once Even Hub developer access is granted.

## Layout

```
packages/validation-harness/
├── package.json                  # @evf/validation-harness@0.1.0-alpha.0 private
├── tsconfig.json                 # extends ../../tsconfig.base.json
├── upng-js.d.ts                  # ambient module declaration (Phase 0 Plan 03 deviation #1)
├── src/lib/                      # shared utilities (was tests/phase-0/_shared/)
│   ├── schemas.ts                # Zod EvidenceMeta + discriminated unions
│   ├── output.ts                 # writeJsonEvidence + writeCsvEvidence → repo-root docs/perf/phase-0/
│   ├── stats.ts                  # percentile R-7, hartiganDipTest, ci95
│   ├── branch-decision.ts        # deriveBranch + DEFAULT_THRESHOLDS (D-09/D-10/D-12)
│   └── hub.ts                    # loadHub + isHubAvailable (env-only credential)
├── scripts/                      # hardware test scripts — tsx-executable
│   ├── 10-0-1-r1-timing.ts
│   ├── 10-0-2-image-format.ts
│   ├── 10-0-3-ble-multi-env.ts
│   ├── 10-0-7-dle-sustained.ts
│   ├── 10-0-8-queue-depth.ts
│   ├── 10-0-9-palette-calibration.ts
│   ├── midiqol-config-probe.ts
│   └── run-all.ts                # orchestrator with --skip-hardware flag
├── tests/
│   └── path-resolution.test.ts   # smoke test for Pitfall 8 (writer → repo-root)
└── foundry-modules/
    └── midiqol-probe-module/     # Foundry-side artifact for MIDIQ-01 probe
```

## How to run

### Software-only smoke (Vitest, no hardware)

```bash
pnpm test --filter @evf/validation-harness --run
```

### Hardware-bound (requires Even Hub access + real G2 / R1 / phone)

```bash
# Skip hardware (Pattern 3 capability-negotiation skip, exit 2)
pnpm --filter @evf/validation-harness validate:all:skip-hardware

# Full run (with hardware grant)
EVEN_HUB_TOKEN=... pnpm --filter @evf/validation-harness validate:all

# Individual scripts (operational granularity per Phase 0 Plan 04)
pnpm --filter @evf/validation-harness validate:r1-timing
pnpm --filter @evf/validation-harness validate:image-format
pnpm --filter @evf/validation-harness validate:ble-multi-env
pnpm --filter @evf/validation-harness validate:dle-sustained
pnpm --filter @evf/validation-harness validate:queue-depth
pnpm --filter @evf/validation-harness validate:palette-calibration
pnpm --filter @evf/validation-harness validate:midiqol-probe
```

Evidence is always written to **repo-root** `docs/perf/phase-0/` regardless of cwd, via
`EVF_REPO_ROOT` env override or `path.resolve(import.meta.dirname, '../../../..')` default.

### Override evidence root (CI / sandbox)

```bash
EVF_REPO_ROOT=/tmp/evf-test pnpm --filter @evf/validation-harness validate:all:skip-hardware
```

## Test-file split (RESEARCH Open Question 1)

- `scripts/` — hardware-bound, tsx-executable, operationally controlled by researcher (Phase 0 Plan 04).
  Not Vitest-runnable: SDK callbacks + CLI prompts + 30-min wall-clock runs don't fit Vitest's discover-and-run model.
- `tests/` — software-only smoke (e.g. `path-resolution.test.ts` for Pitfall 8). Runs via `pnpm test`.

## Migration from `tests/phase-0/`

| Was                                                                          | Is now                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `tests/phase-0/package.json`                                                 | DELETED (inherits workspace)                                                            |
| `tests/phase-0/tsconfig.json`                                                | DELETED (extends `../../tsconfig.base.json`)                                            |
| `tests/phase-0/_shared/{schemas,output,stats,branch-decision,hub}.ts`        | `packages/validation-harness/src/lib/{schemas,output,stats,branch-decision,hub}.ts`     |
| `tests/phase-0/10-0-*.ts` + `midiqol-config-probe.ts` + `run-all.ts`         | `packages/validation-harness/scripts/*.ts`                                              |
| `tests/phase-0/upng-js.d.ts`                                                 | `packages/validation-harness/upng-js.d.ts`                                              |
| `tests/phase-0/midiqol-probe-module/`                                        | `packages/validation-harness/foundry-modules/midiqol-probe-module/`                     |

## See also

- `.planning/phases/00-validation-gates/00-{01,02,03}-SUMMARY.md` — Phase 0 plans context
- `.planning/phases/01-foundation/01-CONTEXT.md` D-1.02 — fold-in decision
- `docs/architecture/0005-phase0-go-no-go.md` — ADR consuming validation evidence
