/**
 * HudDeltaDriver — event-driven, per-tile xxhash delta loop for the HUD raster path.
 *
 * Replaces the Phase 20 naive `_startDeltaRecomposite` / `_compositeAndPush`
 * mechanism inside `LayerManager` with a standalone, injectable class that owns:
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
 * This module is NOT yet wired into `LayerManager` — that is Plan 24-02 (Wave 2).
 * Inject the driver at `LayerManager` construction time and call:
 *   - `await driver.runFirstFrame()` instead of `_compositeAndPush()` in `_flushPage()`.
 *   - `driver.stop()` instead of `_stopDeltaRecomposite()` in `disposeSubscriptions()`.
 *
 * INV-4 compliance: JSDoc/TSDoc on every public API; zero bare `// TODO`; no dead code.
 * CM-01 serialization: pushes use `pushHudTiles` which iterates `for...of` + `await`
 * — do NOT replace with `Promise.all` (Even Hub SDK rejects concurrent calls).
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 * @see packages/g2-app/src/engine/layer-manager.ts (_startDeltaRecomposite — naive predecessor)
 * @see packages/g2-app/src/raster/raster-worker.ts (xxhash lazy-singleton init pattern)
 * @see packages/g2-app/src/hud/hud-poc-page.ts (pushHudTiles CM-01 serialization)
 * @see .planning/phases/EVF-24-delta-loop-5fps-xxhash/24-01-PLAN.md
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { XXHashAPI } from 'xxhash-wasm';
import xxhash from 'xxhash-wasm';
import { pushHudTiles } from '../hud/hud-poc-page.js';
import { buildHudTiles } from '../hud/hud-raster-frame.js';
import type { CanvasCompositorLike } from './canvas-compositor.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of HUD tiles per frame (2×2 layout, container IDs 0-3). */
const TILE_COUNT = 4;

/**
 * WS channels that trigger a render cycle.
 *
 * Verified against `bridge/src/ws/delta-emitter.ts` DELTA_CAP_MAP and
 * `canvas-combat-tracker-panel.ts` COMBAT_TURN_DELTA_TYPE / COMBAT_STATE_DELTA_TYPE
 * (resolves Phase 24 Research Open Q1 — `combat.delta` is NOT a real channel name).
 */
const DELTA_CHANNELS = ['character.delta', 'combat.turn', 'combat.state'] as const;

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

  /** Unsub closures for all active WS channel subscriptions. */
  private readonly _unsubs: Array<() => void> = [];

  /** Resolved options with defaults applied. */
  private readonly _opts: Required<HudDeltaDriverOpts>;

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
   * Safe to call once per driver lifetime — WASM init is a no-op if already done.
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
    const tiles = buildHudTiles(rgba);

    if (tiles.length > 0) {
      await pushHudTiles(this._opts.bridge, tiles);
    }

    // Seed baseline hashes from the PNG bytes of each pushed tile.
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile === undefined) continue;
      this._prevHashes[i] = this._xxhash.h32Raw(tile.bytes);
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

  // ── Private render loop ──────────────────────────────────────────────────────

  /**
   * Schedule a debounced render cycle.
   *
   * Any pending timer is cleared and restarted (debounce collapse): N rapid
   * delta events within `minRedrawIntervalMs` collapse into exactly 1 cycle.
   */
  private _schedule(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._runCycle();
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
  private async _runCycle(): Promise<void> {
    if (this._xxhash === null) {
      // Should not happen after start() — log and return gracefully.
      console.warn('[EVF] HudDeltaDriver._runCycle: xxhash not initialized; skipping cycle');
      return;
    }

    const rgba = this._opts.compositor.composite();
    const tiles = buildHudTiles(rgba);
    const changed: typeof tiles = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = tiles[i];
      if (tile === undefined) continue;

      // h32Raw requires Uint8Array; tile.bytes is already Uint8Array (no cast needed).
      const h = this._xxhash.h32Raw(tile.bytes);

      // Use `?? 0` guard for noUncheckedIndexedAccess compliance (INV-4).
      if (h !== (this._prevHashes[i] ?? 0)) {
        this._prevHashes[i] = h;
        changed.push(tile);
      }
    }

    // D-24.3 zero-push-on-idle: skip pushHudTiles if nothing changed.
    if (changed.length === 0) return;

    // CM-01: pushHudTiles uses for...of + await (never Promise.all).
    await pushHudTiles(this._opts.bridge, changed);
  }
}
