---
phase: EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
reviewed: 2026-06-06T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - packages/g2-app/src/status-hud/vt323-font-loader.ts
  - packages/g2-app/src/status-hud/canvas-status-hud-layer.ts
  - packages/g2-app/src/engine/layer-types.ts
  - packages/g2-app/src/engine/canvas-compositor.ts
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
  - packages/validation-harness/src/inv-suite.ts
findings:
  critical: 3
  warning: 5
  info: 2
  total: 10
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-06-06
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 20 introduces the canvas Status HUD path: `CanvasStatusHudLayer` driven by VT323 font, `CanvasCompositor`, async `attachCanvas`, and the canvas boot flip in `boot-engine-core.ts`. The glyph-side plumbing (dirty flag, `safeParse` gate, font fallback, `attachCanvas` await) is structurally sound. However, three blockers mean **the canvas HUD is currently a static single-frame display that never updates at runtime**:

1. There is no render loop — `_compositeAndPush` is only called once (at `bundle()`), never again when character data changes.
2. The dirty signal is architecturally disconnected — `CanvasStatusHudLayer._dirty` transitions are never propagated to `CanvasCompositor.entry.isDirty`, so the compositor never calls `paint()` after the initial frame regardless of how many `character.delta` events arrive.
3. The glyph `StatusHudLayer` is constructed but not mounted in canvas mode; its 30-second heartbeat fires `bridge.textContainerUpgrade` writes against container id=6, which does not exist in the canvas page schema, producing silent failures every 30 seconds.

Additionally, the entire canvas HUD renders invisibly because no `fillStyle`/`strokeStyle` is ever set — all drawing calls use default black on a transparent background.

---

## Critical Issues

### CR-01: No render loop — HUD is a static single frame after boot

**File:** `packages/g2-app/src/engine/layer-manager.ts:384` / `packages/g2-app/src/engine/layer-manager.ts:665`
**Issue:** `_compositeAndPush()` is called exactly once — from `_flushPage()`, which is called from `bundle()`. After the initial boot bundle no further composite-and-push is ever triggered. `character.delta` events set `CanvasStatusHudLayer._dirty = true` via `_onDelta`, but nothing re-invokes `_compositeAndPush`. The HUD is therefore frozen at whatever state existed when the boot bundle ran, and never reflects subsequent HP/AC/Level changes.

There is no `setInterval`, no `requestAnimationFrame`, no reactive trigger that calls `_compositeAndPush` or `composite()` when any registered `CanvasLayer` transitions to dirty. The `CanvasLayer.isDirty()` method exists on the interface and is implemented by `CanvasStatusHudLayer`, but is never read in any production code path (`grep -rn "isDirty()" src/` returns zero production-code hits).

**Fix:** A canvas render loop must be added. The minimal correct approach is a `setInterval`/`requestAnimationFrame`-based loop in `LayerManager` (or a dedicated `CanvasRenderLoop` helper) that polls `[...this._layers.values()].some(l => isCanvasLayer(l) && l.isDirty())`, and when true, calls `_compositeAndPush()`. Alternatively, have `CanvasStatusHudLayer._onDelta` notify the compositor directly via `this._notifyDirty?.()` callback injected at `attachCanvas` time, then have the compositor trigger `_compositeAndPush` through a back-reference to `LayerManager`. The 5 fps target from `Specs.md §7.4b` requires a paced loop, not an unbounded event-driven push, so the interval approach is architecturally correct.

```ts
// Minimal interval-based loop in LayerManager (canvas mode only):
private _canvasFrameTimer: ReturnType<typeof setInterval> | null = null;

private _startCanvasLoop(): void {
  if (this._canvasFrameTimer !== null) return;
  this._canvasFrameTimer = setInterval(() => {
    const anyDirty = [...this.layers.values()].some(
      (l) => isCanvasLayer(l) && l.isDirty(),
    );
    if (anyDirty && this.compositor !== null) {
      void this._compositeAndPush();
    }
  }, 200); // 5 fps
}

private _stopCanvasLoop(): void {
  if (this._canvasFrameTimer !== null) {
    clearInterval(this._canvasFrameTimer);
    this._canvasFrameTimer = null;
  }
}
```
Call `_startCanvasLoop()` at the end of `bundle()` when `renderMode === 'canvas'`, and `_stopCanvasLoop()` in a new `destroy()` method.

---

### CR-02: Dirty signal architecturally disconnected — compositor never re-paints after first frame

**File:** `packages/g2-app/src/engine/canvas-compositor.ts:155,188-190` / `packages/g2-app/src/engine/layer-manager.ts:359`
**Issue:** `CanvasCompositor` tracks dirtiness in its own `LayerEntry.isDirty` field (not in `CanvasLayer.isDirty()`). `LayerEntry.isDirty` is set to `true` only via `registerLayer()` (once at mount) or `markDirty(z)` (never called in production). After the first `composite()` call, `entry.isDirty` is set to `false` and stays false forever.

`CanvasStatusHudLayer._dirty` and `compositor.entry.isDirty` are two completely separate boolean fields with no bridge between them. `markDirty()` exists on the `CanvasCompositorLike` interface and is tested, but is never called by `LayerManager` or by any dirty-state transition in `CanvasStatusHudLayer`. The result: after the first frame, `composite()` calls `drawImage(entry.canvas, …)` without ever calling `entry.layer.paint()` again — the layer canvas is stale.

This is distinct from CR-01 (which is the absence of a trigger to call `composite()` at all). Even if a render loop were added, it would call `composite()` but still never re-invoke `paint()` because `entry.isDirty` stays false.

**Fix:** `CanvasCompositor.composite()` must consult `layer.isDirty()` for the paint decision, not `entry.isDirty`. Replace the `entry.isDirty` tracking field with a direct delegation to the layer's own dirty flag:

```ts
// In composite():
for (const [, entry] of sorted) {
  if (entry.layer.isDirty()) {       // delegate to layer's own flag
    entry.layer.paint();             // paint() resets _dirty=false as its last line
  }
  ctx.drawImage(entry.canvas, 0, 0);
}
```

The `LayerEntry.isDirty` field and the `markDirty()` API become redundant and should be removed to avoid future confusion about which dirty flag is authoritative.

---

### CR-03: Glyph `StatusHudLayer` heartbeat fires bridge writes to non-existent container in canvas mode

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:747-759` / `packages/g2-app/src/status-hud/status-hud-layer.ts:217-219`
**Issue:** `StatusHudLayer` starts a 30-second `setInterval` heartbeat in its constructor (`status-hud-layer.ts:217`). The heartbeat fires `void this._renderNow()`, which calls `bridge.textContainerUpgrade` targeting the `'status-hud'` container (id=6). In canvas mode, `buildHudRasterPageSchema()` creates only 4 image tiles (`hud-tile-0..3`) + 1 text capture (`hud-capture`) — container id=6 does not exist. The bridge likely rejects the upgrade call. Because the heartbeat uses `void this._renderNow()` with no `.catch()`, the rejection is silently swallowed by the `void` operator with no log, no error, and no observable side effect.

This is not a crash, but it produces a background error storm (every 30 seconds for the lifetime of the engine) and it means the `StatusHudLayer` glyph instance is actively running in a half-alive state — its WS subscription processes `character.delta` events and its heartbeat fires — while the canvas layer is supposed to be the sole HUD renderer.

**Fix:** Either (a) stop the heartbeat for unmounted layers by calling `clearInterval` when the layer is not mounted (requires awareness of mount state, which `StatusHudLayer` currently lacks), or (b) defer `StatusHudLayer` construction to the point where it is actually needed (i.e., when `renderMode='glyph'` is active), or most simply (c) do not construct `StatusHudLayer` at all in canvas mode boot:

```ts
// In _bootEngineCore, step 10 — wrap glyph-only construction:
const statusHud = this.renderMode === 'glyph'
  ? new StatusHudLayer({ bridge, renderer: ..., wsEvents: wsEventBus })
  : null;
// (null-guard all subsequent statusHud references)
```

This also eliminates the `statusHud.rebindWsEvents` call in `onReconnected` when in canvas mode.

---

## Warnings

### WR-01: Canvas draws are invisible — no fillStyle/strokeStyle set anywhere

**File:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts:390-401,418-434`
**Issue:** Neither `_drawChrome` nor `_drawDynamic` sets `ctx.fillStyle` or `ctx.strokeStyle` before drawing. The default canvas fill color is `'#000000'` (opaque black) and stroke color is `'#000000'`. The layer canvas is created by `LayerManager._createLayerCanvas()` with a transparent default background.

The effect on G2: black text on a transparent layer, composited by the master compositor with `drawImage`. Since the compositor master canvas also starts transparent and there is no background layer, the output is black text on a transparent background — likely invisible or near-invisible on the greyscale phosphor display.

The class docstring says "phosphor green on black (VFD / CRT aesthetic)" but the implementation never sets any color. The INV-1 raster fixture test (RINV-01) will lock in these invisible pixels unless the test was built against intentional all-black/transparent output.

**Fix:** Set explicit colors before drawing. Minimum for INV-1 correctness:

```ts
function _drawChrome(ctx, fontFamily): void {
  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  // Phosphor green border + separator
  ctx.strokeStyle = '#00FF41'; // phosphor green
  ctx.fillStyle = '#00FF41';
  ctx.strokeRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  const TAB_H = 24;
  ctx.fillRect(0, TAB_H, COMPOSITOR_W, 1);
  ctx.font = fontFamily;
}
// And in _drawDynamic:
ctx.fillStyle = '#00FF41';
ctx.font = fontFamily;
// ...fillText calls...
```

---

### WR-02: `CanvasCompositor.composite()` never clears the master canvas before blitting

**File:** `packages/g2-app/src/engine/canvas-compositor.ts:185-197`
**Issue:** `composite()` iterates layers and calls `drawImage(entry.canvas, 0, 0)` on the master context with no preceding `clearRect`. On the first call this is fine. If a layer is deregistered (via `deregisterLayer(z)`), its pixels remain on the master canvas from the previous frame because no clear is performed. Any subsequent `composite()` call blits new layers on top of the stale pixels, producing ghost artifacts from the removed layer.

In Phase 20 only one layer is ever mounted so the current single-frame output is not affected, but this is a correctness contract violation: the `CanvasCompositorLike` API document states that `deregisterLayer(z)` means "the layer is never painted or blitted after this call." The stale-pixel problem directly violates this guarantee.

**Fix:** Add a single `ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H)` at the top of `composite()`, before the sorted layer loop:

```ts
composite(): Uint8ClampedArray {
  const ctx = this._masterCtx;
  if (ctx === null) { /* ... existing null-guard ... */ }
  ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H); // clear before compositing
  const sorted = [...this._layers.entries()].sort(([a], [b]) => a - b);
  // ...rest unchanged...
}
```

---

### WR-03: `_drawChrome` sets `ctx.font` as a dead no-op (draws no text)

**File:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts:400`
**Issue:** The last statement of `_drawChrome` is `ctx.font = fontFamily;`. No text drawing call follows in `_drawChrome` — the font assignment mutates the context state and is immediately discarded when `_drawDynamic` reassigns `ctx.font = fontFamily` at its first line. This is dead state assignment (INV-4: zero dead/unreachable code tolerated).

Biome's analysis may not catch a property-mutation no-op (it's not a variable, so `noUnusedLocals` does not apply), but the project invariant is clear.

**Fix:** Remove the trailing `ctx.font = fontFamily;` from `_drawChrome`. If chrome label text is intended for future phases, add a `// TODO(ADR-NNNN)` placeholder comment instead of a live ctx mutation:

```ts
function _drawChrome(ctx, fontFamily): void {
  ctx.strokeRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
  const TAB_H = 24;
  ctx.fillRect(0, TAB_H, COMPOSITOR_W, 1);
  // Phase 21: chrome section labels drawn here using fontFamily
}
```

---

### WR-04: `LayerManager._createLayerCanvas()` uses hardcoded `400, 200` instead of `COMPOSITOR_W / COMPOSITOR_H`

**File:** `packages/g2-app/src/engine/layer-manager.ts:688,692-693,701`
**Issue:** `_createLayerCanvas()` hardcodes `400` and `200` three times. `COMPOSITOR_W` and `COMPOSITOR_H` are exported constants from `canvas-compositor.ts` and are the canonical source of those values. If the compositor geometry is ever changed (e.g. during Phase 21 geometry adjustments), `_createLayerCanvas` will silently create under/over-sized canvases that produce incorrect blit results.

**Fix:** Import and use the constants:

```ts
import { COMPOSITOR_W, COMPOSITOR_H } from './canvas-compositor.js';

private static _createLayerCanvas(): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(COMPOSITOR_W, COMPOSITOR_H);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = COMPOSITOR_W;
    canvas.height = COMPOSITOR_H;
    return canvas;
  }
  return {
    width: COMPOSITOR_W, height: COMPOSITOR_H, getContext: () => null,
  } as unknown as HTMLCanvasElement;
}
```

---

### WR-05: Stale JSDoc boot-sequence comment misrepresents canvas-mode bundle composition and step 13

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:46,40,1407`
**Issue:** Three stale assertions in load-bearing documentation comments:

1. **Line 46:** `* 12. await lm.bundle([mount z=0, mount z=0.5, mount z=1, mount z=1.5])` — the actual `bundle()` call at line 1320 mounts only `canvasStatusHud` at `z=1`. The other three layers are explicitly NOT mounted in canvas mode (documented in the adjacent block comment at lines 1296-1319).

2. **Line 40:** `* 11c. … + attachQuickActionLongPress(bus, router, lm, makeMenu)` — `attachQuickActionLongPress` was retired per ADR-0012. The actual call (line 891) is `attachQuickActionOverscroll`. This name persists in the module-level JSDoc, giving the wrong function name to anyone reading the sequence.

3. **Line 1407:** `// and mapBase are mounted in lm.bundle (step 12) and destroyed in teardown` — `mapBase` is NOT mounted in canvas mode; it is only constructed and destroyed in teardown. This comment is factually wrong and could mislead future readers about which layers are active.

These are documentation correctness issues. Per INV-3, architectural documentation drift must be corrected in the same commit as code changes.

**Fix:** Update lines 46, 40, and 1407:

- Line 46: `* 12. await lm.bundle([mount z=1 CanvasStatusHudLayer]) — canvas mode: single layer flush`
- Line 40: `* 11c. new LocaleEventEmitter() + makeMenu factory + attachQuickActionOverscroll(bus, router, lm, makeMenu)`
- Line 1407: `// mapBase and glyph layers are constructed but NOT mounted in canvas mode; destroyed in teardown`

---

## Info

### IN-01: `TODO(HUD-27PX)` uses literal placeholder `(#issue)` instead of a real issue number — INV-4 violation

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:1401`
**Issue:** `// TODO(HUD-27PX): re-call finalizeIdleRender when map mode is gesture-opened (#issue)` — per CLAUDE.md INV-4: "// TODO requires `(#issue)` or `(ADR-NNNN)`." The `(#issue)` text is a literal placeholder, not a GitHub issue number. `(HUD-27PX)` is a milestone tag, not an issue reference. The CI gate that enforces this rule will flag it if it is scanning for the pattern.

**Fix:** Replace `(#issue)` with a real GitHub issue number or an ADR reference before merge, e.g.:
```ts
// TODO(#NNN): re-call finalizeIdleRender when map mode is gesture-opened
```

---

### IN-02: `checkInv1Glyph` in `inv-suite.ts` lacks the FALSE-PASS guard present in `checkInv1Raster` and `checkInv5`

**File:** `packages/validation-harness/src/inv-suite.ts:115-131`
**Issue:** `checkInv1Raster` (line 167-176) and `checkInv5` (line 463-469) both apply the FALSE-PASS guard: if vitest exits 0 but stdout/stderr matches `no test files found|no tests found|\b0 tests\b`, the result is `'skipped'` instead of `'green'`. `checkInv1Glyph` runs `pnpm --filter @evf/shared-render test -- --run` without a `--testNamePattern` filter, and also lacks this guard. If `@evf/shared-render` ever loses all its tests (e.g. a test file is accidentally moved), vitest exits 0, the guard is absent, and `checkInv1Glyph` reports `'green'` when it has proven nothing.

**Fix:** Add the FALSE-PASS guard consistently to `checkInv1Glyph`:

```ts
const combined = `${stdout}\n${stderr}`;
if (exitCode === 0 && /no test files found|no tests found|\b0 tests\b/i.test(combined)) {
  return {
    id: 'INV-1',
    status: 'skipped',
    detail: 'glyph suite: no tests found — skipped (not green); exit 0 proves nothing',
  };
}
```

---

_Reviewed: 2026-06-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
