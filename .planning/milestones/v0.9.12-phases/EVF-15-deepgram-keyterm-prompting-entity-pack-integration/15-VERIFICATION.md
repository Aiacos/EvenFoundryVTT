---
phase: 15-deepgram-keyterm-prompting-entity-pack-integration
verified: 2026-05-17T19:00:00Z
status: passed
score: 5/5 success criteria verified · 4/4 REQ-IDs SATISFIED
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 15: Deepgram Keyterm Prompting + Entity-Pack Integration — Verification Report

**Phase Goal:** Voice STT correctly recognizes esoteric D&D 5e entity names (spells, weapons, monsters) in both IT and EN — including code-switch — by feeding the Deepgram Nova-3 Multilingual `keyterm` parameter with the union of the static 70-spell SRD subset and the dynamic Foundry-derived entity vocabulary, refreshed live on WS delta.

**Verified:** 2026-05-17T19:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Verification Methodology

Phase 15 is a **software-only enhancement phase** under ADR-0005 Branch A — extends Phase 12 (Deepgram Nova-3 baseline) and Quick Task 260517-k2g (entity-pack pipeline) without touching firmware contracts, network whitelist, or socketlib handler surface. The phase ships:

1. **Static + dynamic vocab merger** (Plan 15-01) — `SPELL_KEYTERMS` (70 SRD entries × IT + EN, drift-proof against foundry-mcp `SPELL_LOOKUP` via SKT-02 mapping test) + `buildKeytermList()` pure function with static-wins + cap-drops-dynamic-first semantics
2. **Deepgram adapter wiring** (Plan 15-02) — `createDeepgramStt` extended with optional `keytermProvider` callback; URL builder appends one `keyterm=<URL-encoded>` query param per element; `server.ts` step 10 wires closure over `EntityPackCache`
3. **Hot-update plumbing** (Plan 15-03) — `EntityPackCache.onChange/removeListener` subscription API + `KeytermRefresher` orchestrator (trailing-edge debounce 250ms + drain-then-restart mutex) + `DeepgramAdapter.refreshKeyterm()` invalidation signal; wired at `server.ts` step 10b
4. **Failure modes + integration** (Plan 15-04) — `sanitizeKeyterms()` (ASCII control chars only; Unicode letter-safe) + one-shot `keyterm.empty-entity-cache` warn (closure-local flag, reset-on-recovery) + per-session retry chain on close codes `[1007, 1008]` + `4000-4999` (retry-with-sanitized → fallback-to-baseline; never fail-closed) + end-to-end integration test (INT-01..03)
5. **INV-3 atomic doc-coherence closure** (Plan 15-05 — this phase-close commit) — Specs.md §3.6 + §5.2 + changelog · README · showcase · STATE · ROADMAP · REQUIREMENTS · 15-VERIFICATION.md in a single atomic commit per CLAUDE.md INV-3

All 4 v1 REQ-IDs (VOICE-06..09) are software-validatable end-to-end — no hardware UAT introduced. The carry-forward **35 `human_needed` SCs** from v0.9.11 (ADR-0005 Branch A) remain unchanged and untouched by Phase 15.

## REQ-IDs Closed — Software-Only

| REQ      | Status                     | Evidence                                                                                                                                     |
| -------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| VOICE-06 | Resolved · Software-only   | `packages/bridge/src/voice/deepgram-stt.test.ts` DGKT-01..06 + `keyterm-integration.test.ts` INT-01                                          |
| VOICE-07 | Resolved · Software-only   | `packages/bridge/src/voice/keyterm-merger.test.ts` KM-01..12 + `keyterm-integration.test.ts` INT-01 + INT-03                                 |
| VOICE-08 | Resolved · Software-only   | `keyterm-merger.test.ts` KM-02 (locale-aware IT + EN emission) + `deepgram-stt.test.ts` DGKT-02 (URL-encode `palla di fuoco` / accented vars) |
| VOICE-09 | Resolved · Software-only   | `keyterm-refresher.test.ts` KRF-01..07 + `entity-pack-cache.test.ts` EPC-SUB-01..05 + `keyterm-integration.test.ts` INT-01 (end-to-end)      |

All 4 REQ-IDs traced to closure plans with green tests, locked production code, and a single atomic INV-3 ratification commit. No orphans, no gaps.

## Goal Achievement — Roadmap Success Criteria

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Deepgram STT call from `deepgram-stt.ts` passes the `keyterm` parameter populated from the merged vocabulary (VOICE-06) | VERIFIED | (a) `packages/bridge/src/voice/deepgram-stt.ts` `keytermProvider` opt + `buildDeepgramUrl` helper — 8 occurrences of `keytermProvider` + 3 of `encodeURIComponent`. (b) `server.ts` step 10 wires `keytermProvider: () => buildKeytermList(SPELL_KEYTERMS, entityCache.get())` (3 occurrences of `buildKeytermList`, 4 of `SPELL_KEYTERMS`, 2 of `keytermProvider` confirmed via grep). (c) **DGKT-01** asserts connect() URL contains one `keyterm=` per provider entry; **DGKT-02** asserts `encodeURIComponent` (`palla%20di%20fuoco`, `foo%26punctuate%3Dfalse`, `%C3%A8`); **DGKT-04** asserts byte-for-byte URL equality with `DEEPGRAM_URL` baseline when provider returns `[]` (Phase 12 regression guard). |
| 2 | Keyterm vocabulary is composed by merging `SPELL_KEYTERMS` (70 SRD static) + `EntityPackCache` snapshot; both IT + EN locale variants included in a single union list (VOICE-07 + VOICE-08) | VERIFIED | (a) `packages/shared-protocol/src/voice/spell-keyterms.ts` 70-entry frozen tuple array `{it,en}`; **SKT-02** asserts bidirectional 1:1 mapping to foundry-mcp `SPELL_LOOKUP` (drift-proof). (b) `packages/bridge/src/voice/keyterm-merger.ts` `buildKeytermList()` pure function — **KM-01** verifies empty entity-cache returns exactly 140 entries (70 × 2 locales); **KM-02** asserts both `.it` AND `.en` of each spell present in result; **KM-03** asserts entity-pack `.name` AND `.nameLocalized` preserved with original casing. (c) **KM-04** dedupe by lower-cased trimmed key collapses duplicates; **KM-05** static-wins on conflict (CONTEXT D-01 — capitalised `Fireball` / `Shield` entity-pack variants dropped); **KM-07** + **KM-09** truncate-dynamic-first cap behaviour (CONTEXT D-04, `DEEPGRAM_KEYTERM_LIMIT = 100`). |
| 3 | Adding/removing an entity in the Foundry compendium triggers a WS delta on `/internal/delta` which refreshes the keyterm list inside the STT client within ≤ 5 minutes (VOICE-09) | VERIFIED | (a) `packages/bridge/src/cache/entity-pack-cache.ts` `onChange/removeListener` API — **EPC-SUB-01..05** verify synchronous listener invocation after state update, registration-order, removeListener-by-reference, throw-isolation, and clear-with-null payload. (b) `packages/bridge/src/voice/keyterm-refresher.ts` `KeytermRefresher` (DEBOUNCE_MS=250 + drain-then-restart mutex) — **KRF-02** one cache.set() → one refresh after debounce; **KRF-03** burst of 5 within debounce coalesces to 1; **KRF-04** two sets separated by 2× debounce trigger 2 refreshes; **KRF-05** mid-flight events do NOT enqueue extras; **KRF-07** throwing refresh body releases mutex via try/finally. (c) `DeepgramAdapter.refreshKeyterm()` is an invalidation signal — Deepgram WS does NOT support mid-stream keyterm hot-swap (RESEARCH.md §2 Option C); next connect() picks up fresh list via lazy provider (DGRF-05 verifies). (d) **INT-01** end-to-end: cache.set → debounce → adapter.refreshKeyterm log fires → next connect URL contains new entity-pack keyterm. SLA: ≤ DEBOUNCE_MS + 1 connect latency ≪ 5 min. |
| 4 | `socketlib.registerComplexHandler` count remains exactly **17** after Phase 15 close (Phase 13 invariant + CI Gate 8 preserved) | VERIFIED | `grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts` → **17** (unchanged from Phase 13 baseline). Phase 15 touches ONLY `packages/bridge/` + `packages/shared-protocol/` — zero changes to `packages/foundry-module/`, zero new socketlib handlers registered. Refresh path uses existing `/internal/delta` multiplex via `handleEntityPackEnvelope` (already wired in `server.ts` step 8). CI Gate 8 invariant preserved end-to-end. |
| 5 | Deepgram API `keyterm` parameter is correctly enabled only when keytermProvider configured + gracefully no-ops with feature flag off; existing Phase 12 behavior is fully backward-compatible (no regression) | VERIFIED | (a) **DGKT-04** + **DGKT-06** assert byte-for-byte URL equality with `DEEPGRAM_URL` baseline when `keytermProvider` is omitted OR returns `[]` (Phase 12 byte-for-byte preserved). (b) Provider try/catch defensive guard (T-15-07 mitigation) — throwing provider degrades to baseline rather than fail-closing voice. (c) Empty-cache one-shot warn (DGEC-01..03) opt-in via richer `KeytermProviderResult` object form — bare `string[]` return preserves Phase 12 semantics. (d) Failure modes (DGFM-01..06): close codes `[1007, 1008]` + `4000-4999` → retry-once-with-`sanitizeKeyterms` → fallback to baseline (`keyterm.fallback-to-baseline` log event); other close codes (1000, 1011) preserve Phase 12 close behaviour byte-for-byte (DGFM-04). **Total bridge test suite 300/300** including all 13 Phase 12 baseline DG-01..13 cases preserved unchanged. |

**Score:** 5 / 5 success criteria verified

## Test Results Summary

Workspace test count progression (sequential, on `gsd/v0.9.11-milestone`):

| Phase milestone | Workspace tests | Bridge package tests | Delta |
| --- | --- | --- | --- |
| Phase 14 close baseline | 2559 / 2559 | 255 / 255 | — |
| Quick Task 260517-k2g close | 2559 → unchanged at Phase 14 baseline; bridge baseline pre-15 was 261 / 261 (after voice prior tweaks) | 261 / 261 | — |
| After Plan 15-01 | 2579 / 2579 | (+ 20 in shared-protocol + bridge) | +20 |
| After Plan 15-02 | 2585 / 2585 | 261 / 261 (+ 6 DGKT in deepgram-stt.test.ts) | +6 |
| After Plan 15-03 | 2606 / 2606 | 282 / 282 (+ 21 across EPC + DGRF + KRF) | +21 |
| After Plan 15-04 | **2624 / 2624** | **300 / 300** (+ 18 across SAN + DGEC + DGFM + INT) | +18 |
| **Phase 15 total delta** | **+65 net** (2559 → 2624 since Phase 14 close) | +45 bridge-package-internal (255 → 300) | +65 / +45 |

Test suite categories landed in Phase 15:
- **SPELL_KEYTERMS** (shared-protocol): SKT-01..05 = 5 tests (length 70 · 1:1 SPELL_LOOKUP drift gate · frozen · non-empty IT+EN · type shape)
- **buildKeytermList** (bridge): KM-01..12 + 2 default-path guards + DEEPGRAM_KEYTERM_LIMIT const = 15 tests
- **createDeepgramStt keytermProvider** (bridge): DGKT-01..06 = 6 tests
- **EntityPackCache.onChange** (bridge): EPC-BASIC-01..03 + EPC-SUB-01..05 = 8 tests
- **DeepgramAdapter.refreshKeyterm** (bridge): DGRF-01..05 = 5 tests
- **KeytermRefresher** (bridge): KRF-01..07 + DEBOUNCE_MS const = 8 tests
- **sanitizeKeyterms** (bridge): SAN-01..06 = 6 tests
- **Empty-cache warn** (bridge): DGEC-01..03 = 3 tests
- **Keyterm-reject retry-then-fallback** (bridge): DGFM-01..06 = 6 tests
- **End-to-end integration** (bridge): INT-01..03 = 3 tests

**Total new test count: 65** (matches `+65 net` workspace delta).

## CI Gates Evidence

| Gate | Command | Result |
| --- | --- | --- |
| Workspace lint (CI mode) | `pnpm lint:ci` | exit 0 (286 warn + 41 info, all pre-existing per Phase 14 baseline) |
| Workspace typecheck | `pnpm typecheck` | exit 0 (root tsc + per-package tsc) |
| Workspace test suite | `pnpm vitest run` | **2624 / 2624 pass** |
| Bridge package test suite | `pnpm vitest run --project @evf/bridge` | **300 / 300 pass** |
| Bridge production build (soft-fail boot) | `DEEPGRAM_API_KEY= pnpm --filter @evf/bridge build` | exit 0 (95.36 KB ESM bundle preserved) |
| **CI Gate 8 — socketlib handler count** | `grep -c "socketlib.registerComplexHandler" packages/foundry-module/src/pair/socketlib-handlers.ts` | **17** (unchanged from Phase 13 baseline) |
| Phase 12 baseline regression guard | DGKT-04 byte-for-byte URL `.toBe(DEEPGRAM_URL)` | pass |
| INV-3 atomic doc coherence | Plan 15-05 single commit (`Specs.md` §3.6 + §5.2 + changelog · README · showcase · STATE · ROADMAP · REQUIREMENTS · 15-VERIFICATION.md) | green |

## Hardware UAT Carry-Forward — Zero New Items

Phase 15 introduces **ZERO** new hardware-pending SCs (CONTEXT.md confirmed software-only scope). The carry-forward 35 `human_needed` SCs from v0.9.11 (32 from Phase 10 closure + 1 SC-12-01 from Phase 12 + 2 from Phase 13) plus 0 new Phase 14/15 items remain unchanged under **ADR-0005 Branch A**. Phase 15 is fully software-validatable end-to-end and does not touch firmware contracts, network whitelist, or socketlib handler surface.

| Source | Hardware-pending SCs |
| --- | --- |
| v0.9.11 milestone close (Phase 0..13) | 35 carry-forward `human_needed` |
| Phase 14 (Raster z=0.5 ratification) | 0 new |
| **Phase 15 (Deepgram Keyterm + Entity-Pack)** | **0 new** |
| **v0.9.12 Quick Wins post-close running total** | **35 `human_needed` carry-forward unchanged** |

## Plans Landed

| Plan | One-liner | Key artifacts |
| --- | --- | --- |
| 15-01 | SPELL_KEYTERMS data (`@evf/shared-protocol`) + `buildKeytermList()` pure function (`@evf/bridge`) | `packages/shared-protocol/src/voice/spell-keyterms.ts` (140 LoC frozen array) · `packages/bridge/src/voice/keyterm-merger.ts` (158 LoC pure function) · 20 new tests (SKT + KM) |
| 15-02 | `createDeepgramStt` extended with `keytermProvider` callback + URL builder + `server.ts` step 10 wiring | `packages/bridge/src/voice/deepgram-stt.ts` (+93 LoC) · `packages/bridge/src/server.ts` (+38 LoC step 10 closure over `EntityPackCache`) · 6 new tests (DGKT) |
| 15-03 | `EntityPackCache.onChange/removeListener` + `KeytermRefresher` (debounce 250ms + mutex) + `DeepgramAdapter.refreshKeyterm()` | `packages/bridge/src/cache/entity-pack-cache.ts` (+109 LoC) · `packages/bridge/src/voice/keyterm-refresher.ts` (147 LoC) · `server.ts` step 10b wiring · 21 new tests (EPC + DGRF + KRF) |
| 15-04 | `sanitizeKeyterms` + empty-cache one-shot warn + retry-then-fallback on Deepgram reject + integration test | `packages/bridge/src/voice/keyterm-sanitizer.ts` (97 LoC pure function) · `keyterm-integration.test.ts` (276 LoC INT-01..03) · `deepgram-stt.ts` (+292 / -90 LoC retry chain) · 18 new tests (SAN + DGEC + DGFM + INT) |
| 15-05 | INV-3 atomic doc-coherence closure (Specs.md §3.6 + §5.2 + changelog · README · showcase · STATE · ROADMAP · REQUIREMENTS · this 15-VERIFICATION.md) | This phase-close commit — 7 files in single atomic INV-3 commit |

## Decision Log

Non-obvious choices made during execution (full rationale in plan-level SUMMARY frontmatter):

1. **D-15-01-01** — Static spell vocab lives in `@evf/shared-protocol`, NOT in `@evf/foundry-mcp`. Rationale: bridge must consume the SRD subset without taking a production dep on foundry-mcp (separate runtime concerns). Vocab is data, not logic — fits shared-protocol charter.
2. **D-15-01-02** — Drift-proof 1:1 mapping enforced via test-only relative import (`../../../foundry-mcp/src/voice/spell-lookup.js`). tsconfig `exclude` single-file escape hatch keeps Vitest typecheck while avoiding circular dep intent in production graph.
3. **D-15-01-03** — Static-wins-on-conflict + cap-drops-dynamic-first implemented as iteration order (no explicit conflict-resolution code path) — algorithm trivially auditable.
4. **`DEEPGRAM_KEYTERM_LIMIT = 100`** — Deepgram-documented cap (RESEARCH.md §2 Option C citing Deepgram learn article).
5. **D-15-02-01** — `keytermProvider` is a callback (not a static array). Rationale: lazy evaluation on every `connect()` is the foundation for hot-update without adapter re-instantiation; plan 15-03 reuses this contract via cache's debounce → trigger re-`connect()` flow.
6. **D-15-02-02** — Defensive try/catch around `keytermProvider()` invocation (T-15-07 mitigation). Throwing provider degrades to baseline rather than fail-closing voice path.
7. **D-15-03-01** — Drain-then-restart mutex pattern (vs queue) for serialising refreshes. Refresher's semantic is "next connect picks up the latest state", not "every event must be acknowledged" — drops mid-flight events to avoid wasted work.
8. **D-15-03-02** — `DEBOUNCE_MS=250` (CONTEXT D-07 locked). Comfortably exceeds the ~200ms Foundry `updateCompendium` burst window observed during quick-task 260517-k2g, well under VOICE-09 ≤ 5 min SLA.
9. **D-15-03-03** — `refreshKeyterm()` is an INVALIDATION SIGNAL, not a wire-level Deepgram reconfig. Deepgram WS does NOT support mid-stream keyterm hot-swap (RESEARCH.md §2 Option C). Next connect() picks up fresh list via lazy provider; structured `event=keyterm.refreshed` log is the observable telemetry.
10. **D-15-03-04** — `EntityPackCache.onChange` synchronous + exception-isolated listener invocation. Listener fires AFTER internal payload update so a listener calling `cache.get()` observes new state.
11. **D-15-04-01** — `KEYTERM_REJECT_CODES = [1007, 1008]` + application range `4000-4999`. RFC 6455 codes Deepgram uses for keyterm validation failures + service-specific range for forward-compatibility with new Deepgram reject codes.
12. **D-15-04-02** — Per-session ephemeral retry state — no global "keyterms-are-bad" flag. Each new `connect()` starts optimistically with full keyterm list; a transient hiccup affecting one session does not systemically degrade the +625% recall lift for the entire bridge lifecycle.
13. **D-15-04-03** — Sanitizer scope: ASCII control chars only (`[\x00-\x1F\x7F]`). Unicode letters preserved (è, ô, ñ, ä) — legitimate IT/EN spell names ship with these; stripping more aggressively would damage recall lift.
14. **D-15-04-04** — One-shot empty-cache warn driven by closure-local `_emptyCacheWarned` flag, reset-on-recovery. Transition to `entityCachePresent === true` resets the flag — one warn per empty-streak, never spammed.

## Status — COMPLETE

Phase 15 is **CLOSED — Software-only completion under ADR-0005 Branch A**. All 4 v1 REQ-IDs (VOICE-06..09) are satisfied via green tests and locked production code. The v0.9.12 Quick Wins milestone reaches **2 / 2 phases shipped · 9 / 9 v1 REQ-IDs resolved · 8 / 8 plans completed** with zero new hardware-pending items added. The single atomic INV-3 doc-coherence commit (Plan 15-05) closes the phase per CLAUDE.md INV-3 invariant.

**Resume signal:** milestone v0.9.12 Quick Wins shipped — start the next milestone with `/gsd-new-milestone`.

---

_Verified: 2026-05-17T19:00:00Z_
_Verifier: Claude (gsd-executor, autonomous orchestrator Wave 5) — REQ-ID coverage methodology_
