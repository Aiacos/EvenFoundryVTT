---
status: proposed
date: 2026-05-15
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning agent)
informed: future contributors
---

# ADR-0009: Layer Manager Contract — mount/destroy/bundle API + capture-container invariant

## Status

**PROPOSED** — 2026-05-15. Will move to ACCEPTED in Phase 4a Plan 05 after layer-manager tests are green (capture-container invariant unit tests + atomic bundle smoke test).

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
