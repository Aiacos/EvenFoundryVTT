# Phase 6: R1 Integration + Quick Action + INV-5 — Context

**Gathered:** 2026-05-16
**Status:** Ready for research + planning
**Source:** smart-discuss (autonomous workflow batch table — operator-accepted 2026-05-16, 3/3 areas "Accept all")

<domain>
## Phase Boundary

R1 ring events flow to the top layer with deterministic semantics; Quick Action menu is reachable from every overlay; INV-5 Gesture Determinism is ratified as project invariant.

**Phase 5 delivered:** PanelRouter + 5 panels (CharacterSheet, Combat, Log, Inventory, Spellbook) + LOCALE_MENU constant + locale-override.ts + boot-engine step 9c + integration smoke harness. All panels subscribe to `panel-gesture-bus` via `onMount` and receive R1Gesture stubs through it.

**Phase 6 ships:**

1. **R1 event source provider** — `packages/g2-app/src/engine/r1-event-source.ts` subscribes to Bridge WS `r1.gesture` envelopes, debounces tap/double-tap/long-press per timing constants, publishes synthesized gestures to `panel-gesture-bus`.
2. **`r1-timings.ts` constants module** — tunable `tapMs / doubleTapMs / longPressMs / scrollDebounceMs` defaults; hardware-tuned values land via §10.0.1 closure (Branch A `human_needed` carry).
3. **Top-of-stack routing** — `LayerManager.getTopLayer()` new accessor returns the highest-z mounted layer with a handler. `panel-gesture-bus` publishes to **exactly one** receiver — the top layer. Modal blocks fall-through.
4. **QuickActionMenuPanel** — new OverlayPanel at z=2 (Strategy A single 'overlay-block' container). 9 items: `[S]heet [C]ombat [L]og [B]ook(=Spell) [I]nv [A]ction [M]apMode [N]Language [X]Close`. Differential demolish: opens over active panel, restores it on close.
5. **Context chip in StatusHudRenderer footer** — `R1: tap=cycle scroll=nav long=quick[combat]` — names the menu long-press will open right now based on active overlay (SC #4 = INV-5 visible enforcement, addresses Specs research Pitfall 5).
6. **INV-5 ratification** — `docs/architecture/INVARIANTS.md` new doc consolidating INV-1..5. INV-5: every R1 gesture maps to exactly one panel handler call.
7. **Cross-overlay reachability test harness** — `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` 15 cases mapping 1:1 to Specs §7.14.4 ck 1-15.
8. **`[N] Language` Quick Action menu UI** — renders `LOCALE_MENU` constant from Phase 5; tap-to-select calls `persistLocaleOverride` + triggers in-process locale rebind event for mounted panels.

**NOT in scope:**

- Foundry write path (`activity.use()`, multi-attack tracker, reaction toast, conc-drop write) — all Phase 7.
- Multi-attack tracker overlay (`MULTI-01`) — Phase 7.
- Real reaction notification toast (`REACT-01`) — Phase 7 (Phase 6 ships the toast queue from Phase 4b unchanged).
- AoE template placement (`ACT-02`) — Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Area 1: R1 Event Source Provider Architecture

- **Input path:** Bridge WS messages carrying `r1.gesture` envelope (proto canonical, `type: 'r1.gesture'`, payload `{ kind: 'tap'|'scroll-up'|'scroll-down'|'long-press', timestamp: number }`). Reserved in Phase 4b shared-protocol (`EnvelopeSchema`); Phase 6 adds the `R1GestureEnvelopeSchema` payload sub-schema in `packages/shared-protocol/src/payloads/r1.ts`.
- **Provider module:** `packages/g2-app/src/engine/r1-event-source.ts` — `attachR1EventSource(ws, gestureBus, layerManager, timings): () => void` (returns unsubscribe). Subscribes to WS, validates via `EnvelopeSchema.safeParse` (outer) + `R1GestureEnvelopeSchema.safeParse` (inner) — Phase 4b's double trust boundary pattern.
- **Tunable timing constants:** `packages/g2-app/src/engine/r1-timings.ts` exports a `DEFAULT_R1_TIMINGS` object:
  ```ts
  export const DEFAULT_R1_TIMINGS = {
    tapMs: 250,                 // single-tap window
    doubleTapWindowMs: 350,     // 2nd tap must arrive within this window
    longPressMs: 600,           // long-press threshold
    scrollDebounceMs: 50,       // scroll event debounce
  } as const;
  ```
  Hardware-tuned values land via §10.0.1 closure (Branch A `human_needed` carry-forward SC-06-01).
- **Top-of-stack routing:** New `LayerManager.getTopLayer(): Layer | null` accessor returns the mounted layer with the highest z that has a handler (`onEvent` method present). `panel-gesture-bus.publish` routes to exactly that layer. INV-5 enforcement: never zero (boot-error or empty-stack edge case = no-op + telemetry log), never two (top-layer determinism).

### Area 2: Quick Action Menu UX

- **Mount semantics:** `QuickActionMenuPanel implements OverlayPanel` at z=2 (Strategy A single 'overlay-block' text container). Uses the **same differential demolish rule** as Phase 4b — z=0.5 IdleInfillLayer atomically demolished on mount, restored on unmount; z=1.5 ToastQueueLayer survives. If another OverlayPanel was active before long-press, it's **suspended** (state preserved, layer destroyed) and **restored** on menu close. PanelRouter handles this via a new `pushOverlay(menu)` / `popOverlay()` stack.
- **Menu item set + ordering (9 items per Specs §7.13):**
  ```
  [S]  Scheda / Sheet / Blatt
  [C]  Combatt / Combat / Kampf
  [L]  Log / Log / Log
  [B]  Libro / Book / Buch
  [I]  Inventario / Inventory / Inventar
  [A]  Azione / Action / Aktion
  [M]  Mappa / Map mode / Karte
  [N]  Lingua / Language / Sprache
  [X]  Chiudi / Close / Schließen
  ```
  - Each row: nav-key `[X]` (4 chars) + 2-space gap + localized label (truncated to 22-char budget) = ≤28 chars per row, fits 66-char inner width with leading space.
  - Active item indicator: `▶ ` prefix (same pattern as tab strip per SHEET-04). Scroll cycles, tap opens, long-press cancels.
  - Item `[X] Close` always last.
- **Quick Action `[N] Language` sub-menu:** Tapping `[N]` opens a nested menu showing `LOCALE_MENU` from Phase 5 (`Auto / Italiano / English / Deutsch / Español / Français / Português`). Tap an entry → call `persistLocaleOverride(bridge, code)` + emit a `locale.changed` event on `panel-gesture-bus` so the parent panel (suspended underneath) re-renders on restore.
- **Context chip in StatusHudRenderer footer:** Replace the static `R1: tap/scroll/long` row with a context-aware chip:
  - Format: `R1: tap=<top-tap-action>  scroll=<top-scroll-action>  long=quick[<active-overlay-id>]`
  - Width budget: 38 chars (right-aligned in the footer next to the existing chip bar).
  - Source: `LayerManager.getTopLayer()?.getR1Hints()` — optional method on Layer interface returning `{ tap: string; scroll: string; longPressLabel: string }`. Default for layers that don't implement it: `{ tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' }`.
  - INV-5 visible enforcement (SC-4): the chip literally names "what long-press does right now".

### Area 3: INV-5 Ratification + Cross-Overlay Reachability Harness

- **INV-5 location:** New `docs/architecture/INVARIANTS.md` doc consolidating INV-1..5 (currently scattered across Specs.md §0.1 + CLAUDE.md). INV-5 text (Italian + English):
  > **INV-5 — Gesture Determinism.** Every R1 gesture (tap, double-tap, scroll-up, scroll-down, long-press) maps to **exactly one** panel handler call. The receiver is the layer returned by `LayerManager.getTopLayer()` (highest z among mounted layers exposing `onEvent`). Modal panels block fall-through (the menu over a panel blocks the panel's gestures while open). Zero-handler edge cases (empty stack, boot-error active) are explicit no-ops with telemetry; never silent drops or multi-handler broadcasts.
  >
  > Verified via `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` (15 cases mapping 1:1 to Specs §7.14.4 ck 1-15) + `panel-gesture-bus.test.ts` single-receiver invariant tests.

- **Cross-overlay reachability harness:** `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` ships 15 named test cases:
  - **ck 1-9:** From each of 9 reachable states (main HUD + 5 panels + Quick Action menu + boot splash + boot error), assert reaching every other state takes ≤2 gestures.
  - **ck 10:** `[X] Close` from Quick Action menu returns to active panel (or main HUD if no panel was active).
  - **ck 11-13:** Toast queue survives panel switches, modal opens, and Quick Action menu open (4b's differential demolish rule still holds for Phase 6 additions).
  - **ck 14-15:** INV-1 ASCII fixture char-perfect across all transitions; status-HUD context chip updates on every layer-mount/unmount.
  - Each case: helper `simulateGesture(layerManager, gestureBus, kind)` then assert final `LayerManager.getTopLayer().id`.

- **Hardware-pending SC carry-forward (ADR-0005 Branch A `human_needed`):**
  - **SC-06-01** — R1 timing constants validated against real R1 ring per Phase 0 §10.0.1 (close via `pnpm --filter @evf/validation-harness validate:all`).
  - **SC-06-02** — Long-press feels right (no false-triggers on accidental finger rest) on real R1 hardware.
  - **SC-06-03** — Menu-open latency p50 ≤ 200 ms on real G2 + R1 (BLE round-trip + layer-manager bundle + bridge.textContainerUpgrade).
  - Total project hardware-pending count after Phase 6: **18** (Phase 4a: 5 + Phase 4b: 5 + Phase 5: 5 + Phase 6: 3).

### Area 4: Plan Decomposition (anticipated — researcher/planner refines)

| Wave | Plan | Title | REQ |
|------|------|-------|-----|
| 0 | 06-01 | R1GestureEnvelopeSchema + r1-timings.ts + R1 event source provider + LayerManager.getTopLayer() + INVARIANTS.md (atomic Wave 0) | NAV-01 (timing + routing); INV-5 ratification |
| 1 | 06-02 | QuickActionMenuPanel + PanelRouter.pushOverlay/popOverlay + 9-item rendering + nested `[N] Language` sub-menu + 6 INV-1 fixtures | NAV-02 |
| 2 | 06-03 | StatusHudRenderer context chip + Layer.getR1Hints() interface extension + 5 INV-1 fixtures (one per active overlay state) | NAV-01 (chip), INV-5 visible enforcement |
| 3 | 06-04 | 06-cross-overlay-reachability.test.ts 15-case harness + panel-gesture-bus.test.ts single-receiver invariant tests + Phase 6 closure | NAV-03 |

### Area 5: Test Discipline (carry-forward from Phase 4b/5)

- **INV-1 fixtures:** New `packages/shared-render/src/fixtures/quick-action.{base,with-sheet-active,with-combat-active,with-language-submenu}.it.txt` (4 menu states) + `status-hud.context-chip.{main,sheet,combat,log,inv,spell,menu}.it.txt` (7 chip variations). Total: ~11 new fixtures.
- **Per-locale stress:** At least 1 fixture in DE locale for the Quick Action menu (longest German labels stress INV-1 budgets).
- **Tests colocated** with source per Phase 4b/5 convention.

### Area 6: Capability Gates

- R1 event source provider declares no new capability requirement (BLE input is the base capability; Even Hub SDK exposes `r1.eventListener` as a baseline feature).
- Quick Action menu always reachable (long-press from any layer triggers the gesture-bus → top-layer routing path).
- `[N] Language` sub-menu: declares `requiredCaps: []` (read/write to Hub kv is also baseline).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Phase 4b/5 deliverables (foundation — Phase 6 consumes these)

- `packages/g2-app/src/engine/panel-gesture-bus.ts` — pub/sub bus. Phase 6's R1 event source is a new producer.
- `packages/g2-app/src/engine/panel-router.ts` — Phase 6 extends with `pushOverlay()` / `popOverlay()` stack semantics.
- `packages/g2-app/src/engine/overlay-panel.ts` — `OverlayPanel` interface. QuickActionMenuPanel implements this.
- `packages/g2-app/src/engine/layer-manager.ts` — Phase 6 adds `getTopLayer()` accessor.
- `packages/g2-app/src/engine/layer-types.ts` — Phase 6 extends `Layer` with optional `getR1Hints()` method.
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — Phase 6 replaces static `R1:` footer row with context-aware chip.
- `packages/g2-app/src/locale/locale-menu.ts` — `LOCALE_MENU` constant from Phase 5. Phase 6 renders this in the `[N] Language` sub-menu.
- `packages/g2-app/src/locale/locale-override.ts` — `persistLocaleOverride` from Phase 5.
- `packages/g2-app/src/panels/concentration-drop-modal.ts` — exemplar pattern for QuickActionMenuPanel.

### Architecture decisions

- `docs/architecture/0001-layered-ui-model.md` Amendment 1 — differential demolish rule that Phase 6 menu mount/unmount respects.
- `docs/architecture/0009-layer-manager-contract.md` Amendment 1 — overlay-slot composition rules.
- `docs/architecture/0010-panel-plugin-registry.md` — PanelRouter discovery contract from Phase 5.
- **New: `docs/architecture/INVARIANTS.md`** — consolidates INV-1..5; Phase 6 ratifies INV-5.

### Specs.md sections

- **§3.2** — R1 hardware gesture model (tap, double-tap, scroll, long-press only).
- **§7.13** — Quick Action menu canonical mockup (9 items, list-modal full-screen).
- **§7.14.4 ck 1-15** — cross-overlay reachability + closability checklist (15 items).
- **§7.15** — Status HUD footer chip layout.
- **§10.0.1** — R1 SDK Events Phase 0 validation test (hardware-pending source of truth for tap/longpress timings).
- **§0.1 INV-5 placeholder** — Phase 6 ratifies in INVARIANTS.md.

### REQUIREMENTS.md

- **NAV-01** — R1 gesture model (tap=cycle, double-tap=back, scroll=nav, long-press=Quick Action). Timing windows locked in Phase 0 §10.0.1 → hardware-pending SC-06-01.
- **NAV-02** — Quick Action menu list-modal full-screen, scroll=select, tap=open, long-press=cancel.
- **NAV-03** — Cross-overlay reachability + closability checklist 15×.

### Test colocation conventions

- `packages/g2-app/src/engine/__tests__/r1-event-source.test.ts` — unit tests for the provider.
- `packages/g2-app/src/panels/__tests__/quick-action-menu-panel.test.ts` — panel unit tests.
- `packages/g2-app/src/__tests__/06-cross-overlay-reachability.test.ts` — integration harness (15 cases).
- `packages/shared-render/src/fixtures/*.txt` — INV-1 fixtures.

</canonical_refs>

<specifics>
## Specific Ideas

### R1 event source provider signature

```ts
// packages/g2-app/src/engine/r1-event-source.ts
import type { PanelGestureBus, R1Gesture } from './panel-gesture-bus';
import type { LayerManager } from './layer-manager';
import { DEFAULT_R1_TIMINGS } from './r1-timings';
import { EnvelopeSchema, R1GestureEnvelopeSchema } from '@evf/shared-protocol';

export function attachR1EventSource(
  ws: WebSocketLike,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  timings = DEFAULT_R1_TIMINGS,
): () => void {
  // - Subscribe to ws messages
  // - Outer EnvelopeSchema.safeParse → narrow type === 'r1.gesture'
  // - Inner R1GestureEnvelopeSchema.safeParse → extract payload.kind
  // - Apply timing windows: tap vs double-tap distinction via timestamp delta;
  //   long-press detected on payload kind 'long-press' direct from bridge (bridge does the timing)
  // - Top-of-stack route: const top = layerManager.getTopLayer();
  // - gestureBus.publish(gesture) → bus forwards to top layer only (INV-5)
  // - Return unsubscribe closure
}
```

### Quick Action menu mockup (IT, base state)

```
┌───────────────────────────────────────────────────────────────────┐
│ AZIONE RAPIDA                                                     │
│                                                                   │
│ ▶ [S]  Scheda                                                     │
│   [C]  Combatt                                                    │
│   [L]  Log                                                        │
│   [B]  Libro                                                      │
│   [I]  Inventario                                                 │
│   [A]  Azione                                                     │
│   [M]  Mappa                                                      │
│   [N]  Lingua                                                     │
│   [X]  Chiudi                                                     │
└───────────────────────────────────────────────────────────────────┘
  → scroll = cambia voce attiva
  → tap = apri voce
  → long-press = annulla (chiude menu, ripristina overlay sotto)
```

### Context chip mockup (StatusHudRenderer footer)

```
║ R1: tap=cycle  scroll=nav  long=quick[combat]   [▶scheda] …       ║
```

When Combat panel is active → `long=quick[combat]`.
When Quick Action menu itself is active → `long=annulla` (cancel).
When boot splash → `long=—` (no-op).

### INV-5 invariant statement (verbatim for INVARIANTS.md)

> **INV-5 — Gesture Determinism (Phase 6 ratification).**
>
> Every R1 gesture maps to exactly one panel handler call. The receiver is the layer returned by `LayerManager.getTopLayer()` (highest z among mounted layers exposing `onEvent`). Zero-handler cases (empty stack, boot-error active) are explicit no-ops with a telemetry log entry. Multi-handler broadcasts are forbidden. Modal panels block fall-through (menu over panel blocks the panel's gestures while open).

</specifics>

<deferred>
## Deferred Ideas

- **Real R1 ring hardware testing** — SC-06-01 / SC-06-02 / SC-06-03 carry-forward to ADR-0005 Branch A `human_needed`.
- **Multi-attack tracker overlay (MULTI-01)** — Phase 7.
- **Reaction notification toast wiring (REACT-01)** — Phase 7 (toast queue from 4b is reused).
- **Foundry write path actions from Quick Action `[A]` menu** — Phase 7. Phase 6 ships the `[A] Action` menu entry that opens a Phase 7-owned panel.
- **AoE template placement (ACT-02)** — Phase 7.
- **Voice input via R1 hold-to-talk** — V2 (Phase 12).
- **R1 biometrics (HR/HRV) for narrative cues** — STRETCH-03 (Phase 13).

</deferred>

---

*Phase: 06-r1-integration-quick-action-inv-5*
*Context gathered: 2026-05-16 via /gsd-autonomous smart-discuss batch (3 areas accepted)*
