---
phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui
plan: 04
subsystem: g2-app
tags:
  - g2-app
  - engine
  - boot-error
  - dispatch
  - i18n
  - inv-1
  - fixtures
  - wave-2
  - boot-01
  - canonical-types
  - rethrow-w3

# Dependency graph
requires:
  - phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui (Plan 01, Wave 0)
    provides: |
      HUD_WIDTH_BUDGETS.boot_error_* keys (17 entries — 5 title + 10 hint + 1 close
      + extras) READ-ONLY consumed by BOOT_ERROR_CONTENT cross-consistency tests;
      Layer interface from layer-types.ts + LayerManagerError class for dispatch
      discrimination.
  - phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui (Plan 02, Wave 1)
    provides: |
      Stable _bootEngineCore + BootEngineOpts + TestingDependencies +
      BootEngineHandle export shape from packages/g2-app/src/internal/boot-engine-core.ts
      (canonical names verified verbatim — B-1 regression guard).
  - phase: 04a-g2-engine-raster-status-hud
    provides: |
      HandshakeError class with .code discriminator ('parse_failed' |
      'schema_failed' | 'timeout' | 'transport_error'); matchAsciiFixture +
      AsciiGrid; ZIndex enum (z=1 slot now occupied by BootErrorLayer on
      failure path instead of StatusHudLayer).

provides:
  - BootErrorState union (5 literal states locked by CONTEXT §Area 6)
  - BootErrorLocale union ('it' | 'en' | 'de')
  - BootErrorContent interface (title + 2 hints + closeAnnotation)
  - BOOT_ERROR_CONTENT readonly 5 × 3 × 4 = 60-cell static lookup table
  - bootErrorFromException(err: unknown) → BootErrorState pure dispatch function
  - BootErrorLayer class (implements Layer; z=1; single text container; Strategy A)
  - BOOT_ERROR_CONTAINER_NAME const literal ('boot-error-block')
  - bootEngineWithErrorUi(opts, deps?) wrapper — try/catch around _bootEngineCore
    with best-effort BootErrorLayer.draw() + W-3 RETHROW
  - 10 INV-1 fixtures (5 states × IT/EN) — char-perfect 96×24 ASCII

affects:
  - 04b-05-PLAN (death-saves + conc-modal) — Plan 05 integration smoke
    optionally exercises bootEngineWithErrorUi happy path; Plan 04 is
    INDEPENDENT of Plan 05.
  - phase 06 ([X] close gesture wiring) — TODO(ADR-0009) anchored at
    `boot-error-layer.ts` next to the closeAnnotation render. Phase 6 wires
    R1 tap → bootEngine.retry() through PanelGestureBus.
  - phase 06 (Quick Action retry) — bootEngineWithErrorUi rethrow contract
    means Phase 6's retry handler observes the original HandshakeError /
    LayerManagerError directly and can route on `err.code` for tailored
    retry logic (e.g., HandshakeError('transport_error') → reconnect WS
    only; HandshakeError('schema_failed') → notify ops + force re-pair).

# Tech tracking
tech-stack:
  added: []  # No new deps; uses only EvenAppBridge + TextContainerUpgrade from SDK
  patterns:
    - "Option B panel-frame composition — BootErrorLayer.draw() builds the FULL
      8-row panel content (top border `┌──...──┐` + 6 inner `│ ... │` rows +
      bottom border `└──...──┘`) INSIDE the single 'boot-error-block' text
      container. Alternative Option A (frame owned by page schema in
      createBootPage()) would have required modifying boot-engine-core.ts /
      page-lifecycle.ts and broken Wave-2 zero-overlap with Plan 02. Option B
      keeps the panel self-contained in this single layer."
    - "W-3 RETHROW pattern — bootEngineWithErrorUi rethrows the ORIGINAL cause
      after best-effort BootErrorLayer.draw(). No degenerate BootEngineHandle
      construction (avoids type-mismatch on .rasterController required field),
      no @ts-expect-error casts (clean strict-mode compilation), preserves the
      original exception for Phase 6 retry observability. Verified via 5×
      `await expect(bootPromise).rejects.toThrow(...)` assertions in
      BOOT-ERR-INT-01..07."
    - "Inner try/catch best-effort render — the wrapper's catch block contains
      a NESTED try/catch around bridge acquisition + layer.draw(). Render
      failures (T-4b-04-06 double-failure) fall through to console.error +
      original-cause rethrow. The render error is an availability incident
      whose surface is telemetry-only; the awaiter sees the original cause."
    - "Catch-all fallback dispatch (T-4b-04-01) — bootErrorFromException
      returns 'handshake_failed' for any unrecognised exception shape and
      logs `console.warn` for telemetry. Rationale: handshake_failed has a
      complete translation table for all 3 locales and a generic recovery
      hint ('Verifica versione del modulo') that is always actionable —
      least-informative-but-always-renderable."
    - "B-1 regression-class prevention — Plan 04 imports CANONICAL type
      names verbatim (BootEngineOpts + TestingDependencies + BootEngineHandle).
      An earlier draft of the plan used invented names (BootEngineOptions /
      BootEngineDeps) — the grep gate
      `! grep -E 'BootEngineOptions|BootEngineDeps' …` on every Plan-04 file
      proves the regression is gone."
    - "Full-page composition via buildBootErrorPage helper (mirrors Plan 03's
      buildToastScenePage) — INV-1 fixture comparison composes the canonical
      96×24 empty page (outer ╔══╗ + ║ ... ║ + ╚══╝ frame) and overlays the
      8-row BootErrorLayer panel at rows 10..17 cols 19..78. The fixture is
      the FULL page; the test composes the same full page from the layer's
      output for matchAsciiFixture parity."
    - "TestingDependencies-based error injection (alternative to vi.doMock)
      — every Plan 04 error source is reachable through the existing
      bridgeFactory + wsFactory DI surface: bridgeFactory rejection drives
      transport_error / proto_chosen patterns; wsFactory returns a mock socket
      whose `fireError()` drives 'WebSocket error before open' rejection
      (BOOT-ERR-INT-04); `fireMessage('{badJSON}')` drives schema_failed
      (BOOT-ERR-INT-02); silence drives timeout (BOOT-ERR-INT-03). No
      module-level mock leakage across tests."

key-files:
  created:
    - packages/g2-app/src/engine/boot-error-types.ts
    - packages/g2-app/src/engine/boot-error-dispatch.ts
    - packages/g2-app/src/engine/boot-error-layer.ts
    - packages/g2-app/src/engine/boot-engine-error-wrapper.ts
    - packages/g2-app/src/engine/__tests__/boot-error-types.test.ts
    - packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts
    - packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts
    - packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts
    - packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt
    - packages/shared-render/src/fixtures/boot-error.handshake-failed.en.txt
    - packages/shared-render/src/fixtures/boot-error.version-mismatch.it.txt
    - packages/shared-render/src/fixtures/boot-error.version-mismatch.en.txt
    - packages/shared-render/src/fixtures/boot-error.no-character.it.txt
    - packages/shared-render/src/fixtures/boot-error.no-character.en.txt
    - packages/shared-render/src/fixtures/boot-error.bridge-unreachable.it.txt
    - packages/shared-render/src/fixtures/boot-error.bridge-unreachable.en.txt
    - packages/shared-render/src/fixtures/boot-error.token-expired.it.txt
    - packages/shared-render/src/fixtures/boot-error.token-expired.en.txt
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-04-SUMMARY.md
  modified: []  # i18n-budgets.ts (Plan 01 domain) and boot-engine-core.ts (Plan 02 domain) intentionally UNTOUCHED

key-decisions:
  - "Option B panel-frame composition: BootErrorLayer ships the panel frame
    chars (`┌──...──┐`, `│ … │`, `└──...──┘`) INSIDE its single
    'boot-error-block' text container. Locked at planning + ratified at
    implementation — eliminates Wave-2 file-overlap with Plan 02
    (boot-engine-core.ts) and page schema files. The fixture INV-1 contract
    holds because the fixture is the FULL page and the layer test composes
    the SAME panel chars."
  - "W-3 RETHROW lock: bootEngineWithErrorUi rethrows the ORIGINAL cause.
    Two rejected alternatives — (1) modify boot-engine-core.ts to allow
    optional rasterController on BootEngineHandle (conflicts with Plan 02);
    (2) use @ts-expect-error casts (forbidden by strict mode + INV-4) — were
    both unsatisfactory. The rethrow pattern is structurally clean, observable
    by Phase 6 retry, and renders the error UI as a visible side effect
    before the rejection surfaces. Verified by 6× `rejects.toThrow(...)` +
    1× double-failure rejection (BOOT-ERR-INT-07 — original cause, not
    render error)."
  - "B-1 canonical type names — Plan 04 imports `BootEngineOpts` +
    `TestingDependencies` + `BootEngineHandle` VERBATIM. The pre-iteration
    draft used `BootEngineOptions` + `BootEngineDeps` which DO NOT EXIST in
    boot-engine-core.ts; the grep gate
    `! grep -E 'BootEngineOptions|BootEngineDeps' boot-error-*.ts
    boot-engine-error-wrapper.ts boot-error-*.test.ts` passes (no matches)
    on all 8 Plan-04 source/test files."
  - "TestingDependencies error injection chosen over vi.doMock: the planner
    suggested vi.doMock for handshake error injection but the existing DI
    surface is sufficient (bridgeFactory rejection + wsFactory mock socket
    events). vi.doMock can leak across tests in the same file; using DI
    keeps every BOOT-ERR-INT-* test hermetic. The choice is documented in
    boot-engine-error-wrapper.test.ts module JSDoc."
  - "Catch-all default state = 'handshake_failed': bootErrorFromException
    returns this state for any unrecognised exception shape (T-4b-04-01
    mitigation). Rationale: handshake_failed has a complete IT/EN/DE
    translation in BOOT_ERROR_CONTENT + a generic actionable recovery hint
    ('Verifica versione del modulo' / 'Check module version'). The
    `console.warn` telemetry surfaces the unknown shape for development
    debugging without throwing. BED-12/13/14 cover all three branches."
  - "Phase 6 close gesture is TODO(ADR-0009) — Plan 04 ships the `[X] Close`
    annotation as a visual cue only. The TODO comment lives in
    boot-error-layer.ts near the closeAnnotation render path. Phase 6 wires
    R1 tap gesture → PanelGestureBus → bootEngine.retry() per UI-SPEC §9.3."
  - "Bridge acquisition for the error render path uses a TWO-TIER fallback:
    test deps.bridgeFactory first (preserves DI for unit tests), else a
    dynamic-import of `waitForEvenAppBridge` from
    `@evenrealities/even_hub_sdk`. The dynamic import keeps the wrapper's
    static surface disjoint from the SDK type tree — wrapper.draw() does
    not need to mock the SDK for the happy path of BOOT-ERR-INT-06."

patterns-established:
  - "BootError dispatch function pattern — pure side-effect-free function with
    instanceof + .code discrimination first, substring matching on .message
    second, catch-all default last. Single console.warn at the catch-all
    branch is the only telemetry surface (no throws inside the dispatch)."
  - "Boot-failure-layer composition pattern — Layer class that mounts at z=1
    OUTSIDE the LayerManager.bundle() capture invariant. Single text container
    with all panel frame chars in the content payload (Option B). No
    getCaptureContainer method (returns undefined by absence). draw() calls
    bridge.textContainerUpgrade directly and propagates rejection upward;
    wrapper's outer catch is responsible for telemetry."
  - "TestingDependencies-driven error injection — every reachable exception
    source from boot-engine-core.ts is reproducible via DI factories without
    module-level vi.doMock. Pattern is hermetic across tests and avoids the
    `vi.doMock` import-hoisting cliff that hits when a test file imports a
    mocked module before the doMock call."
  - "Plan 04 file-disjointness pattern (Wave-2 safety) — when a new wrapper
    function naturally belongs alongside an upstream module modified in an
    earlier wave, place the wrapper in a SEPARATE new file (here:
    boot-engine-error-wrapper.ts next to boot-engine-core.ts) rather than
    extending the upstream module. The wrapper imports verbatim and depends_on
    documents the chain. This generalises beyond Plan 04 — Plan 05 conc-modal
    + death-saves panels follow the same pattern relative to Plan 04 outputs."

requirements-completed: [BOOT-01]
# BOOT-01 software-side closed by Plan 04:
#   * 5 distinct boot error states (handshake_failed | version_mismatch |
#     no_character | bridge_unreachable | token_expired)
#   * Each state ships title + 2 recovery hints + [X] Close annotation
#     in 3 locales (IT/EN canonical + DE best-effort)
#   * Dispatch from every reachable exception source verified
#     (BED-01..BED-14 + BOOT-ERR-INT-01..07)
#   * 10 INV-1 character-perfect ASCII fixtures landed
# Hardware verification deferred to ADR-0005 Branch A human_needed gate
# (boot-error rendering on real G2 with simulated bridge disconnect).

# Metrics
duration: 16 min
completed: 2026-05-15
---

# Phase 4b Plan 04: Boot Error UI + Dispatch + 10 INV-1 Fixtures Summary

One-liner: Boot-error UI single-layer rendering with 5-state enum,
exception-source dispatch, BootEngineHandle-preserving wrapper that RETHROWS,
and 10 character-perfect IT/EN ASCII fixtures — closing BOOT-01 software-side.

## Self-Check: PASSED

Each verification item below was confirmed at commit time.

### Files created (verified present)
- `packages/g2-app/src/engine/boot-error-types.ts` — present (BootErrorState
  union + BOOT_ERROR_CONTENT 5×3×4 = 60-cell table verbatim from UI-SPEC §3.3)
- `packages/g2-app/src/engine/boot-error-dispatch.ts` — present
  (bootErrorFromException pure dispatch per RESEARCH §Q3 source map)
- `packages/g2-app/src/engine/boot-error-layer.ts` — present (BootErrorLayer
  implements Layer; Option B panel-frame inside container; Strategy A
  getContainerCount { image:0, text:1 }; BOOT_ERROR_CONTAINER_NAME const)
- `packages/g2-app/src/engine/boot-engine-error-wrapper.ts` — present
  (bootEngineWithErrorUi wrapper; W-3 RETHROW lock; T-4b-04-06 double-failure
  mitigation via inner try/catch around BootErrorLayer.draw)
- `packages/g2-app/src/engine/__tests__/boot-error-types.test.ts` — present
  (9 BET tests — spot checks + parametric coverage + width budgets +
  HUD_WIDTH_BUDGETS cross-consistency + readonly enforcement)
- `packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts` — present
  (14 BED tests — HandshakeError discrimination + LayerManagerError coalesce
  + substring patterns + catch-all telemetry)
- `packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts` — present
  (8 unit + 10 fixture parametric = 17 BEL tests — id + no-capture + container
  count + single-flush draw + locale resolution + destroy idempotency +
  INV-1 fixture parity for all 5 states × IT/EN)
- `packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts`
  — present (7 BOOT-ERR-INT-01..07 integration tests — 5 distinct error
  sources + happy path + double-failure)
- `packages/shared-render/src/fixtures/boot-error.{state}.{it,en}.txt`
  × 10 — present, 24 rows × 96 chars uniformly (JS code-point verified)

### Commits (verified in git log)
- `c8edfc0` — Task 1: feat(g2-app): boot-error-types + BOOT_ERROR_CONTENT
- `c24f00d` — Task 2: feat(g2-app): BootErrorLayer + dispatch + 10 INV-1 fixtures
- `0d0608b` — Task 3: feat(g2-app): bootEngineWithErrorUi wrapper with W-3 rethrow lock

## Final BootErrorState enum + BOOT_ERROR_CONTENT table (5 × 3 = 15 entries)

```ts
type BootErrorState =
  | 'handshake_failed'    // Bridge response invalid / schema_failed / timeout
  | 'version_mismatch'    // proto_chosen substring in error message
  | 'no_character'        // "no actor" / "no character" substring (case-insensitive)
  | 'bridge_unreachable'  // HandshakeError('transport_error') / WS 1006 / WS error before open / bridgeFactory
  | 'token_expired';      // 401 / 403 / "TokenExpired" substring
```

Each of the 5 states populated for all 3 locales (it/en/de) — DE entries land
even though DE fixtures are deferred per UI-SPEC §9.5 (best-effort policy
ratified by RESEARCH §Q6 Assumption A6). Titles ≤ 24 chars, hint lines ≤ 50
chars, close annotation ≤ 14 chars — verified by BET-05/06/07 parametric loops.

## Test counts (all green)

| Suite | File | Test count |
|-------|------|-----------:|
| BET-01..BET-09 | `boot-error-types.test.ts` | 9 |
| BED-01..BED-14 | `boot-error-dispatch.test.ts` | 14 |
| BEL-01..BEL-07 unit | `boot-error-layer.test.ts` | 7 |
| BEL-08 parametric INV-1 fixture | `boot-error-layer.test.ts` | 10 |
| BOOT-ERR-INT-01..07 integration | `boot-engine-error-wrapper.test.ts` | 7 |
| **TOTAL Plan 04** | | **47** |

Full workspace suite: **741 tests pass across 54 test files** (no regressions
in any prior plan's tests).

## 10 fixture file paths

| # | Path | State | Locale |
|--:|------|-------|--------|
| 1 | `packages/shared-render/src/fixtures/boot-error.handshake-failed.it.txt` | handshake_failed | it |
| 2 | `packages/shared-render/src/fixtures/boot-error.handshake-failed.en.txt` | handshake_failed | en |
| 3 | `packages/shared-render/src/fixtures/boot-error.version-mismatch.it.txt` | version_mismatch | it |
| 4 | `packages/shared-render/src/fixtures/boot-error.version-mismatch.en.txt` | version_mismatch | en |
| 5 | `packages/shared-render/src/fixtures/boot-error.no-character.it.txt` | no_character | it |
| 6 | `packages/shared-render/src/fixtures/boot-error.no-character.en.txt` | no_character | en |
| 7 | `packages/shared-render/src/fixtures/boot-error.bridge-unreachable.it.txt` | bridge_unreachable | it |
| 8 | `packages/shared-render/src/fixtures/boot-error.bridge-unreachable.en.txt` | bridge_unreachable | en |
| 9 | `packages/shared-render/src/fixtures/boot-error.token-expired.it.txt` | token_expired | it |
| 10 | `packages/shared-render/src/fixtures/boot-error.token-expired.en.txt` | token_expired | en |

All 10 fixtures are 24 rows × 96 chars uniformly (Node code-point count
verified; awk byte count = 96 + non-ASCII margin, which matches expectation
since `╔═┌│└╝═┐│┘` are multi-byte UTF-8 chars but single code-points).

## Decisions ratified

1. **Option B panel-frame composition** — locked: panel borders (`┌──┐`,
   `│ … │`, `└──┘`) live INSIDE BootErrorLayer's `'boot-error-block'`
   container content. Eliminates Wave-2 file-overlap with Plan 02
   (boot-engine-core.ts is UNCHANGED).

2. **W-3 RETHROW** — locked: bootEngineWithErrorUi rethrows the ORIGINAL
   cause after best-effort BootErrorLayer.draw(). Verified by 6×
   `await expect(bootPromise).rejects.toThrow(...)` in BOOT-ERR-INT-01..05 +
   1× double-failure test (BOOT-ERR-INT-07 verifies original cause is
   rethrown, NOT the render-failure error).

3. **B-1 canonical type names** — confirmed: every Plan 04 import uses
   `BootEngineOpts` + `TestingDependencies` + `BootEngineHandle` verbatim.
   The grep gate
   `! grep -E 'BootEngineOptions|BootEngineDeps' packages/g2-app/src/engine/boot-error-*.ts packages/g2-app/src/engine/__tests__/boot-error-*.test.ts packages/g2-app/src/engine/boot-engine-error-wrapper*.ts`
   PASSES on all 8 Plan-04 source/test files (no matches).

4. **vi.doMock NOT used** — the existing `TestingDependencies` DI surface
   (bridgeFactory + wsFactory) is sufficient to reach EVERY error source
   (transport_error via bridgeFactory rejection; schema_failed via mock
   socket message; timeout via silent mock socket; WS error before open
   via mock socket `fireError`; proto_chosen mismatch via plain Error
   rejected from bridgeFactory). vi.doMock would have introduced
   module-level mock leakage across tests; DI is hermetic.

5. **Catch-all dispatch default = `'handshake_failed'`** — least-informative-
   but-always-renderable. Every locale has a complete BOOT_ERROR_CONTENT
   entry for this state; the generic recovery hint
   ('Verifica versione del modulo' / 'Check module version' /
   'Modulversion prüfen') is always actionable. `console.warn` surfaces the
   unknown shape for development debugging. Covered by BED-12 (`undefined`),
   BED-13 (empty object), BED-14 (unrelated Error message).

6. **Phase 6 close-gesture wiring** — `[X] Close` annotation is rendered as
   a visual cue only. The `TODO(ADR-0009)` comment in boot-error-layer.ts
   anchors the Phase 6 task: wire R1 tap → PanelGestureBus → `bootEngine.retry()`
   per UI-SPEC §9.3. Plan 04 does NOT ship any gesture handler.

7. **boot-engine-error-wrapper.ts lives in `packages/g2-app/src/engine/`**
   (NEW FILE — NOT `internal/`). Rationale: the wrapper is a public surface
   for Phase 6 retry consumers, NOT an internal-only test-DI helper like
   `_bootEngineCore`. The public ergonomics are preserved (no
   `index.test-support` re-export needed).

## Wave-2 parallelism confirmation

- `boot-engine-core.ts` UNMODIFIED — Plan 02's domain. The new wrapper imports
  `_bootEngineCore`, `BootEngineOpts`, `TestingDependencies`, `BootEngineHandle`
  from this file but does not touch it.
- `i18n-budgets.ts` UNMODIFIED — Plan 01's domain. The cross-consistency test
  (BET-08) is READ-ONLY against `HUD_WIDTH_BUDGETS.boot_error_*`.
- `files_modified` of Plan 04 ∩ `files_modified` of Plan 03 = ∅ (Plan 03 owns
  toast-* + 3 toast fixtures; Plan 04 owns boot-error-* + 10 boot-error
  fixtures + boot-engine-error-wrapper*).
- `files_modified` of Plan 04 ∩ `files_modified` of Plan 06 = ∅ (Plan 06 owns
  shared-protocol/character + concentration + foundry-module reader).

## Known stubs

None — every public surface is wired:

- BOOT_ERROR_CONTENT: 5×3×4 = 60 cells all populated with verbatim strings.
- bootErrorFromException: all 5 enum states reachable from production
  exception sources (verified BED-01..BED-14 + BOOT-ERR-INT-01..05).
- BootErrorLayer.draw: invoked end-to-end by bootEngineWithErrorUi on every
  error path (verified BOOT-ERR-INT-01..05).
- All 10 fixtures matched by BEL-08 parametric tests.

The `[X] Close` gesture is annotated as a visual cue and marked with
`TODO(ADR-0009)` for Phase 6 — not a stub but a phased-handoff hook.

## Deviations from Plan

None. The plan executed exactly as written, including:

- All 3 tasks completed in order with atomic commits.
- B-1 grep gate enforced (no `BootEngineOptions` / `BootEngineDeps` strings
  introduced).
- W-3 lock implemented as specified (rethrow, no degenerate handle).
- 10 fixtures verbatim from UI-SPEC §5.1-§5.10 (extracted by `sed` and
  verified 24×96 character-perfect).
- vi.doMock NOT used; TestingDependencies DI used instead (documented choice
  in test file JSDoc per plan caveat).

The only minor implementation choices NOT prescribed verbatim by the plan:

- The wrapper acquires the bridge for the error-render path via a dynamic
  import of `@evenrealities/even_hub_sdk` (`waitForEvenAppBridge`) when
  `deps?.bridgeFactory` is absent. The plan suggested `EvenAppBridge.getInstance()`
  but the SDK exports `waitForEvenAppBridge()` as the singleton accessor —
  the implementation followed the actual SDK shape.
- The `MockWorker` reference is intentionally NOT stored in the wrapper test
  file (unlike scene-renderer-smoke.test.ts which stores it for terminate-spy
  assertions); the integration tests don't assert on worker internals, so
  the unused variable was removed to satisfy strict `noUnusedLocals`.

## 5 manual-only stress cases (ST-5 hardware verification)

Software-side coverage is complete; the following stress cases are gated
on ADR-0005 Branch A human_needed hardware access:

1. **Real G2 bridge disconnect mid-handshake** — verify HandshakeError('timeout')
   surfaces the actual BootErrorLayer panel on the device, not just in tests.
2. **Bridge serving proto_chosen=evf-v0** — observe `VERSION MISMATCH`
   panel render on G2 + verify [X] Close annotation aligns within
   character-perfect column bounds.
3. **24h token natural expiry** — let an established bearer token age out
   organically and observe `TOKEN EXPIRED` panel on G2 (vs the bridge's
   artificial `401` rejection in unit tests).
4. **No PC assigned in Foundry** — boot with an empty Foundry actor sheet
   on the GM side and observe `NESSUN PERSONAGGIO` / `NO CHARACTER` panel
   matches the fixture row-for-row.
5. **Bridge URL DNS unreachable** — pass an invalid `bridgeUrl` (e.g.,
   `wss://nonexistent.localdomain:8910`) and observe `BRIDGE UNREACHABLE`
   panel — this hits the WS error path that BOOT-ERR-INT-04 simulates.

## B-1 / W-3 regression guards (CI-style)

Add to `.github/workflows/ci.yml` future hardening (NOT shipped in Plan 04,
per CONTEXT.md §Area 9 future-work):

```bash
# B-1: canonical type names
! grep -E "BootEngineOptions|BootEngineDeps" \
  packages/g2-app/src/engine/boot-error-*.ts \
  packages/g2-app/src/engine/__tests__/boot-error-*.test.ts \
  packages/g2-app/src/engine/boot-engine-error-wrapper*.ts

# W-3: integration tests use rejects.toThrow (not resolved-degenerate-handle)
grep -c 'rejects.toThrow' \
  packages/g2-app/src/engine/__tests__/boot-engine-error-wrapper.test.ts \
  | xargs -I{} test {} -ge 5
```

These greps are passing today; the CI hardening makes them load-bearing for
future PRs.
