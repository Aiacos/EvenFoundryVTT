---
slug: canvas-sheet-overlay-wont-open
status: resolved
trigger: "In the EvenHub sim (canvas mode), the rich 6-tab raster character sheet (CanvasCharacterSheetPanel, z=2 overlay) never appears. At boot only the minimal status line renders. Sending gestures (double_click/click) does nothing visible. 5 panels fail dev lazy-load (quick-action-menu, reaction-prompt, slot-picker, target-picker, template-placement) with empty `{}` error — the Quick Action menu is the entry point to open the sheet, so the overlay is unreachable."
created: 2026-06-09
updated: 2026-06-09
---

# Debug: canvas character-sheet overlay won't open (gesture → Quick Action → sheet)

## Goal
Make the rich 6-tab raster CharacterSheet (`CanvasCharacterSheetPanel`, z=2 overlay) actually render on the simulator glasses — so a gesture opens it and the seeded character (Aiacos Stormborn) shows as a rasterized sheet, not just the z=1 status line.

## Symptoms (original)
- Boot shows only the z=1 status line; gestures received by the app but no visible change.
- 5 panels excluded at discovery with empty `{}` load error.

## Eliminated
- ~~"5-panel lazy-load failure blocks the menu"~~ — the menu is constructed DIRECTLY by the over-scroll dispatcher (boot-engine-core `makeMenu`), not via the registry. The lazy-load failures were noise (see RC-2), not the entry-point blocker.
- ~~"WS r1.gesture fixes make sim touchpad work"~~ — sim `/api/input` sends SDK events, not WS envelopes; a separate producer was needed (RC-1).

## Resolution

**FIVE root causes**, peeled in sequence (each unblocked discovery of the next):

### RC-1 — No production gesture producer (CRITICAL, affects real hardware too)
The ONLY PanelGestureBus publisher was `r1-event-source.ts` (WS `r1.gesture` envelopes) — and the bridge emits those ONLY from the `/debug/simulate-gesture` test route. Touchpad/ring gestures arrive via the SDK stream (`bridge.onEvenHubEvent`), which NOBODY consumed (only `audio-capture.ts` for PCM). Production input was completely dead.
**Fix:** new `engine/glasses-event-source.ts` — subscribes `onEvenHubEvent`, maps the gesture ordinals → `R1Gesture`, publishes to the bus, fires `onPublish` → `HudDeltaDriver.requestCycle()`. Wired in boot-engine-core step 11b+, torn down in teardown.
**Wire-shape gotcha (live-sim verified):** the host SPLITS the gesture set across two event shapes — scrolls arrive as `textEvent {containerID:4, eventType:1|2}`, clicks/double-clicks as `sysEvent {eventSource:1, eventType?:0|3}`. Protobuf default-omission: `eventType:0` (CLICK) is OMITTED on the wire — `eventType ?? 0`, gated for sysEvent on `eventSource ∈ {1,2,3}` (TOUCH_EVENT_FROM_*).

### RC-2 — 5 panels lazy-load "error {}" = missing default export (noise, now silent by design)
`discoverPanels()` requires `mod.default`; the 5 system-overlay panels export by name only (documented: "opened directly via pushOverlay"). `Cls.meta` on `undefined` threw TypeError, serialized as `{}` by the WebView console. **Fix:** `panel-router.ts` treats `mod.default === undefined` as the expected system-overlay marker (silent skip, mirrors the empty-navKey skip); catch now logs `String(err)` so real errors are never `{}` again.

### RC-3 — Quick Action menu invisible in canvas mode (text behind opaque tiles)
The working-tree attempt wrote menu text into `hud-capture` (id 4) — but that container is declared so the 4 image tiles render ON TOP of it (container-registry.ts §hud-capture). Text there can never be visible. **Fix:** `QuickActionMenuPanel` now implements `CanvasLayer` (attachCanvas/paint/isDirty) and paints a compact menu box (VT323 16px, 400×200) composited at z=2 like `CanvasCharacterSheetPanel`; in canvas mode `draw()` only marks dirty (zero SDK text calls, ADR-0013 Amendment 1 decision #3 honored for real).

### RC-4 — Nothing recomposites after a gesture (stale display on menu nav + sheet tab nav)
`HudDeltaDriver` woke only on `character.delta`/`combat.turn`/`combat.state`; gesture-driven dirty flags waited for the next Foundry delta. **Fix:** `'r1.gesture'` added to DELTA_CHANNELS (WS path) + public `requestCycle()` called by glasses-event-source (SDK path).

### RC-5 — Replace bundle wiped the new overlay from the compositor (THE invisible-menu-over-panel bug)
`LayerManager.bundle()` STEP 2.5 processed canvas MOUNTS before DESTROYS. `pushOverlay`'s atomic suspend path issues `[{destroy z2},{mount z2}]` — the new layer was registered, then the destroy loop `deregisterLayer(z2)` wiped it. Menu over an existing panel = never composited (worked only on empty z2). **Fix:** destroys processed BEFORE mounts (order now load-bearing, documented inline). Regression test LMT-CV-REPLACE-01.

Carried from the prior session (same debug, uncommitted then): r1-event-source root-state fall-through (gestures publish at root instead of INV-5 drop), layer-manager unique-capture-name invariant, boot-engine renderMode → menu constructor.

## Verification (live sim, fresh PID per protocol — 2026-06-09)
Full chain `/api/input` (SDK touchpad path) on `evenhub-simulator` + bridge :8911 + `_seed.ts`:
- swipe-up at root → **[ AZIONE RAPIDA ] menu visible** (9 items, cursor ▶)
- tap [S] → **6-tab raster sheet** (MAI: Wizard 10, PF bar 41/63 dithered, CA/INI/VEL, 6 ability scores; SKI: skills+passives; INV: equipment; SPL: Fire Bolt/Shield; FEA: feats) — tab nav via tap repaints live
- swipe-up OVER the sheet → menu visible over suspended panel (RC-5 case)
- [C] → **COMBAT TRACKER live** (initiative order, current-turn highlight, HP bars, conc:Bless); re-pushing `combat.state` repaints in real time
- [N] → **[ LINGUA ] submenu** (7 locales)
- Screenshots: /tmp/evf-shots/30-35*.png
- Gates: typecheck 0 · lint:ci 0 errors · 1612/1612 g2-app tests (15 new GES + LMT-CV-REPLACE-01) · 3316+ workspace

## Deferred (tracked, NOT bugs introduced here)
- **Double-tap close of nav panels is NOT wired** (`PanelRouter.closeActivePanel()` has zero callers; canvas sheet/combat double-tap is a documented no-op stub "router closes at bus level" — that dispatcher never existed). Today panels are left open and navigation happens by re-opening the menu over them (works). Proper wiring is part of the GEST-01/ADR-0012 implementation debt (see memory `gest01-phase20-gesture-redesign`).
- **[M] Mappa / map content**: z=0 MapBaseLayer renders scene raster only when Foundry pushes scene frames — no scene source in the sim seed. Untested here; needs a real Foundry (or a scene-frame seed extension).
- `r1-event-source.test.ts` R1E-08 updated in the prior session for the root-state fall-through; kept.

## Files changed
- `packages/g2-app/src/engine/glasses-event-source.ts` (NEW — RC-1)
- `packages/g2-app/src/engine/__tests__/glasses-event-source.test.ts` (NEW — 15 tests)
- `packages/g2-app/src/engine/panel-router.ts` (RC-2)
- `packages/g2-app/src/panels/quick-action-menu-panel.ts` (RC-3 + prior-session canvas container strategy)
- `packages/g2-app/src/engine/hud-delta-driver.ts` + `.test.ts` (RC-4)
- `packages/g2-app/src/engine/layer-manager.ts` + `__tests__/layer-manager.test.ts` (RC-5 + prior-session unique-capture-names)
- `packages/g2-app/src/internal/boot-engine-core.ts` (wiring 11b+ / teardown + prior-session renderMode)
- `packages/g2-app/src/engine/r1-event-source.ts` + test (prior session — root-state fall-through)
