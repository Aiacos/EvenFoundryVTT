---
phase: quick-260609-uzf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts
autonomous: true
requirements: [CI-GATE-FIX]
must_haves:
  truths:
    - "pnpm typecheck exits 0 (no TS errors in canvas-status-hud-layer.test.ts)"
    - "pnpm lint:ci reports no format error on packages/bridge/_seed.ts"
    - "All 3306 tests still pass (no behavior change)"
    - "Commit contains ONLY the test-file fix; _seed.ts stays untracked"
  artifacts:
    - path: "packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts"
      provides: "Type-safe indexed/destructured mock-call access under noUncheckedIndexedAccess"
  key_links: []
---

<objective>
Fix CI-gate failures so `pnpm typecheck` and `pnpm lint:ci` pass.

Two independent failures:
1. 6 TS errors in `canvas-status-hud-layer.test.ts` from `noUncheckedIndexedAccess` (indexed array access + tuple destructuring on `mock.calls`).
2. Biome `format` diagnostic on untracked scratch file `packages/bridge/_seed.ts`.

Purpose: Restore green CI gates without changing any test behavior.
Output: One type-safe test file (committed) + a formatted-but-uncommitted `_seed.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts

# Established idiom for noUncheckedIndexedAccess in tests (sibling files):
#   - Non-null assertion `!` is the accepted idiom (Biome does NOT flag it here):
#       packages/g2-app/src/panels/slot-picker-panel.test.ts:234
#         JSON.parse(ws.send.mock.calls[0]![0] as string)
#   - Optional chaining `?.` also used:
#       packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts:206
# Use the non-null assertion `!` idiom — these assertions already KNOW the
# elements exist (test asserts calls.length === 3 / === 1 first), so `!` is
# correct and minimal. Do NOT introduce `?.` here (it changes the asserted
# value type to `| undefined` and weakens the test).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make canvas-status-hud-layer.test.ts type-safe under noUncheckedIndexedAccess</name>
  <files>packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts</files>
  <action>
Fix exactly the 6 reported TS errors using non-null assertions (`!`) — the
established sibling-test idiom (slot-picker-panel.test.ts:234) and the only
change needed. Do NOT touch test logic, assertions, fixtures, or values.

Specific edits:

- Line 407 area (TS2488 — destructuring `[, pfX] = pfCall` where `pfCall` is
  `[string,number,number] | undefined`): assert the destructured tuple element
  is defined before destructuring. Change:
    `const [pfCall, caCall, lvCall] = calls;`
    `const [, pfX] = pfCall;`  ... etc.
  to assert non-null on the source tuple:
    `const [, pfX] = pfCall!;`
    `const [, caX] = caCall!;`
    `const [, lvX] = lvCall!;`
  (calls.length === 3 was asserted at line 405, so the `!` is sound.)

- Apply the SAME `!` fix to the second block (the `pfCall/caCall/lvCall`
  destructuring at lines ~435-438 in the FIX-DD-01 75px test):
    `const [, pfX] = pfCall!;` / `const [, caX] = caCall!;` / `const [, lvX] = lvCall!;`

- Lines 455-457 (TS2532 — `calls[0][0]`, `calls[1][0]`, `calls[2][0]`): add a
  non-null assertion on the indexed element:
    `expect(calls[0]![0]).toBe('PF 45/52');`
    `expect(calls[1]![0]).toBe('CA 18');`
    `expect(calls[2]![0]).toBe('LV 7');`

- Lines 471-472 (TS2532 — `calls[0][0]`, `calls[0][1]`): same pattern:
    `expect(calls[0]![0]).toBe('PF — / —');`
    `expect(calls[0]![1]).toBe(4);`

Re-run typecheck mentally: every reported line (408, 455, 456, 457, 471, 472)
plus the second destructuring block must be covered. If `pnpm typecheck` still
reports an error after these edits, fix that specific line with the same `!`
idiom — do not change any expected value.
  </action>
  <verify>
    <automated>pnpm typecheck 2>&1 | grep -c "canvas-status-hud-layer.test.ts" | grep -qx 0 && echo TYPECHECK_CLEAN</automated>
  </verify>
  <done>`pnpm typecheck` reports zero errors referencing canvas-status-hud-layer.test.ts; all 3306 tests still pass; no expected value or assertion logic changed.</done>
</task>

<task type="auto">
  <name>Task 2: Format _seed.ts (do NOT stage) and commit ONLY the test fix</name>
  <files>packages/bridge/_seed.ts</files>
  <action>
Two steps, in order:

1. Format the untracked scratch file so `pnpm lint:ci` passes:
     `pnpm exec biome check --write packages/bridge/_seed.ts`
   This file is the real-pairing bridge test scratch file (see MEMORY.md
   real-pairing-bridge-test-recipe). It MUST stay UNTRACKED — never `git add`
   it.

2. Verify the gate is green and the working tree is otherwise untouched:
     `pnpm lint:ci`  (must exit 0; the 316 pre-existing noConsole warnings in
     validation-harness are OUT OF SCOPE and must not be touched — biome ci
     should still pass since they are warnings the gate already tolerates, OR
     are pre-existing; do not attempt to fix them).
   NOTE: If `pnpm lint:ci` fails ONLY on the pre-existing 316 noConsole
   warnings, that is the pre-existing baseline — confirm the ONLY new/changed
   diagnostic was the `_seed.ts` format error and that it is now resolved.

3. Stage ONLY the test file by explicit path (the working tree has unrelated
   modified files in packages/g2-app/src/engine/, layer-manager.ts,
   boot-engine-core.ts, quick-action-menu-panel.ts, .planning/STATE.md — these
   MUST NOT be included). Commit:
     `git add packages/g2-app/src/status-hud/__tests__/canvas-status-hud-layer.test.ts`
     `git status --short`  (confirm ONLY the test file is staged; _seed.ts and
       the unrelated modified files must show as unstaged/untracked)
     `git commit -m "fix(g2-app): type-safe mock-call access in canvas status-hud test (noUncheckedIndexedAccess)"`
   Use the gsd commit helper ONLY if it supports explicit-path staging; the
   safe path is the plain `git add <path>` + `git commit` above. After commit,
   verify branch did NOT change to a stray gsd/release branch (MEMORY.md
   gsd-commit-creates-stray-release-branch).
  </action>
  <verify>
    <automated>pnpm exec biome check packages/bridge/_seed.ts >/dev/null 2>&1 && git status --short packages/bridge/_seed.ts | grep -q '^??' && echo SEED_FORMATTED_UNTRACKED</automated>
  </verify>
  <done>_seed.ts is Biome-formatted and still untracked (`??` in git status); the commit contains ONLY canvas-status-hud-layer.test.ts; unrelated dirty files (engine/, layer-manager.ts, STATE.md, etc.) remain uncommitted; branch unchanged.</done>
</task>

</tasks>

<verification>
- `pnpm typecheck` exits 0 (no canvas-status-hud-layer.test.ts errors).
- `pnpm test` (or targeted vitest run) keeps all 3306 tests green.
- `pnpm lint:ci` no longer reports the `_seed.ts` format error.
- `git log -1 --name-only` shows exactly one file: the test file.
- `git status --short` shows `_seed.ts` as `??` (untracked) and the unrelated
  modified files still present (uncommitted).
</verification>

<success_criteria>
- Zero TS errors from the canvas status-hud test file.
- Zero new Biome diagnostics; _seed.ts format error resolved.
- No test behavior changed (3306 tests pass).
- Single-file commit scoped to the test fix; _seed.ts and unrelated dirty files
  left untouched in the working tree.
</success_criteria>

<output>
Create `.planning/quick/260609-uzf-fix-ci-gate-errors-6-ts-errors-in-canvas/260609-uzf-SUMMARY.md` when done
</output>
