---
phase: 00-validation-gates
plan: 04
subsystem: validation-harness
status: pending-hardware
tags: [phase-0, hardware-gated, adr-0005, adr-0006, ble-multi-env, r1-timing, midiqol]
dependency-graph:
  requires:
    - docs/perf/phase-0/*.json (9 evidence files — NOT YET PRODUCED)
    - Even Hub developer access grant (BLOCKING — not yet received)
    - Foundry test world `phase-0-midiqol-test` (BLOCKING — not yet set up)
  provides:
    - "PENDING: docs/architecture/0005-phase0-go-no-go.md (PROPOSED → ACCEPTED)"
    - "PENDING: docs/architecture/0006-raster-pipeline-library-stack.md (PROPOSED → ACCEPTED)"
    - "PENDING: 9 evidence files in docs/perf/phase-0/"
  affects:
    - Phase 0 closure (Phase 1+ design empirically anchored)
    - ADR-0005 Branch A/B/C verdict (gates ADR-0006 raster vs glyph default)
    - REQ MIDIQ-01 closure
key-files:
  created: []
  modified: []
decisions:
  - "Plan 04 execution gated on hardware prerequisites not yet met. SUMMARY written to record honest status, surface blockers, and document concrete next steps."
  - "Software-executable prerequisite: commit 2044df0 resolves path-resolution bug in validation-harness (SCRIPT_DIR-relative), making the harness runnable from any cwd. This was the last software-side blocker."
metrics:
  duration: "~10 minutes (assessment only; zero code/docs produced by this executor run)"
  tasks_completed: 0
  tasks_deferred: 4
  files: 0
  completed: 2026-05-11
---

# Phase 0 Plan 04: Phase 0 Closure — Status: PENDING-HARDWARE

**One-liner:** Hardware tests not yet executed; ADR-0005/0006 remain PROPOSED stubs; Phase 0 closure blocked on Even Hub developer access grant + Foundry test world setup.

## Executive Assessment

Plan 04 is `autonomous: false` with an explicit researcher-action gate (Task 1) that must precede all automated work (Tasks 2–3). As of 2026-05-11, **zero evidence files exist** in `docs/perf/phase-0/` (only `README.md` and `calibration/methodology.md` are present). Neither ADR has been promoted from PROPOSED. This SUMMARY records the verified state, outstanding blockers, and the concrete researcher checklist to unblock closure.

## Verification of Claimed Pre-Conditions

All state-of-the-world claims verified by direct inspection:

| Claim | Verified? | Evidence |
|-------|-----------|----------|
| `docs/perf/phase-0/` contains zero `.json` files | YES | `ls docs/perf/phase-0/` returns only `README.md` + `calibration/` |
| ADR-0005 status = `PROPOSED` (stub, all TBD fields) | YES | `grep "PROPOSED" docs/architecture/0005-phase0-go-no-go.md` matches; Branch Verdict = "TBD" |
| ADR-0006 status = `PROPOSED` (stub, both Branch paths present) | YES | `grep "PROPOSED" docs/architecture/0006-raster-pipeline-library-stack.md` matches |
| ROADMAP.md Phase 0 = `[ ]` (not closed) | YES | Line 18 `- [ ] **Phase 0: Validation Gates**` |
| STATE.md position = Phase 1 complete, Phase 0 open | YES | `current_position` = "Phase 1 (Foundation) — COMPLETE"; Phase 0 blockers still listed in Blockers/Concerns |
| Commit 2044df0 resolves path-resolution bug in validation-harness | YES | `git log --oneline` shows commit at HEAD |

## What IS Verified and Complete (software side)

| Item | Status | Commit(s) |
|------|--------|-----------|
| `_shared/` utilities (schemas, output, stats, branch-decision, hub) | COMPLETE | `40732fe`, `f301aaf`, `96f4c85` |
| MidiQOL probe harness + Foundry mini-module + run-all.ts | COMPLETE | `15e9922`, `c1c82e5` |
| 6 hardware test scripts (10-0-1 through 10-0-9) | COMPLETE | `15e9922`, `3b2578d`, `8670b0c` |
| ADR-0005 template stub (PROPOSED, all TBD fields) | COMPLETE | `96f4c85` |
| ADR-0006 template stub (PROPOSED, both Branch paths present) | COMPLETE | `96f4c85` |
| `packages/validation-harness/` fold-in (Phase 1 D-1.02) | COMPLETE | Phase 1 Plan 02 commits |
| Path-resolution bug fix (SCRIPT_DIR-relative, any cwd) | COMPLETE | `2044df0` |
| Pattern 3 skip uniformity (all 6 scripts → exit 2 without Hub) | COMPLETE | Verified in 00-03-SUMMARY.md smoke test table |

## What IS NOT Done (hardware-gated)

| Requirement | Status | Blocker |
|-------------|--------|---------|
| `docs/perf/phase-0/10-0-1-r1-timing-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-2-image-format-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-3-ble-multi-env-clean-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-3-ble-multi-env-5ghz-loaded-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-3-ble-multi-env-2-4ghz-microwave-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-7-dle-sustained-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-8-queue-depth-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/10-0-9-palette-calibration-*.json` | NOT PRODUCED | Even Hub access not granted |
| `docs/perf/phase-0/midiqol-config-probe-*.json` | NOT PRODUCED | Foundry test world not set up |
| ADR-0005 ACCEPTED (Branch verdict + per-test rationale) | NOT DONE | Depends on all 4 critical evidence files |
| ADR-0006 ACCEPTED (conditional content resolved) | NOT DONE | Depends on ADR-0005 Branch verdict |
| REQ MIDIQ-01 closed | NOT DONE | MidiQOL probe evidence pending |

## Concrete Researcher Checklist to Unblock Closure

Two independent tracks can proceed in parallel:

### Track A — MidiQOL Probe (no Even Hub required, ~30 min)

1. Boot Foundry desktop. Create disposable world `phase-0-midiqol-test` (system: dnd5e ≥5.3.3).
2. Install MidiQOL latest in that world.
3. Symlink/copy `packages/validation-harness/scripts/midiqol-probe-module/` to Foundry data modules dir as `evfoundryvtt-phase-0-probe`.
4. Enable both modules (dnd5e + midi-qol + probe) in world settings.
5. From repo root: `pnpm --filter @evf/validation-harness exec tsx scripts/midiqol-config-probe.ts`
6. In Foundry browser console (F12): `localStorage.setItem('evf-probe-endpoint', '<URL printed by harness>')`.
7. Reload world (F5). Probe fires on 'ready' hook and POSTs settings.
8. Verify `docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json` exists with `verdict` ∈ {pass, fail, skipped}.
9. Commit: `git add docs/perf/phase-0/midiqol-config-probe-*.json && git commit -m "evidence(phase-0): REQ MIDIQ-01 probe verdict"`
10. **After Phase 0, delete the test world + uninstall the probe module** (T-00-02 operational hygiene).

### Track B — Hardware Tests (requires Even Hub developer access, ~4-5 hours)

**Prerequisites (all must be TRUE before launching scripts):**
- [ ] Even Hub developer access granted; `@evenrealities/even_hub_sdk` installed in `packages/validation-harness/` (or wherever `_shared/hub.ts` dynamic-imports it)
- [ ] G2 glasses + R1 ring paired with Even Realities App on test phone
- [ ] 3 RF environments physically configured:
  - Clean: Wi-Fi router off or separate room
  - 5GHz-loaded: `iperf3 -c <server> -b 800M -t 1800` saturating 5GHz band
  - 2.4GHz+microwave: microwave on (cup of water) + 2.4GHz iperf3 saturating
- [ ] Smartphone camera in fixed mount, locked manual mode (ISO 100, 1/30s, daylight WB) for palette calibration

**Execution sequence from repo root (preserve order — each gets its own ISO8601 timestamp):**

```bash
# 1. Format probe (~5 min)
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-2-image-format.ts

# 2. R1 timing (~30 min, 5 sessions × 6 gestures × 30 samples)
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-1-r1-timing.ts

# 3. Queue depth (~1 min, automated)
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-8-queue-depth.ts

# 4. BLE multi-env (30 min × 3 environments = 1.5 h)
RF_ENV=clean pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts
RF_ENV=5ghz-loaded pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts
RF_ENV=2-4ghz-microwave pnpm --filter @evf/validation-harness exec tsx scripts/10-0-3-ble-multi-env.ts

# 5. DLE sustained (~30 min, automated)
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-7-dle-sustained.ts

# 6. Palette calibration (~1 h with camera setup)
pnpm --filter @evf/validation-harness exec tsx scripts/10-0-9-palette-calibration.ts
```

**Pre-commit safety scrub (T-00-01 + T-00-03):**
```bash
! grep -rE 'token|bearer|secret|password|EVEN_HUB_TOKEN=[^$]' docs/perf/phase-0/
! grep -rE 'SSID|BSSID|home_network|wifi_channel' docs/perf/phase-0/
```

**Commit evidence:**
```bash
git add docs/perf/phase-0/
git commit -m "evidence(phase-0): commit measurement results for §10.0.1-9"
```

### Track C — ADR Population (automated, runs AFTER Tracks A + B produce evidence)

Once evidence is committed, invoke the executor agent again for Tasks 2 + 3:

- Task 2: Read all evidence JSONs → run `deriveBranch()` against BLE multi-env results → populate ADR-0005 with Branch verdict + per-test rationale table + D-04 closure status.
- Task 3: Resolve ADR-0006 conditional content per Branch verdict → INV-3 doc coherence check → atomic commit.

The minimum viable unlock (D-04) requires only the 4 critical evidence files:
- `10-0-3-ble-multi-env-{clean,5ghz-loaded,2-4ghz-microwave}-*.json`
- `10-0-8-queue-depth-*.json`
- `10-0-2-image-format-*.json`
- `10-0-1-r1-timing-*.json`

DLE, palette calibration, and MidiQOL probe are important but non-blocking for Phase 1 unblock per D-04.

## D-04 Phase 0 Done Definition — Current Status

| Critical Gate | Status | Blocks |
|---------------|--------|--------|
| BLE multi-env (3 envs) evidence committed | NOT MET | ADR-0005 Branch verdict |
| Queue depth evidence committed | NOT MET | ADR-0005 Branch verdict |
| Image format evidence committed | NOT MET | ADR-0006 conditional content |
| R1 timing evidence committed | NOT MET | Phase 6 INV-5 timing constants |
| ADR-0005 ACCEPTED with Branch verdict | NOT MET | Phase 1+ design empiry |
| ADR-0006 ACCEPTED with conditional content | NOT MET | Phase 4a raster vs glyph default |

**Phase 1 unblock status: NOT YET DETERMINABLE** — evidence is not available to run `deriveBranch()`.

Note: Phase 1 Foundation (monorepo, Biome, TypeScript strict, Vitest, ADRs 0001-0004 + 0008) is already **complete** per D-02 partial-parallel policy. Phase 0 closure is now blocking Phase 2 entry gates, not Phase 1 retrospectively.

## Software Readiness Assessment

The test harness is **ready to execute without code changes** once hardware prerequisites are met:

- All 6 hardware scripts: type-check green, Pattern 3 skip verified, THRESHOLDS pre-committed (D-12 strict numeric).
- MidiQOL probe: HTTP-loopback harness + Foundry mini-module complete; exit 0/1/2 verified.
- Path-resolution fix (commit 2044df0) means scripts launched from repo root via `pnpm --filter @evf/validation-harness exec tsx scripts/...` will write evidence to `docs/perf/phase-0/` correctly.
- `_shared/branch-decision.ts` `deriveBranch()` is ready to aggregate BLE results → Branch A/B/C deterministically (D-12).

## Deviations from Plan

None — Plan 04 cannot execute at all without hardware prerequisites. This SUMMARY is the only artifact produced by this executor run. No code, ADRs, or doc changes have been made.

## ADR-0005 / ADR-0006 Current State

Both files remain at their Plan 01-produced stub state:

- `docs/architecture/0005-phase0-go-no-go.md` — Status: `PROPOSED`; Branch Verdict: TBD; Per-Test Verdict table: all 9 rows TBD.
- `docs/architecture/0006-raster-pipeline-library-stack.md` — Status: `PROPOSED`; both Branch A/B and Branch C content blocks present (neither removed yet).

These will be populated by Tasks 2 + 3 once evidence is committed.

## Retrospective Notes (for `.planning/RETROSPECTIVE.md`)

- **Research-prediction accuracy on hardware access timeline:** D-01 estimated "1-2 weeks" for Even Hub grant. Timeline has exceeded that estimate (research gathered 2026-05-10; now 2026-05-11 and access not yet received). D-03 fallback protocol applies: Phase 1 proceeded in parallel and is complete.
- **D-02 partial-parallel value confirmed:** Phase 1 is fully complete despite Phase 0 hardware tests being unexecuted. The D-02 sequencing decision (only ADR-0006 hard-gated; everything else proceeds) provided significant throughput.
- **MidiQOL probe as independent unblockable item:** Track A (MidiQOL probe) can close REQ MIDIQ-01 without Even Hub access. This should be treated as a priority action item since it's low-cost and self-contained.
- **Phase 0 closure is now in a holding pattern:** The only remaining blocker is researcher operational time + Even Hub access grant. No engineering work remains to be done before hardware execution.

## Self-Check: PASSED

Verifications performed:
- `docs/perf/phase-0/` contents confirmed (no .json evidence files present)
- ADR-0005 PROPOSED status confirmed (grep match)
- ADR-0006 PROPOSED status confirmed (grep match)
- ROADMAP.md Phase 0 `[ ]` unclosed confirmed
- STATE.md Phase 1 complete / Phase 0 open confirmed
- Commit `2044df0` present in git log confirmed
- No fabricated data, no status inflation, no premature ADR acceptance
