---
phase: 4b
slug: overlay-slot-map-mode-toggle-adversarial-ui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-15
revised: 2026-05-15
iteration: 2
---

# Phase 4b — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Models on Phase 4a's VALIDATION.md (`04A-VALIDATION.md`).
> Revised 2026-05-15 (iteration 2) — adds Plan 06 (Wave 2 atomic schema split per B-5) + W-5 note on per-task verification map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Test runner | Vitest 4.1.5 + happy-dom 20.9.0 (g2-app, shared-render) + node test env (foundry-module, shared-protocol) |
| Test colocation | `packages/g2-app/src/__tests__/` (g2-app local convention); beside source for foundry-module + shared-protocol (Phase 4a precedent) |
| ASCII fixtures | `packages/shared-render/src/fixtures/<category>.<state>[.<locale>].txt` — 17 new fixtures per 04B-UI-SPEC.md §6 |
| Adversarial typecheck | Plan 04 (boot-error i18n budgets) can reuse the Plan 04A-04 pattern (`i18n-budgets-adversarial.test.ts` spawning `tsc --noEmit`) if budget violations need CI gates |
| Schema verify | Plan 06 lands `CharacterSnapshotSchema.death` field + concentration envelope schemas — co-located tests in `packages/shared-protocol/src/payloads/{character,concentration}.test.ts` |

---

## Sampling Strategy (Nyquist Compliance)

Sampling rule (project-wide): no 3 consecutive tasks may lack an
automated `<verify>` gate. Phase 4b has 6 plans × est. 2-4 tasks each =
~16-18 tasks total. Sampling cadence: minimum 1 automated verify every
3 tasks, target 1 automated verify per task.

| Wave | Plan | Est. Tasks | Verify Targets |
|------|------|-----------:|----------------|
| 0 | 04B-01 (overlay slot machinery + Panel API + ZIndex.Z1_5_TOAST + panel-gesture-bus + ADR-0009 Amendment 1) | 3-4 | typecheck on new types; `! grep -E "createPanel\|panel-gesture-bus" packages/g2-app/src/index.ts` (W-4-style boundary gate); ADR frontmatter `status: accepted` after Plan 01 lands the differential demolish rule |
| 1 | 04B-02 (map mode toggle + Even Hub persistence + boot read-back) | 2 | `toggleMapMode()` unit test (sync transition + persistence call); boot-read fallback unit test (`getLocalStorage` failure → 'auto' verdict); typecheck |
| 2 | 04B-03 (toast queue z=1.5 + FIFO + squash) | 3-4 | toast-queue-layer unit test (1 toast / 2 toasts / squash badge); Fireball+8 saves stress integration test; INV-1 fixtures `toast-queue.{single,dual,squashed}.it.txt` matchAsciiFixture |
| 2 | 04B-04 (boot error UI 5 states + bootErrorFromException dispatch) | 3 | per-state render test (5 × matchAsciiFixture against IT + EN fixtures = 10 assertions); dispatch source-map test (Exception → enum state); locale-budget test; `! grep -E 'BootEngineOptions\|BootEngineDeps'` boundary gate (B-1 regression guard) |
| 2 | 04B-06 **(NEW per B-5 split)** (atomic schema extension: CharacterSnapshotSchema.death + DeathSavesSchema + concentration.ts envelope schemas + character-reader.ts producer + 3 g2-app consumer fixture updates) | 2 | atomic-commit verification (single SHA touches 8 files); schema safeParse tests (CS-DS-1..8); reader round-trip tests (CR-DS-1..5); concentration schema tests including W-4 EnvelopeSchema round-trip (CN-9 positive + CN-10 negative — proves canonical EnvelopeSchema + payload field + required session_id UUID); workspace-wide pnpm typecheck (B-2 closure: 3 g2-app fixtures updated atomically) |
| 3 | 04B-05 (death-saves StatusHudRenderer pivot + ConcDropModalPanel + conc-conflict-dispatcher + integration smoke) | 3 | status-hud-renderer death-saves mode unit test (initial/mid/recovery latch); conc-drop modal panel test (Y/N gesture handling + bridge event emission + CDM-10 EnvelopeSchema round-trip = W-4 closure); conc-conflict-dispatcher.test.ts (B-4 closure: production dispatcher unit + ISM-10 end-to-end); integration smoke `04b-integration-smoke.test.ts` covering overlay slot mount/unmount + toast-survive-overlay + death-saves pivot + conc modal lifecycle + dispatcher + W-4 round-trip; grep gate `! grep -E 'WireEnvelopeSchema\|envelope\.value'` across modal + dispatcher + smoke |

**Stress cases (must each have a dedicated test):**

| ID | Scenario | Plan |
|----|----------|------|
| ST-1 | Fireball + 8 saves (9 toasts → 2 visible + `[+7]` squash) | 04B-03 |
| ST-2 | Open overlay while toast visible (toast must survive z=2 mount) | 04B-03 + 04B-01 (LMT-DD-04 unit) + 04B-05 (ISM-03 integration) |
| ST-3 | Open conc modal while death-saves active (z=2 stacks on z=1 pivot) | 04B-05 (ISM-04) |
| ST-4 | Locale stress (IT longest names) on conc modal width budget | 04B-05 (CDM-7 + ISM-08) |
| ST-5 | Boot-error dispatch on all 5 Exception sources (handshake timeout, schema, bridge unreachable, version mismatch, no character) | 04B-04 (BED-* + BOOT-ERR-INT-*) |

---

## Per-Task Verification Map

> **W-5 closure (iteration 2):** Per-Task Verification Map is auto-derived from each PLAN.md `<verify>` block.
> Each task in Plans 01-06 has an `<automated>` `<verify>` gate satisfying Nyquist sampling at the
> PLAN.md level — those gates ARE the per-task reconciliation. This table is INTENTIONALLY a
> cross-reference index pointing to where the per-task gates live (the PLAN.md `<automated>` blocks),
> not a duplication. Auditors look at the individual PLAN.md files; the orchestrator's gsd-plan-checker
> verifies each plan's `<verify>` block exists and the Nyquist 1-in-3 cadence holds across the phase.

| Plan | Task | Where the `<verify>` Lives | Sampling Slot |
|------|------|-----------------------------|---------------|
| 04B-01 | Task 1 (engine + ZIndex + OverlayPanel + R1Gesture) | 04B-01-PLAN.md Task 1 `<verify>` | W0 / slot 1 |
| 04B-01 | Task 2 (LayerManager.bundle + differential demolish + container budget) | 04B-01-PLAN.md Task 2 `<verify>` | W0 / slot 2 |
| 04B-01 | Task 3 (HUD_WIDTH_BUDGETS 28 keys + i18n-budgets-extension.test.ts) | 04B-01-PLAN.md Task 3 `<verify>` | W0 / slot 3 |
| 04B-01 | Task 4 (ADR-0009 Amendment 1) | 04B-01-PLAN.md Task 4 `<verify>` | W0 / slot 4 |
| 04B-02 | Task 1 (map-mode-toggle module + unit tests) | 04B-02-PLAN.md Task 1 `<verify>` | W1 / slot 1 |
| 04B-02 | Task 2 (boot-engine-core step-9 override + SR-11/12/13) | 04B-02-PLAN.md Task 2 `<verify>` | W1 / slot 2 |
| 04B-03 | (per Plan 03) | 04B-03-PLAN.md Tasks 1-N `<verify>` | W2 |
| 04B-04 | Task 1 (boot-error-types + BOOT_ERROR_CONTENT table) | 04B-04-PLAN.md Task 1 `<verify>` | W2 / slot 1 |
| 04B-04 | Task 2 (boot-error-layer + boot-error-dispatch + 10 fixtures) | 04B-04-PLAN.md Task 2 `<verify>` | W2 / slot 2 |
| 04B-04 | Task 3 (boot-engine-error-wrapper + B-1 + W-3 regression guards) | 04B-04-PLAN.md Task 3 `<verify>` | W2 / slot 3 |
| 04B-06 | Task 1 (atomic schema + reader + 3 fixture fan-out — B-2 closure) | 04B-06-PLAN.md Task 1 `<verify>` | W2 / slot 4 |
| 04B-06 | Task 2 (concentration.ts schemas + CN-9/10 EnvelopeSchema round-trip — W-4 precursor) | 04B-06-PLAN.md Task 2 `<verify>` | W2 / slot 5 |
| 04B-05 | Task 1 (StatusHudRenderer pivot + StatusHudLayer trigger + 2 death-saves fixtures) | 04B-05-PLAN.md Task 1 `<verify>` | W3 / slot 1 |
| 04B-05 | Task 2 (ConcentrationDropModalPanel + conc-conflict-dispatcher + 2 conc fixtures — CONC-01 + B-4) | 04B-05-PLAN.md Task 2 `<verify>` | W3 / slot 2 |
| 04B-05 | Task 3 (04b-integration-smoke ISM-01..10 — including ISM-05 W-4 + ISM-10 B-4 closure) | 04B-05-PLAN.md Task 3 `<verify>` | W3 / slot 3 |

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
| Concentration-drop modal emits canonical bridge event consumed by Phase 7 | CONC-01 | The `conc.drop.confirmed` envelope schema must round-trip cleanly via bridge to Foundry desktop | Deferred — Phase 7 is the write-path consumer. Phase 4b verification = bridge envelope schema test (round-trip parse via CDM-10 + ISM-05 EnvelopeSchema.safeParse). Real Foundry write test lands in Phase 7. |
| Conc-conflict dispatcher wires into bootEngine and mounts modal on bridge-emitted event | CONC-01 (B-4 hardware) | The `attachConcConflictHandler` wiring into boot-engine-core.ts step 11 area lands in Phase 6 (not Phase 4b) | Phase 4b verifies the dispatcher in isolation (CCD-1..8 + ISM-10). Phase 6 will land the boot-engine wiring + manual verification on real G2 + bridge. |

---

## Validation Sign-Off

> Planner reconciles all sign-off boxes after Plan 04B-01..06 land + plan-checker passes.

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (Z1_5_TOAST enum, OverlayPanel interface, panel-gesture-bus, ADR-0009 Amendment 1)
- [ ] No watch-mode flags (all commands use `--run`)
- [ ] Feedback latency < 30 s for quick command
- [ ] Manual-Only section verified: 6 `human_needed` entries map to hardware-dependent SC (added B-4 dispatcher hardware row)
- [ ] Container budget audit (04B-RESEARCH.md §Q1) translated into Plan 01 verify gates
- [ ] Schema extension (Plan 06 Task 1) verified atomic: `CharacterSnapshotSchema.death` + `character-reader.ts` + 3 g2-app consumer fixtures in same commit (B-2 closure)
- [ ] 17 new INV-1 fixtures land + matchAsciiFixture assertions in `snapshot.test.ts` extension
- [ ] Bridge event emission (Plan 05 conc-drop modal) verified via WS schema round-trip test (CDM-10 + ISM-05 — W-4 closure)
- [ ] Conc-conflict dispatcher (Plan 05 conc-conflict-dispatcher.ts) verified via CCD-1..8 unit + ISM-10 integration (B-4 closure)
- [ ] B-1 regression guard: `! grep -E 'BootEngineOptions|BootEngineDeps'` succeeds across Plan 04 deliverables
- [ ] W-4 regression guard: `! grep -E 'WireEnvelopeSchema|envelope\.value'` succeeds across Plan 05 + Plan 06 deliverables
- [ ] Adversarial typecheck pattern (Plan 04A-04 precedent) considered for boot-error i18n budgets if width violations need CI gate
</content>
</invoke>
