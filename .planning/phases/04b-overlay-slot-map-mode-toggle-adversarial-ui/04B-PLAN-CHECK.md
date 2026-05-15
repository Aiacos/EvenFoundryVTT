---
phase: 4b
slug: overlay-slot-map-mode-toggle-adversarial-ui
verdict: NEEDS_REVISION
iteration: 1
blockers: 5
warnings: 6
checked: 2026-05-15
checker: gsd-plan-checker (sonnet)
plans_reviewed:
  - 04B-01-PLAN.md
  - 04B-02-PLAN.md
  - 04B-03-PLAN.md
  - 04B-04-PLAN.md
  - 04B-05-PLAN.md
issues:
  - id: B-1
    severity: blocker
    plan: "04B-02 + 04B-04"
    dimension: dependency_correctness
    description: "Plans 02 and 04 reference exported types BootEngineOptions + BootEngineDeps that do not exist in packages/g2-app/src/internal/boot-engine-core.ts — actual exported names are BootEngineOpts + TestingDependencies."
  - id: B-2
    severity: blocker
    plan: "04B-05"
    dimension: requirement_coverage
    description: "CharacterSnapshotSchema.death = REQUIRED extension breaks existing fixtures in 4 test files (example-status-hud.test.ts, scene-renderer-smoke.test.ts, snapshot.test.ts, status-hud-renderer.test.ts) but only 2 of these files are in Plan 05 files_modified. Plan 05 acknowledges 'Potential consumer break' in prose but does not enumerate the fixture-update workload — pnpm typecheck across workspace WILL fail after Task 1 commit."
  - id: B-3
    severity: blocker
    plan: "04B-04"
    dimension: dependency_correctness
    description: "Plan 04 imports _bootEngineCore from boot-engine-core.ts but does not list 04b-02 in depends_on. boot-engine-core.ts is modified by Plan 02 in Wave 1 and Plan 04 in Wave 2 depends on its post-Plan-02 state. Wave ordering provides the implicit guarantee, but the explicit depends_on chain should reflect this — particularly because Plan 04's signature claims (BootEngineOptions/BootEngineDeps) depend on what Plan 02 may or may not change."
  - id: B-4
    severity: blocker
    plan: "04B-05"
    dimension: key_links_planned
    description: "CONC-01 SC #5 requires the conc-modal to open on bridge-emitted conc.conflict event — Plan 05 ships the modal class but NO task wires the WS conc.conflict reception to ConcentrationDropModalPanel instantiation. Threat T-4b-05-02 mitigation references 'attachConcConflictHandler (scene-input.ts or boot-engine wiring)' but no plan task creates this dispatcher. Integration smoke ISM-* tests construct the modal directly with a synthetic conflict — the production code path is missing."
  - id: B-5
    severity: blocker
    plan: "04B-05"
    dimension: scope_sanity
    description: "Plan 05 has 5 tasks covering: schema atomic extension + concentration envelope schemas + StatusHudRenderer pivot + ConcentrationDropModalPanel + integration smoke. The 5-task count is the scope-sanity blocker threshold (target 2-3, warning 4, blocker 5+). Tasks 1+2 are pure schema work and could be a separate Wave-2 plan (in parallel with Plans 03+04) to relieve Wave-3 to 3 tasks."
  - id: W-1
    severity: warning
    plan: "04B-02"
    dimension: task_completeness
    description: "Plan 02 must_haves.artifacts says map-mode-toggle.ts 'provides: ... @internal dev hook documented' but action body says 'No @internal dev hook function — the production toggleMapMode is the test surface'. Self-contradictory — pick one and update both spots."
  - id: W-2
    severity: warning
    plan: "04B-01"
    dimension: invariants
    description: "ADR-0009 Amendment 1 cites SDK index.d.ts 'line 659-661' for containerTotalNum (Plan 01 Task 4 action). Actual containerTotalNum docstring is at line 638-647 of the installed SDK 0.0.10. Citation drift; should be corrected for INV-2 fidelity."
  - id: W-3
    severity: warning
    plan: "04B-04"
    dimension: task_completeness
    description: "Plan 04 Task 3 (bootEngineWithErrorUi) describes a 'makeErrorModeHandle(bridge)' helper that must return a BootEngineHandle but the actual BootEngineHandle requires { layerManager, rasterController, teardown }. The plan offers two workarounds (extend BootEngineHandle to make rasterController nullable — which means modifying boot-engine-core.ts, prohibited; or use @ts-expect-error cast). Both are friction sources; planner should pick ONE and concretize. Currently a 'document chosen approach in summary' delegation."
  - id: W-4
    severity: warning
    plan: "04B-05"
    dimension: invariants
    description: "Plan 05's conc-modal envelope construction (line ~347) uses session_id '00000000-0000-0000-0000-000000000000' which IS valid UUID v4 format but is a placeholder. Plan acknowledges via TODO(ADR-0009) comment but does NOT add a test asserting that EnvelopeSchema.safeParse passes on the constructed envelope at runtime — ISM-05 only asserts ws.send was called, not that the payload satisfies the protocol schema. Add a safeParse assertion in ISM-05 to close NF-1-class regression risk (Phase 4a precedent)."
  - id: W-5
    severity: warning
    plan: "04B-VALIDATION + all plans"
    dimension: task_completeness
    description: "VALIDATION.md Per-Task Verification Map is intentionally left empty (planner did NOT back-fill after PLAN.md drafts). While each task has an automated <verify> gate (Nyquist sampling satisfied at the PLAN.md level), the VALIDATION.md table is documented as a reconciliation responsibility of the planner. Either back-fill the map OR remove the section + add a note explaining the verify gates ARE the per-task reconciliation."
  - id: W-6
    severity: warning
    plan: "04B-01"
    dimension: scope_sanity
    description: "Plan 01 has 4 tasks (warning threshold). Tasks 1+2 (layer-types + overlay-panel + panel-gesture-bus + LayerManager.bundle extension) are the load-bearing Wave-0 work. Task 3 (i18n-budgets extension with 28 keys) could plausibly be a separate plan executed in parallel with Plans 03+04 since its only output is data. Splitting reduces Plan 01 to 3 tasks (engine + LM bundle + ADR amendment). However, the planner's choice to centralize i18n in Wave 0 IS architecturally sound (avoids Plans 03+04 modifying the same file in Wave 2). Trade-off documented; not a blocker."
resume_hint: "Return to planner with 5 blockers + 6 warnings. Critical: fix B-1 (type-name drift breaks compile), B-2 (workspace-wide fixture sweep), B-3 (depends_on chain), B-4 (CONC-01 missing dispatcher), B-5 (split Plan 05 OR justify 5-task scope as Wave-3 atomic exception)."
---

# Phase 4b — Plan Checker Report (Iteration 1)

## Verdict: NEEDS REVISION

**5 blockers · 6 warnings.** The plan set is architecturally coherent (Wave-0 centralization of i18n + differential demolish + atomic schema extension are all sound decisions), but several executable-critical drifts and a missing dispatcher will break the build or leave CONC-01 unfulfilled. Recommended: planner addresses B-1 through B-5 in a focused revision pass; warnings can be folded in opportunistically.

---

## Blockers (must fix before execution)

### B-1: Type-name drift — `BootEngineOptions`/`BootEngineDeps` do not exist in source

**Plans:** 04B-02 + 04B-04
**Dimension:** dependency_correctness

**Evidence:**
- Plan 02 `<interfaces>` block declares `BootEngineOptions { bridgeUrl, token, locale, ... }` and `BootEngineDeps { bridgeFactory?, wsFactory?, ... }`.
- Plan 04 `<interfaces>` block (line 154-155) declares same names: `export interface BootEngineOptions { bridgeUrl, token, locale, ... }` and `export interface BootEngineDeps { bridgeFactory?, wsFactory?, ... }`.
- Plan 04 Task 3 action body (line 496) writes: `import { _bootEngineCore, type BootEngineOptions, type BootEngineDeps, type BootEngineHandle } from '../internal/boot-engine-core.js';`
- Actual exports in `packages/g2-app/src/internal/boot-engine-core.ts`:
  - line 67: `export interface BootEngineOpts {` (NOT `BootEngineOptions`)
  - line 86: `export interface TestingDependencies {` (NOT `BootEngineDeps`)
  - line 100: `export interface BootEngineHandle {` ✓
  - line 192: `export async function _bootEngineCore(opts: BootEngineOpts, deps?: TestingDependencies)` ✓

**Impact:** `pnpm typecheck` will fail in both Plan 02's boot-engine-core.ts insertion and Plan 04's wrapper file unless the executor improvises corrections. Phase 4a's iteration-2 NF-1..NF-4 regressions were exactly this class of drift (invented schema names). The planner has reintroduced the same pattern.

**Fix:** Update both plans' `<interfaces>` blocks AND all code-shape snippets to use `BootEngineOpts` + `TestingDependencies` verbatim. Verify Plan 04 Task 3's import statement matches actual exports.

---

### B-2: Workspace-wide fixture sweep for CharacterSnapshotSchema.death NOT enumerated

**Plan:** 04B-05
**Dimension:** requirement_coverage

**Evidence:**
- Plan 05 Task 1 makes `CharacterSnapshotSchema.death` a REQUIRED field (no `.optional()`) per CONTEXT §Area 7 atomic-commit decision.
- The action body acknowledges: *"Any existing consumer of CharacterSnapshotSchema that passes a snapshot WITHOUT a `death` field will fail safeParse. Phase 4a's StatusHudLayer test fixtures probably pass partial snapshots — if so, they need to be updated to include `death: { success: 0, failure: 0 }`. The executor MUST grep for `CharacterSnapshotSchema.safeParse` or `CharacterSnapshot` literal usage across the workspace and update fixtures..."*
- Grep across the workspace finds 4 affected test files NOT enumerated in any plan's `files_modified`:
  - `packages/g2-app/src/__tests__/example-status-hud.test.ts` (IDLE_SNAPSHOT fixture at line 35)
  - `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` (snapshot at line 328 — ALSO modified by Plan 02 for SR-11..SR-13)
  - `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` (IDLE_SNAPSHOT at line 37)
  - `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` (makeSnapshot at line 34) — IS in Plan 05 files_modified (Task 3 extends with SR-DS-1..8)
  - `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` (VALID_SNAPSHOT at line 66) — IS in Plan 05 files_modified (Task 3 extends with SHL-PIVOT-1..7)

**Impact:** `pnpm typecheck` after Task 1 commit will fail in 3 of the 4 affected fixture files (example-status-hud, scene-renderer-smoke, snapshot.test.ts) because the typescript type `CharacterSnapshot` will require a `death` field that the existing literal does not provide. Plan 05 Task 1's `<verify>` block runs `pnpm typecheck` and will block the commit until fixtures are updated — but the planner has not specified WHICH fixtures or how to coordinate with Plan 02's scene-renderer-smoke modifications.

**Fix:** Add the 3 missing test files to Plan 05 Task 1 `files_modified`. Add a concrete instruction in the action body: "Update IDLE_SNAPSHOT in example-status-hud.test.ts, the inline snapshot in scene-renderer-smoke.test.ts, and IDLE_SNAPSHOT in snapshot.test.ts to include `death: { success: 0, failure: 0 }`". Note the overlap with Plan 02's scene-renderer-smoke.test.ts and either (a) declare Plan 05 the second mover with explicit "merges with Plan 02's edits" or (b) move the fixture-extension to Plan 02 as part of SR-11..SR-13 prep.

---

### B-3: Plan 04 missing transitive depends_on of 04b-02

**Plan:** 04B-04
**Dimension:** dependency_correctness

**Evidence:**
- Plan 04 imports `_bootEngineCore` from `packages/g2-app/src/internal/boot-engine-core.ts` (Task 3 action body line 496).
- That file is modified by Plan 02 in Wave 1 (adds `loadPersistedMapMode` import + step-9b override).
- Plan 04 `depends_on: ["04b-01"]` only — declares NO dependency on Plan 02.
- Plan 04 `<read_first>` does cite `boot-engine-core.ts (post-Plan-02 — exports _bootEngineCore, BootEngineOptions, BootEngineDeps, BootEngineHandle)` (line 462) but the frontmatter does not reflect this.

**Impact:** Wave-based orchestration provides the implicit guarantee that Wave 1 (Plan 02) completes before Wave 2 (Plan 04) starts, so the executable order is safe. However, the explicit `depends_on` chain is the contract the orchestrator uses; if it ever rewires to dependency-driven scheduling (instead of wave-bracket scheduling), Plan 04 could be scheduled before Plan 02 completes. This is a latent fragility, not an immediate compile failure.

**Fix:** Add `04b-02` to Plan 04's `depends_on`: `depends_on: ["04b-01", "04b-02"]`. Update the wave annotation OR document that Wave 2 implicitly waits on Wave 1.

---

### B-4: CONC-01 dispatcher missing — no task wires `conc.conflict` WS event to modal mount

**Plan:** 04B-05
**Dimension:** key_links_planned

**Evidence:**
- ROADMAP.md SC #5 (CONC-01 portion): *"on a 'cast concentration spell while already concentrated' event the overlay slot opens a confirm modal that requires explicit tap to break the previous concentration"*.
- CONTEXT §Area 8 (locked): *"Trigger: Bridge emits a conc.conflict event when the player attempts to cast a concentration spell while a concentration effect is already active... Phase 4b implements only the client-side modal display + user choice capture."*
- Plan 05 Task 4 ships `ConcentrationDropModalPanel` class but the constructor takes `(bridge, ws, gestureBus, conflict, locale, onClose)` — the `conflict: ConcConflictPayload` is passed in by an external caller.
- Plan 05 threat T-4b-05-02 mitigation: *"ConcConflictPayloadSchema.safeParse() at WS receive boundary in attachConcConflictHandler (scene-input.ts or boot-engine wiring); failure → log + ignore, no modal mount. The scene-input dispatcher gate is the single trust boundary."*
- Plan 05 NO task creates `attachConcConflictHandler` or modifies `scene-input.ts` to dispatch conc.conflict → modal mount.
- Plan 05 integration smoke ISM-* tests construct the modal directly with a synthetic conflict object — they do NOT verify the production dispatch path.

**Impact:** The CONC-01 SC #5 software-side completion claim is unverifiable. The modal class is ready but nothing in the production code path will mount it when bridge emits conc.conflict. Without this wiring, Phase 4b's CONC-01 deliverable is "we built the modal" not "the modal opens when triggered" — half of the user-observable behavior.

**Fix:** Add a Task 6 (or expand Task 4) that creates the dispatcher:
- New file `packages/g2-app/src/panels/conc-conflict-dispatcher.ts` exporting `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale)`.
- Implementation: subscribes to WS messages; on `type === 'conc.conflict'` runs `ConcConflictPayloadSchema.safeParse(envelope.payload)` then `layerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: new ConcentrationDropModalPanel(...) }])`.
- Add an ISM test asserting end-to-end: simulate a `conc.conflict` envelope on the WS mock → modal mounts at z=2.
- Decide whether wiring happens in boot-engine-core.ts (Plan 02's domain — conflicts) or in a Phase 4b-specific bootstrap entry point.

---

### B-5: Plan 05 scope at blocker threshold (5 tasks)

**Plan:** 04B-05
**Dimension:** scope_sanity

**Evidence:**
- Plan 05 has 5 tasks (counted via `<task type=` grep).
- Per scope sanity heuristic: 2-3 target, 4 warning, 5+ blocker.
- Files modified by Plan 05: 18 (5 schema/reader + 1 conc envelope + 2 status-hud src + 2 status-hud tests + 2 panel files + 1 integration smoke + 4 fixtures + 1 shared-protocol index).
- Plan 05 carries: schema atomic extension (Task 1) + new envelope file (Task 2) + StatusHudRenderer + StatusHudLayer extension (Task 3) + ConcentrationDropModalPanel (Task 4) + integration smoke (Task 5).

**Impact:** Quality degradation risk on a Wave-3 plan that ratifies ALL of Phase 4b end-to-end. The integration smoke test alone is 9 ISM-* cases covering 5 stress scenarios. Splitting reduces context pressure on the executor and makes failure-mode recovery cheaper.

**Fix options:**
- **(a)** Split Plan 05 → Plan 05a (Wave 2, parallel to 03+04): schema atomic + concentration envelopes (Tasks 1+2). Plan 05b (Wave 3): StatusHudRenderer pivot + ConcDropModalPanel + integration smoke (Tasks 3+4+5). depends_on updated.
- **(b)** Justify the 5-task scope as a Wave-3 atomic exception with a documented rationale (integration smoke MUST run after all of 01-04 land — true; but Tasks 1+2 are pure schema work and need not wait).
- **(c)** Merge Tasks 1+2 into one task (atomic schema commit covering both character + concentration in a single git commit) — reduces to 4 tasks (warning, not blocker).

Recommendation: (c) as the minimum fix; (a) as the higher-quality fix.

---

## Warnings (should fix; execution can proceed with workarounds)

### W-1: Plan 02 self-contradictory `@internal dev hook` claim

**Plan:** 04B-02
**Dimension:** task_completeness

`must_haves.artifacts` line 28 says map-mode-toggle.ts `provides: "...@internal dev hook documented"`. Action body line 252 says *"No @internal dev hook function — the production toggleMapMode is the test surface."* Either remove the artifact claim OR add the dev hook (and explain its purpose).

### W-2: ADR-0009 Amendment 1 SDK citation drift

**Plan:** 04B-01
**Dimension:** invariants

Task 4 action body (line 617): `"containerTotalNum: 1-12 re-verified against @evenrealities/even_hub_sdk@0.0.10 index.d.ts line 659-661 on 2026-05-15"`. Actual SDK 0.0.10 has containerTotalNum docs at line 638-647 (verified). INV-2 fidelity requires accurate citation. Plan 02's similar citation (`line 1135-1157` for setLocalStorage) is also imprecise — actual signatures at line 1144 (setLocalStorage) + 1157 (getLocalStorage); fix during the same revision pass.

### W-3: BootEngineHandle workaround unresolved

**Plan:** 04B-04
**Dimension:** task_completeness

Plan 04 Task 3 (line 528-531) describes two workarounds for the `makeErrorModeHandle` returning a degenerate BootEngineHandle (which requires `rasterController: RasterController` — non-nullable). Plan offers:
- (a) modify boot-engine-core.ts to make `rasterController?: RasterController | null` — explicitly PROHIBITED ("Plan 04 should NOT modify boot-engine-core.ts").
- (b) `@ts-expect-error` cast — documented compromise.

The plan ends with: *"Document the chosen approach in 04b-04-SUMMARY.md."* Leaving the choice to the executor for a load-bearing type structure is suboptimal. Pick one in the plan.

### W-4: Plan 05 ISM-05 missing EnvelopeSchema.safeParse assertion

**Plan:** 04B-05
**Dimension:** invariants

ISM-05 asserts `ws.send` was called with a JSON-stringified envelope containing `conc.drop.confirmed`. It does NOT run `EnvelopeSchema.safeParse(JSON.parse(sentMessage))` to verify the envelope satisfies the protocol schema. Phase 4a iteration-2 NF-1 was exactly this class of regression (WireEnvelopeSchema invented; tests passed without round-trip schema validation). Add: `expect(EnvelopeSchema.safeParse(JSON.parse(wsSendArgs)).success).toBe(true);`.

### W-5: VALIDATION.md Per-Task Verification Map unfilled

**Plan:** 04B-VALIDATION
**Dimension:** task_completeness

VALIDATION.md table line 64: *"(planner fills)"*. The table is documented as a reconciliation responsibility. Each task in Plans 01-05 has an `<automated>` `<verify>` gate, so Nyquist sampling IS satisfied at the PLAN.md level — but VALIDATION.md is the cross-phase audit source. Either back-fill the map OR add a note: "Per-task verification map is RESCINDED in favor of in-plan `<verify>` gates; see PLAN.md `<automated>` blocks for the per-task reconciliation."

### W-6: Plan 01 scope at 4 tasks (warning threshold)

**Plan:** 04B-01
**Dimension:** scope_sanity

Plan 01 has 4 tasks. Task 3 (i18n-budgets 28-key extension) is data work; Task 4 (ADR-0009 Amendment 1) is documentation. Architectural rationale (Wave-0 centralization to prevent Wave-2 file conflicts) is sound — splitting would re-introduce the conflict. NOT a fix-required warning; documented for completeness.

---

## Verification Notes (what was done well)

### Architectural coherence

- **Differential demolish rule + container budget audit** (CONTEXT §Area 1 REVISED + 04B-RESEARCH §Q1): correctly implemented as a runtime assertion in `LayerManager.bundle()` with a documented ADR amendment. Plan 01 ships the rule AND the test (LMT-DD-04 pins z=1.5 preservation). Closed + open state container tables computed and within the 4+8 SDK cap.
- **Wave-0 i18n centralization** (Plan 01 Task 3): 28 keys landed atomically in Wave 0 to prevent Plans 03+04 from racing on the same file in Wave 2. Sound design choice; avoids parallel-execution conflicts.
- **Atomic schema commit** (Plan 05 Task 1): `CharacterSnapshotSchema.death` + `character-reader.ts` extension specified as a single git commit per Pitfall 3 mitigation. REQUIRED field (not `.optional()`) honoured per CONTEXT §Area 7 revision.
- **B-4 forward-import avoidance** (Plan 01 → Plan 05 via `OverlayPanel` interface): Plan 01 ships the interface in `layer-types.ts`; Plan 05 imports the type from Plan 01's surface at its commit boundary. No forward cycle.
- **In-process panel-gesture-bus** (Plan 01 Task 1 + Plan 05 Task 4): correctly scoped as Phase 4b in-process pub/sub, with subscribe/unsubscribe lifecycle + try/catch isolation per RESEARCH §Q2.

### Test coverage

- All tasks have `<automated>` `<verify>` gates (Nyquist sampling satisfied).
- Stress cases ST-1 through ST-5 each have a dedicated test or unit-test path (TQL-FIFO-05, ISM-03, ISM-04, ISM-08, BED-*).
- INV-1 fixtures: 17 new (3 toast + 10 boot-error + 4 death-saves/conc-modal) — matches VALIDATION.md claim.
- Threat models present in every plan with STRIDE classification + disposition.

### Context compliance

- 8 of 8 CONTEXT §Area decisions traced to implementing tasks (verified per dimension 2).
- Deferred ideas (Quick Action menu, real Foundry write path, real R1 gesture routing, Phase 5 panels, multi-attack, reactions, color effects, Specs v0.9.13 bump) explicitly excluded from plan scope.
- Locked CONTEXT decisions Area 1 + Area 7 (revised post-research 2026-05-15) are honoured.

### Phase 4a regression NF-1..NF-4 status

- **NF-1 (EnvelopeSchema usage):** Plan 05 imports `CONC_DROP_CONFIRMED_TYPE` from `@evf/shared-protocol` and constructs envelopes with real shape (proto, seq, ts, type, session_id, payload). Does NOT reference `WireEnvelopeSchema` or `envelope.value`. ✓
- **NF-2 (Plan-05 Option B):** N/A (no Option A/B choice in Phase 4b).
- **NF-3 (test colocation):** Plans honour the Phase 4a-established convention (`packages/g2-app/src/__tests__/` for g2-app; beside source for shared-protocol + foundry-module). ✓
- **NF-4 (boot-engine DI surface):** Plan 02 + Plan 04 share boot-engine-core.ts territory; coordination via the wrapper-in-separate-file pattern (Plan 04's `boot-engine-error-wrapper.ts` is in `engine/` not `internal/`). Coordinated. ✓ (but see B-1 + B-3 for type-name drift class of regression)

---

## Routing Recommendation

**Return to planner.** Address blockers B-1 through B-5 in iteration 2; warnings W-1 through W-6 should be folded in opportunistically.

**Critical fixes (must close before re-check):**
1. **B-1** — Replace `BootEngineOptions`/`BootEngineDeps` with `BootEngineOpts`/`TestingDependencies` in Plans 02 + 04 (frontmatter `<interfaces>` blocks + all import statements + all code-shape snippets).
2. **B-2** — Add the 3 missing test files to Plan 05 Task 1 `files_modified` AND specify the fixture-extension action explicitly. Resolve the scene-renderer-smoke.test.ts overlap with Plan 02 (either co-modify or move fixture prep to Plan 02).
3. **B-3** — Add `04b-02` to Plan 04 `depends_on`.
4. **B-4** — Add a dispatcher task to Plan 05 (or new Plan 06) that wires `conc.conflict` WS event → `ConcentrationDropModalPanel` mount via `layerManager.bundle()`. Add an ISM test for the end-to-end dispatch path.
5. **B-5** — Decide on Plan 05 split (option a/b/c). At minimum merge Tasks 1+2 (option c) to drop below the 5-task threshold.

**Re-check focus on iteration 2:** B-1..B-5 closure verification; spot-check W-1..W-6 disposition.

## PLAN CHECK COMPLETE
