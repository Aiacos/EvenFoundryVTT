---
phase: 22
slug: features-biography-schema-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 22 — Validation Strategy

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
| 22-01-* | 01 | 1 | RDATA-03/04 | — | N/A | unit | `pnpm --filter @evf/shared-protocol test` | ❌ W0 | ⬜ pending |
| 22-02-* | 02 | 2 | RDATA-03/04 | — | reader null-safety (no throw on missing dnd5e fields) | unit | `pnpm --filter @evf/foundry-module test` | ❌ W0 | ⬜ pending |
| 22-03-* | 03 | 3 | RDATA-03/04 | — | N/A | unit | `pnpm --filter @evf/g2-app test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] FeatEntry / Biography Zod schema tests (valid entry, empty feats array, biography omitted → empty-string fallback)
- [ ] `extractFeats()` reader tests (mock actor.items: dnd5e 2024 origin feat path + 2014 plain-item fallback)
- [ ] `extractBiography()` reader tests (verify `system.details.trait` is read for personality, NOT `.personality`)
- [ ] Feats/Bio tab renderer tests (real data vs empty; Bio scroll offset advances content)

*Existing vitest infrastructure covers all phase requirements — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feats/Bio tabs legible + bio scroll smooth on physical G2 + R1 | RDATA-03/04 | No hardware in CI (ADR-0005 Branch A) | Cycle to Feats and Bio tabs on G2; scroll the backstory with R1; confirm real character data renders and scroll wraps/stops correctly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
