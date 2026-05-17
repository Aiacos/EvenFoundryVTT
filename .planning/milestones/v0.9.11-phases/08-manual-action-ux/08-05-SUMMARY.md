---
phase: 08
plan: "05"
subsystem: g2-app
tags: [combat-tracker, quick-action-bar, boot-engine, integration-smoke, phase-closure]
dependency_graph:
  requires: [08-04-PLAN.md, action-result-dispatcher, action-options-modal, spellbook-panel, inventory-panel]
  provides: [08-05-SUMMARY.md, 08-VERIFICATION.md]
  affects: [boot-engine-core.ts, panel-router.ts, combat-tracker-panel.ts, status-hud-layer.ts]
tech_stack:
  added: []
  patterns:
    - double-tap-to-fire with _lastTapIdx post-advance index
    - post-construction injection registry (setPanelInstanceHandler)
    - StubCaptureLayer pattern for integration tests needing LayerManager without full raster
key_files:
  created:
    - packages/g2-app/src/__tests__/08-integration-smoke.test.ts
  modified:
    - packages/g2-app/src/panels/combat-tracker-panel.ts
    - packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
    - packages/g2-app/src/__tests__/boot-engine-r1-wiring.test.ts
    - packages/g2-app/src/engine/panel-router.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - double-tap-to-fire stores NEW (post-advance) index in _lastTapIdx
  - setPanelInstanceHandler registry avoids threading callbacks through 3-arg constructor
  - currentUserId stub '<unknown>' per ADR-0005 bearer handshake not yet surfaced
  - ToastQueueLayer added to boot-engine Step 11e as Rule 2 correctness requirement
metrics:
  duration: "~90 min (including context compaction)"
  completed_date: "2026-05-16"
  tests_before: 1833
  tests_after: 1858
  test_delta: "+25 (CTQ-01..08 + SHL-MV-01..03 + BERW-09..12 + ISM-W8-01..10)"
  files_created: 1
  files_modified: 7
---

# Phase 8 Plan 05: CombatTrackerPanel QA-bar + Boot-Engine Steps 11e..11g + ISM-W8 Smoke Summary

**One-liner:** CombatTrackerPanel double-tap QA-bar [A][S][I][M] + boot-engine ToastQueueLayer mount + setPanelInstanceHandler factory closures + ISM-W8-01..10 integration smoke closes Phase 8.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | CombatTrackerPanel QA-bar tap-dispatch + SHL-MV-01..03 | `9901fe8` | combat-tracker-panel.ts, combat-tracker-panel.test.ts, status-hud-layer.test.ts |
| 2 (RED) | BERW-09..12 failing tests | `219f3a3` | boot-engine-r1-wiring.test.ts |
| 2 (GREEN) | boot-engine steps 11e..11g + setPanelInstanceHandler | `e8d5f03` | boot-engine-core.ts, panel-router.ts, boot-engine-r1-wiring.test.ts |
| 3 | ISM-W8-01..10 integration smoke harness | `71ec0c2` | 08-integration-smoke.test.ts |
| 4 | Phase 8 closure — STATE.md + ROADMAP.md + VERIFICATION.md | (docs commit) | STATE.md, ROADMAP.md, 08-VERIFICATION.md, 08-05-SUMMARY.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] ToastQueueLayer missing from boot-engine bundle**
- **Found during:** Task 2 GREEN implementation
- **Issue:** `attachActionResultHandler` in Step 11e enqueues toasts on a `ToastQueueLayer` instance, but the layer was never mounted in the boot bundle — toasts would enqueue to memory but never render on G2
- **Fix:** Added `toastQueue = new ToastQueueLayer({ bridge })` in Step 11e and included `{ type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toastQueue }` in the boot bundle; added `toastQueue.destroy()` in teardown
- **Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts`
- **Commit:** `e8d5f03`

**2. [Rule 1 - Bug] CTQ-04/05 _lastTapIdx assertion wrong index**
- **Found during:** Task 1 RED→GREEN
- **Issue:** Tests initially asserted `_lastTapIdx === 0` (old pre-advance index) but implementation correctly stores the NEW post-advance index — double-tap design requires `_lastTapIdx = newIdx` so subsequent `sameIdx = (_lastTapIdx === qaSelectedIdx)` is true
- **Fix:** Changed assertions from `.toBe(0)` to `.toBe(1)` (the new index after advance 0→1); updated comments to describe correct design
- **Files modified:** `packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts`
- **Commit:** `9901fe8`

**3. [Rule 1 - Bug] ISM-W8-05 cycling taps fired prematurely**
- **Found during:** Task 3 test execution
- **Issue:** ISM-W8-05 cycled to index 3 (M) using taps at t=3001, t=3002 — both within 600ms of t=3000 — triggering double-tap fire on S (index 1) instead of advancing
- **Fix:** Spaced cycling taps >600ms apart (t=3000, t=3700, t=4400), then double-tapped at t=4800 (within 600ms of t=4400)
- **Files modified:** `packages/g2-app/src/__tests__/08-integration-smoke.test.ts`
- **Commit:** `71ec0c2`

**4. [Rule 1 - Bug] ISM-W8-06 toast count = 0 due to errorKind: null schema rejection**
- **Found during:** Task 3 test execution
- **Issue:** `makeActionResultEnvelope` built payload with `errorKind: null` — `ActionResultPayloadSchema` uses `errorKind: ActionErrorKind.optional()` which accepts `undefined` but NOT `null`; `.strict()` would pass the field through but Zod rejected the enum value, causing silent drop
- **Fix:** Changed `makeActionResultEnvelope` to omit `errorKind` entirely when null (spread conditional: `...(overrides.errorKind !== undefined && overrides.errorKind !== null ? { errorKind } : {})`)
- **Files modified:** `packages/g2-app/src/__tests__/08-integration-smoke.test.ts`
- **Commit:** `71ec0c2`

**5. [Rule 3 - Blocking] LayerManager capture invariant violated in test suite**
- **Found during:** Task 3 test execution (ISM-W8-01..10 all failed with `capture_invariant_violated`)
- **Issue:** `makeSmokeSuite` bundled only StatusHudLayer + ToastQueueLayer — neither provides `getCaptureContainer()`; LayerManager requires exactly 1 capture container at `bundle()` time
- **Fix:** Added `StubCaptureLayer` class implementing `getCaptureContainer(): string` and included it at `ZIndex.Z0_MAP` in the bundle (mirroring Phase 4b's `StubCaptureLayer` pattern)
- **Files modified:** `packages/g2-app/src/__tests__/08-integration-smoke.test.ts`
- **Commit:** `71ec0c2`

**6. [Rule 1 - Bug] Multiple TypeScript errors in test file**
- **Found during:** Task 3 typecheck
- **Issue (a):** `MockWsInterface.send` typed as `ReturnType<typeof vi.fn>` (a `Mock<Procedure | Constructable>`) was not assignable to `(data: string) => void` in `ActionOptionsWebSocket.send`
- **Fix (a):** Typed `send` and `close` as intersection `((data: string) => void) & ReturnType<typeof vi.fn>` and cast via `as unknown as MockWsInterface['send']`
- **Issue (b):** `TargetCandidate` missing `tokenId`, `hp`, `maxHp`, `ac`, `isActiveTurn`, `sourceIdx` fields
- **Fix (b):** Added all required fields to the test candidate literal
- **Issue (c):** `damage: null` not assignable to `string | undefined` in `ActionResultPayload`
- **Fix (c):** Omitted `damage` key entirely for error-status payload
- **Issue (d):** TypeScript control flow narrowing of `capturedRequest: ... | null` failed across async closure
- **Fix (d):** Copied to `const nonNullReq: ActionOptionsRequest = req` inside the null-check block
- **Files modified:** `packages/g2-app/src/__tests__/08-integration-smoke.test.ts`
- **Commit:** `71ec0c2`

## Known Stubs

**Phase 8 minimal stubs (by design — Phase 9 wires full logic):**

| Stub | File | Reason |
|------|------|--------|
| `console.warn('[combat-tracker] QA key: A')` | boot-engine-core.ts Step 11g case 'A' | Phase 9 replaces with attack flow (ACT-01 attack variant) |
| `console.warn('[combat-tracker] QA key: M')` | boot-engine-core.ts Step 11g case 'M' | Phase 9 replaces with movement flow (MoveDirectionPicker already wired in Plan 08-04) |
| `currentUserId = '<unknown>'` | boot-engine-core.ts Step 11e | Bearer user_id not yet surfaced in handshake; TODO(ADR-0005); T-08-02 filter active |

These stubs are intentional Phase 8 minimums. They do NOT prevent Phase 8's plan goal from being achieved — the QA-bar tap-dispatch, modal routing, and toast-enqueue paths are all fully wired; only the final action-dispatch for [A]/[M] is stubbed.

## Phase 8 Closure Invariant Check

| Invariant | Status |
|-----------|--------|
| 14-socketlib-handler count | ✅ 14 confirmed (ISM-W8-10 grep gate) |
| INV-1 Layout integrity | ✅ no fixtures regressed |
| INV-4 Code quality | ✅ typecheck + biome ci exit 0 |
| INV-5 Gesture Determinism | ✅ double-tap-to-fire deterministic |
| T-08-02 Cross-player leak | ✅ ISM-W8-07 silent drop verified |

## Self-Check: PASSED

Files created/modified exist:
- packages/g2-app/src/__tests__/08-integration-smoke.test.ts: FOUND
- packages/g2-app/src/engine/panel-router.ts: FOUND (setPanelInstanceHandler added)
- packages/g2-app/src/internal/boot-engine-core.ts: FOUND (Steps 11e..11g added)
- .planning/phases/08-manual-action-ux/08-VERIFICATION.md: FOUND
- .planning/STATE.md: FOUND (PHASE_8_CLOSED)
- .planning/ROADMAP.md: FOUND (checkbox flipped)

Commits verified: 9901fe8, 219f3a3, e8d5f03, 71ec0c2 all exist in git log.
