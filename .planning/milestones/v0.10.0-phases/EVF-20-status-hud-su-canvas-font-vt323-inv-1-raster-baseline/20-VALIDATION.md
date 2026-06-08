---
phase: 20
slug: status-hud-su-canvas-font-vt323-inv-1-raster-baseline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-06
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 (happy-dom env) |
| **Config file** | `vitest.config.ts` (root workspace `test.projects`) |
| **Quick run command** | `pnpm --filter @evf/g2-app test -- --run` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~25–40 s (g2-app filter) / ~90 s (full workspace) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @evf/g2-app test -- --run`
- **After every plan wave:** Run `pnpm test -- --run` (workspace-wide; catches the `map-capture`→`hud-capture` rename blast radius across packages)
- **Before `/gsd-verify-work`:** Full suite + `pnpm --filter @evf/validation-harness inv:all:skip-inv2` must be green
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-* | 01 | 1 | RFONT-01 | — | VT323 URL hardcoded via `new URL(import.meta.url)` (not user-controlled) | unit | `pnpm --filter @evf/g2-app test -- --run vt323-font-loader` | ❌ W0 | ⬜ pending |
| 20-02-* | 02 | 2 | RFONT-02, RFONT-03 | — | N/A | unit | `pnpm --filter @evf/g2-app test -- --run canvas-status-hud-layer` | ❌ W0 | ⬜ pending |
| 20-03-* | 03 | 2 | RINV-01 | T-20-01 | `CharacterSnapshotSchema.safeParse` gate before render (existing) | unit (deterministic) | `pnpm --filter @evf/g2-app test -- --run raster-inv1` | ❌ W0 | ⬜ pending |
| 20-04-* | 04 | 3 | RINV-01 | — | N/A | integration | `pnpm --filter @evf/validation-harness inv:all:skip-inv2` | ❌ W0 | ⬜ pending |
| 20-05-* | 05 | 3 | (rename) | — | N/A | regression | `pnpm test -- --run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Wave/plan/task IDs are indicative — the planner owns the final decomposition.*

---

## Wave 0 Requirements

- [ ] `packages/g2-app/src/status-hud/vt323-font-loader.ts` — `ensureVt323Loaded()` with try/catch fallback to `'16px monospace'`; SC1 fallback test (happy-dom lacks `self.fonts` → exercises the fallback path natively)
- [ ] `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — `CanvasStatusHudLayer` (first real `CanvasLayer` impl): pre-bake-once chrome (SC2), dirty-gated `paint()` (SC3)
- [ ] `packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts` — SC2 (pre-bake once, spy `paint`), SC3 (idle composite skips `paint`)
- [ ] `packages/g2-app/src/__tests__/20-raster-inv1.test.ts` — RINV-01: deterministic synthetic RGBA → `buildHudTiles()` → SHA-256 of PNG bytes vs committed fixture
- [ ] `packages/shared-render/src/fixtures/status-hud.raster-hash.json` — committed golden hash fixture
- [ ] `packages/validation-harness/scripts/inv-all.ts` — extend with a labelled "raster suite" alongside the existing "glyph suite"

*Existing infrastructure (Vitest workspace, happy-dom, snapshot.ts INV-1 matcher, makeSyntheticRgba pattern in hud-raster-frame.test.ts) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VT323 renders correctly on real G2 hardware / iOS 16 WKWebView Worker | RFONT-01 | `self.fonts` + `createImageBitmap` in iOS 16 WKWebView Worker unverifiable in CI (ADR-0005 Branch A hardware-pending) | Pair real G2, boot canvas HUD, visually confirm VT323 glyphs (not monospace fallback) on the status HUD |
| Idle BLE bandwidth near-zero with canvas default boot | RFONT-03 | Requires real BLE link instrumentation | Boot canvas HUD, leave idle (no delta), confirm no tile re-push on the wire |

*Software behaviors (font fallback, pre-bake-once, dirty-gate, SHA-256 hashes, rename) all have automated verification. Hardware-render carries under ADR-0005 Branch A per the Phase 19 precedent.*

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-06
