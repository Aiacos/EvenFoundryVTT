---
phase: EVF-25-promozione-raster-a-default-boot-fallback-glyph
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/g2-app/src/hud/push-hud-tiles.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/g2-app/src/internal/launch.ts
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/engine/hud-delta-driver.ts
  - packages/g2-app/src/hud/hud-raster-frame.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 25 makes three substantive changes: (1) extract `pushHudTiles` to its own module, (2) wire the glyph-fallback `setRenderMode('glyph')` call, (3) remove the `?hud=raster` PoC branch from `launch.ts`. The extraction and the `launch.ts` cleanup are clean. The glyph-fallback wire contains one critical correctness defect and two doc-level INV-4 issues.

The critical bug: `boot-engine-core.ts` step 12 unconditionally mounts `CanvasStatusHudLayer` (line 1416) regardless of `effectiveVerdict`. In glyph fallback mode, `CanvasStatusHudLayer` is a `CanvasLayer` — not an `OverlayPanel` — so `LayerManager.getTopLayer()` returns `null` and every R1 gesture is discarded via the INV-5 no-op path (`console.warn` + drop). Additionally, `CanvasStatusHudLayer.getCaptureContainer()` returns `'hud-capture'`, a container that does not exist in the glyph page schema (the glyph schema only declares `header`/`footer`/`status-hud`). The capture-invariant count still passes (count=1) because the invariant checks the number of `getCaptureContainer()` calls that return a non-undefined string, not whether that name is in the current page schema. D-25.3 requires glyph fallback to be "byte-identical to pre-v0.10.0"; instead, R1 gestures are non-functional in this path.

---

## Critical Issues

### CR-01: `CanvasStatusHudLayer` always mounted in glyph fallback — R1 gestures silently dropped (INV-5 violated)

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:1416`

**Issue:** Step 12 unconditionally mounts `CanvasStatusHudLayer` at `z=1`:

```typescript
await layerManager.bundle([{ type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: canvasStatusHud }]);
```

In glyph fallback mode (`effectiveVerdict === 'glyph'`), `renderMode` has been flipped to `'glyph'` at step 9d. The bundle call still runs correctly — `_flushPage` emits the 3-container glyph schema and no tile-push happens. However, two behavioral defects follow:

**Defect A — INV-5 gesture black-hole.** `CanvasStatusHudLayer` implements `CanvasLayer`, not `OverlayPanel`. `LayerManager.getTopLayer()` scans the z-stack for layers that satisfy `isOverlayPanel()` (checks for `onMount`/`onUnmount` function presence). `CanvasStatusHudLayer` fails this predicate, so `getTopLayer()` returns `null`. `attachR1EventSource` treats `null` as an INV-5 no-op: it emits `console.warn` and drops the event. Every R1 gesture (tap, double-tap, scroll-up, scroll-down) is silently discarded in glyph mode. The user cannot navigate panels, dismiss overlays, or trigger any gesture-driven action.

**Defect B — phantom capture container.** `CanvasStatusHudLayer.getCaptureContainer()` returns `'hud-capture'` (the full-screen isEventCapture container declared in the canvas schema). In glyph mode, `_flushPage` emits `buildStatusViewTextContainers()` which only declares `header` (id=4), `footer` (id=5), and `status-hud` (id=6). Container `'hud-capture'` does not exist in this schema. The capture-invariant assertion still passes because it only counts non-undefined return values from `getCaptureContainer()` — it does not verify the name against the live page schema. The phantom capture does not crash the engine, but it means the event-capture contract is broken: the `isEventCapture:1` text container that routes R1 events on the host is absent from the page.

**Pre-existing `StatusHudLayer` writes id=6 via heartbeat (not a fix).** `StatusHudLayer` is constructed at line 787–800 (when `getRenderMode() === 'glyph'`) and starts its 30-second heartbeat immediately in its constructor. Its `_renderNow()` calls `bridge.textContainerUpgrade` targeting `status-hud` (id=6), which does exist in the glyph schema. So the HUD text is rendered — but this is a side-effect of a running but un-mounted layer, not a correctly wired canvas-to-glyph fallback.

**D-25.3 contract violated.** The requirement states "glyph fallback byte-identica pre-v0.10.0" with the implication that glyph mode is a fully functional degraded mode. Pre-Phase-20, glyph mode mounted `StatusHudLayer` (providing a functioning text HUD) and `MapBaseLayer` (providing `map-capture` as the real capture container), giving working R1 routing. The current code does neither in the mounted z-stack.

**Fix:** Gate the step-12 mount on `effectiveVerdict`:

```typescript
// Step 12: mount the correct HUD layer for the effective render mode.
if (layerManager.getRenderMode() === 'canvas') {
  // Canvas mode: CanvasStatusHudLayer provides 'hud-capture' + isCanvasLayer composite path.
  await layerManager.bundle([
    { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: canvasStatusHud },
  ]);
} else {
  // Glyph mode (BLE-degraded or persisted override): StatusHudLayer writes to id=6 (status-hud),
  // MapBaseLayer provides 'map-capture' as the capture container for R1 routing.
  await layerManager.bundle([
    { type: 'mount', z: ZIndex.Z0_MAP_BASE, layer: mapBase },
    { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: statusHud! },
    { type: 'mount', z: ZIndex.Z0_5_IDLE_INFILL, layer: idleInfill },
  ]);
}
```

Note: `statusHud` is guaranteed non-null when `getRenderMode() === 'glyph'` (constructed at lines 787–800 under that same condition). The exact mount composition for glyph mode may differ from the above (pre-Phase-20 history should be cross-checked), but the minimum requirement is that `MapBaseLayer` (or another layer with a real capture container present in the glyph schema) is mounted, and an `OverlayPanel`-compatible layer handles gestures.

---

## Warnings

### WR-01: Stale `@see` comment — "the PoC source file is scheduled for deletion in Plan 03" (INV-4)

**File:** `packages/g2-app/src/hud/push-hud-tiles.ts:5-6`

**Issue:** The module header comment reads:

```
* canonical production home for `pushHudTiles` — the PoC source file
* is scheduled for deletion in Plan 03.
```

Plan 25-03 (referred to here as "Plan 03") was the wave that deleted the PoC triad (`boot-hud-raster-poc.ts`, `hud-poc-page.ts`, `hud-live-render.ts`). That plan has already executed — the PoC files are gone. The comment now describes a future action that already happened, making it misleading and a direct INV-4 violation ("zero dead/unreachable code tolerated" extends to stale planning references in production code).

**Fix:** Replace the forward-looking comment with a past-tense note or remove it entirely:

```typescript
 * canonical production home for `pushHudTiles`, extracted from the deleted PoC module
 * `hud/hud-poc-page.ts` per D-25.1 (Plan 25-01).
```

---

### WR-02: Dead `undefined` guard in `buildHudTiles` — unreachable `continue` violates INV-4

**File:** `packages/g2-app/src/hud/hud-raster-frame.ts:282-285`

**Issue:** `buildHudTiles` loops over `TILES_PER_FRAME = 4` indices and checks:

```typescript
const tileBuf = tileBuffers[i];
if (tileBuf === undefined) {
  continue;
}
```

`tileBuffers` is produced by `splitIntoTiles`, which unconditionally pushes exactly `TILES_PER_FRAME` (`4`) elements with no conditional branches. Because the function always fills four entries, `tileBuffers[i]` is never `undefined` for `i ∈ [0, 3]`. The `continue` guard is unreachable dead code, violating INV-4.

More critically, `HudDeltaDriver._runCycle()` relies on `buildHudTiles` returning exactly `TILE_COUNT = 4` tiles, using `tiles[i]!` non-null assertions keyed on `i < TILE_COUNT` (lines 306, 310). If the `continue` guard ever fired (e.g., after a refactor of `splitIntoTiles`), it would silently return fewer than 4 tiles, and `_runCycle` would access `tiles[i]!` on an out-of-bounds index, producing `undefined` cast to non-null — an incorrect hash comparison that silently misses tile pushes (D-24.3 zero-push-on-idle would incorrectly fire for live tiles).

**Fix:** Remove the unreachable guard and assert the length contract explicitly:

```typescript
for (let i = 0; i < TILES_PER_FRAME; i++) {
  // biome-ignore lint/style/noNonNullAssertion: splitIntoTiles contract — always TILES_PER_FRAME entries
  const tileBuf = tileBuffers[i]!;
  const dithered = ditherTile(tileBuf, palette);
  // ...
}
```

This aligns with the `noUncheckedIndexedAccess` pattern used in `hud-delta-driver.ts` (same non-null + biome-ignore pattern).

---

## Info

### IN-01: `hud-raster-frame.ts` module doc still refers to behavior as "the PoC" (stale prose, INV-4)

**File:** `packages/g2-app/src/hud/hud-raster-frame.ts:29-30`

**Issue:** The "Reuse from raster-worker.ts" section in the module header says:

```
* No xxhash/delta/RLE — the PoC encodes all 4 tiles unconditionally (single
* frame, no delta). Follow-up per ADR-0013 §Scope.
```

With the PoC deleted, "the PoC" no longer refers to any existing entity. The sentence should describe what `buildHudTiles` itself does. The "Follow-up per ADR-0013 §Scope" clause is also moot since `HudDeltaDriver` (Phase 24) already handles delta/xxhash — the follow-up was completed.

**Fix:** Update to describe the current production function:

```
* No xxhash/delta/RLE — `buildHudTiles` encodes all 4 tiles unconditionally
* (per-call, no delta state). Delta loop is owned by `HudDeltaDriver` (ADR-0013 Amendment 1).
```

---

### IN-02: `push-hud-tiles.ts` module-level `@see` plan number is ambiguous ("Plan 03" vs "Plan 25-03")

**File:** `packages/g2-app/src/hud/push-hud-tiles.ts:4`

**Issue:** The `@see` tag and body text reference "Plan 25-01" in one place (correct) and "Plan 03" in another (ambiguous — a reader cannot tell whether this means EVF-03 or EVF-25-03 without context). The consistent form used in all other `@see` tags in this codebase is the full path (e.g., `.planning/phases/EVF-25-.../25-01-PLAN.md`). This is minor but creates ambiguity when navigating the planning artifact chain.

**Fix:** Use the full plan reference `Plan 25-03` (or delete the now-executed reference per WR-01 fix above).

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
