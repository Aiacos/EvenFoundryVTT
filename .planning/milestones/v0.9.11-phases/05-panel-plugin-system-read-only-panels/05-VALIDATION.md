---
phase: 5
slug: panel-plugin-system-read-only-panels
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: §Validation Architecture in `05-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (root workspace glob — auto-discovered) |
| **Quick run command** | `pnpm test --filter @evf/g2-app` |
| **Full suite command** | `pnpm test` (workspace-wide) |
| **Estimated runtime** | < 30s quick (per-package) / ~60s full (workspace) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --filter @evf/g2-app` (+ specific filter when applicable).
- **After every plan wave:** Run `pnpm test` (workspace-wide — includes shared-render fixture validation).
- **Before `/gsd-verify-work`:** Full suite green + `pnpm typecheck` + `pnpm lint:ci` mandatory.
- **Max feedback latency:** < 30 seconds for quick filter.

---

## Per-Requirement Verification Map

| Req ID | Behavior | Test Type | Automated Command | File | Status |
|--------|----------|-----------|-------------------|------|--------|
| SHEET-01 | 6 tabs discoverable; tap-cycle round-trips correctly | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` | ❌ W0 |
| SHEET-01 | Tab strip renders all 6 tabs with active indicator shift | INV-1 fixture | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | fixture: `sheet.main.2014.it.txt` | ❌ W0 |
| SHEET-02 | `onSnapshot(newSnapshot)` re-renders without remount (live binding) | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` | ❌ W0 |
| SHEET-03 | `modernRules=false` omits `[M]`; `modernRules=true` shows `[M]` on weapons | Unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | `__tests__/character-sheet-panel.test.ts` | ❌ W0 |
| SHEET-03 | Dual-edition fixtures differ only in `[M]` / origin column | INV-1 fixture | `pnpm test --filter @evf/shared-render` | `sheet.inventory.2014.it.txt` + `sheet.inventory.2024.it.txt` | ❌ W0 |
| SHEET-04 | Tab strip `[ XXX ]` ↔ `[▶XXX ]` equal width across all 6 active states | INV-1 fixture + unit | `pnpm test --filter @evf/g2-app -- character-sheet-panel` | unit: tab-strip width assertion | ❌ W0 |
| COMB-01 | 5-row window: currentIndex ± 2 with edge cases (first/last/< 5 combatants) | Unit | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `__tests__/combat-tracker-panel.test.ts` | ❌ W0 |
| COMB-01 | Concentration sub-line appears under affected combatant | Unit + INV-1 | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | same + fixture | ❌ W0 |
| COMB-01 | Combat tracker full INV-1 fixture matches UI-SPEC §5.8 | INV-1 fixture | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `combat-tracker.full-window.it.txt` | ❌ W0 |
| COMB-03 | Quick-action bar footer `[ A ]ttacco [ S ]pell [ I ]tem [ M ]ovi` renders | Unit | `pnpm test --filter @evf/g2-app -- combat-tracker-panel` | `__tests__/combat-tracker-panel.test.ts` | ❌ W0 |
| I18N-02 | Boot read-back: `view.locale.override='en'` → runtime locale `'en'` | Unit | `pnpm test --filter @evf/g2-app -- boot-engine` | `__tests__/boot-engine.test.ts` | ❌ W0 |
| I18N-02 | Locale override persists across subsequent boots | Unit | `pnpm test --filter @evf/g2-app` | Integration via mock `EvenAppBridge` | ❌ W0 |
| I18N-05 | Best-effort ES locale: missing key → EN string fallback (not IT) | Unit | `pnpm test --filter @evf/g2-app -- i18n-budgets` | `__tests__/i18n-budgets.test.ts` | ❌ W0 |
| I18N-05 | FR/PT-BR stress fixtures: per-key EN fallback when budget exceeded | INV-1 fixture | `pnpm test --filter @evf/shared-render` | `locale-override.stress-{es,fr,pt-br}.txt` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = blocked on Wave 0 scaffolding*

---

## Wave 0 Requirements (blocking)

- [ ] `packages/g2-app/src/engine/panel-router.ts` — PanelRouter + PanelMeta + PanelMetaSchema
- [ ] `packages/g2-app/src/locale/locale-menu.ts` — LOCALE_MENU constant
- [ ] `packages/g2-app/src/status-hud/i18n-budgets.ts` — ~82 new keys added (atomic commit)
- [ ] `packages/shared-protocol/src/payloads/character.ts` — `world.modernRules` field (atomic with reader)
- [ ] `packages/shared-protocol/src/payloads/combat.ts` — `concentration` field on Combatant (atomic with reader)
- [ ] `packages/foundry-module/src/readers/character-reader.ts` — `world.modernRules` mapping
- [ ] `packages/foundry-module/src/readers/combat-reader.ts` — concentration effect sourcing
- [ ] `docs/architecture/ADR-0010-panel-plugin-registry.md` — new ADR
- [ ] All INV-1 fixture `.txt` files (~20 files) authored character-perfect from UI-SPEC mockups

---

## Manual-Only Verifications (Hardware-Deferred)

These items cannot be verified without real G2 hardware. Carry forward to **ADR-0005 PROVISIONAL Branch A `human_needed` gate** per Phase 4a/4b precedent.

| ID | Behavior | Requirement | Why Manual |
|----|----------|-------------|------------|
| SC-05-01 | CharacterSheet 6-tab renders correctly on real G2 phosphor with IT locale | SHEET-01 | Hardware display required |
| SC-05-02 | Tab-strip `▶` glyph aligns perfectly across all 6 active states on real G2 | SHEET-04 | INV-1 ck 13 requires hardware display |
| SC-05-03 | Combat tracker 5-row window tracks current turn on real Foundry combat | COMB-01 | Hardware + Foundry required |
| SC-05-04 | Locale override persists across Even App kill/restart on real G2 | I18N-02 | Real SDK behavior unverified |
| SC-05-05 | Best-effort locales (ES/FR/PT-BR) render within budget on real G2 monospace font | I18N-05 | Hardware display required |

Close via `pnpm --filter @evf/validation-harness validate:all` post-grant.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependency declared
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (Panel API, ADR-0010, schema extensions, ~20 fixtures, ~82 i18n keys)
- [ ] No watch-mode flags in CI gates
- [ ] Feedback latency < 30s on quick filter
- [ ] `nyquist_compliant: true` set in frontmatter after planner produces tasks

**Approval:** pending (set by orchestrator after plan-checker pass)
