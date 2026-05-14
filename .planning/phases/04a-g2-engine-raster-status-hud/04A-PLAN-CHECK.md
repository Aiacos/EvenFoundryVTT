---
phase: 4a
slug: g2-engine-raster-status-hud
verdict: NEEDS_REVISION
blockers: 5
warnings: 4
checked: 2026-05-15
checker: gsd-plan-checker (sonnet)
plans_reviewed:
  - 04A-01-PLAN.md
  - 04A-02-PLAN.md
  - 04A-03-PLAN.md
  - 04A-04-PLAN.md
  - 04A-05-PLAN.md
---

# Phase 4a — Plan Checker Report

> Goal-backward verification of 5 PLAN.md files against ROADMAP success criteria + CONTEXT.md locked decisions + REQ ID coverage + INV-1/INV-3/INV-4 invariants.

## Verdict: NEEDS REVISION

**5 blockers** require resolution before execution.
**4 warnings** are quality recommendations.

---

## Blockers

### B-1: Plan 01 requirement-coverage framing error
- **Plan:** 04A-01
- **Dimension:** requirement_coverage
- **Issue:** Plan 01 frontmatter claims DISP-02 coverage but only adds a type constant — no behavioral enforcement. I18N-04's `satisfies Record<string, WidthBudgetRow>` gate (Plan 04) is never adversarially tested — no failing-typecheck test proves CI would catch a budget-busting string.
- **Fix:** Remove DISP-02 from Plan 01 requirements (Plan 02 fully enforces it). Add a test to Plan 04 IB-3 that constructs a budget-violating `satisfies` and confirms `pnpm typecheck` fails.

### B-2: Plan 03 silently overrides locked CONTEXT.md Area 2 decision (USER INPUT NEEDED)
- **Plan:** 04A-03, Task 1
- **Dimension:** context_compliance
- **User-locked decision (CONTEXT.md Area 2):** `32×32 px sub-tiles within each 200×100 image container (6×3 grid = 18 sub-tiles per container; 4 containers × 18 = 72 sub-tiles per full frame)`
- **Plan override:** 28 sub-tiles per container (4×7 ceil arithmetic = 112 sub-tiles per full frame), declared as "locked decision for this plan" with a JSDoc comment citing "discrepancy".
- **Severity:** Blocker — planner cannot unilaterally override a user-locked decision. Either implement the user-decided 18-floor geometry, OR surface the floor-vs-ceil trade-off to the user for re-decision (would amend CONTEXT.md Area 2).
- **Decision required:** User must accept ceil (28) or stay with floor (18).

### B-3: VALIDATION.md self-declared nyquist_compliant: false + mismatched test paths
- **File:** 04A-VALIDATION.md
- **Dimension:** task_completeness / nyquist
- **Issue:** VALIDATION.md frontmatter declares `nyquist_compliant: false`; all sign-off checkboxes unchecked; Per-Task Verification Map references test file paths inconsistent with finalized plan task files (e.g., references `image-q-worker.test.ts`, `delta-hasher.test.ts`, `tile-encoder.test.ts`, `scene-renderer.test.ts` but Plan 03 produces `tile-delta.test.ts`, `rle-encoder.test.ts`, `raster-controller.test.ts`, `glyph-renderer.test.ts`, `map-base-layer.test.ts`).
- **Fix:** Reconcile Per-Task Verification Map with actual task IDs and finalized test file paths from PLAN.md files; check all sign-off boxes; set `nyquist_compliant: true` and `wave_0_complete: true`.

### B-4: Plan 03 Task 2 → Task 3 forward import cycle
- **Plan:** 04A-03, Task 2
- **Dimension:** dependency_correctness
- **Issue:** Task 2 (`glyph-renderer + MapBaseLayer`) imports `RasterController` from `./raster-controller.js` — but `raster-controller.ts` is created in Task 3 of the same plan. `pnpm typecheck` will fail at the Task 2 commit boundary.
- **Fix:** Either (a) reorder tasks (3 before 2), (b) introduce a `RasterController` interface stub in Task 1 (alongside other interface contracts) that Task 2 can import safely, or (c) split MapBaseLayer construction to Task 3 leaving Task 2 as glyph-renderer only.

### B-5: No plan wires Foundry PIXI canvas extraction — raster pipeline has no data source
- **Plans:** all 5 — gap is systemic
- **Dimension:** key_links_planned
- **Issue:** SC #2 requires "Foundry scene rendered as 4-bit dithered raster" — this requires hooking into Foundry's `canvas.app.renderer` or `canvas.stage` to extract pixels via PIXI's `renderer.extract.pixels()`. **Zero tasks** implement this. The raster pipeline (RasterController.requestFrame, MapBaseLayer.draw) accepts pixel data as input but no code path supplies pixel data from Foundry's canvas.
- **Fix:** Add a task (most likely in Plan 03 or a new Plan 06) that implements:
  - Foundry hook (e.g., `Hooks.on('canvasReady', …)` or `'drawCanvas'`)
  - PIXI renderer.extract.pixels() call (with transferable ArrayBuffer for Worker transfer)
  - Wire from hook to `RasterController.requestFrame(pixelData, w, h)`
  - Note: this hook lives in `packages/foundry-module/` not `packages/g2-app/` — it must run inside Foundry desktop, then ship pixels over WS to g2-app via the Phase 3 bridge.

---

## Warnings

### W-1: Plan 03 size — 11 files / 31+ tests (planner-acknowledged ~30-40% context)
- Risk: Task 3 alone is a 10-stage Worker pipeline + RasterController + 8 tests. Consider splitting Task 3.

### W-2: INV-1 ck 11-15 not individually mapped to test IDs
- VALIDATION.md maps all INV-1 fixture testing to a single entry `4a-04-02`. ck 12 (raster-idle) and ck 13 (glyph-idle) have no dedicated `matchAsciiFixture` assertions.
- Fix: Add per-ck named test assertions in `i18n-budgets.test.ts` or new `snapshot.test.ts`.

### W-3: Sub-tile override JSDoc lacks ADR/issue reference (INV-4 violation)
- Plan 03 Task 1's JSDoc explains the 18→28 override but provides no ADR or issue link — violates CLAUDE.md INV-4 ("// TODO requires (#issue) or (ADR-NNNN)").
- Fix: Reference ADR-0009 Amendment 1 or open a GitHub issue.

### W-4: bootEngine() DI parameters lack @internal/@testOnly enforcement
- Plan 05 Task 1's `BootEngineOpts` exposes `wsFactory` / `bridgeFactory` for test injection but the type is production-accessible. Threat T-4a-05-04 accepts the risk as "test-only" — but the type signature doesn't enforce this.
- Fix: Add `@internal` JSDoc or define a separate `TestingDependencies` type.

---

## Routing Recommendation

This many blockers (5) typically warrants a planner revision cycle. However, **B-2 requires user input** (the locked CONTEXT.md Area 2 decision was silently overridden — the planner cannot fix this without user approval of the new geometry, or the user can demand the original be implemented).

Three paths forward:
1. **Revise via planner cycle** — re-spawn planner with this report as input. Revision iteration 1/3. Resolves B-1/3/4/5 + W-1..4 inline, surfaces B-2 to user via prompt.
2. **User resolves B-2 directly** — quick AskUserQuestion about floor vs ceil. Then planner revision handles B-1/3/4/5.
3. **Manual edit** — edit specific PLAN.md files to fix the 5 blockers. Skips planner re-spawn (saves opus tokens) but lacks integrated re-verification.

Per /gsd-autonomous workflow, blockers route to handle_blocker. Suggested AskUserQuestion options surfaced separately.
