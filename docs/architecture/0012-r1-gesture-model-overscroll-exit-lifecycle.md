---
status: accepted
date: 2026-05-31
deciders: planner
consulted: user (project owner)
informed: executor
---

# ADR-0012: R1 Gesture Model — Retire Long-Press, Over-Scroll Quick Action, Root Exit, Lifecycle Handlers

## Status

**ACCEPTED** — 2026-05-31. Supersedes the `// TODO(ADR-0009)` long-press source-channel
stub in `packages/g2-app/src/engine/layer-types.ts`. Binds GEST-01, EXIT-01, LIFE-01
(REQUIREMENTS v2). Implementation is an atomic INV-3 change spanning `shared-protocol`,
`bridge`, `g2-app`, `Specs.md`, `README.md`, `docs/showcase/index.html`, and tests.

## Context

A fresh INV-2 cross-validation round (2026-05-31) against the canonical Even Realities
developer docs surfaced three drifts between the repo and the platform contract:

### GEST-01 — `long-press` is not a hardware gesture (CRITICAL)

`hub.evenrealities.com/docs/guides/input-events` states the **complete** supported gesture
set is exactly four discrete events — there is **no long-press / no duration-based input**:

| Gesture | SDK constant | code |
|---------|--------------|------|
| press (single tap) | `CLICK_EVENT` | 0 |
| swipe-up | `SCROLL_TOP_EVENT` | 1 |
| swipe-down | `SCROLL_BOTTOM_EVENT` | 2 |
| double-press (double-tap) | `DOUBLE_CLICK_EVENT` | 3 |

> *"Long-press is not a supported gesture on the Even G2 or Even R1 … No duration-based
> input exists in the API."* — `guides/input-events`, re-verified 2026-05-31.

The repo nonetheless models `long-press` as a first-class gesture across **3 packages**:
the wire enum `R1GesturePayloadSchema` (`packages/shared-protocol/src/payloads/r1.ts`), the
bridge's server-side gesture classifier, and the g2-app internal `R1Gesture` union plus 12
panels, the router-level dispatcher, the status-HUD hint chip, i18n keys, and ~37 files of
tests/Specs/showcase references.

### EXIT-01 — Root-page exit contract not implemented (CRITICAL)

`hub.evenrealities.com/docs/reference/app-submission` requires:

> *"Root-page double-tap calls `bridge.shutDownPageContainer(1)`"* (Mode 1 = graceful exit
> dialog; **Mode 0 immediate exit is unacceptable on the root page**). QA step 3 verifies
> the system exit dialog appears and the WebView closes on double-tap.

The repo never calls `shutDownPageContainer` in production code (only test mocks). The
root/map page has no double-tap exit wiring. SDK surface confirmed (INV-2): `EvenAppBridge.
shutDownPageContainer(exitMode?: number): Promise<boolean>` — `@evenrealities/even_hub_sdk@
0.0.10` `dist/index.d.ts:1201`.

### LIFE-01 — Lifecycle event handlers not wired (IMPORTANT)

App-submission QA requires handlers for the OS lifecycle events. SDK surface confirmed
(INV-2): `OsEventTypeList` — `FOREGROUND_ENTER_EVENT = 4`, `FOREGROUND_EXIT_EVENT = 5`,
`ABNORMAL_EXIT_EVENT = 6` (`dist/index.d.ts:707-714`) plus `OsEventTypeList.fromJson`. The
g2-app declares/handles none of them.

### The design constraint that makes GEST-01 non-trivial

With `long-press` retired and **double-tap reserved by EXIT-01 for the root exit**, all four
canonical gestures are already bound in the map context (tap = primary/cycle, swipe-up/down =
navigate/pan, double-tap = exit-root / close-panel). The `long-press` gesture was the *fifth*
affordance and carried two distinct semantics:

1. **Global** — open the Quick Action menu (the router-level
   `quick-action-long-press-dispatcher`, fired from the map and every no-op panel).
2. **Per-panel context action** — on 3 panels long-press meant something specific:
   `inventory` / `spellbook` → open Action Options for the highlighted item (Phase 8);
   `template-placement` → cancel the in-flight placement.

Relocating both onto the 4-gesture vocabulary is the crux of this ADR.

## Decision

### D-1 — Retire `long-press` from the wire and the internal union

- `packages/shared-protocol/src/payloads/r1.ts`: drop `'long-press'` from the
  `R1GesturePayloadSchema` `kind` enum → `['tap','scroll-up','scroll-down','double-tap']`.
- `packages/bridge`: stop classifying/emitting `long-press`; remove the long-press
  threshold path. `r1-timings.ts` `longPressMs` is deleted (no longer reachable).
- `packages/g2-app/src/engine/layer-types.ts`: `R1Gesture` becomes
  `{kind:'tap'} | {kind:'scroll'; direction:'up'|'down'} | {kind:'double-tap'}`.

### D-2 — Quick Action menu via over-scroll (swipe-up at the top boundary)

The Quick Action menu opens on **swipe-up while the focused layer is already at its top
boundary** (over-scroll). This is implemented WITHOUT a new wire/internal gesture kind:

- `OverlayPanel` (and `MapBaseLayer`) gain an optional `isAtTopBoundary(): boolean`.
  Scrollable panels return `scrollOffset === 0` (or selection index 0). The map returns
  whether its vertical pan is at the top edge. Layers that omit the method default to
  `true` (non-scrolling layers always over-scroll on swipe-up).
- The router-level dispatcher (renamed `quick-action-dispatcher`, file
  `quick-action-overscroll-dispatcher.ts`) keeps its persistent bus subscription and its
  documented INV-5 exemption ("a router-level listener, not a panel"). New trigger:
  on `{kind:'scroll', direction:'up'}` it reads `layerManager.getTopLayer()` and opens the
  menu iff `top.isAtTopBoundary?.() ?? true`.
- **No double-action.** Every panel's `scroll-up` handler already clamps at zero
  (`scrollOffset = Math.max(0, scrollOffset - 1)`), so at the top boundary the panel's own
  swipe-up is a no-op while the dispatcher opens the menu. INV-5 (one *semantic* handler per
  gesture) is preserved: the panel performs a clamped no-op, the dispatcher performs the
  mount — exactly the pre-existing dispatcher/panel split, re-keyed from long-press to
  over-scroll.
- The Quick Action menu itself (and its `[N] Language` submenu, `[M] Map ctrl`, etc.) is
  unchanged; only its invocation gesture changes.

### D-3 — Per-panel context actions move to freed gestures

| Panel | Old (long-press) | New |
|-------|------------------|-----|
| `inventory`, `spellbook` | open Action Options for highlighted item | **`tap`** opens Action Options (which offers "use/cast now" + target/options). Aligns with the Specs "Manual MVP — actions are explicit: scroll → tap → confirm" philosophy; the prior `tap` was a stub. |
| `template-placement` | cancel placement | **`double-tap`** (= close/back, which *is* cancel for a transient modal). |
| 7 no-op panels (`character-sheet`, `combat-tracker`, `log`, `target-picker`, `move-direction`, `slot-picker`, `action-options-modal`) | global menu only (panel body was `break`) | over-scroll → global menu (D-2); the empty `case 'long-press'` is deleted. |

### D-4 — EXIT-01: double-tap on the root page calls `shutDownPageContainer(1)`

- `MapBaseLayer` (the z=0 root layer) handles `double-tap` → `bridge.shutDownPageContainer(1)`
  (Mode 1 graceful exit dialog). On overlay panels (non-root) `double-tap` keeps its
  close/back semantics — closing the last overlay returns to the map; a `double-tap` on the
  bare map is the root-exit.
- The exit call is best-effort/await-guarded (mirrors `toggleMapMode` persistence policy);
  a rejected promise logs telemetry and does not crash the page.

### D-5 — LIFE-01: wire lifecycle handlers

- Add `FOREGROUND_ENTER_EVENT(4)` / `FOREGROUND_EXIT_EVENT(5)` / `ABNORMAL_EXIT_EVENT(6)`
  handling in the boot engine's Even Hub event subscription (via `OsEventTypeList.fromJson`).
  `FOREGROUND_EXIT` / `ABNORMAL_EXIT` flush+teardown the engine handle; `FOREGROUND_ENTER`
  re-asserts the current page. Declared in the engine SDK typings the engine already imports
  from `@evenrealities/even_hub_sdk` (not the wizard-only `hub-polyfill`).

## Consequences

### Positive
- Repo matches the canonical hardware gesture set; removes a submission-blocking drift.
- EXIT-01 + LIFE-01 satisfy app-submission QA gates 2/3.
- The over-scroll model needs **no new wire kind** — `shared-protocol` only *removes* an enum
  member (a narrowing, backward-compatible for receivers).
- The dispatcher/panel split is reused, not rebuilt — minimal architectural churn.

### Negative / risks
- Large atomic change (~40 files, 3 packages) touching INV-1 snapshot fixtures (the status-HUD
  hint chip drops its `long=` slot) and INV-5 determinism tests. All must be re-baselined in
  the same commit.
- `inventory`/`spellbook` `tap` semantics change (stub-use → Action Options); their tests and
  the §7.1 dispatch-table mockups change.
- On-glasses behaviour (exit dialog, over-scroll, lifecycle) is `human_needed` under ADR-0005
  Branch A — software-complete here, hardware-gated for final UAT.

### Open implementation detail (non-blocking)
- `MapBaseLayer.isAtTopBoundary()` depends on the map's vertical pan model in
  `scene-input.ts`. If the map does not pan via discrete swipe, the map reports `true`
  unconditionally (swipe-up on the bare map always opens Quick Action). To be settled in the
  implementing plan; does not change D-1…D-5.

## INV-2 sources
- `hub.evenrealities.com/docs/guides/input-events` — 4-gesture set, no long-press (2026-05-31).
- `hub.evenrealities.com/docs/reference/app-submission` — root double-tap → `shutDownPageContainer(1)`; lifecycle handlers (2026-05-31).
- `@evenrealities/even_hub_sdk@0.0.10` `dist/index.d.ts:1201` (`shutDownPageContainer`), `:707-714` (`OsEventTypeList` 4/5/6 + `fromJson`).
- Supersedes `layer-types.ts` `// TODO(ADR-0009)` long-press source-channel stub.
