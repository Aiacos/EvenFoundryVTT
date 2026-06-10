/**
 * HudDeltaDriver — event-driven, per-tile xxhash delta loop for the HUD raster path.
 *
 * Replaces the Phase 20 naive event-driven recomposite mechanism inside `LayerManager`
 * with a standalone, injectable class that owns:
 *
 *   - A one-time `await xxhash()` WASM init (lazy-singleton, mirrors raster-worker.ts).
 *   - A 4-slot `prevHashes` table (one h32 per HUD tile, updated on every changed push).
 *   - A `setTimeout`-based debounce (configurable via `HudDeltaDriverOpts.minRedrawIntervalMs`;
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
 * INV-4 compliance: JSDoc/TSDoc on every public API; zero bare `// TODO`; no dead code.
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
 * Default debounce interval in milliseconds (D-24.1).
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
   */
  readonly buildTilesAsync?: (rgba: Uint8ClampedArray) => Promise<HudTile[]>;

  /**
   * Debounce interval in milliseconds.
   *
   * Defaults to {@link DEFAULT_MIN_REDRAW_INTERVAL_MS} (100ms per D-24.1).
   * Near-simultaneous delta events within this window collapse into one render cycle.
   */
  readonly minRedrawIntervalMs?: number;
}

// ── HudDeltaDriver ────────────────────────────────────────────────────────────

/**
 * Event-driven, debounced per-tile xxhash delta driver for the HUD raster path.
 *
 * Lifecycle:
 * 1. Construct with {@link HudDeltaDriverOpts}.
 * 2. `await driver.start()` — inits WASM, subscribes to delta channels.
 * 3. `await driver.runFirstFrame()` — pushes all 4 tiles, seeds hash baselines.
 * 4. Driver runs automatically on channel events until `driver.stop()`.
 * 5. `driver.stop()` — cancels pending debounce timer, releases all subscriptions.
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

  /** Pending debounce timer handle — null when no cycle is scheduled. */
  private _timer: ReturnType<typeof setTimeout> | null = null;

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
   * Each subscription schedules a debounced render cycle via `_schedule()`.
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
   * Cancel any pending debounce timer and release all WS channel subscriptions.
   *
   * Idempotent: safe to call multiple times. After `stop()` no more render cycles
   * will fire even if delta events arrive (subscriptions are released).
   */
  stop(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    for (const unsub of this._unsubs) {
      unsub();
    }
    this._unsubs.length = 0;
  }

  /**
   * Request a debounced render cycle from outside the WS delta path.
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
   * Schedule a debounced render cycle.
   *
   * Any pending timer is cleared and restarted (debounce collapse): N rapid
   * delta events within `minRedrawIntervalMs` collapse into exactly 1 cycle.
   */
  private _schedule(): void {
    if (this._timer !== null) {
      // THROTTLE, not debounce: a cycle is already pending and will render the
      // latest layer state when it fires (composite() reads live layers, not a
      // snapshot). Resetting the timer here (the previous clearTimeout+re-arm
      // behaviour) starved the render loop whenever events arrived faster than
      // minRedrawIntervalMs — measured live 2026-06-10: ≥15 fps frame input
      // collapsed delivered output to ~0.2 fps because the timer never fired.
      return;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      // WR-01: propagate _runCycle rejections to console so render-loop death
      // is visible (compositor throws, buildHudTiles length mismatch, etc.).
      this._runCycle().catch((err: unknown) => {
        console.warn('[EVF] HudDeltaDriver._runCycle error:', err);
      });
    }, this._opts.minRedrawIntervalMs);
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
   */
  private async _buildTiles(rgba: Uint8ClampedArray): Promise<HudTile[]> {
    const async = this._opts.buildTilesAsync;
    if (async !== undefined) {
      try {
        // The Worker path TRANSFERS the buffer — pass a copy so the sync
        // fallback (and any caller-side reuse) never sees a detached buffer.
        return await async(new Uint8ClampedArray(rgba));
      } catch (err) {
        console.warn('[EVF] HudDeltaDriver: worker tile build failed — sync fallback:', err);
      }
    }
    return buildHudTiles(rgba);
  }

  private async _runCycle(): Promise<void> {
    // _runCycle is only reachable via _schedule(), which is only wired by
    // start(). start() initialises _xxhash before adding any subscriptions,
    // so _xxhash is guaranteed non-null here. The non-null assertion surfaces
    // a loud TypeError if the invariant is ever broken (IN-01, INV-4).
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
   * @returns Frames per second, ≥0, fractional.
   */
  getFps(): number {
    const now = Date.now();
    while (this._pushTimes.length > 0 && now - (this._pushTimes[0] ?? 0) > FPS_WINDOW_MS) {
      this._pushTimes.shift();
    }
    return this._pushTimes.length / (FPS_WINDOW_MS / 1000);
  }
}
