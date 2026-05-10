---
phase: 00-validation-gates
plan: 03
subsystem: validation-harness
tags: [phase-0, hardware-tests, ble, dle, queue-depth, image-format, r1-timing, palette-calibration, pre-grant-scaffold]
dependency-graph:
  requires:
    - tests/phase-0/_shared/{schemas,output,stats,branch-decision,hub}.ts (Plan 01)
  provides:
    - tests/phase-0/10-0-1-r1-timing.ts (R1 gesture window measurement, Specs §10.0.1)
    - tests/phase-0/10-0-2-image-format.ts (updateImageRawData byte-format probe, Specs §10.0.2)
    - tests/phase-0/10-0-3-ble-multi-env.ts (BLE bandwidth multi-env multi-percentile, Specs §10.0.3 + D-09)
    - tests/phase-0/10-0-7-dle-sustained.ts (DLE 30-min sustained throughput, Specs §10.0.7 + Pitfall 10)
    - tests/phase-0/10-0-8-queue-depth.ts (queue depth empirical {1,2,3,≥4} table, Specs §10.0.8 + D-10)
    - tests/phase-0/10-0-9-palette-calibration.ts (CIE L* palette derivation, Specs §10.0.9 + Pitfall 15)
    - tests/phase-0/upng-js.d.ts (ambient module declaration for upng-js@2.1.0)
  affects:
    - Plan 00-04 (closure runs these 6 hardware scripts post Even Hub access grant + 3 RF env physical setup; aggregates all evidence into ADR-0005 Branch verdict + ADR-0006 raster pipeline conditional)
    - Phase 4a (raster pipeline): receives Branch A/B/C verdict + image format + queue depth tier + palette table from these tests' evidence
    - Phase 6 (R1 INV-5 design): receives recommended_windows_ms (tap_max, double_tap_max, long_press_min) from 10-0-1 evidence
tech-stack:
  added:
    - upng-js@2.1.0 (devDep — CLAUDE.md §11.5.7 pinned; ambient .d.ts declared in tests/phase-0/upng-js.d.ts since package ships no types and @types/upng-js does not exist on npm)
  patterns:
    - "Pattern 3 capability-negotiation skip: every hardware script calls loadHub() and emits verdict='skipped' evidence + exit 2 when Hub unavailable (pre-grant operational uniformity)"
    - "THRESHOLDS pre-committed top-level (D-12 strict numeric) — no env-var overrides, no runtime tuning, ADR-0005 cites THRESHOLDS const literally"
    - "Pre-grant build / post-grant execute: scaffold COMPLETE today; researcher launches scripts unchanged once Even Hub developer access lands"
    - "INV-2 traceability via probe_pattern_hash: 10-0-2-image-format.ts captures sha256 of all 3 candidate format payloads to anchor canonical probe pattern across re-runs (Pitfall 7 mitigation 2)"
    - "Multi-percentile envelope (D-09) NOT re-declared in 10-0-3 — script imports DEFAULT_THRESHOLDS from _shared/branch-decision.ts (single source of truth)"
key-files:
  created:
    - tests/phase-0/10-0-1-r1-timing.ts
    - tests/phase-0/10-0-2-image-format.ts
    - tests/phase-0/10-0-3-ble-multi-env.ts
    - tests/phase-0/10-0-7-dle-sustained.ts
    - tests/phase-0/10-0-8-queue-depth.ts
    - tests/phase-0/10-0-9-palette-calibration.ts
    - tests/phase-0/upng-js.d.ts
  modified:
    - tests/phase-0/package.json (added upng-js@2.1.0 to devDependencies)
    - tests/phase-0/pnpm-lock.yaml (updated by pnpm install)
    - tests/phase-0/.gitignore (added docs/ subdirectory exclusion for runtime evidence written under cwd=tests/phase-0)
decisions:
  - "Task 1 files (10-0-7/8/9 + package.json upng-js add) were committed by Plan 02 as a side effect of parallel Wave 1 execution (commit 15e9922 — 'feat(00-02): add MidiQOL config probe + Foundry mini-module'). Plan 03 Task 1 deliverables were authored here but bundled into the Plan 02 commit. Verified file content matches Plan 03 spec exactly via git diff HEAD (zero deviation). Plan 03 Task 2 commit (3b2578d) covers the remaining 4 files (10-0-1, 10-0-2, 10-0-3, upng-js.d.ts)."
  - "upng-js@2.1.0 ships no .d.ts and @types/upng-js does not exist on npm (verified 2026-05-10). Created tests/phase-0/upng-js.d.ts with ambient module declaration for the encodeLL function used in 10-0-2-image-format.ts. Inline declare module pattern initially attempted but failed with TS2665 (cannot augment untyped resolved module) — moved to standalone ambient .d.ts which TS picks up via tsconfig include='**/*.ts' (matches .d.ts files too)."
  - "10-0-1 R1 skip case populated with all 6 gesture keys (empty stubs n=0) — Zod 4 z.record(z.enum, schema) requires all enum keys present at runtime (vs Zod 3 partial-record behavior). Bug discovered via smoke-test exit code mismatch (1 instead of 2)."
  - "Runtime evidence written by writeJsonEvidence resolves docs/perf/phase-0/ relative to process.cwd(). When running scripts from tests/phase-0/ dir during smoke testing, evidence lands in tests/phase-0/docs/ — added to .gitignore. Plan 04 execution will run scripts from repo root so evidence lands in the canonical docs/perf/phase-0/ committed location."
metrics:
  duration: "~25 minutes (Task 1 author 23:20:31 + Task 2 commit 23:27:33 + fix commit 23:29:00, 2026-05-10)"
  tasks: 2
  files: 9
  completed: 2026-05-10
---

# Phase 0 Plan 03: 6 Hardware Test Scripts (Pre-Grant Build) Summary

Tutti e 6 gli script hardware-bound (`10-0-{1,2,3,7,8,9}-*.ts`) implementati come TypeScript COMPLETI ed eseguibili — type-check verde sotto `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`, importano da `_shared/` (Plan 01), gestiscono Hub-unavailable case via Pattern 3 capability-negotiation skip (verdict="skipped" evidence + exit 2). Pre-grant scaffold COMPLETO: quando l'Even Hub developer access arriva, gli script si lanciano senza modifiche di codice.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 3 lighter hardware scripts (DLE / queue depth / palette calibration) + upng-js dep | `15e9922` (Plan 02 cross-Wave bundling — see Deviations) | `tests/phase-0/{10-0-7-dle-sustained.ts, 10-0-8-queue-depth.ts, 10-0-9-palette-calibration.ts, package.json, pnpm-lock.yaml}` |
| 2 | 3 hardware scripts (R1 timing / image format / BLE multi-env) + upng-js ambient types | `3b2578d` | `tests/phase-0/{10-0-1-r1-timing.ts, 10-0-2-image-format.ts, 10-0-3-ble-multi-env.ts, upng-js.d.ts}` |
| (fix) | R1 skip-case schema compliance + .gitignore runtime evidence | `8670b0c` | `tests/phase-0/{10-0-1-r1-timing.ts, .gitignore}` |

## Build Verification

```bash
$ cd tests/phase-0 && pnpm exec tsc --noEmit
$ echo $?
0
```

Type-check verde sotto TS strict + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (CLAUDE.md INV-4 mandate).

## Smoke Test (Hub-Unavailable → Pattern 3 Skip)

Tutti i 6 script eseguiti da tsx con Hub-unavailable (no `globalThis.bridge`):

| Script | Exit Code | Evidence Emitted | Status |
|--------|-----------|-------------------|--------|
| `10-0-1-r1-timing.ts` | 2 | `verdict="skipped"` + 6-gesture empty stubs | OK |
| `10-0-2-image-format.ts` | 2 | `verdict="skipped"` + identified_format="none" | OK |
| `10-0-3-ble-multi-env.ts` (`RF_ENV=clean`) | 2 | `verdict="skipped"` + env=clean preserved | OK |
| `10-0-7-dle-sustained.ts` | 2 | `verdict="skipped"` + duration_sec=1 (positive() workaround) | OK |
| `10-0-8-queue-depth.ts` | 2 | `verdict="skipped"` + table populated | OK |
| `10-0-9-palette-calibration.ts` | 2 | `verdict="skipped"` + iterations=1 (positive() workaround) | OK |

## Threshold Values Hardcoded (D-12 Verifiability Gate)

Ogni script ha `THRESHOLDS` pre-committed top-level — NO runtime overrides, NO env vars (eccezione: `RF_ENV` in 10-0-3 ma è enum-only metadata per environment selection, NON soglia).

| Script | THRESHOLDS Constants |
|--------|----------------------|
| `10-0-1-r1-timing.ts` | `samples_per_gesture_per_session: 30`, `sessions: 5`, `bimodality_p_threshold: 0.05`, `long_press_min_ms_floor: 500` |
| `10-0-2-image-format.ts` | `width: 200`, `height: 100`, `hold_per_format_sec: 5` |
| `10-0-3-ble-multi-env.ts` | `duration_ms: 30 * 60 * 1000`, `tile_size_bytes: 4096`, `tile_interval_ms: 100`, `baseline_window_samples: 60`, `renegotiation_drop_threshold_pct: 50` (+ delegates Branch envelope to `DEFAULT_THRESHOLDS` from `_shared/branch-decision.ts`) |
| `10-0-7-dle-sustained.ts` | `duration_ms: 30 * 60 * 1000`, `tile_size_bytes: 4096`, `tile_interval_ms: 100`, `heartbeat_size_bytes: 50`, `heartbeat_interval_ms: 2000`, `renegotiation_drop_threshold_pct: 50`, `pass_p99_kbps: 100` |
| `10-0-8-queue-depth.ts` | `burst_size: 8`, `settle_timeout_ms: 5000`, `tile_size_bytes: 4096` (+ delegates tier verdict to `deriveQueueDepthTier()` from `_shared/branch-decision.ts`) |
| `10-0-9-palette-calibration.ts` | `palette_steps: 16`, `max_iterations: 3`, `spacing_uniformity_pct_threshold: 10`, `ramp_width: 192`, `ramp_height: 32` |

Per D-12: "strict numeric, no discretion" — researcher cannot tune verdict post-hoc; ADR-0005 (Plan 04) cites these constants + the `deriveBranch()` algorithm as the canonical decision protocol.

## Threat Model T-00-03 Verification (Zero Network Introspection)

```bash
$ grep -rE 'navigator\.connection\.|networkInterfaces\(|getNetworkInfo\(|WiFi\.scan\(' tests/phase-0/10-0-*.ts
$ echo $?
1   # zero matches — no actual API calls
```

Comments referencing the mitigated APIs are present (documenting the threat) but ZERO actual API invocations. `RF_ENV` env var in `10-0-3-ble-multi-env.ts` is constrained to enum `{clean, 5ghz-loaded, 2-4ghz-microwave}` (Zod-validated via `BleMultiEnvResult` schema) — no SSID/MAC/BSSID/channel propagated to evidence files.

## Truths Upheld (cross-ref to PLAN must_haves)

- ✅ 6 hardware test scripts exist at `tests/phase-0/10-0-*.ts` (verified: `ls tests/phase-0/10-0-*.ts` returns 6 entries)
- ✅ Each script implements: load Hub via `_shared/hub.ts` → measure → derive verdict via `_shared/branch-decision.ts` → write evidence via `_shared/output.ts` (verified: import statements grep-match across all 6 files)
- ✅ Each script handles Hub-unavailable case via Pattern 3 capability-negotiation skip (verified: smoke test all 6 → exit 2)
- ✅ `10-0-1-r1-timing.ts`: n=30 per gesture × 6 gestures × 5 sessions; computes Hartigan dip test for tap/double-tap distinguishability (verified: grep `samples_per_gesture_per_session: 30`, `sessions: 5`, `hartiganDipTest`)
- ✅ `10-0-2-image-format.ts`: 3 candidate format payloads (PNG indexed via upng-js / raw 4-bit BE / raw 4-bit LE), researcher CLI prompt verdict (verified: `makeFormatA`/`makeFormatB`/`makeFormatC` + `readline` prompt)
- ✅ `10-0-3-ble-multi-env.ts`: parameterized via `RF_ENV` env var ∈ {clean, 5ghz-loaded, 2-4ghz-microwave}; 30-min sustained; computes p50/p95/p99 + renegotiation events; calls `deriveBranch()` with `DEFAULT_THRESHOLDS` (verified: all 4 import/literal grep-match)
- ✅ `10-0-7-dle-sustained.ts`: 30-min DLE with 50-byte heartbeat ping every 2 sec for inferred-MTU history (verified: `30 * 60 * 1000` + `heartbeat_size_bytes: 50` + `heartbeat_interval_ms: 2000`)
- ✅ `10-0-8-queue-depth.ts`: pushes 8 tiles back-to-back, derives table via `deriveQueueDepthTier()` (verified: `burst_size: 8` + `deriveQueueDepthTier` import)
- ✅ `10-0-9-palette-calibration.ts`: 16-step uniform ramp + ≤3 iteration loop deriving perceptual palette via inverse CIE L*; verifies spacing within ±10% (verified: `palette_steps: 16` + `max_iterations: 3` + `yToLstar` + `spacing_uniformity_pct_threshold: 10`)
- ✅ All scripts reference Specs §10.0.X canonical SoT in header comment + cite RESEARCH.md pitfall in pre-committed THRESHOLDS const
- ✅ All scripts type-check under TS strict + `noUncheckedIndexedAccess` (`pnpm exec tsc --noEmit` → exit 0)
- ✅ `upng-js@2.1.0` is the ONLY external runtime dep added (verified: `git diff HEAD~3 -- tests/phase-0/package.json`)

## Threat Model Status

| ID | Severity | Mitigation Implemented |
|----|----------|------------------------|
| T-00-01 | Medium | All 6 scripts conform to `*Result` Zod schemas from `_shared/schemas.ts` (Plan 01) — no auth fields ever land in evidence; `loadHub({ required: false })` reads `process.env.EVEN_HUB_TOKEN` only, never logs token. |
| T-00-03 | Low | `grep -rE 'navigator\.connection\.\|networkInterfaces(\|getNetworkInfo(\|WiFi\.scan(' tests/phase-0/10-0-*.ts` returns ZERO matches. `RF_ENV` enum-validated. Throughput sampled via SDK callback timestamps only (no link-layer detail). |
| T-00-04 | Low | Inherited from Plan 01 — `_shared/hub.ts` env-only credential; `tests/phase-0/.gitignore` excludes `.env*` and `*.secret.json`. This plan adds NO new credential surfaces. |

No high-severity threats. Block on: high → none flagged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] upng-js ambient module declaration cannot be inline-augmented when module already resolves untyped**
- **Found during:** Task 2 type-check (TS2665: "Invalid module name in augmentation. Module 'upng-js' resolves to an untyped module...")
- **Issue:** Plan code example placed `declare module "upng-js" { ... }` inline at top of `10-0-2-image-format.ts`. TypeScript loaded `upng-js` as resolved-untyped-any, then refused to augment it.
- **Fix:** Moved declaration to standalone `tests/phase-0/upng-js.d.ts` ambient file. `tsconfig.json` `include: ["**/*.ts"]` picks up `.d.ts` files automatically.
- **Files modified:** `tests/phase-0/upng-js.d.ts` (created), `tests/phase-0/10-0-2-image-format.ts` (removed inline `declare module` block, replaced with comment cross-reference)
- **Commit:** `3b2578d`

**2. [Rule 1 - Bug] Zod 4 z.record(z.enum, schema) requires all enum keys; plan skip-case used empty {}**
- **Found during:** Smoke test of 10-0-1-r1-timing.ts (exit code 1 instead of expected 2 + ZodError stack trace)
- **Issue:** Plan code example for skip case used `gestures: {}`. In Zod 4, `z.record(z.enum([...]), schema)` is exhaustive — all 6 gesture keys must be present. Validation failed with "expected object, received undefined" per missing key, throwing before `process.exit(2)` could fire (resulting in fatal exit 1).
- **Fix:** Populated all 6 gesture keys with empty stub `{ mean_ms: 0, sd_ms: 0, p95_ms: 0, n: 0 }` for skip case. Smoke test now exits 2 cleanly with valid Zod-conformant skip evidence.
- **Files modified:** `tests/phase-0/10-0-1-r1-timing.ts`
- **Commit:** `8670b0c`

**3. [Rule 1 - Bug] Several integer-positive Zod fields rejected `0` in skip cases**
- **Found during:** Task 1 implementation (DLE skip case) + Task 2 implementation (R1, BLE skip cases)
- **Issue:** Plan code examples passed `duration_sec: 0`, `initial_mtu_bytes: 0`, `iterations: 0`, `sessions: 0`, `samples_per_gesture: 0` in skip cases. Zod schemas use `z.number().int().positive()` which excludes 0.
- **Fix:** Skip cases use `1` as the schema-minimum sentinel (semantically "no measurement performed"; verdict field carries the "skipped" signal). Real measurement runs override with actual values.
- **Files modified:** `tests/phase-0/10-0-1-r1-timing.ts`, `tests/phase-0/10-0-3-ble-multi-env.ts`, `tests/phase-0/10-0-7-dle-sustained.ts`, `tests/phase-0/10-0-9-palette-calibration.ts`
- **Commits:** `15e9922` (Task 1 bundled), `3b2578d` (Task 2)

**4. [Rule 3 - Blocker] Runtime evidence files leaked to git status when scripts run from tests/phase-0/ cwd**
- **Found during:** Smoke test (evidence files appeared as untracked under `tests/phase-0/docs/perf/phase-0/`)
- **Issue:** `_shared/output.ts` resolves `docs/perf/phase-0` via `path.resolve()` which is cwd-relative. Smoke testing from inside `tests/phase-0/` writes evidence under that subdirectory instead of the canonical repo-root `docs/perf/phase-0/` path. Evidence files would have leaked into git tracking on next `git add`.
- **Fix:** Added `docs/` line to `tests/phase-0/.gitignore` with comment explaining the cwd-relative behavior. Plan 04 execution will run scripts from repo root so canonical evidence path is used (and committed). Local smoke testing now safely writes to gitignored runtime location.
- **Files modified:** `tests/phase-0/.gitignore`
- **Commit:** `8670b0c`

**5. [Rule 3 - Operational] Task 1 deliverables bundled into Plan 02 commit due to parallel Wave 1 execution**
- **Found during:** Task 1 staging (`git status --short` showed all 5 Task 1 files as already-tracked; `git diff HEAD` returned empty — files identical to committed)
- **Issue:** Plan 02 (MidiQOL probe, also Wave 1) and Plan 03 (this plan) ran in parallel per CONTEXT.md D-02 partial-parallel sequencing. Plan 02's commit `15e9922` (`feat(00-02): add MidiQOL config probe + Foundry mini-module`) snapshot of `tests/phase-0/` directory captured Plan 03 Task 1 work-in-progress (10-0-7/8/9 + package.json upng-js add) since both plans share `tests/phase-0/` as their working tree. The commit message references only MidiQOL but the file list includes Plan 03 Task 1 deliverables.
- **Fix:** No code change required — files committed exactly match Plan 03 spec (verified via git diff HEAD returning empty after re-authoring locally). Documenting deviation here for traceability. Plan 03 Task 2 commit (`3b2578d`) is clean and contains only the 4 files that this plan owns end-to-end (10-0-1, 10-0-2, 10-0-3, upng-js.d.ts).
- **Upstream impact:** None for execution. Documentation-only artifact for ADR-0005 commit-graph traceability — Plan 04 will note that Phase 0 Wave 1 scripts span commits `15e9922 + 3b2578d + 8670b0c`.
- **Commits affected:** `15e9922` (Plan 02 commit absorbing Plan 03 Task 1 files), `3b2578d` (Plan 03 Task 2 clean), `8670b0c` (Plan 03 fix-up clean)

### Auth Gates Encountered

None — Plan 03 is pre-grant scaffold-only. Authentication gates land in Plan 04 (post Even Hub developer access grant for actual script execution against G2 hardware).

## Hand-off to Plan 04

Plan 04 (Phase 0 closure) will:

1. **Pre-execution prerequisites checklist:**
   - Even Hub developer access granted (D-01 milestone)
   - 3 RF environments physically prepared (clean / 5GHz-loaded / 2.4GHz+microwave per CONTEXT.md D-09)
   - G2 + R1 paired with Even Realities App on test phone
   - Camera with locked exposure available for §10.0.9 palette calibration
   - Foundry test world running with MidiQOL installed (for Plan 02 probe re-run)

2. **Execution sequence (estimated ~4-5 hours total measurement time):**
   - `10-0-1-r1-timing.ts`: ~15 min (5 sessions × 6 gestures × ~30 sec per gesture batch)
   - `10-0-2-image-format.ts`: ~5 min (3 formats × 5 sec hold + photo capture)
   - `10-0-3-ble-multi-env.ts` × 3 envs: 3 × 30 min = 90 min
   - `10-0-7-dle-sustained.ts`: 30 min
   - `10-0-8-queue-depth.ts`: ~1 min (single 5-sec burst + verdict)
   - `10-0-9-palette-calibration.ts`: ~10 min (≤3 iterations × ~3 min photo+JSON cycle)
   - `midiqol-config-probe.ts` (Plan 02): ~2 min

3. **Post-execution aggregation:**
   - Commit all `docs/perf/phase-0/*.json` evidence files
   - Read all 3 BLE multi-env JSONs into `deriveBranch()` for final ADR-0005 Branch verdict
   - Read queue-depth JSON for tier (cross-validate with deriveBranch decision via `deriveQueueDepthTier()`)
   - Populate ADR-0005 Branch Verdict + Per-Test Verdict rows + Cross-Reference paths
   - Resolve ADR-0006 conditional content per Branch verdict (D-14):
     - Branch A/B → confirm `image-q@4.0.0` + `upng-js@2.1.0` + `xxhash-wasm@1.1.0` raster pipeline + drift signal note
     - Branch C → declare raster pipeline deferred to Phase 13 stretch
   - INV-3 doc coherence cross-check (Specs.md + README.md + showcase/index.html update in same commit)

4. **Failure modes Plan 04 must handle:**
   - Hub access delayed → invoke skip-pattern fallback per CONTEXT.md D-03 (proceed Phase 1 monorepo + 5 ADR placeholders)
   - Borderline measurements within ±5% of cutoff → automatic safe-downgrade per D-12 (no researcher discretion)
   - 10-0-2 verdict "none" → Phase 4a raster blocked OR SDK signature mismatch → re-verify post-grant SDK API docs

## Self-Check: PASSED

Verifications performed (all passed):
- All 6 hardware test scripts exist at expected paths (ls returned 6 entries)
- All 3 task commits present in `git log`: `15e9922` (Plan 02 cross-Wave bundling of Task 1 deliverables), `3b2578d` (Task 2), `8670b0c` (fix-up)
- `cd tests/phase-0 && pnpm exec tsc --noEmit` exits 0
- `grep -q '"upng-js": "2.1.0"' tests/phase-0/package.json` exits 0
- T-00-03 verification: `grep -rE 'navigator\.connection\.|networkInterfaces(|getNetworkInfo(|WiFi\.scan(' tests/phase-0/10-0-*.ts` returns ZERO actual API calls
- Pattern 3 skip uniformity: all 6 scripts grep-match `loadHub` AND `"skipped"` (verified via for-loop)
- No cross-test coupling: no script imports from `./10-0-*` peer (verified via for-loop)
- All 6 scripts smoke-tested with Hub-unavailable → all exit 2 (Pattern 3 skip)
- All 7 must_haves.artifacts contains-patterns grep-match (verified inline in build-verification section)
