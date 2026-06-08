---
phase: EVF-24-delta-loop-5fps-xxhash
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - packages/g2-app/src/engine/hud-delta-driver.ts
  - packages/g2-app/src/engine/layer-manager.ts
  - packages/g2-app/src/internal/boot-engine-core.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase EVF-24: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 24 introduces `HudDeltaDriver`, a debounced per-tile xxhash delta driver wired into `LayerManager._flushPage()` and torn down via `LayerManager.disposeSubscriptions()`. The implementation is broadly sound: the WASM singleton pattern is correct, the serialized push via `pushHudTiles` (`for...of` + `await`) is preserved, and the debounce collapse logic is correct. However, two BLOCKERs were identified:

1. `start()` has no idempotency guard — calling it a second time (which `_flushPage` does on every `bundle()` call) accumulates duplicate WS subscriptions that are never released.
2. `runFirstFrame()` and `start()` are called in the wrong order inside `_flushPage()`: the subscriptions are wired AFTER the first frame is pushed, creating a window where an inbound delta event during the first-frame push is silently dropped because no timer is scheduled yet. The correct order is `start()` first (subscribe), then `runFirstFrame()` (seed hashes).

Three warnings round out the findings.

---

## Critical Issues

### CR-01: `start()` accumulates duplicate WS subscriptions on every `bundle()` call

**File:** `packages/g2-app/src/engine/hud-delta-driver.ts:173`
**Issue:** `start()` contains no guard against being called more than once. In `LayerManager._flushPage()` (line 673-674, `layer-manager.ts`), `runFirstFrame()` is awaited and then `start()` is awaited on every `bundle()` call that reaches the canvas branch. Every `bundle()` in the lifetime of the engine — including panel open/close bundles that happen post-boot — will re-enter the canvas branch and call `start()` again. Each call to `start()` iterates the three `DELTA_CHANNELS` and pushes three new unsub closures into `_unsubs`, leaving the previous three dangling (never released) and producing three additional live subscribers on each channel. After N bundles there are 3N active subscribers, each scheduling a separate debounce cycle on every incoming delta envelope. The `stop()` call during teardown only drains `_unsubs` of the N-th batch (the ones pushed last — wait, actually it drains ALL accumulated unsubs because `_unsubs` is a flat array and `_unsubs.length = 0` clears the whole array, so the closures for earlier batches are still live in the WS event bus `subscribers` Sets and can never be reached again). The earlier batches are leaked into the `Set` inside `createWsEventBus` and will fire until the WebSocket closes.

Concretely: every `pushOverlay` / `popOverlay` / `bundle()` call that triggers `_flushPage()` in canvas mode adds 3 more permanent subscribers to the bus.

**Fix:** Add a guard in `start()` that no-ops if subscriptions are already active:

```ts
async start(): Promise<void> {
  if (this._xxhash === null) {
    this._xxhash = await xxhash();
  }

  // Idempotency guard — re-entrant calls (e.g. bundle() called post-boot)
  // must not accumulate duplicate subscriptions.
  if (this._unsubs.length > 0) {
    return;
  }

  const schedule = (): void => { this._schedule(); };
  for (const ch of DELTA_CHANNELS) {
    const unsub = this._opts.wsEvents.subscribe(ch, schedule);
    this._unsubs.push(unsub);
  }
}
```

Alternatively (and more robustly), `_flushPage()` should call `start()` only once at true first-render and not on subsequent `bundle()` calls. That would require a `_started` flag on `HudDeltaDriver` to gate `LayerManager._flushPage()`.

---

### CR-02: `runFirstFrame()` called before `start()` in `_flushPage()` — inbound delta during first push is silently dropped

**File:** `packages/g2-app/src/engine/layer-manager.ts:673`
**Issue:** Inside `_flushPage()` (canvas branch, line 669-674), the call order is:

```ts
await this._deltaDriver.runFirstFrame();  // line 673
await this._deltaDriver.start();          // line 674
```

`runFirstFrame()` is synchronous from the bus's perspective — it calls `compositor.composite()` and `pushHudTiles()`. During that `await pushHudTiles(...)`, the WS event loop can dispatch inbound messages. If a `character.delta` (or `combat.turn` / `combat.state`) arrives while `runFirstFrame()` is awaited, no subscriptions exist yet (`_unsubs` is empty, no `_schedule()` can fire) and the event is consumed from the bus cache but no re-render cycle is scheduled. The driver starts with stale hashes for the changed data.

The JSDoc on `HudDeltaDriver` (lines 107-110) also documents the intended order as `start()` first, `runFirstFrame()` second — the implementation contradicts its own contract.

Additionally, the `wsEventBus` performs last-value-replay synchronously on `subscribe()` (boot-engine-core.ts line 430-432). If a `character.delta` was cached before `start()` is called, subscribing fires `schedule()` synchronously during `start()`. The debounce timer would then fire 100ms later and call `_runCycle()`, which may race with `runFirstFrame()` if `runFirstFrame()` is still in progress. The correct ordering `start()` → `runFirstFrame()` eliminates this race because `runFirstFrame()` seeds the hashes after the synchronous replay timer is scheduled.

**Fix:** Swap the call order in `_flushPage()`:

```ts
// In LayerManager._flushPage(), canvas + driver branch:
await this._deltaDriver.start();          // subscribe first (wires debounce + replay)
await this._deltaDriver.runFirstFrame();  // seed hashes unconditionally after subscriptions live
```

This matches the documented lifecycle (lines 107-110 in `hud-delta-driver.ts`).

---

## Warnings

### WR-01: `_runCycle()` async rejection is silently swallowed via `void` — no error visibility

**File:** `packages/g2-app/src/engine/hud-delta-driver.ts:254`
**Issue:** The debounce timer callback uses `void this._runCycle()`:

```ts
this._timer = setTimeout(() => {
  this._timer = null;
  void this._runCycle();   // line 254-255
}, this._opts.minRedrawIntervalMs);
```

If `_runCycle()` rejects (e.g. `compositor.composite()` throws, `buildHudTiles` throws on wrong buffer length, or `pushHudTiles` propagates an unexpected error), the rejection is unconditionally suppressed with no log, no recovery, and no indication that the render loop has silently stopped. The project's INV-4 and Biome strict rules (biome.jsonc `noVoidOperator` or `useAwait` equivalents) may already flag this — but even if they do not, the result is invisible render-loop death.

**Fix:** Wrap `_runCycle()` with a rejection guard:

```ts
this._timer = setTimeout(() => {
  this._timer = null;
  this._runCycle().catch((err) => {
    console.warn('[EVF] HudDeltaDriver._runCycle error:', err);
  });
}, this._opts.minRedrawIntervalMs);
```

---

### WR-02: Hash comparison uses `_prevHashes[i] ?? 0` but writes the new hash unconditionally — `prevHashes` slot can silently remain `0` when `tiles[i]` is `undefined` after first frame

**File:** `packages/g2-app/src/engine/hud-delta-driver.ts:284-295`
**Issue:** The `_runCycle()` loop iterates `i` from 0 to `TILE_COUNT - 1`. When `tiles[i]` is `undefined` (e.g., `buildHudTiles` returns fewer than 4 tiles due to a pipeline error), the `continue` skips the hash update for slot `i`. That slot stays at `prevHashes[i] = 0`. On the NEXT cycle, if `buildHudTiles` again returns `undefined` at `i`, the comparison `h !== (0 ?? 0)` is skipped again — that is fine. But if the NEXT cycle successfully produces a tile at `i` with hash `h !== 0`, the slot fires a push correctly.

The real problem is in `runFirstFrame()` (lines 216-220). If `tiles.length < 4` (a partial result from `buildHudTiles` that exits the inner loop early via `continue`), the baseline hash for missing slots is never seeded from real PNG bytes — they remain `0`. If a subsequent `_runCycle()` produces a tile for that slot with hash `0` (astronomically unlikely but theoretically possible for a flat-black tile), the comparison `0 !== 0` is false and the tile is not pushed despite the slot being newly available.

More importantly: `buildHudTiles` either returns all 4 tiles or throws (on length mismatch). It never returns a partial array. The `tile === undefined` guards in both `runFirstFrame` and `_runCycle` are therefore unreachable dead code, which violates INV-4 ("zero dead/unreachable code tolerated"). The guards were added for `noUncheckedIndexedAccess` TypeScript compliance, but the comment at line 291 ("Use `?? 0` guard for noUncheckedIndexedAccess compliance") confirms this is purely a type-system appeasement, not a real runtime condition.

**Fix:** The `undefined` guards can be eliminated if the callers trust `buildHudTiles`'s contract. Alternatively, annotate the guards clearly as TypeScript-only (`/* ts-nocheck-access */`) so Biome/INV-4 dead-code scanning does not flag them:

```ts
// buildHudTiles always returns exactly TILE_COUNT tiles or throws — tile cannot
// be undefined at runtime. Guard retained only for noUncheckedIndexedAccess.
const tile = tiles[i];
if (tile === undefined) continue; // unreachable at runtime, TS compile-time only
```

This is a WARNING (dead-code INV-4 violation) not a BLOCKER because the code behaves correctly at runtime given `buildHudTiles`'s throw-on-mismatch contract.

---

### WR-03: `disposeSubscriptions()` is called AFTER `ws.close()` in teardown — pending debounce timer may fire against a closed socket

**File:** `packages/g2-app/src/internal/boot-engine-core.ts:1638-1648`
**Issue:** In the `teardown` closure (lines 1500-1649), `layerManager.disposeSubscriptions()` (which calls `hudDeltaDriver.stop()`) is called at line 1640, AFTER `ws.close()` at line 1645. The correct placement would be before `ws.close()`. However, the bug is subtler: the `WsReconnectController.dispose()` at line 1587 runs before both. `disposeSubscriptions()` is at line 1640, after `rasterController.terminate()` at line 1597 and layer `destroy()` calls (lines 1610-1637), but before `ws.close()` at line 1645. So the actual ordering is:

```
...
perfProbe.dispose()          # line 1579
wsReconnect.dispose()        # line 1587
unsubSceneInput()            # line 1593
rasterController.terminate() # line 1597
canvasStatusHud.destroy()    # line 1611
toastQueue.destroy()         # line 1616
statusHud.destroy()          # line 1623
idleInfill.destroy()         # line 1629
mapBase.destroy()            # line 1634
layerManager.disposeSubscriptions()  # line 1640  ← driver.stop() here
ws.close()                   # line 1645
```

`layerManager.disposeSubscriptions()` IS called before `ws.close()`, so the debounce timer is cancelled before the socket closes. This ordering is actually correct. However, between the `unsubSceneInput()` call at line 1593 and `layerManager.disposeSubscriptions()` at line 1640, the layer `destroy()` calls (lines 1610-1637) may emit log or bridge calls. If a debounce timer fires during any of those awaits, `_runCycle()` calls `compositor.composite()` on a compositor whose layers are being destroyed in parallel (the teardown is synchronous/void-wrapped, but bridge calls inside layer `destroy()` are async). The delta driver is not stopped until after all layer destroys complete.

**Fix:** Move `layerManager.disposeSubscriptions()` to immediately after `perfProbe.dispose()` (before `wsReconnect.dispose()`), so no render cycles can fire during layer teardown:

```ts
// In teardown closure, as early as possible after perfProbe.dispose():
try {
  layerManager.disposeSubscriptions(); // stop debounce + release delta subs
} catch (err) {
  console.warn('[boot-engine-core] teardown: layerManager.disposeSubscriptions failed', err);
}
// Then wsReconnect.dispose(), unsubSceneInput, layer destroys, ws.close...
```

---

## Info

### IN-01: `console.warn` in `_runCycle()` for "xxhash not initialized" uses raw `console.warn` — consistent with project style but flagged for INV-4 audit completeness

**File:** `packages/g2-app/src/engine/hud-delta-driver.ts:276`
**Issue:** `console.warn('[EVF] HudDeltaDriver._runCycle: xxhash not initialized; skipping cycle')` is a bare `console.warn`. The project (CLAUDE.md INV-4) tolerates `console.warn` for telemetry but the comment "Should not happen after start()" confirms this is defensive dead code — it cannot be reached in correct usage because `_runCycle` is only ever called from the `setTimeout` callback in `_schedule()`, which is itself only called from the `subscribe` handler installed in `start()`, which initialises `_xxhash` before wiring any subscriptions. The guard is therefore unreachable dead code that violates INV-4 ("zero dead/unreachable code tolerated").

**Fix:** Remove the guard or restructure so `_runCycle` is a non-null assertion that surfaces loudly if the invariant is broken, rather than a silent skip:

```ts
private async _runCycle(): Promise<void> {
  // _runCycle is only reachable after start() — _xxhash is guaranteed non-null.
  // The non-null assertion surfaces a loud TypeError if the invariant ever breaks.
  const h32Raw = this._xxhash!.h32Raw;
  // ...
}
```

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
