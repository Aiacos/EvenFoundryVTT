---
phase: 4b
slug: overlay-slot-map-mode-toggle-adversarial-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 4b — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Models on Phase 4a's VALIDATION.md (`04A-VALIDATION.md`); planner will
> reconcile Per-Task Verification Map against finalized PLAN.md test paths.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Test runner | Vitest 4.1.5 + happy-dom 20.9.0 (g2-app, shared-render) + node test env (foundry-module, shared-protocol) |
| Test colocation | `packages/g2-app/src/__tests__/` (g2-app local convention); beside source for foundry-module + shared-protocol (Phase 4a precedent) |
| ASCII fixtures | `packages/shared-render/src/fixtures/<category>.<state>[.<locale>].txt` — 17 new fixtures per 04B-UI-SPEC.md §6 |
| Adversarial typecheck | Plan 04 (boot-error i18n budgets) can reuse the Plan 04A-04 pattern (`i18n-budgets-adversarial.test.ts` spawning `tsc --noEmit`) if budget violations need CI gates |
| Schema verify | Plan 05 lands `CharacterSnapshotSchema.death` field — co-located test in `packages/shared-protocol/src/payloads/character.test.ts` (extension of existing test file) |

---

## Sampling Strategy (Nyquist Compliance)

Sampling rule (project-wide): no 3 consecutive tasks may lack an
automated `<verify>` gate. Phase 4b has 4 plans × est. 4-5 tasks each =
~16-20 tasks total. Sampling cadence: minimum 1 automated verify every
3 tasks, target 1 automated verify per task.

| Wave | Plan | Est. Tasks | Verify Targets |
|------|------|-----------:|----------------|
| 0 | 04B-01 (overlay slot machinery + Panel API + ZIndex.Z1_5_TOAST + panel-gesture-bus + ADR-0009 Amendment 1) | 3-4 | typecheck on new types; `! grep -E "createPanel\|panel-gesture-bus" packages/g2-app/src/index.ts` (W-4-style boundary gate); ADR frontmatter `status: accepted` after Plan 01 lands the differential demolish rule |
| 1 | 04B-02 (map mode toggle + Even Hub persistence + boot read-back) | 2-3 | `toggleMapMode()` unit test (sync transition + persistence call); boot-read fallback unit test (`getLocalStorage` failure → 'auto' verdict); typecheck |
| 2 | 04B-03 (toast queue z=1.5 + FIFO + squash) | 3-4 | toast-queue-layer unit test (1 toast / 2 toasts / squash badge); Fireball+8 saves stress integration test; INV-1 fixtures `toast-queue.{single,dual,squashed}.it.txt` matchAsciiFixture |
| 2 | 04B-04 (boot error UI 5 states + bootErrorFromException dispatch) | 3-4 | per-state render test (5 × matchAsciiFixture against IT + EN fixtures = 10 assertions); dispatch source-map test (Exception → enum state); locale-budget test |
| 3 | 04B-05 (death-saves StatusHudRenderer pivot + ConcDropModalPanel + integration smoke + schema extension) | 4-5 | character-reader test (death field reader against fixture actor JSON); status-hud-renderer death-saves mode unit test (initial/mid/recovery latch); conc-drop modal panel test (Y/N gesture handling + bridge event emission); integration smoke `04b-integration-smoke.test.ts` covering overlay slot mount/unmount + toast-survive-overlay + death-saves pivot + conc modal lifecycle |

**Stress cases (must each have a dedicated test):**

| ID | Scenario | Plan |
|----|----------|------|
| ST-1 | Fireball + 8 saves (9 toasts → 2 visible + `[+7]` squash) | 04B-03 |
| ST-2 | Open overlay while toast visible (toast must survive z=2 mount) | 04B-03 + 04B-01 |
| ST-3 | Open conc modal while death-saves active (z=2 stacks on z=1 pivot) | 04B-05 |
| ST-4 | Locale stress (IT longest names) on conc modal width budget | 04B-05 |
| ST-5 | Boot-error dispatch on all 5 Exception sources (handshake timeout, schema, bridge unreachable, version mismatch, no character) | 04B-04 |

---

## Per-Task Verification Map

> Planner fills this section after PLAN.md drafts land. Each task ID gets
> a row mapping to (a) the test file produced, (b) the automated verify
> command, (c) the Nyquist-sampling slot.

| Task ID | Test File | Verify Command | Sampling Slot |
|---------|-----------|----------------|--------------:|
| (planner fills) | | | |

---

## Manual-Only Verifications

> Phase 4b hardware-dependent SC — these carry `human_needed` gate.
> Software-side correctness is fully verifiable above; these require
> physical G2 + Foundry desktop.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overlay slot z=2 panel renders on real G2 without visual artifacts | MAP-05 | Phosphor display refresh + container z-order behavior depends on G2 firmware | 1) Boot G2. 2) Programmatically mount a stub ConcDropModalPanel via dev hook. 3) Verify panel visible at expected location. 4) Verify z=0.5 demolished (no idle infill artifacts). 5) Verify z=1 status HUD still visible. |
| Toast queue survives overlay open under real BLE latency | TOAST-01 | BLE round-trip jitter affects bundle() flush ordering perception | 1) Boot G2 in clean RF env. 2) Trigger Fireball + 8 saves stress (mock WS events). 3) Verify 2 toasts + `[+7]` badge. 4) Mount overlay panel. 5) Verify toasts persist (no flicker). |
| Boot error UI renders correctly across all 5 states on real G2 | BOOT-01 | Each error state must be reproducible against the live bridge | 1) For each of 5 error states, simulate the triggering condition (e.g., disconnect bridge, invalid token, downgrade proto version). 2) Verify the matching BootErrorLayer state renders with correct title + recovery hint. |
| Death-saves pivot triggers on real Foundry HP=0 event | DEATH-01 | Foundry write path latency + dnd5e v5.x `death` field reader must work against live actor data | 1) Open Foundry desktop. 2) Boot G2. 3) Damage actor to HP=0. 4) Verify Status HUD pivots to death-saves layout within 1 frame. 5) Roll death save fail. 6) Verify failure tick filled. 7) Heal actor. 8) Verify latch-off (returns to standard layout). |
| Concentration-drop modal emits canonical bridge event consumed by Phase 7 | CONC-01 | The `conc.drop.confirmed` envelope schema must round-trip cleanly via bridge to Foundry desktop | Deferred — Phase 7 is the write-path consumer. Phase 4b verification = bridge envelope schema test (round-trip parse). Real Foundry write test lands in Phase 7. |

---

## Validation Sign-Off

> Planner reconciles all sign-off boxes after Plan 04B-01..05 land + plan-checker passes.

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (Z1_5_TOAST enum, OverlayPanel interface, panel-gesture-bus, ADR-0009 Amendment 1)
- [ ] No watch-mode flags (all commands use `--run`)
- [ ] Feedback latency < 30 s for quick command
- [ ] Manual-Only section verified: 5 `human_needed` entries map to hardware-dependent SC
- [ ] Container budget audit (04B-RESEARCH.md §Q1) translated into Plan 01 verify gates
- [ ] Schema extension (Plan 05 Task 1) verified atomic: `CharacterSnapshotSchema.death` + `character-reader.ts` in same commit
- [ ] 17 new INV-1 fixtures land + matchAsciiFixture assertions in `snapshot.test.ts` extension
- [ ] Bridge event emission (Plan 05 conc-drop modal) verified via WS schema round-trip test
- [ ] Adversarial typecheck pattern (Plan 04A-04 precedent) considered for boot-error i18n budgets if width violations need CI gate
