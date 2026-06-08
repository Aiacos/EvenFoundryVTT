---
phase: 23
slug: combat-tracker-su-canvas-combatant-ac
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (workspace projects) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm --filter @evf/shared-protocol test && pnpm --filter @evf/foundry-module test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run the affected package's `pnpm --filter <pkg> test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-* | 01 | 1 | RDATA-05 | — | schema validation; optional ac (absent valid) | unit | `pnpm --filter @evf/shared-protocol test` | ❌ W0 | ⬜ pending |
| 23-02-* | 02 | 2 | RDATA-05 | — | reader null-safe (unlinked combatant / missing ac.value → undefined) | unit | `pnpm --filter @evf/foundry-module test` | ❌ W0 | ⬜ pending |
| 23-03-* | 03 | 3 | RCOMB-01 | — | self-subscribe combat.delta; unsubscribe on unmount (no leak) | unit | `pnpm --filter @evf/g2-app test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] CombatantSchema.ac Zod tests (valid number, absent ac valid, negative/non-int rejected)
- [ ] AC reader tests (mock combatant.actor.system.attributes.ac.value present → number; absent/non-number/unlinked actor → undefined)
- [ ] CanvasCombatTrackerPanel tests: 5-combatant scroll window, auto-follow current turn on combat.delta, full-contrast current-turn highlight, real AC rendering, missing-ac `' --'` fallback, manual scroll between deltas, subscribe/unsubscribe lifecycle
- [ ] Gesture parity: double-press close preserved; PanelGestureBus + panel-router.ts unchanged (grep guard)

*Existing vitest infrastructure covers all phase requirements — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combat tracker legibility + scroll + turn-follow on physical G2 + R1 | RCOMB-01 | No hardware in CI (ADR-0005 Branch A) | Start a combat in Foundry; on G2 open combat tracker; confirm 5-combatant window, current turn highlighted + auto-followed on turn advance, real AC shown, R1 scroll inspects others, double-press closes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
