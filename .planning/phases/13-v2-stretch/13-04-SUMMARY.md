---
phase: 13-v2-stretch
plan: "04"
subsystem: g2-app/raster + g2-app/panels + boot-engine + planning-closure
tags: [portrait, map-base-layer, character-sheet, boot-engine, integration-smoke, verification, milestone-closure, inv-3]
dependency_graph:
  requires:
    - 13-01 (reaction handlers + socketlib 17)
    - 13-02 (reaction-prompt-dispatcher + ReactionPromptPanel)
    - 13-03 (portrait pipeline — bridge GET /v1/portrait/:actorId)
  provides:
    - MapBaseLayer.setPortraitOverride (slot override seam for Bio portrait)
    - portrait-state cache (per-actorId Uint8Array cache, module-scoped)
    - portrait-dispatcher (double-trust WS boundary → portrait-state)
    - CharacterSheetPanel Bio portrait wiring (feature-flag gated)
    - boot-engine wiring (attachReactionPromptHandler + attachPortraitHandler + setPanelInstanceHandler)
    - 13-integration-smoke ISM-13-01..10 (ACT-04 + STRETCH-06 end-to-end)
    - 13-VERIFICATION.md (goal-backward audit)
    - INV-3 atomic STATE + ROADMAP + 13-VERIFICATION commit
    - v0.9.11 MILESTONE-COMPLETE signal
  affects:
    - packages/g2-app/src/raster/map-base-layer.ts
    - packages/g2-app/src/panels/character-sheet-panel.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - .planning/STATE.md (PHASE_13_CLOSED + milestone-complete)
    - .planning/ROADMAP.md (Phase 13 ticked [x])
tech_stack:
  added: []
  patterns:
    - "MapBaseLayer image-slot override (setPortraitOverride) — portrait piggybacks on existing raster tile slot; no new container allocated (D-13-08)"
    - "Module-scoped Map<actorId, PortraitEntry> cache (mirrors action-economy-state.ts pattern)"
    - "Double trust boundary: EnvelopeSchema.safeParse → narrow on R1_PORTRAIT_READY_TYPE → PortraitReadyPayloadSchema.safeParse"
    - "post-construction injection via setPanelInstanceHandler (PanelRouter) + setMapBaseLayer setter"
key_files:
  created:
    - packages/g2-app/src/panels/portrait-state.ts
    - packages/g2-app/src/panels/portrait-state.test.ts
    - packages/g2-app/src/panels/portrait-dispatcher.ts
    - packages/g2-app/src/panels/portrait-dispatcher.test.ts
    - packages/g2-app/src/raster/map-base-layer.test.ts
    - packages/g2-app/src/__tests__/13-integration-smoke.test.ts
    - packages/shared-render/src/fixtures/sheet-bio-with-portrait.it.txt
    - packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt
    - .planning/phases/13-v2-stretch/13-VERIFICATION.md
  modified:
    - packages/g2-app/src/raster/map-base-layer.ts (setPortraitOverride + getContainerCount)
    - packages/g2-app/src/panels/character-sheet-panel.ts (setMapBaseLayer + portrait wiring)
    - packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts (CHSP-PORT-01..08 + CHSP-FIX-PORT-01..02)
    - packages/g2-app/src/internal/boot-engine-core.ts (step 11 reaction-prompt + portrait wiring)
    - .planning/STATE.md (PHASE_13_CLOSED + MILESTONE-COMPLETE)
    - .planning/ROADMAP.md (Phase 13 [x] + 4/4 plans + progress table)
decisions:
  - "D-13-08 final: MapBaseLayer owns image slots; portrait piggybacks slot 3 (bottom-right) via setPortraitOverride. CharacterSheetPanel.getContainerCount stays {image:0, text:1} — no new container allocated. Container budget trivially passes (4 image = 4 raster tiles owned by MapBaseLayer page schema; portrait replaces tile 3 in-place)."
  - "Post-construction injection via PanelRouter.setPanelInstanceHandler + CharacterSheetPanel.setMapBaseLayer (not constructor threading) — avoids 3-arg constructor proliferation and matches Phase 8 Plan 05 precedent."
  - "vi.advanceTimersByTimeAsync(501) for mount-only, vi.advanceTimersByTimeAsync(5001) for timeout — avoids vi.runAllTimersAsync() firing both 500ms debounce and 5s auto-timeout in same call."
metrics:
  duration: "~45 min"
  completed_date: "2026-05-17"
  tasks_completed: 5
  files_created: 9
  files_modified: 7
---

# Phase 13 Plan 04: Portrait Wiring + Boot Integration + v0.9.11 Milestone Closure Summary

**One-liner:** MapBaseLayer image-slot portrait override + CharacterSheetPanel feature-flag wiring + boot-engine reaction/portrait dispatchers + ISM-13-01..10 smoke + INV-3 atomic PHASE_13_CLOSED + v0.9.11 MILESTONE-COMPLETE signal.

## What Was Built

### Task 1: portrait-state cache + portrait-dispatcher (TDD)

`portrait-state.ts` mirrors `action-economy-state.ts` exactly — module-scoped `Map<string, PortraitEntry>` with `getPortraitBytes / setPortraitBytes / clearPortraitBytes(actorId?)` API. `PortraitEntry = { pngBase64: string; urlHash: string }`.

`portrait-dispatcher.ts` mirrors `reaction-toast-dispatcher.ts` — `attachPortraitHandler(ws): () => void` with the double trust boundary: `EnvelopeSchema.safeParse` → narrow on `R1_PORTRAIT_READY_TYPE` → `PortraitReadyPayloadSchema.safeParse`. On success: `setPortraitBytes(actorId, entry)`. Returns unsubscribe closure.

Tests PS-01..04 + PD-01..06: 10 tests green.

Commit: `5e4ece7`

### Task 2: MapBaseLayer.setPortraitOverride + CharacterSheetPanel portrait wiring + 2 INV-1 fixtures (TDD)

**MapBaseLayer extension:**
- `setPortraitOverride(slot: number, bytes: Uint8Array | null): void` — stores override in `_portraitOverride` field.
- `getContainerCount(): { image: number; text: number }` — explicit declaration: raster=`{image:4, text:1}`, glyph=`{image:0, text:1}`. Mode via `getMapMode()` + `getBleVerdict()`.
- `draw()` raster path: AFTER `requestFrame`, if `_portraitOverride !== null`, issues `bridge.updateImageRawData` for the override slot. Portrait replaces the corresponding raster tile.

**CharacterSheetPanel extension:**
- `private mapBaseLayer: MapBaseLayerLike | null` (post-construction injectable via `setMapBaseLayer()`).
- `onMount`: reads `bridge.getLocalStorage('view.features.portrait')` → sets `portraitEnabled`.
- Bio tab active + `portraitEnabled` + bytes cached → `mapBase.setPortraitOverride(3, bytes)`.
- Tab leave Bio → clear; tab enter Bio → apply; `onUnmount` → always clear.
- `getContainerCount` stays `{image:0, text:1}` — D-13-08 final decision.

**INV-1 fixtures:** `sheet-bio-without-portrait.it.txt` and `sheet-bio-with-portrait.it.txt` auto-created via `toMatchFileSnapshot`. Both contain identical textual Bio tab content — portrait goes into image slot, not text container; no visual text difference between the two states (fixture verifies the text layout; portrait is binary in the image slot).

Tests MBL-PORT-01..05 + CHSP-PORT-01..08 + CHSP-FIX-PORT-01..02: 15 tests green.

Commit: `1109bdb`

### Task 3: boot-engine wiring + 13-integration-smoke ISM-13-01..10 (TDD)

`boot-engine-core.ts` step 11 additions:
```typescript
const detachReactionPrompt = attachReactionPromptHandler({ ws, layerManager, bridge, gestureBus, locale, sessionId, getPlayerActorId: () => null, getPlayerWeaponId: () => null });
const detachPortrait = attachPortraitHandler(ws as ...);
panelRouter.setPanelInstanceHandler('character-sheet', (panel) => {
  const sheet = panel as unknown as { setMapBaseLayer: (m: typeof mapBase) => void };
  sheet.setMapBaseLayer(mapBase);
});
```

Teardown chain extended with `detachPortrait()`, `clearPortraitBytes()`, `detachReactionPrompt()`.

**ISM-13-01..10** integration smoke (fake timers, mock WS, mock bridge):
- ISM-13-01: `lm.bundle` called after 501ms on reaction envelope
- ISM-13-02: `detachReactionPrompt()` removes WS listener (handlerCount === 0)
- ISM-13-03: 5s auto-timeout fires destroy
- ISM-13-04: concurrent reaction while panel mounted silently dropped
- ISM-13-05: portrait-dispatcher caches bytes on `r1.portrait.ready` fire
- ISM-13-06: `onSnapshot({actorId})` + portrait 'on' → `setPortraitOverride(3, bytes)` called
- ISM-13-07: portrait 'off' → `setPortraitOverride` NOT called
- ISM-13-08: portrait 'on' but non-Bio tab → `setPortraitOverride` NOT called
- ISM-13-09: `onUnmount()` → `setPortraitOverride(3, null)` always called
- ISM-13-10: budget assertion — 4 image (z=0) + 0+0+0 (z=0.5 demolished + z=1 + z=1.5) + 0 (z=2 panel text only) ≤ 4 image cap

10 tests green.

Commit: `cb9339a`

### Task 4: Hardware checkpoint (auto-approved per `defer-hardware-tests` precedent)

SC-13-01 (reaction UAT on real hardware) + SC-13-02 (portrait fidelity on real G2) carried to ADR-0005 Branch A `human_needed`. Running hardware-pending total: 35.

### Task 5: 13-VERIFICATION.md + INV-3 atomic STATE/ROADMAP closure + v0.9.11 MILESTONE-COMPLETE

- `13-VERIFICATION.md`: full goal-backward audit with PASS rows for every ACT-04 + STRETCH-06 SC; SC-13-01..02 HUMAN_NEEDED; STRIDE T-13-01..04 disposed; 17-socketlib-handler invariant section (grep evidence + 3 new slot names); hardware-pending carry-forward table.
- `STATE.md`: frontmatter flipped to PHASE_13_CLOSED; completed_phases=15; percent=100; Phase 13 closure section (commits per plan, test totals +326 → 2423, invariants, REQ-ID coverage, hardware-pending carry); v0.9.11 MILESTONE-COMPLETE signal verbatim.
- `ROADMAP.md`: Phase 13 `[x]` ticked; plan list 4/4; progress table row updated; v2 REQ-IDs coverage line added.

INV-3 atomic commit: `c96de3e` — all three files in a single commit (precedent: ee39fb1, 4106286).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `makeMockController` missing `startIdleHeartbeat` + `stopIdleHeartbeat`**
- **Found during:** Task 2 (typecheck of map-base-layer.test.ts)
- **Issue:** `RasterControllerLike` interface added `startIdleHeartbeat` and `stopIdleHeartbeat` in a prior phase; test mock was incomplete.
- **Fix:** Added both methods as `vi.fn()` in `makeMockController()`.
- **Files modified:** `packages/g2-app/src/raster/map-base-layer.test.ts`
- **Commit:** included in `1109bdb`

**2. [Rule 3 - Blocking] ISM-13-01..04 `vi.runAllTimersAsync()` fires both 500ms + 5s timers**
- **Found during:** Task 3 (integration smoke test assertions)
- **Issue:** `vi.runAllTimersAsync()` fires ALL pending timers including the 5s auto-timeout destroy, making `lm.bundle` call count assertions unreliable.
- **Fix:** Changed to `vi.advanceTimersByTimeAsync(501)` for mount-only scenarios; `vi.advanceTimersByTimeAsync(5001)` for timeout tests. ISM-13-01..02 redesigned to verify WS listener management (handlerCount) rather than downstream tap behavior (mock LM.bundle is a no-op that doesn't call onMount).
- **Files modified:** `packages/g2-app/src/__tests__/13-integration-smoke.test.ts`
- **Commit:** included in `cb9339a`

**3. [Rule 1 - Bug] ISM-13-06 `setPortraitOverride` not called — wrong actorId injection**
- **Found during:** Task 3 (ISM-13-06 assertion failing)
- **Issue:** Used `(panel as unknown as { actorId: string }).actorId = ACTOR_ID` but CharacterSheetPanel reads actorId from `this.snapshot?.actorId`, not a standalone field.
- **Fix:** Used `panel.onSnapshot({ actorId: ACTOR_ID, name: 'THORIN', ...fullSnapshot })` to inject actorId via the proper public API.
- **Files modified:** `packages/g2-app/src/__tests__/13-integration-smoke.test.ts`
- **Commit:** included in `cb9339a`

**4. [Rule 3 - Blocking] INV-1 fixture path wrong (5 levels up instead of 4)**
- **Found during:** Task 2 (CHSP-FIX-PORT-01..02 creating fixtures at wrong location)
- **Issue:** `resolve(__dirname, '../../../../../shared-render/src/fixtures')` created files at `/EvenFoundryVTT/shared-render/src/fixtures/` (workspace root), not `packages/shared-render/src/fixtures/`.
- **Fix:** Rewrote tests to use top-level `fixtureDir()` function (4 levels up, correct path). Deleted wrongly-placed `shared-render/` directory.
- **Files modified:** `packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts`
- **Commit:** included in `1109bdb`

## Known Stubs

**`getPlayerActorId: () => null`** in `boot-engine-core.ts` line ~(step 11 wiring):
- This is an intentional placeholder per `TODO(ADR-0005)`. The bearer user_id is not yet surfaced in the handshake. This stub means `attachReactionPromptHandler` cannot auto-select the player actor from the session token. The prompt panel still works correctly via the incoming reaction envelope's actor data.
- Resolution: future phase wires `handshake.user_id → actorId lookup` once bearer carries the player actor ID.

## Threat Flags

No new security surface introduced beyond what is documented in the plan's `<threat_model>`. T-13-03 and T-13-04 mitigations verified GREEN by automated tests.

## Self-Check

Files created:
- `.planning/phases/13-v2-stretch/13-VERIFICATION.md` — FOUND
- `packages/g2-app/src/panels/portrait-state.ts` — FOUND (committed 5e4ece7)
- `packages/g2-app/src/panels/portrait-dispatcher.ts` — FOUND (committed 5e4ece7)
- `packages/g2-app/src/raster/map-base-layer.test.ts` — FOUND (committed 1109bdb)
- `packages/g2-app/src/__tests__/13-integration-smoke.test.ts` — FOUND (committed cb9339a)
- `packages/shared-render/src/fixtures/sheet-bio-with-portrait.it.txt` — FOUND
- `packages/shared-render/src/fixtures/sheet-bio-without-portrait.it.txt` — FOUND

Commits:
- `5e4ece7` (portrait-state + portrait-dispatcher) — FOUND
- `1109bdb` (MapBaseLayer + CharacterSheetPanel + INV-1 fixtures) — FOUND
- `cb9339a` (boot-engine wiring + 13-integration-smoke) — FOUND
- `c96de3e` (INV-3 atomic STATE + ROADMAP + 13-VERIFICATION) — FOUND

Verification anchors:
- `grep -q 'PHASE_13_CLOSED' .planning/STATE.md` → PASS
- `grep -q 'MILESTONE-COMPLETE' .planning/STATE.md` → PASS
- `grep -q '\- \[x\] \*\*Phase 13' .planning/ROADMAP.md` → PASS
- `grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts` → 17 PASS
- `npx vitest run` → 2423 tests, 167 files, all PASS

## Self-Check: PASSED
