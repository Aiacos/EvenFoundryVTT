---
status: accepted
date: 2026-05-15
last_amended: 2026-05-15
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning agent)
informed: future contributors
---

# ADR-0009: Layer Manager Contract — mount/destroy/bundle API + capture-container invariant

## Status

**ACCEPTED** — 2026-05-15. Binds Phase 4a (G2 Engine + Raster + Status HUD), Phase 4b (Overlay Slot + Map Mode Toggle), and Phase 5 (Panel Plugin System).

### Confirmation

Plans 02-06 of Phase 4a produced the following test artifacts that prove the
contract behavior end-to-end:

- `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — capture-invariant
  at 0/1/2 capture counts; capability-gate; atomic single-flush bundle (Plan 02).
- `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` — end-to-end boot
  flow with atomic 3-layer bundle and zero capture-invariant violations + Plan 06
  `frame_pixels` WS dispatch (SR-1..SR-10; Plan 05).
- `packages/shared-render/src/fixtures/*.txt` — 9 INV-1 ASCII fixtures locking
  character-perfect layout across raster/glyph/loading states (Plan 04).
- `packages/foundry-module/src/canvas-extractor.test.ts` + `packages/g2-app/src/__tests__/scene-input.test.ts`
  — Foundry PIXI canvas extraction → WS dispatch → `controller.requestFrame` chain
  (Plan 06; foundry-module test colocated beside source per existing convention,
  g2-app test under `__tests__/` per package-local convention).

### PROVISIONAL Hardware Gates (ADR-0005 Branch A)

Five Phase 4a success criteria inherit `human_needed` from [ADR-0005](./0005-phase0-go-no-go.md)
PROVISIONAL Branch A per `04A-VALIDATION.md` §Manual-Only Verifications. The
software-side contract is fully verified by the unit + smoke tests above; these
gates close only when real-G2 grants land via `pnpm --filter @evf/validation-harness validate:all`:

1. Capability handshake on real G2 firmware (DISP-01, DISP-02, NAV-04).
2. Raster sustains ≥5 fps standard / 15 fps stretch with measured BLE p50 latency
   (MAP-02, MAP-04).
3. Branch B/C glyph fallback auto-degrades without operator intervention when
   BLE bandwidth drops below the PROVISIONAL 100 kbps threshold (MAP-04).
4. INV-1 layout holds character-perfect on the real G2 phosphor display under
   IT / EN / DE (DISP-03, I18N-04).
5. PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI
   (Specs §11.5.7 pitfall 11) — Plan 06 ships the extractor; perf gate stays
   `human_needed` until a consenting Foundry world drives it.

### Amendments

- [Amendment 1 (2026-05-15) — Phase 4b composition rules: differential demolish + container budget + in-process gesture-bus](#amendment-1--phase-4b-composition-rules-2026-05-15)

### Amendment 1 — Phase 4b composition rules (2026-05-15)

**Status:** ACCEPTED — extends Option A without overturning it.

**Trigger:** Phase 4b ships the overlay slot machinery (Plan 01 foundation), the
toast queue (Plan 03), the boot-error overlay (Plan 04), and the conc-modal +
death-saves pivot (Plan 05). These features required three composition
clarifications that ADR-0001 Amendment 1's "atomic z=0.5 demolition" rule did
not cover by itself:

1. The toast queue at a new z=1.5 stratum must SURVIVE z=2 overlay open
   (otherwise the user loses pending toasts the moment a panel opens — INV-5
   gesture determinism + Plan 03 stress test ST-2).
2. Plan 05's conc-modal needs an in-process synchronous gesture pipe to react
   to `[Y]` / `[N]` taps without a WS round-trip through the bridge (latency
   would push `tap → close` beyond the 100 ms perceived-immediate threshold).
3. The cumulative container footprint must stay within the SDK 4-image / 8-text
   cap in BOTH the closed-overlay state AND the open-overlay state — without
   the differential demolish rule, the closed state would already hit 9/8 text
   slots once z=1.5 toast lands (overflow).

**Decision (three composition rules):**

- **Rule 1 — Differential demolish (z=0.5 ↔ z=2 atomic swap, preserved from ADR-0001 Amd 1).**
  `LayerManager.bundle()` (see `packages/g2-app/src/engine/layer-manager.ts`)
  detects any `mount(z=Z2_OVERLAY)` op against an occupied `Z0_5_IDLE_INFILL`
  and prefixes the effective op list with an implicit `destroy(z=Z0_5_IDLE_INFILL)`.
  The demolished layer instance is stashed in the private `_suspendedZ05` field.
  The inverse `destroy(z=Z2_OVERLAY)` appends an implicit `mount(z=Z0_5_IDLE_INFILL,
  _suspendedZ05)` op so the SAME idle infill instance is restored on overlay
  close — no transient frame with both visible.

- **Rule 2 — z=1.5 toast carve-out.**
  The differential demolish rule does NOT apply to `Z1_5_TOAST`. A bundle that
  mounts z=2 leaves z=1.5 untouched; subsequent destroy of z=2 also leaves z=1.5
  untouched. Verified by `LMT-DD-04` unit test (Plan 01) and ratified by the
  Plan 03 Fireball + 8-saves stress smoke (toast queue survives a chain of
  modal opens).

- **Rule 3 — In-process panel-gesture-bus.**
  R1 gesture routing inside `packages/g2-app` is in-process (NOT a WS
  round-trip). `packages/g2-app/src/engine/panel-gesture-bus.ts` exports a
  `PanelGestureBus` class with `publish(gesture)` / `subscribe(fn): unsubscribe` /
  `size()` methods. Phase 6 R1 source provider translates SDK
  `CLICK_EVENT` / `DOUBLE_CLICK_EVENT` / `SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT`
  to `R1Gesture` literals (`{ kind: 'tap' | 'scroll' | 'long-press' | 'double-tap' }`)
  and publishes them on the bus; Phase 4b/5 panels subscribe from their
  `onMount()` and unsubscribe from their `onUnmount()`. Per-subscriber
  `try`/`catch` isolation keeps a faulty panel from blocking other subscribers
  (T-4b-01-03 mitigation).

#### Container budget audit

The SDK pins the per-page container cap at `containerTotalNum: 1~12`, with
`textObject: 最多 8 项` and `imageObject: 最多 4 项` (verbatim from
`@evenrealities/even_hub_sdk@0.0.10` `dist/index.d.ts` lines 638-640 + 674-677).
The differential demolish rule keeps the page WITHIN budget in both states:

```
CLOSED STATE (no overlay):
  z=0   MapBaseLayer raster      4 image + 1 capture text  =  4i + 1t
                       glyph     0 image + 2 text          =  0i + 2t
  z=0.5 IdleInfillLayer raster   0 image + 3 text          =  0i + 3t
                        glyph    0 image + 2 text          =  0i + 2t
  z=1   StatusHudLayer           0 image + 1 text          =  0i + 1t
  z=1.5 ToastQueueLayer (Plan 03) 0 image + 1 text         =  0i + 1t
  ────────────────────────────────────────────────────────  ───────
  Page total raster                                         4i + 6t  (cap: 4i + 8t)
  Page total glyph                                          0i + 6t

OPEN STATE (z=2 overlay mounted, z=0.5 demolished per Rule 1):
  z=0   MapBaseLayer raster      4 image + 1 capture text  =  4i + 1t
                       glyph     0 image + 2 text          =  0i + 2t
  z=1   StatusHudLayer           0 image + 1 text          =  0i + 1t
  z=1.5 ToastQueueLayer          0 image + 1 text          =  0i + 1t
  z=2   OverlayPanel (e.g.       0 image + ≤ 3 text/list   =  0i + ≤3t
        ConcDropModalPanel per UI-SPEC §7)
  ────────────────────────────────────────────────────────  ───────
  Page total raster                                         4i + ≤6t (cap: 4i + 8t)
  Page total glyph                                          0i + ≤7t
```

**Verdict:** ✓ both states sit strictly under the 4/8 cap with 2 text slots of
headroom. Enforcement: `LayerManager._assertContainerBudget()` (Plan 01 Task 2)
sums each mounted layer's declared `getContainerCount()` at every bundle flush
and throws `LayerManagerError('panel_mount_budget_exceeded')` if the sum
exceeds the SDK cap.

#### Conc-modal special case (Plan 05)

The conc-modal opens on `dnd5e.preCastSpell` for spells with `requiresConc:
true` (Plan 05). It is a normal z=2 panel — Rule 1 applies (idle infill
demolished, restored on dismiss) and Rule 2 applies (toast queue carve-out).
The death-saves pivot (Plan 05) sits at z=1 (Status HUD stratum), NOT z=2 —
different stratum, no conflict with the modal slot.

#### Consistency check vs original ADR-0001 Amendment 1

- ✓ Atomic z=0.5 ↔ z=2 demolition rule preserved (re-converges with ADR-0001).
- ✓ Container budget invariant preserved (4 image + 8 text/list + 1 capture).
- ✓ Status HUD persistence (z=1) unchanged.
- ✓ Single capture-container invariant unchanged (z=0.5 + z=1.5 still
  render-only).
- ✓ R1 input routing (INV-5) unchanged — top-of-stack `isEventCapture=1` rule
  applies AND Rule 3 in-process bus is the synchronous dispatch path for the
  capturing layer's gestures.
- ✓ Panel Plugin System (Phase 5) contract — extended additively with the
  `OverlayPanel extends Layer` interface (Plan 01 Task 1) plus the
  `isOverlayPanel` runtime guard.

#### Why amend instead of new ADR

The three rules are additive refinements over ADR-0001 Amendment 1 + ADR-0009's
original `bundle()` contract. They do not alter Decision Drivers, Considered
Options, or Decision Outcome — they extend the bundle semantics with:

- Atomic implicit op rewrites (Rule 1's pre/post fixups).
- A new pre-flush invariant (`_assertContainerBudget`).
- A new lifecycle invocation pass (`OverlayPanel.onMount/onUnmount`).
- A new sibling module for in-process gesture routing
  (`panel-gesture-bus.ts`).

A separate ADR would duplicate the LayerManager-contract context and obscure
the dependency between ADR-0001's z=0.5 atomic rule and this Amendment's
z=1.5 carve-out.

#### INV-2 status

Container budget statement (`containerTotalNum: 1~12`, `textObject: 最多 8 项`,
`imageObject: 最多 4 项`) re-verified against
`node_modules/.pnpm/@evenrealities+even_hub_sdk@0.0.10/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
lines 638-640 (CreateStartUpPageContainer) and lines 674-677
(RebuildPageContainer) on 2026-05-15 — drift verdict NEUTRO. The SDK is the
canonical wire-contract source per `Specs.md` §3.1.

#### See Also

- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md`
  §Q1 (container budget audit) + §Q2 (in-process gesture-bus Pattern B) + §Q7
  (recommended Amendment 1 text)
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md`
  §Area 1 (revised differential demolish rule) + §Area 2 (Panel API)
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md`
  §3.1 (overlay slot contract) + §7 (container type inventory + cumulative
  audit)
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-01-PLAN.md`
  (this amendment lands alongside Plan 01 Tasks 1-2 implementation)
- `docs/architecture/0001-layered-ui-model.md` §Amendment 1 (original z=0.5
  atomic rule that Rule 1 here re-converges with)
- `packages/g2-app/src/engine/layer-manager.ts` (bundle() implementation of
  Rules 1-2 + `_assertContainerBudget`)
- `packages/g2-app/src/engine/panel-gesture-bus.ts` (Rule 3 implementation)
- `packages/g2-app/src/engine/layer-types.ts` (Z1_5_TOAST + OverlayPanel +
  R1Gesture surface)

## Context and Problem Statement

Phase 4a introduces the runtime layer system that ADR-0001 + Amendment 1 specified
architecturally. Plans 02-05 need a stable API contract for mounting / destroying
/ bundling layers BEFORE the concrete implementations land, so that downstream
plans (MapBaseLayer, StatusHudLayer, IdleInfillLayer, RasterController) can be
written and tested against the same shape.

Without an explicit, documented LayerManager contract, the four layer-implementing
modules (one per z-index) would each invent their own mount sequence, capture-container
discipline, and capability-gate logic — guaranteeing that the cross-cutting
INV-5 (Gesture Determinism) and the `isEventCapture=1` exactly-one constraint
would drift apart between layers, and the atomic z=0.5 ↔ z=2 transition would
gain a race-prone "two layers visible for one frame" bug (Specs §11.5.8.6).

The contract must:

- Encode the **exactly-one-capture-container** invariant as a runtime assertion
  the manager owns (callers can never accidentally violate it)
- Refuse mounts whose `requiredCaps` are not in the handshake-negotiated
  `SERVER_CAPS_V1` set (no silent capability degradation)
- Expose an atomic `bundle(ops[])` API so the z=0.5 idle infill demolish + z=2
  overlay mount happen in a single `rebuildPageContainer` flush (no intermediate
  frame with both visible)
- Be importable as **types only** from `packages/g2-app/src/engine/layer-types.ts`
  so downstream plan tasks compile at their own commit boundaries without
  forward-importing the concrete LayerManager class (B-4 forward-cycle fix —
  applies symmetrically to `RasterControllerLike`)

## Decision Drivers

- ADR-0001 + Amendment 1 architectural commitments (layered z-stack, single
  capture container, z=0.5 idle infill atomic with z=2)
- INV-1 Layout integrity (Specs §0.1) — no transient layout corruption between
  layer transitions
- INV-4 Code quality (Specs §0.1) — strict types, zero dead code, TSDoc on
  every public API
- INV-5 Gesture Determinism (Phase 6 ratification, binding here) — top-of-stack
  layer with `isEventCapture=1` always owns R1 input
- B-4 forward-import-cycle mitigation (04A-PLAN-CHECK.md) — Plan 03 Task 2 must
  compile at its own commit boundary without depending on Task 3's concrete
  RasterController class

## Considered Options

- **Option A**: Centralized `LayerManager` class with `mount(z, layer, requiredCaps?)`,
  `destroy(z)`, `bundle(ops[])` methods; capture-container invariant enforced
  as a private assertion called after every operation; layer types exported
  from a separate `layer-types.ts` module so test files and other layer
  implementations import contracts (not the manager itself)
- **Option B**: Distributed coordination via observable store — each layer
  publishes its mount/destroy state to a shared store; consumers (e.g., R1
  input router) read the top-of-stack from the store; no central manager class
- **Option C**: Event-bus model — `layerEvents.emit('mount', { z, layer })`;
  any consumer can subscribe; capture-container invariant enforced by a
  dedicated assertion subscriber

## Decision Outcome

**Chosen: Option A — Centralized `LayerManager` class with extracted `layer-types.ts`.**

Justification: Option A is the only one that satisfies BOTH the atomic-bundle
requirement AND the type-only forward-contract requirement (B-4) simultaneously.

- Option B (observable store) cannot guarantee an atomic `unmount-z0.5 + mount-z2`
  flush — the store mutation is observable mid-update, which would leak a
  partial state to any subscriber that fires synchronously between the two
  operations.
- Option C (event-bus) loses error-return clarity. `mount` failure modes
  (`capability_gate_denied`, `z_already_occupied`) need to surface synchronously
  to the caller; emit/listen patterns require out-of-band error channels.
- Option A's centralized class is the simplest place to land both the
  invariant assertion and the bundle serialization.

Separating the type contracts into `layer-types.ts` (this Plan 01) lets:

- `MapBaseLayer` (Plan 03 Task 2) import `RasterControllerLike` type-only — it
  typechecks before `RasterController` (Plan 03 Task 3) is written.
- `StatusHudLayer`, `IdleInfillLayer`, and tests reference `Layer`, `LayerOp`,
  `LayerManagerError`, `LayerManagerErrorCode` without coupling to the manager
  class file.

### Consequences

- **Good:** `LayerManager` is the single place to read about layer lifecycle;
  invariant enforcement is testable in isolation (a single class, no event-bus
  to mock); atomic bundle is a method signature, not a coordination protocol
- **Good:** Type-only imports (`import type { Layer, RasterControllerLike }`)
  break forward-import cycles across plan task boundaries (B-4 closure)
- **Good:** Capability gating is a centralized refusal point — Plan 02 unit
  tests can prove the gate is closed before any layer with missing caps
  reaches `draw()`
- **Neutral/Risk:** The manager becomes a critical singleton; bugs cascade
  across all overlays. Mitigated by:
  - Capture-container invariant unit tests (Plan 02 — explicit `expect(() =>
    mount(...)).toThrow(LayerManagerError)` cases for 0-capture and 2-capture
    scenarios)
  - INV-1 snapshot fixtures via `@evf/shared-render` (Plan 04 — 9 ASCII
    fixtures cover idle/overlay/glyph/IT/EN/DE permutations)
  - Atomic bundle smoke test (Plan 05 — assert single `rebuildPageContainer`
    call per bundle)

### Confirmation

This ADR moves from `proposed` → `accepted` in Phase 4a Plan 05 once:

1. Plan 02 unit tests pass (LayerManager.mount/destroy/bundle + capture-container
   invariant + capability-gate refusal — full matrix)
2. Plan 03 Task 2 (MapBaseLayer) typechecks against `RasterControllerLike` from
   `layer-types.ts` (NOT against the concrete class), confirming B-4 forward-cycle
   closure
3. Plan 05 smoke test asserts atomic `bundle()` issues exactly one
   `rebuildPageContainer` call on the mock `EvenAppBridge`

The transition commit lifts the frontmatter `status` to `accepted` and adds the
ACCEPTED date.

## Pros and Cons of the Options

### Option A — Centralized `LayerManager` class with extracted `layer-types.ts`

- Good: Single source of truth for layer lifecycle; atomic bundle is trivial
  (one method, one private flush); capability gate is one synchronous refusal
  point with typed error
- Good: `layer-types.ts` extracted module enables type-only forward imports —
  unblocks B-4 forward-cycle mitigation
- Good: Test surface is small (one class, mocked `EvenAppBridge`); invariant
  checks are deterministic unit tests
- Neutral: Tight coupling between the manager and `EvenAppBridge` — acceptable
  because there is only one bridge instance per app boot (Phase 4a constraint)
- Bad: Single point of failure; bugs cascade. Mitigated by exhaustive unit
  tests in Plan 02 + INV-1 snapshots in Plan 04.

### Option B — Observable store, no manager class

- Good: Familiar reactive pattern matches `wizard/state.ts`
- Bad: Cannot encode atomic bundle — store mutations are observable mid-update
- Bad: Capture-container invariant enforcement becomes an out-of-band
  subscriber; no synchronous error return for callers
- Bad: Capability-gate refusal would surface asynchronously via store error
  flag — caller can't `try/catch` mount

### Option C — Event-bus model

- Good: Decouples layer implementations from any central class
- Bad: Same atomic-bundle objection as Option B
- Bad: No synchronous error return; `mount` failure surfaces as a later
  `error` event
- Bad: Multiple subscribers to `mount` events makes invariant enforcement
  brittle (which subscriber runs first?)

## More Information

- **Specs.md:** §2.1 (UI architecture overview), §3.1 (G2 hardware container
  budget), §7.2 (layered render pipeline), §7.4c (Idle Content Infill z=0.5),
  §11.5.8.6 (atomic transition failure-mode)
- **Related ADRs:** [ADR-0001](./0001-layered-ui-model.md) (layered z-stack
  ratification), [ADR-0006](./0006-raster-pipeline-library-stack.md) (raster
  library choices feed `RasterControllerLike` shape), [ADR-0008](./0008-code-quality-configuration.md)
  (TS strict + Biome rules apply to `layer-types.ts`)
- **Phase entry-gate citations:** Phase 4a Plan 01 (this ADR scaffolded as
  `proposed` + `layer-types.ts` lands), Plan 02 (LayerManager class implements
  the contract + invariant tests), Plan 03 Task 2 (consumes
  `RasterControllerLike` type-only), Plan 05 (status → `accepted`)
- **Sources:** `hub.evenrealities.com/docs/guides/device-apis` (container budget
  + capture-container constraint verbatim, INV-2 verified Phase 0 + spot-check
  v0.9.12 2026-05-14); .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
  Area 1 (4 locked decisions); .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
  Pattern 3 (capture invariant)
