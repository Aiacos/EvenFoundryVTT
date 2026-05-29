---
quick_id: 260529-d6j
type: quick
mode: tdd
status: complete
branch: develop
completed: 2026-05-29T07:35:28Z
files_modified:
  - packages/foundry-module/src/write-path/combat-action-tracker.ts
  - packages/foundry-module/src/write-path/combat-action-tracker.test.ts
  - packages/foundry-module/src/__tests__/09-integration-smoke.test.ts
requirements: [INV-4]
gates:
  typecheck: pass
  lint_ci: pass
  test: pass
test_count_before: 2712
test_count_after: 2713
socketlib_handler_count: 17
---

# Quick 260529-d6j: combat-action-tracker reads audit.tool not audit.toolId — Summary

**One-liner:** Revived dead action-economy tracking — `combat-action-tracker.ts`'s
`createChatMessage` hook now reads the real audit flag property `audit.tool` (written by
`writeAuditLog`/`dispatchTool` per `AuditEntry`) instead of the always-`undefined`
`audit.toolId`, so the economy `emit` fires again. Added a CAT-REGRESSION guard pinning
the wire-shape field name.

## What changed

### Source fix (GREEN)
- `combat-action-tracker.ts:200` — property read `audit.toolId` → `audit.tool`. The local
  variable name `toolId` is retained for downstream readability; only the property access
  changed. Added an explanatory comment documenting the prior dead-code bug.
- Docstring sync (INV-4 coherence): `flags.evf.audit.toolId` → `flags.evf.audit.tool` at
  the threat-model line (~31) and the `registerCombatActionTracker` JSDoc (~165).
- `TOOL_SLOT_MAP`, threat-model logic, and socketlib registrations: untouched.

### Test edits (RED)
- `combat-action-tracker.test.ts` — `makeChatMsg` builder now EMITS the audit flag under
  property `tool` (line 88); the inline CAT-10c literal flag object now uses `tool`
  (line ~486). `MockAuditFlags` fixture-input field name `toolId` retained per planner
  discretion — only the emitted flag-object property changed.
- Added **CAT-REGRESSION**: builds a production-shaped chat message INLINE with
  `flags.evf.audit.tool = 'cast-spell'` (independent of `makeChatMsg`) and asserts the
  economy `emit` fires exactly once with `actionsUsed: 1`. This is the assertion that
  would have caught the original field-name bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sibling integration-smoke mocks carried the same field-name bug**
- **Found during:** Task 2 (GREEN) — after fixing the source, 3 tests in
  `09-integration-smoke.test.ts` (FM-ISM-W9-04/05/06) failed because their inline audit
  mocks emitted `toolId` (matching the old bug), so the corrected source saw `undefined`
  and never emitted.
- **Fix:** Changed the three audit-flag mocks (lines 380/438/501) `toolId:` → `tool:` to
  match production wire shape. Left untouched: FM-ISM-W9-08's `tool:` (already correct,
  the sibling action-result-watcher path) and the `resultPayload.toolId` assertions
  (lines 622/626) which reference the distinct `ActionResultPayload.toolId` output field,
  not the audit flag.
- **Files modified:** packages/foundry-module/src/__tests__/09-integration-smoke.test.ts
- These tests had only ever passed because they encoded the bug; they now encode reality.

## RED-then-GREEN confirmation

- **RED (genuine):** After the test edits with the source still reading `audit.toolId`,
  the combat-action-tracker filter ran **15 failed / 460 passed (475)**. All emit-firing
  cases failed (CAT-01, CAT-02, CAT-03, CAT-REGRESSION, CAT-REACT-01..04, T-09-02,
  CAT-06/07/09/10); the no-emit cases (CAT-04, CAT-05, CAT-08) stayed green. This proves
  CAT-REGRESSION genuinely guards the field name.
- **GREEN:** After the one-property source fix (+ docstring sync + sibling-mock auto-fix),
  the filter ran **475 passed (475)**, full suite **2713 passed (2713)**.

## Grep gates (from PLAN)
- Code reads of `audit.toolId` in source: **0** (expected 0).
- `flags.evf.audit.toolId` docstrings in source: **0** (expected 0).
- Emitted flag objects in test: all use `tool:` (3 sites: builder, CAT-REGRESSION, CAT-10c).
  The 10 remaining `toolId:` are `MockAuditFlags` fixture inputs — allowed per plan.

## Final gate results
- `pnpm typecheck` → exit 0
- `pnpm lint:ci` → exit 0 (pre-existing 290 warnings / 41 infos are non-fatal in CI config;
  touched files clean)
- `pnpm test` → exit 0 — **2713 passed (2713)**, 187 test files
- Test count delta: +1 (2712 → 2713), as expected from the CAT-REGRESSION guard.
- CI Gate 8 socketlib handler count: **17** (unchanged — no socketlib registrations touched;
  emission uses `bridgeDeltaEmitter`).

## Self-Check: PASSED
- combat-action-tracker.ts reads `audit.tool` — verified.
- Docstrings reference `flags.evf.audit.tool` — verified (0 stale).
- CAT-REGRESSION present and green — verified.
- All three quality gates exit 0 — verified.
- socketlib count 17 — verified.
