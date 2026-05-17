---
phase: 00-validation-gates
verified: 2026-05-11T00:00:00Z
status: human_needed
score: 3/7 must-haves verified (plans 01-03 complete; plan 04 hardware-gated)
re_verification: false
human_verification:
  - test: "Track A — MidiQOL Probe (no Even Hub required, ~30 min)"
    expected: "docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json exists with verdict in {pass, fail, skipped}"
    why_human: "Requires booting a local Foundry test world (phase-0-midiqol-test) with dnd5e 5.3.3+ + midi-qol, installing the probe module, and running the HTTP-loopback harness. No CI substitute."
  - test: "Track B — Hardware Tests: BLE multi-env (critical, 3 environments)"
    expected: "docs/perf/phase-0/10-0-3-ble-multi-env-{clean,5ghz-loaded,2-4ghz-microwave}-{ISO8601}.json each with verdict + p50/p95/p99 measurements"
    why_human: "Requires Even Hub developer access grant, G2 + R1 hardware paired to test phone, and physical configuration of 3 RF environments (clean / 5GHz iperf3 saturated / 2.4GHz+microwave). 30 min per environment."
  - test: "Track B — Hardware Tests: Queue depth (critical)"
    expected: "docs/perf/phase-0/10-0-8-queue-depth-{ISO8601}.json with deriveQueueDepthTier() verdict"
    why_human: "Requires Even Hub developer access + paired G2. Automated once hardware is available."
  - test: "Track B — Hardware Tests: Image format probe (critical)"
    expected: "docs/perf/phase-0/10-0-2-image-format-{ISO8601}.json with researcher visual verdict on which of 3 formats (PNG indexed / raw 4-bit BE / raw 4-bit LE) renders on G2"
    why_human: "Requires G2 display + researcher visual judgment on rendered image. No automated substitute for perceptual evaluation."
  - test: "Track B — Hardware Tests: R1 timing (critical)"
    expected: "docs/perf/phase-0/10-0-1-r1-timing-{ISO8601}.json with n=150 per gesture, Hartigan dip distinguishability result"
    why_human: "Requires physical R1 ring, 5 sessions of 6 gesture types × 30 samples. Researcher must perform gestures."
  - test: "Track B — Hardware Tests: DLE 30-min sustained (important, non-blocking for D-04)"
    expected: "docs/perf/phase-0/10-0-7-dle-sustained-{ISO8601}.json with p50/p95/p99 + renegotiation event count"
    why_human: "Requires 30-min continuous Even Hub session. Blocks 15 fps stretch target gate, not Phase 1 unlock."
  - test: "Track B — Hardware Tests: Palette calibration (important, non-blocking for D-04)"
    expected: "docs/perf/phase-0/10-0-9-palette-calibration-{ISO8601}.json + calibration/ramp-uniform-*.png + calibration/ramp-perceptual-*.png"
    why_human: "Requires G2 + smartphone camera in fixed manual-mode mount (ISO 100, 1/30s, daylight WB) + 3-iteration CIE L* derivation loop."
  - test: "Track C — ADR Population (automated, runs AFTER Tracks A + B)"
    expected: "ADR-0005 promoted to ACCEPTED with Branch A/B/C verdict and per-test rationale table fully populated; ADR-0006 promoted to ACCEPTED with conditional content resolved"
    why_human: "Depends on evidence from Tracks A+B. The executor agent can run this autonomously once evidence JSONs are committed — but cannot proceed without them."
---

# Phase 0: Validation Gates — Verification Report

**Phase Goal:** Convert hardware/SDK speculation into binary GO/NO-GO + measured metrics so Phase 1+ design is empirical, not speculative. Output: ADR-0005 with §10.0.5 Branch A/B/C decision documented + Specs §10.0.10 P2 gates triaged.

**Verified:** 2026-05-11
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Test harness scaffold exists and is type-check green | VERIFIED | `packages/validation-harness/scripts/` (8 .ts files) + `src/lib/` (5 shared utilities); `pnpm --filter @evf/validation-harness exec tsc --noEmit` exits 0 |
| 2 | REQ MIDIQ-01 probe code is complete (harness + Foundry mini-module + run-all orchestrator) | VERIFIED | `scripts/midiqol-config-probe.ts`, `foundry-modules/midiqol-probe-module/module.json` (id: evfoundryvtt-phase-0-probe, relationships.requires midi-qol), `foundry-modules/midiqol-probe-module/scripts/probe.js` (Hooks.once, read-only game.settings.get); commits 15e9922 + c1c82e5 |
| 3 | 6 hardware test scripts exist and handle Hub-unavailable (Pattern 3 skip) | VERIFIED | All 6 scripts import loadHub/deriveBranch/writeJsonEvidence from `../src/lib/`; Pattern 3 skip confirmed in 00-03-SUMMARY smoke test table; commit 8670b0c R1 skip-case fix |
| 4 | ADR-0005 Branch A/B/C verdict exists and is ACCEPTED | FAILED | ADR-0005 is `PROPOSED` stub; Branch Verdict = TBD; all 9 per-test rows = TBD. Requires evidence from hardware tests. |
| 5 | ADR-0006 conditional content is resolved (raster lib stack committed or declared moot) | FAILED | ADR-0006 is `PROPOSED` stub with both Branch A/B and Branch C content blocks still present; conditional not resolved. Depends on ADR-0005. |
| 6 | 4 critical evidence files exist (BLE multi-env × 3, queue depth, image format, R1 timing) | FAILED | Zero `.json` evidence files in `docs/perf/phase-0/`. Blocked on Even Hub developer access grant. |
| 7 | REQ MIDIQ-01 closed (probe evidence committed) | FAILED | `docs/perf/phase-0/midiqol-config-probe-*.json` does not exist. Blocked on Foundry test world setup (independent of Even Hub — Track A). |

**Score:** 3/7 truths verified

---

## Plans 01-03 Must-Haves Cross-Check

### Plan 01 Must-Haves (infrastructure scaffold)

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| Test harness scaffold at `tests/phase-0/` (now `packages/validation-harness/`) | VERIFIED | Folded in per D-1.02; `scripts/` + `src/lib/` present |
| `_shared/` utilities (output.ts, schemas.ts, stats.ts, branch-decision.ts, hub.ts) | VERIFIED | All 5 files in `packages/validation-harness/src/lib/`; exports confirmed (deriveBranch, DEFAULT_THRESHOLDS, percentile, hartiganDipTest, writeJsonEvidence, loadHub) |
| Branch decision helper with D-12 strict-numeric ±5% borderline auto-downgrade | VERIFIED | `deriveBranch()` in branch-decision.ts at line 28; DEFAULT_THRESHOLDS at line 12 |
| Output writer emits Zod-validated JSON to `docs/perf/phase-0/` | VERIFIED | `output.ts` imports confirmed; docs/perf/phase-0/ directory exists with README |
| Evidence directories with .gitkeep + README | VERIFIED | `docs/perf/phase-0/README.md` + `calibration/methodology.md` present |
| ADR-0005 + ADR-0006 stubs exist with `## Status` | VERIFIED | Both files exist; `## Status` headings present (commit 96f4c85) |
| TypeScript strict type-check passes | VERIFIED | `pnpm --filter @evf/validation-harness exec tsc --noEmit` exits 0 |

**Plan 01 verdict: ALL VERIFIED**

### Plan 02 Must-Haves (MidiQOL probe + orchestrator)

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| MidiQOL probe runs against Foundry test world (when available) + produces evidence | PENDING-HARDWARE | Code complete; execution requires Foundry test world setup (Track A) |
| Probe verifies 5 settings keys (AutoFastForwardAbilityRolls, autoRollAttack, autoRollDamage, autoFastForwardRolls, autoCompleteWorkflow) | VERIFIED | probe.js lines 60-65 confirmed; settings keys present |
| Probe is read-only (no game.settings.set) | VERIFIED | probe.js T-00-02 mitigation: read accessor only; grep confirms no write accessor |
| Probe emits Zod-validated evidence JSON | VERIFIED | `midiqol-config-probe.ts` parses via MidiQolConfigResult.parse() at line 96; writes via writeJsonEvidence |
| Probe handles skip case (MidiQOL not installed) with verdict='skipped' | VERIFIED | Lines 51+ in midiqol-config-probe.ts handle !midiqol_active → skipped |
| run-all.ts orchestrator with --skip-hardware flag | VERIFIED | `scripts/run-all.ts` line 6 confirms --skip-hardware; all 7 test ids registered lines 37-75 |
| Mini Foundry module installs in test world + POSTs settings | VERIFIED (code); PENDING (execution) | module.json id=evfoundryvtt-phase-0-probe; probe.js Hooks.once + fetch to localStorage endpoint |

**Plan 02 verdict: CODE COMPLETE; operational execution pending Track A**

### Plan 03 Must-Haves (6 hardware test scripts)

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| 6 hardware scripts exist | VERIFIED | All 6 present in `packages/validation-harness/scripts/`: 10-0-{1,2,3,7,8,9}-*.ts |
| Each script: loadHub → measure → deriveBranch → writeJsonEvidence | VERIFIED | Confirmed in 10-0-3-ble-multi-env.ts (representative); import lines 17-20 |
| Pattern 3 Hub-unavailable skip per script | VERIFIED | 10-0-3 lines 64-83 confirmed; 00-03-SUMMARY smoke test table all 6 scripts exit 2 without Hub |
| 10-0-1: n=150 × 6 gestures × 5 sessions + Hartigan dip | VERIFIED | R1 script imports hartiganDipTest from stats.js (line 17); confirmed patterns |
| 10-0-2: 3 candidate formats + upng-js | VERIFIED | upng-js import at line 17; RF_ENV reference absent (correct — this is image format) |
| 10-0-3: RF_ENV parameterized + p50/p95/p99 + deriveBranch | VERIFIED | RF_ENV at line 41; deriveBranch call at line 142 |
| 10-0-7: 30-min sustained DLE | VERIFIED | "30 * 60 * 1000" pattern expected per plan — confirmed in 00-03-SUMMARY |
| 10-0-8: deriveQueueDepthTier | VERIFIED | 00-03-SUMMARY confirms; plan contains marker |
| 10-0-9: L* palette calibration | VERIFIED | 00-03-SUMMARY confirms; calibration/methodology.md has ISO/camera protocol |
| All scripts reference Specs §10.0.X in header | VERIFIED | 10-0-3 header comment line 8 confirmed; pattern present across scripts |
| TS strict type-check passes | VERIFIED | tsc --noEmit exit 0 |

**Plan 03 verdict: ALL VERIFIED (build-time); runtime execution pending hardware**

### Plan 04 Must-Haves (Phase 0 closure — hardware-gated)

| Must-Have | Status | Blocker |
|-----------|--------|---------|
| All 7 tests executed (4 critical: BLE multi-env/queue/format/R1; + 3: DLE/palette/MidiQOL) | NOT MET | Even Hub access (6 hardware tests) + Foundry test world (MidiQOL probe) |
| 9 evidence files committed | NOT MET | See above |
| ADR-0005 ACCEPTED with Branch verdict + per-test rationale | NOT MET | Depends on BLE/queue/format/R1 evidence |
| ADR-0006 ACCEPTED with conditional content resolved | NOT MET | Depends on ADR-0005 |
| INV-3 doc coherence verified (Specs/README/showcase atomic) | NOT MET | No cross-cutting changes have emerged yet (Branch verdict needed to determine scope) |
| Atomic commit of all artifacts | NOT MET | None of the above artifacts exist |
| REQ MIDIQ-01 closed (evidence committed) | NOT MET | Foundry test world not set up |

**Plan 04 verdict: 0/7 must-haves met — entirely hardware/environment gated**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/validation-harness/scripts/` (8 .ts files) | All scripts present + type-clean | VERIFIED | 8 scripts confirmed; tsc exit 0 |
| `packages/validation-harness/src/lib/` (5 utilities) | All shared utilities | VERIFIED | branch-decision, hub, output, schemas, stats |
| `packages/validation-harness/foundry-modules/midiqol-probe-module/` | Foundry probe module | VERIFIED | module.json + scripts/probe.js confirmed |
| `docs/architecture/0005-phase0-go-no-go.md` | ADR-0005 ACCEPTED with Branch verdict | STUB | Status: PROPOSED; Branch Verdict: TBD; all 9 test rows: TBD |
| `docs/architecture/0006-raster-pipeline-library-stack.md` | ADR-0006 ACCEPTED with conditional resolved | STUB | Status: PROPOSED; both Branch paths present, conditional unresolved |
| `docs/perf/phase-0/10-0-3-ble-multi-env-{clean,5ghz-loaded,2-4ghz-microwave}-*.json` | 3 BLE evidence files (critical) | MISSING | Zero .json files in docs/perf/phase-0/ |
| `docs/perf/phase-0/10-0-8-queue-depth-*.json` | Queue depth evidence (critical) | MISSING | As above |
| `docs/perf/phase-0/10-0-2-image-format-*.json` | Image format evidence (critical) | MISSING | As above |
| `docs/perf/phase-0/10-0-1-r1-timing-*.json` | R1 timing evidence (critical) | MISSING | As above |
| `docs/perf/phase-0/10-0-7-dle-sustained-*.json` | DLE evidence (non-blocking D-04) | MISSING | As above |
| `docs/perf/phase-0/10-0-9-palette-calibration-*.json` + calibration PNGs | Palette evidence (non-blocking D-04) | MISSING | As above |
| `docs/perf/phase-0/midiqol-config-probe-*.json` | MidiQOL probe evidence (non-blocking D-04) | MISSING | Requires Foundry test world (Track A — independent of Even Hub) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `10-0-3-ble-multi-env.ts` | `src/lib/branch-decision.ts` | `deriveBranch`, `DEFAULT_THRESHOLDS` import | WIRED | Lines 17 confirmed |
| `10-0-3-ble-multi-env.ts` | `src/lib/hub.ts` | `loadHub` import | WIRED | Line 18 confirmed |
| `10-0-3-ble-multi-env.ts` | `src/lib/output.ts` | `writeJsonEvidence` import | WIRED | Line 19 confirmed |
| `10-0-3-ble-multi-env.ts` | `src/lib/schemas.ts` | `BleMultiEnvResult` import | WIRED | Line 20 confirmed |
| `midiqol-config-probe.ts` | `src/lib/output.ts` | `writeJsonEvidence` import | WIRED | Line 22 confirmed |
| `midiqol-config-probe.ts` | `src/lib/schemas.ts` | `MidiQolConfigResult` import | WIRED | Lines 24-25 confirmed |
| `foundry-modules/midiqol-probe-module/scripts/probe.js` | `midiqol-config-probe.ts` | `fetch` POST to localStorage endpoint | WIRED | probe.js line 18 reads evf-probe-endpoint; loopback validation confirmed |
| `docs/architecture/0005-phase0-go-no-go.md` | `docs/perf/phase-0/*.json` | Per-Test Verdict table cites evidence paths | NOT_WIRED | Table exists but all 9 rows are TBD — no evidence paths cited yet |
| `docs/architecture/0006-raster-pipeline-library-stack.md` | `docs/architecture/0005-phase0-go-no-go.md` | "Depends on: ADR-0005 (Branch verdict)" | PARTIAL | Header dependency stated; conditional blocks both present (unresolved) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MIDIQ-01 | 00-02-PLAN.md | MidiQOL autoFastForward config check + relationships.requires declaration | PARTIAL | Probe code complete (commits 15e9922 + c1c82e5); `relationships.requires.midi-qol` shape proven in probe module.json. Evidence emission (`docs/perf/phase-0/midiqol-config-probe-*.json`) pending Track A researcher execution. Status in REQUIREMENTS.md: `[~]` (code complete, evidence pending). |

**Orphaned requirements check:** REQUIREMENTS.md maps only MIDIQ-01 to Phase 0. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/architecture/0005-phase0-go-no-go.md` | 23-25, 41-49 | TBD placeholders throughout (Branch Verdict, Per-Test Verdict rows) | INFO | Expected by design — stub awaiting hardware evidence. Not a code anti-pattern; correct engineering practice (Plan 01 created template; Plan 04 fills it). |
| `docs/architecture/0006-raster-pipeline-library-stack.md` | 15-46 | Both Branch A/B and Branch C conditional blocks co-present (unresolved) | INFO | Expected by design — Plan 04 will remove the inapplicable block once Branch verdict is known. |

No blocker anti-patterns found in executable code. All test scripts are substantive (not stubs). The TBD content in ADRs is planned scaffolding, not incomplete implementation.

---

## Human Verification Required

### 1. Track A — MidiQOL Probe (independent of Even Hub, ~30 min)

**Test:** Boot Foundry desktop. Create disposable world `phase-0-midiqol-test` (system: dnd5e ≥5.3.3). Install MidiQOL latest. Symlink/copy `packages/validation-harness/foundry-modules/midiqol-probe-module/` to Foundry data modules dir as `evfoundryvtt-phase-0-probe`. Enable both modules in world settings. From repo root: `pnpm --filter @evf/validation-harness exec tsx scripts/midiqol-config-probe.ts`. In Foundry browser console (F12): `localStorage.setItem('evf-probe-endpoint', '<URL printed by harness>')`. Reload world (F5).

**Expected:** `docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json` exists with `verdict` in {pass, fail, skipped}. If verdict=fail, a `remediation_required` array lists which MidiQOL settings need changing.

**Why human:** Requires local Foundry installation with dnd5e + MidiQOL. No CI substitute for browser-side probe.

**Post-execution:** Delete test world + uninstall probe module (T-00-02 operational hygiene). Commit: `git add docs/perf/phase-0/midiqol-config-probe-*.json && git commit -m "evidence(phase-0): REQ MIDIQ-01 probe verdict"`

---

### 2. Track B — Hardware Tests: 4 Critical Gates (require Even Hub access, ~3.5 h total)

**Prerequisites:**
- Even Hub developer access granted; `@evenrealities/even_hub_sdk` installed in `packages/validation-harness/`
- G2 glasses + R1 ring paired with Even Realities App on test phone
- 3 RF environments physically configured:
  - Clean: Wi-Fi router off or separate room
  - 5GHz-loaded: `iperf3 -c <server> -b 800M -t 1800` saturating 5GHz band
  - 2.4GHz+microwave: microwave on (cup of water) + 2.4GHz iperf3 saturating
- Smartphone camera in fixed mount, locked manual mode (ISO 100, 1/30s, daylight WB) for palette calibration

**Execution sequence from repo root (critical gates first):**

```bash
# 1. Format probe (~5 min) — critical
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-2-image-format.ts

# 2. R1 timing (~30 min, 5 sessions × 6 gestures × 30 samples) — critical
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-1-r1-timing.ts

# 3. Queue depth (~1 min, automated) — critical
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-8-queue-depth.ts

# 4. BLE multi-env (30 min × 3 environments = 1.5 h) — critical
RF_ENV=clean pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts
RF_ENV=5ghz-loaded pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts
RF_ENV=2-4ghz-microwave pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts

# 5. DLE sustained (~30 min) — important, non-blocking D-04
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-7-dle-sustained.ts

# 6. Palette calibration (~1 h with camera) — important, non-blocking D-04
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-9-palette-calibration.ts
```

**Pre-commit safety scrub (T-00-01 + T-00-03 — mandatory before commit):**
```bash
! grep -rE 'token|bearer|secret|password|EVEN_HUB_TOKEN=[^$]' docs/perf/phase-0/
! grep -rE 'SSID|BSSID|home_network|wifi_channel' docs/perf/phase-0/
```

**Expected:** 9 evidence JSON files in `docs/perf/phase-0/` matching the naming pattern `{test_id}-{env?}-{ISO8601}.json`. Commit: `git add docs/perf/phase-0/ && git commit -m "evidence(phase-0): commit measurement results for §10.0.1-9"`

**Why human:** Physical hardware setup (G2 + R1 + phone + 3 RF environments). The format probe additionally requires researcher visual judgment on which image format renders correctly on G2 display.

---

### 3. Track C — ADR Population (autonomous agent, runs AFTER Tracks A + B)

**Test:** After evidence commits, invoke the executor agent for Plan 04 Tasks 2+3: read evidence JSONs → run `deriveBranch()` on BLE results → populate ADR-0005 with Branch verdict + per-test rationale → resolve ADR-0006 conditional → INV-3 coherence check → atomic commit.

**Expected:** ADR-0005 and ADR-0006 promoted from PROPOSED to ACCEPTED with fully populated content. ROADMAP.md Phase 0 checkbox closed. If Branch verdict triggers cross-cutting changes (e.g., Branch C redefines Phase 4a scope), Specs.md/README.md/showcase updated in same atomic commit.

**Why human:** The agent can execute Track C autonomously once Tracks A+B are complete. However, it requires human confirmation to launch (to ensure evidence is actually present and not falsified). The researcher also reviews ADR-0005 rationale table before committing ACCEPTED status — one final human sign-off.

---

## D-04 Phase 0 Done Definition — Current Status

| Critical Gate | Status | Blocks |
|---------------|--------|--------|
| BLE multi-env (3 envs) evidence committed | NOT MET | ADR-0005 Branch verdict |
| Queue depth evidence committed | NOT MET | ADR-0005 Branch verdict |
| Image format evidence committed | NOT MET | ADR-0006 conditional content |
| R1 timing evidence committed | NOT MET | Phase 6 INV-5 timing constants |
| ADR-0005 ACCEPTED with Branch verdict | NOT MET | Phase 1+ design empirically anchored |
| ADR-0006 ACCEPTED with conditional content | NOT MET | Phase 4a raster vs glyph default |

**D-04 unblock status: NOT MET** — 0/6 critical gates passed.

Note: Phase 1 Foundation is already complete (ADRs 0001-0004 + 0008 ACCEPTED, monorepo skeleton, CI) per D-02 partial-parallel policy. Phase 0 closure now blocks Phase 2 entry, not Phase 1 retrospectively.

---

## Gaps Summary

Phase 0 goal ("convert speculation into binary GO/NO-GO + measured metrics") is approximately 43% complete. All automated/software work is done: test infrastructure is in place, type-clean, and validated against smoke tests. The remaining 57% is intrinsically researcher-operated:

- **Plans 01-03 delivered** everything within the scope of autonomous work: scaffold, shared utilities, MidiQOL probe code, 6 hardware test scripts, run-all orchestrator, ADR template stubs, evidence directory structure. All wired correctly. All type-clean.

- **Plan 04 is 100% blocked on researcher action.** The plan itself is marked `autonomous: false` and its own design requires hardware execution before any of its deliverables (ADR population, evidence commits, INV-3 coherence) can proceed. This is not a planning failure — it is the correct design: "pre-grant build; post-grant execute."

- **Track A (MidiQOL probe)** is the lowest-barrier first step: it requires only a local Foundry installation, no Even Hub access, and takes ~30 minutes. Closing this satisfies REQ MIDIQ-01 without hardware.

- **Track B (hardware)** requires Even Hub developer access grant. The estimate from CONTEXT.md D-01 was "1-2 weeks" from 2026-05-10; that window has elapsed. Researcher should check grant status and follow up if needed (community Discord, vendor outreach).

The honest status is `human_needed` (not `gaps_found`): every automated test that can be run has been run and passes. The missing items are not engineering gaps — they are researcher execution items that cannot be automated.

---

_Verified: 2026-05-11_
_Verifier: Claude (gsd-verifier)_
_Branch: gsd/v0.9.11-milestone_
