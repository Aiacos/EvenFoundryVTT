---
phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui
plan: 03
subsystem: g2-app
tags: [g2-app, status-hud, toast, queue, fifo, squash, zod, inv-1, fixtures, wave-2, dos-mitigation]

# Dependency graph
requires:
  - phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui (Plan 01, Wave 0)
    provides: ZIndex.Z1_5_TOAST = 1.5 (fractional carve-out); Layer.getContainerCount?() Strategy A; LayerManager differential demolish rule (Rule 2 carve-out — z=1.5 survives z=2 mount); HUD_WIDTH_BUDGETS toast_squash_badge_template + toast_row_padding_target (Wave 0 atomic landing — Plan 03 is READ-ONLY consumer); ADR-0009 Amendment 1 ACCEPTED.
  - phase: 04a-g2-engine-raster-status-hud
    provides: Layer interface; bridge.textContainerUpgrade pattern; matchAsciiFixture + AsciiGrid; glyph-scene.raster-idle-it.txt baseline.
provides:
  - ToastQueueLayer class (implements Layer at z=1.5) with FIFO + head-anchored sequential dwell + [+N] squash badge + soft-cap DoS mitigation
  - toast-types module: ToastSchema (Zod strictObject), ToastSeverity union, SEVERITY_PREFIX language-neutral map (Pitfall 6 compliance), 5 runtime constants
  - 3 INV-1 ASCII fixtures (96×24) for toast-queue.single/dual/squashed.it.txt — verbatim from UI-SPEC §5.11/§5.12/§5.13
  - buildToastScenePage helper (composes full-page snapshot from Phase 4a IT baseline + toast overlay)
  - Threat mitigations T-4b-03-01 (safeParse trust boundary), T-4b-03-02 (soft cap 100 buffered + drop-oldest), T-4b-03-03 (destroy-timer leak), T-4b-03-05 (badge display cap 99)
  - SC #3 software-side coverage (Fireball + 8 saves → visible 2 + [+7] badge)
affects:
  - 04b-04-PLAN (boot-error overlay) — toast queue coexists with boot-error layer at z=1; no shared file; runtime composition tested in Plan 05 integration smoke
  - 04b-05-PLAN (conc-modal + death-saves) — Plan 05 integration smoke ratifies z=2 modal mount does NOT demolish the z=1.5 toast queue (ADR-0009 Amendment 1 Rule 2)
  - phase 07+ (reaction passive-notification REACT-01) — reuses ToastQueueLayer.enqueue() with severity='info' once the reaction event pipe lands

# Tech tracking
tech-stack:
  added: []  # No new deps; zod already at workspace root + g2-app/package.json
  patterns:
    - "Head-anchored sequential dwell — only the FIFO head carries an active setTimeout; tail rides the head's dwell window; on expiry the new head schedules a fresh timer. Prevents the simultaneous-expiry artifact when multiple toasts enqueue in the same tick (RESEARCH §Q5 'cycle through over the next ~10.5 seconds')."
    - "Language-neutral severity glyph (Pitfall 6) — 'i: ' / '!: ' / 'x: ' single-char prefixes registered in toast-types.ts SEVERITY_PREFIX const, NOT in HUD_WIDTH_BUDGETS. Identical across IT/EN/DE; avoids fake i18n rows."
    - "Delta short-circuit on identical content — _redrawIfChanged compares the new content string against the stored renderedContent before issuing bridge.textContainerUpgrade. Avoids redundant flushes on no-op redraws."
    - "Soft-cap drop-oldest with telemetry warn — DoS scenario unbounded queue overflow drops the OLDEST queued toast (FIFO from buffer head) + console.warn. Visible toasts are never dropped — they always cycle out via dwell. Two orthogonal cap dimensions: visible (hard cap=2) and buffered (soft cap=100)."
    - "ASCII fixture composition via spliceAt() — testtest-time toast scene built by surgically overwriting map-area cells of a baseline fixture without disturbing the right-side Status HUD region. Pattern reusable by Plan 04 boot-error fixtures + Plan 05 conc-modal."
    - "Microtask drain idiom — `await vi.advanceTimersByTimeAsync(0)` flushes pending Promises (the fire-and-forget redraw queued by enqueue()) without advancing virtual time, so dwell timers stay pending. Documented in test helper `flushMicrotasks()`."

key-files:
  created:
    - packages/g2-app/src/status-hud/toast-types.ts
    - packages/g2-app/src/status-hud/toast-queue-layer.ts
    - packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts
    - packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts
    - packages/shared-render/src/fixtures/toast-queue.single.it.txt
    - packages/shared-render/src/fixtures/toast-queue.dual.it.txt
    - packages/shared-render/src/fixtures/toast-queue.squashed.it.txt
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-03-SUMMARY.md
  modified: []  # i18n-budgets.ts intentionally UNMODIFIED (Plan 01 absorbed all Wave-0 keys)

key-decisions:
  - "Head-anchored sequential dwell timer (vs per-toast timers) — only the FIFO head carries the active 3 s setTimeout. Rationale: simultaneous enqueues (e.g., 9 saves at time 0) must NOT all expire at the same wall-clock tick; sequential cycling gives the user time to read each toast as it enters the head slot. Verified by TQL-FIFO-06 + TQL-FIFO-07."
  - "Single text container ('toast-block') with 2-row newline-separated content — Strategy A from Plan 01 (getContainerCount returns { image: 0, text: 1 }). Matches UI-SPEC §3.2 + RESEARCH §Q5 container slot strategy `[ASSUMED]` row. Container budget audit row 'Idle + 1-2 toasts mounted, no overlay = 12 total at budget' lines up."
  - "Toast helper composes the scene from the Phase 4a IT baseline + spliceAt overlay (NOT a fully programmatic LayerManager render). Rationale: the LayerManager-driven full-page render lives in Plan 05 + Plan 06 integration smoke; for INV-1 character-perfect snapshot in this plan, the static-fixture composition is the simplest correct approach."
  - "TQL-CAP-01 cap-test enqueues 102 toasts at once which triggers the badge display-cap telemetry warn (count > 99) BEFORE the soft-cap warn fires. Test filters for the specific 'soft cap exceeded' message string to disambiguate. This documents that the two telemetry warns are orthogonal."
  - "TQL-FIFO-05 (Fireball + 8 saves stress) lives in the toast-queue-layer.test.ts unit suite — covers the software-side SC #3 assertion (9 toasts → 2 visible + [+7]). The visual ratification via INV-1 fixture lives in toast-snapshot.test.ts TS-INV1-ck12-squashed."

patterns-established:
  - "Layer-class structure for z=1.5+ render-only layers: id readonly, draw() async, destroy() idempotent + clears timers, getContainerCount() returns Plan 01 Strategy A counts, NO getCaptureContainer method (render-only z always above z=0 capture). Follows StatusHudLayer + IdleInfillLayer precedent."
  - "Threat-model JSDoc anchoring: every public method's JSDoc cites the relevant T-id from the plan frontmatter's STRIDE register (e.g., 'T-4b-03-01 mitigation' on enqueue, 'T-4b-03-02 mitigation' on the soft-cap branch). Makes the auditor's review trivially mappable to the register."
  - "INV-1 fixture extraction policy: sed-n from UI-SPEC verbatim section; verify 24 rows × 96 chars uniformly via awk; commit with no modifications. Single source of truth for the character-perfect ASCII contract."

requirements-completed: [TOAST-01]

# Metrics
duration: 50min
completed: 2026-05-15
---

# Phase 4b Plan 03: Toast Queue z=1.5 Summary

**ToastQueueLayer at z=1.5 with FIFO + head-anchored sequential dwell + `[+N]` squash badge + soft-cap DoS mitigation + 3 INV-1 ASCII fixtures closing TOAST-01 + SC #3 (Fireball + 8 saves).**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-15T15:00:00Z
- **Completed:** 2026-05-15T15:29:19Z
- **Tasks:** 2 (executed in order, each committed atomically)
- **Files created:** 7 (+ 1 SUMMARY)
- **Files modified:** 0

## Accomplishments

- Shipped `ToastQueueLayer` (`packages/g2-app/src/status-hud/toast-queue-layer.ts`) — z=1.5 FIFO toast queue with head-anchored 3 s dwell, inline `[+N]` squash badge on the head when `buffered > 0`, hard cap 2 visible / soft cap 100 buffered. The layer implements `Layer` from Plan 01's contract surface and declares `getContainerCount(): { image: 0, text: 1 }` per Strategy A. The single `'toast-block'` text container carries both rows joined by `\n` (matches UI-SPEC §3.2 + RESEARCH §Q5 container slot strategy).
- Shipped `toast-types.ts` (Zod schema + severity union + language-neutral SEVERITY_PREFIX + 5 runtime constants — `TOAST_DWELL_MS=3000`, `TOAST_VISIBLE_CAPACITY=2`, `TOAST_BUFFER_SOFT_CAP=100`, `TOAST_CONTAINER_NAME='toast-block'`, `TOAST_ROW_WIDTH=42`).
- Authored 22 unit tests in `toast-queue-layer.test.ts` covering: 5 schema/constant tests (TT-1..5), 8 FIFO + squash + dwell tests (TQL-FIFO-01..08 including the Fireball+8 saves stress SC #3), 2 safeParse trust boundary tests (TQL-PARSE-01..02), 1 soft-cap DoS mitigation test (TQL-CAP-01), 4 Layer interface contract tests (TQL-LAYER-01..04 — id, no-capture, getContainerCount, destroy timer cleanup), 2 delta short-circuit tests (TQL-DELTA-01..02). All pass.
- Committed 3 INV-1 ASCII fixtures verbatim from UI-SPEC §5.11/§5.12/§5.13: `toast-queue.single.it.txt` / `toast-queue.dual.it.txt` / `toast-queue.squashed.it.txt`. Each fixture is exactly 96 chars wide × 24 rows tall, demolishes the z=0.5 idle infill strips at rows 19-21, and preserves the right-side Status HUD card (cols 68-95) verbatim from `glyph-scene.raster-idle-it.txt`.
- Authored `toast-snapshot.test.ts` (NEW dedicated file — distinct from Phase 4a `snapshot.test.ts` to avoid Wave-2 file-overlap with Plan 04). 3 INV-1 ck 11/ck 12 tests: TS-INV1-ck11-single, TS-INV1-ck11-dual, TS-INV1-ck12-squashed. The `buildToastScenePage(opts)` helper composes the full 96×24 page from the Phase 4a IT baseline + toast-block overlay using a `spliceAt(line, start, end, replacement)` surgical-replace pattern that NEVER touches the col-68+ Status HUD column. The `[+7]` badge literal is grep-asserted in TS-INV1-ck12-squashed as a load-bearing SC #3 assertion in addition to the matchAsciiFixture.

## Task Commits

Each task was committed atomically:

1. **Task 1: toast-types.ts + toast-queue-layer.ts + 22 unit tests** — `0351cba` (feat)
2. **Task 2: 3 INV-1 fixtures + toast-snapshot.test.ts (3 INV-1 ck 11/12 tests)** — `a86d0df` (test)

**Plan metadata:** TBD (final SUMMARY commit follows).

## Files Created/Modified

**Created (7 source/test/fixture files + 1 SUMMARY):**
- `packages/g2-app/src/status-hud/toast-types.ts` — Zod schema + severity union + language-neutral SEVERITY_PREFIX + 5 runtime constants.
- `packages/g2-app/src/status-hud/toast-queue-layer.ts` — `ToastQueueLayer implements Layer` at z=1.5 with FIFO + head-anchored dwell + squash badge + soft-cap DoS mitigation + delta short-circuit.
- `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts` — 22 unit tests (TT-1..5, TQL-FIFO-01..08, TQL-PARSE-01..02, TQL-CAP-01, TQL-LAYER-01..04, TQL-DELTA-01..02).
- `packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts` — NEW dedicated INV-1 snapshot test file (3 ck 11/12 tests via `buildToastScenePage` helper).
- `packages/shared-render/src/fixtures/toast-queue.single.it.txt` — 96×24 INV-1 fixture: 1 info toast at row 20.
- `packages/shared-render/src/fixtures/toast-queue.dual.it.txt` — 96×24 INV-1 fixture: 2 toasts FIFO at rows 19-20.
- `packages/shared-render/src/fixtures/toast-queue.squashed.it.txt` — 96×24 INV-1 fixture: head with `[+7]` squash badge (Fireball + 8 saves stress, SC #3).
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-03-SUMMARY.md` — this file.

**Modified:** none. `packages/g2-app/src/status-hud/i18n-budgets.ts` is intentionally UNCHANGED — Plan 01 absorbed all Wave-0 toast keys (`toast_squash_badge_template`, `toast_row_padding_target`), Plan 03 is a READ-ONLY consumer. `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` is UNCHANGED — toast snapshots live in their own dedicated `toast-snapshot.test.ts` file per Wave-2 file-overlap policy.

## ToastQueueLayer Final State Surface

```
class ToastQueueLayer implements Layer {
  readonly id = 'toast-queue';

  // Construction
  constructor(opts: { bridge: EvenAppBridge })

  // Layer contract
  async draw(): Promise<void>             // re-render (delta short-circuit)
  destroy(): void                          // idempotent; clears all dwell timers
  getContainerCount(): { image: 0; text: 1 }  // Strategy A

  // External producer surface
  enqueue(toast: Toast): void              // safeParse → push to visible|buffered
                                            //  → scheduleDwell if new head
                                            //  → fire-and-forget redraw

  // Test diagnostics
  getVisibleCount(): number
  getBufferedCount(): number

  // Internal state
  private visible: Toast[]                 // length 0..2
  private buffered: Toast[]                // length 0..100
  private dwellTimers: Map<string, Timeout> // id → active head timer
  private renderedContent: string          // delta-detection cache
}
```

## Container Strategy Decision

**Single text container** (`'toast-block'`) carrying both rows joined by `\n`. Rationale (CONTEXT §Area 5 + RESEARCH §Q5 + UI-SPEC §3.2):

- The SDK 4-image / 8-text cap is tight in the overlay-open state (4i + 9-12t per ADR-0009 Amendment 1 audit). Saving 1 text slot vs the 2-container alternative is a load-bearing win.
- The 2-row newline-separated body matches `bridge.textContainerUpgrade` semantics — the container hosts a single multi-line text payload, no extra layout coordination.
- Plan 01 Strategy A `getContainerCount(): { image: 0, text: 1 }` is the contract LayerManager._assertContainerBudget sums against.

## Soft Cap + DoS Mitigation

| Dimension | Value | Behaviour on overflow |
|---|---|---|
| Visible (hard) | `TOAST_VISIBLE_CAPACITY = 2` | New enqueues land in `buffered` |
| Buffered (soft) | `TOAST_BUFFER_SOFT_CAP = 100` | `buffered.shift()` (drop oldest queued) + `console.warn('[toast-queue-layer] soft cap exceeded; dropping oldest queued toast', dropped?.id)`. Visible toasts are NEVER dropped. |
| Badge display (telemetry) | `Math.min(buffered.length, 99)` | When `buffered > 99`, badge shows `[+99]` and `console.warn('[toast-queue-layer] buffered toast count exceeds display cap (99)', count)` fires once per draw (orthogonal to soft-cap warn). |

## Severity Prefix Table (Pitfall 6 Compliance)

| Severity | Prefix | Source |
|---|---|---|
| `info` | `i: ` | `SEVERITY_PREFIX.info` (toast-types.ts) |
| `warn` | `!: ` | `SEVERITY_PREFIX.warn` |
| `error` | `x: ` | `SEVERITY_PREFIX.error` |

All three prefixes are exactly 3 chars (`<alpha> + colon + space`). Identical across IT/EN/DE — NOT registered in `i18n-budgets.ts`. The 38-char `Toast.message` budget = 42-char `TOAST_ROW_WIDTH` minus 3-char prefix minus 1-char right margin.

## ASCII Fixture Schema (3 fixtures × 96×24)

| Fixture | Toast state | Load-bearing literal | Demolished z=0.5 row(s) |
|---|---|---|---|
| `toast-queue.single.it.txt` | 1 info toast on row 20 | `i: Danno 12 slashing` | rows 19, 20, 21 (combat-log + label + stats all blank) |
| `toast-queue.dual.it.txt` | 2 toasts FIFO rows 19-20 | `i: Tiro Salv. DES superato` (head), `i: Danno 12 slashing` (tail) | rows 19, 20, 21 |
| `toast-queue.squashed.it.txt` | Head with `[+7]` badge (Fireball + 8 saves, SC #3) | `i: Tiro Salv. DES superato [+7]` (head), `i: Danno 28 fuoco` (tail) | rows 19, 20, 21 |

All three fixtures preserve the right-side Status HUD card (cols 68-95) verbatim from `glyph-scene.raster-idle-it.txt`.

## Decisions Made

Captured in frontmatter `key-decisions`. The most architecturally load-bearing:

1. **Head-anchored sequential dwell** (vs per-toast timers) — RESEARCH §Q5 stress case scenario "9 toasts arrive over 500 ms → 2 visible (head shows `[+7]`); 7 queued; cycle over ~10.5 s" only works if dwell timing is sequential. Per-toast independent timers would expire simultaneously and produce a single empty-queue flash. Head-anchored: only the FIFO head's timer is live; on expiry the new head schedules a fresh window.
2. **Single text container** (Strategy A) — preserves the 1-slot budget headroom needed for the open-state (z=0 + z=1 + z=1.5 + z=2 panel) per Plan 01 audit tables.
3. **Dedicated `toast-snapshot.test.ts` file** (NOT extending Phase 4a `snapshot.test.ts`) — Wave-2 file-overlap avoidance. Plan 04 may extend `snapshot.test.ts` in parallel; toast snapshots live separately.
4. **Helper-based scene composition** for fixtures — programmatic LayerManager-driven full-page render is Plan 05 + Plan 06 work. `buildToastScenePage` uses spliceAt() on the Phase 4a IT baseline for the character-perfect snapshot; the runtime composition is verified by future integration smoke.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Dwell timer initial implementation scheduled per-toast simultaneous timers**
- **Found during:** Task 1 (TQL-FIFO-06 + TQL-FIFO-07 RED phase)
- **Issue:** First-draft `enqueue()` scheduled a dwell timer for every visible toast. When 3 toasts are enqueued back-to-back at fake-timer time 0, both visible timers expire at the same `advanceTimersByTimeAsync(3000)` tick → both toasts removed → only 1 buffered toast left to promote → final `visible.length === 1` (not 2 as expected by the plan + RESEARCH §Q5 stress case timeline "cycle through over the next ~10.5 seconds").
- **Fix:** Switched to head-anchored sequential dwell: only schedule a dwell when the visible queue was previously empty (i.e., this enqueue creates the new head). Tail enqueues ride the existing head's window. On head expiry, the promotion path schedules a fresh dwell for the new head (`visible[0]`). Documented in `enqueue` JSDoc + `_scheduleDwell` JSDoc with the "Sequential dwell rationale" block.
- **Files modified:** `packages/g2-app/src/status-hud/toast-queue-layer.ts`
- **Verification:** TQL-FIFO-06 + TQL-FIFO-07 now green. Per-toast pattern was wrong; head-anchored is what UI-SPEC + RESEARCH require.
- **Committed in:** `0351cba` (Task 1 commit, RED-fix folded in pre-commit before publishing).
- **Impact:** Behaviour change at the implementation level (more spec-compliant). No public-API change. No additional commits.

**2. [Rule 1 — Bug] `vi.runAllTimersAsync()` initial test pattern fired dwell timers and emptied state before assertions**
- **Found during:** Task 1 (10 of 22 tests RED on first run)
- **Issue:** `enqueue()` schedules a fire-and-forget `void this._redrawIfChanged()` Promise. To assert the bridge was called, tests need to drain pending microtasks. The initial pattern used `await vi.runAllTimersAsync()` which ALSO advances fake-timer time past the 3 s dwell timers, removing all toasts and breaking 7 visibility-dependent assertions + 3 cap/parse/delta assertions.
- **Fix:** Introduced a `flushMicrotasks()` helper that calls `vi.advanceTimersByTimeAsync(0)` (the Vitest idiom for "drain microtasks at virtual-time 0"). Documented in a JSDoc block on the helper.
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts`
- **Verification:** All 22 tests now pass.
- **Committed in:** `0351cba` (Task 1 commit, fix folded in before publishing).
- **Impact:** Test-mechanics-only; no production code change.

**3. [Rule 1 — Bug] TS implicit-any on `vi.spyOn(...).mock.calls.some((call) => ...)`**
- **Found during:** Task 1 (`pnpm typecheck` after initial test pass)
- **Issue:** `vi.spyOn` returns a `ReturnType<typeof vi.spyOn>` whose `.mock.calls` element type infers as untyped `any[]` array; `.some((call) => ...)` then triggers `TS7006: Parameter 'call' implicitly has an 'any' type`.
- **Fix:** Explicitly typed the lambda parameter as `(c: unknown[])` and projected `String(c[0])`. Pattern matches the existing project precedent of `warnSpy.mock.calls[0]?.[0]` access in `i18n-budgets.test.ts` and `map-mode-toggle.test.ts`.
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts`
- **Verification:** `pnpm typecheck` exit 0.
- **Committed in:** `0351cba` (Task 1 commit, fix folded in before publishing).
- **Impact:** Test typing only.

**4. [Rule 1 — Format] `biome ci .` auto-fix applied to formatting (`pnpm exec biome check --write` idempotent)**
- **Found during:** Task 1 + Task 2 final lint check
- **Issue:** Biome flagged: (a) import-order in toast-queue-layer.ts (`type Toast` not in alphabetical position), (b) `console.warn` multiline wrapping in toast-queue-layer.ts vs single-line policy, (c) toast-snapshot.test.ts buildToastScenePage function-arg formatting.
- **Fix:** `pnpm exec biome check --write` idempotent format pass applied; all formatting auto-applied, behavioural code unchanged.
- **Files modified:** `packages/g2-app/src/status-hud/toast-queue-layer.ts`, `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts`, `packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts`
- **Verification:** `pnpm lint:ci` exit 0 (137 pre-existing warnings unchanged).
- **Committed in:** `0351cba` (Task 1) + `a86d0df` (Task 2) — fixes folded into the respective task commits before publishing.
- **Impact:** Style only; zero behaviour change.

---

**Total deviations:** 4 auto-fixed (3 Rule 1 — Bug on initial implementation/test logic + 1 Rule 1 — Format from Biome auto-fix).
**Impact on plan:** All four were corrections discovered at execution-time RED→GREEN transitions or quality-gate sweeps. No scope creep, no architectural change, no INV invalidation, no public-API change. Plan behaviour spec honoured 1:1 against UI-SPEC + CONTEXT verbatim.

## Issues Encountered

- **Initial dwell-timer model required one redesign iteration** — first-pass per-toast timers were caught by the TQL-FIFO-06/07 RED phase. Head-anchored sequential dwell matches RESEARCH §Q5 explicitly. No extra commit boundary; resolved within Task 1.
- **`vi.spyOn` mock typing** required explicit `unknown[]` annotation in lambda params under TS strict + `noUnusedLocals` + `noUnusedParameters`. Established precedent: tests should annotate `.mock.calls.map((c: unknown[]) => ...)` rather than relying on default Mock<...> inference.

## Container Budget Compliance (Plan 01 Strategy A)

`ToastQueueLayer.getContainerCount()` returns `{ image: 0, text: 1 }` per Plan 01 Strategy A. Verified by TQL-LAYER-03. LayerManager.bundle()'s `_assertContainerBudget` sums this against the other mounted layers. Closed state under Plan 01 audit: `4i + 6t` (raster) or `0i + 6t` (glyph) — toast layer contributes the +1t to those baselines, within 4i + 8t cap. Open state with z=2 panel ≤ 3t: `4i + ≤6t` (raster) or `0i + ≤7t` (glyph) — still within cap with headroom.

## INV-1 ck 12 + Stress Case ST-1 Closure

| Coverage | Test | Fixture | Closes |
|---|---|---|---|
| ck 11 — Status HUD width budget under variable content (toast + Status HUD coexistence) | TS-INV1-ck11-single, TS-INV1-ck11-dual | `toast-queue.{single,dual}.it.txt` | INV-1 ck 11 toast variant |
| ck 12 — variable-content stress with squash badge fixed-position | TS-INV1-ck12-squashed | `toast-queue.squashed.it.txt` | INV-1 ck 12 toast variant + SC #3 (Fireball + 8 saves) |
| Software-side stress (no fixture) — 9 toasts → visible 2 + buffered 7 + `[+7]` head badge | TQL-FIFO-05 | none (unit assertion only) | SC #3 unit-side; ratification on real G2 hardware deferred to ADR-0005 Branch A human_needed gate |

## Wave-2 Parallelism Confirmation

| Plan 03 `files_modified` | Plan 04 `files_modified` (from frontmatter) | Overlap |
|---|---|---|
| `packages/g2-app/src/status-hud/toast-types.ts` | `packages/g2-app/src/engine/boot-error-types.ts` (anticipated) | none |
| `packages/g2-app/src/status-hud/toast-queue-layer.ts` | `packages/g2-app/src/engine/boot-error-layer.ts` (anticipated) | none |
| `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts` | `packages/g2-app/src/engine/__tests__/boot-error-layer.test.ts` (anticipated) | none |
| `packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts` | (Plan 04 owns `__tests__/snapshot.test.ts` extension if needed) | none |
| `packages/shared-render/src/fixtures/toast-queue.*.it.txt` (3 files) | `packages/shared-render/src/fixtures/boot-error.*.txt` (10 files anticipated) | none |
| `packages/g2-app/src/status-hud/i18n-budgets.ts` — **NOT MODIFIED** | (Plan 04 reads `boot_error_*` keys read-only) | none |

Wave-2 parallelism preserved. Plan 01 Wave-0 centralisation of `i18n-budgets.ts` is what makes this work — both Plans 03 and 04 are READ-ONLY consumers of that table.

## Phase 5 Wiring Hint

Plan 05 (conc-modal + death-saves pivot) does NOT touch toast machinery. The Plan 05 integration smoke will ratify ADR-0009 Amendment 1 Rule 2 (z=1.5 toast carve-out — not demolished on z=2 mount) by:

1. Mounting a `ToastQueueLayer` instance at z=1.5 with 9 toasts enqueued (Fireball + 8 saves).
2. Mounting a `ConcentrationDropModalPanel` instance at z=2 via `layerManager.bundle([destroy z=0.5, mount z=2])` — the differential demolish rule applies to z=0.5 only.
3. Asserting the toast layer's `getVisibleCount()` is still 2 and `getBufferedCount()` is still 7 post-mount.
4. Asserting the `'toast-block'` text container is still present in the page schema post-mount.

This plan delivered the SOFTWARE-SIDE machinery; Plan 05 ratifies the layer composition under real overlay open.

## Next Phase Readiness

- TOAST-01 requirement fully addressed software-side. Hardware verification on real G2 (Fireball + 8 saves visual stress) deferred to ADR-0005 Branch A human_needed gate as Phase 4b CONTEXT/Plan 03 plan ratify.
- `ToastQueueLayer.enqueue()` API is the stable injection point for future event producers: Plan 06 will wire the WS combat-log events; Phase 7 reaction notifications (REACT-01) can reuse this exact `enqueue(toast)` surface with `severity='info'`.
- The 3 INV-1 fixtures are character-perfect contracts — any future change to UI-SPEC §3.2 (e.g., severity prefix tweak, badge format change) will fail `toast-snapshot.test.ts` loudly until the fixtures are regenerated.

## Self-Check: PASSED

Files claimed:
- `[FOUND]` packages/g2-app/src/status-hud/toast-types.ts
- `[FOUND]` packages/g2-app/src/status-hud/toast-queue-layer.ts
- `[FOUND]` packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts
- `[FOUND]` packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts
- `[FOUND]` packages/shared-render/src/fixtures/toast-queue.single.it.txt
- `[FOUND]` packages/shared-render/src/fixtures/toast-queue.dual.it.txt
- `[FOUND]` packages/shared-render/src/fixtures/toast-queue.squashed.it.txt

Commits claimed:
- `[FOUND]` 0351cba (Task 1 — feat: ToastQueueLayer + toast-types + 22 unit tests)
- `[FOUND]` a86d0df (Task 2 — test: 3 INV-1 fixtures + toast-snapshot.test.ts)

Verification commands run:
- `pnpm typecheck` — exit 0 (workspace-wide)
- `pnpm lint:ci` — exit 0 (no errors; 137 pre-existing warnings unchanged)
- `pnpm test` — 694/694 pass (Phase 4a + Plan 01 + Plan 02 + Plan 03 cumulative; +25 over prior baseline of 669: 22 unit + 3 snapshot)
- `grep -c "export class ToastQueueLayer" packages/g2-app/src/status-hud/toast-queue-layer.ts` → 1
- `grep -c "implements Layer" packages/g2-app/src/status-hud/toast-queue-layer.ts` → 1
- `grep -c "TOAST_BUFFER_SOFT_CAP = 100" packages/g2-app/src/status-hud/toast-types.ts` → 2 (declaration + JSDoc table doc)
- `grep -c "ToastSchema.safeParse" packages/g2-app/src/status-hud/toast-queue-layer.ts` → 4 (import + safeParse call + 2 JSDoc references)
- `grep -cE "TQL-(FIFO|PARSE|CAP|LAYER|DELTA)-0[0-9]" toast-queue-layer.test.ts` → 23 (one TQL-FIFO appears twice in a comment block)
- `grep -cE "TS-INV1-ck1[12]" toast-snapshot.test.ts` → 6 (3 it titles × 2 substring occurrences each in JSDoc + test name)
- Fixture widths: all 24 rows × 96 chars uniformly (`awk` length check) for the 3 toast fixtures.
- `grep -c '\[+7\]' packages/shared-render/src/fixtures/toast-queue.squashed.it.txt` → 1 (SC #3 load-bearing literal).
- `git diff --name-only HEAD~2 HEAD | grep i18n` → no output (i18n-budgets.ts UNCHANGED, per Plan 01 Wave-0 centralisation).
- `git diff --name-only HEAD~2 HEAD | grep "snapshot.test.ts" | grep -v "toast-"` → no output (Phase 4a snapshot.test.ts UNTOUCHED).

---
*Phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui*
*Plan: 03*
*Completed: 2026-05-15*
