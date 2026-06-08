---
phase: 24
slug: delta-loop-5fps-xxhash
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (workspace projects) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm --filter @evf/g2-app test -- --run hud-delta-driver` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @evf/g2-app test`
- **After every plan wave:** Run `pnpm test` (catch canvas-suite regressions Phases 20–23)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-* | 01 | 1 | RPROMO-01 | — | deterministic hash; no info leak | unit | `pnpm --filter @evf/g2-app test -- --run hud-delta-driver` | ❌ W0 | ⬜ pending |
| 24-02-* | 02 | 2 | RPROMO-01 | — | zero-push-on-idle; no BLE flood | unit | `pnpm --filter @evf/g2-app test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] HudDeltaDriver tests: xxhash h32 per-tile dirty-tracking; 1-of-4 changed → exactly 1 updateImageRawData (spy on bridge mock); 0 changed → 0 calls (zero-push-on-idle after first frame)
- [ ] Debounce: near-simultaneous deltas collapse into 1 render cycle; debounce configurable, default 100ms (D-24.1)
- [ ] First-frame: all 4 tiles pushed on the initial frame (baseline hashes established)
- [ ] Static chrome determinism: identical RGBA → identical h32 → no CHANGED tile between frames without mutated dynamic data
- [ ] Regression: existing canvas suite (Phases 20–23) + INV-1 raster baseline still green after driver replacement

*Existing vitest infrastructure covers all requirements — no framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Idle HUD near-zero BLE bandwidth on physical G2 | RPROMO-01 | BLE throughput only measurable on hardware (ADR-0005 Branch A) | On G2 with a static scene (no delta), confirm no tile traffic after first frame; on a single stat change, confirm only the affected tile(s) update |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
