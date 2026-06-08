# Phase 24: Delta Loop ~5fps xxhash — Research

**Researched:** 2026-06-08
**Domain:** g2-app engine — event-driven render loop, xxhash-wasm sub-tile delta, BLE tile serialization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-24.1 — Loop event-driven + debounce configurabile, default 100ms [USER-DECIDED]**
Il render parte SOLO su `character.delta` / `combat.delta` (e `combat.state`/`combat.turn` se applicabile), NON su un tick costante. I delta ravvicinati sono collassati (debounce) in un singolo render cycle. Il debounce è CONFIGURABILE (opzione/costante esposta), default 100ms — sostituisce il valore letterale `MIN_REDRAW_INTERVAL_MS = 200` citato nel success criterion #2 del ROADMAP. Mantenere il nome `MIN_REDRAW_INTERVAL_MS` ma renderlo un default configurabile (es. via opzione del costruttore/driver), default 100.

**D-24.2 — xxhash variant: h32 [USER-DECIDED]**
Hash sub-tile via `xxhash-wasm` h32 (pinned in stack: xxhash-wasm 1.1.0). Sufficiente per 4 tile da 200×100×4 byte.

**D-24.3 — Zero-push-on-idle (success criterion #1)**
In HUD idle (nessun delta) zero tile vengono respinti dopo il primo frame. Con il modello event-driven questo è naturale.

**D-24.4 — TileDelta geometry 200×100 ×4 (success criterion #1)**
Istanza TileDelta parametrizzata con geometria 200×100 per i 4 tile della regione 400×200.

**D-24.5 — Static chrome determinism (success criterion #5)**
Il chrome statico pre-baked via ImageBitmap NON genera mai tile CHANGED tra frame consecutivi senza dati dinamici mutati.

**D-24.6 — Replace naive driver, no regressions (success criterion #4)**
Sostituire il driver delta-recompose naive di Phase 20 con il delta xxhash. Nessuna regressione sui test canvas esistenti (Phases 20–23).

### Claude's Discretion

None specified beyond the locked decisions above.

### Deferred Ideas (OUT OF SCOPE)

- Raster promotion to default boot (Phase 25 scope — `?hud=raster` guard removal + glyph-fallback formalization).
- Additional 6-layer BLE optimizations beyond xxhash sub-tile delta (custom RLE, DLE, adaptive frame rate).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPROMO-01 | La HUD raster è guidata da un loop ~5fps con delta sub-tile xxhash (riusa `RasterController`) + debounce, così solo i tile CHANGED vengono ri-encodati/spediti; HUD idle ≈ banda BLE quasi-zero. | Event-driven debounce (D-24.1), h32Raw hashing per-tile (D-24.2), zero-push-on-idle (D-24.3), 200×100×4 geometry (D-24.4) all documented. Replacement of `_startDeltaRecomposite` + `_compositeAndPush` with a new `HudDeltaDriver` class. |
</phase_requirements>

---

## Summary

Phase 24 replaces the Phase 20 minimal event-driven recomposite driver (`_startDeltaRecomposite` / `_compositeAndPush` inside `LayerManager`) with a dedicated `HudDeltaDriver` class that adds xxhash-wasm h32 per-tile hashing, configurable debounce (default 100ms), and zero-push-on-idle semantics. The driver is initialized once per boot with a single `await xxhash()` WASM init call, subscribes to `character.delta`, `combat.turn`, and `combat.state` channels on the WS event bus, and collapses near-simultaneous deltas into a single render cycle via a `setTimeout`-based debounce. On each render cycle it calls `compositor.composite()` → `buildHudTiles()` → per-tile h32Raw hash comparison → only encode+push changed tiles via `pushHudTiles`. After the first frame, an idle HUD produces zero BLE pushes.

The naive driver to replace consists of exactly two private methods in `LayerManager` (`_startDeltaRecomposite`, `_stopDeltaRecomposite`) plus their `_deltaRecompositeUnsub` field, all explicitly annotated "Phase 20 minimal event-driven driver — Phase 24 replaces this." The new driver lives in a standalone `engine/hud-delta-driver.ts` module, injected into `LayerManager` at construction time (4th/5th arg alongside `wsEvents`), so `LayerManager._flushPage` calls `driver.start()` in canvas mode instead of `_startDeltaRecomposite()`. All existing tests for `LayerManager` are unaffected because the 2/3-arg construction path (no wsEvents, no driver) remains a no-op.

The xxhash-wasm h32Raw API is confirmed: `await xxhash()` returns `XXHashAPI`; `api.h32Raw(Uint8Array): number`. Init is async (WASM compilation) and must happen once before the first frame. The existing `raster-worker.ts` already demonstrates the correct lazy-singleton init pattern: `if (xxhashApi === null) { xxhashApi = await xxhash(); }`. The new HudDeltaDriver must mirror this pattern — call `await xxhash()` in its `start()` or lazy-init on first cycle.

**Primary recommendation:** Create `engine/hud-delta-driver.ts` with a `HudDeltaDriver` class that encapsulates debounce + per-tile h32Raw hash comparison + `pushHudTiles` dispatch. Inject it into `LayerManager` as an optional 5th constructor arg. Remove the two `_startDeltaRecomposite`/`_stopDeltaRecomposite` methods and their field from `LayerManager`. Wire in `boot-engine-core.ts` alongside the existing `wsEventBus`+`compositor` wiring.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WS event subscription (character.delta / combat.turn / combat.state) | Browser / g2-app engine | — | Already in wsEventBus; driver subscribes at `start()` |
| Debounce (collapse near-simultaneous deltas) | Browser / g2-app engine | — | setTimeout-based; entirely client-side |
| Compositor invocation (`compositor.composite()`) | Browser / g2-app engine | — | CanvasCompositor is local to g2-app |
| Per-tile h32Raw hash comparison | Browser / g2-app engine | — | xxhash-wasm runs in main thread; mirrors raster-worker pattern |
| PNG encode + `pushHudTiles` | Browser / g2-app engine | Bridge (BLE consumer) | `buildHudTiles` + `pushHudTiles` in hud-raster-frame / hud-poc-page |
| INV-1 raster hash regression gate | Test / validation-harness | — | 20-raster-inv1.test.ts golden fixture unchanged |

---

## Standard Stack

### Core (already pinned — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xxhash-wasm` | 1.1.0 [VERIFIED: npm registry] | h32Raw per-tile hash | Already in g2-app dependencies; same version used in raster-worker.ts |
| `image-q` | 4.0.0 [VERIFIED: npm registry] | Floyd-Steinberg dither (used by buildHudTiles) | Already in stack; hud-raster-frame.ts imports it |
| `upng-js` | 2.1.0 [VERIFIED: npm registry] | 4-bit indexed PNG encode (used by buildHudTiles) | Already in stack; hud-raster-frame.ts imports it |

**No new package installations.** Phase 24 is a code-only addition consuming already-installed dependencies.

### Package Legitimacy Audit

> No new packages installed in this phase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `xxhash-wasm` | npm | ~8 yrs (2017) | High | github.com/jungomi/xxhash-wasm | N/A (already installed) | Approved — already pinned in package.json |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
WS Event Bus (character.delta / combat.turn / combat.state)
        │
        │ subscribe (at driver.start())
        ▼
  HudDeltaDriver
        │
        │ debounce (setTimeout, MIN_REDRAW_INTERVAL_MS = 100ms configurable)
        │ collapse near-simultaneous events into 1 cycle
        ▼
  _runCycle()
        │
        ├─► compositor.composite()    →  Uint8ClampedArray 400×200×4
        │
        ├─► splitIntoTiles()          →  4 × Uint8ClampedArray 200×100×4
        │
        ├─► h32Raw(tileRgba)          →  number  (one hash per tile)
        │     (via xxhash-wasm, init-once)
        │
        ├─► compare vs prevHashes[0..3]
        │     changed tiles → encode subset
        │
        ├─► buildHudTiles(changedTileBuffers) → HudTile[]
        │
        └─► pushHudTiles(bridge, changedTiles)
                │
                └─► updateImageRawData × N (serialized for…of)
                                    │
                                    ▼
                            G2 framebuffer (BLE)
```

### Recommended Project Structure

```
packages/g2-app/src/engine/
  hud-delta-driver.ts        ← NEW: HudDeltaDriver class
  hud-delta-driver.test.ts   ← NEW: unit tests (or in __tests__/ sub-dir)
  layer-manager.ts           ← MODIFY: remove _startDeltaRecomposite methods
  ...
packages/g2-app/src/internal/
  boot-engine-core.ts        ← MODIFY: inject HudDeltaDriver at step 7
```

### Pattern 1: HudDeltaDriver — event-driven debounce loop

**What:** A standalone class that owns the xxhash-wasm API reference, per-tile hash table (`prevHashes: number[]`, length 4), a debounce timer id, and the unsub closures. Subscribes to all three WS channels; any delivery schedules a `setTimeout` (cleared and re-set on each new event within the window). On timer fire, runs the composite→hash→encode→push cycle.

**When to use:** Canvas mode only. Called from `LayerManager._flushPage()` after the page rebuild, replacing the current `_startDeltaRecomposite()` call. Disposed on engine teardown via `driver.stop()`.

**Example (pattern from raster-worker.ts + hud-poc-page.ts):**
```typescript
// Source: raster-worker.ts lines 62, 106, 185-186 (xxhash init pattern)
// Source: hud-poc-page.ts lines 207-225 (pushHudTiles loop)
// Source: hud-raster-frame.ts lines 268-298 (buildHudTiles split+dither+encode)

import xxhash from 'xxhash-wasm';
import type { XXHashAPI } from 'xxhash-wasm';
import { buildHudTiles } from '../hud/hud-raster-frame.js';
import { pushHudTiles } from '../hud/hud-poc-page.js';
import type { CanvasCompositorLike } from './canvas-compositor.js';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

const TILE_COUNT = 4;

export const DEFAULT_MIN_REDRAW_INTERVAL_MS = 100;

export interface HudDeltaDriverOpts {
  readonly compositor: CanvasCompositorLike;
  readonly bridge: Pick<EvenAppBridge, 'updateImageRawData'>;
  readonly wsEvents: { subscribe(ch: string, fn: (raw: unknown) => void): () => void };
  readonly minRedrawIntervalMs?: number; // default: DEFAULT_MIN_REDRAW_INTERVAL_MS
}

export class HudDeltaDriver {
  private _xxhash: XXHashAPI | null = null;
  private readonly _prevHashes: number[] = new Array(TILE_COUNT).fill(0);
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private readonly _unsubs: Array<() => void> = [];
  private readonly _opts: Required<HudDeltaDriverOpts>;

  constructor(opts: HudDeltaDriverOpts) {
    this._opts = { minRedrawIntervalMs: DEFAULT_MIN_REDRAW_INTERVAL_MS, ...opts };
  }

  /** Subscribe to delta channels and arm the loop. */
  async start(): Promise<void> {
    // WASM init — once per driver lifetime.
    if (this._xxhash === null) {
      this._xxhash = await xxhash();
    }
    const schedule = () => this._schedule();
    const channels = ['character.delta', 'combat.turn', 'combat.state'];
    for (const ch of channels) {
      this._unsubs.push(this._opts.wsEvents.subscribe(ch, schedule));
    }
  }

  /** Release subscriptions and cancel any pending timer. */
  stop(): void {
    if (this._timer !== null) { clearTimeout(this._timer); this._timer = null; }
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
  }

  private _schedule(): void {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._timer = null; void this._runCycle(); },
      this._opts.minRedrawIntervalMs);
  }

  private async _runCycle(): Promise<void> {
    if (this._xxhash === null) return; // not yet init (should not happen after start())
    const rgba = this._opts.compositor.composite();        // 400×200×4
    const tiles = buildHudTiles(rgba);                     // 4 × HudTile (dithered PNG)
    // Identify changed tiles by h32Raw of their source RGBA.
    // NOTE: We hash the RGBA before dither (cheaper, deterministic for identical input).
    // Alternative: hash the PNG bytes — also deterministic but adds encode cost.
    // DECISION: hash RGBA sub-tile (mirrors raster-worker hashSubTiles pattern).
    const changed: typeof tiles = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = tiles[i];
      if (tile === undefined) continue;
      const h = this._xxhash.h32Raw(tile.bytes); // hash the PNG bytes (available post-buildHudTiles)
      if (h !== (this._prevHashes[i] ?? 0)) {
        this._prevHashes[i] = h;
        changed.push(tile);
      }
    }
    if (changed.length === 0) return; // zero-push-on-idle
    await pushHudTiles(this._opts.bridge, changed);
  }
}
```

**Critical design note:** The hash can be computed either on the 200×100 RGBA slice (before dither) or on the final PNG bytes (after `buildHudTiles`). Hashing the PNG bytes from `HudTile.bytes` is simpler (no slice logic needed in the driver) and guarantees the hash exactly matches what will be sent over BLE. The raster-worker hashes RGBA sub-tiles at 32×32 granularity (18 per tile); the HUD delta driver hashes at tile granularity (1 hash per 200×100 tile). This is D-24.4's "4 tile 200×100" geometry — we hash each tile as a whole, not its sub-tiles. This is sufficient for the HUD loop because the compositor already skips re-paint via `isDirty()`.

### Anti-Patterns to Avoid

- **Parallel `Promise.all` for tile pushes:** The Even Hub SDK does NOT accept concurrent `updateImageRawData` calls. The existing `pushHudTiles` already uses `for...of` + `await`; never replace it with `Promise.all`. [VERIFIED: hud-poc-page.ts CM-01 comment + SDK behavior verified in qm0 probe]
- **Calling `_startDeltaRecomposite` AND HudDeltaDriver simultaneously:** After Phase 24, `_startDeltaRecomposite` must be removed entirely from `LayerManager`. Leaving both active would produce double-pushes on every delta.
- **Re-initializing WASM on every cycle:** `await xxhash()` is an async WASM compile; do it ONCE in `driver.start()` and store the result. The raster-worker demonstrates the correct lazy-singleton pattern.
- **Hashing `Uint8ClampedArray` from compositor before checking `isDirty`:** If no layer is dirty, `compositor.composite()` still returns a valid RGBA but all the pixel values are identical to the previous call. The hash comparison gate catches this correctly — zero push — but the composite() + hash computation are wasted. An optimization (not required in Phase 24) is to skip `_runCycle` entirely when no CanvasLayer reports `isDirty()`. This is a future optimization; the hash gate alone satisfies D-24.3.
- **Using h64 instead of h32:** h64 returns `bigint`, which does not fit in a plain `number[]` hash table without conversion. h32 returns `number` directly. D-24.2 locks h32. [VERIFIED: xxhash-wasm types.d.ts]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fast non-crypto hash for 200×100 RGBA tiles | Custom hash function | `xxhash-wasm` `h32Raw` | Already pinned, WASM performance, collision rate negligible for frame-to-frame delta detection |
| PNG encode for G2 4-bit image containers | Custom PNG encoder | `upng-js` 2.1.0 via `buildHudTiles` | Already in stack; handles DEFLATE + 4-bit palette correctly |
| Floyd-Steinberg dither | Custom ditherer | `image-q` 4.0.0 via `buildHudTiles` | Already in stack; no second compression layer needed |
| Serialized tile push | `Promise.all` | `pushHudTiles` (`for...of` + `await`) | CM-01: SDK rejects concurrent `updateImageRawData` |

**Key insight:** Every piece of the pipeline (`buildHudTiles`, `pushHudTiles`, `xxhash`) is already present in the codebase. Phase 24 is a wiring phase, not a dependency phase.

---

## Naive Driver Location and Shape (What Gets Replaced)

**File:** `packages/g2-app/src/engine/layer-manager.ts`

**Exact code to remove or replace:**

1. **Field** (line ~136): `private _deltaRecompositeUnsub: (() => void) | null = null;`
2. **Constructor arg** (line ~192): 4th arg `wsEvents` — keep for HudDeltaDriver injection but the field may shift to a different purpose.
3. **Private method** (lines ~737-751): `_startDeltaRecomposite()` — subscribes to `'character.delta'` only; calls `_compositeAndPush()` synchronously on each event (no debounce, no hash comparison, every event triggers a full 4-tile encode+push).
4. **Private method** (lines ~753-763): `_stopDeltaRecomposite()` — releases the single subscription.
5. **Call sites** in `_flushPage()` (line ~677): `this._startDeltaRecomposite()` after canvas mode page rebuild.
6. **Call site** in `disposeSubscriptions()` (line ~721): `this._stopDeltaRecomposite()`.

**What the naive driver does NOT have (gaps Phase 24 fills):**
- No debounce — every `character.delta` immediately triggers `_compositeAndPush()`.
- No hash comparison — all 4 tiles are always encoded+sent regardless of pixel change.
- Subscribes only to `character.delta` — does NOT subscribe to `combat.turn` or `combat.state`.
- Encodes ALL 4 tiles unconditionally via `buildHudTiles(rgba)` → `pushHudTiles(bridge, tiles)`.

**Replacement strategy:** Remove `_startDeltaRecomposite`, `_stopDeltaRecomposite`, `_deltaRecompositeUnsub` from `LayerManager`. Add an optional `driver?: HudDeltaDriver` constructor arg (or create it in `LayerManager._flushPage` and pass through). Call `driver.start()` where `_startDeltaRecomposite()` was. Call `driver.stop()` in `disposeSubscriptions()`.

---

## xxhash-wasm 1.1.0 API — Verified Reference

[VERIFIED: local package.json `xxhash-wasm@1.1.0` + `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/node_modules/xxhash-wasm/types.d.ts`]

```typescript
// Default export — call once, await, reuse the returned API object.
import xxhash from 'xxhash-wasm';

// Init (async WASM compile — once per lifetime):
const api: XXHashAPI = await xxhash();

// h32Raw — hash a Uint8Array, return u32 as JavaScript number:
const hash: number = api.h32Raw(uint8Array);       // seed defaults to 0
const hash: number = api.h32Raw(uint8Array, seed); // optional u32 seed

// h64Raw — NOT used in Phase 24 (returns bigint, D-24.2 locks h32):
// const hash: bigint = api.h64Raw(uint8Array);
```

**Type definition (verbatim from types.d.ts):**
```typescript
export type XXHashAPI = {
  h32(input: string, seed?: number): number;
  h32ToString(input: string, seed?: number): string;
  h32Raw(inputBuffer: Uint8Array, seed?: number): number;    // ← use this
  create32(seed?: number): XXHash<number>;
  h64(input: string, seed?: bigint): bigint;
  h64Raw(inputBuffer: Uint8Array, seed?: bigint): bigint;
  create64(seed?: bigint): XXHash<bigint>;
};

declare module "xxhash-wasm" {
  export default function xxhash(): Promise<XXHashAPI>;
}
```

**Important:** `h32Raw` accepts `Uint8Array`, not `Uint8ClampedArray`. The `HudTile.bytes` field from `buildHudTiles` is already `Uint8Array` (line 290 of hud-raster-frame.ts: `const bytes = new Uint8Array(pngBuf)`). If hashing RGBA directly, cast: `new Uint8Array(rgba.buffer)` or pass `tile.bytes` directly (PNG bytes, also `Uint8Array`). The existing raster-worker uses `new Uint8Array(subBlock)` for the same reason.

---

## Integration Points — CanvasCompositor → TileDelta Flow

### How `composite()` produces hashable tile data

`compositor.composite()` returns `Uint8ClampedArray` of length `400 * 200 * 4 = 320000`. This is consumed by `buildHudTiles(rgba)` which:
1. Splits into 4 × 200×100 buffers via `splitIntoTiles()`.
2. For each tile: `ditherTile()` → `UPNG.encode()` → `new Uint8Array(pngBuf)`.
3. Returns `HudTile[]` with `{containerName, containerID, bytes}`.

The returned `HudTile.bytes` (the encoded PNG) is the natural hash input for the driver because:
- It is a `Uint8Array` (no cast needed).
- It is deterministic: identical RGBA input → identical dither output → identical PNG bytes → identical hash. This directly satisfies D-24.5 (static chrome determinism).
- The hash covers the full tile — no sub-tile granularity needed at this level. Sub-tile hashing (TileDelta, 18 sub-tiles per tile) is the raster-worker's pattern for the map pipeline; the HUD delta driver operates at tile granularity (4 tiles).

### Container ID → tile index mapping (container-registry)

[VERIFIED: container-registry.ts + hud-raster-frame.ts HUD_TILE_GEOMETRY]

```
containerID 0 → hud-tile-0 → TL (x=0,   y=0)
containerID 1 → hud-tile-1 → TR (x=200, y=0)
containerID 2 → hud-tile-2 → BL (x=0,   y=100)
containerID 3 → hud-tile-3 → BR (x=200, y=100)
```

`pushHudTiles` expects `HudTile[]` with correct `containerID` and `containerName` fields. `buildHudTiles` already populates these from `HUD_TILE_GEOMETRY`. When pushing only changed tiles, pass the subset — `pushHudTiles` iterates `for (const tile of tiles)` so a partial array works correctly.

### How layers set `isDirty()` → compositor respects it

`CanvasCompositor.composite()` [VERIFIED: canvas-compositor.ts lines 199-201]:
```typescript
if (entry.layer.isDirty()) {
  entry.layer.paint(); // paint() resets _dirty=false as its last statement
}
ctx.drawImage(entry.canvas, 0, 0);
```
The compositor only calls `paint()` for dirty layers. Non-dirty layers are blitted from their cached canvas (dirty-skip optimization). This means `composite()` is safe to call on every debounced cycle — if no layer is dirty, `composite()` blits cached content and returns an RGBA identical to the previous frame, which the hash gate correctly identifies as unchanged → zero push.

---

## Common Pitfalls

### Pitfall 1: Calling `_startDeltaRecomposite` while HudDeltaDriver is also active
**What goes wrong:** Both fire on each `character.delta` event — double encoding, double `pushHudTiles` calls, flicker and BLE waste.
**Why it happens:** Forgetting to remove the old mechanism when adding the new one.
**How to avoid:** Remove `_startDeltaRecomposite`, `_stopDeltaRecomposite`, and `_deltaRecompositeUnsub` entirely from `LayerManager` in the same commit that wires `HudDeltaDriver`.
**Warning signs:** Test spies on `bridge.updateImageRawData` fire 2× per delta event.

### Pitfall 2: `h32Raw` requires `Uint8Array`, not `Uint8ClampedArray`
**What goes wrong:** TypeScript type error at compile time if `rgba` (Uint8ClampedArray) is passed directly to `h32Raw`.
**Why it happens:** `compositor.composite()` returns `Uint8ClampedArray`; `h32Raw` signature is `(Uint8Array) => number`.
**How to avoid:** Either hash `HudTile.bytes` (already `Uint8Array`) or cast: `new Uint8Array(rgba.buffer)` or `rgba as unknown as Uint8Array` (the buffers share the same ArrayBuffer but the array type differs).
**Warning signs:** `tsc --noEmit` fails with type mismatch on h32Raw call.

### Pitfall 3: xxhash WASM init not awaited before first cycle
**What goes wrong:** `this._xxhash` is null on the first cycle; the cycle is a no-op (early return) and the first frame is never pushed.
**Why it happens:** `start()` not awaited by caller, or the first event fires before WASM compile completes.
**How to avoid:** `driver.start()` must `await xxhash()` synchronously inside the async `start()` method. The caller in `LayerManager._flushPage()` must `await driver.start()` before returning. The WASM compile on Chrome/Node is typically <5ms but is genuinely async.
**Warning signs:** Test with mock xxhash and immediate event finds 0 calls on `updateImageRawData`.

### Pitfall 4: Debounce timer leaks on destroy
**What goes wrong:** If `driver.stop()` is not called, the `setTimeout` callback fires after the engine is torn down, triggering a `_compositeAndPush()` on a dead compositor and bridge reference → crash or silent error.
**Why it happens:** `disposeSubscriptions()` in `LayerManager` forgets to call `driver.stop()`.
**How to avoid:** `HudDeltaDriver.stop()` clears the pending timer with `clearTimeout` AND releases all channel subscriptions. Verify in tests with `vi.useFakeTimers()`.
**Warning signs:** Memory leak warnings; callbacks firing after `destroy()`.

### Pitfall 5: `pushHudTiles` called with empty array
**What goes wrong:** No error, but unnecessary bridge call overhead.
**Why it happens:** Missing the `if (changed.length === 0) return` guard in `_runCycle`.
**How to avoid:** Always guard: `if (changed.length === 0) return;` before `pushHudTiles`. D-24.3 makes this a hard requirement.

### Pitfall 6: Hash computed before `buildHudTiles` splits tiles
**What goes wrong:** Hashing the full 400×200 frame rather than per-tile → cannot identify WHICH tile changed, cannot send a subset.
**Why it happens:** Hashing `rgba` directly instead of `tile.bytes` per tile.
**How to avoid:** Hash each `HudTile.bytes` individually after `buildHudTiles` returns. The driver's hash table has length 4 (one slot per tile). Compare `h32Raw(tile.bytes) !== prevHashes[tile.containerID]`.

### Pitfall 7: `_compositeAndPush` still called from `_flushPage` after replacement
**What goes wrong:** On the initial page rebuild (boot and each bundle), `_compositeAndPush` pushes ALL 4 tiles unconditionally, then HudDeltaDriver also fires a full cycle → double push on boot.
**Why it happens:** `_flushPage` calls `await this._compositeAndPush()` (line 673) AND calls `this._startDeltaRecomposite()` (line 677). After Phase 24, `_compositeAndPush` + `_startDeltaRecomposite` must both be replaced by a single `await driver.runFirstFrame()` + `driver.start()` (or equivalent). The first frame should also set `prevHashes` baselines.
**How to avoid:** The HudDeltaDriver should expose a `runFirstFrame()` that runs the full cycle unconditionally (resetting prevHashes) and then `start()` arms the event-driven loop. `_flushPage` calls `await driver.runFirstFrame()` instead of `_compositeAndPush()`.

---

## Code Examples

### 1. xxhash-wasm h32Raw init and usage (per-tile pattern)
```typescript
// Source: raster-worker.ts lines 62, 106, 185-186; xxhash-wasm types.d.ts
import xxhash from 'xxhash-wasm';
import type { XXHashAPI } from 'xxhash-wasm';

let _api: XXHashAPI | null = null;

async function getXxhashApi(): Promise<XXHashAPI> {
  if (_api === null) _api = await xxhash();
  return _api;
}

// Usage per tile (HudTile.bytes is Uint8Array):
const api = await getXxhashApi();
const hash: number = api.h32Raw(tile.bytes); // u32 as JavaScript number
```

### 2. Debounce pattern (setTimeout-based, mirrors existing MIN_REDRAW_INTERVAL usage)
```typescript
// Source: design pattern; no direct precedent in codebase (naive driver had NO debounce)
private _schedule(): void {
  if (this._timer !== null) clearTimeout(this._timer);
  this._timer = setTimeout(() => {
    this._timer = null;
    void this._runCycle();
  }, this._opts.minRedrawIntervalMs);
}
```

### 3. Selective pushHudTiles (only changed tiles)
```typescript
// Source: hud-poc-page.ts pushHudTiles (accepts ReadonlyArray<HudTile>)
// pushHudTiles iterates for...of — works correctly with a subset
const changed: HudTile[] = [];
for (let i = 0; i < TILE_COUNT; i++) {
  const tile = tiles[i];
  if (tile === undefined) continue;
  const h = this._xxhash!.h32Raw(tile.bytes);
  if (h !== (this._prevHashes[i] ?? 0)) {
    this._prevHashes[i] = h;
    changed.push(tile);
  }
}
if (changed.length > 0) {
  await pushHudTiles(this._opts.bridge, changed);
}
```

### 4. Multi-channel WS subscription (character.delta + combat channels)
```typescript
// Source: canvas-combat-tracker-panel.ts lines 522-528 (multi-channel subscribe pattern)
const channels = ['character.delta', 'combat.turn', 'combat.state'];
for (const ch of channels) {
  this._unsubs.push(wsEvents.subscribe(ch, () => this._schedule()));
}
```

### 5. Test spy: assert 1-of-4-tiles changed → exactly 1 updateImageRawData call
```typescript
// Source: design — mirrors canvas-status-hud-layer.test.ts bridge mock pattern
const bridge = { updateImageRawData: vi.fn().mockResolvedValue({ isSuccess: () => true }) };
const compositor = {
  composite: vi.fn().mockImplementation(() => {
    // Synthetic RGBA: tile 0 (TL) has changed pixels; tiles 1-3 identical
    const rgba = new Uint8ClampedArray(400 * 200 * 4);
    // ... fill tile 0 quadrant with non-zero data
    return rgba;
  }),
};
// After driver.runFirstFrame() seeds prevHashes...
// Mutate tile 0 quadrant in compositor output...
// Trigger _schedule() + advance fake timers...
// Assert: bridge.updateImageRawData called exactly once (tile 0 only)
expect(bridge.updateImageRawData).toHaveBeenCalledTimes(1);
expect(bridge.updateImageRawData.mock.calls[0][0].containerID).toBe(0);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 20 naive: `_startDeltaRecomposite` (no debounce, no hash, all-4-tiles every event) | Phase 24 HudDeltaDriver: debounce 100ms + h32Raw per-tile hash + selective push | Phase 24 | Eliminates all BLE pushes on idle; collapses burst events |
| `_compositeAndPush` in `LayerManager` (private, tightly coupled) | `HudDeltaDriver` standalone class (injectable, testable in isolation) | Phase 24 | Clean separation; `LayerManager` loses 3 private members |

**Deprecated/outdated after Phase 24:**
- `LayerManager._startDeltaRecomposite()`: removed; replaced by `HudDeltaDriver.start()`.
- `LayerManager._stopDeltaRecomposite()`: removed; replaced by `HudDeltaDriver.stop()`.
- `LayerManager._deltaRecompositeUnsub` field: removed.
- `LayerManager._compositeAndPush()`: the initial-frame invocation moves to `HudDeltaDriver.runFirstFrame()`. The method may be removed entirely or kept as a thin shim used only by `runFirstFrame` internally.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hashing `HudTile.bytes` (PNG bytes) rather than per-32×32 RGBA sub-tiles is sufficient for tile-level dirty detection in the HUD loop | Architecture Patterns, Code Examples | Low risk: PNG bytes determinism confirmed by D-24.5 / INV-1 golden fixture; sub-tile granularity inside a tile is only needed for the map raster-worker (18 sub-tiles; eliminates partial-tile re-encode). HUD tiles are small (200×100) and operated on as a whole. |
| A2 | `combat.delta` is NOT a real WS channel name; the actual channels are `combat.turn` and `combat.state` (per canvas-combat-tracker-panel.ts COMBAT_TURN_DELTA_TYPE / COMBAT_STATE_DELTA_TYPE) | Integration Points | Medium risk: CONTEXT.md mentions "combat.delta" generically. The code clearly uses `combat.turn` and `combat.state`. If the bridge emits `combat.delta` as a synthetic channel, the driver should also subscribe to it. Planner should verify channel names against bridge delta-emitter.ts. |
| A3 | The `wsEvents` parameter already passed to `LayerManager` constructor is sufficient; HudDeltaDriver can receive the same reference | Architecture Patterns | Low risk: The existing 4th-arg pattern (`wsEvents`) in `LayerManager` is already wired; the driver just needs the same reference passed through. |

---

## Open Questions

1. **Is `combat.delta` a real channel or is it always `combat.turn` + `combat.state`?**
   - What we know: `canvas-combat-tracker-panel.ts` subscribes to `COMBAT_TURN_DELTA_TYPE` and `COMBAT_STATE_DELTA_TYPE` (both defined as string constants in that file).
   - What's unclear: CONTEXT.md mentions "combat.delta" as a trigger — this may be a generic name for the pair, or there may be a separate `combat.delta` channel in the bridge.
   - Recommendation: check `bridge/src/delta-emitter.ts` for the exact channel string constants; subscribe to all channels the bridge actually emits that could affect HUD canvas layers.

2. **Should `HudDeltaDriver` live in `engine/` or elsewhere?**
   - What we know: All delta-loop code is in `engine/layer-manager.ts` today; `canvas-compositor.ts` and `layer-types.ts` are also in `engine/`.
   - Recommendation: `engine/hud-delta-driver.ts` — consistent with the Phase 19-20 architectural pattern of compositor-related code in `engine/`.

3. **Should `_compositeAndPush` be completely removed from `LayerManager` or kept for runFirstFrame?**
   - What we know: `_compositeAndPush` is called from `_flushPage()` on boot and each bundle; it pushes all 4 tiles unconditionally.
   - Recommendation: Keep `_compositeAndPush` as a private helper used by `HudDeltaDriver.runFirstFrame()` via a callback/injected fn, OR move the first-frame push responsibility entirely to `HudDeltaDriver`. The cleaner design is to have `HudDeltaDriver.runFirstFrame()` own the first push, resetting `prevHashes`, and `LayerManager` calls `await driver.runFirstFrame()` in place of `await this._compositeAndPush()`.

---

## Environment Availability

> Phase 24 is code-only with no new external dependencies. All required packages are already installed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `xxhash-wasm` | HudDeltaDriver.h32Raw | ✓ | 1.1.0 | — (already in package.json) |
| `image-q` | buildHudTiles | ✓ | 4.0.0 | — |
| `upng-js` | buildHudTiles | ✓ | 2.1.0 | — |
| Node.js / WebView JS | setTimeout debounce | ✓ | built-in | — |

---

## Project Constraints (from CLAUDE.md)

- **INV-1:** Raster INV-1 golden fixture (`status-hud.raster-hash.json`) must not change. `buildHudTiles` is not modified in Phase 24 — only the driver calling it changes. Hash determinism of static chrome is proven by D-24.5.
- **INV-4:** Zero dead/unreachable code. After removing `_startDeltaRecomposite` / `_stopDeltaRecomposite` / `_deltaRecompositeUnsub`, grep for lingering references; all call sites must be updated. JSDoc/TSDoc on all public `HudDeltaDriver` API.
- **No second compression layer:** `buildHudTiles` uses `upng-js`'s built-in DEFLATE; do not add `pako` / `fflate`.
- **No Express / socket.io:** Not relevant to this phase.
- **TypeScript strict:** `noUncheckedIndexedAccess` — use `?? 0` guard when indexing `_prevHashes[i]` (same pattern as `TileDelta.detectChanges` line 82).
- **Biome:** `lint/suspicious/noConsole` — use `console.warn('[EVF]')` pattern for fallback paths (no `console.debug`).
- **`// TODO` requires `(#issue)` or `(ADR-NNNN)`** — no bare TODOs.
- **Serialized tile push:** Do NOT use `Promise.all` for `updateImageRawData` calls (CM-01).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root workspace config) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-|RPROMO-01|delta.driver'` |
| Full suite command | `pnpm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPROMO-01-DL-1 | 1-of-4 tiles changed → exactly 1 updateImageRawData call | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-01'` | ❌ Wave 0 |
| RPROMO-01-DL-2 | 0-of-4 tiles changed → 0 updateImageRawData calls (zero-push-on-idle) | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-02'` | ❌ Wave 0 |
| RPROMO-01-DL-3 | Debounce: 3 rapid deltas within window → 1 render cycle (not 3) | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-03'` | ❌ Wave 0 |
| RPROMO-01-DL-4 | Debounce interval configurable (custom 50ms overrides 100ms default) | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-04'` | ❌ Wave 0 |
| RPROMO-01-DL-5 | Static chrome: identical compositor output → hash unchanged → 0 pushes after first frame | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-05'` | ❌ Wave 0 |
| RPROMO-01-DL-6 | driver.stop() cancels pending timer, releases all subscriptions | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-06'` | ❌ Wave 0 |
| RPROMO-01-DL-7 | LayerManager canvas path uses HudDeltaDriver (not _startDeltaRecomposite) | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-07\|LMT-'` | ❌ Wave 0 |
| RINV-01 regression | buildHudTiles SHA-256 golden fixture unchanged | unit | `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'RINV-01'` | ✅ existing |

### Test Spy Pattern (key to DL-01 / DL-02)

The test must:
1. Mock `xxhash-wasm` so `await xxhash()` resolves synchronously (or mock `h32Raw` to return controllable values).
2. Use `vi.useFakeTimers()` to control the debounce timer.
3. Spy on `bridge.updateImageRawData` to count calls.
4. Provide a `compositor.composite()` mock that returns synthetic RGBA with only tile 0 quadrant changed.
5. Call `driver.start()` → subscribe fires immediately with last-value replay → `vi.runAllTimers()` → assert 1 call.
6. Call `vi.runAllTimers()` again without new delta → assert 0 additional calls (zero-push-on-idle verified via hash stability).

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run --testNamePattern 'DL-'`
- **Per wave merge:** `pnpm test -- --run`
- **Phase gate:** Full suite green (currently 3290 tests) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/g2-app/src/engine/hud-delta-driver.test.ts` — covers DL-01..DL-06 (new file needed)
- [ ] `packages/g2-app/src/engine/__tests__/layer-manager-delta-driver.test.ts` (or extend existing `layer-manager.test.ts`) — covers DL-07 (LayerManager wires driver, not old mechanism)

*(No new test framework installation needed — Vitest 4.1.5 already configured.)*

---

## Security Domain

> `security_enforcement` not set to false in config.json — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `CharacterSnapshotSchema.safeParse` already guards delta payloads in layers; HudDeltaDriver does not process payload content, only triggers a render cycle |
| V6 Cryptography | no | xxhash is non-cryptographic (delta detection only, never used for auth/integrity) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `combat.turn` payload triggers rapid-fire render cycles | Denial of Service | Debounce (D-24.1) collapses N events into 1 cycle; driver fires at most 1 cycle per debounce window regardless of payload |
| xxhash hash collision (two different tile contents hash to the same value) | Spoofing | h32 on 200×100×4-byte tiles: collision probability is 1/2^32 ≈ 2.3×10^-10 per frame pair; negligible for display purposes; worst case = missed tile update (visual artifact, not security breach) |

---

## Sources

### Primary (HIGH confidence)
- `packages/g2-app/src/engine/layer-manager.ts` — `_startDeltaRecomposite`, `_stopDeltaRecomposite`, `_deltaRecompositeUnsub` field; `_compositeAndPush`; wiring comments explicitly stating "Phase 24 replaces this" [VERIFIED: local codebase read]
- `packages/g2-app/src/engine/canvas-compositor.ts` — `composite()` → `Uint8ClampedArray` 400×200×4; dirty-skip logic [VERIFIED: local codebase read]
- `packages/g2-app/src/hud/hud-raster-frame.ts` — `buildHudTiles`, `HUD_TILE_GEOMETRY`, tile IDs 0-3, 200×100 geometry [VERIFIED: local codebase read]
- `packages/g2-app/src/hud/hud-poc-page.ts` — `pushHudTiles` serialized CM-01 loop [VERIFIED: local codebase read]
- `packages/g2-app/src/raster/raster-worker.ts` — xxhash lazy-singleton init pattern, `h32Raw` usage on `Uint8Array` sub-blocks [VERIFIED: local codebase read]
- `packages/g2-app/node_modules/xxhash-wasm/types.d.ts` — `XXHashAPI` type, `h32Raw(Uint8Array, seed?) => number` signature [VERIFIED: local file read]
- `packages/g2-app/node_modules/xxhash-wasm/README.md` — h32Raw API documentation [VERIFIED: local file read]
- `packages/g2-app/package.json` — `xxhash-wasm@1.1.0` confirmed in dependencies [VERIFIED: local codebase read]
- `.planning/phases/EVF-24-delta-loop-5fps-xxhash/24-CONTEXT.md` — all locked decisions D-24.1..D-24.6 [VERIFIED: local file read]
- `npm view xxhash-wasm` — version `1.1.0`, published 2024-11-19, source `github.com/jungomi/xxhash-wasm` [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- `packages/g2-app/src/panels/canvas-combat-tracker-panel.ts` — `combat.turn` + `combat.state` channel names confirmed (COMBAT_TURN_DELTA_TYPE / COMBAT_STATE_DELTA_TYPE) [VERIFIED: local codebase grep]
- `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts` — `character.delta` channel subscription pattern [VERIFIED: local codebase read]

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed and verified in codebase
- Architecture: HIGH — naive driver is explicitly annotated for Phase 24 replacement; all integration points verified
- Pitfalls: HIGH — sourced from existing Phase 20 implementation annotations and code comments
- API (xxhash-wasm): HIGH — types.d.ts and README verified locally

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (stable; xxhash-wasm 1.1.0 is already pinned; no external services)
