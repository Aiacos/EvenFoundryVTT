---
quick_id: 260529-g0j
phase: quick-260529-g0j
plan: 01
status: complete
type: execute
branch: develop
date_completed: 2026-05-29
requirements: [WR-01, CMT-05, RPD-TIMEOUT-01]
test_count_before: 2723
test_count_after: 2727
test_delta: +4
gates: { typecheck: pass, lint_ci: pass, test: pass, changeset: pass }
ci_gate_8_socketlib: 17 (unchanged)
adr_0011: clean (no activity.use introduced)
commits:
  - 2448c71  # FIX D
  - 930d165  # FIX E
  - f42fc61  # FIX F
key-files:
  modified:
    - packages/foundry-module/src/write-path/tool-registry.ts
    - packages/foundry-module/src/write-path/tool-registry.test.ts
    - packages/foundry-module/src/write-path/combat-movement-tracker.ts
    - packages/foundry-module/src/write-path/combat-movement-tracker.test.ts
    - packages/g2-app/src/panels/reaction-prompt-dispatcher.ts
    - packages/g2-app/src/panels/reaction-prompt-dispatcher.test.ts
  created:
    - .changeset/quick-260529-g0j.md
---

# Quick-task 260529-g0j: write-path / dispatcher hardening (FIX D + E + F) Summary

Three independent, source-verified latent-bug fixes hardening confirmed
concurrency/lifecycle edge cases in the write-path + dispatcher layer, each shipped
TDD RED→GREEN with no observable happy-path behavior change. All Phase 1+ gates green;
CI Gate 8 (socketlib = 17) and ADR-0011 (no `activity.use` in g2-app/bridge) preserved.

## What changed

### FIX D — in-flight idempotency dedup in `dispatchTool`
Added a module-scoped `inFlight: Map<cacheKey, Promise<ToolResult>>` registry. Steps 3-7
of the dispatch pipeline now run inside a single shared `run()` promise registered under
the bearer-bound `cacheKey`. Two truly-concurrent duplicate calls (same `bearer` +
`idempotencyKey`, both cache-misses) collapse onto that one promise: exactly ONE
`handler.handle`, ONE `moduleIdempotencyStore.set`, ONE `writeAuditLog`; the second caller
awaits and receives the identical `ToolResult`. The entry is deleted in a `finally`, so the
map only ever holds OVERLAPPING calls — a later non-overlapping retry re-runs (preserving
WR-01: failures are not cached and stay retryable). Cache-hit short-circuit (step 2) runs
BEFORE the in-flight machinery; `run()` never rejects, so `await p` cannot reject
(always-resolves-never-rejects preserved).

### FIX E — `deleteCombat` reset in `combat-movement-tracker`
Added a third `Hooks.on('deleteCombat', …)` that clears `_state` + `_lastPosition` so stale
`usedThisTurn` from an ended encounter cannot leak into a freshly created combat before its
first turn-advance. Follows the existing defensive try/catch + `console.warn` + void-return
(never-return-false) pattern verbatim. The unsubscribe closure now also
`Hooks.off(deleteCombatHookId)`. The two existing hooks are 100% unchanged.

### FIX F — idempotency guard in `handleClose` (reaction-prompt-dispatcher)
Added `if (mountedPanel === null) return;` as the first statement of `handleClose`, mirroring
the 5s auto-timeout's existing `mountedPanel !== null` gate. A late gesture after the
auto-timeout already destroyed the panel is now a no-op — no redundant second z=2 destroy
bundle. No other line changed; the normal tap→close path is unaffected.

## TDD: RED-then-GREEN confirmation

| Fix | RED test | RED failure observed (current source) | GREEN |
|-----|----------|----------------------------------------|-------|
| D | `FIX D: two CONCURRENT dispatches … collapse to ONE handler.handle` (deferred-gate so both callers are guaranteed past their cache-miss check before release) | `expected "vi.fn()" to be called once, but got 2 times` — race confirmed | handle called once, `r1 === r2`, audit once |
| E | `CMT-09: deleteCombat resets accumulator …` (+ CMT-01/01b amended) | `Error: deleteCombat handler not registered` + `expected … to be called with [ 'deleteCombat', Any<Function> ]` + `[ 103 ]` (3 failures) | new-combat movement starts at `usedThisTurn=0`; all three hooks registered + detached |
| F | `RPD-IDEMPOTENT-CLOSE-01: handleClose after the 5s auto-timeout is a no-op` (panel module mocked to capture the onClose 9th ctor arg) | `expected "vi.fn()" to be called 1 times, but got 2 times` — second destroy confirmed | destroy bundle count stays 1 |

A second supporting test for FIX D (`in-flight entry cleared after settle → later call
re-runs`) passes under both old and new code (it validates the sequential-retry / WR-01
contract that the `finally` delete must keep intact).

## Gate results

| Gate | Result |
|------|--------|
| `pnpm typecheck` | exit 0 |
| `pnpm lint:ci` | exit 0 (biome ci read-only; only pre-existing warnings in untouched files + 4 pre-existing non-null-assertion warnings in the RPD test helper/assertions, none in added FIX code) |
| `pnpm test` | exit 0 — **2727 passed** (187 files) |
| `pnpm changeset:status` | exit 0 — `@evf/foundry-module` + `@evf/g2-app` patch declared |

**Test count:** baseline 2723 → 2727 = **+4** (FIX D +2, FIX E +1 net [CMT-09 added; CMT-01/01b
amended in place], FIX F +1). Delta ≥ +3 satisfied.

## CI Gate 8 + ADR-0011

- **CI Gate 8 socketlib count = 17, UNCHANGED.** No `socketlib.register*` added/removed
  (`git diff` shows no socketlib changes). No socketlib file touched.
- **ADR-0011 single-workflow-origin CLEAN.** No `activity.use(` introduced in `g2-app` or
  `bridge` (`git diff packages/g2-app packages/bridge` shows none). All writes still flow
  through the foundry-module write-path.

## Backward compatibility

All pre-existing tests in the three touched files still pass: tool-registry (cache-hit,
unknown_tool, validation, handler-throw, audit isolation, cross-bearer, WR-01
failure-not-cached), CMT-02..08, full RPD-* suite.

## Deviations from Plan

None — plan executed exactly as written. One mechanical adjustment inside a new test:
the FIX D concurrent RED test uses a manually-released deferred gate (rather than a single
`await Promise.resolve()`) so both concurrent callers are deterministically parked past
their cache-miss check before release — eliminating microtask-timing flakiness that made a
naive version pass against the unfixed code. The `releaseHandle` local was typed as a
non-null `() => void` (default no-op) to satisfy TS strict control-flow analysis.

## Commits

- `2448c71` fix(write-path): collapse concurrent dispatchTool duplicates via in-flight registry (FIX D)
- `930d165` fix(foundry-module): reset combat-movement state on deleteCombat (FIX E)
- `f42fc61` fix(g2-app): make reaction-prompt handleClose idempotent (FIX F)
- (docs commit for PLAN.md + SUMMARY.md + changeset follows)

## Self-Check: PASSED

- Source files all present and modified (verified via git).
- All three RED tests confirmed failing against unfixed source, then GREEN.
- Commits `2448c71`, `930d165`, `f42fc61` exist in `git log`.
