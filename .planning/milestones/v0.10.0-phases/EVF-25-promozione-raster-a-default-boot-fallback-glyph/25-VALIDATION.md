---
phase: 25
slug: promozione-raster-a-default-boot-fallback-glyph
status: executing
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-08
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (workspace projects) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm --filter @evf/g2-app test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @evf/g2-app test`
- **After every plan wave:** Run `pnpm test` (regression — incl. INV-1 glyph fixtures + Phases 20–24 canvas)
- **Before `/gsd-verify-work`:** Full suite + typecheck + lint:ci must be green; socketlib count == 17
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-* | 01 | 1 | RPROMO-02 | — | no behavior change (pure extraction) | unit | `pnpm --filter @evf/g2-app test` | ✅ existing | ⬜ pending |
| 25-02-* | 02 | 2 | RPROMO-02 | — | atomic canvas→glyph switch (no mixed-schema frame) | unit | `pnpm --filter @evf/g2-app test` | ✅ LMT-ATOMIC-01 | ✅ green |
| 25-03-* | 03 | 3 | RPROMO-02 | — | dead-code removal, no broken imports | unit | `pnpm test` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] e2e atomicity test: LMT-ATOMIC-01 added — setRenderMode('glyph') + bundle([]) → single rebuildPageContainer with 3-container text schema, ZERO mixed-schema intermediate frame (green ✅ 25-02)
- [ ] pushHudTiles extraction: layer-manager + hud-delta-driver still import + use it from new module; behavior unchanged (existing tests green) — 25-03
- [ ] launch.ts: ?hud=raster branch removed; default path = bootEngine (canvas); test/grep guard ?hud=raster returns 0 — 25-03
- [x] glyph fallback wire: effectiveVerdict==='glyph' path calls setRenderMode('glyph') in boot-engine-core (D-25.3 closed ✅ 25-02)
- [ ] INV-1: ~60 glyph ASCII fixtures pass UNCHANGED (backward-compat); grep guard that PoC symbols (bootHudRasterPoc, renderRasterHudFrame, createHudPocPage, etc.) return 0 after removal (INV-4) — 25-03
- [ ] socketlib count == 17 (CI Gate 8)

*Existing vitest infrastructure covers all requirements — no framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Default boot shows raster HUD on physical G2 (no ?hud=raster) + glyph fallback on BLE-degraded | RPROMO-02 | No hardware in CI (ADR-0005 Branch A) | Boot the app on G2 without any flag → raster HUD; force BLE-degraded verdict → glyph 3-container HUD renders identically to pre-v0.10.0 |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
