---
phase: EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline
fixed_at: 2026-06-06T11:21:00Z
review_path: .planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-06-06T11:21:00Z
**Source review:** `.planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04, WR-05)
- Fixed: 8
- Skipped: 0

**Test results after all fixes:**
- `pnpm --filter @evf/g2-app exec tsc --noEmit` — exit 0 (clean)
- `pnpm test -- --run` — 235 files, 3180 tests, all passing

**Lint note:** `pnpm lint:ci` reports 1 error (315 warnings). The error is in
`packages/foundry-mcp/src/__tests__/mcp-inspector-smoke.test.ts:44` (string
concatenation, `lint/style/useTemplate`) — a pre-existing issue in a bridge/mcp file,
not in any modified file. All modifications are scoped to `packages/g2-app/`.

---

## Fixed Issues

### CR-01: No render loop — HUD is a static single frame after boot

**Files modified:** `packages/g2-app/src/engine/layer-manager.ts`
**Commit:** `d49e431`
**Applied fix:** Implemented a minimal event-driven recomposite driver on `LayerManager`.
Added `_wsEvents` optional constructor arg (4th param), `_deltaRecompositeUnsub` field,
`_startDeltaRecomposite()` private method, and `disposeSubscriptions()` public method.

`_startDeltaRecomposite()` subscribes to `'character.delta'` on the wsEvents bus; when
any mounted `CanvasLayer` reports `isDirty()=true` it calls `void this._compositeAndPush()`.
The subscription is started from `_flushPage()` after the initial canvas flush, and
released via `disposeSubscriptions()` during engine teardown.

This is NOT a free-running setInterval/RAF — pushes are data-change-driven.
`// TODO(ADR-0013)` comment added: Phase 24 replaces this with the ~5fps xxhash sub-tile
delta loop described in Specs.md §7.4b.6.1.

In `boot-engine-core.ts` the `LayerManager` is constructed as:
`new LayerManager(bridge, debugMirror, compositor, wsEventBus)`
and teardown calls `layerManager.disposeSubscriptions()`.

**Status:** fixed: requires human verification (logic)

### CR-02: Dirty signal architecturally disconnected from compositor

**Files modified:** `packages/g2-app/src/engine/canvas-compositor.ts`
**Commit:** `7072cd8`
**Applied fix:** Removed the redundant `isDirty: boolean` field from `LayerEntry` interface
and its initialization in `registerLayer()`. The `composite()` loop now calls
`entry.layer.isDirty()` directly (the layer's own live flag) instead of reading a stale
copy. `markDirty()` is retained as a documented no-op for interface/compile compatibility
but has no effect — all dirtiness is owned by the layer instance.

**Status:** fixed

### CR-03: Glyph StatusHudLayer constructed in canvas mode, fires heartbeat against missing container

**Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts`
**Commit:** `e2fe90a`
**Applied fix:** `StatusHudLayer` is now only constructed when `renderMode === 'glyph'`:
```ts
const statusHud = layerManager.getRenderMode() === 'glyph'
  ? new StatusHudLayer({ ... })
  : null;
```
All call sites use optional chaining (`statusHud?.setSyncLost(...)`,
`statusHud?.rebindWsEvents(...)`, `statusHud?.getCachedSnapshot() ?? null`). Teardown
guards with `if (statusHud !== null) { statusHud.destroy(); }`. The 30-second heartbeat
that was firing against non-existent container id=6 in canvas mode is now eliminated.

**Status:** fixed

### WR-01: No fillStyle/strokeStyle set — canvas HUD renders invisible

**Files modified:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`
**Commit:** `d8ce5a3`
**Applied fix:** Added `CHROME_BG = '#000000'` and `CHROME_FG = '#ffffff'` color constants.
`_drawChrome` now:
1. `ctx.fillStyle = CHROME_BG; ctx.fillRect(...)` — black background fill
2. `ctx.strokeStyle = CHROME_FG; ctx.strokeRect(...)` — white border stroke
3. `ctx.fillStyle = CHROME_FG; ctx.fillRect(...)` — white separator line
`_drawDynamic` sets `ctx.fillStyle = CHROME_FG` before `ctx.font = fontFamily`.

Color convention matches `hud-canvas-renderer.ts` (`#000` bg + `#fff` fg). The G2's
phosphor green appearance is a hardware/pipeline characteristic of the 4-bit greyscale
dither stage, not an RGBA color value.

**Status:** fixed

### WR-02: ctx.clearRect missing — stale pixels survive between composites

**Files modified:** `packages/g2-app/src/engine/canvas-compositor.ts`
**Commit:** `7072cd8`
**Applied fix:** Added `ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H)` at the top of
the blit loop in `composite()`, before iterating the sorted layer entries. Stale pixels
from a previous frame no longer bleed through when no layer is dirty on a given composite
call.

**Status:** fixed

### WR-03: Dead ctx.font assignment at end of _drawChrome

**Files modified:** `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`
**Commit:** `d8ce5a3`
**Applied fix:** Renamed the `fontFamily` parameter to `_fontFamily` (leading underscore
signals intentionally unused per project convention) and removed the dead trailing
`ctx.font = fontFamily` line. Added `// TODO(ADR-0013): Phase 21 — draw section labels
in chrome using fontFamily.` to document the future intent.

**Status:** fixed

### WR-04: Magic literals 400/200 used instead of COMPOSITOR_W/COMPOSITOR_H

**Files modified:** `packages/g2-app/src/engine/layer-manager.ts`
**Commit:** `d49e431`
**Applied fix:** Added `COMPOSITOR_W` and `COMPOSITOR_H` to the import from
`'./canvas-compositor.js'`. Replaced all three hardcoded `400`/`200` occurrences in
`_createLayerCanvas()` with the imported constants.

**Status:** fixed

### WR-05: Stale JSDoc in boot-engine-core.ts

**Files modified:** `packages/g2-app/src/internal/boot-engine-core.ts`
**Commit:** `e2fe90a`
**Applied fix:** Fixed 3 stale comments:
1. Step 9 header: `attachQuickActionLongPress` → `attachQuickActionOverscroll` (GEST-01
   drift fix; long-press was retired by ADR-0012)
2. Step 12 header: Updated to accurately describe canvas-mode single-layer flush
   (`await lm.bundle([mount z=1 CanvasStatusHudLayer]) — canvas mode: single layer flush`)
3. Inline comment below canvas bundle: now reads `// mapBase and glyph layers are
   constructed but NOT mounted in canvas mode; destroyed in teardown`

**Status:** fixed

---

## Skipped Issues

None — all 8 in-scope findings were successfully fixed.

---

## Info Findings (out of scope)

The following Info findings were intentionally deferred per the fix directive
("address only if trivial, otherwise leave for later"):

- **IN-01:** `vt323-font-loader.ts` — font loader is fire-and-forget with no error
  surfacing; structural suggestion for Phase 21 polish. Not trivial. Deferred.
- **IN-02:** `inv-suite.ts` — INV-1 snapshot test does not cover canvas mode (layout
  still exercised via snapshot). Not trivial; requires canvas snapshot infrastructure.
  Deferred to Phase 21 validation scope.

---

_Fixed: 2026-06-06T11:21:00Z_
_Fixer: Claude Sonnet 4.6 (gsd-code-fixer)_
_Iteration: 1_
