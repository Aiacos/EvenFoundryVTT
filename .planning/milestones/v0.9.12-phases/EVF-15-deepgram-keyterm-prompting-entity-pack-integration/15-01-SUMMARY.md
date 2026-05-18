---
phase: 15
plan: 01
subsystem: voice
tags: [voice, stt, deepgram, keyterm, bridge, shared-protocol]
requirements: [VOICE-07, VOICE-08]
wave: 1
status: complete
completed: 2026-05-17
duration_min: 14
dependency_graph:
  requires:
    - "packages/foundry-mcp/src/voice/spell-lookup.ts (SPELL_LOOKUP — 70-entry source-of-truth; consumed by SKT-02 drift gate ONLY in test code)"
    - "packages/shared-protocol/src/payloads/entity-pack.ts (AvailableEntitiesPayload type)"
  provides:
    - "@evf/shared-protocol :: SPELL_KEYTERMS — 70 frozen (it,en) tuples"
    - "@evf/shared-protocol :: SpellKeytermEntry — type"
    - "@evf/bridge :: buildKeytermList(staticSpells, entitySnapshot, opts) — pure merger"
    - "@evf/bridge :: DEEPGRAM_KEYTERM_LIMIT = 100"
    - "@evf/bridge :: BuildKeytermListOpts — test-only knobs interface"
  affects:
    - "Plan 15-02 (Deepgram session URL builder consumes buildKeytermList as a black box)"
    - "Plan 15-03 (entity-pack cache refresh debounce wraps a buildKeytermList re-emit)"
    - "Plan 15-04 (Deepgram rejection retry sanitises the buildKeytermList output and retries)"
tech_stack:
  added: []
  patterns:
    - "Pure-function merger (no SDK dep, no I/O, no side effects) — black-box-testable + zero-mock"
    - "Drift-proof cross-package test gate (relative import in test only, never in production code)"
    - "tsconfig 'exclude' single-file escape hatch for cross-package test imports (mirrors g2-app fixture pattern)"
key_files:
  created:
    - "packages/shared-protocol/src/voice/spell-keyterms.ts (140 LoC; 70 frozen entries + JSDoc)"
    - "packages/shared-protocol/src/voice/spell-keyterms.test.ts (74 LoC; SKT-01..05)"
    - "packages/bridge/src/voice/keyterm-merger.ts (158 LoC; pure function + JSDoc)"
    - "packages/bridge/src/voice/keyterm-merger.test.ts (287 LoC; KM-01..12 + 3 default-path guards = 15 tests)"
  modified:
    - "packages/shared-protocol/src/index.ts (barrel re-export for SPELL_KEYTERMS + SpellKeytermEntry)"
    - "packages/shared-protocol/tsconfig.json (exclude spell-keyterms.test.ts from package-level tsc rootDir check; Vitest still typechecks it via root config)"
decisions:
  - id: D-15-01-01
    decision: "Static spell vocab lives in @evf/shared-protocol, not @evf/foundry-mcp"
    rationale: "The bridge must consume the SRD subset without taking a production dep on foundry-mcp (foundry-mcp is the MCP server package, bridge is the Fastify service — separate runtime concerns). Vocab is data, not logic — fits the shared-protocol charter alongside Zod payload schemas."
  - id: D-15-01-02
    decision: "Drift-proof 1:1 mapping enforced via test-only relative import"
    rationale: "Adding @evf/foundry-mcp as a devDep of @evf/shared-protocol would create a circular intent (foundry-mcp depends on shared-protocol). Test-only relative import (../../../foundry-mcp/src/voice/spell-lookup.js) bidirectionally asserts (it,en) equality without polluting the production dep graph. Tsc rootDir violation handled by excluding ONLY this test file from package tsc — Vitest still typechecks it via the root config."
  - id: D-15-01-03
    decision: "Static-wins-on-conflict + cap-drops-dynamic-first implemented as iteration order"
    rationale: "No explicit conflict-resolution code needed — inserting static spells first into a dedupe Set guarantees static wins; short-circuiting the entity-pack loop on cap-hit guarantees entity-pack is dropped first. CONTEXT D-01 + D-04 fall out of the algorithm naturally, making the merger trivially auditable."
  - id: D-15-01-04
    decision: "EN-first then IT push order inside the static loop"
    rationale: "VOICE-08 requires both locales but Deepgram processes keyterms in order. EN is the dnd5e canonical SRD form (authoritative for the +625% recall lift). IT is the code-switch hedge for utterances like 'casta fireball' (Nova-3 Multilingual handles intra-phrase code-switch per RESEARCH.md §2). Inserting EN first ensures the canonical form gets priority in any future ordering-sensitive Deepgram behaviour."
  - id: D-15-01-05
    decision: "Result is mutable string[], not ReadonlyArray<string>"
    rationale: "Caller (plan 15-02 URL builder) may want to append/transform/encode entries. Freezing the output would force a defensive copy on every consumer for no safety benefit (the merger is pure — no shared mutable state). KM-10 asserts the result is not frozen."
metrics:
  duration_min: 14
  files_created: 4
  files_modified: 2
  loc_total: 659
  tests_added: 20  # 5 SKT + 15 KM (including DEEPGRAM_KEYTERM_LIMIT + 2 default-path guards)
  tests_passing_phase: 20
  tests_passing_workspace: 2579
  commits: 4
---

# Phase 15 Plan 01: Static + Dynamic Keyterm Vocabulary Merger Summary

## One-Liner

`SPELL_KEYTERMS` (70 frozen SRD entries) ships from `@evf/shared-protocol`; bridge-side `buildKeytermList()` pure function merges them with the dynamic entity-pack snapshot under static-wins + cap-drops-dynamic-first semantics — VOICE-07 + VOICE-08 land on a fully-tested black box.

## Tasks Executed

| Task | Name                                                                   | RED commit | GREEN commit |
| ---- | ---------------------------------------------------------------------- | ---------- | ------------ |
| 1    | Extract SPELL_KEYTERMS into @evf/shared-protocol with 1:1 mapping test | `1aced2d`  | `e4e55de`    |
| 2    | Build keyterm-merger pure function with union/dedupe/cap semantics     | `948435f`  | `deee3e5`    |

All 4 commits land sequentially on `gsd/v0.9.11-milestone` (no worktree).

## Test Results

### `pnpm vitest run --project @evf/shared-protocol src/voice/spell-keyterms.test.ts`

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

| Case  | Description                                                                                | Result |
| ----- | ------------------------------------------------------------------------------------------ | ------ |
| SKT-01| `SPELL_KEYTERMS.length === 70` (matches SPELL_LOOKUP_COUNT_GATE)                            | ✓ pass |
| SKT-02| Bidirectional 1:1 mapping to foundry-mcp SPELL_LOOKUP — drift-proof                        | ✓ pass |
| SKT-03| `Object.isFrozen(SPELL_KEYTERMS) === true`                                                  | ✓ pass |
| SKT-04| Every entry has non-empty `.it` and `.en` strings                                          | ✓ pass |
| SKT-05| `SpellKeytermEntry` type shape consumable from package barrel                              | ✓ pass |

### `pnpm vitest run --project @evf/bridge src/voice/keyterm-merger.test.ts`

```
Test Files  1 passed (1)
     Tests  15 passed (15)
```

| Case   | Description                                                                                                       | Result |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------ |
| (const)| `DEEPGRAM_KEYTERM_LIMIT === 100` (per Deepgram learn article, RESEARCH.md §1)                                     | ✓ pass |
| KM-01  | Empty entity-cache snapshot returns exactly 140 entries (70 spells × 2 locales)                                   | ✓ pass |
| KM-02  | Result includes BOTH `.it` and `.en` of each spell (VOICE-08 locale-aware)                                        | ✓ pass |
| KM-03  | Result includes BOTH `.name` and `.nameLocalized` of each entity entry — preserves original casing                | ✓ pass |
| KM-04  | Dedupe by lower-cased trimmed key collapses duplicates across and within sources                                  | ✓ pass |
| KM-05  | Static wins on conflict (CONTEXT D-01): capitalised entity-pack variants of fireball / shield dropped             | ✓ pass |
| KM-06  | Empty / whitespace-only candidates filtered out before insertion                                                  | ✓ pass |
| KM-07  | `result.length ≤ limit`; entity-pack entries dropped first when cap is hit (CONTEXT D-04)                         | ✓ pass |
| KM-08  | Truncation within entity-pack preserves encounter (array) order                                                   | ✓ pass |
| KM-09  | When static candidates alone exceed limit, caps exactly at limit and emits zero entity entries                    | ✓ pass |
| KM-10  | Returns fresh, mutable `string[]` (not frozen — caller may append/transform freely)                                | ✓ pass |
| KM-11  | `null` `entitySnapshot` behaves identically to empty `entries[]`                                                  | ✓ pass |
| KM-12  | `source: 'empty'` payload behaves identically to `source: 'foundry-packs'` with `entries: []`                     | ✓ pass |
| (def-1)| Default path (no opts) caps at DEEPGRAM_KEYTERM_LIMIT=100                                                         | ✓ pass |
| (def-2)| `BuildKeytermListOpts` shape consumable by callers (compile-time anchor)                                          | ✓ pass |

### Coverage on `keyterm-merger.ts`

| Metric     | Value     | Target | Status |
| ---------- | --------- | ------ | ------ |
| Statements | 96.29%    | ≥ 80%  | ✓     |
| Branches   | 94.44%    | ≥ 80%  | ✓     |
| Functions  | 100%      | ≥ 80%  | ✓     |
| Lines      | 100%      | ≥ 80%  | ✓     |

### Workspace-wide checks

| Check                                  | Command                | Result            |
| -------------------------------------- | ---------------------- | ----------------- |
| All shared-protocol tests              | `vitest --project`     | 331 passed (331)  |
| All bridge tests                       | `vitest --project`     | 255 passed (255)  |
| All workspace tests                    | `pnpm vitest run`      | 2579 passed (2579)|
| TypeScript strict typecheck            | `pnpm typecheck`       | exit 0            |
| Biome lint (CI mode, fail-on-error)    | `pnpm lint:ci`         | exit 0 (warnings only, pre-existing) |
| CI Gate 8 — socketlib handler count    | grep                   | 17 (unchanged)    |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] tsconfig rootDir violation on cross-package test import**
- **Found during:** Task 1 typecheck after writing the SKT-02 test
- **Issue:** `packages/shared-protocol/tsconfig.json` has `rootDir: "src"`. The drift-gate test imports `SPELL_LOOKUP` via `../../../foundry-mcp/src/voice/spell-lookup.js`, which sits outside `rootDir`. `tsc --noEmit` (package-level typecheck) errored: `TS6059: File is not under 'rootDir'`.
- **Fix:** Added the single test file to the package's `tsconfig.json` `exclude` array with an inline comment explaining why. Vitest uses the root-level config and continues to typecheck the file at test time. Mirrors the existing `g2-app/tsconfig.json` pattern (excludes `src/status-hud/__tests__/fixtures/budget-bust.fixture.ts`).
- **Files modified:** `packages/shared-protocol/tsconfig.json`
- **Commit:** `e4e55de` (part of Task 1 GREEN)

**2. [Rule 1 — Bug] KM-03 test asserted lower-case but merger preserves case**
- **Found during:** Task 2 GREEN test run (1/15 failing)
- **Issue:** Test asserted `expect(result).toContain('longsword')` but the merger correctly emits the candidate verbatim (`'Longsword'`). The lower-case key is used ONLY for the dedupe Set, never for the output array. Test expectation was wrong; behaviour was right.
- **Fix:** Updated KM-03 to assert original-case strings (`'Longsword'`, `'Spada Lunga'`, `'Lord Brankor'`) and added an explicit dedupe assertion using lower-cased-trimmed comparison.
- **Files modified:** `packages/bridge/src/voice/keyterm-merger.test.ts`
- **Commit:** `deee3e5` (part of Task 2 GREEN — test fix bundled with implementation since the RED commit had the wrong expectation)

No architectural changes (Rule 4) were needed. No checkpoints triggered. No authentication gates. No fix-attempt-limit breaches (each issue resolved on first attempt).

## Key Decisions

See frontmatter `decisions[]` for the full set with rationale. Headline calls:

- **SPELL_KEYTERMS in shared-protocol** keeps the bridge free of any production dep on `@evf/foundry-mcp` while preserving the drift gate via a test-only relative import.
- **Static-wins + cap-drops-dynamic-first** fall out of the iteration order (static first, then entity-pack with early-break on cap-hit). No explicit conflict-resolution code path means the algorithm is trivially auditable.
- **EN-first then IT** inside the static loop gives the canonical SRD form ordering priority while still feeding both locales for code-switch coverage.

## CI Gate 8 Confirmation

```bash
grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts
# → 17
```

Unchanged from Phase 13 baseline. This plan touches ONLY `packages/bridge/` and `packages/shared-protocol/` — no `packages/foundry-module/` changes, no new socketlib handlers. CI Gate 8 invariant preserved.

## Files Touched + LoC Summary

| File                                                          | Change   | LoC |
| ------------------------------------------------------------- | -------- | --- |
| packages/shared-protocol/src/voice/spell-keyterms.ts          | created  | 140 |
| packages/shared-protocol/src/voice/spell-keyterms.test.ts     | created  | 74  |
| packages/shared-protocol/src/index.ts                         | modified | +13 |
| packages/shared-protocol/tsconfig.json                        | modified | +1  |
| packages/bridge/src/voice/keyterm-merger.ts                   | created  | 158 |
| packages/bridge/src/voice/keyterm-merger.test.ts              | created  | 287 |
| **Total**                                                     |          | **673** |

## Downstream Plan Hooks

Plan 15-02 (Deepgram session URL builder) imports `buildKeytermList` + `DEEPGRAM_KEYTERM_LIMIT` from `./keyterm-merger.js` and treats the merger as a fully-tested black box. The URL builder is responsible for:

1. Calling `buildKeytermList(SPELL_KEYTERMS, entityPackCache.get())` at session-creation time
2. URL-encoding each entry with `encodeURIComponent`
3. Joining as `&keyterm=…&keyterm=…&…`
4. Omitting the `keyterm` query parameter entirely when the merger returns `[]`

Plans 15-03 (refresh debounce) and 15-04 (failure-mode retry/sanitization) consume the same merger from the same module. No further changes to this module's surface are anticipated through Phase 15 closure.

## Self-Check: PASSED

- [x] `packages/shared-protocol/src/voice/spell-keyterms.ts` exists
- [x] `packages/shared-protocol/src/voice/spell-keyterms.test.ts` exists
- [x] `packages/bridge/src/voice/keyterm-merger.ts` exists
- [x] `packages/bridge/src/voice/keyterm-merger.test.ts` exists
- [x] Commit `1aced2d` (Task 1 RED) present in `git log`
- [x] Commit `e4e55de` (Task 1 GREEN) present in `git log`
- [x] Commit `948435f` (Task 2 RED) present in `git log`
- [x] Commit `deee3e5` (Task 2 GREEN) present in `git log`
- [x] `pnpm vitest run` → 2579/2579 pass
- [x] `pnpm typecheck` → exit 0
- [x] `pnpm lint:ci` → exit 0
- [x] `grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts` → 17 (CI Gate 8 preserved)
