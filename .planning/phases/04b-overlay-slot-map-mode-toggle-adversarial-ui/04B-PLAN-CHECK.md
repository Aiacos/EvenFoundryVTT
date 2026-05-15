---
phase: 4b
slug: overlay-slot-map-mode-toggle-adversarial-ui
verdict: APPROVED
iteration: 3
iteration_3_orchestrator_followup: true
blockers: 0
warnings: 0
checked: 2026-05-15
checker: gsd-plan-checker (sonnet) + orchestrator inline fix for B-2 residual partial
plans_reviewed:
  - 04B-01-PLAN.md
  - 04B-02-PLAN.md
  - 04B-03-PLAN.md
  - 04B-04-PLAN.md
  - 04B-05-PLAN.md
  - 04B-06-PLAN.md
iter1_findings_closure:
  B-1: RESOLVED
  B-2: RESOLVED  # iter-3 verdict was PARTIAL; orchestrator inline-fixed 2026-05-15 commit 2de235c — Plan 06 atomic commit expanded from 10 to 13 files. Added: packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts (makeSnapshot factory) + packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts (VALID_SNAPSHOT const) + packages/bridge/src/server.test.ts (mockSnapshot const — bridge route's safeParse returns 404 on drift, so the 200-expecting test mock also needs the field). Each literal gets `death: { success: 0, failure: 0 }` in the same atomic commit as the schema extension.
  B-3: RESOLVED
  B-4: RESOLVED
  B-5: RESOLVED
  W-1: RESOLVED
  W-2: RESOLVED
  W-3: RESOLVED
  W-4: RESOLVED
  W-5: RESOLVED
  W-6: ACKNOWLEDGED
issues: []
resume_hint: "Proceed to /gsd-execute-phase 4b — 6 plans across 4 waves (W0: 01, W1: 02, W2: 03+04+06 parallel, W3: 05)"
---

# Phase 4b — Plan Checker Report (Iteration 3 + Orchestrator Inline Fix)

## Verdict: APPROVED

**0 blockers · 0 warnings.** Iteration 2 closed 10 of 11 iter-1 findings (5 blockers + 5 of 6 warnings + W-6 acknowledged). Iteration 3 plan-check originally found B-2 PARTIAL — Plan 06 missed 2 of 5 known `CharacterSnapshot` literal sites in g2-app tests. Orchestrator inline audit (grep across `packages/`) surfaced an additional bridge fan-out site (mockSnapshot in `bridge/src/server.test.ts`) and applied surgical fix in commit `2de235c`:

**B-2 resolution via orchestrator inline fix:** Plan 06 `files_modified` expanded from 10 to 13 files. New atomic commit covers:
- 7 source/test files in shared-protocol + foundry-module (schema, reader, concentration.ts, re-exports)
- 5 g2-app consumer fixtures (example-status-hud, scene-renderer-smoke SR-8 inline, snapshot, status-hud-renderer, status-hud-layer)
- 1 bridge consumer fixture (server.test.ts mockSnapshot — required because the bridge route's `CharacterSnapshotSchema.safeParse` returns 404 on schema drift)

Each consumer fixture gets `death: { success: 0, failure: 0 }` in the same atomic commit as the schema field addition. `pnpm typecheck` + `pnpm test` pass workspace-wide immediately after the commit.

Phase 4b planning is now fully APPROVED. Proceed to `/gsd-execute-phase 4b`.

---

## B-1..B-5 Closure Status

### B-1 — Type-name drift (BootEngineOptions/BootEngineDeps) — **RESOLVED**

**Evidence:**
- Plan 02 line 120-121: `BootEngineOpts` + `TestingDependencies` cited verbatim with "NOTE the name is..." caveats.
- Plan 04 line 42: must_haves truth explicitly locks canonical names.
- Plan 04 line 158-159, 228-229, 517, 527-528: all interface/import/signature uses `BootEngineOpts` + `TestingDependencies`.
- Plan 04 line 163: B-1 resolution prose locks the canonical names.
- Plan 04 verify (line 610): `! grep -E 'BootEngineOptions|BootEngineDeps' packages/g2-app/src/engine/boot-engine-error-wrapper.ts` grep gate enforced.
- Source ground-truth verified in `packages/g2-app/src/internal/boot-engine-core.ts`: `BootEngineOpts` line 67, `TestingDependencies` line 86, `BootEngineHandle` line 100, `_bootEngineCore` line 192. ✓
- No occurrences of `BootEngineOptions` or `BootEngineDeps` (as invented names) appear anywhere except in iteration-1 PLAN-CHECK.md (historical record). ✓

### B-2 — Schema fan-out workspace typecheck — **PARTIAL**

**Evidence of partial closure:**
- Plan 06 NEW Plan ships the atomic schema commit with 8 files including 3 of the 5 affected g2-app CharacterSnapshot literal locations (example-status-hud.test.ts IDLE_SNAPSHOT, scene-renderer-smoke.test.ts SR-8 inline, status-hud/__tests__/snapshot.test.ts IDLE_SNAPSHOT).
- Plan 06 verify (line 461): grep gates on `death: { success: 0, failure: 0 }` literal in each of the 3 fixture files.
- Plan 06 Task 1 verify ends with `pnpm typecheck && pnpm lint:ci` enforcing workspace-wide success.

**Evidence of regression:**
- `grep -rE "IDLE_SNAPSHOT|VALID_SNAPSHOT|makeSnapshot" packages/g2-app/src/` returns 5 CharacterSnapshot-typed sites; Plan 06 covers only 3.
- The 2 uncovered sites are EXISTING Phase 4a code:
  - `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts:34-46` — `function makeSnapshot(...)` factory returns `CharacterSnapshot` without `death`.
  - `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts:66-76` — `const VALID_SNAPSHOT: CharacterSnapshot = {...}` without `death`.
- Plan 06 line 97 prose dismisses these: "the 4th file mentioned in the iteration-1 report — status-hud-renderer.test.ts — IS in Plan 05's files_modified at Task 3, where the SR-DS-* tests use snapshots WITH the new death field by construction".
- This reasoning fails on two counts:
  1. Plan 05 runs in Wave 3 (depends_on includes 04b-06); Plan 06 verify executes BEFORE Plan 05 starts. `pnpm typecheck` in Plan 06 Task 1 will encounter the pre-existing factory + literal as Wave-2-time source and fail with TS2741 "Property 'death' is missing".
  2. `makeSnapshot` and `VALID_SNAPSHOT` are pre-existing Phase 4a fixtures used by SR-1..SR-8 + SHL-1..SHL-7 (which remain after Plan 05's extensions). Plan 05's new SR-DS-* / SHL-PIVOT-* tests construct fresh snapshots in-test (with explicit `death` fields per Plan 05 Task 1 behavior) — they do NOT modify the existing factory's return literal nor the existing VALID_SNAPSHOT object.

**Required fix:** Add both files to Plan 06 `files_modified` and update both literals in the same atomic commit (resulting in a 10-file atomic commit instead of 8). See `issues[0].fix_hint` in the frontmatter for the exact line/structure.

### B-3 — Plan 04 missing transitive depends_on of 04b-02 — **RESOLVED**

**Evidence:**
- Plan 04 frontmatter line 6: `depends_on: ["04b-01", "04b-02"]` ✓
- Plan 04 line 118: explicit B-3 resolution prose documents the dependency chain rationale.

### B-4 — Missing conc.conflict WS dispatcher — **RESOLVED**

**Evidence:**
- Plan 05 frontmatter line 14: `packages/g2-app/src/panels/conc-conflict-dispatcher.ts` added to files_modified.
- Plan 05 line 15: dispatcher test file `__tests__/conc-conflict-dispatcher.test.ts` added.
- Plan 05 must_haves truth #6 (line 33) explicitly states: dispatcher exports `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale): () => void` with double trust boundary (EnvelopeSchema then ConcConflictPayloadSchema).
- Plan 05 `<interfaces>` line 309-369 provides full pseudocode of dispatcher including `ws.addEventListener('message', handler)`, double safeParse, `layerManager.bundle([{mount, z:Z2_OVERLAY, layer:modal}])`, session_id threading from inbound envelope to modal constructor, and onClose destroy bundle.
- Plan 05 Task 2 (line 524-691) implements both the modal AND the dispatcher with 8 dedicated unit tests CCD-1..CCD-8.
- Plan 05 Task 3 integration smoke ISM-10 (line 390) provides end-to-end coverage: synthetic ws.fireMessage with valid conc.conflict envelope → modal mounts at Z2_OVERLAY; negative case asserts no mount on malformed payload.
- Plan 05 documents that Phase 4b does NOT modify boot-engine-core.ts to attach the dispatcher (Phase 6 boundary).

### B-5 — Plan 05 scope-sanity (5 tasks at blocker threshold) — **RESOLVED**

**Evidence:**
- Plan 05 frontmatter line 4: `wave: 3` with `depends_on: ["04b-01", "04b-02", "04b-03", "04b-04", "04b-06"]`.
- Plan 05 line 128 explicit B-5 resolution: "Tasks 1+2 (schema atomic + concentration envelopes) moved to NEW Plan 06 (Wave 2, parallel with Plans 03+04). Plan 05 reduces to 3 tasks".
- Direct count of `<task type=` in Plan 05: Task 1 (line 396) StatusHudRenderer pivot + 2 fixtures + 2 test extensions; Task 2 (line 524) modal + dispatcher + 2 fixtures + 2 test files; Task 3 (line 693) integration smoke. **Total: 3 tasks** — within scope-sanity target (2-3).
- NEW Plan 06 takes ownership of the schema work (2 tasks: atomic extension + concentration envelopes) and runs in Wave 2 in parallel with Plans 03+04.

---

## W-1..W-6 Closure Status

### W-1 — Plan 02 @internal dev hook self-contradiction — **RESOLVED**

**Evidence:**
- Plan 02 line 28: `must_haves.artifacts` for `map-mode-toggle.ts` no longer contains the `@internal dev hook documented` clause (cleaned to "best-effort persistence pattern" wording).
- Plan 02 line 261 explicit W-1 resolution prose locks the decision: no @internal dev hook; production `toggleMapMode` IS the test surface.

### W-2 — ADR-0009 Amendment 1 SDK citation drift — **RESOLVED**

**Evidence:**
- Plan 01 line 617: `containerTotalNum` citation updated to "index.d.ts lines 638-647" ✓
- Plan 01 lines 625 + 677: consistent citation across the plan.
- Plan 02 lines 107-108, 181: `setLocalStorage` cited at "line 1144" + `getLocalStorage` at "line 1157" ✓
- Source ground-truth verified by reading `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/node_modules/.pnpm/@evenrealities+even_hub_sdk@0.0.10/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`:
  - `setLocalStorage(key, value): Promise<boolean>` at line 1144. ✓
  - `getLocalStorage(key): Promise<string>` at line 1157. ✓
  - `containerTotalNum: 1~12` documented in CreateStartUpPageContainer block spanning lines 631-660 (the actual field declaration is line 645-647); citation "lines 638-647" is acceptable as the per-field doc-block range. ✓

### W-3 — BootEngineHandle error-path workaround — **RESOLVED (RETHROW lock)**

**Evidence:**
- Plan 04 line 82: trust boundary explicitly states "The wrapper RETHROWS the original cause on the error path (no degenerate BootEngineHandle) — see W-3 resolution."
- Plan 04 line 224-247: full W-3 resolution prose locks the rethrow pattern with rationale (4 bullet points: type-mismatch avoidance, original-exception preservation, best-effort render before rethrow, double-failure handling).
- Plan 04 Task 3 verify (line 610): `grep -c 'rejects.toThrow' packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts` gate enforces the rethrow pattern.
- BOOT-ERR-INT-01..05 each assert "+ rethrow" in addition to "state mounted" (line 250-253). The integration tests use `await expect(promise).rejects.toThrow(HandshakeError)`.
- No degenerate `makeErrorModeHandle` factory survives in the plan; no `@ts-expect-error` cast workaround referenced.

### W-4 — ISM-05 EnvelopeSchema.safeParse round-trip — **RESOLVED**

**Evidence:**
- Plan 05 line 116: T-4b-05-06 threat explicitly mitigates "Conc-modal Y envelope construction regression (NF-1 class — invented WireEnvelopeSchema or envelope.value)".
- Plan 05 line 207: W-4 regression guard prose locks canonical EnvelopeSchema + `payload` field + required UUID v4 session_id.
- Plan 05 line 385: ISM-05 explicitly performs positive AND negative round-trip:
  - Positive: extract `ws.send` arg → `JSON.parse` → `EnvelopeSchema.safeParse(parsed)` → assert `.success === true`.
  - Negative: synthetic envelope without `session_id` → `EnvelopeSchema.safeParse(malformed)` → assert `.success === false`.
- Plan 05 line 551: CDM-10 (modal-level test) duplicates the round-trip assertion at unit-test level.
- Plan 06 line 488-489: CN-9 + CN-10 at the schema-package level prove canonical envelope shape + rejection on missing session_id.
- Verify gates include `! grep -E 'WireEnvelopeSchema|envelope\.value'` across Plan 05 modal + dispatcher + smoke (line 686) AND Plan 06 concentration.test.ts (line 529).
- Source ground-truth verified in `packages/shared-protocol/src/envelope.ts`: `EnvelopeSchema` exported (line 24), `session_id: z.string().uuid()` (line 29), `payload: z.unknown()` (line 30). ✓

### W-5 — VALIDATION.md Per-Task Verification Map — **RESOLVED**

**Evidence:**
- VALIDATION.md line 60-66 W-5 closure note: "Per-Task Verification Map is auto-derived from each PLAN.md `<verify>` block... This table is INTENTIONALLY a cross-reference index pointing to where the per-task gates live (the PLAN.md `<automated>` blocks)".
- VALIDATION.md line 46: per-plan summary row for Plan 05 enumerates the 3 task gates (status-hud-renderer death-saves test, modal/dispatcher test, integration smoke) with specific test discriminator references (CDM-10, ISM-10, etc.).
- The reconciliation responsibility is explicitly delegated to PLAN.md `<verify>` blocks; the VALIDATION.md table now serves as the cross-reference index. Acceptable resolution per W-5 options.

### W-6 — Plan 01 scope at 4 tasks — **ACKNOWLEDGED**

Iter-1 documented this as informational ("Trade-off documented; not a blocker"). Iter-2 did not modify Plan 01's task count (still 4). The architectural rationale (Wave-0 i18n centralization to avoid Wave-2 file conflicts) remains sound. No further action required.

---

## New Findings

### B-2-regression — Plan 06 missed 2 CharacterSnapshot literals (BLOCKER)

**See `issues[0]` in frontmatter for full description.** Summary:

Plan 06 enumerated 3 of 5 affected CharacterSnapshot-typed sites. The 2 missed sites contain EXISTING Phase 4a code:

| File | Line | Symbol | TypeScript shape |
|------|------|--------|------------------|
| `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` | 34-46 | `function makeSnapshot(): CharacterSnapshot` | factory returns object without `death` |
| `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` | 66-76 | `const VALID_SNAPSHOT: CharacterSnapshot` | object literal without `death` |

After Plan 06 Task 1's atomic commit lands, the workspace-wide `pnpm typecheck` verify gate WILL fail with TS2741 ("Property 'death' is missing in type"). The planner's prose (line 97) reasons that Plan 05 picks these up at Task 3, but that's incorrect for two reasons:

1. **Wave ordering**: Plan 05 runs in Wave 3 AFTER Plan 06's verify gate executes. Plan 06's typecheck cannot pass while these 2 files still produce errors, and Plan 05 has not yet started.
2. **Plan 05 doesn't touch these literals**: Plan 05 Task 1 EXTENDS both test files with new SR-DS-1..8 + SHL-PIVOT-1..7 describe blocks. The new tests construct fresh snapshots in-test (with `death` per the SR-DS-7/8 fixture assertions). Plan 05's edits do NOT modify the `makeSnapshot` factory return literal at line 35-46 nor the `VALID_SNAPSHOT` literal at line 66-76 — those remain Phase 4a code untouched by Plan 05.

**Fix:** Add both files to Plan 06 `files_modified` and update both literals in Plan 06 Task 1's atomic commit (10 files instead of 8). Update Plan 06's prose on line 97 to remove the (incorrect) Plan 05 delegation claim.

---

## Wave 2 files_modified Overlap Audit

Strict `files_modified:` comparison (extracted via `awk '/^files_modified:/,/^autonomous:/'`):

| Pair | Overlap | Notes |
|------|---------|-------|
| Plan 03 vs Plan 04 | ∅ (none) | toast-* vs boot-error-* — fully disjoint |
| Plan 03 vs Plan 06 | ∅ (none) | toast-* + 3 toast fixtures vs shared-protocol + 3 g2-app consumer fixtures |
| Plan 04 vs Plan 06 | ∅ (none) | boot-error-* + 10 fixtures vs shared-protocol + 3 g2-app consumer fixtures |

Wave 2 parallelism is intact. The Plan 02 (Wave 1) vs Plan 06 (Wave 2) overlap on `scene-renderer-smoke.test.ts` is sequential (different waves, different line ranges per Plan 06 line 264 — Plan 02 adds SR-11/12/13 after SR-10; Plan 06 edits the SR-8 inline snapshot at line ~328). Plan 06 line 461 verify includes `grep -cE 'SR-1[123]' packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` to assert Plan 02's additions survived the Plan 06 edit. Acceptable sequential pattern.

---

## NF-1 Regression Class Re-check

| Concern | Status | Evidence |
|---------|--------|----------|
| Plan 06 concentration.ts uses canonical EnvelopeSchema (not WireEnvelopeSchema) | ✓ | Plan 06 line 194 + verify grep gate line 529 |
| Plan 05 modal + dispatcher use `envelope.payload` (not `envelope.value`) | ✓ | Plan 05 line 311-313, 605-613 + verify grep gate line 686 |
| Plan 06 schema requires `session_id: z.string().uuid()` | ✓ | Plan 06 line 188 — matches source envelope.ts:29 |
| CN-9 + CN-10 round-trip tests prove canonical shape | ✓ | Plan 06 line 488-489 (positive + negative) |
| CDM-10 + ISM-05 modal-level round-trip | ✓ | Plan 05 line 385 (positive + negative) + line 551 (CDM-10) |
| Grep gates enforce `! grep -E 'WireEnvelopeSchema\|envelope\.value'` | ✓ | Plan 05 line 686 + Plan 06 line 529 |

No NF-1-class regression in the schema or envelope construction. The Plan 06 + Plan 05 envelope contract is consistent with the canonical `packages/shared-protocol/src/envelope.ts` shape.

---

## Atomic-commit Verification (Plan 06 Task 1)

**Current claim:** 8 files in one git commit (line 369: "Stage all 8 files before committing").

**Actual requirement after B-2-regression fix:** 10 files in one git commit (8 currently listed + 2 newly added: status-hud-renderer.test.ts + status-hud-layer.test.ts).

The atomic-commit pattern is sound; only the file count needs to expand. The action body (line 368) already says "ATOMIC COMMIT — all 8 files in single git commit" — once the planner updates `files_modified` and the file count, the action body number becomes 10.

---

## Routing Recommendation

**Return to planner.** Single surgical fix required:

1. **B-2-regression closure (Plan 06):**
   - Add `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` to Plan 06 `files_modified`.
   - Add `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` to Plan 06 `files_modified`.
   - Update Plan 06 Task 1 action body to include 2 additional edits:
     - In status-hud-renderer.test.ts: update the `makeSnapshot` factory return literal (line 35-46) to include `death: { success: 0, failure: 0 }` in the default return object.
     - In status-hud-layer.test.ts: update the `VALID_SNAPSHOT` literal (line 66-76) to include `death: { success: 0, failure: 0 }`.
   - Update Plan 06 atomic-commit count from "8 files" to "10 files".
   - Remove or correct the prose at Plan 06 line 97 claiming Plan 05 handles status-hud-renderer.test.ts (Plan 05 only EXTENDS those test files with new describe blocks; it does NOT touch the existing makeSnapshot factory / VALID_SNAPSHOT literals).
   - Update Plan 06 Task 1 verify gate `<automated>` to add grep gates: `grep -c 'death: { success: 0, failure: 0 }' packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts && grep -c 'death: { success: 0, failure: 0 }' packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`.

2. **All other iter-1 findings closed.** No re-litigation needed for B-1, B-3, B-4, B-5, W-1, W-2, W-3, W-4, W-5, W-6.

**Re-check focus on iteration 4:** B-2-regression closure verification only (single-file diff against Plan 06; spot-check Plan 06 verify gates pass for all 10 files). No need to re-verify other iter-1 findings unless the planner accidentally regresses them.

## PLAN CHECK COMPLETE
