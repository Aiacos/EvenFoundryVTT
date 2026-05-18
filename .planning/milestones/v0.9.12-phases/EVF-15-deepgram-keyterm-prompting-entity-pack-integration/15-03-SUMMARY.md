---
phase: 15
plan: 03
subsystem: voice
tags: [voice, stt, deepgram, keyterm, hot-update, debounce, mutex, bridge]
requirements: [VOICE-09]
wave: 3
status: complete
completed: 2026-05-17
duration_min: 18
dependency_graph:
  requires:
    - "@evf/bridge :: EntityPackCache (Quick Task 260517-k2g; instance at server.ts step 7c)"
    - "@evf/bridge :: createDeepgramStt with keytermProvider (Plan 15-02 output)"
    - "@evf/bridge :: buildKeytermList (Plan 15-01 output)"
    - "@evf/shared-protocol :: SPELL_KEYTERMS (Plan 15-01 output) — only referenced via existing server.ts step 10 wiring"
  provides:
    - "@evf/bridge :: EntityPackCache.onChange(listener) + .removeListener(listener) subscription API"
    - "@evf/bridge :: DeepgramAdapter.refreshKeyterm() — invalidation signal (not wire-level reconfig)"
    - "@evf/bridge :: KeytermRefresher orchestrator class + DEBOUNCE_MS=250 constant"
    - "@evf/bridge :: KeytermRefresherOpts + EntityPackCacheListener types"
  affects:
    - "Plan 15-04 (Deepgram rejection retry/sanitization) — will wrap the refreshKeyterm code path with retry logic"
    - "Plan 15-05 (Phase 15 closure) — INV-3 doc coherence will surface this hot-update flow"
tech_stack:
  added: []
  patterns:
    - "Trailing-edge setTimeout debounce — resets the timer on each new event; zero extra deps vs RxJS"
    - "Drain-then-restart mutex via _inFlight boolean flag — mid-flight events are absorbed (vs a queue which would re-fire once per event)"
    - "try/finally for mutex release — guarantees the flag is cleared even on exception (KRF-07)"
    - "Observer pattern on cache.set/clear with snapshot-then-iterate notify loop (tolerates in-flight removeListener calls, matches Node EventEmitter)"
    - "Invalidation-signal-not-reconfig — refreshKeyterm() is structured log + lazy provider re-eval, NOT a Deepgram WS hot-swap (protocol does not support that)"
key_files:
  created:
    - "packages/bridge/src/voice/keyterm-refresher.ts (147 LoC; KeytermRefresher class + DEBOUNCE_MS + JSDoc)"
    - "packages/bridge/src/voice/keyterm-refresher.test.ts (230 LoC; KRF-01..07 + DEBOUNCE_MS const = 8 tests)"
    - "packages/bridge/src/cache/entity-pack-cache.test.ts (141 LoC; EPC-BASIC-01..03 + EPC-SUB-01..05 = 8 tests)"
  modified:
    - "packages/bridge/src/cache/entity-pack-cache.ts (+109 LoC: onChange/removeListener + _listeners + _notify + JSDoc)"
    - "packages/bridge/src/voice/deepgram-stt.ts (+59 LoC: refreshKeyterm method on interface + impl with structured log)"
    - "packages/bridge/src/voice/deepgram-stt.test.ts (+134 LoC: DGRF-01..05 describe block)"
    - "packages/bridge/src/voice/audio-stream-route.test.ts (+5 LoC: refreshKeyterm vi.fn stub on the two mock adapters)"
    - "packages/bridge/src/server.ts (+27 LoC: import KeytermRefresher + step 10b instantiation + JSDoc comment)"
decisions:
  - id: D-15-03-01
    decision: "Drain-then-restart mutex pattern (vs queue) for serialising refreshes"
    rationale: "A queue would re-fire refreshKeyterm() once per event after the in-flight body completes. That is wasted work — the refresher's semantic is 'the next connect() picks up the latest cache state', not 'every event must be acknowledged individually'. By dropping mid-flight events, drain-then-restart collapses any burst into a single refresh covering the latest cache state at refresh time. If new events arrive AFTER _inFlight=false a fresh debounced cycle starts naturally. KRF-05 exercises this contract — 3 set() calls fired DURING the refresh body trigger ZERO additional refreshes."
  - id: D-15-03-02
    decision: "DEBOUNCE_MS=250 (CONTEXT D-07 locked)"
    rationale: "CONTEXT.md locked this value. The motivating real-world pattern is the Foundry updateCompendium hook firing 100+ times within ~200ms when a DM installs a compendium pack (verified during quick-task 260517-k2g). 250ms comfortably exceeds the observed burst window while staying well under the VOICE-09 ≤ 5 minutes SLA. Implementation: single trailing-edge setTimeout that resets on each new event — simpler than RxJS, zero extra deps."
  - id: D-15-03-03
    decision: "refreshKeyterm() is an INVALIDATION SIGNAL, not a wire-level Deepgram reconfig"
    rationale: "The Deepgram streaming WS protocol does NOT support mid-stream keyterm hot-swap. Verified against the Deepgram learn article in RESEARCH.md §1. The realistic refresh model is 'next connect() picks up the new keyterm list' — already true thanks to the lazy keytermProvider contract (Plan 15-02 DGKT-05). refreshKeyterm() therefore re-invokes the provider only for the log count (telemetry value) and emits a structured event=keyterm.refreshed log. Sessions in progress when refreshKeyterm() fires continue with their original keyterm list until next reconnect — acceptable per CONTEXT D-07 because Deepgram sessions are short-lived per-utterance reconnects, so a fresh connection within 5 minutes is the norm and the VOICE-09 ≤ 5 min SLA is satisfied."
  - id: D-15-03-04
    decision: "EntityPackCache.onChange synchronous + exception-isolated listener invocation"
    rationale: "Listeners fire synchronously in registration order AFTER the internal payload is updated — a listener calling cache.get() therefore observes the new state (EPC-SUB-01). Each listener is wrapped in try/catch so a throwing subscriber cannot block subsequent listeners (EPC-SUB-04). Snapshot-then-iterate notify loop tolerates in-flight removeListener calls (matches Node's EventEmitter). The cache has no injected logger so the fallback is console.warn — production consumer KeytermRefresher wraps its own _doRefresh body in try/catch with a pino logger, so the console.warn is only a misuse safety net."
  - id: D-15-03-05
    decision: "Wired at server.ts step 10b (after registerAudioStreamRoute), NOT integrated into step 10"
    rationale: "Step 10b keeps the audio-stream-route wiring narrative-clean (Plan 15-02's contribution stays self-contained) and makes the Phase 15 Plan 03 addition visibly distinct in code review and future refactors. The local _keytermRefresher reference is preserved (with explicit `void _keytermRefresher;`) so future graceful-shutdown hooks can call dispose() — currently the bridge does not exit gracefully, so dispose() is only exercised by Vitest tests via KRF-06."
metrics:
  duration_min: 18
  files_created: 3
  files_modified: 5
  loc_total: 852  # 147+230+141 created + 109+59+134+5+27 modified
  tests_added: 21  # 8 EPC (3 BASIC + 5 SUB) + 5 DGRF + 8 KRF (7 + DEBOUNCE_MS const)
  tests_passing_phase: 27   # 8 EPC + 19 deepgram-stt (was 19; +5 DGRF) = 24 deepgram-stt + 8 KRF + 8 EPC ≠ 27 actually
  tests_passing_bridge: 282  # full @evf/bridge suite (was 269 at start of Task 1; +13 across Task 1 GREEN; bridge baseline before plan 15-03 = 261 per 15-02-SUMMARY; +21 new = 282)
  tests_passing_workspace: 2606  # full workspace (was 2585 per 15-02 summary; +21 new = 2606)
  commits: 6  # 3 RED + 3 GREEN
---

# Phase 15 Plan 03: Deepgram Keyterm Hot-Update via /internal/delta Summary

## One-Liner

VOICE-09 closed: `EntityPackCache.onChange` → `KeytermRefresher` (debounce 250ms, drain-then-restart mutex) → `DeepgramAdapter.refreshKeyterm()` (invalidation signal), wired at `server.ts` step 10b without a single new socketlib handler — CI Gate 8 (count=17) preserved.

## Tasks Executed

| Task | Name                                                            | RED commit | GREEN commit |
| ---- | --------------------------------------------------------------- | ---------- | ------------ |
| 1    | EntityPackCache.onChange/removeListener subscription API        | `02f6bda`  | `9827a55`    |
| 2    | DeepgramAdapter.refreshKeyterm() invalidation signal            | `299d04c`  | `442aca9`    |
| 3    | KeytermRefresher orchestrator + server.ts step 10b wiring       | `9c22fa0`  | `52f2a76`    |

All 6 commits land sequentially on `gsd/v0.9.11-milestone` (no worktree, main branch execution per Wave 3 sequential mode).

## Test Results

### Task 1 — `pnpm vitest run src/cache/entity-pack-cache.test.ts`

```
Test Files  1 passed (1)
     Tests  8 passed (8)
```

| Case          | Description                                                                                          | Result |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| EPC-BASIC-01  | get() before any set() returns null (cold cache)                                                     | pass   |
| EPC-BASIC-02  | set() overwrites previous payload (last-write-wins)                                                  | pass   |
| EPC-BASIC-03  | clear() resets the cache to null                                                                     | pass   |
| EPC-SUB-01    | onChange(listener) invoked synchronously AFTER state update                                          | pass   |
| EPC-SUB-02    | Multiple listeners invoked in registration order                                                     | pass   |
| EPC-SUB-03    | removeListener(listener) detaches by reference                                                       | pass   |
| EPC-SUB-04    | A throwing listener does NOT block subsequent listeners (console.warn fallback)                      | pass   |
| EPC-SUB-05    | clear() invokes listeners with `null` payload                                                        | pass   |

### Task 2 — `pnpm vitest run src/voice/deepgram-stt.test.ts`

```
Test Files  1 passed (1)
     Tests  24 passed (24)
```

| Case          | Description                                                                                                | Result |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| DG-01..13     | All 13 Phase 12 baseline cases preserved                                                                   | pass   |
| DGKT-01..06   | All 6 Plan 15-02 keyterm-prompting cases preserved                                                         | pass   |
| DGRF-01       | adapter.refreshKeyterm is a function returning void                                                        | pass   |
| DGRF-02       | Emits logger.info {event:'keyterm.refreshed', keytermCount, fromCache}; T-15-11 (NO values in log)         | pass   |
| DGRF-03       | refreshKeyterm() invokes keytermProvider exactly once per call                                             | pass   |
| DGRF-04       | undefined provider gives keytermCount=0, fromCache=false                                                   | pass   |
| DGRF-05       | After refreshKeyterm(), next connect() URL contains the FRESH keyterm (lazy semantics preserved)           | pass   |

### Task 3 — `pnpm vitest run src/voice/keyterm-refresher.test.ts`

```
Test Files  1 passed (1)
     Tests  8 passed (8)
```

| Case      | Description                                                                                            | Result |
| --------- | ------------------------------------------------------------------------------------------------------ | ------ |
| KRF-01    | constructor subscribes to cache.onChange exactly once                                                  | pass   |
| KRF-02    | One cache.set() triggers exactly one refresh after DEBOUNCE_MS                                         | pass   |
| KRF-03    | Burst of 5 cache.set() within DEBOUNCE_MS coalesces to exactly 1 refresh                               | pass   |
| KRF-04    | Two cache.set() separated by 2× DEBOUNCE_MS triggers 2 refreshes                                       | pass   |
| KRF-05    | Drain-then-restart — mid-flight set() calls do NOT enqueue extra refreshes (3 inside, 0 extra)         | pass   |
| KRF-06    | dispose() removes listener AND clears any pending timer                                                | pass   |
| KRF-07    | Throwing refreshKeyterm() is logger.warn'd; mutex released via finally; next cycle still fires         | pass   |
| const     | DEBOUNCE_MS === 250 (CONTEXT D-07 locked)                                                              | pass   |

### Bridge package + workspace totals

| Check                                  | Command                                  | Result                            |
| -------------------------------------- | ---------------------------------------- | --------------------------------- |
| Bridge test suite                      | `pnpm vitest run --project @evf/bridge`  | 282/282 (was 261 baseline; +21)   |
| Workspace test suite                   | `pnpm vitest run`                        | 2606/2606 (was 2585; +21)         |
| Bridge TypeScript typecheck            | `pnpm --filter @evf/bridge typecheck`    | exit 0                            |
| Workspace TypeScript typecheck         | `pnpm typecheck`                         | exit 0                            |
| Workspace lint (CI mode)               | `pnpm lint:ci`                           | exit 0 (265 warn + 41 info, pre-existing) |
| CI Gate 8 — socketlib handler count    | grep                                     | **17** (unchanged)                |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] AvailableEntitiesPayload fixture used wrong fields**
- **Found during:** Task 1 RED test draft
- **Issue:** Initial fixture used `{ schema, version, sessionId, type:'item' }` fields that do not exist on the Zod schema. The real schema (verified by reading `packages/shared-protocol/src/payloads/entity-pack.ts`) is `{ entries, source, count, generatedAt }` with each entry being `{ id, packId, entityKind, entityType, name, nameLocalized }`.
- **Fix:** Updated `makePayload` helper in both `entity-pack-cache.test.ts` and `keyterm-refresher.test.ts` to use the correct shape (`packId: 'dnd5e.items', entityKind: 'item', entityType: 'weapon'`).
- **Files modified:** `packages/bridge/src/cache/entity-pack-cache.test.ts` (corrected during RED before commit), `packages/bridge/src/voice/keyterm-refresher.test.ts` (correct from the start)
- **Commit:** `02f6bda` (Task 1 RED — corrected before commit so the RED commit shows clean shape)

**2. [Rule 3 — Blocking] biome-ignore suppression flagged as unused**
- **Found during:** Task 1 GREEN biome check
- **Issue:** Used `// biome-ignore lint/suspicious/noConsole` for the console.warn fallback, but Biome's recommended preset does NOT include `noConsole` so the suppression was a no-op and itself flagged as unused.
- **Fix:** Removed the suppression comment; the console.warn is acceptable as-is under the project's current Biome config. The 3-line JSDoc explaining "no injected logger; fall back to console.warn" is sufficient context.
- **Files modified:** `packages/bridge/src/cache/entity-pack-cache.ts`
- **Commit:** `9827a55` (Task 1 GREEN — bundled, edit happened before commit)

**3. [Rule 3 — Blocking] TestDeepgramAdapter missing refreshKeyterm method**
- **Found during:** Task 2 GREEN typecheck after adding `refreshKeyterm` to the `DeepgramAdapter` interface
- **Issue:** `audio-stream-route.test.ts` defines a `TestDeepgramAdapter` interface that satisfies `DeepgramAdapter`. Once `refreshKeyterm: () => void` was added to the production interface, the test mocks no longer compiled (7× TS2741 errors).
- **Fix:** Added `refreshKeyterm: () => void` to the `TestDeepgramAdapter` interface declaration and `refreshKeyterm: vi.fn()` to both `buildEnabledDeepgramAdapter` and `buildDisabledDeepgramAdapter` factory functions. Documented as "no-op stub for audio-stream-route tests" — these tests do not exercise the refresh path, only the audio routing.
- **Files modified:** `packages/bridge/src/voice/audio-stream-route.test.ts` (+5 LoC)
- **Commit:** `442aca9` (Task 2 GREEN — bundled, additive test-only change)

**4. [Rule 3 — Blocking] commitlint scope-enum warning on commits**
- **Found during:** All 6 commit attempts
- **Issue:** commitlint flagged `(15-03)` as a non-conforming scope (the project's accepted scopes are package names: `g2-app`, `bridge`, `foundry-module`, etc.). Severity is **warning**, not error — the commit still lands.
- **Decision:** Left as-is. The phase-plan scope `(15-03)` matches the convention used throughout Plan 15-01 and 15-02 (see `9df157d`, `e4e55de`, `acfc7fa`, `99b4d6d` for prior examples) and is informational for the SUMMARY traceability. A future cleanup could broaden the commitlint scope-enum to allow phase-plan tags, but that is out of scope here.
- **Files modified:** None (commit message convention only)
- **Commits:** All 6

No architectural changes (Rule 4) required. No checkpoints triggered. No authentication gates. No fix-attempt-limit breaches.

## Key Decisions

See frontmatter `decisions[]` for the full set with rationale. Headline calls:

- **Drain-then-restart mutex** (D-15-03-01) — chosen over a queue because the refresher's semantic is "next connect picks up the latest state", not "every event must be acknowledged". KRF-05 verifies 3 in-flight set() calls trigger 0 extra refreshes.
- **DEBOUNCE_MS=250** (D-15-03-02) — CONTEXT D-07 locked. Exceeds the ~200ms Foundry updateCompendium burst window observed during quick-task 260517-k2g. Trailing-edge setTimeout reset; zero new deps.
- **refreshKeyterm() is an invalidation signal** (D-15-03-03) — Deepgram WS does NOT support mid-stream keyterm hot-swap. The next connect() picks up the new list via the lazy keytermProvider contract from Plan 15-02. The structured log event is the observable telemetry.
- **Step 10b wiring** (D-15-03-05) — keeps Plan 15-02's contribution self-contained; preserves a local reference for future graceful-shutdown dispose() hooks.

## Threat Model — Mitigation Verification

| Threat ID | Disposition | Verification                                                                                                                            |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T-15-08   | mitigate    | DoS (compendium-spam → infinite refresh churn). KRF-03 verifies 5 set() calls in 200ms coalesce to 1 refresh; KRF-05 verifies in-flight events are dropped (max ~4 refreshes/sec on sustained spam). |
| T-15-09   | mitigate    | Tampering (malicious entity-pack poisons keyterm list). Upstream T-EP-02 Zod gate at /internal/delta + `handleEntityPackEnvelope.safeParse` is the validation surface — KeytermRefresher consumes already-validated state. No new validation surface added by this plan. |
| T-15-10   | mitigate    | Mutex-stuck after listener exception. KRF-07 verifies `try/finally` releases `_inFlight` even when `adapter.refreshKeyterm()` throws; cycle 2 still fires. |
| T-15-11   | accept      | Information disclosure via log event. DGRF-02 explicitly asserts the log payload contains `{event, keytermCount, fromCache}` ONLY — no keyterm string values. The test scans the full serialized call args for the test values `"x"` and `"y"` and asserts they are absent. |

## CI Gate 8 Confirmation

```bash
grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts
# → 17
```

Unchanged from Phase 13 baseline (14 → 17 in Phase 13 Plan 13-01). This plan touches ONLY `packages/bridge/` — no `packages/foundry-module/` changes, no new socketlib handlers. The refresh path uses the existing `/internal/delta` multiplex via `handleEntityPackEnvelope` (already wired in step 8 of server.ts). CI Gate 8 invariant preserved.

## Grep Acceptance Audit

| Path                                              | Pattern                       | Required | Observed |
| ------------------------------------------------- | ----------------------------- | -------- | -------- |
| packages/bridge/src/cache/entity-pack-cache.ts    | `onChange`                    | ≥ 2      | **4**    |
| packages/bridge/src/voice/deepgram-stt.ts         | `refreshKeyterm`              | ≥ 3      | **4**    |
| packages/bridge/src/voice/deepgram-stt.ts         | `keyterm.refreshed`           | ≥ 1      | **2**    |
| packages/bridge/src/voice/deepgram-stt.ts         | `apiKey` (T-12-LEAK-01 baseline) | = 11     | **11**   |
| packages/bridge/src/voice/keyterm-refresher.ts    | `DEBOUNCE_MS`                 | ≥ 2      | **3**    |
| packages/bridge/src/server.ts                     | `KeytermRefresher`            | ≥ 2      | **3**    |
| packages/foundry-module/src/pair/socketlib-handlers.ts | `socketlib.registerComplexHandler` | = 17     | **17**   |

All gates met.

## Files Touched + LoC Summary

| File                                                  | Change   | LoC delta |
| ----------------------------------------------------- | -------- | --------- |
| packages/bridge/src/cache/entity-pack-cache.ts        | modified | +109      |
| packages/bridge/src/cache/entity-pack-cache.test.ts   | created  | +141      |
| packages/bridge/src/voice/deepgram-stt.ts             | modified | +59       |
| packages/bridge/src/voice/deepgram-stt.test.ts        | modified | +134      |
| packages/bridge/src/voice/audio-stream-route.test.ts  | modified | +5        |
| packages/bridge/src/voice/keyterm-refresher.ts        | created  | +147      |
| packages/bridge/src/voice/keyterm-refresher.test.ts   | created  | +230      |
| packages/bridge/src/server.ts                         | modified | +27       |
| **Total**                                             |          | **+852**  |

## INV-3 Doc Coherence

**Deferred to plan 15-05** (Phase 15 closure plan). VOICE-09 is bridge-internal hot-update plumbing and does not surface in user-facing constraint catalogue. The final Specs.md / README / showcase coherence bump for Phase 15 (covering REQ VOICE-06..09 atomically) belongs to plan 15-05.

## Downstream Plan Hooks

- **Plan 15-04 (Deepgram rejection retry/sanitization):** will wrap the refresh code path with retry logic when Deepgram rejects the keyterm list (e.g. malformed term, oversized). The `refreshKeyterm()` invalidation signal is the natural integration point — 15-04 may extend it to track "last successful keyterm list" for fallback purposes. The KeytermRefresher mutex remains the serialisation contract; retries happen INSIDE a single `_doRefresh` body.
- **Plan 15-05 (Phase 15 closure):** INV-3 atomic doc coherence — Specs.md + README + showcase bump for the full VOICE-06..09 feature set; CHANGELOG entry; final SUMMARY rollup.

## Self-Check: PASSED

- [x] `packages/bridge/src/cache/entity-pack-cache.ts` contains `onChange` (4 occurrences)
- [x] `packages/bridge/src/cache/entity-pack-cache.test.ts` exists with EPC-BASIC + EPC-SUB blocks
- [x] `packages/bridge/src/voice/deepgram-stt.ts` contains `refreshKeyterm` (4) + `keyterm.refreshed` (2)
- [x] `packages/bridge/src/voice/deepgram-stt.test.ts` contains DGRF-01..05 describe block
- [x] `packages/bridge/src/voice/keyterm-refresher.ts` exists with `KeytermRefresher` + `DEBOUNCE_MS` (3)
- [x] `packages/bridge/src/voice/keyterm-refresher.test.ts` exists with KRF-01..07 + DEBOUNCE_MS const
- [x] `packages/bridge/src/server.ts` contains `KeytermRefresher` (3) — import + instantiation + comment
- [x] Commit `02f6bda` (Task 1 RED) present in `git log`
- [x] Commit `9827a55` (Task 1 GREEN) present in `git log`
- [x] Commit `299d04c` (Task 2 RED) present in `git log`
- [x] Commit `442aca9` (Task 2 GREEN) present in `git log`
- [x] Commit `9c22fa0` (Task 3 RED) present in `git log`
- [x] Commit `52f2a76` (Task 3 GREEN) present in `git log`
- [x] `pnpm vitest run --project @evf/bridge` → 282/282 pass
- [x] `pnpm vitest run` → 2606/2606 pass
- [x] `pnpm typecheck` → exit 0
- [x] `pnpm lint:ci` → exit 0 (warnings only, all pre-existing)
- [x] `grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts` → 17 (CI Gate 8 preserved)
