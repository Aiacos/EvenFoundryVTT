---
phase: 15
plan: 02
subsystem: voice
tags: [voice, stt, deepgram, keyterm, bridge]
requirements: [VOICE-06]
wave: 2
status: complete
completed: 2026-05-17
duration_min: 11
dependency_graph:
  requires:
    - "@evf/shared-protocol :: SPELL_KEYTERMS (plan 15-01 output)"
    - "@evf/bridge :: buildKeytermList (plan 15-01 output)"
    - "@evf/bridge :: EntityPackCache (Quick Task 260517-k2g; instance at server.ts step 7c)"
    - "@evf/bridge :: createDeepgramStt (Phase 12 baseline)"
  provides:
    - "createDeepgramStt accepts keytermProvider: () => string[] (optional, default opt-out)"
    - "buildDeepgramUrl private helper: URL-encodes via encodeURIComponent + appends &keyterm= per entry"
    - "server.ts step 10 wires keytermProvider = () => buildKeytermList(SPELL_KEYTERMS, entityCache.get())"
  affects:
    - "Plan 15-03 (entity-pack delta refresh debounce — adds refreshKeyterm() API on top of this wiring)"
    - "Plan 15-04 (Deepgram rejection retry — sanitises and retries the buildKeytermList output)"
    - "Plan 15-05 (Phase 15 closure — INV-3 doc coherence on Specs.md/README/showcase)"
tech_stack:
  added: []
  patterns:
    - "Provider-callback pattern (lazy evaluation on every connect() — supports hot-update without re-instantiating the adapter)"
    - "Pure URL-builder helper isolated from factory — testable as a contract via DGKT-04 byte-for-byte baseline assertion"
    - "Defensive try/catch on user-provided callback (T-15-07) — degrades to baseline rather than fail-closing voice"
    - "Closure captures entityCache reference (step 7c) — every connect() reads the live cache, no separate cache layer at adapter"
key_files:
  created: []
  modified:
    - "packages/bridge/src/voice/deepgram-stt.ts (+93 LoC: keytermProvider opt + buildDeepgramUrl helper + try/catch in connect)"
    - "packages/bridge/src/voice/deepgram-stt.test.ts (+140 LoC: 6 new DGKT tests + describe block header)"
    - "packages/bridge/src/server.ts (+38 LoC: imports SPELL_KEYTERMS + buildKeytermList; step 10 wiring comment + closure; Biome auto-fix re-sorted imports alphabetically)"
decisions:
  - id: D-15-02-01
    decision: "keytermProvider is a callback, not a static array"
    rationale: "A static array would be frozen at adapter construction. The bridge constructs the adapter ONCE at boot, but the entity-pack cache evolves across the session (DM may push new packs during the game). A callback invoked lazily on every connect() makes the merger output always fresh without re-instantiating the Deepgram adapter. This is also the foundation plan 15-03 builds on for its `refreshKeyterm()` mid-session API — same callback re-invoked on debounce. DGKT-05 exercises the lazy-evaluation contract."
  - id: D-15-02-02
    decision: "Defensive try/catch around keytermProvider() invocation (T-15-07 mitigation)"
    rationale: "The provider is user-supplied via the public CreateDeepgramSttOpts interface. If a future plan ships a merger variant that throws on malformed cache state, the voice path should degrade gracefully to the Phase 12 baseline (no keyterms, standard Nova-3 transcription) rather than fail-closing — voice is a V2 stretch feature, not core MVP. T-15-07 disposition (mitigate) is satisfied by this single try/catch + warn-level log."
  - id: D-15-02-03
    decision: "Phase 12 baseline preserved byte-for-byte when keytermProvider is omitted OR returns []"
    rationale: "DGKT-04 and DGKT-06 assert URL equality against the canonical DEEPGRAM_URL constant via byte-for-byte string compare. This guarantees regression-safety for the 255 existing bridge tests (which never set keytermProvider) and for production environments where the entity-pack push has not yet arrived (cold cache → empty merger output). The single-line short-circuit in buildDeepgramUrl (`if (keyterms.length === 0) return baseUrl;`) is the entire contract."
  - id: D-15-02-04
    decision: "buildDeepgramUrl is a private helper, not exported"
    rationale: "The URL-building logic is purely an internal implementation detail of the Deepgram adapter — it has no consumer outside this module. Keeping it private avoids growing the package public surface and makes future refactors (e.g. switching to URLSearchParams when Deepgram supports it) safe to land without a semver bump. The contract is exercised end-to-end through the connect() URL assertions in DGKT-01..04."
metrics:
  duration_min: 11
  files_created: 0
  files_modified: 3
  loc_total: 263
  tests_added: 6  # DGKT-01..06
  tests_passing_phase: 19   # 13 DG existing + 6 DGKT new in deepgram-stt.test.ts
  tests_passing_bridge: 261 # full @evf/bridge suite
  tests_passing_workspace: 2585  # full workspace (2579 baseline + 6 new)
  commits: 3
---

# Phase 15 Plan 02: Deepgram Keyterm Wiring Summary

## One-Liner

Wired Deepgram Nova-3 Multilingual to receive the keyterm-prompting vocabulary built by plan 15-01's `buildKeytermList()` — `createDeepgramStt` gains an optional `keytermProvider` callback that the adapter invokes lazily on every `connect()`, URL-encoding each entry and appending one `keyterm=<encoded>` query param per element; `server.ts` step 10 supplies a closure over `EntityPackCache` so the live snapshot reaches Deepgram on every new session without re-instantiating the adapter.

## Tasks Executed

| Task | Name                                                                     | RED commit | GREEN commit |
| ---- | ------------------------------------------------------------------------ | ---------- | ------------ |
| 1    | Extend Deepgram adapter with keytermProvider — URL build + DGKT-01..06   | `85ed688`  | `acfc7fa`    |
| 2    | Wire server.ts step 10 to pass EntityPackCache-backed keytermProvider    | —          | `99b4d6d`    |

Task 2 carried no separate RED commit because the existing `server.test.ts` + `audio-stream-route.test.ts` suite (and the new DGKT-01..06 from Task 1) already cover WIR-01..04 indirectly through full-suite regression. Confirmed pre-edit grep RED state (`buildKeytermList`/`SPELL_KEYTERMS`/`keytermProvider` all = 0 in `server.ts`); post-edit GREEN (3/4/2 respectively, full suite green).

All 3 commits land sequentially on `gsd/v0.9.11-milestone` (no worktree, main branch execution).

## Test Results

### `pnpm vitest run --project @evf/bridge src/voice/deepgram-stt.test.ts`

```
Test Files  1 passed (1)
     Tests  19 passed (19)
```

| Case    | Description                                                                                              | Result |
| ------- | -------------------------------------------------------------------------------------------------------- | ------ |
| DG-01..13 | All 13 Phase 12 baseline cases unchanged                                                              | ✓ pass |
| DGKT-01 | connect() URL contains one `keyterm=` per keytermProvider entry (3 in → 3 matches)                       | ✓ pass |
| DGKT-02 | encodeURIComponent: `palla di fuoco` → `%20`; `foo&punctuate=false` → `%26`/`%3D`; `è` → `%C3%A8`        | ✓ pass |
| DGKT-03 | All 6 canonical params (model/language/punctuate/encoding/sample_rate/channels) appear before keyterm= | ✓ pass |
| DGKT-04 | Empty provider output → URL equals `DEEPGRAM_URL` baseline byte-for-byte                                 | ✓ pass |
| DGKT-05 | keytermProvider called exactly once per connect(); second connect() re-invokes (hot-update contract)     | ✓ pass |
| DGKT-06 | Omitted keytermProvider → URL identical to DGKT-04 baseline (default opt-out)                            | ✓ pass |

### WIR-01..04 verification (Task 2)

| Case   | Description                                                                                                          | Verified via                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| WIR-01 | server.ts step 10 instantiates createDeepgramStt with `keytermProvider: () => buildKeytermList(SPELL_KEYTERMS, …)`  | grep + full bridge suite green                              |
| WIR-02 | keytermProvider closure captures `entityCache` from step 7c (same instance ID)                                       | Lexical closure inspection + grep (`entityCache.get()`)    |
| WIR-03 | audio-stream-route.test.ts unchanged; full bridge suite still green                                                  | `pnpm vitest run --project @evf/bridge` → 261/261           |
| WIR-04 | Bridge build succeeds without DEEPGRAM_API_KEY                                                                       | `DEEPGRAM_API_KEY= pnpm --filter @evf/bridge build` exit 0 |

### Bridge package + workspace totals

| Check                                  | Command                                  | Result                            |
| -------------------------------------- | ---------------------------------------- | --------------------------------- |
| Bridge test suite                      | `pnpm vitest run --project @evf/bridge`  | 261/261 (was 255, +6 DGKT)        |
| Workspace test suite                   | `pnpm vitest run`                        | 2585/2585 (was 2579, +6 DGKT)     |
| Bridge TypeScript typecheck            | `pnpm --filter @evf/bridge typecheck`    | exit 0                            |
| Workspace TypeScript typecheck         | `pnpm typecheck`                         | exit 0                            |
| Workspace lint (CI mode, fail-on-err)  | `pnpm lint:ci`                           | exit 0 (260 warn + 41 info, all pre-existing) |
| Bridge production build                | `DEEPGRAM_API_KEY= pnpm --filter @evf/bridge build` | exit 0 (95.36 KB ESM bundle) |
| CI Gate 8 — socketlib handler count    | grep                                     | **17** (unchanged)                |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Biome import-sort error after server.ts edit**
- **Found during:** Task 2 GREEN `pnpm lint:ci` run
- **Issue:** Adding `import { SPELL_KEYTERMS } from '@evf/shared-protocol'` placed it before the existing `cors` / `rateLimit` imports, which Biome's `organizeImports` flagged as out-of-order in CI mode.
- **Fix:** Ran `pnpm biome check --write packages/bridge/src/server.ts`. Biome auto-sorted the imports alphabetically (purely cosmetic — no semantic change). My in-file comment for the Phase 15 import was repositioned but the import itself moved into the alphabetical block.
- **Files modified:** `packages/bridge/src/server.ts` (auto-fix only)
- **Commit:** `99b4d6d` (bundled with Task 2 GREEN — auto-fix and feature change are part of the same logical edit)

**2. [Rule 3 — Blocking] commitlint body-max-line-length on first Task 2 commit attempt**
- **Found during:** First `git commit` attempt for Task 2 GREEN
- **Issue:** Commit message body had a line > 100 chars; commitlint hook (Husky `commit-msg`) rejected it.
- **Fix:** Rewrote commit body with shorter lines, all under 100 chars. Re-ran git commit; hook passed.
- **Files modified:** None (commit message only)
- **Commit:** `99b4d6d` (final successful commit)

No architectural changes (Rule 4) required. No checkpoints triggered. No authentication gates. No fix-attempt-limit breaches.

## Key Decisions

See frontmatter `decisions[]` for full rationale. Headline calls:

- **Callback over static array** (D-15-02-01) — lazy evaluation on every `connect()` is the foundation for hot-update without adapter re-instantiation. Plan 15-03 will reuse this exact contract via the cache's debounce → trigger re-`connect()` flow.
- **Defensive try/catch** (D-15-02-02) — T-15-07 disposition (mitigate) satisfied. A throwing provider degrades to baseline rather than fail-closing the voice path.
- **Byte-for-byte baseline preservation** (D-15-02-03) — DGKT-04 / DGKT-06 assert URL equality against the canonical `DEEPGRAM_URL` constant via string `.toBe()`. This is the strongest possible regression contract for Phase 12 baseline.
- **Private URL helper** (D-15-02-04) — `buildDeepgramUrl` is module-internal; its contract is enforced through end-to-end connect() URL assertions, not as a separate export. Keeps the package public surface minimal.

## Threat Model — Mitigation Verification

| Threat ID | Disposition | Verification                                                                                                                            |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T-15-05   | mitigate    | DGKT-02 asserts `foo&punctuate=false` → `keyterm=foo%26punctuate%3Dfalse` AND `punctuate=true` (canonical) NOT overridden. URL injection blocked at encodeURIComponent. |
| T-15-06   | accept      | apiKey grep count in deepgram-stt.ts = 11 (unchanged from baseline). No new secret-adjacent logging introduced. Existing pino redact list still covers `apiKey` / `deepgramKey`. |
| T-15-07   | mitigate    | try/catch around `keytermProvider()` invocation in `connect()`; on throw, logger.warn fires and `keyterms = []` (baseline preserved). Not exercised by a dedicated test in this plan (deferred to plan 15-04 failure-modes); the guard exists defensively. |

## CI Gate 8 Confirmation

```bash
grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts
# → 17
```

Unchanged from Phase 13 baseline (14 → 17 happened in Phase 13 Plan 13-01). This plan touches ONLY `packages/bridge/` — no `packages/foundry-module/` changes, no new socketlib handlers. CI Gate 8 invariant preserved.

## Grep Acceptance Audit

| Path                                              | Pattern              | Required | Observed |
| ------------------------------------------------- | -------------------- | -------- | -------- |
| packages/bridge/src/voice/deepgram-stt.ts         | `keytermProvider`    | ≥ 3      | **8**    |
| packages/bridge/src/voice/deepgram-stt.ts         | `encodeURIComponent` | ≥ 1      | **3**    |
| packages/bridge/src/voice/deepgram-stt.ts         | `apiKey`             | = 11 (baseline preserved) | **11** |
| packages/bridge/src/server.ts                     | `buildKeytermList`   | ≥ 1      | **3**    |
| packages/bridge/src/server.ts                     | `SPELL_KEYTERMS`     | ≥ 1      | **4**    |
| packages/bridge/src/server.ts                     | `keytermProvider`    | ≥ 1      | **2**    |
| packages/foundry-module/src/pair/socketlib-handlers.ts | `socketlib.registerComplexHandler` | = 17 | **17** |

All gates met.

## Files Touched + LoC Summary

| File                                              | Change   | LoC delta |
| ------------------------------------------------- | -------- | --------- |
| packages/bridge/src/voice/deepgram-stt.ts         | modified | +93       |
| packages/bridge/src/voice/deepgram-stt.test.ts    | modified | +140      |
| packages/bridge/src/server.ts                     | modified | +38       |
| **Total**                                         |          | **+263**  |

`git diff HEAD~3 HEAD --stat -- packages/bridge` reports `3 files changed, 263 insertions(+), 8 deletions(-)` — the 8 deletions are the JSDoc rewrite of `createDeepgramStt` (replaced shorter block with longer Phase 15 version) plus Biome's import auto-sort cleanup.

## INV-3 Doc Coherence

**Deferred to plan 15-05** (per plan 15-02 verification block: *"INV-3 doc coherence is deferred to plan 15-05 (cross-cutting closure)"*). No Specs.md / README / showcase changes in this plan — keyterm wiring is bridge-internal and does not surface in the user-facing constraint catalogue until Phase 15 closes.

## Downstream Plan Hooks

- **Plan 15-03 (refresh debounce):** Will subscribe to `EntityPackCache` change events and trigger a debounced re-`connect()` flow. The lazy-callback contract validated by DGKT-05 is exactly what 15-03 relies on — no further changes to `deepgram-stt.ts` should be required.
- **Plan 15-04 (failure-mode retry):** Will wrap the keytermProvider output in a sanitisation pass (strip special chars, normalise whitespace) before passing through `buildKeytermList` — or by intercepting at the adapter layer. T-15-07 already provides the throw-safety floor; 15-04 will add explicit retry-on-Deepgram-rejection semantics.
- **Plan 15-05 (Phase 15 closure):** INV-3 atomic doc coherence — Specs.md + README + showcase bump for the Deepgram Keyterm feature; final SUMMARY rollup of REQ VOICE-06..09; CHANGELOG entry.

## Self-Check: PASSED

- [x] `packages/bridge/src/voice/deepgram-stt.ts` contains `keytermProvider` (8 occurrences)
- [x] `packages/bridge/src/voice/deepgram-stt.ts` contains `encodeURIComponent` (3 occurrences)
- [x] `packages/bridge/src/voice/deepgram-stt.ts` `apiKey` grep count = 11 (T-12-LEAK-01 preserved)
- [x] `packages/bridge/src/voice/deepgram-stt.test.ts` contains describe block `DGKT-01..DGKT-06`
- [x] `packages/bridge/src/server.ts` contains `buildKeytermList` (3 occurrences) + `SPELL_KEYTERMS` (4) + `keytermProvider` (2)
- [x] Commit `85ed688` (Task 1 RED) present in `git log`
- [x] Commit `acfc7fa` (Task 1 GREEN) present in `git log`
- [x] Commit `99b4d6d` (Task 2 GREEN) present in `git log`
- [x] `pnpm vitest run --project @evf/bridge src/voice/deepgram-stt.test.ts` → 19/19 pass
- [x] `pnpm vitest run --project @evf/bridge` → 261/261 pass
- [x] `pnpm vitest run` → 2585/2585 pass
- [x] `pnpm typecheck` → exit 0
- [x] `pnpm lint:ci` → exit 0
- [x] `DEEPGRAM_API_KEY= pnpm --filter @evf/bridge build` → exit 0 (95.36 KB ESM bundle, soft-fail boot preserved)
- [x] `grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts` → 17 (CI Gate 8 preserved)
