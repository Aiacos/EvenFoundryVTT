---
phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui
plan: 01
subsystem: g2-app
tags: [g2-app, engine, overlay, panel-api, adr, wave-0, container-budget, foundation, i18n-budgets, differential-demolish, panel-gesture-bus]

# Dependency graph
requires:
  - phase: 04a-g2-engine-raster-status-hud
    provides: LayerManager + Layer + LayerOp + LayerManagerError + ZIndex enum + capture-container invariant + capability gate + atomic bundle flush; IdleInfillLayer (z=0.5 atomic with z=2); StatusHudLayer + HUD_WIDTH_BUDGETS (9 keys); ADR-0009 ACCEPTED with Amendment 1 placeholder.
provides:
  - ZIndex.Z1_5_TOAST = 1.5 — fractional zindex carve-out for the toast queue (survives z=2 overlay open)
  - OverlayPanel interface (extends Layer with onMount/onUnmount/onEvent) — Phase 5 panels implement verbatim
  - R1Gesture discriminated union (tap | scroll | long-press | double-tap) — Phase 6 wires source provider
  - Layer.getContainerCount?() — Strategy A self-declared footprint for budget summation
  - LayerManagerError.code 'panel_mount_budget_exceeded'
  - isOverlayPanel(layer) runtime type guard
  - PanelGestureBus class — in-process pub/sub for R1 gestures
  - LayerManager.bundle() differential demolish rule (z=0.5 demolish on z=2 mount, z=1.5 carve-out) + container budget assertion + OverlayPanel lifecycle invocation
  - LayerManager.getLayer(z) test-only diagnostic accessor
  - HUD_WIDTH_BUDGETS extended with 27 Phase 4b keys (36 total)
  - ADR-0009 Amendment 1 filled and ACCEPTED (3 composition rules + container budget audit tables + in-process gesture-bus rationale)
affects:
  - 04b-02-PLAN (map-mode toggle Quick Action [M]) — consumes setMapMode + Z1_5_TOAST awareness
  - 04b-03-PLAN (toast queue ToastQueueLayer) — consumes Z1_5_TOAST + HUD_WIDTH_BUDGETS toast_* keys
  - 04b-04-PLAN (boot-error overlay) — consumes OverlayPanel + HUD_WIDTH_BUDGETS boot_error_* keys + container budget assertion
  - 04b-05-PLAN (conc-modal + death-saves pivot) — consumes OverlayPanel + PanelGestureBus + isOverlayPanel + HUD_WIDTH_BUDGETS conc_modal_* + death_saves_* keys + differential demolish integration smoke
  - 05-panel-plugin-system — consumes the OverlayPanel contract end-to-end

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union gesture surface — R1Gesture with `kind` discriminator (distinct from LayerOp.type to avoid cross-narrowing)"
    - "Runtime type guard pattern for interface composition — isOverlayPanel(layer) duck-typed on three lifecycle method names; no abstract base class"
    - "In-process pub/sub with per-subscriber try/catch isolation — PanelGestureBus.publish iterates an Array snapshot, isolates throws to console.warn telemetry, drops gestures on zero subscribers (no buffering)"
    - "Differential bundle rewrites — LayerManager.bundle() inspects ops for the z=2 mount/destroy pattern and inserts implicit z=0.5 destroy/mount ops atomically in the same flush"
    - "Self-declared container footprint — Layer.getContainerCount() optional method returns { image, text }; LayerManager._assertContainerBudget sums them against the SDK cap"
    - "Centralised i18n-budgets extension in Wave 0 — downstream plans become READ-ONLY consumers, eliminating same-wave file-overlap conflicts (architectural Wave dependency optimisation)"

key-files:
  created:
    - packages/g2-app/src/engine/overlay-panel.ts
    - packages/g2-app/src/engine/panel-gesture-bus.ts
    - packages/g2-app/src/engine/__tests__/overlay-panel.test.ts
    - packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md
  modified:
    - packages/g2-app/src/engine/layer-types.ts
    - packages/g2-app/src/engine/layer-manager.ts
    - packages/g2-app/src/engine/__tests__/layer-manager.test.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - docs/architecture/0009-layer-manager-contract.md

key-decisions:
  - "Differential demolish rule encoded in LayerManager.bundle() (not in a separate composer) — keeps the atomic single-flush invariant as a single method's contract"
  - "z=1.5 (Z1_5_TOAST) is NOT subject to differential demolish — toast queue is a peer of the overlay slot, not a sibling of idle infill; UI-SPEC §3.2 carve-out + INV-5 gesture determinism"
  - "Layer.getContainerCount default value is { image: 0, text: 1 } when method omitted — matches the most common no-capture layer (StatusHud, IdleInfill glyph mode, ToastQueue)"
  - "OverlayPanel onMount/onUnmount run AFTER _assertCaptureInvariant + _assertContainerBudget pass; rejection of onMount aborts the bundle BEFORE bridge.rebuildPageContainer — the layer remains in `layers` (caller's responsibility to destroy + retry)"
  - "PanelGestureBus drops gestures on zero subscribers (no buffering); late-mounting panels do NOT receive historical gestures — justified by INV-5 gesture determinism (phantom replay would surprise the user)"
  - "PanelGestureBus.publish snapshots subscribers via Array.from BEFORE iteration so an onEvent that unsubscribes mid-publish does not corrupt the in-flight fan-out"
  - "Wave-0 centralisation of HUD_WIDTH_BUDGETS additions — Plans 03/04/05 are READ-ONLY consumers; eliminates same-wave file-overlap conflicts in Wave 2 + Wave 3"
  - "ADR-0009 Amendment 1 filled in the same commit as the implementing code, dated 2026-05-15 — INV-2 SDK citation lines 638-640 + 674-677 of @evenrealities/even_hub_sdk@0.0.10 dist/index.d.ts"

patterns-established:
  - "Engine type contract surface lives in layer-types.ts as TYPES + a single thin class (LayerManagerError) — pure runtime modules import these and add behavior; tests assert the type-level contract via co-located vitest specs that exercise both the runtime predicate AND its narrowing proof"
  - "When introducing a new error code, extend the LayerManagerErrorCode union and ALSO add a JSDoc bullet under the union (the bullet is the only human-readable spec until the implementing class lands)"
  - "Sub-tests use LMT-DD-NN / LMT-OP-NN / LMT-CB-NN discriminator markers in `it()` titles so grep + plan-checker can correlate test coverage with plan behavior bullets"

requirements-completed: [MAP-05]  # overlay-portion only (toggle-portion lands in Plan 02; MAP-05 fully verified in Plan 05 integration smoke)

# Metrics
duration: 22 min
completed: 2026-05-15
---

# Phase 4b Plan 01: Overlay Slot Foundation Summary

**OverlayPanel + Z1_5_TOAST + panel-gesture-bus + differential demolish rule encoded in LayerManager.bundle() and formalised in ADR-0009 Amendment 1 — Phase 4b Wave-0 foundation that Plans 02-05 build on as READ-ONLY consumers.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-05-15T14:31:49Z
- **Completed:** 2026-05-15T14:53:51Z
- **Tasks:** 4
- **Files modified:** 10 (+ 1 SUMMARY)

## Accomplishments

- Extended `ZIndex` enum with `Z1_5_TOAST = 1.5` (fractional carve-out between Status HUD and overlay slot) and `Layer` with optional `getContainerCount` (Strategy A self-declared footprint).
- Shipped the `OverlayPanel extends Layer` interface (3 lifecycle hooks: `onMount` / `onUnmount` / `onEvent`), the `R1Gesture` discriminated union, and the `isOverlayPanel` runtime type guard — Phase 5 panel contract is now stable.
- Added the in-process `PanelGestureBus` class (`publish` / `subscribe` / `size`) with per-subscriber try/catch isolation, idempotent unsubscribe closure, and snapshot-before-fan-out semantics — the routing primitive Phase 6 R1 source provider feeds into.
- Encoded the differential demolish rule + container budget assertion + OverlayPanel lifecycle invocation in `LayerManager.bundle()`. The implementation rewrites the input op list so any `mount(z=Z2_OVERLAY)` against an occupied `Z0_5_IDLE_INFILL` is atomically preceded by an implicit `destroy(z=0.5)` (stash → restore on inverse), while z=1.5 toast is left untouched.
- Centralised all 27 Phase 4b new HUD width-budget keys in `i18n-budgets.ts` (Wave-0 centralisation): 3 death-saves + 2 toast + 16 boot-error + 6 conc-modal. `HUD_WIDTH_BUDGETS` is now 36 keys; downstream Plans 03/04/05 will be READ-ONLY consumers.
- Filled ADR-0009 Amendment 1 with the 3 composition rules, the closed-state + open-state container budget audit tables, the in-process gesture-bus rationale, and the INV-2 SDK citation (`@evenrealities/even_hub_sdk@0.0.10 dist/index.d.ts` lines 638-640 + 674-677, re-verified 2026-05-15).

## ZIndex Enum (Plan 01 Final)

| Constant | Value | Role | Capture? | Demolished on z=2 mount? |
|---|---|---|---|---|
| `Z0_MAP` | 0 | Backdrop scene (raster/glyph) | yes (during closed state) | no |
| `Z0_5_IDLE_INFILL` | 0.5 | Combat-log / label / stats strip when no overlay | no | **YES — differential demolish (Rule 1)** |
| `Z1_STATUS_HUD` | 1 | Always-visible corner card | no | no |
| `Z1_5_TOAST` | 1.5 | Toast queue (Plan 03) | no | **NO — carve-out (Rule 2)** |
| `Z2_OVERLAY` | 2 | Modal/overlay slot | when mounted | n/a (this IS the trigger) |

## Container Budget Audit (from ADR-0009 Amendment 1)

```
CLOSED STATE (no overlay):
  z=0   MapBaseLayer raster      4 image + 1 capture text  =  4i + 1t
                       glyph     0 image + 2 text          =  0i + 2t
  z=0.5 IdleInfillLayer raster   0 image + 3 text          =  0i + 3t
                        glyph    0 image + 2 text          =  0i + 2t
  z=1   StatusHudLayer           0 image + 1 text          =  0i + 1t
  z=1.5 ToastQueueLayer (Plan 03) 0 image + 1 text         =  0i + 1t
  Page total raster                                         4i + 6t
  Page total glyph                                          0i + 6t

OPEN STATE (z=2 overlay mounted, z=0.5 demolished per Rule 1):
  z=0   MapBaseLayer raster      4 image + 1 capture text  =  4i + 1t
                       glyph     0 image + 2 text          =  0i + 2t
  z=1   StatusHudLayer           0 image + 1 text          =  0i + 1t
  z=1.5 ToastQueueLayer          0 image + 1 text          =  0i + 1t
  z=2   OverlayPanel             0 image + ≤ 3 text/list   =  0i + ≤3t
  Page total raster                                         4i + ≤6t
  Page total glyph                                          0i + ≤7t
```

**Verdict:** Both states sit strictly within the SDK 4-image / 8-text cap with 2 text slots of headroom in the worst case. Enforced at every bundle flush by `LayerManager._assertContainerBudget()`.

## ADR-0009 Amendment 1 Three Composition Rules (verbatim)

- **Rule 1** — Differential demolish (z=0.5 ↔ z=2 atomic swap, preserved from ADR-0001 Amd 1).
  `LayerManager.bundle()` detects any `mount(z=Z2_OVERLAY)` op against an occupied `Z0_5_IDLE_INFILL` and prefixes the effective op list with an implicit `destroy(z=Z0_5_IDLE_INFILL)`. The demolished layer instance is stashed in the private `_suspendedZ05` field. The inverse `destroy(z=Z2_OVERLAY)` appends an implicit `mount(z=Z0_5_IDLE_INFILL, _suspendedZ05)` op so the SAME idle infill instance is restored on overlay close — no transient frame with both visible.

- **Rule 2** — z=1.5 toast carve-out.
  The differential demolish rule does NOT apply to `Z1_5_TOAST`. A bundle that mounts z=2 leaves z=1.5 untouched; subsequent destroy of z=2 also leaves z=1.5 untouched. Verified by `LMT-DD-04` unit test (Plan 01) and ratified by the Plan 03 Fireball + 8-saves stress smoke (toast queue survives a chain of modal opens).

- **Rule 3** — In-process panel-gesture-bus.
  R1 gesture routing inside `packages/g2-app` is in-process (NOT a WS round-trip). `panel-gesture-bus.ts` exports a `PanelGestureBus` class with `publish(gesture) / subscribe(fn): unsubscribe / size()` methods. Phase 6 R1 source provider translates SDK `CLICK_EVENT / DOUBLE_CLICK_EVENT / SCROLL_TOP_EVENT / SCROLL_BOTTOM_EVENT` to `R1Gesture` literals and publishes them; Phase 4b/5 panels subscribe from `onMount()` and unsubscribe from `onUnmount()`. Per-subscriber `try/catch` isolation keeps a faulty panel from blocking others (T-4b-01-03 mitigation).

## Task Commits

Each task was committed atomically:

1. **Task 1: layer-types + overlay-panel + panel-gesture-bus + tests** — `f4aa24b` (feat)
2. **Task 2: LayerManager.bundle() differential demolish + container budget + panel lifecycle** — `e10297a` (feat)
3. **Task 3: i18n-budgets extension (27 new Phase 4b keys)** — `a8c3af1` (feat)
4. **Task 4: ADR-0009 Amendment 1 filled** — `7aa0f14` (docs)

_(Task 2 commit also folded a follow-up cleanup of two unused biome-ignore suppression comments in `overlay-panel.test.ts` introduced by Task 1.)_

## Test Counts (per file, after Plan 01)

| File | Tests before | Tests after | Δ |
|---|---|---|---|
| `packages/g2-app/src/engine/__tests__/overlay-panel.test.ts` | (new) | 6 | +6 (OP-1..3 + sub-cases) |
| `packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts` | (new) | 7 | +7 (PGB-1..7) |
| `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` | 10 (Phase 4a) | 28 | +18 (LT-1..5 + LMT-DD-01..06 + LMT-OP-01..04 + LMT-CB-01..03) |
| `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` | 8 (Phase 4a) | 23 | +15 (IB-DS-1..3 + IB-TQ-1..2 + IB-BE-1..4 + IB-CM-1..3 + IB-ALL-1..3) |
| **g2-app suite total** | **274** | **320** | **+46** |
| **Workspace total** | **606** | **652** | **+46** |

All 652 workspace tests pass; `pnpm typecheck` + `pnpm lint:ci` exit 0.

## Files Created/Modified

**Created (5):**
- `packages/g2-app/src/engine/overlay-panel.ts` — `isOverlayPanel(layer)` runtime type guard for the OverlayPanel interface.
- `packages/g2-app/src/engine/panel-gesture-bus.ts` — `PanelGestureBus` class with `publish` / `subscribe` / `size`.
- `packages/g2-app/src/engine/__tests__/overlay-panel.test.ts` — 6 tests (OP-1..3 + sub-cases for missing onMount/onUnmount/onEvent).
- `packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts` — 7 tests (PGB-1..7).
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md` — this file.

**Modified (6):**
- `packages/g2-app/src/engine/layer-types.ts` — added `Z1_5_TOAST = 1.5`, `Layer.getContainerCount?()`, `R1Gesture` union, `OverlayPanel` interface, `LayerManagerErrorCode` 'panel_mount_budget_exceeded'.
- `packages/g2-app/src/engine/layer-manager.ts` — added `_suspendedZ05` field, `_assertContainerBudget()` method, `getLayer(z)` test-diagnostic accessor; extended `bundle()` with differential demolish rule + lifecycle invocation + budget enforcement.
- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — added 18 new tests across 2 describe blocks (LT-1..5 + LMT-DD-* + LMT-OP-* + LMT-CB-*).
- `packages/g2-app/src/status-hud/i18n-budgets.ts` — appended 27 Phase 4b keys verbatim from UI-SPEC §4.1-§4.4.
- `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` — added 15 extension tests + refined existing IB-3 to skip literal-length check for `*_template` keys.
- `docs/architecture/0009-layer-manager-contract.md` — filled Amendment 1 (was placeholder) with the three composition rules + container budget audit tables + INV-2 citation + cross-reference block.

## Decisions Made

Captured in frontmatter `key-decisions` above. The most architecturally load-bearing:

1. Differential demolish rule is encoded in `LayerManager.bundle()` itself (not a separate composer) so the single-flush invariant remains the contract of one method.
2. `Z1_5_TOAST` is a peer of `Z2_OVERLAY` (carve-out from differential rule) — toast survival is part of the layer composition spec, not opt-in panel logic.
3. `Layer.getContainerCount` defaults to `{ image: 0, text: 1 }` when omitted — matches the dominant no-capture layer shape and keeps existing IdleInfillLayer / StatusHudLayer correctness without forcing them to declare counts.
4. Wave-0 centralisation of i18n-budgets extension is an explicit architectural decision (not opportunistic refactor) — eliminates Wave-2 file-overlap conflicts between Plans 03 + 04.
5. `PanelGestureBus.publish` snapshots subscribers via `Array.from` before iteration to keep mid-fan-out unsubscribes from corrupting the in-flight dispatch — concurrency hazard caught at design time, not in production debugging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan vs UI-SPEC boot-error key count discrepancy**
- **Found during:** Task 3 (i18n-budgets extension)
- **Issue:** The plan summary text claimed "17 boot-error keys" / "28 Phase 4b new keys" / "37 total HUD_WIDTH_BUDGETS keys". UI-SPEC §4.3 (the design contract per `04B-UI-SPEC.md` lines 297-312) enumerates exactly 16 boot-error rows verbatim: 5 titles + 5 hint pairs (×2) + 1 close label.
- **Fix:** Followed UI-SPEC (the design contract). Landed 16 boot_error keys; total Phase 4b new = 27 (= 3 death-saves + 2 toast + 16 boot-error + 6 conc-modal); total table = 36 (= 9 Phase 4a + 27 Phase 4b). Updated `IB-BE-4` expectation 17→16, `IB-ALL-1` expectation 37→36 with comments referencing this deviation.
- **Files modified:** `packages/g2-app/src/status-hud/i18n-budgets.ts`, `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
- **Verification:** All 23 i18n-budgets tests pass; grep gates match (`boot_error_(title|hint|close)` = 16 in source, 27 Phase 4b key entries in `PHASE_4B_KEYS` array).
- **Committed in:** `a8c3af1` (Task 3 commit)
- **Impact:** No behaviour change — the plan's `<interfaces>` table inline matched UI-SPEC (16 rows), only the summary count text was off. Downstream Plan 04 reads boot_error keys by name, not by count.

**2. [Rule 1 — Bug] Existing IB-3 length assertion too strict for template keys**
- **Found during:** Task 3 (i18n-budgets test extension)
- **Issue:** The Phase 4a IB-3 test enforces `row.it.length <= row.max` for every key. `toast_squash_badge_template` has IT/EN/DE value `'[+{n}]'` (length 6) with max 5 — the template's `{n}` placeholder renders to a runtime value (e.g. `'12'`) of length 1-2, so the *rendered* string fits the budget, but the template literal itself does not.
- **Fix:** Refined IB-3 to skip the literal-length check for keys ending in `_template`. Runtime `assertWithinBudget` still validates the rendered string at draw time. Updated JSDoc on IB-3 explaining the carve-out.
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts`
- **Verification:** `pnpm --filter @evf/g2-app test` passes for all 23 i18n tests including the refined IB-3.
- **Committed in:** `a8c3af1` (Task 3 commit)

**3. [Rule 1 — Bug] makeOverlayPanelStub default `captureContainer` swallowed `undefined`**
- **Found during:** Task 2 (initial RED on Phase 4b LMT tests)
- **Issue:** Test helper signature `captureContainer: string | undefined = 'overlay-capture'` — passing `undefined` explicitly still triggers the JS default, silently turning no-capture panels into capture providers and corrupting the capture-invariant accounting. 12 of 18 new tests failed with "found 2 capture containers".
- **Fix:** Removed the default — third parameter is now REQUIRED. Updated JSDoc to call out the trap.
- **Files modified:** `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`
- **Verification:** After the helper fix, only 3 of the 18 new tests still failed (LMT-OP-01, LMT-OP-04, LMT-CB-01), each due to my own test logic assuming panel-as-capture in cases where map was destroyed. Those were corrected before commit.
- **Committed in:** `e10297a` (Task 2 commit)

**4. [Rule 1 — Bug] Biome-ignore suppressions on `delete` operator deemed unused**
- **Found during:** Task 1 → Task 2 transition (biome warned but did not error)
- **Issue:** Initial `overlay-panel.test.ts` used `delete obj.field` to remove panel lifecycle hooks from a stubbed object. Biome's `lint/performance/noDelete` is in the `warn` (not `error`) tier in the project config, so the suppression comments were unused. Setting `field = undefined` failed TS `exactOptionalPropertyTypes`. Rest-spread destructure (`const { onMount: _drop, ...partial } = full`) cleanly omits the field without delete or undefined-assign.
- **Fix:** Switched all three OP-2 tests to rest-spread destructure. Biome warnings dropped 140 → 137.
- **Files modified:** `packages/g2-app/src/engine/__tests__/overlay-panel.test.ts`
- **Verification:** `pnpm lint:ci` exit 0, no warnings on the three modified tests; vitest still passes.
- **Committed in:** folded into `e10297a` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — plan/test/helper bugs found at execution time, no Rule 2/3/4 needed).
**Impact on plan:** All four were corrections to plan-text inconsistencies (#1) or test/helper code mechanics (#2-4). No scope creep, no architectural change, no INV invalidation. The plan's behaviour spec was honoured 1:1 against UI-SPEC verbatim values; the count text in the plan summary was the only thing that needed reconciling.

## Issues Encountered

- **Initial RED → GREEN cycle on Task 2 required two iterations of test-fixture corrections** (the `makeOverlayPanelStub` default-undefined trap and the LMT-OP-* setups that destroyed `z=0` without giving the panel a capture container). Resolved within Task 2 boundary; no extra commit boundary required.
- **`biome ci` flagged formatting + import-sort issues** on the Task 1 and Task 2 files. Auto-fixed by `biome check --write` (idempotent), zero behaviour change.

## Phase 6 Follow-up Note

The `R1Gesture` union ships a `kind: 'long-press'` variant that is NOT in the canonical SDK enum. Per the in-source TODO at `packages/g2-app/src/engine/layer-types.ts`:

```
TODO(ADR-0009): Phase 6 long-press source channel — derive from CLICK_EVENT
timing or use a separate SDK channel (see 04B-RESEARCH §Q2). `kind: 'long-press'`
is stubbed here for forward-compat so panels can pattern-match Phase 5 already.
```

Exactly 1 TODO ref in `layer-types.ts` (target met per plan output spec).

## Next Phase Readiness

Plans 02-05 of Phase 4b can now import from Plan 01's deliverables:

- `ZIndex.Z1_5_TOAST` (Plan 03 mounts toast queue there)
- `OverlayPanel` interface (Plan 05 `ConcDropModalPanel` implements verbatim)
- `R1Gesture` union (Plan 05 `[Y]` / `[N]` button handlers pattern-match on `kind: 'tap'` / `kind: 'double-tap'`)
- `isOverlayPanel(layer)` guard (LayerManager internal; tests can also use it)
- `PanelGestureBus` class (Plan 05 conc-modal subscribes in `onMount`, unsubscribes in `onUnmount`)
- Differential demolish rule in `LayerManager.bundle()` (Plan 05 integration smoke + Plan 03 toast-survives-overlay stress test rely)
- All 27 Phase 4b new `HUD_WIDTH_BUDGETS` keys (Plans 03/04/05 read-only; no downstream modifications)

**Wave-2 file-overlap status:** Plans 03 + 04 will NOT modify `i18n-budgets.ts` (Plan 01 absorbed all extensions). Plan 03 modifies the toast queue layer + integrates with `LayerManager` (consumer of bundle API). Plan 04 modifies a boot-error overlay panel (consumer of OverlayPanel interface). No file overlap.

**Wave-3 readiness:** Plan 05 (conc-modal + death-saves pivot) consumes the full Wave-0 deliverable surface end-to-end. Plan 05 is the integration smoke that ratifies the three composition rules under real layer composition.

## Self-Check: PASSED

Files claimed:
- `[FOUND]` packages/g2-app/src/engine/overlay-panel.ts
- `[FOUND]` packages/g2-app/src/engine/panel-gesture-bus.ts
- `[FOUND]` packages/g2-app/src/engine/__tests__/overlay-panel.test.ts
- `[FOUND]` packages/g2-app/src/engine/__tests__/panel-gesture-bus.test.ts
- `[FOUND]` packages/g2-app/src/engine/layer-types.ts (modified)
- `[FOUND]` packages/g2-app/src/engine/layer-manager.ts (modified)
- `[FOUND]` packages/g2-app/src/engine/__tests__/layer-manager.test.ts (modified)
- `[FOUND]` packages/g2-app/src/status-hud/i18n-budgets.ts (modified)
- `[FOUND]` packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts (modified)
- `[FOUND]` docs/architecture/0009-layer-manager-contract.md (modified)

Commits claimed:
- `[FOUND]` f4aa24b (Task 1)
- `[FOUND]` e10297a (Task 2)
- `[FOUND]` a8c3af1 (Task 3)
- `[FOUND]` 7aa0f14 (Task 4)

Verification commands run:
- `pnpm typecheck` — exit 0 (workspace-wide)
- `pnpm lint:ci` — exit 0 (no errors; 137 pre-existing warnings unchanged)
- `pnpm test` — 652/652 pass (Phase 4a 606 + Phase 4b Plan 01 +46)

---
*Phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui*
*Plan: 01*
*Completed: 2026-05-15*
