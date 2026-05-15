# Phase 4b: Overlay Slot + Map Mode Toggle + Adversarial UI — Context

**Gathered:** 2026-05-15
**Status:** Ready for research + planning
**Source:** smart-discuss (autonomous workflow batch table — operator-accepted 2026-05-15)

<domain>
## Phase Boundary

Lock the overlay layer-manager contract so Phase 5 panels plug in cleanly, and
land the four adversarial UI primitives (toast queue, boot error states,
death-saves HUD, concentration-drop modal) that the spec mockups happy-path.

**Phase 4a delivered:** LayerManager singleton + ZIndex enum (Z0_MAP=0,
Z0_5_IDLE_INFILL=0.5, Z1_STATUS_HUD=1, Z2_OVERLAY=2 already reserved) +
RasterController + StatusHudLayer + MapBaseLayer + IdleInfillLayer +
scene-input/Plan 06 wiring + bootEngine integration. ADR-0009 ACCEPTED.

**Phase 4b extends the layer machinery + ships 4 adversarial UI primitives:**

1. Overlay slot at z=2 (panel mount point).
2. Toast queue at NEW z=1.5 (between status HUD and overlay).
3. 5 boot error UI states (single layer, 5 fixtures).
4. Death-saves HUD pivot (StatusHudLayer renderer mode).
5. Concentration-drop modal (z=2 overlay, blocking, bridge event emit).

Plus: Map mode runtime toggle (raster ↔ glyph) wired to Even Hub
`setLocalStorage` persistence. Phase 6 Quick Action menu wires the `[M]`
gesture to this machinery.

**NOT in scope:** Real panel implementations (Phase 5), Quick Action menu
itself (Phase 6), Foundry write path / `effect.delete()` for conc drop
(Phase 7). Phase 4b emits a `conc.drop.confirmed` bridge event; the actual
write lands in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Overlay Slot (z=2) Composition — REVISED 2026-05-15 post-research

**Original CONTEXT decision** (smart-discuss round 1): z=2 mounts on top of
z=0.5 without demolishing it. **REVISED** based on 04B-RESEARCH.md §Q1
Container Budget Audit which proved the no-demolish rule overflows the
SDK 12-container cap by 1-3 in raster + overlay + toast scenarios.

**Locked rule — differential demolish:**

- **z=0.5 IdleInfillLayer IS demolished atomically when z=2 mounts.**
  Returns to ADR-0001 Amendment 1's original atomic-swap rule for the
  z=0.5 ↔ z=2 transition. When z=2 unmounts, z=0.5 re-mounts in the same
  `bundle()` flush.
- **z=1.5 ToastQueueLayer is NOT demolished when z=2 mounts.** Toasts
  survive overlay open as the SC #3 Fireball + 8 saves stress case requires.
  ToastQueueLayer uses dedicated container slots that do not conflict with
  z=2 panel containers (within the 4+8 budget).
- **Container budget verified (04B-RESEARCH.md §Q1):**
  - Closed state (no overlay): z=0 (4 img + 1 text) + z=0.5 (3 text) +
    z=1 (1-3 text) + z=1.5 (1-2 text) = 4 img + 7-9 text ≤ cap 4+8.
  - Open state (overlay): z=0 (4 img + 1 text) + z=2 (≤6 text panel) +
    z=1 (1-3 text) + z=1.5 (1-2 text) = 4 img + 9-12 text — within cap as
    long as panel ≤ 6 text/list containers AND status HUD + toast cap their
    upper bounds. Fireball + open-modal worst case: tight but feasible.
- **Capture-invariant:** z=0 MapBaseLayer **retains** `isEventCapture=1`
  when overlay is open (unchanged from original CONTEXT).
- **Gesture routing for panel input — REVISED:** Per 04B-RESEARCH.md §Q2,
  R1 gesture routing is **in-process within g2-app**, NOT a WS round-trip.
  Phase 4b ships `packages/g2-app/src/engine/panel-gesture-bus.ts` — a
  minimal in-process publish/subscribe bus that the (future Phase 6) R1
  source provider publishes synthesized gestures to. Active panels subscribe
  via their `onMount`. The `r1.gesture` envelope schema is reserved in
  `packages/shared-protocol/` for Phase 6+ remote/replay scenarios but the
  Phase 4b runtime hot path stays in-process.
- **Atomic flush:** Single `rebuildPageContainer` flush per ADR-0001
  Amendment 1's spirit. `layerManager.bundle([destroy z=0.5, mount z=2])`
  for opens; `layerManager.bundle([destroy z=2, mount z=0.5])` for closes.
- **ADR-0009 Amendment 1 (filled by Plan 01):** documents the differential
  demolish rule, the in-process gesture-bus routing, and the container
  budget audit (closed + open state tables).

### Area 2: Panel API Contract

- **Surface:** `interface OverlayPanel extends Layer` (reuses Layer's
  `id`, `z`, `requiredCaps`, `render`, `destroy` from
  `packages/g2-app/src/engine/layer-types.ts`) **plus 3 panel-specific
  methods:**
  - `onMount(): Promise<void>` — called by LayerManager after mount op
    succeeds; lets panel pre-load state, subscribe to bridge events.
  - `onUnmount(): Promise<void>` — called before destroy; lets panel
    flush state, unsubscribe.
  - `onEvent(gesture: R1Gesture): void` — receives R1 input routed by
    bridge WS (since z=0 retains native capture). `R1Gesture` is a
    Phase 6-stable enum; for Phase 4b stub it as a string-literal union
    `'tap' | 'scroll-up' | 'scroll-down' | 'long-press'` with a typed
    payload TBD by Phase 6.
- **Phase 5 contract:** Phase 5 panels (CharacterSheetPanel,
  CombatTrackerPanel, etc.) implement this interface verbatim.

### Area 3: Map Mode Toggle Persistence

- **Persistence target:** Even Hub envelope-based `setLocalStorage` /
  `getLocalStorage` (already polyfilled in Phase 2 via
  `packages/g2-app/src/hub-polyfill.ts`). Key: `view.map.mode`. Values:
  `'auto' | 'raster' | 'glyph'`. Device-local; **does NOT modify Foundry
  world settings** (those are Phase 7+ write path).
- **Boot read:** `bootEngine` reads `hub.getLocalStorage('view.map.mode')`
  at step 9 (after BLE probe verdict) and overrides the verdict if the
  saved value is `raster` or `glyph`. `'auto'` lets the BLE probe verdict
  win.
- **Runtime toggle:** Phase 4b ships a `toggleMapMode(newMode)` function
  in `packages/g2-app/src/engine/map-mode-toggle.ts`. Phase 6 Quick Action
  `[M]` will wire its tap handler to this function. Phase 4b includes an
  internal dev hook (`bootEngineForTest` extension or a debug WS message)
  to exercise the toggle without the real `[M]` gesture.

### Area 4: Plan Decomposition (4 plans wave-aware)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 04B-01 | Overlay slot machinery + Panel API contract + ZIndex.Z1_5_TOAST addition + ADR-0009 Amendment 1 | MAP-05 (overlay part) |
| 1 | 04B-02 | Map mode toggle + Even Hub persistence + boot read-back | MAP-05 (toggle part) |
| 2 | 04B-03 | Toast queue (z=1.5 layer + FIFO + squash badge) | TOAST-01 |
| 2 | 04B-04 | Boot error UI (1 layer, 5 fixtures, dispatch from existing handshake errors) | BOOT-01 |
| 3 | 04B-05 | Death-saves StatusHudRenderer pivot + Concentration-drop modal panel + integration smoke | DEATH-01, CONC-01 |

**Wave 2 parallelism:** Plans 03 and 04 modify distinct files
(`packages/g2-app/src/status-hud/toast-queue-layer.ts` vs
`packages/g2-app/src/engine/boot-error-layer.ts`) — zero `files_modified`
overlap expected, runnable in parallel.

### Area 5: Toast Queue (z=1.5)

- **New ZIndex value:** `ZIndex.Z1_5_TOAST = 1.5` added to
  `packages/g2-app/src/engine/layer-types.ts` (extends the enum that
  already has Z0_5_IDLE_INFILL fractional values).
- **Layer slot:** Dedicated `ToastQueueLayer` at z=1.5 (between
  StatusHudLayer z=1 and Z2_OVERLAY).
- **Capacity:** Max 2 toasts visible FIFO, dwell 3 s each.
- **Squash on overflow:** When a 3rd toast arrives while 2 are visible,
  the head toast's content gets a `[+N]` badge appended (e.g.,
  `'Damage 12 [+7]'`). N counts toasts still queued in the buffer.
- **Survives overlay open:** ToastQueueLayer stays mounted when z=2
  overlay opens (different z-index, different container slots). The
  Fireball + 8 saves stress case (SC #3) must show this.
- **Toast severity:** Three levels — `info`, `warn`, `error`. Visual
  differentiation via a single-char prefix (e.g., `i:` / `!:` / `x:`)
  consistent with the phosphor display alphabet. NO color (G2 is 4-bit
  greyscale).

### Area 6: Boot Error UI (1 template + 5 fixtures)

- **Layer class:** `BootErrorLayer extends Layer` at z=1 (replaces the
  z=1 status HUD when boot has failed — boot never reaches the main
  page state so this is a layout-level swap, not an overlay).
- **State enum:** `'handshake_failed' | 'version_mismatch' |
  'no_character' | 'bridge_unreachable' | 'token_expired'`.
- **Each state ships:**
  - Title line (locale-resolved IT/EN/DE)
  - Recovery hint (1-2 lines, locale-resolved)
  - `[X] Close` gesture annotation (close → boot retry; Phase 6 wires
    the actual gesture)
- **INV-1 fixtures:** 5 ASCII fixtures named
  `boot-error.<state>.<locale>.txt` (5 states × 3 locales = 15 fixtures
  in `packages/shared-render/src/fixtures/`; or just IT primary + EN
  fallback per Phase 4a §7.16 convention, so 10 fixtures).
- **Dispatch:** boot-engine-core's existing `HandshakeError`,
  `LayerManagerError`, version-check failures, etc., map to these 5
  states via a new `bootErrorFromException(err)` helper. Phase 4b
  reroutes the boot path to mount `BootErrorLayer` instead of (or
  in addition to) propagating the exception.

### Area 7: Death-Saves HUD Pivot

- **Implementation:** Pivot is a **renderer mode** inside the existing
  `StatusHudRenderer` (Phase 4a Plan 04). Same z=1 layer, same container
  slots — only the render output changes.
- **Schema rollout (REVISED 2026-05-15 post-research):** Per
  04B-RESEARCH.md §Q4, `CharacterSnapshotSchema` from Phase 2 has NO
  `death` field. Plan 05 Task 1 lands `CharacterSnapshotSchema.death` +
  `foundry-module/src/readers/character-reader.ts` extension in the
  **same atomic commit** (no `.optional()` window of drift). dnd5e v5.x
  field path is `actor.system.attributes.death.{success, failure}`.
- **Trigger:** `character.delta` event carrying `hp.value === 0` AND
  `death.failure < 3`. Latched ON until HP > 0 OR death (3 fail). On
  latch-off, the renderer returns to the standard HP/AC/conditions
  layout.
- **Visual:** 3-strike tracker `[ ◯ ◯ ◯ ]` for passes and fails. Filled
  glyph `●` for ticked checkbox, hollow `◯` for unticked.
- **Test:** New INV-1 fixture
  `packages/shared-render/src/fixtures/status-hud.death-saves.it.txt`
  + dedicated `it()` block in
  `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`.

### Area 8: Concentration-Drop Modal

- **Slot:** Mounts at z=2 overlay using the Panel API from Area 2.
  Implementation: `ConcentrationDropModalPanel` class implementing
  `OverlayPanel`.
- **Trigger:** Bridge emits a `conc.conflict` event when the player
  attempts to cast a concentration spell while a concentration effect
  is already active. Phase 7 is responsible for the server-side
  detection; Phase 4b implements only the client-side modal display
  + user choice capture.
- **R1 routing while open:** Modal blocks normal capture — only
  `[Y] Drop & cast new` and `[N] Cancel` gestures are accepted.
  Implementation: when modal is mounted, z=0 MapBaseLayer's input
  handler short-circuits any tap/scroll to a no-op; modal's
  `onEvent` receives the gesture via bridge WS routing.
- **Phase 4b output:** On user `[Y]`, modal emits a
  `conc.drop.confirmed { effectId: <originalEffectId> }` event to the
  bridge. **Phase 4b does NOT call `effect.delete()`** — that is the
  Phase 7 write path. Phase 4b's success criterion is the modal
  rendering + user choice capture + bridge event emission.
- **Edge case:** If HP=0 simultaneously (death-saves pivot active),
  the modal still opens at z=2; status HUD z=1 retains the death-saves
  pivot underneath. No layer conflict (different z, different slots).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before
investigating or coding.**

### Phase 4a deliverables (foundation)

- `packages/g2-app/src/engine/layer-types.ts` — ZIndex enum, Layer interface,
  LayerOp union, LayerManagerError. **Phase 4b extends ZIndex with Z1_5_TOAST
  = 1.5** and introduces the `OverlayPanel extends Layer` sub-interface.
- `packages/g2-app/src/engine/layer-manager.ts` — `mount() / destroy() /
  bundle()` API. Phase 4b uses `bundle()` for atomic modal open/close +
  toast push/squash.
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — extend with a
  `mode: 'standard' | 'death-saves'` parameter for Area 7.
- `packages/g2-app/src/engine/boot-splash.ts` — Phase 4a Plan 02 noted
  "Phase 4b will wire boot-error UI around this function". Boot-error
  dispatch happens around `showBootSplash` failures.
- `packages/g2-app/src/internal/boot-engine-core.ts` — bootEngine step 9
  (BLE probe → setMapMode) is the integration point for Area 3 (map
  mode persistence read-back).
- `packages/g2-app/src/hub-polyfill.ts` — Even Hub envelope-based
  `setLocalStorage` / `getLocalStorage` polyfill (Phase 2).

### Architecture decisions

- `docs/architecture/0001-layered-ui-model.md` — Amendment 1 (z=0.5 Idle
  Content Infill atomic with z=2). **Phase 4b's Area 1 decision diverges
  from this; ADR-0009 Amendment 1 will record the revised composition rule.**
- `docs/architecture/0009-layer-manager-contract.md` — **ACCEPTED 2026-05-15.**
  Amendment 1 placeholder reserved for Phase 4b modal-on-modal bundle
  composition. **Phase 4b Plan 01 will fill this amendment.**

### Specs.md sections

- §3.1 — G2 container budget (4 image + 8 text/list per page, 1 capture
  container). **Phase 4b MUST verify budget under the no-demolish z=0.5
  rule (Area 1).**
- §7.2 — Layered render pipeline; Phase 4b adds the z=2 + z=1.5 strata.
- §7.4c — Idle Content Infill z=0.5. Phase 4b's Area 1 change to the
  z=0.5 ↔ z=2 atomic swap rule **may require a Specs amendment** in a
  v0.9.13 bump (INV-3 atomic update — Specs.md + README.md + showcase).
- §7.15.2 — Toast / passive notification design.
- §7.16 — Locale (IT / EN / DE) handling. Boot-error fixtures follow
  this convention.

### REQUIREMENTS.md

- MAP-05 — Map mode toggle runtime (Areas 1 + 3).
- TOAST-01 — Toast queue/stack (Area 5).
- BOOT-01 — Boot error states orthogonal (Area 6).
- DEATH-01 — Death saves HUD (Area 7).
- CONC-01 — Concentration drop modal (Area 8).

### Test colocation conventions

- `packages/g2-app/src/__tests__/` — g2-app local convention (preserved
  from Phase 4a). Phase 4b new tests for overlay slot, map toggle,
  death-saves pivot, conc modal land here.
- Tests **colocated beside source** for foundry-module, shared-protocol
  (Phase 4a Plan 06 established this).
- `packages/shared-render/src/fixtures/*.txt` — INV-1 ASCII fixtures.
  Phase 4b adds: boot-error × 5 states × locales, status-hud.death-saves,
  toast-queue squash states, conc-modal.

</canonical_refs>

<specifics>
## Specific Ideas (mockups + concrete examples)

### Overlay slot composition (Area 1)

```
Stato base (no overlay):              Stato overlay aperto:
  z=0   MapBaseLayer  (capture)         z=0   MapBaseLayer  (capture)
  z=0.5 IdleInfillLayer                 z=0.5 IdleInfillLayer (covered)
  z=1   StatusHudLayer                  z=2   OverlayPanel  (NEW)
                                        z=1   StatusHudLayer
```

### Toast queue squash (Area 5, SC #3 Fireball + 8 saves)

```
┌────────────────────────────────┐
│ Map area (z=0)                 │
│                                │
│             ┌──────────────────┤
│             │ Save vs DEX [+7] │ ← z=1.5 toast head (squashed badge)
│             │ Damage 12        │ ← z=1.5 toast tail
│             └──────────────────┤
│  HP 24/30  AC 16  Concentr.    │ ← z=1 status HUD
└────────────────────────────────┘
```

### Death-saves pivot (Area 7)

```
HP > 0 (standard):                   HP = 0 (death-saves pivot, latched):
  ┌─────────────────────────┐         ┌─────────────────────────┐
  │ HP 24/30  AC 16         │         │ DEATH SAVES             │
  │ Concentr.  Charmed      │         │ Pass:    [ ◯ ◯ ◯ ]      │
  └─────────────────────────┘         │ Fail:    [ ● ◯ ◯ ]      │
                                       └─────────────────────────┘
```

### Concentration-drop modal (Area 8)

```
┌─────────────────────────────────┐
│ CONCENTRATION CONFLICT          │
│                                 │
│ Hold Person is active.          │
│ Cast Bless will drop it.        │
│                                 │
│ [Y] Drop & cast Bless           │
│ [N] Cancel                      │
└─────────────────────────────────┘
  → user tap Y → bridge emits 'conc.drop.confirmed'
  → Phase 7 wires effect.delete() actual write
```

### OverlayPanel interface (Area 2)

```ts
interface OverlayPanel extends Layer {
  // Inherited from Layer: id, z, requiredCaps, render(), destroy()
  onMount(): Promise<void>;
  onUnmount(): Promise<void>;
  onEvent(gesture: R1Gesture): void;
}

// Phase 4b ships:
class ConcentrationDropModalPanel implements OverlayPanel { /* z=2 */ }

// Phase 5 will ship:
class CombatTrackerPanel implements OverlayPanel { /* z=2 */ }
class CharacterSheetPanel implements OverlayPanel { /* z=2 */ }
```

</specifics>

<deferred>
## Deferred Ideas

- **Real Quick Action menu** — Phase 4b ships the `toggleMapMode(newMode)`
  function but NOT the `[M] Map ctrl` menu item itself. The full Quick
  Action menu (long-press → menu with [M][N][R][I] options) is Phase 6
  scope.
- **Real Foundry write path for conc drop** — Phase 4b ships the modal
  + user choice capture + bridge event emission. The actual
  `effect.delete()` write via socketlib.executeAsGM is Phase 7.
- **Real R1 gesture routing** — Phase 4b stubs the `R1Gesture` type as a
  string-literal union. The full R1 event source provider, gesture
  routing to top layer, and INV-5 Gesture Determinism ratification is
  Phase 6.
- **Real panel implementations** — Phase 4b ships ONE panel
  (ConcentrationDropModalPanel) as a working exemplar of the
  OverlayPanel interface. CharacterSheetPanel, CombatTrackerPanel,
  SpellbookPanel, etc., are Phase 5.
- **Multi-attack tracker (MULTI-01)** — NOT in Phase 4b. Tracked
  separately for Phase 7.
- **Reaction passive-notification toast (REACT-01)** — Phase 4b's toast
  queue can be REUSED for reaction notifications in Phase 7 (display-only
  per requirement). Phase 4b ships the layer + queue; Phase 7 fills the
  reaction event pipe.
- **Color / phosphor effects on toasts** — G2 is 4-bit greyscale; no
  color. Severity differentiation via single-char prefix only. Future
  phosphor amber/green CSS effects in showcase HTML only.
- **Specs.md v0.9.13 bump** — If container budget verification in Area 1
  succeeds with the no-demolish rule, Specs.md §7.4c may need an
  amendment noting "overlay z=2 mounts on top of z=0.5 without atomic
  demolish — see ADR-0009 Amendment 1". INV-3 atomic update (Specs +
  README + showcase) if triggered.

</deferred>

---

*Phase: 04b-overlay-slot-map-mode-toggle-adversarial-ui*
*Context gathered: 2026-05-15 via /gsd-autonomous smart-discuss batch (4 + 4 grey areas)*
