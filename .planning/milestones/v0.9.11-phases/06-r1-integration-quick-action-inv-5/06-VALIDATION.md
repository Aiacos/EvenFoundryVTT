---
phase: 6
slug: r1-integration-quick-action-inv-5
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `## Validation Architecture` section of `06-RESEARCH.md`.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Quick run command** | `pnpm test --filter @evf/g2-app` |
| **Full suite command** | `pnpm test` |

## Sampling Rate

- **Per task commit:** `pnpm test --filter @evf/g2-app` (< 30 s).
- **Per wave merge:** `pnpm test` (workspace, ~6 s).
- **Phase gate:** Full suite + `pnpm typecheck` + `pnpm lint:ci` green.

## Per-Requirement Verification Map

| REQ | Behavior | Test Type | File | Status |
|-----|----------|-----------|------|--------|
| NAV-01 | R1 gestures route to top-of-stack layer (`tap/scroll/long-press`) | Unit | `__tests__/r1-event-source.test.ts` | ❌ W0 |
| NAV-01 | Tap vs double-tap distinction via timing window | Unit | same | ❌ W0 |
| NAV-01 | Default timings (250/350/600/50) wired into `r1-timings.ts` | Unit | `__tests__/r1-timings.test.ts` | ❌ W0 |
| NAV-02 | Quick Action menu opens via long-press from any reachable state | Integration | `__tests__/06-cross-overlay-reachability.test.ts` (CK-01..09) | ❌ W0 |
| NAV-02 | 9-item menu rendering character-perfect | INV-1 fixture | `quick-action.base.it.txt` + 3 fixtures | ❌ W0 |
| NAV-02 | `[N] Language` sub-menu renders LOCALE_MENU | Unit + INV-1 | `__tests__/quick-action-menu-panel.test.ts` + fixture | ❌ W0 |
| NAV-03 | 15-case reachability checklist passes | Integration | `__tests__/06-cross-overlay-reachability.test.ts` (CK-01..15) | ❌ W0 |
| NAV-03 | `[X] Close` from any overlay returns to active panel or main HUD | Integration | same (CK-10) | ❌ W0 |
| INV-5 (visible) | Footer chip names current long-press target | Unit + INV-1 | `__tests__/status-hud-context-chip.test.ts` + 5 fixtures | ❌ W0 |
| INV-5 (architectural) | INVARIANTS.md committed with INV-1..5 consolidated | Doc | `docs/architecture/INVARIANTS.md` | ❌ W0 |
| INV-5 (enforcement) | `panel-gesture-bus` single-receiver invariant via overlay stack | Unit | `__tests__/panel-router.test.ts` + bus tests | ❌ W0 |

## Wave 0 Requirements

- [ ] `packages/g2-app/src/engine/r1-event-source.ts` — R1 event source provider
- [ ] `packages/g2-app/src/engine/r1-timings.ts` — DEFAULT_R1_TIMINGS
- [ ] `packages/g2-app/src/engine/layer-manager.ts` — `getTopLayer()` accessor
- [ ] `packages/shared-protocol/src/payloads/r1.ts` — R1GestureEnvelopeSchema
- [ ] `docs/architecture/INVARIANTS.md` — INV-1..5 consolidated, INV-5 ratified
- [ ] `packages/g2-app/src/status-hud/i18n-budgets.ts` — ~18 new keys appended

## Manual-Only Verifications (Hardware-Deferred — ADR-0005 Branch A)

| ID | Behavior | REQ | Close via |
|----|----------|-----|-----------|
| SC-06-01 | R1 timing constants validated against real R1 per Phase 0 §10.0.1 | NAV-01 | `pnpm --filter @evf/validation-harness validate:all` |
| SC-06-02 | Long-press feels right on real R1 hardware (no false-triggers) | NAV-01 | same + manual UAT |
| SC-06-03 | Menu-open latency p50 ≤ 200 ms on real G2+R1 stack | NAV-02 | same + p50 timing capture |

Hardware-pending project total after Phase 6: **18** (4a: 5 + 4b: 5 + 5: 5 + 6: 3).

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependency declared
- [ ] Wave 0 covers all MISSING references (R1 schema, timings, INVARIANTS.md, ~18 i18n keys)
- [ ] Feedback latency < 30s on quick filter
- [ ] `nyquist_compliant: true` set in frontmatter after planner produces tasks

**Approval:** pending (set by orchestrator after plan-checker pass)
