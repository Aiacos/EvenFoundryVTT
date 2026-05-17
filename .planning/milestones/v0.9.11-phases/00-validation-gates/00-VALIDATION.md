---
phase: 0
slug: validation-gates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 0 is meta-validation: the deliverable IS the test harness + measurement evidence + ADR-0005/0006 decision documents. There is no application code to test.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | tsx@4.21.0 + Zod@4.4.3 (standalone scripts per CONTEXT.md D-06); promotion to Vitest@4.1.5 during Phase 1 fold-in (D-15) |
| **Config file** | `tests/phase-0/tsconfig.json` (standalone strict TS until Phase 1; then extends `tsconfig.base.json`) |
| **Quick run command** | `cd tests/phase-0 && pnpm exec tsc --noEmit` (type-check all harness scripts) |
| **Full suite command** | `cd tests/phase-0 && pnpm exec tsx run-all.ts --skip-hardware` (tutto meno hardware-bound — verifies output schema + evidence emission) |
| **Estimated runtime** | ~30s for type-check; ~2 min for `--skip-hardware` smoke (MidiQOL probe only); ~3-4 hours for full hardware suite (1.5h sustained DLE + 30min × 3 BLE env + R1 timing 5 sessions + format/palette/queue) |

---

## Sampling Rate

- **After every task commit:** `cd tests/phase-0 && pnpm exec tsc --noEmit` — type-check incremental; smoke-run MidiQOL probe if Foundry test world is reachable
- **After every plan wave:** `cd tests/phase-0 && pnpm exec tsx run-all.ts --skip-hardware` — output schemas + evidence-emission paths green
- **Before phase closure (`/gsd-verify-work`):** All 6 hardware tests + MidiQOL probe executed end-to-end; evidence files written to `docs/perf/phase-0/`; ADR-0005 + ADR-0006 written + committed; INV-3 doc coherence pass (Specs.md/README.md/showcase reflect Phase 0 closure if cross-cutting decisions emerged)
- **Max feedback latency:** 30 seconds (type-check), 2 min (skip-hardware smoke). Hardware tests are inherently long-running and gated to phase-end, not per-commit.

---

## Per-Task Verification Map

> Phase 0 task IDs assigned by planner. This map covers REQ-IDs + canonical Specs §10.0 sections. Wave 0 (W0) marks files that don't exist yet.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 00-01-XX | 01 | 0 | (W0 setup) | T-00-01 | Bearer tokens never logged in test output (Zod schema explicitly omits) | smoke | `cd tests/phase-0 && pnpm exec tsc --noEmit` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | MIDIQ-01 | T-00-02 | Foundry world settings read-only (no mutation during probe) | semi-auto (Foundry test world required) | `cd tests/phase-0 && pnpm exec tsx midiqol-config-probe.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.1 | — | R1 gesture timing windows distinguishable n=150/gesture, dip test passes | semi-auto (researcher performs gestures, harness captures via SDK callback) | `RF_ENV=clean pnpm exec tsx 10-0-1-r1-timing.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.2 | — | `updateImageRawData` byte format identified (A: PNG indexed, B: raw 4-bit MSN-first, C: raw 4-bit LSN-first) | semi-auto (harness sends 3 formats, researcher verifies on G2) | `pnpm exec tsx 10-0-2-image-format.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.3 | — | BLE p50/p95/p99 measured 30-min × 3 envs; threshold envelope per CONTEXT.md D-09 | semi-auto (manual env setup, automated measurement) | `RF_ENV={clean,5ghz-loaded,2-4ghz-microwave} pnpm exec tsx 10-0-3-ble-multi-env.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.7 | — | DLE 30-min sustained throughput; renegotiation events captured | automated (long-running) | `pnpm exec tsx 10-0-7-dle-sustained.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.8 | — | Queue depth empirical {1,2,3,≥4} table populated for raster scheduler design | automated (push 8 tiles, count dropped) | `pnpm exec tsx 10-0-8-queue-depth.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 1 | §10.0.9 | — | Palette calibration: 16-step uniform → derived → verified L* spacing within ±10% | semi-auto (camera + analysis) | `pnpm exec tsx 10-0-9-palette-calibration.ts` | ❌ W0 | ⬜ pending |
| 00-XX-XX | XX | 2 | (closure) | — | ADR-0005 written + Branch verdict + companion data files cited; ADR-0006 written conditional on Branch | manual (ADR review + INV-3 doc coherence cross-check) | `git log --oneline docs/architecture/0005-phase0-go-no-go.md \| head -1` (verify commit exists) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Threat refs (preliminary, planner finalizes per <threat_model> requirement step 5.55):**
- **T-00-01:** Bearer tokens or Even Hub credentials leaked in test output / committed evidence files. Mitigation: Zod schemas omit auth fields; pre-commit grep for token patterns.
- **T-00-02:** MidiQOL probe accidentally mutates world settings. Mitigation: read-only API only (`game.settings.get`, never `game.settings.set`); test against disposable Foundry test world, not production.

---

## Wave 0 Requirements

> Wave 0 = test infrastructure scaffolding. ALL files greenfield (no existing application code to extend). Per RESEARCH.md §Wave 0 Gaps + CONTEXT.md D-05/D-06/D-07/D-08.

- [ ] `tests/phase-0/package.json` — TS+tsx+Zod+csv-stringify minimal install (per D-06)
- [ ] `tests/phase-0/tsconfig.json` — strict TS config (extends `tsconfig.base.json` once Phase 1 lands)
- [ ] `tests/phase-0/_shared/output.ts` — JSON+CSV writer + filename helper `{test_id}-{env?}-{ISO8601}.json`
- [ ] `tests/phase-0/_shared/schemas.ts` — Zod schemas per test's evidence shape (versioned `schema_version: 1`)
- [ ] `tests/phase-0/_shared/stats.ts` — `percentile()` helper + Hartigan dip test + CI bounds for R1 timing
- [ ] `tests/phase-0/_shared/branch-decision.ts` — D-12 strict-numeric verdict helper (auto-downgrade ±5% borderline)
- [ ] `tests/phase-0/_shared/hub.ts` — Even Hub SDK loader/wrapper (uses simulator pre-grant, real SDK post-grant)
- [ ] `tests/phase-0/10-0-1-r1-timing.ts` — R1 gesture window measurement (n=150 per gesture × 5 sessions)
- [ ] `tests/phase-0/10-0-2-image-format.ts` — Format A/B/C probe with `upng-js` for Format A
- [ ] `tests/phase-0/10-0-3-ble-multi-env.ts` — multi-env multi-percentile BLE bandwidth (one run per `RF_ENV`)
- [ ] `tests/phase-0/10-0-7-dle-sustained.ts` — DLE 30-min sustained with renegotiation event capture
- [ ] `tests/phase-0/10-0-8-queue-depth.ts` — queue depth empirical probe + table generation
- [ ] `tests/phase-0/10-0-9-palette-calibration.ts` — luminance-ramp render + perceptual derivation
- [ ] `tests/phase-0/midiqol-config-probe.ts` — MidiQOL `AutoFastForwardAbilityRolls` + 4 related settings introspection
- [ ] `tests/phase-0/run-all.ts` — orchestrator with `--skip-hardware` flag for CI smoke
- [ ] `tests/phase-0/README.md` — version pins (verified 2026-05-10), how-to-run, prereqs (Even Hub access for hardware tests, Foundry test world for MidiQOL probe), simulator vs real-device guidance
- [ ] `docs/perf/phase-0/.gitkeep` + brief README explaining evidence naming convention
- [ ] `docs/perf/phase-0/calibration/.gitkeep` + `methodology.md` (camera settings, ambient light protocol, ΔE76/L* derivation script)
- [ ] `docs/architecture/0005-phase0-go-no-go.md` — template stub at Wave 0; populated at phase closure with Branch verdict + threshold table + verdict per test + cross-refs
- [ ] `docs/architecture/0006-raster-pipeline-library-stack.md` — template stub at Wave 0; populated at phase closure conditional on Branch (D-14): A/B → confirms image-q+upng-js+xxhash-wasm with drift notes; C → declares raster deferred to Phase 13 stretch

---

## Manual-Only Verifications

> Phase 0 has high manual-verification surface by nature: hardware tests require physical G2 + R1 + RF environment manipulation that cannot be automated in CI.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| R1 gesture performance + timing capture | §10.0.1 | Researcher physically performs 150 × 4 gestures × 5 sessions; harness records timestamps | Wear R1, follow `tests/phase-0/10-0-1-r1-timing.ts` prompts (tap/double-tap/long-press/scroll); harness exits when n=150 reached per gesture; review `docs/perf/phase-0/r1-timing-{ts}.json` Hartigan dip test results |
| `updateImageRawData` byte format verification | §10.0.2 | Researcher photographs G2 display after each format candidate; visual verdict | Run `pnpm exec tsx 10-0-2-image-format.ts`; harness sends 3 formats sequentially; researcher takes 3 photos with phone camera (locked exposure, dim ambient); enters verdict A/B/C in CLI prompt; evidence committed |
| BLE multi-env environment setup | §10.0.3 | Manual physical setup of 3 RF environments (clean room / 5GHz Wi-Fi loaded / 2.4GHz + microwave running) | Per env: configure Wi-Fi router (clean=disabled, 5ghz-loaded=iperf3 saturating 5GHz band, 2-4ghz=microwave on + 2.4GHz iperf3); run `RF_ENV={env} pnpm exec tsx 10-0-3-ble-multi-env.ts` for 30 min; commit `docs/perf/phase-0/ble-multi-env-{env}-{ts}.json` |
| Palette calibration photography | §10.0.9 | Camera capture of G2 phosphor luminance ramp + perceptual analysis | Mount phone in fixed position, dim ambient (lux meter or visual); locked-ISO/exposure; run `pnpm exec tsx 10-0-9-palette-calibration.ts`; harness renders 16-step uniform palette ramp on G2; researcher photographs 3× per session; analyze ΔE76 in companion script; iterate to derive perceptually-spaced palette; verify final spacing within ±10% L* uniform |
| MidiQOL test world bootstrap | MIDIQ-01 | Requires Foundry desktop running with dnd5e 5.3.3+ + MidiQOL latest installed | Boot Foundry test world `phase-0-midiqol-test`; install `tests/phase-0/midiqol-probe-module/` (tiny module that hooks `'ready'` and POSTs settings JSON to localhost harness); run `pnpm exec tsx midiqol-config-probe.ts`; verify config check produces remediation list when `AutoFastForwardAbilityRolls` is wrong |
| Even Hub developer access submission | (operational, no REQ) | External org gating | Submit application via Even Hub Build Now portal + Discord channel + email (per CONTEXT.md D-01 parallel scaffold); track status in phase log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify command OR Wave 0 dependency listed
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (W0 type-check satisfies for harness construction sub-tasks)
- [ ] Wave 0 covers all MISSING references (19 files listed above)
- [ ] No watch-mode flags (one-shot scripts only — repeatable + auditable)
- [ ] Feedback latency < 30s for type-check / 2 min for skip-hardware smoke
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands and all tests have automated commands

**Approval:** pending (set to `approved YYYY-MM-DD` after Wave 0 closure + first dry-run with `run-all.ts --skip-hardware` green)
