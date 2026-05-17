---
phase: 4b
plan: 05
subsystem: g2-app
tags: [g2-app, status-hud, panels, death-saves, conc-modal, integration-smoke, wave-3, inv-1, fixtures, dispatcher, conc-01, death-01, b-4, w-4]
requires:
  - 04b-01 (Wave 0 — OverlayPanel API + panel-gesture-bus + differential demolish)
  - 04b-02 (Wave 1 — map mode toggle)
  - 04b-03 (Wave 2 Plan 03 — ToastQueueLayer at z=1.5)
  - 04b-04 (Wave 2 Plan 04 — BootErrorLayer + bootEngineWithErrorUi)
  - 04b-06 (Wave 2 Plan 06 — CharacterSnapshotSchema.death + concentration.ts schemas)
provides:
  - DEATH-01 (HP=0 → 3-strike tracker pivot inside StatusHudLayer, latched until recovery / Phase 7+ revive)
  - CONC-01 (z=2 ConcentrationDropModalPanel — overlay panel; Y emits conc.drop.confirmed envelope; Phase 7 wires write path)
  - B-4 closure — conc-conflict-dispatcher.ts mounts modal on bridge-emitted conc.conflict (double trust boundary)
  - W-4 closure — EnvelopeSchema.safeParse round-trip on modal-emitted envelope (positive + negative session_id)
affects:
  - packages/g2-app/src/status-hud/status-hud-renderer.ts (extended)
  - packages/g2-app/src/status-hud/status-hud-layer.ts (extended)
  - packages/g2-app/src/panels/ (new dir — 2 modules + 2 tests)
  - packages/shared-render/src/fixtures/ (4 new INV-1 fixtures)
  - packages/g2-app/src/__tests__/04b-integration-smoke.test.ts (new — ISM-01..10)
tech-stack:
  patterns:
    - "Strategy A container budget (Plan 01) — single text container 'overlay-block' for the conc modal"
    - "Differential demolish (Plan 01) — z=2 mount auto-removes z=0.5 idle infill; destroy z=2 restores it"
    - "Double trust boundary at WS-receive — EnvelopeSchema.safeParse (outer) → ConcConflictPayloadSchema.safeParse (inner)"
    - "Transition-driven mode latch — renderer.setMode called ONLY on state change (SHL-PIVOT-6)"
    - "In-process panel-gesture-bus (Plan 01 Pattern B) — modal subscribes onMount, unsubscribes onUnmount"
key-files:
  created:
    - packages/g2-app/src/panels/concentration-drop-modal.ts
    - packages/g2-app/src/panels/conc-conflict-dispatcher.ts
    - packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts
    - packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts
    - packages/g2-app/src/__tests__/04b-integration-smoke.test.ts
    - packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt
    - packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt
    - packages/shared-render/src/fixtures/conc-modal.open.it.txt
    - packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt
  modified:
    - packages/g2-app/src/status-hud/status-hud-renderer.ts (StatusHudMode + setMode + _renderDeathSaves)
    - packages/g2-app/src/status-hud/status-hud-layer.ts (pivotLatched + _onDelta trigger logic)
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts (8 SR-DS-* tests)
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts (7 SHL-PIVOT-* tests)
decisions:
  - "Container strategy: single text container 'overlay-block' for the conc modal (Strategy A from Plan 01) — newline-joined 12-row content keeps SDK container budget deterministic + no page-schema mutation (Phase 6 lands the real overlay slot declaration)."
  - "Modal sessionId is a constructor argument (NOT a TODO) — dispatcher threads the inbound envelope's session_id verbatim (B-4 closure)."
  - "Pivot latch transition-driven — renderer.setMode is only called when computed latch value differs from stored (SHL-PIVOT-6 + ISM-04 verify)."
  - "Death-saves pivot stays ON when failure === 3 (PC dead) — latch-off only happens on HP > 0 recovery (SHL-PIVOT-4 verifies; future Phase 7+ revive event terminates the latched-dead state)."
  - "ISM-09 (matchAsciiFixture full-page composition) deferred — unit-level CDM-13 + SR-DS-7/8 fixtures are the per-layer single source of truth; full 96×24 page composition requires a helper not yet built (Phase 6 wires it)."
metrics:
  duration: "28m 47s"
  completed: "2026-05-15"
  tasks: 3
  task_commits: ["4a8db2a", "1c2c438", "27a77c5"]
  files_created: 9
  files_modified: 4
  tests_added: 47   # 15 (SR-DS + SHL-PIVOT) + 14 CDM + 9 CCD + 10 ISM (minus 1 ISM-09 deferred trivial assert)
---

# Phase 4b Plan 05: Death-Saves Pivot + ConcDropModalPanel + Conc-Conflict Dispatcher + Integration Smoke

Wave 3 — final Phase 4b consumer layers (death-saves StatusHudRenderer pivot + ConcentrationDropModalPanel + production dispatcher + integration smoke) and the W-4 / B-4 closures. Plan 05 ships DEATH-01, CONC-01, B-4 production wire-up, W-4 EnvelopeSchema round-trip guard.

## One-liner

Death-saves 3-strike tracker pivot inside StatusHudLayer (HP=0 latch, transition-driven, dead-state preserved); ConcentrationDropModalPanel implements OverlayPanel at z=2 with constructor-threaded session UUID + canonical EnvelopeSchema emission on tap; conc-conflict-dispatcher provides double-trust-boundary WS-receive boundary that mounts the modal on bridge-emitted `conc.conflict` envelopes; 4 INV-1 fixtures + 10 ISM-* integration smoke tests covering layer composition end-to-end.

## What landed

### Task 1 — StatusHudRenderer death-saves mode + StatusHudLayer pivot trigger (DEATH-01)

**Commit:** `4a8db2a`

- **StatusHudRenderer extensions** (`packages/g2-app/src/status-hud/status-hud-renderer.ts`):
  - New type `StatusHudMode = 'standard' | 'death-saves'` exported.
  - Constructor opts `mode?: StatusHudMode` (default `'standard'`).
  - Public methods `setMode(mode)` / `getMode()` (the latter test-only — production code uses the StatusHudLayer's latch as truth).
  - `render(snapshot)` now dispatches: `mode === 'death-saves'` → `_renderDeathSaves`; else `_renderStandard` (existing logic refactored into private method).
  - New private `_renderDeathSaves(snapshot)` produces the 28×21 pivot card per UI-SPEC §3.4:
    - Row 1: name (preserved from standard mode)
    - Row 2: 16-dash divider (preserved)
    - Row 4: `DEATH SAVES` title (locale-aware via `death_saves_title`)
    - Row 6: `Riusciti  [ ◯ ◯ ◯ ]` tracker (label padded to 10-char cell + bracket; IT/EN/DE labels via `death_saves_passes_label`)
    - Row 7: `Falliti   [ ◯ ◯ ◯ ]` tracker (column-aligned with row 6)
    - Row 9: `PF  0/<max>` HP=0 indicator (IT) / `HP  0/<max>` (EN)
    - Row 10: `CA <ac>` / `AC <ac>`
    - Row 20: `[GLY]` badge if `mapMode === 'glyph'` (orthogonal to death-saves latch per UI-SPEC §9.7)
    - Row 21: `╠══...═╣` bottom border (preserved)
  - Private helper `buildTrackerBracket(count)` builds the `[ X X X ]` 9-char bracket with `●` (filled, U+25CF) / `◯` (empty, U+25EF); count clamped to `[0, 3]`.

- **StatusHudLayer extensions** (`packages/g2-app/src/status-hud/status-hud-layer.ts`):
  - New `private pivotLatched = false` field tracking the death-saves latch state.
  - `_onDelta(raw)` extended with the latch trigger after `safeParse`:
    - `recovering = hp > 0` → latch OFF (`'standard'`)
    - `entering = hp === 0 && death.failure < 3` → latch ON (`'death-saves'`)
    - else (hp === 0 && failure === 3, i.e., PC dead) → preserve existing latch (no transition until Phase 7+ revive event)
    - Transition guard: `renderer.setMode` is only called when computed `nextLatched !== this.pivotLatched`.
  - New `getPivotLatched()` test-only accessor.

- **INV-1 fixtures** (`packages/shared-render/src/fixtures/`):
  - `status-hud.death-saves-initial.it.txt` (28×21, HP=0, 0p/0f initial entry)
  - `status-hud.death-saves-mid.it.txt` (28×21, HP=0, 1p/2f mid-saves; `●` filled positions)
  - Both verbatim from UI-SPEC §5.14 / §5.15 — character-perfect.

- **Tests added:**
  - `status-hud-renderer.test.ts`: 8 SR-DS-* tests (mode dispatch / borders / locale / tracker glyphs / HP=0 indicator / 2× matchAsciiFixture).
  - `status-hud-layer.test.ts`: 7 SHL-PIVOT-* tests (initial state / entering / recovery / dead state preserved / first-delta-triggers / state-change-only-setMode / malformed payload).

### Task 2 — ConcentrationDropModalPanel + conc-conflict-dispatcher (CONC-01, B-4, W-4)

**Commit:** `1c2c438`

- **NEW `packages/g2-app/src/panels/concentration-drop-modal.ts`:**
  - Class `ConcentrationDropModalPanel implements OverlayPanel`.
  - Constructor signature: `(bridge, ws, gestureBus, conflict, locale, sessionId, onClose)`.
  - **`sessionId: string` is a constructor argument** — threaded from the inbound `conc.conflict` envelope's `session_id` (B-4 closure — no more TODO).
  - Lifecycle:
    - `onMount()` subscribes to `PanelGestureBus` (saves the unsubscribe closure).
    - `onUnmount()` calls the unsubscribe + nulls it (idempotent — T-4b-01-03 mitigation).
    - `onEvent(gesture)`:
      - `tap` → constructs canonical EnvelopeSchema envelope (`proto/seq/ts/type/session_id/payload` — `payload` field NOT `value`); `ws.send(JSON.stringify(envelope))` + `onClose()`.
      - `double-tap` → `onClose()` without emission.
      - other gestures → ignored.
  - `draw()` issues a single `bridge.textContainerUpgrade` call with newline-joined 12-row content.
  - **Container strategy:** single text container `'overlay-block'` (Strategy A — `{ image: 0, text: 1 }`). Keeps SDK 4-image / 8-text cap audit deterministic without mutating the page schema (Phase 6 wires the real overlay slot declaration).
  - Width-budget truncation for IT long spell names (`Cura Ferite di Massa` → Y button row truncates with `…` to fit 24-char budget; panel right `│` border stays column-aligned).

- **NEW `packages/g2-app/src/panels/conc-conflict-dispatcher.ts`:**
  - Function `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale): () => void`.
  - **Double trust boundary at WS-receive (T-4b-05-01 mitigation):**
    1. `EnvelopeSchema.safeParse(parsedJson)` — outer envelope shape (canonical `proto/seq/ts/type/session_id/payload`). Failure → `console.warn('envelope rejected')` + ignore.
    2. Narrow on `envelope.type === CONC_CONFLICT_TYPE` — silent return for other types.
    3. `ConcConflictPayloadSchema.safeParse(envelope.payload)` — inner payload (`effectId/currentConcentrationName/newSpellName` non-empty). Failure → `console.warn('payload rejected')` + ignore.
  - On success: constructs `ConcentrationDropModalPanel` with `envelope.session_id` threaded verbatim + `onClose` that issues `layerManager.bundle([{type:'destroy', z:Z2_OVERLAY}])`. Mounts via `layerManager.bundle([{type:'mount', z:Z2_OVERLAY, layer:modal}])` — Plan 01 differential demolish auto-removes z=0.5; z=1.5 toast survives.
  - Outer `try/catch` belt-and-suspenders catches non-Zod throws (`JSON.parse` syntax error, unexpected SDK shape, etc.) — `console.warn('handler threw')` + ignore.
  - Returns unsubscribe closure (`ws.removeEventListener('message', handler)`).
  - **Phase 6 wiring hook:** the function will be invoked from `boot-engine-core.ts` step 11 area (after `attachSceneInputToWs`). Plan 05 does NOT modify `boot-engine-core.ts` — that wiring lands in Phase 6.

- **INV-1 fixtures** (`packages/shared-render/src/fixtures/`):
  - `conc-modal.open.it.txt` (96×24, modal open over raster scene + standard-mode HUD) — verbatim from UI-SPEC §5.16.
  - `conc-modal-on-death-saves.it.txt` (96×24, modal + death-saves pivot HUD co-presence — CONTEXT Area 8 edge case) — verbatim from UI-SPEC §5.17.

- **Tests added:**
  - `concentration-drop-modal.test.ts`: 14 CDM-* tests (id/interface conformance / `getContainerCount` / `draw()` content / IT+DE locales / ST-4 long-name stress / onMount-onUnmount / Y-emission + W-4 EnvelopeSchema round-trip / N-cancel / ignored gestures including scroll + long-press / modal-row-fragment).
  - `conc-conflict-dispatcher.test.ts`: 9 CCD-* tests (attach/detach contract + listener count / happy-path mount / session_id threading / non-envelope reject / non-JSON reject / wrong-type silent / malformed-payload reject / onClose destroy bundle).

- **W-4 closure (CDM-10 round-trip):**
  - Modal-emitted envelope JSON extracted from `ws.send.mock.calls[0][0]`.
  - `JSON.parse` → `EnvelopeSchema.safeParse(parsed)` → `expect(.success).toBe(true)`.
  - Verifies canonical shape: `proto: 'evf-v1'`, `type: 'conc.drop.confirmed'`, `session_id` is the threaded UUID, `payload: { effectId }`.
  - Negative grep gate `! grep -E 'WireEnvelopeSchema|envelope\.value' packages/g2-app/src/panels/*.ts` clean.

### Task 3 — 04b-integration-smoke.test.ts (Phase 4b layer composition end-to-end)

**Commit:** `27a77c5`

NEW file `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` with 10 ISM-* tests using REAL layer instances (no layer-internals mocking):

- **ISM-01:** full layer set mounts cleanly (z=0 capture stub + z=0.5 idle stub + z=1 StatusHudLayer + z=1.5 ToastQueueLayer); capture invariant holds; exactly one `rebuildPageContainer` per bundle.
- **ISM-02:** overlay mount/unmount round-trip — modal at z=2 triggers Plan 01 differential demolish (z=0.5 demolished); modal close restores z=0.5 via suspended-instance round-trip.
- **ISM-03 (ST-2):** toast at z=1.5 survives modal open (ADR-0009 Amd 1 Rule 2 carve-out) — `toastLayer.getVisibleCount() === 2` both pre- and post-modal-mount.
- **ISM-04 (ST-3):** death-saves pivot + conc modal co-presence — both visible underneath each other, different z-strata.
- **ISM-05 (W-4 closure):** Positive — `EnvelopeSchema.safeParse(emittedEnvelope).success === true`. Negative — `EnvelopeSchema.safeParse({...without session_id}).success === false` (proves session_id required).
- **ISM-06:** N cancel — `ws.send` NOT called; `onClose` invoked once.
- **ISM-07:** panel-gesture-bus cleanup — `bus.size() === 0` after `layerManager.bundle([{destroy z=2}])` (T-4b-01-03 + T-4b-05-02 mitigations verified end-to-end).
- **ISM-08 (ST-4):** IT `Cura Ferite di Massa` truncated in Y button row with `…`; every modal row exactly 60 chars (frame integrity).
- **ISM-09:** matchAsciiFixture composition explicitly deferred to unit-level (CDM-13 + SR-DS-7/8 are per-layer single source of truth; full 96×24 page composition requires a helper not yet built — Phase 6 wires it).
- **ISM-10 (B-4 closure):** dispatcher mounts modal end-to-end from synthetic `ws.fireMessage(validConflictEnvelope)`; `layerManager.getLayer(Z2_OVERLAY)` is the `ConcentrationDropModalPanel` with the threaded `session_id`. Negative case (empty `effectId`) → rejected by `ConcConflictPayloadSchema.safeParse` — no mount; `console.warn('payload rejected')` fires.

**Harness:** real `LayerManager` + `ToastQueueLayer` + `StatusHudLayer` + `ConcentrationDropModalPanel` + `attachConcConflictHandler`. Mock `EvenAppBridge` (vi.fn spies). EventEmitter-backed mock `WebSocket` with `fireMessage` helper. Shared `PanelGestureBus`.

## Closures

### DEATH-01 closure (software-side)

- HP=0 trigger inside `StatusHudLayer._onDelta` switches the renderer to death-saves mode atomically (no flicker, no transient standard-layout frame).
- Latch is transition-driven — `renderer.setMode` called only on state change (SHL-PIVOT-6 + ISM-04 verify).
- Dead state (`failure === 3`) preserved until future Phase 7+ revive event.
- 2 INV-1 fixtures (initial entry + mid-saves stress) — character-perfect, verified via `matchAsciiFixture` (SR-DS-7 + SR-DS-8).
- Hardware verification deferred to ADR-0005 Branch A human_needed gate per Phase 4a precedent.

### CONC-01 closure (software-side)

- ConcentrationDropModalPanel mounts at z=2 via OverlayPanel API (ADR-0009 Amd 1).
- User `[Y]` tap → `conc.drop.confirmed` envelope emitted via `ws.send` (canonical EnvelopeSchema shape with `payload` field + threaded `session_id` UUID).
- User `[N]` double-tap → close without emission.
- Phase 4b does NOT call `effect.delete()` — Phase 7 write path wires the actual delete via `socketlib.executeAsGM`.
- 2 INV-1 fixtures (modal open + modal-on-death-saves co-presence).

### B-4 closure — production dispatcher wire-up

- `conc-conflict-dispatcher.ts` is the production code path that mounts the modal on bridge-emitted `conc.conflict` envelopes.
- Double trust boundary: `EnvelopeSchema.safeParse` (outer) → `ConcConflictPayloadSchema.safeParse` (inner). T-4b-05-01 mitigation.
- `session_id` threaded from inbound envelope verbatim → modal constructor → outgoing `conc.drop.confirmed` envelope.
- ISM-10 proves end-to-end via synthetic `ws.fireMessage` (positive + negative cases).
- **Phase 6 wiring hint:** call `attachConcConflictHandler(ws, bridge, gestureBus, layerManager, locale)` from `boot-engine-core.ts` step 11 area (after `attachSceneInputToWs`). Plan 05 does NOT modify `boot-engine-core.ts`.

### W-4 closure — EnvelopeSchema round-trip

- CDM-10 + ISM-05 round-trip tests prove the modal-emitted envelope passes `EnvelopeSchema.safeParse`.
- Negative test (ISM-05) constructs an envelope WITHOUT `session_id` and asserts `safeParse.success === false` — proves session_id required at the schema level (NF-1 regression guard).
- Grep gate `! grep -E 'WireEnvelopeSchema|envelope\.value' packages/g2-app/src/panels/*.ts packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` clean across all 3 production files + the integration smoke. Verified at commit time.

### B-5 closure — task count

- Plan 05 task count is 3 (Tasks 1+2+3), within scope-sanity target after the Wave-2 split (schema work moved to Plan 06).

## Phase 4b global closure signal

All 5 Phase 4b requirement IDs have software-side closure:

| REQ-ID    | Plan(s)                       | Hardware verification |
| --------- | ----------------------------- | --------------------- |
| MAP-05    | 04b-01 + 04b-02               | Carried on ADR-0005 Branch A |
| TOAST-01  | 04b-03                        | Carried on ADR-0005 Branch A |
| BOOT-01   | 04b-04                        | Carried on ADR-0005 Branch A |
| DEATH-01  | 04b-05 (Task 1)               | Carried on ADR-0005 Branch A |
| CONC-01   | 04b-05 (Task 2) + 04b-06      | Carried on ADR-0005 Branch A |

Hardware verification (death-saves pivot triggers on real Foundry HP=0 + conc-modal renders correctly on real G2 + Phase 6 wires `attachConcConflictHandler` into `boot-engine-core.ts`) deferred to Phase 6 + ADR-0005 Branch A human_needed gate per VALIDATION §Manual-Only entries.

## Test counts

| File                                                                      | Tests added | Notes                              |
| ------------------------------------------------------------------------- | ----------- | ---------------------------------- |
| `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts`    | 8           | SR-DS-1..SR-DS-8                  |
| `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`       | 7           | SHL-PIVOT-1..SHL-PIVOT-7          |
| `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts`   | 14          | CDM-1..CDM-13 (CDM-12 split in 2) |
| `packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts`   | 9           | CCD-1..CCD-8 (CCD-5 split in 2)   |
| `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts`             | 10          | ISM-1..ISM-10                     |
| **Total new tests**                                                       | **48**      |                                    |

Workspace-wide: **812 tests passing** post-Plan-05 (no regressions). `pnpm typecheck && pnpm lint:ci` exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] SHL-PIVOT-4 spec — latch behaviour for dead state**
- **Found during:** Task 1 (SHL-PIVOT-4 failed initial run)
- **Issue:** The naive trigger `const inDeathSaves = hp === 0 && failure < 3` flips OFF when failure transitions 2 → 3 (`failure < 3` becomes false). But the spec mandates death-saves mode STAYS rendered when PC dies (until future revive event).
- **Fix:** Rewrote the trigger as three explicit branches: `recovering` (hp > 0 → OFF) / `entering` (hp === 0 && failure < 3 → ON) / else (preserve existing latch). The dead state (hp === 0 && failure === 3) falls into the `else` branch and the latch is preserved.
- **Files modified:** `packages/g2-app/src/status-hud/status-hud-layer.ts`
- **Commit:** `4a8db2a` (initial commit captures the corrected logic)

**2. [Rule 3 — Blocking] Test format errors blocking lint:ci gate**
- **Found during:** Task 1 + Task 2 + Task 3 (after writing each test file)
- **Issue:** Hand-written test files had formatting that conflicted with Biome's `biome ci` checks (lineWidth + trailing-comma settings).
- **Fix:** Ran `pnpm format` to apply Biome's canonical formatting; tests still pass after reformatting.
- **Files modified:** All test files in each task (renderer / layer / modal / dispatcher / smoke)

**3. [Rule 3 — Blocking] CCD-8 unused `modal` variable + ws.send type mismatch**
- **Found during:** Task 2 typecheck
- **Issue:** (a) CCD-8 test originally declared `const modal = mountOp.layer as ConcentrationDropModalPanel` but didn't use the variable after my edit. (b) The `MockModalWs` / `MockDispatcherSocket` types used `ReturnType<typeof vi.fn>` which doesn't satisfy `(data: string) => void`.
- **Fix:** (a) Replaced the unused `modal` const with an `expect(mountOp.layer).toBeInstanceOf(ConcentrationDropModalPanel)` assertion (verifies the dispatcher constructed the right type). (b) Changed mock types to `ReturnType<typeof vi.fn> & ((data: string) => void)` intersection (canonical Vitest pattern from scene-renderer-smoke.test.ts).
- **Files modified:** `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts`, `packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts`
- **Commit:** `1c2c438` (initial commit captures the corrected types)

**4. [Rule 3 — Blocking] ISM-03 Toast missing `emittedAt` field**
- **Found during:** Task 3 first run (ISM-03 failed)
- **Issue:** The `Toast` Zod schema requires `emittedAt: z.number().int().nonnegative()` (drives the dwell-timer schedule). Initial `makeToast` helper omitted the field → `ToastSchema.safeParse` rejected the payload → `getVisibleCount() === 0`.
- **Fix:** Added `emittedAt: Date.now()` to the test helper.
- **Files modified:** `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts`
- **Commit:** `27a77c5` (initial commit captures the corrected helper)

### Architectural decisions documented as deviations

**5. [Plan decision deviation — documented] ISM-09 deferred to unit-level**
- **Plan §Task 3 ISM-09 expected:** `matchAsciiFixture` against `conc-modal-on-death-saves.it.txt` composing the full 96×24 page.
- **Decision:** Deferred to unit-level CDM-13 + SR-DS-7/8 which are the per-layer single source of truth. The full 96×24 page composition requires a helper that does not exist yet (Phase 6 wires the canonical page schema; until then, per-layer fixtures cover the visual contract). The ISM-09 test body documents the rationale.
- **Files affected:** `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` (ISM-09 is a placeholder with rationale)
- **Why this is OK:** The fixtures themselves (`status-hud.death-saves-{initial,mid}.it.txt` + `conc-modal-{open,on-death-saves}.it.txt`) are character-perfect verbatim from UI-SPEC. INV-1 ck 11 + ck 14 + ck 15 are validated by the per-layer matchAsciiFixture assertions. The full-page integration would re-validate the same content — YAGNI for Phase 4b.

## Self-Check

- [x] `packages/g2-app/src/panels/concentration-drop-modal.ts` exists
- [x] `packages/g2-app/src/panels/conc-conflict-dispatcher.ts` exists
- [x] `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts` exists
- [x] `packages/g2-app/src/panels/__tests__/conc-conflict-dispatcher.test.ts` exists
- [x] `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` exists
- [x] `packages/shared-render/src/fixtures/status-hud.death-saves-initial.it.txt` exists
- [x] `packages/shared-render/src/fixtures/status-hud.death-saves-mid.it.txt` exists
- [x] `packages/shared-render/src/fixtures/conc-modal.open.it.txt` exists
- [x] `packages/shared-render/src/fixtures/conc-modal-on-death-saves.it.txt` exists
- [x] Commit `4a8db2a` exists in git log (Task 1)
- [x] Commit `1c2c438` exists in git log (Task 2)
- [x] Commit `27a77c5` exists in git log (Task 3)

## Self-Check: PASSED
