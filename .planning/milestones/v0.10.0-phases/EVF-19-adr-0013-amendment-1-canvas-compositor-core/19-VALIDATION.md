---
phase: 19
slug: adr-0013-amendment-1-canvas-compositor-core
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `19-RESEARCH.md` → "## Validation Architecture". This is an infrastructure/architecture phase: NO visible UI change, glyph path byte-identical. Canvas 2D pixel-drawing is NOT testable in happy-dom — tests target pure logic (compositor z-order, dirty-skip, push serialization order via spies), schema shape, and glyph-mode byte-identity.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (happy-dom env for g2-app) |
| **Config file** | `vitest.config.ts` (workspace projects) |
| **Quick run command** | `corepack pnpm --filter @evf/g2-app exec vitest run src/engine src/hud` |
| **Full suite command** | `corepack pnpm test` |
| **Estimated runtime** | ~60–120 seconds (workspace), ~15s (g2-app engine/hud subset) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (engine + hud subset)
- **After every plan wave:** Run `corepack pnpm --filter @evf/g2-app exec vitest run` + `tsc --noEmit`
- **Before verification:** Full workspace suite green (2668+ existing tests byte-identical) + `corepack pnpm lint:ci`
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-ADR | 1 | RAST-05 | — | N/A (doc) | manual+grep | `grep -q "Amendment 1" docs/architecture/0013-hud-raster-rendering.md` | ✅ | ⬜ pending |
| 19-GEOM | 1 | RINV-02 | T-m4e-01 | tile ≤200×100 enforced | unit | vitest `hud-raster-frame` geometry test | ✅ | ⬜ pending |
| 19-COMPOSITOR | 2 | RAST-01 | — | z-order + serialized push | unit | vitest `canvas-compositor` test (order, dirty-skip, push serialization via spy) | ✅ | ⬜ pending |
| 19-CANVASLAYER | 2 | RAST-01 | — | `{image:0,text:0}` contract | unit | vitest `canvas-layer` contract test | ✅ | ⬜ pending |
| 19-SCHEMA | 2 | RAST-02, RAST-03 | — | containerTotalNum=5, 1 isEventCapture | unit | vitest `buildHudRasterPageSchema` shape test | ✅ | ⬜ pending |
| 19-RENDERMODE | 3 | RAST-04 | — | glyph mode byte-identical | unit | vitest `layer-manager` renderMode + `_flushPage` glyph-identity test | ✅ | ⬜ pending |
| 19-REGRESSION | 3 | RAST-01..05 | — | zero regressions | suite | `corepack pnpm test` (2668+ pass) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/g2-app/src/engine/__tests__/canvas-compositor.test.ts` — new (RAST-01 ordering/dirty/serialization)
- [ ] `packages/g2-app/src/engine/__tests__/canvas-layer.test.ts` — new (RAST-01 contract) [may fold into compositor test]
- [ ] `buildHudRasterPageSchema` schema-shape test — new (RAST-02/03)
- [ ] Existing `layer-manager.test.ts` + `hud-poc-page.test.ts` — extend for renderMode + 200×100 geometry

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 400×200 raster region + zero-margin capture-container render correctly on real G2 | RINV-02 | No physical G2 hardware (ADR-0005 Branch A); simulator does not enforce hardware image-size limits | `human_needed` — run on real glasses once hardware available; confirm 4×200×100 tiles + full-screen `hud-capture` text container render and route R1 gestures |
| ADR-0013 Amendment 1 content correctness | RAST-05 | Architecture doc review | Read `docs/architecture/0013-hud-raster-rendering.md` Amendment 1; confirm all 5 locked points present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter (TDD behavior-first — every task has a real <automated> verify command)

**Approval:** approved 2026-06-05 (plan-checker fix: TDD tasks satisfy Nyquist via real <automated> commands; no separate Wave 0 stub files needed for pure-logic phase)
