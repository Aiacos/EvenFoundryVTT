---
phase: 15-deepgram-keyterm-prompting-entity-pack-integration
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/shared-protocol/src/voice/spell-keyterms.ts
  - packages/shared-protocol/src/voice/spell-keyterms.test.ts
  - packages/shared-protocol/src/index.ts
  - packages/bridge/src/voice/keyterm-merger.ts
  - packages/bridge/src/voice/keyterm-merger.test.ts
  - packages/bridge/src/voice/keyterm-refresher.ts
  - packages/bridge/src/voice/keyterm-refresher.test.ts
  - packages/bridge/src/voice/keyterm-sanitizer.ts
  - packages/bridge/src/voice/keyterm-sanitizer.test.ts
  - packages/bridge/src/voice/keyterm-integration.test.ts
  - packages/bridge/src/voice/deepgram-stt.ts
  - packages/bridge/src/voice/deepgram-stt.test.ts
  - packages/bridge/src/cache/entity-pack-cache.ts
  - packages/bridge/src/cache/entity-pack-cache.test.ts
  - packages/bridge/src/server.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-17
**Depth:** standard (per-file TypeScript-aware analysis)
**Files Reviewed:** 15 (production + test files in Phase 15 scope)
**Status:** issues_found (no Critical/blocker defects; 7 Warnings + 6 Info)

## Summary

Phase 15 (Deepgram Keyterm Prompting + Entity-Pack Integration) introduces ~660 LoC of production code (merger + refresher + sanitizer + adapter retry chain + cache subscription) and ~65 new tests. The implementation is well-structured, defensively coded against most failure modes (T-15-05/07/11/13/14 mitigations are real and verifiable), and the security-relevant T-15-05 URL-injection surface is handled correctly via `encodeURIComponent` (DGKT-02). No Critical issues.

Findings cluster around three themes:

1. **Test gaps masking real-world failure modes** — the retry path's audio-loss window, error-event-without-close paths, and disabled-adapter log spam are not exercised by tests. Production code mostly defends against them, but absent coverage means future regressions go undetected.
2. **Resolution-logic duplication** — `resolveKeyterms()` (per-connect path) and the inline branch inside `refreshKeyterm()` independently normalise the `string[] | KeytermProviderResult` discriminated union. Any future shape change must update both paths.
3. **Spurious log noise / leaky subscriptions in non-production paths** — `KeytermRefresher` is wired unconditionally even when `DEEPGRAM_API_KEY` is absent (adapter disabled), producing periodic `keyterm.refreshed` info logs. The bridge has no graceful shutdown so `dispose()` is never called outside tests.

INV-4 dead-code/JSDoc/strict-mode compliance is excellent across all production files. Threat-model dispositions documented in the SUMMARY rolled up against actual code consistently.

## Warnings

### WR-01: Audio frames sent during retry-window go to closed WebSocket

**File:** `packages/bridge/src/voice/deepgram-stt.ts:574-581`
**Issue:** When Deepgram closes a session with a keyterm-reject code (1007/1008/4xxx), `_attemptConnect()` is called synchronously inside the close handler. Between the old WS firing 'close' and the new WS being constructed by `wsFactory(...)`, any `sendAudio(frame)` call routes to the OLD `liveWs` (the just-closed instance) because the reassignment `liveWs = ws` happens inside `_attemptConnect`. In practice the synchronous retry collapses this window to nanoseconds, but if the close handler is delayed (e.g., logger.warn is async-flushed in some pino backends) or if multiple PCM frames are buffered in the WS message queue, frames are dropped silently. The `try/catch` swallows the resulting send-on-closed exception via `logger.warn` but the user-visible effect is missing transcription input.
**Fix:** Buffer in-flight frames during retry, or close the previous WS explicitly before reassigning. Minimal change:
```ts
// Inside _attemptConnect, BEFORE reassignment:
if (liveWs !== null && attempt !== 'initial') {
  try { liveWs.close(); } catch { /* already closed */ }
}
liveWs = ws;
```
This makes the reassignment race explicit and ensures the old handle is unreachable before audio could route to it.

### WR-02: `error` events without `close` do not trigger retry/fallback

**File:** `packages/bridge/src/voice/deepgram-stt.ts:527-529`
**Issue:** The `ws.on('error', ...)` handler only logs at warn level. It does not invoke `_attemptConnect` for retry. If Deepgram's WS endpoint fails TLS handshake, dies before sending the close frame, or emits an error path that the `ws` package surfaces as 'error' (without a subsequent 'close'), the session is wedged: no transcripts arrive, no retry happens, no fallback to baseline. The voice path silently dies. Production WS implementations typically emit 'close' after every 'error', but this is not guaranteed (network-layer failures may abort the socket without graceful close-frame). DGFM tests only emit 'close' events, never standalone 'error' events.
**Fix:** Either (a) trigger the same retry/fallback ladder from `'error'` if no 'close' arrives within a short timeout, or (b) document that WS error-without-close is treated as session-end and audio simply stops. Add a DGFM-07 test that emits 'error' without 'close' to lock in the chosen behaviour.

### WR-03: KeytermRefresher subscribes even when adapter is disabled — produces spurious info-level logs

**File:** `packages/bridge/src/server.ts:478-483`, `packages/bridge/src/voice/deepgram-stt.ts:455-462`
**Issue:** `buildServer()` instantiates `KeytermRefresher` unconditionally — i.e., even when `DEEPGRAM_API_KEY` is unset and the adapter is in disabled mode. `refreshKeyterm()` on the disabled adapter still emits `logger.info({event:'keyterm.refreshed', ...})` on every debounced cache change. In a development bridge running without a Deepgram key, every Foundry `updateCompendium` burst writes a meaningless `keyterm.refreshed` line at info level. Ops dashboards will show keyterm-refresh activity for a feature that is not running.
**Fix:** Guard either at the refresher (skip subscription when `!deepgramStt.isEnabled()`) or at the adapter (`refreshKeyterm()` is a no-op when `!enabled`). Wire-up location example:
```ts
if (deepgramStt.isEnabled()) {
  const _keytermRefresher = new KeytermRefresher({ cache: entityCache, adapter: deepgramStt, logger: app.log as Logger });
  void _keytermRefresher;
}
```

### WR-04: `KeytermRefresher` is never disposed in production — listener leak per `buildServer()` call

**File:** `packages/bridge/src/server.ts:478-483`
**Issue:** The `_keytermRefresher` reference is held only inside the closure of `buildServer()` and discarded via `void _keytermRefresher;`. There is no graceful-shutdown hook and no way to call `dispose()`. In tests, 67 `buildServer()` invocations each create a new EntityPackCache + KeytermRefresher. The cache holds the listener, the refresher holds the cache reference — GC kicks in only once the Fastify app reference is also dropped. Production Docker SIGTERM terminates the process; no leak in production. But the comment in `server.ts:474-477` admits "currently the bridge does not exit gracefully", which is itself a maintainability concern: a future graceful-shutdown PR cannot easily fix this because the refresher reference is not exposed.
**Fix:** Return `_keytermRefresher` (or a top-level disposal handle) from `buildServer()` so tests + future graceful-shutdown code can call `dispose()` deterministically. Minimal contract: extend the Fastify-instance return to include `_evfShutdown: () => void` collecting all subsystem disposals.

### WR-05: Resolution-logic duplication between `resolveKeyterms()` and inline `refreshKeyterm()` branch

**File:** `packages/bridge/src/voice/deepgram-stt.ts:382-416` vs `437-454`
**Issue:** Two independent code paths normalise the `string[] | KeytermProviderResult` discriminated union:
- `resolveKeyterms()` (used by `connect()`) extracts `.keyterms` for the URL build and drives the D-05 one-shot empty-cache warn flag.
- The inline branch inside `refreshKeyterm()` extracts the same `.keyterms.length` for the log payload but deliberately skips the D-05 warn (per the JSDoc rationale).

The duplication is documented in JSDoc but means any future change to `KeytermProviderResult` shape (e.g., adding a `partial: boolean` field, renaming `entityCachePresent`) requires updates in two places. The Phase 15 author was clearly aware of the trade-off (the JSDoc note at lines 432-436 explicitly explains why refreshKeyterm doesn't go through resolveKeyterms). Still — easy regression target.
**Fix:** Extract a `extractCount(raw: string[] | KeytermProviderResult): number` helper used by both paths. Keep D-05 side effects only in `resolveKeyterms()`.

### WR-06: SAN-03 test description claims "U+00A0 NBSP" but only one of three fixtures actually contains NBSP

**File:** `packages/bridge/src/voice/keyterm-sanitizer.test.ts:53-61`
**Issue:** The SAN-03 test asserts that whitespace runs collapse to a single space. The third fixture `'one\xa0two'` is actually a NBSP (U+00A0) per byte inspection — the test name in the comment ("U+00A0 NBSP matches /\s/ in JS regex and collapses to a single space") accurately reflects this. HOWEVER, the JSDoc on `sanitizeKeyterms` claims:
> Step 2: collapse runs of internal whitespace (`/\s+/g`) into a single space. This handles tabs, newlines, no-break spaces (U+00A0)…

In practice, ASCII tabs/newlines/CR are already stripped in Step 1 (`[\x00-\x1F]` covers `\t`, `\n`, `\r`). So Step 2 only matters for non-control whitespace (NBSP, em-space, etc.). The SAN-03 test fixture `'long       sword'` collapses 7 ASCII spaces to 1 — but those ASCII spaces survive Step 1 (space 0x20 is NOT in 0x00-0x1F), so Step 2 IS the operative collapse. The NBSP fixture is the only one that proves the "handles non-control Unicode whitespace" JSDoc claim.

This is a comment/test-coverage hygiene issue, not a logic bug. Test passes; sanitizer is correct.
**Fix:** Either expand the JSDoc comment to clarify Step 1 already handles tabs/CR/LF and Step 2 catches Unicode whitespace categories, or expand SAN-03 to assert one more pure-NBSP case alongside `'one\xa0two'` for explicit coverage of em-space (U+2003), figure-space (U+2007), etc.

### WR-07: Drift gate import path is fragile — silent break on foundry-mcp source layout change

**File:** `packages/shared-protocol/src/voice/spell-keyterms.test.ts:21`
**Issue:** SKT-02 imports `SPELL_LOOKUP` via `'../../../foundry-mcp/src/voice/spell-lookup.js'` — a hard-coded relative path crossing package boundaries. If `packages/foundry-mcp/` is restructured (e.g., src/ moved to source/, or spell-lookup.ts moved into a subdir), the test fails with `Cannot resolve module` rather than a clear "drift gate broken" signal. The drift-gate concept is sound (cross-package test-only import + tsconfig exclude), but the path itself encodes layout assumptions across two packages with no compile-time linker check.
**Fix:** Add a path-existence sanity probe in CI (e.g., `grep -q "SPELL_LOOKUP" packages/foundry-mcp/src/voice/spell-lookup.ts` in `.github/workflows/ci.yml`) so a foundry-mcp move surfaces with an explicit error before the test even runs. Alternatively, codify the cross-package contract via a tiny `@evf/dev-fixtures` package that re-exports SPELL_LOOKUP for test-only consumption.

## Info

### IN-01: `_emptyCacheWarned` flag never resets when keytermProvider transitions from object form back to bare-array form

**File:** `packages/bridge/src/voice/deepgram-stt.ts:370-416`
**Issue:** The closure-local `_emptyCacheWarned` flag is set when `entityCachePresent === false` (richer-object return) and reset when `entityCachePresent === true`. But if the provider is later swapped to return a bare `string[]` (e.g., a test runtime), the flag is neither reset nor consulted. If the provider then returns to the richer object form with `entityCachePresent: false`, the warn would fire only if the flag is still false. Since the bare-array path doesn't touch the flag, this is benign — but the behaviour is silently coupled to caller call-order.
**Fix:** Document the coupling explicitly in JSDoc, or reset the flag when the bare-array path is observed.

### IN-02: `keyterm-merger`'s `tryPush` returns true when skipping (empty/dedupe) but false on cap-hit — inconsistent semantics

**File:** `packages/bridge/src/voice/keyterm-merger.ts:130-139`
**Issue:** `tryPush()`'s boolean return mixes two unrelated semantics: "should the outer loop continue?" (true on skip, true on dedupe, false on cap) and "was the push successful?" (true on actual push, but ALSO true on skip/dedupe). The two outer-loop usage sites (`if (!tryPush(spell.en)) break;`) correctly interpret the return as "stop the outer loop on cap-hit", but the function name implies the boolean reflects the push action's success. A reader has to read the function body to understand the boolean does not indicate "was added".
**Fix:** Rename to `tryPushOrContinue` / `shouldContinue`, or split into two return values (`{ pushed: boolean; capHit: boolean }`).

### IN-03: `keyterm-refresher.ts` `_listener` is bound with unused `_payload` parameter

**File:** `packages/bridge/src/voice/keyterm-refresher.ts:111`
**Issue:** `this._listener = (_payload) => this._onCacheChange();` — the `_payload` parameter is bound but never used. The `EntityPackCacheListener` type passes the new payload, but the refresher doesn't need it (it always re-reads the latest state from the adapter's keytermProvider when refreshKeyterm fires). The `_payload` underscore convention is correct for unused params per Biome rules; harmless. Mention only because future readers may wonder why the payload is bound and ignored.
**Fix:** Add a 1-line comment: `// Payload ignored — provider re-reads cache state lazily on refresh fire.`

### IN-04: `keyterm-sanitizer.ts` JSDoc claims "drop terms shorter than 2 characters" but the implementation drops only the empty/whitespace-after-trim subset that becomes < 2 chars after trim

**File:** `packages/bridge/src/voice/keyterm-sanitizer.ts:79-97`
**Issue:** The algorithm sanitizes `raw → noControls → collapsed → trimmed`, then drops if `trimmed.length < 2`. A raw input of `'a'` becomes `'a'` after the four steps and is dropped. A raw input of `'\t\nA\r'` becomes `'A'` after steps 1-3, length 1, dropped. The JSDoc says "Drop terms shorter than 2 characters after normalisation" which matches. But the bullet point in the module-level JSDoc (line 33-37) says "Single-char terms have near-zero keyterm value — they're either real transcription artefacts (e.g. a stray 'a' from STT) or accidental garbage." This is post-normalisation, not pre-input — correct. No bug; just easy to misread. The SAN-04 test gets this right.

### IN-05: Closure capture of mutable `keyterms` array in retry path

**File:** `packages/bridge/src/voice/deepgram-stt.ts:476, 548`
**Issue:** Inside `connect()`, `const keyterms = resolveKeyterms();` returns a mutable string[] (per `buildKeytermList` KM-10 contract). The retry path's close handler reads `keyterms` by closure reference at `sanitizeKeyterms(keyterms)`. If anything mutates the array between `connect()` invocation and the close event (e.g., a future debug instrumentation that pushes to the merger output), retry will sanitize the mutated form. The merger output is currently treated as private by the adapter, but the contract isn't enforced. Defense-in-depth would be `const keyterms = Object.freeze(resolveKeyterms())` — but KM-10 explicitly asserts the output is mutable (caller may append). Workaround: copy into a frozen local: `const _retryKeyterms = [...resolveKeyterms()];`
**Fix:** Add a snapshot copy at connect-time: `const keytermsSnapshot: ReadonlyArray<string> = [...resolveKeyterms()];` and use that everywhere in the retry chain.

### IN-06: `INT-01` integration test does not assert the empty-cache warn DOES fire on first connect

**File:** `packages/bridge/src/voice/keyterm-integration.test.ts:140-185`
**Issue:** INT-01 establishes `keytermProvider` returning `{ keyterms, entityCachePresent: cache.get() !== null }`. The first `adapter.connect('session-int-1a')` happens with cold cache → `entityCachePresent: false` → should emit one `keyterm.empty-entity-cache` warn. After `cache.set(...)`, the second `connect()` happens with `entityCachePresent: true` → should NOT re-emit. The test inspects `keyterm.refreshed` info logs but never confirms the empty-cache warn fired exactly once. INT-02 covers it explicitly, so this is informational only — INT-01 could be tightened.
**Fix:** Add `expect(countEmptyCacheWarns(logger)).toBe(1)` after the second connect in INT-01.

## Structural Findings (fallow)

No `<structural_findings>` block was provided for this review. Narrative findings stand alone.

---

_Reviewed: 2026-05-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
