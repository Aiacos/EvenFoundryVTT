# Phase 6: R1 Integration + Quick Action + INV-5 — Research

**Researched:** 2026-05-16
**Domain:** In-process gesture routing, overlay-stack management, status-hud context chip, INV-5 invariant
**Confidence:** HIGH (all findings verified against committed codebase; R1 timing defaults ASSUMED pending hardware)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Area 1 — R1 Event Source Provider Architecture**
- Input path: Bridge WS `r1.gesture` envelope (`type: 'r1.gesture'`, payload `{ kind: 'tap'|'scroll-up'|'scroll-down'|'long-press', timestamp: number }`). Reserved in Phase 4b shared-protocol; Phase 6 adds `R1GestureEnvelopeSchema` in `packages/shared-protocol/src/payloads/r1.ts`.
- Provider module: `packages/g2-app/src/engine/r1-event-source.ts` — `attachR1EventSource(ws, gestureBus, layerManager, timings): () => void`.
- Double trust boundary: outer `EnvelopeSchema.safeParse` + inner `R1GestureEnvelopeSchema.safeParse`.
- Timing constants: `packages/g2-app/src/engine/r1-timings.ts` exports `DEFAULT_R1_TIMINGS = { tapMs: 250, doubleTapWindowMs: 350, longPressMs: 600, scrollDebounceMs: 50 }`.
- `LayerManager.getTopLayer()` returns the highest-z mounted layer exposing `onEvent`.
- `PanelGestureBus.publish` routes to exactly one receiver (top layer). INV-5 enforcement.

**Area 2 — Quick Action Menu UX**
- `QuickActionMenuPanel implements OverlayPanel` at z=2, Strategy A single `'overlay-block'` text container.
- Differential demolish rule applies (z=0.5 stashed on open, restored on close); z=1.5 toast survives.
- If another OverlayPanel was active, it is **suspended** (state preserved, layer destroyed) and **restored** on menu close via new `PanelRouter.pushOverlay(menu)` / `popOverlay()` stack.
- 9 menu items: `[S] [C] [L] [B] [I] [A] [M] [N] [X]`.
- Active indicator: `▶ ` prefix (same as tab strip, SHEET-04).
- Scroll cycles, tap opens, long-press cancels.
- `[N] Language` sub-menu renders `LOCALE_MENU` constant from Phase 5; tap calls `persistLocaleOverride` + emits `locale.changed` on `panel-gesture-bus`.
- Context chip: `LayerManager.getTopLayer()?.getR1Hints()` — optional method on Layer interface.

**Area 3 — INV-5 Ratification + Reachability Harness**
- INV-5 location: `docs/architecture/INVARIANTS.md` consolidating INV-1..5.
- Test harness: `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` 15 named cases.
- Hardware-pending SC carry-forward: SC-06-01, SC-06-02, SC-06-03 (ADR-0005 Branch A `human_needed`).
- Total project hardware-pending after Phase 6: **18**.

### Claude's Discretion
- Plan decomposition refinement (wave/plan boundary details).
- Test helper API shape for `simulateGesture`.

### Deferred Ideas (OUT OF SCOPE)
- Foundry write path (Phase 7).
- Multi-attack tracker overlay (MULTI-01).
- Reaction execution toast wiring (REACT-01).
- AoE template placement (ACT-02).
- Voice input via R1 hold-to-talk (V2 Phase 12).
- R1 biometrics (STRETCH-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | R1 gesture model: tap=cycle, double-tap=back, scroll=nav, long-press=Quick Action. Timing windows locked in Phase 0 §10.0.1 → hardware-pending SC-06-01. | `attachR1EventSource` + `DEFAULT_R1_TIMINGS` + `LayerManager.getTopLayer()` + context chip |
| NAV-02 | Quick Action menu list-modal full-screen (`[S][C][L][B][I][A][M][N][X]`), scroll=select, tap=open, long=cancel. | `QuickActionMenuPanel` + `PanelRouter.pushOverlay/popOverlay` + 9 INV-1 fixtures |
| NAV-03 | Cross-overlay reachability + closability (15× checklist §7.14.4 ck 1-15). | `06-cross-overlay-reachability.test.ts` + `simulateGesture` helper |
| INV-5 | Gesture Determinism ratified: every R1 gesture maps to exactly one panel handler call. | `LayerManager.getTopLayer()` + INV-5 text + `INVARIANTS.md` + panel-gesture-bus single-receiver tests |
</phase_requirements>

---

## Summary

Phase 6 is an integration-completion phase, not a greenfield feature phase. All the infrastructure it needs (LayerManager, PanelGestureBus, OverlayPanel lifecycle, PanelRouter, differential demolish, locale-override) shipped in Phases 4b and 5. Phase 6's job is to: (1) wire the real R1 WS event source into the gesture bus, (2) add `getTopLayer()` routing semantics that make INV-5 enforceable at runtime, (3) build the QuickActionMenuPanel and the PanelRouter overlay stack, and (4) replace the static footer chip with a context-aware one. No new npm packages, no new schema sub-systems — all dependencies already exist in the repo.

The critical design insight confirmed by reading the source: `PanelGestureBus.publish` currently fans out to **all** subscribers (snapshot iteration, per-subscriber error isolation). INV-5 requires routing to **exactly one** subscriber — the top layer. This means Phase 6's `getTopLayer()` accessor does NOT change `publish` to single-dispatch; instead, the panels themselves must only handle gestures when they are the top layer. The router subscribes the active panel; when the QuickActionMenuPanel opens, it **suspends** the previous panel's subscription (via `onUnmount`), installs its own. The bus fan-out remains correct by construction because at any moment only one panel is subscribed.

The R1 timing defaults (`tapMs: 250`, `doubleTapWindowMs: 350`, `longPressMs: 600`, `scrollDebounceMs: 50`) are locked decisions from CONTEXT.md but are marked ASSUMED for hardware validation because the Even Hub SDK does not publicly document tap-disambiguation timing windows. The long-press threshold of ≥500 ms appears in Specs.md §3.2 and §10.0.1 GO criteria; the 600 ms default in CONTEXT.md adds 100 ms margin for real-hardware detection latency, which is reasonable.

**Primary recommendation:** Implement `getTopLayer()` as a synchronous map scan; extend `PanelRouter` with an `overlayStack` field and `pushOverlay/popOverlay`; route gestures via the existing bus architecture (not a new dispatch path). The bus fan-out is idempotent when only one panel is subscribed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| R1 WS event ingestion + schema validation | Browser/WebView (g2-app) | — | Bridge already forwards R1 events; `r1-event-source.ts` lives in g2-app/src/engine |
| Gesture timing (tap/double-tap/long-press debounce) | Browser/WebView (g2-app) | — | Client-side timing logic; SDK delivers raw events, client synthesizes intent |
| Top-of-stack routing | Browser/WebView (g2-app — LayerManager) | — | LayerManager is the single authority on mounted layers |
| QuickActionMenuPanel rendering | Browser/WebView (g2-app — panels) | — | Text container, same as all other panels |
| PanelRouter overlay stack | Browser/WebView (g2-app — engine) | — | Router owns all z=2 bundle calls |
| Context chip rendering | Browser/WebView (g2-app — status-hud) | — | StatusHudRenderer is z=1; chip is its footer row |
| `getR1Hints()` interface | Browser/WebView (g2-app — layer-types.ts) | — | Optional method extension on existing Layer interface |
| INV-5 doc ratification | Documentation (docs/architecture/) | — | INVARIANTS.md consolidates all 5 invariants |
| Cross-overlay reachability tests | Test infrastructure (g2-app/__tests__) | — | Integration harness on real engine + mock bridge |
| Locale sub-menu data | Already shipped (g2-app/src/locale/locale-menu.ts) | — | LOCALE_MENU constant from Phase 5 |
| Locale persistence | Already shipped (g2-app/src/locale/locale-override.ts) | — | `persistLocaleOverride` from Phase 5 |

---

## Standard Stack

### Core — no new npm packages

Phase 6 uses only existing dependencies. No new `npm install` commands needed.

| Existing Library | Purpose in Phase 6 | Source |
|----------|---------|---------|
| `zod` 4.4.3 | `R1GestureEnvelopeSchema` Zod schema in shared-protocol | Already in workspace |
| `@evenrealities/even_hub_sdk` 0.0.10 | `EvenAppBridge` type for WS handle typing | Already in g2-app |
| `vitest` 4.1.5 + `@vitest/coverage-v8` | 06-cross-overlay-reachability test harness | Workspace-wide |
| `@evf/shared-render` (workspace) | `matchAsciiFixture` for 9 new INV-1 fixtures | Phase 4a delivery |
| `@evf/shared-protocol` (workspace) | `EnvelopeSchema` base + new `R1GestureEnvelopeSchema` | Phase 2 delivery |

**Installation:** none required.

---

## Architecture Patterns

### System Architecture Diagram

```
Bridge WS (r1.gesture envelope)
        │
        ▼
attachR1EventSource(ws, gestureBus, layerManager, timings)
        │ EnvelopeSchema.safeParse (outer trust boundary)
        │ R1GestureEnvelopeSchema.safeParse (inner)
        │ timing synthesis (doubleTap window, longPress threshold)
        ▼
PanelGestureBus.publish(R1Gesture)
        │ synchronous fan-out (snapshot of current subscribers)
        │ [at any moment only ONE panel is subscribed — INV-5]
        ▼
Active OverlayPanel.onEvent(gesture)
        │
        ├─► if QuickActionMenu is top:
        │       scroll → cycle item
        │       tap → open item or select locale
        │       long-press → popOverlay (restore suspended panel)
        │
        └─► if regular panel is top:
                long-press → PanelRouter.pushOverlay(quickActionMenu)
                               └─► active panel.onUnmount() (unsubscribes)
                               └─► LayerManager.bundle([mount z=2 menu])
                               └─► menu.onMount() (subscribes)

LayerManager.getTopLayer()
        │ scan layers Map (ZIndex → Layer) in descending z order
        │ return first layer where isOverlayPanel(layer) === true
        └─► null if no OverlayPanel mounted (boot splash, boot error)

StatusHudRenderer.renderFooterChip()
        │ layerManager.getTopLayer()?.getR1Hints?.()
        │ or DEFAULT_HINTS = { tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' }
        └─► format: R1: tap=<tap>  scroll=<scroll>  long=quick[<id>]
```

### Recommended Project Structure (Phase 6 additions only)

```
packages/
├── shared-protocol/src/payloads/
│   └── r1.ts                          # R1GestureEnvelopeSchema (new)
├── g2-app/src/engine/
│   ├── r1-timings.ts                  # DEFAULT_R1_TIMINGS (new)
│   ├── r1-event-source.ts             # attachR1EventSource (new)
│   ├── layer-manager.ts               # +getTopLayer() (extend)
│   ├── layer-types.ts                 # +getR1Hints() on Layer (extend)
│   └── panel-router.ts                # +pushOverlay/popOverlay (extend)
├── g2-app/src/panels/
│   └── quick-action-menu-panel.ts     # QuickActionMenuPanel (new)
├── g2-app/src/status-hud/
│   ├── status-hud-renderer.ts         # +renderFooterChip() (extend)
│   └── i18n-budgets.ts                # +~18 keys (extend)
├── g2-app/src/engine/__tests__/
│   └── r1-event-source.test.ts        # unit tests (new)
├── g2-app/src/panels/__tests__/
│   └── quick-action-menu-panel.test.ts # panel unit tests (new)
├── g2-app/src/__tests__/
│   └── 06-cross-overlay-reachability.test.ts # 15-case harness (new)
├── shared-render/src/fixtures/
│   ├── quick-action.base.it.txt       # 9 new INV-1 fixtures
│   ├── quick-action.combat-suspended.it.txt
│   ├── quick-action.language-submenu.it.txt
│   ├── quick-action.base.de.txt
│   ├── status-hud.chip.main.it.txt
│   ├── status-hud.chip.sheet.it.txt
│   ├── status-hud.chip.combat.it.txt
│   ├── status-hud.chip.menu.it.txt
│   └── status-hud.chip.boot-error.it.txt
└── docs/architecture/
    └── INVARIANTS.md                  # INV-1..5 consolidation (new)
```

---

## Research Findings: Seven Specific Questions

### Q1 — R1 Timing Window Defaults

**Finding:** The Specs.md §3.2 GO criteria for §10.0.1 state "long-press ≥500 ms" as the hardware threshold. The CONTEXT.md defaults are:

```ts
export const DEFAULT_R1_TIMINGS = {
  tapMs: 250,              // single-tap window — [ASSUMED]
  doubleTapWindowMs: 350,  // 2nd tap must arrive within — [ASSUMED]
  longPressMs: 600,        // 600 ms gives 100 ms margin over ≥500 ms spec — [ASSUMED hardware margin]
  scrollDebounceMs: 50,    // debounce scroll events — [ASSUMED]
} as const;
```

**Rationale for the values (prior art):**

- `tapMs: 250` — The Specs.md §4.4 shows `r1.tap { count: 1|2, timestamp }` as the raw event model. A 250 ms window for "this tap is complete, not the start of a double-tap" aligns with HCI literature (average double-tap inter-click ~120-200 ms; 250 ms gives margin). [ASSUMED — not confirmed against Even Hub SDK runtime documentation]
- `doubleTapWindowMs: 350` — Must be > `tapMs` to avoid race; 350 ms is a common HCI default for double-click/double-tap on touchscreens. [ASSUMED]
- `longPressMs: 600` — Spec says ≥500 ms. The bridge presumably detects the `r1.longPress { phase: "start"|"end", duration_ms }` event. If the bridge delivers `"end"` only, the 600 ms window is irrelevant (we use the bridge's own classification); if the bridge delivers `"start"` + `duration_ms`, the client applies its own threshold. CONTEXT.md decided 600 ms. [ASSUMED pending §10.0.1 hardware test SC-06-01]
- `scrollDebounceMs: 50` — Prevents scroll-burst flooding. 50 ms is a conservative debounce for hardware click-events (not touch-swipe). [ASSUMED]

**Key architectural note verified in Specs.md §4.4:** The bridge delivers `r1.longPress { phase: "start"|"end", duration_ms }`. This means the bridge already classifies long-press; the client's `longPressMs` threshold may be used only as a client-side override guard. The `r1-event-source.ts` provider should accept `kind: 'long-press'` directly from the `r1.gesture` envelope when the bridge delivers it, without needing to apply timing logic on its own. This is consistent with CONTEXT.md's design: "long-press detected on payload kind 'long-press' direct from bridge (bridge does the timing)." [VERIFIED: Specs.md §4.4 + CONTEXT.md Area 1]

**Confidence:** MEDIUM. The defaults are defensible prior art but require validation against the real R1 ring (SC-06-01). The critical constraint is hardware-confirmed: ≥500 ms threshold.

---

### Q2 — Top-of-Stack Semantics + Bundle Interaction

**Finding from reading `layer-manager.ts`:**

The `LayerManager` stores layers in `private readonly layers = new Map<ZIndex, Layer>()`. The `bundle()` method modifies this map synchronously during the loop (Steps 1–2 in the code), then asserts invariants, then awaits `onUnmount` / `onMount`, then flushes.

**Critical timing insight:** During `bundle()`, the layers map is in a **transitional state** between Step 2 (ops applied) and Step 5 (onMount awaited). If `getTopLayer()` is called from within an `onMount` handler, it will see the post-op map state (the new panel is already registered). This is correct behavior — the top layer is the newly-mounted one.

**`getTopLayer()` implementation pattern:**

```ts
// packages/g2-app/src/engine/layer-manager.ts (Phase 6 addition)
getTopLayer(): Layer | null {
  // Iterate ZIndex values in descending order.
  // Map preserves insertion order, NOT numeric order — must sort keys.
  const sortedEntries = [...this.layers.entries()].sort(([a], [b]) => b - a);
  for (const [, layer] of sortedEntries) {
    if (isOverlayPanel(layer)) {
      return layer;
    }
  }
  return null;
}
```

**Threading model:** Synchronous. No locks needed — single-threaded browser main thread. The `isOverlayPanel` guard (duck-typed check for `onMount + onUnmount + onEvent`) filters out z=1 StatusHudLayer, z=1.5 ToastQueueLayer, z=0 MapBaseLayer, z=0.5 IdleInfillLayer — all of which lack `onEvent`.

**When is top = `null`?** Boot splash layer (z=2 during boot sequence) implements `Layer` but NOT `OverlayPanel` (no `onEvent`). Boot error layer similarly. These are correct no-op cases per INV-5: zero-handler edge cases are explicit no-ops with telemetry. [VERIFIED: layer-types.ts OverlayPanel interface, overlay-panel.ts isOverlayPanel guard]

**Mid-bundle call:** If `getTopLayer()` is called during `onMount()` of the incoming panel, the new panel is already in `layers` (Step 2 completes before Step 5). So `getTopLayer()` returns the newly-mounting panel. This is desirable: the panel can observe itself as top during its own mount hook. [VERIFIED: bundle() source in layer-manager.ts lines 226-270]

---

### Q3 — Overlay Stack Semantics for QuickActionMenuPanel (onUnmount + onMount idempotency)

**Finding from reading `concentration-drop-modal.ts` (the exemplar):**

`ConcentrationDropModalPanel.onUnmount()` does exactly two things:
1. Calls `this.unsubscribe()` — removes the gesture bus subscription.
2. Sets `this.unsubscribe = null` — makes the second call a no-op.

It does **NOT** clear any render state (no `this.mode = null`, no `this.activeIndex = 0` reset). The modal has no persistent state to worry about — it's a one-shot confirm/cancel panel.

**For QuickActionMenuPanel**, the suspension/restoration round-trip matters more because the menu has `activeIndex` state. The CONTEXT.md decision is:

> If another OverlayPanel was active before long-press, it is **suspended** (state preserved, layer destroyed) and **restored** on menu close.

**Key finding:** `onUnmount` is called when the layer is destroyed (removed from the layers map). For the **suspended panel** (the regular panel that was open when the user long-pressed), `onUnmount` releases its gesture bus subscription. When `popOverlay()` restores it by calling `bundle([{ type: 'mount', z: Z2_OVERLAY, layer: suspendedPanel }])`, the panel's `onMount` is called again — which re-subscribes to the gesture bus.

**Is this idempotent?** Yes, provided:
1. `onUnmount` nulls the unsubscribe closure (already the pattern from conc-modal).
2. `onMount` creates a fresh subscription (already the pattern).
3. The panel's visual state (which tab is active, scroll position) is stored in instance fields that survive the unmount/remount cycle.

**Critical distinction — suspend vs destroy:**

The CONTEXT.md uses "suspended" conceptually, but the implementation uses `onUnmount + onMount` round-trip, NOT a separate `onSuspend / onResume` pair. The reason this works is that the panel INSTANCE is preserved (same object reference). The LayerManager destroys the z=2 slot (removes the panel from its layers map), but the PanelRouter holds the panel instance in its `overlayStack`. When `popOverlay` runs, it calls `bundle([{ type: 'mount', z: Z2_OVERLAY, layer: sameInstance }])`.

**State preservation contract:** The panel's instance fields (e.g., `activeTab`, `scrollOffset`, current snapshot) survive because JavaScript objects are reference-typed. The panel is NOT garbage collected because PanelRouter holds a reference in `overlayStack`. The `onUnmount → onMount` round-trip is equivalent to a `pause → resume` if the panel preserves its own state in instance fields.

**Conclusion:** No `onSuspend / onResume` distinction is needed. The `onUnmount + onMount` round-trip is idempotent for state preservation as long as:
- State lives in instance fields (not in gesture bus callbacks or timers that are torn down in `onUnmount`).
- `onMount` re-registers everything released in `onUnmount`.

This is exactly what the conc-modal exemplar does for its bus subscription. Phase 5 panels should follow the same contract. [VERIFIED: concentration-drop-modal.ts onMount/onUnmount, panel-gesture-bus.ts subscribe()]

**PanelRouter.pushOverlay / popOverlay pattern:**

```ts
// Within PanelRouter (Phase 6 extension)
private overlayStack: OverlayPanel[] = [];

async pushOverlay(panel: OverlayPanel, layerManager: LayerManager): Promise<void> {
  // If something is at z=2, suspend it (unmount but keep instance in stack)
  const current = layerManager.getLayer(ZIndex.Z2_OVERLAY);
  if (current !== null && current !== undefined && isOverlayPanel(current)) {
    // bundle([{type:'destroy', z:Z2_OVERLAY}]) triggers current.onUnmount()
    await layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    this.overlayStack.push(current as OverlayPanel);
  }
  // Mount the new panel
  await layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
}

async popOverlay(layerManager: LayerManager): Promise<void> {
  // Destroy current top
  await layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
  // Restore suspended panel (if any)
  const restored = this.overlayStack.pop();
  if (restored !== undefined) {
    await layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: restored }]);
  }
  // If stack empty: differential demolish restores z=0.5 automatically
}
```

**Differential demolish interaction:** When `pushOverlay` issues `bundle([{type:'destroy', z:Z2_OVERLAY}])` to suspend the current panel, and z=0.5 was already stashed when that panel was originally opened, the destroy triggers the differential demolish **restore** (re-mounts z=0.5). Then `pushOverlay` immediately issues `bundle([{type:'mount', z:Z2_OVERLAY, layer:menuPanel}])`, which re-stashes z=0.5 again.

This means two `rebuildPageContainer` calls occur (one for suspend, one for menu-mount). To avoid the intermediate flicker, Phase 6 should consider a single atomic bundle combining both ops: `[{type:'destroy', z:Z2_OVERLAY}, {type:'mount', z:Z2_OVERLAY, layer:menuPanel}]`. The `_suspendedZ05` logic in `bundle()` handles this correctly: the destroy triggers the implicit z=0.5 restore op, then the mount triggers a new z=0.5 demolish — net result: z=0.5 stays stashed, one bridge flush. [VERIFIED: layer-manager.ts bundle() differential demolish logic]

**Single-bundle suspension:** The preferred pattern is:

```ts
// Atomic: destroy current panel + mount menu in one bridge flush
await layerManager.bundle([
  { type: 'destroy', z: ZIndex.Z2_OVERLAY },   // triggers current.onUnmount; z=0.5 restored then re-stashed
  { type: 'mount', z: ZIndex.Z2_OVERLAY, layer: menuPanel }  // triggers menu.onMount
]);
```

This is a single `rebuildPageContainer` call. The conc-modal dispatcher uses this exact pattern. [VERIFIED: concentration-drop-modal.ts + layer-manager.ts bundle() steps 1-6]

---

### Q4 — Context Chip Dependency Direction

**Finding from reading `status-hud-renderer.ts`:**

The `StatusHudRenderer` currently takes all its dependencies at construction time (`locale`, `mapMode`, `mode`). It is a **pure renderer** — no dependencies on LayerManager. The `setMode()` setter is called by `StatusHudLayer` (the consumer).

**The two options for context chip injection:**

**(a) `StatusHudRenderer.setContextHints(hints)` setter:**
- Caller: `PanelRouter.pushOverlay/popOverlay` → calls `statusHudLayer.setContextHints(...)`.
- Requires: `PanelRouter` holds a reference to `StatusHudLayer` or `StatusHudRenderer`.
- Upside: renderer has no LayerManager dep; chip state is explicitly managed.
- Downside: introduces coupling between PanelRouter and StatusHudLayer; PanelRouter already knows the LayerManager but would need the StatusHudLayer reference too.

**(b) `StatusHudRenderer` reads `layerManager.getTopLayer()?.getR1Hints?.()` on every render:**
- Caller: every `render()` / `renderLoading()` / `renderMissing()` call.
- Requires: `StatusHudRenderer` is constructed with a `LayerManager` reference.
- Upside: always current; no caller coordination needed; simpler call sites.
- Downside: adds `LayerManager` import to `status-hud-renderer.ts`. Since StatusHudRenderer is in `src/status-hud/` and LayerManager in `src/engine/`, both in g2-app package — this is a lateral import, not a cross-package import.

**Import direction analysis (verified in codebase):**

Currently `status-hud-renderer.ts` imports from:
- `@evf/shared-protocol` (CharacterSnapshot)
- `@evf/shared-render` (AsciiGrid)
- `./i18n-budgets.js` (getLabel, HudLocale)

The `StatusHudLayer` (the layer wrapper) imports both `StatusHudRenderer` and `EvenAppBridge`. Adding a LayerManager dep to `StatusHudRenderer` would mean `StatusHudLayer` → `StatusHudRenderer` → `LayerManager` (currently: `StatusHudLayer` → `LayerManager` directly for other purposes). This is a clean unidirectional dependency.

**CONTEXT.md decision (locked):** Option (b) — StatusHudRenderer reads `layerManager.getTopLayer()?.getR1Hints?.()` on every render. [VERIFIED: CONTEXT.md Area 2 context chip spec]

**Implementation note:** Pass `layerManager` as an optional constructor parameter (or via the existing opts struct). The chip is rendered in the footer row of `_buildGrid()`. Default when `getTopLayer()` returns null or `getR1Hints` is absent: `{ tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' }`.

**Width budget concern (UI-SPEC §3.2 verified):** The chip has a 38-char budget. The longest chip state is `tap=cycle-tab  scroll=tab-content  long=quick[sheet]` at ~51 chars — truncated to fit. The truncation must happen inside `_buildGrid` before placing in the footer row. The `assertWithinBudget` pattern applies. [VERIFIED: UI-SPEC §3.2 width budget table]

---

### Q5 — Reachability Harness Shape

**Finding from reading `05-panel-integration-smoke.test.ts`:**

The Phase 5 smoke harness pattern (which Phase 6's 15-case harness follows):
1. `makeHarness()` builds: real LayerManager + mock bridge + real PanelGestureBus + TestablePanelRouter + stub layers.
2. Tests call `router.openPanel(id, deps)` directly to set up initial state.
3. Tests assert `lm.getLayer(ZIndex.Z2_OVERLAY)` identity / instance type.

**For the Phase 6 reachability harness:**

```ts
// Helper signature (CONTEXT.md Area 3 confirms direct gesture-bus publish)
function simulateGesture(
  gestureBus: PanelGestureBus,
  kind: R1Gesture['kind'],
  direction?: 'up' | 'down'  // for scroll gestures
): void {
  const gesture: R1Gesture =
    kind === 'scroll'
      ? { kind: 'scroll', direction: direction ?? 'up' }
      : { kind } as R1Gesture;
  gestureBus.publish(gesture);
}
```

**Design decision:** Use **direct gesture-bus publish** (not the real R1 event source provider). Rationale:
- Decouples reachability from timing logic (no fake timers needed for tap disambiguation).
- The R1 event source's timing logic is tested separately in `r1-event-source.test.ts`.
- The 15 ck tests are about reachability (can you get from A to B in ≤2 gestures?) — timing is orthogonal.
- This mirrors the Phase 4b conc-modal test pattern (direct bus publish in all panel unit tests).

**Test naming convention (from Phase 5 PSM-* pattern):**

```ts
describe('Phase 6 cross-overlay reachability (COR-*)', () => {
  it('COR-01: from main HUD, long-press → Quick Action menu mounted at z=2', ...)
  it('COR-02: from Quick Action menu, tap [S] → CharacterSheet mounted', ...)
  // ...ck 1-15 mapped 1:1
  it('COR-15: status-hud chip updates on every layer-mount/unmount', ...)
});
```

**Where the `layerManager.getTopLayer()` assertion fits:**

```ts
// Standard assertion pattern per test case:
simulateGesture(gestureBus, 'long-press');
const top = lm.getTopLayer();
expect(top).toBeInstanceOf(QuickActionMenuPanel);
expect(top?.id).toBe('quick-action-menu');
```

[VERIFIED: panel-gesture-bus.ts publish semantics + PSM-* pattern in 05-panel-integration-smoke.test.ts]

---

### Q6 — INV-5 Visible Enforcement Test Pattern (Context Chip)

**Finding:** The chip test pattern needs to:
1. Mount a specific layer (e.g., CombatTrackerPanel).
2. Call `statusHudRenderer.render(snapshot)` or the specific chip-render method.
3. Assert the chip content contains the correct overlay-id label.

**Concrete test pattern:**

```ts
it('COR-14: status-hud chip names "combat" when CombatTrackerPanel is top layer', async () => {
  const h = await makeHarness();
  await h.router.openPanel('combat-tracker', h.deps);

  // Chip should read from getTopLayer().getR1Hints().longPressLabel
  const topLayer = h.lm.getTopLayer();
  const hints = topLayer?.getR1Hints?.() ?? DEFAULT_R1_HINTS;
  expect(hints.longPressLabel).toBe('combat'); // or the IT label depending on locale
  // OR: render the chip and check the rendered string
  const chipContent = h.renderer.renderContextChip(h.lm, 'it');
  expect(chipContent).toContain('long=quick[combat]');
  // Width budget assertion
  expect([...chipContent].length).toBeLessThanOrEqual(38);
});
```

**INV-5 invariant test for "chip names what long-press does right now":**

This is SC #4 from the CONTEXT.md (INV-5 visible enforcement). The test:
- Cycles through each mounted panel state (no panel, sheet, combat, log, inv, spell, menu).
- For each state: assert `getTopLayer()?.getR1Hints?.()?.longPressLabel` matches the chip text rendered in the footer.

This is a small fixture-backed test that can be added to `quick-action-menu-panel.test.ts` or a dedicated `status-hud-context-chip.test.ts`. [VERIFIED: UI-SPEC §3.1 chip format, CONTEXT.md Area 2 context chip spec]

---

### Q7 — R1GestureEnvelopeSchema in shared-protocol

**Finding from reading `envelope.ts` and `packages/shared-protocol/src/payloads/`:**

Existing payloads: `character.ts`, `combat.ts`, `concentration.ts`, `event.ts`, `frame.ts`, `log.ts`, `scene.ts`. No `r1.ts` yet.

**New schema shape:**

```ts
// packages/shared-protocol/src/payloads/r1.ts (Phase 6 creates)
import { z } from 'zod';

export const R1GesturePayloadSchema = z.object({
  kind: z.enum(['tap', 'scroll-up', 'scroll-down', 'long-press', 'double-tap']),
  timestamp: z.number().int(),
});

export type R1GesturePayload = z.infer<typeof R1GesturePayloadSchema>;

export const R1_GESTURE_TYPE = 'r1.gesture' as const;
```

The outer envelope validation uses `EnvelopeSchema.safeParse` (type check `=== 'r1.gesture'`), then inner `R1GesturePayloadSchema.safeParse(envelope.payload)`. This is the double trust boundary from Phase 4b. [VERIFIED: envelope.ts + concentration.ts exemplar pattern in shared-protocol]

**Note on `R1Gesture` type in `layer-types.ts`:** The existing type in layer-types.ts uses `kind: 'scroll'` with a `direction` field, while the wire protocol in CONTEXT.md uses `kind: 'scroll-up'|'scroll-down'`. The `r1-event-source.ts` provider must translate from wire format to internal format:

```ts
// Wire: { kind: 'scroll-up' } → Internal: { kind: 'scroll', direction: 'up' }
// Wire: { kind: 'scroll-down' } → Internal: { kind: 'scroll', direction: 'down' }
```

This translation lives inside `attachR1EventSource`, not in the schema. [VERIFIED: layer-types.ts R1Gesture union + CONTEXT.md Area 1 payload shape]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gesture bus fan-out | Custom event emitter | `PanelGestureBus` (already exists) | Phase 4b delivers this; re-use |
| Overlay lifecycle | Custom mount/unmount | `LayerManager.bundle()` (already exists) | Differential demolish is in bundle; hand-rolling would violate ADR-0009 |
| Double-tap disambiguation | Custom timing state machine | Accept `'double-tap'` as a direct wire kind from bridge | Bridge already classifies; client-side re-classification adds latency + complexity |
| Text layout/truncation | Custom string builder | Follow `_innerRow` / `padRightUnicode` pattern from `concentration-drop-modal.ts` | Already established — INV-1 requires code-point counting, not `.length` |
| i18n string lookup | Inline string literals | `getLabel(field, locale)` from `i18n-budgets.ts` | Budget enforcement via `assertWithinBudget` |
| INV-1 fixture comparison | Custom snapshot logic | `matchAsciiFixture` from `@evf/shared-render` | Phase 4a delivery, already used in PSM-FIX-* |
| Locale persistence | Custom kv wrapper | `persistLocaleOverride` from Phase 5 | Already in `locale-override.ts` |

**Key insight:** Phase 6 is almost entirely wiring of existing Phase 4b/5 infrastructure. The only truly new code is `attachR1EventSource`, `getTopLayer()`, `pushOverlay/popOverlay`, `QuickActionMenuPanel`, and the footer chip rendering. Everything else is composition.

---

## Common Pitfalls

### Pitfall 1: `PanelGestureBus.publish` fans out to ALL subscribers — INV-5 violation if multiple panels are subscribed

**What goes wrong:** If Phase 6 subscribes the QuickActionMenuPanel to the bus without first unsubscribing the suspended panel, two handlers receive every gesture. INV-5 is violated.

**Why it happens:** `PanelGestureBus.publish` uses a snapshot iteration — all current subscribers get the gesture. It's the architectural contract that only one panel subscribes at a time.

**How to avoid:** `pushOverlay` must issue `bundle([{type:'destroy',...}])` first, which triggers `onUnmount` of the suspended panel, which unsubscribes it from the bus. Then `bundle([{type:'mount',...}])` triggers the menu's `onMount`, which subscribes it. Sequential `await` order ensures zero overlap. [VERIFIED: panel-gesture-bus.ts subscribe/size(), concentration-drop-modal.ts onMount/onUnmount]

**Warning sign:** `gestureBus.size() > 1` during any non-transitional steady state.

### Pitfall 2: `getTopLayer()` scans map without sorting — wrong layer returned

**What goes wrong:** `Map` iteration order is insertion order, not numeric key order. If z=1 status HUD was inserted before z=2 overlay, iterating the map in insertion order and checking `isOverlayPanel` would skip to the wrong result.

**Why it happens:** JavaScript `Map` iterates by insertion order. ZIndex enum values are numeric (`Z2_OVERLAY = 2`, `Z1_STATUS_HUD = 1`), but insertion order during boot may vary.

**How to avoid:** `getTopLayer()` must sort `this.layers.entries()` by ZIndex key in descending order before iterating. `[...this.layers.entries()].sort(([a], [b]) => b - a)`. [VERIFIED: layer-manager.ts — layers Map used without sorting in getLayer()]

**Warning sign:** Test `COR-01` (long-press opens Quick Action) fails with wrong layer returned.

### Pitfall 3: Single-bundle suspension — two consecutive bundles cause flicker

**What goes wrong:** A naive `pushOverlay` that calls `bundle([{type:'destroy'}])` then separately `bundle([{type:'mount'}])` generates two `rebuildPageContainer` calls. Between them, the z=0.5 idle infill briefly re-mounts (differential demolish restore), creating a flash.

**Why it happens:** Each `bundle()` completes with a bridge flush. The first bundle's differential demolish re-instates z=0.5. The second bundle re-demolishes it.

**How to avoid:** Use a single atomic bundle combining the destroy + mount ops: `bundle([{type:'destroy', z:Z2_OVERLAY}, {type:'mount', z:Z2_OVERLAY, layer:menuPanel}])`. The differential demolish logic handles the z=0.5 net effect correctly within one bundle. [VERIFIED: layer-manager.ts bundle() differential demolish rewrite in Step 1]

**Warning sign:** Two `rebuildPageContainer` calls observed in tests when one was expected.

### Pitfall 4: `popOverlay` with empty `overlayStack` — unhandled case

**What goes wrong:** Long-pressing from the main HUD (no panel open) opens the Quick Action menu. When the user selects `[X] Close`, `popOverlay()` is called. If `overlayStack` is empty (no suspended panel), the destroy bundle correctly removes the menu. But the differential demolish logic restores z=0.5 automatically. If the code tries to `pop()` from an empty array and mount the result, it gets `undefined`.

**How to avoid:** Guard `popOverlay` with `if (restored !== undefined)` before mounting. [VERIFIED: JavaScript Array.pop() returns undefined on empty array]

### Pitfall 5: `getR1Hints()` on non-OverlayPanel layers

**What goes wrong:** `getTopLayer()` returns the highest-z OverlayPanel. But `StatusHudRenderer` may call `layerManager.getTopLayer()?.getR1Hints?.()` — the optional chaining handles the null case. However, if a non-OverlayPanel layer somehow passes `isOverlayPanel` due to duck typing, it might be returned.

**Why it happens:** `isOverlayPanel` is duck-typed: checks for `onMount + onUnmount + onEvent` as functions. Any object with these three methods would qualify.

**How to avoid:** The current `isOverlayPanel` implementation is correct for the internal panel set (MVP has no third-party panels). The `getR1Hints()` check uses optional chaining (`?.getR1Hints?.()`) — returns undefined if the method is absent, and the renderer falls back to defaults. [VERIFIED: overlay-panel.ts isOverlayPanel + CONTEXT.md Area 2]

### Pitfall 6: Width budget overflow in context chip

**What goes wrong:** The chip format `tap=cycle-tab  scroll=tab-content  long=quick[sheet]` at 51 chars overflows the 38-char budget.

**Why it happens:** Per-panel `getR1Hints()` returns raw strings without budget checking; the renderer applies the budget.

**How to avoid:** In `_buildGrid` (or a dedicated `_renderContextChip` method), apply truncation with `…` after the 38-char limit. The UI-SPEC §3.2 already specifies truncated forms for each state. [VERIFIED: UI-SPEC §3.2 width-budget-per-chip-variant table]

### Pitfall 7: `locale.changed` event on `panel-gesture-bus` — wrong bus type

**What goes wrong:** CONTEXT.md Area 2 states: tap an entry → `persistLocaleOverride` + `gestureBus.publish({ kind: 'locale.changed', locale: code })`. But `PanelGestureBus` publishes `R1Gesture` typed messages. `R1Gesture` is a discriminated union of `{ kind: 'tap' | 'scroll' | 'long-press' | 'double-tap' }`. Adding `'locale.changed'` to the `R1Gesture` union would change the `layer-types.ts` type.

**Resolution:** Either: (a) extend `R1Gesture` to include `{ kind: 'locale.changed', locale: HudLocale }`, or (b) use a separate event emitter for cross-cutting locale events, or (c) have the QuickActionMenuPanel hold a reference to the StatusHudLayer and call a `setLocale()` method directly.

**Recommended:** Extend `R1Gesture` in `layer-types.ts` to include `{ kind: 'locale.changed'; locale: string }`. This is the "in-process signal" category — gestures from R1 hardware use `tap/scroll/long-press/double-tap`; locale changed is a synthetic signal that panels handle if they need to re-render. Panels that don't care about locale change just ignore it (existing `onEvent` dispatch tables skip unknown kinds). [ASSUMED — verify with planner; alternative is a separate EventTarget]

---

## Code Examples

### LayerManager.getTopLayer() accessor

```typescript
// Source: layer-manager.ts (Phase 6 addition — verified against existing layers Map type)
getTopLayer(): Layer | null {
  const sortedEntries = [...this.layers.entries()].sort(([a], [b]) => b - a);
  for (const [, layer] of sortedEntries) {
    if (isOverlayPanel(layer)) {
      return layer;
    }
  }
  return null;
}
```

### R1GestureEnvelopeSchema (shared-protocol)

```typescript
// Source: packages/shared-protocol/src/payloads/r1.ts (Phase 6 creates)
// Pattern: concentration.ts in same directory
import { z } from 'zod';

export const R1_GESTURE_TYPE = 'r1.gesture' as const;

export const R1GesturePayloadSchema = z.object({
  kind: z.enum(['tap', 'scroll-up', 'scroll-down', 'long-press', 'double-tap']),
  timestamp: z.number().int(),
});

export type R1GesturePayload = z.infer<typeof R1GesturePayloadSchema>;
```

### attachR1EventSource provider

```typescript
// Source: CONTEXT.md Area 1 + verified against existing bus/manager APIs
export function attachR1EventSource(
  ws: WebSocketLike,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  timings = DEFAULT_R1_TIMINGS,
): () => void {
  const handler = (event: MessageEvent) => {
    const outerResult = EnvelopeSchema.safeParse(JSON.parse(event.data as string));
    if (!outerResult.success || outerResult.data.type !== R1_GESTURE_TYPE) return;

    const innerResult = R1GesturePayloadSchema.safeParse(outerResult.data.payload);
    if (!innerResult.success) {
      console.warn('[r1-event-source] invalid payload', innerResult.error);
      return;
    }

    const top = layerManager.getTopLayer();
    if (top === null) {
      console.warn('[r1-event-source] no top layer — gesture dropped (INV-5 no-op)');
      return;
    }

    // Translate wire kind to internal R1Gesture
    const payload = innerResult.data;
    let gesture: R1Gesture;
    if (payload.kind === 'scroll-up') {
      gesture = { kind: 'scroll', direction: 'up' };
    } else if (payload.kind === 'scroll-down') {
      gesture = { kind: 'scroll', direction: 'down' };
    } else {
      gesture = { kind: payload.kind } as R1Gesture;
    }

    gestureBus.publish(gesture);
    // INV-5: bus will fan-out to current subscribers; exactly one panel subscribed
  };

  ws.addEventListener('message', handler);
  return () => ws.removeEventListener('message', handler);
}
```

### simulateGesture test helper

```typescript
// Source: CONTEXT.md Area 3 + verified against PanelGestureBus.publish signature
function simulateGesture(
  gestureBus: PanelGestureBus,
  kind: 'tap' | 'scroll' | 'long-press' | 'double-tap',
  direction?: 'up' | 'down',
): void {
  const gesture: R1Gesture =
    kind === 'scroll'
      ? { kind: 'scroll', direction: direction ?? 'up' }
      : { kind } as R1Gesture;
  gestureBus.publish(gesture);
}
```

### QuickActionMenuPanel skeleton

```typescript
// Source: CONTEXT.md Area 2 + concentration-drop-modal.ts exemplar
export default class QuickActionMenuPanel implements OverlayPanel {
  static meta: PanelMeta = {
    id: 'quick-action-menu',
    title: { it: 'Azione Rapida', en: 'Quick Action', de: 'Schnellaktion' },
    navKey: '',   // not in nav — opened by long-press
    requiredCaps: [],
  };

  readonly id = 'quick-action-menu';
  // readonly z = ZIndex.Z2_OVERLAY; // z managed by PanelRouter.pushOverlay

  private mode: 'main' | 'language' = 'main';
  private activeIndex = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly gestureBus: PanelGestureBus,
    private readonly locale: HudLocale,
  ) {}

  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((g) => this.onEvent(g));
  }

  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'scroll') {
      this._cycleIndex(gesture.direction === 'up' ? -1 : 1);
    } else if (gesture.kind === 'tap') {
      this._activateCurrentItem();
    } else if (gesture.kind === 'long-press') {
      this._requestClose(); // calls PanelRouter.popOverlay via injected onClose callback
    }
    void this.draw();
  }

  getR1Hints(): { tap: string; scroll: string; longPressLabel: string } {
    if (this.mode === 'language') {
      return { tap: getLabel('quick.item.apply', this.locale), scroll: getLabel('quick.hint.scroll', this.locale), longPressLabel: getLabel('quick.hint.long.cancel', this.locale) };
    }
    return { tap: 'apri', scroll: 'voce', longPressLabel: 'annulla' };
  }

  getContainerCount(): { image: 0; text: 1 } { return { image: 0, text: 1 }; }

  async draw(): Promise<void> { /* build menu text + textContainerUpgrade */ }
  destroy(): void { /* no-op — bus cleaned in onUnmount */ }

  private _cycleIndex(delta: number): void {
    const len = this.mode === 'main' ? MENU_ITEMS.length : LOCALE_MENU.length;
    this.activeIndex = ((this.activeIndex + delta) % len + len) % len;
  }

  private _activateCurrentItem(): void { /* switch on activeIndex */ }
  private _requestClose(): void { /* call injected onClose */ }
}
```

---

## Runtime State Inventory

Phase 6 is NOT a rename/refactor/migration phase. No runtime state inventory needed.

However, one **carry-forward state note:** Phase 5 persists `view.locale.override` in Even Hub kv. Phase 6's `[N] Language` sub-menu calls `persistLocaleOverride(bridge, code)` which writes to this same key. The key is already established; Phase 6 is a new writer to an existing key. No migration needed.

---

## Environment Availability

Phase 6 is purely in-process code — no new external dependencies, no new processes, no new CLI tools. All Phase 6 code runs inside the existing `packages/g2-app` Vite build + Vitest test suite.

**Step 2.6: SKIPPED** — no external dependencies beyond the project's existing build toolchain.

Verification that existing toolchain is present:
```
pnpm test  → existing Vitest 4.1.5 workspace-wide suite (1149 tests as of Phase 5 closure)
pnpm typecheck  → TypeScript 5.8.3 strict
pnpm lint:ci  → Biome 2.4.15
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/vitest.config.ts` (workspace root) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run --reporter=verbose` |
| Full suite command | `pnpm test` (workspace-wide, all 1149+ tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File | Status |
|--------|----------|-----------|-------------------|------|--------|
| NAV-01 | R1 WS events received, schema-validated, synthesized to R1Gesture, routed to top layer | Unit | `pnpm --filter @evf/g2-app test -- --run r1-event-source` | `engine/__tests__/r1-event-source.test.ts` | Wave 0 gap |
| NAV-01 | `DEFAULT_R1_TIMINGS` exported; `tapMs/doubleTapWindowMs/longPressMs/scrollDebounceMs` correct values | Unit | same file | same | Wave 0 gap |
| NAV-01 | `LayerManager.getTopLayer()` returns highest-z OverlayPanel; null when none | Unit | `pnpm --filter @evf/g2-app test -- --run layer-manager` | `engine/__tests__/layer-manager.test.ts` (extend existing) | Extend |
| NAV-01 | Context chip: `StatusHudRenderer` renders chip with correct hints per active overlay | Unit + INV-1 | `pnpm --filter @evf/g2-app test -- --run status-hud-renderer` | `status-hud/__tests__/status-hud-renderer.test.ts` (extend) | Extend |
| NAV-02 | QuickActionMenuPanel renders 9-item list, active indicator `▶`, footer hints | Unit + INV-1 | `pnpm --filter @evf/g2-app test -- --run quick-action-menu-panel` | `panels/__tests__/quick-action-menu-panel.test.ts` | Wave 0 gap |
| NAV-02 | `PanelRouter.pushOverlay/popOverlay` suspends/restores correctly | Unit | same file | same | Wave 0 gap |
| NAV-02 | `[N] Language` sub-menu renders `LOCALE_MENU` 7 entries; tap persists locale | Unit | same file | same | Wave 0 gap |
| NAV-02 | `panel-gesture-bus.size() === 1` at all times during menu lifecycle | Unit | same file | same | Wave 0 gap |
| NAV-03 | 15 named reachability + closability cases (ck 1-15) | Integration | `pnpm --filter @evf/g2-app test -- --run 06-cross-overlay` | `__tests__/06-cross-overlay-reachability.test.ts` | Wave 0 gap |
| NAV-03 | INV-1 fixture round-trip: 9 new fixtures match char-perfect | INV-1 | same file | same | Wave 0 gap |
| INV-5 | `LayerManager.getTopLayer()` + bus size=1 enforces single-receiver at steady state | Unit | layer-manager tests + bus tests | existing + extend | Extend |
| INV-5 visible | Footer chip content names correct overlay id for current top layer | Unit | status-hud-renderer tests | same | Extend |
| SC-06-01 | R1 timing constants validated against real R1 ring | HARDWARE | `pnpm --filter @evf/validation-harness validate:all` | validation-harness | **DEFERRED** |
| SC-06-02 | Long-press no false triggers on real R1 hardware | HARDWARE | manual | — | **DEFERRED** |
| SC-06-03 | Menu-open latency p50 ≤200 ms on real G2 + R1 | HARDWARE | manual + instrumented | — | **DEFERRED** |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run` (g2-app tests only, ~30 s)
- **Per wave merge:** `pnpm test` (workspace-wide, all packages)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

The following test files must be created in Wave 0 before implementation plans write code:

- [ ] `packages/g2-app/src/engine/__tests__/r1-event-source.test.ts` — covers NAV-01 (timing + routing + schema validation)
- [ ] `packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts` — covers NAV-02 (rendering, lifecycle, [N] sub-menu)
- [ ] `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` — covers NAV-03 (15 cases, INV-1 fixtures)
- [ ] New keys in `packages/g2-app/src/status-hud/i18n-budgets.ts` (~18 keys, Wave 0 centralisation — same pattern as Phase 4b Plan 01 + Phase 5 Plan 01)
- [ ] New INV-1 fixtures in `packages/shared-render/src/fixtures/` (9 fixtures)

*(No new conftest.py / vitest.config changes needed — existing workspace config covers all)*

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` — this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Bearer token auth is Phase 2/3 concern; Phase 6 adds no new auth surface |
| V3 Session Management | No | R1 events are in-process after WS auth established |
| V4 Access Control | No | No new endpoints or permissions |
| V5 Input Validation | Yes | `EnvelopeSchema.safeParse` (outer) + `R1GesturePayloadSchema.safeParse` (inner) — double trust boundary pattern from Phase 4b |
| V6 Cryptography | No | No crypto operations in Phase 6 |

### Known Threat Patterns for Phase 6

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed r1.gesture envelope from bridge | Tampering | `EnvelopeSchema.safeParse` + `R1GesturePayloadSchema.safeParse` — drop invalid on failure, `console.warn` only |
| Gesture injection (replayed gestures) | Spoofing | `session_id` in outer envelope must match current session; drop stale/mismatched |
| Runaway gesture loop (hardware stuck) | Denial of Service | `scrollDebounceMs: 50` debounce; no actionable mitigation beyond that in Phase 6 |
| Locale override kv poisoning | Tampering | `loadLocaleOverride` already normalises unknown values to `'auto'` (Phase 5 delivery) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `R1: tap/scroll/long` footer in StatusHudRenderer | Context-aware chip reading `getTopLayer()?.getR1Hints?.()` | Phase 6 | INV-5 visible enforcement; chip names live gesture targets |
| Single-active overlay invariant (openPanel closes current) | Overlay stack (`pushOverlay/popOverlay`) with suspension | Phase 6 | Quick Action menu can overlay any panel without losing its state |
| Gesture bus fans out to all subscribers | Bus still fans out; INV-5 enforced by architectural constraint (only one panel subscribed at a time) | Phase 6 | Single-receiver semantics without changing bus implementation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tapMs: 250` — tap window default based on HCI literature | Q1 R1 Timing | Hardware might deliver synthesized `count:1|2` events; tapMs may be irrelevant if bridge classifies | Low — bridge delivers kind directly |
| A2 | `doubleTapWindowMs: 350` — double-tap detection window | Q1 R1 Timing | If bridge delivers `r1.tap { count: 2 }` as a single event, this constant is unused | Low |
| A3 | `longPressMs: 600` — client-side long-press threshold | Q1 R1 Timing | Bridge delivers `long-press` directly per CONTEXT.md; this constant may only be a guard, not primary detection | Low |
| A4 | `scrollDebounceMs: 50` — scroll event debounce | Q1 R1 Timing | May be too aggressive (misses clicks) or too loose (flooding) on real hardware | Low — tunable post-hardware |
| A5 | `locale.changed` added to `R1Gesture` union in `layer-types.ts` is acceptable | Q7 locale event | If preferred not to extend R1Gesture, a separate EventTarget or direct callback is needed | Medium — architectural choice |
| A6 | Suspended panel's instance fields survive `onUnmount → onMount` round-trip correctly | Q3 overlay semantics | Any panel that resets state in `onUnmount` would lose context on restore | Low — verified pattern from conc-modal |

**If this table is empty:** Not empty — 6 assumptions, primarily around R1 timing (SC-06-01 will resolve A1-A4) and the locale.changed event approach (A5, needs planner decision).

---

## Open Questions

1. **`locale.changed` event mechanism**
   - What we know: CONTEXT.md Area 2 says `gestureBus.publish({ kind: 'locale.changed', locale: code })` — extending R1Gesture union.
   - What's unclear: Does extending `R1Gesture` with a non-gesture `locale.changed` kind break the type semantics? Existing panels that handle `R1Gesture` via exhaustive switch will emit TypeScript unreachable-branch warnings if they don't handle the new kind.
   - Recommendation: Add `locale.changed` as a documented extension to `R1Gesture` in `layer-types.ts`, with a clear JSDoc note that it's a synthetic in-process signal, not a hardware event. Panels that don't care: add a no-op case or ignore. Alternatively, use a separate narrow `LocaleChangedEvent` dispatched directly to mounted panels via a separate mechanism — but this adds more surface.

2. **QuickActionMenuPanel `navKey` for PanelMetaSchema validation**
   - What we know: `PanelMetaSchema` requires `navKey: z.string().length(1)`. But `QuickActionMenuPanel` is not in the nav registry (opened by long-press only). CONTEXT.md sets `navKey: ''` — which would fail the `length(1)` validation.
   - What's unclear: Should `navKey` be `z.string().length(1)` strictly, or should the schema accept empty string for panels not in the navigation bar?
   - Recommendation: Either (a) relax `PanelMetaSchema.navKey` to `z.string().max(1)` (allow empty), or (b) use a sentinel value like `' '` (space), or (c) `QuickActionMenuPanel` does not go through `discoverPanels()` at all (it is constructed directly by PanelRouter, not auto-discovered). Option (c) is cleanest: QuickActionMenuPanel is not a user-navigable panel; it's a system-level overlay.

3. **`r1-event-source.ts` WS type — `WebSocketLike` vs `WebSocket`**
   - What we know: `ConcentrationDropModalPanel` uses `ConcModalWebSocket { send(data: string): void }` as a narrow interface.
   - What's unclear: `attachR1EventSource` needs `ws.addEventListener('message', handler)` — a narrower interface than full `WebSocket`.
   - Recommendation: Define `R1EventSourceWebSocket { addEventListener(type: 'message', handler: (event: MessageEvent) => void): void; removeEventListener(type: 'message', handler: (event: MessageEvent) => void): void }` as a local interface in `r1-event-source.ts`.

---

## Sources

### Primary (HIGH confidence)

- **Committed source code** — `layer-manager.ts`, `panel-gesture-bus.ts`, `panel-router.ts`, `layer-types.ts`, `overlay-panel.ts`, `concentration-drop-modal.ts`, `status-hud-renderer.ts`, `i18n-budgets.ts`, `locale-menu.ts`, `map-mode-toggle.ts`, `envelope.ts` — verified by direct reading of committed Phase 4b/5 implementations.
- **CONTEXT.md (06-CONTEXT.md)** — locked decisions (operator-accepted 2026-05-16, 3/3 areas).
- **UI-SPEC.md (06-UI-SPEC.md)** — design contract (approved 2026-05-16).
- **REQUIREMENTS.md** — NAV-01, NAV-02, NAV-03 requirement text.
- **Phase 5 SUMMARY (05-06-SUMMARY.md)** — delivery contract for Phase 6 foundation.
- **Integration smoke harness (05-panel-integration-smoke.test.ts)** — patterns for harness builder, TestablePanelRouter, fixture paths.
- **Specs.md §3.2, §4.4, §10.0.1** — R1 hardware gesture model, event SDK surface, GO/NO-GO criteria.

### Secondary (MEDIUM confidence)

- Specs.md §7.13, §7.14.2, §7.14.4 ck 1-15, §7.15 — UI contract for Quick Action menu and footer chip (Italian-language spec, interpreted from context).

### Tertiary (LOW confidence)

- HCI literature on double-tap timing windows (250-350 ms) — not verified against Even Hub SDK runtime, only against Specs.md ≥500 ms long-press threshold. These timing defaults are `[ASSUMED]` pending SC-06-01.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing libs verified in committed code
- Architecture: HIGH — directly derived from reading committed layer-manager.ts, panel-router.ts, panel-gesture-bus.ts
- R1 timing defaults: MEDIUM — plausible prior art, hardware-deferred (SC-06-01)
- Pitfalls: HIGH — derived from direct code analysis (bus fan-out, map insertion order, differential demolish)
- Test harness shape: HIGH — directly modeled on PSM-* pattern

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (stable internal architecture; valid until any Phase 4b/5 engine refactor)
