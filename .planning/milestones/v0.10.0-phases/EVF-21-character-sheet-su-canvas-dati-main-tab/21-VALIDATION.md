---
phase: 21
slug: character-sheet-su-canvas-dati-main-tab
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-06
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 (happy-dom env) |
| **Config file** | `vitest.config.ts` (root workspace `test.projects`) |
| **Quick run command** | `pnpm --filter @evf/g2-app test -- --run` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~30–45 s (g2-app) / ~90 s (full workspace) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @evf/g2-app test -- --run` (panel) + `pnpm --filter @evf/foundry-module test -- --run` (readers)
- **After every plan wave:** `pnpm test -- --run` (workspace-wide — catches the ~27-file CharacterSnapshot literal blast radius)
- **Before `/gsd-verify-work`:** Full suite + `pnpm --filter @evf/validation-harness inv:all:skip-inv2` green
- **Max feedback latency:** ~45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-* | 01 | 1 | RDATA-01, RDATA-02 | — | safeParse on snapshot | unit | `pnpm --filter @evf/shared-protocol test -- --run` | ❌ W0 | ⬜ pending |
| 21-02-* | 02 | 1 | RDATA-01, RDATA-02 | — | reader defensive `?? 0`/`?? 30` defaults | unit | `pnpm --filter @evf/foundry-module test -- --run` | ❌ W0 | ⬜ pending |
| 21-03-* | 03 | 2 | RSHEET-03 | T-21-03 | portrait fetch try/catch; whitelisted origin | unit | `pnpm --filter @evf/g2-app test -- --run dither` | ❌ W0 | ⬜ pending |
| 21-04-* | 04 | 2 | RSHEET-01, RSHEET-02 | T-21-01 | safeParse `_onDelta` gate | unit | `pnpm --filter @evf/g2-app test -- --run canvas-character-sheet-panel` | ❌ W0 | ⬜ pending |
| 21-05-* | 05 | 3 | RDATA-01/02, RSHEET-01, RINV-01 | — | N/A | inv/regression | `pnpm --filter @evf/validation-harness inv:all:skip-inv2` + `pnpm test -- --run` | partial (fixtures update) | ⬜ pending |

*Wave/plan/task IDs indicative — the planner owns the final decomposition. The downstream CharacterSnapshot-literal updates (~27 files) land alongside the schema extension to keep `pnpm test` green at each wave.*

---

## Wave 0 Requirements

- [ ] `CharacterSnapshotSchema` extended with REQUIRED `class: z.string()`, `initiative: z.number().int()`, `speed: z.number().int().nonnegative()` (`packages/shared-protocol/src/payloads/character.ts`)
- [ ] foundry-module readers: `extractClass`/`extractInitiative`/`extractSpeed` (mirror `extractAbilities`/`extractSkills`) + `getCharacterSnapshot` wiring; `Dnd5eAttributes` d.ts gains `init?: {total?:number}` + `movement?: {walk?:number}`
- [ ] `packages/g2-app/src/raster/dither-utils.ts` — EXTRACT `ditherTile` + `buildGreyscalePalette` from `raster-worker.ts` (currently private/unexported) so the portrait pipeline can reuse them; raster-worker imports from the new util (zero behavior change)
- [ ] `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — `CanvasCharacterSheetPanel` (CanvasLayer z=2 + OverlayPanel): `paint*Tab(ctx,bounds)` additive to the preserved `render*Tab` string renderers; async-once portrait fetch → dither → MapBaseLayer slot 3
- [ ] `packages/g2-app/src/panels/__tests__/canvas-character-sheet-panel.test.ts` — RCSP-SC1..4 (6-tab paint, tab-switch, gesture-identity, dirty-gate) + RCSP-PORTRAIT (async-once, fetch-fail silent) + RCSP-INV1 (SHA-256)
- [ ] `packages/shared-render/src/fixtures/canvas-sheet-panel.raster-hash.json` — committed raster hash fixture
- [ ] UPDATE `sheet.main.{2014.it,2014.en,2014.de,2024.it}.txt` row 6 vitals bar (`INI —`/`VEL —` → real class/init/speed)
- [ ] Downstream: ~27 test files' CharacterSnapshot literals extended with the 3 new REQUIRED fields

*Existing infra (Vitest, happy-dom, snapshot.ts INV-1 matcher, Phase 20 CanvasLayer template, raster-worker dither) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Portrait renders glanceably (greyscale-dithered) on real G2 | RSHEET-03 | Real-image fetch + decode + G2 4-bit display unverifiable in happy-dom/CI (ADR-0005 Branch A) | Pair real G2, open the sheet on a PC with a portrait URL, confirm a recognisable dithered portrait in slot 3 |
| 6-tab canvas sheet legible at 27px VT323 on G2 | RSHEET-01 | Visual legibility needs the physical display | Open sheet on real G2, cycle all 6 tabs, confirm each tab readable |
| R1 gesture nav feels identical to glyph path | RSHEET-02 | Requires a real R1 ring | Open/scroll/close the sheet via R1, confirm parity with glyph behaviour |

*All software behaviors (schema, readers, paint*Tab logic, portrait async-once + fetch-fail, gesture-bus-unchanged, INV-1 hashes/fixtures) have automated verification. Hardware-render carries under ADR-0005 Branch A.*

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-06
