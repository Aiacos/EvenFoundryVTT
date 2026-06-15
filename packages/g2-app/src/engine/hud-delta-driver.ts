/**
 * HudDeltaDriver — event-driven, per-tile xxhash delta loop for the HUD raster path.
 *
 * Replaces the Phase 20 naive event-driven recomposite mechanism inside `LayerManager`
 * with a standalone, injectable class that owns:
 *
 *   - A one-time `await xxhash()` WASM init (lazy-singleton, mirrors raster-worker.ts).
 *   - A 4-slot `prevHashes` table (one h32 per HUD tile, updated on every changed push).
 *   - A `setTimeout`-based throttle (configurable via `HudDeltaDriverOpts.minRedrawIntervalMs`;
 *     default `DEFAULT_MIN_REDRAW_INTERVAL_MS = 100` per D-24.1 — this overrides the
 *     ROADMAP criterion-#2 literal MIN_REDRAW_INTERVAL_MS = 200).
 *   - Multi-channel WS subscriptions: `character.delta`, `combat.turn`, `combat.state`.
 *   - `runFirstFrame()` — pushes all 4 tiles unconditionally and seeds baseline hashes.
 *   - `_runCycle()` — compares per-tile h32 and pushes only changed tiles (D-24.3 zero-push-on-idle).
 *
 * Wired into `LayerManager` at construction time (Plan 24-02 Wave 2):
 *   - `await driver.start()` then `await driver.runFirstFrame()` in `_flushPage()` canvas branch.
 *   - `driver.stop()` in `disposeSubscriptions()`.
 *
 * INV-4 compliance: JSDoc/TSDoc on every public API; zero bare TODO markers; no dead code.
 * CM-01 serialization: pushes use `pushHudTiles` which iterates `for...of` + `await`
 * — do NOT replace with `Promise.all` (Even Hub SDK rejects concurrent calls).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 * @see packages/g2-app/src/engine/layer-manager.ts (LayerManager._flushPage canvas branch)
 * @see packages/g2-app/src/raster/raster-worker.ts (xxhash lazy-singleton init pattern)
 * @see packages/g2-app/src/hud/push-hud-tiles.ts (pushHudTiles CM-01 serialization)
 * @see .planning/phases/EVF-24-delta-loop-5fps-xxhash/24-01-PLAN.md
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { XXHashAPI } from 'xxhash-wasm';
import xxhash from 'xxhash-wasm';
import { buildHudTiles, type HudTile } from '../hud/hud-raster-frame.js';
import { pushHudTiles } from '../hud/push-hud-tiles.js';
import type { CanvasCompositorLike } from './canvas-compositor.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of HUD tiles per frame (2×2 layout, container IDs 0-3). */
const TILE_COUNT = 4;

/** Sliding window (ms) for the {@link HudDeltaDriver.getFps} indicator. */
const FPS_WINDOW_MS = 2000;

/**
 * WS channels that trigger a render cycle.
 *
 * Verified against `bridge/src/ws/delta-emitter.ts` DELTA_CAP_MAP and
 * `canvas-combat-tracker-panel.ts` COMBAT_TURN_DELTA_TYPE / COMBAT_STATE_DELTA_TYPE
 * (resolves Phase 24 Research Open Q1 — `combat.delta` is NOT a real channel name).
 *
 * `'r1.gesture'` (debug `canvas-sheet-overlay-wont-open`, 2026-06-09): gesture
 * envelopes mutate canvas-layer state (menu selection, sheet tab nav) by setting
 * the layer dirty flag — without a scheduled cycle the repaint would wait for the
 * next Foundry delta. SDK-delivered gestures (no WS transit) are covered by
 * {@link HudDeltaDriver.requestCycle} instead.
 */
const DELTA_CHANNELS = ['character.delta', 'combat.turn', 'combat.state', 'r1.gesture'] as const;

// ── Exported API ──────────────────────────────────────────────────────────────

/**
 * Default throttle interval in milliseconds (D-24.1).
 *
 * Overrides the ROADMAP success-criterion-#2 literal `MIN_REDRAW_INTERVAL_MS = 200`.
 * User-locked decision D-24.1: default is 100ms, configurable via
 * {@link HudDeltaDriverOpts.minRedrawIntervalMs}.
 */
export const DEFAULT_MIN_REDRAW_INTERVAL_MS = 100;

/**
 * Constructor options for {@link HudDeltaDriver}.
 */
export interface HudDeltaDriverOpts {
  /**
   * The canvas compositor to invoke on each render cycle.
   *
   * `composite()` returns the 400×200×4 RGBA buffer fed to `buildHudTiles`.
   */
  readonly compositor: CanvasCompositorLike;

  /**
   * Bridge surface required by `pushHudTiles`.
   *
   * Only `updateImageRawData` is called; the full `EvenAppBridge` is not required.
   */
  readonly bridge: Pick<EvenAppBridge, 'updateImageRawData'>;

  /**
   * WS event bus.
   *
   * Must expose `subscribe(channel, fn): () => void`.
   * The driver subscribes to `character.delta`, `combat.turn`, and `combat.state`.
   */
  readonly wsEvents: {
    subscribe(channel: string, fn: (raw: unknown) => void): () => void;
  };

  /**
   * Optional off-main-thread tile builder (Worker-backed, layout B perf lever).
   *
   * When present, `_runCycle`/`runFirstFrame` build tiles via this async
   * surface (the composite RGBA buffer is transferred to the Worker). On any
   * rejection the driver falls back to the synchronous `buildHudTiles` for
   * that cycle (fail-soft). When absent (unit tests, no-Worker hosts), the
   * synchronous path is used directly — byte-identical output.
   *
   * The second parameter `dither` is forwarded from `getDitherMode()` at call
   * time — the Worker receives the live flag and applies the matching algorithm.
   */
  readonly buildTilesAsync?: (rgba: Uint8ClampedArray, dither: boolean) => Promise<HudTile[]>;

  /**
   * Optional live-read dither mode getter.
   *
   * Called at the start of every render cycle so a toggle takes effect immediately
   * without reconstructing the driver. When absent (or returns `undefined`), the
   * driver defaults to `true` (Bayer ordered-dither, same as pre-feature behaviour).
   *
   * The returned boolean is forwarded to both the async Worker path and the
   * synchronous `buildHudTiles` fallback, ensuring byte-identical output per mode
   * across both paths.
   *
   * @returns `true` for Bayer 4×4 dither; `false` for direct nearest-of-16-level
   *   quantization with no dither pattern.
   */
  readonly getDitherMode?: () => boolean;

  /**
   * Throttle interval in milliseconds.
   *
   * Defaults to {@link DEFAULT_MIN_REDRAW_INTERVAL_MS} (100ms per D-24.1).
   * The trailing-edge re-arm ensures the real period is `max(interval, cycleTime)`,
   * never `interval + cycleTime`.
   */
  readonly minRedrawIntervalMs?: number;
}

// ── HudDeltaDriver ────────────────────────────────────────────────────────────

/**
 * Event-driven, throttled per-tile xxhash delta driver for the HUD raster path.
 *
 * Lifecycle:
 * 1. Construct with {@link HudDeltaDriverOpts}.
 * 2. `await driver.start()` — inits WASM, subscribes to delta channels.
 * 3. `await driver.runFirstFrame()` — pushes all 4 tiles, seeds hash baselines.
 * 4. Driver runs automatically on channel events until `driver.stop()`.
 * 5. `driver.stop()` — cancels pending throttle timer, clears trailing-edge flag, releases all subscriptions.
 *
 * @example
 * ```ts
 * const driver = new HudDeltaDriver({ compositor, bridge, wsEvents });
 * await driver.start();
 * await driver.runFirstFrame();
 * // ... driver fires autonomously on delta events ...
 * driver.stop(); // on teardown
 * ```
 */
export class HudDeltaDriver {
  /** xxhash WASM API — null until `start()` or `runFirstFrame()` awaits it. */
  private _xxhash: XXHashAPI | null = null;

  /**
   * Per-tile h32 hashes from the last push.
   *
   * Length 4 (one slot per HUD tile, IDs 0-3). Initialized to 0 so the first
   * `_runCycle` always detects a change on all tiles if called before
   * `runFirstFrame()` has seeded them. In normal operation `runFirstFrame()` is
   * called first and seeds accurate baselines.
   */
  private readonly _prevHashes: number[] = new Array(TILE_COUNT).fill(0);

  /** Pending throttle timer handle — null when no cycle is scheduled. */
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Trailing-edge re-arm flag.
   *
   * Set to `true` when `_schedule()` is called while a timer is pending OR a
   * cycle is in flight. When the in-flight cycle completes (`.finally`), if this
   * flag is set the driver re-arms the timer with the remaining interval to
   * deliver exactly one follow-up cycle — coalescing all events that arrived
   * during the busy window into a single render. Cleared by `stop()` so no
   * follow-up fires after teardown.
   *
   * This converts the throttle period from `interval + cycleTime` (leading-edge
   * stall, diagnosed 2026-06-11: ~17 fps delivered under continuous ~30fps input)
   * to `max(interval, cycleTime)` (≥25 fps target).
   */
  private _pendingAgain = false;

  /**
   * In-flight cycle guard.
   *
   * Set to `true` for the duration of `_runCycle()`. `_schedule()` checks this
   * alongside `_timer !== null` so events arriving between the timer fire and
   * the cycle's async completion still coalesce into one follow-up (single
   * in-flight cycle invariant — no overlapping cycles).
   */
  private _cycleInFlight = false;

  /**
   * Timestamps (ms) of recent cycles that pushed ≥1 tile, pruned to the last
   * {@link FPS_WINDOW_MS}. Feeds {@link getFps} — the small on-glasses FPS
   * indicator in the `hud-status` row (user request 2026-06-10).
   */
  private readonly _pushTimes: number[] = [];

  /** Unsub closures for all active WS channel subscriptions. */
  private readonly _unsubs: Array<() => void> = [];

  /** Resolved options with defaults applied (`buildTilesAsync` stays optional). */
  private readonly _opts: HudDeltaDriverOpts & { minRedrawIntervalMs: number };

  /**
   * Construct a `HudDeltaDriver`.
   *
   * @param opts Driver options. `minRedrawIntervalMs` defaults to
   *   {@link DEFAULT_MIN_REDRAW_INTERVAL_MS} (100ms).
   */
  constructor(opts: HudDeltaDriverOpts) {
    this._opts = {
      minRedrawIntervalMs: DEFAULT_MIN_REDRAW_INTERVAL_MS,
      ...opts,
    };
  }

  // ── Public lifecycle ─────────────────────────────────────────────────────────

  /**
   * Initialize the xxhash WASM module and subscribe to delta channels.
   *
   * Must be awaited before {@link runFirstFrame} or any delta event is processed.
   * Idempotent: subsequent calls after subscriptions are already active are
   * no-ops (guards against re-entry from `LayerManager._flushPage()` on every
   * `bundle()` call that reaches the canvas branch — CR-01).
   *
   * Subscribes to:
   *   - `'character.delta'` (CharacterSnapshot updates)
   *   - `'combat.turn'` (combat turn advances)
   *   - `'combat.state'` (combat state changes: start/end/initiative-roll)
   *
   * Each subscription schedules a throttled render cycle via `_schedule()`.
   * Unsub closures are stored in `_unsubs` and released on {@link stop}.
   */
  async start(): Promise<void> {
    // One-time WASM init — mirrors raster-worker.ts lazy-singleton pattern.
    if (this._xxhash === null) {
      this._xxhash = await xxhash();
    }

    // Idempotency guard (CR-01): re-entrant calls (e.g. bundle() called
    // post-boot reaching _flushPage again) must not accumulate duplicate
    // subscriptions. Earlier unsub closures would leak into the bus Set and
    // fire until the WebSocket closes.
    if (this._unsubs.length > 0) {
      return;
    }

    const schedule = (): void => {
      this._schedule();
    };

    for (const ch of DELTA_CHANNELS) {
      const unsub = this._opts.wsEvents.subscribe(ch, schedule);
      this._unsubs.push(unsub);
    }
  }

  /**
   * Push all 4 HUD tiles unconditionally and seed the hash baselines.
   *
   * Called once after {@link start} to establish the initial rendered state on the
   * G2 framebuffer. After this call an idle HUD produces zero BLE pushes
   * (D-24.3 zero-push-on-idle) because `_runCycle` detects no hash change.
   *
   * Ensures xxhash WASM is initialized (awaits if not yet done — handles the rare
   * case where `runFirstFrame` is called without `start`).
   *
   * Resolves Phase 24 Research Open Q2: the first-frame push responsibility lives
   * entirely in `HudDeltaDriver`, not `LayerManager._compositeAndPush`.
   */
  async runFirstFrame(): Promise<void> {
    // Ensure WASM init even if start() was not awaited yet.
    if (this._xxhash === null) {
      this._xxhash = await xxhash();
    }

    const rgba = this._opts.compositor.composite();
    const tiles = await this._buildTiles(rgba);

    if (tiles.length > 0) {
      await pushHudTiles(this._opts.bridge, tiles);
    }

    // Seed baseline hashes from the PNG bytes of each pushed tile.
    // buildHudTiles returns exactly tiles.length elements or throws — the
    // non-null assertion is correct at runtime; it satisfies noUncheckedIndexedAccess
    // without dead-code guards (INV-4, WR-02).
    for (let i = 0; i < tiles.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: buildHudTiles contract — tile at index i exists (see above)
      this._prevHashes[i] = this._xxhash.h32Raw(tiles[i]!.bytes);
    }
  }

  /**
   * Cancel any pending throttle timer and release all WS channel subscriptions.
   *
   * Clearing `_pendingAgain` ensures no follow-up cycle fires after stop, even if
   * a cycle was in flight at the moment stop() was called (the `.finally` re-arm
   * checks the flag after stop() has cleared it).
   *
   * Idempotent: safe to call multiple times. After `stop()` no more render cycles
   * will fire even if delta events arrive (subscriptions are released).
   */
  stop(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    // Clear the trailing-edge flag so the in-flight cycle's .finally does NOT
    // re-arm after stop() (stop-during-pending invariant).
    this._pendingAgain = false;
    for (const unsub of this._unsubs) {
      unsub();
    }
    this._unsubs.length = 0;
  }

  /**
   * Request a throttled render cycle from outside the WS delta path.
   *
   * Producers whose events do NOT transit the WS event bus (the SDK
   * touchpad/ring gesture stream — `glasses-event-source.ts`) call this after
   * publishing a gesture, so dirty canvas layers repaint without waiting for the
   * next Foundry delta. No-op until {@link start} has initialized the xxhash
   * module (a cycle before first-frame baseline seeding would be wasted work —
   * `runFirstFrame` pushes unconditionally right after).
   *
   * @see packages/g2-app/src/engine/glasses-event-source.ts (sole caller)
   */
  requestCycle(): void {
    if (this._xxhash === null) {
      return;
    }
    this._schedule();
  }

  // ── Private render loop ──────────────────────────────────────────────────────

  /**
   * Schedule a trailing-edge throttled render cycle.
   *
   * TRAILING-EDGE RE-ARM semantics (DG5, 2026-06-11 — fixes ~17 → ≥25 fps):
   *
   * The old LEADING-EDGE throttle dropped all events while `_timer !== null`,
   * meaning the next cycle was only armed by the NEXT event AFTER the timer
   * fired. Real period = `interval + cycleTime` ≈ 48-60ms → ~17 fps delivered
   * under continuous ~30fps frame input (measured live 2026-06-11).
   *
   * New semantics:
   *   - If a timer is pending (`_timer !== null`) OR a cycle is in flight
   *     (`_cycleInFlight`): set `_pendingAgain = true` and return.
   *     All events within the busy window coalesce into exactly one follow-up.
   *   - Otherwise: arm the timer for `minRedrawIntervalMs`.
   *
   * When the timer fires: `_fireCycle()` clears `_timer`, captures `fireStart`,
   * sets `_cycleInFlight = true`, and runs exactly one `_runCycle()`.
   *
   * On cycle completion (`.finally`): `_cycleInFlight = false`.
   *   - If `_pendingAgain` is set: clear it and re-arm the timer for
   *     `Math.max(0, interval - elapsed)` so the period = `max(interval, cycleTime)`.
   *   - If `_pendingAgain` is NOT set: idle — no re-arm (D-24.3 preserved).
   *
   * `stop()` clears `_pendingAgain` so a follow-up after stop is impossible
   * even when a cycle was in flight at teardown time.
   */
  private _schedule(): void {
    if (this._timer !== null || this._cycleInFlight) {
      // Busy: coalesce into one trailing-edge follow-up.
      this._pendingAgain = true;
      return;
    }
    this._timer = setTimeout(() => {
      this._fireCycle();
    }, this._opts.minRedrawIntervalMs);
  }

  /**
   * Fire one render cycle.
   *
   * Called from the timer callback. Captures the fire-start timestamp so the
   * trailing-edge re-arm can compensate for elapsed time in the follow-up delay:
   * `Math.max(0, interval - (Date.now() - fireStart))`.
   *
   * WR-01: `.catch` propagates `_runCycle` rejections to console so render-loop
   * death is visible (compositor throws, buildHudTiles length mismatch, etc.).
   */
  private _fireCycle(): void {
    this._timer = null;
    const fireStart = Date.now();
    this._cycleInFlight = true;
    this._runCycle()
      .catch((err: unknown) => {
        console.warn('[EVF] HudDeltaDriver._runCycle error:', err);
      })
      .finally(() => {
        this._cycleInFlight = false;
        if (this._pendingAgain) {
          this._pendingAgain = false;
          const elapsed = Date.now() - fireStart;
          const remaining = Math.max(0, this._opts.minRedrawIntervalMs - elapsed);
          this._timer = setTimeout(() => {
            this._fireCycle();
          }, remaining);
        }
        // _pendingAgain not set → idle, no re-arm (D-24.3 preserved).
      });
  }

  /**
   * Composite the canvas, hash each tile, and push only changed tiles.
   *
   * Per-tile algorithm:
   *   1. `compositor.composite()` → 400×200×4 RGBA.
   *   2. `buildHudTiles(rgba)` → 4 `HudTile[]` (dithered 4-bit PNG).
   *   3. For each tile i: `h = h32Raw(tile.bytes)`.
   *      If `h !== prevHashes[i]` → mark changed, update `prevHashes[i]`.
   *   4. If no changes → return (zero-push-on-idle, D-24.3).
   *   5. Else → `await pushHudTiles(bridge, changedTiles)` (serialized, CM-01).
   *
   * Hashing the PNG `tile.bytes` (already `Uint8Array`) satisfies D-24.5
   * (static-chrome determinism): identical compositor RGBA → identical dither
   * output → identical PNG bytes → identical hash → no push.
   */
  /**
   * Build the 4 HUD tiles — Worker-backed when `opts.buildTilesAsync` is
   * wired, with synchronous fallback on rejection or absence.
   *
   * Resolves the live dither mode via `opts.getDitherMode?.() ?? true` and
   * forwards it to both the async Worker path and the synchronous fallback so
   * a live toggle takes effect on the very next cycle without reconstruction.
   */
  private async _buildTiles(rgba: Uint8ClampedArray): Promise<HudTile[]> {
    const dither = this._opts.getDitherMode?.() ?? true;
    const asyncBuilder = this._opts.buildTilesAsync;
    if (asyncBuilder !== undefined) {
      try {
        // The Worker path TRANSFERS the buffer (hud-tile-worker-client.ts line
        // ~128: `postMessage({ rgba: rgba.buffer, ... }, [rgba.buffer])`) which
        // DETACHES whatever buffer we hand it. We MUST pass a copy here: on a
        // worker rejection the catch below falls through to the synchronous
        // `buildHudTiles(rgba, dither)` which reads the ORIGINAL `rgba`. Without
        // this copy the original would be detached and the sync fallback would
        // operate on a zero-length buffer. This copy is load-bearing — do NOT
        // remove it (the `rgba` arg is the compositor's owned output, single-use
        // per cycle, but the worker transfer + sync-fallback dual-read needs two
        // independent buffers).
        return await asyncBuilder(new Uint8ClampedArray(rgba), dither);
      } catch (err) {
        console.warn('[EVF] HudDeltaDriver: worker tile build failed — sync fallback:', err);
      }
    }
    return buildHudTiles(rgba, dither);
  }

  private async _runCycle(): Promise<void> {
    // _runCycle is only reachable via _fireCycle(), which is only wired by
    // _schedule() → start(). start() initialises _xxhash before adding any
    // subscriptions, so _xxhash is guaranteed non-null here. The non-null
    // assertion surfaces a loud TypeError if the invariant is ever broken
    // (IN-01, INV-4).
    // biome-ignore lint/style/noNonNullAssertion: start() init guarantee — see above
    const { h32Raw } = this._xxhash!;

    const rgba = this._opts.compositor.composite();
    const tiles = await this._buildTiles(rgba);
    const changed: typeof tiles = [];

    // buildHudTiles returns exactly TILE_COUNT elements or throws; _prevHashes is
    // pre-allocated to TILE_COUNT. Non-null assertions satisfy noUncheckedIndexedAccess
    // without unreachable continue-guards (INV-4, WR-02).
    for (let i = 0; i < TILE_COUNT; i++) {
      // biome-ignore lint/style/noNonNullAssertion: buildHudTiles contract — tile at index i exists
      const tile = tiles[i]!;
      // h32Raw requires Uint8Array; tile.bytes is already Uint8Array (no cast needed).
      const h = h32Raw(tile.bytes);
      // biome-ignore lint/style/noNonNullAssertion: _prevHashes pre-allocated to TILE_COUNT
      if (h !== this._prevHashes[i]!) {
        this._prevHashes[i] = h;
        changed.push(tile);
      }
    }

    // D-24.3 zero-push-on-idle: skip pushHudTiles if nothing changed.
    if (changed.length === 0) return;

    // CM-01: pushHudTiles uses for...of + await (never Promise.all).
    await pushHudTiles(this._opts.bridge, changed);

    // FPS accounting — only cycles that actually pushed tiles count as a
    // displayed frame (a no-push cycle changes nothing on the glasses).
    const now = Date.now();
    this._pushTimes.push(now);
    this._pruneFpsWindow(now);
  }

  /**
   * Drop push timestamps older than {@link FPS_WINDOW_MS} relative to `now`.
   *
   * Shared sliding-window prune used by both `_runCycle` (after recording a
   * push) and `getFps` (so an idle reader sees the window decay to empty without
   * needing a cycle to run). Mutates `_pushTimes` in place.
   *
   * @param now Current epoch ms (passed in so caller and prune agree on the clock).
   */
  private _pruneFpsWindow(now: number): void {
    while (this._pushTimes.length > 0 && now - (this._pushTimes[0] ?? 0) > FPS_WINDOW_MS) {
      this._pushTimes.shift();
    }
  }

  /**
   * Displayed frames-per-second over the last {@link FPS_WINDOW_MS}.
   *
   * Counts cycles that pushed ≥1 tile (i.e. frames the player actually saw
   * change). Returns `0` when the HUD is idle — the indicator then shows
   * `0fps`, which is the truthful idle state (zero-push-on-idle, D-24.3).
   *
   * Prunes the sliding window (via {@link _pruneFpsWindow}) so an idle reader
   * sees the rate decay to 0 even when no cycle has run since the last push.
   * This in-place prune is the deliberate, named exception to "getters don't
   * mutate" — without it the idle fps would never fall off.
   *
   * @returns Frames per second, ≥0, fractional.
   */
  getFps(): number {
    this._pruneFpsWindow(Date.now());
    return this._pushTimes.length / (FPS_WINDOW_MS / 1000);
  }
}
