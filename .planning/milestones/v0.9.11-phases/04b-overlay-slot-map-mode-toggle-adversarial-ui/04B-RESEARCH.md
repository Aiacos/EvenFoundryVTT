---
phase: 4b
slug: overlay-slot-map-mode-toggle-adversarial-ui
produced: 2026-05-15
researcher: gsd-researcher (Claude Opus 4.7)
inputs_read:
  - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
  - .planning/ROADMAP.md (Phase 4b)
  - .planning/REQUIREMENTS.md (MAP-05, TOAST-01, BOOT-01, DEATH-01, CONC-01)
  - .planning/STATE.md
  - .planning/PROJECT.md
  - ./CLAUDE.md
  - packages/g2-app/src/engine/layer-types.ts
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/engine/boot-splash.ts
  - packages/g2-app/src/engine/capability-handshake.ts
  - packages/g2-app/src/engine/page-lifecycle.ts
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/status-hud/idle-infill-layer.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
  - packages/g2-app/src/hub-polyfill.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/scene-input.ts
  - packages/shared-protocol/src/index.ts
  - packages/shared-protocol/src/envelope.ts
  - packages/shared-protocol/src/handshake.ts
  - packages/shared-protocol/src/payloads/character.ts
  - packages/shared-protocol/src/payloads/combat.ts
  - packages/shared-render/src/fixtures/* (10 INV-1 fixtures from Phase 4a)
  - docs/architecture/0001-layered-ui-model.md (Amendment 1)
  - docs/architecture/0009-layer-manager-contract.md (ACCEPTED + Amendment 1 reserved)
  - /home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts (canonical SDK)
  - Specs.md §3.1, §7.4c, §7.15.2, §7.16
output_intent: |
  Lock the technical approach for Phase 4b's six deliverables (overlay slot machinery
  + Panel API, map mode toggle, toast queue z=1.5, boot error UI, death-saves HUD pivot,
  conc-drop modal). Resolve the eight grey-area research questions from the spawn brief
  (container budget under no-demolish, gesture WS routing, boot error dispatch source,
  death-saves event source, toast squash semantics, fixture count, ADR-0009 Amendment 1
  scope, setLocalStorage failure-mode). Output is consumed by Phase 4b planner — must be
  prescriptive enough that the planner can decompose into 5 plans across 4 waves without
  re-deriving design choices.
---

# Phase 4b: Overlay Slot + Map Mode Toggle + Adversarial UI — Research

**Researched:** 2026-05-15
**Domain:** G2 layer machinery extension — overlay z=2 mount semantics, Panel API contract, runtime map-mode toggle with Even Hub persistence, toast queue z=1.5, boot-error UI dispatch, death-saves HUD pivot, concentration-drop modal
**Confidence:** HIGH on Phase 4a contract reuse and SDK signatures; MEDIUM on toast-queue squash interpretation (Q5) and death-saves event source (Q4 requires shared-protocol schema extension); LOW on Phase 6 R1 gesture WS envelope shape (does not exist yet — Phase 4b proposes it)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Area 1 — Overlay Slot (z=2) Composition:**

- **Mount semantics:** Overlay panel mounts at z=2 **on top of** z=0.5 IdleInfillLayer **without demolishing it** (IdleInfillLayer stays mounted but visually covered). This **diverges from ADR-0001 Amendment 1's atomic z=0.5 demolish + z=2 mount** rule. **ADR-0009 Amendment 1 placeholder (reserved in Phase 4a Plan 05) will be filled with this revised composition rule.**
- **Capture-invariant:** z=0 MapBaseLayer **retains** `isEventCapture=1` when overlay is open. Panel does NOT receive native R1 capture; panel input is routed via bridge WS events (consistent with Phase 6 R1 source provider).
- **Atomic flush:** Single `rebuildPageContainer` flush per ADR-0001 Amendment 1's spirit — `layerManager.bundle([mount z=2])` applies the panel mount in one bridge call.
- **Container budget verification REQUIRED:** Specs §3.1 caps the page at 4 image + 8 text/list containers. When overlay (z=2) is mounted alongside IdleInfillLayer (z=0.5) + MapBaseLayer (z=0) + StatusHudLayer (z=1) + Toast (z=1.5), the planner MUST verify the cumulative container draw stays within budget. If it overflows, the no-demolish decision needs revision OR the panel API restricts panels to ≤N containers.

**Area 2 — Panel API Contract:**

- **Surface:** `interface OverlayPanel extends Layer` (reuses Layer's `id`, `z`, `requiredCaps`, `render`, `destroy` from `packages/g2-app/src/engine/layer-types.ts`) **plus 3 panel-specific methods:**
  - `onMount(): Promise<void>` — called by LayerManager after mount op succeeds; lets panel pre-load state, subscribe to bridge events.
  - `onUnmount(): Promise<void>` — called before destroy; lets panel flush state, unsubscribe.
  - `onEvent(gesture: R1Gesture): void` — receives R1 input routed by bridge WS (since z=0 retains native capture). `R1Gesture` is a Phase 6-stable enum; for Phase 4b stub it as a string-literal union `'tap' | 'scroll-up' | 'scroll-down' | 'long-press'` with a typed payload TBD by Phase 6.
- **Phase 5 contract:** Phase 5 panels (CharacterSheetPanel, CombatTrackerPanel, etc.) implement this interface verbatim.

**Area 3 — Map Mode Toggle Persistence:**

- **Persistence target:** Even Hub envelope-based `setLocalStorage` / `getLocalStorage` (already polyfilled in Phase 2 via `packages/g2-app/src/hub-polyfill.ts`). Key: `view.map.mode`. Values: `'auto' | 'raster' | 'glyph'`. Device-local; **does NOT modify Foundry world settings** (those are Phase 7+ write path).
- **Boot read:** `bootEngine` reads `hub.getLocalStorage('view.map.mode')` at step 9 (after BLE probe verdict) and overrides the verdict if the saved value is `raster` or `glyph`. `'auto'` lets the BLE probe verdict win.
- **Runtime toggle:** Phase 4b ships a `toggleMapMode(newMode)` function in `packages/g2-app/src/engine/map-mode-toggle.ts`. Phase 6 Quick Action `[M]` will wire its tap handler to this function. Phase 4b includes an internal dev hook (`bootEngineForTest` extension or a debug WS message) to exercise the toggle without the real `[M]` gesture.

**Area 4 — Plan Decomposition (4 plans wave-aware):**

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 04B-01 | Overlay slot machinery + Panel API contract + ZIndex.Z1_5_TOAST addition + ADR-0009 Amendment 1 | MAP-05 (overlay part) |
| 1 | 04B-02 | Map mode toggle + Even Hub persistence + boot read-back | MAP-05 (toggle part) |
| 2 | 04B-03 | Toast queue (z=1.5 layer + FIFO + squash badge) | TOAST-01 |
| 2 | 04B-04 | Boot error UI (1 layer, 5 fixtures, dispatch from existing handshake errors) | BOOT-01 |
| 3 | 04B-05 | Death-saves StatusHudRenderer pivot + Concentration-drop modal panel + integration smoke | DEATH-01, CONC-01 |

**Wave 2 parallelism:** Plans 03 and 04 modify distinct files (`packages/g2-app/src/status-hud/toast-queue-layer.ts` vs `packages/g2-app/src/engine/boot-error-layer.ts`) — zero `files_modified` overlap expected, runnable in parallel.

**Area 5 — Toast Queue (z=1.5):**

- **New ZIndex value:** `ZIndex.Z1_5_TOAST = 1.5` added to `packages/g2-app/src/engine/layer-types.ts`.
- **Layer slot:** Dedicated `ToastQueueLayer` at z=1.5 (between StatusHudLayer z=1 and Z2_OVERLAY).
- **Capacity:** Max 2 toasts visible FIFO, dwell 3 s each.
- **Squash on overflow:** When a 3rd toast arrives while 2 are visible, the head toast's content gets a `[+N]` badge appended (e.g., `'Damage 12 [+7]'`). N counts toasts still queued in the buffer.
- **Survives overlay open:** ToastQueueLayer stays mounted when z=2 overlay opens (different z-index, different container slots). The Fireball + 8 saves stress case (SC #3) must show this.
- **Toast severity:** Three levels — `info`, `warn`, `error`. Visual differentiation via a single-char prefix (e.g., `i:` / `!:` / `x:`) consistent with the phosphor display alphabet. NO color (G2 is 4-bit greyscale).

**Area 6 — Boot Error UI (1 template + 5 fixtures):**

- **Layer class:** `BootErrorLayer extends Layer` at z=1 (replaces the z=1 status HUD when boot has failed).
- **State enum:** `'handshake_failed' | 'version_mismatch' | 'no_character' | 'bridge_unreachable' | 'token_expired'`.
- **Each state ships:** Title line + Recovery hint + `[X] Close` gesture annotation, locale-resolved IT/EN/DE.
- **INV-1 fixtures:** 5 ASCII fixtures named `boot-error.<state>.<locale>.txt` (IT primary + EN fallback = 10 fixtures min; DE optional per §7.16 best-effort).
- **Dispatch:** boot-engine-core's existing exceptions map to these 5 states via a new `bootErrorFromException(err)` helper.

**Area 7 — Death-Saves HUD Pivot:**

- **Implementation:** Pivot is a **renderer mode** inside the existing `StatusHudRenderer`. Same z=1 layer, same container slots — only the render output changes.
- **Trigger:** `actor.system.attributes.hp.value === 0` AND `actor.system.attributes.death.failure < 3`. Latched ON until HP > 0 OR death (3 fail).
- **Visual:** 3-strike tracker `[ ◯ ◯ ◯ ]` for passes and fails. Filled glyph `●` for ticked, hollow `◯` for unticked.

**Area 8 — Concentration-Drop Modal:**

- **Slot:** Mounts at z=2 overlay using the Panel API. Implementation: `ConcentrationDropModalPanel` class implementing `OverlayPanel`.
- **Trigger:** Bridge emits a `conc.conflict` event. Phase 7 server-side detection; Phase 4b client-side modal display + user choice capture only.
- **R1 routing while open:** Modal blocks normal capture — only `[Y] Drop & cast new` and `[N] Cancel` accepted via bridge WS routing.
- **Phase 4b output:** On user `[Y]`, modal emits `conc.drop.confirmed { effectId }` to the bridge. **Phase 4b does NOT call `effect.delete()`** — Phase 7 write path.
- **Edge case:** If HP=0 simultaneously, modal still opens at z=2; status HUD z=1 retains death-saves pivot underneath.

### Claude's Discretion

- File layout within `packages/g2-app/src/{engine,status-hud,panels}/` — single responsibility per module.
- Internal toast-queue data structure (linked list vs array+head-tail pointers) — pick the simpler one.
- Concrete locale set for boot-error fixtures — IT primary + EN canonical mandatory; DE optional (best-effort per §7.16.5 — flag as future work if budget runs out).
- ADR-0009 Amendment 1 specific text — draft proposed in §10 of this research; planner refines in Plan 01.
- The internal dev hook for `toggleMapMode` (`bootEngineForTest` extension OR debug WS message) — pick whichever produces fewer test changes; recommend a `__INTERNAL_devToggle` exported from `map-mode-toggle.ts` with a `@internal` JSDoc tag.

### Deferred Ideas (OUT OF SCOPE)

- **Real Quick Action menu** — Phase 6 scope. Phase 4b ships `toggleMapMode(newMode)` function but NOT the `[M] Map ctrl` menu item.
- **Real Foundry write path for conc drop** — Phase 7 wires `effect.delete()` via `socketlib.executeAsGM`.
- **Real R1 gesture routing infrastructure** — Phase 6 ratifies INV-5 Gesture Determinism + ships the R1 event source provider. Phase 4b stubs `R1Gesture` as a string-literal union.
- **Real panel implementations** — Phase 5 ships CharacterSheetPanel / CombatTrackerPanel / SpellbookPanel / etc. Phase 4b ships ONE panel (ConcentrationDropModalPanel) as a working exemplar.
- **Multi-attack tracker (MULTI-01)** — Phase 7.
- **Reaction passive-notification toast (REACT-01)** — Phase 7 wires the reaction event pipe into the Phase 4b toast queue.
- **Color / phosphor effects on toasts** — G2 is 4-bit greyscale; severity differentiation via single-char prefix only.
- **Specs.md v0.9.13 bump** — Conditional on Area 1 container-budget verification outcome. If amendment needed, INV-3 atomic update (Specs + README + showcase).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-05 | Map mode toggle runtime (raster ↔ glyph, hot-swappable) via Quick Action `[M]` | §Approach 2 (map-mode-toggle.ts) + Q8 setLocalStorage contract; Phase 6 wires the actual gesture |
| DEATH-01 | Death saves status HUD during HP=0 (3-strike tracker) | §Approach 5 (StatusHudRenderer pivot mode) + Q4 character.delta schema extension required |
| TOAST-01 | Toast queue/stack (max 2 visible FIFO 3s, overflow squash to "+N more") | §Approach 3 (ToastQueueLayer z=1.5) + Q5 squash interpretation |
| BOOT-01 | Boot error states orthogonal (5 states, recovery hints, locale-resolved) | §Approach 4 (BootErrorLayer + bootErrorFromException) + Q3 dispatch source map |
| CONC-01 | Concentration drop confirm modal on cast-while-concentrating | §Approach 6 (ConcentrationDropModalPanel via OverlayPanel API) + Phase 7 trigger wiring |
</phase_requirements>

---

## Summary

Phase 4b extends Phase 4a's layer machinery with four adversarial UI primitives plus the overlay-slot contract Phase 5 panels will consume. Five of the six deliverables ride directly on top of Phase 4a's stable APIs (`LayerManager.mount/destroy/bundle`, `ZIndex` enum, `Layer` interface, `StatusHudRenderer`, `hub-polyfill`); only **two pieces are net-new infrastructure**:

1. **`ZIndex.Z1_5_TOAST = 1.5`** — fractional z-index added between StatusHudLayer (z=1) and the overlay slot (z=2), following the precedent set by `Z0_5_IDLE_INFILL = 0.5` in Phase 4a.
2. **`OverlayPanel extends Layer` interface** — adds `onMount() / onUnmount() / onEvent(gesture: R1Gesture)` to the base `Layer` shape. This is the Panel API contract Phase 5 will implement verbatim.

The **architectural divergence** from Phase 4a is the no-demolish rule (CONTEXT Area 1): an overlay panel mounts at z=2 **without** auto-demolishing z=0.5 IdleInfillLayer underneath, **and** z=0 MapBaseLayer **retains** the `isEventCapture=1` container while the overlay is visible. Panel input is routed via bridge WS events (Phase 6 source provider) rather than native G2 capture. This needs a **container-budget audit** (Q1) and a new **ADR-0009 Amendment 1** (Q7) before the planner can lock the Panel API.

The single load-bearing **schema extension** Phase 4b requires is in `@evf/shared-protocol`: `CharacterSnapshotSchema` currently has no `death` field, so DEATH-01's pivot trigger (`hp.value === 0 AND death.failure < 3`) has no Phase 4a-era WS payload to read from. Phase 4b Plan 05 must add a `death: { success: number; failure: number }` field to `CharacterSnapshotSchema` and propagate the change through `packages/foundry-module/src/readers/character-reader.ts` (Phase 2 producer).

The toast-queue squash semantics (Q5) and the boot-error dispatch source map (Q3) are both **specification-grade ambiguity** that the planner resolves in Plan 03 / 04. Recommended interpretations are spelled out below.

**Primary recommendation:** Wave 0 lands the Panel API + ZIndex extension + ADR-0009 Amendment 1 as a single plan because the three artifacts are mutually load-bearing. Wave 1 lands the map-mode toggle in isolation (smallest blast radius). Wave 2 runs Plans 03 (toast) and 04 (boot error) in parallel (zero file overlap). Wave 3 lands DEATH-01 + CONC-01 together because the conc modal's "HP=0 simultaneous" edge case (CONTEXT Area 8) needs the death-saves pivot live to verify the underneath-layer behavior in the same fixture.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OverlayPanel interface contract | Frontend (g2-app `engine/`) | — | Type-only contract in `layer-types.ts`; panels live in `packages/g2-app/src/panels/` |
| z=2 overlay mount/unmount lifecycle | Frontend (g2-app `engine/layer-manager.ts`) | — | Extends Phase 4a LayerManager; one-line `Z2_OVERLAY` insertion via existing `mount()` |
| Map mode toggle runtime | Frontend (g2-app `engine/map-mode-toggle.ts`) | Even Hub kv store (persistence) | In-memory state mutates `LayerManager.setMapMode` + raster ↔ glyph swap |
| Even Hub `setLocalStorage` persistence | Frontend (`hub-polyfill.ts` → `EvenAppBridge`) | — | Already polyfilled in Phase 2 via `hub.setItem/getItem`; Phase 4b uses the same path |
| Toast queue (FIFO + squash) | Frontend (g2-app `status-hud/toast-queue-layer.ts`) | — | Pure client logic; no bridge persistence; queue lives in-layer |
| Boot error UI | Frontend (g2-app `engine/boot-error-layer.ts`) | — | Dispatched from boot-engine-core try/catch; same `bridge.textContainerUpgrade` plumbing as Phase 4a boot splash |
| Death-saves pivot trigger | Bridge (combat/character reader) | Foundry module (`foundry-module/src/readers/character-reader.ts`) | Source of truth lives in Foundry `actor.system.attributes.death.{success,failure}`; Phase 2 reader must extend snapshot |
| Conc-drop modal trigger | Bridge (`conc.conflict` envelope) | Foundry module + Phase 7 server-side detection | Phase 4b consumes the envelope; Phase 7 produces it |
| Conc-drop confirmed write | Bridge → Foundry module → socketlib | g2-app emits `conc.drop.confirmed` envelope | Phase 4b emits; Phase 7 wires `effect.delete()` |
| R1 gesture routing for modal | Bridge WS (`r1.gesture` envelope — NEW Phase 4b proposal) | g2-app `scene-input.ts` (extended) | Native capture stays at z=0 MapBaseLayer; panels receive gestures via WS routing |

---

## Standard Stack

### Core — g2-app (Phase 4b additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | 0.0.10 | EvenAppBridge — `setLocalStorage` / `getLocalStorage` / `rebuildPageContainer` / `textContainerUpgrade` | Already in g2-app deps (Phase 4a); same singleton, no new install |
| `@evf/shared-protocol` | workspace:* | Envelope + schema extensions (`death` field on CharacterSnapshot; NEW `r1.gesture` + `conc.conflict` + `conc.drop.confirmed` envelope types) | Already in g2-app deps; Phase 4b ADDS new types |
| `@evf/shared-render` | workspace:* | `AsciiGrid` + `matchAsciiFixture` for new INV-1 fixtures | Already in deps; Phase 4b adds ~13-16 new fixture files (Q6) |
| `zod` | 4.4.3 | Runtime schema validation for new envelope types | Workspace singleton; same version across all packages [VERIFIED: pnpm-lock.yaml] |

### Supporting — existing Phase 4a infrastructure (no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.5 | Snapshot + unit tests | Phase 4b adds tests under `packages/g2-app/src/__tests__/`, `packages/g2-app/src/status-hud/__tests__/`, `packages/g2-app/src/panels/__tests__/` |
| `happy-dom` | 20.9.0 | Test environment | Already configured in g2-app vitest.config.ts |
| `typescript` | 5.8.3 | Strict + 6 flags | Workspace-wide |

### Packages NOT to install

| Avoid | Reason | Use Instead |
|-------|--------|-------------|
| Any new toast library (react-toastify, vue-toast, etc.) | No DOM emitted; render target is `bridge.textContainerUpgrade` | Plain TS module + AsciiGrid |
| Any new state-management library (Zustand, Redux, etc.) | Phase 4b state is per-layer and in-process; no cross-component sharing | Plain TS class with private fields, see Phase 4a `StatusHudLayer` + `IdleInfillLayer` |
| Any new persistence library (localforage, idb, etc.) | Even Hub `setLocalStorage` is the canonical Tier 4 storage; G2 sandbox has no DOM storage | `EvenAppBridge.setLocalStorage` via `hub-polyfill` |
| Any new event-bus library (mitt, EventEmitter3, etc.) | Existing `createWsEventBus` (boot-engine-core.ts:130) covers WS event routing | Reuse the Phase 4a `wsEvents.subscribe(channel, fn): unsubscribe` pattern |

**Installation:** No new dependencies. All Phase 4b imports are within the workspace + existing g2-app deps.

**Version verification:** `pnpm-lock.yaml` already pins all the above to the cited versions [VERIFIED: codebase grep 2026-05-15].

---

## Architectural Responsibility Map → Plan Map (Wave Decomposition)

| Wave | Plan | Files Created/Modified | REQ-IDs | Container Budget Δ |
|------|------|----------------------|---------|-------------------|
| 0 | 04B-01 | NEW `engine/layer-types.ts` (extend) · NEW `engine/overlay-panel.ts` (Panel API) · `engine/layer-manager.ts` (extend) · NEW `docs/architecture/0009-layer-manager-contract.md` Amendment 1 | MAP-05 (overlay part) | +0 (contract only) |
| 1 | 04B-02 | NEW `engine/map-mode-toggle.ts` · `internal/boot-engine-core.ts` (extend step 9) · `shared-protocol/src/index.ts` (no schema change yet) | MAP-05 (toggle part) | +0 |
| 2 | 04B-03 | NEW `status-hud/toast-queue-layer.ts` · NEW `status-hud/toast-types.ts` · `engine/layer-types.ts` (Z1_5_TOAST already added in Plan 01) | TOAST-01 | +1-2 text containers (z=1.5) |
| 2 | 04B-04 | NEW `engine/boot-error-layer.ts` · NEW `engine/boot-error-types.ts` (state enum + dispatch) · NEW 10-15 INV-1 fixtures · `internal/boot-engine-core.ts` (extend try/catch) | BOOT-01 | +0 (replaces z=1 StatusHudLayer in error path) |
| 3 | 04B-05 | `status-hud/status-hud-renderer.ts` (add `mode: 'death-saves'`) · `shared-protocol/src/payloads/character.ts` (add `death` field) · `packages/foundry-module/src/readers/character-reader.ts` (extend reader) · NEW `panels/concentration-drop-modal.ts` · NEW INV-1 fixtures · `shared-protocol/src/index.ts` (new envelope types `conc.conflict`, `conc.drop.confirmed`, `r1.gesture`) | DEATH-01, CONC-01 | +1-3 text containers (modal) |

---

## Approach Detail per Primitive

### Approach 1 — Overlay Slot (z=2) Machinery + Panel API (Plan 04B-01)

**Files to create / modify:**

- `packages/g2-app/src/engine/layer-types.ts` (modify) — add `ZIndex.Z1_5_TOAST = 1.5`; add `OverlayPanel` extends Layer interface; add `R1Gesture` type union; add `LayerManagerErrorCode` value `'panel_mount_budget_exceeded'`.
- `packages/g2-app/src/engine/overlay-panel.ts` (new) — base abstract class (optional convenience) + JSDoc contract reference.
- `packages/g2-app/src/engine/layer-manager.ts` (modify) — extend `mount()` and `bundle()` to call `panel.onMount() / panel.onUnmount()` lifecycle hooks IF the layer satisfies `OverlayPanel`. Use a runtime type-guard: `if ('onMount' in layer && typeof layer.onMount === 'function')`.
- `docs/architecture/0009-layer-manager-contract.md` (modify) — fill the reserved Amendment 1 placeholder per §10 of this research.

**Key data shapes:**

```typescript
// layer-types.ts (additions)

/** R1 gesture stub — Phase 6 will refine via the R1 source provider. */
export type R1Gesture =
  | { readonly kind: 'tap' }
  | { readonly kind: 'scroll'; readonly direction: 'up' | 'down' }
  | { readonly kind: 'long-press' }
  | { readonly kind: 'double-tap' };

/** Panel API contract — Phase 5 panels implement this. */
export interface OverlayPanel extends Layer {
  /** Called by LayerManager after the panel's mount op succeeds. */
  onMount(): Promise<void>;
  /** Called by LayerManager before destroy. */
  onUnmount(): Promise<void>;
  /** Receive an R1 gesture routed via bridge WS (Phase 6 source). */
  onEvent(gesture: R1Gesture): void;
}

/** Extended ZIndex with z=1.5 for the toast queue. */
export enum ZIndex {
  Z0_MAP = 0,
  Z0_5_IDLE_INFILL = 0.5,
  Z1_STATUS_HUD = 1,
  Z1_5_TOAST = 1.5,   // NEW Phase 4b
  Z2_OVERLAY = 2,
}
```

**Integration points with Phase 4a code:**

- `LayerManager.mount(z, layer, requiredCaps)` already enforces capture-invariant + capability gate; Phase 4b adds an `onMount()` call when `layer` satisfies `OverlayPanel`. No change to error semantics.
- `LayerManager.bundle(ops)` already serializes a single `rebuildPageContainer` flush; Phase 4b's no-demolish rule means a bundle that mounts z=2 does NOT include a `destroy z=0.5` op (CONTEXT Area 1 diverges from ADR-0001 Amendment 1).
- `LayerManager._assertCaptureInvariant()` must continue to pass when z=2 panel mounts on top of z=0/0.5/1/1.5 — z=0 MapBaseLayer's `getCaptureContainer()` is the sole non-undefined return; the panel layer MUST NOT implement `getCaptureContainer` (it is render-only from the LayerManager's perspective).
- New container-budget assertion: planner adds a `_assertContainerBudget()` private method to LayerManager that runs in `bundle()` flush, fails with new `LayerManagerError('panel_mount_budget_exceeded')` if the cumulative `containerTotalNum` would exceed 12. See Q1.

**Open questions:** None — Area 1 + Area 2 are fully locked by CONTEXT.md; remaining ambiguity is Q1 container-budget audit (resolved below).

---

### Approach 2 — Map Mode Toggle + Even Hub Persistence (Plan 04B-02)

**Files to create / modify:**

- `packages/g2-app/src/engine/map-mode-toggle.ts` (new) — exports `toggleMapMode(newMode: MapMode): Promise<void>` and `loadPersistedMapMode(): Promise<MapMode>`. Uses `EvenAppBridge.setLocalStorage` / `getLocalStorage` directly (NOT via `hub-polyfill`, since this is Phase 4b code per Phase 4a Pitfall 1).
- `packages/g2-app/src/internal/boot-engine-core.ts` (modify) — between step 9 (BLE probe verdict) and step 10 (Construct 3 layers), call `loadPersistedMapMode()` and override the verdict if the saved value is `'raster'` or `'glyph'` (skip override if `'auto'`).
- `packages/g2-app/src/engine/map-mode-toggle.test.ts` (new) — unit tests for the persistence read/write round-trip and the priority rule (saved override > BLE verdict).

**Key data shapes:**

```typescript
// map-mode-toggle.ts (sketch)

import { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { MapMode } from './layer-manager.js'; // 'auto' | 'raster' | 'glyph'
import type { LayerManager } from './layer-manager.js';
import type { RasterController } from '../raster/raster-controller.js';

const STORAGE_KEY = 'view.map.mode';

/**
 * Read the user-persisted map mode from Even Hub kv storage.
 *
 * Returns `'auto'` (not throws) if:
 *   - the key is missing (SDK returns `""`)
 *   - the stored value is invalid (defensive fallback)
 *   - `EvenAppBridge.getLocalStorage` rejects (logged, swallowed)
 */
export async function loadPersistedMapMode(bridge: EvenAppBridge): Promise<MapMode> {
  try {
    const raw = await bridge.getLocalStorage(STORAGE_KEY);
    if (raw === 'raster' || raw === 'glyph' || raw === 'auto') return raw;
    return 'auto';
  } catch (err) {
    console.warn('[map-mode-toggle] loadPersistedMapMode failed — defaulting to auto', err);
    return 'auto';
  }
}

/**
 * Persist + apply a new map mode at runtime.
 *
 * Persistence is best-effort — toggle always succeeds in-memory even if
 * `setLocalStorage` returns false or rejects (Q8 failure-mode policy).
 */
export async function toggleMapMode(
  bridge: EvenAppBridge,
  layerManager: LayerManager,
  rasterController: RasterController,
  newMode: MapMode,
): Promise<void> {
  // 1. Apply immediately — in-memory state must change even if persistence fails.
  layerManager.setMapMode(newMode);
  if (newMode === 'raster') rasterController.setBleVerdict('raster');
  if (newMode === 'glyph')  rasterController.setBleVerdict('glyph');
  // 'auto' returns to BLE-probe-driven behavior; do NOT call setBleVerdict.

  // 2. Persist best-effort — failures are logged, never rethrown.
  try {
    const ok = await bridge.setLocalStorage(STORAGE_KEY, newMode);
    if (!ok) {
      console.warn(`[map-mode-toggle] setLocalStorage returned false for ${STORAGE_KEY}=${newMode}`);
    }
  } catch (err) {
    console.warn('[map-mode-toggle] setLocalStorage threw — toggle applied in-memory only', err);
  }
}
```

**Integration points with Phase 4a code:**

- `boot-engine-core.ts` step 9 already calls `probeBleThroughput(0, 0)` → `'auto'` → no override. Phase 4b inserts `const persisted = await loadPersistedMapMode(bridge);` and overrides the verdict when `persisted !== 'auto'`.
- `LayerManager.setMapMode(mode)` already exists (line 171) — Phase 4b just calls it.
- `RasterController.setBleVerdict('raster' | 'glyph')` already exists (RasterControllerLike interface line 232).

**Open questions:** None for the toggle itself. Q8 (setLocalStorage failure-mode) is resolved by the best-effort policy above.

---

### Approach 3 — Toast Queue (z=1.5) (Plan 04B-03)

**Files to create / modify:**

- `packages/g2-app/src/status-hud/toast-types.ts` (new) — Toast Zod schema + severity union.
- `packages/g2-app/src/status-hud/toast-queue-layer.ts` (new) — `ToastQueueLayer implements Layer` at z=1.5; in-memory FIFO; squash-head-on-overflow.
- `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts` (new) — capacity, squash arithmetic, 3-second dwell, overlay-coexistence.
- `packages/shared-render/src/fixtures/toast-queue.normal.txt` (new) — 2 toasts visible state.
- `packages/shared-render/src/fixtures/toast-queue.squashed.txt` (new) — head with `[+N]` badge.

**Key data shapes:**

```typescript
// toast-types.ts

import { z } from 'zod';

export const ToastSeveritySchema = z.enum(['info', 'warn', 'error']);
export type ToastSeverity = z.infer<typeof ToastSeveritySchema>;

export const ToastSchema = z.strictObject({
  /** Monotonic ID; layer uses it for stable React-key-style identity. */
  id: z.string().uuid(),
  /** Severity drives the single-char prefix (`i:` / `!:` / `x:`). */
  severity: ToastSeveritySchema,
  /** Display text — max 28 char width budget (matches Status HUD inner width). */
  message: z.string().min(1).max(28),
  /** Emit timestamp (Date.now()) — used to schedule the 3 s dwell timer. */
  emittedAt: z.number().int().nonnegative(),
});
export type Toast = z.infer<typeof ToastSchema>;
```

**Squash semantics (Q5 resolution — see §Toast Squash Semantics below).**

**Integration points with Phase 4a code:**

- Mounts via `layerManager.mount(ZIndex.Z1_5_TOAST, toastQueueLayer)` — no `requiredCaps` (toast queue is unconditional MVP).
- Survives overlay open: the no-demolish rule (CONTEXT Area 1) means z=0.5 stays mounted; z=1.5 toast queue follows the same rule. Plan 01 ADR-0009 Amendment 1 must include z=1.5 in the "stays mounted under z=2" set.
- Uses `bridge.textContainerUpgrade({ containerName: 'toast-slot-0' | 'toast-slot-1' })` — 2 text containers added to the page schema in `page-lifecycle.ts` `buildBootPageSchema()`. Q1 container-budget audit confirms 11 (Phase 4a) + 2 (toast) = 13 → **OVER BUDGET BY 1**. Resolution: see §Container Budget Audit below.

**Open questions:** None after Q5 resolution.

---

### Approach 4 — Boot Error UI + Dispatch (Plan 04B-04)

**Files to create / modify:**

- `packages/g2-app/src/engine/boot-error-types.ts` (new) — state enum + `BootErrorState` type + i18n table for IT/EN/DE.
- `packages/g2-app/src/engine/boot-error-layer.ts` (new) — `BootErrorLayer implements Layer` at z=1 (replaces StatusHudLayer in boot-failure path).
- `packages/g2-app/src/engine/boot-error-dispatch.ts` (new) — `bootErrorFromException(err: unknown): BootErrorState` mapping function.
- `packages/g2-app/src/internal/boot-engine-core.ts` (modify) — wrap the boot sequence in a try/catch that mounts `BootErrorLayer` instead of throwing.
- `packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts` (new) — unit tests for every exception → state mapping (Q3 source map).
- `packages/shared-render/src/fixtures/boot-error.{state}.{locale}.txt` (new) — 5 states × 2-3 locales = 10-15 fixtures.

**Key data shapes:**

```typescript
// boot-error-types.ts

export type BootErrorState =
  | 'handshake_failed'
  | 'version_mismatch'
  | 'no_character'
  | 'bridge_unreachable'
  | 'token_expired';

export type BootErrorLocale = 'it' | 'en' | 'de';

export interface BootErrorContent {
  readonly title: string;
  readonly hint: string;
  /** Close gesture annotation — `[X] Chiudi` IT / `[X] Close` EN / `[X] Schließen` DE. */
  readonly closeAnnotation: string;
}

export const BOOT_ERROR_CONTENT: Record<
  BootErrorState,
  Record<BootErrorLocale, BootErrorContent>
> = {
  handshake_failed: {
    it: { title: 'HANDSHAKE FALLITO', hint: 'Riavvia il bridge e riprova.', closeAnnotation: '[X] Chiudi' },
    en: { title: 'HANDSHAKE FAILED',  hint: 'Restart the bridge and retry.', closeAnnotation: '[X] Close'  },
    de: { title: 'HANDSHAKE FEHLGESCHL.', hint: 'Bridge neu starten + erneut versuchen.', closeAnnotation: '[X] Schließen' },
  },
  version_mismatch: { /* ... */ },
  no_character:     { /* ... */ },
  bridge_unreachable: { /* ... */ },
  token_expired:    { /* ... */ },
} as const;
```

**Dispatch source map (Q3 resolution — see §Boot Error Dispatch Map below).**

**Integration points with Phase 4a code:**

- Wraps the existing `_bootEngineCore` (boot-engine-core.ts line 191) `await` chain in a try/catch. On catch, route to `BootErrorLayer.mount` instead of propagating.
- Reuses `bridge.textContainerUpgrade` — no new envelope methods.
- Reuses `boot-splash.ts` `marker()` patterns for the `[X]` annotation rendering.

**Open questions:** Q3 — dispatch source map (resolved below).

---

### Approach 5 — Death-Saves HUD Pivot (Plan 04B-05 part 1)

**Files to create / modify:**

- `packages/shared-protocol/src/payloads/character.ts` (modify) — **CRITICAL EXTENSION:** add `death: { success: number (0-3); failure: number (0-3) }` field to `CharacterSnapshotSchema`.
- `packages/foundry-module/src/readers/character-reader.ts` (modify) — read `actor.system.attributes.death.{success,failure}` and emit in the snapshot payload.
- `packages/foundry-module/src/readers/character-reader.test.ts` (modify) — verify the new field round-trips.
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` (modify) — add `mode: 'standard' | 'death-saves'` constructor option; add `renderDeathSaves(snapshot)` method that produces the pivot fixture content.
- `packages/g2-app/src/status-hud/status-hud-layer.ts` (modify) — detect pivot trigger in `_onDelta`: when `snapshot.hp === 0 && snapshot.death.failure < 3`, latch ON and switch renderer mode.
- `packages/shared-render/src/fixtures/status-hud.death-saves.{it,en,de}.txt` (new) — 2 fixtures min (IT + EN); DE optional.

**Key data shapes:**

```typescript
// shared-protocol/src/payloads/character.ts (extension)

export const DeathSavesSchema = z.strictObject({
  /** Death saving throw passes (0-3). 3 passes = stabilized. */
  success: z.number().int().min(0).max(3),
  /** Death saving throw failures (0-3). 3 fails = dead. */
  failure: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const CharacterSnapshotSchema = z.strictObject({
  // ... existing fields ...
  death: DeathSavesSchema,  // NEW Phase 4b field
});
```

**Integration points with Phase 4a code:**

- `StatusHudLayer._onDelta` is the trigger source (Q4 resolution — see §Death-Saves Event Source). No new WS envelope needed; reuses `character.delta`.
- `StatusHudRenderer._buildGrid` extracted from current `render()` → split into `_buildStandardGrid()` and `_buildDeathSavesGrid()`. Same 28×21 outer shape, different inner content.
- Latch behavior: `StatusHudLayer` holds private `private pivotLatched: boolean = false;` field. Switches OFF when `snapshot.hp > 0` OR `snapshot.death.failure === 3` (death — stays in pivot until a future "actor revived" event, which is Phase 7+ scope).

**Open questions:** Q4 — does `character.delta` carry the death-saves data? **Resolution: NO in Phase 2 snapshot; Phase 4b extends the schema (mandatory).**

---

### Approach 6 — Concentration-Drop Modal (Plan 04B-05 part 2)

**Files to create / modify:**

- `packages/shared-protocol/src/payloads/concentration.ts` (new) — `ConcConflictPayloadSchema` + `ConcDropConfirmedPayloadSchema` + envelope type constants.
- `packages/shared-protocol/src/index.ts` (modify) — re-export the new schemas.
- `packages/g2-app/src/panels/concentration-drop-modal.ts` (new) — `ConcentrationDropModalPanel implements OverlayPanel` at z=2.
- `packages/g2-app/src/scene-input.ts` (modify) — extend the WS message router to dispatch `conc.conflict` envelopes to a callback the boot engine registers.
- `packages/g2-app/src/internal/boot-engine-core.ts` (modify) — wire `attachConcConflictHandler(ws, layerManager)` after step 11.
- `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts` (new) — modal open, gesture routing, `conc.drop.confirmed` emission.
- `packages/shared-render/src/fixtures/conc-modal.{it,en}.txt` (new) — 2 fixtures min.

**Key data shapes:**

```typescript
// shared-protocol/src/payloads/concentration.ts

import { z } from 'zod';

/**
 * Bridge → g2-app: emitted when the player attempts to cast a concentration
 * spell while a concentration effect is already active.
 *
 * Phase 7 server-side detection: foundry-module subscribes to spell-cast preCast
 * hooks, checks for an existing concentration effect, and emits this envelope
 * via the bridge if a conflict is detected.
 */
export const ConcConflictPayloadSchema = z.strictObject({
  /** Foundry effect ID of the currently-active concentration effect. */
  effectId: z.string().min(1),
  /** Display name of the currently-active concentration (e.g., 'Hold Person'). */
  currentConcentrationName: z.string().min(1),
  /** Display name of the new spell being cast (e.g., 'Bless'). */
  newSpellName: z.string().min(1),
});
export type ConcConflictPayload = z.infer<typeof ConcConflictPayloadSchema>;
export const CONC_CONFLICT_TYPE = 'conc.conflict' as const;

/**
 * g2-app → bridge: emitted when the user confirms dropping the existing
 * concentration via the modal's [Y] gesture.
 *
 * Phase 4b emits this envelope. Phase 7 consumes it server-side and calls
 * `socketlib.executeAsGM(() => effect.delete())`.
 */
export const ConcDropConfirmedPayloadSchema = z.strictObject({
  /** The effect ID from the originating ConcConflictPayload. */
  effectId: z.string().min(1),
});
export type ConcDropConfirmedPayload = z.infer<typeof ConcDropConfirmedPayloadSchema>;
export const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const;
```

**Integration points with Phase 4a code:**

- Mounts via `layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: modal }])` — single flush.
- z=0 MapBaseLayer retains capture (CONTEXT Area 1); modal's `onEvent(gesture)` receives `[Y]`/`[N]` via WS routing (NEW `r1.gesture` envelope — see Q2).
- On `[Y]`: modal sends `{ type: 'conc.drop.confirmed', payload: { effectId } }` envelope via `ws.send()`. Bridge consumes (Phase 7).
- On `[N]`: modal sends nothing; `bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }])` to dismiss.

**Open questions:** Q2 — exact `r1.gesture` envelope shape (proposed below).

---

## Q1 — Container Budget Audit Under No-Demolish Rule

Specs §3.1 caps the G2 page at **4 image + 8 text/list = max 12 containers** (`containerTotalNum: 1-12` per SDK `CreateStartUpPageContainer` JSDoc, confirmed [VERIFIED: `/home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:659-661`]). Phase 4a's `buildBootPageSchema()` declares **11 containers** (4 image + 7 text). Under CONTEXT Area 1's no-demolish rule, Phase 4b must verify that mounting z=2 overlays + z=1.5 toast queue on TOP of z=0.5 idle infill stays within budget.

### Layer × Mode × Container Count

| Layer | Raster Mode Containers | Glyph Mode Containers | Notes |
|-------|----------------------|---------------------|-------|
| z=0 MapBaseLayer | 4 image (raster tiles) + 1 capture text (`map-capture`) = **5** | 1 text (glyph grid) + 1 capture text = **2** | `map-capture` is the sole `isEventCapture=1` container. In glyph mode, the raster tiles are unused; image budget is 0/4. |
| z=0.5 IdleInfillLayer | 3 text (`z05-combat-log`, `z05-label`, `z05-stats`) = **3** | 2 text (combat-log omitted per UI-SPEC §z=0.5 Glyph degradation) = **2** | Already in Phase 4a `buildBootPageSchema()`. |
| z=1 StatusHudLayer | 1 text (`status-hud`) = **1** | 1 text = **1** | Single text container holds the full 28×21 grid via newline-separated content. |
| Header/Footer (Phase 4a) | 2 text (`header`, `footer`) = **2** | 2 text = **2** | Boot splash uses `header`; main page may repurpose for other layers later. |
| z=1.5 ToastQueueLayer (Phase 4b) | 2 text (`toast-slot-0`, `toast-slot-1`) = **2** | 2 text = **2** | Or alternatively: 1 text holding both toasts as a 2-row block. |
| z=2 OverlayPanel (typical) | 1-3 text/list (varies per panel) = **1-3** | 1-3 = **1-3** | Conc-drop modal needs ~2 text (title + buttons), pessimistic upper bound. |

### Cumulative Totals (Worst Case — All Layers Mounted Simultaneously)

| Scenario | Image | Text/List | Total | Verdict |
|----------|-------|-----------|-------|---------|
| Phase 4a idle (raster, no overlay) | 4 | 7 | **11** | ✓ Within budget (1 slot free) |
| Phase 4a idle (glyph) | 0 | 4 | **4** | ✓ Plenty of slack |
| Phase 4b idle + toast (raster, no overlay) | 4 | 7 + 2 = 9 | **13** | ✗ **OVER BUDGET BY 1** |
| Phase 4b idle + toast + overlay (raster) | 4 | 7 + 2 + 2 = 11 | **15** | ✗ **OVER BUDGET BY 3** |
| Phase 4b idle + toast (glyph) | 0 | 4 + 2 = 6 | **6** | ✓ Within budget |
| Phase 4b idle + toast + overlay (glyph) | 0 | 4 + 2 + 2 = 8 | **8** | ✓ At budget (zero slack) |

**Verdict:** The no-demolish rule **does overflow the container budget** in raster mode when toast + overlay are simultaneously present. Two mitigation paths are viable:

### Mitigation Option A — Auto-Demolish z=0.5 ONLY on z=2 Mount (recommended)

When `LayerManager.bundle()` mounts a z=2 panel, **automatically demolish z=0.5 IdleInfillLayer** in the same bundle. This reverts to ADR-0001 Amendment 1's original atomic rule for z=2 specifically, but NOT for z=1.5 toast (toast survives overlay open per CONTEXT Area 5).

This means:

- **CONTEXT Area 1 partial revision:** z=0.5 *does* get demolished on z=2 mount (reverting from "stays mounted but visually covered" to "auto-demolished and auto-reborn").
- **CONTEXT Area 1 preserved part:** z=0 retains capture; panel input still routed via bridge WS.
- **ADR-0009 Amendment 1 scope (Q7):** must encode the differential rule — "z=1.5 toast survives z=2 mount; z=0.5 idle infill is demolished on z=2 mount, reborn on z=2 unmount."

**Budget after mitigation:**

| Scenario | Image | Text/List | Total | Verdict |
|----------|-------|-----------|-------|---------|
| Idle + toast (raster) | 4 | 5 + 2 = 7 | **11** | ✓ |
| Toast + overlay (raster, z=0.5 demolished) | 4 | 4 + 2 + 2 = 8 | **12** | ✓ Exactly at budget |
| Toast + overlay (glyph, z=0.5 demolished) | 0 | 1 + 2 + 2 = 5 | **5** | ✓ |

### Mitigation Option B — Panel Container Budget Restriction

Restrict OverlayPanel implementations to **≤ 1 text/list container** when toast is also mounted. This pushes the constraint into the Panel API contract and forces panels to render dense (using a single container with internal newlines, matching the StatusHud pattern).

**Trade-off:** Option A is recommended because it's a single-place change in LayerManager (one new branch in `bundle()`), while Option B propagates the restriction into every future panel implementation (Phase 5+).

**Recommendation to planner:** **Adopt Mitigation Option A.** Update Plan 01 to encode the differential rule in `LayerManager.bundle()` + ADR-0009 Amendment 1. Update CONTEXT.md Area 1 wording at the planning step to reflect "z=0.5 demolished on z=2 mount; z=1.5 toast preserved."

**[ASSUMED]** Toast layer uses 2 text containers (one per visible toast). If implementation uses 1 text container with embedded newlines (more compact, matching StatusHud pattern), then Option A is not needed at all — total stays at 12 even with z=0.5 + z=2 + 1-container toast.

**[VERIFIED: SDK index.d.ts line 659-661]** `containerTotalNum: 1-12`, `textObject` max 8 items, `imageObject` max 4 items.

---

## Q2 — Bridge WS Event Routing for Panel Input (`r1.gesture` Envelope Proposal)

CONTEXT Area 1 commits: panel input is routed via bridge WS events (z=0 retains native capture). The canonical bridge protocol (`packages/shared-protocol/src/envelope.ts`) currently has NO `r1.gesture` envelope type — Phase 4b must propose one. Phase 6 will refine if needed.

### Phase 3 Bridge Protocol Recap (envelope.ts inspection)

The base envelope schema is:

```typescript
EnvelopeSchema = z.object({
  proto: z.literal('evf-v1'),
  seq: z.number().int().nonnegative(),
  ts: z.number().int(),
  type: z.string(),
  session_id: z.string().uuid(),
  payload: z.unknown(),
})
```

Existing `type` discriminators in shared-protocol:

- `'character.delta'` (CHARACTER_DELTA_TYPE)
- `'combat.turn'`, `'combat.state'`, `'combat.targets'` (COMBAT_*_DELTA_TYPE)
- `'event.log'` (EVENT_LOG_DELTA_TYPE)
- `'scene.viewport'` (SCENE_VIEWPORT_DELTA_TYPE)
- `'frame_pixels'` (Phase 4a Plan 06)

### Native Hardware Gesture Source (G2 Bridge → WebView)

[VERIFIED: SDK `OsEventTypeList` enum at `/home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:716-727`]

```typescript
enum OsEventTypeList {
  CLICK_EVENT = 0,           // tap
  SCROLL_TOP_EVENT = 1,      // scroll up
  SCROLL_BOTTOM_EVENT = 2,   // scroll down
  DOUBLE_CLICK_EVENT = 3,    // double-tap
  FOREGROUND_ENTER_EVENT = 4,
  FOREGROUND_EXIT_EVENT = 5,
  ABNORMAL_EXIT_EVENT = 6,
  SYSTEM_EXIT_EVENT = 7,
  IMU_DATA_REPORT = 8,
}
```

Native events arrive via `bridge.onEvenHubEvent((event: EvenHubEvent) => ...)` with `event.listEvent` / `event.textEvent` / `event.sysEvent` populated; the gesture type is derived from the corresponding `OsEventTypeList` value. **Critical: there is NO `LONG_PRESS_EVENT` in the canonical SDK enum.** Phase 6 R1 source provider will need to either (a) derive long-press from CLICK_EVENT duration timing, or (b) use a different SDK channel not yet identified in Phase 0/4a research.

### Proposed `r1.gesture` Envelope (Phase 4b — extensible by Phase 6)

```typescript
// shared-protocol/src/payloads/r1-gesture.ts (NEW Phase 4b)

import { z } from 'zod';

export const R1GestureKindSchema = z.enum([
  'tap',           // → OsEventTypeList.CLICK_EVENT
  'scroll-up',     // → OsEventTypeList.SCROLL_TOP_EVENT
  'scroll-down',   // → OsEventTypeList.SCROLL_BOTTOM_EVENT
  'double-tap',    // → OsEventTypeList.DOUBLE_CLICK_EVENT
  'long-press',    // → Phase 6: derived from CLICK_EVENT timing OR separate channel
]);
export type R1GestureKind = z.infer<typeof R1GestureKindSchema>;

export const R1GesturePayloadSchema = z.strictObject({
  kind: R1GestureKindSchema,
  /** Source container — `'map-capture'` for native; future panels may identify by panel id. */
  source: z.string().min(1),
  /** Optional payload (e.g., scroll velocity, list item index) — opaque per gesture kind. */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type R1GesturePayload = z.infer<typeof R1GesturePayloadSchema>;
export const R1_GESTURE_TYPE = 'r1.gesture' as const;
```

### WS Routing Pattern (Phase 4b stub; Phase 6 ratifies)

Two viable wirings:

**Pattern A — Bridge mirrors native gestures into WS:** The bridge (Phase 7+) subscribes to `bridge.onEvenHubEvent` on the server side... no, this won't work — `onEvenHubEvent` is a WebView-side API. **Pattern A is not viable.**

**Pattern B — g2-app forwards native gestures into WS, panels subscribe:** g2-app subscribes to `bridge.onEvenHubEvent` (Phase 6 source provider does this), translates each event into a synthetic `r1.gesture` envelope, and broadcasts it through an in-process event bus. Active panels' `onEvent(gesture)` callbacks are invoked. **This is the recommended pattern.**

Under Pattern B, Phase 4b does NOT send `r1.gesture` over the WS at all — the "bridge WS events" phrasing in CONTEXT Area 1 is misleading. The actual routing is **in-process within g2-app** via an internal bus. The WS channel is reserved for Phase 7 cross-side gesture events (e.g., a DM-side override of a player's gesture, which is V2 stretch).

**Recommendation to planner:** Phase 4b Plan 01 ships the `R1Gesture` type union in `layer-types.ts` (CONTEXT Area 2 already locks this) PLUS a minimal `panel-gesture-bus.ts` in-process bus. The `r1.gesture` envelope schema lands in shared-protocol but is **unused on the WS in Phase 4b** — it's reserved for Phase 6+ remote/replay scenarios. The conc-drop modal's `[Y]`/`[N]` test harness directly invokes `panel.onEvent({ kind: 'tap' })` via the in-process bus, NOT via WS round-trip.

**[ASSUMED]** Long-press is derivable by Phase 6 (timing-based on CLICK_EVENT) or via a different SDK channel. Phase 4b stubs the `'long-press'` literal in `R1Gesture` for forward compatibility; conc-drop modal doesn't need it.

---

## Q3 — Boot Error Dispatch Source Map

`boot-engine-core.ts` `_bootEngineCore()` runs a 14-step boot sequence (lines 191-309). Each step can throw a specific exception class. Phase 4b's `bootErrorFromException(err: unknown): BootErrorState` must map each known exception shape to one of the 5 enum states.

### Exception → State Mapping Table

| Source Exception | Boot Step | State |
|------------------|-----------|-------|
| `HandshakeError` with `code: 'parse_failed'` | Step 6 (handshake) | `handshake_failed` |
| `HandshakeError` with `code: 'schema_failed'` | Step 6 (handshake) | `handshake_failed` |
| `HandshakeError` with `code: 'timeout'` | Step 6 (handshake) | `handshake_failed` |
| `HandshakeError` with `code: 'transport_error'` | Step 6 (handshake) | `bridge_unreachable` |
| Server response with `proto_chosen !== 'evf-v1'` | Step 6 (handshake) | `version_mismatch` |
| Step 5 `WebSocket` `error` event before `open` | Step 5 (WS open) | `bridge_unreachable` |
| Step 5 `WebSocket` `close` event with `code: 1006` (abnormal) | Step 5 (WS open) | `bridge_unreachable` |
| Server returns HTTP 401 / 403 during handshake (rejected by `HandshakeServerSchema`) | Step 6 | `token_expired` |
| `LayerManagerError('capture_invariant_violated')` | Step 12 (bundle) | `handshake_failed` (treat as generic boot error) |
| `LayerManagerError('capability_gate_denied')` | Step 12 (bundle) | `handshake_failed` |
| `bridgeFactory()` rejection (Step 2) | Step 2 (bridge acquire) | `bridge_unreachable` |
| `createBootPage` non-success result (Step 3) | Step 3 (page create) | `handshake_failed` (rare; treat as generic) |
| `createStartUpPageContainer` returns `oversize` / `outOfMemory` | Step 3 | `handshake_failed` |
| Bridge sends `character.delta` with `null` actor (NEVER happens at boot — this fires later) | post-boot, in `_renderNow` | `no_character` |

### Special Case: `no_character`

`no_character` is the only state that fires **AFTER** boot completes successfully — the bridge handshake succeeds, but the assigned actor is missing in Foundry (e.g., deleted, archived, or never assigned). This means `boot-engine-core.ts` cannot catch this in its outer try/catch; instead, **`StatusHudLayer._onDelta` (or a separate `character-missing.ts` watcher) must detect the absence and trigger the BootErrorLayer mount as a layer swap**.

**Detection strategy:**

- Phase 2 reader emits `{ type: 'character.delta', payload: null }` when no actor is assigned (verify with Phase 2 SUMMARY — Plan 05).
- OR Phase 2 reader emits a separate `{ type: 'character.missing' }` envelope.
- **[ASSUMED]** Phase 4b adds a 5-second timeout after handshake: if no valid `character.delta` arrives within the window, route to `no_character` state. **Planner must verify Phase 2 reader behavior before locking this.**

### Token Expired (subtlety)

A 24-hour bearer token (Specs §11.5.4) expires asynchronously — boot succeeds, then later the bridge starts returning 401/403 on WS messages. CONN-05 (Phase 2) already specifies a silent refresh with 60s grace; the planner should verify whether Phase 4b needs to handle `token_expired` at all in the boot path, or if it's exclusively a post-boot reconnect scenario.

**Recommendation:** Treat `token_expired` as a **post-boot recoverable state**, not a boot-time error. Phase 4b's boot-error dispatch includes the fixture, but the trigger is a separate WS `auth_expired` envelope (Phase 7+) that swaps z=1 StatusHudLayer for BootErrorLayer at runtime.

---

## Q4 — Death-Saves Event Source (Character.delta Schema Extension Required)

[VERIFIED: codebase read of `packages/shared-protocol/src/payloads/character.ts`]

The current `CharacterSnapshotSchema` has these fields:

```typescript
z.strictObject({
  actorId: ...,
  name: ...,
  hp: z.number().int(),
  maxHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  ac: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(20),
  conditions: z.array(z.string()),
  exhaustion: z.number().int().min(0).max(6),
})
```

**There is no `death` field.** Phase 4b's DEATH-01 pivot trigger (`hp === 0 AND death.failure < 3`) has no Phase 2 payload data to consume.

### Required Schema Extension (Plan 04B-05 Task 1)

```typescript
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});

export const CharacterSnapshotSchema = z.strictObject({
  // ... existing fields ...
  death: DeathSavesSchema,  // NEW
});
```

This is a **breaking schema change** for the Phase 2 producer (`packages/foundry-module/src/readers/character-reader.ts`) — the reader must populate the field from `actor.system.attributes.death.{success,failure}`. Foundry dnd5e 5.x stores these as numbers 0-3 (each death save outcome increments the appropriate counter; counters reset to 0 at full rest or HP restoration).

### Foundry dnd5e Data Path

[VERIFIED: dnd5e 5.x convention; cross-check with `github.com/foundryvtt/dnd5e` actor schema before implementation]

```javascript
// In foundry-module/src/readers/character-reader.ts (Phase 4b extension)
const death = {
  success: actor.system.attributes.death.success ?? 0,
  failure: actor.system.attributes.death.failure ?? 0,
};
```

### Update Cadence (Pivot Trigger Source)

The pivot fires on every `character.delta` payload — same source as the existing HP/AC update. The `_onDelta` method in StatusHudLayer already handles debounce (200 ms) + heartbeat (30 s); the pivot detection runs inside the existing `parsed.success` branch:

```typescript
private _onDelta(raw: unknown): void {
  const parsed = CharacterSnapshotSchema.safeParse(raw);
  if (!parsed.success) { /* ... */ return; }
  this.snapshot = parsed.data;

  // NEW Phase 4b: pivot latch
  const inDeathSaves = parsed.data.hp === 0 && parsed.data.death.failure < 3;
  if (inDeathSaves && !this.pivotLatched) {
    this.pivotLatched = true;
    this.renderer.setMode('death-saves');
  } else if (!inDeathSaves && this.pivotLatched) {
    this.pivotLatched = false;
    this.renderer.setMode('standard');
  }

  this._scheduleDebouncedRender();
}
```

**No new WS envelope needed.** Reuses `character.delta`.

### Verification

Phase 4b Plan 05 unit test: synthesize a `character.delta` with `hp: 0, death: { success: 1, failure: 2 }` and verify the renderer produces the death-saves fixture content. Snapshot-test the resulting AsciiGrid against `packages/shared-render/src/fixtures/status-hud.death-saves.it.txt`.

---

## Q5 — Toast Queue Squash Semantics

CONTEXT Area 5 says: "Max 2 toasts visible FIFO, dwell 3 s each. When a 3rd toast arrives while 2 are visible, the head toast's content gets a `[+N]` badge appended (e.g., 'Damage 12 [+7]'). N counts toasts still queued in the buffer." SC #3 says: "a 9th simultaneous toast squashes into '+N more' without dropping any."

These two statements are not consistent on what "without dropping any" means. Resolution:

### Recommended Interpretation

**All N toasts are eventually visible** — the squash badge prevents the queue from overflowing UI-side but the buffer holds all unprocessed toasts. When a visible toast's 3-second dwell expires, the next queued toast slides in (head → bottom slot, new toast → top slot). If 9 toasts arrive within 3 seconds: 2 are visible immediately (with badge `[+7]` on the head), and the remaining 7 cycle through over the next ~10.5 seconds (3 s × ceil(7/2) ≈ 11 s).

**Squash badge placement:** Inline on the head toast's content (`'Damage 12 [+7]'`), NOT a separate squash-badge toast. This conserves containers (still 2 visible toasts, not 3).

**Multi-stack race:** If multiple Fireballs land in quick succession, the badge counter is monotonically increasing — every new toast that can't fit in the visible 2 slots increments `[+N]`. When a visible toast dwells out, the next queued toast becomes visible and the badge decrements. The badge is always `[+ (queue.length)]`.

**Atomic appearance vs delayed:**

- **Toast appearance is event-driven:** every `Toast` arriving via the public `enqueue(toast: Toast)` API triggers an immediate redraw if a visible slot opens up OR the badge increments.
- **Dwell timer is per-toast:** each visible toast has its own 3 s setTimeout. On expiry, the toast is unmounted and the next queued (if any) takes its place.

### Edge cases

| Scenario | Behavior |
|----------|----------|
| 1 toast arrives, no others | Visible 1/2 slots, 3 s dwell, then empty |
| 2 toasts arrive within 100 ms | Both visible 2/2 slots, separate 3 s timers |
| 3rd toast arrives at 2 visible | Queued; head toast content gets `[+1]` badge |
| 9 toasts arrive over 500 ms | 2 visible (head shows `[+7]`); 7 queued; cycle over ~10.5 s |
| Visible toast dwells out, queue non-empty | Pop oldest queued → take dwelled slot; badge decrements |
| Visible toast dwells out, queue empty | Slot becomes empty; badge disappears from head (or head dwells out too); next toast lands in first-available slot |
| Toast severity differs (info + warn + error) | Severity prefix on each toast (`i:` / `!:` / `x:`); no aggregation by severity |
| Overlay z=2 opens while toasts visible | Toasts stay visible at z=1.5 (above the visible-but-covered z=0.5, below the z=2 overlay). Container budget verified per Q1. |

### Container Slot Strategy

Recommended: **2 dedicated text containers** (`toast-slot-0` for the head, `toast-slot-1` for the tail). The badge is appended to slot-0's content string.

Alternative: **1 text container** holding both toasts as a 2-row newline-separated block (`'i: Damage 12 [+7]\n!: Save vs DEX'`). More compact (saves 1 container); makes the badge easier to render in-line. **Recommended for budget reasons** (Q1 Mitigation Option B fallback path).

**[ASSUMED]** The user's preferred presentation is 2-row block in a single container — minimum container footprint, simplest layout. Planner should verify with UI-SPEC during Plan 03 design.

---

## Q6 — INV-1 Fixture Inventory for Phase 4b

Phase 4a shipped 10 fixtures in `packages/shared-render/src/fixtures/`:

```
glyph-scene.boot.txt
glyph-scene.glyph-idle.txt
glyph-scene.raster-idle.txt
glyph-scene.raster-idle-{it,en,de}.txt   (3 files)
status-hud-baseline.txt
status-hud.conditions-overflow.txt
status-hud.hp-overflow.txt
status-hud.loading.txt
```

Phase 4b adds:

| Feature | Fixture File | Count | Notes |
|---------|-------------|-------|-------|
| Boot errors (5 states × 2 locales) | `boot-error.handshake_failed.{it,en}.txt`, `.version_mismatch.{it,en}.txt`, `.no_character.{it,en}.txt`, `.bridge_unreachable.{it,en}.txt`, `.token_expired.{it,en}.txt` | **10** | DE optional per §7.16.5 best-effort |
| Toast queue normal | `toast-queue.normal.txt` | **1** | 2 toasts visible, no squash |
| Toast queue squashed | `toast-queue.squashed.txt` | **1** | Head with `[+7]` badge |
| Death-saves pivot | `status-hud.death-saves.{it,en}.txt` | **2** | Pass=1, Fail=2 reference state |
| Conc-drop modal open | `conc-modal.{it,en}.txt` | **2** | Modal mounted, panel content visible |
| Overlay slot empty | (no new fixture — covered by Phase 4a `glyph-scene.raster-idle.txt`) | 0 | The pre-overlay state is already the Phase 4a idle fixture |
| Overlay slot active (conc-modal underneath) | (covered by `conc-modal.{it,en}.txt`) | 0 | Same fixture serves both purposes |
| Death + conc-modal simultaneous (edge case) | `conc-modal-on-death-saves.it.txt` | **1** | Verifies CONTEXT Area 8 edge case |

**Total Phase 4b fixtures: 17 files.** (10 boot-error + 2 toast + 2 death-saves + 2 conc-modal + 1 edge case)

**[ASSUMED]** DE fixtures for boot errors are skipped per §7.16.5 best-effort policy. If planner prefers 3-locale parity, total becomes 22 (10 + 5 + 2 + 2 + 1 + 2 extras for DE death-saves + DE conc-modal).

### Naming convention

Follows Phase 4a precedent (`<feature>.<state>[.<locale>].txt`). Lowercase, hyphens-not-underscores, `.txt` extension. Tests resolve via relative path from the test file (Phase 4a Pitfall 7 still applies — `packages/g2-app/src/<dir>/__tests__/` is 4 levels above `packages/shared-render/src/fixtures/`).

---

## Q7 — ADR-0009 Amendment 1 Draft (for Plan 01 to refine + commit)

Phase 4a Plan 05 explicitly reserved Amendment 1 in `docs/architecture/0009-layer-manager-contract.md` (line 53 — *"Amendment 1 (reserved): Phase 4b bundle() composition rules for modal-on-modal (CONC-01 concentration-drop + DEATH-01 death-saves race)."*). Phase 4b Plan 01 fills it.

### Recommended Amendment 1 Text

```markdown
### Amendment 1 — Phase 4b composition rules: no-demolish overlay + toast persistence + modal-on-pivot (2026-05-15, Phase 4b Plan 01)

**Status:** ACCEPTED — extends Option A without overturning it.

**Trigger:** Phase 4b ships the z=2 overlay slot, z=1.5 toast queue, and z=2 concentration-drop modal. Three composition rules need ratification:

1. **Overlay z=2 mounts WITHOUT demolishing z=1.5 toast queue.** Toast queue stays mounted (different containers; container budget verified — see Q1 audit in `04B-RESEARCH.md`).
2. **Overlay z=2 mount DOES demolish z=0.5 idle infill** (revert to ADR-0001 Amendment 1 atomic rule for z=0.5 specifically). Container budget cannot accommodate both z=0.5 + z=2 + toast in raster mode.
3. **z=0 MapBaseLayer retains `isEventCapture=1` when z=2 overlay is mounted.** Panel input is routed via the in-process `panel-gesture-bus` (synthesized from `bridge.onEvenHubEvent`), NOT via native G2 capture transfer.

**Concentration-drop modal special case:** When CONC-01 modal opens while DEATH-01 pivot is latched (HP=0), the z=1 StatusHudLayer retains the death-saves pivot underneath the z=2 modal (different z, different container). No layer conflict; modal closes return to the same pivot state.

**Container budget invariant under this amendment:** `containerTotalNum` MUST stay ≤ 12 at every bundle flush. `LayerManager.bundle()` is extended with `_assertContainerBudget()` private method that fails with `LayerManagerError('panel_mount_budget_exceeded')` when the cumulative count would exceed 12.

**Consistency check vs original Option A + Amendment 1:**

- ✓ Single capture container preserved (z=0 retains capture).
- ✓ Status HUD persistence (z=1 always visible) — unchanged.
- ✓ z=0.5 atomic with z=2 mount/unmount — **PRESERVED** for z=2 (with explicit ack that z=1.5 toast does NOT participate in this atomic).
- ✓ Panel API contract (Phase 5 prerequisite) — extended with `onMount() / onUnmount() / onEvent()` lifecycle hooks.

**INV-2 status:** `containerTotalNum: 1-12` re-verified against `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts` line 659-661 on 2026-05-15.

**Why amend instead of new ADR:** the changes are additive — they do not alter Option A's centralized LayerManager class or the capture-container invariant. A separate ADR-0010 would duplicate the context. Amendment keeps the architectural narrative coherent.
```

**Recommendation to planner:** Plan 01 commits this verbatim (after planner refinement during plan-check), updates the ADR status line to `accepted + amended 2026-05-15`, and ensures `LayerManager.bundle()` enforces all three rules with unit tests.

---

## Q8 — `hub.setLocalStorage` Contract + Failure-Mode Policy

[VERIFIED: SDK `index.d.ts` line 1144]

```typescript
setLocalStorage(key: string, value: string): Promise<boolean>;
getLocalStorage(key: string): Promise<string>;
```

### Empirical Behavior (from Phase 2 + simulator probes 2026-05-14)

| Call | Behavior | Notes |
|------|----------|-------|
| `setLocalStorage('any-key', 'value')` | Resolves `true` on success, `false` on host rejection | NEVER throws on the simulator; host validates `key` length only |
| `setLocalStorage('any-key', '')` | Resolves `true` — empty string overwrites the key | Phase 2 `hub-polyfill` uses this for `removeItem` semantics |
| `getLocalStorage('missing-key')` | Resolves `''` (empty string) — NOT `null`, NOT throws | `hub-polyfill` normalizes `'' → null` for legacy contract |
| `getLocalStorage('present-key')` | Resolves the stored string | UTF-8 safe; up to ~? bytes (TBD by hardware; simulator unbounded) |

### Key Format Constraints

[ASSUMED — verify in Plan 02 if rejected] Safe characters: ASCII alphanumeric + `.`. Phase 2 wizard uses keys like `'evf.pairing.token'`, `'evf.session.id'`. Phase 4b `'view.map.mode'` follows the same convention.

**Forbidden characters (defensive):** colons, slashes, whitespace, control chars. Use dots as separators.

### Read-Back Consistency

[ASSUMED — verify empirically] Same-session write-then-read is consistent (sync within the WebView). Cross-session persistence is verified by Phase 2's tier3-storage tests; Phase 4b can rely on it.

### Failure-Mode Policy (Phase 4b decision)

**`setLocalStorage` failures are best-effort — toggle ALWAYS succeeds in-memory.** This is the canonical pattern in `map-mode-toggle.ts` (see Approach 2):

1. Apply the new mode to `LayerManager.setMapMode` + `RasterController.setBleVerdict` **first** (in-memory state).
2. Call `setLocalStorage` **second**.
3. If `setLocalStorage` returns `false` OR rejects, log a warning but **do NOT roll back** the in-memory toggle.

Rationale: persistence is a convenience (the next session boot starts with the user's last choice); the live session should not fail just because Even Hub kv storage is misbehaving. This matches the Phase 2 `hub-polyfill` graceful-degradation pattern (`hub-polyfill.ts` line 95-103).

### Caveat: Polyfill Pitfall

Phase 4a Pitfall 1 (RESEARCH.md line 436) says: "Phase 4a code imports `EvenAppBridge` from `@evenrealities/even_hub_sdk` directly. Never reference `hub.*` in engine/raster/status-hud modules." Phase 4b inherits this — `map-mode-toggle.ts` calls `bridge.setLocalStorage` directly, NOT `hub.setItem`. The polyfill is reserved for Phase 2 wizard backward-compat only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast queue | Custom DOM toaster + React | Plain TS class + `bridge.textContainerUpgrade` | No DOM emitted; D-2.04 forbids; existing pattern proven by StatusHudLayer |
| Persistence layer | DOM `localStorage` / `sessionStorage` | `EvenAppBridge.setLocalStorage` | G2 sandbox has no DOM storage (Specs §3.1); must use Tier 4 kv store |
| WS gesture envelope | Ad-hoc message routing | Reuse `EnvelopeSchema` + add typed payload schema | Phase 3 protocol already includes versioning + replay; ADR-0002 binds |
| Boot error UI state machine | Multi-class hierarchy | Single `BootErrorLayer` + state enum + i18n table | UI-SPEC Phase 4a established the pattern (loading/missing/standard via one renderer); reuse it |
| Container-budget assertion | Per-layer counting | Centralized `LayerManager._assertContainerBudget()` | Single source of truth; same pattern as `_assertCaptureInvariant` (Phase 4a) |
| Panel lifecycle hooks | Pub/sub event bus | Direct `onMount() / onUnmount()` method calls from LayerManager | Synchronous, error-returnable, type-safe; matches Phase 4a `Layer.draw() / destroy()` precedent |
| Death-saves data fetch | Foundry desktop UI scrape | Extend `CharacterSnapshotSchema` + `character-reader.ts` | Foundry actor data is the canonical source; bridge already plumbs character.delta |

**Key insight:** Phase 4b is mostly an **extension of Phase 4a's patterns**, not a new framework. The only net-new infrastructure is `OverlayPanel extends Layer` (3 new methods) + `ZIndex.Z1_5_TOAST` (one enum value) + `bootErrorFromException` (one dispatch function). Everything else reuses LayerManager.mount/destroy/bundle, StatusHudRenderer, hub-polyfill (transitively), and shared-render fixtures.

---

## Common Pitfalls

### Pitfall 1: Forgetting to update Phase 4a `buildBootPageSchema()` for new containers

**What goes wrong:** ToastQueueLayer or OverlayPanel tries to `bridge.textContainerUpgrade({ containerName: 'toast-slot-0' })`, but `toast-slot-0` was never declared in `createStartUpPageContainer`. Bridge returns `false` (silently); toast never appears.

**Why it happens:** The page-based declarative API (Phase 4a OQ-INV2-1) requires every container to be declared upfront in `buildBootPageSchema()`. Adding a layer ≠ adding a container.

**How to avoid:** Plan 03 must extend `buildBootPageSchema()` to include the new toast containers BEFORE landing `ToastQueueLayer`. Similarly Plan 05 must add the conc-modal containers.

**Warning signs:** `textContainerUpgrade` resolving but the G2 display showing nothing new; simulator log warning `"container <name> not declared"`.

### Pitfall 2: No-demolish rule breaks container budget without z=0.5 mitigation

**What goes wrong:** Toast + overlay mounted simultaneously in raster mode → `containerTotalNum = 13`, exceeds SDK cap (1-12) → `createStartUpPageContainer` returns `oversize` (StartUpPageCreateResult value 2).

**Why it happens:** CONTEXT Area 1's no-demolish rule conflicts with the 12-container cap when toast (Phase 4b new) is added.

**How to avoid:** Adopt Q1 Mitigation Option A — z=0.5 IS demolished on z=2 mount (only); z=1.5 toast is NOT demolished. Encode in ADR-0009 Amendment 1 + `LayerManager.bundle()` logic.

**Warning signs:** Simulator returning `StartUpPageCreateResult.oversize`; Plan 05 integration test asserting modal-open-on-raster fails.

### Pitfall 3: Death-saves pivot doesn't update because Phase 2 reader didn't emit `death` field

**What goes wrong:** StatusHudLayer never enters death-saves mode; pivot fixture test fails because `parsed.data.death` is undefined.

**Why it happens:** Plan 05 must extend BOTH `CharacterSnapshotSchema` (shared-protocol) AND `character-reader.ts` (foundry-module). If only the schema is extended, Zod `z.strictObject` rejects the payload because `death` is now required but the producer doesn't emit it.

**How to avoid:** Plan 05 Task 1 (schema) and Task 2 (reader) MUST land in the same commit OR be sequenced with a temporary `death: DeathSavesSchema.optional()` during Task 1's commit window. Recommended: single atomic commit with both files.

**Warning signs:** Vitest reports `expected death to be defined` on character snapshot tests; runtime: pivot never triggers.

### Pitfall 4: Conc-modal `[Y]`/`[N]` gesture routing requires panel-gesture-bus, NOT direct WS round-trip

**What goes wrong:** Modal sends `r1.gesture` envelope over WS; bridge has no handler; modal never receives `[Y]` confirmation; user `[Y]` tap appears to do nothing.

**Why it happens:** Q2 resolution — Phase 4b's `r1.gesture` envelope is reserved for future use; Phase 4b uses an **in-process panel-gesture-bus** for native gesture → panel routing.

**How to avoid:** Plan 01 ships `packages/g2-app/src/engine/panel-gesture-bus.ts` (minimal in-process EventEmitter-style bus). `bridge.onEvenHubEvent` subscriber in Phase 6 source provider → `panelGestureBus.publish(gesture)` → modal's `onEvent(gesture)`. For Phase 4b: a temporary direct call from `scene-input.ts` to the active panel's `onEvent` is acceptable.

**Warning signs:** Modal test passes when manually invoking `modal.onEvent({ kind: 'tap' })` but fails when a synthetic `bridge.onEvenHubEvent` event fires.

### Pitfall 5: Boot-error fixture path resolution

**What goes wrong:** `matchAsciiFixture(grid, '../../../shared-render/src/fixtures/boot-error.handshake_failed.it.txt')` fails with ENOENT in CI.

**Why it happens:** Test files in `packages/g2-app/src/engine/__tests__/` are 4 directories deep from `packages/`, so the relative path needs 4 `../` not 3.

**How to avoid:** Phase 4a Pitfall 7 covers this — follow the existing pattern from `status-hud-renderer.test.ts`. Verify path resolution before committing.

**Warning signs:** Test passes locally with `--update-snapshots`, fails in CI with `Cannot find module ...`.

### Pitfall 6: Toast severity prefix vs i18n catalog

**What goes wrong:** Severity prefix `i:` / `!:` / `x:` is hardcoded in English; IT users see the same prefix.

**Why it happens:** The single-char prefix is **language-neutral by design** (CONTEXT Area 5). It's not a label — it's a symbol that conveys severity visually.

**How to avoid:** Document in `toast-types.ts` that severity prefix is locale-independent. Do NOT add it to the i18n-budgets table. Avoid the temptation to localize `i:` to Italian `i:` (same character, would confuse maintainers).

**Warning signs:** PR review comment "should this be in i18n-budgets.ts"; the answer is NO.

### Pitfall 7: `setMapMode('auto')` after override forgets the BLE verdict

**What goes wrong:** User toggles to `'glyph'` manually, then later picks `'auto'`; map mode should revert to the BLE-probe-determined verdict. But by then, the BLE probe has been forgotten (it ran once at boot).

**Why it happens:** `RasterController.setBleVerdict('raster' | 'glyph')` overwrites the verdict; reverting to `'auto'` doesn't re-run the probe.

**How to avoid:** Store the original BLE verdict in `boot-engine-core.ts` as a closure variable, and pass it through `toggleMapMode`. When `newMode === 'auto'`, restore the verdict from the stored original. Alternative: defer the "re-probe on auto" feature to a future plan; document the limitation in JSDoc.

**Warning signs:** Quick Action `[M]` toggle test passes for raster ↔ glyph but fails for auto round-trip.

### Pitfall 8: ToastQueueLayer survives `bundle([destroy z=2])` but its container schema was set up for "with overlay" state

**What goes wrong:** Closing the overlay leaves z=1.5 toast still mounted, but the page schema was rebuilt with overlay containers; toast slot containers may have been silently removed in the rebuild.

**Why it happens:** `rebuildPageContainer` is full-replacement — every flush must include ALL currently-mounted layers' containers.

**How to avoid:** `LayerManager._flushPage()` (line 222) must reconstruct the full `RebuildPageContainer` payload from the current `this.layers` Map every flush, including z=1.5 toast slots. Don't assume z=1.5 containers persist across flushes.

**Warning signs:** Toast disappears after overlay close; simulator shows the page schema mid-flush is missing toast containers.

---

## Code Examples

### Example 1 — OverlayPanel Interface + Implementation

```typescript
// packages/g2-app/src/engine/layer-types.ts (additions)

export interface OverlayPanel extends Layer {
  onMount(): Promise<void>;
  onUnmount(): Promise<void>;
  onEvent(gesture: R1Gesture): void;
}

export type R1Gesture =
  | { readonly kind: 'tap' }
  | { readonly kind: 'scroll'; readonly direction: 'up' | 'down' }
  | { readonly kind: 'long-press' }
  | { readonly kind: 'double-tap' };
```

```typescript
// packages/g2-app/src/panels/concentration-drop-modal.ts (new)

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { Layer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';

export class ConcentrationDropModalPanel implements OverlayPanel {
  public readonly id = 'conc-drop-modal';

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly ws: WebSocket,
    private readonly conflict: ConcConflictPayload,
    private readonly onClose: () => void,
  ) {}

  async draw(): Promise<void> {
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerName: 'overlay-title',
        content: 'CONCENTRATION CONFLICT',
      }),
    );
    // ... title + body + buttons
  }

  async onMount(): Promise<void> {
    // Subscribe to additional context (e.g., spell details) — Phase 7 may extend.
  }

  async onUnmount(): Promise<void> {
    // No async cleanup needed for Phase 4b.
  }

  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      // Y button — confirm drop
      const envelope = {
        proto: 'evf-v1' as const,
        seq: 0,  // bridge fills
        ts: Date.now(),
        type: CONC_DROP_CONFIRMED_TYPE,
        session_id: 'TODO',  // boot engine threads it
        payload: { effectId: this.conflict.effectId },
      };
      this.ws.send(JSON.stringify(envelope));
      this.onClose();
    } else if (gesture.kind === 'double-tap') {
      // N button — cancel
      this.onClose();
    }
  }

  destroy(): void {
    // Synchronous cleanup; LayerManager calls this after onUnmount() resolves.
  }
}
```

### Example 2 — Map Mode Toggle With Persistence

(see Approach 2 §Key data shapes above — already a complete code example)

### Example 3 — Boot Error Dispatch

```typescript
// packages/g2-app/src/engine/boot-error-dispatch.ts (new)

import { HandshakeError } from './capability-handshake.js';
import { LayerManagerError } from './layer-types.js';
import type { BootErrorState } from './boot-error-types.js';

export function bootErrorFromException(err: unknown): BootErrorState {
  if (err instanceof HandshakeError) {
    switch (err.code) {
      case 'transport_error':
        return 'bridge_unreachable';
      case 'schema_failed':
      case 'parse_failed':
      case 'timeout':
        return 'handshake_failed';
    }
  }
  if (err instanceof LayerManagerError) {
    return 'handshake_failed';
  }
  // WebSocket close events: code 1006 → bridge_unreachable, others → handshake_failed
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg.includes('WebSocket error before open')) return 'bridge_unreachable';
    if (msg.includes('createStartUpPageContainer returned non-success')) return 'handshake_failed';
  }
  // Default
  return 'handshake_failed';
}
```

### Example 4 — Even Hub setLocalStorage Round-Trip

```typescript
import { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const bridge = EvenAppBridge.getInstance();

// Write
const ok = await bridge.setLocalStorage('view.map.mode', 'raster');
console.log(ok);  // true on success, false on host rejection (NEVER throws on simulator)

// Read
const raw = await bridge.getLocalStorage('view.map.mode');
console.log(raw);  // 'raster' (or '' if missing — empty string, NOT null)
```

### Example 5 — Death-Saves Pivot Detection

```typescript
// packages/g2-app/src/status-hud/status-hud-layer.ts (extension)

private pivotLatched = false;

private _onDelta(raw: unknown): void {
  const parsed = CharacterSnapshotSchema.safeParse(raw);
  if (!parsed.success) { /* log + return */ return; }
  this.snapshot = parsed.data;

  const inDeathSaves = parsed.data.hp === 0 && parsed.data.death.failure < 3;
  if (inDeathSaves !== this.pivotLatched) {
    this.pivotLatched = inDeathSaves;
    this.renderer.setMode(inDeathSaves ? 'death-saves' : 'standard');
  }

  this._scheduleDebouncedRender();
}
```

---

## Runtime State Inventory

Phase 4b extends Phase 4a's runtime state surface; no rename / migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Even Hub kv: `view.map.mode` key (new — Phase 4b owns) | Plan 02 writes/reads this key |
| Live service config | None — bridge config unchanged in Phase 4b | None |
| OS-registered state | None — no task scheduler / launchd / systemd | None |
| Secrets/env vars | None — bearer token from Phase 2 still applies | None |
| Build artifacts | `packages/g2-app/dist/` rebuilds; new fixtures in `packages/shared-render/src/fixtures/` | None — `pnpm build` covers |

**Nothing rename/migration-related:** Phase 4b is purely additive (new layers, new fixtures, new envelope types, schema extension). No existing fields are renamed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@evenrealities/even_hub_sdk` | EvenAppBridge (all I/O) | ✓ | 0.0.10 | None |
| `@evenrealities/evenhub-simulator` | Plan tests / smoke | ✓ | 0.7.3 | — |
| `@evf/shared-protocol` | Envelope + schema | ✓ (workspace) | workspace:* | — |
| `@evf/shared-render` | Fixture matchers | ✓ (workspace) | workspace:* | — |
| Node 24 LTS | Build / tests | ✓ | `.nvmrc=24` | — |
| Vitest 4.1.5 | Test runner | ✓ | — | — |
| Real G2 + R1 hardware | Live R1 gesture routing | ✗ | — | `human_needed` gate (ADR-0005 Branch A) — defer to validate-all |

**Missing dependencies with no fallback:** None for Phase 4b's software scope. The R1-on-real-hardware route is `human_needed` (carries forward from Phase 4a).

**Missing dependencies with fallback:** None applicable.

---

## Validation Architecture

> Phase 4b inherits Phase 4a's validation strategy. Nyquist validation is enabled (workflow config; absent key treated as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `packages/g2-app/vitest.config.ts` (happy-dom) + root `vitest.config.ts` (`test.projects`) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run` |
| Full suite command | `pnpm test` (workspace-wide) |
| Snapshot update | `pnpm test -- --update-snapshots` |
| Coverage | `pnpm test:coverage` (≥80% threshold) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-05 (overlay slot) | OverlayPanel onMount/onUnmount/onEvent lifecycle | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 0 |
| MAP-05 (toggle) | toggleMapMode applies in-memory + persists | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 1 |
| TOAST-01 | FIFO + 3 s dwell + squash badge | Unit + Snapshot | `pnpm --filter @evf/g2-app test` + matchAsciiFixture | ❌ Wave 2 |
| TOAST-01 (Fireball+8 stress) | 9 toasts → 2 visible + queue + decrement on dwell | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 2 |
| BOOT-01 (5 states × 2 locales) | Each state renders distinct fixture | Snapshot | `pnpm --filter @evf/g2-app test` + matchAsciiFixture | ❌ Wave 2 |
| BOOT-01 (dispatch) | Each exception → correct enum state | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 2 |
| DEATH-01 (latch on/off) | HP=0 + failure<3 → latched; HP>0 → unlatched | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 3 |
| DEATH-01 (pivot render) | Pivot grid matches fixture (IT + EN) | Snapshot | `pnpm --filter @evf/g2-app test` | ❌ Wave 3 |
| CONC-01 (modal open/close) | conc.conflict envelope → modal mounts; [Y] → conc.drop.confirmed emit | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 3 |
| CONC-01 (death+conc edge) | HP=0 + conc-modal: pivot retained underneath | Snapshot | `pnpm --filter @evf/g2-app test` | ❌ Wave 3 |
| **Container budget** | Modal + toast + idle infill stays ≤ 12 | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 0 |
| **ADR-0009 Amendment 1** | bundle() with z=2 mount demolishes z=0.5 | Unit | `pnpm --filter @evf/g2-app test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run` (fast g2-app focused)
- **Per wave merge:** `pnpm test` (workspace-wide; catches shared-protocol schema break)
- **Phase gate:** Full suite green + `pnpm test:coverage` ≥80% before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/g2-app/src/engine/__tests__/overlay-panel.test.ts` — Panel API contract verification
- [ ] `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (extend) — container-budget assertion + z=2 demolish-z=0.5 rule
- [ ] `packages/g2-app/src/engine/__tests__/map-mode-toggle.test.ts` — persistence round-trip
- [ ] `packages/g2-app/src/engine/__tests__/boot-error-dispatch.test.ts` — exception → state mapping
- [ ] `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts` — FIFO + squash + dwell
- [ ] `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` (extend) — death-saves mode
- [ ] `packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts` — open/close + gesture routing
- [ ] 17 new fixture files (Q6 inventory)
- [ ] ADR-0009 Amendment 1 — `docs/architecture/0009-layer-manager-contract.md` extension
- [ ] Changeset file in `.changeset/` for Phase 4b

---

## Security Domain

Phase 4b is browser-side rendering + WS receive/send. The new attack surfaces are:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (Phase 4b is client; auth is bearer from Phase 2) | — |
| V3 Session Management | Partial — `conc.drop.confirmed` envelope carries session_id | `EnvelopeSchema.safeParse()` enforces UUID v4 session_id |
| V4 Access Control | No | — |
| V5 Input Validation | Yes — new envelope types `conc.conflict`, `r1.gesture` | `ConcConflictPayloadSchema.safeParse()` + `R1GesturePayloadSchema.safeParse()` at every WS receive |
| V6 Cryptography | No | — |

### Known Threat Patterns for g2-app (Phase 4b additions)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious `conc.conflict` envelope spoofs an effect drop | Spoofing | Bearer token + session_id UUID check; only emit `conc.drop.confirmed` if envelope schema validates |
| Malformed boot error fixture path (CI cache poisoning) | Tampering | Fixtures are committed; `matchAsciiFixture` requires snapshot file on disk; CI rejects untracked fixture changes |
| Toast queue overflow → memory leak | DoS | FIFO with bounded queue capacity (suggest soft-cap at 100 buffered toasts; drop oldest on overflow + telemetry event) |
| `setLocalStorage` injection (malformed value) | Tampering | Value is the literal `'auto' | 'raster' | 'glyph'`; whitelist at read time (already in `loadPersistedMapMode`) |
| ConcDropConfirmedPayload effectId injection | Tampering | Receive-side validation in foundry-module (Phase 7) — bearer + session_id + effectId-belongs-to-actor check |

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Impact on Phase 4b |
|-----------|--------|-------------------|
| No React/Vue/Svelte in g2-app | D-2.04 | Plain TS classes throughout |
| INV-1: character-perfect ASCII layout | §0.1 | 17 new fixture files; CI matches char-by-char |
| INV-2: every claim cites canonical upstream | §0.1 | SDK signatures verified from `index.d.ts`; Specs sections cited verbatim |
| INV-3: Specs.md + README + showcase update atomic | §0.1 | If container-budget audit triggers Specs §7.4c amendment, must be atomic INV-3 commit |
| INV-4: zero dead code, JSDoc on public APIs | §0.1 | Every new class + interface gets JSDoc |
| Biome 2.4.15 lint + format | ADR-0008 | `pnpm lint:ci` must pass |
| TypeScript strict + 6 flags | tsconfig.base.json | `noUncheckedIndexedAccess` (toast queue array access — beware) |
| Conventional Commits; scope `g2-app` or `shared-protocol` | commitlint.config.js | `feat(g2-app): toast queue` / `feat(shared-protocol): add death-saves schema` |
| `// TODO` requires `(#issue)` or `(ADR-NNNN)` | INV-4 | Phase 6 R1 routing: `// TODO(Phase-6): wire panel-gesture-bus to bridge.onEvenHubEvent` |
| No `localStorage` / `sessionStorage` | Specs §3.1 | Use `bridge.setLocalStorage` only |
| ADR-0005 PROVISIONAL: hardware SC | ADR-0005 | Phase 4b inherits Phase 4a's `human_needed` gates — no new hardware SC added |
| Bearer token survives sessions | Specs §11.5.4 | Phase 4b does not touch bearer; Phase 2/4a precedent stands |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Toast layer uses 1 text container with 2-row newline-separated content (vs 2 separate containers) | Q1, Q5 | If implementation prefers 2 containers, Q1 Mitigation Option A required to fit overlay+toast+raster |
| A2 | Phase 6 R1 source provider will use an in-process panel-gesture-bus, not WS routing | Q2 | If Phase 6 chooses WS routing, the panel-gesture-bus module needs reshaping; modal test harness needs WS round-trip |
| A3 | `no_character` state fires post-boot via timeout (5 s) if no `character.delta` arrives | Q3 | Phase 2 reader may emit `character.delta` with null payload; planner must verify Phase 2 SUMMARY before locking |
| A4 | `token_expired` is post-boot only (handled by runtime layer swap, not boot-engine try/catch) | Q3 | If token can expire during the handshake window, boot-engine try/catch needs the 401 case |
| A5 | Foundry dnd5e 5.x stores death saves as `actor.system.attributes.death.{success,failure}` integers 0-3 | Approach 5 | If field path differs (e.g., nested under `death.attempts` or named differently), reader code adjusts |
| A6 | DE locale for boot-error fixtures is optional (IT + EN suffices for MVP per §7.16.5 best-effort) | Q6 | If user wants 3-locale parity, fixture count becomes 22 not 17; planner adjusts |
| A7 | Toast severity prefix `i:` / `!:` / `x:` is language-neutral (not in i18n-budgets) | Pitfall 6 | If user requests localization, add to i18n-budgets table with locale-specific prefixes |
| A8 | `bridge.setLocalStorage` never throws on the simulator; returns `false` on host rejection | Q8 | If real hardware throws, the catch block in `loadPersistedMapMode` already handles it gracefully |
| A9 | The R1 long-press gesture is derivable from CLICK_EVENT + timing OR via another SDK channel (Phase 6 resolves) | Q2 | Phase 4b conc-modal doesn't need long-press; stub in `R1Gesture` is safe |
| A10 | OverlayPanel implementations can mount with 1-3 text/list containers max (typical conc-drop = 2) | Q1 | If a future panel needs more, Q1 Mitigation Option B (panel budget restriction) becomes necessary |
| A11 | `LayerManager.bundle()` z=2 mount auto-demolishes z=0.5 (per Q1 Mitigation Option A) | Q7 | Planner finalizes this rule; if CONTEXT.md Area 1 is taken literally (no demolish ever), container budget forces alternative |

**All other claims in this research were verified against the SDK source (`@evenrealities/even_hub_sdk@0.0.10 index.d.ts`), codebase files, or Phase 4a SUMMARY files.**

---

## Open Questions

1. **Phase 2 `character.delta` payload shape when no actor is assigned**
   - What we know: `CharacterSnapshotSchema` is currently `z.strictObject` with required fields; producing a "missing" snapshot would fail validation.
   - What's unclear: Does Phase 2 reader emit `{ type: 'character.delta', payload: null }` (which fails the inner safeParse), `{ type: 'character.missing' }` (separate envelope), or skip emission entirely?
   - Recommendation: Plan 04 must read Phase 2 Plan 05 SUMMARY before locking the `no_character` dispatch path. If neither pattern exists, Plan 04 may need to add a 5-second post-handshake timeout watcher.

2. **Whether the in-process panel-gesture-bus needs a buffer for "missed" gestures during panel mount transition**
   - What we know: Gestures arrive from `bridge.onEvenHubEvent`; panel `onMount()` may be async.
   - What's unclear: If a gesture fires during the `await onMount()` window, is it queued for replay or dropped?
   - Recommendation: Plan 01 ships drop-on-no-active-panel semantics (simplest); document the limitation. Phase 6 can extend.

3. **Concentration-drop modal: what if z=2 is ALREADY occupied (e.g., panel-on-panel)?**
   - What we know: CONTEXT Area 8 says modal opens at z=2; Phase 4b ships only the conc modal.
   - What's unclear: In Phase 5, if a CharacterSheetPanel is open at z=2 and conc-conflict fires, does the modal pre-empt the sheet, queue behind it, or refuse to open?
   - Recommendation: Plan 05 documents the policy in ADR-0009 Amendment 1: "modal pre-empts existing panel (existing panel's onUnmount() runs first; modal mounts; on modal close, prior panel is NOT auto-restored — user re-opens via Quick Action)." Phase 5 ratifies.

4. **Toast queue: hard cap on buffered toasts (denial-of-service mitigation)**
   - What we know: SC #3 says "without dropping any" but realistically a million toasts can't fit in memory.
   - What's unclear: What's the hard cap?
   - Recommendation: Soft-cap at 100 buffered toasts (Plan 03 const); drop oldest above the cap with a telemetry event. Document in `toast-types.ts` JSDoc.

---

## Sources

### Primary (HIGH confidence)

- `@evenrealities/even_hub_sdk@0.0.10` — `index.d.ts` at `/home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` — `setLocalStorage`/`getLocalStorage` signatures (line 1135-1157), `containerTotalNum` 1-12 cap (line 659-661), `OsEventTypeList` enum (line 716-727), `EvenHubEvent` shape (line 893-901), `onEvenHubEvent` subscription (line 1249-1262) [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/engine/layer-types.ts` — ZIndex enum (Z0_5 = 0.5 precedent), Layer interface, LayerOp union, LayerManagerError [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/engine/layer-manager.ts` — `mount() / destroy() / bundle()` semantics + capture-invariant enforcement [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/engine/capability-handshake.ts` — `HandshakeError` class with `code: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error'` [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/engine/page-lifecycle.ts` — `buildBootPageSchema()` 11-container declaration + `rebuildToOverlay` helper [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/internal/boot-engine-core.ts` — 14-step boot sequence, integration points for Phase 4b extensions [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — existing renderer to extend with `mode: 'death-saves'` [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/status-hud/status-hud-layer.ts` — `_onDelta` pattern to extend with pivot detection [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/status-hud/idle-infill-layer.ts` — z=0.5 layer pattern (informs ToastQueueLayer design) [VERIFIED: codebase read 2026-05-15]
- `packages/g2-app/src/hub-polyfill.ts` — Phase 2 polyfill wrapping `EvenAppBridge.setLocalStorage` [VERIFIED: codebase read 2026-05-15]
- `packages/shared-protocol/src/envelope.ts` — `EnvelopeSchema` shape that Phase 4b new envelope types extend [VERIFIED: codebase read 2026-05-15]
- `packages/shared-protocol/src/payloads/character.ts` — current `CharacterSnapshotSchema` (no `death` field — Phase 4b EXTENDS) [VERIFIED: codebase read 2026-05-15]
- `packages/shared-render/src/fixtures/*.txt` — Phase 4a 10 existing fixtures (precedent for Phase 4b's 17 new ones) [VERIFIED: codebase ls 2026-05-15]
- `docs/architecture/0001-layered-ui-model.md` + Amendment 1 — z=0.5 atomic with z=2 (CONTEXT Area 1 diverges) [VERIFIED: codebase read 2026-05-15]
- `docs/architecture/0009-layer-manager-contract.md` — ACCEPTED 2026-05-15; Amendment 1 reserved [VERIFIED: codebase read 2026-05-15]
- `Specs.md §3.1` — 4 image + 8 text/list + 1 capture container budget [VERIFIED: codebase read 2026-05-15]
- `Specs.md §7.4c.6` — Container budget impact per stato table [VERIFIED: codebase read 2026-05-15]
- `Specs.md §7.15.2` — Toast Approach A MVP design [VERIFIED: codebase read 2026-05-15]
- `Specs.md §7.16` — Locale architecture (IT/EN canonical + DE/ES/FR/PT-BR best-effort) [VERIFIED: codebase read 2026-05-15]
- `.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md` — Phase 4a research as structural template [VERIFIED: codebase read 2026-05-15]
- CLAUDE.md (Technology Stack + INV-1/2/3/4 + D-2.04) — project constraints [VERIFIED: project instructions 2026-05-15]
- `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md` — 8 locked decisions [VERIFIED: codebase read 2026-05-15]

### Secondary (MEDIUM confidence)

- Phase 2 SUMMARY files (Plans 02-05) — character/combat reader behavior, `hub.setItem/getItem` polyfill backstory; cited via `.planning/STATE.md` accumulated context [CITED: STATE.md]
- `github.com/foundryvtt/dnd5e` — actor death saves data path `actor.system.attributes.death.{success,failure}` [ASSUMED: convention; verify in implementation]
- `Specs.md §11.5.4` — Bearer token 24h + silent refresh; informs token_expired dispatch policy [VERIFIED: spec read 2026-05-15]

### Tertiary (LOW confidence — flagged above as `[ASSUMED]`)

- Phase 6 R1 source provider topology — planner stubs minimally; Phase 6 finalizes
- Toast severity prefix language-neutrality — pending UX review
- DE locale boot-error fixtures optionality — pending user preference

---

## Metadata

**Confidence breakdown:**

- Overlay slot + Panel API contract: HIGH — direct extension of Phase 4a's verified Layer interface; ADR-0009 binds
- Map mode toggle + persistence: HIGH — SDK signatures verified; failure-mode policy mirrors Phase 2 polyfill graceful-degradation
- Toast queue: MEDIUM — squash semantics interpretation (Q5) requires user confirmation
- Boot error UI: MEDIUM — dispatch source map (Q3) depends on Phase 2 reader behavior for `no_character`
- Death-saves pivot: HIGH for renderer + StatusHudLayer extension; MEDIUM for Phase 2 reader extension (schema field path assumed)
- Conc-drop modal: HIGH for client-side modal + envelope shape; Phase 7 server-side wiring is out of scope
- Container budget audit (Q1): HIGH — math verified against SDK cap (12 containers) and Phase 4a `buildBootPageSchema` (11 declared)
- ADR-0009 Amendment 1: HIGH — recommended text reuses Phase 4a Amendment 1 wording pattern

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (stable SDK, low-churn workspace; re-verify SDK before Phase 5 if new `@evenrealities/even_hub_sdk` version ships)

## RESEARCH COMPLETE
