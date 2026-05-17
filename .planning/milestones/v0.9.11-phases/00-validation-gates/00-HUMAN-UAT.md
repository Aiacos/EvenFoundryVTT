---
status: partial
phase: 00-validation-gates
source: [00-VERIFICATION.md]
started: 2026-05-11T12:30:00Z
updated: 2026-05-11T12:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Track A — MidiQOL Probe (no Even Hub required, ~30 min)
expected: `docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json` exists with verdict in {pass, fail, skipped}
why_human: Requires booting a local Foundry test world (`phase-0-midiqol-test`) with dnd5e 5.3.3+ + midi-qol, installing the probe module, and running the HTTP-loopback harness. No CI substitute.
result: [pending]

### 2. Track B — Hardware Tests: BLE multi-env (critical, 3 environments)
expected: `docs/perf/phase-0/10-0-3-ble-multi-env-{clean,5ghz-loaded,2-4ghz-microwave}-{ISO8601}.json` each with verdict + p50/p95/p99 measurements
why_human: Requires Even Hub developer access grant, G2 + R1 hardware paired to test phone, and physical configuration of 3 RF environments (clean / 5GHz iperf3 saturated / 2.4GHz+microwave). 30 min per environment.
result: [pending]

### 3. Track B — Hardware Tests: Queue depth (critical)
expected: `docs/perf/phase-0/10-0-8-queue-depth-{ISO8601}.json` with `deriveQueueDepthTier()` verdict
why_human: Requires Even Hub developer access + paired G2. Automated once hardware is available.
result: [pending]

### 4. Track B — Hardware Tests: Image format probe (critical)
expected: `docs/perf/phase-0/10-0-2-image-format-{ISO8601}.json` with researcher visual verdict on which of 3 formats (PNG indexed / raw 4-bit BE / raw 4-bit LE) renders on G2
why_human: Requires G2 display + researcher visual judgment on rendered image. No automated substitute for perceptual evaluation.
result: [pending]

### 5. Track B — Hardware Tests: R1 timing (critical)
expected: `docs/perf/phase-0/10-0-1-r1-timing-{ISO8601}.json` with n=150 per gesture, Hartigan dip distinguishability result
why_human: Requires physical R1 ring, 5 sessions of 6 gesture types × 30 samples. Researcher must perform gestures.
result: [pending]

### 6. Track B — Hardware Tests: DLE 30-min sustained (important, non-blocking for D-04)
expected: `docs/perf/phase-0/10-0-7-dle-sustained-{ISO8601}.json` with p50/p95/p99 + renegotiation event count
why_human: Requires 30-min continuous Even Hub session. Blocks 15 fps stretch target gate, not Phase 1 unlock.
result: [pending]

### 7. Track B — Hardware Tests: Palette calibration (important, non-blocking for D-04)
expected: `docs/perf/phase-0/10-0-9-palette-calibration-{ISO8601}.json` + `calibration/ramp-uniform-*.png` + `calibration/ramp-perceptual-*.png`
why_human: Requires G2 + smartphone camera in fixed manual-mode mount (ISO 100, 1/30s, daylight WB) + 3-iteration CIE L* derivation loop.
result: [pending]

### 8. Track C — ADR Population (automated, runs AFTER Tracks A + B)
expected: ADR-0005 promoted to ACCEPTED with Branch A/B/C verdict and per-test rationale table fully populated; ADR-0006 promoted to ACCEPTED with conditional content resolved
why_human: Depends on evidence from Tracks A+B. The executor agent can run this autonomously once evidence JSONs are committed — but cannot proceed without them.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
